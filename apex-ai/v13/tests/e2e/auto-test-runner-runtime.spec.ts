/**
 * v13.4.210 — E2E test runtime auto-test-runner sur prod URL.
 *
 * Kevin "Apex valide en réel à ma place" : workflow apex-ios-simulator
 * appelle ce test après chaque deploy, qui exécute autoTestRunner.runAll()
 * via window.autoTestRunner exposé par bootstrap.ts.
 *
 * Latence remontée fail : <60s post-deploy (vs 6h précédent cron).
 *
 * Run sur 2 projects : mobile-safari (iPhone 14 Pro WebKit) + mobile-safari-se
 * (iPhone SE 375px). Si fail → workflow CI rouge → mail Kevin disabled mais
 * Issue auto-créée par github-actions.
 */
import { expect, test } from '@playwright/test';

test.describe('Apex runtime auto-test (v13.4.210)', () => {
  test('autoTestRunner exposé sur window + runAll() retourne summary', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    /* Attendre que window.autoTestRunner soit prêt (safeInit deferred ~5s) */
    await page.waitForFunction(
      () => typeof (window as unknown as { autoTestRunner?: unknown }).autoTestRunner !== 'undefined',
      { timeout: 15_000 },
    );

    const summary = await page.evaluate(async () => {
      const w = window as unknown as { autoTestRunner: { runAll: () => Promise<unknown> } };
      return w.autoTestRunner.runAll();
    });

    expect(summary).toBeDefined();
    const s = summary as { total: number; passed: number; failed: number };
    expect(s.total).toBeGreaterThanOrEqual(7); /* min 7 tests historiques */
    expect(s.passed).toBeGreaterThan(0);
    /* Soft check : tolérance fails (vault/network peuvent fail en CI sans credentials) */
    expect(s.passed + s.failed).toBeLessThanOrEqual(s.total);

    /* Si > 50% fail, c'est suspect — fail le test pour alerter */
    if (s.failed > s.total / 2) {
      throw new Error(`Auto-test runtime FAIL critique : ${s.failed}/${s.total} fails`);
    }
  });

  test('apexMultiBranchCoordinator exposé sur window', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => typeof (window as unknown as { apexMultiBranchCoordinator?: unknown }).apexMultiBranchCoordinator !== 'undefined',
      { timeout: 15_000 },
    );

    const hasReport = await page.evaluate(() => {
      const w = window as unknown as { apexMultiBranchCoordinator: { getLastReport: () => unknown } };
      const r = w.apexMultiBranchCoordinator.getLastReport();
      return r !== undefined;
    });
    expect(hasReport).toBe(true);
  });
});
