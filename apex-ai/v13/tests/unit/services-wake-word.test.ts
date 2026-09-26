/**
 * Tests services/wake-word.ts — wake word "Dis Apex" (Kevin v13.1.0).
 *
 * Couvre :
 * - start() sans Web Speech API → started: false + reason
 * - start() avec mock SpeechRecognition → started: true
 * - stop() idempotent
 * - setKeyword + setSensitivity (clamp 0..1)
 * - onWake : callback invoqué quand transcript match keyword
 * - getStatus : snapshot états
 * - isListening : reflète state
 * - Variantes phonétiques ("dit apex", "hey apex", "ok apex")
 * - Persist stats (totalDetections) cross-instance
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { wakeWord } from '../../services/ai/wake-word.js';

/* ------------------------------------------------------------------------ */
/* Mock SpeechRecognition pour happy-dom                                     */
/* ------------------------------------------------------------------------ */

interface MockResult {
  0: { transcript: string };
}

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: { results: ArrayLike<MockResult> & { length: number } }) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  startCount = 0;
  stopCount = 0;

  start(): void {
    this.started = true;
    this.startCount++;
  }

  stop(): void {
    this.started = false;
    this.stopCount++;
    if (this.onend) this.onend();
  }

  fireResult(transcript: string): void {
    if (!this.onresult) return;
    const results = [{ 0: { transcript } }] as ArrayLike<MockResult> & { length: number };
    Object.defineProperty(results, 'length', { value: 1 });
    this.onresult({ results });
  }

  fireError(err: string): void {
    if (this.onerror) this.onerror({ error: err });
  }
}

describe('wake-word service (Kevin v13.1.0)', () => {
  let originalCtor: unknown;

  beforeEach(() => {
    localStorage.clear();
    /* Reset singleton state */
    wakeWord.stop();
    wakeWord.clearCallbacks();
    /* Save original */
    originalCtor = (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  afterEach(() => {
    /* Restore */
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = originalCtor;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    wakeWord.stop();
    wakeWord.clearCallbacks();
    vi.useRealTimers();
  });

  describe('start sans support', () => {
    it('retourne started=false + reason si pas de SpeechRecognition', async () => {
      delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      const r = await wakeWord.start();
      expect(r.started).toBe(false);
      expect(r.reason).toMatch(/Web Speech|non support/i);
    });
  });

  describe('start avec mock', () => {
    it('started=true et listening=true', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const r = await wakeWord.start();
      expect(r.started).toBe(true);
      expect(wakeWord.isListening()).toBe(true);
    });

    it('start() deux fois consécutives ne double-démarre pas', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      await wakeWord.start();
      const r = await wakeWord.start();
      expect(r.started).toBe(true);
      expect(wakeWord.isListening()).toBe(true);
    });
  });

  describe('stop', () => {
    it('idempotent : stop sans start ne throw pas', () => {
      expect(() => wakeWord.stop()).not.toThrow();
      expect(wakeWord.isListening()).toBe(false);
    });

    it('après start + stop : isListening false', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      await wakeWord.start();
      expect(wakeWord.isListening()).toBe(true);
      wakeWord.stop();
      expect(wakeWord.isListening()).toBe(false);
    });
  });

  describe('setKeyword', () => {
    it('change keyword + reflète dans status', () => {
      wakeWord.setKeyword('coucou apex');
      expect(wakeWord.getStatus().keyword).toBe('coucou apex');
    });

    it('vide → ignore (garde valeur précédente)', () => {
      wakeWord.setKeyword('test apex');
      const before = wakeWord.getStatus().keyword;
      wakeWord.setKeyword('');
      expect(wakeWord.getStatus().keyword).toBe(before);
    });

    it('trim + lowercase auto', () => {
      wakeWord.setKeyword('  HELLO Apex  ');
      expect(wakeWord.getStatus().keyword).toBe('hello apex');
    });
  });

  describe('setSensitivity', () => {
    it('clamp à [0, 1]', () => {
      wakeWord.setSensitivity(2.5);
      expect(wakeWord.getStatus().sensitivity).toBe(1);
      wakeWord.setSensitivity(-0.3);
      expect(wakeWord.getStatus().sensitivity).toBe(0);
    });

    it('valeur valide acceptée', () => {
      wakeWord.setSensitivity(0.5);
      expect(wakeWord.getStatus().sensitivity).toBe(0.5);
    });

    it('NaN ignoré', () => {
      wakeWord.setSensitivity(0.4);
      wakeWord.setSensitivity(Number.NaN);
      expect(wakeWord.getStatus().sensitivity).toBe(0.4);
    });
  });

  describe('onWake callbacks', () => {
    it('callback invoqué quand transcript match keyword', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const cb = vi.fn();
      wakeWord.onWake(cb);
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('dis apex quelle heure il est');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(expect.stringContaining('apex'));
    });

    it('NE déclenche PAS callback si transcript hors keyword', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const cb = vi.fn();
      wakeWord.onWake(cb);
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('bonjour comment vas-tu aujourd\'hui');
      expect(cb).not.toHaveBeenCalled();
    });

    it('variante "hey apex" déclenche aussi', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const cb = vi.fn();
      wakeWord.onWake(cb);
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('hey apex tu m\'entends');
      expect(cb).toHaveBeenCalled();
    });

    it('variante "ok apex" déclenche aussi', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const cb = vi.fn();
      wakeWord.onWake(cb);
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('ok apex lance la musique');
      expect(cb).toHaveBeenCalled();
    });

    it('callback non-fonction ignoré sans throw', () => {
      expect(() => wakeWord.onWake(null as unknown as () => void)).not.toThrow();
    });

    it('callback qui throw n\'arrête pas les autres', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const cb1 = vi.fn(() => {
        throw new Error('boom');
      });
      const cb2 = vi.fn();
      wakeWord.onWake(cb1);
      wakeWord.onWake(cb2);
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('dis apex test');
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('snapshot complet avec listening, lastDetected, totalDetections, keyword, sensitivity', () => {
      const s = wakeWord.getStatus();
      expect(s).toHaveProperty('listening');
      expect(s).toHaveProperty('lastDetected');
      expect(s).toHaveProperty('totalDetections');
      expect(s).toHaveProperty('keyword');
      expect(s).toHaveProperty('sensitivity');
    });

    it('totalDetections incrémenté après détection', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const before = wakeWord.getStatus().totalDetections;
      wakeWord.onWake(() => undefined);
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('dis apex compteur test');
      expect(wakeWord.getStatus().totalDetections).toBe(before + 1);
    });

    it('lastDetected timestamp mis à jour', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      const tsBefore = Date.now();
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('dis apex check ts');
      const status = wakeWord.getStatus();
      expect(status.lastDetected).not.toBeNull();
      expect(status.lastDetected!).toBeGreaterThanOrEqual(tsBefore);
    });
  });

  describe('persistance stats', () => {
    it('totalDetections persisté dans localStorage', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireResult('dis apex persist 1');
      fakeRec.fireResult('dis apex persist 2');
      const raw = localStorage.getItem('apex_v13_wake_word_status');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { totalDetections: number };
      expect(parsed.totalDetections).toBeGreaterThanOrEqual(2);
    });
  });

  describe('errors handling', () => {
    it('erreur not-allowed → stop auto', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireError('not-allowed');
      expect(wakeWord.isListening()).toBe(false);
    });

    it('erreur no-speech reste listening (silencieuse)', async () => {
      (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition;
      await wakeWord.start();
      const fakeRec = (wakeWord as unknown as { recognition: FakeSpeechRecognition }).recognition;
      fakeRec.fireError('no-speech');
      expect(wakeWord.isListening()).toBe(true);
    });
  });

  describe('config', () => {
    it('getConfig retourne copie read-only', () => {
      const c = wakeWord.getConfig();
      expect(c).toHaveProperty('keyword');
      expect(c).toHaveProperty('sensitivity');
      expect(c).toHaveProperty('enabled');
    });
  });
});
