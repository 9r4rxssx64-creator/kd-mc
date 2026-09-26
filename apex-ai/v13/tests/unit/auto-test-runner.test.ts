/**
 * Tests auto-test-runner v13.4.142 (Kevin "100/100 réel").
 *
 * Module : services/auto-test-runner.ts (249 stmts, était 10.8% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoTestRunner } from '../../services/admin/auto-test-runner.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('auto-test-runner (v13.4.142 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('runAll', () => {
    it('exécute tous les tests + retourne summary', async () => {
      const summary = await autoTestRunner.runAll();
      expect(summary).toBeDefined();
      expect(summary.ts).toBeTypeOf('number');
      expect(summary.total).toBeGreaterThanOrEqual(7);
      expect(summary.passed + summary.failed + summary.skipped).toBe(summary.total);
      expect(Array.isArray(summary.results)).toBe(true);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('chaque result a id, name, status', async () => {
      const summary = await autoTestRunner.runAll();
      const validStatuses = new Set(['pass', 'fail', 'skip']);
      summary.results.forEach((r) => {
        expect(r.id).toBeTypeOf('string');
        expect(r.name).toBeTypeOf('string');
        expect(validStatuses.has(r.status)).toBe(true);
        expect(r.durationMs).toBeGreaterThanOrEqual(0);
      });
    }, 30000);

    it('persiste résultat dans localStorage', async () => {
      await autoTestRunner.runAll();
      const raw = localStorage.getItem('ax_auto_test_log');
      expect(raw).toBeTruthy();
      const arr = JSON.parse(raw ?? '[]');
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
    }, 30000);

    it('persiste timestamp last_run', async () => {
      await autoTestRunner.runAll();
      const last = localStorage.getItem('ax_auto_test_last_run');
      expect(last).toBeTruthy();
      expect(Number(last)).toBeGreaterThan(0);
    }, 30000);
  });

  describe('getLastRun', () => {
    it('retourne null si aucune run', () => {
      expect(autoTestRunner.getLastRun()).toBeNull();
    });

    it('retourne dernière run après runAll', async () => {
      await autoTestRunner.runAll();
      const last = autoTestRunner.getLastRun();
      expect(last).toBeDefined();
      expect(last?.total).toBeGreaterThan(0);
    }, 30000);

    it('gère localStorage corrompu', () => {
      localStorage.setItem('ax_auto_test_log', '{invalid');
      expect(autoTestRunner.getLastRun()).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('retourne [] si vide', () => {
      expect(autoTestRunner.getHistory()).toEqual([]);
    });

    it('retourne historique après runAll', async () => {
      await autoTestRunner.runAll();
      const hist = autoTestRunner.getHistory();
      expect(hist.length).toBeGreaterThan(0);
    }, 30000);

    it('gère localStorage corrompu', () => {
      localStorage.setItem('ax_auto_test_log', '{invalid');
      expect(autoTestRunner.getHistory()).toEqual([]);
    });
  });

  describe('shouldRunDaily', () => {
    it('retourne true si jamais runé', () => {
      expect(autoTestRunner.shouldRunDaily()).toBe(true);
    });

    it('retourne false si runé il y a < 24h', () => {
      const now = Date.now();
      localStorage.setItem('ax_auto_test_last_run', String(now - 1000));
      expect(autoTestRunner.shouldRunDaily()).toBe(false);
    });

    it('retourne true si runé il y a >= 24h', () => {
      const now = Date.now();
      const moreThan24h = now - 25 * 60 * 60 * 1000;
      localStorage.setItem('ax_auto_test_last_run', String(moreThan24h));
      expect(autoTestRunner.shouldRunDaily()).toBe(true);
    });
  });

  describe('scheduleAutoRun', () => {
    it('skip si déjà runé today', () => {
      const now = Date.now();
      localStorage.setItem('ax_auto_test_last_run', String(now - 1000));
      /* Should not throw */
      expect(() => autoTestRunner.scheduleAutoRun()).not.toThrow();
    });

    it('schedule setTimeout si shouldRunDaily', () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      autoTestRunner.scheduleAutoRun();
      expect(setTimeoutSpy).toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });
  });
});
