/**
 * APEX v13.4.182 — Reports History (Kevin "Rapport historique auto dans admin").
 *
 * Persist + expose historique des audits Apex :
 * - Layout scans (overflow, boutons cachés, touch targets)
 * - Functional tests (boutons OK/no_response/errors + auto-fix appliqués)
 *
 * Storage : localStorage (cap 50 par type, FIFO drop oldest).
 * Lecture : vue admin "Apex Audits Live" affiche les N derniers + détails.
 *
 * Auto-record : appelé par
 * - Bouton 🧪 Test fonctionnel (Settings)
 * - Bouton 📐 Layout scan (Settings)
 * - startAutoMonitor() chaque 30s (silencieux background, persist si bug)
 */

import { logger } from '../../core/logger.js';

import type { FunctionalTestReport } from './apex-functional-tester.js';
import type { LayoutScanReport } from './apex-layout-inspector.js';

const LAYOUT_KEY = 'apex_v13_audit_layout_history';
const FUNCTIONAL_KEY = 'apex_v13_audit_functional_history';
const MAX_HISTORY = 50;

export interface LayoutHistoryEntry {
  ts: number;
  view: string;
  hasHorizontalOverflow: boolean;
  overflowingCount: number;
  hiddenButtonsCount: number;
  smallTouchTargetsCount: number;
  /* Snapshot compact pour ne pas exploser localStorage */
  topOverflows: { selector: string; overflowBy: number }[];
  topHiddenButtons: { label: string; reason: string }[];
  appVer: string;
}

export interface FunctionalHistoryEntry {
  ts: number;
  view: string;
  tested: number;
  totalButtons: number;
  ok: number;
  noResponse: number;
  errors: number;
  skipped: number;
  okRate: number;
  fixesApplied: string[];
  escalated: boolean;
  improvement: number;
  /* Échantillon bugs pour débuggage */
  bugSamples: { label: string; status: string }[];
  appVer: string;
}

function readLayoutHistory(): LayoutHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LayoutHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function readFunctionalHistory(): FunctionalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(FUNCTIONAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as FunctionalHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist<T>(key: string, entries: T[]): void {
  try {
    const capped = entries.slice(-MAX_HISTORY);
    localStorage.setItem(key, JSON.stringify(capped));
  } catch (err: unknown) {
    logger.warn('reports-history', 'persist failed (quota?)', { err });
    /* Fallback : trim agressif */
    try {
      const half = entries.slice(-(MAX_HISTORY / 2));
      localStorage.setItem(key, JSON.stringify(half));
    } catch { /* ignore */ }
  }
}

function recordLayout(report: LayoutScanReport): void {
  const entry: LayoutHistoryEntry = {
    ts: report.ts,
    view: location.hash || '/',
    hasHorizontalOverflow: report.hasHorizontalOverflow,
    overflowingCount: report.overflowingElements.length,
    hiddenButtonsCount: report.hiddenButtons.length,
    smallTouchTargetsCount: report.smallTouchTargets.length,
    topOverflows: report.overflowingElements.slice(0, 5).map((e) => ({
      selector: e.selector,
      overflowBy: e.overflowBy,
    })),
    topHiddenButtons: report.hiddenButtons.slice(0, 5).map((b) => ({
      label: b.label,
      reason: b.reason,
    })),
    appVer: report.appVer,
  };
  const existing = readLayoutHistory();
  existing.push(entry);
  persist(LAYOUT_KEY, existing);
}

function recordFunctional(
  before: FunctionalTestReport,
  fixes: { applied: string[]; escalated: boolean },
  after: FunctionalTestReport | undefined,
  improvement: number,
): void {
  const finalReport = after ?? before;
  const entry: FunctionalHistoryEntry = {
    ts: before.ts,
    view: before.viewBefore,
    tested: finalReport.tested,
    totalButtons: finalReport.totalButtons,
    ok: finalReport.ok,
    noResponse: finalReport.noResponse,
    errors: finalReport.errors,
    skipped: finalReport.skipped,
    okRate: finalReport.tested > 0 ? finalReport.ok / finalReport.tested : 0,
    fixesApplied: fixes.applied,
    escalated: fixes.escalated,
    improvement,
    bugSamples: before.details
      .filter((d) => d.status === 'no_response' || d.status === 'error')
      .slice(0, 5)
      .map((d) => ({ label: d.label, status: d.status })),
    appVer: document.documentElement.getAttribute('data-app-ver') ?? 'unknown',
  };
  const existing = readFunctionalHistory();
  existing.push(entry);
  persist(FUNCTIONAL_KEY, existing);
}

function getLayoutHistory(): LayoutHistoryEntry[] {
  return readLayoutHistory();
}

function getFunctionalHistory(): FunctionalHistoryEntry[] {
  return readFunctionalHistory();
}

function getStats(): {
  layoutCount: number;
  functionalCount: number;
  lastLayoutTs: number | null;
  lastFunctionalTs: number | null;
  recentBugs: number; /* Bugs des 24 dernières heures */
  recentEscalations: number;
} {
  const layout = readLayoutHistory();
  const func = readFunctionalHistory();
  const dayAgo = Date.now() - 86_400_000;
  const recentBugs = layout.filter(
    (e) => e.ts > dayAgo && (e.hasHorizontalOverflow || e.hiddenButtonsCount > 0),
  ).length + func.filter((e) => e.ts > dayAgo && (e.noResponse > 0 || e.errors > 0)).length;
  const recentEscalations = func.filter((e) => e.ts > dayAgo && e.escalated).length;
  return {
    layoutCount: layout.length,
    functionalCount: func.length,
    lastLayoutTs: layout.length ? (layout[layout.length - 1]?.ts ?? null) : null,
    lastFunctionalTs: func.length ? (func[func.length - 1]?.ts ?? null) : null,
    recentBugs,
    recentEscalations,
  };
}

function clearHistory(): void {
  try {
    localStorage.removeItem(LAYOUT_KEY);
    localStorage.removeItem(FUNCTIONAL_KEY);
  } catch { /* ignore */ }
}

export const reportsHistory = {
  recordLayout,
  recordFunctional,
  getLayoutHistory,
  getFunctionalHistory,
  getStats,
  clearHistory,
};
