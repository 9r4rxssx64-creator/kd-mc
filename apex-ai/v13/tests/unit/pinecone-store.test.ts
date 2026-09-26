/**
 * APEX v13 — pinecone-store tests (Kevin 2026-05-08).
 *
 * Couvre :
 *  - Init sans clé → fallback localStorage actif
 *  - Init avec clé + describeIndex OK → reachable
 *  - Query avec Pinecone KO → fallback ranking importance
 *  - Upsert avec values directes → POST /vectors/upsert
 *  - Resync depuis localStorage facts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Mock vault.readKey pour contrôler la présence de la clé Pinecone */
vi.mock('../../services/vault/vault.js', () => ({
  vault: {
    readKey: vi.fn(async (k: string): Promise<string> => {
      if (k === 'ax_pinecone_key') return globalThis.__pineconeKey ?? '';
      return '';
    }),
  },
}));

/* Mock persistent-memory-store pour fallback + resync */
vi.mock('../../services/storage/persistent-memory-store.js', () => ({
  persistentMemory: {
    list: vi.fn(async (): Promise<unknown[]> => globalThis.__pmemList ?? []),
  },
}));

/* Mock logger */
vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

declare global {
   
  var __pineconeKey: string | undefined;
   
  var __pmemList: unknown[] | undefined;
}

describe('PineconeStore — fallback gracieux', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    globalThis.__pineconeKey = undefined;
    globalThis.__pmemList = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('init() sans clé → fallback actif, pas de crash', async () => {
    const { pineconeStore } = await import('../../services/storage/pinecone-store.js');
    const ok = await pineconeStore.init();
    expect(ok).toBe(false);
    const status = await pineconeStore.getStatus();
    expect(status.configured).toBe(false);
    expect(status.fallback_active).toBe(true);
    expect(status.reachable).toBe(false);
  });

  it('query() sans clé → utilise fallback localStorage facts ranking', async () => {
    globalThis.__pmemList = [
      { id: 'f1', text: 'Kevin habite Monaco', importance: 90, category: 'profile', scope: 'kevin' },
      { id: 'f2', text: 'Allergie fruits de mer', importance: 95, category: 'profile', scope: 'kevin' },
      { id: 'f3', text: 'Casino game blackjack', importance: 30, category: 'facts', scope: 'kevin' },
    ];
    const { pineconeStore } = await import('../../services/storage/pinecone-store.js');
    const matches = await pineconeStore.query({ text: 'Monaco', topK: 2 });
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    /* fact1 doit être en tête (importance 90 + match 'Monaco') */
    expect(matches[0]?.id).toBe('f1');
    /* La 2e doit avoir un score >= 0 (importance 95 sans match texte) */
    expect(matches[1]?.score).toBeGreaterThanOrEqual(0);
  });

  it('init() avec clé + describeIndex OK → reachable + host stocké', async () => {
    globalThis.__pineconeKey = 'pc-test-key-1234567890';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/indexes/apex-memory')) {
        return new Response(JSON.stringify({ host: 'apex-memory-abc.svc.aped-1234-test.pinecone.io' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { pineconeStore } = await import('../../services/storage/pinecone-store.js');
    const ok = await pineconeStore.init();
    expect(ok).toBe(true);
    const status = await pineconeStore.getStatus();
    expect(status.configured).toBe(true);
    expect(status.reachable).toBe(true);
    expect(status.fallback_active).toBe(false);
    expect(status.index_name).toBe('apex-memory');
  });

  it('upsertVectors() avec values directes → POST /vectors/upsert OK', async () => {
    globalThis.__pineconeKey = 'pc-test-key';
    let upsertBody = '';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/indexes/apex-memory')) {
        return new Response(JSON.stringify({ host: 'host.pinecone.io' }), { status: 200 });
      }
      if (url.includes('/vectors/upsert')) {
        upsertBody = String(init?.body ?? '');
        return new Response(JSON.stringify({ upsertedCount: 2 }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { pineconeStore } = await import('../../services/storage/pinecone-store.js');
    const r = await pineconeStore.upsertVectors([
      { id: 'v1', values: [0.1, 0.2, 0.3], metadata: { cat: 'test' } },
      { id: 'v2', values: [0.4, 0.5, 0.6] },
    ]);
    expect(r.ok).toBe(true);
    expect(r.upserted).toBe(2);
    expect(upsertBody).toContain('v1');
    expect(upsertBody).toContain('v2');
  });

  it('resyncFromLocalFacts() pousse facts → Pinecone par batches', async () => {
    globalThis.__pineconeKey = 'pc-test-key';
    globalThis.__pmemList = Array.from({ length: 150 }, (_, i) => ({
      id: `mem_${i}`,
      text: `Fact ${i} test data`,
      importance: 50,
      category: 'facts',
      scope: 'kevin',
    }));
    let upsertCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/indexes/apex-memory')) {
        return new Response(JSON.stringify({ host: 'host.pinecone.io' }), { status: 200 });
      }
      if (url.includes('/records/namespaces/__default__/upsert')) {
        upsertCalls += 1;
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { pineconeStore } = await import('../../services/storage/pinecone-store.js');
    /* Force re-init pour prendre en compte la clé mockée */
    await pineconeStore.reload();
    const r = await pineconeStore.resyncFromLocalFacts();
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(150);
    /* 150 facts / batches de 100 → 2 calls */
    expect(upsertCalls).toBe(2);
  });

  it('query() avec réseau KO → fallback localStorage ranking', async () => {
    globalThis.__pineconeKey = 'pc-test-key';
    globalThis.__pmemList = [
      { id: 'f1', text: 'important fact', importance: 80, category: 'profile', scope: 'kevin' },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/indexes/apex-memory')) {
        return new Response(JSON.stringify({ host: 'host.pinecone.io' }), { status: 200 });
      }
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { pineconeStore } = await import('../../services/storage/pinecone-store.js');
    await pineconeStore.reload();
    const matches = await pineconeStore.query({ text: 'important', topK: 5 });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]?.id).toBe('f1');
  });
});
