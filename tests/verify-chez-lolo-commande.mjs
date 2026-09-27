/* PREUVE EN VRAI NAVIGATEUR — Chez Lolo : pas de commande sans fiche (Kevin 27.09.2026 :
 * « renseignements obligatoires partout pour les nouveaux » ; boutiques = « à la commande »).
 *
 * Mesuré avant : on ouvrait PayPal / Revolut / le virement SANS rien donner (ni nom, ni e-mail, ni
 * CGV acceptées), et la commande d'impression partait chez Printify SANS adresse (cl_checkout
 * n'était jamais rempli par Chez Lolo).
 *
 * Écran d'iPhone (390×844), page servie depuis le dépôt, réseau extérieur coupé, EmailJS simulé
 * (on lit ce qui serait envoyé à Kevin). Prouve : (1) sans fiche, le paiement ne s'ouvre pas et
 * l'écran dit quoi remplir ; (2) CGV non cochées → toujours bloqué ; (3) fiche complète → la
 * commande part, l'e-mail à Kevin porte le nom, l'e-mail et l'adresse du client, et l'adresse est
 * rangée pour la commande d'impression ; (4) les champs se touchent au doigt (≥ 44 px).
 * node tests/verify-chez-lolo-commande.mjs */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(ROOT + '/package.json')('playwright');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const URL = 'http://localhost:' + server.address().port + '/shops/chez-lolo/';

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const demandees = [];
  await ctx.route(/^https?:\/\//, (r) => { const u = r.request().url(); if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return r.continue(); demandees.push(u); return r.abort(); });
  /* EmailJS simulé + fenêtres ouvertes comptées (PayPal/Revolut) */
  await ctx.addInitScript(() => {
    window.__envois = []; window.__ouverts = [];
    window.emailjs = { init() {}, send(s, t, p) { window.__envois.push(p); return Promise.resolve({ status: 200 }); } };
    const o = window.open; window.open = function (u) { window.__ouverts.push(String(u)); return null; };
    try { localStorage.setItem('kdmc_cookie_ok', '1'); } catch (_) {}
  });
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e.message || e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof addCart === 'function' && Array.isArray(P), null, { timeout: 8000 });
  /* Le catalogue est vide dans le dépôt (Lolo ajoute ses produits en ligne) : on pose UN article de test. */
  await page.evaluate(() => { P.push({ id: 'test-tshirt', name: 'T-shirt de test', price: 25, img: '', stock: 5, cat: 'textile' }); addCart('test-tshirt'); });
  const total = await page.evaluate(() => S.cart.reduce((s, i) => s + i.price * i.qty, 0));
  ok(total > 0, 'un article est dans le panier (' + total + ' €)');
  await page.evaluate((t) => showPayment(t), total);
  await page.waitForSelector('#coFiche', { timeout: 4000 });

  console.log('— 1. Sans fiche : le paiement ne s\'ouvre pas —');
  const lienPayPal = page.locator('#payModal a[href*="paypal.me"]');
  await lienPayPal.click({ modifiers: [] }).catch(() => {});
  await page.waitForTimeout(300);
  const e1 = await page.evaluate(() => ({ err: document.getElementById('coErr').textContent, commandes: JSON.parse(localStorage.getItem('kdmc_orders_' + STORE_ID) || '[]').length }));
  const pagesApres1 = ctx.pages().length;
  ok(/prénom/i.test(e1.err), 'l\'écran dit quoi remplir  [« ' + e1.err + ' »]');
  ok(e1.commandes === 0, 'aucune commande enregistrée sans fiche');
  ok(pagesApres1 === 1 && !demandees.some((u) => /paypal\.me/.test(u)), 'PayPal ne s\'est PAS ouvert (aucun nouvel onglet)');
  await page.locator('#payModal [onclick*="showIBAN"]').click();
  ok(!(await page.locator('#ibanBox').count()), 'le virement ne montre pas le RIB sans fiche');

  console.log('— 2. Fiche remplie mais CGV NON cochées : toujours bloqué —');
  await page.fill('#coPrenom', 'Marie'); await page.fill('#coNom', 'Rossi'); await page.fill('#coEmail', 'marie.rossi@exemple.fr');
  await page.fill('#coAddr', '12 boulevard des Moulins'); await page.fill('#coZip', '98000'); await page.fill('#coCity', 'Monaco');
  await lienPayPal.click().catch(() => {}); await page.waitForTimeout(300);
  const e2 = await page.evaluate(() => ({ err: document.getElementById('coErr').textContent, commandes: JSON.parse(localStorage.getItem('kdmc_orders_' + STORE_ID) || '[]').length }));
  ok(/conditions générales de vente/.test(e2.err) && e2.commandes === 0 && ctx.pages().length === 1, 'sans les CGV acceptées → bloqué, et c\'est dit  [« ' + e2.err + ' »]');

  console.log('— 3. Fiche complète + CGV : la commande part, avec l\'identité du client —');
  await page.check('#coCgv');
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), lienPayPal.click()]);
  await page.waitForTimeout(400);
  const pp = demandees.find((u) => /paypal\.me\/kdmc\//.test(u)) || '';
  ok(!!popup && /paypal\.me\/kdmc\/25\.00/.test(pp), 'PayPal s\'ouvre dans un nouvel onglet, avec le bon montant  [' + pp + ']');
  const e3 = await page.evaluate(() => ({ commandes: JSON.parse(localStorage.getItem('kdmc_orders_' + STORE_ID) || '[]'), envois: window.__envois, ck: JSON.parse(localStorage.getItem('cl_checkout') || 'null') }));
  ok(e3.commandes.length === 1, 'la commande est enregistrée (1)');
  const mail = e3.envois.find((x) => x && x.order_id);
  ok(!!mail && mail.from_name === 'Marie Rossi' && mail.from_email === 'marie.rossi@exemple.fr' && /12 boulevard des Moulins/.test(mail.client || '') && /98000 Monaco/.test(mail.client || ''),
    'l\'e-mail de commande à Kevin porte le nom, l\'e-mail et l\'adresse du client');
  ok(/CGV acceptées : 20\d\d-/.test((mail && mail.client) || ''), 'et la date d\'acceptation des CGV (preuve)');
  ok(e3.ck && e3.ck.name === 'Marie Rossi' && e3.ck.addr && e3.ck.zip === '98000' && e3.ck.city === 'Monaco', 'l\'adresse est rangée pour la commande d\'impression (Printify)');

  console.log('— 4. Au doigt —');
  await page.evaluate((t) => { closePayModal(); addCart('test-tshirt'); showPayment(t); }, total);
  await page.waitForSelector('#coFiche');
  const tailles = await page.evaluate(() => ['coPrenom', 'coNom', 'coEmail', 'coAddr', 'coZip', 'coCity'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().height)));
  ok(tailles.every((h) => h >= 44), 'chaque champ fait au moins 44 px de haut  [' + tailles.join(', ') + ']');
  const pre = await page.evaluate(() => document.getElementById('coNom').value);
  ok(pre === 'Rossi', 'une 2ᵉ commande retrouve la fiche déjà remplie (rien à retaper)');
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 390, 'rien ne déborde sur la largeur de l\'iPhone (' + larg + ' px)');
  ok(erreurs.length === 0, 'aucune erreur JavaScript  [' + erreurs.slice(0, 2).join(' | ') + ']');
} catch (e) {
  fails.push('exception : ' + String(e && e.message || e).slice(0, 300)); console.log('  ❌ exception : ' + String(e && e.message || e).slice(0, 300));
} finally { await browser.close(); server.close(); }
console.log(`\n=== Chez Lolo, commande : ${pass} contrôles OK, ${fails.length} échec(s) ===`);
process.exit(fails.length ? 1 : 0);
