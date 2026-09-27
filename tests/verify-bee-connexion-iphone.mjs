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
 * PUIS LE VRAI CAS DE L'IPHONE (Kevin 27.09 : « je suis normalement reconnu auto admin dans mon
 * domaine et chaque app ») — mesuré : l'étape 2 ci-dessus n'efface que les COOKIES ; or l'app de
 * l'écran d'accueil a TOUT son stockage vide. Dans ce cas « Me connecter » menait à « Créer mon
 * compte KDMC », sans Face ID : Kevin restait dehors. On rejoue donc dans un NAVIGATEUR NEUF (rien
 * en mémoire) où seul le passkey de Kevin est présent (copié : le trousseau iCloud synchronisé) :
 *   (5) Face ID directement DANS Bee → ouverte ; rechargée → ouverte SANS rien toucher (reconnu) ;
 *   (6) par kd-mc.com : le portail propose « J'ai déjà un compte — Face ID » → retour dans Bee ;
 *   (7) un inconnu sans passkey : Face ID échoue, Bee reste fermée et le dit.
 *
 * Aucun vrai code : le code de test « 123456 » (règle absolue : le code admin ne s'écrit nulle part).
 * node tests/verify-bee-connexion-iphone.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

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
const env = { KDMC_SSO_SECRET: 'bee-iphone-e2e', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };   /* RP par défaut : kd-mc.com — les vraies valeurs */
const CODE = '123456';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
/* chaque adresse → son dossier dans le dépôt (comme la table ROUTES du routeur) */
const DOSSIERS = { 'kd-mc.com': 'kdmc-home', 'javis.kd-mc.com': 'javis' };

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });   /* écran d'iPhone */
const routeur = async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.pathname.startsWith('/__sso/') || u.pathname.startsWith('/__admin/')) {
    const h = new Headers(req.headers());
    const corps = ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer();
    const r = await worker.fetch(new Request(u.href, { method: req.method(), headers: h, body: corps }), env);
    const hs = {}; r.headers.forEach((v, k) => { hs[k] = v; });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) hs['set-cookie'] = sc.join('\n');
    /* /__sso/entrer (27.09) répond 302 : Chromium refuse une redirection fabriquée par l'interception →
       on la rejoue en redirection de page, cookies identiques (le vrai 302 est prouvé par entrer.test.mjs). */
    if (r.status === 302) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/html' }, sc.length ? { 'set-cookie': sc.join('\n') } : {}),
      body: '<meta http-equiv="refresh" content="0;url=' + String(r.headers.get('location') || '/').replace(/"/g, '') + '">' });
    return route.fulfill({ status: r.status, headers: hs, body: Buffer.from(await r.arrayBuffer()) });
  }
  const dossier = DOSSIERS[u.hostname];
  if (!dossier) return route.fulfill({ status: 404, body: 'hors test' });
  let chemin = decodeURIComponent(u.pathname);
  if (chemin.endsWith('/')) chemin += 'index.html';
  const f = join(ROOT, dossier, chemin);
  if (!f.startsWith(join(ROOT, dossier)) || !existsSync(f) || statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'introuvable' });
  return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }, body: readFileSync(f) });
};
await ctx.route(/^https:\/\/([a-z0-9-]+\.)?kd-mc\.com\//, routeur);

/* Un navigateur NEUF = l'app de l'écran d'accueil : aucun cookie, aucun stockage. `passkeys` = ce que
   le trousseau iCloud synchronisé y apporte (rien pour un inconnu). */
async function appNeuve(passkeys) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.route(/^https:\/\/([a-z0-9-]+\.)?kd-mc\.com\//, routeur);
  const p = await c.newPage();
  const s = await c.newCDPSession(p);
  await s.send('WebAuthn.enable');
  const a = await s.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  for (const k of passkeys || []) await s.send('WebAuthn.addCredential', { authenticatorId: a.authenticatorId, credential: k });
  return { c, p, s, id: a.authenticatorId };
}
const etatBee = (p) => p.evaluate(() => ({ bee: !!document.querySelector('#javis-launcher'), url: location.href,
  texte: document.body.innerText, verrou: !!document.getElementById('bee-connexion') || !!document.getElementById('bee-faceid') }));

try {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const A1 = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  console.log('— 1. Kevin se connecte sur kd-mc.com AVEC Face ID —');
  await page.goto('https://kd-mc.com/');
  await page.waitForSelector('#f-create', { timeout: 8000 });
  await page.fill('#f-prenom', 'Kevin'); await page.fill('#f-nom', 'Desarzens');
  await page.fill('#f-code', CODE); await page.fill('#f-code2', CODE);
  await page.check('#cgu-ok'); await page.click('#f-create');
  /* (27.09.2026) Kevin n'a plus de « compte faible » : son nom → le portail demande le code ADMIN,
     qui donne la session vérifiée ; Face ID est proposé juste après (et le passkey se range sous
     le compte canonique de l'admin). C'est le vrai 1er parcours d'un appareil neuf. */
  await page.waitForSelector('#f-admin-box:not([hidden])', { timeout: 8000 });
  await page.fill('#a-code', '424242'); await page.click('#a-go');
  await page.waitForSelector('#pk-go', { timeout: 8000 });
  await page.click('#pk-go');
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, null, { timeout: 10000 });
  const moi = await page.evaluate(() => window.kdmcSSO.whoami());
  let trousseau = (await cdp.send('WebAuthn.getCredentials', { authenticatorId: A1.authenticatorId })).credentials;
  ok(moi && moi.verified === true && moi.admin === true, 'sur kd-mc.com : session FORTE et admin (Face ID prouvé)  [' + JSON.stringify(moi && { v: moi.verified, a: moi.admin }) + ']');

  console.log('— 2. Bee ouverte depuis l\'app de l\'écran d\'accueil : cookies ISOLÉS —');
  await ctx.clearCookies();
  await page.goto('https://javis.kd-mc.com/');
  await page.waitForSelector('#bee-connexion', { timeout: 8000 }).catch(() => {});
  const verrou = await page.evaluate(() => {
    const a = document.getElementById('bee-connexion'), f = document.getElementById('bee-faceid');
    const r = a ? a.getBoundingClientRect() : null, rf = f ? f.getBoundingClientRect() : null;
    return { texte: document.body.innerText, href: a ? a.href : '', haut: r ? r.height : 0, larg: r ? r.width : 0,
      fHaut: rf ? rf.height : 0, fLarg: rf ? rf.width : 0, bee: !!document.querySelector('#javis-launcher') };
  });
  ok(!verrou.bee, 'sans laissez-passer, Bee reste FERMÉE (fail-closed intact)');
  ok(/ne te reconnaît pas ici/.test(verrou.texte), 'l\'écran dit la VRAIE raison (« Bee ne te reconnaît pas ici »), pas une consigne impossible');
  ok(verrou.href === 'https://kd-mc.com/?return=' + encodeURIComponent('https://javis.kd-mc.com/'),
    'il offre UN bouton qui passe par le domaine et revient ici  [' + verrou.href + ']');
  ok(verrou.haut >= 44 && verrou.larg >= 44, `le bouton se touche au doigt (${Math.round(verrou.larg)}×${Math.round(verrou.haut)} px, ≥ 44)`);
  ok(verrou.fHaut >= 44 && verrou.fLarg >= 44, `et le bouton « Face ID » (sur place) aussi (${Math.round(verrou.fLarg)}×${Math.round(verrou.fHaut)} px, ≥ 44)`);

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
    ok(/Il manque Face ID/.test(r4.texte) && /Face ID/.test(r4.texte), 'et l\'écran dit exactement ce qui manque (« Il manque Face ID »)  [bouton : ' + r4.bouton + ']');
  }

  console.log('— 5. LE VRAI iPHONE : app NEUVE (stockage vide), seul le passkey du trousseau est là —');
  ok(trousseau.length >= 1, `le passkey Face ID de Kevin est copié dans l'app neuve (trousseau iCloud) : ${trousseau.length}`);
  const A = await appNeuve(trousseau);
  await A.p.goto('https://javis.kd-mc.com/');
  await A.p.waitForSelector('#bee-faceid', { timeout: 8000 }).catch(() => {});
  const e5 = await etatBee(A.p);
  ok(!e5.bee && /ne te reconnaît pas ici/.test(e5.texte), 'app neuve : Bee fermée et dit pourquoi');
  await Promise.all([A.p.waitForNavigation({ timeout: 15000 }).catch(() => {}), A.p.click('#bee-faceid')]);
  await A.p.waitForSelector('#javis-launcher', { timeout: 10000 }).catch(() => {});
  const e5b = await etatBee(A.p);
  ok(e5b.bee && !e5b.verrou, 'un toucher « Face ID » DANS Bee → Bee S\'OUVRE (sans passer par une autre page)');
  const w5 = await A.p.evaluate(async () => { const t = localStorage.getItem('kdmc_sso_token') || '';
    const r = await fetch('/__sso/whoami', { headers: t ? { Authorization: 'Bearer ' + t } : {}, cache: 'no-store' }); return r.json(); });
  ok(w5 && w5.verified === true && w5.admin === true, 'le domaine confirme : session FORTE et admin, rangée DANS l\'app  [' + JSON.stringify(w5 && { v: w5.verified, a: w5.admin }) + ']');
  await A.p.goto('about:blank'); await A.p.goto('https://javis.kd-mc.com/');
  await A.p.waitForSelector('#javis-launcher', { timeout: 10000 }).catch(() => {});
  const e5c = await etatBee(A.p);
  ok(e5c.bee && !e5c.verrou, 'rouverte ensuite : Bee s\'ouvre TOUTE SEULE (reconnu auto, aucun toucher)');
  /* Le trousseau iCloud est SYNCHRONISÉ : l'app suivante reçoit le passkey dans son état du moment
     (compteur compris — sinon le domaine croit à un clone, et il a raison de refuser). */
  trousseau = (await A.s.send('WebAuthn.getCredentials', { authenticatorId: A.id })).credentials;
  await A.c.close();

  console.log('— 6. App neuve, par kd-mc.com : le portail propose Face ID au lieu de « Créer mon compte » —');
  const B = await appNeuve(trousseau);
  await B.p.goto('https://javis.kd-mc.com/');
  await B.p.waitForSelector('#bee-connexion', { timeout: 8000 }).catch(() => {});
  await Promise.all([B.p.waitForURL(/^https:\/\/kd-mc\.com\//, { timeout: 15000 }), B.p.click('#bee-connexion')]);
  await B.p.waitForSelector('#f-pk', { timeout: 8000 }).catch(() => {});
  const e6 = await B.p.evaluate(() => { const b = document.getElementById('f-pk'); const r = b ? b.getBoundingClientRect() : null;
    return { txt: b ? b.textContent : '', h: r ? r.height : 0 }; });
  ok(/déjà un compte/.test(e6.txt) && e6.h >= 44, 'le portail (qui ne connaît personne ici) propose « J\'ai déjà un compte — Face ID »  [' + e6.txt + ', ' + Math.round(e6.h) + ' px]');
  await Promise.all([B.p.waitForURL(/^https:\/\/javis\.kd-mc\.com\//, { timeout: 15000 }), B.p.click('#f-pk')]);
  await B.p.waitForSelector('#javis-launcher', { timeout: 10000 }).catch(() => {});
  const e6b = await etatBee(B.p);
  ok(e6b.bee && !e6b.verrou, 'Face ID sur le portail → retour dans Bee, OUVERTE');
  ok(!/kdmc_sso=/.test(e6b.url), 'laissez-passer retiré de l\'adresse  [' + e6b.url + ']');
  await B.c.close();

  console.log('— 7. Un inconnu (aucun passkey Kevin) : Face ID ne force rien —');
  const C = await appNeuve([]);
  await C.p.goto('https://javis.kd-mc.com/');
  await C.p.waitForSelector('#bee-faceid', { timeout: 8000 }).catch(() => {});
  await C.p.click('#bee-faceid').catch(() => {});
  await C.p.waitForFunction(() => (document.getElementById('bee-faceid-err') || {}).textContent, null, { timeout: 70000 }).catch(() => {});
  const e7 = await etatBee(C.p);
  const err7 = await C.p.evaluate(() => (document.getElementById('bee-faceid-err') || {}).textContent || '');
  ok(!e7.bee, 'sans le passkey de Kevin, Bee reste FERMÉE (fail-closed)');
  ok(/Face ID n'a pas abouti/.test(err7), 'et elle le dit en clair  [' + err7 + ']');
  await C.c.close();
} catch (e) {
  fails.push('exception : ' + String((e && e.message) || e).slice(0, 300));
  console.log('  ❌ exception : ' + String((e && e.message) || e).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n=== Bee depuis l'iPhone : ${pass} contrôles OK, ${fails.length} échec(s) ===`);
process.exit(fails.length ? 1 : 0);
