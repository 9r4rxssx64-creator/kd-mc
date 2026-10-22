/* GARDE EN VRAI NAVIGATEUR — « ← Portail » : une sortie TOUJOURS visible, sans compte connecté
 * (Kevin 13.10.2026 : « il y ait TOUJOURS un bouton pour sortir d'une page/app et revenir au portail »).
 * Le VRAI script que le routeur sert (BOUTON_JS = /__boite/bouton.js), joué par Chromium en iPhone 375 px, sous une adresse d'app
 * (https://lingua.kd-mc.com/…), AUCUN compte connecté (/__boite/mes → pas connecté), avec un faux domaine. Prouve :
 *   1. la pastille est posée AVANT la réponse du domaine (« sans attendre la connexion »), lien exact https://kd-mc.com/ (jamais '/'),
 *      fixe en haut à gauche, ≥ 44 px, `env(safe-area-inset-top)`, et visible même sous une CSP stricte (style posé par le CSSOM) ;
 *   2. absente : sur kd-mc.com / www.kd-mc.com, dans un iframe, si la page a déjà un lien visible vers kd-mc.com, un [data-kdmc-retour]
 *      ou <meta name="kdmc-retour" content="own"> ; un lien CACHÉ (display:none) ne compte pas ; une app qui dessine son retour plus
 *      tard fait disparaître la pastille ;
 *   3. aucun pushState/replaceState (le balayage-retour de l'iPhone n'est pas piégé), history.length inchangé ;
 *   4. la porte des conditions (CGU) offre « ← Retour au portail kd-mc.com » (≥ 44 px) à côté de « Je refuse » — jamais sur le portail ;
 *   5. page à CSP qui REFUSE nos scripts (Rotaplan) : le routeur (injecterBouton) pose un simple <a> sans script — visible, ≥ 44 px ;
 *      pas sur le portail, pas dans un cadre, pas si la page a déjà son retour, pas si la CSP interdit aussi le style en ligne ;
 *   6. les deux écrans verrouillés d'admin (PoolPilot, Coffre d'autorisations, vraies pages du routeur) : « ← Retour au portail » en vrai
 *      bouton ≥ 48 px vers https://kd-mc.com/, Face ID LANCÉ TOUT SEUL (la signature part au domaine), gros bouton « Entrer avec Face ID »
 *      toujours là, et sans Face ID possible : bouton caché, code en focus.
 * node tests/verify-retour-pastille.mjs
 * SABOTAGE (chaque ligne rougit puis se restaure par git checkout du fichier) : voir la fin du fichier. */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { BOUTON_JS } from '../services/kdmc-router/boite-bouton.js';
import mod, { injecterBouton, PASTILLE_SANS_SCRIPT, cspAccepteStyleEnLigne } from '../services/kdmc-router/worker.js';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('./../messaging-app/node_modules/playwright')); }
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };

const PAGE = (corps, tete) => '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + (tete || '') + '<title>App</title></head><body>' + corps + '<script src="/__boite/bouton.js" defer></script></body></html>';
const JS = (o, st) => ({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });

/* Ouvre `pages` ({ '/chemin': html }) sous https://<hote>/ — le routeur est simulé : bouton.js, /__boite/mes (en attente tant que `lacher` n'est pas appelé). */
async function ouvrir(browser, hote, pages, o) {
  o = o || {};
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await ctx.addInitScript(() => { window.__pushes = 0; const p = history.pushState, r = history.replaceState; history.pushState = function () { window.__pushes++; return p.apply(this, arguments); }; history.replaceState = function () { window.__pushes++; return r.apply(this, arguments); }; });
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  let lacher; const attente = new Promise((r) => { lacher = r; });
  const etat = { mes: 0 };
  await page.route('https://**/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/__boite/bouton.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: BOUTON_JS });
    if (u.pathname === '/__boite/mes') { etat.mes++; if (!o.mesTout) await attente; return route.fulfill(JS(o.mes || { ok: true, connecte: false })); }
    const h = pages[u.pathname] || pages['/'];
    const entetes = { 'content-type': 'text/html; charset=utf-8' };
    if (o.csp) entetes['content-security-policy'] = o.csp;
    return route.fulfill({ status: 200, headers: entetes, body: h });
  });
  await page.goto('https://' + hote + (o.chemin || '/'), { waitUntil: 'domcontentloaded' });
  return { ctx, page, erreurs, lacher, etat };
}
const lirePastille = (page) => page.evaluate(() => {
  const a = document.querySelector('a[data-kdmc-pastille="1"]'); if (!a) return null;
  const r = a.getBoundingClientRect(); const cs = getComputedStyle(a);
  return { href: a.getAttribute('href'), texte: a.textContent, pos: cs.position, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), top: a.style.top, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' };
});
const compte = (page) => page.evaluate(() => document.querySelectorAll('a[data-kdmc-pastille]').length);

console.log('\nPastille « ← Portail » — vrai Chromium, iPhone 375 px, aucun compte connecté\n');
if (!exe) { console.log('  ⚠️ pas de Chromium installé : garde non jouée'); process.exit(0); }
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
try {
  /* 1. posée sans attendre la connexion */
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<main><h1>Ma page</h1><p>Contenu de l\'app</p></main>') });
    await A.page.waitForSelector('a[data-kdmc-pastille="1"]', { timeout: 4000 }).catch(() => {});
    const p = await lirePastille(A.page);
    ok(!!p && A.etat.mes >= 1, '1a. la pastille est là alors que le domaine n\'a PAS encore répondu (/__boite/mes en attente)', p);
    ok(p && p.href === 'https://kd-mc.com/' && /Portail/.test(p.texte), '1b. lien exact https://kd-mc.com/ (pas « / »), texte « ← Portail »', p);
    ok(p && p.pos === 'fixed' && p.x <= 12 && p.y <= 16 && p.y >= 0, '1c. fixe, en haut à gauche', p);
    ok(p && p.h >= 44 && p.w >= 44 && p.visible, '1d. au moins 44 × 44 px et visible au doigt', p);
    ok(p && /safe-area-inset-top/.test(p.top), '1e. tient compte de l\'encoche iPhone (env(safe-area-inset-top))', p && p.top);
    ok(await A.page.evaluate(() => window.__pushes === 0 && history.length <= 2), '1f. aucun pushState/replaceState : le balayage-retour n\'est pas piégé', await A.page.evaluate(() => [window.__pushes, history.length]));
    ok(await A.page.evaluate(() => !document.querySelector('button[aria-label="Écrire à l\'admin"]')), '1g. non connecté : pas de bouton ✉️, mais la sortie est là');
    ok(A.erreurs.length === 0, '1h. aucune erreur JavaScript', A.erreurs);
    if (process.env.CAPTURE) await A.page.screenshot({ path: process.env.CAPTURE.replace('.png', '-pastille.png') });
    A.lacher(); await A.ctx.close(); }

  /* 1i. CSP stricte de la page (style-src 'self', script-src 'self') : la pastille reste posée et positionnée (CSSOM, jamais d'attribut style) */
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<h1>Stricte</h1>') }, { csp: "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'", mesTout: true });
    await A.page.waitForSelector('a[data-kdmc-pastille="1"]', { timeout: 4000 }).catch(() => {});
    const p = await lirePastille(A.page);
    ok(p && p.pos === 'fixed' && p.h >= 44 && p.visible && !A.erreurs.some((e) => /Content Security Policy|CSP/i.test(e)), '1i. sous une CSP qui interdit le style en ligne, la pastille est quand même posée et fixe (aucune violation)', { p, e: A.erreurs });
    await A.ctx.close(); }

  /* 2. là où elle ne doit PAS être */
  for (const hote of ['kd-mc.com', 'www.kd-mc.com']) {
    const A = await ouvrir(browser, hote, { '/': PAGE('<h1>Portail</h1>') }, { mesTout: true }); await A.page.waitForTimeout(500);
    ok(await compte(A.page) === 0, '2a. aucune pastille sur ' + hote + ' (on y est déjà)'); await A.ctx.close(); }
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<p>Parent</p><iframe id="f" src="/cadre" style="width:300px;height:200px"></iframe>'), '/cadre': PAGE('<p>Dans le cadre</p>') }, { mesTout: true });
    await A.page.waitForTimeout(900);
    const dans = await A.page.frames()[1].evaluate(() => document.querySelectorAll('a[data-kdmc-pastille]').length).catch(() => -1);
    ok(await compte(A.page) === 1 && dans === 0, '2b. une pastille sur la page, aucune dans l\'iframe', { haut: await compte(A.page), cadre: dans }); await A.ctx.close(); }
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<nav><a id="m" href="https://kd-mc.com/">🏠 Mon espace</a></nav>') }, { mesTout: true }); await A.page.waitForTimeout(500);
    ok(await compte(A.page) === 0, '2c. la page a déjà un lien visible vers kd-mc.com → pas de doublon'); await A.ctx.close(); }
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<a href="https://kd-mc.com/" style="display:none">caché</a><p>x</p>') }, { mesTout: true }); await A.page.waitForTimeout(500);
    ok(await compte(A.page) === 1, '2d. un lien vers kd-mc.com CACHÉ (display:none) ne compte pas : la pastille est posée'); await A.ctx.close(); }
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<button data-kdmc-retour>Quitter</button>') }, { mesTout: true }); await A.page.waitForTimeout(500);
    ok(await compte(A.page) === 0, '2e. [data-kdmc-retour] : la page déclare sa propre sortie → pas de doublon'); await A.ctx.close(); }
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<p>Jeu plein écran</p>', '<meta name="kdmc-retour" content="own">') }, { mesTout: true }); await A.page.waitForTimeout(500);
    ok(await compte(A.page) === 0, '2f. <meta name="kdmc-retour" content="own"> → pas de pastille'); await A.ctx.close(); }
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<div id="app">Chargement…</div><script>setTimeout(function(){var a=document.createElement("a");a.href="https://kd-mc.com/";a.textContent="← Retour";document.getElementById("app").appendChild(a);},700);</script>') }, { mesTout: true });
    await A.page.waitForSelector('a[data-kdmc-pastille="1"]', { timeout: 2000 }).catch(() => {});
    const avant = await compte(A.page); await A.page.waitForTimeout(2200);
    ok(avant === 1 && await compte(A.page) === 0, '2g. une app qui dessine son retour après coup : la pastille s\'efface (jamais deux sorties)', { avant, apres: await compte(A.page) }); await A.ctx.close(); }
  /* 2h. (22.10, capture de Kevin) une app LENTE qui dessine son retour après 7 s (CMCteams sur un iPhone, planning à lire) : la pastille s'efface aussi, pas seulement avant 5 s */
  { const A = await ouvrir(browser, 'cmcteams.kd-mc.com', { '/': PAGE('<div id="app">Chargement…</div><script>setTimeout(function(){var a=document.createElement("a");a.href="https://kd-mc.com/";a.textContent="← Portail KDMC";document.getElementById("app").appendChild(a);},7000);</script>') }, { mesTout: true });
    await A.page.waitForSelector('a[data-kdmc-pastille="1"]', { timeout: 2000 }).catch(() => {});
    const avant = await compte(A.page); await A.page.waitForTimeout(9500);
    ok(avant === 1 && await compte(A.page) === 0, '2h. une app lente qui dessine son retour après 7 s : la pastille s\'efface aussi (avant : elle restait par-dessus l\'app)', { avant, apres: await compte(A.page) }); await A.ctx.close(); }

  /* 4. la porte des conditions */
  const CGU = { ok: true, connecte: true, nom: 'Léa Martin', admin: false, messages: [], cgu: { requise: true, version: 3, texte: 'Conditions du domaine.', points: ['Point un', 'Point deux'] } };
  { const A = await ouvrir(browser, 'lingua.kd-mc.com', { '/': PAGE('<h1>App</h1>') }, { mesTout: true, mes: CGU });
    await A.page.waitForSelector('[role=dialog][aria-label^="Conditions"]', { timeout: 4000 }).catch(() => {});
    const g = await A.page.evaluate(() => {
      const d = document.querySelector('[role=dialog][aria-label^="Conditions"]'); if (!d) return null;
      const a = [...d.querySelectorAll('a')].find((x) => /Retour au portail kd-mc\.com/.test(x.textContent));
      const refuse = [...d.querySelectorAll('button')].find((x) => /refuse/.test(x.textContent));
      const r = a && a.getBoundingClientRect(), rr = refuse && refuse.getBoundingClientRect();
      return { lien: a ? a.getAttribute('href') : null, h: r ? Math.round(r.height) : 0, apresRefus: !!(r && rr && r.top >= rr.top), refuse: !!refuse, accepter: [...d.querySelectorAll('button')].some((x) => /Accepter/.test(x.textContent)) };
    });
    ok(g && g.refuse && g.accepter && g.lien === 'https://kd-mc.com/' && g.h >= 44 && g.apresRefus, '4a. la porte des conditions : « Je refuse » ET « ← Retour au portail kd-mc.com » (https://kd-mc.com/, ≥ 44 px), aucun contournement', g);
    if (process.env.CAPTURE) await A.page.screenshot({ path: process.env.CAPTURE.replace('.png', '-cgu.png') });
    await A.ctx.close(); }
  { const A = await ouvrir(browser, 'kd-mc.com', { '/': PAGE('<h1>Portail</h1>') }, { mesTout: true, mes: CGU });
    await A.page.waitForSelector('[role=dialog][aria-label^="Conditions"]', { timeout: 4000 }).catch(() => {});
    ok(await A.page.evaluate(() => { const d = document.querySelector('[role=dialog][aria-label^="Conditions"]'); return !!d && ![...d.querySelectorAll('a')].some((x) => /Retour au portail/.test(x.textContent)); }), '4b. sur le portail lui-même, la porte n\'offre pas un « retour » qui ne mène nulle part'); await A.ctx.close(); }

  /* 5. page à CSP qui refuse nos scripts : le routeur pose un simple lien (sans script) */
  const ROTA = "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
  const racine = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="' + ROTA + '"><title>Rotaplan</title></head><body><h1>Rotaplan</h1><p>Page sans script</p></body></html>';
  const transformer = async (html, opts, entetes) => (await injecterBouton(new Response(html, { status: 200, headers: Object.assign({ 'content-type': 'text/html' }, entetes || {}) }), '', opts)).text();
  { const t = await transformer(racine, { hote: 'rotaplan.kd-mc.com', dest: 'document' });
    ok(t.includes(PASTILLE_SANS_SCRIPT) && !t.includes('/__boite/bouton.js'), '5a. CSP « script-src none » : pas de script injecté, mais le lien de sortie est posé par le routeur');
    const A = await ouvrir(browser, 'rotaplan.kd-mc.com', { '/': t }, { mesTout: true, csp: ROTA });
    const p = await A.page.evaluate(() => { const a = document.querySelector('a[data-kdmc-pastille="routeur"]'); if (!a) return null; const r = a.getBoundingClientRect(), cs = getComputedStyle(a); return { href: a.getAttribute('href'), pos: cs.position, h: Math.round(r.height), w: Math.round(r.width), x: Math.round(r.left), y: Math.round(r.top) }; });
    ok(p && p.href === 'https://kd-mc.com/' && p.pos === 'fixed' && p.h >= 44 && p.w >= 44 && p.x <= 12 && p.y <= 16, '5b. dans Chromium, sous la CSP réelle de Rotaplan, le lien est visible, fixe en haut à gauche, ≥ 44 px', p);
    ok(A.erreurs.filter((e) => /Content Security Policy/i.test(e)).length === 0, '5c. aucune violation de CSP', A.erreurs);
    if (process.env.CAPTURE) await A.page.screenshot({ path: process.env.CAPTURE.replace('.png', '-rotaplan.png') });
    await A.ctx.close(); }
  ok(!(await transformer(racine, { hote: 'kd-mc.com', dest: 'document' })).includes('data-kdmc-pastille'), '5d. pas de lien sur le portail');
  ok(!(await transformer(racine, { hote: 'rotaplan.kd-mc.com', dest: 'iframe' })).includes('data-kdmc-pastille'), '5e. pas de lien dans un cadre');
  ok(!(await transformer(racine.replace('<h1>', '<a href="https://kd-mc.com/">Portail</a><h1>'), { hote: 'rotaplan.kd-mc.com', dest: 'document' })).includes('data-kdmc-pastille'), '5f. pas de lien si la page a déjà le sien');
  ok(!(await transformer(racine.replace("'unsafe-inline'", "'self'"), { hote: 'rotaplan.kd-mc.com', dest: 'document' })).includes('data-kdmc-pastille'), '5g. pas de lien si la CSP interdit aussi le style en ligne (on ne force jamais une page)');
  ok((await transformer('<html><body><p>x</p></body></html>', { hote: 'rotaplan.kd-mc.com' }, { 'content-security-policy': "default-src 'none'; script-src 'self' 'nonce-a' 'strict-dynamic'; style-src-attr 'unsafe-inline'; style-src 'self' 'nonce-a'" })).includes('data-kdmc-pastille'), '5h. Apex (strict-dynamic, style-src-attr unsafe-inline) : le lien est posé');
  ok(cspAccepteStyleEnLigne('') && cspAccepteStyleEnLigne("script-src 'none'") && !cspAccepteStyleEnLigne("default-src 'none'") && !cspAccepteStyleEnLigne("style-src 'self'") && !cspAccepteStyleEnLigne("style-src 'unsafe-inline' 'nonce-x'"), '5i. cspAccepteStyleEnLigne : sans directive = permis ; none / self seul / nonce = refusé');
  ok(/^<a href="https:\/\/kd-mc\.com\/" /.test(PASTILLE_SANS_SCRIPT) && !/<script/i.test(PASTILLE_SANS_SCRIPT), '5j. le lien est un <a> pur, sans script');

  /* 6. écrans verrouillés d'admin — les VRAIES pages du routeur */
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const envAdmin = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: sha('424242') };
  const vraieFetch = globalThis.fetch;
  globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url; if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('APP', { status: 200, headers: { 'content-type': 'text/html' } }); return vraieFetch(input); };
  const verrou = async (hote) => (await mod.fetch(new Request('https://' + hote + '/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html' } }), envAdmin, { waitUntil() {} })).text();
  globalThis.fetch = vraieFetch;
  for (const [hote, nom] of [['beatbot.kd-mc.com', 'PoolPilot'], ['autorisations.kd-mc.com', 'Coffre d\'autorisations']]) {
    const html = await verrou(hote);
    ok(new RegExp(nom.split(' ')[0]).test(html) && /espace priv/i.test(html), '6a. (' + hote + ') le routeur sert bien l\'écran verrouillé');
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    /* faux Face ID : le passkey répond tout de suite ; on compte les appels */
    await ctx.addInitScript(() => {
      window.__fid = { get: 0 };
      window.PublicKeyCredential = function () {};
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: function () { window.__fid.get++;
        const b = (n) => new Uint8Array([n]).buffer;
        return Promise.resolve({ id: 'cred-fictif', response: { userHandle: new TextEncoder().encode('admin-fictif').buffer, clientDataJSON: b(1), authenticatorData: b(2), signature: b(3) } }); } } });
    });
    const page = await ctx.newPage(); const posts = []; let chargements = 0;
    await page.route('https://**/**', async (route) => {
      const u = new URL(route.request().url()); const m = route.request().method();
      if (u.pathname === '/__sso/webauthn/auth/options') { posts.push('options'); return route.fulfill(JS({ ok: true, challenge: 'AAAA', rpId: 'kd-mc.com', allowCredentials: [] })); }
      if (u.pathname === '/__sso/webauthn/auth/verify') { posts.push('verify:' + route.request().postData()); return route.fulfill(JS({ ok: true, uid: 'admin-fictif', name: 'Admin', verified: true })); }
      if (m === 'GET') { chargements++; return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: posts.some((x) => /^verify:/.test(x)) ? '<!doctype html><title>APP</title><p id="app">APP ouverte</p>' : html }); }
      return route.fulfill(JS({ ok: false }));
    });
    await page.goto('https://' + hote + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const verif = posts.find((x) => /^verify:/.test(x));
    ok(posts[0] === 'options' && !!verif, '6b. (' + hote + ') Face ID LANCÉ TOUT SEUL à l\'ouverture (options → passkey → vérification au domaine), sans aucun toucher', posts);
    ok(!!verif && JSON.parse(verif.slice(7)).uid === 'admin-fictif' && JSON.parse(verif.slice(7)).credId === 'cred-fictif', '6c. (' + hote + ') la signature part au domaine avec le compte du passkey (c\'est le domaine qui juge)', verif);
    ok(chargements >= 2 && await page.evaluate(() => !!document.getElementById('app')), '6d. (' + hote + ') après Face ID accepté, la page se recharge et l\'espace s\'ouvre (le domaine a posé la session)', chargements);
    /* éléments : on rejoue une page neuve sans Face ID auto-accepté pour mesurer les boutons */
    const page2 = await ctx.newPage();
    await page2.route('https://**/**', async (route) => { const u = new URL(route.request().url());
      if (u.pathname === '/__sso/webauthn/auth/options') return route.fulfill(JS({ ok: false, reason: 'test' }));
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }); });
    await page2.goto('https://' + hote + '/', { waitUntil: 'domcontentloaded' }); await page2.waitForTimeout(500);
    const el = await page2.evaluate(() => {
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { h: Math.round(b.height), w: Math.round(b.width), visible: b.width > 0 && getComputedStyle(e).display !== 'none' && !e.hidden }; };
      const a = [...document.querySelectorAll('a')].find((x) => /Retour au portail/.test(x.textContent));
      return { retour: a ? Object.assign({ href: a.getAttribute('href') }, r(a)) : null, fid: r(document.getElementById('fid')), go: r(document.getElementById('go')), horiz: document.documentElement.scrollWidth > innerWidth + 1, msg: (document.getElementById('err') || {}).textContent };
    });
    ok(el.retour && el.retour.href === 'https://kd-mc.com/' && el.retour.h >= 48 && el.retour.visible, '6e. (' + hote + ') « ← Retour au portail » : un vrai bouton ≥ 48 px vers https://kd-mc.com/ (avant : lien de 11,5 px)', el.retour);
    ok(el.fid && el.fid.visible && el.fid.h >= 48 && el.fid.w >= 280, '6f. (' + hote + ') gros bouton « Entrer avec Face ID » (≥ 48 px) toujours visible', el.fid);
    ok(el.go && el.go.h >= 44 && !el.horiz, '6g. (' + hote + ') le code reste possible (≥ 44 px), pas de défilement horizontal', el);
    ok(/Face ID/.test(el.msg || ''), '6h. (' + hote + ') si Face ID échoue, le message le dit simplement', el.msg);
    if (process.env.CAPTURE) await page2.screenshot({ path: process.env.CAPTURE.replace('.png', '-verrou-' + hote.split('.')[0] + '.png') });
    /* sans Face ID possible (PC) : bouton caché, code en focus */
    const ctx3 = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await ctx3.addInitScript(() => { try { delete window.PublicKeyCredential; } catch (e) { window.PublicKeyCredential = undefined; } });
    const page3 = await ctx3.newPage();
    await page3.route('https://**/**', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }));
    await page3.goto('https://' + hote + '/', { waitUntil: 'domcontentloaded' }); await page3.waitForTimeout(300);
    ok(await page3.evaluate(() => document.getElementById('fid').hidden && document.activeElement && document.activeElement.id === 'pin'), '6i. (' + hote + ') sans Face ID possible : le bouton Face ID est caché et le champ du code a le focus');
    await ctx3.close(); await ctx.close();
  }
} finally { await browser.close(); }
console.log(`\n${pass} OK · ${fail} échec(s)`);
/* SABOTAGE (prouvé) :
 *   sed -i 's/^    retourDomaine();$/    \/\/ SAB/' services/kdmc-router/boite-bouton.js          → 1a-1i, 2d, 2g, 4a(pastille) rougissent
 *   sed -i "s#pr.href = 'https://kd-mc.com/'#pr.href = '/'#" services/kdmc-router/boite-bouton.js    → 1b rougit
 *   sed -i 's/ if (retour) boite.appendChild(retour);//' services/kdmc-router/boite-bouton.js        → 4a rougit
 *   sed -i 's/if (!sansPastille \&\& styleOk) e.onEndTag/if (false) e.onEndTag/' …worker.js  (Node: repli texte) voir 5 — ou retirer PASTILLE_SANS_SCRIPT → 5a-5c, 5h rougissent
 *   remplacer verrouAdminPage par l'ancienne page (git stash du worker) → 6b, 6e, 6f rougissent
 *   Chaque sabotage se défait par : git checkout -- <fichier> (le fichier est alors rétabli depuis le dernier commit). */
process.exit(fail ? 1 : 0);
