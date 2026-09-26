/**
 * APEX v13.4.191 — Chat attachments persistent store (IndexedDB).
 *
 * Kevin règle ABSOLUE 2026-05-16 : "Triple persistence + rien perdre".
 * Bug détecté v13.4.190 : les images/PDF du chat sont perdues entre sessions
 * car chat-persistence.ts les sauve en localStorage (cap 5 MB iOS → quota
 * exceeded silencieux → drop attachments).
 *
 * Solution : stocker les blobs base64 dans IndexedDB séparé (cap ~50-500 MB
 * iOS Safari PWA). Le message localStorage garde juste les références ID.
 *
 * Au load, on rehydrate les attachments depuis IDB → Apex IA voit toujours
 * les fichiers anciens même après reload.
 *
 * Pattern réutilisable : 1 store `chat_attachments` keyé par `<msgId>_<idx>`.
 */

import { logger } from '../../core/logger.js';

const DB_NAME = 'apex_v13_chat_attachments';
const DB_VERSION = 1;
const STORE = 'attachments';

export interface StoredAttachment {
  /** id unique : `<msgId>_<idx>` */
  id: string;
  msgId: string;
  idx: number;
  mime: string;
  name: string;
  base64: string;
  ts: number;
  sizeBytes: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('msgId', 'msgId', { unique: false });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error('IDB open failed'));
  });
}

/**
 * Persiste les attachments d'un message dans IDB.
 * @returns Array de keys IDB ({msgId}_{idx})
 */
export async function persistAttachments(
  msgId: string,
  attachments: Array<{ mime: string; base64: string; name: string }>,
): Promise<string[]> {
  if (!attachments || attachments.length === 0) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const ids: string[] = [];
    const ts = Date.now();
    for (let i = 0; i < attachments.length; i++) {
      const a = attachments[i];
      if (!a) continue;
      const id = `${msgId}_${i}`;
      const entry: StoredAttachment = {
        id,
        msgId,
        idx: i,
        mime: a.mime,
        name: a.name,
        base64: a.base64,
        ts,
        sizeBytes: a.base64.length,
      };
      store.put(entry);
      ids.push(id);
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = (): void => res();
      tx.onerror = (): void => rej(tx.error ?? new Error('IDB put failed'));
    });
    db.close();
    return ids;
  } catch (err: unknown) {
    logger.warn('chat-attachments-store', 'persistAttachments failed', { err });
    return [];
  }
}

/**
 * Restaure les attachments d'un message depuis IDB.
 */
export async function restoreAttachments(
  msgId: string,
): Promise<Array<{ mime: string; base64: string; name: string }>> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const index = store.index('msgId');
    const req = index.getAll(msgId);
    const results = await new Promise<StoredAttachment[]>((res, rej) => {
      req.onsuccess = (): void => res(req.result);
      req.onerror = (): void => rej(req.error ?? new Error('IDB getAll failed'));
    });
    db.close();
    /* Sort by idx pour préserver l'ordre original */
    return results
      .sort((a, b) => a.idx - b.idx)
      .map((s) => ({ mime: s.mime, name: s.name, base64: s.base64 }));
  } catch (err: unknown) {
    logger.warn('chat-attachments-store', 'restoreAttachments failed', { err });
    return [];
  }
}

/**
 * Liste les N derniers messages avec attachments (admin/Apex IA tool use).
 */
export async function listRecentAttachments(maxMessages: number = 20): Promise<StoredAttachment[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    const all = await new Promise<StoredAttachment[]>((res, rej) => {
      req.onsuccess = (): void => res(req.result);
      req.onerror = (): void => rej(req.error ?? new Error('IDB getAll failed'));
    });
    db.close();
    /* Group par msgId, sort par ts desc, prend N derniers msgIds */
    const byMsg = new Map<string, StoredAttachment[]>();
    for (const att of all) {
      if (!byMsg.has(att.msgId)) byMsg.set(att.msgId, []);
      byMsg.get(att.msgId)!.push(att);
    }
    const msgIds = [...byMsg.keys()]
      .sort((a, b) => {
        const tsA = Math.max(...(byMsg.get(a) ?? []).map((x) => x.ts));
        const tsB = Math.max(...(byMsg.get(b) ?? []).map((x) => x.ts));
        return tsB - tsA;
      })
      .slice(0, maxMessages);
    const flat: StoredAttachment[] = [];
    for (const mid of msgIds) {
      flat.push(...(byMsg.get(mid) ?? []));
    }
    return flat;
  } catch (err: unknown) {
    logger.warn('chat-attachments-store', 'listRecentAttachments failed', { err });
    return [];
  }
}

/**
 * Cleanup attachments orphelins (msgIds qui n'existent plus dans conversation).
 * @param keepMsgIds Set des msgIds encore actifs dans conversation
 * @returns nombre supprimés
 */
export async function cleanupOrphans(keepMsgIds: Set<string>): Promise<number> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    const all = await new Promise<StoredAttachment[]>((res, rej) => {
      req.onsuccess = (): void => res(req.result);
      req.onerror = (): void => rej(req.error ?? new Error('IDB getAll failed'));
    });
    let deleted = 0;
    for (const att of all) {
      if (!keepMsgIds.has(att.msgId)) {
        store.delete(att.id);
        deleted++;
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = (): void => res();
      tx.onerror = (): void => rej(tx.error ?? new Error('IDB cleanup failed'));
    });
    db.close();
    if (deleted > 0) {
      logger.info('chat-attachments-store', `Cleaned up ${deleted} orphan attachments`);
    }
    return deleted;
  } catch (err: unknown) {
    logger.warn('chat-attachments-store', 'cleanupOrphans failed', { err });
    return 0;
  }
}

/**
 * Stats IDB store (admin debug).
 */
export async function getStats(): Promise<{ count: number; totalBytes: number; oldestTs: number | null }> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    const all = await new Promise<StoredAttachment[]>((res, rej) => {
      req.onsuccess = (): void => res(req.result);
      req.onerror = (): void => rej(req.error ?? new Error('IDB getAll failed'));
    });
    db.close();
    const count = all.length;
    const totalBytes = all.reduce((sum, a) => sum + a.sizeBytes, 0);
    const oldestTs = count > 0 ? Math.min(...all.map((a) => a.ts)) : null;
    return { count, totalBytes, oldestTs };
  } catch {
    return { count: 0, totalBytes: 0, oldestTs: null };
  }
}

export const chatAttachmentsStore = {
  persistAttachments,
  restoreAttachments,
  listRecentAttachments,
  cleanupOrphans,
  getStats,
};
