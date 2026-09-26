/**
 * APEX v13 — Tests deep ocr-offline (worker dédié + main-thread fallback)
 *
 * Cible : pousser services/ocr-offline.ts vers 100% lines + branches
 * (existing tests à 43% L → ce fichier ajoute couverture worker dédié + edge cases).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { ocrOffline } from '../../services/ai/ocr-offline.js';
import { logger } from '../../core/logger.js';

let savedWorker: typeof Worker | undefined;
let workerInstances: Array<{
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  _listeners: Map<string, Array<(e: unknown) => void>>;
  _emit: (type: string, ev: unknown) => void;
}> = [];

function makeStubWorker() {
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
    _listeners: listeners,
    _emit(type: string, ev: unknown) {
      for (const cb of listeners.get(type) ?? []) cb(ev);
    },
  };
  workerInstances.push(inst);
  return inst;
}

beforeEach(async () => {
  vi.clearAllMocks();
  workerInstances = [];
  await ocrOffline.cleanup();
  /* Reset internals */
  const o = ocrOffline as unknown as {
    dedicatedReady: boolean;
    dedicatedPermFail: boolean;
    dedicatedInitPromise: Promise<boolean> | null;
    dedicatedWorker: unknown;
    dedicatedPending: Map<number, unknown>;
    dedicatedNextId: number;
  };
  o.dedicatedReady = false;
  o.dedicatedPermFail = false;
  o.dedicatedInitPromise = null;
  o.dedicatedWorker = null;
  o.dedicatedPending = new Map();
  o.dedicatedNextId = 1;

  /* Stub Worker constructor */
  savedWorker = globalThis.Worker;
  // @ts-expect-error mock
  globalThis.Worker = function () {
    return makeStubWorker();
  };
});

afterEach(async () => {
  await ocrOffline.cleanup();
  if (savedWorker) globalThis.Worker = savedWorker;
});

describe('ocr-offline — dedicated worker path (success)', () => {
  it('worker init + recognize OK → ok=true text correct', async () => {
    const promise = ocrOffline.recognizeText('data:image/png;base64,abc');
    /* Attendre que worker soit créé puis émettre 'ready' */
    await new Promise((r) => setTimeout(r, 5));
    const w = workerInstances[0];
    expect(w).toBeTruthy();
    /* Emit 'ready' pour init OK */
    w!._emit('message', { data: { type: 'ready' } });
    /* Attendre que callDedicated postMessage soit fait */
    await new Promise((r) => setTimeout(r, 5));
    /* Trouve l'id du dernier postMessage */
    const lastCall = w!.postMessage.mock.calls.at(-1);
    const id = (lastCall?.[0] as { id?: number })?.id;
    expect(typeof id).toBe('number');
    /* Emit response 'ok' */
    w!._emit('message', {
      data: {
        id,
        type: 'ok',
        result: { text: 'Bonjour', confidence: 0.9, latency_ms: 100, lang: 'fra+eng' },
      },
    });
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(r.text).toBe('Bonjour');
    expect(r.confidence).toBe(0.9);
  });

  it('worker error response → fallback main-thread tenté', async () => {
    const promise = ocrOffline.recognizeText('data:image/png;base64,xxx', { timeoutMs: 100 });
    await new Promise((r) => setTimeout(r, 5));
    const w = workerInstances[0]!;
    w._emit('message', { data: { type: 'ready' } });
    await new Promise((r) => setTimeout(r, 5));
    const id = (w.postMessage.mock.calls.at(-1)![0] as { id?: number }).id;
    w._emit('message', { data: { id, type: 'error', error: 'recognize_failed' } });
    /* Attend fallback main-thread (qui va échouer car tesseract pas vraiment chargé) */
    const r = await promise;
    /* Le fallback main-thread va échouer mais le test vérifie que le worker error
       a bien déclenché le path fallback (logger.warn appelé) */
    expect(logger.warn).toHaveBeenCalledWith(
      'ocr-offline',
      expect.stringContaining('worker recognize failed'),
      expect.any(Object),
    );
    expect(r.source).toBe('tesseract-offline');
  });
});

describe('ocr-offline — dedicated worker init failures', () => {
  it('Worker undefined → permFail + fallback', async () => {
    // @ts-expect-error
    globalThis.Worker = undefined;
    const r = await ocrOffline.recognizeText('data:image/png;base64,xxx', { timeoutMs: 100 });
    expect(r.source).toBe('tesseract-offline');
    /* dedicatedPermFail doit être true maintenant */
    const o = ocrOffline as unknown as { dedicatedPermFail: boolean };
    expect(o.dedicatedPermFail).toBe(true);
  });

  it('Worker ctor throw → permFail + fallback', async () => {
    // @ts-expect-error
    globalThis.Worker = function () {
      throw new Error('ctor crash');
    };
    const r = await ocrOffline.recognizeText('data:image/png;base64,xxx', { timeoutMs: 100 });
    expect(r.source).toBe('tesseract-offline');
    expect(logger.warn).toHaveBeenCalledWith(
      'ocr-offline',
      expect.stringContaining('worker creation failed'),
      expect.any(Object),
    );
  });

  it('worker ready timeout (3s) → permFail + fallback', async () => {
    /* Pas de 'ready' emit → timeout 3s. On utilise timer fakes pour ne pas attendre. */
    vi.useFakeTimers();
    try {
      const promise = ocrOffline.recognizeText('data:image/png;base64,xxx', { timeoutMs: 100 });
      /* avance jusqu'au ready timeout 3000ms */
      await vi.advanceTimersByTimeAsync(3500);
      vi.useRealTimers();
      const r = await promise;
      expect(r.source).toBe('tesseract-offline');
      expect(logger.warn).toHaveBeenCalledWith(
        'ocr-offline',
        expect.stringContaining('worker ready timeout'),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ocr-offline — onDedicatedError handler', () => {
  it('worker error event reject tous les pending', async () => {
    /* Setup worker prêt */
    const o = ocrOffline as unknown as {
      dedicatedReady: boolean;
      dedicatedWorker: unknown;
      dedicatedPending: Map<number, { resolve: (v: unknown) => void; reject: (err: Error) => void }>;
    };
    o.dedicatedReady = true;
    const stub = makeStubWorker();
    o.dedicatedWorker = stub;

    const rejected = vi.fn();
    o.dedicatedPending.set(1, { resolve: () => {}, reject: rejected });
    o.dedicatedPending.set(2, { resolve: () => {}, reject: rejected });

    /* Simule l'attachement du onDedicatedError → on call directement */
    const handler = (ocrOffline as unknown as { onDedicatedError: (e: ErrorEvent) => void }).onDedicatedError;
    handler({ message: 'boom' } as ErrorEvent);
    expect(rejected).toHaveBeenCalledTimes(2);
    expect(o.dedicatedPending.size).toBe(0);
  });
});

describe('ocr-offline — onDedicatedMessage edge cases', () => {
  it('message sans id → ignored', () => {
    const handler = (ocrOffline as unknown as { onDedicatedMessage: (e: MessageEvent) => void }).onDedicatedMessage;
    expect(() => handler({ data: { foo: 'bar' } } as MessageEvent)).not.toThrow();
  });

  it('message avec id inconnu → ignored', () => {
    const handler = (ocrOffline as unknown as { onDedicatedMessage: (e: MessageEvent) => void }).onDedicatedMessage;
    expect(() => handler({ data: { id: 99999, type: 'ok', result: { text: 'x' } } } as MessageEvent)).not.toThrow();
  });

  it('cleanup ack (result sans text) → reject pending', () => {
    const o = ocrOffline as unknown as {
      dedicatedPending: Map<number, { resolve: (v: unknown) => void; reject: (err: Error) => void }>;
    };
    const rej = vi.fn();
    o.dedicatedPending.set(7, { resolve: () => {}, reject: rej });
    const handler = (ocrOffline as unknown as { onDedicatedMessage: (e: MessageEvent) => void }).onDedicatedMessage;
    handler({ data: { id: 7, type: 'ok', result: { /* no text */ } } } as MessageEvent);
    expect(rej).toHaveBeenCalled();
  });
});

describe('ocr-offline — cleanup paths', () => {
  it('cleanup avec dedicated worker actif terminate + reject pending', async () => {
    const o = ocrOffline as unknown as {
      dedicatedReady: boolean;
      dedicatedWorker: { terminate: ReturnType<typeof vi.fn> } | null;
      dedicatedPending: Map<number, { resolve: (v: unknown) => void; reject: (err: Error) => void }>;
    };
    const term = vi.fn();
    o.dedicatedWorker = { terminate: term };
    const rej = vi.fn();
    o.dedicatedPending.set(1, { resolve: () => {}, reject: rej });
    await ocrOffline.cleanup();
    expect(term).toHaveBeenCalled();
    expect(rej).toHaveBeenCalled();
    expect(o.dedicatedWorker).toBeNull();
  });

  it('cleanup terminate throw → ignoré', async () => {
    const o = ocrOffline as unknown as {
      dedicatedWorker: { terminate: () => void } | null;
    };
    o.dedicatedWorker = { terminate: () => { throw new Error('term fail'); } };
    await expect(ocrOffline.cleanup()).resolves.toBeUndefined();
  });

  it('cleanup main-thread worker terminate', async () => {
    const o = ocrOffline as unknown as {
      worker: { terminate: () => Promise<void> } | null;
      workerLang: string | null;
    };
    const term = vi.fn(async () => {});
    o.worker = { terminate: term };
    o.workerLang = 'fra+eng';
    await ocrOffline.cleanup();
    expect(term).toHaveBeenCalled();
    expect(o.worker).toBeNull();
  });

  it('cleanup main-thread terminate throw → ignoré', async () => {
    const o = ocrOffline as unknown as {
      worker: { terminate: () => Promise<void> } | null;
    };
    o.worker = { terminate: async () => { throw new Error('main term'); } };
    await expect(ocrOffline.cleanup()).resolves.toBeUndefined();
  });
});

describe('ocr-offline — callDedicated worker_not_ready', () => {
  it('reject "worker_not_ready" si dedicatedWorker null', async () => {
    const o = ocrOffline as unknown as {
      dedicatedWorker: unknown;
      dedicatedReady: boolean;
    };
    o.dedicatedWorker = null;
    o.dedicatedReady = true;
    /* Appel direct privé via cast */
    const callDedicated = (ocrOffline as unknown as {
      callDedicated: (i: string, l: string, t: number) => Promise<unknown>;
    }).callDedicated.bind(ocrOffline);
    await expect(callDedicated('xx', 'fra', 100)).rejects.toThrow('worker_not_ready');
  });
});

describe('ocr-offline — callDedicated safety timeout', () => {
  it('timeout interne 5s reject "worker_call_timeout"', async () => {
    /* Setup worker prêt mais qui ne répond jamais */
    const o = ocrOffline as unknown as {
      dedicatedWorker: { postMessage: ReturnType<typeof vi.fn> } | null;
      dedicatedReady: boolean;
      dedicatedPending: Map<number, unknown>;
    };
    o.dedicatedWorker = { postMessage: vi.fn() };
    o.dedicatedReady = true;
    vi.useFakeTimers();
    try {
      const callDedicated = (ocrOffline as unknown as {
        callDedicated: (i: string, l: string, t: number) => Promise<unknown>;
      }).callDedicated.bind(ocrOffline);
      /* Attache catch immédiat AVANT advance pour éviter unhandled rejection */
      const p = callDedicated('img', 'fra', 100);
      const caught: { error?: Error } = {};
      const settled = p.catch((e: Error) => { caught.error = e; });
      await vi.advanceTimersByTimeAsync(5_500);
      await settled;
      vi.useRealTimers();
      expect(caught.error?.message).toBe('worker_call_timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});
