/* PREUVE EN VRAI NAVIGATEUR — Kit IA : pas de paiement sans fiche (Kevin 27.09.2026, boutiques =
 * « renseignements obligatoires à la commande »). Avant : e-mail seul, aucune acceptation des
 * conditions de vente. Écran d'iPhone, page servie depuis le dépôt, serveur de vente SIMULÉ (on lit
 * ce qui lui est envoyé). Prouve : champs prénom/nom/CGV présents et touchables (≥ 44 px) ; sans
 * prénom, sans nom, sans CGV → rien n'est envoyé et l'écran le dit ; fiche complète → le serveur
 * reçoit prénom, nom et cgv:true, sur les deux chemins (commande PayPal puis panier).
 * node tests/verify-kit-fiche-commande.mjs */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(ROOT + '/package.json')('playwright');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const URL = 'http://localhost:' + server.address().port + '/shops/kit-ia/';
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const recus = [];
  await ctx.route(/^https?:\/\//, async (r) => {
    const u = r.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return r.continue();
    if (/kdmc-vente/.test(u)) {
      const chemin = new globalThis.URL(u).pathname; let corps = null; try { corps = JSON.parse(r.request().postData() || 'null'); } catch (_) {}
      if (corps) recus.push({ chemin, corps });
      if (chemin === '/caisse/commande') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'caisse_absente' }) });
      if (chemin === '/caisse/intention') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ref: 'KX7T', moyen: 'paypal', lien: 'https://paypal.me/kdmc/47EUR' }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    return r.abort();
  });
  await ctx.addInitScript(() => { window.open = function () { return null; }; });
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e.message || e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-caisse-prenom]', { timeout: 5000 });
  const bloc = page.locator('.encart, .carte').filter({ has: page.locator('#payer-paypal') }).first();
  const h = await bloc.evaluate((b) => ['[data-caisse-prenom]', '[data-caisse-nom]', '[data-caisse-email]'].map((q) => Math.round(b.querySelector(q).getBoundingClientRect().height)));
  ok(h.every((x) => x >= 44), 'prénom, nom et e-mail sont là, au doigt (' + h.join(', ') + ' px)');
  const cgv = await bloc.evaluate((b) => { const c = b.querySelector('[data-caisse-cgv]'); const a = c && c.closest('label').querySelector('a'); return { c: !!c, lien: a ? a.getAttribute('href') : '' }; });
  ok(cgv.c && cgv.lien === 'cgv.html', 'une case « J\'accepte les conditions de vente » avec le lien vers les CGV');
  const avis = () => bloc.evaluate((b) => (b.querySelector('[data-caisse-avis]') || {}).textContent || '');

  await page.fill('#mail-kit', 'marie.rossi@exemple.fr');
  await bloc.locator('[data-caisse-consentement]').check();
  await page.click('#payer-paypal'); await page.waitForTimeout(300);
  ok(recus.length === 0 && /prénom/.test(await avis()), 'sans prénom → rien n\'est envoyé, et c\'est dit  [« ' + await avis() + ' »]');
  await bloc.locator('[data-caisse-prenom]').fill('Marie');
  await page.click('#payer-paypal'); await page.waitForTimeout(300);
  ok(recus.length === 0 && /nom de famille/.test(await avis()), 'sans nom → rien n\'est envoyé');
  await bloc.locator('[data-caisse-nom]').fill('Rossi');
  await page.click('#payer-paypal'); await page.waitForTimeout(300);
  ok(recus.length === 0 && /conditions de vente/.test(await avis()), 'sans les conditions de vente → rien n\'est envoyé  [« ' + await avis() + ' »]');
  await bloc.locator('[data-caisse-cgv]').check();
  await page.click('#payer-paypal'); await page.waitForTimeout(800);
  const cmd = recus.find((x) => x.chemin === '/caisse/commande'), pan = recus.find((x) => x.chemin === '/caisse/intention');
  ok(cmd && cmd.corps.prenom === 'Marie' && cmd.corps.nom === 'Rossi' && cmd.corps.cgv === true, 'fiche complète → la commande PayPal part avec prénom, nom et CGV acceptées');
  ok(pan && pan.corps.prenom === 'Marie' && pan.corps.nom === 'Rossi' && pan.corps.cgv === true && pan.corps.consentement === true, 'et le panier aussi (avec le consentement de rétractation)');
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 390, 'rien ne déborde sur l\'iPhone (' + larg + ' px)');
  ok(erreurs.length === 0, 'aucune erreur JavaScript  [' + erreurs.slice(0, 2).join(' | ') + ']');
} catch (e) {
  fails.push('exception : ' + String(e && e.message || e).slice(0, 300)); console.log('  ❌ exception : ' + String(e && e.message || e).slice(0, 300));
} finally { await browser.close(); server.close(); }
console.log(`\n=== Kit IA, fiche de commande : ${pass} contrôles OK, ${fails.length} échec(s) ===`);
process.exit(fails.length ? 1 : 0);
