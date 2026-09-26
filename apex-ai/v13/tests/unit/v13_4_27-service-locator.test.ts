/**
 * Test régression v13.4.27 — core/service-locator.ts (registry sync/async + caching).
 *
 * Existant : 32.25% statements / 20% functions.
 * Module léger 46 lignes mais utilisé en E2E pour plugins.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { serviceLocator } from '../../core/service-locator.js';

describe('v13.4.27 serviceLocator.register + resolve sync', () => {
  it("register puis resolve retourne l'instance", async () => {
    const factory = () => ({ value: 42 });
    serviceLocator.register('test_sync_1', factory);
    const r = await serviceLocator.resolve<{ value: number }>('test_sync_1');
    expect(r.value).toBe(42);
  });

  it("resolve throw si service non registered", async () => {
    await expect(serviceLocator.resolve('ghost_service')).rejects.toThrow();
  });

  it("resolve même service 2× retourne MÊME instance (singleton cache)", async () => {
    serviceLocator.register('test_singleton_1', () => ({ id: Math.random() }));
    const r1 = await serviceLocator.resolve<{ id: number }>('test_singleton_1');
    const r2 = await serviceLocator.resolve<{ id: number }>('test_singleton_1');
    expect(r1).toBe(r2); /* Même référence (cache) */
    expect(r1.id).toBe(r2.id);
  });

  it("register 2× même name → warn mais pas crash", () => {
    serviceLocator.register('test_dup_1', () => ({ v: 1 }));
    expect(() => {
      serviceLocator.register('test_dup_1', () => ({ v: 2 }));
    }).not.toThrow();
  });
});

describe('v13.4.27 serviceLocator.resolve async (Promise factory)', () => {
  it("factory async retourne instance résolue", async () => {
    serviceLocator.register('test_async_1', async () => ({ async: true }));
    const r = await serviceLocator.resolve<{ async: boolean }>('test_async_1');
    expect(r.async).toBe(true);
  });

  it("resolve async parallel garde 1 seule instance (no race)", async () => {
    let factoryCallCount = 0;
    serviceLocator.register('test_race_1', async () => {
      factoryCallCount++;
      await new Promise((r) => setTimeout(r, 10));
      return { count: factoryCallCount };
    });
    /* Resolve 5 fois en parallèle — factory ne doit s'exécuter qu'une fois */
    const results = await Promise.all([
      serviceLocator.resolve<{ count: number }>('test_race_1'),
      serviceLocator.resolve<{ count: number }>('test_race_1'),
      serviceLocator.resolve<{ count: number }>('test_race_1'),
      serviceLocator.resolve<{ count: number }>('test_race_1'),
      serviceLocator.resolve<{ count: number }>('test_race_1'),
    ]);
    expect(factoryCallCount).toBe(1); /* Une seule exécution */
    /* Toutes les résolutions retournent même instance */
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });
});

describe('v13.4.27 serviceLocator.has + list', () => {
  beforeEach(() => {
    /* Pas de clear() exposé, on tag avec uniques names */
  });

  it("has retourne true si registered", () => {
    serviceLocator.register('test_has_1', () => ({}));
    expect(serviceLocator.has('test_has_1')).toBe(true);
  });

  it("has retourne false si NON registered", () => {
    expect(serviceLocator.has('ghost_has_xyz')).toBe(false);
  });

  it("list retourne array de tous les names", () => {
    serviceLocator.register('test_list_a_xyz', () => ({}));
    serviceLocator.register('test_list_b_xyz', () => ({}));
    const list = serviceLocator.list();
    expect(list).toContain('test_list_a_xyz');
    expect(list).toContain('test_list_b_xyz');
    expect(Array.isArray(list)).toBe(true);
  });
});

describe('v13.4.27 serviceLocator error paths', () => {
  it("factory qui throw → resolve rejected", async () => {
    serviceLocator.register('test_throw_1', () => {
      throw new Error('factory crash');
    });
    await expect(serviceLocator.resolve('test_throw_1')).rejects.toThrow('factory crash');
  });

  it("factory async qui reject → resolve rejected", async () => {
    serviceLocator.register('test_reject_1', async () => {
      throw new Error('async crash');
    });
    await expect(serviceLocator.resolve('test_reject_1')).rejects.toThrow('async crash');
  });
});
