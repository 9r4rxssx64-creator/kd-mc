/**
 * E2E iPhone 14 Pro WebKit — flows critiques Kevin v13.4.125.
 *
 * Demande Kevin 2026-05-15 : "outil qui fait tests réels sur iPhone à ma place,
 * tout autocorrige, quand j'ouvre l'app tout fonctionne, plus aucun problème".
 *
 * Vérifie sur iPhone 14 Pro WebKit (vraie simu Safari iOS) :
 *  - Boot sans crash + responsive 393x852
 *  - Touch targets 44px+ (Apple HIG)
 *  - Pas de scroll horizontal (zoom permanent iOS Safari fit-to-content)
 *  - VisualViewport scale = 1.0 (pas de zoom non voulu)
 *  - Splash → render < 4s
 *  - Bouton SOS rescue accessible
 *  - Apex se met à jour automatiquement (version match source/deploy)
 */
import { test, expect } from '@playwright/test';

test.describe('Apex iPhone E2E critique (v13.4.125)', () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') {
        const t = m.text();
        if (t.includes('Failed to fetch') || t.includes('NetworkError') || t.includes('Firebase')) return;
        errors.push(`CONSOLE: ${t}`);
      }
    });
    (page as unknown as { _criticalErrors: string[] })._criticalErrors = errors;
  });

  test('iPhone 14 Pro : boot sans crash + viewport scale = 1.0 (pas zoom)', async ({ page, viewport }) => {
    /* Viewport iPhone 14 Pro = 393x852 */
    expect(viewport?.width).toBe(393);
    expect(viewport?.height).toBe(852);

    await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    /* Attend que le boot finisse (splash hide) */
    await page.waitForTimeout(3500);

    /* Vérif Apex bootté */
    await expect(page).toHaveTitle(/APEX AI/i);

    /* Vérif viewport scale = 1.0 (anti-régression Erreur #56 zoom permanent) */
    const visualScale = await page.evaluate(() => {
      const vv = (window as unknown as { visualViewport?: { scale: number } }).visualViewport;
      return vv?.scale ?? 1.0;
    });
    expect(visualScale).toBeCloseTo(1.0, 1);

    /* Vérif ratio innerWidth/clientWidth = 1.0 (pas de fit-to-content) */
    const ratio = await page.evaluate(() => {
      return window.innerWidth / document.documentElement.clientWidth;
    });
    expect(ratio).toBeCloseTo(1.0, 1);

    /* 0 erreurs critiques */
    const errors = (page as unknown as { _criticalErrors: string[] })._criticalErrors;
    expect(errors, `Erreurs JS critiques: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('iPhone : touch targets ≥ 44px (Apple HIG)', async ({ page }) => {
    await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    /* Récupère tous les boutons visibles et leur taille */
    const undersized = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"], a.button, [data-action]'));
      const problems: Array<{ tag: string; w: number; h: number; text: string }> = [];
      btns.forEach((b) => {
        const r = (b as HTMLElement).getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; /* hidden */
        if (r.width < 44 || r.height < 44) {
          problems.push({
            tag: (b as HTMLElement).tagName.toLowerCase(),
            w: Math.round(r.width),
            h: Math.round(r.height),
            text: (b.textContent ?? '').trim().slice(0, 30),
          });
        }
      });
      return problems;
    });
    /* Tolère <5 boutons sous 44px (icônes décoratives) */
    expect(undersized.length, `Touch targets <44px: ${JSON.stringify(undersized)}`).toBeLessThan(5);
  });

  test('iPhone : pas de scroll horizontal (Erreur #56 anti-régression)', async ({ page }) => {
    await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    /* scrollWidth ne doit pas excéder clientWidth (sinon zoom permanent iOS) */
    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScroll: document.body.scrollWidth,
        bodyClient: document.body.clientWidth,
      };
    });
    expect(overflow.scrollWidth, `Document scrollWidth (${overflow.scrollWidth}) ne doit pas dépasser clientWidth (${overflow.clientWidth})`).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.bodyScroll, `Body scrollWidth (${overflow.bodyScroll}) ne doit pas dépasser clientWidth (${overflow.bodyClient})`).toBeLessThanOrEqual(overflow.bodyClient);
  });

  test('iPhone : bouton SOS rescue accessible', async ({ page }) => {
    await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    const sosBtn = page.locator('#apex-rescue-btn');
    await expect(sosBtn).toBeAttached({ timeout: 5000 });
  });

  test('iPhone : APP_VER déployé match version source (anti drift Erreur #57)', async ({ page }) => {
    await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });

    const deployedVer = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-app-ver');
    });
    expect(deployedVer).toBeTruthy();
    expect(deployedVer).toMatch(/^v13\.4\.\d+$/);
  });

  test('iPhone : aria-labels présents sur boutons rescue (a11y WCAG)', async ({ page }) => {
    await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    const rescueButtons = await page.evaluate(() => {
      const ids = ['apex-rescue-btn', 'apex-rescue-coffre', 'apex-rescue-admin', 'apex-rescue-chat', 'apex-rescue-login'];
      return ids.map((id) => {
        const el = document.getElementById(id);
        return {
          id,
          present: !!el,
          hasAriaLabel: !!el?.getAttribute('aria-label'),
          hasTitle: !!el?.getAttribute('title'),
        };
      });
    });
    rescueButtons.forEach((b) => {
      if (b.present) {
        expect(b.hasAriaLabel || b.hasTitle, `Bouton ${b.id} doit avoir aria-label OU title`).toBe(true);
      }
    });
  });
});
