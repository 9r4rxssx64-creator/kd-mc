/* INSCRIPTION AVEC TÉLÉPHONE CONFIRMÉ — le vrai portail, dans un vrai navigateur (Kevin 9.10.2026 :
 * « OTP pour toutes inscriptions au domaine, app etc »).
 *
 * Les pages du portail (kdmc-home/) sont servies telles quelles ; /__sso/* passe par le VRAI routeur avec un KV simulé,
 * et Meta (WhatsApp) est simulé : on lit le code dans le message « envoyé », comme le ferait le téléphone.
 *   1. WhatsApp pas branché → « Créer mon compte » crée le compte directement (rien ne change pour personne) ;
 *   2. branché → « Créer mon compte » ouvre l'étape « Confirme ton téléphone » (lien wa.me, 6 cases, minuteur, essais),
 *      et AUCUN compte n'existe encore ;
 *   3. mauvais code → « Code incorrect. 4 essais restants. », cases vidées ;
 *   4. bon code (collé d'un coup dans la 1re case) → compte créé, accueil, téléphone sur la fiche (masqué) ;
 *   7. sans WhatsApp, au choix : « validation par l'administrateur » → compte fermé, écran d'attente, ouvert quand Kevin accepte ;
 *   5. iPhone 375 px : 6 cases ≥ 44 px, aucun défilement horizontal, rien de la confirmation gardé dans le téléphone.
 * node tests/verify-tel-inscription-portail.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createHash, createHmac } from 'node:crypto';
import mod from '../services/kdmc-router/worker.js';

const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const BASE = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
const WA = { WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app', WA_VERIFY_TOKEN: 'mot', WA_NUMERO_PUBLIC: '37799000000' };
let env = { ...BASE };
const envoyes = [];
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  if (String(u).startsWith('https://graph.facebook.com/')) { envoyes.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); }
  return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
};
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml' };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 200) : ''}`); };

async function brancher(ctx) {
  await ctx.route('https://kd-mc.com/**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.pathname.startsWith('/__sso/') || u.pathname.startsWith('/__admin/')) {
      const r = await mod.fetch(new Request(u.href, { method: req.method(), headers: req.headers(), body: req.method() === 'GET' ? undefined : req.postData() }), env, { waitUntil() {} });
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    const p = u.pathname === '/' ? 'kdmc-home/index.html' : 'kdmc-home' + u.pathname;
    if (existsSync(p)) return route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'text/plain', body: readFileSync(p) });
    return route.fulfill({ status: 404, body: '' });
  });
}
/* « La personne envoie le message WhatsApp » : Meta appelle le webhook du domaine, signé. */
async function envoyerWhatsApp(lien, tel) {
  const texte = decodeURIComponent(new URL(lien).searchParams.get('text') || '');
  const corps = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: tel, type: 'text', text: { body: texte } }] } }] }] });
  const sig = 'sha256=' + createHmac('sha256', 'secret-app').update(corps).digest('hex');
  await mod.fetch(new Request('https://kd-mc.com/__sso/tel/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Hub-Signature-256': sig }, body: corps }), env, { waitUntil() {} });
  return (envoyes[envoyes.length - 1].text.body.match(/\b(\d{6})\b/) || [])[1];
}
async function remplir(page, prenom) {
  await page.fill('#f-prenom', prenom); await page.fill('#f-nom', 'Essai');
  await page.fill('#f-code', '271828'); await page.fill('#f-code2', '271828');
  await page.check('#cgu-ok'); await page.click('#f-create');
}
const fermerOffreFaceId = async (page) => { const s = page.locator('#pk-skip'); if (await s.isVisible().catch(() => false)) await s.click(); };

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
console.log('\nInscription avec téléphone confirmé, dans le vrai portail\n');
try {
  /* 1. pas branché */
  const A = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 812 } }); await brancher(A);
  const pa = await A.newPage(); await pa.goto('https://kd-mc.com/');
  await remplir(pa, 'Albert'); await pa.waitForTimeout(1500); await fermerOffreFaceId(pa); await pa.waitForTimeout(300);
  ok(await pa.locator('#hub').isVisible() && kv.has('acc:albert-essai') && !(await pa.locator('#t-box').isVisible()),
    '1. WhatsApp pas branché : le compte est créé directement, aucune étape téléphone (rien ne change)');

  /* 2. branché */
  env = { ...BASE, ...WA };
  const B = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 812 } }); await brancher(B);
  const pb = await B.newPage(); await pb.goto('https://kd-mc.com/');
  await remplir(pb, 'Berthe');
  await pb.waitForSelector('#t-box', { state: 'visible', timeout: 5000 }).catch(() => {});
  const ecran = await pb.evaluate(() => ({
    visible: !document.getElementById('t-box').hidden,
    lien: document.getElementById('t-wa').href,
    cases: [...document.querySelectorAll('#t-box .t-case')].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
    minuteur: document.getElementById('t-min').textContent, essais: document.getElementById('t-ess').textContent,
    debord: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  ok(ecran.visible && !kv.has('acc:berthe-essai'), '2. branché : « Créer mon compte » ouvre « Confirme ton téléphone », et aucun compte n\'existe encore', JSON.stringify(ecran));
  ok(/^https:\/\/wa\.me\/37799000000\?text=KDMC%20D[A-Z0-9]{9}$/.test(ecran.lien), '2b. le bouton « Ouvrir WhatsApp » porte le message prérempli « KDMC D… »', ecran.lien);
  ok(ecran.cases.length === 6 && ecran.cases.every(([w, h]) => w >= 40 && h >= 44), '2c. 6 cases, chacune ≥ 44 px de haut sur un iPhone 375 px', JSON.stringify(ecran.cases));
  ok(/(15:00|14:5\d)/.test(ecran.minuteur) && ecran.essais === '5 essais' && !ecran.debord, '2d. minuteur 15 min, 5 essais, aucun défilement horizontal', JSON.stringify(ecran));

  if (process.env.CAPTURE) await pb.screenshot({ path: process.env.CAPTURE, fullPage: false });
  const code = await envoyerWhatsApp(ecran.lien, '33612345678');
  ok(/^\d{6}$/.test(code || ''), '2e. (téléphone simulé) le domaine a répondu un code à 6 chiffres sur WhatsApp');

  /* 3. mauvais code */
  const faux = code === '000000' ? '111111' : '000000';
  await pb.fill('#t-box .t-case >> nth=0', faux);
  await pb.waitForFunction(() => /incorrect/.test(document.getElementById('t-err').textContent), null, { timeout: 5000 }).catch(() => {});
  const apresFaux = await pb.evaluate(() => ({ err: document.getElementById('t-err').textContent, ess: document.getElementById('t-ess').textContent,
    vides: [...document.querySelectorAll('#t-box .t-case')].every((c) => c.value === '') }));
  ok(/4 essais restants/.test(apresFaux.err) && apresFaux.ess === '4 essais' && apresFaux.vides && !kv.has('acc:berthe-essai'),
    '3. mauvais code → « Code incorrect. 4 essais restants. », cases vidées, toujours aucun compte', JSON.stringify(apresFaux));

  /* 4. bon code, collé d'un coup */
  await pb.fill('#t-box .t-case >> nth=0', code);
  await pb.waitForTimeout(2000); await fermerOffreFaceId(pb); await pb.waitForTimeout(300);
  const fiche = kv.has('acc:berthe-essai') ? JSON.parse(kv.get('acc:berthe-essai')) : null;
  ok(await pb.locator('#hub').isVisible() && fiche && fiche.tel && fiche.tel.masque === '+33 6•• •• •• 78',
    '4. bon code collé → compte créé, accueil, téléphone rangé masqué sur la fiche', JSON.stringify(fiche && fiche.tel));
  const local = await pb.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
  ok(!local.includes(code) && !/preuve|tel_preuve/i.test(local) && !local.includes('33612345678'), '5. rien de la confirmation (code, preuve, numéro) n\'est gardé dans le téléphone');
  ok(![...kv.values()].join('\n').includes('33612345678'), '5b. le numéro n\'est nulle part en clair côté domaine');

  /* 6. Validation AUTOMATIQUE (Kevin 10.10) : on envoie le message WhatsApp, on ne tape RIEN, le compte se crée tout seul */
  const C = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 812 } }); await brancher(C);
  const pc = await C.newPage(); await pc.goto('https://kd-mc.com/');
  await remplir(pc, 'Camille');
  await pc.waitForSelector('#t-box', { state: 'visible', timeout: 5000 }).catch(() => {});
  const lienC = await pc.evaluate(() => document.getElementById('t-wa').href);
  await envoyerWhatsApp(lienC, '33698765432');
  await pc.waitForFunction(() => { const h = document.getElementById('hub'); return (h && !h.hidden) || !!document.getElementById('pk-skip'); }, null, { timeout: 12000 }).catch(() => {});
  await fermerOffreFaceId(pc); await pc.waitForTimeout(400);
  const ficheC = kv.has('acc:camille-essai') ? JSON.parse(kv.get('acc:camille-essai')) : null;
  ok(await pc.locator('#hub').isVisible() && ficheC && ficheC.tel && ficheC.tel.masque === '+33 6•• •• •• 32',
    '6. validation automatique : message WhatsApp envoyé, AUCUN code tapé → compte créé tout seul', JSON.stringify(ficheC && ficheC.tel));

  /* 7. « Si pas de WhatsApp, validation admin. Au choix » (Kevin 10.10) : bouton → compte créé FERMÉ → écran d'attente, pas l'accueil */
  const D = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 812 } }); await brancher(D);
  const pd = await D.newPage(); await pd.goto('https://kd-mc.com/');
  await remplir(pd, 'Denise');
  await pd.waitForSelector('#t-admin', { state: 'visible', timeout: 5000 }).catch(() => {});
  const bouton = await pd.evaluate(() => { const b = document.getElementById('t-admin'); const r = b ? b.getBoundingClientRect() : null; return b ? { h: Math.round(r.height), t: b.textContent } : null; });
  ok(bouton && bouton.h >= 44 && /pas WhatsApp/.test(bouton.t), '7. à l\'étape téléphone, le bouton « Je n\'ai pas WhatsApp » est là (≥ 44 px)', JSON.stringify(bouton));
  await pd.click('#t-admin');
  await pd.waitForFunction(() => !!document.getElementById('attente-admin') || !!document.getElementById('pk-skip'), null, { timeout: 8000 }).catch(() => {});
  await fermerOffreFaceId(pd);
  await pd.waitForSelector('#attente-admin', { timeout: 8000 }).catch(() => {});
  const ficheD = kv.has('acc:denise-essai') ? JSON.parse(kv.get('acc:denise-essai')) : null;
  const att = await pd.evaluate(() => { const a = document.getElementById('attente-admin'); return a ? { texte: a.textContent, debord: document.documentElement.scrollWidth > window.innerWidth + 1 } : null; });
  ok(ficheD && ficheD.attente_admin === true && !ficheD.tel, '7b. le compte est créé, marqué « en attente de l\'administrateur », sans téléphone', JSON.stringify(ficheD && { a: ficheD.attente_admin, tel: ficheD.tel }));
  ok(att && /attend l.administrateur/.test(att.texte) && !att.debord, '7c. l\'écran « Ton compte attend l\'administrateur » s\'affiche (pas l\'accueil), sans débord sur 375 px', JSON.stringify(att));
  /* Kevin accepte (la fiche s'ouvre) → « Vérifier maintenant » ouvre l'accueil tout seul */
  if (ficheD) { delete ficheD.attente_admin; ficheD.valide_admin_at = Date.now(); kv.set('acc:denise-essai', JSON.stringify(ficheD)); }
  await pd.click('#aa-go').catch(() => {});
  await pd.waitForFunction(() => !document.getElementById('attente-admin'), null, { timeout: 6000 }).catch(() => {});
  ok(!(await pd.locator('#attente-admin').count()) && await pd.locator('#hub').isVisible(), '7d. une fois accepté par Kevin, l\'écran d\'attente laisse place à l\'accueil');
} finally { await browser.close(); globalThis.fetch = vraiFetch; }
console.log(`\nINSCRIPTION AVEC TÉLÉPHONE (portail) — ${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
