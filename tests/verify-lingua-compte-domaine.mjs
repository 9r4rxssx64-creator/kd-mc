/* LINGUA SUR LE COMPTE DU DOMAINE — vrai navigateur (Kevin 27.09.2026 : « fais Lingua »)
 * Avant : Lingua ignorait le domaine (0 appel /__sso) ; chaque personne recréait un compte Lingua
 * avec un code Lingua, jamais reconnue même connectée à kd-mc.com.
 * On sert lingua/ sur https://lingua.kd-mc.com/, et /__sso/* + /__lingua/* par le VRAI routeur.
 *   1. Marie, connectée au domaine (cookie) : Lingua l'ouvre SANS rien demander, sous son nom ;
 *   2. sa progression est sauvegardée sous son compte KDMC (clé lingua:u:…), lisible d'un autre appareil ;
 *   3. un inconnu qui crée un compte Lingua avec un code de 6 chiffres → compte KDMC déclaré au domaine (code inclus) ;
 *   4. sur un autre téléphone, « J'ai déjà un compte » avec ce nom + code → reconnu, pas de compte Lingua à recréer.
 * Prouvé discriminant : retirer kdmcWhoami() du boot → 1 échoue ; retirer kdmcIssue → 3 échoue.
 * node tests/verify-lingua-compte-domaine.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import mod from '../services/kdmc-router/worker.js';
import { createHmac } from 'node:crypto';

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
    let p = 'lingua' + (u.pathname === '/' ? '/index.html' : u.pathname);
    if (existsSync(p)) return route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body: readFileSync(p) });
    return route.fulfill({ status: 404, body: '' });
  });
}
kv.set('acc:marie-curie', JSON.stringify({ uid: 'marie-curie', name: 'Marie Curie', cgu_at: 1 }));
kv.set('nm:marie curie', 'marie-curie');
const browser = await chromium.launch();
console.log('\nLingua sur le compte du domaine, dans un vrai navigateur\n');
try {
  /* 1-2. Marie, connectée au domaine */
  const A = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await brancher(A);
  await A.addCookies([{ name: 'kdmc_sso', value: signe('marie-curie', 'Marie Curie'), domain: '.kd-mc.com', path: '/', secure: true, httpOnly: true }]);
  const pa = await A.newPage(); await pa.goto('https://lingua.kd-mc.com/'); await pa.waitForTimeout(2500);
  const etatA = await pa.evaluate(() => { const a = JSON.parse(localStorage.getItem('lingua_g_accounts') || '[]'); return { comptes: a, cur: JSON.parse(localStorage.getItem('lingua_g_current') || 'null'), texte: document.body.innerText.slice(0, 400) }; });
  const marie = etatA.comptes.find((a) => a.kdmcUid === 'marie-curie');
  ok(!!marie && etatA.cur === marie.id && !marie.code && !/Nouveau compte/.test(etatA.texte), '1. Marie (connectée à kd-mc.com) : Lingua ouvre SON compte, sans code, sans écran de connexion', JSON.stringify(etatA).slice(0, 200));
  await pa.evaluate(() => { const a = JSON.parse(localStorage.getItem('lingua_g_accounts') || '[]'); const id = JSON.parse(localStorage.getItem('lingua_g_current')); localStorage.setItem('lingua_a_' + id + '_xp', '77'); });
  /* on force une sauvegarde : le battement de Lingua passe par scheduleCloudSave (20 s) → on rejoue l'appel de l'app */
  await pa.evaluate(() => fetch('/__lingua/save', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: { v: 2, name: 'Marie Curie', avatar: '🦊', syncTs: Date.now(), data: { xp: '77' } } }) }));   /* même forme que _acctSnapshot */
  await pa.waitForTimeout(300);
  ok(kv.has('lingua:u:marie-curie'), '2. sa progression est rangée sous son compte KDMC (lingua:u:marie-curie), pas sous un code Lingua', [...kv.keys()].filter((k) => k.startsWith('lingua:')).join(','));
  const B = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await brancher(B);
  await B.addCookies([{ name: 'kdmc_sso', value: signe('marie-curie', 'Marie Curie'), domain: '.kd-mc.com', path: '/', secure: true, httpOnly: true }]);
  const pb = await B.newPage(); await pb.goto('https://lingua.kd-mc.com/'); await pb.waitForTimeout(3000);
  const xpB = await pb.evaluate(() => { const id = JSON.parse(localStorage.getItem('lingua_g_current') || 'null'); return id ? localStorage.getItem('lingua_a_' + id + '_xp') : null; });
  ok(xpB === '77', '2 bis. autre téléphone, même compte KDMC → la progression revient toute seule (xp 77)', String(xpB));

  /* 3. Un inconnu crée un compte Lingua avec un code de 6 chiffres → compte KDMC */
  const C = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await brancher(C);
  const pc = await C.newPage(); await pc.goto('https://lingua.kd-mc.com/'); await pc.waitForTimeout(1500);
  await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Nouveau compte/i.test(x.textContent)); if (b) b.click(); });
  await pc.waitForSelector('#acPrenom', { timeout: 8000 });
  await pc.fill('#acPrenom', 'Hugo'); await pc.fill('#acNom', 'Blanc'); await pc.fill('#acCode', '135790');
  await pc.evaluate(() => { const c = document.querySelector('#acCgu'); if (c) c.checked = true; });
  appels.length = 0;
  await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Créer mon compte/i.test(x.textContent)); if (b) b.click(); });
  await pc.waitForTimeout(2500);
  const issue = appels.find((a) => a.p === '/__sso/issue');
  const hugo = JSON.parse(kv.get('acc:hugo-blanc') || 'null');
  ok(!!issue && /"code":"135790"/.test(issue.b) && !!hugo && kv.has('cred:hugo-blanc'), '3. compte créé dans Lingua avec un code → compte KDMC déclaré au domaine, code enregistré (empreinte)', JSON.stringify({ issue: !!issue, hugo: !!hugo, cred: kv.has('cred:hugo-blanc') }));

  /* 4. Autre téléphone : « J'ai déjà un compte » nom + code → reconnu par le domaine */
  const D = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await brancher(D);
  const pd = await D.newPage(); await pd.goto('https://lingua.kd-mc.com/'); await pd.waitForTimeout(1500);
  await pd.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /J'ai déjà un compte/i.test(x.textContent)); if (b) b.click(); });
  await pd.waitForSelector('#lgPrenom', { timeout: 8000 });
  await pd.fill('#lgPrenom', 'Hugo'); await pd.fill('#lgNom', 'Blanc'); await pd.fill('#lgCode', '135790');
  appels.length = 0;
  await pd.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Retrouver mon compte/i.test(x.textContent)); if (b) b.click(); });
  await pd.waitForTimeout(2500);
  const etatD = await pd.evaluate(() => JSON.parse(localStorage.getItem('lingua_g_accounts') || '[]'));
  ok(appels.some((a) => a.p === '/__sso/login') && etatD.some((a) => a.kdmcUid === 'hugo-blanc'), '4. autre téléphone, nom + code KDMC → reconnu par le domaine, compte Lingua rattaché', JSON.stringify(etatD).slice(0, 160));
} finally { await browser.close(); }
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
