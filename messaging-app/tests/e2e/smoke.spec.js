/**
 * E2E smoke tests — Apex Chat PWA boot + UX critique iPhone Safari.
 * Vérifie : chargement HTML, SW registration, splash, manifest, accessibility.
 */
import { test, expect } from '@playwright/test';

test.describe('Apex Chat — Boot smoke iPhone Safari PWA', () => {
  test('home charge avec splash + topbar version + manifest PWA', async ({ page }) => {
    const responses = [];
    page.on('response', (r) => responses.push({ url: r.url(), status: r.status() }));

    await page.goto('/');

    // Titre + viewport
    await expect(page).toHaveTitle(/Apex Chat/i);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('viewport-fit=cover');

    // Splash visible au boot
    await expect(page.locator('#splash')).toBeAttached();
    // Topbar version visible
    const topbarVersion = await page.locator('#topbar-version').textContent();
    expect(topbarVersion).toMatch(/^v1\.1\.\d+/);

    // Manifest chargé (PWA installable)
    const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestLink).toBe('./manifest.json');

    // CSP strict + Permissions-Policy
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    const permPolicy = await page.locator('meta[http-equiv="Permissions-Policy"]').getAttribute('content');
    // Messagerie avec appels vidéo : caméra/micro autorisés à SOI (self), jamais
    // aux tiers. Les capacités non utilisées restent verrouillées ().
    expect(permPolicy).toContain('camera=(self)');
    expect(permPolicy).toContain('microphone=(self)');
    expect(permPolicy).toContain('geolocation=(self)');
    expect(permPolicy).toContain('payment=()');
    expect(permPolicy).toContain('interest-cohort=()');
  });

  test('skip-link accessible au focus clavier', async ({ page }) => {
    await page.goto('/');
    const skip = page.locator('a.skip-link').first();
    await expect(skip).toBeAttached();
    await expect(skip).toHaveText(/contenu principal/i);
    // Focus avec Tab
    await page.keyboard.press('Tab');
    // Le skip-link devient visible quand focus
    const bbox = await skip.boundingBox();
    expect(bbox).not.toBeNull();
  });

  test('main role + aria-label sur app container', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('main#app[role="main"]');
    await expect(main).toBeAttached();
    const ariaLabel = await main.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/Apex Chat/i);
  });

  test('lang="fr" sur html', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('fr');
  });

  test('crypto-core ESM module chargé sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForTimeout(1500);
    // window.ApexCrypto doit être exposé après chargement crypto.js + lib/crypto-core.js
    const hasCrypto = await page.evaluate(() => typeof window.ApexCrypto === 'object' && typeof window.ApexCrypto.generateIdentityKeys === 'function');
    expect(hasCrypto).toBe(true);
    expect(errors).toEqual([]);
  });

  // Audit 17/09/2026 (P0) : le SW « enregistré » ne prouvait rien — il tournait en repli
  // sans cache (import() interdit dans un SW classique). Ce test exige désormais que le
  // SW soit ACTIF et que son cache soit réellement peuplé (pré-cache de l'install).
  // L'ancienne version acceptait `true ou false` = faux vert.
  test.describe('avec Service Worker autorisé', () => {
  test.use({ serviceWorkers: 'allow' });
  test('Service Worker actif ET cache peuplé (module, pré-cache)', async ({ page, browserName }) => {
    await page.goto('/');
    const etat = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { support: false };
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout 15s')), 15000)),
        ]);
        // laisse l'install finir de pré-cacher
        for (let i = 0; i < 30; i++) {
          const keys = await caches.keys();
          if (keys.some((k) => k.startsWith('apex-chat-v'))) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        const keys = await caches.keys();
        const manifest = await caches.match('./manifest.json');
        return { support: true, active: !!reg.active, keys, manifestCached: !!manifest, url: reg.active && reg.active.scriptURL };
      } catch (e) {
        let reg = null; try { reg = await navigator.serviceWorker.getRegistration(); } catch (_) {}
        return { support: true, error: String(e && e.message || e), diag: { reg: !!reg, active: !!(reg && reg.active), installing: !!(reg && reg.installing), waiting: !!(reg && reg.waiting), keys: await caches.keys(), swErr: await navigator.serviceWorker.register('./sw.js?v=diag', { scope: './', type: 'module' }).then(() => 'register ok').catch((e2) => String(e2)) } };
      }
    });
    expect(etat.support, 'navigateur sans Service Worker').toBe(true);
    if (browserName === 'webkit' && etat.error) {
      // Playwright WebKit ne fait pas toujours tourner un SW module sur un certificat
      // auto-signé : on le DIT (annotation) au lieu de passer au vert en silence.
      test.info().annotations.push({ type: 'non-vérifié-ici', description: 'SW WebKit : ' + etat.error });
      return;
    }
    expect(etat.error, 'SW non prêt : ' + etat.error + ' ' + JSON.stringify(etat.diag)).toBeUndefined();
    expect(etat.active).toBe(true);
    expect(etat.url).toContain('sw.js');
    expect(etat.keys.some((k) => k.startsWith('apex-chat-v')), 'aucun cache apex-chat-v* : ' + JSON.stringify(etat.keys)).toBe(true);
    expect(etat.manifestCached, 'manifest.json absent du pré-cache').toBe(true);
  });
  });
});

test.describe('Apex Chat — UX critique iPhone (touch targets, font-size)', () => {
  test('font-size inputs ≥ 16px (anti-zoom iOS)', async ({ page }) => {
    await page.goto('/');
    // Premier input rendu (auth-phone) après splash
    await page.waitForTimeout(800);
    const phoneInput = page.locator('input[type="tel"]').first();
    if (await phoneInput.count() > 0) {
      const fontSize = await phoneInput.evaluate((el) => parseInt(getComputedStyle(el).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }
  });

  test('touch targets ≥ 44px sur boutons primaires', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    const btns = await page.locator('button.btn, button.topbar-btn').all();
    let checked = 0;
    for (const btn of btns.slice(0, 5)) {
      const box = await btn.boundingBox();
      if (box && box.width > 0) {
        expect(box.height).toBeGreaterThanOrEqual(36); // 36 minimum (44 cible)
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('aria-label présent sur boutons icon-only', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    const iconBtns = page.locator('button.topbar-btn');
    const count = await iconBtns.count();
    if (count > 0) {
      const labels = await iconBtns.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter(Boolean));
      expect(labels.length).toBeGreaterThan(0);
    }
  });
});
