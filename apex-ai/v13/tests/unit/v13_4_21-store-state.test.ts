/**
 * Test régression v13.4.21 — core/store.ts (state management central).
 *
 * Module utilisé PARTOUT : 200+ services importent store + 50+ subscribe.
 * Bug dans store = casse runtime complet.
 *
 * Existant : 59% coverage statements, 80% branches.
 * Tests : get/set/subscribe/middleware/computed + persistence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '../../core/store.js';

describe('v13.4.21 store.get/set — base state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("get retourne undefined pour clé inexistante", () => {
    const v = store.get('inexistant_key_xyz');
    expect(v).toBeUndefined();
  });

  it("set + get round-trip simple", () => {
    store.set('test_key_str', 'hello');
    expect(store.get('test_key_str')).toBe('hello');
  });

  it("set supporte number, object, array, null", () => {
    store.set('test_num', 42);
    expect(store.get('test_num')).toBe(42);
    store.set('test_obj', { a: 1, b: 'x' });
    expect(store.get('test_obj')).toEqual({ a: 1, b: 'x' });
    store.set('test_arr', [1, 2, 3]);
    expect(store.get('test_arr')).toEqual([1, 2, 3]);
    store.set('test_null', null);
    expect(store.get('test_null')).toBeNull();
  });

  it("set écrase valeur précédente", () => {
    store.set('test_over', 'first');
    store.set('test_over', 'second');
    expect(store.get('test_over')).toBe('second');
  });
});

describe('v13.4.21 store.subscribe — réactivité granulaire', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("subscribe appelé au set avec value + prev", () => {
    const fn = vi.fn();
    const unsub = store.subscribe('test_sub', fn);
    store.set('test_sub', 'first');
    store.set('test_sub', 'second');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'first', undefined);
    expect(fn).toHaveBeenNthCalledWith(2, 'second', 'first');
    unsub();
  });

  it("subscribe granulaire : changement d'AUTRE clé NE déclenche PAS", () => {
    const fn = vi.fn();
    store.subscribe('isolated_a', fn);
    store.set('other_key', 'value');
    expect(fn).not.toHaveBeenCalled();
  });

  it("unsub remove le listener (pas appelé après)", () => {
    const fn = vi.fn();
    const unsub = store.subscribe('test_unsub', fn);
    store.set('test_unsub', 'first');
    unsub();
    store.set('test_unsub', 'second');
    expect(fn).toHaveBeenCalledTimes(1); /* Pas appelé pour 'second' */
  });

  it("plusieurs subscribers sur même clé tous notifiés", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();
    store.subscribe('test_multi', fn1);
    store.subscribe('test_multi', fn2);
    store.subscribe('test_multi', fn3);
    store.set('test_multi', 'broadcast');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);
  });

  it("listener qui throw NE casse PAS les autres listeners", () => {
    const evil = () => { throw new Error('listener evil'); };
    const fn = vi.fn();
    store.subscribe('test_throw', evil);
    store.subscribe('test_throw', fn);
    expect(() => store.set('test_throw', 'ok')).not.toThrow();
    expect(fn).toHaveBeenCalled();
  });
});

describe('v13.4.21 store.use — middleware audit/transform', () => {
  it("middleware appelé sur chaque set avec (key, value, prev)", () => {
    const middleware = vi.fn(() => true);
    const unsub = store.use(middleware);
    store.set('mw_test', 'value');
    expect(middleware).toHaveBeenCalled();
    expect(middleware.mock.calls[0]?.[0]).toBe('mw_test');
    expect(middleware.mock.calls[0]?.[1]).toBe('value');
    unsub();
  });

  it("middleware retournant false ABORT le set", () => {
    const abort = vi.fn(() => false);
    const unsub = store.use(abort);
    store.set('mw_abort', 'should_not_persist');
    expect(store.get('mw_abort')).toBeUndefined();
    unsub();
  });

  it("middleware retournant { value } TRANSFORM la valeur stockée", () => {
    const transform = vi.fn((_k: string, v: unknown) => ({ value: `transformed:${v}` }));
    const unsub = store.use(transform);
    store.set('mw_transform', 'original');
    expect(store.get('mw_transform')).toBe('transformed:original');
    unsub();
  });

  it("unsub middleware retire de la chain", () => {
    const mw = vi.fn(() => true);
    const unsub = store.use(mw);
    unsub();
    store.set('mw_off', 'value');
    expect(mw).not.toHaveBeenCalled();
  });

  it("plusieurs middlewares appliqués en chaîne", () => {
    const mw1 = vi.fn(() => true);
    const mw2 = vi.fn(() => true);
    const u1 = store.use(mw1);
    const u2 = store.use(mw2);
    store.set('mw_chain', 'v');
    expect(mw1).toHaveBeenCalled();
    expect(mw2).toHaveBeenCalled();
    u1(); u2();
  });
});

describe('v13.4.21 store.defineComputed/getComputed — derived state', () => {
  it("computed retourne undefined si pas registered", () => {
    expect(store.getComputed('ghost_computed')).toBeUndefined();
  });

  it("computed retourne valeur dérivée", () => {
    store.set('comp_a', 5);
    store.set('comp_b', 10);
    store.defineComputed('comp_sum', () => {
      return (store.get('comp_a') as number) + (store.get('comp_b') as number);
    });
    expect(store.getComputed<number>('comp_sum')).toBe(15);
  });

  it("computed recalculée à chaque access (lazy, pas cache)", () => {
    store.set('comp_x', 1);
    store.defineComputed('comp_doubled', () => (store.get('comp_x') as number) * 2);
    expect(store.getComputed<number>('comp_doubled')).toBe(2);
    store.set('comp_x', 5);
    expect(store.getComputed<number>('comp_doubled')).toBe(10);
  });

  it("computed qui throw retourne undefined (catch interne)", () => {
    store.defineComputed('comp_evil', () => { throw new Error('boom'); });
    expect(store.getComputed('comp_evil')).toBeUndefined();
  });

  it("listComputed retourne tous les keys registered", () => {
    store.defineComputed('comp_listing_1', () => 1);
    store.defineComputed('comp_listing_2', () => 2);
    const keys = store.listComputed();
    expect(keys).toContain('comp_listing_1');
    expect(keys).toContain('comp_listing_2');
  });
});

describe('v13.4.21 store.snapshot — read-only état', () => {
  it("snapshot retourne objet (clone superficiel)", () => {
    store.set('snap_a', 'A');
    const snap = store.snapshot();
    expect(snap['snap_a']).toBe('A');
  });

  it("snapshot non-mutable depuis l'extérieur (clone)", () => {
    store.set('snap_x', 'original');
    const snap = store.snapshot();
    /* Tentative mutation du snapshot ne doit PAS affecter le store */
    (snap as Record<string, unknown>)['snap_x'] = 'mutated';
    expect(store.get('snap_x')).toBe('original');
  });
});
