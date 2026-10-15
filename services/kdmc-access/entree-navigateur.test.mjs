/* admin.kd-mc.com — l'ENTRÉE en VRAI navigateur, comme l'iPhone de Kevin (15.10.2026).
 *
 * Kevin ouvre l'admin « depuis l'écran d'accueil (app installée), le domaine, et des fois Safari ». Une app installée a ses
 * cookies À PART de Safari (leçons 98, 343) : un test qui n'efface que les cookies n'est pas un iPhone. Chaque scénario part
 * donc d'un CONTEXTE NEUF (aucun cookie, aucun stockage) + service workers bloqués, et seul le pass rangé dans le stockage
 * de l'app (localStorage.kdmc_sso_token) — ou le lien #kdmc_sso= — peut ouvrir la page.
 *
 * Le VRAI worker (worker.js) répond à Chromium (route interceptée → worker.fetch) ; le domaine (kd-mc.com/__sso/whoami) est
 * simulé dans Node (le worker l'appelle avec fetch). Toute réponse d'admin.kd-mc.com est gardée pour vérifier qu'AUCUN
 * morceau de la page ne part sans compte. Dernier test : SABOTAGE (vérification retirée de /page) → ce test doit voir la fuite.
 *
 * node --test services/kdmc-access/entree-navigateur.test.mjs */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import vrai from './worker.js';
import { PAGE_HTML } from './page.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ORIGINE = 'https://admin.kd-mc.com';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/* Le domaine simulé : un pass → qui c'est. « pass-revoque » : le domaine dit révoqué. */
const SESSIONS = {
  'pass-kevin': { ok: true, uid: 'kdmc_admin', name: 'Kevin Desarzens', admin: true, verified: true },
  'pass-marie': { ok: true, uid: 'marie-dupont', name: 'Marie Dupont', admin: false, verified: true },
};
const appelsDomaine = [];
const fetchNode = globalThis.fetch;
before(() => {
  globalThis.fetch = async (u, o) => {
    if (String(u).includes('/__sso/whoami')) {
      const h = (o && o.headers && (o.headers.authorization || o.headers.Authorization)) || '';
      const t = String(h).replace(/^Bearer\s+/i, '');
      appelsDomaine.push(t);
      if (t === 'pass-revoque') return new Response(JSON.stringify({ ok: false, reason: 'session_revoquee' }));
      return new Response(JSON.stringify(SESSIONS[t] || { ok: false }));
    }
    return new Response('{}');
  };
});
after(() => { globalThis.fetch = fetchNode; });

let nav;
/* Proxy mort : une requête qui échapperait aux routes (mesuré : Playwright ne route pas la suite d'une redirection 302)
   n'atteint JAMAIS le vrai admin.kd-mc.com — elle échoue, au lieu de « réussir » avec la page de production. */
before(async () => { nav = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9' }, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) }); });
after(async () => { if (nav) await nav.close(); });

/* Morceaux qui n'existent que dans la page : aucun ne doit apparaître sans compte. */
const MORCEAUX = ['Qui se connecte', 'x-apex-pin', '/history', 'type="password"', 'kdmc_access_bots'];
const fuite = (txt) => MORCEAUX.filter((m) => String(txt).includes(m))
  .concat(String(txt).includes(PAGE_HTML.slice(3000, 3200)) ? ['code de la page'] : []);

/* Un « iPhone, app installée » : contexte neuf, SW bloqués ; le worker (vrai ou saboté) répond via la route. */
async function iphone({ worker = vrai, env = {}, pass = '', cookie = '' } = {}) {
  const ctx = await nav.newContext({ serviceWorkers: 'block', userAgent: UA_IPHONE, viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const reponses = []; const requetesPage = [];
  await ctx.route(ORIGINE + '/**', async (route) => {
    const rq = route.request();
    const u = new URL(rq.url());
    if (u.pathname === '/__vide') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>vide</title>' });
    const headers = Object.fromEntries(Object.entries(await rq.allHeaders()).filter(([k]) => !k.startsWith(':')));
    if (u.pathname === '/page') requetesPage.push(headers);
    const r = await worker.fetch(new Request(rq.url(), { method: rq.method(), headers }), env);
    const body = Buffer.from(await r.arrayBuffer());
    reponses.push({ url: rq.url(), status: r.status, porte: r.headers.get('x-kdmc-porte'), body: body.toString('utf8') });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body });
  });
  /* tout le reste (kd-mc.com, CDN…) : jamais le vrai réseau */
  await ctx.route((url) => !String(url).startsWith(ORIGINE), (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }));
  if (cookie) await ctx.addCookies([{ name: 'kdmc_sso', value: cookie, domain: '.kd-mc.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  if (pass) {
    await page.goto(ORIGINE + '/__vide');
    await page.evaluate((p) => localStorage.setItem('kdmc_sso_token', p), pass);
  }
  return { ctx, page, reponses, requetesPage };
}
const pageOuverte = (page) => page.waitForFunction(() => /Qui se connecte/.test(document.title), null, { timeout: 8000 });
const porteVisible = (page) => page.waitForFunction(() => { const p = document.getElementById('p'); return p && !p.hidden && getComputedStyle(p).display !== 'none'; }, null, { timeout: 8000 });
const lsPass = (page) => page.evaluate(() => localStorage.getItem('kdmc_sso_token'));

test('iPhone, app installée : aucun cookie, pass rangé dans l\'app → la page s\'ouvre (Bearer, sans cookie)', async () => {
  const { ctx, page, reponses, requetesPage } = await iphone({ pass: 'pass-kevin' });
  try {
    await page.goto(ORIGINE + '/');
    await pageOuverte(page);
    const nav0 = reponses.find((r) => new URL(r.url).pathname === '/');
    assert.equal(nav0.status, 401); assert.equal(nav0.porte, 'entree', 'la navigation reçoit l\'entrée');
    assert.deepEqual(fuite(nav0.body), [], 'l\'entrée ne contient rien de la page');
    assert.equal(requetesPage.length, 1, 'un seul appel /page');
    assert.equal(requetesPage[0].authorization, 'Bearer pass-kevin');
    assert.equal(requetesPage[0].cookie, undefined, 'aucun cookie (app installée)');
    assert.ok(await page.locator('body').innerText().then((t) => t.length > 20), 'la page a du contenu');
    assert.equal(await page.evaluate(() => document.getElementById('p')), null, 'la porte a disparu (document remplacé)');
    /* les scripts de la page écrite TOURNENT (CSP gardée après document.open) : elle lit son journal avec le pass rangé */
    for (let i = 0; i < 40 && !reponses.some((x) => new URL(x.url).pathname === '/history'); i++) await page.waitForTimeout(100);
    assert.ok(reponses.some((x) => new URL(x.url).pathname === '/history'), 'la page écrite a appelé /history (son script a tourné)');
  } finally { await ctx.close(); }
});

test('iPhone neuf SANS pass → la porte ; aucun morceau de la page dans le DOM ni dans le réseau', async () => {
  const { ctx, page, reponses } = await iphone();
  try {
    await page.goto(ORIGINE + '/');
    await porteVisible(page);
    const html = await page.content();
    assert.match(html, /Cette page est réservée/);
    assert.deepEqual(fuite(html), [], 'DOM sans la page');
    const lien = await page.locator('#p a').getAttribute('href');
    assert.equal(lien, 'https://kd-mc.com/?return=' + encodeURIComponent(ORIGINE + '/'));
    const box = await page.locator('#p a').boundingBox();
    assert.ok(box.height >= 44, 'bouton ≥ 44 px (' + box.height + ')');
    assert.ok(box.width <= 390, 'tient dans 390 px');
    for (const r of reponses) assert.deepEqual(fuite(r.body), [], 'réseau : ' + r.url + ' (' + r.status + ') sans morceau de la page');
    assert.equal(reponses.find((r) => r.url.endsWith('/page')).status, 401);
  } finally { await ctx.close(); }
});

test('arrivée avec #kdmc_sso= (lien du portail) : pass rangé, adresse nettoyée, page ouverte', async () => {
  const { ctx, page } = await iphone();
  try {
    await page.goto(ORIGINE + '/#kdmc_sso=pass-kevin');
    await pageOuverte(page);
    assert.equal(await lsPass(page), 'pass-kevin', 'pass rangé dans le stockage de l\'app');
    assert.equal(new URL(page.url()).hash, '', 'adresse nettoyée (plus de pass visible)');
  } finally { await ctx.close(); }
});

test('un pass DÉJÀ rangé n\'est pas écrasé par celui d\'un lien (lien piégé)', async () => {
  const { ctx, page, requetesPage } = await iphone({ pass: 'pass-marie' });
  try {
    await page.goto(ORIGINE + '/#kdmc_sso=pass-kevin');
    await pageOuverte(page);
    assert.equal(await lsPass(page), 'pass-marie', 'le pass rangé reste');
    assert.equal(requetesPage.length, 1);
    assert.equal(requetesPage[0].authorization, 'Bearer pass-marie', 'la page s\'ouvre avec le pass rangé');
    assert.equal(new URL(page.url()).hash, '', 'le pass du lien est quand même retiré de l\'adresse');
  } finally { await ctx.close(); }
});

test('pass rangé MAIS refusé + lien avec un pass valide → un essai avec le lien, rangé seulement s\'il est accepté', async () => {
  const { ctx, page, requetesPage } = await iphone({ pass: 'pass-mort' });
  try {
    await page.goto(ORIGINE + '/#kdmc_sso=pass-kevin');
    await pageOuverte(page);
    assert.deepEqual(requetesPage.map((h) => h.authorization), ['Bearer pass-mort', 'Bearer pass-kevin']);
    assert.equal(await lsPass(page), 'pass-kevin', 'le pass accepté remplace le pass mort');
  } finally { await ctx.close(); }
  const b = await iphone({ pass: 'pass-mort' });
  try {
    await b.page.goto(ORIGINE + '/#kdmc_sso=pass-faux');
    await porteVisible(b.page);
    assert.equal(await lsPass(b.page), 'pass-mort', 'un pass de lien refusé n\'est pas rangé');
  } finally { await b.ctx.close(); }
});

test('session révoquée (pass rangé, le domaine dit révoqué) → la porte', async () => {
  const { ctx, page, reponses } = await iphone({ pass: 'pass-revoque' });
  try {
    await page.goto(ORIGINE + '/');
    await porteVisible(page);
    assert.deepEqual(fuite(await page.content()), []);
    for (const r of reponses) assert.deepEqual(fuite(r.body), [], r.url);
  } finally { await ctx.close(); }
});

test('Safari avec le cookie du domaine → la page DIRECTEMENT (chemin rapide, aucun appel /page)', async () => {
  const { ctx, page, reponses, requetesPage } = await iphone({ cookie: 'pass-kevin' });
  try {
    const r = await page.goto(ORIGINE + '/');
    assert.equal(r.status(), 200);
    await pageOuverte(page);
    assert.equal(reponses[0].porte, null);
    assert.equal(requetesPage.length, 0);
  } finally { await ctx.close(); }
});

test('tuile du portail : /__sso/entrer?h=<enveloppe> → #kdmc_sso= → page ouverte, pass rangé, adresse propre', async () => {
  const { ctx, page } = await iphone();
  try {
    /* Playwright ne route pas la suite d'une redirection : on suit le 302 du vrai worker à la main, en deux temps. */
    const env_ = Buffer.from(JSON.stringify({ t: 'pass-kevin', g: '', exp: Date.now() + 90000 })).toString('base64url') + '.sig';
    const r = await vrai.fetch(new Request(ORIGINE + '/__sso/entrer?to=%2F&h=' + encodeURIComponent(env_)), {});
    assert.equal(r.status, 302);
    const loc = r.headers.get('location');
    assert.equal(loc, '/#kdmc_sso=pass-kevin');
    await page.goto(ORIGINE + loc);
    await pageOuverte(page);
    assert.equal(await lsPass(page), 'pass-kevin');
    assert.equal(page.url(), ORIGINE + '/', 'adresse propre');
  } finally { await ctx.close(); }
});

test('interrupteur ACCES_PAGE_COMPTE="0" → ancien comportement : page servie à tous, sans demander au domaine', async () => {
  const avant = appelsDomaine.length;
  const { ctx, page } = await iphone({ env: { ACCES_PAGE_COMPTE: '0' } });
  try {
    const r = await page.goto(ORIGINE + '/');
    assert.equal(r.status(), 200);
    await pageOuverte(page);
    assert.equal(appelsDomaine.length, avant);
  } finally { await ctx.close(); }
});

/* SABOTAGE : la même vérification que le scénario « sans pass », contre un worker dont /page ne demande plus rien au
   domaine. Si ce test ne voyait PAS la fuite, il ne protégerait rien. */
test('SABOTAGE : /page sans vérification → la fuite est détectée (le test est discriminant)', async () => {
  const src = readFileSync(join(ICI, 'worker.js'), 'utf8');
  const cible = "if (accesPageCompteActif(env) && !(await sessionDomaine(request, env))) return refus('compte_requis');";
  assert.ok(src.includes(cible), 'la vérification de /page est introuvable dans worker.js');
  const dir = mkdtempSync(join(tmpdir(), 'kdmc-access-sabotage-'));
  writeFileSync(join(dir, 'worker.js'), src.replace(cible, '/* sabotage */'));
  copyFileSync(join(ICI, 'page.js'), join(dir, 'page.js'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const sabote = (await import(pathToFileURL(join(dir, 'worker.js')).href)).default;
  const { ctx, page, reponses } = await iphone({ worker: sabote });
  try {
    await page.goto(ORIGINE + '/');
    await pageOuverte(page);   /* sans vérification, la page s'ouvre à un inconnu… */
    const fuites = reponses.flatMap((r) => fuite(r.body));
    assert.ok(fuites.length > 0, '… et le contrôle réseau la VOIT (' + fuites.join(', ') + ')');
  } finally { await ctx.close(); }
});
