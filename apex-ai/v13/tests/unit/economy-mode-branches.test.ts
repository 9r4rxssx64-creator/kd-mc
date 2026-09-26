/**
 * economy-mode — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible : checkRestoreExpiry (bypass expiré → restore) + persist catch.
 * IMPORTANT (leçon #84) : economyMode est un singleton partagé → snapshot/restore l'état.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { economyMode } from '../../services/core-svc/economy-mode.js';

const em = economyMode as unknown as {
  state: { active: boolean; tempDisabled: boolean; restoreAt: number | null; modelOverride: string | null };
};
let snapshot: typeof em.state;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  snapshot = { ...em.state };
});
afterEach(() => {
  vi.restoreAllMocks();
  em.state = { ...snapshot }; // restaure l'état du singleton (anti-fuite)
});

describe('economy-mode — checkRestoreExpiry via isActive', () => {
  it('bypass expiré → auto-restore (tempDisabled repasse false)', () => {
    economyMode.setActive(true);
    economyMode.bypassFor('image_gen', 60_000);
    expect(economyMode.isActive()).toBe(false); // bypass actif
    em.state.restoreAt = Date.now() - 1; // forcer expiration
    expect(economyMode.isActive()).toBe(true); // checkRestoreExpiry → restore → actif
    expect(em.state.tempDisabled).toBe(false);
  });

  it('bypass non expiré → reste en bypass (condition false)', () => {
    economyMode.setActive(true);
    economyMode.bypassFor('image_gen', 60_000);
    expect(economyMode.isActive()).toBe(false); // restoreAt futur → pas de restore
  });

  it('restoreNow force le restore immédiat', () => {
    economyMode.setActive(true);
    economyMode.bypassFor('image_gen', 60_000);
    economyMode.restoreNow();
    expect(economyMode.isActive()).toBe(true);
  });
});

describe('economy-mode — persist résilience', () => {
  it('setActive avec localStorage.setItem throw → catch (pas de crash)', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => economyMode.setActive(true)).not.toThrow();
    spy.mockRestore();
  });
});

const STORAGE_KEY = 'apex_v13_economy_mode';

describe('economy-mode — init (boot localStorage)', () => {
  it('init sans données stockées → état par défaut (raw null)', () => {
    localStorage.clear();
    economyMode.init();
    expect(em.state.tempDisabled).toBe(false); // reset bypass au boot
  });

  it('init avec {active:true} → applique active', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: true }));
    economyMode.init();
    expect(em.state.active).toBe(true);
  });

  it('init avec JSON sans champ active (typeof non-boolean) → ignore', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 1 }));
    economyMode.init();
    expect(() => economyMode.init()).not.toThrow();
  });

  it('init avec JSON corrompu → catch (pas de crash)', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');
    expect(() => economyMode.init()).not.toThrow();
  });
});
