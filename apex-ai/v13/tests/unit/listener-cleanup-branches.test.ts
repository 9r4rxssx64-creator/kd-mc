/**
 * listener-cleanup — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible les catch removeEventListener (unbind + cleanup) et onCleanup-après-dispose.
 */
import { describe, it, expect, vi } from 'vitest';

import { createCleanupScope, withScope } from '../../core/listener-cleanup.js';

/* EventTarget factice dont removeEventListener throw → exerce les catch. */
function throwingTarget(): EventTarget {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(() => { throw new Error('remove fail'); }),
    dispatchEvent: vi.fn(() => true),
  } as unknown as EventTarget;
}

describe('listener-cleanup — branches catch & dispose', () => {
  it('unbind() : removeEventListener throw → catch (pas de crash)', () => {
    const scope = createCleanupScope('t1');
    const unbind = scope.bind(throwingTarget(), 'click', () => {});
    expect(() => unbind()).not.toThrow();
  });

  it('cleanup() : removeEventListener throw → catch, scope disposé', () => {
    const scope = createCleanupScope('t2');
    scope.bind(throwingTarget(), 'click', () => {});
    expect(() => scope.cleanup()).not.toThrow();
    expect(scope.disposed).toBe(true);
  });

  it('cleanup() 2x → 2e appel no-op (déjà disposé)', () => {
    const scope = createCleanupScope('t3');
    scope.cleanup();
    expect(() => scope.cleanup()).not.toThrow();
  });

  it('onCleanup après dispose → exécute immédiatement + catch si throw', () => {
    const scope = createCleanupScope('t4');
    scope.cleanup();
    let ran = false;
    scope.onCleanup(() => { ran = true; });
    expect(ran).toBe(true);
    expect(() => scope.onCleanup(() => { throw new Error('cb fail'); })).not.toThrow();
  });

  it('onCleanup avant dispose → exécuté au cleanup ; cleanup callback throw → isolé', () => {
    const scope = createCleanupScope('t5');
    let ran = false;
    scope.onCleanup(() => { ran = true; });
    scope.onCleanup(() => { throw new Error('boom'); });
    expect(() => scope.cleanup()).not.toThrow();
    expect(ran).toBe(true);
  });

  it('bind après dispose → no-op silencieux (unbind no-op)', () => {
    const scope = createCleanupScope('t6');
    scope.cleanup();
    const unbind = scope.bind(throwingTarget(), 'click', () => {});
    expect(() => unbind()).not.toThrow();
  });

  it('bind normal + unbind retire le binding', () => {
    const scope = createCleanupScope('t7');
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as EventTarget;
    const unbind = scope.bind(target, 'click', () => {}, { once: true });
    unbind();
    expect((target.removeEventListener as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('withScope exécute fn et retourne le scope', () => {
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as EventTarget;
    const scope = withScope('w', (s) => { s.bind(target, 'x', () => {}); });
    expect(scope.disposed).toBe(false);
    scope.cleanup();
    expect(scope.disposed).toBe(true);
  });
});
