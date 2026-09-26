/**
 * Tests perf-metrics.ts (Core Web Vitals dashboard).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { perfMetrics } from '../../services/observability/perf-metrics.js';

describe('Perf Metrics (Web Vitals au-delà 100/100)', () => {
  beforeEach(() => {
    perfMetrics.reset();
  });

  describe('record + rating', () => {
    it('record LCP good (< 2500ms)', () => {
      perfMetrics.record('LCP', 1500);
      const all = perfMetrics.getAll();
      expect(all.length).toBe(1);
      expect(all[0]?.rating).toBe('good');
    });

    it('record LCP needs-improvement (2500-4000ms)', () => {
      perfMetrics.record('LCP', 3000);
      const last = perfMetrics.getAll()[0];
      expect(last?.rating).toBe('needs-improvement');
    });

    it('record LCP poor (> 4000ms)', () => {
      perfMetrics.record('LCP', 5000);
      const last = perfMetrics.getAll()[0];
      expect(last?.rating).toBe('poor');
    });

    it('record CLS bons seuils (< 0.1 good, > 0.25 poor)', () => {
      perfMetrics.record('CLS', 0.05);
      perfMetrics.record('CLS', 0.15);
      perfMetrics.record('CLS', 0.3);
      const all = perfMetrics.getAll();
      expect(all[0]?.rating).toBe('good');
      expect(all[1]?.rating).toBe('needs-improvement');
      expect(all[2]?.rating).toBe('poor');
    });

    it('record INP bons seuils (< 200ms good)', () => {
      perfMetrics.record('INP', 100);
      const last = perfMetrics.getAll()[0];
      expect(last?.rating).toBe('good');
    });

    it('cap 200 max metrics', () => {
      for (let i = 0; i < 250; i++) perfMetrics.record('LCP', 1000 + i);
      expect(perfMetrics.getAll().length).toBeLessThanOrEqual(200);
    });
  });

  describe('getSnapshot', () => {
    it('snapshot retourne dernière valeur de chaque metric', () => {
      perfMetrics.record('LCP', 1500);
      perfMetrics.record('LCP', 2000);
      perfMetrics.record('FCP', 1000);
      const snap = perfMetrics.getSnapshot();
      expect(snap.LCP?.value).toBe(2000);
      expect(snap.FCP?.value).toBe(1000);
      expect(snap.INP).toBeNull();
    });
  });

  describe('getScore', () => {
    it('score 100 si toutes metrics good', () => {
      perfMetrics.record('LCP', 1000);
      perfMetrics.record('INP', 100);
      perfMetrics.record('CLS', 0.05);
      perfMetrics.record('FCP', 1000);
      perfMetrics.record('TTFB', 300);
      const { score } = perfMetrics.getScore();
      expect(score).toBe(100);
    });

    it('score lower si certaines metrics poor', () => {
      perfMetrics.record('LCP', 5000); /* poor */
      perfMetrics.record('INP', 600); /* poor */
      perfMetrics.record('CLS', 0.5); /* poor */
      const { score } = perfMetrics.getScore();
      expect(score).toBeLessThan(50);
    });

    it('score breakdown détails par metric', () => {
      perfMetrics.record('LCP', 1500);
      perfMetrics.record('INP', 150);
      const { details } = perfMetrics.getScore();
      expect(details['LCP']?.pts).toBe(100);
      expect(details['INP']?.pts).toBe(100);
      expect(details['LCP']?.weight).toBe(0.25);
      expect(details['INP']?.weight).toBe(0.3);
    });
  });

  describe('formatForUI', () => {
    it('format avec grade A si score >= 90', () => {
      perfMetrics.record('LCP', 1500);
      perfMetrics.record('INP', 100);
      perfMetrics.record('CLS', 0.05);
      perfMetrics.record('FCP', 1000);
      perfMetrics.record('TTFB', 300);
      const fmt = perfMetrics.formatForUI();
      expect(fmt.grade).toBe('A');
      expect(fmt.score).toMatch(/^\d+\/100$/);
    });

    it('format avec emoji + value formatée', () => {
      perfMetrics.record('LCP', 1500);
      perfMetrics.record('CLS', 0.05);
      const fmt = perfMetrics.formatForUI();
      const lcp = fmt.metrics.find((m) => m.name === 'LCP');
      expect(lcp?.emoji).toBe('🟢');
      expect(lcp?.value).toMatch(/ms$/);
      const cls = fmt.metrics.find((m) => m.name === 'CLS');
      expect(cls?.value).toMatch(/^\d\.\d{3}$/);
    });

    it('grade F si score très bas', () => {
      perfMetrics.record('LCP', 8000);
      perfMetrics.record('INP', 1000);
      perfMetrics.record('CLS', 1.0);
      const fmt = perfMetrics.formatForUI();
      expect(['D', 'F']).toContain(fmt.grade);
    });
  });

  describe('install + disconnect', () => {
    it('install idempotent (2e call no-op)', () => {
      let threw = false;
      try {
        perfMetrics.install();
        perfMetrics.install();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      perfMetrics.disconnect();
    });

    it('disconnect cleanup observers', () => {
      perfMetrics.install();
      perfMetrics.disconnect();
      /* Re-install après disconnect doit remarcher */
      let threw = false;
      try {
        perfMetrics.install();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      perfMetrics.disconnect();
    });
  });
});
