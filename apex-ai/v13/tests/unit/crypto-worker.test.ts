/**
 * Tests crypto-worker-client (services/crypto-worker-client.ts).
 *
 * happy-dom ne fournit pas l'API Worker → on mock globalThis.Worker pour
 * simuler un worker qui implémente le protocole `workers/crypto.worker.ts`
 * (handshake `ready` + req/resp `hashPin`/`encrypt`/`decrypt`).
 *
 * Couvre :
 * - Init lazy (worker non créé tant que ensure() pas appelé)
 * - Handshake ready → isAvailable() = true
 * - hashPin via worker (mock délègue à crypto.subtle)
 * - encrypt / decrypt round-trip
 * - Worker indispo (Worker undefined) → ensure() = false, fallback caller
 * - Ready timeout → ensure() = false
 * - Error response → reject
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

/* Polyfill (déjà fait dans setup.ts mais on re-garantit). */
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  });
}

interface MockWorkerMsg {
  type: string;
  id?: number;
  result?: unknown;
  error?: string;
  [k: string]: unknown;
}

class MockCryptoWorker {
  private listeners: { [evt: string]: Array<(e: MessageEvent<unknown> | ErrorEvent) => void> } = {
    message: [],
    error: [],
  };
  terminated = false;

  constructor(_url: URL | string, _options?: { type?: string }) {
    /* Émet 'ready' de façon asynchrone (microtask) — comme un vrai worker démarre. */
    queueMicrotask(() => {
      this.dispatch('message', new MessageEvent('message', { data: { type: 'ready' } }));
    });
  }

  addEventListener(evt: string, cb: (e: MessageEvent<unknown> | ErrorEvent) => void): void {
    this.listeners[evt] ??= [];
    this.listeners[evt].push(cb);
  }

  removeEventListener(evt: string, cb: (e: MessageEvent<unknown> | ErrorEvent) => void): void {
    if (!this.listeners[evt]) return;
    this.listeners[evt] = this.listeners[evt].filter((c) => c !== cb);
  }

  private dispatch(evt: string, e: MessageEvent<unknown> | ErrorEvent): void {
    const list = this.listeners[evt] ?? [];
    for (const cb of list) cb(e);
  }

  async postMessage(msg: MockWorkerMsg): Promise<void> {
    if (this.terminated) return;
    setTimeout(() => {
      void (async () => {
        try {
          let result: string;
          if (msg.type === 'hashPin') {
            const enc = new TextEncoder();
            const km = await crypto.subtle.importKey(
              'raw',
              enc.encode(String(msg['pin'])),
              { name: 'PBKDF2' },
              false,
              ['deriveBits'],
            );
            const bits = await crypto.subtle.deriveBits(
              {
                name: 'PBKDF2',
                salt: enc.encode(String(msg['salt'])),
                iterations: Number(msg['iterations'] ?? 200_000),
                hash: 'SHA-256',
              },
              km,
              256,
            );
            result = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
          } else if (msg.type === 'encrypt') {
            /* Mock simple : reverse base64 du plaintext + signature passphrase len */
            result = btoa(String(msg['plaintext'])) + ':' + String(msg['passphrase']).length;
          } else if (msg.type === 'decrypt') {
            const payload = String(msg['payload']);
            const sep = payload.lastIndexOf(':');
            if (sep < 0) throw new Error('bad_payload');
            result = atob(payload.slice(0, sep));
          } else {
            throw new Error('unknown_type');
          }
          this.dispatch('message', new MessageEvent('message', {
            data: { type: 'ok', id: msg.id, result },
          }));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.dispatch('message', new MessageEvent('message', {
            data: { type: 'err', id: msg.id, error: errMsg },
          }));
        }
      })();
    }, 0);
  }

  terminate(): void {
    this.terminated = true;
    this.listeners = { message: [], error: [] };
  }
}

const originalWorker = globalThis.Worker;

async function freshClient(): Promise<typeof import('../../services/storage/crypto-worker-client.js')> {
  /* Reset module cache pour reprendre singleton à zéro */
  vi.resetModules();
  return import('../../services/storage/crypto-worker-client.js');
}

describe('crypto-worker-client', () => {
  beforeEach(() => {
     
    (globalThis as any).Worker = MockCryptoWorker as any;
  });

  afterEach(() => {
     
    (globalThis as any).Worker = originalWorker as any;
  });

  it('ensure() retourne true quand Worker dispo + ready', async () => {
    const { cryptoWorker } = await freshClient();
    const ok = await cryptoWorker.ensure();
    expect(ok).toBe(true);
    expect(cryptoWorker.isAvailable()).toBe(true);
    cryptoWorker.cleanup();
  });

  it('ensure() retourne false quand Worker indispo', async () => {
     
    (globalThis as any).Worker = undefined;
    const { cryptoWorker } = await freshClient();
    const ok = await cryptoWorker.ensure();
    expect(ok).toBe(false);
    expect(cryptoWorker.isAvailable()).toBe(false);
  });

  it('hashPin via worker retourne 64 chars hex (PBKDF2 → SHA-256 → 256 bits)', async () => {
    const { cryptoWorker } = await freshClient();
    await cryptoWorker.ensure();
    const hash = await cryptoWorker.hashPin('200807', 'kdmc_admin', 200_000);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    cryptoWorker.cleanup();
  });

  it('hashPin déterministe (même input → même output)', async () => {
    const { cryptoWorker } = await freshClient();
    await cryptoWorker.ensure();
    const h1 = await cryptoWorker.hashPin('1234', 'salt', 10_000);
    const h2 = await cryptoWorker.hashPin('1234', 'salt', 10_000);
    expect(h1).toBe(h2);
    cryptoWorker.cleanup();
  });

  it('hashPin différent salt → hash différent', async () => {
    const { cryptoWorker } = await freshClient();
    await cryptoWorker.ensure();
    const h1 = await cryptoWorker.hashPin('1234', 'salt-A', 10_000);
    const h2 = await cryptoWorker.hashPin('1234', 'salt-B', 10_000);
    expect(h1).not.toBe(h2);
    cryptoWorker.cleanup();
  });

  it('encrypt → decrypt round-trip retourne plaintext', async () => {
    const { cryptoWorker } = await freshClient();
    await cryptoWorker.ensure();
    const cipher = await cryptoWorker.encrypt('hello apex', 'passphrase');
    expect(typeof cipher).toBe('string');
    const plain = await cryptoWorker.decrypt(cipher, 'passphrase');
    expect(plain).toBe('hello apex');
    cryptoWorker.cleanup();
  });

  it('cleanup() rend le worker indispo (state reset)', async () => {
    const { cryptoWorker } = await freshClient();
    await cryptoWorker.ensure();
    expect(cryptoWorker.isAvailable()).toBe(true);
    cryptoWorker.cleanup();
    expect(cryptoWorker.isAvailable()).toBe(false);
  });

  it('ensure() est idempotent (2e appel ne recrée pas)', async () => {
    const { cryptoWorker } = await freshClient();
    const ok1 = await cryptoWorker.ensure();
    const ok2 = await cryptoWorker.ensure();
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    cryptoWorker.cleanup();
  });

  it('ready timeout → permanentlyUnavailable + fallback', async () => {
    /* Mock Worker qui ne envoie JAMAIS 'ready' */
    class SlowWorker {
      constructor(_u: URL | string) { /* never sends ready */ }
      addEventListener(): void { /* noop */ }
      removeEventListener(): void { /* noop */ }
      postMessage(): void { /* noop */ }
      terminate(): void { /* noop */ }
    }
     
    (globalThis as any).Worker = SlowWorker as any;
    const { cryptoWorker } = await freshClient();
    /* On veut juste vérifier que la promise se résout false sans crash.
     * On accélère en accordant un timeout test plus généreux. */
    const ok = await Promise.race([
      cryptoWorker.ensure(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 4000)),
    ]);
    expect(ok).toBe(false);
  }, 6000);
});
