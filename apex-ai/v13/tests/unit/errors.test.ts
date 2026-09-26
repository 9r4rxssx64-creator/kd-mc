/**
 * Tests RÉELS core/errors.ts (Jet 7.6 — coverage 53.7% → 80%+).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errors } from '../../core/errors.js';

describe('Errors handler (core/errors.ts)', () => {
  let sosBtn: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    sosBtn = document.createElement('button');
    sosBtn.id = 'apex-rescue-btn';
    sosBtn.style.display = 'none';
    document.body.appendChild(sosBtn);
  });

  describe('toUserMessage', () => {
    it('mappe network error', () => {
      const msg = errors.toUserMessage(new Error('Failed to fetch'));
      expect(msg).toContain('Réseau');
    });

    it('mappe timeout', () => {
      const msg = errors.toUserMessage(new Error('timeout exceeded'));
      /* Branche timeout : message actionnable "retente avec autre modèle IA" (Kevin "ZÉRO blocage") */
      expect(msg).toMatch(/retente|réessaie|30s/i);
    });

    it('mappe quota exceeded', () => {
      const msg = errors.toUserMessage(new Error('QuotaExceededError'));
      expect(msg).toMatch(/Stockage/i);
    });

    it('mappe unauthorized 401', () => {
      const msg = errors.toUserMessage(new Error('401 Unauthorized'));
      /* Branche auth : message actionnable "Clé API invalide → Coffre Récupérer" */
      expect(msg).toMatch(/Clé API|Identifiants|Coffre|invalide/i);
    });

    it('mappe forbidden 403', () => {
      const msg = errors.toUserMessage(new Error('403 Forbidden'));
      expect(msg).toMatch(/Action non autorisée/i);
    });

    it('mappe 404 not found', () => {
      const msg = errors.toUserMessage(new Error('404 not found'));
      expect(msg).toMatch(/introuvable/i);
    });

    it('mappe 5xx serveur', () => {
      const msg = errors.toUserMessage(new Error('500 Internal Server Error'));
      expect(msg).toMatch(/Serveur/i);
    });

    it('fallback générique sur message inconnu', () => {
      const msg = errors.toUserMessage(new Error('weird unexpected'));
      /* Fallback : "Souci technique, je relance automatiquement... Si ça persiste, tape SOS." */
      expect(msg).toMatch(/Souci technique|petit souci|SOS|relance/i);
    });

    it('accepte string non-Error', () => {
      const msg = errors.toUserMessage('plain string error');
      expect(typeof msg).toBe('string');
    });
  });

  describe('capture', () => {
    it('capture Error ne throw pas + logger.error appelé', async () => {
      const { logger } = await import('../../core/logger.js');
      const spy = vi.spyOn(logger, 'error');
      let threw = false;
      try {
        errors.capture(new Error('test capture 1'));
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(spy).toHaveBeenCalled();
      const callArg = spy.mock.calls[0]?.[1];
      expect(callArg).toBe('test capture 1');
      spy.mockRestore();
    });

    it('capture string converti en Error (message identique)', async () => {
      const { logger } = await import('../../core/logger.js');
      const spy = vi.spyOn(logger, 'error');
      errors.capture('error as string');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0]?.[1]).toBe('error as string');
      spy.mockRestore();
    });

    it('capture avec context propage url/line dans logger meta', async () => {
      const { logger } = await import('../../core/logger.js');
      const spy = vi.spyOn(logger, 'error');
      errors.capture(new Error('with ctx'), {
        source: 'manual',
        url: 'https://test.com',
        line: 42,
      });
      const meta = spy.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(meta).toBeTruthy();
      expect(meta['url']).toBe('https://test.com');
      expect(meta['line']).toBe(42);
      expect(meta['source']).toBe('manual');
      spy.mockRestore();
    });

    it('triggerRescue affiche SOS button après 10 errors', () => {
      const sos = document.getElementById('apex-rescue-btn') as HTMLButtonElement;
      sos.style.display = 'none';
      for (let i = 0; i < 11; i++) {
        errors.capture(new Error(`err ${i}`));
      }
      expect(sos.style.display).toBe('flex');
      expect(sos.style.background).toContain('ff5858');
      expect(sos.title).toContain('SOS');
    });

    it('triggerRescue gracefull si SOS button absent (no throw)', () => {
      document.body.innerHTML = '';
      let threw = false;
      try {
        for (let i = 0; i < 11; i++) {
          errors.capture(new Error('no SOS button'));
        }
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      /* SOS button toujours absent */
      expect(document.getElementById('apex-rescue-btn')).toBeNull();
    });
  });

  describe('installGlobalHandlers', () => {
    it('installGlobalHandlers idempotent (2e call no-op via flag installed)', () => {
      errors.installGlobalHandlers();
      const before = window.onerror;
      errors.installGlobalHandlers();
      const after = window.onerror;
      /* 2e call ne réinstalle pas → pas de double bind */
      expect(after).toBe(before);
    });

    it('window error event → capture appelé sans throw', async () => {
      const { logger } = await import('../../core/logger.js');
      const spy = vi.spyOn(logger, 'error');
      errors.installGlobalHandlers();
      const event = new ErrorEvent('error', {
        error: new Error('window onerror test'),
        message: 'window onerror test',
        filename: 'test.js',
        lineno: 42,
        colno: 10,
      });
      window.dispatchEvent(event);
      /* Event capture forwarded to logger.error */
      const found = spy.mock.calls.some((c) => String(c[1]).includes('window onerror'));
      expect(found).toBe(true);
      spy.mockRestore();
    });

    it('unhandledrejection avec Error → reason logged', async () => {
      const { logger } = await import('../../core/logger.js');
      const spy = vi.spyOn(logger, 'error');
      errors.installGlobalHandlers();
      const event = new Event('unhandledrejection') as Event & { reason?: unknown };
      event.reason = new Error('promise rejection');
      window.dispatchEvent(event);
      const found = spy.mock.calls.some((c) => String(c[1]).includes('promise rejection'));
      expect(found).toBe(true);
      spy.mockRestore();
    });

    it('unhandledrejection avec reason string → converti en Error message', async () => {
      const { logger } = await import('../../core/logger.js');
      const spy = vi.spyOn(logger, 'error');
      errors.installGlobalHandlers();
      const event = new Event('unhandledrejection') as Event & { reason?: unknown };
      event.reason = 'string reason';
      window.dispatchEvent(event);
      const found = spy.mock.calls.some((c) => String(c[1]).includes('string reason'));
      expect(found).toBe(true);
      spy.mockRestore();
    });
  });
});
