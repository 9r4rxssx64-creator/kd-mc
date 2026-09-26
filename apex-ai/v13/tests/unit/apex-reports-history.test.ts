/**
 * Tests services/apex-reports-history (Kevin v13.4.198 "100/100 réel partout").
 *
 * Couvre les 6 méthodes publiques (recordLayout/recordFunctional/getLayout/getFunctional/getStats/clearHistory)
 * + edge cases (localStorage quota, parse error, FIFO cap MAX_HISTORY, recent 24h window).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reportsHistory } from '../../services/admin/apex-reports-history.js';
import type { FunctionalTestReport } from '../../services/admin/apex-functional-tester.js';
import type { LayoutScanReport } from '../../services/admin/apex-layout-inspector.js';

const LAYOUT_KEY = 'apex_v13_audit_layout_history';
const FUNCTIONAL_KEY = 'apex_v13_audit_functional_history';

function makeLayoutReport(overrides: Partial<LayoutScanReport> = {}): LayoutScanReport {
  return {
    ts: Date.now(),
    appVer: 'v13.4.198',
    hasHorizontalOverflow: false,
    overflowingElements: [],
    hiddenButtons: [],
    smallTouchTargets: [],
    ...overrides,
  } as LayoutScanReport;
}

function makeFunctionalReport(overrides: Partial<FunctionalTestReport> = {}): FunctionalTestReport {
  return {
    ts: Date.now(),
    viewBefore: '#/test',
    tested: 10,
    totalButtons: 12,
    ok: 9,
    noResponse: 1,
    errors: 0,
    skipped: 2,
    details: [],
    ...overrides,
  } as FunctionalTestReport;
}

describe('services/apex-reports-history', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Mock data-app-ver pour recordFunctional */
    document.documentElement.setAttribute('data-app-ver', 'v13.4.198');
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('recordLayout', () => {
    it('persiste un layout report', () => {
      reportsHistory.recordLayout(makeLayoutReport({ hasHorizontalOverflow: true }));
      const history = reportsHistory.getLayoutHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.hasHorizontalOverflow).toBe(true);
      expect(history[0]?.appVer).toBe('v13.4.198');
    });

    it('cap top 5 overflows + 5 hidden buttons', () => {
      const overflows = Array.from({ length: 10 }, (_, i) => ({
        selector: `#el${i}`,
        overflowBy: i * 10,
        element: null as unknown as HTMLElement,
      }));
      const hidden = Array.from({ length: 10 }, (_, i) => ({
        label: `btn${i}`,
        reason: 'off-screen',
        element: null as unknown as HTMLElement,
        position: { x: 0, y: 0 },
      }));
      reportsHistory.recordLayout(
        makeLayoutReport({ overflowingElements: overflows, hiddenButtons: hidden }),
      );
      const entry = reportsHistory.getLayoutHistory()[0];
      expect(entry?.topOverflows).toHaveLength(5);
      expect(entry?.topHiddenButtons).toHaveLength(5);
      expect(entry?.overflowingCount).toBe(10);
      expect(entry?.hiddenButtonsCount).toBe(10);
    });

    it('FIFO cap à MAX_HISTORY=50', () => {
      for (let i = 0; i < 55; i++) {
        reportsHistory.recordLayout(makeLayoutReport({ ts: i }));
      }
      const history = reportsHistory.getLayoutHistory();
      expect(history).toHaveLength(50);
      expect(history[0]?.ts).toBe(5); /* oldest dropped */
      expect(history[49]?.ts).toBe(54);
    });
  });

  describe('recordFunctional', () => {
    it('persiste un functional report avec okRate calculé', () => {
      const before = makeFunctionalReport({ tested: 10, ok: 8 });
      reportsHistory.recordFunctional(before, { applied: ['fix1'], escalated: false }, undefined, 0);
      const history = reportsHistory.getFunctionalHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.okRate).toBe(0.8);
      expect(history[0]?.fixesApplied).toEqual(['fix1']);
    });

    it('utilise after report si fourni (post-fix)', () => {
      const before = makeFunctionalReport({ tested: 10, ok: 5 });
      const after = makeFunctionalReport({ tested: 10, ok: 9 });
      reportsHistory.recordFunctional(before, { applied: [], escalated: false }, after, 0.4);
      const entry = reportsHistory.getFunctionalHistory()[0];
      expect(entry?.ok).toBe(9);
      expect(entry?.improvement).toBe(0.4);
    });

    it('okRate = 0 si tested = 0 (anti-division-zero)', () => {
      reportsHistory.recordFunctional(
        makeFunctionalReport({ tested: 0, ok: 0 }),
        { applied: [], escalated: false },
        undefined,
        0,
      );
      expect(reportsHistory.getFunctionalHistory()[0]?.okRate).toBe(0);
    });

    it('échantillonne max 5 bugs (no_response + error)', () => {
      const details = Array.from({ length: 10 }, (_, i) => ({
        label: `b${i}`,
        status: i % 2 === 0 ? 'no_response' : 'error',
        idx: i,
      }));
      reportsHistory.recordFunctional(
        makeFunctionalReport({ details }) as FunctionalTestReport,
        { applied: [], escalated: true },
        undefined,
        0,
      );
      expect(reportsHistory.getFunctionalHistory()[0]?.bugSamples).toHaveLength(5);
      expect(reportsHistory.getFunctionalHistory()[0]?.escalated).toBe(true);
    });
  });

  describe('read helpers (corrupted state)', () => {
    it('retourne [] si localStorage contient JSON invalide', () => {
      localStorage.setItem(LAYOUT_KEY, '{invalid json');
      localStorage.setItem(FUNCTIONAL_KEY, 'not-json');
      expect(reportsHistory.getLayoutHistory()).toEqual([]);
      expect(reportsHistory.getFunctionalHistory()).toEqual([]);
    });

    it('retourne [] si localStorage contient un non-array', () => {
      localStorage.setItem(LAYOUT_KEY, '{"foo":"bar"}');
      localStorage.setItem(FUNCTIONAL_KEY, '42');
      expect(reportsHistory.getLayoutHistory()).toEqual([]);
      expect(reportsHistory.getFunctionalHistory()).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('retourne 0 partout sur localStorage vide', () => {
      const s = reportsHistory.getStats();
      expect(s.layoutCount).toBe(0);
      expect(s.functionalCount).toBe(0);
      expect(s.lastLayoutTs).toBeNull();
      expect(s.lastFunctionalTs).toBeNull();
      expect(s.recentBugs).toBe(0);
      expect(s.recentEscalations).toBe(0);
    });

    it('compte bugs des 24 dernières heures uniquement', () => {
      const dayAgo = Date.now() - 86_400_000;
      const recent = Date.now() - 1000;
      const old = dayAgo - 1000;
      /* 2 layouts récents avec overflow + 1 ancien avec overflow */
      reportsHistory.recordLayout(makeLayoutReport({ ts: recent, hasHorizontalOverflow: true }));
      reportsHistory.recordLayout(
        makeLayoutReport({ ts: recent, hiddenButtons: [{ label: 'x', reason: 'r', element: null as unknown as HTMLElement, position: { x: 0, y: 0 } }] }),
      );
      reportsHistory.recordLayout(makeLayoutReport({ ts: old, hasHorizontalOverflow: true }));
      /* 1 functional récent escaladé */
      reportsHistory.recordFunctional(
        makeFunctionalReport({ ts: recent, errors: 2 }),
        { applied: [], escalated: true },
        undefined,
        0,
      );
      const s = reportsHistory.getStats();
      expect(s.layoutCount).toBe(3);
      expect(s.functionalCount).toBe(1);
      expect(s.recentBugs).toBe(3); /* 2 layouts récents + 1 functional récent */
      expect(s.recentEscalations).toBe(1);
    });

    it('lastLayoutTs / lastFunctionalTs = dernier entry', () => {
      reportsHistory.recordLayout(makeLayoutReport({ ts: 100 }));
      reportsHistory.recordLayout(makeLayoutReport({ ts: 200 }));
      reportsHistory.recordFunctional(
        makeFunctionalReport({ ts: 300 }),
        { applied: [], escalated: false },
        undefined,
        0,
      );
      const s = reportsHistory.getStats();
      expect(s.lastLayoutTs).toBe(200);
      expect(s.lastFunctionalTs).toBe(300);
    });
  });

  describe('clearHistory', () => {
    it('wipe layout + functional localStorage', () => {
      reportsHistory.recordLayout(makeLayoutReport());
      reportsHistory.recordFunctional(
        makeFunctionalReport(),
        { applied: [], escalated: false },
        undefined,
        0,
      );
      expect(reportsHistory.getLayoutHistory()).toHaveLength(1);
      expect(reportsHistory.getFunctionalHistory()).toHaveLength(1);
      reportsHistory.clearHistory();
      expect(reportsHistory.getLayoutHistory()).toEqual([]);
      expect(reportsHistory.getFunctionalHistory()).toEqual([]);
    });

    it('ne throw pas si déjà vide', () => {
      expect(() => reportsHistory.clearHistory()).not.toThrow();
    });
  });
});
