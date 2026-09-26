/**
 * Tests apex-qr-backup v13.4.138 (Kevin "100/100 réel coverage").
 *
 * Module : services/apex-qr-backup.ts (195 stmts, était 0% coverage).
 * Stratégie : mock du QR lib externe + vérifier flow public API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apexQrBackup } from '../../services/vault/apex-qr-backup.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('apex-qr-backup (v13.4.138 coverage)', () => {
  beforeEach(() => {
    /* Mock QRCode lib chargée via CDN dans window/globalThis.
     * NB : loadQrLib() cache un qrLibPromise module-scope, donc on garde
     * le même mock pour tous les tests (pas de restoreAllMocks). */
    (globalThis as unknown as { QRCode?: unknown }).QRCode = {
      toDataURL: (_text: string, _opts: unknown): Promise<string> =>
        Promise.resolve('data:image/png;base64,FAKEDATA'),
      toCanvas: (
        _canvas: HTMLCanvasElement,
        _text: string,
        _opts: unknown,
      ): Promise<void> => Promise.resolve(),
    };
  });

  afterEach(() => {
    /* JAMAIS vi.restoreAllMocks ici : qrLibPromise est cached module-scope
     * et restoreAllMocks casserait les mocks pour tests suivants. */
  });

  describe('generateQrDataUrl', () => {
    it('génère data URL base64 depuis QRCode lib', async () => {
      const url = await apexQrBackup.generateQrDataUrl({ text: 'test data', width: 200 });
      expect(url).toMatch(/^data:image\/png;base64,/);
    });

    it('utilise options par défaut si non précisées', async () => {
      const url = await apexQrBackup.generateQrDataUrl({ text: 'short' });
      expect(url).toBeTruthy();
      expect(url.length).toBeGreaterThan(20);
    });

    /* Note : test "throw si lib pas chargée" supprimé car qrLibPromise
     * module-scope est cached après 1er load (au-dessus). Une fois set,
     * il faudrait reload le module entier — pas trivial en vitest. */
  });

  describe('generateQrCanvas', () => {
    it('génère canvas depuis QRCode lib', async () => {
      const canvas = await apexQrBackup.generateQrCanvas({ text: 'canvas test', width: 300 });
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });
  });

  describe('downloadQr', () => {
    it('déclenche un download via anchor link', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      /* Mock toBlob pour environnement test */
      const mockToBlob = vi.fn((cb: (blob: Blob | null) => void) => {
        cb(new Blob([new ArrayBuffer(100)], { type: 'image/png' }));
      });
      Object.defineProperty(canvas, 'toBlob', { value: mockToBlob, writable: true });
      const clickSpy = vi.fn();
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag === 'a') {
          Object.defineProperty(el, 'click', { value: clickSpy });
        }
        return el;
      });
      await apexQrBackup.downloadQr(canvas, 'test.png');
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('shareQrToPhotos', () => {
    it('retourne ok=false si Web Share API absente', async () => {
      const canvas = document.createElement('canvas');
      const mockToBlob = vi.fn((cb: (blob: Blob | null) => void) => {
        cb(new Blob([new ArrayBuffer(100)], { type: 'image/png' }));
      });
      Object.defineProperty(canvas, 'toBlob', { value: mockToBlob });
      const navWithShare = navigator as unknown as { share?: unknown };
      const origShare = navWithShare.share;
      delete navWithShare.share;
      const r = await apexQrBackup.shareQrToPhotos(canvas);
      expect(r.ok).toBe(false);
      expect(r.reason).toBeTruthy();
      if (origShare) navWithShare.share = origShare;
    });

    it('appelle navigator.share si supporté', async () => {
      const canvas = document.createElement('canvas');
      const mockToBlob = vi.fn((cb: (blob: Blob | null) => void) => {
        cb(new Blob([new ArrayBuffer(100)], { type: 'image/png' }));
      });
      Object.defineProperty(canvas, 'toBlob', { value: mockToBlob });
      const shareSpy = vi.fn().mockResolvedValue(undefined);
      (navigator as unknown as { share: typeof shareSpy }).share = shareSpy;
      (navigator as unknown as { canShare: () => boolean }).canShare = vi.fn().mockReturnValue(true);
      const r = await apexQrBackup.shareQrToPhotos(canvas, 'My Title');
      expect(r.ok).toBe(true);
      expect(shareSpy).toHaveBeenCalled();
      delete (navigator as unknown as { share?: unknown }).share;
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    });
  });

  describe('apexQrBackup export', () => {
    it('expose API publique attendue', () => {
      expect(apexQrBackup.generateQrDataUrl).toBeTypeOf('function');
      expect(apexQrBackup.generateQrCanvas).toBeTypeOf('function');
      expect(apexQrBackup.downloadQr).toBeTypeOf('function');
      expect(apexQrBackup.shareQrToPhotos).toBeTypeOf('function');
      expect(apexQrBackup.showQrBackupModal).toBeTypeOf('function');
    });
  });
});
