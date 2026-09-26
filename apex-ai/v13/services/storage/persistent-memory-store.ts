/**
 * APEX v13 — Persistent Memory Store (mémoire JSON cross-session, FB_FIX shared).
 *
 * Demande Kevin 2026-05-04 :
 * "Système de mémoire persistante (JSON/SQLite)"
 *
 * Architecture :
 * - Stockage triple : localStorage + IndexedDB shadow + Firebase RTDB sync
 * - Format : array<{id, category, text, ts, scope, importance}>
 * - Max 1000 entries (rotation FIFO + dédupe Levenshtein)
 * - Catégories : profile / preferences / lessons / facts / relationships / projects / errors
 * - Scope : per-user (uid) ou global (admin)
 * - Importance 0-100 (priorité de retention si overflow)
 * - Timestamp pour expiry optionnel (ex: lessons learned > 90j vérification)
 * - Cross-app : Apex + CMCteams + KDMC partagent via FB_FIX
 */

import { logger } from '../../core/logger.js';

export type MemoryCategory =
  | 'profile' | 'preferences' | 'lessons' | 'facts'
  | 'relationships' | 'projects' | 'errors' | 'goals' | 'history';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  text: string;
  ts: number;
  scope: string; /* uid ou 'global' */
  importance: number; /* 0-100 */
  source?: string; /* 'chat' | 'manual' | 'import' | 'agent' */
  expires_at?: number; /* timestamp optionnel pour expiry */
}

const STORAGE_KEY = 'apex_v13_persistent_memory';
/* Sprint 8 v13.0.63 : push à fond mémoire (Kevin "va plus loin pousse à fond") */
const MAX_ENTRIES = 5000; /* 1000 → 5000 (compresse via storage-compressor LZ-string si quota) */
const IDB_NAME = 'apex_v13_memory';
const IDB_STORE = 'entries';

class PersistentMemoryStore {
  private cache: MemoryEntry[] | null = null;

  /**
   * Add ou update entry (dédupe par similarité Levenshtein > 85%).
   */
  async add(entry: Omit<MemoryEntry, 'id' | 'ts'> & { id?: string; ts?: number }): Promise<MemoryEntry> {
    const all = await this.list();
    const newEntry: MemoryEntry = {
      id: entry.id ?? `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: entry.ts ?? Date.now(),
      ...entry,
    };
    /* Dédupe par similarité texte (catégorie+scope identiques) */
    const dup = all.find((e) =>
      e.category === newEntry.category &&
      e.scope === newEntry.scope &&
      this.similarity(e.text, newEntry.text) >= 0.85,
    );
    if (dup) {
      /* Update existing : merge importance + ts */
      dup.importance = Math.max(dup.importance, newEntry.importance);
      dup.ts = newEntry.ts;
      dup.text = newEntry.text;
      await this.persist(all);
      return dup;
    }
    all.push(newEntry);
    /* Trim FIFO si > MAX_ENTRIES (garde les plus importants + récents) */
    if (all.length > MAX_ENTRIES) {
      all.sort((a, b) => (b.importance * 0.5 + b.ts / 1e9) - (a.importance * 0.5 + a.ts / 1e9));
      all.length = MAX_ENTRIES;
    }
    await this.persist(all);
    return newEntry;
  }

  /**
   * List avec filtres optionnels.
   */
  async list(filters?: {
    category?: MemoryCategory;
    scope?: string;
    minImportance?: number;
    sinceTs?: number;
  }): Promise<MemoryEntry[]> {
    const all = await this.loadAll();
    if (!filters) return all.slice();
    return all.filter((e) =>
      (!filters.category || e.category === filters.category) &&
      (!filters.scope || e.scope === filters.scope || e.scope === 'global') &&
      (!filters.minImportance || e.importance >= filters.minImportance) &&
      (!filters.sinceTs || e.ts >= filters.sinceTs),
    );
  }

  /**
   * Top N entries pour injection system prompt IA.
   */
  async topForPrompt(scope: string, n = 50): Promise<MemoryEntry[]> {
    const all = await this.list({ scope });
    /* Trie par importance × récence */
    return all
      .sort((a, b) => (b.importance * 0.6 + (b.ts / Date.now()) * 40) - (a.importance * 0.6 + (a.ts / Date.now()) * 40))
      .slice(0, n);
  }

  /**
   * Mission Kevin 2026-05-08 — Top 50 facts compactés par scope user.
   *
   * Sortie compacte (1 ligne / fait) optimisée tokens system prompt :
   * - Tri primaire : importance desc (allergies 95 → préférences 50)
   * - Tri secondaire : récence desc (plus frais d'abord, à importance égale)
   * - Inclut auto le scope global (facts cross-app pertinents pour tous)
   * - Format : `[category/importance] text`
   *
   * Utilisé par buildSystemPromptDeep() pour injection automatique.
   */
  async getTop50ForSystemPrompt(uid: string, n = 50): Promise<{
    count: number;
    formatted: string;
    entries: MemoryEntry[];
  }> {
    const all = await this.list();
    /* Inclut scope user + scope 'global' (facts partagés cross-app) */
    const relevant = all.filter((e) => e.scope === uid || e.scope === 'global');
    relevant.sort((a, b) => {
      const dImp = b.importance - a.importance;
      if (dImp !== 0) return dImp;
      return b.ts - a.ts;
    });
    const top = relevant.slice(0, n);
    if (top.length === 0) {
      return { count: 0, formatted: '', entries: [] };
    }
    const lines = top.map((e) => `- [${e.category}/${e.importance}] ${e.text}`);
    const formatted = `## 🧠 Top ${top.length} facts mémoire long-terme (${uid})\n${lines.join('\n')}`;
    return { count: top.length, formatted, entries: top };
  }

  /**
   * Mission Kevin 2026-05-08 — Top 10 lessons critiques cross-session.
   *
   * Lit `ax_lessons_learned_struct` (FB_FIX shared cross-app : Apex + CMCteams + KDMC).
   * Tri : severity desc (critical > warn > info), récence desc.
   * Inclut SEULEMENT les non-resolved (sinon Apex re-fait les erreurs corrigées).
   *
   * Format compact pour injection system prompt :
   * `ÉVITER: [pattern erreur passée]. [Comment fixer]`
   */
  async getTop10LessonsForSystemPrompt(n = 10): Promise<{
    count: number;
    formatted: string;
  }> {
    try {
      const raw = localStorage.getItem('ax_lessons_learned_struct');
      if (!raw) return { count: 0, formatted: '' };
      const arr = JSON.parse(raw) as Array<{
        category?: string;
        title?: string;
        text?: string;
        severity?: 'info' | 'warn' | 'critical';
        resolved?: boolean;
        ts?: number;
      }>;
      if (!Array.isArray(arr)) return { count: 0, formatted: '' };
      const SEVERITY_RANK: Record<string, number> = {
        critical: 3,
        warn: 2,
        info: 1,
      };
      const filtered = arr.filter((l) => l.resolved !== true);
      filtered.sort((a, b) => {
        const dSev = (SEVERITY_RANK[b.severity ?? 'info'] ?? 0) - (SEVERITY_RANK[a.severity ?? 'info'] ?? 0);
        if (dSev !== 0) return dSev;
        return (b.ts ?? 0) - (a.ts ?? 0);
      });
      const top = filtered.slice(0, n);
      if (top.length === 0) return { count: 0, formatted: '' };
      const lines = top.map((l) => {
        const sev = (l.severity ?? 'warn').toUpperCase();
        const cat = l.category ?? 'general';
        const title = (l.title ?? '').slice(0, 100);
        const text = (l.text ?? '').slice(0, 150);
        return `- [${sev}/${cat}] ÉVITER: ${title}${text ? ` — ${text}` : ''}`;
      });
      const formatted = `## ⚠️ Lessons cross-session (top ${top.length} non résolues — ne PAS reproduire)\n${lines.join('\n')}`;
      return { count: top.length, formatted };
    } catch {
      return { count: 0, formatted: '' };
    }
  }

  /**
   * Format markdown pour injection system prompt.
   */
  async formatForPrompt(scope: string, n = 30): Promise<string> {
    const entries = await this.topForPrompt(scope, n);
    if (entries.length === 0) return '';
    const lines = ['MÉMOIRE PERSISTANTE (cross-session):'];
    const byCategory = new Map<MemoryCategory, MemoryEntry[]>();
    for (const e of entries) {
      const arr = byCategory.get(e.category) ?? [];
      arr.push(e);
      byCategory.set(e.category, arr);
    }
    for (const [cat, items] of byCategory) {
      lines.push(`\n[${cat}]`);
      for (const i of items.slice(0, 8)) {
        lines.push(`- ${i.text}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Remove entry par id.
   */
  async remove(id: string): Promise<boolean> {
    const all = await this.list();
    const before = all.length;
    const filtered = all.filter((e) => e.id !== id);
    if (filtered.length === before) return false;
    await this.persist(filtered);
    return true;
  }

  /**
   * Stats utilisation mémoire.
   */
  async getStats(): Promise<{ total: number; by_category: Record<string, number>; oldest_ts: number; newest_ts: number; size_kb: number }> {
    const all = await this.list();
    const byCategory: Record<string, number> = {};
    for (const e of all) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    const json = JSON.stringify(all);
    return {
      total: all.length,
      by_category: byCategory,
      oldest_ts: all.length > 0 ? Math.min(...all.map((e) => e.ts)) : 0,
      newest_ts: all.length > 0 ? Math.max(...all.map((e) => e.ts)) : 0,
      size_kb: Math.round(new Blob([json]).size / 1024),
    };
  }

  /* === Persistence triple === */

  private async loadAll(): Promise<MemoryEntry[]> {
    if (this.cache) return this.cache;
    /* Try localStorage */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MemoryEntry[];
        if (Array.isArray(parsed)) {
          this.cache = parsed;
          return parsed;
        }
      }
    } catch { /* skip */ }
    /* Fallback IDB */
    try {
      const fromIdb = await this.loadFromIdb();
      if (fromIdb.length > 0) {
        this.cache = fromIdb;
        return fromIdb;
      }
    } catch { /* skip */ }
    this.cache = [];
    return [];
  }

  private async persist(entries: MemoryEntry[]): Promise<void> {
    this.cache = entries;
    /* localStorage */
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (err: unknown) {
      logger.warn('persistent-memory', 'localStorage persist failed', { err });
    }
    /* IDB shadow */
    try {
      await this.persistToIdb(entries);
    } catch (err: unknown) {
      logger.warn('persistent-memory', 'IDB persist failed', { err });
    }
    /* Sprint 8 v13.0.63 : push Firebase auto (Kevin "tout autonome, mémoire jamais perdue").
       FB_FIX inclut ax_persistent_memory → sync via firebase.write. */
    try {
      const { firebase } = await import('./firebase.js');
      await firebase.write(STORAGE_KEY, entries).catch(() => { /* offline OK */ });
    } catch { /* skip */ }
  }

  private async loadFromIdb(): Promise<MemoryEntry[]> {
    if (!('indexedDB' in window)) return [];
    return new Promise((resolve) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const get = store.get('all');
          get.onsuccess = () => {
            db.close();
            resolve(Array.isArray(get.result) ? get.result as MemoryEntry[] : []);
          };
          get.onerror = () => { db.close(); resolve([]); };
        } catch { db.close(); resolve([]); }
      };
      req.onerror = () => resolve([]);
    });
  }

  private async persistToIdb(entries: MemoryEntry[]): Promise<void> {
    if (!('indexedDB' in window)) return;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(entries, 'all');
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* === Helpers === */

  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const la = a.toLowerCase().trim();
    const lb = b.toLowerCase().trim();
    if (la === lb) return 1;
    const long = la.length > lb.length ? la : lb;
    const short = la.length > lb.length ? lb : la;
    if (long.length === 0) return 1;
    const dist = this.levenshtein(long, short);
    return (long.length - dist) / long.length;
  }

  private levenshtein(a: string, b: string): number {
    const dp: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
      const row: number[] = [];
      for (let j = 0; j <= b.length; j++) row.push(0);
      row[0] = i;
      dp[i] = row;
    }
    const first = dp[0] ?? [];
    for (let j = 0; j <= b.length; j++) first[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = dp[i] ?? [];
      const prev = dp[i - 1] ?? [];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      }
    }
    return dp[a.length]?.[b.length] ?? 0;
  }
}

export const persistentMemory = new PersistentMemoryStore();
