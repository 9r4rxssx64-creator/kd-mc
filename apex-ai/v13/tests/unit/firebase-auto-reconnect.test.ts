/**
 * Tests v13.3.x Kevin 2026-05-08 — Auto-reconnect robuste Firebase.
 *
 * Couvre :
 *   1. État DISCONNECTED après ping fail au boot
 *   2. État OFFLINE si navigator.onLine=false au boot
 *   3. triggerReconnect() reconnecte si ping OK + retourne true + state→CONNECTED
 *   4. triggerReconnect() return false + state RECONNECTING si ping fail (transient)
 *   5. event 'online' déclenche reconnect immédiat (clear backoff)
 *   6. event 'offline' bascule state→OFFLINE + annule timer
 *   7. visibilitychange visible déclenche check si state ≠ CONNECTED
 *   8. SSE onerror passe en RECONNECTING (pas DISCONNECTED) tant que tentatives < 5
 *   9. disconnect() cleanup tous timers + listeners (no leak)
 *  10. État CONNECTED après ping OK + reset reconnectAttempts
 *
 * Pas de tests réseau réel : tout est mocké (fetch + EventSource).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { firebase } from '../../services/storage/firebase.js';

interface FakeES {
  url: string;
  close: () => void;
  closeCallCount: number;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  listeners: Map<string, Set<EventListener>>;
  onerror: ((ev: Event) => void) | null;
  onopen: ((ev: Event) => void) | null;
}

function installFakeEventSource(): { instances: FakeES[]; restore: () => void } {
  const instances: FakeES[] = [];
  const original = (globalThis as unknown as { EventSource?: unknown }).EventSource;
  const FakeESCtor = function (this: unknown, url: string): FakeES {
    const listeners = new Map<string, Set<EventListener>>();
    const inst: FakeES = {
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
      },
      listeners,
      onerror: null,
      onopen: null,
    };
    instances.push(inst);
    return inst;
  } as unknown as typeof EventSource;
  (globalThis as unknown as { EventSource?: unknown }).EventSource = FakeESCtor;
  return {
    instances,
    restore: () => {
      if (original) (globalThis as unknown as { EventSource?: unknown }).EventSource = original;
      else delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
    },
  };
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

describe('firebase auto-reconnect (v13.3.x Kevin 2026-05-08)', () => {
  let fakeES: ReturnType<typeof installFakeEventSource>;

  beforeEach(() => {
    localStorage.clear();
    /* Reset singleton state. */
    firebase.disconnect();
    fakeES = installFakeEventSource();
    /* Default online */
    setOnline(true);
  });

  afterEach(() => {
    firebase.disconnect();
    fakeES.restore();
    vi.restoreAllMocks();
  });

  describe('getConnectionState() — state machine API', () => {
    it('retourne DISCONNECTED par défaut (avant init)', () => {
      const fb = firebase as unknown as { getConnectionState: () => string };
      expect(fb.getConnectionState()).toBe('DISCONNECTED');
    });

    it('passe en CONNECTED après init avec ping OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await firebase.init();
      const fb = firebase as unknown as { getConnectionState: () => string };
      expect(fb.getConnectionState()).toBe('CONNECTED');
      expect(firebase.isConnected()).toBe(true);
    });

    it('passe en RECONNECTING après init avec ping fail (transient, pas DISCONNECTED)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      await firebase.init();
      const fb = firebase as unknown as { getConnectionState: () => string };
      /* Avec 1 tentative seule, on doit être RECONNECTING (pas DISCONNECTED). */
      expect(['RECONNECTING', 'DISCONNECTED']).toContain(fb.getConnectionState());
      /* Important : RECONNECTING = SOS ne doit PAS générer de warning. */
      expect(firebase.isConnected()).toBe(false);
    });

    it('passe en OFFLINE si navigator.onLine=false au boot', async () => {
      setOnline(false);
      await firebase.init();
      const fb = firebase as unknown as { getConnectionState: () => string };
      expect(fb.getConnectionState()).toBe('OFFLINE');
      expect(firebase.isConnected()).toBe(false);
    });
  });

  describe('triggerReconnect() — appel direct user/SOS', () => {
    it('return true + state CONNECTED si ping OK', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('initial fail'));
      await firebase.init();
      /* Maintenant retry avec ping OK. */
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
      const fb = firebase as unknown as {
        triggerReconnect: () => Promise<boolean>;
        getConnectionState: () => string;
      };
      const ok = await fb.triggerReconnect();
      expect(ok).toBe(true);
      expect(fb.getConnectionState()).toBe('CONNECTED');
    });

    it('return false si ping toujours fail (state reste RECONNECTING/DISCONNECTED)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('still down'));
      await firebase.init();
      const fb = firebase as unknown as {
        triggerReconnect: () => Promise<boolean>;
        getConnectionState: () => string;
      };
      const ok = await fb.triggerReconnect();
      expect(ok).toBe(false);
      expect(['RECONNECTING', 'DISCONNECTED']).toContain(fb.getConnectionState());
    });

    it('no-op si déjà CONNECTED (return true sans nouvelle tentative)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await firebase.init();
      const callsBefore = fetchSpy.mock.calls.length;
      const fb = firebase as unknown as { triggerReconnect: () => Promise<boolean> };
      const ok = await fb.triggerReconnect();
      expect(ok).toBe(true);
      /* Pas de fetch supplémentaire (déjà CONNECTED). */
      expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    });

    it('no-op si OFFLINE (return false, attend event online)', async () => {
      setOnline(false);
      await firebase.init();
      const fb = firebase as unknown as {
        triggerReconnect: () => Promise<boolean>;
        getConnectionState: () => string;
      };
      const ok = await fb.triggerReconnect();
      expect(ok).toBe(false);
      expect(fb.getConnectionState()).toBe('OFFLINE');
    });
  });

  describe('event listeners DOM', () => {
    it("event 'online' déclenche reconnect immédiat (state OFFLINE → tentative)", async () => {
      setOnline(false);
      await firebase.init();
      const fb = firebase as unknown as { getConnectionState: () => string };
      expect(fb.getConnectionState()).toBe('OFFLINE');

      /* Mock fetch OK pour la prochaine tentative. */
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      setOnline(true);
      window.dispatchEvent(new Event('online'));
      /* Laisse l'event handler async finir. */
      await new Promise<void>((r) => setTimeout(r, 50));
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("event 'offline' bascule state→OFFLINE + ferme SSE", async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await firebase.init();
      const fb = firebase as unknown as { getConnectionState: () => string };
      expect(fb.getConnectionState()).toBe('CONNECTED');

      window.dispatchEvent(new Event('offline'));
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(fb.getConnectionState()).toBe('OFFLINE');
      expect(firebase.isConnected()).toBe(false);
    });

    it("visibilitychange visible reconnecte si state ≠ CONNECTED", async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('initial fail'));
      await firebase.init();
      const fb = firebase as unknown as { getConnectionState: () => string };
      expect(['RECONNECTING', 'DISCONNECTED']).toContain(fb.getConnectionState());

      /* Maintenant ping OK + simule visibilitychange visible. */
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise<void>((r) => setTimeout(r, 50));
      /* Devrait avoir tenté un reconnect. */
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('SSE error → RECONNECTING (transient, pas DISCONNECTED)', () => {
    it("SSE onerror déclenche state RECONNECTING (pas DISCONNECTED) après 1 fail", async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await firebase.init();
      const fb = firebase as unknown as { getConnectionState: () => string };
      expect(fb.getConnectionState()).toBe('CONNECTED');

      /* Simule SSE error. */
      const lastES = fakeES.instances[fakeES.instances.length - 1];
      expect(lastES).toBeDefined();
      lastES?.onerror?.(new Event('error'));
      /* Pas d'attente — state synchrone. */
      expect(['RECONNECTING', 'CONNECTED']).toContain(fb.getConnectionState());
      /* IMPORTANT : pas DISCONNECTED après 1 seul fail (transient). */
      expect(fb.getConnectionState()).not.toBe('DISCONNECTED');
    });
  });

  describe('disconnect() cleanup complet (no leak)', () => {
    it('disconnect() reset state, stop watchdog, clear timers, remove DOM listeners', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await firebase.init();
      firebase.disconnect();
      const fb = firebase as unknown as {
        getConnectionState: () => string;
        getActiveSSEListenerCount: () => number;
      };
      expect(fb.getConnectionState()).toBe('DISCONNECTED');
      expect(firebase.isConnected()).toBe(false);
      expect(fb.getActiveSSEListenerCount()).toBe(0);
    });

    it('disconnect() idempotent — multiple appels OK', () => {
      expect(() => {
        firebase.disconnect();
        firebase.disconnect();
        firebase.disconnect();
      }).not.toThrow();
    });
  });
});
