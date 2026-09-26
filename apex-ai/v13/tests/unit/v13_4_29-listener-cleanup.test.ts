/**
 * Test régression v13.4.29 — core/listener-cleanup.ts (anti memory leak listeners).
 *
 * Audit v13.2.5 : ratio 276 addEventListener / 10 removeEventListener (27:1)
 * = leak garanti. Helper bindCleanable() track auto et cleanup en lot.
 *
 * Existant : 0% statements / 100% functions (marqueur faux positif).
 * Tests : createCleanupScope + bind + cleanup + onCleanup + withScope.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCleanupScope, withScope } from '../../core/listener-cleanup.js';

describe('v13.4.29 createCleanupScope — base', () => {
  it("scope a un nom + size 0 + disposed false initial", () => {
    const scope = createCleanupScope('test_scope_1');
    expect(scope.name).toBe('test_scope_1');
    expect(scope.size).toBe(0);
    expect(scope.disposed).toBe(false);
  });

  it("bind ajoute listener + incrémente size", () => {
    const scope = createCleanupScope('test_bind_1');
    const el = document.createElement('button');
    const handler = vi.fn();
    scope.bind(el, 'click', handler);
    expect(scope.size).toBe(1);
    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("bind plusieurs listeners → size incrémenté", () => {
    const scope = createCleanupScope('test_multi');
    const el = document.createElement('div');
    scope.bind(el, 'click', vi.fn());
    scope.bind(el, 'mouseover', vi.fn());
    scope.bind(el, 'focus', vi.fn());
    expect(scope.size).toBe(3);
  });

  it("bind retourne fn unsubscribe individuelle", () => {
    const scope = createCleanupScope('test_individual');
    const el = document.createElement('div');
    const handler = vi.fn();
    const off = scope.bind(el, 'click', handler);
    expect(scope.size).toBe(1);
    off();
    expect(scope.size).toBe(0);
    el.click();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('v13.4.29 cleanup — anti-leak en lot', () => {
  it("cleanup retire TOUS les listeners enregistrés", () => {
    const scope = createCleanupScope('test_cleanup');
    const el = document.createElement('button');
    const h1 = vi.fn();
    const h2 = vi.fn();
    scope.bind(el, 'click', h1);
    scope.bind(el, 'mouseover', h2);
    scope.cleanup();
    el.click();
    el.dispatchEvent(new MouseEvent('mouseover'));
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it("cleanup met disposed=true + size=0", () => {
    const scope = createCleanupScope('test_disposed');
    const el = document.createElement('div');
    scope.bind(el, 'click', vi.fn());
    expect(scope.disposed).toBe(false);
    scope.cleanup();
    expect(scope.disposed).toBe(true);
    expect(scope.size).toBe(0);
  });

  it("cleanup IDEMPOTENT (2× cleanup OK)", () => {
    const scope = createCleanupScope('test_idem');
    scope.bind(document.createElement('div'), 'click', vi.fn());
    expect(() => {
      scope.cleanup();
      scope.cleanup();
    }).not.toThrow();
  });

  it("bind après cleanup → no-op silencieux (anti-bug teardown async)", () => {
    const scope = createCleanupScope('test_after_cleanup');
    scope.cleanup();
    const handler = vi.fn();
    const off = scope.bind(document.createElement('div'), 'click', handler);
    expect(scope.size).toBe(0); /* Pas ajouté */
    expect(off).toBeTypeOf('function'); /* Retourne noop fn */
    expect(() => off()).not.toThrow();
  });
});

describe('v13.4.29 onCleanup — cleanup arbitraires (timers, intervals)', () => {
  it("onCleanup callback appelé au cleanup global", () => {
    const scope = createCleanupScope('test_oncleanup');
    const cb = vi.fn();
    scope.onCleanup(cb);
    expect(cb).not.toHaveBeenCalled();
    scope.cleanup();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("plusieurs onCleanup tous appelés", () => {
    const scope = createCleanupScope('test_multi_oncleanup');
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    scope.onCleanup(cb1);
    scope.onCleanup(cb2);
    scope.onCleanup(cb3);
    scope.cleanup();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
    expect(cb3).toHaveBeenCalled();
  });

  it("onCleanup après scope disposed → exécute IMMÉDIATEMENT", () => {
    const scope = createCleanupScope('test_late_oncleanup');
    scope.cleanup();
    const cb = vi.fn();
    scope.onCleanup(cb);
    expect(cb).toHaveBeenCalledTimes(1); /* Exécuté direct car disposed */
  });

  it("callback onCleanup qui throw NE BLOQUE PAS les autres", () => {
    const scope = createCleanupScope('test_throw_cleanup');
    const evil = () => { throw new Error('cleanup evil'); };
    const good = vi.fn();
    scope.onCleanup(evil);
    scope.onCleanup(good);
    expect(() => scope.cleanup()).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});

describe('v13.4.29 withScope — 1-shot helper', () => {
  it("withScope crée scope + exécute fn + retourne scope", () => {
    const setupFn = vi.fn();
    const scope = withScope('test_withscope', setupFn);
    expect(setupFn).toHaveBeenCalledTimes(1);
    expect(scope.name).toBe('test_withscope');
    expect(scope.disposed).toBe(false);
  });

  it("withScope fn reçoit le scope comme argument", () => {
    const handler = vi.fn();
    const scope = withScope('test_withscope_bind', (s) => {
      const el = document.createElement('div');
      s.bind(el, 'click', handler);
    });
    expect(scope.size).toBe(1);
    scope.cleanup();
    expect(scope.disposed).toBe(true);
  });
});

describe('v13.4.29 anti-leak garanti — listener correctement retiré', () => {
  it("addEventListener/removeEventListener appelés correctement", () => {
    const scope = createCleanupScope('test_add_remove');
    const el = document.createElement('div');
    const addSpy = vi.spyOn(el, 'addEventListener');
    const removeSpy = vi.spyOn(el, 'removeEventListener');
    const handler = vi.fn();
    scope.bind(el, 'click', handler);
    expect(addSpy).toHaveBeenCalledWith('click', handler, undefined);
    scope.cleanup();
    expect(removeSpy).toHaveBeenCalledWith('click', handler, undefined);
  });

  it("options (passive, once, capture) propagées correctement", () => {
    const scope = createCleanupScope('test_options');
    const el = document.createElement('div');
    const handler = vi.fn();
    const opts = { passive: true, capture: true };
    scope.bind(el, 'scroll', handler, opts);
    /* Le binding stocke options + les passe au removeEventListener */
    const removeSpy = vi.spyOn(el, 'removeEventListener');
    scope.cleanup();
    expect(removeSpy).toHaveBeenCalledWith('scroll', handler, opts);
  });
});
