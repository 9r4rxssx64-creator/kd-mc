/**
 * Test régression v13.4.66 — core/listener-cleanup.ts.
 *
 * CleanupScope : tracking addEventListener + auto removeEventListener
 * pour anti memory-leak (règle CLAUDE.md "55+ setInterval zombies" v12.785).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createCleanupScope,
  withScope,
} from '../../core/listener-cleanup.js';

describe('v13.4.66 listener-cleanup — createCleanupScope', () => {
  it("crée un scope nommé avec size=0 / disposed=false", () => {
    const s = createCleanupScope('test-66');
    expect(s).toBeDefined();
    expect(s.name).toBe('test-66');
    expect(s.size).toBe(0);
    expect(s.disposed).toBe(false);
    expect(typeof s.bind).toBe('function');
    expect(typeof s.cleanup).toBe('function');
    expect(typeof s.onCleanup).toBe('function');
  });

  it("bind() ajoute listener et incrémente size", () => {
    const s = createCleanupScope('test-66-bind');
    const el = document.createElement('div');
    const listener = vi.fn();
    s.bind(el, 'click', listener);
    expect(s.size).toBe(1);
  });

  it("bind() retourne unbind() qui retire le listener individuellement", () => {
    const s = createCleanupScope('test-66-unbind');
    const el = document.createElement('div');
    const listener = vi.fn();
    const unbind = s.bind(el, 'click', listener);
    expect(s.size).toBe(1);
    unbind();
    expect(s.size).toBe(0);
  });

  it("listener wired effectivement (event reçu)", () => {
    const s = createCleanupScope('test-66-fire');
    const el = document.createElement('div');
    const listener = vi.fn();
    s.bind(el, 'click', listener);
    el.dispatchEvent(new Event('click'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cleanup() retire TOUS les listeners + disposed=true", () => {
    const s = createCleanupScope('test-66-cleanup');
    const el = document.createElement('div');
    const listener = vi.fn();
    s.bind(el, 'click', listener);
    s.bind(el, 'mouseenter', listener);
    expect(s.size).toBe(2);
    s.cleanup();
    expect(s.size).toBe(0);
    expect(s.disposed).toBe(true);
    /* event dispatch après cleanup → listener pas appelé */
    el.dispatchEvent(new Event('click'));
    expect(listener).not.toHaveBeenCalled();
  });

  it("cleanup() idempotent (multi-call sans throw)", () => {
    const s = createCleanupScope('test-66-idempotent');
    expect(() => {
      s.cleanup();
      s.cleanup();
      s.cleanup();
    }).not.toThrow();
    expect(s.disposed).toBe(true);
  });

  it("bind() après cleanup → no-op (silent, retourne fn vide)", () => {
    const s = createCleanupScope('test-66-after-cleanup');
    s.cleanup();
    const el = document.createElement('div');
    const listener = vi.fn();
    const unbind = s.bind(el, 'click', listener);
    expect(typeof unbind).toBe('function');
    expect(s.size).toBe(0); /* anti-bug pattern : pas de listener actif */
    el.dispatchEvent(new Event('click'));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('v13.4.66 listener-cleanup — onCleanup arbitrary', () => {
  it("onCleanup(fn) → fn appelée au cleanup()", () => {
    const s = createCleanupScope('test-66-on');
    const fn = vi.fn();
    s.onCleanup(fn);
    expect(fn).not.toHaveBeenCalled();
    s.cleanup();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("onCleanup multiple → toutes appelées même si une throw", () => {
    const s = createCleanupScope('test-66-multi-on');
    const fn1 = vi.fn();
    const fn2 = vi.fn(() => { throw new Error('boom'); });
    const fn3 = vi.fn();
    s.onCleanup(fn1);
    s.onCleanup(fn2);
    s.onCleanup(fn3);
    s.cleanup();
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1); /* anti-bug : un throw bloque pas les autres */
  });

  it("onCleanup(fn) après cleanup déjà exécuté → appelée immédiatement", () => {
    const s = createCleanupScope('test-66-late-on');
    s.cleanup();
    const fn = vi.fn();
    s.onCleanup(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('v13.4.66 listener-cleanup — withScope 1-shot', () => {
  it("withScope(name, fn) retourne le scope avec bindings", () => {
    let captured: ReturnType<typeof createCleanupScope> | null = null;
    const s = withScope('test-66-with', (scope) => {
      const el = document.createElement('div');
      scope.bind(el, 'click', () => { /* noop */ });
      captured = scope;
    });
    expect(s).toBeDefined();
    expect(s.name).toBe('test-66-with');
    expect(s.size).toBe(1);
    expect(captured).toBe(s);
  });

  it("withScope retourne scope cleanup-able", () => {
    const s = withScope('test-66-with-cleanup', (scope) => {
      const el = document.createElement('div');
      scope.bind(el, 'click', () => { /* noop */ });
      scope.bind(el, 'focus', () => { /* noop */ });
    });
    expect(s.size).toBe(2);
    s.cleanup();
    expect(s.size).toBe(0);
    expect(s.disposed).toBe(true);
  });
});
