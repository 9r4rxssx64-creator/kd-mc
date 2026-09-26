// Preuve navigateur RÉEL (lesson #126) de l'auth Firebase par RÔLE (canary admin) :
//  1) /login-cmc renvoie id_token → token rôle posé + refresh caché + threadé (?auth=)
//  2) /login-cmc renvoie custom_token → échange client (signInWithCustomToken) → token rôle
//  3) worker KO → FAIL-OPEN vers l'auth anonyme (0 régression)
//  4) refresh SANS PIN via le refresh_token caché (boot/Face ID) → token rôle frais
//  5) refresh expiré → purge + retombe en anonyme
//  6) fbInit route vers role-refresh si armé, sinon anonyme
//  7) CSP : le worker apex-auth-worker est autorisé dans connect-src (sinon /login-cmc bloqué)
// Charge le VRAI index.html (fonctions globales). Les cas logique tournent dans UN
// seul evaluate avec window.fetch surchargé → immunisé contre l'auto-MAJ (navigation).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('../..'); // repo root
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/CMCteams')) p = p.slice('/CMCteams'.length);
  if (p === '/' || p === '') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log((c ? '✅' : '❌') + ' ' + m); };

// ── 7) Preuve CSP (string sur le HTML servi) ──
ok(/connect-src[^;]*apex-auth-worker\.9r4rxssx64\.workers\.dev/.test(HTML), '7/ CSP connect-src autorise le worker apex-auth-worker (sinon /login-cmc bloqué)');

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
let loaded = false;
await page.route('**', route => {
  const u = route.request().url();
  if (loaded && route.request().isNavigationRequest()) return route.abort();
  if (u.includes('127.0.0.1')) return route.continue();
  if (u.includes('firebasedatabase.app')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
page.on('pageerror', () => {});
await page.addInitScript(() => {
  try { window.location.replace = () => {}; } catch (_) {}
  try { window.location.assign = () => {}; } catch (_) {}
  try { window.location.reload = () => {}; } catch (_) {}
});
await page.goto(`http://127.0.0.1:${port}/CMCteams/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.cmcFbRoleAuth === 'function', { timeout: 8000 });
loaded = true;

// Tous les cas logique dans UN evaluate (window.fetch surchargé → réponses synthétiques).
const R = await page.evaluate(async () => {
  const realFetch = window.fetch;
  let cfg = {};
  const J = (obj, status) => Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } }));
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.includes('/login-cmc')) return cfg.loginCmc ? J(cfg.loginCmc, cfg.loginCmcStatus) : J({ ok: false, error: 'down' }, 502);
    if (u.includes('signInWithCustomToken')) return cfg.exchange ? J(cfg.exchange) : J({}, 500);
    if (u.includes('accounts:signUp')) return J({ idToken: 'ANON_IDT', expiresIn: '3600' });
    if (u.includes('securetoken')) return cfg.secure ? J(cfg.secure, cfg.secureStatus) : J({ error: { message: 'X' } }, 400);
    return J({}); // reste (RTDB) → vide
  };
  const run = (fn) => new Promise((res) => fn(res));
  const clear = () => { _fbAuthToken = null; _fbRoleRefresh = null; try { localStorage.removeItem('cmc_fb_role_refresh'); } catch (_) {} };
  const out = {};

  // 1) id_token direct
  cfg = { loginCmc: { ok: true, id_token: 'ROLE_IDT', refresh_token: 'RT1', expires_in: 3600 } };
  clear(); await run((cb) => cmcFbRoleAuth('U11804', '424242', cb));
  out.c1 = { tok: _fbAuthToken, rt: localStorage.getItem('cmc_fb_role_refresh'), qs: _fbAuthQS(), has: cmcHasRoleAuth() };

  // 2) custom_token → échange client
  cfg = { loginCmc: { ok: true, custom_token: 'CT' }, exchange: { idToken: 'ROLE_IDT2', refreshToken: 'RT2', expiresIn: '3600' } };
  clear(); await run((cb) => cmcFbRoleAuth('U11804', '424242', cb));
  out.c2 = { tok: _fbAuthToken, rt: localStorage.getItem('cmc_fb_role_refresh') };

  // 3) worker KO → fail-open anon
  cfg = { loginCmc: { ok: false, error: 'down' }, loginCmcStatus: 502 };
  clear(); await run((cb) => cmcFbRoleAuth('U11804', '424242', cb));
  out.c3 = { tok: _fbAuthToken, rt: localStorage.getItem('cmc_fb_role_refresh') };

  // 4) refresh sans PIN
  cfg = { secure: { id_token: 'ROLE_IDT3', refresh_token: 'RT3', expires_in: '3600' } };
  clear(); localStorage.setItem('cmc_fb_role_refresh', 'RTboot'); _fbRoleRefresh = 'RTboot';
  await run((cb) => cmcFbRoleRefresh(cb));
  out.c4 = { tok: _fbAuthToken, rt: localStorage.getItem('cmc_fb_role_refresh') };

  // 5) refresh expiré → purge + anon
  cfg = { secure: { error: { message: 'TOKEN_EXPIRED' } }, secureStatus: 400 };
  clear(); localStorage.setItem('cmc_fb_role_refresh', 'RTold'); _fbRoleRefresh = 'RTold';
  await run((cb) => cmcFbRoleRefresh(cb));
  out.c5 = { tok: _fbAuthToken, rt: localStorage.getItem('cmc_fb_role_refresh') };

  out.fbInit = String(fbInit).includes('cmcHasRoleAuth') && String(fbInit).includes('cmcFbRoleRefresh') && String(fbInit).includes('cmcFbAnonAuth');
  window.fetch = realFetch;
  return out;
});

ok(R.c1.tok === 'ROLE_IDT', '1/ token rôle posé depuis id_token (' + R.c1.tok + ')');
ok(R.c1.rt === 'RT1', '1/ refresh_token caché (cmc_fb_role_refresh)');
ok(R.c1.qs === '?auth=ROLE_IDT', '1/ threadé sur les écritures : ' + R.c1.qs);
ok(R.c1.has === true, '1/ cmcHasRoleAuth()=true');
ok(R.c2.tok === 'ROLE_IDT2', '2/ custom_token échangé côté client → token rôle (' + R.c2.tok + ')');
ok(R.c2.rt === 'RT2', '2/ refresh du token échangé caché');
ok(R.c3.tok === 'ANON_IDT', '3/ worker KO → FAIL-OPEN vers anonyme (' + R.c3.tok + ')');
ok(!R.c3.rt, '3/ aucun refresh rôle caché (reste anonyme, 0 régression)');
ok(R.c4.tok === 'ROLE_IDT3', '4/ refresh SANS PIN (boot/Face ID) → token rôle frais (' + R.c4.tok + ')');
ok(R.c4.rt === 'RT3', '4/ refresh_token roulé');
ok(R.c5.tok === 'ANON_IDT', '5/ refresh expiré → FAIL-OPEN anonyme (' + R.c5.tok + ')');
ok(!R.c5.rt, '5/ refresh rôle purgé (plus armé)');
ok(R.fbInit === true, '6/ fbInit route vers role-refresh si armé, sinon anonyme');

await browser.close();
server.close();
console.log(`\nverify-cmc-role-auth : ${pass} OK / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
