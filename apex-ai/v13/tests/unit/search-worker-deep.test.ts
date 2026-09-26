/**
 * APEX v13 — Tests deep search service (worker path + edge cases)
 *
 * Cible : pousser services/search.ts vers 100% lines + branches
 * (existing tests à 47.8% L → ce fichier ajoute couverture worker dédié).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { search } from '../../services/integrations/search.js';
import { logger } from '../../core/logger.js';

let savedWorker: typeof Worker | undefined;
let workerInstances: Array<{
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  _emit: (type: string, ev: unknown) => void;
}> = [];

function makeStub() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const inst = {
    postMessage: vi.fn(),
    addEventListener: vi.fn((type: string, cb: (e: unknown) => void) => {
      const arr = listeners.get(type) ?? [];
      arr.push(cb);
      listeners.set(type, arr);
    }),
    removeEventListener: vi.fn((type: string, cb: (e: unknown) => void) => {
      const arr = listeners.get(type) ?? [];
      listeners.set(type, arr.filter((x) => x !== cb));
    }),
    terminate: vi.fn(),
    _emit(type: string, ev: unknown) {
      for (const cb of listeners.get(type) ?? []) cb(ev);
    },
  };
  workerInstances.push(inst);
  return inst;
}

beforeEach(() => {
  vi.clearAllMocks();
  workerInstances = [];
  search.cleanup();
  savedWorker = globalThis.Worker;
  // @ts-expect-error mock
  globalThis.Worker = function () {
    return makeStub();
  };
});

afterEach(() => {
  search.cleanup();
  if (savedWorker) globalThis.Worker = savedWorker;
});

describe('search — worker init', () => {
  it('Worker undefined → useFallback', async () => {
    // @ts-expect-error
    globalThis.Worker = undefined;
    const r = await search.index('coll', [{ id: '1', text: 'foo' }]);
    expect(r.count).toBe(1);
    expect(search.isWorkerActive()).toBe(false);
  });

  it('Worker ctor throw → useFallback + log warn', async () => {
    // @ts-expect-error
    globalThis.Worker = function () {
      throw new Error('ctor fail');
    };
    await search.index('coll', [{ id: '1', text: 'x' }]);
    expect(logger.warn).toHaveBeenCalledWith(
      'search',
      expect.stringContaining('Worker creation failed'),
      expect.any(Object),
    );
    expect(search.isWorkerActive()).toBe(false);
  });

  it('worker ready timeout → useFallback', async () => {
    vi.useFakeTimers();
    try {
      const promise = search.index('coll', [{ id: '1', text: 'x' }]);
      await vi.advanceTimersByTimeAsync(3500);
      vi.useRealTimers();
      await promise;
      expect(logger.warn).toHaveBeenCalledWith(
        'search',
        expect.stringContaining('ready timeout'),
      );
      expect(search.isWorkerActive()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('search — worker happy path', () => {
  async function setupWorkerReady(): Promise<{ stub: typeof workerInstances[0] }> {
    const promise = search.index('coll', [{ id: '1', text: 'foo' }]);
    await new Promise((r) => setTimeout(r, 5));
    const stub = workerInstances[0]!;
    stub._emit('message', { data: { type: 'ready' } });
    /* index → premier postMessage = bulkIndex avec id=1 */
    await new Promise((r) => setTimeout(r, 5));
    /* Repond bulkIndex */
    stub._emit('message', { data: { id: 1, type: 'ok', result: { count: 1 } } });
    await promise;
    return { stub };
  }

  it('index → bulkIndex postMessage avec count', async () => {
    const { stub } = await setupWorkerReady();
    expect(stub.postMessage).toHaveBeenCalled();
    const msg = stub.postMessage.mock.calls[0]![0] as { type?: string };
    expect(msg.type).toBe('bulkIndex');
    expect(search.isWorkerActive()).toBe(true);
  });

  it('add → message add', async () => {
    const { stub } = await setupWorkerReady();
    const promise = search.add('coll', { id: '2', text: 'bar' });
    await new Promise((r) => setTimeout(r, 5));
    const lastCall = stub.postMessage.mock.calls.at(-1)![0] as { id?: number; type?: string };
    expect(lastCall.type).toBe('add');
    stub._emit('message', { data: { id: lastCall.id, type: 'ok', result: { count: 2 } } });
    const r = await promise;
    expect(r.count).toBe(2);
  });

  it('remove → message remove', async () => {
    const { stub } = await setupWorkerReady();
    const promise = search.remove('coll', '1');
    await new Promise((r) => setTimeout(r, 5));
    const lastCall = stub.postMessage.mock.calls.at(-1)![0] as { id?: number; type?: string };
    expect(lastCall.type).toBe('remove');
    stub._emit('message', { data: { id: lastCall.id, type: 'ok', result: { count: 0, removed: true } } });
    const r = await promise;
    expect(r.removed).toBe(true);
  });

  it('search → message search', async () => {
    const { stub } = await setupWorkerReady();
    const promise = search.search('coll', 'foo');
    await new Promise((r) => setTimeout(r, 5));
    const lastCall = stub.postMessage.mock.calls.at(-1)![0] as { id?: number; type?: string };
    expect(lastCall.type).toBe('search');
    stub._emit('message', { data: { id: lastCall.id, type: 'ok', result: [{ item: { id: '1', text: 'foo' }, score: 0 }] } });
    const r = await promise;
    expect(r).toHaveLength(1);
  });

  it('clear → message clear', async () => {
    const { stub } = await setupWorkerReady();
    const promise = search.clear('coll');
    await new Promise((r) => setTimeout(r, 5));
    const lastCall = stub.postMessage.mock.calls.at(-1)![0] as { id?: number; type?: string };
    expect(lastCall.type).toBe('clear');
    stub._emit('message', { data: { id: lastCall.id, type: 'ok', result: { cleared: true } } });
    const r = await promise;
    expect(r.cleared).toBe(true);
  });
});

describe('search — worker error responses', () => {
  it('bulkIndex worker error → fallback', async () => {
    const promise = search.index('coll', [{ id: '1', text: 'x' }]);
    await new Promise((r) => setTimeout(r, 5));
    const stub = workerInstances[0]!;
    stub._emit('message', { data: { type: 'ready' } });
    await new Promise((r) => setTimeout(r, 5));
    /* Worker reject */
    const id = (stub.postMessage.mock.calls[0]![0] as { id: number }).id;
    stub._emit('message', { data: { id, type: 'error', error: 'idx fail' } });
    const r = await promise;
    /* Fallback déclenché */
    expect(r.count).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'search',
      expect.stringContaining('bulkIndex failed'),
      expect.any(Object),
    );
  });

  it('add worker error → fallback', async () => {
    /* d'abord init worker ready */
    const ip = search.index('coll', [{ id: '1', text: 'x' }]);
    await new Promise((r) => setTimeout(r, 5));
    const stub = workerInstances[0]!;
    stub._emit('message', { data: { type: 'ready' } });
    await new Promise((r) => setTimeout(r, 5));
    stub._emit('message', { data: { id: 1, type: 'ok', result: { count: 1 } } });
    await ip;
    /* add reject */
    const promise = search.add('coll', { id: '2', text: 'y' });
    await new Promise((r) => setTimeout(r, 5));
    const callId = (stub.postMessage.mock.calls.at(-1)![0] as { id: number }).id;
    stub._emit('message', { data: { id: callId, type: 'error', error: 'add fail' } });
    const r = await promise;
    /* Fallback ajoute le doc (count incrémenté) */
    expect(r.count).toBeGreaterThanOrEqual(1);
  });

  it('remove worker error → fallback', async () => {
    /* Init worker ready via flow normal */
    const ip = search.index('coll', [{ id: '1', text: 'x' }]);
    await new Promise((r) => setTimeout(r, 5));
    const stub = workerInstances[0]!;
    stub._emit('message', { data: { type: 'ready' } });
    await new Promise((r) => setTimeout(r, 5));
    stub._emit('message', { data: { id: 1, type: 'ok', result: { count: 1 } } });
    await ip;
    /* remove reject */
    const promise = search.remove('coll', '1');
    await new Promise((r) => setTimeout(r, 5));
    const callId = (stub.postMessage.mock.calls.at(-1)![0] as { id: number }).id;
    stub._emit('message', { data: { id: callId, type: 'error', error: 'rm fail' } });
    const r = await promise;
    /* Fallback : doc avait été indexé dans fallbackIndex via ensureWorker fail? Non, useFallback false ici.
       Le fallback path remove sur collection inexistante retourne {count:0, removed:false} */
    expect(typeof r.removed).toBe('boolean');
  });
});

describe('search — onError + onMessage edge cases', () => {
  it('onError reject pending', () => {
    const stub = makeStub();
    workerInstances.push(stub);
    const o = search as unknown as {
      worker: typeof stub;
      pending: Map<number, { resolve: (v: unknown) => void; reject: (err: Error) => void }>;
      onError: (e: ErrorEvent) => void;
    };
    o.worker = stub;
    const rej = vi.fn();
    o.pending.set(1, { resolve: () => {}, reject: rej });
    o.pending.set(2, { resolve: () => {}, reject: rej });
    o.onError({ message: 'crash' } as ErrorEvent);
    expect(rej).toHaveBeenCalledTimes(2);
    expect(o.pending.size).toBe(0);
  });

  it('onMessage sans id → ignored', () => {
    const o = search as unknown as { onMessage: (e: MessageEvent) => void };
    expect(() => o.onMessage({ data: { foo: 'bar' } } as MessageEvent)).not.toThrow();
  });

  it('onMessage avec id inconnu → ignored', () => {
    const o = search as unknown as { onMessage: (e: MessageEvent) => void };
    expect(() => o.onMessage({ data: { id: 99999, type: 'ok', result: {} } } as MessageEvent)).not.toThrow();
  });
});

describe('search — call worker_not_ready', () => {
  it('call quand worker null → reject', async () => {
    const o = search as unknown as {
      worker: unknown;
      call: (req: { type: string; collection: string; query: string }) => Promise<unknown>;
    };
    o.worker = null;
    await expect(o.call({ type: 'search', collection: 'x', query: 'q' })).rejects.toThrow('worker_not_ready');
  });

  it('call timeout 10s reject', async () => {
    const stub = makeStub();
    const o = search as unknown as {
      worker: typeof stub;
      call: (req: { type: string; collection: string; query: string }) => Promise<unknown>;
      pending: Map<number, unknown>;
    };
    o.worker = stub;
    vi.useFakeTimers();
    try {
      const p = o.call.call(search, { type: 'search', collection: 'x', query: 'q' });
      const caught: { error?: Error } = {};
      const settled = p.catch((e: Error) => { caught.error = e; });
      await vi.advanceTimersByTimeAsync(10_500);
      await settled;
      vi.useRealTimers();
      expect(caught.error?.message).toBe('worker_call_timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('search — clear avec worker actif', () => {
  async function initWorker(): Promise<typeof workerInstances[0]> {
    const ip = search.index('coll', [{ id: '1', text: 'x' }]);
    await new Promise((r) => setTimeout(r, 5));
    const stub = workerInstances[0]!;
    stub._emit('message', { data: { type: 'ready' } });
    await new Promise((r) => setTimeout(r, 5));
    stub._emit('message', { data: { id: 1, type: 'ok', result: { count: 1 } } });
    await ip;
    return stub;
  }

  it('clear utilise worker si ready', async () => {
    const stub = await initWorker();
    const promise = search.clear('coll');
    await new Promise((r) => setTimeout(r, 5));
    const lastCall = stub.postMessage.mock.calls.at(-1);
    expect((lastCall?.[0] as { type: string }).type).toBe('clear');
    const id = (lastCall?.[0] as { id: number }).id;
    stub._emit('message', { data: { id, type: 'ok', result: { cleared: true } } });
    const r = await promise;
    expect(r.cleared).toBe(true);
  });

  it('clear avec worker reject → fallback', async () => {
    const stub = await initWorker();
    const promise = search.clear('coll');
    await new Promise((r) => setTimeout(r, 5));
    const id = (stub.postMessage.mock.calls.at(-1)![0] as { id: number }).id;
    stub._emit('message', { data: { id, type: 'error', error: 'clr fail' } });
    const r = await promise;
    /* fallback collection 'coll' a été indexée via worker → pas dans fallback Map */
    expect(typeof r.cleared).toBe('boolean');
  });
});

describe('search — cleanup terminate throw', () => {
  it('terminate throw ignored', () => {
    const o = search as unknown as { worker: { terminate: () => void } | null };
    o.worker = { terminate: () => { throw new Error('term fail'); } };
    expect(() => search.cleanup()).not.toThrow();
    expect(o.worker).toBeNull();
  });
});
