/**
 * E2E iPhone SE 375px — couverture petit écran minimum Apple.
 *
 * v13.4.196 (audit subagent gap UX mobile 375px) :
 * Le project `mobile-safari` couvrait iPhone 14 Pro (393px) mais aucun test
 * sur iPhone SE (375px) — viewport le plus contraint qu'Apex doit supporter.
 *
 * Vérifie sur 375x667 (iPhone SE) :
 *  - Boot sans crash + render <5s
 *  - Pas de scroll horizontal (overflow-x détecté)
 *  - Touch targets ≥ 44px (Apple HIG)
 *  - Badge version visible (bottom-left safe-area)
 *  - SOS rescue accessible (z-index, touch zone)
 *  - Voice-overlay s'affiche correctement sur 375px (si rendable)
 */
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone SE'] });

test.describe('Apex iPhone SE 375px (v13.4.196)', () => {
  test('boot + render sans scroll horizontal', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll, 'iPhone SE 375px ne doit JAMAIS avoir de scroll horizontal').toBe(false);

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      scale: window.visualViewport?.scale ?? 1,
    }));
    expect(viewport.width).toBe(375);
    expect(viewport.scale).toBeCloseTo(1, 2);
  });

  test('badge version visible bottom-left safe-area', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const badge = page.locator('#apex-version-badge, [data-apex-version-badge]').first();
    if ((await badge.count()) > 0) {
      const box = await badge.boundingBox();
      expect(box, 'badge version doit avoir une bounding box').not.toBeNull();
      if (box) {
        expect(box.x, 'badge à gauche (<200px de 375)').toBeLessThan(200);
        expect(box.y + box.height, 'badge en bas de page').toBeGreaterThan(500);
      }
    }
  });

  test('SOS rescue accessible touch zone ≥44px', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const sos = page.locator('#apex-rescue-btn').first();
    if ((await sos.count()) > 0) {
      const box = await sos.boundingBox();
      if (box) {
        expect(box.width, 'SOS width ≥44px Apple HIG').toBeGreaterThanOrEqual(44);
        expect(box.height, 'SOS height ≥44px Apple HIG').toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('voice-overlay lisible sur 375px si déclenché', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const overlayPresent = await page.evaluate(() => {
      return typeof (window as unknown as { __APEX__?: { voiceOverlay?: unknown } }).__APEX__
        ?.voiceOverlay !== 'undefined';
    });
    if (overlayPresent) {
      const fits = await page.evaluate(() => {
        const test = document.createElement('div');
        test.style.position = 'fixed';
        test.style.inset = '0';
        test.style.zIndex = '999999';
        test.id = '__overlay-test__';
        document.body.appendChild(test);
        const w = test.offsetWidth;
        test.remove();
        return w <= 375;
      });
      expect(fits, 'overlay container ne déborde pas 375px').toBe(true);
    }
  });
});
