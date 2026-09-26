/**
 * APEX v13 — Realtime Backup (Kevin règle "Rien perdre + sauvegarde temps réel", 2026-05-08).
 *
 * Au-delà du daily snapshot 3h UTC (auto-backup.ts), ce service prend des snapshots
 * temps-réel rotatifs en IndexedDB :
 * - persistent_memory_<uid> : 5 min debounced
 * - K.messages (chat) : 2 min debounced
 *
 * Stockage : IndexedDB (apex_v13_realtime_backup) — pas localStorage qui sature à 5MB.
 * Rotation : 12 dernières snapshots FIFO (mémoire + chat = 24 entries max).
 *
 * Sentinelle `realtime-backup-watch` (5 min) :
 * - Vérifie qu'au moins 1 snapshot < 10 min
 * - Si non → trigger snapshot immédiat
 * - Si IDB indispo → status warn (fallback localStorage minimal)
 *
 * Toggle `feature.realtime-backup` (default ON).
 *
 * Restore via restore-helper.ts (UI admin).
 */

import { logger } from '../../core/logger.js';
import { featureToggles } from '../auth/feature-toggles.js';

/* ============================================================
   Types publics
   ============================================================ */

export type RealtimeSnapshotKind = 'memory' | 'chat';

export interface RealtimeSnapshot {
  id: string; /* `rt_<kind>_<ts>_<rnd>` */
  kind: RealtimeSnapshotKind;
  ts: number;
  size_bytes: number;
  data: unknown;
  hash?: string; /* SHA-256 short pour intégrité */
}

export interface RealtimeBackupStats {
  total_snapshots: number;
  memory_snapshots: number;
  chat_snapshots: number;
  last_memory_ts: number;
  last_chat_ts: number;
  total_size_bytes: number;
  idb_available: boolean;
}

/* ============================================================
   Constants
   ============================================================ */

const IDB_NAME = 'apex_v13_realtime_backup';
const IDB_STORE = 'snapshots';
const IDB_VERSION = 1;
const MAX_PER_KIND = 12; /* Rolling FIFO — 12 snapshots max par kind */
const DEBOUNCE_MEMORY_MS = 5 * 60 * 1000; /* 5 min */
const DEBOUNCE_CHAT_MS = 2 * 60 * 1000; /* 2 min */
const FEATURE_ID = 'feature.realtime-backup';

/* ============================================================
   Helpers
   ============================================================ */

async function sha256Short(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

function genId(kind: RealtimeSnapshotKind, ts: number): string {
  const rnd = Math.random().toString(36).slice(2, 6);
  return `rt_${kind}_${ts}_${rnd}`;
}

function isIdbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && Boolean(indexedDB);
  } catch {
    return false;
  }
}

/* ============================================================
   IndexedDB low-level (promise wrappers)
   ============================================================ */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIdbAvailable()) return reject(new Error('IDB unavailable'));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('kind_ts', ['kind', 'ts']);
        store.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error('IDB open error'));
  });
}

function idbPut(db: IDBDatabase, snap: RealtimeSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(snap);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => reject(tx.error ?? new Error('IDB put error'));
    } catch (e) {
      reject(e);
    }
  });
}

function idbGetAllByKind(db: IDBDatabase, kind: RealtimeSnapshotKind): Promise<RealtimeSnapshot[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = (): void => {
        const all = (req.result as RealtimeSnapshot[]) ?? [];
        resolve(all.filter((s) => s.kind === kind).sort((a, b) => b.ts - a.ts));
      };
      req.onerror = (): void => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function idbGetAll(db: IDBDatabase): Promise<RealtimeSnapshot[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = (): void => resolve((req.result as RealtimeSnapshot[]) ?? []);
      req.onerror = (): void => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => resolve();
    } catch {
      resolve();
    }
  });
}

/* ============================================================
   RealtimeBackup class
   ============================================================ */

class RealtimeBackup {
  private memoryTimer: ReturnType<typeof setTimeout> | null = null;
  private chatTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private memoryGetter: (() => Promise<unknown> | unknown) | null = null;
  private chatGetter: (() => Promise<unknown> | unknown) | null = null;

  /**
   * Setter pour les data getters (injection de dépendance pour tests).
   * En prod : start() les configure automatiquement.
   */
  setMemoryGetter(fn: () => Promise<unknown> | unknown): void {
    this.memoryGetter = fn;
  }

  setChatGetter(fn: () => Promise<unknown> | unknown): void {
    this.chatGetter = fn;
  }

  /**
   * Start scheduler — appelé au boot via services-bootstrap.ts.
   * Idempotent.
   */
  start(): void {
    if (this.started) return;
    if (!featureToggles.isEnabledGlobal(FEATURE_ID)) {
      logger.info('realtime-backup', 'feature disabled — skip start');
      return;
    }
    if (!isIdbAvailable()) {
      logger.warn('realtime-backup', 'IDB unavailable — disabled');
      return;
    }
    /* Default getters : memory via persistent-memory-store, chat via store */
    if (!this.memoryGetter) {
      this.memoryGetter = async (): Promise<unknown> => {
        try {
          const { persistentMemory } = await import('./persistent-memory-store.js');
          return await persistentMemory.list();
        } catch {
          return [];
        }
      };
    }
    if (!this.chatGetter) {
      this.chatGetter = async (): Promise<unknown> => {
        try {
          const { store } = await import('../../core/store.js');
          const k = store.get('messages');
          return Array.isArray(k) ? k : [];
        } catch {
          return [];
        }
      };
    }
    this.started = true;
    this.scheduleMemorySnapshot();
    this.scheduleChatSnapshot();
    logger.info('realtime-backup', 'started — memory 5min / chat 2min');
  }

  stop(): void {
    if (this.memoryTimer) clearTimeout(this.memoryTimer);
    if (this.chatTimer) clearTimeout(this.chatTimer);
    this.memoryTimer = null;
    this.chatTimer = null;
    this.started = false;
  }

  /**
   * Force snapshot immédiat (utilisé par sentinelle si âge > seuil).
   */
  async snapshotNow(kind: RealtimeSnapshotKind): Promise<RealtimeSnapshot | null> {
    return this.takeSnapshot(kind);
  }

  /**
   * Liste tous les snapshots (admin UI / restore).
   */
  async listSnapshots(): Promise<RealtimeSnapshot[]> {
    if (!isIdbAvailable()) return [];
    try {
      const db = await openDb();
      const all = await idbGetAll(db);
      db.close();
      return all.sort((a, b) => b.ts - a.ts);
    } catch {
      return [];
    }
  }

  /**
   * Stats pour vue admin.
   */
  async getStats(): Promise<RealtimeBackupStats> {
    const all = await this.listSnapshots();
    let memCount = 0;
    let chatCount = 0;
    let lastMem = 0;
    let lastChat = 0;
    let total = 0;
    for (const s of all) {
      total += s.size_bytes;
      if (s.kind === 'memory') {
        memCount += 1;
        if (s.ts > lastMem) lastMem = s.ts;
      } else if (s.kind === 'chat') {
        chatCount += 1;
        if (s.ts > lastChat) lastChat = s.ts;
      }
    }
    return {
      total_snapshots: all.length,
      memory_snapshots: memCount,
      chat_snapshots: chatCount,
      last_memory_ts: lastMem,
      last_chat_ts: lastChat,
      total_size_bytes: total,
      idb_available: isIdbAvailable(),
    };
  }

  /**
   * Récupère un snapshot par id.
   */
  async getSnapshot(id: string): Promise<RealtimeSnapshot | null> {
    const all = await this.listSnapshots();
    return all.find((s) => s.id === id) ?? null;
  }

  /**
   * Cleanup (rotation FIFO) — garde MAX_PER_KIND snapshots les plus récents.
   */
  async cleanup(): Promise<{ removed: number }> {
    if (!isIdbAvailable()) return { removed: 0 };
    try {
      const db = await openDb();
      let removed = 0;
      for (const kind of ['memory', 'chat'] as RealtimeSnapshotKind[]) {
        const list = await idbGetAllByKind(db, kind);
        if (list.length <= MAX_PER_KIND) continue;
        const toDelete = list.slice(MAX_PER_KIND);
        for (const s of toDelete) {
          await idbDelete(db, s.id);
          removed += 1;
        }
      }
      db.close();
      return { removed };
    } catch {
      return { removed: 0 };
    }
  }

  /* ============================================================
     Private : prise de snapshot
     ============================================================ */

  private async takeSnapshot(kind: RealtimeSnapshotKind): Promise<RealtimeSnapshot | null> {
    const getter = kind === 'memory' ? this.memoryGetter : this.chatGetter;
    if (!getter) return null;
    if (!isIdbAvailable()) return null;
    let data: unknown;
    try {
      data = await getter();
    } catch (err: unknown) {
      logger.warn('realtime-backup', `${kind} getter failed`, {
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
    /* Skip si data vide (économise IDB) */
    if (Array.isArray(data) && data.length === 0) return null;
    if (!data) return null;
    const ts = Date.now();
    const json = JSON.stringify(data);
    const snap: RealtimeSnapshot = {
      id: genId(kind, ts),
      kind,
      ts,
      size_bytes: new Blob([json]).size,
      data,
      hash: await sha256Short(json),
    };
    try {
      const db = await openDb();
      await idbPut(db, snap);
      db.close();
    } catch (err: unknown) {
      logger.warn('realtime-backup', `${kind} put failed`, {
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
    /* Auto-cleanup async (rotation FIFO) */
    void this.cleanup();
    return snap;
  }

  private scheduleMemorySnapshot(): void {
    if (this.memoryTimer) clearTimeout(this.memoryTimer);
    this.memoryTimer = setTimeout(() => {
      void this.takeSnapshot('memory').finally(() => {
        if (this.started) this.scheduleMemorySnapshot();
      });
    }, DEBOUNCE_MEMORY_MS);
  }

  private scheduleChatSnapshot(): void {
    if (this.chatTimer) clearTimeout(this.chatTimer);
    this.chatTimer = setTimeout(() => {
      void this.takeSnapshot('chat').finally(() => {
        if (this.started) this.scheduleChatSnapshot();
      });
    }, DEBOUNCE_CHAT_MS);
  }
}

export const realtimeBackup = new RealtimeBackup();

/* ============================================================
   Export pour sentinelle (registerCoreSentinels peut import)
   ============================================================ */

export const REALTIME_BACKUP_THRESHOLDS = {
  memoryStaleMs: 10 * 60 * 1000, /* > 10 min sans snapshot mem → fail */
  chatStaleMs: 5 * 60 * 1000, /* > 5 min sans snapshot chat → warn */
};
