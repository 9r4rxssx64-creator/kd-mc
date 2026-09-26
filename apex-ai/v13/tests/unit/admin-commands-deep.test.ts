/**
 * Tests admin-commands deep v13.4.148 (Kevin "100/100 réel").
 *
 * Module : services/admin-commands.ts (139 stmts, était 55.4%).
 * Focus : resetUserPin + setupAccount edge cases + branches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockStore, mockFirebase, mockAuditLog } = vi.hoisted(() => ({
  mockStore: { get: vi.fn() },
  mockFirebase: { write: vi.fn() },
  mockAuditLog: { record: vi.fn() },
}));

vi.mock('../../core/store.js', () => ({ store: mockStore }));
vi.mock('../../services/storage/firebase.js', () => ({ firebase: mockFirebase }));
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));

import { adminCommands } from '../../services/admin/admin-commands.js';

describe('admin-commands deep (v13.4.148)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockStore.get.mockReturnValue({ id: 'kdmc_admin' });
    mockFirebase.write.mockResolvedValue(undefined);
    mockAuditLog.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('resetUserPin', () => {
    it('refuse si non-admin', async () => {
      mockStore.get.mockReturnValue({ id: 'other_user' });
      const r = await adminCommands.resetUserPin('laurence_sp');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Admin tier');
    });

    it('refuse si user null', async () => {
      mockStore.get.mockReturnValue(null);
      const r = await adminCommands.resetUserPin('laurence_sp');
      expect(r.ok).toBe(false);
    });

    it('refuse target_uid vide', async () => {
      const r = await adminCommands.resetUserPin('');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('target_uid');
    });

    it('refuse reset admin Kevin', async () => {
      const r = await adminCommands.resetUserPin('kdmc_admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('admin Kevin');
    });

    it('refuse target inconnu (hors whitelist)', async () => {
      const r = await adminCommands.resetUserPin('unknown_user_xyz');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('inconnu');
    });

    it('push command valide pour user whitelisted', async () => {
      const r = await adminCommands.resetUserPin('laurence_sp', 'Kevin demande reset');
      expect(r.ok).toBe(true);
      expect(r.command_id).toMatch(/^cmd_/);
      expect(mockFirebase.write).toHaveBeenCalled();
      expect(mockAuditLog.record).toHaveBeenCalled();
    });

    it('cap reason à 200 chars', async () => {
      const longReason = 'r'.repeat(500);
      const r = await adminCommands.resetUserPin('laurence_sp', longReason);
      expect(r.ok).toBe(true);
      const pending = adminCommands.listPending();
      const lastCmd = pending[pending.length - 1];
      expect(lastCmd?.reason?.length).toBe(200);
    });

    it('gère firebase.write fail', async () => {
      mockFirebase.write.mockRejectedValue(new Error('fb error'));
      const r = await adminCommands.resetUserPin('laurence_sp');
      /* Doit quand même retourner OK (audit + local OK) */
      expect(r.ok).toBe(true);
    });
  });

  describe('setupAccount', () => {
    it('refuse si non-admin', async () => {
      mockStore.get.mockReturnValue({ id: 'other' });
      const r = await adminCommands.setupAccount({
        targetUid: 'laurence_sp',
        pinHash: 'a'.repeat(64),
      });
      expect(r.ok).toBe(false);
    });

    it('refuse target_uid vide', async () => {
      const r = await adminCommands.setupAccount({
        targetUid: '',
        pinHash: 'a'.repeat(64),
      });
      expect(r.ok).toBe(false);
    });

    it('refuse setup admin Kevin', async () => {
      const r = await adminCommands.setupAccount({
        targetUid: 'kdmc_admin',
        pinHash: 'a'.repeat(64),
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('admin Kevin');
    });

    it('refuse pin_hash trop court', async () => {
      const r = await adminCommands.setupAccount({
        targetUid: 'laurence_sp',
        pinHash: 'short',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('pin_hash invalide');
    });

    it('refuse target inconnu', async () => {
      const r = await adminCommands.setupAccount({
        targetUid: 'unknown',
        pinHash: 'a'.repeat(64),
      });
      expect(r.ok).toBe(false);
    });

    it('push setup_account command valide', async () => {
      const r = await adminCommands.setupAccount({
        targetUid: 'laurence_sp',
        pinHash: 'a'.repeat(64),
        displayName: 'Laurence',
      });
      expect(r.ok).toBe(true);
      expect(mockFirebase.write).toHaveBeenCalled();
      expect(mockAuditLog.record).toHaveBeenCalled();
    });

    it('cap displayName à 100 chars', async () => {
      const r = await adminCommands.setupAccount({
        targetUid: 'laurence_sp',
        pinHash: 'a'.repeat(64),
        displayName: 'X'.repeat(500),
      });
      expect(r.ok).toBe(true);
      const pending = adminCommands.listPending();
      const lastCmd = pending[pending.length - 1] as { display_name?: string };
      expect(lastCmd.display_name?.length).toBe(100);
    });
  });

  describe('listPending', () => {
    it('retourne [] si vide', () => {
      expect(adminCommands.listPending()).toEqual([]);
    });

    it('gère localStorage corrompu', () => {
      localStorage.setItem('ax_admin_commands_pending', '{invalid');
      expect(adminCommands.listPending()).toEqual([]);
    });

    it('cleanup processed > 24h auto via resetUserPin', async () => {
      const old: Array<Record<string, unknown>> = [
        { id: 'old_processed', processed: true, ts: Date.now() - 48 * 60 * 60 * 1000 },
        { id: 'recent_processed', processed: true, ts: Date.now() - 1000 },
      ];
      localStorage.setItem('ax_admin_commands_pending', JSON.stringify(old));
      await adminCommands.resetUserPin('laurence_sp');
      const pending = adminCommands.listPending();
      const ids = pending.map((c) => c.id);
      expect(ids).not.toContain('old_processed');
      expect(ids).toContain('recent_processed');
    });
  });
});
