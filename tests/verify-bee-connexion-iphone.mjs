/* PREUVE DE BOUT EN BOUT — « Impossible de me connecter » à Bee (Kevin, iPhone, 26.09.2026, 23h19)
 *
 * Ce que Kevin a vu : javis.kd-mc.com affiche « Bee est personnelle à Kevin — Connecte-toi
 * d'abord sur le domaine (Face ID), puis rouvre Bee. » — et AUCUN bouton.
 *
 * La cause, lue dans le code puis prouvée ici : sur iPhone, une app posée sur l'écran d'accueil
 * garde ses cookies ISOLÉS. Pour que la session traverse, le portail ajoute au lien un
 * laissez-passer signé (#kdmc_sso=) — mais seulement pour les apps de sa liste, et
 * javis.kd-mc.com n'y était PAS, alors que Bee sait lire ce laissez-passer. Sans lui, le domaine
 * ne reconnaît personne sur la page de Bee → cadenas. Et l'écran n'offrait aucune issue.
 *
 * Ce test rejoue le VRAI chemin, avec :
 *   · les VRAIES adresses (https://kd-mc.com, https://javis.kd-mc.com — deux origines, donc deux
 *     stockages séparés comme dans Safari) ;
 *   · le VRAI routeur (services/kdmc-router/worker.js) pour tout /__sso/* ;
 *   · un Face ID VIRTUEL (authentificateur WebAuthn de Chromium) : session FORTE, comme Kevin ;
 *   · les cookies EFFACÉS avant d'ouvrir Bee : c'est la situation « app de l'écran d'accueil ».
 *
 * Il prouve : (1) sans laissez-passer, Bee reste fermée MAIS dit pourquoi et offre UN bouton ;
 * (2) ce bouton passe par le domaine et REVIENT dans Bee avec le laissez-passer ; (3) Bee s'ouvre
 * alors pour Kevin, et nettoie le laissez-passer de l'adresse ; (4) connecté SANS Face ID, Bee
 * reste fermée et le dit exactement (le verrou n'est pas affaibli).
 *
 * Aucun vrai code : le code de test « 123456 » (règle absolue : le code admin ne s'écrit nulle part).
 * node tests/verify-bee-connexion-iphone.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function chargerPlaywright() {
  for (const base of [ROOT + '/', ROOT + '/apex-ai/v13/', ROOT + '/messaging-app/']) {
    try { return createRequire(base + 'package.json')('playwright'); } catch (_) { /* suivant */ }
  }
  throw new Error('playwright introuvable');
}
const { chromium } = chargerPlaywright();
const worker = (await import('file://' + ROOT + '/services/kdmc-router/worker.js')).default;

const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'bee-iphone-e2e', ACCOUNTS };   /* RP par défaut : kd-mc.com — les vraies valeurs */
const CODE = '123456';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
/* chaque adresse → son dossier dans le dépôt (comme la table ROUTES du routeur) */
const DOSSIERS = { 'kd-mc.com': 'kdmc-home', 'javis.kd-mc.com': 'javis' };

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });   /* écran d'iPhone */
await ctx.route(/^https:\/\/([a-z0-9-]+\.)?kd-mc\.com\//, async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.pathname.startsWith('/__sso/') || u.pathname.startsWith('/__admin/')) {
    const h = new Headers(req.headers());
    const corps = ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer();
    const r = await worker.fetch(new Request(u.href, { method: req.method(), headers: h, body: corps }), env);
    const hs = {}; r.headers.forEach((v, k) => { hs[k] = v; });
    return route.fulfill({ status: r.status, headers: hs, body: Buffer.from(await r.arrayBuffer()) });
  }
  const dossier = DOSSIERS[u.hostname];
  if (!dossier) return route.fulfill({ status: 404, body: 'hors test' });
  let chemin = decodeURIComponent(u.pathname);
  if (chemin.endsWith('/')) chemin += 'index.html';
  const f = join(ROOT, dossier, chemin);
  if (!f.startsWith(join(ROOT, dossier)) || !existsSync(f) || statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'introuvable' });
  return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }, body: readFileSync(f) });
});

try {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  console.log('— 1. Kevin se connecte sur kd-mc.com AVEC Face ID —');
  await page.goto('https://kd-mc.com/');
  await page.waitForSelector('#f-create', { timeout: 8000 });
  await page.fill('#f-prenom', 'Kevin'); await page.fill('#f-nom', 'Desarzens');
  await page.fill('#f-code', CODE); await page.fill('#f-code2', CODE);
  await page.check('#cgu-ok'); await page.click('#f-create');
  await page.waitForSelector('#pk-go', { timeout: 8000 });
  await page.click('#pk-go');
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, null, { timeout: 10000 });
  const moi = await page.evaluate(() => window.kdmcSSO.whoami());
  ok(moi && moi.verified === true && moi.admin === true, 'sur kd-mc.com : session FORTE et admin (Face ID prouvé)  [' + JSON.stringify(moi && { v: moi.verified, a: moi.admin }) + ']');

  console.log('— 2. Bee ouverte depuis l\'app de l\'écran d\'accueil : cookies ISOLÉS —');
  await ctx.clearCookies();
  await page.goto('https://javis.kd-mc.com/');
  await page.waitForSelector('#bee-connexion', { timeout: 8000 }).catch(() => {});
  const verrou = await page.evaluate(() => {
    const a = document.getElementById('bee-connexion');
    const r = a ? a.getBoundingClientRect() : null;
    return { texte: document.body.innerText, href: a ? a.href : '', haut: r ? r.height : 0, larg: r ? r.width : 0, bee: !!document.querySelector('#javis-launcher') };
  });
  ok(!verrou.bee, 'sans laissez-passer, Bee reste FERMÉE (fail-closed intact)');
  ok(/ne te reconnaît pas ici/.test(verrou.texte), 'l\'écran dit la VRAIE raison (« Bee ne te reconnaît pas ici »), pas une consigne impossible');
  ok(verrou.href === 'https://kd-mc.com/?return=' + encodeURIComponent('https://javis.kd-mc.com/'),
    'il offre UN bouton qui passe par le domaine et revient ici  [' + verrou.href + ']');
  ok(verrou.haut >= 44 && verrou.larg >= 44, `le bouton se touche au doigt (${Math.round(verrou.larg)}×${Math.round(verrou.haut)} px, ≥ 44)`);

  console.log('— 3. Kevin touche « Me connecter » —');
  await Promise.all([page.waitForURL(/^https:\/\/javis\.kd-mc\.com\//, { timeout: 15000 }), page.click('#bee-connexion')]);
  await page.waitForSelector('#javis-launcher', { timeout: 10000 }).catch(() => {});
  const apres = await page.evaluate(() => ({ bee: !!document.querySelector('#javis-launcher'), url: location.href, verrou: !!document.getElementById('bee-connexion') }));
  ok(apres.bee && !apres.verrou, 'de retour sur Bee : elle S\'OUVRE pour Kevin (laissez-passer reçu du domaine)');
  ok(!/kdmc_sso=/.test(apres.url), 'le laissez-passer est retiré de l\'adresse (ni historique, ni capture d\'écran)  [' + apres.url + ']');

  console.log('— 4. Connecté SANS Face ID : le verrou ne s\'affaiblit pas —');
  /* une session NON prouvée, par la porte normale du domaine (/__sso/issue : auto-déclarée, jamais
     « verified ») — exactement ce qu'obtient quelqu'un qui se connecte avec nom + code, sans Face ID.
     Format lu dans le routeur (uid + name requis, origine du domaine), pas deviné. */
  const rIssue = await worker.fetch(new Request('https://kd-mc.com/__sso/issue', { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' },
    body: JSON.stringify({ uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true }) }), env);
  const jIssue = await rIssue.json().catch(() => ({}));
  const faible = jIssue && (jIssue.token || jIssue.t || '');
  ok(!!faible, 'le domaine émet bien une session SANS Face ID (auto-déclarée) pour le test');
  if (faible) {
    await ctx.clearCookies();
    /* PIÈGE payé en écrivant ce test : aller sur « même adresse + #fragment » ne RECHARGE pas la
       page — Bee, ouverte à l'étape 3, restait affichée et le contrôle aurait mesuré l'état
       d'avant. On quitte donc la page d'abord : c'est un vrai nouveau chargement. */
    await page.goto('about:blank');
    await page.goto('https://javis.kd-mc.com/#kdmc_sso=' + encodeURIComponent(faible));
    await page.waitForSelector('#bee-connexion', { timeout: 8000 }).catch(() => {});
    const r4 = await page.evaluate(() => ({ bee: !!document.querySelector('#javis-launcher'), texte: document.body.innerText,
      bouton: (document.getElementById('bee-connexion') || {}).textContent || '' }));
    ok(!r4.bee, 'sans Face ID, Bee reste FERMÉE même au nom de Kevin');
    ok(/Il manque Face ID/.test(r4.texte) && /Face ID/.test(r4.bouton), 'et l\'écran dit exactement ce qui manque (« Il manque Face ID »)  [bouton : ' + r4.bouton + ']');
  }
} catch (e) {
  fails.push('exception : ' + String((e && e.message) || e).slice(0, 300));
  console.log('  ❌ exception : ' + String((e && e.message) || e).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n=== Bee depuis l'iPhone : ${pass} contrôles OK, ${fails.length} échec(s) ===`);
process.exit(fails.length ? 1 : 0);
