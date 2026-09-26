/**
 * Tests services/crypto-worker-client (Kevin v13.4.210 "Continu toujours pareil").
 *
 * Couvre CryptoWorkerClient :
 * - ensure() lazy-init + idempotent
 * - Worker undefined → permanentlyUnavailable
 * - Ready timeout (3s) → fallback
 * - call() roundtrip ok/error
 * - isAvailable, cleanup
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cryptoWorker } from '../../services/storage/crypto-worker-client.js';

interface FakeWorkerHandler {
  type: string;
  fn: (event: MessageEvent<unknown>) => void;
}

/** Worker mock factory : utilisé pour simuler ready / response selon scénario. */
function makeFakeWorker(opts: {
  emitReadyImmediately?: boolean;
  onMessage?: (data: unknown, worker: FakeWorker) => void;
} = {}): typeof Worker {
  return class FakeWorker {
    handlers: FakeWorkerHandler[] = [];
    terminated = false;
    public static _instances: FakeWorker[] = [];
    constructor(_url: URL | string, _o?: WorkerOptions) {
      FakeWorker._instances.push(this);
      if (opts.emitReadyImmediately !== false) {
        /* emit "ready" event sur next microtask */
        queueMicrotask(() => this._emit({ type: 'ready' }));
      }
    }
    addEventListener(type: string, fn: (event: MessageEvent<unknown>) => void): void {
      this.handlers.push({ type, fn });
    }
    removeEventListener(type: string, fn: (event: MessageEvent<unknown>) => void): void {
      this.handlers = this.handlers.filter((h) => !(h.type === type && h.fn === fn));
    }
    postMessage(data: unknown): void {
      if (opts.onMessage) opts.onMessage(data, this as unknown as FakeWorker);
    }
    terminate(): void {
      this.terminated = true;
    }
    _emit(data: unknown): void {
      for (const h of this.handlers.filter((x) => x.type === 'message')) {
        h.fn({ data } as MessageEvent<unknown>);
      }
    }
    _emitError(msg: string): void {
      for (const h of this.handlers.filter((x) => x.type === 'error')) {
        h.fn({ message: msg } as unknown as MessageEvent<unknown>);
      }
    }
  } as unknown as typeof Worker;
}

interface FakeWorker {
  handlers: FakeWorkerHandler[];
  terminated: boolean;
  postMessage(data: unknown): void;
  terminate(): void;
  _emit(data: unknown): void;
  _emitError(msg: string): void;
}

describe('services/crypto-worker-client', () => {
  let originalWorker: typeof Worker | undefined;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    cryptoWorker.cleanup();
  });

  afterEach(() => {
    cryptoWorker.cleanup();
    if (originalWorker !== undefined) {
      globalThis.Worker = originalWorker;
    } else {
      delete (globalThis as { Worker?: typeof Worker }).Worker;
    }
  });

  describe('ensure', () => {
    it('Worker undefined → permanentlyUnavailable → false', async () => {
      delete (globalThis as { Worker?: typeof Worker }).Worker;
      const result = await cryptoWorker.ensure();
      expect(result).toBe(false);
      expect(cryptoWorker.isAvailable()).toBe(false);
    });

    it('Worker créé + reçoit ready → workerReady true', async () => {
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: true });
      const result = await cryptoWorker.ensure();
      expect(result).toBe(true);
      expect(cryptoWorker.isAvailable()).toBe(true);
    });

    it('idempotent : 2 ensure() concurrent partagent même promise', async () => {
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: true });
      const [r1, r2] = await Promise.all([cryptoWorker.ensure(), cryptoWorker.ensure()]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
    });

    it('ensure() après ready cached → return true sans nouveau worker', async () => {
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: true });
      await cryptoWorker.ensure();
      const r2 = await cryptoWorker.ensure();
      expect(r2).toBe(true);
    });

    it('après cleanup() retourne false → permanentlyUnavailable reset', async () => {
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: true });
      await cryptoWorker.ensure();
      cryptoWorker.cleanup();
      expect(cryptoWorker.isAvailable()).toBe(false);
    });

    it('Worker constructor throw → permanentlyUnavailable', async () => {
      globalThis.Worker = class {
        constructor() {
          throw new Error('CSP blocked');
        }
      } as unknown as typeof Worker;
      const result = await cryptoWorker.ensure();
      expect(result).toBe(false);
    });

    it('Ready timeout (3s sans event "ready") → false + worker terminated', async () => {
      vi.useFakeTimers();
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: false });
      const promise = cryptoWorker.ensure();
      /* Avance 3s → timeout déclenché */
      await vi.advanceTimersByTimeAsync(3100);
      const result = await promise;
      expect(result).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('hashPin / encrypt / decrypt — call() roundtrip', () => {
    let lastWorker: FakeWorker | null = null;

    beforeEach(async () => {
      globalThis.Worker = makeFakeWorker({
        emitReadyImmediately: true,
        onMessage: (data, w) => {
          lastWorker = w;
          /* Echo response avec id préservé */
          queueMicrotask(() => {
            const req = data as { id: number; type: string };
            w._emit({ type: 'ok', id: req.id, result: `mocked_${req.type}` });
          });
        },
      });
      await cryptoWorker.ensure();
    });

    it('hashPin → call() → echo "mocked_hashPin"', async () => {
      const result = await cryptoWorker.hashPin('200807', 'salt-xyz', 200_000);
      expect(result).toBe('mocked_hashPin');
    });

    it('encrypt → call() → echo "mocked_encrypt"', async () => {
      const result = await cryptoWorker.encrypt('plain', 'pass');
      expect(result).toBe('mocked_encrypt');
    });

    it('decrypt → call() → echo "mocked_decrypt"', async () => {
      const result = await cryptoWorker.decrypt('payload', 'pass');
      expect(result).toBe('mocked_decrypt');
    });

    it('Worker emit type:"err" → reject avec error message', async () => {
      globalThis.Worker = makeFakeWorker({
        emitReadyImmediately: true,
        onMessage: (data, w) => {
          queueMicrotask(() => {
            const req = data as { id: number };
            w._emit({ type: 'err', id: req.id, error: 'invalid_passphrase' });
          });
        },
      });
      cryptoWorker.cleanup();
      await cryptoWorker.ensure();
      await expect(cryptoWorker.decrypt('bad_payload', 'bad_pass')).rejects.toThrow(/invalid_passphrase/);
    });

    it('Worker emit error event → tous pending rejected', async () => {
      let workerRef: FakeWorker | null = null;
      globalThis.Worker = makeFakeWorker({
        emitReadyImmediately: true,
        onMessage: (_, w) => {
          workerRef = w; /* save sans répondre */
        },
      });
      cryptoWorker.cleanup();
      await cryptoWorker.ensure();
      const p1 = cryptoWorker.hashPin('p', 's');
      const p2 = cryptoWorker.encrypt('x', 'p');
      /* Émet error event */
      queueMicrotask(() => workerRef?._emitError('worker crashed'));
      await expect(p1).rejects.toThrow(/worker_error.*worker crashed/);
      await expect(p2).rejects.toThrow(/worker_error.*worker crashed/);
    });

    it('Timeout call() → reject crypto_worker_timeout', async () => {
      vi.useFakeTimers();
      globalThis.Worker = makeFakeWorker({
        emitReadyImmediately: true,
        onMessage: () => {
          /* JAMAIS répondre → déclenche timeout 15s */
        },
      });
      cryptoWorker.cleanup();
      await cryptoWorker.ensure();
      const promise = cryptoWorker.encrypt('x', 'p');
      /* Attache l'assertion AVANT d'avancer les timers : sinon la rejection
         se déclenche pendant advanceTimersByTimeAsync sans handler attaché
         → unhandled rejection (faux positif qui faisait exit 1 vitest). */
      const assertion = expect(promise).rejects.toThrow(/crypto_worker_timeout/);
      await vi.advanceTimersByTimeAsync(15_100);
      await assertion;
      vi.useRealTimers();
    });

    it('Worker reçoit data sans id → ignored silencieusement', async () => {
      let workerRef: FakeWorker | null = null;
      globalThis.Worker = makeFakeWorker({
        emitReadyImmediately: true,
        onMessage: (data, w) => {
          workerRef = w;
          /* Réponse SANS id puis avec bon id pour eviter timeout */
          queueMicrotask(() => {
            w._emit({ type: 'ok', result: 'no_id_ignored' }); /* sans id → filtré */
            const req = data as { id: number };
            w._emit({ type: 'ok', id: req.id, result: 'real_response' }); /* avec id → résout */
          });
        },
      });
      cryptoWorker.cleanup();
      await cryptoWorker.ensure();
      const result = await cryptoWorker.encrypt('x', 'p');
      expect(result).toBe('real_response');
      expect(workerRef).not.toBeNull();
    });
  });

  describe('call() sans worker', () => {
    it('hashPin sans ensure() préalable → reject worker_not_ready', async () => {
      /* Worker existe mais pas initialisé */
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: false });
      /* Pas d'ensure() → cryptoWorker.worker reste null */
      await expect(cryptoWorker.hashPin('x', 'y')).rejects.toThrow(/worker_not_ready/);
    });
  });

  describe('cleanup', () => {
    it('terminate worker + reset state', async () => {
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: true });
      await cryptoWorker.ensure();
      expect(cryptoWorker.isAvailable()).toBe(true);
      cryptoWorker.cleanup();
      expect(cryptoWorker.isAvailable()).toBe(false);
    });

    it('cleanup sans worker initialisé → no throw', () => {
      expect(() => cryptoWorker.cleanup()).not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('false initialement (avant ensure)', () => {
      expect(cryptoWorker.isAvailable()).toBe(false);
    });

    it('true après ensure() success', async () => {
      globalThis.Worker = makeFakeWorker({ emitReadyImmediately: true });
      await cryptoWorker.ensure();
      expect(cryptoWorker.isAvailable()).toBe(true);
    });

    it('false si permanentlyUnavailable', async () => {
      delete (globalThis as { Worker?: typeof Worker }).Worker;
      await cryptoWorker.ensure();
      expect(cryptoWorker.isAvailable()).toBe(false);
    });
  });

  describe('branches restantes (campagne 100%)', () => {
    it('onMessage : id sans pending → return (103)', () => {
      const priv = cryptoWorker as unknown as { onMessage(e: MessageEvent<unknown>): void };
      expect(() =>
        priv.onMessage({ data: { id: 999999, type: 'ok', result: 1 } } as MessageEvent<unknown>),
      ).not.toThrow();
    });

    it('cleanup : worker.terminate throw → catch (173)', () => {
      (cryptoWorker as unknown as { worker: unknown }).worker = { terminate: () => { throw new Error('t'); } };
      expect(() => cryptoWorker.cleanup()).not.toThrow();
    });

    it('ensure : déjà permanentlyUnavailable → return false (48)', async () => {
      (cryptoWorker as unknown as { permanentlyUnavailable: boolean }).permanentlyUnavailable = true;
      const r = await cryptoWorker.ensure();
      expect(r).toBe(false);
      cryptoWorker.cleanup();
    });

    it('ensure : ready timeout (3s) + terminate throw → catch (83)', async () => {
      vi.useFakeTimers();
      cryptoWorker.cleanup();
      class NoReadyThrowTerm {
        addEventListener(): void {}
        removeEventListener(): void {}
        postMessage(): void {}
        terminate(): void { throw new Error('term'); }
      }
      (globalThis as { Worker?: unknown }).Worker = NoReadyThrowTerm as unknown as typeof Worker;
      const p = cryptoWorker.ensure();
      await vi.advanceTimersByTimeAsync(3000);
      const r = await p;
      expect(r).toBe(false);
      vi.useRealTimers();
      cryptoWorker.cleanup();
    });
  });
});
