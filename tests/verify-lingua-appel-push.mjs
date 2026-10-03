/* 📞 BEE T'APPELLE MÊME APP FERMÉE — côté téléphone, vrai navigateur, VRAI service worker (servi sur localhost),
 * VRAI routeur (D1 sur SQLite). Le service de notifications et l'abonnement du navigateur sont simulés (pas de
 * réseau ici), la notification elle-même est livrée au service worker par Chromium (CDP deliverPushMessage).
 *   1. Réglages des appels → « Qu'elle m'appelle même app fermée » → le domaine enregistre l'abonnement avec
 *      l'heure, le FUSEAU du téléphone, la langue, la mascotte ; l'horloge est armée ;
 *   2. l'heure change → le domaine est prévenu ;
 *   3. l'appel sonne dans l'app → « appel fait » envoyé (pas de 2e sonnerie par notification ce jour-là) ;
 *   4. une notification arrive → le service worker affiche « 📞 Bee t'appelle », qui RESTE à l'écran, lien #appel ;
 *   5. « Ne plus m'appeler app fermée » → effacé côté domaine ;
 *   6. iPhone dans Safari (pas sur l'écran d'accueil) → on guide (« ajoute Lingua à l'écran d'accueil »), pas de bouton ;
 *   7. aucune erreur JavaScript.
 * node tests/verify-lingua-appel-push.mjs */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { chromium, devices } from 'playwright';
import mod from '../services/kdmc-router/worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 260) : ''}`); };
const s = new DatabaseSync(':memory:');
const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }), run: async () => { s.prepare(sql).run(...p); return { meta: {} }; } });
const armees = [];
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PUSH_URL: 'https://push.test', KDMC_PUSH_TOKEN: 't', CERCLE_DB: { prepare: (q) => st(q) },
  ACCOUNTS: { get: async () => null, put: async () => {} }, APPEL_REVEIL: { idFromName: (n) => n, get: () => ({ fetch: async () => { armees.push(1); return new Response('{}'); } }) } };
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => (String(u) === 'https://push.test/health' ? new Response(JSON.stringify({ ok: true, vapidPublic: 'BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY' })) : vraiFetch(u, i));
const T = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', webmanifest: 'application/manifest+json', mp4: 'video/mp4' };
const PORT = 8799, BASE = 'http://localhost:' + PORT;
const srv = http.createServer(async (req, rep) => { try { const u = new URL(req.url, BASE);
  if (u.pathname.startsWith('/__')) { const corps = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
    const h = Object.assign({}, req.headers, { origin: 'https://lingua.kd-mc.com', referer: 'https://lingua.kd-mc.com/' }); delete h.host;
    const r = await mod.fetch(new Request('https://lingua.kd-mc.com' + req.url, { method: req.method, headers: h, body: corps }), env, { waitUntil() {} });
    const hh = {}; r.headers.forEach((v, k) => { hh[k] = v; }); rep.writeHead(r.status, hh); rep.end(Buffer.from(await r.arrayBuffer())); return; }
  const f = 'lingua' + (u.pathname === '/' ? '/index.html' : u.pathname);
  if (!existsSync(f)) { rep.writeHead(404); rep.end(''); return; }
  rep.writeHead(200, { 'content-type': T[f.split('.').pop()] || 'application/octet-stream' }); rep.end(readFileSync(f)); } catch (e) { rep.writeHead(500); rep.end(String(e)); } });
await new Promise((r) => srv.listen(PORT, r));
const lignes = () => { try { return s.prepare('SELECT * FROM appel_push').all(); } catch { return []; } };
const SEED = (c) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1');
  localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'k', name: 'Kevin Test', avatar: '🦊', code: '', created: 1 }])); localStorage.setItem('lingua_g_current', JSON.stringify('k'));
  localStorage.setItem('lingua_a_k_course', JSON.stringify('en')); localStorage.setItem('lingua_a_k_placeAsked', 'true'); localStorage.setItem('lingua_a_k_sound', 'false');
  localStorage.setItem('lingua_a_k_appels', JSON.stringify({ n: 0, jours: {}, heure: '18:30', apresLecon: false })); };
/* le vrai Chromium (pas la version allégée « headless shell ») : lui seul sait afficher des notifications */
const nav = await chromium.launch({ channel: 'chromium' });
console.log('\nBee t\'appelle même app fermée — vrai navigateur, vrai service worker, vrai routeur\n');
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.grantPermissions(['notifications'], { origin: BASE });   /* l'autorisation que le téléphone donne quand on touche « Autoriser » */
  await ctx.addInitScript(SEED);
  /* l'app parle au domaine par son adresse complète (SYNC_BASE) : on la renvoie vers le routeur local */
  await ctx.route(/^https:\/\/lingua\.kd-mc\.com\/__/, async (route) => { const r = route.request(); const u = new URL(r.url());
    const h = Object.assign({}, r.headers(), { origin: 'https://lingua.kd-mc.com', referer: 'https://lingua.kd-mc.com/' });
    const rep = await mod.fetch(new Request(u.href, { method: r.method(), headers: h, body: ['GET', 'HEAD'].includes(r.method()) ? undefined : r.postData() }), env, { waitUntil() {} });
    const hh = {}; rep.headers.forEach((v, k) => { hh[k] = v; }); return route.fulfill({ status: rep.status, headers: Object.assign(hh, { 'access-control-allow-origin': '*' }), body: Buffer.from(await rep.arrayBuffer()) }); });
  await ctx.addInitScript(() => { /* le navigateur de test n'a pas de service de notifications : on simule SEULEMENT l'abonnement */
    window.__desabonne = 0; const SUB = { endpoint: 'https://web.push.apple.com/QWTEST', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPTEST', auth: 'AUTEST' } }; }, unsubscribe: async () => { window.__desabonne++; return true; } };
    let abonne = false;
    try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); } catch (e) {}
    Notification.requestPermission = async () => 'granted';
    if (window.PushManager) { PushManager.prototype.subscribe = async function () { abonne = true; return SUB; }; PushManager.prototype.getSubscription = async function () { return abonne ? SUB : null; }; } });
  const errs = []; const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/'); await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== undefined, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const swOk = await p.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)).catch(() => false);
  ok(swOk, '0. le vrai service worker de Lingua est installé et actif');
  /* 1 */
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Appeler Bee/.test(b.innerText))?.click()); await p.waitForTimeout(600);
  const avant = await p.evaluate(() => (document.querySelector('#apPush') || {}).innerText || '');
  ok(/même app fermée/.test(avant), '1. réglages des appels : la section « même app fermée » est là', avant);
  await p.evaluate(() => [...document.querySelectorAll('#apPush button')].find((b) => /même app fermée/.test(b.innerText))?.click()); await p.waitForTimeout(1500);
  let L = lignes();
  ok(L.length === 1 && L[0].heure === '18:30' && L[0].tz === 'Europe/Paris' && L[0].langue === 'Anglais' && L[0].mascotte === 'bee' && armees.length >= 1, '1b. le domaine enregistre heure 18:30, fuseau Europe/Paris, Anglais, Bee ; horloge armée', JSON.stringify(L.map((x) => ({ h: x.heure, tz: x.tz, l: x.langue, m: x.mascotte }))));
  const apres = await p.evaluate(() => (document.querySelector('#apPush') || {}).innerText || '');
  ok(/Activé/.test(apres) && /18:30/.test(apres) && /Ne plus m'appeler/.test(apres), '1c. l\'écran dit « Activé : Bee t\'appelle chaque jour à 18:30 »', apres);
  /* 2 */
  await p.fill('#apHeure', '07:15'); await p.dispatchEvent('#apHeure', 'change'); await p.waitForTimeout(1200);
  ok(lignes()[0].heure === '07:15', '2. l\'heure change → le domaine est prévenu (07:15)', lignes()[0]?.heure);
  await p.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /Enregistrer/.test(b.innerText))?.click()); await p.waitForTimeout(400);
  /* 3 */
  await p.evaluate(() => { location.hash = '#appel'; }); await p.waitForTimeout(1500);
  ok(!!(await p.$('.appel-ov')) && !!lignes()[0].envoye, '3. l\'appel sonne dans l\'app → « appel fait » noté côté domaine (pas de 2e sonnerie par notification)', lignes()[0]?.envoye);
  await p.click('.ap-plustard').catch(() => {});
  /* 4 */
  const cdp = await ctx.newCDPSession(p); await cdp.send('ServiceWorker.enable');
  const regs = []; cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations)); await p.waitForTimeout(500);
  const reg = regs.find((r) => r.scopeURL.startsWith(BASE));
  if (reg) await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: reg.registrationId, data: JSON.stringify({ title: "📞 Bee t'appelle", body: "Ta petite leçon d'anglais au téléphone — touche pour décrocher", url: BASE + '/#appel', tag: 'lingua-appel', requireInteraction: true }) });
  await p.waitForTimeout(1200);
  const notifs = await p.evaluate(() => navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((ns) => ns.map((n) => ({ t: n.title, b: n.body, ri: n.requireInteraction, tag: n.tag, url: n.data && n.data.url }))));
  if (!reg || !notifs.length) console.log('   (diag) inscriptions SW vues :', JSON.stringify(regs.map((r) => r.scopeURL)));
  ok(!!reg && notifs.length === 1 && notifs[0].t === "📞 Bee t'appelle" && notifs[0].ri === true && notifs[0].tag === 'lingua-appel' && /#appel$/.test(notifs[0].url), '4. une notification arrive → le service worker affiche « 📞 Bee t\'appelle », qui reste à l\'écran, lien #appel', JSON.stringify(notifs));
  /* 5 */
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Appeler Bee/.test(b.innerText))?.click()); await p.waitForTimeout(600);
  await p.evaluate(() => [...document.querySelectorAll('#apPush button')].find((b) => /Ne plus/.test(b.innerText))?.click()); await p.waitForTimeout(1200);
  ok(lignes().length === 0 && (await p.evaluate(() => window.__desabonne)) === 1, '5. « Ne plus m\'appeler app fermée » → effacé côté domaine et désabonné sur le téléphone');
  ok(errs.length === 0, '7. aucune erreur JavaScript', errs.join(' | '));
  await ctx.close();
  /* 6 */
  const ip = await nav.newContext(Object.assign({}, devices['iPhone 13'], { locale: 'fr-FR', serviceWorkers: 'block' })); await ip.addInitScript(SEED);
  const q = await ip.newPage(); await q.goto(BASE + '/'); await q.waitForTimeout(2200);
  await q.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Appeler Bee/.test(b.innerText))?.click()); await q.waitForTimeout(600);
  const t6 = await q.evaluate(() => (document.querySelector('#apPush') || {}).innerText || '');
  ok(/écran d'accueil/.test(t6) && /Partager/.test(t6) && !(await q.$('#apPush button')), '6. iPhone dans Safari : « ajoute Lingua à l\'écran d\'accueil (Partager ⬆️) », pas de bouton qui échouerait', t6);
  await ip.close();
} finally { await nav.close(); srv.close(); }
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
