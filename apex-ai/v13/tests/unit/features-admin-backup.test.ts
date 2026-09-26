/**
 * APEX v13 — Tests features/admin-backup
 *
 * Tests UI rendu (logique service auto-backup déjà testée séparément).
 * Couvre :
 *  - Guard admin (non-admin → message bloquant)
 *  - Render OK pour admin (header, stats, list)
 *  - Empty state si aucun backup
 *  - Boutons header présents (snapshot/export/import/cleanup)
 *  - Actions par ligne (view/restore/delete)
 *  - Modal view backup contenu non chiffré
 *  - Modal import textarea
 *  - Click snapshot → snapshot service appelé
 *  - Click delete → suppression
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { store } from '../../core/store.js';
import { _resetState, render } from '../../features/admin-backup/index.js';
import { autoBackup } from '../../services/storage/auto-backup.js';

function makeRoot(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function setAdmin(on: boolean): void {
  try {
    store.init({});
  } catch {
    /* déjà init */
  }
  store.set('isAdmin', on);
}

describe('features/admin-backup', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    autoBackup._resetForTests();
    _resetState();
  });

  describe('Guard admin', () => {
    it('non-admin → message "Accès réservé"', () => {
      setAdmin(false);
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('Accès réservé');
      expect(root.innerHTML).not.toContain('Backups Auto 24/7');
    });

    it('admin → render full', () => {
      setAdmin(true);
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('Backups Auto 24/7');
    });
  });

  describe('Header', () => {
    beforeEach(() => setAdmin(true));

    it('header contient les 4 boutons d\'action', () => {
      const root = makeRoot();
      render(root);
      expect(root.querySelector('[data-action="snapshot-now"]')).toBeTruthy();
      expect(root.querySelector('[data-action="export-config"]')).toBeTruthy();
      expect(root.querySelector('[data-action="import-config"]')).toBeTruthy();
      expect(root.querySelector('[data-action="cleanup-now"]')).toBeTruthy();
    });

    it('titre présent', () => {
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('💾 Backups Auto 24/7');
    });
  });

  describe('Stats', () => {
    beforeEach(() => setAdmin(true));

    it('affiche 0 backups initialement', () => {
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('Backups');
      expect(root.innerHTML).toContain('Jamais');
    });

    it('affiche stats après snapshot', async () => {
      await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      /* Le nombre de backups affiché doit être >= 1 */
      const matches = root.innerHTML.match(/<div style="color:#c9a227;font-size:24px;font-weight:700">(\d+)<\/div>/);
      expect(matches).toBeTruthy();
      expect(parseInt(matches![1]!, 10)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Empty state', () => {
    beforeEach(() => setAdmin(true));

    it('empty state si aucun backup', () => {
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('Aucun backup');
    });

    it('empty state mentionne snapshot manuel + 3h UTC quotidien', () => {
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('Snapshot maintenant');
      expect(root.innerHTML).toContain('3h UTC');
    });
  });

  describe('Backup list', () => {
    beforeEach(() => setAdmin(true));

    it('table rendu si backups existent', async () => {
      await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      const table = root.querySelector('table');
      expect(table).toBeTruthy();
      const rows = root.querySelectorAll('tr[data-backup-id]');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('chaque ligne a boutons view/restore/delete', async () => {
      await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      expect(root.querySelector('[data-view]')).toBeTruthy();
      expect(root.querySelector('[data-restore]')).toBeTruthy();
      expect(root.querySelector('[data-delete]')).toBeTruthy();
    });

    it('badge de type affiché par ligne (manual/daily/weekly)', async () => {
      await autoBackup.snapshot('weekly');
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('🌐 Hebdo');
    });
  });

  describe('Click handlers', () => {
    beforeEach(() => setAdmin(true));

    it('click snapshot-now → autoBackup.snapshot appelé', async () => {
      const root = makeRoot();
      render(root);
      const snapshotSpy = vi.spyOn(autoBackup, 'snapshot');
      const btn = root.querySelector<HTMLButtonElement>('[data-action="snapshot-now"]');
      btn?.click();
      /* Wait async */
      await new Promise((r) => setTimeout(r, 50));
      expect(snapshotSpy).toHaveBeenCalled();
      snapshotSpy.mockRestore();
    });

    it('click cleanup-now → autoBackup.cleanup appelé', async () => {
      const root = makeRoot();
      render(root);
      const cleanupSpy = vi.spyOn(autoBackup, 'cleanup');
      const btn = root.querySelector<HTMLButtonElement>('[data-action="cleanup-now"]');
      btn?.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(cleanupSpy).toHaveBeenCalled();
      cleanupSpy.mockRestore();
    });

    it('click delete → confirm + autoBackup.delete', async () => {
      await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deleteSpy = vi.spyOn(autoBackup, 'delete');
      const btn = root.querySelector<HTMLButtonElement>('[data-delete]');
      btn?.click();
      expect(confirmSpy).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalled();
      confirmSpy.mockRestore();
      deleteSpy.mockRestore();
    });

    it('click delete annulé si confirm=false', async () => {
      await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const deleteSpy = vi.spyOn(autoBackup, 'delete');
      const btn = root.querySelector<HTMLButtonElement>('[data-delete]');
      btn?.click();
      expect(confirmSpy).toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
      deleteSpy.mockRestore();
    });

    it('click restore → confirm + autoBackup.restore', async () => {
      const b = await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const restoreSpy = vi.spyOn(autoBackup, 'restore');
      const btn = root.querySelector<HTMLButtonElement>(`[data-restore="${b.id}"]`);
      btn?.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(confirmSpy).toHaveBeenCalled();
      expect(restoreSpy).toHaveBeenCalledWith(b.id);
      confirmSpy.mockRestore();
      restoreSpy.mockRestore();
    });
  });

  describe('Modals', () => {
    beforeEach(() => setAdmin(true));

    it('click view → modal s\'ouvre avec contenu', async () => {
      const b = await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>(`[data-view="${b.id}"]`);
      btn?.click();
      const modal = document.getElementById('ax-backup-modal');
      expect(modal).toBeTruthy();
      expect(modal!.innerHTML).toContain(b.id);
      expect(modal!.innerHTML).toContain('Hash SHA-256');
    });

    it('click import-config → modal import s\'ouvre avec textarea', () => {
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('[data-action="import-config"]');
      btn?.click();
      const modal = document.getElementById('ax-backup-modal');
      expect(modal).toBeTruthy();
      expect(modal!.querySelector('#ax-backup-import-data')).toBeTruthy();
      expect(modal!.innerHTML).toContain('Importer');
    });

    it('modal close button retire le modal du DOM', async () => {
      const b = await autoBackup.snapshot('manual');
      const root = makeRoot();
      render(root);
      const viewBtn = root.querySelector<HTMLButtonElement>(`[data-view="${b.id}"]`);
      viewBtn?.click();
      const modal = document.getElementById('ax-backup-modal');
      expect(modal).toBeTruthy();
      const closeBtn = modal!.querySelector<HTMLButtonElement>('[data-action="modal-close"]');
      closeBtn?.click();
      expect(document.getElementById('ax-backup-modal')).toBeNull();
    });

    it('modal click backdrop → close', () => {
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('[data-action="import-config"]');
      btn?.click();
      const modal = document.getElementById('ax-backup-modal');
      expect(modal).toBeTruthy();
      /* Click directement sur le backdrop (modal lui-même) */
      modal!.click();
      expect(document.getElementById('ax-backup-modal')).toBeNull();
    });

    it('import-confirm avec textarea vide → toast warn (pas d\'import)', () => {
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('[data-action="import-config"]');
      btn?.click();
      const importSpy = vi.spyOn(autoBackup, 'import');
      const modal = document.getElementById('ax-backup-modal');
      const confirmBtn = modal!.querySelector<HTMLButtonElement>('[data-action="import-confirm"]');
      confirmBtn?.click();
      expect(importSpy).not.toHaveBeenCalled();
      importSpy.mockRestore();
    });
  });

  describe('Anti-XSS', () => {
    beforeEach(() => setAdmin(true));

    it('id backup avec caractères spéciaux n\'injecte pas de balise script exécutable', async () => {
      /* Inject backup avec id malveillant directement */
      const evil = 'ax_backup_<script>alert(1)</script>';
      const fakeBackup = {
        id: evil,
        ts: Date.now(),
        type: 'manual' as const,
        size_bytes: 100,
        encrypted: true,
        data: {
          vault: {},
          settings: {},
          persistent_memory: [],
          audit_log: [],
          feature_toggles: {},
          user_profile: {},
          voice_prints: {},
        },
        hash: 'h',
      };
      localStorage.setItem('apex_v13_backup_' + evil, JSON.stringify(fakeBackup));
      localStorage.setItem('apex_v13_backup_index', JSON.stringify([evil]));
      autoBackup._resetForTests();
      const root = makeRoot();
      render(root);
      /* Vérifie qu'aucun élément <script> n'a été créé dans le DOM (XSS protection effective) */
      const scripts = root.querySelectorAll('script');
      expect(scripts.length).toBe(0);
      /* Vérifie aussi que les data-attributes contiennent bien la valeur (pas d'évasion) */
      const tr = root.querySelector('tr[data-backup-id]');
      expect(tr).toBeTruthy();
      /* L'ID brut peut être dans l'attribut (HTML5 le permet), mais aucun élément script créé */
    });
  });
});
