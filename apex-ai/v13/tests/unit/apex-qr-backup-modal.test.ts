/**
 * Tests apex-qr-backup showQrBackupModal v13.4.146 (Kevin "100/100 réel").
 *
 * Module : services/apex-qr-backup.ts coverage push pour la branche showQrBackupModal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apexQrBackup } from '../../services/vault/apex-qr-backup.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('apex-qr-backup showQrBackupModal (v13.4.146 coverage)', () => {
  beforeEach(() => {
    /* Mock QRCode lib */
    (globalThis as unknown as { QRCode?: unknown }).QRCode = {
      toDataURL: (_text: string): Promise<string> =>
        Promise.resolve('data:image/png;base64,QR'),
      toCanvas: (_canvas: HTMLCanvasElement): Promise<void> => Promise.resolve(),
    };
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('showQrBackupModal', () => {
    it('crée modal dans le DOM', async () => {
      await apexQrBackup.showQrBackupModal({
        text: 'test data',
      });
      const overlay = document.getElementById('apex-qr-backup-modal');
      expect(overlay).toBeTruthy();
    });

    it('utilise title custom si fourni', async () => {
      await apexQrBackup.showQrBackupModal({
        text: 'data',
        title: 'Custom Title 🔐',
      });
      const h3 = document.querySelector('#apex-qr-backup-modal h3');
      expect(h3?.textContent).toBe('Custom Title 🔐');
    });

    it('utilise description custom si fournie', async () => {
      await apexQrBackup.showQrBackupModal({
        text: 'data',
        description: 'Custom desc text',
      });
      const p = document.querySelector('#apex-qr-backup-modal p');
      expect(p?.textContent).toBe('Custom desc text');
    });

    it('expose 3 boutons (share/download/close)', async () => {
      await apexQrBackup.showQrBackupModal({ text: 'data' });
      expect(document.getElementById('apex-qr-share-btn')).toBeTruthy();
      expect(document.getElementById('apex-qr-download-btn')).toBeTruthy();
      expect(document.getElementById('apex-qr-close-btn')).toBeTruthy();
    });

    it('close button retire modal du DOM', async () => {
      await apexQrBackup.showQrBackupModal({ text: 'data' });
      const closeBtn = document.getElementById('apex-qr-close-btn');
      closeBtn?.click();
      expect(document.getElementById('apex-qr-backup-modal')).toBeNull();
    });

    it('utilise titre par défaut si non fourni', async () => {
      await apexQrBackup.showQrBackupModal({ text: 'data' });
      const h3 = document.querySelector('#apex-qr-backup-modal h3');
      expect(h3?.textContent).toContain('Sauvegarde');
    });
  });
});
