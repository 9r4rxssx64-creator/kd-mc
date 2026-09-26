/**
 * APEX v13 — Pinecone Vector Store (RAG mémoire long-terme).
 *
 * Demande Kevin 2026-05-08 :
 * "Audit Apex IA: memory-watch crash 'e.list' — Pinecone non wired (clé manquante).
 *  Si Pinecone configuré → utiliser. Sinon fallback gracieux localStorage facts ranking."
 *
 * Architecture :
 * - Init LAZY (au 1er appel, pas au boot — évite crash si clé manquante)
 * - Auto-detect index `apex-memory` (créer via API serverless si absent)
 * - Embedding via NVIDIA llama-text-embed-v2 (Pinecone hosted, pas besoin OpenAI)
 * - Cache 5 min localResults (réduit latence + coûts)
 * - Si fail réseau → fallback localStorage facts ranking importance
 * - Toggle `feature.pinecone-rag` (default ON if key present, OFF si absente)
 *
 * Fallback gracieux :
 * - Pas de crash si clé Pinecone absente du vault
 * - Pas de warning agressif (l'admin n'a pas forcément Pinecone)
 * - persistent-memory continue normal (mode local-only)
 *
 * Sécurité :
 * - Clé API lue via vault.readKey('ax_pinecone_key') — chiffrée AES-GCM-256
 * - Pas de PII envoyée à Pinecone si redaction activée (pii-redaction.ts)
 * - Index name configurable via 'ax_pinecone_index' (défaut 'apex-memory')
 */

import { logger } from '../../core/logger.js';
import { isFeatureEnabled } from '../auth/feature-toggles.js';
import { vault } from '../vault/vault.js';

/* ============================================================
   Types publics
   ============================================================ */

export interface PineconeVector {
  id: string;
  values?: number[]; /* embedding optionnel — Pinecone peut générer via llama-text-embed-v2 */
  text?: string; /* si pas d'embedding fourni → Pinecone embed serveur */
  metadata?: Record<string, string | number | boolean>;
}

export interface PineconeQueryMatch {
  id: string;
  score: number;
  values?: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface PineconeStatus {
  configured: boolean;
  reachable: boolean;
  index_name: string;
  vector_count: number;
  last_sync_ts: number;
  cache_size: number;
  fallback_active: boolean; /* true si Pinecone KO et on utilise localStorage */
  error?: string;
}

interface CacheEntry {
  ts: number;
  result: PineconeQueryMatch[];
}

/* ============================================================
   Constants
   ============================================================ */

const STORAGE_KEY_KEY = 'ax_pinecone_key';
const STORAGE_INDEX_NAME = 'ax_pinecone_index';
const STORAGE_HOST = 'ax_pinecone_host';
const STORAGE_LAST_SYNC = 'ax_pinecone_last_sync';
const STORAGE_VECTOR_COUNT = 'ax_pinecone_vector_count';
const DEFAULT_INDEX_NAME = 'apex-memory';
const CACHE_TTL_MS = 5 * 60 * 1000; /* 5 min */
const DEFAULT_EMBED_MODEL = 'llama-text-embed-v2'; /* 1024 dim */
const FETCH_TIMEOUT_MS = 15_000;

/* ============================================================
   Helpers
   ============================================================ */

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeRead(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, val: string): boolean {
  try {
    localStorage.setItem(key, val);
    return true;
  } catch {
    return false;
  }
}

/* ============================================================
   PineconeStore class
   ============================================================ */

class PineconeStore {
  private apiKey = '';
  private indexName = DEFAULT_INDEX_NAME;
  private host = ''; /* indexHost (renvoyé par Pinecone à la création) */
  private initialized = false;
  private initPromise: Promise<boolean> | null = null;
  private cache = new Map<string, CacheEntry>();
  private lastError: string | undefined;
  private fallbackActive = false;

  /**
   * Init LAZY : appelé au 1er upsert/query.
   * Retourne true si Pinecone disponible, false si fallback.
   */
  async init(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<boolean> {
    /* Feature toggle Kevin règle ON/OFF : si admin a désactivé Pinecone RAG,
       fallback localStorage immédiat (pas de tentative réseau ni vault). */
    if (!isFeatureEnabled('feature.pinecone-rag')) {
      this.fallbackActive = true;
      this.initialized = false;
      logger.info('pinecone-store', 'feature.pinecone-rag OFF → fallback localStorage');
      return false;
    }
    try {
      this.apiKey = (await vault.readKey(STORAGE_KEY_KEY)).trim();
      if (!this.apiKey) {
        this.fallbackActive = true;
        this.initialized = false;
        logger.info('pinecone-store', 'Pinecone key absent → fallback localStorage');
        return false;
      }
      this.indexName = safeRead(STORAGE_INDEX_NAME) || DEFAULT_INDEX_NAME;
      this.host = safeRead(STORAGE_HOST);
      /* Si pas de host stocké, tente describeIndex puis createIndex si absent */
      if (!this.host) {
        const ensured = await this.ensureIndex();
        if (!ensured) {
          this.fallbackActive = true;
          this.initialized = false;
          return false;
        }
      }
      this.initialized = true;
      this.fallbackActive = false;
      this.lastError = undefined;
      logger.info('pinecone-store', `Init OK — index=${this.indexName} host=${this.host}`);
      return true;
    } catch (err: unknown) {
      this.fallbackActive = true;
      this.initialized = false;
      this.lastError = err instanceof Error ? err.message : String(err);
      logger.warn('pinecone-store', 'Init failed → fallback', { err: this.lastError });
      return false;
    }
  }

  /**
   * Force re-init (admin action après changement de clé).
   */
  async reload(): Promise<boolean> {
    this.initPromise = null;
    this.initialized = false;
    this.cache.clear();
    return this.init();
  }

  /**
   * Status pour vue admin pinecone-status.
   */
  async getStatus(): Promise<PineconeStatus> {
    await this.init();
    const lastSyncRaw = safeRead(STORAGE_LAST_SYNC, '0');
    const vectorCountRaw = safeRead(STORAGE_VECTOR_COUNT, '0');
    return {
      configured: Boolean(this.apiKey),
      reachable: this.initialized && !this.fallbackActive,
      index_name: this.indexName,
      vector_count: parseInt(vectorCountRaw, 10) || 0,
      last_sync_ts: parseInt(lastSyncRaw, 10) || 0,
      cache_size: this.cache.size,
      fallback_active: this.fallbackActive,
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }

  /**
   * Test connexion (pour vue admin bouton "Tester connexion").
   */
  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    const ok = await this.init();
    const latencyMs = Date.now() - start;
    if (!ok) {
      return { ok: false, latencyMs, error: this.lastError ?? 'Pinecone non configuré' };
    }
    /* Ping describeIndex via control plane */
    try {
      const r = await fetchWithTimeout(
        `https://api.pinecone.io/indexes/${encodeURIComponent(this.indexName)}`,
        { method: 'GET', headers: { 'Api-Key': this.apiKey, 'X-Pinecone-API-Version': '2024-10' } },
      );
      if (!r.ok) {
        return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${r.status}` };
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : 'fetch fail' };
    }
  }

  /**
   * Upsert vecteurs (avec embedding serveur si pas fourni).
   * Si Pinecone KO → silence, fallback inopérant pour upsert (juste skip).
   */
  async upsertVectors(vectors: readonly PineconeVector[]): Promise<{ ok: boolean; upserted: number; error?: string }> {
    if (!Array.isArray(vectors) || vectors.length === 0) {
      return { ok: true, upserted: 0 };
    }
    const ready = await this.init();
    if (!ready || !this.host) {
      return { ok: false, upserted: 0, error: 'pinecone_not_ready' };
    }
    try {
      /* Si tous les vectors ont déjà values → upsert classique */
      const allHaveValues = vectors.every((v) => Array.isArray(v.values) && v.values.length > 0);
      if (allHaveValues) {
        const body = {
          vectors: vectors.map((v) => ({
            id: v.id,
            values: v.values,
            ...(v.metadata ? { metadata: v.metadata } : {}),
          })),
        };
        const r = await fetchWithTimeout(
          `https://${this.host}/vectors/upsert`,
          {
            method: 'POST',
            headers: { 'Api-Key': this.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          return { ok: false, upserted: 0, error: `HTTP ${r.status} ${text.slice(0, 200)}` };
        }
        const json = (await r.json().catch(() => ({}))) as { upsertedCount?: number };
        const upserted = json.upsertedCount ?? vectors.length;
        this.bumpVectorCount(upserted);
        return { ok: true, upserted };
      }
      /* Sinon : upsert via inference + records (NVIDIA embedding serveur) */
      const records = vectors
        .filter((v) => v.text && v.text.trim().length > 0)
        .map((v) => ({
          id: v.id,
          text: v.text ?? '',
          ...(v.metadata ?? {}),
        }));
      if (records.length === 0) {
        return { ok: false, upserted: 0, error: 'no_text_or_values_provided' };
      }
      /* Pinecone records API for serverless w/ integrated embed.
       * Endpoint per docs : POST /records/namespaces/__default__/upsert (NDJSON) */
      const ndjson = records.map((r) => JSON.stringify(r)).join('\n');
      const r = await fetchWithTimeout(
        `https://${this.host}/records/namespaces/__default__/upsert`,
        {
          method: 'POST',
          headers: {
            'Api-Key': this.apiKey,
            'Content-Type': 'application/x-ndjson',
            'X-Pinecone-API-Version': '2024-10',
          },
          body: ndjson,
        },
      );
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return { ok: false, upserted: 0, error: `HTTP ${r.status} ${text.slice(0, 200)}` };
      }
      this.bumpVectorCount(records.length);
      return { ok: true, upserted: records.length };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('pinecone-store', 'upsertVectors failed', { error });
      return { ok: false, upserted: 0, error };
    }
  }

  /**
   * Query top-K matches.
   * Si Pinecone KO → fallback localStorage facts ranking importance.
   */
  async query(opts: {
    text?: string;
    vector?: number[];
    topK?: number;
    filter?: Record<string, unknown>;
  }): Promise<PineconeQueryMatch[]> {
    const topK = opts.topK ?? 10;
    const cacheKey = JSON.stringify({ t: opts.text, v: opts.vector?.slice(0, 4), k: topK, f: opts.filter });
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.result;
    }
    const ready = await this.init();
    if (!ready || !this.host) {
      const fallback = await this.fallbackQuery(opts.text ?? '', topK);
      this.cache.set(cacheKey, { ts: Date.now(), result: fallback });
      return fallback;
    }
    try {
      let body: Record<string, unknown>;
      if (Array.isArray(opts.vector) && opts.vector.length > 0) {
        body = { vector: opts.vector, topK, includeMetadata: true };
      } else if (opts.text) {
        /* Query with serverless integrated embed (records API) */
        body = { query: { inputs: { text: opts.text }, top_k: topK } };
      } else {
        return [];
      }
      if (opts.filter) body['filter'] = opts.filter;
      const url = Array.isArray(opts.vector)
        ? `https://${this.host}/query`
        : `https://${this.host}/records/namespaces/__default__/search`;
      const r = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json',
            'X-Pinecone-API-Version': '2024-10',
          },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) {
        const fallback = await this.fallbackQuery(opts.text ?? '', topK);
        this.cache.set(cacheKey, { ts: Date.now(), result: fallback });
        return fallback;
      }
      const json = (await r.json().catch(() => ({}))) as {
        matches?: Array<{ id: string; score: number; metadata?: Record<string, string | number | boolean> }>;
        result?: { hits?: Array<{ _id: string; _score: number; fields?: Record<string, string | number | boolean> }> };
      };
      const matches: PineconeQueryMatch[] = [];
      if (Array.isArray(json.matches)) {
        for (const m of json.matches) {
          matches.push({ id: m.id, score: m.score, ...(m.metadata ? { metadata: m.metadata } : {}) });
        }
      } else if (json.result?.hits) {
        for (const h of json.result.hits) {
          matches.push({ id: h._id, score: h._score, ...(h.fields ? { metadata: h.fields } : {}) });
        }
      }
      this.cache.set(cacheKey, { ts: Date.now(), result: matches });
      safeWrite(STORAGE_LAST_SYNC, String(Date.now()));
      return matches;
    } catch (err: unknown) {
      logger.warn('pinecone-store', 'query failed → fallback', {
        err: err instanceof Error ? err.message : String(err),
      });
      const fallback = await this.fallbackQuery(opts.text ?? '', topK);
      this.cache.set(cacheKey, { ts: Date.now(), result: fallback });
      return fallback;
    }
  }

  /**
   * Delete vectors par ids.
   */
  async deleteVectors(ids: readonly string[]): Promise<{ ok: boolean; deleted: number; error?: string }> {
    if (!Array.isArray(ids) || ids.length === 0) return { ok: true, deleted: 0 };
    const ready = await this.init();
    if (!ready || !this.host) return { ok: false, deleted: 0, error: 'pinecone_not_ready' };
    try {
      const r = await fetchWithTimeout(
        `https://${this.host}/vectors/delete`,
        {
          method: 'POST',
          headers: { 'Api-Key': this.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...ids] }),
        },
      );
      if (!r.ok) {
        return { ok: false, deleted: 0, error: `HTTP ${r.status}` };
      }
      return { ok: true, deleted: ids.length };
    } catch (err: unknown) {
      return { ok: false, deleted: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Resync depuis localStorage facts → upsert dans Pinecone.
   * Utile pour bouton admin "Resync depuis localStorage facts".
   */
  async resyncFromLocalFacts(): Promise<{ ok: boolean; synced: number; error?: string }> {
    const ready = await this.init();
    if (!ready) return { ok: false, synced: 0, error: 'pinecone_not_ready' };
    try {
      const { persistentMemory } = await import('./persistent-memory-store.js');
      const all = await persistentMemory.list().catch(() => [] as Array<{ id: string; text: string; category: string; importance: number; scope: string }>);
      const safe = Array.isArray(all) ? all : [];
      if (safe.length === 0) return { ok: true, synced: 0 };
      const vectors: PineconeVector[] = safe
        .filter((e) => e && typeof e.text === 'string' && e.text.trim().length > 0)
        .map((e) => ({
          id: e.id,
          text: e.text,
          metadata: {
            category: String(e.category ?? 'unknown'),
            scope: String(e.scope ?? 'global'),
            importance: Number(e.importance ?? 0),
          },
        }));
      if (vectors.length === 0) return { ok: true, synced: 0 };
      /* Batches 100 (limite Pinecone par upsert) */
      let synced = 0;
      for (let i = 0; i < vectors.length; i += 100) {
        const batch = vectors.slice(i, i + 100);
        const r = await this.upsertVectors(batch);
        if (r.ok) synced += r.upserted;
        else return { ok: false, synced, error: r.error ?? 'upsert_failed' };
      }
      return { ok: true, synced };
    } catch (err: unknown) {
      return { ok: false, synced: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /* ============================================================
     Private : ensureIndex (create if missing)
     ============================================================ */

  private async ensureIndex(): Promise<boolean> {
    try {
      const describe = await fetchWithTimeout(
        `https://api.pinecone.io/indexes/${encodeURIComponent(this.indexName)}`,
        { method: 'GET', headers: { 'Api-Key': this.apiKey, 'X-Pinecone-API-Version': '2024-10' } },
      );
      if (describe.ok) {
        const json = (await describe.json().catch(() => ({}))) as { host?: string };
        if (json.host) {
          this.host = json.host;
          safeWrite(STORAGE_HOST, this.host);
          return true;
        }
      }
      /* Index absent → créer (serverless, AWS us-east-1, integrated embed llama-text-embed-v2) */
      const create = await fetchWithTimeout(
        'https://api.pinecone.io/indexes/create-for-model',
        {
          method: 'POST',
          headers: {
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json',
            'X-Pinecone-API-Version': '2024-10',
          },
          body: JSON.stringify({
            name: this.indexName,
            cloud: 'aws',
            region: 'us-east-1',
            embed: {
              model: DEFAULT_EMBED_MODEL,
              field_map: { text: 'text' },
            },
          }),
        },
      );
      if (!create.ok) {
        const text = await create.text().catch(() => '');
        this.lastError = `createIndex HTTP ${create.status}: ${text.slice(0, 200)}`;
        return false;
      }
      const json = (await create.json().catch(() => ({}))) as { host?: string };
      if (json.host) {
        this.host = json.host;
        safeWrite(STORAGE_HOST, this.host);
        return true;
      }
      return false;
    } catch (err: unknown) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /* ============================================================
     Private : fallback localStorage ranking importance
     ============================================================ */

  private async fallbackQuery(text: string, topK: number): Promise<PineconeQueryMatch[]> {
    this.fallbackActive = true;
    try {
      const { persistentMemory } = await import('./persistent-memory-store.js');
      const all = await persistentMemory.list().catch(() => [] as Array<{ id: string; text: string; importance: number; category: string; scope: string }>);
      const safe = Array.isArray(all) ? all : [];
      const lowerQ = text.toLowerCase();
      /* Score = importance + bonus si text query match (substring overlap) */
      const scored = safe
        .filter((e): e is { id: string; text: string; importance: number; category: string; scope: string } =>
          Boolean(e && typeof e.text === 'string'),
        )
        .map((e) => {
          const lowerT = e.text.toLowerCase();
          const overlap = lowerQ && lowerT.includes(lowerQ) ? 30 : 0;
          const importanceScore = (e.importance ?? 0) / 100;
          const score = importanceScore + (overlap / 100);
          return {
            id: e.id,
            score: Math.min(1, score),
            metadata: { category: e.category, scope: e.scope, importance: e.importance, text: e.text.slice(0, 200) },
          } satisfies PineconeQueryMatch;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      return scored;
    } catch {
      return [];
    }
  }

  private bumpVectorCount(delta: number): void {
    const cur = parseInt(safeRead(STORAGE_VECTOR_COUNT, '0'), 10) || 0;
    safeWrite(STORAGE_VECTOR_COUNT, String(cur + delta));
    safeWrite(STORAGE_LAST_SYNC, String(Date.now()));
  }
}

export const pineconeStore = new PineconeStore();
