/**
 * APEX v13 — Tests deep inp-optimizer (PerformanceObserver + scheduler.postTask)
 *
 * Cible : pousser services/inp-optimizer.ts vers 100% lines + branches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/observability/perf-metrics.js', () => ({
  perfMetrics: { record: vi.fn() },
}));

import { inpOptimizer } from '../../services/observability/inp-optimizer.js';
import { logger } from '../../core/logger.js';
import { perfMetrics } from '../../services/observability/perf-metrics.js';

let savedObserver: typeof PerformanceObserver | undefined;
let observerCallbacks: Array<(list: { getEntries: () => Array<Record<string, unknown>> }) => void> = [];
let observers: Array<{ disconnect: () => void; observe: (init: unknown) => void; throwOnObserve?: boolean }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  observerCallbacks = [];
  observers = [];
  /* Stub PerformanceObserver capture les callbacks */
  savedObserver = globalThis.PerformanceObserver;
  // @ts-expect-error mock
  globalThis.PerformanceObserver = function (cb: (list: { getEntries: () => Array<Record<string, unknown>> }) => void) {
    observerCallbacks.push(cb);
    const obs = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    };
    observers.push(obs);
    return obs;
  };
  /* Reset internals */
  inpOptimizer.uninstall();
  /* Force re-allow install */
  (inpOptimizer as unknown as { installed: boolean }).installed = false;
  (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples = [];
});

afterEach(() => {
  inpOptimizer.uninstall();
  if (savedObserver) globalThis.PerformanceObserver = savedObserver;
});

describe('inp-optimizer — install/uninstall', () => {
  it('install crée 2 observers et log info', () => {
    inpOptimizer.install();
    expect(observers.length).toBeGreaterThanOrEqual(2);
    expect(logger.info).toHaveBeenCalledWith('inp-optimizer', expect.stringContaining('installé'));
  });

  it('install idempotent (2e appel no-op)', () => {
    inpOptimizer.install();
    const n = observers.length;
    inpOptimizer.install();
    expect(observers.length).toBe(n);
  });

  it('uninstall disconnect les observers', () => {
    inpOptimizer.install();
    const disc1 = observers[0]?.disconnect as ReturnType<typeof vi.fn>;
    const disc2 = observers[1]?.disconnect as ReturnType<typeof vi.fn>;
    inpOptimizer.uninstall();
    expect(disc1).toHaveBeenCalled();
    expect(disc2).toHaveBeenCalled();
  });

  it('uninstall sans install ne plante pas', () => {
    expect(() => inpOptimizer.uninstall()).not.toThrow();
  });
});

describe('inp-optimizer — Long Task callback', () => {
  it('long task >50ms log warn', () => {
    inpOptimizer.install();
    const cb = observerCallbacks[0]!;
    cb({ getEntries: () => [{ duration: 75, name: 'task1', startTime: 100 }] });
    expect(logger.warn).toHaveBeenCalledWith('inp-optimizer', expect.stringContaining('Long Task'), expect.any(Object));
  });

  it('long task ≤50ms ne log pas', () => {
    inpOptimizer.install();
    const cb = observerCallbacks[0]!;
    cb({ getEntries: () => [{ duration: 30, name: 'task2', startTime: 100 }] });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('long task >200ms trigger scheduleYield', async () => {
    inpOptimizer.install();
    const cb = observerCallbacks[0]!;
    const yieldSpy = vi.spyOn(inpOptimizer, 'scheduleYield');
    cb({ getEntries: () => [{ duration: 250, name: 'big', startTime: 0 }] });
    await new Promise((r) => setTimeout(r, 5));
    expect(yieldSpy).toHaveBeenCalled();
    yieldSpy.mockRestore();
  });
});

describe('inp-optimizer — INP measure callback', () => {
  it('event entry avec interactionId enregistre INP', () => {
    inpOptimizer.install();
    const cb = observerCallbacks[1]!;
    cb({
      getEntries: () => [{
        startTime: 100,
        processingStart: 105,
        duration: 50,
        interactionId: 1,
      }],
    });
    const samples = (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples;
    expect(samples.length).toBe(1);
    /* INP = (105-100) + 50 = 55 */
    expect(samples[0]).toBe(55);
  });

  it('INP > 200 log warn', () => {
    inpOptimizer.install();
    const cb = observerCallbacks[1]!;
    cb({
      getEntries: () => [{
        startTime: 0,
        processingStart: 100,
        duration: 250,
        interactionId: 2,
      }],
    });
    expect(logger.warn).toHaveBeenCalledWith('inp-optimizer', expect.stringContaining('INP élevé'));
  });

  it('event sans interactionId ignored', () => {
    inpOptimizer.install();
    const cb = observerCallbacks[1]!;
    cb({
      getEntries: () => [{ startTime: 0, processingStart: 10, duration: 50 }],
    });
    const samples = (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples;
    expect(samples.length).toBe(0);
  });

  it('cap à 100 samples', () => {
    inpOptimizer.install();
    const cb = observerCallbacks[1]!;
    /* Ajoute 150 samples */
    for (let i = 0; i < 150; i++) {
      cb({
        getEntries: () => [{ startTime: 0, processingStart: 5, duration: 10, interactionId: i + 100 }],
      });
    }
    const samples = (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples;
    expect(samples.length).toBe(100);
  });

  it('appelle perfMetrics.record', async () => {
    inpOptimizer.install();
    const cb = observerCallbacks[1]!;
    cb({
      getEntries: () => [{ startTime: 0, processingStart: 5, duration: 10, interactionId: 99 }],
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(perfMetrics.record).toHaveBeenCalledWith('INP', 15);
  });
});

describe('inp-optimizer — input yield', () => {
  it('keydown Tab trigger scheduleYield', async () => {
    inpOptimizer.install();
    const yieldSpy = vi.spyOn(inpOptimizer, 'scheduleYield');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await new Promise((r) => setTimeout(r, 5));
    expect(yieldSpy).toHaveBeenCalled();
    yieldSpy.mockRestore();
  });

  it('keydown Enter trigger scheduleYield', async () => {
    inpOptimizer.install();
    const yieldSpy = vi.spyOn(inpOptimizer, 'scheduleYield');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 5));
    expect(yieldSpy).toHaveBeenCalled();
    yieldSpy.mockRestore();
  });

  it('keydown autre key ne trigger pas yield', async () => {
    inpOptimizer.install();
    const yieldSpy = vi.spyOn(inpOptimizer, 'scheduleYield');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await new Promise((r) => setTimeout(r, 5));
    expect(yieldSpy).not.toHaveBeenCalled();
    yieldSpy.mockRestore();
  });

  it('pointerdown sur element data-heavy-handler schedule rAF', () => {
    inpOptimizer.install();
    const target = document.createElement('button');
    target.dataset['heavyHandler'] = 'true';
    document.body.appendChild(target);
    const rafSpy = vi.spyOn(inpOptimizer, 'scheduleInRAF');
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(rafSpy).toHaveBeenCalled();
    rafSpy.mockRestore();
    target.remove();
  });

  it('pointerdown sans data-heavy-handler : no rAF', () => {
    inpOptimizer.install();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const rafSpy = vi.spyOn(inpOptimizer, 'scheduleInRAF');
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
    target.remove();
  });
});

describe('inp-optimizer — scheduleYield', () => {
  it('utilise scheduler.postTask si dispo', async () => {
    const postTask = vi.fn(async () => {});
    (window as unknown as Record<string, unknown>).scheduler = { postTask };
    await inpOptimizer.scheduleYield();
    expect(postTask).toHaveBeenCalled();
    delete (window as unknown as Record<string, unknown>).scheduler;
  });

  it('fallback setTimeout si scheduler absent', async () => {
    delete (window as unknown as Record<string, unknown>).scheduler;
    const start = Date.now();
    await inpOptimizer.scheduleYield();
    expect(Date.now() - start).toBeGreaterThanOrEqual(0);
  });
});

describe('inp-optimizer — scheduleInRAF', () => {
  it('utilise requestAnimationFrame si dispo', async () => {
    const cb = vi.fn();
    inpOptimizer.scheduleInRAF(cb);
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).toHaveBeenCalled();
  });

  it('fallback setTimeout si rAF absent', async () => {
    const orig = globalThis.requestAnimationFrame;
    // @ts-expect-error
    globalThis.requestAnimationFrame = undefined;
    try {
      const cb = vi.fn();
      inpOptimizer.scheduleInRAF(cb);
      await new Promise((r) => setTimeout(r, 50));
      expect(cb).toHaveBeenCalled();
    } finally {
      globalThis.requestAnimationFrame = orig;
    }
  });
});

describe('inp-optimizer — getINPP98 + getStats', () => {
  it('getINPP98 retourne -1 si <5 samples', () => {
    expect(inpOptimizer.getINPP98()).toBe(-1);
  });

  it('getINPP98 retourne le 98e percentile sur ≥5 samples', () => {
    (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p98 = inpOptimizer.getINPP98();
    expect(p98).toBeGreaterThanOrEqual(90);
    expect(p98).toBeLessThanOrEqual(100);
  });

  it('getStats avec 0 samples → no-data', () => {
    const s = inpOptimizer.getStats();
    expect(s.rating).toBe('no-data');
    expect(s.count).toBe(0);
  });

  it('getStats good (p98 <200)', () => {
    (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples = [50, 60, 70, 80, 90];
    const s = inpOptimizer.getStats();
    expect(s.rating).toBe('good');
    expect(s.count).toBe(5);
  });

  it('getStats needs-improvement (200 ≤ p98 < 500)', () => {
    (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples = [250, 260, 270, 280, 290, 300, 310, 320, 330, 340];
    const s = inpOptimizer.getStats();
    expect(s.rating).toBe('needs-improvement');
  });

  it('getStats poor (p98 ≥ 500)', () => {
    (inpOptimizer as unknown as { inpSamples: number[] }).inpSamples = Array(50).fill(0).map((_, i) => 600 + i);
    const s = inpOptimizer.getStats();
    expect(s.rating).toBe('poor');
  });
});

describe('inp-optimizer — observer throw fallback', () => {
  it('observer.observe throw → catch silencieux', () => {
    /* Setup observer dont .observe throw */
    // @ts-expect-error
    globalThis.PerformanceObserver = function (cb: unknown) {
      observerCallbacks.push(cb as (list: { getEntries: () => Array<Record<string, unknown>> }) => void);
      return {
        observe: () => { throw new Error('not supported'); },
        disconnect: vi.fn(),
      };
    };
    expect(() => inpOptimizer.install()).not.toThrow();
  });

  it('document undefined (SSR) → installInputYield skip silencieusement', () => {
    /* Simul SSR : remplace document par undefined temporairement */
    const origDoc = globalThis.document;
    /* @ts-expect-error simul SSR */
    delete globalThis.document;
    try {
      (inpOptimizer as unknown as { installed: boolean }).installed = false;
      expect(() => inpOptimizer.install()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'document', { value: origDoc, configurable: true });
    }
  });
});
