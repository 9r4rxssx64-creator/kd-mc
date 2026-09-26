// Smoke tests — vérifie que la prod Apex Chat est saine.
// Volontairement non-destructifs : pas de login réel ni de modif state serveur.

import { test, expect } from '@playwright/test';

test.describe('Apex Chat prod smoke tests', () => {

  test('home page charge en < 10s, status 200, version v1.1.X', async ({ page }) => {
    // v1.1.199 — robustesse WebKit/iOS sur CI Linux : navigation lente possible
    // (index.html ~640KB + SW). domcontentloaded suffit pour lire le HTML/version.
    const response = await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    expect(response.status()).toBe(200);
    // titre enrichi v1.1.170
    await expect(page).toHaveTitle(/Apex Chat/i);
    // version visible dans la topbar ou le splash
    const html = await page.content();
    const versionMatch = html.match(/v1\.1\.(\d+)/);
    expect(versionMatch, 'version v1.1.X introuvable dans le HTML').toBeTruthy();
    const minor = parseInt(versionMatch[1], 10);
    expect(minor, `version trop ancienne : v1.1.${minor}`).toBeGreaterThanOrEqual(160);
  });

  test('SEO meta complets (canonical, OG, Twitter, JSON-LD)', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Canonical — DOIT être le domaine propre, pas l'URL GitHub Pages.
    //
    // ⚠️ Ce test exigeait `toContain('messaging-app')`, c'est-à-dire l'ancienne
    // adresse `github.io/CMCteams/messaging-app/`. L'app déclare depuis v1.1.287
    // son domaine canonique `apex-chat.kd-mc.com` (cf. `services/kdmc-router/
    // worker.js` et le finding CORS de `audit/apex-chat/03-FINDINGS.md`).
    // Le test échouait donc alors que **l'app avait raison** : un canonical qui
    // pointe sur l'URL de l'hébergeur au lieu du domaine propre disperse le
    // référencement entre deux adresses pour une seule et même page.
    // Corrigé le 2026-09-10 : on encode la règle voulue, on ne rétrograde pas
    // l'app pour faire verdir un test périmé.
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical, 'canonical doit être une URL absolue https').toMatch(/^https:\/\//);
    expect(canonical, 'canonical doit pointer sur le domaine propre apex-chat.kd-mc.com')
      .toContain('apex-chat.kd-mc.com');
    // robots indexable
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toMatch(/index/);
    // Open Graph
    const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
    expect(ogType).toBeTruthy();
    const ogLocale = await page.locator('meta[property="og:locale"]').getAttribute('content');
    expect(ogLocale).toBe('fr_FR');
    // Twitter Card
    const twCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twCard).toBe('summary_large_image');
    // JSON-LD WebApplication
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    const json = JSON.parse(ld);
    expect(json['@type']).toBe('WebApplication');
    expect(json.name).toBe('Apex Chat');
  });

  test('robots.txt, sitemap.xml, manifest.json accessibles', async ({ request, baseURL }) => {
    const robots = await request.get(baseURL + 'robots.txt');
    expect(robots.status()).toBe(200);
    const robotsText = await robots.text();
    expect(robotsText).toContain('Sitemap:');

    const sitemap = await request.get(baseURL + 'sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const sitemapText = await sitemap.text();
    expect(sitemapText).toContain('<urlset');
    expect(sitemapText).toContain('lastmod');

    const manifest = await request.get(baseURL + 'manifest.json');
    expect(manifest.status()).toBe(200);
    const m = await manifest.json();
    expect(m.name).toMatch(/Apex Chat/i);
    expect(m.display).toBe('standalone');
  });

  test('cgu.html et privacy.html ont SEO complet', async ({ page, baseURL }) => {
    for (const path of ['cgu.html', 'privacy.html']) {
      const r = await page.goto(baseURL + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      expect(r.status(), `${path} doit retourner 200`).toBe(200);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical, `${path} canonical manquant`).toContain(path);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc, `${path} description vide`).toBeTruthy();
      expect(desc.length).toBeGreaterThan(50);
    }
  });

  test('Service Worker supporté + pas d\'erreur d\'enregistrement', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    // v1.1.199 — WebKit sur CI Linux n'enregistre pas toujours le SW dans le
    // temps imparti (≠ vrai iOS Safari). On exige seulement : API supportée +
    // AUCUNE erreur d'enregistrement. 'none'/'pending'/'active' tous acceptés ;
    // seul un 'error:*' (vraie exception SW) échoue.
    let swState = 'none';
    for (let i = 0; i < 8; i++) {
      swState = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 'unsupported';
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          return reg ? (reg.active ? 'active' : 'pending') : 'none';
        } catch (e) { return 'error:' + e.message; }
      });
      if (swState === 'active' || swState === 'pending') break;
      await page.waitForTimeout(1000);
    }
    expect(swState, `SW state inattendu: ${swState}`).not.toMatch(/^error:|unsupported/);
  });

  test('aucune erreur JS NON gérée au boot (pageerror)', async ({ page }) => {
    // v1.1.199 — on ne fail QUE sur les exceptions NON capturées (pageerror).
    // Les console.error (CSP, SSE Firebase, fetch API offline, WebKit verbeux)
    // sont du bruit non bloquant → ignorés.
    const fatal = [];
    page.on('pageerror', e => {
      const m = e.message || String(e);
      if (!/CSP|Content Security|favicon|workers\.dev|Failed to fetch|NetworkError|Load failed/i.test(m)) fatal.push(m);
    });
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    if (fatal.length) console.log('Exceptions JS non gérées :', fatal);
    expect(fatal, 'exception JS non gérée : ' + JSON.stringify(fatal).slice(0, 180)).toHaveLength(0);
  });

  test('Worker API /api/admin/force-update-ts répond JSON public', async ({ request }) => {
    const url = 'https://apex-chat-api.9r4rxssx64.workers.dev/api/admin/force-update-ts';
    const r = await request.get(url);
    expect(r.status(), `force-update-ts HTTP status`).toBe(200);
    const data = await r.json();
    expect(data.ok).toBe(true);
    expect(typeof data.ts).toBe('number');
  });

  test('Worker API /api/auth/check-phone refuse phone invalide proprement', async ({ request }) => {
    const url = 'https://apex-chat-api.9r4rxssx64.workers.dev/api/auth/check-phone';
    const r = await request.post(url, { data: { phone: 'abc' } });
    expect([400, 422]).toContain(r.status());
    const data = await r.json();
    expect(data.message || data.error).toBeTruthy();
  });

});
