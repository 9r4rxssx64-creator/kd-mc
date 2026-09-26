/* Prouve l'AUTO-LOGIN « compte unique » dans la VRAIE app CMCteams (index.html),
   via une session Face ID prouvée sur le VRAI portail + le VRAI worker.
   - Kevin (proprio) Face ID → CMCteams ouvre AUTO la session ADMIN (U11804).
   - SÉCURITÉ : sans session → pas d'auto-login (écran de connexion normal).
   - SÉCURITÉ : client « verified » NON-admin (Laurence) → PAS d'admin auto.
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/kdmc-cmcteams-sso-e2e/run.mjs */
import http from 'http';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || ''; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const ROOT = process.cwd();
function loadPlaywright() {
  for (const base of [ROOT + '/', ROOT + '/apex-ai/v13/', ROOT + '/messaging-app/']) {
    try { return createRequire(base + 'package.json')('playwright'); } catch (e) { /* */ }
  }
  throw new Error('playwright introuvable');
}
const { chromium } = loadPlaywright();
const worker = (await import('file://' + ROOT + '/services/kdmc-router/worker.js')).default;

const PORT = 8796;
const ORIGIN = 'http://localhost:' + PORT;
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } };
const env = { KDMC_SSO_SECRET: 'cmc-sso-e2e', ACCOUNTS, KDMC_RP_ID: 'localhost', KDMC_RP_ORIGINS: ORIGIN };
const FILES = {
  '/': ['kdmc-home/index.html', 'text/html'],
  '/kdmc-sso.js': ['kdmc-home/kdmc-sso.js', 'application/javascript'],
  '/kdmc-portal.js': ['kdmc-home/kdmc-portal.js', 'application/javascript'],
  '/cmc': ['index.html', 'text/html'],
  '/sw.js': ['sw.js', 'application/javascript'],
};
function readBody(req) { return new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b || undefined)); }); }
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, ORIGIN); const p = u.pathname;
    if (p.startsWith('/__sso/') || p.startsWith('/__admin/')) {
      const body = (req.method !== 'GET' && req.method !== 'HEAD') ? await readBody(req) : undefined;
      const r = new Request(ORIGIN + req.url, { method: req.method, headers: req.headers, body });
      const wres = await worker.fetch(r, env);
      const h = {}; wres.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(wres.status, h); res.end(Buffer.from(await wres.arrayBuffer())); return;
    }
    const f = FILES[p];
    if (f) { res.writeHead(200, { 'content-type': f[1] }); res.end(readFileSync(ROOT + '/' + f[0])); return; }
    res.writeHead(404); res.end('nf');
  } catch (e) { res.writeHead(500); res.end('err:' + e.message); }
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const browser = await chromium.launch();

async function enroll(ctx, prenom, nom, code) {
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(ORIGIN + '/');
  await page.waitForSelector('#f-create', { timeout: 6000 });
  await page.fill('#f-prenom', prenom); await page.fill('#f-nom', nom);
  await page.fill('#f-code', code); await page.fill('#f-code2', code);
  await page.check('#cgu-ok'); await page.click('#f-create');
  await page.waitForSelector('#pk-go', { timeout: 6000 }); await page.click('#pk-go');
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, { timeout: 9000 });
  const token = await page.evaluate(() => window.kdmcSSO.token());
  await page.close();
  return token;
}
/* Charge la VRAIE app CMCteams avec le pass signé, attend le boot, renvoie l'uid de session. */
async function openCmc(ctx, token) {
  const page = await ctx.newPage();
  /* Boot rapide/déterministe : bloque seulement le réseau EXTERNE (CDN/Firebase) ;
     localhost (worker + app) passe. CMCteams est fail-open hors-ligne. */
  await page.route('**/*', (route) => {
    const url = route.request().url();
    return url.startsWith(ORIGIN) ? route.continue() : route.abort();
  });
  await page.goto(ORIGIN + '/cmc' + (token ? '#kdmc_sso=' + encodeURIComponent(token) : ''));
  await page.waitForFunction(() => typeof window.A === 'object' && window.A !== null && Array.isArray(window.A.employees), { timeout: 15000 });
  /* laisse l'auto-login asynchrone (fetch /__sso/whoami) se résoudre */
  const uid = await page.waitForFunction(() => (window.A && window.A.user && window.A.user.id) || (window.__cmcSettled ? 'NONE' : false), { timeout: 8000 })
    .then((h) => h.jsonValue()).catch(() => null);
  const info = await page.evaluate(() => ({ uid: window.A && window.A.user && window.A.user.id || null, AID: window.AID, isAdmin: !!(window.A && window.A.user && window.A.user.id === window.AID) }));
  await page.close();
  return info;
}

try {
  /* 1) KEVIN (proprio) + Face ID → CMCteams auto-login ADMIN U11804 */
  const c1 = await browser.newContext();
  const kevTok = await enroll(c1, 'Kevin', 'Desarzens', ADMIN_CODE);
  const kev = await openCmc(c1, kevTok);
  ok(kev && kev.uid === 'U11804' && kev.isAdmin === true,
    'Kevin Face ID → CMCteams ouvre AUTO la session ADMIN (' + JSON.stringify(kev) + ')');
  await c1.close();

  /* 2) SÉCURITÉ : aucune session domaine → AUCUN auto-login (login normal) */
  const c2 = await browser.newContext();
  const none = await openCmc(c2, '');
  ok(none && (none.uid === null || none.uid === 'NONE'),
    'Sans session Face ID → CMCteams NE connecte PAS automatiquement (' + JSON.stringify(none) + ')');
  await c2.close();

  /* 3) SÉCURITÉ : cliente « verified » NON-admin (Laurence) → PAS d'admin auto */
  const c3 = await browser.newContext();
  const lauTok = await enroll(c3, 'Laurence', 'Saint-Polit', '452100');
  const lau = await openCmc(c3, lauTok);
  ok(lau && lau.uid !== 'U11804' && lau.isAdmin === false,
    'Laurence (verified, non-admin) → PAS de session admin CMCteams (' + JSON.stringify(lau) + ')');
  await c3.close();
} finally {
  await browser.close();
  server.close();
}
console.log('\nKDMC × CMCteams auto-login E2E: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
