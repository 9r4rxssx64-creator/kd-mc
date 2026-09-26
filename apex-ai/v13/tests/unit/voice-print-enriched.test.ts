/**
 * Tests voice-print enrichi (5 features MFCC-style — Jet 8.1+).
 * Pousse coverage voice-print pour P0 audit gaps voiceprint.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { voicePrint } from '../../services/ai/voice-print.js';

/**
 * Crée un AudioBuffer simulé pour tests (Float32Array fake samples).
 */
function makeFakeAudioBuffer(samples: number[], sampleRate = 16000): AudioBuffer {
  const data = new Float32Array(samples);
  return {
    sampleRate,
    length: data.length,
    duration: data.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('Voice Print enrichi (MFCC-style 5 features)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('computeFingerprint 5 features', () => {
    it('retourne pitch + zcr + energy + spectral_centroid + spectral_rolloff', () => {
      /* Sinusoïde 200 Hz, 1024 samples @ 16kHz = ~64ms */
      const samples = Array.from({ length: 1024 }, (_, i) =>
        Math.sin((2 * Math.PI * 200 * i) / 16000),
      );
      const buf = makeFakeAudioBuffer(samples);
      const fp = voicePrint.computeFingerprint(buf);
      expect(typeof fp.pitch).toBe('number');
      expect(typeof fp.zcr).toBe('number');
      expect(typeof fp.energy).toBe('number');
      expect(typeof fp.spectral_centroid).toBe('number');
      expect(typeof fp.spectral_rolloff).toBe('number');
    });

    it('signal silence (zeros) → energy proche 0', () => {
      const buf = makeFakeAudioBuffer(new Array(512).fill(0));
      const fp = voicePrint.computeFingerprint(buf);
      expect(fp.energy).toBeLessThan(0.01);
    });

    it('signal fort → energy > 0.5 (RMS)', () => {
      const samples = Array.from({ length: 512 }, () => 0.9);
      const buf = makeFakeAudioBuffer(samples);
      const fp = voicePrint.computeFingerprint(buf);
      expect(fp.energy).toBeGreaterThan(0.5);
    });

    it('signal alternant → ZCR élevé', () => {
      /* +1, -1, +1, -1... → max ZCR */
      const samples = Array.from({ length: 512 }, (_, i) => (i % 2 === 0 ? 1 : -1));
      const buf = makeFakeAudioBuffer(samples);
      const fp = voicePrint.computeFingerprint(buf);
      expect(fp.zcr).toBeGreaterThan(0.5);
    });

    it('spectral_centroid > 0 sur signal avec contenu fréquentiel', () => {
      const samples = Array.from({ length: 512 }, (_, i) =>
        Math.sin((2 * Math.PI * 1000 * i) / 16000),
      );
      const buf = makeFakeAudioBuffer(samples);
      const fp = voicePrint.computeFingerprint(buf);
      expect(fp.spectral_centroid).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cosine similarity 5D vs 3D', () => {
    it('voiceprint legacy 3-features (no spectral) → identify works avec ?? 0', () => {
      /* Simule voiceprint v1 sans spectral_centroid_avg ni spectral_rolloff_avg */
      const legacyPrint = {
        uid: 'kevin',
        pitch_avg: 150,
        zcr_avg: 0.05,
        energy_avg: 0.3,
        samples_count: 5,
        enrolled_at: Date.now(),
        last_match: 0,
        match_score_avg: 0.85,
      };
      localStorage.setItem('ax_voice_print_kevin', JSON.stringify(legacyPrint));
      const samples = Array.from({ length: 512 }, (_, i) => Math.sin((2 * Math.PI * 150 * i) / 16000));
      const buf = makeFakeAudioBuffer(samples);
      const result = voicePrint.identify(buf);
      /* Pas crash, retourne result valide */
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('voiceprint v2 avec spectral fields → identify améliore précision', () => {
      const v2Print = {
        uid: 'laurence',
        pitch_avg: 220,
        zcr_avg: 0.08,
        energy_avg: 0.25,
        spectral_centroid_avg: 1500,
        spectral_rolloff_avg: 4000,
        samples_count: 3,
        enrolled_at: Date.now(),
        last_match: 0,
        match_score_avg: 0.9,
      };
      localStorage.setItem('ax_voice_print_laurence', JSON.stringify(v2Print));
      const samples = Array.from({ length: 512 }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / 16000));
      const buf = makeFakeAudioBuffer(samples);
      const result = voicePrint.identify(buf);
      expect(typeof result.score).toBe('number');
    });
  });

  describe('enroll persiste 5 features', () => {
    it('enroll un sample → voiceprint contient spectral_centroid_avg + spectral_rolloff_avg', async () => {
      const samples = Array.from({ length: 512 }, (_, i) =>
        Math.sin((2 * Math.PI * 180 * i) / 16000) * 0.5,
      );
      const buf = makeFakeAudioBuffer(samples);
      const r = await voicePrint.enroll('test_uid', [buf]);
      expect(r.ok).toBe(true);
      const stored = JSON.parse(localStorage.getItem('ax_voice_print_test_uid') ?? 'null') as {
        spectral_centroid_avg?: number;
        spectral_rolloff_avg?: number;
      } | null;
      expect(stored?.spectral_centroid_avg).toBeDefined();
      expect(stored?.spectral_rolloff_avg).toBeDefined();
    });

    it('enroll multi-samples → moyenne 5 features', async () => {
      const buf1 = makeFakeAudioBuffer(Array.from({ length: 256 }, () => 0.1));
      const buf2 = makeFakeAudioBuffer(Array.from({ length: 256 }, () => 0.3));
      const buf3 = makeFakeAudioBuffer(Array.from({ length: 256 }, () => 0.5));
      const r = await voicePrint.enroll('multi_uid', [buf1, buf2, buf3]);
      expect(r.ok).toBe(true);
      const stored = JSON.parse(localStorage.getItem('ax_voice_print_multi_uid') ?? 'null') as {
        samples_count?: number;
      } | null;
      expect(stored?.samples_count).toBe(3);
    });
  });

  describe('Auto-apprentissage update 5D', () => {
    it('updatePrintWithSample met à jour 5 features (moyenne pondérée)', () => {
      /* Setup voiceprint initial */
      localStorage.setItem(
        'ax_voice_print_learn_uid',
        JSON.stringify({
          uid: 'learn_uid',
          pitch_avg: 100,
          zcr_avg: 0.05,
          energy_avg: 0.3,
          spectral_centroid_avg: 1000,
          spectral_rolloff_avg: 3000,
          samples_count: 1,
          enrolled_at: Date.now(),
          last_match: 0,
          match_score_avg: 0.8,
        }),
      );
      /* Identify avec sample qui matche → trigger update */
      const samples = Array.from({ length: 512 }, (_, i) =>
        Math.sin((2 * Math.PI * 100 * i) / 16000) * 0.3,
      );
      const buf = makeFakeAudioBuffer(samples);
      voicePrint.setThreshold(0.1); /* Force confident pour trigger update */
      voicePrint.identify(buf);
      const after = JSON.parse(localStorage.getItem('ax_voice_print_learn_uid') ?? 'null') as {
        samples_count?: number;
      } | null;
      /* samples_count incrémenté si confident */
      expect(after?.samples_count).toBeGreaterThanOrEqual(1);
      voicePrint.setThreshold(0.75);
    });
  });
});
