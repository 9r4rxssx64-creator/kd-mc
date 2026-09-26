/* Simulation RÉELLE multi-identités × multi-apps du « compte unique » kd-mc.com.
   Vrai Chromium + authentificateur VIRTUEL (CDP WebAuthn) contre le VRAI worker
   (vérification ES256) + le VRAI portail + le VRAI client SSO (kdmc-sso.js).

   Prouve, pour PLUSIEURS personnes différentes, le chemin ENTIER de connexion et
   la politique « Admin auto, toi seul » :
   1) Kevin (propriétaire) : création → Face ID → la POLITIQUE app `autoLogin()`
      renvoie role 'admin' (auto-login admin dans ses apps).
   2) SÉCURITÉ — Kevin mais SANS Face ID (nom tapé + code choisi, enrôlement sauté) :
      `autoLogin()` renvoie null → AUCUN auto-login admin. La faille reste fermée.
   3) Laurence (cliente) : création → Face ID → role 'user' (session normale).
   4) Compte tout neuf (Alice) : création → Face ID → role 'user'.
   5) MULTI-APP — une 2e app (contexte navigateur ISOLÉ, sans cookies, comme une PWA
      iOS installée séparément) reconnaît Kevin en admin via le seul pass signé
      (Authorization: Bearer) → preuve que « le compte unique » marche entre apps.

   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/kdmc-multiapp-e2e/run.mjs */
import http from 'http';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
/* CODE DE TEST — surtout PAS le vrai code de Kevin.
 *
 * PROPAGÉ LE 26.09.2026. Cette ligne lisait un secret `KDMC_ADMIN_CODE` que le workflow
 * kdmc-sso-e2e.yml ne pose NULLE PART (vérifié : 0 occurrence). Le code arrivait donc
 * VIDE, le portail répondait « Code trop court (6 chiffres minimum) » et abandonnait avant
 * la suite — et l'échec se présentait comme « timeout en attendant le bouton #pk-go », qui
 * ne dit rien de la vraie cause. Résultat mesuré : ce robot échouait à CHAQUE exécution
 * depuis au moins le 23.09, sur `main` comme sur toutes les branches (12 runs consultés,
 * 12 rouges) — un rouge permanent qui apprend à tout le monde à l'ignorer.
 *
 * Le diagnostic et le remède existaient DÉJÀ, écrits le 22.09 en tête de
 * tools/kdmc-sso-e2e/run.mjs… et n'avaient été appliqués qu'à CE fichier sur quatre.
 * Une correction posée sur une copie sur quatre n'est pas une correction.
 *
 * Aucun de ces contrôles n'a besoin du VRAI code : ils créent un compte de test et
 * portent sur le passkey, la session forte et le rangement du pass — que le domaine
 * décide à partir du NOM. Règle absolue : le code admin ne s'écrit nulle part, pas même
 * en secret de test. */
const ADMIN_CODE = '123456';

const ROOT = process.cwd();
function loadPlaywright() {
  for (const base of [ROOT + '/', ROOT + '/apex-ai/v13/', ROOT + '/messaging-app/']) {
    try { return createRequire(base + 'package.json')('playwright'); } catch (e) { /* */ }
  }
  throw new Error('playwright introuvable');
}
const { chromium } = loadPlaywright();
const worker = (await import('file://' + ROOT + '/services/kdmc-router/worker.js')).default;

const PORT = 8794;
const ORIGIN = 'http://localhost:' + PORT;
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } };
const env = { KDMC_SSO_SECRET: 'multiapp-e2e-secret', ACCOUNTS, KDMC_RP_ID: 'localhost', KDMC_RP_ORIGINS: ORIGIN };
const FILES = {
  '/': ['kdmc-home/index.html', 'text/html'],
  '/kdmc-sso.js': ['kdmc-home/kdmc-sso.js', 'application/javascript'],
  '/kdmc-portal.js': ['kdmc-home/kdmc-portal.js', 'application/javascript'],
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

/* Crée une personne dans un contexte ISOLÉ (cookies propres), avec un
   authentificateur virtuel (Face ID simulé). Optionnellement enrôle (Face ID)
   ou saute l'enrôlement. Renvoie {role, verified, admin, token}. */
async function journey({ prenom, nom, code, enrolFaceId }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  await page.goto(ORIGIN + '/');
  await page.waitForSelector('#f-create', { timeout: 6000 });
  await page.fill('#f-prenom', prenom);
  await page.fill('#f-nom', nom);
  await page.fill('#f-code', code);
  await page.fill('#f-code2', code);
  await page.check('#cgu-ok');
  await page.click('#f-create');
  await page.waitForSelector('#pk-go', { timeout: 6000 });
  if (enrolFaceId) {
    await page.click('#pk-go');
    await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, { timeout: 9000 });
  } else {
    await page.click('#pk-skip');
    await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, { timeout: 9000 });
  }
  /* La POLITIQUE que les apps utiliseront réellement. */
  const auto = await page.evaluate(() => window.kdmcSSO.autoLogin());
  const who = await page.evaluate(() => window.kdmcSSO.whoami());
  const token = await page.evaluate(() => window.kdmcSSO.token());
  await ctx.close();
  return { auto, who, token };
}

try {
  /* 1) PROPRIÉTAIRE + Face ID → auto-login ADMIN */
  const kevin = await journey({ prenom: 'Kevin', nom: 'Desarzens', code: ADMIN_CODE, enrolFaceId: true });
  ok(kevin.auto && kevin.auto.role === 'admin' && kevin.auto.verified === true,
    'Kevin (proprio) + Face ID → app autoLogin() = ADMIN  [' + JSON.stringify(kevin.auto) + ']');

  /* 2) SÉCURITÉ : PROPRIÉTAIRE mais SANS Face ID (nom tapé) → PAS d'auto-login admin */
  const kevinNoFace = await journey({ prenom: 'Kevin', nom: 'Desarzens', code: ADMIN_CODE, enrolFaceId: false });
  ok(kevinNoFace.auto === null,
    'Kevin SANS Face ID (nom auto-déclaré) → autoLogin() = null (aucun admin auto) ');
  ok(kevinNoFace.who && kevinNoFace.who.verified === false,
    '  ↳ la session existe mais n\'est PAS vérifiée (verified:false) — la faille reste fermée');

  /* 3) CLIENTE + Face ID → session NORMALE */
  const laurence = await journey({ prenom: 'Laurence', nom: 'Saint-Polit', code: '452100', enrolFaceId: true });
  ok(laurence.auto && laurence.auto.role === 'user' && laurence.auto.verified === true,
    'Laurence (cliente) + Face ID → app autoLogin() = USER  [' + JSON.stringify(laurence.auto) + ']');

  /* 4) COMPTE NEUF + Face ID → session NORMALE (marche pour tout le monde) */
  const alice = await journey({ prenom: 'Alice', nom: 'Martin', code: '909000', enrolFaceId: true });
  ok(alice.auto && alice.auto.role === 'user' && alice.auto.verified === true,
    'Alice (compte neuf) + Face ID → app autoLogin() = USER  [' + JSON.stringify(alice.auto) + ']');

  /* 5) MULTI-APP : une 2e app, contexte ISOLÉ sans cookies (PWA iOS séparée),
        reconnaît Kevin admin via le SEUL pass signé (Authorization: Bearer). */
  const appCtx = await browser.newContext();
  const appPage = await appCtx.newPage();
  await appPage.goto(ORIGIN + '/'); /* charge kdmcSSO sur la même origine, mais SANS la session cookie de Kevin */
  const crossApp = await appPage.evaluate(async (tok) => {
    const r = await fetch('/__sso/whoami', { headers: { Authorization: 'Bearer ' + tok }, cache: 'no-store' });
    return r.ok ? r.json() : null;
  }, kevin.token);
  await appCtx.close();
  ok(crossApp && crossApp.verified === true && crossApp.admin === true && crossApp.uid === 'kevin-desarzens',
    '2e app (cookies isolés) reconnaît Kevin ADMIN via le seul pass signé  [' + JSON.stringify(crossApp) + ']');

  /* Les 4 identités sont bien distinctes (pas de fuite d\'une session sur l\'autre) */
  const uids = [kevin.who && kevin.who.uid, laurence.who && laurence.who.uid, alice.who && alice.who.uid];
  ok(uids[0] === 'kevin-desarzens' && uids[1] === 'laurence-saint-polit' && uids[2] === 'alice-martin' && new Set(uids).size === 3,
    'Identités distinctes et isolées : ' + JSON.stringify(uids));
} finally {
  await browser.close();
  server.close();
}
console.log('\nKDMC Multi-app E2E (Chromium + Face ID virtuel, ' + (pass + fail) + ' assertions): ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
