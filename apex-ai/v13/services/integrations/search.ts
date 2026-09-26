/**
 * APEX v13 — Search service (full-text local)
 *
 * Wrapper du `workers/search-index.worker.ts` :
 * - Lazy-init worker au 1er appel (pas au boot — pas pénalise LCP)
 * - Fallback main-thread (Fuse.js direct) si Worker indispo (CSP, browser legacy,
 *   tests sans Worker support).
 * - API simple : `index(collection, docs)`, `add(collection, doc)`, `search(collection, q)`.
 *
 * Cas d'usage :
 * - Recherche live messages chat (5000+ msg sans freeze)
 * - Recherche notes / contacts / docs
 * - Index incrémental (au fur et à mesure que les messages arrivent)
 *
 * Sécurité :
 * - Pas de PII envoyée au worker au-delà de ce que l'app a déjà en mémoire.
 * - postMessage typé strict (validation côté worker).
 */

import Fuse, { type IFuseOptions } from 'fuse.js';

import { logger } from '../../core/logger.js';
import type {
  SearchDoc,
  SearchHit,
  SearchWorkerRequest,
  SearchWorkerResponse,
} from '../../workers/search-index.worker.js';


export type { SearchDoc, SearchHit } from '../../workers/search-index.worker.js';

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (err: Error) => void;
}

interface FallbackCollection {
  fuse: Fuse<SearchDoc>;
  docs: SearchDoc[];
  options: IFuseOptions<SearchDoc>;
}

class SearchService {
  private worker: Worker | null = null;
  private workerReady = false;
  private workerInitPromise: Promise<boolean> | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  /* Fallback main-thread : si Worker KO, on garde des Fuse instances locales */
  private fallback = new Map<string, FallbackCollection>();
  private useFallback = false;

  /**
   * Lazy-init du worker. Idempotent. Retourne true si worker prêt, false si fallback.
   *
   * NOTE: Worker intentionnellement non démarré au boot pour ne pas pénaliser LCP.
   * Première recherche utilisateur déclenche l'init (env. 30-50ms).
   */
  private async ensureWorker(): Promise<boolean> {
    if (this.workerReady) return true;
    if (this.useFallback) return false;
    if (this.workerInitPromise) return this.workerInitPromise;

    this.workerInitPromise = new Promise<boolean>((resolve) => {
      try {
        if (typeof Worker === 'undefined') {
          logger.info('search', 'Worker API unavailable → fallback main-thread');
          this.useFallback = true;
          resolve(false);
          return;
        }
        /* Vite worker import : new URL + import.meta.url + type:'module' */
        const worker = new Worker(
          new URL('../../workers/search-index.worker.ts', import.meta.url),
          { type: 'module' },
        );
        let readyTimer: ReturnType<typeof setTimeout> | null = null;
        const onReady = (event: MessageEvent<unknown>): void => {
          const data = event.data as { type?: string };
          if (data?.type === 'ready') {
            this.workerReady = true;
            if (readyTimer) clearTimeout(readyTimer);
            worker.removeEventListener('message', onReady);
            worker.addEventListener('message', this.onMessage);
            worker.addEventListener('error', this.onError);
            this.worker = worker;
            resolve(true);
          }
        };
        worker.addEventListener('message', onReady);
        readyTimer = setTimeout(() => {
          worker.removeEventListener('message', onReady);
          logger.warn('search', 'Worker ready timeout → fallback main-thread');
          this.useFallback = true;
          try {
            worker.terminate();
          } catch {
            /* ignore */
          }
          resolve(false);
        }, 3000);
      } catch (err) {
        logger.warn('search', 'Worker creation failed → fallback main-thread', { err });
        this.useFallback = true;
        resolve(false);
      }
    });
    return this.workerInitPromise;
  }

  private onMessage = (event: MessageEvent<unknown>): void => {
    const data = event.data as SearchWorkerResponse | { type?: string };
    if (!data || typeof (data as { id?: unknown }).id !== 'number') return;
    const resp = data as SearchWorkerResponse;
    const pending = this.pending.get(resp.id);
    if (!pending) return;
    this.pending.delete(resp.id);
    if (resp.type === 'ok') {
      pending.resolve(resp.result);
    } else {
      pending.reject(new Error(resp.error));
    }
  };

  private onError = (event: ErrorEvent): void => {
    logger.warn('search', 'Worker error event', { msg: event.message });
    /* Reject all pending */
    for (const [, p] of this.pending) {
      p.reject(new Error(`worker_error: ${event.message}`));
    }
    this.pending.clear();
  };

  private call<T, R extends SearchWorkerRequest>(req: Omit<R, 'id'>): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error('worker_not_ready'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      /* Safety timeout 10s : si worker ne répond pas, on rejette + cleanup pending */
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('worker_call_timeout'));
        }
      }, 10_000);
      /* Wrap resolve/reject pour clear le timeout dès qu'on a une réponse
       * (sinon le setTimeout reste vivant 10s → leak timers + ralentit tests). */
      this.pending.set(id, {
        resolve: (v: unknown) => {
          clearTimeout(timer);
          (resolve as (v: unknown) => void)(v);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      const fullReq = { ...req, id } as unknown as SearchWorkerRequest;
      this.worker?.postMessage(fullReq);
    });
  }

  /* ─── API publique ─────────────────────────────────────────────── */

  /**
   * Indexe une collection complète (rebuild full).
   * Utilise le worker si dispo, sinon fallback main-thread.
   */
  async index(
    collection: string,
    docs: SearchDoc[],
    keys?: Array<string | { name: string; weight?: number }>,
  ): Promise<{ count: number }> {
    const ok = await this.ensureWorker();
    if (ok) {
      try {
        return await this.call<
          { count: number },
          import('../../workers/search-index.worker.js').SearchWorkerBulkIndexReq
        >({
          type: 'bulkIndex',
          collection,
          docs,
          ...(keys ? { keys } : {}),
        });
      } catch (err) {
        logger.warn('search', 'Worker bulkIndex failed → fallback', { err });
        this.useFallback = true;
      }
    }
    return this.fallbackIndex(collection, docs, keys);
  }

  async add(collection: string, doc: SearchDoc): Promise<{ count: number }> {
    const ok = await this.ensureWorker();
    if (ok) {
      try {
        return await this.call<
          { count: number },
          import('../../workers/search-index.worker.js').SearchWorkerAddReq
        >({
          type: 'add',
          collection,
          doc,
        });
      } catch (err) {
        logger.warn('search', 'Worker add failed → fallback', { err });
        this.useFallback = true;
      }
    }
    return this.fallbackAdd(collection, doc);
  }

  async remove(
    collection: string,
    docId: string,
  ): Promise<{ count: number; removed: boolean }> {
    const ok = await this.ensureWorker();
    if (ok) {
      try {
        return await this.call<
          { count: number; removed: boolean },
          import('../../workers/search-index.worker.js').SearchWorkerRemoveReq
        >({
          type: 'remove',
          collection,
          docId,
        });
      } catch (err) {
        logger.warn('search', 'Worker remove failed → fallback', { err });
        this.useFallback = true;
      }
    }
    return this.fallbackRemove(collection, docId);
  }

  async search(
    collection: string,
    query: string,
    limit = 50,
  ): Promise<SearchHit[]> {
    const ok = await this.ensureWorker();
    if (ok) {
      try {
        return await this.call<
          SearchHit[],
          import('../../workers/search-index.worker.js').SearchWorkerSearchReq
        >({
          type: 'search',
          collection,
          query,
          limit,
        });
      } catch (err) {
        logger.warn('search', 'Worker search failed → fallback', { err });
        this.useFallback = true;
      }
    }
    return this.fallbackSearch(collection, query, limit);
  }

  async clear(collection: string): Promise<{ cleared: boolean }> {
    if (this.workerReady && this.worker) {
      try {
        return await this.call<
          { cleared: boolean },
          import('../../workers/search-index.worker.js').SearchWorkerClearReq
        >({ type: 'clear', collection });
      } catch (err) {
        logger.warn('search', 'Worker clear failed → fallback', { err });
      }
    }
    const had = this.fallback.delete(collection);
    return { cleared: had };
  }

  /* ─── Fallback main-thread ────────────────────────────────────── */

  private inferKeys(docs: SearchDoc[]): string[] {
    const keys = new Set<string>();
    for (const doc of docs.slice(0, 50)) {
      for (const [k, v] of Object.entries(doc)) {
        if (k === 'id') continue;
        if (typeof v === 'string' && v.length > 0) keys.add(k);
      }
    }
    return Array.from(keys);
  }

  private fallbackIndex(
    collection: string,
    docs: SearchDoc[],
    keys?: Array<string | { name: string; weight?: number }>,
  ): { count: number } {
    const finalKeys = keys && keys.length > 0 ? keys : this.inferKeys(docs);
    const options: IFuseOptions<SearchDoc> = {
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
      shouldSort: true,
      minMatchCharLength: 1,
      keys: finalKeys,
    };
    const fuse = new Fuse<SearchDoc>(docs.slice(), options);
    this.fallback.set(collection, { fuse, docs: docs.slice(), options });
    return { count: docs.length };
  }

  private fallbackAdd(collection: string, doc: SearchDoc): { count: number } {
    const state = this.fallback.get(collection);
    if (!state) return this.fallbackIndex(collection, [doc]);
    const idx = state.docs.findIndex((d) => d.id === doc.id);
    if (idx >= 0) {
      state.docs[idx] = doc;
      state.fuse.remove((d: SearchDoc) => d.id === doc.id);
      state.fuse.add(doc);
    } else {
      state.docs.push(doc);
      state.fuse.add(doc);
    }
    return { count: state.docs.length };
  }

  private fallbackRemove(
    collection: string,
    docId: string,
  ): { count: number; removed: boolean } {
    const state = this.fallback.get(collection);
    if (!state) return { count: 0, removed: false };
    const before = state.docs.length;
    state.docs = state.docs.filter((d) => d.id !== docId);
    state.fuse.remove((d: SearchDoc) => d.id === docId);
    return { count: state.docs.length, removed: state.docs.length < before };
  }

  private fallbackSearch(
    collection: string,
    query: string,
    limit: number,
  ): SearchHit[] {
    const state = this.fallback.get(collection);
    if (!state || !query.trim()) return [];
    const raw = state.fuse.search(query, { limit });
    return raw.map((r: { item: SearchDoc; score?: number }) => ({
      item: r.item,
      score: r.score ?? 0,
    }));
  }

  /**
   * Diagnostic : true si worker actif, false si fallback main-thread.
   */
  isWorkerActive(): boolean {
    return this.workerReady && !this.useFallback;
  }

  /**
   * Cleanup global : termine worker + clear fallback. Appelé au logout.
   */
  cleanup(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        /* ignore */
      }
      this.worker = null;
    }
    this.workerReady = false;
    this.workerInitPromise = null;
    this.useFallback = false;
    this.fallback.clear();
    /* v13.4.172 (Kevin "tests rapides 100/100 réel") : reject pending pour
     * forcer clearTimeout via wrapped reject. Sinon les setTimeout(10s) du
     * call() restent actifs → ralentit suite tests + leak timers prod. */
    for (const [, p] of this.pending) {
      try { p.reject(new Error('search_cleanup')); } catch { /* ignore */ }
    }
    this.pending.clear();
    /* Reset nextId pour repartir de 1 après cleanup (cohérence ids cross-session) */
    this.nextId = 1;
  }
}

export const search = new SearchService();
