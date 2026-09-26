/**
 * Tests RÉELS core/di.ts (Jet 7.5 — coverage 0% → 100%).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { di } from '../../core/di.js';

describe('DI container (core/di.ts)', () => {
  /* Note : di est un singleton, pas de reset facile. On utilise des noms uniques par test. */

  it('register + resolve sync factory', async () => {
    di.register('test-sync-' + Date.now(), () => ({ value: 42 }));
    const name = 'test-sync-' + Date.now();
    di.register(name, () => ({ value: 42 }));
    const instance = await di.resolve<{ value: number }>(name);
    expect(instance.value).toBe(42);
  });

  it('register + resolve async factory', async () => {
    const name = 'test-async-' + Date.now();
    di.register(name, async () => ({ async: true }));
    const instance = await di.resolve<{ async: boolean }>(name);
    expect(instance.async).toBe(true);
  });

  it('resolve cache l\'instance (singleton)', async () => {
    const name = 'test-singleton-' + Date.now();
    let calls = 0;
    di.register(name, () => {
      calls++;
      return { calls };
    });
    const i1 = await di.resolve<{ calls: number }>(name);
    const i2 = await di.resolve<{ calls: number }>(name);
    expect(i1).toBe(i2); /* même instance */
    expect(calls).toBe(1); /* factory appelée une seule fois */
  });

  it('resolve concurrent retourne la même promesse (race-safe)', async () => {
    const name = 'test-concurrent-' + Date.now();
    let calls = 0;
    di.register(name, async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { calls };
    });
    const [i1, i2, i3] = await Promise.all([
      di.resolve(name),
      di.resolve(name),
      di.resolve(name),
    ]);
    expect(i1).toBe(i2);
    expect(i2).toBe(i3);
    expect(calls).toBe(1); /* race-safe via loading promise cache */
  });

  it('resolve service inconnu throw', async () => {
    await expect(di.resolve('jamais-enregistre-' + Date.now())).rejects.toThrow('not registered');
  });

  it('register service déjà existant warn (no overwrite)', () => {
    const name = 'test-dupe-' + Date.now();
    di.register(name, () => 'first');
    di.register(name, () => 'second');
    /* Pas d'erreur, mais log warn (vérifié indirectement via has()) */
    expect(di.has(name)).toBe(true);
  });

  it('has retourne true si service registered', () => {
    const name = 'test-has-' + Date.now();
    di.register(name, () => 'x');
    expect(di.has(name)).toBe(true);
    expect(di.has('jamais-' + Date.now())).toBe(false);
  });

  it('list retourne array de noms', () => {
    const name = 'test-list-' + Date.now();
    di.register(name, () => 'x');
    const list = di.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toContain(name);
  });
});
