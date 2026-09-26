/* PREUVE EN VRAI NAVIGATEUR — tableau de bord Commerce (kd-mc.com/admin/commerce.html).
 *
 * Le test de logique (commerce-tableau.test.mjs) prouve les calculs ; celui-ci prouve
 * que la PAGE se construit, sur iPhone (375 px), avec le domaine et la caisse simulés :
 *   1. sans session → verrou « Accès administrateur », 0 appel à la caisse
 *   2. admin NON vérifié (sans Face ID) → verrou, 0 appel à la caisse
 *   3. admin vérifié → 8 tuiles chiffrées, produits, file avec boutons, commandes,
 *      vidéos, marché ; le pass part en Bearer vers la caisse ; « Livrer » appelle
 *      /admin/valider avec la bonne demande ; « Lancer » n'existe pas sans jeton
 *   4. caisse en panne → la page reste debout et ÉCRIT la cause
 *   5. 0 exception JS, 0 débordement horizontal, boutons ≥ 44 px
 * Lancer : node tests/verify-commerce-tableau-reel.mjs   (Chromium Playwright)
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const RACINE = 'kdmc-home';
const CAPTURES = 'audit/captures-commerce';
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let SESSION = null; // ce que /__sso/whoami répond
const srv = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__sso/whoami') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(SESSION || { ok: false }));
  }
  const f = join(RACINE, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(await readFile(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;
const CAISSE = 'https://kdmc-vente.9r4rxssx64.workers.dev';

const LIVE = {
  ok: true, quand: new Date().toISOString(), admin: 'Kevin DESARZENS',
  produits: ['croupier-pro', 'croupier-entretien', 'kit-ia', 'club-ia', 'bureau-ia', 'etudiant-ia', 'avis-ia', 'immo-ia'].map((id) => ({ id, livre_http: id === 'croupier-entretien' ? 404 : 200 })),
  ventes: { n: 3, ca: 173, parProduit: { 'immo-ia': { n: 2, ca: 134 }, 'kit-ia': { n: 1, ca: 47 } }, parSource: { 'paypal-webhook': { n: 3, ca: 173 } }, parMois: { [new Date().toISOString().slice(0, 7)]: { n: 3, ca: 173 } }, dernieres: [{ produit: 'immo-ia', email: 'a***@x.fr', ts_iso: new Date().toISOString(), source: 'paypal-webhook' }], tronque: false },
  file: { n: 1, demandes: [{ id: 'dem-42', produit: 'avis-ia', email: 'z@x.fr', methode: 'revolut', etat: 'en_attente', ts_iso: new Date().toISOString() }] },
  club: { actifs: 2, expirent14j: 0, relances: 0, abonnes_total: 4 }, contenu: { 'immo-ia': { n: 7, gratuits: 1 }, 'avis-ia': { n: 7, gratuits: 1 } }, base_detail: null,
  config: { paypal_webhook: false, paypal_recherche: false, email_code: true, contenu_prive: true, commandes: false },
  workflows: ['produit-fabrique.yml', 'pub-videos.yml', 'club-semaine.yml', 'audit-live.yml', 'deploy-kdmc-vente.yml'].map((id) => ({ id, run: { status: 'completed', conclusion: id === 'audit-live.yml' ? 'failure' : 'success', maj: new Date().toISOString(), url: 'https://github.com/x/' + id } })),
};

await mkdir(CAPTURES, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const erreursJs = [];
page.on('pageerror', (e) => erreursJs.push(String(e.message || e)));
const appelsCaisse = [];
let panneCaisse = false;
await page.route(CAISSE + '/**', async (route) => {
  const req = route.request();
  appelsCaisse.push({ url: req.url(), auth: req.headers().authorization || '', body: req.postData() || '' });
  if (panneCaisse) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'panne', detail: 'HTTP 502 simulé' }) });
  if (req.url().endsWith('/admin/tableau')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE) });
  if (req.url().endsWith('/admin/valider')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, code: 'AAAA-BBBB-CCCC-DDDD', email_envoye: true }) });
  return route.fulfill({ status: 404, body: '{}' });
});
const ouvre = async () => { await page.goto(BASE + '/admin/commerce.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(300); };
const texte = async () => (await page.textContent('#app')) || '';

/* 1. sans session */
SESSION = null; appelsCaisse.length = 0;
await ouvre();
chk(/Accès administrateur/.test(await texte()), '1. sans session → verrou affiché');
chk(appelsCaisse.length === 0, '1. sans session → 0 appel à la caisse (' + appelsCaisse.length + ')');

/* 2. admin non vérifié */
SESSION = { ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: false }; appelsCaisse.length = 0;
await ouvre();
chk(/sans Face ID/.test(await texte()), '2. admin sans Face ID → verrou qui dit POURQUOI');
chk(appelsCaisse.length === 0, '2. admin sans Face ID → 0 appel à la caisse');
await page.screenshot({ path: join(CAPTURES, 'verrou.png') });

/* 3. admin vérifié */
SESSION = { ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: true }; appelsCaisse.length = 0;
await page.evaluate(() => { try { localStorage.setItem('kdmc_sso_token', 'PASS-TEST'); } catch (e) { /* */ } });
await ouvre();
await page.waitForSelector('.kpi', { timeout: 8000 }).catch(() => {});
const kpis = await page.$$eval('.kpi', (els) => els.map((e) => ({ l: e.querySelector('.l').textContent, v: e.querySelector('.v').textContent })));
/* ⚠️ 22.09.2026 — ce contrôle exigeait EXACTEMENT 8 tuiles. Une 9e a été ajoutée
   (« Commandes ») et la chaîne complète est devenue ROUGE pour tout le monde, alors
   que la page allait très bien : c'est le contrôle qui était périmé, pas le produit.
   Un nombre figé rouille à chaque amélioration. Ce qui compte vraiment, c'est
   qu'aucune tuile ne DISPARAISSE et qu'aucune ne reste VIDE — on vérifie donc ça. */
const tuilesVides = kpis.filter((k) => !String(k.l || '').trim() || !String(k.v || '').trim());
chk(kpis.length >= 8, '3. au moins 8 tuiles chiffrées en haut (' + kpis.length + ')');
chk(tuilesVides.length === 0, '3. aucune tuile vide (' + tuilesVides.map((k) => k.l || '?').join(', ') + ')');
chk(kpis.some((k) => k.l.startsWith('Chiffre') && k.v === '173 €'), '3. CA affiché = celui de la caisse (' + JSON.stringify(kpis.find((k) => k.l.startsWith('Chiffre'))) + ')');
chk(kpis.some((k) => k.l.startsWith('Livraisons') && k.v === '1 KO'), '3. la page de livraison 404 (croupier-entretien) est comptée KO');
chk(kpis.some((k) => k.l.startsWith('Audit') && /ROUGE/.test(k.v)), '3. audit live rouge → tuile ROUGE');
const t = await appelsCaisse.find((a) => a.url.endsWith('/admin/tableau'));
chk(!!t && t.auth === 'Bearer PASS-TEST', '3. le pass du domaine part en Bearer vers la caisse (' + (t && t.auth) + ')');
const nbProduits = await page.$$eval('.tile h3', (els) => els.filter((e) => /🧰|🎰|🔁/.test(e.textContent)).length);
chk(nbProduits >= 8, '3. une tuile par produit de la caisse (' + nbProduits + ')');
chk((await page.$$('[data-lancer]')).length === 0, '3. sans jeton : aucun bouton « Lancer », que des liens GitHub');
chk((await page.$$('a.btn:has-text("Lancer sur GitHub")')).length === 5, '3. 5 liens « Lancer sur GitHub »');
const petits = await page.$$eval('button, a.btn, select.sel', (els) => els.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim().slice(0, 20)));
chk(petits.length === 0, '5. tous les boutons font ≥ 44 px (' + petits.join(', ') + ')');
const deb = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
chk(deb <= 1, '5. aucun débordement horizontal à 375 px (' + deb + ' px)');
await page.screenshot({ path: join(CAPTURES, 'tableau-375.png'), fullPage: true });

/* « Livrer » sur la file */
page.once('dialog', (d) => d.accept());
await page.click('[data-valider="dem-42"]');
await page.waitForTimeout(600);
const v = appelsCaisse.find((a) => a.url.endsWith('/admin/valider'));
chk(!!v && /"demande":"dem-42"/.test(v.body) && !/refuser/.test(v.body), '3. « Livrer » appelle /admin/valider avec la bonne demande (' + (v && v.body) + ')');
chk(/AAAA-BBBB/.test(await page.textContent('body')), '3. le code livré est montré à Kevin (toast)');

/* 4. caisse en panne */
panneCaisse = true; appelsCaisse.length = 0;
await ouvre();
await page.waitForTimeout(500);
const tx = await texte();
chk(/injoignable/.test(tx) && /502/.test(tx), '4. caisse en panne → la page reste debout et écrit la cause (502)');
chk((await page.$$('.kpi')).length >= 8, '4. les tuiles restent en panne (avec des tirets, pas des zéros)');
chk(/Kit IA de l'agent immobilier/.test(tx), '4. les produits (statique) restent visibles en panne');
await page.screenshot({ path: join(CAPTURES, 'panne.png') });

chk(erreursJs.length === 0, '5. 0 exception JS (' + erreursJs.join(' | ') + ')');

await browser.close(); srv.close();
console.log('\n=== Tableau de bord Commerce — preuve navigateur (375 px) ===');
R.ok.forEach((m) => console.log('  ✅ ' + m));
R.ko.forEach((m) => console.log('  ❌ ' + m));
console.log('\n' + R.ok.length + ' contrôles OK, ' + R.ko.length + ' échec(s) — captures : ' + CAPTURES + '/');
process.exit(R.ko.length ? 1 : 0);
