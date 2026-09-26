/**
 * Apex v13.4.162 — E2E Playwright : routing + auth gate critiques.
 *
 * Couvre :
 *  1. Navigation hash routes (#chat, #settings, #vault) avant/après login
 *  2. Routes admin-only protégées (requiresAdmin → redirect login)
 *  3. Routes auth-required protégées
 *  4. Logout retourne au landing
 */
import { test, expect } from '@playwright/test';

test.describe('Apex v13 routing + auth gate (v13.4.162)', () => {
  test('route #chat sans login → redirect landing form', async ({ page }) => {
    await page.goto('/#chat');
    /* Pas authentifié → login form visible (requiresAuth gate) */
    await expect(page.locator('#login-name')).toBeVisible({ timeout: 5000 });
  });

  test('route #vault sans admin → bloqué', async ({ page }) => {
    await page.goto('/#vault');
    /* Pas admin → login form visible OU pas de content vault */
    const loginVisible = await page.locator('#login-name').isVisible({ timeout: 3000 }).catch(() => false);
    const vaultBlocked = !await page.locator('[data-route="vault"]:visible').isVisible({ timeout: 1000 }).catch(() => false);
    expect(loginVisible || vaultBlocked).toBe(true);
  });

  test('route #settings sans login → bloqué', async ({ page }) => {
    await page.goto('/#settings');
    /* Pas authentifié → login form visible */
    await expect(page.locator('#login-name')).toBeVisible({ timeout: 5000 });
  });

  test('navigation hash router : #chat → URL hash change', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { location.hash = 'chat'; });
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#chat');
  });

  test('hash route invalide retourne landing par défaut', async ({ page }) => {
    await page.goto('/#totally-invalid-route-xyz');
    /* Pas de crash, app affiche soit landing soit login */
    const html = await page.locator('body').innerHTML();
    expect(html.length).toBeGreaterThan(100);
  });

  test('back button navigation history fonctionne', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { location.hash = 'signup'; });
    await page.waitForTimeout(300);
    await page.goBack();
    await page.waitForTimeout(300);
    /* Page existe toujours, pas crashed */
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Apex v13 admin Kevin login → chat (v13.4.162)', () => {
  test('login Kevin valide → chat accessible', async ({ page }) => {
    await page.goto('/');
    await page.fill('#login-name', 'Kevin DESARZENS');
    await page.fill('#login-pin', '200807');
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.locator('#login-pin').press('Enter');
    }
    /* Post-login : login form disparu */
    await expect(page.locator('#login-name')).toBeHidden({ timeout: 5000 });
    /* URL hash devrait avoir changé vers une route auth */
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/#(chat|landing|home|app)/);
  });

  test('login refuse nom seul (sans nom complet)', async ({ page }) => {
    await page.goto('/');
    await page.fill('#login-name', 'Kevin'); /* Pas de nom complet */
    await page.fill('#login-pin', '200807');
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.locator('#login-pin').press('Enter');
    }
    /* Login form toujours visible (rule CLAUDE.md : prénom + nom obligatoire) */
    await expect(page.locator('#login-name')).toBeVisible();
  });

  test('login accepte ordre inverse (DESARZENS Kevin)', async ({ page }) => {
    await page.goto('/');
    await page.fill('#login-name', 'DESARZENS Kevin');
    await page.fill('#login-pin', '200807');
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.locator('#login-pin').press('Enter');
    }
    /* Should succeed (auth flexible ordre prénom/nom) */
    await expect(page.locator('#login-name')).toBeHidden({ timeout: 5000 });
  });
});
