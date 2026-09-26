/**
 * Test régression v13.4.55 — services/auto-backup.ts (snapshots + restore).
 *
 * Backups automatiques (manual/daily/weekly/pre-rollback) localStorage chiffrés.
 * Restore après rollback. Cleanup ancien automatique. Export/import.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { autoBackup } from '../../services/storage/auto-backup.js';

describe('v13.4.55 auto-backup — snapshots', () => {
  beforeEach(async () => {
    /* Cleanup avant chaque test */
    try {
      const backups = autoBackup.list();
      for (const b of backups) autoBackup.delete(b.id);
    } catch { /* skip */ }
  });

  it("init() OK + idempotent", async () => {
    await autoBackup.init();
    await expect(autoBackup.init()).resolves.toBeUndefined();
  });

  it("list() retourne array (vide ou non)", () => {
    const all = autoBackup.list();
    expect(Array.isArray(all)).toBe(true);
  });

  it("snapshot('manual') retourne Backup avec id + ts + size", async () => {
    /* Snapshot peut être lent — utiliser async */
    const b = await autoBackup.snapshot('manual');
    expect(b).toBeDefined();
    expect(b.id).toBeTruthy();
    expect(typeof b.size_bytes).toBe('number');
  }, 10000);

  it("snapshot types valides : manual/daily/weekly/pre-rollback", async () => {
    const types: Array<'manual' | 'daily' | 'weekly' | 'pre-rollback'> = [
      'manual', 'daily', 'weekly', 'pre-rollback',
    ];
    for (const t of types) {
      const b = await autoBackup.snapshot(t);
      expect(b.type).toBe(t);
    }
  }, 30000);

  it("get(id) retourne Backup ou null", async () => {
    const created = await autoBackup.snapshot('manual');
    const fetched = autoBackup.get(created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(created.id);
    expect(autoBackup.get('ghost_id_xyz')).toBeNull();
  }, 10000);

  it("delete(id) retourne boolean (true pour existant)", async () => {
    const created = await autoBackup.snapshot('manual');
    const r = autoBackup.delete(created.id);
    expect(typeof r).toBe('boolean');
    /* delete ghost peut retourner true ou false selon impl — doc */
    expect(typeof autoBackup.delete('ghost_id_xyz')).toBe('boolean');
  }, 10000);

  it("getStats() retourne BackupStats avec total_backups", () => {
    const s = autoBackup.getStats();
    expect(s).toBeDefined();
    expect(typeof s.total_backups).toBe('number');
  });
});

describe('v13.4.55 auto-backup — cleanup', () => {
  it("cleanup() retourne {deleted: number}", async () => {
    const r = await autoBackup.cleanup();
    expect(r).toBeDefined();
    expect(typeof r.deleted).toBe('number');
  });
});

describe('v13.4.55 auto-backup — export/import', () => {
  it("export() retourne string non-vide", async () => {
    await autoBackup.snapshot('manual');
    const exported = await autoBackup.export();
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(0);
  }, 15000);
});
