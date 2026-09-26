/**
 * Tests restore-helper v13.4.144 (Kevin "100/100 réel").
 *
 * Module : services/restore-helper.ts (204 stmts, était 43.6% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockRealtimeBackup, mockAuditLog } = vi.hoisted(() => ({
  mockRealtimeBackup: {
    listSnapshots: vi.fn(),
    getSnapshot: vi.fn(),
    snapshotNow: vi.fn(),
  },
  mockAuditLog: { record: vi.fn() },
}));

vi.mock('../../services/storage/realtime-backup.js', () => ({ realtimeBackup: mockRealtimeBackup }));
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));

import { restoreHelper } from '../../services/storage/restore-helper.js';

const fakeSnap = (id: string, kind: string, data: unknown): {
  id: string; kind: string; ts: number; data: unknown; size_bytes: number; hash?: string;
} => ({
  id,
  kind,
  ts: Date.now() - 3600_000,
  data,
  size_bytes: 1000,
  hash: 'h_' + id,
});

describe('restore-helper (v13.4.144 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLog.record.mockResolvedValue(undefined);
    mockRealtimeBackup.snapshotNow.mockResolvedValue({ id: 'pre_rollback_x' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listSnapshots', () => {
    it('retourne summary pour chaque snapshot', async () => {
      mockRealtimeBackup.listSnapshots.mockResolvedValue([
        fakeSnap('s1', 'memory', [{ id: 'm1' }, { id: 'm2' }]),
        fakeSnap('s2', 'chat', [{ id: 'c1' }]),
      ]);
      const list = await restoreHelper.listSnapshots();
      expect(list.length).toBe(2);
      expect(list[0]?.entry_count).toBe(2);
      expect(list[1]?.kind).toBe('chat');
    });

    it('filtre par kind', async () => {
      mockRealtimeBackup.listSnapshots.mockResolvedValue([
        fakeSnap('s1', 'memory', [{ id: 'a' }]),
        fakeSnap('s2', 'chat', [{ id: 'b' }]),
      ]);
      const list = await restoreHelper.listSnapshots({ kind: 'memory' });
      expect(list.length).toBe(1);
      expect(list[0]?.kind).toBe('memory');
    });

    it('size_kb arrondi correct', async () => {
      mockRealtimeBackup.listSnapshots.mockResolvedValue([
        { ...fakeSnap('s1', 'memory', [{ id: 'a' }]), size_bytes: 2048 },
      ]);
      const list = await restoreHelper.listSnapshots();
      expect(list[0]?.size_kb).toBe(2);
    });
  });

  describe('diff', () => {
    it('retourne ok=false si un snapshot introuvable', async () => {
      mockRealtimeBackup.getSnapshot.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const d = await restoreHelper.diff('a', 'b');
      expect(d.ok).toBe(false);
    });

    it('retourne ok=false si kinds différents', async () => {
      mockRealtimeBackup.getSnapshot
        .mockResolvedValueOnce(fakeSnap('s1', 'memory', [{ id: 'a' }]))
        .mockResolvedValueOnce(fakeSnap('s2', 'chat', [{ id: 'b' }]));
      const d = await restoreHelper.diff('s1', 's2');
      expect(d.ok).toBe(false);
    });

    it('détecte added/removed/modified', async () => {
      mockRealtimeBackup.getSnapshot
        .mockResolvedValueOnce(fakeSnap('a', 'memory', [
          { id: 'x', text: 'A' },
          { id: 'y', text: 'B' },
        ]))
        .mockResolvedValueOnce(fakeSnap('b', 'memory', [
          { id: 'x', text: 'A' }, /* same */
          { id: 'y', text: 'B-modified' }, /* modified */
          { id: 'z', text: 'C' }, /* added */
        ]));
      const d = await restoreHelper.diff('a', 'b');
      expect(d.ok).toBe(true);
      expect(d.added).toBe(1);
      expect(d.modified).toBe(1);
      expect(d.removed).toBe(0);
    });

    it('détecte removed', async () => {
      mockRealtimeBackup.getSnapshot
        .mockResolvedValueOnce(fakeSnap('a', 'memory', [
          { id: 'x' }, { id: 'y' }, { id: 'z' },
        ]))
        .mockResolvedValueOnce(fakeSnap('b', 'memory', [
          { id: 'x' },
        ]));
      const d = await restoreHelper.diff('a', 'b');
      expect(d.removed).toBe(2);
    });

    it('preview_added limité à 5', async () => {
      const manyAdded = Array.from({ length: 20 }, (_, i) => ({ id: `n_${i}` }));
      mockRealtimeBackup.getSnapshot
        .mockResolvedValueOnce(fakeSnap('a', 'memory', []))
        .mockResolvedValueOnce(fakeSnap('b', 'memory', manyAdded));
      const d = await restoreHelper.diff('a', 'b');
      expect(d.preview_added.length).toBe(5);
    });
  });

  describe('restore', () => {
    it('retourne erreur si snapshot introuvable', async () => {
      mockRealtimeBackup.getSnapshot.mockResolvedValue(null);
      const r = await restoreHelper.restore('unknown');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('snapshot_not_found');
    });

    it('refuse kind unknown', async () => {
      mockRealtimeBackup.getSnapshot.mockResolvedValue(
        fakeSnap('s1', 'unknown_kind', []),
      );
      const r = await restoreHelper.restore('s1', { skipPreRollback: true });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('unknown_kind');
    });

    it('restore memory kind avec pre-rollback', async () => {
      mockRealtimeBackup.getSnapshot.mockResolvedValue(
        fakeSnap('s_mem', 'memory', [{ id: 'm1' }, { id: 'm2' }]),
      );
      const r = await restoreHelper.restore('s_mem');
      expect(r.ok).toBe(true);
      expect(r.restored_count).toBe(2);
      expect(r.pre_rollback_id).toBe('pre_rollback_x');
    });

    it('restore avec skipPreRollback', async () => {
      mockRealtimeBackup.getSnapshot.mockResolvedValue(
        fakeSnap('s_chat', 'chat', [{ id: 'msg1' }]),
      );
      const r = await restoreHelper.restore('s_chat', { skipPreRollback: true });
      expect(r.ok).toBe(true);
      expect(r.pre_rollback_id).toBeUndefined();
    });

    it('erreur si data memory pas array', async () => {
      mockRealtimeBackup.getSnapshot.mockResolvedValue(
        fakeSnap('s_bad', 'memory', { not: 'array' }),
      );
      const r = await restoreHelper.restore('s_bad', { skipPreRollback: true });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('array');
    });

    it('audit.record appelé après restore', async () => {
      mockRealtimeBackup.getSnapshot.mockResolvedValue(
        fakeSnap('s', 'memory', [{ id: 'x' }]),
      );
      await restoreHelper.restore('s', { skipPreRollback: true });
      expect(mockAuditLog.record).toHaveBeenCalledWith('realtime_restore', expect.any(Object));
    });
  });
});
