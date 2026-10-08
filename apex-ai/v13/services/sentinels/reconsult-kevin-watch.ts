/**
 * APEX v13 — Reconsult Kevin Watch (Sprint 13.3.71 Kevin règle absolue
 * "RECONSULTATION PÉRIODIQUE AUTONOMIE TOTALE" 2026-05-03)
 *
 * Sentinelle 30 min : refetch CLAUDE.md + NOTES_USER.md + KEVIN_ACTIONS_TODO.md
 * + MEMO_RESUME.md + KEVIN_INVENTORY.md depuis GitHub raw API.
 *
 * Comportement :
 * - Fetch chaque doc + compare hash SHA-256 vs cache précédent
 * - Si nouvelle règle / changement détecté :
 *   1. Update cache local (`apex_v13_docs_cache` partagé avec memory.ts)
 *   2. Toast admin discret "📜 Règles Kevin mises à jour : 2 nouveaux changements"
 *   3. Append lesson dans `ax_lessons_learned_struct` avec excerpt diff
 * - Stats hebdo dans `ax_reconsult_log` (cap 100)
 *
 * Règle Kevin : "Régulièrement, tu t'assures de n'avoir rien oublié.
 * Tu reconsultes tous tes dossiers en toute autonomie automatiquement."
 */

import { logger } from '../../core/logger.js';
import { lireFichier as lireFichierDepot } from '../integrations/depot-github.js';

const DOC_FILES: readonly string[] = [
  'CLAUDE.md',
  'NOTES_USER.md',
  'MEMO_RESUME.md',
  'KEVIN_INVENTORY.md',
  'KEVIN_ACTIONS_TODO.md',
  'MEMORY_PERSISTENT.md',
  'APEX_HANDOFF.md',
];
const FETCH_TIMEOUT_MS = 8000;
const DOCS_CACHE_KEY = 'apex_v13_docs_cache';
const RECONSULT_LOG_KEY = 'ax_reconsult_log';
const RECONSULT_LOG_CAP = 100;
const LESSONS_KEY = 'ax_lessons_learned_struct';
const LESSONS_CAP = 200;

export interface DocCacheEntry {
  content: string;
  ts: number;
  size: number;
  hash?: string;
}

export interface ReconsultDocChange {
  doc: string;
  status: 'unchanged' | 'updated' | 'fetch_failed' | 'new';
  size_before?: number;
  size_after?: number;
  hash_before?: string;
  hash_after?: string;
  excerpt?: string; /* premiers 200 chars du diff "ajouté" */
  error?: string;
}

export interface ReconsultRunResult {
  ts: number;
  duration_ms: number;
  changes: ReconsultDocChange[];
  updated_count: number;
  failed_count: number;
  unchanged_count: number;
}

class ReconsultKevinWatch {
  private lastRun: ReconsultRunResult | null = null;

  /**
   * Calcule SHA-256 hash d'un texte (hex string). Async (WebCrypto).
   */
  async hashContent(content: string): Promise<string> {
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
        const enc = new TextEncoder().encode(content);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        const arr = Array.from(new Uint8Array(buf));
        return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      /* fallback */
    }
    /* Fallback : DJB2 simple si WebCrypto indispo (env de test minimal) */
    let h = 5381;
    for (let i = 0; i < content.length; i += 1) {
      h = ((h << 5) + h) ^ content.charCodeAt(i);
    }
    return ('djb2_' + (h >>> 0).toString(16));
  }

  /**
   * Fetch doc unique avec timeout.
   */
  private async fetchDoc(doc: string): Promise<string | null> {
    /* Passe par la porte unique du dépôt : quand CMCteams deviendra privé,
       c'est là-bas qu'on bascule sur le relais, pas ici. */
    return lireFichierDepot(doc, { timeoutMs: FETCH_TIMEOUT_MS });
  }

  /**
   * Lit cache docs (compatible avec memory.syncDocsAtBoot).
   */
  private loadCache(): Record<string, DocCacheEntry> {
    try {
      const raw = localStorage.getItem(DOCS_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, DocCacheEntry>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private persistCache(cache: Record<string, DocCacheEntry>): void {
    try {
      localStorage.setItem(DOCS_CACHE_KEY, JSON.stringify(cache));
    } catch (err: unknown) {
      logger.warn('reconsult-kevin-watch', 'cache persist fail (quota?)', { err });
    }
  }

  /**
   * Run sentinelle 1× : refetch tous docs + diff vs cache + escalate updates.
   * Idempotent + non-bloquant.
   */
  async runOnce(): Promise<ReconsultRunResult> {
    const start = Date.now();
    const cache = this.loadCache();
    const changes: ReconsultDocChange[] = [];
    let updated = 0;
    let failed = 0;
    let unchanged = 0;

    for (const doc of DOC_FILES) {
      const content = await this.fetchDoc(doc);
      if (content === null) {
        failed += 1;
        const change: ReconsultDocChange = {
          doc,
          status: 'fetch_failed',
        };
        const cached = cache[doc];
        if (cached) {
          change.size_before = cached.size;
          if (cached.hash) change.hash_before = cached.hash;
        }
        changes.push(change);
        continue;
      }
      const hash = await this.hashContent(content);
      const prev = cache[doc];
      if (!prev) {
        cache[doc] = { content, ts: Date.now(), size: content.length, hash };
        const change: ReconsultDocChange = {
          doc,
          status: 'new',
          size_after: content.length,
          hash_after: hash,
          excerpt: content.slice(0, 200),
        };
        changes.push(change);
        updated += 1;
        continue;
      }
      if (prev.hash && prev.hash === hash) {
        /* Refresh ts (cache freshness) sans re-écrire */
        prev.ts = Date.now();
        unchanged += 1;
        const change: ReconsultDocChange = {
          doc,
          status: 'unchanged',
          size_before: prev.size,
        };
        if (prev.hash) {
          change.hash_before = prev.hash;
          change.hash_after = hash;
        }
        changes.push(change);
        continue;
      }
      /* Vrai changement détecté */
      const excerpt = this.extractDiffExcerpt(prev.content, content);
      const newEntry: DocCacheEntry = {
        content,
        ts: Date.now(),
        size: content.length,
        hash,
      };
      cache[doc] = newEntry;
      const change: ReconsultDocChange = {
        doc,
        status: 'updated',
        size_before: prev.size,
        size_after: content.length,
        hash_after: hash,
      };
      if (prev.hash) change.hash_before = prev.hash;
      if (excerpt) change.excerpt = excerpt;
      changes.push(change);
      updated += 1;
    }

    /* Persist cache + escalade */
    this.persistCache(cache);

    const result: ReconsultRunResult = {
      ts: Date.now(),
      duration_ms: Date.now() - start,
      changes,
      updated_count: updated,
      failed_count: failed,
      unchanged_count: unchanged,
    };
    this.lastRun = result;

    if (updated > 0) {
      this.notifyAdmin(result);
      this.appendLessons(result);
    }
    this.appendLog(result);

    logger.info('reconsult-kevin-watch', `done : ${updated} updated / ${unchanged} unchanged / ${failed} failed`);
    return result;
  }

  /**
   * Snapshot lastRun (lecture seule).
   */
  getLastRun(): ReconsultRunResult | null {
    return this.lastRun ? { ...this.lastRun } : null;
  }

  /**
   * Lit log historique (FIFO cap 100).
   */
  getLog(): readonly ReconsultRunResult[] {
    try {
      const raw = localStorage.getItem(RECONSULT_LOG_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as ReconsultRunResult[];
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Reset state + log (tests + admin).
   */
  reset(): void {
    this.lastRun = null;
    try {
      localStorage.removeItem(RECONSULT_LOG_KEY);
    } catch {
      /* skip */
    }
  }

  /* === Internals === */

  private extractDiffExcerpt(prev: string, current: string): string {
    /* Stratégie simple : trouve la première ligne qui diffère, retourne contexte */
    const prevLines = prev.split('\n');
    const curLines = current.split('\n');
    const len = Math.min(prevLines.length, curLines.length);
    for (let i = 0; i < len; i += 1) {
      if (prevLines[i] !== curLines[i]) {
        const start = Math.max(0, i);
        const end = Math.min(curLines.length, i + 4);
        return curLines.slice(start, end).join(' | ').slice(0, 300);
      }
    }
    /* Diff = juste appended */
    if (curLines.length > prevLines.length) {
      return curLines.slice(prevLines.length, prevLines.length + 4).join(' | ').slice(0, 300);
    }
    return '';
  }

  private notifyAdmin(result: ReconsultRunResult): void {
    try {
      const w = globalThis as unknown as {
        toast?: (m: string, kind?: string) => void;
      };
      const updated = result.changes
        .filter((c) => c.status === 'updated' || c.status === 'new')
        .map((c) => c.doc)
        .slice(0, 3);
      const msg = `📜 Règles Kevin mises à jour : ${result.updated_count} doc(s) (${updated.join(', ')})`;
      if (typeof w.toast === 'function') {
        w.toast(msg, 'info');
      }
    } catch {
      /* skip */
    }
  }

  private appendLessons(result: ReconsultRunResult): void {
    try {
      const raw = localStorage.getItem(LESSONS_KEY);
      const arr: Array<Record<string, unknown>> = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
      for (const c of result.changes) {
        if (c.status !== 'updated' && c.status !== 'new') continue;
        arr.push({
          id: `L_reconsult_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          category: 'docs-update',
          title: `Doc Kevin updated : ${c.doc}`,
          text: c.excerpt ? `Changement : ${c.excerpt}` : `Doc ${c.doc} updated (${c.size_before ?? 0} → ${c.size_after ?? 0} chars)`,
          severity: 'info',
          src: 'reconsult-kevin-watch',
          ts: Date.now(),
          resolved: false,
        });
      }
      const trimmed = arr.slice(-LESSONS_CAP);
      localStorage.setItem(LESSONS_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('reconsult-kevin-watch', 'append lessons failed', { err });
    }
  }

  private appendLog(result: ReconsultRunResult): void {
    try {
      const raw = localStorage.getItem(RECONSULT_LOG_KEY);
      const arr: ReconsultRunResult[] = raw ? (JSON.parse(raw) as ReconsultRunResult[]) : [];
      arr.push(result);
      const trimmed = arr.slice(-RECONSULT_LOG_CAP);
      localStorage.setItem(RECONSULT_LOG_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('reconsult-kevin-watch', 'append log failed', { err });
    }
  }
}

export const reconsultKevinWatch = new ReconsultKevinWatch();
