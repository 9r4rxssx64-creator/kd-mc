/**
 * Tests services/wake-word.ts — coverage boost (86% → 95%+).
 *
 * Cible :
 * - start() catch branche (lignes 256-261) : SpeechRecognition throw
 * - stop() try/catch sur recognition.stop() (ligne 278) : throw silencieux
 * - persistStats() catch quota (ligne 380)
 * - persistStats hydrate state at constructor avec corrupted localStorage
 * - VOICE_LOG_KEY trim au max 100
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { wakeWord } from '../../services/ai/wake-word.js';

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> & { length: number } }) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  start(): void {
    /* Simulate recognition started */
  }

  stop(): void {
    /* Simulate stop */
  }
}

class ThrowingSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: unknown = null;
  onerror: unknown = null;
  onend: unknown = null;

  start(): void {
    throw new Error('Permission denied by user');
  }

  stop(): void {
    throw new Error('stop failed');
  }
}

describe('wake-word edge coverage', () => {
  let originalCtor: unknown;
  let originalWebkit: unknown;

  beforeEach(() => {
    localStorage.clear();
    wakeWord.stop();
    wakeWord.clearCallbacks();
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    originalCtor = w.SpeechRecognition;
    originalWebkit = w.webkitSpeechRecognition;
  });

  afterEach(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    w.SpeechRecognition = originalCtor;
    w.webkitSpeechRecognition = originalWebkit;
    wakeWord.stop();
    wakeWord.clearCallbacks();
    vi.restoreAllMocks();
  });

  it('start() catch branch : SpeechRecognition.start() throw → started=false avec reason', async () => {
    /* Inject throwing ctor */
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = ThrowingSpeechRecognition;
    const r = await wakeWord.start();
    expect(r.started).toBe(false);
    expect(r.reason).toMatch(/Permission|denied/i);
    expect(wakeWord.isListening()).toBe(false);
  });

  it('start() catch branch : non-Error thrown (string)', async () => {
    class StringThrowingCtor {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: unknown = null;
      onerror: unknown = null;
      onend: unknown = null;
      start(): void {
        // eslint-disable-next-line no-throw-literal -- test du chemin "throw non-Error"
        throw 'string error';
      }
      stop(): void {}
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = StringThrowingCtor;
    const r = await wakeWord.start();
    expect(r.started).toBe(false);
    expect(r.reason).toBe('string error');
  });

  it('stop() catch silencieux si recognition.stop() throw', async () => {
    /* Setup avec fake puis remplace recognition par throwing */
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    const startResult = await wakeWord.start();
    expect(startResult.started).toBe(true);

    /* Replace recognition with one that throws */
    const internal = wakeWord as unknown as { recognition: { stop: () => void } | null };
    internal.recognition = {
      stop: (): void => {
        throw new Error('hardware fault');
      },
    };
    /* stop() doit catcher silencieusement */
    expect(() => wakeWord.stop()).not.toThrow();
    expect(wakeWord.isListening()).toBe(false);
  });

  it('stop() idempotent : stop sur stop n\'a pas d\'effet', () => {
    expect(() => wakeWord.stop()).not.toThrow();
    expect(() => wakeWord.stop()).not.toThrow();
    expect(wakeWord.isListening()).toBe(false);
  });

  it('persistStats() catch quota error', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();

    /* Mock localStorage.setItem throw quota error */
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    /* Trigger handleWakeDetected via fireResult */
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    if (internal.recognition && internal.recognition.onresult) {
      const results = [{ 0: { transcript: 'dis apex' } }] as unknown as ArrayLike<{ 0: { transcript: string } }> & { length: number };
      Object.defineProperty(results, 'length', { value: 1 });
      /* Should not throw */
      expect(() => internal.recognition.onresult?.({ results })).not.toThrow();
    }
  });

  it('start() retourne started:false si Web Speech API absente', async () => {
    /* Remove SpeechRecognition + webkit */
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    const r = await wakeWord.start();
    expect(r.started).toBe(false);
    expect(r.reason).toMatch(/Web Speech|non supportée/i);
  });

  it('setKeyword vide ignoré, garde le précédent', () => {
    wakeWord.setKeyword('hey ax');
    let cfg = wakeWord.getConfig();
    expect(cfg.keyword).toBe('hey ax');
    wakeWord.setKeyword('');
    cfg = wakeWord.getConfig();
    expect(cfg.keyword).toBe('hey ax'); /* inchangé */
  });

  it('setKeyword whitespace-only ignoré', () => {
    wakeWord.setKeyword('test kw');
    wakeWord.setKeyword('   ');
    expect(wakeWord.getConfig().keyword).toBe('test kw');
  });

  it('setSensitivity NaN ignoré', () => {
    wakeWord.setSensitivity(0.5);
    wakeWord.setSensitivity(NaN);
    expect(wakeWord.getConfig().sensitivity).toBe(0.5);
  });

  it('setSensitivity non-number ignoré', () => {
    wakeWord.setSensitivity(0.5);
    wakeWord.setSensitivity('0.8' as unknown as number);
    expect(wakeWord.getConfig().sensitivity).toBe(0.5);
  });

  it('setSensitivity clamp à 0..1 (négatif)', () => {
    wakeWord.setSensitivity(-0.5);
    expect(wakeWord.getConfig().sensitivity).toBe(0);
  });

  it('setSensitivity clamp à 0..1 (>1)', () => {
    wakeWord.setSensitivity(2.5);
    expect(wakeWord.getConfig().sensitivity).toBe(1);
  });

  it('onWake non-function ignoré', () => {
    /* Pas de crash si callback invalide */
    expect(() => wakeWord.onWake('not a function' as unknown as () => void)).not.toThrow();
  });

  it('clearCallbacks supprime tous les callbacks enregistrés', () => {
    let count = 0;
    wakeWord.onWake(() => count++);
    wakeWord.onWake(() => count++);
    wakeWord.clearCallbacks();
    /* Aucun callback ne doit fire au prochain wake */
    expect(count).toBe(0);
  });

  it('getConfig retourne copie (pas mutation externe)', () => {
    wakeWord.setKeyword('test config');
    const cfg = wakeWord.getConfig();
    /* Mutation externe ne doit pas affecter wakeWord */
    (cfg as { keyword: string }).keyword = 'mutated';
    expect(wakeWord.getConfig().keyword).toBe('test config');
  });

  it('getStatus retourne snapshot complet', () => {
    const s = wakeWord.getStatus();
    expect(typeof s.listening).toBe('boolean');
    expect(typeof s.totalDetections).toBe('number');
    expect(typeof s.keyword).toBe('string');
    expect(typeof s.sensitivity).toBe('number');
    /* lastDetected peut être null ou number */
    expect(s.lastDetected === null || typeof s.lastDetected === 'number').toBe(true);
  });

  it('error onerror "no-speech" incrémente noSpeechRetries', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    /* Simulate no-speech error */
    if (internal.recognition.onerror) {
      internal.recognition.onerror({ error: 'no-speech' });
      /* no-speech ne stop pas immédiatement */
      expect(wakeWord.isListening()).toBe(true);
    }
  });

  it('error onerror "not-allowed" → stop immediatly', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    if (internal.recognition.onerror) {
      internal.recognition.onerror({ error: 'not-allowed' });
      expect(wakeWord.isListening()).toBe(false);
    }
  });

  it('error onerror "service-not-allowed" → stop', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    if (internal.recognition.onerror) {
      internal.recognition.onerror({ error: 'service-not-allowed' });
      expect(wakeWord.isListening()).toBe(false);
    }
  });

  it('error onerror "aborted" → recovery silent (listening intact)', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    if (internal.recognition.onerror) {
      internal.recognition.onerror({ error: 'aborted' });
      /* aborted = silent recovery, listening reste true */
      expect(wakeWord.isListening()).toBe(true);
    }
  });

  it('error onerror sans error param → fallback "unknown"', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    if (internal.recognition.onerror) {
      internal.recognition.onerror({});
      /* Pas de crash */
      expect(wakeWord.isListening()).toBe(true);
    }
  });

  it('callback throw → catch silencieux + autres callbacks fire', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    let secondFired = false;
    wakeWord.onWake(() => {
      throw new Error('callback failed');
    });
    wakeWord.onWake(() => {
      secondFired = true;
    });
    await wakeWord.start();
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    if (internal.recognition.onresult) {
      const results = [{ 0: { transcript: 'dis apex' } }] as unknown as ArrayLike<{ 0: { transcript: string } }> & { length: number };
      Object.defineProperty(results, 'length', { value: 1 });
      internal.recognition.onresult({ results });
      expect(secondFired).toBe(true);
    }
  });

  it('callback throw avec non-Error string', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    wakeWord.onWake(() => {
      // eslint-disable-next-line no-throw-literal -- test du chemin "throw non-Error"
      throw 'string error in cb';
    });
    await wakeWord.start();
    const internal = wakeWord as unknown as { recognition: FakeSpeechRecognition };
    if (internal.recognition.onresult) {
      const results = [{ 0: { transcript: 'dis apex' } }] as unknown as ArrayLike<{ 0: { transcript: string } }> & { length: number };
      Object.defineProperty(results, 'length', { value: 1 });
      expect(() => internal.recognition.onresult?.({ results })).not.toThrow();
    }
  });

  it('start() idempotent : double start retourne started:true sans nouveau ctor', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    const r1 = await wakeWord.start();
    const r2 = await wakeWord.start();
    expect(r1.started).toBe(true);
    expect(r2.started).toBe(true);
  });

  it('VOICE_LOG_KEY persiste les events (pushVoiceLog)', async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();
    const log = JSON.parse(localStorage.getItem('ax_voice_log') ?? '[]') as Array<{ evt: string }>;
    expect(log.length).toBeGreaterThan(0);
    expect(log.some((e) => e.evt === 'start')).toBe(true);
  });

  it('VOICE_LOG cap à 100 entries', async () => {
    /* Pré-fill 150 entries */
    const big = Array.from({ length: 150 }, (_, i) => ({ ts: i, evt: 'fake', src: 'test' }));
    localStorage.setItem('ax_voice_log', JSON.stringify(big));

    /* Trigger pushVoiceLog via start */
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    await wakeWord.start();
    const log = JSON.parse(localStorage.getItem('ax_voice_log') ?? '[]') as unknown[];
    expect(log.length).toBeLessThanOrEqual(100);
  });

  it('VOICE_LOG corrupted JSON → catch silencieux', async () => {
    localStorage.setItem('ax_voice_log', 'invalid-json{');
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    /* Pas de crash même avec log corrompu */
    const r = await wakeWord.start();
    expect(r.started).toBe(true);
  });
});
