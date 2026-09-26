/* PREUVE — l'écran « Famille » de Créa Studio, branché sur le VRAI worker.
 * Le worker tourne ICI, en local, avec un stockage simulé : deux téléphones
 * (deux navigateurs) se parlent pour de bon. Aucun réseau externe (leçon #135).
 * On prouve ce que Kevin verra :
 *   1) sans code, on n'entre pas dans l'espace famille
 *   2) Marie rejoint, partage une création → PAUL LA VOIT sur son téléphone
 *    3) Paul récupère vraiment l'image (elle s'affiche, ce n'est pas une vignette vide)
 *   4) Paul réagit ❤️ → Marie voit la réaction
 *   5) Paul écrit un message → Marie le lit
 *   6) un cousin avec un AUTRE code ne voit RIEN (isolation entre familles)
 *   7) Kevin (admin) voit les DEUX familles
 *   8) service coupé = message clair à l'écran, pas une page morte
 * Lancer : node tests/verify-crea-famille-app.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import worker from '../services/kdmc-crea-famille/worker.js';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || '200807'; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname);
const PORT_APP = 8259, PORT_API = 8260;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// ── serveur de l'app ────────────────────────────────────────────────────────
const srvApp = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end('x'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise(r => srvApp.listen(PORT_APP, r));

// ── le VRAI worker, servi en local avec un stockage simulé ──────────────────
function fauxKV() {
  const m = new Map();
  return {
    async get(k, type) { if (!m.has(k)) return null; const v = m.get(k); return type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
  };
}
let ENV = { FAMILLE: fauxKV(), FAMILLE_SECRET: 'secret-test-app-0123456789' };
let coupe = false;

// SSO du domaine simulé (règle « ADMIN UNIVERSEL DU DOMAINE », leçons #99/#166) : l'admin
// famille vient du SSO central (kd-mc.com/__sso/whoami : admin ET session vérifiée Face ID),
// JAMAIS du nom. Le worker interroge whoami côté serveur (ici, ce process Node) → on le simule :
// seul le porteur du jeton SSO de Kevin est admin. Kevin le transmet via Authorization: Bearer.
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('/__sso/whoami')) {
    const hh = (opt && opt.headers) || {};
    const auth = hh.Authorization || hh.authorization || '';
    if (auth === 'Bearer jeton-sso-kevin-test')
      return new Response(JSON.stringify({ ok: true, uid: 'kdmc_admin', name: 'Kevin Desarzens', verified: true, admin: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }
  return vraiFetch(url, opt);
};
const srvApi = http.createServer(async (q, s) => {
  const chunks = []; for await (const c of q) chunks.push(c);
  const body = Buffer.concat(chunks);
  const req = new Request('http://x' + q.url, {
    method: q.method,
    headers: {
      'content-type': 'application/json', origin: 'http://127.0.0.1:' + PORT_APP,
      // On transmet le pass SSO du domaine (Authorization: Bearer) que le client envoie :
      // sinon le worker ne peut pas interroger le SSO central et personne n'est jamais admin.
      ...(q.headers.authorization ? { Authorization: q.headers.authorization } : {}),
      ...(q.headers.cookie ? { cookie: q.headers.cookie } : {}),
    },
    body: (q.method === 'GET' || q.method === 'HEAD') ? undefined : body,
  });
  if (coupe) { s.writeHead(503, { 'access-control-allow-origin': '*' }); return s.end('{"error":"service_coupe"}'); }
  const res = await worker.fetch(req, ENV);
  const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
  h['access-control-allow-origin'] = '*';
  s.writeHead(res.status, h);
  s.end(Buffer.from(await res.arrayBuffer()));
});
await new Promise(r => srvApi.listen(PORT_API, r));

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const browser = await chromium.launch();
const errs = [];

async function telephone(nom, code) {                 // un téléphone = un navigateur isolé
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(nom + ' PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(nom + ' CONSOLE: ' + m.text()); });
  await page.addInitScript((p) => { window.CREA_FAM_URL = 'http://127.0.0.1:' + p; }, PORT_API);
  await page.goto(`http://127.0.0.1:${PORT_APP}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  await page.fill('#gateName', nom); await page.fill('#gateCode', code || '1234');
  await page.click('#gateGo'); await page.waitForTimeout(250);
  await page.click('#bnav button[data-go="fam"]'); await page.waitForTimeout(200);
  return { ctx, page };
}
const rejoindre = async (page, famille, code) => {
  // déjà dans un cercle ? on ouvre le formulaire « autre cercle » (sans perdre l'actuel)
  const dedans = await page.evaluate(() => !document.getElementById('famCard').classList.contains('hidden'));
  if (dedans) { await page.click('#famPlus'); await page.waitForTimeout(250); }
  await page.fill('#famNom', famille); await page.fill('#famCode', code);
  await page.click('#famJoin'); await page.waitForTimeout(600);
};
const creer = (page, label) => page.evaluate(async (l) => {
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const g = c.getContext('2d'); g.fillStyle = '#e8b84b'; g.fillRect(0, 0, 40, 40);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  await window.Mine.save(b, l);
}, label);

// ── 1) sans code, on n'entre pas ────────────────────────────────────────────
const M = await telephone('Marie Dupont', '1234');
await rejoindre(M.page, 'Desarzens', '12');
let dedans = await M.page.evaluate(() => !document.getElementById('famCard').classList.contains('hidden'));
let hint = await M.page.textContent('#famHint');
chk(!dedans && /4 caractères/.test(hint || ''), `un code trop court est refusé — « ${(hint || '').slice(0, 46)} »`);

// ── 2) Marie rejoint et partage ─────────────────────────────────────────────
await rejoindre(M.page, 'Desarzens', 'noel2026');
dedans = await M.page.evaluate(() => !document.getElementById('famCard').classList.contains('hidden'));
chk(dedans, 'Marie entre dans l\'espace famille avec le bon code');
await creer(M.page, 'Photo de Marie');
await M.page.click('#famShare');
await M.page.waitForTimeout(900);

// ── 3) Paul, sur SON téléphone, voit la création de Marie ───────────────────
const P = await telephone('Paul Dupont', '5678');
await rejoindre(P.page, 'Desarzens', 'noel2026');
await P.page.waitForTimeout(800);
let n = await P.page.locator('#famFeed .fam-it').count();
chk(n === 1, `Paul voit la création de Marie sur SON téléphone (${n})`);
const auteur = await P.page.textContent('#famFeed .who').catch(() => '');
chk(/marie/i.test(auteur || ''), `et il voit QUI l'a partagée — « ${(auteur || '').trim()} »`);

// l'image se charge vraiment (pas une vignette cassée)
const imgOk = await P.page.evaluate(async () => {
  const im = document.querySelector('#famFeed .fam-it img');
  if (!im) return false;
  if (im.complete) return im.naturalWidth > 0;
  return await new Promise(r => { im.onload = () => r(im.naturalWidth > 0); im.onerror = () => r(false); setTimeout(() => r(im.naturalWidth > 0), 3000); });
});
chk(imgOk, 'la photo s\'affiche vraiment chez Paul (fichier réellement récupéré)');

// ── 4) Paul réagit ❤️, Marie le voit ────────────────────────────────────────
await P.page.click('#famFeed .fam-re button');
await P.page.waitForTimeout(700);
await M.page.click('#famRefresh'); await M.page.waitForTimeout(800);
const coeur = await M.page.textContent('#famFeed .fam-re button').catch(() => '');
chk(/1/.test(coeur || ''), `Marie voit le ❤️ de Paul — « ${(coeur || '').trim()} »`);

// ── 5) Paul écrit, Marie lit ────────────────────────────────────────────────
await P.page.fill('#famTexte', 'Trop belle cette photo !');
await P.page.click('#famSend'); await P.page.waitForTimeout(700);
await M.page.click('#famRefresh'); await M.page.waitForTimeout(800);
const msgs = await M.page.textContent('#famMsgs');
chk(/Trop belle/.test(msgs || '') && /paul/i.test(msgs || ''), 'Marie lit le message de Paul, avec son nom');

// ── 6) un cousin avec un AUTRE code ne voit rien ────────────────────────────
const C = await telephone('Luc Martin', '9999');
await rejoindre(C.page, 'Desarzens', 'jessaie1234');     // même nom, mauvais code
await C.page.waitForTimeout(800);
const nC = await C.page.locator('#famFeed .fam-it').count();
const videC = await C.page.textContent('#famFeed');
chk(nC === 0 && /Rien de partagé/.test(videC || ''),
  `ISOLATION : même nom de famille + mauvais code ⇒ ${nC} création visible`);

// ── 7) Kevin admin voit les deux familles ───────────────────────────────────
await rejoindre(C.page, 'Cousins', 'autre-code');        // Luc crée sa vraie famille
await creer(C.page, 'Chez les cousins');
await C.page.click('#famShare'); await C.page.waitForTimeout(900);

const K = await telephone('Kevin Desarzens', ADMIN_CODE);
// Le téléphone de Kevin porte le pass SSO du domaine (session vérifiée Face ID ailleurs) :
// c'est CE jeton — pas son nom — qui le rend admin famille (règle « ADMIN UNIVERSEL »).
await K.page.evaluate(() => localStorage.setItem('crea_sso_token', 'jeton-sso-kevin-test'));
await rejoindre(K.page, 'Desarzens', 'noel2026');
await K.page.waitForTimeout(700);
const adminVisible = await K.page.evaluate(() => !document.getElementById('famAdminRow').classList.contains('hidden'));
chk(adminVisible, 'Kevin voit la case « voir toutes les familles »');
await K.page.click('#famAll'); await K.page.waitForTimeout(1000);
const nK = await K.page.locator('#famFeed .fam-it').count();
chk(nK >= 2, `Kevin voit les créations de TOUTES les familles (${nK})`);

// ── 8) service coupé : message clair, pas une page morte ────────────────────
coupe = true;
await M.page.click('#famRefresh'); await M.page.waitForTimeout(900);
const txt = await M.page.textContent('#famFeed');
chk(/⚠️/.test(txt || '') && (txt || '').length > 10, `service coupé ⇒ message clair à l'écran — « ${(txt || '').trim().slice(0, 58)} »`);
coupe = false;

// ── 9) PLUSIEURS CERCLES : famille ET amis sur le même téléphone ────────────
await rejoindre(M.page, 'Les copains', 'apero2026');       // Marie rejoint un 2e cercle
await M.page.waitForTimeout(700);
let cercles = await M.page.locator('#famCercles .chip[data-cer]').count();
chk(cercles === 2, `Marie a 2 cercles sur son téléphone : famille ET amis (${cercles})`);
// ce qu'elle partage chez les copains ne doit PAS apparaître dans la famille
await creer(M.page, 'Photo entre copains');
await M.page.click('#famShare'); await M.page.waitForTimeout(900);
let nCopains = await M.page.locator('#famFeed .fam-it').count();
await M.page.click('#famCercles .chip[data-cer="Desarzens"]'); await M.page.waitForTimeout(900);
let nFamille = await M.page.locator('#famFeed .fam-it').count();
chk(nCopains === 1 && nFamille === 1,
  `chaque cercle garde ses affaires : ${nCopains} chez les copains, ${nFamille} en famille`);
// et Paul (famille seulement) ne voit RIEN des copains
await P.page.click('#famRefresh'); await P.page.waitForTimeout(800);
const txtP = await P.page.textContent('#famFeed');
chk(!/copains/i.test(txtP || ''), 'Paul, qui n\'est pas chez les copains, n\'en voit rien');
// quitter un cercle ne fait pas perdre l'autre
await M.page.click('#famLeave'); await M.page.waitForTimeout(700);
const resteDedans = await M.page.evaluate(() => !document.getElementById('famCard').classList.contains('hidden'));
chk(resteDedans, 'quitter un cercle bascule sur l\'autre au lieu de tout perdre');

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — ÉCRAN FAMILLE ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srvApp.close(); srvApi.close();
process.exit(R.ko.length ? 1 : 0);
