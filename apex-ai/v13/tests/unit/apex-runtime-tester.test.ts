/**
 * Tests apex-runtime-tester v13.4.138 (Kevin "100/100 réel").
 *
 * Module : services/apex-runtime-tester.ts (270 stmts, était 0%).
 * Test surface API publique sans appeler les sub-tests intensifs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtimeTester } from '../../services/admin/apex-runtime-tester.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('apex-runtime-tester (v13.4.138 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Mock fetch pour ne pas hit le réseau réel */
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, statusText: 'OK' }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API publique', () => {
    it('expose runAll function', () => {
      expect(runtimeTester.runAll).toBeTypeOf('function');
    });

    it('runAll retourne un report avec champs requis', async () => {
      const report = await runtimeTester.runAll();
      expect(report).toBeDefined();
      expect(report.reportId).toBeTypeOf('string');
      expect(report.startedAt).toBeTypeOf('number');
      expect(report.finishedAt).toBeTypeOf('number');
      expect(Array.isArray(report.results)).toBe(true);
      expect(report.results.length).toBeGreaterThan(0);
    }, 30000);

    it('runAll appelle onProgress callback pour chaque test', async () => {
      const onProgress = vi.fn();
      await runtimeTester.runAll(onProgress);
      expect(onProgress).toHaveBeenCalled();
      /* Au moins 1 appel onProgress(current, done, total) */
      const firstCall = onProgress.mock.calls[0];
      expect(firstCall?.[0]).toBeTypeOf('string'); /* current test name */
      expect(firstCall?.[1]).toBeTypeOf('number'); /* done */
      expect(firstCall?.[2]).toBeTypeOf('number'); /* total */
    }, 30000);

    it('runAll persiste le report dans localStorage (ax_runtime_test_last)', async () => {
      await runtimeTester.runAll();
      const stored = localStorage.getItem('ax_runtime_test_last');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored ?? '{}') as { reportId?: string };
      expect(parsed.reportId).toBeTypeOf('string');
    }, 30000);

    it('chaque résultat a un status valide (pass/fail/warn/skip)', async () => {
      const report = await runtimeTester.runAll();
      const validStatuses = new Set(['pass', 'fail', 'warn', 'skip']);
      report.results.forEach((r) => {
        expect(validStatuses.has(r.status)).toBe(true);
        expect(r.testId).toBeTypeOf('string');
      });
    }, 30000);

    it('report contient compteurs cohérents', async () => {
      const report = await runtimeTester.runAll();
      expect(report.summary).toBeDefined();
      expect(report.summary.total).toBe(report.results.length);
      const sum =
        report.summary.passed +
        report.summary.failed +
        report.summary.warnings +
        report.summary.skipped;
      expect(sum).toBe(report.summary.total);
      expect(report.summary.successRate).toBeGreaterThanOrEqual(0);
      expect(report.summary.successRate).toBeLessThanOrEqual(100);
    }, 30000);
  });
});
