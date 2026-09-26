/**
 * Tests services/voice-overlay (Kevin v13.4.198 "100/100 réel partout").
 *
 * Couvre les 5 méthodes publiques + handleStop/handleSubmit/injectStylesOnce :
 * - show() : DOM + accessibility + idempotent
 * - updateTranscript() : final vs interim + empty fallback
 * - updateStatus() : text update + no-op si non visible
 * - hide() : cleanup DOM + state
 * - isVisible() : reflet boolean state
 * - handleStop/Submit : callback wiring + reset
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { voiceOverlay } from '../../services/ai/voice-overlay.js';

const OVERLAY_ID = 'apex-voice-overlay';
const STYLES_ID = 'apex-voice-overlay-styles';
const TRANSCRIPT_ID = 'apex-voice-overlay-transcript';
const STATUS_ID = 'apex-voice-overlay-status';

describe('services/voice-overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    voiceOverlay.hide(); /* reset state si test précédent foiré */
  });

  afterEach(() => {
    voiceOverlay.hide();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('show()', () => {
    it('injecte overlay dans body avec attributes a11y', () => {
      voiceOverlay.show();
      const el = document.getElementById(OVERLAY_ID);
      expect(el).not.toBeNull();
      expect(el?.getAttribute('role')).toBe('dialog');
      expect(el?.getAttribute('aria-modal')).toBe('true');
      expect(el?.getAttribute('aria-label')).toBe('Dictée vocale en cours');
    });

    it('injecte styles tag avec keyframes', () => {
      voiceOverlay.show();
      const style = document.getElementById(STYLES_ID);
      expect(style).not.toBeNull();
      expect(style?.textContent).toContain('ax-mic-pulse');
      expect(style?.textContent).toContain('ax-overlay-fade-in');
      expect(style?.textContent).toContain('ax-transcript-pop');
    });

    it('idempotent : 2e show() ne re-crée pas overlay', () => {
      voiceOverlay.show();
      voiceOverlay.show();
      expect(document.querySelectorAll(`#${OVERLAY_ID}`)).toHaveLength(1);
    });

    it('idempotent injectStylesOnce : 2 shows = 1 style tag', () => {
      voiceOverlay.show();
      voiceOverlay.hide();
      voiceOverlay.show();
      expect(document.querySelectorAll(`#${STYLES_ID}`)).toHaveLength(1);
    });

    it('initialMessage est affiché si fourni', () => {
      voiceOverlay.show({ initialMessage: 'Bonjour Apex' });
      const transcript = document.getElementById(TRANSCRIPT_ID);
      expect(transcript?.innerHTML).toContain('Bonjour Apex');
    });

    it('affiche placeholder "…" si pas de message initial', () => {
      voiceOverlay.show();
      const transcript = document.getElementById(TRANSCRIPT_ID);
      expect(transcript?.innerHTML).toContain('opacity:0.4');
    });

    it('expose 2 boutons Stop + Submit avec a11y labels', () => {
      voiceOverlay.show();
      const stop = document.getElementById('apex-voice-overlay-stop');
      const submit = document.getElementById('apex-voice-overlay-submit');
      expect(stop?.getAttribute('aria-label')).toBe('Arrêter dictée');
      expect(submit?.getAttribute('aria-label')).toBe('Envoyer');
    });
  });

  describe('isVisible()', () => {
    it('false initialement', () => {
      expect(voiceOverlay.isVisible()).toBe(false);
    });

    it('true après show', () => {
      voiceOverlay.show();
      expect(voiceOverlay.isVisible()).toBe(true);
    });

    it('false après hide', () => {
      voiceOverlay.show();
      voiceOverlay.hide();
      expect(voiceOverlay.isVisible()).toBe(false);
    });
  });

  describe('hide()', () => {
    it('supprime overlay du DOM', () => {
      voiceOverlay.show();
      expect(document.getElementById(OVERLAY_ID)).not.toBeNull();
      voiceOverlay.hide();
      expect(document.getElementById(OVERLAY_ID)).toBeNull();
    });

    it('no-op si déjà caché', () => {
      expect(() => {
        voiceOverlay.hide();
        voiceOverlay.hide();
      }).not.toThrow();
    });
  });

  describe('updateTranscript()', () => {
    it('met à jour textContent avec final=true (pas de … suffix)', () => {
      voiceOverlay.show();
      voiceOverlay.updateTranscript('Bonjour Apex', true);
      const transcript = document.getElementById(TRANSCRIPT_ID);
      expect(transcript?.textContent).toBe('Bonjour Apex');
    });

    it('ajoute … suffix si pas final', () => {
      voiceOverlay.show();
      voiceOverlay.updateTranscript('Bonjour', false);
      const transcript = document.getElementById(TRANSCRIPT_ID);
      expect(transcript?.textContent).toBe('Bonjour…');
    });

    it('placeholder si transcript vide', () => {
      voiceOverlay.show({ initialMessage: 'init' });
      voiceOverlay.updateTranscript('', false);
      const transcript = document.getElementById(TRANSCRIPT_ID);
      expect(transcript?.innerHTML).toContain('opacity:0.4');
    });

    it('no-op si overlay caché (pas de throw)', () => {
      expect(() => {
        voiceOverlay.updateTranscript('hello', true);
      }).not.toThrow();
    });
  });

  describe('updateStatus()', () => {
    it('change le texte du status', () => {
      voiceOverlay.show();
      voiceOverlay.updateStatus('Envoi en cours…');
      const status = document.getElementById(STATUS_ID);
      expect(status?.textContent).toBe('Envoi en cours…');
    });

    it('no-op si overlay caché (pas de throw)', () => {
      expect(() => {
        voiceOverlay.updateStatus('whatever');
      }).not.toThrow();
    });
  });

  describe('handleStop callback wiring', () => {
    it('click Stop déclenche onStop callback + ferme overlay', () => {
      const onStop = vi.fn();
      voiceOverlay.show({ onStop });
      const stop = document.getElementById('apex-voice-overlay-stop') as HTMLButtonElement;
      stop.click();
      expect(onStop).toHaveBeenCalledTimes(1);
      expect(voiceOverlay.isVisible()).toBe(false);
    });

    it('callback Stop avec exception ne crashe pas (caught)', () => {
      const onStop = vi.fn(() => { throw new Error('boom'); });
      voiceOverlay.show({ onStop });
      const stop = document.getElementById('apex-voice-overlay-stop') as HTMLButtonElement;
      expect(() => stop.click()).not.toThrow();
    });

    it('click backdrop (outside inner) = stop', () => {
      const onStop = vi.fn();
      voiceOverlay.show({ onStop });
      const overlay = document.getElementById(OVERLAY_ID);
      /* Simule click sur l'overlay backdrop lui-même (pas inner) */
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('Escape key = stop', () => {
      const onStop = vi.fn();
      voiceOverlay.show({ onStop });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(onStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleSubmit callback wiring', () => {
    it('click Submit déclenche onSubmit avec transcript', () => {
      const onSubmit = vi.fn();
      voiceOverlay.show({ onSubmit, initialMessage: 'Test message' });
      const submit = document.getElementById('apex-voice-overlay-submit') as HTMLButtonElement;
      submit.click();
      expect(onSubmit).toHaveBeenCalledWith('Test message');
      expect(voiceOverlay.isVisible()).toBe(false);
    });

    it('Submit avec transcript vide ne call PAS onSubmit (no-op)', () => {
      const onSubmit = vi.fn();
      voiceOverlay.show({ onSubmit });
      const submit = document.getElementById('apex-voice-overlay-submit') as HTMLButtonElement;
      submit.click();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Submit trim le transcript', () => {
      const onSubmit = vi.fn();
      voiceOverlay.show({ onSubmit, initialMessage: '  spaced  ' });
      const submit = document.getElementById('apex-voice-overlay-submit') as HTMLButtonElement;
      submit.click();
      expect(onSubmit).toHaveBeenCalledWith('spaced');
    });

    it('callback Submit avec exception ne crashe pas (caught)', () => {
      const onSubmit = vi.fn(() => { throw new Error('boom'); });
      voiceOverlay.show({ onSubmit, initialMessage: 'x' });
      const submit = document.getElementById('apex-voice-overlay-submit') as HTMLButtonElement;
      expect(() => submit.click()).not.toThrow();
    });
  });

  describe('voiceOverlay namespace', () => {
    it('expose les 5 méthodes', () => {
      expect(voiceOverlay.show).toBeDefined();
      expect(voiceOverlay.hide).toBeDefined();
      expect(voiceOverlay.isVisible).toBeDefined();
      expect(voiceOverlay.updateTranscript).toBeDefined();
      expect(voiceOverlay.updateStatus).toBeDefined();
    });
  });
});
