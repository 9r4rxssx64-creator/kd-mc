// Preuve navigateur RÉEL (lesson #126) que le dashboard lit les commandes AVEC le
// token admin quand il l'a, RETOMBE en lecture anonyme sinon (0 lockout tant que la
// règle orders/.read reste ouverte), et AUTO-RÉPARE si la règle est verrouillée
// (401 → demande le code admin → login → re-fetch authentifié).
// Sert le repo (strip /CMCteams comme le router) + mocke Firebase REST + /__admin/*.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('../..'); // repo root (…/CMCteams)
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/CMCteams')) p = p.slice('/CMCteams'.length); // router passthrough
  if (p === '/' || p === '') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const URL = `http://127.0.0.1:${port}/CMCteams/shops/dashboard/index.html`;

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log((c ? '✅' : '❌') + ' ' + m); };

const ORDERS = { 'chez-lolo': { o1: { orderId: 'o1', shop: 'chez-lolo', total: 42, ts: 1 } } };

// État serveur simulé, piloté par test : grant présent ? règle verrouillée ?
async function newPage(browser, { hasGrant, ruleLocked, blockFbScript }) {
  const st = { hasGrant: !!hasGrant, ruleLocked: !!ruleLocked, fbGetUrls: [], loginCalls: 0, tokenCalls: 0 };
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/__sso/whoami*', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }));
  await page.route('**/__admin/fbtoken', r => {
    st.tokenCalls++;
    if (st.hasGrant) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id_token":"TOK123","expires_in":3600}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.route('**/__admin/login', r => {
    st.loginCalls++;
    const body = JSON.parse(r.request().postData() || '{}');
    if (String(body.code) === '424242') { st.hasGrant = true; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"grant":"G"}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.route('**/orders.json**', r => {
    const u = r.request().url();
    st.fbGetUrls.push(u);
    const hasAuth = /[?&]auth=/.test(u);
    if (st.ruleLocked && !hasAuth) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Permission denied"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ORDERS) });
  });
  if (blockFbScript) await page.route('**/_shared/firebase-orders.js', r => r.fulfill({ status: 404, body: 'nf' }));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  return { page, st, ctx };
}

const browser = await chromium.launch();

// ── A) Règle OUVERTE + pas de grant → lecture ANONYME (fail-open, 0 lockout) ──
{
  const { page, st, ctx } = await newPage(browser, { hasGrant: false, ruleLocked: false });
  const orders = await page.evaluate(() => fbGetAll());
  ok(orders && orders['chez-lolo'] && orders['chez-lolo'].o1, 'A/ règle ouverte + sans grant → commandes lues (fail-open)');
  ok(st.fbGetUrls.length >= 1 && !/[?&]auth=/.test(st.fbGetUrls[st.fbGetUrls.length - 1]), 'A/ dernier GET SANS ?auth= (lecture anonyme)');
  ok(typeof await page.evaluate(() => window.kdmcAdminAuthQS), 'A/ firebase-orders chargé (kdmcAdminAuthQS présent)');
  await ctx.close();
}

// ── B) Grant présent → le GET porte ?auth=<token> ──
{
  const { page, st, ctx } = await newPage(browser, { hasGrant: true, ruleLocked: false });
  await page.evaluate(() => fbGetAll());
  const last = st.fbGetUrls[st.fbGetUrls.length - 1] || '';
  ok(/[?&]auth=TOK123/.test(last), 'B/ avec grant → GET porte ?auth=<token admin> : ' + /auth=TOK123/.test(last));
  await ctx.close();
}

// ── C) Règle VERROUILLÉE + pas de grant → 401 → auto-prompt code → login → re-fetch authentifié ──
{
  const { page, st, ctx } = await newPage(browser, { hasGrant: false, ruleLocked: true });
  // 1er GET anonyme → 401 → _ordersBlocked() ouvre la modale
  const p = page.evaluate(() => fbGetAll());
  await page.waitForSelector('#_dc_in', { timeout: 3000 });
  ok(true, 'C/ 401 → modale « Code admin » affichée (auto-réparation)');
  await page.fill('#_dc_in', '424242');
  await page.click('#_dc_ok');
  await p.catch(() => {});
  await page.waitForTimeout(400); // login + startFbListener re-fetch
  ok(st.loginCalls === 1, 'C/ /__admin/login appelé une fois (code saisi)');
  const authed = st.fbGetUrls.filter(u => /[?&]auth=TOK123/.test(u));
  ok(authed.length >= 1, 'C/ re-fetch AUTHENTIFIÉ après login (' + authed.length + ' GET avec ?auth=)');
  const secured = await page.evaluate(() => _secured);
  ok(secured === true, 'C/ _secured=true (accès admin débloqué)');
  await ctx.close();
}

// ── D) firebase-orders.js ABSENT → lecture anonyme quand même (jamais de lockout) ──
{
  const { page, st, ctx } = await newPage(browser, { hasGrant: false, ruleLocked: false, blockFbScript: true });
  const noQS = await page.evaluate(() => window.kdmcAdminAuthQS);
  ok(!noQS, 'D/ firebase-orders absent → kdmcAdminAuthQS indéfini');
  const orders = await page.evaluate(() => fbGetAll());
  ok(orders && orders['chez-lolo'], 'D/ lecture anonyme fonctionne quand même (règle ouverte) — 0 lockout');
  ok(st.fbGetUrls.length >= 1 && !/[?&]auth=/.test(st.fbGetUrls[st.fbGetUrls.length - 1]), 'D/ GET sans ?auth= (pas de token dispo)');
  await ctx.close();
}

// ── E) le bouton « 🔐 Code admin » existe dans le topbar rendu ──
{
  const { page, ctx } = await newPage(browser, { hasGrant: false, ruleLocked: false });
  const hasBtn = await page.evaluate(() => topbar('X').includes('secureDashboard()') && topbar('X').includes('Code admin'));
  ok(hasBtn, 'E/ bouton « 🔐 Code admin » (secureDashboard) présent dans le topbar');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nverify-orders-auth (dashboard) : ${pass} OK / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
