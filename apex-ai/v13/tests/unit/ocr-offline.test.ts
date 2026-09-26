/**
 * Tests ocr-offline v13.4.146 (Kevin "100/100 réel").
 *
 * Module : services/ocr-offline.ts (235 stmts, était 40.4% coverage).
 * Stratégie : jsdom = pas de Worker module + pas de tesseract.js CDN
 * On teste le code chemin error/cleanup et empty_image.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ocrOffline } from '../../services/ai/ocr-offline.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('ocr-offline (v13.4.146 coverage)', () => {
  beforeEach(async () => {
    /* Cleanup any previous worker state */
    await ocrOffline.cleanup();
    /* Mark dedicated worker as permanently failed for tests
     * to skip its init flow */
    (ocrOffline as unknown as { dedicatedPermFail: boolean }).dedicatedPermFail = true;
  });

  afterEach(async () => {
    await ocrOffline.cleanup();
  });

  describe('isAvailable', () => {
    it('retourne true dans jsdom (window + document présents)', () => {
      expect(ocrOffline.isAvailable()).toBe(true);
    });
  });

  describe('recognizeText - inputs', () => {
    it('retourne ok=false + empty_image si pas de base64', async () => {
      const r = await ocrOffline.recognizeText('');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('empty_image');
      expect(r.text).toBe('');
    });

    it('retourne source tesseract-offline', async () => {
      const r = await ocrOffline.recognizeText('');
      expect(r.source).toBe('tesseract-offline');
    });

    it('latency_ms est number', async () => {
      const r = await ocrOffline.recognizeText('');
      expect(r.latency_ms).toBeTypeOf('number');
    });
  });

  describe('recognizeText - tesseract CDN load fail', () => {
    it('retourne ok=false si tesseract ne charge pas', async () => {
      /* Mock document.createElement to fail script load */
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag === 'script') {
          /* Trigger onerror immediately after attachment */
          setTimeout(() => {
            const onerror = (el as HTMLScriptElement).onerror;
            if (typeof onerror === 'function') {
              onerror.call(el, new Event('error'));
            }
          }, 5);
        }
        return el;
      });
      const r = await ocrOffline.recognizeText('data:image/png;base64,xxxx', { timeoutMs: 500 });
      expect(r.ok).toBe(false);
      expect(r.error).toBeDefined();
    }, 10000);
  });

  describe('cleanup', () => {
    it('cleanup ne crash pas si rien à nettoyer', async () => {
      await expect(ocrOffline.cleanup()).resolves.toBeUndefined();
    });

    it('cleanup idempotent', async () => {
      await ocrOffline.cleanup();
      await ocrOffline.cleanup();
      await ocrOffline.cleanup();
      expect(ocrOffline.isAvailable()).toBe(true);
    });
  });
});
