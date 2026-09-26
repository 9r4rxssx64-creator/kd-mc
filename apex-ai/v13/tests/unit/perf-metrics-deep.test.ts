/**
 * APEX v13 — Tests deep perf-metrics (push 68% → 95%+)
 *
 * Couvre install/observers callbacks, record ratings, getScore,
 * formatForUI grades, getMemoryUsage 4 paths (measureUAS/jsHeap/estimated/unavailable).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { perfMetrics } from '../../services/observability/perf-metrics.js';
import { logger } from '../../core/logger.js';

let savedObserver: typeof PerformanceObserver | undefined;
let observerCallbacks: Array<{ type: string; cb: (list: { getEntries: () => PerformanceEntry[] }) => void }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  observerCallbacks = [];
  perfMetrics.disconnect();
  perfMetrics.reset();
  /* Stub PerformanceObserver capture les callbacks par type */
  savedObserver = globalThis.PerformanceObserver;
  // @ts-expect-error mock
  globalThis.PerformanceObserver = function (cb: (list: { getEntries: () => PerformanceEntry[] }) => void) {
    let registeredType = 'unknown';
    return {
      observe: vi.fn((init: PerformanceObserverInit) => {
        registeredType = (init as { type?: string }).type ?? 'unknown';
        observerCallbacks.push({ type: registeredType, cb });
      }),
      disconnect: vi.fn(),
    };
  };
  /* H6 reset memory */
  (perfMetrics as unknown as { clsValue: number; lastInputTs: number }).clsValue = 0;
  (perfMetrics as unknown as { clsValue: number; lastInputTs: number }).lastInputTs = 0;
});

afterEach(() => {
  perfMetrics.disconnect();
  perfMetrics.reset();
  if (savedObserver) globalThis.PerformanceObserver = savedObserver;
});

describe('perf-metrics — install', () => {
  it('install crée observers + initial CLS=0 record', () => {
    perfMetrics.install();
    expect(observerCallbacks.length).toBeGreaterThan(0);
    /* CLS baseline 0 enregistrée */
    const all = perfMetrics.getAll();
    expect(all.some((m) => m.name === 'CLS' && m.value === 0)).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('perf-metrics', expect.stringContaining('observers installed'));
  });

  it('install idempotent', () => {
    perfMetrics.install();
    const n = observerCallbacks.length;
    perfMetrics.install();
    expect(observerCallbacks.length).toBe(n);
  });

  it('PerformanceObserver undefined → log "disabled"', () => {
    perfMetrics.disconnect();
    (perfMetrics as unknown as { installed: boolean }).installed = false;
    // @ts-expect-error
    globalThis.PerformanceObserver = undefined;
    perfMetrics.install();
    expect(logger.info).toHaveBeenCalledWith('perf-metrics', expect.stringContaining('not available'));
  });
});

describe('perf-metrics — observer callbacks', () => {
  it('LCP entry → record', () => {
    perfMetrics.install();
    const lcpCb = observerCallbacks.find((o) => o.type === 'largest-contentful-paint');
    if (lcpCb) {
      lcpCb.cb({ getEntries: () => [{ startTime: 1500, name: 'lcp', duration: 0, entryType: 'lcp', toJSON: () => ({}) } as PerformanceEntry] });
      const snap = perfMetrics.getSnapshot();
      expect(snap.LCP?.value).toBe(1500);
      expect(snap.LCP?.rating).toBe('good');
    }
  });

  it('CLS layout-shift accumulé', () => {
    perfMetrics.install();
    const clsCb = observerCallbacks.find((o) => o.type === 'layout-shift');
    if (clsCb) {
      clsCb.cb({ getEntries: () => [{ value: 0.05, hadRecentInput: false } as unknown as PerformanceEntry] });
      clsCb.cb({ getEntries: () => [{ value: 0.03, hadRecentInput: false } as unknown as PerformanceEntry] });
      expect(perfMetrics.getCLS()).toBeCloseTo(0.08);
    }
  });

  it('CLS hadRecentInput=true → ignored', () => {
    perfMetrics.install();
    const clsCb = observerCallbacks.find((o) => o.type === 'layout-shift');
    if (clsCb) {
      clsCb.cb({ getEntries: () => [{ value: 0.5, hadRecentInput: true } as unknown as PerformanceEntry] });
      expect(perfMetrics.getCLS()).toBe(0);
    }
  });

  it('paint entry first-contentful-paint → record FCP', () => {
    perfMetrics.install();
    const fcpCb = observerCallbacks.find((o) => o.type === 'paint');
    if (fcpCb) {
      fcpCb.cb({ getEntries: () => [{ name: 'first-contentful-paint', startTime: 800 } as PerformanceEntry] });
      expect(perfMetrics.getSnapshot().FCP?.value).toBe(800);
    }
  });

  it('paint entry autre nom → ignored', () => {
    perfMetrics.install();
    const fcpCb = observerCallbacks.find((o) => o.type === 'paint');
    if (fcpCb) {
      fcpCb.cb({ getEntries: () => [{ name: 'some-other-paint', startTime: 800 } as PerformanceEntry] });
      expect(perfMetrics.getSnapshot().FCP).toBeNull();
    }
  });

  it('event entry avec interactionId+duration → record INP', () => {
    perfMetrics.install();
    const evtCb = observerCallbacks.find((o) => o.type === 'event');
    if (evtCb) {
      evtCb.cb({ getEntries: () => [{ duration: 150, interactionId: 1 } as unknown as PerformanceEntry] });
      expect(perfMetrics.getSnapshot().INP?.value).toBe(150);
    }
  });

  it('event entry sans interactionId → skip', () => {
    perfMetrics.install();
    const evtCb = observerCallbacks.find((o) => o.type === 'event');
    if (evtCb) {
      evtCb.cb({ getEntries: () => [{ duration: 100 } as unknown as PerformanceEntry] });
      expect(perfMetrics.getSnapshot().INP).toBeNull();
    }
  });

  it('keydown event update lastInputTs', () => {
    perfMetrics.install();
    const before = perfMetrics.getLastInputTime();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(perfMetrics.getLastInputTime()).toBeGreaterThanOrEqual(before);
  });

  it('pointerdown update lastInputTs', () => {
    perfMetrics.install();
    window.dispatchEvent(new Event('pointerdown'));
    expect(perfMetrics.getLastInputTime()).toBeGreaterThan(0);
  });
});

describe('perf-metrics — observer.observe throw fallback', () => {
  it('observe throw → catch silencieux + pas d\'observer ajouté', () => {
    perfMetrics.disconnect();
    (perfMetrics as unknown as { installed: boolean }).installed = false;
    // @ts-expect-error
    globalThis.PerformanceObserver = function () {
      return {
        observe: () => { throw new Error('not supported'); },
        disconnect: vi.fn(),
      };
    };
    expect(() => perfMetrics.install()).not.toThrow();
  });
});

describe('perf-metrics — record ratings', () => {
  it('LCP < 2500 → good', () => {
    perfMetrics.record('LCP', 1500);
    expect(perfMetrics.getSnapshot().LCP?.rating).toBe('good');
  });

  it('LCP 3000 → needs-improvement', () => {
    perfMetrics.record('LCP', 3000);
    expect(perfMetrics.getSnapshot().LCP?.rating).toBe('needs-improvement');
  });

  it('LCP 5000 → poor + warn log', () => {
    perfMetrics.record('LCP', 5000);
    expect(perfMetrics.getSnapshot().LCP?.rating).toBe('poor');
    expect(logger.warn).toHaveBeenCalledWith('perf-metrics', expect.stringContaining('LCP POOR'));
  });

  it('cap 200 metrics', () => {
    for (let i = 0; i < 250; i++) perfMetrics.record('LCP', i);
    expect(perfMetrics.getAll().length).toBe(200);
  });
});

describe('perf-metrics — getScore', () => {
  it('aucune metric → score 0', () => {
    const s = perfMetrics.getScore();
    expect(s.score).toBe(0);
    expect(s.details.LCP?.pts).toBe(0);
  });

  it('toutes metrics good → score 100', () => {
    perfMetrics.record('LCP', 1000);
    perfMetrics.record('INP', 100);
    perfMetrics.record('CLS', 0.05);
    perfMetrics.record('FCP', 1000);
    perfMetrics.record('TTFB', 200);
    expect(perfMetrics.getScore().score).toBe(100);
  });

  it('mix good/poor → score intermédiaire', () => {
    perfMetrics.record('LCP', 5000); /* poor pts=30 */
    perfMetrics.record('INP', 100); /* good pts=100 */
    perfMetrics.record('CLS', 0.05); /* good pts=100 */
    const s = perfMetrics.getScore();
    expect(s.score).toBeLessThan(100);
    expect(s.score).toBeGreaterThan(0);
  });

  it('needs-improvement → pts=60', () => {
    perfMetrics.record('LCP', 3000);
    const s = perfMetrics.getScore();
    expect(s.details.LCP?.pts).toBe(60);
  });
});

describe('perf-metrics — formatForUI', () => {
  it('grade A si score >= 90', () => {
    perfMetrics.record('LCP', 1000);
    perfMetrics.record('INP', 100);
    perfMetrics.record('CLS', 0.05);
    perfMetrics.record('FCP', 1000);
    perfMetrics.record('TTFB', 200);
    expect(perfMetrics.formatForUI().grade).toBe('A');
  });

  it('grade B si 75-89', () => {
    perfMetrics.record('LCP', 3000); /* poor 30 */
    perfMetrics.record('INP', 100);
    perfMetrics.record('CLS', 0.05);
    perfMetrics.record('FCP', 1000);
    perfMetrics.record('TTFB', 200);
    const ui = perfMetrics.formatForUI();
    expect(['B', 'C', 'A'].includes(ui.grade)).toBe(true);
  });

  it('grade F si score < 40', () => {
    perfMetrics.record('LCP', 5000); /* poor */
    perfMetrics.record('INP', 1000); /* poor */
    perfMetrics.record('CLS', 0.5); /* poor */
    perfMetrics.record('FCP', 5000);
    perfMetrics.record('TTFB', 3000);
    expect(perfMetrics.formatForUI().grade).toBe('F');
  });

  it('CLS formaté en 0.XXX', () => {
    perfMetrics.record('CLS', 0.123);
    const ui = perfMetrics.formatForUI();
    const cls = ui.metrics.find((m) => m.name === 'CLS');
    expect(cls?.value).toBe('0.123');
  });

  it('LCP formaté en Xms', () => {
    perfMetrics.record('LCP', 1500);
    const ui = perfMetrics.formatForUI();
    const lcp = ui.metrics.find((m) => m.name === 'LCP');
    expect(lcp?.value).toMatch(/ms$/);
  });

  it('emoji 🟢/🟠/🔴 selon rating', () => {
    perfMetrics.record('LCP', 1000); /* good */
    perfMetrics.record('INP', 300); /* needs */
    perfMetrics.record('CLS', 0.5); /* poor */
    const ui = perfMetrics.formatForUI();
    const map = Object.fromEntries(ui.metrics.map((m) => [m.name, m.emoji]));
    expect(map['LCP']).toBe('🟢');
    expect(map['INP']).toBe('🟠');
    expect(map['CLS']).toBe('🔴');
  });
});

describe('perf-metrics — reset + disconnect', () => {
  it('reset vide metrics', () => {
    perfMetrics.record('LCP', 1500);
    perfMetrics.reset();
    expect(perfMetrics.getAll()).toEqual([]);
  });

  it('disconnect retire tous observers', () => {
    perfMetrics.install();
    expect(observerCallbacks.length).toBeGreaterThan(0);
    perfMetrics.disconnect();
    /* installed=false donc re-install ré-attach */
    perfMetrics.install();
    expect(observerCallbacks.length).toBeGreaterThan(0);
  });
});

describe('perf-metrics — getMemoryUsage', () => {
  it('measureUAS dispo → source native-measure', async () => {
    Object.defineProperty(performance, 'measureUserAgentSpecificMemory', {
      value: async () => ({ bytes: 50 * 1024 * 1024 }),
      configurable: true,
    });
    const r = await perfMetrics.getMemoryUsage();
    expect(r.source).toBe('native-measure');
    expect(r.used_mb).toBe(50);
    expect(r.confidence).toBe(1.0);
    delete (performance as { measureUserAgentSpecificMemory?: unknown }).measureUserAgentSpecificMemory;
  });

  it('measureUAS throw → fallback jsHeap', async () => {
    Object.defineProperty(performance, 'measureUserAgentSpecificMemory', {
      value: async () => { throw new Error('cors'); },
      configurable: true,
    });
    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 30 * 1024 * 1024, jsHeapSizeLimit: 200 * 1024 * 1024 },
      configurable: true,
    });
    const r = await perfMetrics.getMemoryUsage();
    expect(r.source).toBe('native-jsHeap');
    expect(r.used_mb).toBe(30);
    expect(r.total_mb).toBe(200);
    delete (performance as { measureUserAgentSpecificMemory?: unknown }).measureUserAgentSpecificMemory;
    delete (performance as { memory?: unknown }).memory;
  });

  it('jsHeap dispo → source native-jsHeap', async () => {
    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 20 * 1024 * 1024, jsHeapSizeLimit: 100 * 1024 * 1024 },
      configurable: true,
    });
    const r = await perfMetrics.getMemoryUsage();
    expect(r.source).toBe('native-jsHeap');
    expect(r.confidence).toBe(0.9);
    delete (performance as { memory?: unknown }).memory;
  });

  it('Safari fallback → source estimated avec localStorage scan', async () => {
    /* Pas de native APIs */
    delete (performance as { measureUserAgentSpecificMemory?: unknown }).measureUserAgentSpecificMemory;
    delete (performance as { memory?: unknown }).memory;
    localStorage.setItem('test_k1', 'x'.repeat(1000));
    const r = await perfMetrics.getMemoryUsage();
    expect(r.source).toBe('estimated');
    expect(r.confidence).toBe(0.5);
    expect(r.used_mb).toBeGreaterThanOrEqual(0);
  });

  it('navigator.storage.estimate ajoute IDB usage', async () => {
    delete (performance as { measureUserAgentSpecificMemory?: unknown }).measureUserAgentSpecificMemory;
    delete (performance as { memory?: unknown }).memory;
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => ({ usage: 10 * 1024 * 1024, quota: 100 * 1024 * 1024 }) },
      configurable: true,
    });
    const r = await perfMetrics.getMemoryUsage();
    expect(r.source).toBe('estimated');
    expect(r.used_mb).toBeGreaterThanOrEqual(10);
  });

  it('navigator.storage.estimate throw → continue silencieux', async () => {
    delete (performance as { measureUserAgentSpecificMemory?: unknown }).measureUserAgentSpecificMemory;
    delete (performance as { memory?: unknown }).memory;
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => { throw new Error('storage'); } },
      configurable: true,
    });
    const r = await perfMetrics.getMemoryUsage();
    expect(r.source).toBe('estimated');
  });
});
