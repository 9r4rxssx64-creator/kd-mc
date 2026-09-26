/**
 * Tests features/studios/music (port v12 vMixMusic).
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  MAX_TRACKS,
  MIN_TRACKS,
  MAX_FILE_SIZE_MB,
  createTrack,
  detectBPM,
  encodeWav,
  escapeHtml,
  musicStudioStore,
} from '../../features/studios/music/index.js';

describe('features/studios/music — escapeHtml', () => {
  it('échappe caractères HTML', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escapeHtml("L'apostrophe")).toBe('L&#39;apostrophe');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('features/studios/music — createTrack', () => {
  it('crée track avec id, volume neutre, EQ flat', () => {
    const t = createTrack('Piste 1');
    expect(t.id).toMatch(/^track_/);
    expect(t.name).toBe('Piste 1');
    expect(t.volume).toBe(0.8);
    expect(t.pan).toBe(0);
    expect(t.muted).toBe(false);
    expect(t.eq.low).toBe(0);
    expect(t.eq.high).toBe(0);
    expect(t.buffer).toBeNull();
  });

  it('limite nom à 100 chars', () => {
    const long = 'a'.repeat(200);
    expect(createTrack(long).name.length).toBe(100);
  });

  it('trim nom', () => {
    expect(createTrack('  test  ').name).toBe('test');
  });
});

describe('features/studios/music — constants', () => {
  it('MAX_TRACKS = 16, MIN_TRACKS = 2 (boost v13)', () => {
    expect(MAX_TRACKS).toBe(16);
    expect(MIN_TRACKS).toBe(2);
  });

  it('MAX_FILE_SIZE_MB = 50', () => {
    expect(MAX_FILE_SIZE_MB).toBe(50);
  });
});

describe('features/studios/music — musicStudioStore CRUD', () => {
  beforeEach(() => {
    musicStudioStore.clear();
  });

  it('list retourne [] initialement', () => {
    expect(musicStudioStore.list()).toEqual([]);
  });

  it('add crée track et incrémente count', () => {
    expect(musicStudioStore.count()).toBe(0);
    const t = musicStudioStore.add('Test');
    expect(t).not.toBeNull();
    expect(musicStudioStore.count()).toBe(1);
  });

  it('add refuse au-delà MAX_TRACKS', () => {
    for (let i = 0; i < MAX_TRACKS; i++) musicStudioStore.add(`Piste ${i}`);
    expect(musicStudioStore.count()).toBe(MAX_TRACKS);
    const overflow = musicStudioStore.add('Overflow');
    expect(overflow).toBeNull();
  });

  it('remove supprime track existant', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    expect(musicStudioStore.remove(t.id)).toBe(true);
    expect(musicStudioStore.count()).toBe(0);
  });

  it('remove retourne false si id inexistant', () => {
    expect(musicStudioStore.remove('inexistant')).toBe(false);
  });

  it('update modifie volume avec clamp [0,1]', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.update(t.id, { volume: 1.5 });
    expect(musicStudioStore.list()[0]?.volume).toBe(1);
    musicStudioStore.update(t.id, { volume: -0.5 });
    expect(musicStudioStore.list()[0]?.volume).toBe(0);
  });

  it('update modifie pan avec clamp [-1,1]', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.update(t.id, { pan: 2 });
    expect(musicStudioStore.list()[0]?.pan).toBe(1);
    musicStudioStore.update(t.id, { pan: -2 });
    expect(musicStudioStore.list()[0]?.pan).toBe(-1);
  });

  it('update muted alterne', () => {
    const t = musicStudioStore.add('A');
    if (!t) throw new Error('add failed');
    musicStudioStore.update(t.id, { muted: true });
    expect(musicStudioStore.list()[0]?.muted).toBe(true);
  });

  it('update return false si id inconnu', () => {
    expect(musicStudioStore.update('nope', { volume: 0.5 })).toBe(false);
  });

  it('clear vide tout', () => {
    musicStudioStore.add('A');
    musicStudioStore.add('B');
    musicStudioStore.clear();
    expect(musicStudioStore.count()).toBe(0);
  });

  it('validateFileSize accepte ≤ 50 MB', () => {
    expect(musicStudioStore.validateFileSize(1024)).toBe(true);
    expect(musicStudioStore.validateFileSize(50 * 1024 * 1024)).toBe(true);
    expect(musicStudioStore.validateFileSize(51 * 1024 * 1024)).toBe(false);
    expect(musicStudioStore.validateFileSize(0)).toBe(false);
    expect(musicStudioStore.validateFileSize(-1)).toBe(false);
  });
});

describe('features/studios/music — detectBPM', () => {
  it('retourne 120 par défaut sur buffer vide/trop court', () => {
    /* buffer invalide */
    expect(detectBPM(null as unknown as AudioBuffer)).toBe(120);
    /* buffer trop court */
    const fake = {
      duration: 0.5,
      getChannelData: (): Float32Array => new Float32Array(),
      sampleRate: 44100,
      length: 0,
    } as unknown as AudioBuffer;
    expect(detectBPM(fake)).toBe(120);
  });

  it('détecte BPM sur signal pulsé synthétique (>=60, <=200)', () => {
    /* Signal synthétique 5 sec à 44.1kHz avec pulses régulières */
    const sampleRate = 44100;
    const duration = 5;
    const length = duration * sampleRate;
    const data = new Float32Array(length);
    /* Créer pulse toutes 0.5s = 120 BPM */
    for (let i = 0; i < length; i++) {
      data[i] = (i % (sampleRate / 2) < 100) ? 0.9 : 0.01;
    }
    const fakeBuffer = {
      duration,
      sampleRate,
      length,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    const bpm = detectBPM(fakeBuffer);
    expect(bpm).toBeGreaterThanOrEqual(60);
    expect(bpm).toBeLessThanOrEqual(200);
  });
});

describe('features/studios/music — encodeWav', () => {
  it('génère blob WAV avec header valide', () => {
    const sampleRate = 44100;
    const length = 1024;
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) data[i] = Math.sin(i * 0.1) * 0.5;
    const fakeBuffer = {
      numberOfChannels: 1,
      sampleRate,
      length,
      getChannelData: (): Float32Array => data,
    } as unknown as AudioBuffer;
    const blob = encodeWav(fakeBuffer);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(44); /* RIFF header au moins */
  });

  it('gère stéréo (2 channels)', () => {
    const length = 512;
    const ch0 = new Float32Array(length);
    const ch1 = new Float32Array(length);
    const fakeBuffer = {
      numberOfChannels: 2,
      sampleRate: 48000,
      length,
      getChannelData: (ch: number): Float32Array => (ch === 0 ? ch0 : ch1),
    } as unknown as AudioBuffer;
    const blob = encodeWav(fakeBuffer);
    /* 44 bytes header + length × 2 channels × 2 bytes per sample */
    expect(blob.size).toBe(44 + length * 2 * 2);
  });
});
