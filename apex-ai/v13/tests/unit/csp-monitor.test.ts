/**
 * Tests csp-monitor v13.4.142 (Kevin "100/100 réel").
 *
 * Module : services/csp-monitor.ts (230 stmts, était 21.3% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAuditLog, mockClaudeBridge } = vi.hoisted(() => ({
  mockAuditLog: { record: vi.fn().mockResolvedValue(undefined) },
  mockClaudeBridge: { pushTodo: vi.fn().mockResolvedValue({ id: 'todo_x' }) },
}));

vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));
vi.mock('../../services/ai/claude-bridge.js', () => ({ claudeBridge: mockClaudeBridge }));

import { cspMonitor } from '../../services/observability/csp-monitor.js';

function fakeViolation(opts: { directive?: string; blockedURI?: string; sourceFile?: string }): SecurityPolicyViolationEvent {
  return {
    violatedDirective: opts.directive ?? 'connect-src',
    blockedURI: opts.blockedURI ?? 'https://api.example.com/foo',
    sourceFile: opts.sourceFile ?? '',
    lineNumber: 0,
    columnNumber: 0,
  } as unknown as SecurityPolicyViolationEvent;
}

describe('csp-monitor (v13.4.142 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    cspMonitor.uninstall();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    cspMonitor.uninstall();
  });

  describe('install/uninstall', () => {
    it('install écoute événements', () => {
      cspMonitor.install();
      const stats = cspMonitor.getStats();
      expect(stats).toBeDefined();
    });

    it('install idempotent', () => {
      cspMonitor.install();
      cspMonitor.install(); /* 2e call no-op */
      expect(() => cspMonitor.uninstall()).not.toThrow();
    });

    it('uninstall avant install ne crash pas', () => {
      expect(() => cspMonitor.uninstall()).not.toThrow();
    });
  });

  describe('handleViolation (via dispatchEvent)', () => {
    it('agrège stats après violation', () => {
      cspMonitor.install();
      document.dispatchEvent(
        Object.assign(new Event('securitypolicyviolation'), fakeViolation({})),
      );
      const stats = cspMonitor.getStats();
      const keys = Object.keys(stats);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('ignore blockedURI inline/eval/data', () => {
      cspMonitor.install();
      for (const blocked of ['inline', 'eval', 'self', 'data:image/png;base64,xxx', 'blob:xyz']) {
        document.dispatchEvent(
          Object.assign(new Event('securitypolicyviolation'), fakeViolation({ blockedURI: blocked })),
        );
      }
      const stats = cspMonitor.getStats();
      expect(Object.keys(stats).length).toBe(0);
    });

    it('groupe par directive+origin', () => {
      cspMonitor.install();
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(
          Object.assign(new Event('securitypolicyviolation'), fakeViolation({})),
        );
      }
      const stats = cspMonitor.getStats();
      const entry = Object.values(stats)[0];
      expect(entry?.count).toBe(3);
    });

    it('escalade si > 5 violations/h sur trusted origin', async () => {
      cspMonitor.install();
      for (let i = 0; i < 7; i++) {
        document.dispatchEvent(
          Object.assign(new Event('securitypolicyviolation'),
            fakeViolation({ blockedURI: 'https://api.anthropic.com/v1/test' })),
        );
      }
      /* Attendre micro-tasks pour escalate.async */
      await new Promise((r) => setTimeout(r, 50));
      expect(mockClaudeBridge.pushTodo).toHaveBeenCalled();
    });
  });

  describe('getTopOrigins', () => {
    it('retourne [] si aucune stat', () => {
      const r = cspMonitor.getTopOrigins();
      expect(r).toEqual([]);
    });

    it('trie par recentCount décroissant', () => {
      cspMonitor.install();
      /* 3 hits sur api1, 5 hits sur api2 */
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(
          Object.assign(new Event('securitypolicyviolation'),
            fakeViolation({ blockedURI: 'https://api1.example.com/foo' })),
        );
      }
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(
          Object.assign(new Event('securitypolicyviolation'),
            fakeViolation({ blockedURI: 'https://api2.example.com/foo' })),
        );
      }
      const top = cspMonitor.getTopOrigins(2);
      expect(top.length).toBe(2);
      expect(top[0]?.recentCount).toBeGreaterThanOrEqual(top[1]?.recentCount ?? 0);
    });

    it('respecte limit', () => {
      cspMonitor.install();
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(
          Object.assign(new Event('securitypolicyviolation'),
            fakeViolation({ blockedURI: `https://api${i}.example.com/foo` })),
        );
      }
      const top = cspMonitor.getTopOrigins(2);
      expect(top.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getSuggestions', () => {
    it('retourne [] si pas de suggestion', () => {
      expect(cspMonitor.getSuggestions()).toEqual([]);
    });

    it('gère localStorage corrompu', () => {
      localStorage.setItem('ax_csp_whitelist_suggestions', '{invalid');
      expect(cspMonitor.getSuggestions()).toEqual([]);
    });
  });

  describe('clearStats / clearSuggestions', () => {
    it('clearStats vide aggregated', () => {
      cspMonitor.install();
      document.dispatchEvent(
        Object.assign(new Event('securitypolicyviolation'), fakeViolation({})),
      );
      cspMonitor.clearStats();
      expect(Object.keys(cspMonitor.getStats()).length).toBe(0);
    });

    it('clearSuggestions vide suggestions', () => {
      localStorage.setItem('ax_csp_whitelist_suggestions', JSON.stringify([
        { origin: 'https://a.com', directive: 'connect-src', reason: 'x', ts: 1, trusted: true },
      ]));
      cspMonitor.clearSuggestions();
      expect(cspMonitor.getSuggestions().length).toBe(0);
    });
  });

  describe('getStats (parsing)', () => {
    it('retourne {} si pas stats', () => {
      expect(cspMonitor.getStats()).toEqual({});
    });

    it('gère localStorage corrompu', () => {
      localStorage.setItem('ax_csp_aggregated_stats', '{invalid');
      expect(cspMonitor.getStats()).toEqual({});
    });
  });
});
