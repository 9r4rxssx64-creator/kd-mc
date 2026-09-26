/**
 * APEX v13 — A11y baseline (axe-core via Playwright injection)
 *
 * Mission UX 17→20/20 : mesurer violations WCAG 2.1 AA sur routes critiques.
 *
 * Approche :
 *  - Inject axe-core depuis node_modules dans la page Playwright (pas @axe-core/playwright,
 *    pour éviter une nouvelle dépendance dev — le bundle existe déjà).
 *  - Run axe.run() sur landing + 4 routes principales après navigation router.
 *  - Output rapport JSON apex-ai/v13/a11y-baseline.json (cap critique, sérieux, modéré, mineur).
 *  - Fail si critical>0 ou serious>0 (cible 0/0).
 *
 * Usage :
 *   npx playwright test tests/e2e/a11y.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------- Types axe-core (subset) ---------- */
type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';
interface AxeViolation {
  id: string;
  impact: AxeImpact | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: { target: string[]; html: string; failureSummary: string }[];
}
interface AxeResult {
  violations: AxeViolation[];
  passes: { id: string }[];
  incomplete: { id: string }[];
  inapplicable: { id: string }[];
  url: string;
  timestamp: string;
}

/* ---------- Helpers ---------- */
const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE_PATH = resolve(__dirname, '../../node_modules/axe-core/axe.min.js');
const REPORT_PATH = resolve(__dirname, '../../a11y-baseline.json');

const ROUTES: { route: string; label: string }[] = [
  { route: '', label: 'landing' },
  { route: '#/chat', label: 'chat' },
  { route: '#/vault', label: 'vault' },
  { route: '#/settings', label: 'settings' },
  { route: '#/admin', label: 'admin' },
];

interface RouteReport {
  route: string;
  label: string;
  violations: { critical: number; serious: number; moderate: number; minor: number };
  details: AxeViolation[];
  url: string;
}

const allReports: RouteReport[] = [];

/* ---------- Tests ---------- */
test.describe('Apex v13 — A11y baseline (axe-core WCAG 2.1 AA)', () => {
  let axeSrc: string;

  test.beforeAll(() => {
    try {
      axeSrc = readFileSync(AXE_PATH, 'utf-8');
    } catch (e) {
      throw new Error(
        `Cannot read axe-core from ${AXE_PATH}. Run 'npm install' first.\n${(e as Error).message}`,
      );
    }
  });

  for (const r of ROUTES) {
    test(`route ${r.label}`, async ({ page }) => {
      /* Stabilise la page — boot Apex initial, premier rendu */
      await page.goto('/' + r.route);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(500);

      /* Inject axe-core IIFE bundle dans la page courante */
      await page.addScriptTag({ content: axeSrc });

      /* Run axe avec config WCAG 2.1 AA */
      const result: AxeResult = await page.evaluate(async () => {
        // @ts-expect-error axe est injecté à l'exécution
        return await window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
          },
          resultTypes: ['violations'],
        });
      });

      const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const v of result.violations) {
        if (v.impact && v.impact in counts) counts[v.impact]++;
      }

      allReports.push({
        route: r.route,
        label: r.label,
        violations: counts,
        details: result.violations,
        url: result.url,
      });

      /* Cible UX 20/20 : 0 critical, 0 serious */
      expect(counts.critical, `${r.label} : ${counts.critical} critical violations`).toBe(0);
      expect(counts.serious, `${r.label} : ${counts.serious} serious violations`).toBe(0);
    });
  }

  test.afterAll(() => {
    const summary = {
      app: 'apex-v13',
      timestamp: new Date().toISOString(),
      total_routes: allReports.length,
      total_violations: allReports.reduce(
        (acc, r) => ({
          critical: acc.critical + r.violations.critical,
          serious: acc.serious + r.violations.serious,
          moderate: acc.moderate + r.violations.moderate,
          minor: acc.minor + r.violations.minor,
        }),
        { critical: 0, serious: 0, moderate: 0, minor: 0 },
      ),
      routes: allReports,
    };
    writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
     
    console.log(`[a11y] Rapport écrit dans ${REPORT_PATH}`);
    console.log(`[a11y] Total violations:`, summary.total_violations);
     
  });
});
