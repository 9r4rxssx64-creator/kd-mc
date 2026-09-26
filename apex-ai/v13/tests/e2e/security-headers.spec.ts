/**
 * P1-9 (audit v13.2.5) : e2e Playwright sécurité headers & CSP.
 *
 * Vérifie :
 *  1. CSP strict-dynamic présent (audit a noté 9/10 sécu CSP)
 *  2. Pas de 'unsafe-inline' dans script-src
 *  3. Pas de 'unsafe-eval'
 *  4. Aucune erreur JS console au boot
 */
import { test, expect } from '@playwright/test';

test.describe('Apex v13 security headers (CSP)', () => {
  test('CSP meta tag présent + strict-dynamic', async ({ page }) => {
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toBeTruthy();
    expect(csp).toContain("script-src");
    /* strict-dynamic ou nonce — niveau Stripe (audit 9/10) */
    expect(csp).toMatch(/strict-dynamic|nonce-/);
  });

  test('CSP refuse unsafe-inline + unsafe-eval (script-src)', async ({ page }) => {
    await page.goto('/');
    const csp = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) ?? '';
    /* Extrait directive script-src */
    const scriptSrcMatch = csp.match(/script-src[^;]*/);
    const scriptSrc = scriptSrcMatch ? scriptSrcMatch[0] : '';
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    /* unsafe-inline acceptable si présent UNIQUEMENT en fallback strict-dynamic */
    if (scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes('strict-dynamic')) {
      throw new Error('unsafe-inline sans strict-dynamic = XSS-vulnerable');
    }
  });

  test('aucune erreur JS console au boot', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });
    await page.goto('/');
    /* Wait pour que boot async se termine */
    await page.waitForTimeout(2000);
    /* Filter errors non-critiques (favicon 404, third-party CDN) */
    const critical = errors.filter((e) => !/favicon|third-party|adblock|extension/i.test(e));
    expect(critical).toEqual([]);
  });
});
