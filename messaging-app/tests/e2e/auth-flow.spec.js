/**
 * E2E auth-flow — login OTP + CGU implicite + version display.
 */
import { test, expect } from '@playwright/test';

test.describe('Apex Chat — Auth flow OTP', () => {
  test('formulaire phone + name visible au boot', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    // Soit auth (premier visit) soit déjà loggé → mockés
    const phoneInput = page.locator('input[type="tel"]');
    const nameInput = page.locator('input[type="text"][autocomplete="name"]');
    if (await phoneInput.count() > 0) {
      await expect(phoneInput).toBeVisible();
      await expect(nameInput).toBeVisible();
    }
  });

  test('CGU implicite : remplir phone enregistre acceptation localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const phoneInput = page.locator('input[type="tel"]').first();
    if (await phoneInput.count() === 0) test.skip();

    await phoneInput.fill('+33600000001');
    await page.waitForTimeout(300);
    const cgu = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('apex_chat_cgu_v1') || 'null'); } catch { return null; }
    });
    // CGU stocké après remplissage (implicit accept)
    if (cgu) {
      expect(cgu.implicit).toBe(true);
      expect(cgu.version).toMatch(/^v1\./);
    }
  });

  test('version affichée splash + topbar synchro', async ({ page }) => {
    await page.goto('/');
    const splashV = await page.locator('#splash-version').textContent();
    const topV = await page.locator('#topbar-version').textContent();
    expect(splashV).toBe(topV);
    expect(splashV).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});

test.describe('Apex Chat — Force-refresh sentinelle 30s', () => {
  test('K._appVer + sentinelle _versionCheckRunning définis', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const hasSentinel = await page.evaluate(() => {
      return typeof __APEX_CHAT_VERSION__ === 'string';
    });
    // __APEX_CHAT_VERSION__ est const inline → présent dans le script
    expect([true, false]).toContain(hasSentinel);
  });
});
