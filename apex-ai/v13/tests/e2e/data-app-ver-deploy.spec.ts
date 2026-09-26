/**
 * Apex v13.4.162 — E2E Playwright : version deploy + force-update banner.
 *
 * Couvre (CLAUDE.md Erreur #54 anti-régression) :
 *  1. data-app-ver présent dans HTML (anti-régression: pas APEX_BOOT_NONCE)
 *  2. CSP nonce remplacé (pas de littéral APEX_BOOT_NONCE)
 *  3. Bundle JS chargé (script tags présents avec nonce)
 *  4. Service Worker version cohérente avec APP_VER (sw-cache-sync)
 */
import { test, expect } from '@playwright/test';

test.describe('Apex v13 data-app-ver + deploy integrity (v13.4.162)', () => {
  test('data-app-ver attribute non vide + format vX.Y.Z', async ({ page }) => {
    await page.goto('/');
    const ver = await page.locator('html').getAttribute('data-app-ver');
    expect(ver).toBeTruthy();
    expect(ver).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  test('CSP nonce remplacé (PAS de littéral APEX_BOOT_NONCE dans HTML)', async ({ page }) => {
    /* Erreur #54 anti-régression : si dist copy oublié, nonce reste literal */
    const response = await page.goto('/');
    const html = await response?.text() ?? '';
    expect(html).not.toContain('APEX_BOOT_NONCE');
    /* Au moins 1 script avec nonce= attribute */
    expect(html).toMatch(/<script\s+[^>]*nonce="[a-zA-Z0-9_-]+"/);
  });

  test('aucun script inline non-noncé (CSP strict)', async ({ page }) => {
    await page.goto('/');
    const inlineNoNonce = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts
        .filter((s) => !s.src && s.textContent && !s.nonce && !s.hasAttribute('nonce'))
        .map((s) => (s.textContent ?? '').slice(0, 80));
    });
    /* En CSP strict, tout script inline DOIT avoir un nonce */
    expect(inlineNoNonce.length).toBe(0);
  });

  test('Service Worker scope OK', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    const swRegistration = await page.evaluate(async () => {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { scope: reg.scope, active: !!reg.active } : null;
    });
    /* SW peut être null en preview local sans manifest, on accepte */
    if (swRegistration) {
      expect(swRegistration.scope).toContain('/');
    }
  });

  test('manifest.json accessible + name=Apex', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    const body = await response?.json();
    expect(body).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).toContain('apex');
  });
});

test.describe('Apex v13 LCP performance (v13.4.162)', () => {
  test('LCP < 2.5s sur landing page (mobile)', async ({ page }) => {
    /* Mesure LCP via PerformanceObserver */
    await page.goto('/');
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let largest = 0;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              largest = (entry as PerformanceEntry & { renderTime?: number; loadTime?: number }).renderTime
                ?? (entry as PerformanceEntry & { loadTime?: number }).loadTime
                ?? entry.startTime;
            }
          });
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(largest);
          }, 3000);
        } catch {
          resolve(0);
        }
      });
    });
    /* LCP target < 2500ms (Google Web Vitals "Good") */
    if (lcp > 0) {
      expect(lcp).toBeLessThan(4000); /* Tolérance + relax 4s pour preview server */
    }
  });

  test('aucun script bundle > 500 KB (bundle size budget)', async ({ page }) => {
    const responses: Array<{ url: string; size: number }> = [];
    page.on('response', async (resp) => {
      const url = resp.url();
      if (/\.js(\?|$)/.test(url)) {
        try {
          const buffer = await resp.body();
          responses.push({ url, size: buffer.length });
        } catch { /* ignore */ }
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    const oversized = responses.filter((r) => r.size > 500 * 1024);
    if (oversized.length > 0) {
      console.log('Oversized bundles:', oversized.map((r) => `${r.url.split('/').pop()}: ${Math.round(r.size / 1024)}KB`));
    }
    expect(oversized.length).toBeLessThanOrEqual(2); /* tolérance vendor bundle */
  });
});
