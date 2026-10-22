// PREUVE EN VRAI NAVIGATEUR (22.10.2026) — Kevin : « toujours pas » (v1.1.340, app rouverte, une seule conversation « Kevin DESARZENS »).
// Cause mesurée : quand l'app se rouvre avec une session GARDÉE, le chemin de reprise ne lançait jamais la réunion des comptes
// (seule une connexion complète la lançait). Ce script charge la VRAIE page dans un vrai Chromium avec la session gardée de
// Kevin (ancien identifiant `kdmc_kdmc_admin`), un serveur simulé qui a déjà fondu ses comptes (`/api/users/me` rend
// `kdmc_admin`), et vérifie qu'en rouvrant l'app : la page adopte le vrai compte et récupère Laurence + Rémy.
//   node tests/runtime-ralliement-reprise.mjs        (code 0 = prouvé, 1 sinon)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = process.env.PAGE_INDEX || join(ROOT, 'index.html');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const chemin = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const p = chemin === 'index.html' ? PAGE : join(ROOT, chemin);
  if (!existsSync(p)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
const ok = [], ko = [];
const check = (c, m) => { (c ? ok : ko).push(m); console.log(`  ${c ? '✅' : '❌'} ${m}`); };
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const PRE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(PRE) ? { executablePath: PRE } : {});
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });   // sinon le service worker de l'app fait les appels lui-même et échappe au serveur simulé
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seed')) return;
    sessionStorage.setItem('seed', '1');
    const P = 'apex_chat_';
    localStorage.setItem(P + 'user', JSON.stringify({ id: 'kdmc_kdmc_admin', pseudo: 'kevindesarzen_iznxii', real_name: 'kevin Desarzens', kdmc_uid: 'kdmc_admin', is_admin: 1, is_kevin_alias: 1, source: 'kdmc-sso', phone: '+33600000000' }));
    localStorage.setItem(P + 'token', JSON.stringify('JETON-ANCIEN'));
    localStorage.setItem(P + 'pin_set', JSON.stringify(true));
    localStorage.setItem('apex_chat_perms_v1', JSON.stringify({ ts: Date.now(), granted: false }));
    localStorage.setItem('apex_chat_perms_bulk_done_v1', 'true');
  });
  const page = await ctx.newPage();
  const vus = [];
  const MOI = { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS', kdmc_uid: 'kdmc_admin', is_admin: 1, is_kevin_alias: 1, source: 'apex-sso', phone: '+33600000000' };
  const CONVS = [
    { id: 'conv-laurence', type: 'dm', peer_id: 'u-laurence', members: ['u-laurence', 'kdmc_admin'], last_msg_ts: Date.now() - 1000, member_count: 2 },
    { id: 'conv-remy', type: 'dm', peer_id: 'kdmc_remy-ledren', members: ['kdmc_admin', 'kdmc_remy-ledren'], last_msg_ts: Date.now() - 2000, member_count: 2 },
  ];
  await page.route('**', (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.port === String(port)) return route.continue();
    if (u.host === 'apex-chat-api.9r4rxssx64.workers.dev') {
      vus.push(`${req.method()} ${u.pathname} ${req.headers()['authorization'] || ''}`);
      const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (u.pathname === '/api/users/me' && req.method() === 'GET') return j({ ok: true, user: MOI });
      if (u.pathname === '/api/conversations' && req.method() === 'GET') return j({ ok: true, conversations: CONVS });
      return j({ ok: true });
    }
    return route.abort();
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.K === 'object' && window.K.user, null, { timeout: 15000 });
  check(await page.evaluate(() => window.K.user.id === 'kdmc_kdmc_admin'), 'au démarrage, la session gardée est bien l\'ancien identifiant (situation de Kevin)');
  await page.waitForFunction(() => window.K.user && window.K.user.id === 'kdmc_admin', null, { timeout: 12000 }).catch(() => {});
  check(vus.some((v) => v === 'GET /api/users/me Bearer JETON-ANCIEN'), 'à la réouverture, la page demande son profil au serveur (avec son jeton gardé)');
  check(await page.evaluate(() => window.K.user.id === 'kdmc_admin'), 'la page adopte le compte réuni kdmc_admin');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('apex_chat_user') || '{}').id === 'kdmc_admin'), 'le compte réuni est gardé pour les prochaines ouvertures');
  await page.waitForFunction(() => (window.K.conversations || []).some((c) => c.id === 'conv-laurence'), null, { timeout: 8000 }).catch(() => {});
  const ids = await page.evaluate(() => (window.K.conversations || []).map((c) => c.id));
  check(ids.includes('conv-laurence') && ids.includes('conv-remy'), `Laurence ET Rémy sont dans la liste (${ids.join(', ')})`);
} finally {
  await browser.close(); server.close();
}
console.log(`\n=== ${ok.length} OK / ${ko.length} KO ===`);
process.exit(ko.length ? 1 : 0);
