/**
 * Tests features/studios/music — boost v13 (pitch, time stretch, effects,
 * stems, LUFS, sidechain, BPM auto-sync, WAV 24bit).
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  ACCEPTED_FORMATS,
  FREQ_BANDS,
  LUFS_TARGETS,
  PITCH_RANGE_SEMITONES,
  TIME_STRETCH_MAX,
  TIME_STRETCH_MIN,
  applyDistortion,
  applyNoiseGate,
  calcApproxLUFS,
  calcLoudnessGain,
  calcTempoSyncRatio,
  defaultEffects,
  encodeWav,
  estimateStemPresence,
  isValidAudioFormat,
  isValidExportFormat,
  musicStudioStore,
  semitonesToRatio,
  snapToChromatic,
} from '../../features/studios/music/index.js';

describe('features/studios/music boost — pitch + time stretch', () => {
  it('semitonesToRatio: +12 → 2× (octave aiguë)', () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2, 3);
  });

  it('semitonesToRatio: -12 → 0.5× (octave grave)', () => {
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5, 3);
  });

  it('semitonesToRatio: clamp ±12', () => {
    expect(semitonesToRatio(20)).toBeCloseTo(2, 3);
    expect(semitonesToRatio(-20)).toBeCloseTo(0.5, 3);
  });

  it('PITCH_RANGE_SEMITONES = 12', () => {
    expect(PITCH_RANGE_SEMITONES).toBe(12);
  });

  it('TIME_STRETCH bounds [0.5, 2]', () => {
    expect(TIME_STRETCH_MIN).toBe(0.5);
    expect(TIME_STRETCH_MAX).toBe(2);
  });

  it('calcTempoSyncRatio: 120 → 128 BPM', () => {
    const ratio = calcTempoSyncRatio(120, 128);
    expect(ratio).toBeCloseTo(120 / 128, 3);
  });

  it('calcTempoSyncRatio: cas dégénérés = 1', () => {
    expect(calcTempoSyncRatio(0, 120)).toBe(1);
    expect(calcTempoSyncRatio(120, 0)).toBe(1);
    expect(calcTempoSyncRatio(-1, 120)).toBe(1);
  });

  it('calcTempoSyncRatio: clamp dans [0.5, 2]', () => {
    /* 60 → 200 = 0.3 → clamp 0.5 */
    expect(calcTempoSyncRatio(60, 200)).toBe(0.5);
    /* 200 → 60 = 3.33 → clamp 2 */
    expect(calcTempoSyncRatio(200, 60)).toBe(2);
  });
});

describe('features/studios/music boost — auto-tune snap', () => {
  it('snapToChromatic: 440 Hz → A4 exact (0 cents)', () => {
    const r = snapToChromatic(440);
    expect(r.freq).toBeCloseTo(440, 1);
    expect(r.cents).toBe(0);
  });

  it('snapToChromatic: 442 Hz → snap A4 avec ~+8 cents', () => {
    const r = snapToChromatic(442);
    expect(r.freq).toBeCloseTo(440, 1);
    expect(Math.abs(r.cents)).toBeLessThan(15);
  });

  it('snapToChromatic: 880 Hz → A5', () => {
    const r = snapToChromatic(880);
    expect(r.freq).toBeCloseTo(880, 1);
  });

  it('snapToChromatic: freq invalide → 0', () => {
    expect(snapToChromatic(0).freq).toBe(0);
    expect(snapToChromatic(NaN).freq).toBe(0);
    expect(snapToChromatic(-100).freq).toBe(0);
  });
});

describe('features/studios/music boost — LUFS + loudness', () => {
  it('LUFS_TARGETS standards (-14 music, -23 broadcast)', () => {
    expect(LUFS_TARGETS.music).toBe(-14);
    expect(LUFS_TARGETS.broadcast).toBe(-23);
    expect(LUFS_TARGETS.podcast).toBe(-16);
    expect(LUFS_TARGETS.club).toBe(-9);
  });

  it('calcApproxLUFS: silence → -Infinity', () => {
    const data = new Float32Array(1024);
    const fakeBuffer = {
      numberOfChannels: 1, sampleRate: 44100, length: data.length,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    expect(calcApproxLUFS(fakeBuffer)).toBe(-Infinity);
  });

  it('calcApproxLUFS: signal full-scale → ~ -0.7 dB', () => {
    const data = new Float32Array(1024);
    for (let i = 0; i < data.length; i++) data[i] = 1.0;
    const fakeBuffer = {
      numberOfChannels: 1, sampleRate: 44100, length: data.length,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    const lufs = calcApproxLUFS(fakeBuffer);
    expect(lufs).toBeGreaterThan(-2);
    expect(lufs).toBeLessThan(0);
  });

  it('calcLoudnessGain: -20 → -14 = +6 dB ≈ 2.0', () => {
    const gain = calcLoudnessGain(-20, -14);
    expect(gain).toBeCloseTo(2, 1);
  });

  it('calcLoudnessGain: same target = 1.0', () => {
    expect(calcLoudnessGain(-14, -14)).toBeCloseTo(1, 3);
  });

  it('calcLoudnessGain: invalides → 1', () => {
    expect(calcLoudnessGain(NaN, -14)).toBe(1);
    expect(calcLoudnessGain(-Infinity, -14)).toBe(1);
  });
});

describe('features/studios/music boost — stem separation heuristics', () => {
  it('FREQ_BANDS définit 7 bandes', () => {
    expect(Object.keys(FREQ_BANDS).length).toBe(7);
    expect(FREQ_BANDS.sub.min).toBe(20);
    expect(FREQ_BANDS.brilliance.max).toBe(20000);
  });

  it('estimateStemPresence: silence → tous 0', () => {
    const data = new Float32Array(0);
    const fakeBuffer = {
      numberOfChannels: 1, sampleRate: 44100, length: 0,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    const stems = estimateStemPresence(fakeBuffer);
    expect(stems.vocals).toBe(0);
    expect(stems.drums).toBe(0);
    expect(stems.bass).toBe(0);
    expect(stems.other).toBe(0);
  });

  it('estimateStemPresence: somme stems normalisés <=4', () => {
    const data = new Float32Array(2048);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.05) * 0.5;
    const fakeBuffer = {
      numberOfChannels: 1, sampleRate: 44100, length: data.length,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    const stems = estimateStemPresence(fakeBuffer);
    const sum = stems.vocals + stems.drums + stems.bass + stems.other;
    expect(sum).toBeGreaterThanOrEqual(0);
    expect(sum).toBeLessThanOrEqual(4);
  });

  it('estimateStemPresence: chaque stem dans [0, 1]', () => {
    const data = new Float32Array(1024);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() - 0.5;
    const fakeBuffer = {
      numberOfChannels: 1, sampleRate: 44100, length: data.length,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    const stems = estimateStemPresence(fakeBuffer);
    for (const v of [stems.vocals, stems.drums, stems.bass, stems.other]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('features/studios/music boost — effets DSP unitaires', () => {
  it('applyNoiseGate: signal sous threshold → 0', () => {
    /* 0.001 ≈ -60 dB → si threshold -50 → mute */
    expect(applyNoiseGate(0.001, -50)).toBe(0);
  });

  it('applyNoiseGate: signal au-dessus → conservé', () => {
    /* 0.5 ≈ -6 dB → si threshold -60 → kept */
    expect(applyNoiseGate(0.5, -60)).toBe(0.5);
  });

  it('applyNoiseGate: NaN → 0', () => {
    expect(applyNoiseGate(NaN, -50)).toBe(0);
  });

  it('applyDistortion: drive=0 → identité', () => {
    expect(applyDistortion(0.5, 0)).toBe(0.5);
  });

  it('applyDistortion: drive>0 → soft-clip dans [-1, 1]', () => {
    const out = applyDistortion(0.9, 0.8);
    expect(out).toBeGreaterThan(-1);
    expect(out).toBeLessThan(1);
    expect(Math.abs(out)).toBeGreaterThan(Math.abs(0.9 * 0.5));
  });

  it('defaultEffects: tout à zéro sauf noiseGate -60', () => {
    const e = defaultEffects();
    expect(e.reverbWet).toBe(0);
    expect(e.delayWet).toBe(0);
    expect(e.distortion).toBe(0);
    expect(e.noiseGateThreshold).toBe(-60);
  });
});

describe('features/studios/music boost — formats acceptés + export', () => {
  it('ACCEPTED_FORMATS contient mp3, wav, flac, aac, ogg, m4a', () => {
    expect(ACCEPTED_FORMATS).toContain('audio/mpeg');
    expect(ACCEPTED_FORMATS).toContain('audio/wav');
    expect(ACCEPTED_FORMATS).toContain('audio/flac');
    expect(ACCEPTED_FORMATS).toContain('audio/ogg');
    expect(ACCEPTED_FORMATS).toContain('audio/aac');
    expect(ACCEPTED_FORMATS).toContain('audio/x-m4a');
  });

  it('isValidAudioFormat: accepté pour mp3, refusé pour pdf', () => {
    expect(isValidAudioFormat('audio/mpeg')).toBe(true);
    expect(isValidAudioFormat('application/pdf')).toBe(false);
  });

  it('isValidExportFormat: type guard correct', () => {
    expect(isValidExportFormat('wav16')).toBe(true);
    expect(isValidExportFormat('wav24')).toBe(true);
    expect(isValidExportFormat('mp3-320')).toBe(true);
    expect(isValidExportFormat('flac')).toBe(true);
    expect(isValidExportFormat('ogg')).toBe(true);
    expect(isValidExportFormat('avi')).toBe(false);
  });

  it('encodeWav: 24-bit a header bitsPerSample=24', () => {
    const data = new Float32Array(256);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.1) * 0.3;
    const fakeBuffer = {
      numberOfChannels: 1, sampleRate: 44100, length: data.length,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    const blob = encodeWav(fakeBuffer, 24);
    expect(blob.size).toBe(44 + data.length * 1 * 3); /* 24-bit = 3 bytes/sample */
  });
});

describe('features/studios/music boost — store sidechain + auto-sync', () => {
  beforeEach(() => {
    musicStudioStore.clear();
  });

  it('update: pitchSemitones clamp [-12, 12]', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.update(t.id, { pitchSemitones: 20 });
    expect(musicStudioStore.list()[0]?.pitchSemitones).toBe(12);
    musicStudioStore.update(t.id, { pitchSemitones: -100 });
    expect(musicStudioStore.list()[0]?.pitchSemitones).toBe(-12);
  });

  it('update: timeStretch clamp [0.5, 2]', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.update(t.id, { timeStretch: 5 });
    expect(musicStudioStore.list()[0]?.timeStretch).toBe(2);
    musicStudioStore.update(t.id, { timeStretch: 0.1 });
    expect(musicStudioStore.list()[0]?.timeStretch).toBe(0.5);
  });

  it('update: solo togglable', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.update(t.id, { solo: true });
    expect(musicStudioStore.list()[0]?.solo).toBe(true);
  });

  it('update: sidechainSourceId refuse self-référence', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.update(t.id, { sidechainSourceId: t.id });
    expect(musicStudioStore.list()[0]?.sidechainSourceId).toBeNull();
  });

  it('update: sidechainSourceId accepte autre track', () => {
    const a = musicStudioStore.add('A');
    const b = musicStudioStore.add('B');
    if (!a || !b) throw new Error('add failed');
    musicStudioStore.update(a.id, { sidechainSourceId: b.id });
    expect(musicStudioStore.list()[0]?.sidechainSourceId).toBe(b.id);
  });

  it('remove: cleanup sidechain refs', () => {
    const a = musicStudioStore.add('A');
    const b = musicStudioStore.add('B');
    if (!a || !b) throw new Error('add failed');
    musicStudioStore.update(a.id, { sidechainSourceId: b.id });
    musicStudioStore.remove(b.id);
    expect(musicStudioStore.list()[0]?.sidechainSourceId).toBeNull();
  });

  it('updateEffects: reverbWet clamp [0, 1]', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.updateEffects(t.id, { reverbWet: 5 });
    expect(musicStudioStore.list()[0]?.effects.reverbWet).toBe(1);
    musicStudioStore.updateEffects(t.id, { reverbWet: -1 });
    expect(musicStudioStore.list()[0]?.effects.reverbWet).toBe(0);
  });

  it('updateEffects: delayFeedback clamp [0, 0.95] (anti-Larsen)', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.updateEffects(t.id, { delayFeedback: 1.5 });
    expect(musicStudioStore.list()[0]?.effects.delayFeedback).toBe(0.95);
  });

  it('updateEq: gain clamp [-12, +12] dB', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.updateEq(t.id, 'mid', 50);
    expect(musicStudioStore.list()[0]?.eq.mid).toBe(12);
    musicStudioStore.updateEq(t.id, 'low', -50);
    expect(musicStudioStore.list()[0]?.eq.low).toBe(-12);
  });

  it('master LUFS target settable', () => {
    musicStudioStore.setMasterLufsTarget(LUFS_TARGETS.broadcast);
    expect(musicStudioStore.getMasterLufsTarget()).toBe(-23);
    musicStudioStore.setMasterLufsTarget(LUFS_TARGETS.music);
  });

  it('autoSyncTempo: 0 tracks → synced=0', () => {
    const r = musicStudioStore.autoSyncTempo();
    expect(r.synced).toBe(0);
  });

  it('autoSyncTempo: tracks sans buffer → synced=0', () => {
    musicStudioStore.add('A');
    musicStudioStore.add('B');
    const r = musicStudioStore.autoSyncTempo();
    expect(r.synced).toBe(0);
  });
});
