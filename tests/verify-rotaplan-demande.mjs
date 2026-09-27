/* PREUVE — Rotaplan : demande de démo avec fiche OBLIGATOIRE, sans aucun script (Kevin 27.09.2026 :
 * « renseignements obligatoires partout pour les nouveaux »). Avant : un simple lien e-mail, sans
 * identité. La page n'exécute AUCUN script (CSP script-src 'none', voulu) : les champs sont imposés
 * par le navigateur (`required`) et REVÉRIFIÉS par le routeur (POST /__demande).
 * Vrai navigateur (écran d'iPhone) + VRAI routeur (worker.js) : (1) envoi incomplet → le navigateur
 * n'envoie rien ; (2) requête forgée incomplète → le routeur refuse ; (3) fiche complète → page
 * « Demande bien reçue », demande rangée, Kevin prévenu ; (4) piège à robots, origine étrangère,
 * limite par connexion ; (5) la liste des demandes est réservée à l'admin.
 * node tests/verify-rotaplan-demande.mjs */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, createHmac } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(ROOT + '/package.json')('playwright');
const worker = (await import('file://' + ROOT + '/services/kdmc-router/worker.js')).default;
const kv = new Map();
const pushes = [];
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), KDMC_PUSH_URL: 'https://push.test', KDMC_PUSH_TOKEN: 't',
  ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { const u = typeof input === 'string' ? input : input.url; if (/push\.test/.test(u)) { pushes.push(JSON.parse((init && init.body) || '{}')); return new Response('{}'); } return vraiFetch(input, init); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'application/javascript' };

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };
const demandes = () => [...kv.keys()].filter((k) => k.startsWith('demande:'));
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const envois = [];
  await ctx.route(/^https?:\/\//, async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.hostname !== 'rotaplan.kd-mc.com') return route.abort();
    if (u.pathname.startsWith('/__')) {
      envois.push(u.pathname);
      const r = await worker.fetch(new Request(u.href, { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postDataBuffer() : undefined }), env, { waitUntil() {} });
      const hs = {}; r.headers.forEach((v, k) => { hs[k] = v; });
      return route.fulfill({ status: r.status, headers: hs, body: Buffer.from(await r.arrayBuffer()) });
    }
    let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, 'shops/rotaplan', p);
    if (!existsSync(f) || statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }, body: readFileSync(f) });
  });
  const page = await ctx.newPage();
  await page.goto('https://rotaplan.kd-mc.com/#demander');
  const form = page.locator('form.demande');
  ok(await form.count() === 1, 'la fiche de demande est sur la page');
  const scripts = await page.evaluate(() => document.querySelectorAll('script:not([type="application/ld+json"])').length);
  ok(scripts === 0, 'la page reste SANS aucun script (règle de sécurité intacte)');
  const h = await page.evaluate(() => [...document.querySelectorAll('form.demande input:not([type=checkbox]):not([name=site])')].map((i) => Math.round(i.getBoundingClientRect().height)));
  ok(h.length >= 5 && h.every((x) => x >= 44), 'chaque champ se touche au doigt (' + h.join(', ') + ' px)');

  console.log('— 1. Envoi incomplet : le navigateur n\'envoie rien —');
  await page.click('form.demande button[type=submit]'); await page.waitForTimeout(400);
  ok(envois.length === 0 && /rotaplan\.kd-mc\.com\/#demander$/.test(page.url()), 'tout vide → rien n\'est parti');
  await page.fill('input[name=prenom]', 'Marie'); await page.fill('input[name=nom]', 'Rossi');
  await page.fill('input[name=email]', 'marie.rossi@casino.example'); await page.fill('input[name=etablissement]', 'Casino de Test');
  await page.click('form.demande button[type=submit]'); await page.waitForTimeout(400);
  ok(envois.length === 0, 'conditions non cochées → rien n\'est parti');

  console.log('— 2. Fiche complète : demande reçue, rangée, Kevin prévenu —');
  await page.check('input[name=cgu]');
  await Promise.all([page.waitForNavigation({ timeout: 8000 }), page.click('form.demande button[type=submit]')]);
  const texte = await page.evaluate(() => document.body.innerText);
  ok(/Demande bien reçue/.test(texte) && /Marie/.test(texte), 'page « Demande bien reçue »');
  ok(demandes().length === 1, 'la demande est rangée (1)');
  const d = demandes().length ? JSON.parse(kv.get(demandes()[0])) : {};
  ok(d.prenom === 'Marie' && d.nom === 'Rossi' && d.email === 'marie.rossi@casino.example' && d.etablissement === 'Casino de Test' && d.cgu && d.cgu.acceptees, 'avec prénom, nom, e-mail, établissement et conditions acceptées (datées)');
  ok(pushes.some((x) => x.payload && /Marie Rossi/.test(x.payload.body) && /marie\.rossi@/.test(x.payload.body)), 'Kevin reçoit la notification avec le nom et l\'e-mail pour répondre');

  console.log('— 3. Le routeur revérifie (requêtes forgées) —');
  const forge = (corps, extra) => worker.fetch(new Request('https://rotaplan.kd-mc.com/__demande', { method: 'POST',
    headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded', origin: 'https://rotaplan.kd-mc.com' }, extra || {}), body: new URLSearchParams(corps).toString() }), env, { waitUntil() {} });
  const n0 = demandes().length;
  ok((await forge({ prenom: 'Zorro', email: 'z@z.fr', etablissement: 'X Casino', cgu: 'on' })).status === 400, 'sans nom → refusé par le routeur');
  ok((await forge({ prenom: 'Marc', nom: 'Dupont', email: 'marc@x.fr', etablissement: 'Casino Y' })).status === 400, 'sans conditions acceptées → refusé');
  ok((await forge({ prenom: 'Marc', nom: 'Dupont', email: 'pas-un-mail', etablissement: 'Casino Y', cgu: 'on' })).status === 400, 'e-mail invalide → refusé');
  ok((await forge({ prenom: 'Marc', nom: 'Dupont', email: 'marc@x.fr', etablissement: 'Casino Y', cgu: 'on' }, { origin: 'https://evil.example' })).status === 400, 'depuis un site étranger → refusé');
  ok((await forge({ prenom: 'Bot', nom: 'Bot', email: 'b@b.fr', etablissement: 'Spam', cgu: 'on', site: 'http://spam' })).status === 200 && demandes().length === n0, 'robot (piège rempli) → rien n\'est rangé');
  for (let i = 0; i < 6; i++) await forge({ prenom: 'Luc', nom: 'Martin', email: 'luc@x.fr', etablissement: 'Casino Z', cgu: 'on' });
  ok(demandes().length === n0 + 4, 'au plus 5 demandes par connexion et par jour (' + (demandes().length - n0) + ' de plus, attendu 4)');

  console.log('— 4. La liste des demandes : admin seulement —');
  const liste = (h) => worker.fetch(new Request('https://kd-mc.com/__demandes', { headers: h || {} }), env, { waitUntil() {} });
  ok((await liste()).status === 403, 'sans code admin → 403');
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const pl = b64u(JSON.stringify({ u: '__kdmc_admin__', n: 'admin', c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 }));
  const grant = pl + '.' + b64u(createHmac('sha256', 'sec').update(pl).digest());
  const r = await liste({ 'x-kdmc-admin': grant }); const j = await r.json();
  ok(r.status === 200 && j.n === demandes().length && j.demandes[0].nom, 'avec le code admin → la liste complète (' + j.n + ')');
} catch (e) {
  fails.push('exception : ' + String(e && e.message || e).slice(0, 300)); console.log('  ❌ exception : ' + String(e && e.message || e).slice(0, 300));
} finally { await browser.close(); }
console.log(`\n=== Rotaplan, demande de démo : ${pass} contrôles OK, ${fails.length} échec(s) ===`);
process.exit(fails.length ? 1 : 0);
