/* UN SEUL COMPTE PAR PERSONNE DANS LINGUA — vrai navigateur (Kevin 2.10.2026 : « Je ne dois avoir
 * qu'un compte KDMC, le mien. Chacun 1 seul compte. Normal »).
 * Lingua servie sur https://lingua.kd-mc.com/, /__sso/* et /__lingua/* par le VRAI routeur (KV simulé).
 *   1. un téléphone qui a DEUX comptes « Kevin Desarzens » (vieux doublons) : dès que le domaine le
 *      reconnaît, il n'en reste qu'UN — le plus avancé — rattaché au compte KDMC, et les données de
 *      l'autre ne sont PAS effacées de l'appareil ;
 *   2. un nouveau ne peut plus créer de « compte Lingua seul » à 4-5 chiffres : refusé, aucun compte ;
 *   3. un ancien compte Lingua seul se RELIE au compte KDMC avec un code de 6 chiffres (déclaré au domaine) ;
 *   4. sur un compte KDMC, « Changer mon code » n'invente pas un 2e code local : il explique.
 * node tests/verify-lingua-un-compte.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import mod from '../services/kdmc-router/worker.js';
import { createHmac } from 'node:crypto';

const COURS = 'en';
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, name) => { const p = b64u(JSON.stringify({ u: uid, n: name, c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const appels = [];
async function brancher(ctx) {
  await ctx.route(/^https:\/\/(lingua\.)?kd-mc\.com\//, async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.pathname.startsWith('/__sso/') || u.pathname.startsWith('/__lingua/')) {
      appels.push({ p: u.pathname, b: req.postData() || '' });
      const r = await mod.fetch(new Request(u.href, { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), env, { waitUntil() {} });
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) headers['set-cookie'] = sc.join('\n');
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    if (u.hostname !== 'lingua.kd-mc.com') return route.fulfill({ status: 404, body: '' });
    const p = 'lingua' + (u.pathname === '/' ? '/index.html' : u.pathname);
    if (existsSync(p)) return route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body: readFileSync(p) });
    return route.fulfill({ status: 404, body: '' });
  });
}
const clic = (page, s) => page.evaluate((s) => {
  const b = [...document.querySelectorAll('button')].find((x) => new RegExp(s, 'i').test(x.textContent));
  if (!b) return false; b.click(); return true; }, s);
const clicM = (page, s) => page.evaluate((s) => {
  const ms = document.querySelectorAll('.modal'); const m = ms[ms.length - 1]; if (!m) return false;
  const b = [...m.querySelectorAll('button')].find((x) => new RegExp(s, 'i').test(x.textContent));
  if (!b) return false; b.click(); return true; }, s);
const versChangerCode = async (pg) => { await clic(pg, 'Profil'); await pg.waitForTimeout(400); await clic(pg, 'Voir mon code'); await pg.waitForTimeout(400); const r = await clicM(pg, 'Changer mon code'); await pg.waitForTimeout(400); return r; };
const topTexte = (pg) => pg.evaluate(() => { const ms = document.querySelectorAll('.modal'); return ms.length ? ms[ms.length - 1].innerText : ''; });
const etat = (pg) => pg.evaluate(() => ({ comptes: JSON.parse(localStorage.getItem('lingua_g_accounts') || '[]'), cur: JSON.parse(localStorage.getItem('lingua_g_current') || 'null'), cles: Object.keys(localStorage) }));
const toastTexte = (pg) => pg.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));

kv.set('acc:jean-dupont', JSON.stringify({ uid: 'jean-dupont', name: 'Jean Dupont', cgu_at: 1 }));
kv.set('nm:jean dupont', 'jean-dupont');
const browser = await chromium.launch();
console.log('\nLingua : un seul compte par personne, dans un vrai navigateur\n');
try {
  /* 1. Deux comptes locaux au même nom → un seul, le plus avancé, rattaché au compte KDMC. */
  const A = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await brancher(A);
  await A.addInitScript(() => {
    if (localStorage.getItem('seed')) return; localStorage.setItem('seed', '1');
    localStorage.setItem('lingua_g_accounts', JSON.stringify([
      { id: 'acc_petit', name: 'Kevin Desarzens', avatar: '🦊', code: '', kdmcUid: '', created: 1 },
      { id: 'acc_grand', name: 'kevin  desarzens', avatar: '🐝', code: '1234', kdmcUid: '', created: 2 },
      { id: 'acc_lea', name: 'Léa Desarzens', avatar: '🐰', code: '', kdmcUid: '', created: 3 },
    ]));
    localStorage.setItem('lingua_a_acc_petit_xp', '50'); localStorage.setItem('lingua_a_acc_grand_xp', '900');
    localStorage.setItem('lingua_a_acc_lea_xp', '20');
  });
  await A.addCookies([{ name: 'kdmc_sso', value: signe('kdmc_admin', 'Kevin Desarzens'), domain: '.kd-mc.com', path: '/', secure: true, httpOnly: true }]);
  const pa = await A.newPage(); await pa.goto('https://lingua.kd-mc.com/'); await pa.waitForTimeout(2500);
  const e1 = await etat(pa);
  const kevins = e1.comptes.filter((a) => /kevin/i.test(a.name));
  ok(kevins.length === 1, `1a. il ne reste qu'UN compte Kevin sur l'appareil (lu : ${kevins.length})`, JSON.stringify(e1.comptes));
  ok(kevins[0] && kevins[0].id === 'acc_grand' && kevins[0].kdmcUid === 'kdmc_admin' && e1.cur === 'acc_grand', '1b. c\'est le plus avancé (900 XP) qui est gardé, rattaché au compte KDMC et ouvert');
  ok(e1.comptes.some((a) => a.id === 'acc_lea'), '1c. Léa (une autre personne) garde son compte');
  ok(e1.cles.includes('lingua_a_acc_petit_xp'), '1d. les données du doublon restent sur l\'appareil (rien n\'est effacé)');
  await A.close();

  /* 2. Nouveau compte avec 4 chiffres → refusé. */
  const B = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await brancher(B);
  const pb = await B.newPage(); await pb.goto('https://lingua.kd-mc.com/'); await pb.waitForTimeout(1500);
  await pb.click('.acc-card.add'); await pb.waitForSelector('#acPrenom');
  await pb.fill('#acPrenom', 'Paul'); await pb.fill('#acNom', 'Martin'); await pb.fill('#acCode', '1234');
  await pb.evaluate(() => { document.querySelector('#acCgu').checked = true; });
  await pb.click('.modal .btn-main'); await pb.waitForTimeout(600);
  const e2 = await etat(pb); const t2 = await toastTexte(pb);
  ok(e2.comptes.length === 0 && /6 chiffres/.test(t2), `2. un code de 4 chiffres est refusé, aucun compte créé (« ${t2.slice(0, 70)} »)`);

  /* 3. Ancien compte Lingua seul → relié au compte KDMC avec 6 chiffres. */
  await pb.evaluate((COURS) => {
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'acc_paul', name: 'Paul Martin', avatar: '🦊', code: '4321', kdmcUid: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('acc_paul'));
    localStorage.setItem('lingua_a_acc_paul_course', JSON.stringify(COURS));
    localStorage.setItem('lingua_a_acc_paul_placed', 'true');
  }, COURS);
  await pb.reload(); await pb.waitForTimeout(1500);
  await versChangerCode(pb);
  const titre = await topTexte(pb);
  ok(/Relier à mon compte KDMC/.test(titre), `3a. un compte Lingua seul propose de se RELIER au compte KDMC (« ${titre} »)`);
  await pb.fill('#ccCode', '12'); await clicM(pb, 'Relier mon compte'); await pb.waitForTimeout(400);
  ok(/6 chiffres/.test(await toastTexte(pb)), '3b. moins de 6 chiffres → refusé');
  appels.length = 0;
  await pb.fill('#ccCode', '246810'); await clicM(pb, 'Relier mon compte'); await pb.waitForTimeout(1500);
  const e3 = await etat(pb); const paul = e3.comptes.find((a) => a.id === 'acc_paul');
  const issue = appels.find((a) => a.p === '/__sso/issue');
  ok(!!issue && /246810/.test(issue.b), '3c. le code est déclaré AU DOMAINE (compte KDMC, valable partout)');
  ok(paul && paul.kdmcUid && paul.code === '246810', `3d. le compte est relié (kdmcUid ${paul && paul.kdmcUid})`);

  /* 4. Compte KDMC → pas de 2e code local. */
  await pb.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
  await versChangerCode(pb);
  const t4 = await topTexte(pb);
  ok(/Ton code KDMC/.test(t4), '4. sur un compte KDMC, « Changer mon code » explique au lieu de créer un 2e code', t4.slice(0, 120));
  await B.close();
} finally { await browser.close(); }
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
