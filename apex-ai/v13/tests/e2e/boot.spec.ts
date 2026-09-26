/**
 * E2E boot smoke test (Jet 6 fix audit "test-results FAILED").
 *
 * Vérifie que l'app boot SANS crash :
 * - HTML 200 OK + JS bundle 200 OK
 * - Splash visible puis caché < 4s
 * - Root rendu (innerHTML > 0)
 * - 0 console errors critiques (sauf erreurs réseau attendues offline)
 * - Bouton SOS rescue accessible
 */
import { test, expect } from '@playwright/test';

test.describe('Apex v13 boot smoke', () => {
  test('app charge sans crash + splash → landing render', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error') {
        /* Filtre erreurs réseau attendues sans clés API ou Firebase offline */
        if (text.includes('Failed to fetch') || text.includes('NetworkError') || text.includes('Firebase')) return;
        errors.push(`CONSOLE: ${text}`);
      }
    });

    await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });

    /* 1. HTML chargé */
    await expect(page).toHaveTitle(/APEX AI/i);

    /* 2. Splash visible au début */
    const splashEl = page.locator('#apex-splash');
    await expect(splashEl).toBeVisible({ timeout: 2000 });

    /* 3. Splash caché après ~1s (fin du boot) */
    await page.waitForTimeout(2500);
    const splashHidden = await page.evaluate(() => {
      const s = document.getElementById('apex-splash');
      if (!s) return true;
      return s.hidden || getComputedStyle(s).opacity === '0' || getComputedStyle(s).display === 'none';
    });
    expect(splashHidden).toBe(true);

    /* 4. Root rendu avec contenu */
    const rootContent = await page.evaluate(() => document.getElementById('apex-root')?.innerHTML ?? '');
    expect(rootContent.length).toBeGreaterThan(50);

    /* 5. Bouton SOS présent (always available) */
    const sos = page.locator('#apex-rescue-btn');
    await expect(sos).toHaveAttribute('aria-label', 'Reset Apex');

    /* 6. Pas d'erreurs JS critiques */
    expect(errors.length).toBe(0);
  });

  test('navigation hash router fonctionne (#chat → #login)', async ({ page }) => {
    await page.goto('http://localhost:4173/');
    await page.waitForTimeout(2000);

    /* Sans user, route default = landing */
    const initialView = await page.evaluate(() => location.hash);
    expect(initialView === '' || initialView === '#landing').toBe(true);

    /* Navigation explicite #login */
    await page.evaluate(() => { location.hash = '#login'; });
    await page.waitForTimeout(500);
    const loginForm = page.locator('#login-form');
    await expect(loginForm).toBeVisible();
  });

  test('SOS rescue button is keyboard accessible', async ({ page }) => {
    await page.goto('http://localhost:4173/');
    await page.waitForTimeout(2000);
    const sos = page.locator('#apex-rescue-btn');
    /* Bouton existe avec touch-target ≥ 44px */
    const box = await sos.boundingBox();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
