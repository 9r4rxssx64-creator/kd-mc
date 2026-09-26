/**
 * P1-6 (audit v13.2.5) : tests helper bindCleanable / createCleanupScope.
 * Vise à atteindre ratio addEventListener:removeEventListener < 3:1.
 */
import { describe, it, expect } from 'vitest';
import { createCleanupScope, withScope } from '../../core/listener-cleanup.js';

describe('Listener Cleanup Helper (P1-6 audit fix)', () => {
  it('createCleanupScope retourne un scope avec name + size 0', () => {
    const scope = createCleanupScope('test');
    expect(scope.name).toBe('test');
    expect(scope.size).toBe(0);
    expect(scope.disposed).toBe(false);
  });

  it('bind() ajoute un listener + size augmente', () => {
    const scope = createCleanupScope('test');
    const target = new EventTarget();
    let called = 0;
    scope.bind(target, 'foo', () => { called++; });
    expect(scope.size).toBe(1);
    target.dispatchEvent(new Event('foo'));
    expect(called).toBe(1);
  });

  it('cleanup() retire tous les listeners + size revient à 0', () => {
    const scope = createCleanupScope('test');
    const target = new EventTarget();
    let called = 0;
    scope.bind(target, 'foo', () => { called++; });
    scope.bind(target, 'bar', () => { called++; });
    expect(scope.size).toBe(2);
    scope.cleanup();
    expect(scope.size).toBe(0);
    expect(scope.disposed).toBe(true);
    target.dispatchEvent(new Event('foo'));
    target.dispatchEvent(new Event('bar'));
    expect(called).toBe(0); /* listeners bien retirés */
  });

  it('cleanup() est idempotent (appelable plusieurs fois)', () => {
    const scope = createCleanupScope('test');
    scope.cleanup();
    expect(() => scope.cleanup()).not.toThrow();
    expect(scope.disposed).toBe(true);
  });

  it('bind() après cleanup() = no-op (anti async leak)', () => {
    const scope = createCleanupScope('test');
    scope.cleanup();
    const target = new EventTarget();
    let called = 0;
    scope.bind(target, 'foo', () => { called++; });
    target.dispatchEvent(new Event('foo'));
    expect(called).toBe(0);
    expect(scope.size).toBe(0);
  });

  it('unsubscribe individuel via fonction retournée par bind()', () => {
    const scope = createCleanupScope('test');
    const target = new EventTarget();
    let called = 0;
    const off = scope.bind(target, 'foo', () => { called++; });
    target.dispatchEvent(new Event('foo'));
    expect(called).toBe(1);
    off();
    expect(scope.size).toBe(0);
    target.dispatchEvent(new Event('foo'));
    expect(called).toBe(1); /* pas réinvoqué */
  });

  it('onCleanup() exécute extras au cleanup()', () => {
    const scope = createCleanupScope('test');
    let cleaned = 0;
    scope.onCleanup(() => { cleaned++; });
    scope.onCleanup(() => { cleaned++; });
    scope.cleanup();
    expect(cleaned).toBe(2);
  });

  it('onCleanup() après cleanup() = exécution immédiate', () => {
    const scope = createCleanupScope('test');
    scope.cleanup();
    let cleaned = 0;
    scope.onCleanup(() => { cleaned++; });
    expect(cleaned).toBe(1);
  });

  it('cleanup() catch erreurs des handlers extras (non bloquant)', () => {
    const scope = createCleanupScope('test');
    let secondCalled = false;
    scope.onCleanup(() => { throw new Error('boom'); });
    scope.onCleanup(() => { secondCalled = true; });
    expect(() => scope.cleanup()).not.toThrow();
    expect(secondCalled).toBe(true); /* 2e cleanup exécuté malgré erreur 1er */
  });

  it('withScope() crée + remplit un scope d\'un coup', () => {
    let bound = false;
    const scope = withScope('feature-x', (s) => {
      s.bind(window, 'resize', () => { /* */ });
      bound = true;
    });
    expect(bound).toBe(true);
    expect(scope.name).toBe('feature-x');
    expect(scope.size).toBe(1);
    scope.cleanup();
  });

  it('options addEventListener (capture, once, passive) préservées au cleanup', () => {
    const scope = createCleanupScope('test');
    const target = new EventTarget();
    let called = 0;
    /* Avec once: true, le listener s'auto-retire après 1er appel */
    scope.bind(target, 'foo', () => { called++; }, { once: true });
    target.dispatchEvent(new Event('foo'));
    target.dispatchEvent(new Event('foo'));
    expect(called).toBe(1); /* once respecté */
    scope.cleanup(); /* removeEventListener appelé avec mêmes options */
  });
});
