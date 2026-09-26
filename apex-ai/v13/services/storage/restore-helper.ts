/**
 * APEX v13 — Restore Helper (compagnon de realtime-backup.ts).
 *
 * Permet à l'admin de :
 * 1. Lister les snapshots disponibles avec timestamps + sizes
 * 2. Diff entre 2 snapshots (preview avant restore)
 * 3. Restore depuis un snapshot N (avec confirm modal)
 *
 * Sécurité :
 * - Restore IRREVERSIBLE → modal confirm obligatoire (UI admin)
 * - Backup pre-rollback automatique avant restore (snapshot manuel)
 * - Audit log de chaque restore
 *
 * Note : ne restaure que persistent_memory et chat. Pour vault/credentials,
 * utiliser auto-backup.ts (snapshot daily/weekly chiffré).
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { realtimeBackup, type RealtimeSnapshot, type RealtimeSnapshotKind } from './realtime-backup.js';

/* ============================================================
   Types publics
   ============================================================ */

export interface SnapshotSummary {
  id: string;
  kind: RealtimeSnapshotKind;
  ts: number;
  age_h: number;
  size_kb: number;
  size_bytes: number;
  hash?: string;
  entry_count: number; /* nombre d'entries dans data si array */
}

export interface SnapshotDiff {
  ok: boolean;
  added: number;
  removed: number;
  modified: number;
  total_a: number;
  total_b: number;
  preview_added: string[]; /* sample 5 ids ajoutés */
  preview_removed: string[]; /* sample 5 ids supprimés */
}

export interface RestoreResult {
  ok: boolean;
  kind: RealtimeSnapshotKind;
  restored_count: number;
  pre_rollback_id?: string;
  error?: string;
}

/* ============================================================
   Helpers
   ============================================================ */

function entryCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') return Object.keys(data as Record<string, unknown>).length;
  return 0;
}

function summarize(snap: RealtimeSnapshot): SnapshotSummary {
  return {
    id: snap.id,
    kind: snap.kind,
    ts: snap.ts,
    age_h: Math.round((Date.now() - snap.ts) / 3_600_000 * 10) / 10,
    size_kb: Math.round(snap.size_bytes / 102.4) / 10,
    size_bytes: snap.size_bytes,
    ...(snap.hash ? { hash: snap.hash } : {}),
    entry_count: entryCount(snap.data),
  };
}

function extractIds(data: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(data)) return out;
  for (const e of data) {
    if (e && typeof e === 'object' && 'id' in (e as Record<string, unknown>)) {
      const id = (e as Record<string, unknown>)['id'];
      if (typeof id === 'string') out.add(id);
    }
  }
  return out;
}

function extractMap(data: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!Array.isArray(data)) return out;
  for (const e of data) {
    if (e && typeof e === 'object' && 'id' in (e as Record<string, unknown>)) {
      const id = (e as Record<string, unknown>)['id'];
      if (typeof id === 'string') out.set(id, e);
    }
  }
  return out;
}

/* ============================================================
   RestoreHelper class
   ============================================================ */

class RestoreHelper {
  /**
   * Liste tous les snapshots avec summary (sans data brute).
   */
  async listSnapshots(filter?: { kind?: RealtimeSnapshotKind }): Promise<SnapshotSummary[]> {
    const all = await realtimeBackup.listSnapshots();
    const filtered = filter?.kind ? all.filter((s) => s.kind === filter.kind) : all;
    return filtered.map(summarize);
  }

  /**
   * Diff entre 2 snapshots du MÊME kind.
   */
  async diff(idA: string, idB: string): Promise<SnapshotDiff> {
    const a = await realtimeBackup.getSnapshot(idA);
    const b = await realtimeBackup.getSnapshot(idB);
    if (!a || !b) {
      return {
        ok: false,
        added: 0,
        removed: 0,
        modified: 0,
        total_a: 0,
        total_b: 0,
        preview_added: [],
        preview_removed: [],
      };
    }
    if (a.kind !== b.kind) {
      logger.warn('restore-helper', 'diff sur kinds différents', { a: a.kind, b: b.kind });
      return {
        ok: false,
        added: 0,
        removed: 0,
        modified: 0,
        total_a: entryCount(a.data),
        total_b: entryCount(b.data),
        preview_added: [],
        preview_removed: [],
      };
    }
    const idsA = extractIds(a.data);
    const idsB = extractIds(b.data);
    const mapA = extractMap(a.data);
    const mapB = extractMap(b.data);
    const added: string[] = [];
    const removed: string[] = [];
    let modified = 0;
    for (const id of idsB) {
      if (!idsA.has(id)) added.push(id);
      else {
        /* check modification (sérialisé) */
        if (JSON.stringify(mapA.get(id)) !== JSON.stringify(mapB.get(id))) {
          modified += 1;
        }
      }
    }
    for (const id of idsA) {
      if (!idsB.has(id)) removed.push(id);
    }
    return {
      ok: true,
      added: added.length,
      removed: removed.length,
      modified,
      total_a: idsA.size,
      total_b: idsB.size,
      preview_added: added.slice(0, 5),
      preview_removed: removed.slice(0, 5),
    };
  }

  /**
   * Restore depuis un snapshot.
   * Crée un snapshot pre-rollback automatique avant le restore (sécurité).
   */
  async restore(snapshotId: string, opts?: { skipPreRollback?: boolean }): Promise<RestoreResult> {
    const snap = await realtimeBackup.getSnapshot(snapshotId);
    if (!snap) {
      return { ok: false, kind: 'memory', restored_count: 0, error: 'snapshot_not_found' };
    }
    /* Snapshot pre-rollback (sauf si test ou opt-out) */
    let preRollbackId: string | undefined;
    if (!opts?.skipPreRollback) {
      try {
        const pre = await realtimeBackup.snapshotNow(snap.kind);
        preRollbackId = pre?.id;
      } catch {
        /* skip */
      }
    }
    /* Apply */
    try {
      if (snap.kind === 'memory') {
        await this.restoreMemory(snap.data);
      } else if (snap.kind === 'chat') {
        await this.restoreChat(snap.data);
      } else {
        return { ok: false, kind: snap.kind, restored_count: 0, error: 'unknown_kind' };
      }
      const count = entryCount(snap.data);
      try {
        await auditLog.record('realtime_restore', {
          details: { snapshotId, kind: snap.kind, count, preRollbackId: preRollbackId ?? null },
        });
      } catch {
        /* skip */
      }
      logger.info('restore-helper', `Restored ${count} entries (kind=${snap.kind})`);
      return {
        ok: true,
        kind: snap.kind,
        restored_count: count,
        ...(preRollbackId ? { pre_rollback_id: preRollbackId } : {}),
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('restore-helper', 'restore failed', { error });
      return { ok: false, kind: snap.kind, restored_count: 0, error };
    }
  }

  /* ============================================================
     Private : restore par kind
     ============================================================ */

  private async restoreMemory(data: unknown): Promise<void> {
    if (!Array.isArray(data)) throw new Error('memory snapshot data must be an array');
    /* Persiste directement dans localStorage + IDB shadow */
    try {
      localStorage.setItem('apex_v13_persistent_memory', JSON.stringify(data));
    } catch (err: unknown) {
      logger.warn('restore-helper', 'localStorage write failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    /* IDB shadow */
    try {
      const req = indexedDB.open('apex_v13_memory', 1);
      await new Promise<void>((resolve, reject) => {
        req.onupgradeneeded = (): void => {
          const db = req.result;
          if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries');
        };
        req.onsuccess = (): void => {
          const db = req.result;
          try {
            const tx = db.transaction('entries', 'readwrite');
            tx.objectStore('entries').put(data, 'all');
            tx.oncomplete = (): void => {
              db.close();
              resolve();
            };
            tx.onerror = (): void => {
              db.close();
              reject(tx.error ?? new Error('IDB write error'));
            };
          } catch (e) {
            db.close();
            reject(e);
          }
        };
        req.onerror = (): void => reject(req.error ?? new Error('IDB open error'));
      });
    } catch (err: unknown) {
      logger.warn('restore-helper', 'IDB shadow write failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    /* Invalide cache persistentMemory pour relire au prochain list() */
    try {
      const { persistentMemory } = await import('./persistent-memory-store.js');
      /* Reset cache via interne (cast safe) */
      (persistentMemory as unknown as { cache: unknown }).cache = null;
    } catch {
      /* skip */
    }
  }

  private async restoreChat(data: unknown): Promise<void> {
    if (!Array.isArray(data)) throw new Error('chat snapshot data must be an array');
    try {
      const { store } = await import('../../core/store.js');
      store.set('messages', data);
    } catch (err: unknown) {
      throw new Error('chat restore failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}

export const restoreHelper = new RestoreHelper();
