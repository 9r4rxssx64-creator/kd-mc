/* Test E2E PASSKEY (Face ID) autonome — vrai Chromium + authentificateur VIRTUEL
   (CDP WebAuthn) contre le VRAI worker (vérification ES256) + le VRAI portail.
   Prouve : création compte → enrôlement passkey → session FORTE (verified) →
   déconnexion → reconnexion par Face ID. C'est le "vrai fournisseur d'identité".
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/kdmc-passkey-e2e/run.mjs */
import http from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
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

const PORT = 8792;
const ORIGIN = 'http://localhost:' + PORT;
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } };
const env = { KDMC_SSO_SECRET: 'pk-e2e-secret', ACCOUNTS, KDMC_RP_ID: 'localhost', KDMC_RP_ORIGINS: ORIGIN };
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

let pass = 0, fail = 0; const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  /* Authentificateur VIRTUEL plateforme avec user-verification (= Face ID simulé). */
  const client = await ctx.newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  await page.goto(ORIGIN + '/');
  await page.waitForSelector('#f-create', { timeout: 5000 });
  /* Une personne ORDINAIRE (2.10.2026) : depuis #4106, le domaine renvoie le nom de l'admin vers « Je suis
     l'administrateur » (admin_requis) — ce robot attendait #pk-go et était rouge à chaque exécution. Le chemin
     Face ID de l'admin a ses propres gardes (admin-partout, grant-faceid) ; ici on prouve le passkey de tous. */
  await page.fill('#f-prenom', 'Lucie');
  await page.fill('#f-nom', 'Martin');
  await page.fill('#f-code', ADMIN_CODE);
  await page.fill('#f-code2', ADMIN_CODE);
  await page.check('#cgu-ok');
  await page.click('#f-create');

  /* L'offre d'enrôlement Face ID doit apparaître */
  await page.waitForSelector('#pk-go', { timeout: 5000 });
  ok(true, 'Après création → écran "Active Face ID" proposé');
  await page.click('#pk-go');

  /* Enrôlement réussi → le hub s'affiche */
  const enrolled = await page.waitForFunction(() => { var h = document.getElementById('hub'); return h && !h.hidden; }, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(enrolled, 'Enrôlement passkey (Face ID virtuel) → réussi, hub affiché');
  ok(kv.has('pk:lucie-martin'), 'Clé publique du passkey stockée côté worker (KV pk:<uid>)');

  /* La session est FORTE (verified:true) */
  const who1 = await page.evaluate(() => window.kdmcSSO.whoami());
  ok(who1 && who1.verified === true, 'Session après enrôlement = FORTE (verified:true)  [' + JSON.stringify(who1) + ']');

  /* --- Régression bug Kevin (v1.0.18, capture IMG_2971) : après enrôlement, l'appareil
     est RECONNU dans « Mes appareils Face ID » → 1 seule clé (pas de doublon), badge
     « actif », et le gros bouton « Activer Face ID sur cet appareil » ne s'affiche plus. --- */
  await page.waitForFunction(() => {
    var el = document.getElementById('ss-pk');
    return el && (el.querySelector('.ss-del') || el.querySelector('#ss-active'));
  }, { timeout: 8000 }).catch(() => {});
  const pkCount1 = await page.evaluate(() => document.querySelectorAll('#ss-pk .ss-del').length);
  ok(pkCount1 === 1, 'Self-service : 1 seul appareil Face ID listé (pas de doublon)  [' + pkCount1 + ']');
  const activeShown = await page.evaluate(() => !!document.getElementById('ss-active'));
  ok(activeShown, 'Cet appareil → « ✅ Face ID est actif sur cet appareil » (fin du bouton Activer trompeur)');
  const hereMark = await page.evaluate(() => !!document.querySelector('#ss-pk .ss-here'));
  ok(hereMark, 'La ligne de CE téléphone est marquée « · cet appareil ✓ »');
  const enrollLabel = await page.evaluate(() => { var b = document.getElementById('ss-enroll'); return b ? b.textContent : ''; });
  ok(/autre appareil/i.test(enrollLabel), 'Le bouton restant propose « Ajouter un AUTRE appareil » (pas « Activer sur cet appareil »)  [' + enrollLabel + ']');

  /* Déconnexion → écran de déverrouillage avec bouton Face ID */
  await page.click('#logout');
  const pkBtn = await page.waitForSelector('#u-pk', { timeout: 5000 }).then(() => true).catch(() => false);
  ok(pkBtn, 'Au retour → bouton "Se connecter avec Face ID" présent');

  /* Connexion par Face ID (sans code) */
  await page.click('#u-pk');
  const back = await page.waitForFunction(() => { var h = document.getElementById('hub'); return h && !h.hidden; }, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(back, 'Connexion par Face ID (sans code) → réussie, hub affiché');
  const who2 = await page.evaluate(() => window.kdmcSSO.whoami());
  ok(who2 && who2.verified === true && who2.uid === 'lucie-martin', 'Session Face ID = FORTE (verified:true) + bonne identité');

  /* Après reconnexion Face ID : toujours 1 SEULE clé + appareil reconnu (pas de doublon
     créé par l'assertion) — la connexion Face ID ne doit jamais empiler de passkey. */
  await page.waitForFunction(() => {
    var el = document.getElementById('ss-pk');
    return el && (el.querySelector('.ss-del') || el.querySelector('#ss-active'));
  }, { timeout: 8000 }).catch(() => {});
  const pkCount2 = await page.evaluate(() => document.querySelectorAll('#ss-pk .ss-del').length);
  ok(pkCount2 === 1, 'Après reconnexion Face ID : toujours 1 seule clé (l\'assertion n\'empile pas)  [' + pkCount2 + ']');
  const active2 = await page.evaluate(() => !!document.getElementById('ss-active'));
  ok(active2, 'Après reconnexion Face ID : appareil toujours reconnu « actif »');

  /* --- Cas Kevin (v1.0.23) : appareil enrôlé par une ANCIENNE version → aucun credId
     stocké localement, MAIS session vérifiée Face ID → reconnu AUTO « actif » SANS taper
     « Activer/vérifier ». On efface le marqueur local et on recharge. (En dernier : le
     nettoyage n'impacte plus les étapes suivantes.) --- */
  await page.evaluate(() => { try { localStorage.removeItem('kdmc_passkey_v1'); } catch (e) {} });
  await page.reload();
  const off = await page.waitForSelector('#pk-skip', { timeout: 4000 }).then(() => true).catch(() => false);
  if (off) await page.click('#pk-skip'); /* sans marqueur local, l'offre Face ID réapparaît → passer */
  await page.waitForFunction(() => {
    var el = document.getElementById('ss-pk');
    return el && (el.querySelector('.ss-del') || el.querySelector('#ss-active'));
  }, { timeout: 8000 }).catch(() => {});
  const autoActive = await page.evaluate(() => !!document.getElementById('ss-active'));
  ok(autoActive, 'Session vérifiée + credId local absent → reconnu AUTO « ✅ actif » (0 tap requis)');
  const autoLabel = await page.evaluate(() => { var b = document.getElementById('ss-enroll'); return b ? b.textContent : ''; });
  ok(!/Activer.*sur cet appareil/i.test(autoLabel), 'Plus de bouton « Activer Face ID sur cet appareil » quand déjà vérifié  [' + autoLabel + ']');

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log('\nKDMC Passkey E2E (Chromium + authentificateur virtuel): ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
