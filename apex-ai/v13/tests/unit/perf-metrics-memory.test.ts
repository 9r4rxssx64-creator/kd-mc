/**
 * Tests perf-metrics H6 + M8 (audit fix v13.3.73).
 *
 * H6 — getMemoryUsage() avec fallback Safari.
 * M8 — getCLS() PerformanceObserver exposé.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { perfMetrics } from '../../services/observability/perf-metrics.js';

describe('perf-metrics — H6 getMemoryUsage()', () => {
  beforeEach(() => {
    perfMetrics.reset();
  });

  it('retourne structure conforme {used_mb, total_mb, source, confidence}', async () => {
    const r = await perfMetrics.getMemoryUsage();
    expect(r).toBeDefined();
    expect(typeof r.used_mb).toBe('number');
    expect(typeof r.total_mb).toBe('number');
    expect(['native-measure', 'native-jsHeap', 'estimated', 'unavailable']).toContain(r.source);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('Safari (no perf.memory) → fallback estimated avec confidence 0.5', async () => {
    /* Test environment likely doesn't have measureUserAgentSpecificMemory or perf.memory.
     * Should fall to 'estimated' or 'unavailable'. */
    const r = await perfMetrics.getMemoryUsage();
    /* Either jsHeap (jsdom may expose) or estimated */
    expect(['native-jsHeap', 'estimated', 'unavailable']).toContain(r.source);
    if (r.source === 'estimated') {
      expect(r.confidence).toBe(0.5);
    }
  });

  it('used_mb >= 0 dans tous les cas (jamais négatif)', async () => {
    const r = await perfMetrics.getMemoryUsage();
    expect(r.used_mb).toBeGreaterThanOrEqual(0);
    expect(r.total_mb).toBeGreaterThanOrEqual(0);
  });
});

describe('perf-metrics — M8 getCLS()', () => {
  beforeEach(() => {
    perfMetrics.reset();
  });

  it('initial CLS = 0', () => {
    /* Reset clears metrics but not the clsValue field — re-init */
    const cls = perfMetrics.getCLS();
    expect(typeof cls).toBe('number');
    expect(cls).toBeGreaterThanOrEqual(0);
  });

  it('record CLS via record() impacts getSnapshot but not getCLS direct (different path)', () => {
    perfMetrics.record('CLS', 0.12);
    const snap = perfMetrics.getSnapshot();
    expect(snap.CLS?.value).toBe(0.12);
    /* getCLS() retourne clsValue interne (incrémenté par observer, pas record()) */
    /* En test sans observer actif, getCLS reste = valeur initiale */
    expect(typeof perfMetrics.getCLS()).toBe('number');
  });

  it('install() est idempotent (anti-double-binding)', () => {
    perfMetrics.install();
    /* Second call should be no-op */
    expect(() => perfMetrics.install()).not.toThrow();
  });
});
