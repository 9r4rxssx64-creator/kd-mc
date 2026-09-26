/* Test E2E autonome (vrai Chromium) du SSO "pass signé" du domaine kd-mc.com.
   - Sert le VRAI worker (services/kdmc-router/worker.js) pour /__sso/* + /__admin/*
     avec un KV en mémoire, et les VRAIS fichiers du portail (kdmc-home/*).
   - Pilote un vrai navigateur (Playwright/Chromium) pour prouver le parcours client.
   - Sur localhost, le cookie `Secure; Domain=.kd-mc.com` n'est PAS stockable →
     simule exactement l'isolation des PWA iOS → prouve le canal "pass signé" (Bearer).
   Lancement : PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/kdmc-sso-e2e/run.mjs */
import http from 'http';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
/* CODE DE TEST — surtout PAS le vrai code de Kevin.
 *
 * TROUVÉ LE 22.09.2026, cause de 2 contrôles rouges à CHAQUE exécution depuis des
 * semaines : cette ligne lisait un secret `KDMC_ADMIN_CODE` que le workflow ne pose
 * NULLE PART (vérifié : 0 occurrence dans kdmc-sso-e2e.yml). Le code arrivait donc
 * vide, le portail répondait « Code trop court (6 chiffres minimum) » et abandonnait
 * AVANT de demander un pass au domaine — d'où « pass non stocké » et « fiche KV
 * absente ». Autrement dit : un rouge permanent qui ne disait rien du produit, et qui
 * apprenait à tout le monde à ignorer ce contrôle.
 *
 * Aucune de ces vérifications n'a besoin du VRAI code : elles portent sur le rangement
 * du pass et sur la fiche canonique, que le domaine décide à partir du NOM. Le second
 * scénario du fichier (Sandrine) le prouve — il utilise « 123456 » et passe. On fait
 * donc pareil, et le vrai code n'a plus aucune raison d'approcher un test (règle
 * absolue : il ne s'écrit nulle part, pas même en secret de test). */
const ADMIN_CODE = '123456';

const ROOT = process.cwd(); /* lancer depuis la racine du repo */
function loadPlaywright() {
  for (const base of [ROOT + '/', ROOT + '/apex-ai/v13/', ROOT + '/messaging-app/']) {
    try { return createRequire(base + 'package.json')('playwright'); } catch (e) { /* suivant */ }
  }
  throw new Error('playwright introuvable (npm i playwright)');
}
const { chromium } = loadPlaywright();
const worker = (await import('file://' + ROOT + '/services/kdmc-router/worker.js')).default;

/* KV en mémoire (registre fiches) */
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } };
const env = { KDMC_SSO_SECRET: 'e2e-secret-123', ACCOUNTS };

const FILES = {
  '/': ['kdmc-home/index.html', 'text/html'],
  '/kdmc-sso.js': ['kdmc-home/kdmc-sso.js', 'application/javascript'],
  '/kdmc-portal.js': ['kdmc-home/kdmc-portal.js', 'application/javascript'],
  '/admin/': ['kdmc-home/admin/index.html', 'text/html'],
  '/admin/admin.js': ['kdmc-home/admin/admin.js', 'application/javascript'],
  '/design-system.css': ['kdmc-home/design-system.css', 'text/css'],
};
const APP_HTML = `<!doctype html><meta charset=utf8><title>app</title><body>
<div id=status>boot</div>
<script src="/kdmc-sso.js"></script>
<script>
(async function(){
  try {
    var s = await window.kdmcSSO.ensureSession(location.origin + '/app.html');
    document.getElementById('status').textContent = s ? ('OK|'+s.name+'|admin='+s.admin) : 'NO_SESSION';
  } catch(e){ document.getElementById('status').textContent = 'ERR|'+e.message; }
})();
</script></body>`;

function readBody(req) {
  return new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b || undefined)); });
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    const u = new URL(req.url, 'http://' + host);
    const p = u.pathname;
    if (p.startsWith('/__sso/') || p.startsWith('/__admin/')) {
      const body = (req.method !== 'GET' && req.method !== 'HEAD') ? await readBody(req) : undefined;
      const r = new Request('http://' + host + req.url, { method: req.method, headers: req.headers, body });
      const wres = await worker.fetch(r, env);
      const h = {};
      wres.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(wres.status, h);
      res.end(Buffer.from(await wres.arrayBuffer()));
      return;
    }
    if (p === '/app.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(APP_HTML); return; }
    const f = FILES[p];
    if (f) { res.writeHead(200, { 'content-type': f[1] }); res.end(readFileSync(ROOT + '/' + f[0])); return; }
    res.writeHead(404); res.end('nf');
  } catch (e) { res.writeHead(500); res.end('err:' + e.message); }
});

const PORT = 8799;
await new Promise((r) => server.listen(PORT, r));
const ORIGIN = 'http://localhost:' + PORT;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();

  /* ---- TEST 1 : portail — création compte ADMIN (Kevin) → zone admin visible ---- */
  let page = await ctx.newPage();
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => !!document.getElementById('f-create'), { timeout: 5000 }).catch(() => {});
  await page.fill('#f-prenom', 'Kevin');
  await page.fill('#f-nom', 'Desarzens');
  await page.fill('#f-code', ADMIN_CODE);
  await page.fill('#f-code2', ADMIN_CODE);
  await page.check('#cgu-ok');
  await page.click('#f-create');
  /* Après la création, le portail propose l'écran « Activer Face ID ». Ici Kevin est
     AUTO-DÉCLARÉ (nom+code, PAS de Face ID) → on passe via « Plus tard » (#pk-skip).
     Leçon #99 : un nom auto-déclaré n'accorde AUCUN droit → Administration CACHÉE tant
     qu'il n'est pas « verified » (Face ID). Le chemin positif (admin VISIBLE avec Face ID)
     est prouvé par kdmc-multiapp-e2e + kdmc-passkey-e2e (authentificateur virtuel). */
  await page.waitForFunction(() => !!document.getElementById('pk-skip') || (document.getElementById('hub') && !document.getElementById('hub').hidden), { timeout: 5000 }).catch(() => {});
  const pkSkip = await page.$('#pk-skip');
  if (pkSkip) await pkSkip.click();
  await page.waitForFunction(() => document.getElementById('hub') && !document.getElementById('hub').hidden, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const adminHidden1 = await page.evaluate(() => { var z = document.getElementById('admin-zone'); return !z || z.hidden === true; });
  ok(adminHidden1, 'Portail : Kevin auto-déclaré (nom+code, SANS Face ID) → Administration CACHÉE (leçon #99 ; admin AVEC Face ID prouvé par multiapp-e2e)');
  const tok = await page.evaluate(() => window.kdmcSSO.token());
  ok(!!tok && tok.indexOf('.') > 0, 'Portail : pass signé stocké en localStorage (canal cross-PWA)');
  /* le KV doit contenir la fiche Kevin — sous son uid CANONIQUE : depuis « un compte par
     personne » (05/08/2026, CANON_UID = kdmc_admin), « kevin-desarzens » déclaré au portail est
     fusionné dans la fiche kdmc_admin. Ce contrôle attendait encore l'ancienne clé
     (acc:kevin-desarzens) → rouge à chaque exécution depuis, sans que personne ne le voie :
     l'étape d'installation tombait avant (mesuré le 11/09/2026). */
  ok(kv.has('acc:kdmc_admin') && !kv.has('acc:kevin-desarzens'), 'Worker : fiche client enrichie dans le registre KV (fiche canonique kdmc_admin, pas de doublon)');
  await page.close();

  /* ---- TEST 2 : portail — compte CLIENT (non-admin) → zone admin CACHÉE ---- */
  const ctx2 = await browser.newContext();
  page = await ctx2.newPage();
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => !!document.getElementById('f-create'), { timeout: 5000 }).catch(() => {});
  await page.fill('#f-prenom', 'Sandrine');
  await page.fill('#f-nom', 'Client');
  await page.fill('#f-code', '123456');
  await page.fill('#f-code2', '123456');
  await page.check('#cgu-ok');
  await page.click('#f-create');
  /* Passe l'écran « Activer Face ID » pour atteindre le hub réel (cf. TEST 1). */
  await page.waitForFunction(() => !!document.getElementById('pk-skip') || (document.getElementById('hub') && !document.getElementById('hub').hidden), { timeout: 5000 }).catch(() => {});
  const pkSkip2 = await page.$('#pk-skip');
  if (pkSkip2) await pkSkip2.click();
  await page.waitForFunction(() => document.getElementById('hub') && !document.getElementById('hub').hidden, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const adminHidden = await page.evaluate(() => { var z = document.getElementById('admin-zone'); return !z || z.hidden === true; });
  ok(adminHidden, 'Portail : compte client (Sandrine) → section Administration CACHÉE');
  await ctx2.close();

  /* ---- TEST 3 : app installée (cross-PWA) — reçoit le pass dans le lien (#) ---- */
  /* On récupère un vrai token signé via /__sso/issue, puis on ouvre l'app avec
     #kdmc_sso=<token> (comme le ferait le retour depuis le domaine). */
  const ctx3 = await browser.newContext();
  page = await ctx3.newPage();
  const issued = await page.request.post(ORIGIN + '/__sso/issue', { data: { uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true } });
  const ij = await issued.json();
  ok(ij.ok && typeof ij.token === 'string', 'Worker : /__sso/issue renvoie le token signé dans le corps');
  await page.goto(ORIGIN + '/app.html#kdmc_sso=' + encodeURIComponent(ij.token));
  await page.waitForFunction(() => document.getElementById('status').textContent !== 'boot', { timeout: 6000 }).catch(() => {});
  const st = await page.evaluate(() => document.getElementById('status').textContent);
  ok(/^OK\|Kevin Desarzens\|admin=false/.test(st), 'App PWA : pass du lien consommé → whoami via Bearer (SANS cookie) → session RECONNUE (uid/nom) mais admin=false sans Face ID (leçon #99 cross-PWA)  [' + st + ']');
  const hashCleared = await page.evaluate(() => location.hash.indexOf('kdmc_sso') < 0);
  ok(hashCleared, 'App PWA : le pass est retiré de l’URL après consommation (propre)');
  await ctx3.close();

  /* ---- TEST 4 : anti-verrouillage — pass invalide → PAS de boucle de redirection ---- */
  const ctx4 = await browser.newContext();
  page = await ctx4.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('kdmc_sso_token', 'pas.un.vrai.token'); } catch (e) {} });
  await page.goto(ORIGIN + '/app.html');
  await page.waitForFunction(() => document.getElementById('status').textContent !== 'boot', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(500);
  const url4 = page.url();
  const st4 = await page.evaluate(() => document.getElementById('status') ? document.getElementById('status').textContent : '(page partie)');
  ok(url4.indexOf('localhost') >= 0 && st4 === 'NO_SESSION', 'Anti-boucle : pass KO → reste sur l’app (pas de redirection infinie vers le domaine)  [' + st4 + ']');
  await ctx4.close();

} finally {
  await browser.close();
  server.close();
}

console.log('\nKDMC SSO E2E (Chromium réel): ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
