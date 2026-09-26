/**
 * APEX v13 — Crypto Worker Client (lazy wrapper)
 *
 * Wrapper léger autour de `workers/crypto.worker.ts`.
 *
 * Stratégie :
 * - Lazy-init : worker démarré uniquement au 1er appel (pas au boot, pas pénalise LCP).
 * - Backward-compat : si Worker indispo (Worker undefined, CSP, ready timeout),
 *   `isAvailable()` retourne false → caller doit fallback main-thread.
 * - Garde le worker warm entre appels (réutilisé) pour éviter cold start ~50ms.
 *
 * Sécurité :
 * - Les pin/passphrase passent en clair via postMessage mais restent dans le même
 *   thread origin (pas de fuite cross-origin).
 * - postMessage est typé strict côté worker (validation `isRequest`).
 * - Worker est terminé et state cleared au logout (cleanup global).
 */

import { logger } from '../../core/logger.js';
import type {
  CryptoWorkerRequest,
  CryptoWorkerResponse,
} from '../../workers/crypto.worker.js';

interface PendingCall {
  resolve: (v: string) => void;
  reject: (err: Error) => void;
  /* v13.4.x : handle du timeout pour le clear au settle (évite une rejection
     orpheline « crypto_worker_timeout » après résolution normale → unhandled
     rejection sous fake-timers + réveil inutile en prod). */
  timer?: ReturnType<typeof setTimeout>;
}

class CryptoWorkerClient {
  private worker: Worker | null = null;
  private workerReady = false;
  private initPromise: Promise<boolean> | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private permanentlyUnavailable = false;

  /**
   * Lazy-init. Idempotent. Retourne true si worker prêt.
   * NE PAS appeler au boot — caller doit appeler à la 1ère op crypto.
   */
  async ensure(): Promise<boolean> {
    if (this.workerReady) return true;
    if (this.permanentlyUnavailable) return false;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<boolean>((resolve) => {
      try {
        if (typeof Worker === 'undefined') {
          this.permanentlyUnavailable = true;
          resolve(false);
          return;
        }
        const worker = new Worker(
          /* v13.4.242 fix build cassé : crypto-worker-client.ts déplacé dans
           * services/storage/ (2 niveaux sous racine) → '../../workers/'. */
          new URL('../../workers/crypto.worker.ts', import.meta.url),
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
          this.permanentlyUnavailable = true;
          try {
            worker.terminate();
          } catch {
            /* ignore */
          }
          logger.warn('crypto-worker', 'ready timeout → fallback main-thread');
          resolve(false);
        }, 3000);
      } catch (err) {
        this.permanentlyUnavailable = true;
        logger.warn('crypto-worker', 'creation failed → fallback main-thread', { err });
        resolve(false);
      }
    });
    return this.initPromise;
  }

  private onMessage = (event: MessageEvent<unknown>): void => {
    const data = event.data as CryptoWorkerResponse | { type?: string };
    if (!data || typeof (data as { id?: unknown }).id !== 'number') return;
    const resp = data as CryptoWorkerResponse;
    const pending = this.pending.get(resp.id);
    if (!pending) return;
    this.pending.delete(resp.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (resp.type === 'ok') {
      pending.resolve(resp.result);
    } else {
      pending.reject(new Error(resp.error));
    }
  };

  private onError = (event: ErrorEvent): void => {
    logger.warn('crypto-worker', 'worker error', { msg: event.message });
    for (const [, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(new Error(`worker_error: ${event.message}`));
    }
    this.pending.clear();
  };

  private call<R extends CryptoWorkerRequest>(
    req: Omit<R, 'id'>,
    timeoutMs = 15_000,
  ): Promise<string> {
    if (!this.worker) {
      return Promise.reject(new Error('worker_not_ready'));
    }
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('crypto_worker_timeout'));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const fullReq = { ...req, id } as unknown as CryptoWorkerRequest;
      this.worker?.postMessage(fullReq);
    });
  }

  isAvailable(): boolean {
    return this.workerReady && !this.permanentlyUnavailable;
  }

  /**
   * Hash PIN via PBKDF2 200k off-main-thread.
   * @throws si worker indispo — caller doit fallback main-thread.
   */
  async hashPin(pin: string, salt: string, iterations = 200_000): Promise<string> {
    return this.call<import('../../workers/crypto.worker.js').CryptoWorkerHashPinReq>(
      { type: 'hashPin', pin, salt, iterations },
    );
  }

  async encrypt(plaintext: string, passphrase: string): Promise<string> {
    return this.call<import('../../workers/crypto.worker.js').CryptoWorkerEncryptReq>(
      { type: 'encrypt', plaintext, passphrase },
    );
  }

  async decrypt(payload: string, passphrase: string): Promise<string> {
    return this.call<import('../../workers/crypto.worker.js').CryptoWorkerDecryptReq>(
      { type: 'decrypt', payload, passphrase },
    );
  }

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
    this.initPromise = null;
    this.permanentlyUnavailable = false;
    this.pending.clear();
  }
}

export const cryptoWorker = new CryptoWorkerClient();
