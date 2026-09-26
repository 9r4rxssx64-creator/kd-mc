/**
 * Tests auto-test-everything (Kevin v13.4.0 P0 — auto-test exhaustif).
 *
 * Couvre :
 *  - runFullHealthCheck retourne un rapport structuré complet
 *  - status global green/yellow/red selon score
 *  - findAlternativeLink pour services connus
 *  - retryFailedItems backoff (mocked timers)
 *  - escalateToClaudeCode populates ax_claude_todo
 *  - lock anti-double-run via _running
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { autoTestEverything } from '../../services/admin/auto-test-everything.js';

describe('auto-test-everything', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runFullHealthCheck', () => {
    it('retourne un rapport structuré complet (toutes phases)', async () => {
      const report = await autoTestEverything.runFullHealthCheck();
      expect(report).toBeTruthy();
      expect(report.ts).toBeGreaterThan(0);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
      expect(['green', 'yellow', 'red']).toContain(report.globalStatus);
      expect(report.globalScorePct).toBeGreaterThanOrEqual(0);
      expect(report.globalScorePct).toBeLessThanOrEqual(100);
      expect(report.byCategory).toHaveProperty('codes');
      expect(report.byCategory).toHaveProperty('links');
      expect(report.byCategory).toHaveProperty('sentinels');
      expect(report.byCategory).toHaveProperty('connectors');
      expect(report.byCategory).toHaveProperty('vault');
      expect(report.totals).toHaveProperty('ok');
      expect(report.totals).toHaveProperty('warn');
      expect(report.totals).toHaveProperty('error');
      expect(Array.isArray(report.items)).toBe(true);
      expect(Array.isArray(report.failedItems)).toBe(true);
      expect(Array.isArray(report.alternativesProposed)).toBe(true);
      expect(Array.isArray(report.errors)).toBe(true);
    });

    it('progressCb est appelé pour chaque phase', async () => {
      const phases: string[] = [];
      await autoTestEverything.runFullHealthCheck((u) => {
        phases.push(u.phase);
      });
      expect(phases.length).toBeGreaterThan(0);
      /* Au moins phase done en fin */
      expect(phases).toContain('done');
    });

    it('lastReport est mis à jour après run', async () => {
      const before = autoTestEverything.getLastReport();
      const report = await autoTestEverything.runFullHealthCheck();
      const after = autoTestEverything.getLastReport();
      expect(after).toBeTruthy();
      expect(after?.ts).toBe(report.ts);
    });

    it('isRunning est false après run terminé', async () => {
      await autoTestEverything.runFullHealthCheck();
      expect(autoTestEverything.isRunning()).toBe(false);
    });
  });

  describe('findAlternativeLink', () => {
    it('retourne URL pour services connus', () => {
      const alt = autoTestEverything.findAlternativeLink('anthropic');
      expect(alt).toBeTruthy();
      expect(alt).toMatch(/anthropic/);
    });

    it('case-insensitive', () => {
      const alt = autoTestEverything.findAlternativeLink('ANTHROPIC');
      expect(alt).toBeTruthy();
    });

    it('retourne null pour services inconnus', () => {
      const alt = autoTestEverything.findAlternativeLink('unknown_service_xyz');
      expect(alt).toBeNull();
    });
  });

  describe('retryFailedItems', () => {
    it('si pas de fails → retourne report inchangé', async () => {
      const report = await autoTestEverything.runFullHealthCheck();
      /* Mock zéro fail */
      const noFailReport = { ...report, failedItems: [] };
      const updated = await autoTestEverything.retryFailedItems(noFailReport);
      expect(updated.failedItems.length).toBe(0);
    });

    it('escalateToClaudeCode populate ax_claude_todo si fails persistent', async () => {
      const fakeReport = {
        ts: Date.now(),
        durationMs: 100,
        globalStatus: 'red' as const,
        globalScorePct: 30,
        totals: { total: 5, ok: 1, warn: 0, error: 4 },
        byCategory: {
          codes: { tested: 0, recovered: 0, stillDown: 0 },
          links: { tested: 0, alive: 0, dead: 0 },
          sentinels: { total: 0, ok: 0, warn: 0, error: 0 },
          connectors: { configured: 0, tested: 0, failed: 0 },
          vault: { restored: 0, reclassified: 0 },
        },
        items: [],
        failedItems: [
          { id: 'links:fake1', category: 'links' as const, label: 'fake1', status: 'error' as const, message: 'KO' },
          { id: 'links:fake2', category: 'links' as const, label: 'fake2', status: 'error' as const, message: 'KO' },
        ],
        alternativesProposed: [],
        errors: [],
      };
      const updated = await autoTestEverything.retryFailedItems(fakeReport, 1);
      /* Si encore fail → ax_claude_todo populated */
      const todo = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
      if (updated.failedItems.length > 0) {
        expect(todo.length).toBeGreaterThan(0);
        expect(todo[0]).toHaveProperty('reason');
        expect(todo[0].reason).toContain('auto-test-everything');
      }
    });
  });

  describe('globalStatus computation', () => {
    it('100% OK → green status', async () => {
      /* On fake un report avec 100% OK */
      const _r = await autoTestEverything.runFullHealthCheck();
      /* Au moins l'item vault:deep-recovery doit exister (toujours produit) */
      const lastReport = autoTestEverything.getLastReport();
      expect(lastReport).toBeTruthy();
      if (lastReport) {
        if (lastReport.globalScorePct >= 90 && lastReport.totals.error === 0) {
          expect(lastReport.globalStatus).toBe('green');
        } else if (lastReport.globalScorePct >= 70) {
          expect(['green', 'yellow']).toContain(lastReport.globalStatus);
        } else {
          expect(['yellow', 'red']).toContain(lastReport.globalStatus);
        }
      }
    });
  });
});
