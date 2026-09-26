/**
 * APEX v13 — realtime-backup tests (Kevin 2026-05-08).
 *
 * Couvre :
 *  - snapshotNow() prend bien la snapshot (memory + chat)
 *  - Rotation FIFO max 12 par kind (cleanup automatique)
 *  - restore() restaure les data + crée pre-rollback
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/auth/feature-toggles.js', () => ({
  featureToggles: {
    isEnabledGlobal: vi.fn((id: string) => {
      if (id === 'feature.realtime-backup') return true;
      return true;
    }),
  },
}));

vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: {
    record: vi.fn(async () => undefined),
  },
}));

describe('RealtimeBackup — snapshots IDB', () => {
  beforeEach(async () => {
    /* Reset IDB via fake-indexeddb */
    vi.resetModules();
    /* Clear IDB databases entre tests */
    const dbs = await indexedDB.databases?.().catch(() => []) ?? [];
    for (const db of dbs) {
      if (db.name) {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(db.name as string);
          req.onsuccess = (): void => resolve();
          req.onerror = (): void => resolve();
          req.onblocked = (): void => resolve();
        });
      }
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('snapshotNow("memory") crée 1 snapshot avec data array', async () => {
    const { realtimeBackup } = await import('../../services/storage/realtime-backup.js');
    realtimeBackup.setMemoryGetter(async () => [
      { id: 'm1', text: 'fact 1', importance: 80, category: 'facts', scope: 'kevin' },
      { id: 'm2', text: 'fact 2', importance: 50, category: 'facts', scope: 'kevin' },
    ]);
    realtimeBackup.setChatGetter(async () => []);
    const snap = await realtimeBackup.snapshotNow('memory');
    expect(snap).not.toBeNull();
    expect(snap?.kind).toBe('memory');
    expect(Array.isArray(snap?.data)).toBe(true);
    expect((snap?.data as unknown[]).length).toBe(2);
    expect(snap?.size_bytes).toBeGreaterThan(0);
  });

  it('rotation FIFO : > 12 snapshots → cleanup garde 12 max par kind', async () => {
    const { realtimeBackup } = await import('../../services/storage/realtime-backup.js');
    let counter = 0;
    realtimeBackup.setMemoryGetter(async () => {
      counter += 1;
      return [{ id: `m${counter}`, text: `fact ${counter}`, importance: 50, category: 'facts', scope: 'kevin' }];
    });
    realtimeBackup.setChatGetter(async () => []);
    /* Crée 15 snapshots memory en série */
    for (let i = 0; i < 15; i++) {
      await realtimeBackup.snapshotNow('memory');
      /* petit delay timestamp pour éviter collision id */
      await new Promise((r) => setTimeout(r, 1));
    }
    /* Force cleanup */
    await realtimeBackup.cleanup();
    const stats = await realtimeBackup.getStats();
    expect(stats.memory_snapshots).toBeLessThanOrEqual(12);
    expect(stats.memory_snapshots).toBeGreaterThanOrEqual(10);
  });

  it('restore() depuis snapshot → restaure data + crée pre-rollback', async () => {
    const { realtimeBackup } = await import('../../services/storage/realtime-backup.js');
    const { restoreHelper } = await import('../../services/storage/restore-helper.js');

    const snap1Data = [
      { id: 'a', text: 'fact A', importance: 70, category: 'facts', scope: 'kevin' },
    ];
    const snap2Data = [
      { id: 'a', text: 'fact A', importance: 70, category: 'facts', scope: 'kevin' },
      { id: 'b', text: 'fact B', importance: 60, category: 'facts', scope: 'kevin' },
    ];

    let memoryState = snap1Data;
    realtimeBackup.setMemoryGetter(async () => memoryState);
    realtimeBackup.setChatGetter(async () => []);

    /* Snapshot 1 */
    const s1 = await realtimeBackup.snapshotNow('memory');
    expect(s1).not.toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    /* Évolue, snapshot 2 */
    memoryState = snap2Data;
    const s2 = await realtimeBackup.snapshotNow('memory');
    expect(s2).not.toBeNull();

    /* Restore vers snap1 */
    const r = await restoreHelper.restore(s1!.id);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('memory');
    expect(r.restored_count).toBe(1);
    expect(r.pre_rollback_id).toBeDefined();
    /* Vérifier que localStorage contient maintenant snap1 */
    const restored = JSON.parse(localStorage.getItem('apex_v13_persistent_memory') ?? '[]');
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('a');
  });

  it('listSnapshots filtre par kind', async () => {
    const { realtimeBackup } = await import('../../services/storage/realtime-backup.js');
    const { restoreHelper } = await import('../../services/storage/restore-helper.js');
    realtimeBackup.setMemoryGetter(async () => [{ id: 'm', text: 'x', importance: 50, category: 'facts', scope: 'k' }]);
    realtimeBackup.setChatGetter(async () => [{ id: 'c', role: 'user', content: 'hello' }]);
    await realtimeBackup.snapshotNow('memory');
    await new Promise((r) => setTimeout(r, 5));
    await realtimeBackup.snapshotNow('chat');
    const memList = await restoreHelper.listSnapshots({ kind: 'memory' });
    const chatList = await restoreHelper.listSnapshots({ kind: 'chat' });
    expect(memList.length).toBeGreaterThanOrEqual(1);
    expect(chatList.length).toBeGreaterThanOrEqual(1);
    expect(memList.every((s) => s.kind === 'memory')).toBe(true);
    expect(chatList.every((s) => s.kind === 'chat')).toBe(true);
  });
});
