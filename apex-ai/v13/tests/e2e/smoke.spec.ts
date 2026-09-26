import { test, expect } from '@playwright/test';

test.describe('Apex v13 smoke', () => {
  test('landing affiche le logo APEX', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ax-landing-logo')).toContainText('APEX');
  });

  test('login formulaire visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-name')).toBeVisible();
    await expect(page.locator('#login-pin')).toBeVisible();
  });

  test('SOS rescue bouton accessible (caché par défaut)', async ({ page }) => {
    await page.goto('/');
    const sos = page.locator('#apex-rescue-btn');
    await expect(sos).toHaveAttribute('aria-label', 'Reset Apex');
  });
});
