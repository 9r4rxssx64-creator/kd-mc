/**
 * Tests services/live-transcription.ts (v13.4.50, 0% → 80%+).
 *
 * Couvre :
 * - isSupported(): détection SpeechRecognition / webkitSpeechRecognition
 * - checkMicPermission(): granted/denied/prompt/unsupported
 * - requestMic(): getUserMedia success/fail
 * - start() / stop() / toggle() / isActive() lifecycle
 * - showOverlay() / updateText() / hideOverlay() display-only API
 * - escape() XSS protection sur overlay HTML
 * - Auto-detect targetInput (textarea visible le plus bas)
 * - Cleanup automatique au stop
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { liveTranscription } from '../../services/ai/live-transcription.js';

interface FakeRec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ length: number; isFinal: boolean; [key: number]: { transcript: string } }>; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

class FakeSR implements FakeRec {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: FakeRec['onresult'] = null;
  onerror: FakeRec['onerror'] = null;
  onend: FakeRec['onend'] = null;
  onstart: FakeRec['onstart'] = null;
  startCalled = 0;
  stopCalled = 0;
  abortCalled = 0;

  start(): void {
    this.startCalled++;
    /* Simule onstart sync */
    if (this.onstart) this.onstart();
  }
  stop(): void {
    this.stopCalled++;
    if (this.onend) this.onend();
  }
  abort(): void {
    this.abortCalled++;
  }
  fireResult(transcript: string, isFinal = true): void {
    if (!this.onresult) return;
    const results: ArrayLike<{ length: number; isFinal: boolean; [key: number]: { transcript: string } }> & {
      length: number;
    } = Object.assign(
      [{ length: 1, isFinal, 0: { transcript } }],
      { length: 1 },
    );
    this.onresult({ results, resultIndex: 0 });
  }
}

describe('live-transcription service', () => {
  let originalSR: unknown;
  let originalMedia: MediaDevices | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    liveTranscription.stop();
    originalSR = (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    (window as unknown as { SpeechRecognition: typeof FakeSR }).SpeechRecognition = FakeSR;
    originalMedia = navigator.mediaDevices;
  });

  afterEach(() => {
    liveTranscription.stop();
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = originalSR;
    if (originalMedia !== undefined) {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMedia, configurable: true });
    }
  });

  describe('isSupported()', () => {
    it('true si SpeechRecognition disponible', () => {
      expect(liveTranscription.isSupported()).toBe(true);
    });

    it('false si SpeechRecognition undefined', () => {
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = undefined;
      expect(liveTranscription.isSupported()).toBe(false);
    });

    it('true si webkitSpeechRecognition disponible (Safari)', () => {
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
      (window as unknown as { webkitSpeechRecognition: typeof FakeSR }).webkitSpeechRecognition = FakeSR;
      expect(liveTranscription.isSupported()).toBe(true);
    });
  });

  describe('checkMicPermission()', () => {
    it('retourne unsupported si pas navigator.permissions', async () => {
      const orig = navigator.permissions;
      Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
      const r = await liveTranscription.checkMicPermission();
      expect(r).toBe('unsupported');
      Object.defineProperty(navigator, 'permissions', { value: orig, configurable: true });
    });

    it('retourne le state si navigator.permissions.query OK', async () => {
      const fakeQuery = vi.fn().mockResolvedValue({ state: 'granted' });
      Object.defineProperty(navigator, 'permissions', {
        value: { query: fakeQuery },
        configurable: true,
      });
      const r = await liveTranscription.checkMicPermission();
      expect(r).toBe('granted');
    });

    it('retourne unsupported si query throw', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: { query: () => Promise.reject(new Error('fail')) },
        configurable: true,
      });
      const r = await liveTranscription.checkMicPermission();
      expect(r).toBe('unsupported');
    });
  });

  describe('requestMic()', () => {
    it('true si getUserMedia OK', async () => {
      const fakeStream = { getTracks: () => [{ stop: vi.fn() }] };
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
        configurable: true,
      });
      const r = await liveTranscription.requestMic();
      expect(r).toBe(true);
    });

    it('false si getUserMedia rejette', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
        configurable: true,
      });
      const r = await liveTranscription.requestMic();
      expect(r).toBe(false);
    });
  });

  describe('start() / stop() / isActive()', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'permissions', {
        value: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
        configurable: true,
      });
    });

    it('start retourne false si non supporté', async () => {
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = undefined;
      const r = await liveTranscription.start();
      expect(r).toBe(false);
    });

    it('start retourne false si permission denied', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
        configurable: true,
      });
      const r = await liveTranscription.start();
      expect(r).toBe(false);
    });

    it('start true + isActive true + overlay injecté', async () => {
      const r = await liveTranscription.start({ lang: 'fr-FR' });
      expect(r).toBe(true);
      expect(liveTranscription.isActive()).toBe(true);
      expect(document.getElementById('apex-live-transcription-overlay')).not.toBeNull();
    });

    it('stop arrête + retourne final/interim', async () => {
      await liveTranscription.start();
      const result = liveTranscription.stop();
      expect(result).toHaveProperty('final');
      expect(result).toHaveProperty('interim');
      expect(liveTranscription.isActive()).toBe(false);
    });

    it('toggle on/off bascule', async () => {
      const r1 = await liveTranscription.toggle();
      expect(r1).toBe(true);
      expect(liveTranscription.isActive()).toBe(true);
      const r2 = await liveTranscription.toggle();
      expect(r2).toBe(false);
      expect(liveTranscription.isActive()).toBe(false);
    });

    it('start callbacks onFinal/onInterim invoqués', async () => {
      const onFinal = vi.fn();
      const onInterim = vi.fn();
      await liveTranscription.start({ onFinal, onInterim });
      /* Récupère l'instance recognition interne */
      const rec = (liveTranscription as unknown as { recognition: FakeSR }).recognition;
      expect(rec).toBeDefined();
      rec.fireResult('bonjour', true);
      expect(onFinal).toHaveBeenCalledWith('bonjour');
      rec.fireResult('test interim', false);
      expect(onInterim).toHaveBeenCalled();
    });

    it('start ignore no-speech / aborted errors silencieusement', async () => {
      await liveTranscription.start();
      const rec = (liveTranscription as unknown as { recognition: FakeSR }).recognition;
      if (rec.onerror) rec.onerror({ error: 'no-speech' });
      if (rec.onerror) rec.onerror({ error: 'aborted' });
      /* Pas de throw, listening continue */
      expect(liveTranscription.isActive()).toBe(true);
    });
  });

  describe('showOverlay() / updateText() / hideOverlay()', () => {
    it('showOverlay injecte DOM avec text initial vide', () => {
      liveTranscription.showOverlay();
      const ov = document.getElementById('apex-live-transcription-overlay');
      expect(ov).not.toBeNull();
      const txt = document.getElementById('apex-live-transcript-text');
      expect(txt?.innerHTML ?? '').toContain('Parle');
    });

    it('updateText met à jour final + interim', () => {
      liveTranscription.showOverlay();
      liveTranscription.updateText('Bonjour', 'comment ça va');
      const txt = document.getElementById('apex-live-transcript-text');
      expect(txt?.innerHTML ?? '').toContain('Bonjour');
      expect(txt?.innerHTML ?? '').toContain('comment');
    });

    it('updateText vide → revient au placeholder', () => {
      liveTranscription.showOverlay();
      liveTranscription.updateText('', '');
      const txt = document.getElementById('apex-live-transcript-text');
      expect(txt?.innerHTML ?? '').toContain('Parle');
    });

    it('updateText sans overlay actif = no-op', () => {
      /* Pas crash */
      liveTranscription.updateText('test', '');
      expect(document.getElementById('apex-live-transcript-text')).toBeNull();
    });

    it('hideOverlay retire le DOM (après 200ms fade)', () => {
      liveTranscription.showOverlay();
      expect(document.getElementById('apex-live-transcription-overlay')).not.toBeNull();
      liveTranscription.hideOverlay();
      /* Fade-out async via setTimeout 200ms — opacity = 0 immédiat */
      const ov = document.getElementById('apex-live-transcription-overlay');
      /* Peut être présent jusqu'à 200ms après — vérifier opacity */
      if (ov) expect(ov.style.opacity).toBe('0');
    });

    it('hideOverlay sans show = no-op silencieux', () => {
      liveTranscription.hideOverlay();
      expect(document.getElementById('apex-live-transcription-overlay')).toBeNull();
    });
  });

  describe('XSS protection (escape())', () => {
    it('escape <script> dans final text', () => {
      liveTranscription.showOverlay();
      liveTranscription.updateText('<script>alert(1)</script>', '');
      const txt = document.getElementById('apex-live-transcript-text');
      expect(txt?.innerHTML ?? '').not.toContain('<script>');
      expect(txt?.innerHTML ?? '').toContain('&lt;script&gt;');
    });

    it('aucun élément injecté via balises HTML payload', () => {
      liveTranscription.showOverlay();
      liveTranscription.updateText('<img src=x onerror=alert(1)>', '');
      const txt = document.getElementById('apex-live-transcript-text');
      /* L'image ne doit PAS être un vrai élément DOM (sinon innerHTML l'aurait interprété) */
      expect(txt?.querySelectorAll('img').length).toBe(0);
      /* Et le payload doit apparaître sous forme texte échappé */
      expect(txt?.innerHTML ?? '').toContain('&lt;img');
    });
  });

  describe('Auto-detect target input', () => {
    it('utilise position par défaut si pas d\'input trouvé', () => {
      liveTranscription.showOverlay({ position: 'bottom-center' });
      const ov = document.getElementById('apex-live-transcription-overlay');
      expect(ov?.style.bottom).toBe('12px');
    });

    it('résout selector string vers HTMLElement', () => {
      const ta = document.createElement('textarea');
      ta.id = 'my-input';
      Object.defineProperty(ta, 'getBoundingClientRect', {
        value: () => ({ top: 500, left: 20, width: 300, height: 40, right: 320, bottom: 540 }),
      });
      document.body.appendChild(ta);
      liveTranscription.showOverlay({ targetInput: '#my-input' });
      const ov = document.getElementById('apex-live-transcription-overlay');
      expect(ov?.style.width).toBe('300px');
    });
  });
});
