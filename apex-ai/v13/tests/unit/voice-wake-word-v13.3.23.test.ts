/**
 * Tests fix wake word v13.3.23 (Kevin bug 19:10 — "rien ne reconnaît la voix").
 *
 * Couvre :
 * - isWakeMatch reconnaît variantes phonétiques (dis/dit/dix apex, dispex, hapex)
 * - voicePrint.startWakeWord onerror 'aborted' = silencieux (pas error UI)
 * - voicePrint.startWakeWord onerror 'no-speech' < 20 = silencieux
 * - voicePrint.startWakeWord onerror 'not-allowed' = stop + audit
 * - voicePrint.onWakeInterim invoque le callback avec interim transcripts
 * - getVoiceLog/clearVoiceLog persiste les events
 * - checkMicrophonePermission retourne 'unknown' sans navigator.permissions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  voicePrint,
  checkMicrophonePermission,
  getVoiceLog,
  clearVoiceLog,
} from '../../services/ai/voice-print.js';

interface FakeRecResult {
  0: { transcript: string };
  isFinal?: boolean;
}

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult:
    | ((event: { results: ArrayLike<FakeRecResult> & { length: number } }) => void)
    | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCount = 0;
  stopCount = 0;

  start(): void {
    this.startCount++;
  }
  stop(): void {
    this.stopCount++;
    if (this.onend) this.onend();
  }
  fireResult(transcript: string, isFinal = true): void {
    if (!this.onresult) return;
    const results: FakeRecResult[] = [{ 0: { transcript }, isFinal }];
    Object.defineProperty(results, 'length', { value: 1 });
    this.onresult({ results: results as unknown as ArrayLike<FakeRecResult> & { length: number } });
  }
  fireError(err: string): void {
    if (this.onerror) this.onerror({ error: err });
  }
  fireEnd(): void {
    if (this.onend) this.onend();
  }
}

describe('Wake word v13.3.23 fix (Kevin bug 19:10)', () => {
  let originalCtor: unknown;

  beforeEach(() => {
    localStorage.clear();
    voicePrint.stopWakeWord();
    voicePrint.onWakeInterim(null);
    originalCtor = (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    (window as unknown as { SpeechRecognition: typeof FakeSpeechRecognition }).SpeechRecognition =
      FakeSpeechRecognition;
    /* Stub AudioContext pour isSupported() */
    if (typeof (window as unknown as { AudioContext?: unknown }).AudioContext === 'undefined') {
      (window as unknown as { AudioContext: () => unknown }).AudioContext = function () {
        return {};
      };
    }
  });

  afterEach(() => {
    voicePrint.stopWakeWord();
    voicePrint.onWakeInterim(null);
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = originalCtor;
    vi.useRealTimers();
  });

  describe('Détection variantes phonétiques étendues', () => {
    it('reconnaît "dis apex"', () => {
      const cb = vi.fn();
      const r = voicePrint.startWakeWord(cb);
      expect(r.ok).toBe(true);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('dis apex ouvre le coffre');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('reconnaît "dispex" (concat phonétique fréquent)', () => {
      const cb = vi.fn();
      voicePrint.startWakeWord(cb);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('dispex tu m entends');
      expect(cb).toHaveBeenCalled();
    });

    it('reconnaît "hapex" (h aspirée)', () => {
      const cb = vi.fn();
      voicePrint.startWakeWord(cb);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('hapex bonjour');
      expect(cb).toHaveBeenCalled();
    });

    it('reconnaît "hey apex"', () => {
      const cb = vi.fn();
      voicePrint.startWakeWord(cb);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('hey apex quelle heure');
      expect(cb).toHaveBeenCalled();
    });

    it('NE reconnaît PAS "bonjour comment vas-tu"', () => {
      const cb = vi.fn();
      voicePrint.startWakeWord(cb);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('bonjour comment vas tu aujourd hui');
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('Erreurs lifecycle iOS Safari = silencieuses', () => {
    it('onerror "aborted" ne stoppe PAS le listening', () => {
      voicePrint.startWakeWord(() => undefined);
      expect(voicePrint.isListening()).toBe(true);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireError('aborted');
      /* Le listening reste actif — restart sera fait par onend */
      expect(voicePrint.isListening()).toBe(true);
    });

    it('onerror "no-speech" < 20 fois reste listening', () => {
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      for (let i = 0; i < 5; i++) rec.fireError('no-speech');
      expect(voicePrint.isListening()).toBe(true);
    });

    it('onerror "no-speech" 20× → suspend (stop micro)', () => {
      vi.useFakeTimers();
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      for (let i = 0; i < 20; i++) rec.fireError('no-speech');
      /* suspend appelé : rec.stop() incrémenté */
      expect(rec.stopCount).toBeGreaterThan(0);
      /* Mais flag wakeListening reste true (reprise auto programmée) */
      expect(voicePrint.isListening()).toBe(true);
    });

    it('onerror "not-allowed" → stop complet', () => {
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireError('not-allowed');
      expect(voicePrint.isListening()).toBe(false);
    });
  });

  describe('Interim callback (live UI feedback)', () => {
    it('onWakeInterim invoqué avec transcript + isFinal=false', () => {
      const interimCb = vi.fn();
      voicePrint.onWakeInterim(interimCb);
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('bonjour', false);
      expect(interimCb).toHaveBeenCalledWith('bonjour', false);
    });

    it('onWakeInterim invoqué avec isFinal=true', () => {
      const interimCb = vi.fn();
      voicePrint.onWakeInterim(interimCb);
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('test final', true);
      expect(interimCb).toHaveBeenCalledWith('test final', true);
    });

    it('onWakeInterim(null) désinscrit le callback', () => {
      const interimCb = vi.fn();
      voicePrint.onWakeInterim(interimCb);
      voicePrint.onWakeInterim(null);
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('test', false);
      expect(interimCb).not.toHaveBeenCalled();
    });
  });

  describe('Voice log structuré (panel admin diagnostic)', () => {
    it('start déclenche log evt:start', () => {
      voicePrint.startWakeWord(() => undefined);
      const log = getVoiceLog();
      const startEntry = log.find((e) => e.evt === 'start');
      expect(startEntry).toBeDefined();
    });

    it('result déclenche log evt:result ou interim', () => {
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireResult('dis apex test', true);
      const log = getVoiceLog();
      const resultEntry = log.find((e) => e.evt === 'result' || e.evt === 'wake');
      expect(resultEntry).toBeDefined();
    });

    it('error déclenche log evt:error avec detail', () => {
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      rec.fireError('aborted');
      const log = getVoiceLog();
      const errEntry = log.find((e) => e.evt === 'error');
      expect(errEntry).toBeDefined();
      expect(errEntry?.detail).toBe('aborted');
    });

    it('clearVoiceLog vide le log', () => {
      voicePrint.startWakeWord(() => undefined);
      expect(getVoiceLog().length).toBeGreaterThan(0);
      clearVoiceLog();
      expect(getVoiceLog().length).toBe(0);
    });

    it('log capé à 100 entries (FIFO)', () => {
      voicePrint.startWakeWord(() => undefined);
      const rec = (voicePrint as unknown as { wakeRecognition: FakeSpeechRecognition }).wakeRecognition;
      for (let i = 0; i < 150; i++) rec.fireError('aborted');
      expect(getVoiceLog().length).toBeLessThanOrEqual(100);
    });
  });

  describe('checkMicrophonePermission', () => {
    it('retourne "unknown" sans navigator.permissions', async () => {
      const orig = navigator.permissions;
      Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
      const r = await checkMicrophonePermission();
      expect(r).toBe('unknown');
      Object.defineProperty(navigator, 'permissions', { value: orig, configurable: true });
    });

    it('retourne le state si navigator.permissions.query OK', async () => {
      const fakeQuery = vi.fn().mockResolvedValue({ state: 'granted' });
      Object.defineProperty(navigator, 'permissions', {
        value: { query: fakeQuery },
        configurable: true,
      });
      const r = await checkMicrophonePermission();
      expect(r).toBe('granted');
    });
  });
});
