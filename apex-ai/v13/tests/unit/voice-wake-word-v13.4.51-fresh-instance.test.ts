/**
 * Regression test v13.4.51 — wake word fresh-instance pattern (Kevin
 * "Dis Apex ne marche pas bien, peut-être pas").
 *
 * Bug v13.4.50 et avant : onend appelait `rec.start()` sur la MEME instance
 * SpeechRecognition après onend. iOS Safari plante silencieusement
 * (InvalidStateError). Fix v13.4.51 : créer une NOUVELLE instance à chaque
 * restart via createWakeRecognition().
 *
 * Ces tests verrouillent ce comportement pour qu'il ne régresse jamais.
 *
 * Couvre voice-print.ts ET wake-word.ts (les deux services).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { voicePrint } from '../../services/ai/voice-print.js';
import { wakeWord } from '../../services/ai/wake-word.js';

class FakeSR {
  static instances: FakeSR[] = [];
  static reset(): void {
    FakeSR.instances = [];
  }
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> & { length: number } }) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCount = 0;
  stopCount = 0;
  destroyed = false;

  constructor() {
    FakeSR.instances.push(this);
  }
  start(): void {
    if (this.destroyed) throw new Error('InvalidStateError');
    this.startCount++;
  }
  stop(): void {
    this.stopCount++;
    this.destroyed = true;
    if (this.onend) this.onend();
  }
  fireEnd(): void {
    this.destroyed = true;
    if (this.onend) this.onend();
  }
}

describe('Wake word v13.4.51 fresh-instance fix (Kevin iOS Safari)', () => {
  let originalCtor: unknown;

  beforeEach(() => {
    localStorage.clear();
    voicePrint.stopWakeWord();
    voicePrint.onWakeInterim(null);
    wakeWord.stop();
    wakeWord.clearCallbacks();
    FakeSR.reset();
    originalCtor = (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    (window as unknown as { SpeechRecognition: typeof FakeSR }).SpeechRecognition = FakeSR;
    if (typeof (window as unknown as { AudioContext?: unknown }).AudioContext === 'undefined') {
      (window as unknown as { AudioContext: () => unknown }).AudioContext = function () {
        return {};
      };
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    voicePrint.stopWakeWord();
    voicePrint.onWakeInterim(null);
    wakeWord.stop();
    wakeWord.clearCallbacks();
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = originalCtor;
  });

  describe('voice-print.ts startWakeWord', () => {
    it('crée 1 instance au start initial', () => {
      const r = voicePrint.startWakeWord(() => undefined);
      expect(r.ok).toBe(true);
      expect(FakeSR.instances.length).toBe(1);
      expect(FakeSR.instances[0]?.startCount).toBe(1);
    });

    it('après onend, crée une NOUVELLE instance (pas réutilise l\'ancienne)', () => {
      voicePrint.startWakeWord(() => undefined);
      expect(FakeSR.instances.length).toBe(1);
      const first = FakeSR.instances[0]!;
      first.fireEnd();
      /* RESTART_DELAY_MS = 500 dans voice-print.ts */
      vi.advanceTimersByTime(600);
      /* Une 2e instance fresh DOIT exister + avoir start() appelé */
      expect(FakeSR.instances.length).toBe(2);
      expect(FakeSR.instances[1]?.startCount).toBe(1);
      /* L'ancienne instance ne doit PAS avoir été re-démarrée (start aurait throw) */
      expect(first.startCount).toBe(1);
    });

    it('cycles end→restart multiples créent N+1 instances', () => {
      voicePrint.startWakeWord(() => undefined);
      for (let i = 0; i < 3; i++) {
        const current = FakeSR.instances[FakeSR.instances.length - 1]!;
        current.fireEnd();
        vi.advanceTimersByTime(600);
      }
      /* 1 initial + 3 restarts = 4 instances */
      expect(FakeSR.instances.length).toBe(4);
      /* Chaque instance a été start() une fois (pas de réutilisation) */
      for (const inst of FakeSR.instances) {
        expect(inst.startCount).toBe(1);
      }
    });

    it('stopWakeWord empêche les futurs restarts', () => {
      voicePrint.startWakeWord(() => undefined);
      voicePrint.stopWakeWord();
      const first = FakeSR.instances[0]!;
      first.fireEnd();
      vi.advanceTimersByTime(600);
      /* Pas de 2e instance créée après stop manuel */
      expect(FakeSR.instances.length).toBe(1);
    });
  });

  describe('wake-word.ts service start/restart', () => {
    it('crée 1 instance au start initial', async () => {
      const r = await wakeWord.start();
      expect(r.started).toBe(true);
      expect(FakeSR.instances.length).toBe(1);
      expect(FakeSR.instances[0]?.startCount).toBe(1);
    });

    it('après onend, crée une NOUVELLE instance (fresh instance pattern)', async () => {
      await wakeWord.start();
      const first = FakeSR.instances[0]!;
      first.fireEnd();
      /* RESTART_DELAY_MS = 500 dans wake-word.ts */
      vi.advanceTimersByTime(600);
      expect(FakeSR.instances.length).toBe(2);
      expect(FakeSR.instances[1]?.startCount).toBe(1);
      expect(first.startCount).toBe(1); /* ancienne pas réutilisée */
    });

    it('stop arrête le cycle restart', async () => {
      await wakeWord.start();
      wakeWord.stop();
      const first = FakeSR.instances[0]!;
      first.fireEnd();
      vi.advanceTimersByTime(600);
      expect(FakeSR.instances.length).toBe(1);
    });
  });
});
