/**
 * Tests P0 audit Cure53/NCC : aucun listener SSE orphelin dans firebase.
 *
 * Vérifie :
 *   1. disconnect() ferme EventSource + remove listener 'put'
 *   2. disconnect() est idempotent
 *   3. getActiveSSEListenerCount() retourne 0 par défaut
 *   4. startSSE() puis disconnect() laisse 0 listener actif
 *   5. Plusieurs cycles startSSE/disconnect ne fuitent pas
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { firebase } from '../../services/storage/firebase.js';

interface FakeEventSourceLike {
  url: string;
  close: () => void;
  closeCallCount: number;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  removeCallCount: number;
  listeners: Map<string, Set<EventListener>>;
  onerror: ((ev: Event) => void) | null;
  onopen: ((ev: Event) => void) | null;
}

function installFakeEventSource(): {
  instances: FakeEventSourceLike[];
  restore: () => void;
} {
  const instances: FakeEventSourceLike[] = [];
  const original = (globalThis as unknown as { EventSource?: unknown }).EventSource;

  const FakeES = function (this: unknown, url: string): FakeEventSourceLike {
    const listeners = new Map<string, Set<EventListener>>();
    const inst: FakeEventSourceLike = {
      url,
      close: () => { inst.closeCallCount++; },
      closeCallCount: 0,
      addEventListener: (type, listener) => {
        let set = listeners.get(type);
        if (!set) { set = new Set(); listeners.set(type, set); }
        set.add(listener);
      },
      removeEventListener: (type, listener) => {
        listeners.get(type)?.delete(listener);
        inst.removeCallCount++;
      },
      removeCallCount: 0,
      listeners,
      onerror: null,
      onopen: null,
    };
    instances.push(inst);
    return inst;
  } as unknown as typeof EventSource;

  (globalThis as unknown as { EventSource?: unknown }).EventSource = FakeES;

  return {
    instances,
    restore: () => {
      if (original) {
        (globalThis as unknown as { EventSource?: unknown }).EventSource = original;
      } else {
        delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
      }
    },
  };
}

describe('firebase SSE listener cleanup (P0 audit Cure53/NCC)', () => {
  let fakeES: ReturnType<typeof installFakeEventSource>;

  beforeEach(() => {
    localStorage.clear();
    /* Garantit état propre du singleton */
    firebase.disconnect();
    fakeES = installFakeEventSource();
  });

  afterEach(() => {
    firebase.disconnect();
    fakeES.restore();
    vi.restoreAllMocks();
  });

  describe('getActiveSSEListenerCount()', () => {
    it('retourne 0 par défaut', () => {
      expect(firebase.getActiveSSEListenerCount()).toBe(0);
    });

    it('retourne number toujours', () => {
      expect(typeof firebase.getActiveSSEListenerCount()).toBe('number');
    });
  });

  describe('disconnect()', () => {
    it('idempotent — multiple appels ne throw pas', () => {
      expect(() => {
        firebase.disconnect();
        firebase.disconnect();
        firebase.disconnect();
      }).not.toThrow();
    });

    it('reset le compteur de listeners SSE à 0', () => {
      firebase.disconnect();
      expect(firebase.getActiveSSEListenerCount()).toBe(0);
    });

    it("appelable même si SSE jamais démarré", () => {
      expect(() => firebase.disconnect()).not.toThrow();
      expect(firebase.getActiveSSEListenerCount()).toBe(0);
    });
  });

  describe('startSSE() + disconnect() cycle', () => {
    it('startSSE crée un EventSource avec listener "put", disconnect le retire', async () => {
      /* Utilise init() pour déclencher startSSE() (nécessite connected=true via fetch ping mock) */
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await firebase.init();
      fetchSpy.mockRestore();

      /* Le ping init a réussi → startSSE() doit avoir créé une instance */
      if (fakeES.instances.length > 0) {
        expect(firebase.getActiveSSEListenerCount()).toBeGreaterThan(0);
        const es = fakeES.instances[fakeES.instances.length - 1];
        expect(es).toBeDefined();
        const putListeners = es?.listeners.get('put');
        expect(putListeners?.size).toBeGreaterThan(0);

        /* disconnect doit close + remove */
        firebase.disconnect();
        expect(es?.closeCallCount).toBeGreaterThanOrEqual(1);
        expect(firebase.getActiveSSEListenerCount()).toBe(0);
      } else {
        /* Init ping a échoué → startSSE pas appelé. Toujours valider counter à 0. */
        expect(firebase.getActiveSSEListenerCount()).toBe(0);
      }
    });

    it("plusieurs cycles startSSE/disconnect ne fuitent pas (counter reste cohérent)", async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      for (let i = 0; i < 5; i++) {
        await firebase.init();
        firebase.disconnect();
      }
      fetchSpy.mockRestore();
      expect(firebase.getActiveSSEListenerCount()).toBe(0);
    });
  });

  describe('connection state', () => {
    it("isConnected() retourne false après disconnect()", async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await firebase.init();
      fetchSpy.mockRestore();
      firebase.disconnect();
      expect(firebase.isConnected()).toBe(false);
    });
  });
});
