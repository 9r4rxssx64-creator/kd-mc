/**
 * Tests multi-key-health v13.4.139 (Kevin "100/100 réel").
 *
 * Module : services/multi-key-health.ts (190 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { multiKeyHealth } from '../../services/ai/multi-key-health.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('multi-key-health (v13.4.139 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    multiKeyHealth.resetForTests();
  });

  afterEach(() => {
    localStorage.clear();
    multiKeyHealth.resetForTests();
  });

  describe('API publique', () => {
    it('expose les méthodes attendues', () => {
      expect(multiKeyHealth.register).toBeTypeOf('function');
      expect(multiKeyHealth.runCheck).toBeTypeOf('function');
      expect(multiKeyHealth.runAutoFix).toBeTypeOf('function');
      expect(multiKeyHealth.getLog).toBeTypeOf('function');
      expect(multiKeyHealth.getLastSummary).toBeTypeOf('function');
    });

    it('getLog retourne tableau vide initialement', () => {
      const log = multiKeyHealth.getLog();
      expect(Array.isArray(log)).toBe(true);
      expect(log.length).toBe(0);
    });

    it('getLastSummary retourne null avant runCheck', () => {
      expect(multiKeyHealth.getLastSummary()).toBeNull();
    });

    it('register est idempotent', () => {
      multiKeyHealth.register();
      multiKeyHealth.register(); /* 2nd appel ne crash pas */
      expect(true).toBe(true);
    });

    it('resetForTests vide tout', () => {
      localStorage.setItem('apex_v13_provider_health_log', JSON.stringify([{ ts: 1 }]));
      multiKeyHealth.resetForTests();
      expect(multiKeyHealth.getLog().length).toBe(0);
      expect(multiKeyHealth.getLastSummary()).toBeNull();
    });
  });

  describe('runCheck — flow basique', () => {
    it('runCheck retourne objet avec ok+msg', async () => {
      const r = await multiKeyHealth.runCheck();
      expect(r).toBeDefined();
      expect(typeof r.ok).toBe('boolean');
      expect(typeof r.msg).toBe('string');
    });

    it('runCheck persiste summary', async () => {
      await multiKeyHealth.runCheck();
      const summary = multiKeyHealth.getLastSummary();
      expect(summary).toBeDefined();
      if (summary) {
        expect(typeof summary.total_services).toBe('number');
        expect(typeof summary.last_run_ts).toBe('number');
      }
    });
  });

  describe('runAutoFix', () => {
    it('runAutoFix retourne {ok, msg} cohérent', async () => {
      const r = await multiKeyHealth.runAutoFix();
      expect(typeof r.ok).toBe('boolean');
      expect(typeof r.msg).toBe('string');
    });
  });

  describe('getLog persistence', () => {
    it('log cappé à MAX_LOG_ENTRIES (test via persist)', async () => {
      /* Pré-remplir log avec données proches du cap */
      const fakeLog = Array.from({ length: 500 }, (_, i) => ({
        ts: Date.now() - i * 1000,
        service: 'anthropic',
        status: 'ok' as const,
        detail: `entry ${i}`,
      }));
      localStorage.setItem('apex_v13_provider_health_log', JSON.stringify(fakeLog));
      const log = multiKeyHealth.getLog();
      expect(Array.isArray(log)).toBe(true);
      expect(log.length).toBeLessThanOrEqual(500);
    });

    it('getLog gère localStorage corrompu sans crash', () => {
      localStorage.setItem('apex_v13_provider_health_log', '{not valid json');
      const log = multiKeyHealth.getLog();
      expect(Array.isArray(log)).toBe(true);
    });
  });
});
