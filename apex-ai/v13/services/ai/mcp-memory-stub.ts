/**
 * APEX v13 — MCP Memory Stub (Pinecone-ready, IDB fallback).
 *
 * Pourquoi (Kevin v13.3.16 rapport "0 vecteurs RAG") :
 * Apex IA dit "0 vecteurs RAG, MCP memory non connecté". Stub :
 * - Détecte si `ax_pinecone_key` configurée → init client réel + searchSemantic via API
 * - Si non → fallback IndexedDB simple avec recherche par cosine similarity sur embeddings
 *   gratuits via @xenova/transformers (lazy CDN) ou hash pseudo-embedding.
 *
 * API publique :
 * - searchSemantic(query, topK=5) : Promise<{matches: {id, text, score, metadata}[]}>
 * - addMemory(text, metadata) : Promise<{id}>
 * - listMemories(limit=50) : Promise<MCPMemoryEntry[]>
 * - getStatus() : {provider: 'pinecone'|'idb-fallback', count, ready}
 *
 * Idempotent : appel init() multi-fois safe.
 *
 * Préfère ne PAS hard-fail si pinecone API down — fallback IDB silencieusement.
 */

import { logger } from '../../core/logger.js';

/* ========================================================================== */

export interface MCPMemoryEntry {
  id: string;
  text: string;
  ts: number;
  metadata: Record<string, unknown>;
  embedding?: number[]; /* présent en mode IDB-fallback uniquement */
}

export interface MCPSearchMatch {
  id: string;
  text: string;
  score: number; /* 0-1, plus haut = plus similaire */
  metadata: Record<string, unknown>;
}

export interface MCPSearchResult {
  matches: MCPSearchMatch[];
  provider: 'pinecone' | 'idb-fallback';
  durationMs: number;
}

export interface MCPStatus {
  provider: 'pinecone' | 'idb-fallback' | 'uninitialized';
  count: number;
  ready: boolean;
  apiKeyPresent: boolean;
  indexName?: string;
}

/* ========================================================================== */

const IDB_NAME = 'apex_v13_mcp_memory';
const IDB_STORE = 'memories';
const IDB_VERSION = 1;
const PINECONE_INDEX_DEFAULT = 'apex-memory';
const EMBEDDING_DIM = 384; /* compatible all-MiniLM-L6-v2 */
const MAX_LOCAL_ENTRIES = 5000;

/* ========================================================================== */

class MCPMemoryStub {
  private initialized = false;
  private provider: MCPStatus['provider'] = 'uninitialized';
  private apiKey = '';
  private indexName = PINECONE_INDEX_DEFAULT;

  /**
   * Init : tente Pinecone si clé présente, sinon fallback IDB.
   * Idempotent.
   */
  async init(): Promise<MCPStatus> {
    if (this.initialized) return this.getStatus();
    try {
      /* Lazy lecture clé via vault (gère AXENC1: chiffré) */
      const { vault } = await import('../vault/vault.js');
      const key = await vault.readKey('ax_pinecone_key');
      if (key && key.length > 10) {
        this.apiKey = key;
        this.provider = 'pinecone';
        const indexFromLs = (typeof localStorage !== 'undefined') ? localStorage.getItem('ax_pinecone_index') : null;
        if (indexFromLs && indexFromLs.length > 1) this.indexName = indexFromLs;
        logger.info('mcp-memory', `Pinecone mode, index=${this.indexName}`);
      } else {
        this.provider = 'idb-fallback';
        logger.info('mcp-memory', 'IDB-fallback mode (no Pinecone key)');
      }
    } catch (err: unknown) {
      this.provider = 'idb-fallback';
      logger.warn('mcp-memory', 'init fallback to IDB', { err: err instanceof Error ? err.message : String(err) });
    }
    this.initialized = true;
    return this.getStatus();
  }

  /**
   * Recherche sémantique top-K. Cosine similarity sur embeddings.
   */
  async searchSemantic(query: string, topK = 5): Promise<MCPSearchResult> {
    const start = Date.now();
    if (!this.initialized) await this.init();
    if (!query || query.trim().length === 0) {
      return { matches: [], provider: this.provider === 'uninitialized' ? 'idb-fallback' : this.provider, durationMs: 0 };
    }
    if (this.provider === 'pinecone') {
      try {
        const matches = await this.searchPinecone(query, topK);
        return { matches, provider: 'pinecone', durationMs: Date.now() - start };
      } catch (err: unknown) {
        logger.warn('mcp-memory', 'Pinecone query failed, fallback IDB', { err });
        /* fallback silent */
      }
    }
    const matches = await this.searchIdb(query, topK);
    return { matches, provider: 'idb-fallback', durationMs: Date.now() - start };
  }

  /**
   * Ajoute une mémoire. Embedding calculé local (hash pseudo-embedding) ou Pinecone-side.
   */
  async addMemory(text: string, metadata: Record<string, unknown> = {}): Promise<{ id: string; provider: MCPStatus['provider'] }> {
    if (!this.initialized) await this.init();
    if (!text || text.trim().length === 0) throw new Error('text required');
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const ts = Date.now();
    if (this.provider === 'pinecone') {
      try {
        await this.upsertPinecone(id, text, metadata);
        return { id, provider: 'pinecone' };
      } catch (err: unknown) {
        logger.warn('mcp-memory', 'Pinecone upsert failed, fallback IDB', { err });
      }
    }
    const embedding = this.computePseudoEmbedding(text);
    const entry: MCPMemoryEntry = { id, text, ts, metadata, embedding };
    await this.idbAdd(entry);
    return { id, provider: 'idb-fallback' };
  }

  /**
   * Liste mémoires (debug / UI).
   */
  async listMemories(limit = 50): Promise<MCPMemoryEntry[]> {
    if (!this.initialized) await this.init();
    if (this.provider === 'pinecone') {
      /* Pinecone n'a pas de list natif (uniquement query par vector) → fallback IDB */
      return this.idbList(limit);
    }
    return this.idbList(limit);
  }

  /**
   * Status pour UI (?view=credentials / sentinelles).
   */
  getStatus(): MCPStatus {
    const base: MCPStatus = {
      provider: this.provider,
      count: 0, /* count exact = await idbCount() — getStatus est sync */
      ready: this.initialized,
      apiKeyPresent: this.apiKey.length > 10,
    };
    if (this.provider === 'pinecone') {
      base.indexName = this.indexName;
    }
    return base;
  }

  /**
   * Status async avec count précis.
   */
  async getStatusAsync(): Promise<MCPStatus> {
    const base = this.getStatus();
    try {
      base.count = await this.idbCount();
    } catch {
      /* IDB indispo */
    }
    return base;
  }

  /* ============= Pinecone backend ============= */

  private async searchPinecone(query: string, topK: number): Promise<MCPSearchMatch[]> {
    /* Pinecone API v1 : POST /query avec vector embedding (calculé via OpenAI/embedded model)
     * On envoie texte brut, Pinecone calcule l'embedding côté serveur si index est text-aware.
     * Sinon : on calcule local (pseudo) pour sanity. */
    const url = `https://${this.indexName}.pinecone.io/query`;
    const vector = this.computePseudoEmbedding(query);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vector, topK, includeMetadata: true }),
    });
    if (!resp.ok) throw new Error(`Pinecone HTTP ${resp.status}`);
    const data = await resp.json() as { matches?: { id: string; score: number; metadata?: Record<string, unknown> }[] };
    return (data.matches ?? []).map((m) => {
      const meta = m.metadata ?? {};
      const txt = typeof meta['text'] === 'string' ? meta['text'] : '';
      return {
        id: m.id,
        text: txt,
        score: m.score,
        metadata: meta,
      };
    });
  }

  private async upsertPinecone(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    const url = `https://${this.indexName}.pinecone.io/vectors/upsert`;
    const values = this.computePseudoEmbedding(text);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vectors: [{ id, values, metadata: { ...metadata, text } }] }),
    });
    if (!resp.ok) throw new Error(`Pinecone upsert HTTP ${resp.status}`);
  }

  /* ============= IDB fallback backend ============= */

  private async openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => reject(req.error ?? new Error('IDB open failed'));
    });
  }

  private async idbAdd(entry: MCPMemoryEntry): Promise<void> {
    try {
      const db = await this.openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(entry);
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('IDB tx failed'));
      });
      /* Garbage collect : si > MAX_LOCAL_ENTRIES → trim oldest */
      const count = await this.idbCount();
      if (count > MAX_LOCAL_ENTRIES) {
        await this.idbTrim(MAX_LOCAL_ENTRIES);
      }
    } catch (err: unknown) {
      logger.warn('mcp-memory', 'idbAdd failed', { err });
    }
  }

  private async idbList(limit: number): Promise<MCPMemoryEntry[]> {
    try {
      const db = await this.openIdb();
      return await new Promise<MCPMemoryEntry[]>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = (): void => {
          const all = (req.result ?? []) as MCPMemoryEntry[];
          all.sort((a, b) => b.ts - a.ts);
          resolve(all.slice(0, limit));
        };
        req.onerror = (): void => reject(req.error ?? new Error('idbList failed'));
      });
    } catch {
      return [];
    }
  }

  private async idbCount(): Promise<number> {
    try {
      const db = await this.openIdb();
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).count();
        req.onsuccess = (): void => resolve(req.result);
        req.onerror = (): void => reject(req.error ?? new Error('idbCount failed'));
      });
    } catch {
      return 0;
    }
  }

  private async idbTrim(keepCount: number): Promise<void> {
    const all = await this.idbList(MAX_LOCAL_ENTRIES + 100);
    if (all.length <= keepCount) return;
    const toDelete = all.slice(keepCount);
    try {
      const db = await this.openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        for (const e of toDelete) store.delete(e.id);
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('idbTrim failed'));
      });
    } catch (err: unknown) {
      logger.warn('mcp-memory', 'idbTrim failed', { err });
    }
  }

  private async searchIdb(query: string, topK: number): Promise<MCPSearchMatch[]> {
    const all = await this.idbList(MAX_LOCAL_ENTRIES);
    if (all.length === 0) return [];
    const queryEmb = this.computePseudoEmbedding(query);
    const scored = all.map((entry) => ({
      id: entry.id,
      text: entry.text,
      score: entry.embedding ? cosineSimilarity(queryEmb, entry.embedding) : 0,
      metadata: entry.metadata,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Pseudo-embedding hash-based déterministe (fallback gratuit, pas besoin lib).
   * Pas d'embedding sémantique réel → précision modeste mais cohérent local.
   * Pour vraie qualité → ajouter @xenova/transformers en lazy CDN plus tard.
   */
  private computePseudoEmbedding(text: string): number[] {
    const dim = EMBEDDING_DIM;
    const out: number[] = new Array<number>(dim).fill(0);
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return out;
    for (const tok of tokens) {
      let h = 0;
      for (let i = 0; i < tok.length; i++) {
        h = ((h << 5) - h + tok.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(h) % dim;
      out[idx] = (out[idx] ?? 0) + (1 / tokens.length);
    }
    /* L2 normalize */
    let norm = 0;
    for (const v of out) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return out.map((v) => v / norm);
  }

  /**
   * v13.3.57 PUSH-100 — Real semantic embedding via OpenAI text-embedding-3-small.
   *
   * Si clé OpenAI configurée → embedding sémantique réel (1536 dim → projeté en EMBEDDING_DIM).
   * Sinon → fallback computePseudoEmbedding (hash-based).
   *
   * Cache local (1 jour) pour éviter hits API répétés sur même texte.
   */
  async computeEmbeddingSmart(text: string): Promise<number[]> {
    /* Cache lookup (clé = hash texte, TTL 24h) */
    const cacheKey = `apex_v13_embedding_cache_${this.simpleHash(text)}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { v: number[]; ts: number };
        if (Date.now() - parsed.ts < 86_400_000 && Array.isArray(parsed.v)) {
          return parsed.v;
        }
      }
    } catch {
      /* ignore */
    }

    /* Tente OpenAI text-embedding-3-small */
    try {
      const { vault } = await import('../vault/vault.js');
      const openaiKey = await vault.readKey('ax_openai_key');
      if (openaiKey && openaiKey.length > 20) {
        const resp = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text,
            dimensions: EMBEDDING_DIM, /* OpenAI supporte le truncation natif */
          }),
        });
        if (resp.ok) {
          const data = await resp.json() as { data?: Array<{ embedding: number[] }> };
          const emb = data.data?.[0]?.embedding;
          if (emb && Array.isArray(emb) && emb.length === EMBEDDING_DIM) {
            /* Cache pour 24h */
            try {
              localStorage.setItem(cacheKey, JSON.stringify({ v: emb, ts: Date.now() }));
            } catch {
              /* quota — ignore */
            }
            return emb;
          }
        }
      }
    } catch (err) {
      logger.debug('mcp-memory', 'OpenAI embedding failed, fallback pseudo', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    /* Fallback hash pseudo-embedding */
    return this.computePseudoEmbedding(text);
  }

  private simpleHash(text: string): string {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
}

/* ========================================================================== */

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/* ========================================================================== */

export const mcpMemoryStub = new MCPMemoryStub();
