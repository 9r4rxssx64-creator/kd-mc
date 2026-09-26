/**
 * ios-resilience — couverture branches complète (campagne 100% réel, 2026-06-02).
 * Service 100% défensif : persist/estimate/lifecycle/resync best-effort.
 * Mocks imports dynamiques (vault-firebase-backup, firebase) + stubs navigator/document.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const syncDrift = vi.fn(async () => {});
const isConnected = vi.fn(() => true);
const triggerReconnect = vi.fn(async () => {});

vi.mock('../../services/vault/vault-firebase-backup.js', () => ({
  vaultFirebaseBackup: { syncDrift: (...a: unknown[]) => syncDrift(...a) },
}));
vi.mock('../../services/storage/firebase.js', () => ({
  firebase: {
    isConnected: (...a: unknown[]) => isConnected(...a),
    triggerReconnect: (...a: unknown[]) => triggerReconnect(...a),
  },
}));

import { iosResilience } from '../../services/core-svc/ios-resilience.js';

/* Accès aux méthodes privées + état pour test déterministe. */
const ir = iosResilience as unknown as {
  status: Record<string, unknown>;
  wired: boolean;
  init(): Promise<void>;
  requestPersistentStorage(): Promise<void>;
  refreshEstimate(): Promise<void>;
  installLifecycleListeners(): void;
  onBackground(): Promise<void>;
  onForeground(): Promise<void>;
  getStatus(): Record<string, unknown>;
};

function setNavStorage(storage: unknown): void {
  Object.defineProperty(globalThis.navigator, 'storage', { value: storage, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  isConnected.mockReturnValue(true);
  /* reset état + flag wired pour ré-exécuter init */
  ir.status = {
    storagePersisted: null, usagePct: null, quotaMb: null,
    lastForegroundSync: 0, lastBackgroundFlush: 0,
  };
  ir.wired = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ios-resilience — requestPersistentStorage', () => {
  it('pas de navigator.storage.persist → no-op (storagePersisted reste null)', async () => {
    setNavStorage(undefined);
    await ir.requestPersistentStorage();
    expect(ir.status.storagePersisted).toBeNull();
  });

  it('persisted() déjà true → storagePersisted true sans appeler persist()', async () => {
    const persist = vi.fn(async () => false);
    setNavStorage({ persist, persisted: vi.fn(async () => true) });
    await ir.requestPersistentStorage();
    expect(ir.status.storagePersisted).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('persisted absent (pas une fonction) + persist() true → true + écrit localStorage', async () => {
    setNavStorage({ persist: vi.fn(async () => true) });
    await ir.requestPersistentStorage();
    expect(ir.status.storagePersisted).toBe(true);
    expect(localStorage.getItem('apex_v13_storage_persisted')).toBe('true');
  });

  it('persist() false → storagePersisted false', async () => {
    setNavStorage({ persist: vi.fn(async () => false), persisted: vi.fn(async () => false) });
    await ir.requestPersistentStorage();
    expect(ir.status.storagePersisted).toBe(false);
  });

  it('localStorage.setItem throw → catch interne non bloquant', async () => {
    setNavStorage({ persist: vi.fn(async () => true), persisted: vi.fn(async () => false) });
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await ir.requestPersistentStorage();
    expect(ir.status.storagePersisted).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('persist() throw → catch externe (debug log, pas d\'exception)', async () => {
    setNavStorage({ persist: vi.fn(async () => { throw new Error('boom'); }), persisted: vi.fn(async () => false) });
    await expect(ir.requestPersistentStorage()).resolves.toBeUndefined();
  });

  it('navigator undefined → guard typeof', async () => {
    vi.stubGlobal('navigator', undefined);
    await expect(ir.requestPersistentStorage()).resolves.toBeUndefined();
  });
});

describe('ios-resilience — refreshEstimate', () => {
  it('pas de estimate → no-op', async () => {
    setNavStorage({});
    await ir.refreshEstimate();
    expect(ir.status.usagePct).toBeNull();
  });

  it('quota > 0 → usagePct + quotaMb calculés', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({ usage: 50 * 1024 * 1024, quota: 100 * 1024 * 1024 })) });
    await ir.refreshEstimate();
    expect(ir.status.usagePct).toBe(50);
    expect(ir.status.quotaMb).toBe(100);
  });

  it('quota = 0 → usagePct null (division évitée)', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({ usage: 0, quota: 0 })) });
    await ir.refreshEstimate();
    expect(ir.status.usagePct).toBeNull();
  });

  it('usage/quota absents → défauts 0', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({})) });
    await ir.refreshEstimate();
    expect(ir.status.usagePct).toBeNull();
  });

  it('estimate throw → catch', async () => {
    setNavStorage({ estimate: vi.fn(async () => { throw new Error('x'); }) });
    await expect(ir.refreshEstimate()).resolves.toBeUndefined();
  });
});

describe('ios-resilience — lifecycle + resync', () => {
  it('installLifecycleListeners : document undefined → guard return', () => {
    vi.stubGlobal('document', undefined);
    expect(() => ir.installLifecycleListeners()).not.toThrow();
  });

  it('installLifecycleListeners : visibilitychange hidden → onBackground, visible → onForeground', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({ usage: 1, quota: 10 })) });
    ir.installLifecycleListeners();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 5));
    expect(syncDrift).toHaveBeenCalled();
  });

  it('onBackground : syncDrift ok → lastBackgroundFlush set', async () => {
    await ir.onBackground();
    expect(ir.status.lastBackgroundFlush).toBeGreaterThan(0);
    expect(syncDrift).toHaveBeenCalled();
  });

  it('onBackground : syncDrift throw → catch silencieux', async () => {
    syncDrift.mockRejectedValueOnce(new Error('flush fail'));
    await expect(ir.onBackground()).resolves.toBeUndefined();
  });

  it('onForeground : firebase déconnecté → triggerReconnect + syncDrift', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({ usage: 1, quota: 10 })) });
    isConnected.mockReturnValue(false);
    await ir.onForeground();
    expect(triggerReconnect).toHaveBeenCalled();
    expect(syncDrift).toHaveBeenCalled();
  });

  it('onForeground : firebase connecté → pas de reconnect', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({ usage: 1, quota: 10 })) });
    isConnected.mockReturnValue(true);
    await ir.onForeground();
    expect(triggerReconnect).not.toHaveBeenCalled();
  });

  it('onForeground : throttle 10s → 2e appel rapide ignoré', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({ usage: 1, quota: 10 })) });
    await ir.onForeground();
    syncDrift.mockClear();
    await ir.onForeground(); // < 10s → early return
    expect(syncDrift).not.toHaveBeenCalled();
  });

  it('onForeground : import throw → catch silencieux', async () => {
    setNavStorage({ estimate: vi.fn(async () => ({ usage: 1, quota: 10 })) });
    isConnected.mockReturnValue(false);
    triggerReconnect.mockRejectedValueOnce(new Error('reco fail'));
    await expect(ir.onForeground()).resolves.toBeUndefined();
  });
});

describe('ios-resilience — init + getStatus', () => {
  it('init complet (navigator présent) puis 2e appel → wired guard', async () => {
    setNavStorage({
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 1, quota: 10 })),
    });
    await ir.init();
    expect(ir.wired).toBe(true);
    const calls = syncDrift.mock.calls.length;
    await ir.init(); // wired → return immédiat
    expect(syncDrift.mock.calls.length).toBe(calls);
  });

  it('getStatus retourne une copie (pas la référence interne)', () => {
    const s = ir.getStatus();
    expect(s).not.toBe(ir.status);
    expect(s).toEqual(ir.status);
  });
});
