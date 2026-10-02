/* LE CERCLE DANS LINGUA — de bout en bout, vrai navigateur + VRAI routeur (KV simulé, D1 simulée sur SQLite).
 * Kevin 2.10.2026 : lien d'invitation → fiche d'inscription domaine + Lingua → cercle de celui qui invite ;
 * cadeaux, encouragements, messages ; présence du cercle seulement ; l'admin voit tout le monde, reste anonyme,
 * et reçoit les messages même hors ligne.
 *   1. Léa (compte KDMC) ouvre son cercle et crée un lien d'invitation ;
 *   2. Tom ouvre le lien sur un autre téléphone → « Léa M. t'invite » → crée son compte KDMC → dans le cercle de Léa,
 *      cadeau de bienvenue ouvert (+20 💎) ;
 *   3. Léa voit Tom EN LIGNE, lui envoie un encouragement ; Tom le reçoit ; Tom offre un cadeau, Léa l'ouvre et dit merci ;
 *   4. Zoé (hors de tout cercle) écrit à l'admin ; Kevin (Face ID) voit TOUTES les personnes, dont Zoé, et le message ;
 *   5. nulle part côté membres le nom de Kevin n'apparaît ; aucune erreur JavaScript.
 * node tests/verify-lingua-cercle.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright';
import mod from '../services/kdmc-router/worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 220) : ''}`); };
function d1() { const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, _x: () => s.prepare(sql).run(...p) });
  return { prepare: (q) => st(q), batch: async (l) => { for (const x of l) x._x(); return []; } }; }
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: 'a'.repeat(64), CERCLE_DB: d1(),
  ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, name, v) => { const p = b64u(JSON.stringify({ u: uid, n: name, c: 1, v: v ? 1 : 0, k: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', webmanifest: 'application/manifest+json' };
async function brancher(ctx) {
  await ctx.route(/^https:\/\/((lingua|admin)\.)?kd-mc\.com\//, async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.hostname === 'admin.kd-mc.com') return route.fulfill({ status: 200, body: '{}' });
    if (u.pathname.startsWith('/__')) {
      const r = await mod.fetch(new Request(u.href, { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), env, { waitUntil() {} });
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc.join('\n');
      return route.fulfill({ status: r.status, headers: h, body: Buffer.from(await r.arrayBuffer()) }); }
    if (u.hostname !== 'lingua.kd-mc.com') return route.fulfill({ status: 404, body: '' });
    const p = 'lingua' + (u.pathname === '/' ? '/index.html' : u.pathname);
    return existsSync(p) ? route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body: readFileSync(p) }) : route.fulfill({ status: 404, body: '' });
  });
}
const seed = (id, nom, uid, extra) => ({ id, nom, uid, extra });
async function appareil(nav, cookie, compte) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await brancher(ctx);
  if (cookie) await ctx.addCookies([{ name: 'kdmc_sso', value: cookie, domain: '.kd-mc.com', path: '/', secure: true, httpOnly: true }]);
  if (compte) await ctx.addInitScript((c) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1');
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: c.id, name: c.nom, avatar: '🦊', code: '', kdmcUid: c.uid, created: 1 }])); localStorage.setItem('lingua_g_current', JSON.stringify(c.id));
    localStorage.setItem('lingua_a_' + c.id + '_course', JSON.stringify('en')); localStorage.setItem('lingua_a_' + c.id + '_placeAsked', 'true'); localStorage.setItem('lingua_a_' + c.id + '_sound', 'false');
    Object.entries(c.extra || {}).forEach(([k, v]) => localStorage.setItem('lingua_a_' + c.id + '_' + k, JSON.stringify(v))); }, compte);
  const p = await ctx.newPage(); p._err = []; p.on('pageerror', (e) => p._err.push(e.message)); return { ctx, p };
}
const clic = (p, s) => p.evaluate((s) => { const b = [...document.querySelectorAll('button')].find((x) => new RegExp(s).test(x.textContent)); if (b) b.click(); return !!b; }, s);
const clicDessus = (p, s) => p.evaluate((s) => { const ms = document.querySelectorAll('.modal'); const m = ms[ms.length - 1]; const b = m && [...m.querySelectorAll('button')].find((x) => new RegExp(s).test(x.textContent)); if (b) b.click(); return !!b; }, s);
const texte = (p) => p.evaluate(() => document.body.innerText);
const cercle = async (p) => { await p.click('#tbCercle'); await p.waitForTimeout(1500); };
const nav = await chromium.launch();
console.log('\nLe Cercle dans Lingua — vrai navigateur, vrai routeur\n');
try {
  /* 1. Léa */
  kv.set('acc:lea-martin', JSON.stringify({ uid: 'lea-martin', name: 'Léa Martin', cgu_at: 1 })); kv.set('nm:lea martin', 'lea-martin');
  const L = await appareil(nav, signe('lea-martin', 'Léa Martin'), seed('x', 'Léa Martin', 'lea-martin'));
  await L.p.goto('https://lingua.kd-mc.com/'); await L.p.waitForTimeout(2500);
  await cercle(L.p);
  ok(/Mon cercle/.test(await texte(L.p)) && /Admin KDMC/.test(await texte(L.p)), '1a. Léa ouvre son cercle ; « Admin KDMC » y figure, prêt à recevoir un message');
  await L.p.evaluate(() => { try { delete navigator.share; } catch (e) {} navigator.share = undefined; });
  await clic(L.p, "Inviter quelqu'un"); await L.p.waitForTimeout(800);
  const lien = await L.p.evaluate(() => document.querySelector('#invLien')?.value || '');
  ok(/^https:\/\/lingua\.kd-mc\.com\/\?cercle=[a-z0-9]+$/.test(lien), `1b. lien d'invitation créé (${lien.slice(0, 50)}…)`);
  await L.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove()));
  /* 2. Tom, sur un autre téléphone, par le lien */
  const T = await appareil(nav, null, null);
  await T.p.goto(lien); await T.p.waitForTimeout(2500);
  ok(/Léa M\. t'invite dans son cercle/.test(await texte(T.p)), '2a. Tom voit « Léa M. t\'invite dans son cercle »', (await texte(T.p)).slice(0, 200));
  ok(!/\?cercle=/.test(T.p.url()), '2b. le jeton disparaît de l\'adresse (pas de fuite par capture d\'écran)');
  await clic(T.p, 'Créer mon compte'); await T.p.waitForSelector('#acPrenom');
  await T.p.fill('#acPrenom', 'Tom'); await T.p.fill('#acNom', 'Durand');
  await T.p.evaluate(() => { document.querySelector('#acCgu').checked = true; });
  await T.p.waitForTimeout(600); await clicDessus(T.p, 'Créer mon compte'); await T.p.waitForTimeout(500);
  ok(/6 chiffres/.test(await T.p.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' '))), '2c. invité sans code → on lui demande son code KDMC (fiche d\'inscription domaine + Lingua)');
  await T.p.fill('#acCode', '864213'); await clicDessus(T.p, 'Créer mon compte'); await T.p.waitForTimeout(3500);
  await T.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove()));
  await T.p.evaluate(() => { const c = document.querySelector('.course-card'); if (c) c.click(); }); await T.p.waitForTimeout(800);
  await T.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove()));
  await cercle(T.p);
  let tt = await texte(T.p);
  ok(/Léa M\./.test(tt), '2d. Tom est dans le cercle de Léa (il la voit)', tt.slice(0, 300));
  const g0 = await T.p.evaluate(() => +JSON.parse(localStorage.getItem('lingua_a_' + JSON.parse(localStorage.getItem('lingua_g_current')) + '_gems') || '0'));
  await clic(T.p, 'Ouvrir 🎁'); await T.p.waitForTimeout(1200);
  const g1 = await T.p.evaluate(() => +JSON.parse(localStorage.getItem('lingua_a_' + JSON.parse(localStorage.getItem('lingua_g_current')) + '_gems') || '0'));
  ok(g1 === g0 + 20, `2e. cadeau de bienvenue ouvert : ${g0} → ${g1} 💎`);
  /* 3. Léa voit Tom en ligne, l'encourage ; Tom offre un cadeau */
  await L.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove()));
  await cercle(L.p);
  let lt = await texte(L.p);
  ok(/Tom D\./.test(lt) && /en ligne/.test(lt), '3a. Léa voit Tom D. EN LIGNE dans son cercle');
  await L.p.evaluate(() => [...document.querySelectorAll('button[aria-label^="Écrire à Tom"]')][0]?.click()); await L.p.waitForTimeout(500);
  await L.p.evaluate(() => document.querySelector('[data-code="bravo"]')?.click()); await L.p.waitForTimeout(1200);
  await T.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove())); await cercle(T.p);
  tt = await texte(T.p);
  ok(/Bravo/.test(tt) && /Léa M\./.test(tt), '3b. Tom reçoit l\'encouragement de Léa');
  await T.p.evaluate(() => [...document.querySelectorAll('button[aria-label^="Écrire à Léa"]')][0]?.click()); await T.p.waitForTimeout(500);
  await T.p.evaluate(() => document.querySelector('[data-cad="boost"]')?.click()); await T.p.waitForTimeout(1200);
  await L.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove())); await cercle(L.p);
  await clic(L.p, 'Ouvrir 🎁'); await L.p.waitForTimeout(1200);
  const boost = await L.p.evaluate(() => +JSON.parse(localStorage.getItem('lingua_a_x_boostJusqua') || '0'));
  ok(boost > Date.now(), '3c. Léa ouvre le cadeau de Tom : XP x2 activé');
  await clic(L.p, 'Merci'); await L.p.waitForTimeout(1200);
  await T.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove())); await cercle(T.p);
  if (process.env.CAPTURE) { await T.p.screenshot({ path: process.env.CAPTURE, fullPage: true }); }
  ok(/Merci pour le cadeau/.test(await texte(T.p)), '3d. Tom reçoit le « Merci » de Léa (et ses 5 💎 à ouvrir)');
  /* 4. Zoé écrit à l'admin ; Kevin voit tout le monde */
  kv.set('acc:zoe-petit', JSON.stringify({ uid: 'zoe-petit', name: 'Zoé Petit', cgu_at: 1 })); kv.set('nm:zoe petit', 'zoe-petit');
  const Z = await appareil(nav, signe('zoe-petit', 'Zoé Petit'), seed('z', 'Zoé Petit', 'zoe-petit'));
  await Z.p.goto('https://lingua.kd-mc.com/'); await Z.p.waitForTimeout(2500); await Z.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove()));
  await cercle(Z.p);
  ok(!/Léa M\.|Tom D\./.test(await texte(Z.p)), '4a. Zoé ne voit NI Léa NI Tom (pas son cercle)');
  await clic(Z.p, '^Écrire$'); await Z.p.waitForTimeout(400);
  await Z.p.fill('#ceTexte', 'Bonjour, ma série a disparu ?'); await clic(Z.p, '^Envoyer$'); await Z.p.waitForTimeout(1200);
  kv.set('acc:kdmc_admin', JSON.stringify({ uid: 'kdmc_admin', name: 'Kevin Desarzens', cgu_at: 1 }));
  const K = await appareil(nav, signe('kdmc_admin', 'Kevin Desarzens', true), seed('k', 'Kevin Desarzens', 'kdmc_admin'));
  await K.p.goto('https://lingua.kd-mc.com/#admin'); await K.p.waitForTimeout(3500);
  await K.p.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove())); await K.p.waitForTimeout(1500);
  const kt = await texte(K.p);
  if (process.env.CAPTURE) { await K.p.screenshot({ path: process.env.CAPTURE.replace('.png', '-admin.png'), fullPage: true }); }
  ok(/Admin — toutes les personnes/.test(kt) && /Zoé Petit/.test(kt) && /Léa Martin/.test(kt) && /Tom Durand/.test(kt), '4b. Kevin (Face ID) voit TOUTES les personnes, noms complets, même hors de son cercle', kt.slice(0, 400));
  ok(/ma série a disparu/.test(kt), '4c. le message de Zoé est dans la boîte de l\'admin');
  /* 5. anonymat + erreurs */
  for (const [n, P] of [['Léa', L.p], ['Tom', T.p], ['Zoé', Z.p]]) { await P.evaluate(() => document.querySelectorAll('.overlay,.modal').forEach((x) => x.remove())); await cercle(P); ok(!/Kevin|Desarzens/.test(await texte(P)), `5. ${n} ne voit jamais le nom de Kevin`); }
  const errs = [L, T, Z, K].flatMap((x) => x.p._err);
  ok(errs.length === 0, `6. aucune erreur JavaScript${errs.length ? ' — ' + errs[0] : ''}`);
} finally { await nav.close(); }
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
