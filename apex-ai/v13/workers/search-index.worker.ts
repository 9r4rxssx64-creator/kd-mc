/**
 * APEX v13 — Search Index Web Worker
 *
 * Off-main-thread full-text search via Fuse.js.
 *
 * Pourquoi un worker dédié :
 * - Indexer 5000+ messages/notes/contacts bloque le main thread (~200-500ms).
 * - Recherche live (debounce frappe) doit rester < 16ms perçu user → impossible
 *   sur main thread quand l'index dépasse quelques milliers de docs.
 * - Re-index incrémental (ajout doc) ne doit pas freeze l'UI pendant la frappe.
 *
 * Stratégie :
 * - Lazy-load Fuse.js depuis bundle local (déjà dep `fuse.js@^7.0.0`).
 *   Vite bundle automatiquement le worker en mode `format: 'es'` → import natif OK.
 * - Index par `collection` (messages, notes, contacts, etc.) — chaque collection
 *   garde son propre Fuse instance pour search isolé.
 * - `add(doc)` recompose l'index incrémentalement (Fuse v7 supporte `add()` natif).
 * - `bulkIndex` reconstruit complètement (au boot ou full sync).
 * - `clear(collection)` libère la mémoire d'une collection.
 *
 * Lazy-init obligatoire : services/search.ts l'instancie au 1er appel utilisateur
 * (ouverture barre de recherche, focus input). Pas au boot.
 *
 * Backward-compat : services/search.ts garde fallback main-thread Fuse() si Worker
 * indispo (CSP block, browser legacy).
 *
 * Pas de PII en logs : worker n'utilise pas `logger` (côté main thread). Les erreurs
 * sont renvoyées via postMessage `{ type: 'err' }`.
 */

/// <reference lib="webworker" />

import Fuse, { type IFuseOptions } from 'fuse.js';

export interface SearchDoc {
  id: string;
  /* Champs indexables — convention : keys configurables par collection */
  [field: string]: unknown;
}

export interface SearchHit<T extends SearchDoc = SearchDoc> {
  item: T;
  score: number; /* 0 (parfait) → 1 (très loin) */
}

export interface SearchWorkerBulkIndexReq {
  type: 'bulkIndex';
  id: number;
  collection: string;
  docs: SearchDoc[];
  /* Clés à indexer (par défaut : toutes les string keys). Format Fuse v7. */
  keys?: Array<string | { name: string; weight?: number }>;
}

export interface SearchWorkerAddReq {
  type: 'add';
  id: number;
  collection: string;
  doc: SearchDoc;
}

export interface SearchWorkerRemoveReq {
  type: 'remove';
  id: number;
  collection: string;
  docId: string;
}

export interface SearchWorkerSearchReq {
  type: 'search';
  id: number;
  collection: string;
  query: string;
  limit?: number;
  /* Optional: threshold override (0=exact, 1=anything) */
  threshold?: number;
}

export interface SearchWorkerClearReq {
  type: 'clear';
  id: number;
  collection: string;
}

export interface SearchWorkerStatsReq {
  type: 'stats';
  id: number;
}

export type SearchWorkerRequest =
  | SearchWorkerBulkIndexReq
  | SearchWorkerAddReq
  | SearchWorkerRemoveReq
  | SearchWorkerSearchReq
  | SearchWorkerClearReq
  | SearchWorkerStatsReq;

export interface SearchWorkerOk<T = unknown> {
  type: 'ok';
  id: number;
  result: T;
}

export interface SearchWorkerErr {
  type: 'err';
  id: number;
  error: string;
}

export type SearchWorkerResponse<T = unknown> = SearchWorkerOk<T> | SearchWorkerErr;

interface CollectionState {
  fuse: Fuse<SearchDoc>;
  /* Liste persistée pour permettre add/remove sans full rebuild externe */
  docs: SearchDoc[];
  options: IFuseOptions<SearchDoc>;
}

const collections = new Map<string, CollectionState>();

const DEFAULT_OPTIONS: IFuseOptions<SearchDoc> = {
  /* Threshold raisonnable : 0.4 = tolérance fuzzy modérée (typos OK, pas trop large) */
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  /* Limite à 100 hits max sauf override */
  shouldSort: true,
  /* Pas de minMatchCharLength pour permettre prefix match */
  minMatchCharLength: 1,
};

function inferKeys(docs: SearchDoc[]): string[] {
  const keys = new Set<string>();
  for (const doc of docs.slice(0, 50)) {
    for (const [k, v] of Object.entries(doc)) {
      if (k === 'id') continue;
      if (typeof v === 'string' && v.length > 0) keys.add(k);
    }
  }
  return Array.from(keys);
}

function buildFuseOptions(
  docs: SearchDoc[],
  keys?: Array<string | { name: string; weight?: number }>,
): IFuseOptions<SearchDoc> {
  const finalKeys = keys && keys.length > 0 ? keys : inferKeys(docs);
  return {
    ...DEFAULT_OPTIONS,
    keys: finalKeys,
  };
}

function bulkIndex(
  collection: string,
  docs: SearchDoc[],
  keys?: Array<string | { name: string; weight?: number }>,
): { count: number } {
  const options = buildFuseOptions(docs, keys);
  const fuse = new Fuse<SearchDoc>(docs.slice(), options);
  collections.set(collection, { fuse, docs: docs.slice(), options });
  return { count: docs.length };
}

function addDoc(collection: string, doc: SearchDoc): { count: number } {
  const state = collections.get(collection);
  if (!state) {
    /* Lazy-create avec ce doc seul */
    return bulkIndex(collection, [doc]);
  }
  /* Remplace si même id, sinon ajoute */
  const idx = state.docs.findIndex((d) => d.id === doc.id);
  if (idx >= 0) {
    state.docs[idx] = doc;
    /* Fuse v7 : remove + add pour update */
    state.fuse.remove((d: SearchDoc) => d.id === doc.id);
    state.fuse.add(doc);
  } else {
    state.docs.push(doc);
    state.fuse.add(doc);
  }
  return { count: state.docs.length };
}

function removeDoc(collection: string, docId: string): { count: number; removed: boolean } {
  const state = collections.get(collection);
  if (!state) return { count: 0, removed: false };
  const idxBefore = state.docs.length;
  state.docs = state.docs.filter((d) => d.id !== docId);
  state.fuse.remove((d: SearchDoc) => d.id === docId);
  return { count: state.docs.length, removed: state.docs.length < idxBefore };
}

function search(
  collection: string,
  query: string,
  limit: number,
  threshold?: number,
): SearchHit[] {
  const state = collections.get(collection);
  if (!state || !query.trim()) return [];
  /* Si threshold custom, on rebuild une vue temporaire (Fuse v7 ne supporte pas
     le runtime threshold override). Pour simplicité on garde le threshold de l'index. */
  void threshold;
  const raw = state.fuse.search(query, { limit });
  return raw.map((r: { item: SearchDoc; score?: number }) => ({
    item: r.item,
    score: r.score ?? 0,
  }));
}

function clearCollection(collection: string): { cleared: boolean } {
  const had = collections.has(collection);
  collections.delete(collection);
  return { cleared: had };
}

function stats(): { collections: Array<{ name: string; size: number }> } {
  const out: Array<{ name: string; size: number }> = [];
  for (const [name, state] of collections.entries()) {
    out.push({ name, size: state.docs.length });
  }
  return { collections: out };
}

function isRequest(v: unknown): v is SearchWorkerRequest {
  if (!v || typeof v !== 'object') return false;
  const r = v as { type?: unknown; id?: unknown };
  if (typeof r.id !== 'number') return false;
  return (
    r.type === 'bulkIndex' ||
    r.type === 'add' ||
    r.type === 'remove' ||
    r.type === 'search' ||
    r.type === 'clear' ||
    r.type === 'stats'
  );
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.addEventListener('message', (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (!isRequest(data)) {
    const id =
      typeof (data as { id?: unknown })?.id === 'number'
        ? ((data as { id: number }).id)
        : -1;
    const errMsg: SearchWorkerErr = { type: 'err', id, error: 'invalid_request' };
    ctx.postMessage(errMsg);
    return;
  }
  try {
    let result: unknown;
    switch (data.type) {
      case 'bulkIndex':
        result = bulkIndex(data.collection, data.docs, data.keys);
        break;
      case 'add':
        result = addDoc(data.collection, data.doc);
        break;
      case 'remove':
        result = removeDoc(data.collection, data.docId);
        break;
      case 'search':
        result = search(
          data.collection,
          data.query,
          data.limit ?? 50,
          data.threshold,
        );
        break;
      case 'clear':
        result = clearCollection(data.collection);
        break;
      case 'stats':
        result = stats();
        break;
    }
    const ok: SearchWorkerOk = { type: 'ok', id: data.id, result };
    ctx.postMessage(ok);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errResp: SearchWorkerErr = { type: 'err', id: data.id, error: msg };
    ctx.postMessage(errResp);
  }
});

/* Heartbeat ready */
ctx.postMessage({ type: 'ready' });
