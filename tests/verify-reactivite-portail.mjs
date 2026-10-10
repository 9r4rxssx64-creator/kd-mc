/* RÉACTIVITÉ DU PORTAIL ET DU TABLEAU DE BORD ADMIN — mesurée dans un vrai navigateur (Kevin 10.10.2026 :
 * « Vérifie la réactivité des boutons, fonctions, etc partout. […] On attend bcp trop avant l'exécution. Va plus loin. »).
 *
 * Conditions volontairement DURES (un iPhone moyen sur un réseau mobile moyen) :
 *   · Chromium 390×844, processeur ralenti ×4 (CDP Emulation.setCPUThrottlingRate) ;
 *   · chaque appel au domaine (/__*) et à la caisse attend RETARD ms (1500 par défaut) avant de répondre ;
 *   · les pages de kdmc-home/ servies telles quelles ; /__sso, /__admin, /__boite passent par le VRAI routeur
 *     (services/kdmc-router/worker.js) avec un KV simulé. Noms fictifs.
 *
 * Ce que le test exige — jamais un seuil brut en millisecondes (faux sous charge) : des ORDRES d'événements.
 *   R1. toucher une tuile d'app → la tuile réagit à l'écran AVANT la réponse retardée du domaine (plus de « bouton mort ») ;
 *   R2. portail déjà connecté → UN SEUL whoami au démarrage, et l'accueil s'affiche après UN seul aller-retour (pas deux en série) ;
 *   R3. tuile touchée → on part vers l'app sans attendre un nouvel aller-retour (laissez-passer lu d'avance) ;
 *   R4. « Créer mon compte » (vérification du téléphone au domaine) → le bouton réagit avant la réponse ; R4b : et cette question
 *       est posée d'avance, à l'affichage de l'écran (un aller-retour de moins au moment du toucher) ;
 *   R5. tableau de bord admin → UN SEUL whoami ; la section Commerce ne redemande pas whoami (2 allers-retours en série de moins) ;
 *   R6. « ↻ Rafraîchir » (connectés) et « ↻ Relire la caisse » → réaction visible avant la réponse ;
 *   R7. « Vérifier maintenant » (compte en attente de l'administrateur) → réaction visible avant la réponse ;
 *   R8. les listes des comptes (admin) ne attendent plus /__admin/acces en série avant /__admin/accounts.
 * MESURE=1 imprime le tableau des délais (avant/après des documents). RACINE=<dossier> sert une autre copie de kdmc-home (l'avant).
 * SABOTAGE=tuile-retour|precharge|whoami-partage|accueil-serie|creer|tel-avance|verifier|commerce-whoami|acces-serie|rafraichir|caisse → doit rougir.
 * node tests/verify-reactivite-portail.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import mod from '../services/kdmc-router/worker.js';

const RETARD = Number(process.env.RETARD || 1500);
const RACINE = process.env.RACINE || 'kdmc-home';   /* RACINE=<copie d'une ancienne version de kdmc-home> : mesurer l'AVANT */
/* SABOTAGE=<nom> : le fichier SERVI est abîmé (le dépôt ne bouge pas) — chaque correctif retiré doit faire rougir SA ligne. */
const SAB = process.env.SABOTAGE || '';
const SABOTAGES = {
  'tuile-retour': [['kdmc-portal.js', "a.classList.add('ouvre'); a.setAttribute('aria-busy', 'true');", ''], ['kdmc-portal.js', "if (arr) { arr.setAttribute('data-arr', arr.textContent); arr.textContent = '⏳'; }", '']],
  'precharge': [['kdmc-portal.js', 'try { window.kdmcSSO.prechargerPorte(); } catch (e) { /* */ }', ''], ['kdmc-portal.js', 'try { window.kdmcSSO.prechargerPorte(); } catch (_) { /* */ }', '']],
  'whoami-partage': [['kdmc-sso.js', 'if (!(opts && opts.frais) && _whoP && _whoGen === _gen) return _whoP;', '']],
  'accueil-serie': [['kdmc-portal.js', 'if (deja && deja.state) { suite(deja); return; }', '']],
  'creer': [['kdmc-portal.js', "btn0.disabled = true; btn0.textContent = 'Vérification…';", 'btn0.disabled = true;'], ['kdmc-portal.js', "    telExige();   /* lue d'avance (voir telExige) */", ''], ['index.html', '.btn:disabled{opacity:.6;cursor:progress}', '']],
  'verifier': [['kdmc-portal.js', "if (manuel && b) { b.disabled = true; b.textContent = 'Vérification…'; if (e0) e0.textContent = 'Je demande au domaine…'; }", ''], ['index.html', '.btn:disabled{opacity:.6;cursor:progress}', '']],
  'commerce-whoami': [['admin/tableau.js', "global.kdmcCommerce.monter(document.getElementById('commerce-app'), s);", "global.kdmcCommerce.monter(document.getElementById('commerce-app'));"]],
  'acces-serie': [['admin/admin.js', 'if (!_appsP) _appsP = chargerApps();', 'if (!_appsP) { _appsP = chargerApps(); return _appsP.then(function () { return loadAccounts(tries, silent); }); }']],
  'tel-avance': [['kdmc-portal.js', "    telExige();   /* lue d'avance (voir telExige) */", '']],
  'rafraichir': [['admin/admin.js', "b.disabled = true; b.textContent = '↻ …';", '']],
  'caisse': [['admin/commerce.js', "rf.textContent = '↻ Lecture…';", '']],
};
if (SAB && !SABOTAGES[SAB]) { console.error('SABOTAGE inconnu : ' + SAB + ' (connus : ' + Object.keys(SABOTAGES).join(', ') + ')'); process.exit(2); }
function servi(p) {
  const buf = readFileSync(p);
  if (!SAB) return buf;
  let t = buf.toString('utf8'), touche = false;
  SABOTAGES[SAB].forEach(([f, de, vers]) => { if (p === RACINE + '/' + f) { if (!t.includes(de)) { console.error('sabotage introuvable dans ' + f + ' : ' + de); process.exit(2); } t = t.split(de).join(vers); touche = true; } });
  return touche ? Buffer.from(t) : buf;
}
const CPU = Number(process.env.CPU || 4);
const MESURE = !!process.env.MESURE;
const CAISSE = 'https://kdmc-vente.9r4rxssx64.workers.dev';

const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [...kv.keys()].map((name) => ({ name })), list_complete: true }) };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
const WA = { WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app', WA_VERIFY_TOKEN: 'mot', WA_NUMERO_PUBLIC: '37799000000' };
const vraiFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });   /* le routeur ne sort jamais (Firebase, Meta…) */

const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml' };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 300) : ''}`); };
const lignes = [];
const note = (quoi, reaction, fin, detail) => lignes.push({ quoi, reaction, fin, detail: detail || '' });
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
let lent = false;   /* le retard réseau ne s'applique qu'aux mesures (la préparation des comptes reste rapide) */

const LIVE = { ok: true, quand: new Date().toISOString(), admin: 'Admin', produits: [], ventes: { n: 0, ca: 0, parProduit: {}, parSource: {}, parMois: {}, dernieres: [], tronque: false },
  file: { n: 1, demandes: [{ id: 'dem-1', produit: 'kit-ia', email: 'c@x.fr', methode: 'revolut', etat: 'en_attente', ts_iso: new Date().toISOString() }] },
  intentions: { n: 0, ca_potentiel: 0, dit_paye: 0, relancables: 0, liste: [] }, club: { actifs: 0, expirent14j: 0 }, contenu: {}, base_detail: null,
  config: { paypal_webhook: false, paypal_recherche: false, email_code: true, contenu_prive: true, commandes: false }, workflows: [] };

async function brancher(ctx) {
  await ctx.route(/^https:\/\/([a-z0-9-]+\.)?kd-mc\.com\//, async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.pathname.startsWith('/__')) {
      if (lent) await dodo(RETARD);
      const r = await mod.fetch(new Request(u.href, { method: req.method(), headers: req.headers(), body: req.method() === 'GET' ? undefined : req.postData() }), env, { waitUntil() {} });
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    if (u.hostname !== 'kd-mc.com') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><p id="app-ouverte">app</p>' });
    let p = u.pathname === '/' ? RACINE + '/index.html' : RACINE + u.pathname;
    if (p.endsWith('/')) p += 'index.html';
    if (existsSync(p)) return route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'text/plain', body: servi(p) });
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.route(CAISSE + '/**', async (route) => {
    if (lent) await dodo(RETARD);
    const r = route.request();
    return route.fulfill({ status: 200, contentType: 'application/json', body: r.url().endsWith('/admin/tableau') ? JSON.stringify(LIVE) : '{"ok":true}' });
  });
}

/* Dans la page : journal des fetch (début/fin), tâches longues, et l'outil « clic + premier changement visible ». */
const SONDE = () => {
  window.__appels = []; window.__longues = [];
  try { sessionStorage.setItem('kdmc_pk_skip', '1'); } catch (e) { /* l'offre Face ID (« Plus tard ») ne s'intercale pas dans les mesures */ }
  const f0 = window.fetch.bind(window);
  window.fetch = function (u, o) {
    const url = String(u && u.url ? u.url : u), e = { u: url.replace(location.origin, ''), s: performance.now(), e: 0 };
    window.__appels.push(e);
    return f0(u, o).then((r) => { e.e = performance.now(); return r; }, (x) => { e.e = performance.now(); throw x; });
  };
  try { new PerformanceObserver((l) => { l.getEntries().forEach((x) => window.__longues.push(Math.round(x.duration))); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* */ }
};
async function nouvelle(ctx) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.addInitScript(SONDE);
  page.on('dialog', (d) => d.accept());
  return page;
}
/* Profondeur de la chaîne d'allers-retours EN SÉRIE vers le domaine, terminés avant l'instant T (chaque maillon part après la fin du précédent). */
function serie(appels, T, filtre) {
  const L = appels.filter((a) => a.e && a.e <= T && (!filtre || filtre.test(a.u)));
  const d = L.map(() => 1);
  L.forEach((a, i) => { L.forEach((b, j) => { if (b.e <= a.s && d[j] + 1 > d[i]) d[i] = d[j] + 1; }); });
  return d.length ? Math.max(...d) : 0;
}
/* Attend que l'écran soit calme (aucune mutation pendant 400 ms), puis touche `sel` et mesure. */
async function toucher(page, sel, finQuand, maxMs = 9000, sansAttendre) {
  if (!sansAttendre) await calme(page);   /* une réponse d'avant (conditions, présence…) qui arrive pendant la mesure n'est pas une réaction au doigt */
  if (!sansAttendre) await page.evaluate(() => new Promise((res) => { let t = setTimeout(fin, 400); const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 400); }); mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); function fin() { mo.disconnect(); res(); } setTimeout(fin, 3000); }));
  let nav = null; const t0 = Date.now();
  /* le DÉPART vers l'app = la page lance sa navigation (pas l'arrivée, qui dépend du réseau de l'app) */
  const surNav = (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame() && nav == null) nav = Date.now() - t0; };
  page.on('request', surNav);
  await page.evaluate(([s, seulLui]) => {
    window.__premier = null; window.__nAppels0 = window.__appels.length;
    const el = document.querySelector(s); if (!el) { window.__premier = -1; return; }
    /* « VISIBLE » : un attribut qui ne se voit pas (disabled sans style, href, data-*, aria-*) ne compte que s'il change l'apparence
       du bouton touché (opacité, couleurs, curseur, filtre, texte). Un bouton juste « disabled » sans style = bouton mort pour Kevin. */
    const sig = (x) => { const c = getComputedStyle(x); return [c.opacity, c.color, c.backgroundColor, c.backgroundImage, c.cursor, c.filter, c.borderColor, x.textContent].join('|'); };
    const avant = sig(el);
    const t = performance.now(); window.__t0 = t;
    const mo = new MutationObserver((ms) => {
      if (window.__premier != null) return;
      const vu = ms.some((m) => {
        if (m.type !== 'attributes') return true;
        if (/^(disabled|href|data-|aria-|tabindex|role)/.test(m.attributeName)) return sig(el) !== avant;
        return true;
      });
      if (vu) { window.__premier = performance.now() - t; window.__quoi = ms.map((m) => m.type + ':' + (m.attributeName || '') + ':' + (m.target.id || m.target.nodeName)).join(','); mo.disconnect(); }
    });
    /* sans attente du calme (la page charge encore), seul le bouton touché compte : un rendu d'arrière-plan n'est pas une réaction */
    mo.observe(seulLui ? el : document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    el.click();
  }, [sel, !!sansAttendre]).catch(() => {});
  let premier = null, fin = null;
  while (Date.now() - t0 < maxMs) {
    if (premier == null) premier = await page.evaluate(() => window.__premier).catch(() => null);
    if (nav != null) { fin = nav; break; }
    if (finQuand && await page.evaluate(finQuand).catch(() => false)) { fin = Date.now() - t0; break; }
    await dodo(25);
  }
  page.off('request', surNav);
  if (premier == null && nav != null) premier = nav;   /* rien n'a bougé avant le départ : le départ est la première réaction */
  const quoi = await page.evaluate(() => window.__quoi || '').catch(() => '');
  return { premier: premier == null ? null : Math.round(premier), fin, nav, quoi: String(quoi).slice(0, 160) };
}

/* attend que tous les appels en cours soient revenus (une navigation couperait la déconnexion en vol) */
async function calme(page) { await page.waitForFunction(() => window.__appels.every((a) => a.e), null, { timeout: RETARD * 4 + 4000 }).catch(() => {}); }

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
console.log(`\nRéactivité du portail et du tableau de bord admin — CPU ×${CPU}, réseau +${RETARD} ms\n`);
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await brancher(ctx);

  /* ── P1. portail, personne de connu ─────────────────────────────────────────────────────────── */
  lent = true;
  let page = await nouvelle(ctx);
  let t0 = Date.now();
  await page.goto('https://kd-mc.com/');
  await page.waitForFunction(() => { const g = document.getElementById('gate'); return g && !g.hidden && g.children.length > 0; }, null, { timeout: 15000 });
  const p1 = Date.now() - t0;
  const ap1 = await page.evaluate(() => window.__appels);
  note('Portail sans compte : écran « Créer mon compte » visible', '—', p1, `whoami : ${ap1.filter((a) => /whoami/.test(a.u)).length}`);

  /* ── P2/R4. « Créer mon compte » : le domaine dit si le téléphone est exigé ─────────────────── */
  await page.fill('#f-prenom', 'Albert'); await page.fill('#f-nom', 'Fictif');
  await page.fill('#f-code', '271828'); await page.fill('#f-code2', '271828'); await page.check('#cgu-ok');
  const r4 = await toucher(page, '#f-create', () => { const h = document.getElementById('hub'); return (h && !h.hidden) || !!document.getElementById('pk-skip'); }, 15000);
  note('« Créer mon compte » (vérif. téléphone + création)', r4.premier, r4.fin, r4.quoi);
  ok(r4.premier != null && r4.premier >= 0 && r4.premier < RETARD, 'R4. « Créer mon compte » réagit à l\'écran avant la réponse du domaine', JSON.stringify(r4));
  const apresClic = await page.evaluate(() => window.__appels.slice(window.__nAppels0).map((a) => a.u));
  ok(!apresClic.some((u) => /\/__sso\/tel\/etat/.test(u)), 'R4b. « Créer mon compte » n\'attend plus « téléphone exigé ? » : la question est posée d\'avance, à l\'affichage', apresClic.join(' | '));
  const skip = page.locator('#pk-skip'); if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, null, { timeout: 15000 }).catch(() => {});

  /* ── P3/R2. portail déjà connecté : rechargement ────────────────────────────────────────────── */
  await page.close(); page = await nouvelle(ctx);
  t0 = Date.now();
  await page.goto('https://kd-mc.com/');
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, null, { timeout: 15000 });
  const tHub = await page.evaluate(() => performance.now());
  const p3 = Date.now() - t0;
  await dodo(RETARD + 800);
  const ap3 = await page.evaluate(() => window.__appels);
  const longues3 = await page.evaluate(() => window.__longues);
  const nWho3 = ap3.filter((a) => /\/__sso\/whoami/.test(a.u)).length;
  const s3 = serie(ap3, tHub, /\/__/);
  note('Portail connecté : accueil (tuiles) visible', '—', p3, `whoami : ${nWho3} · allers-retours en série avant l'accueil : ${s3} · tâches longues : ${longues3.length} (max ${Math.max(0, ...longues3)} ms)`);
  ok(nWho3 === 1, 'R2. portail connecté : UN SEUL whoami au démarrage (il y en avait 3)', ap3.map((a) => a.u).join(' | '));
  ok(s3 === 1, 'R2b. l\'accueil s\'affiche après UN aller-retour au domaine, pas deux en série', `série = ${s3}`);

  /* R1 : Kevin touche une tuile DÈS que l'accueil apparaît — le laissez-passer est encore en route : la tuile doit réagir quand même */
  await page.goto('https://kd-mc.com/');
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, null, { timeout: 15000 });
  const r1 = await toucher(page, 'a.card[href="https://cmcteams-light.kd-mc.com/"]', null, RETARD * 3, true);
  note('Tuile touchée dès l\'affichage (laissez-passer encore en route)', r1.premier, r1.nav);
  ok(r1.premier != null && r1.premier >= 0 && r1.premier < RETARD, 'R1. la tuile touchée réagit à l\'écran avant la réponse du domaine (plus de bouton mort)', JSON.stringify(r1));
  await page.waitForURL(/cmcteams-light\.kd-mc\.com/, { timeout: RETARD * 4 + 4000 }).catch(() => {});   /* le départ va au bout avant la suite */

  /* ── P4/R3. toucher une tuile d'app, l'accueil affiché depuis un moment ───────────────────────── */
  await page.goto('https://kd-mc.com/');
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, null, { timeout: 15000 });
  const r3 = await toucher(page, 'a.card[href="https://cmcteams-light.kd-mc.com/"]', null, 9000);
  note('Tuile d\'app (CMCteams light) → départ vers l\'app', r3.premier, r3.nav);
  ok(r3.nav != null && r3.nav < RETARD, 'R3. on part vers l\'app sans attendre un nouvel aller-retour (laissez-passer lu d\'avance)', JSON.stringify(r3));
  await page.waitForURL(/cmcteams-light\.kd-mc\.com/, { timeout: RETARD * 4 + 4000 }).catch(() => {});

  /* ── P5. se déconnecter (rien à attendre) ──────────────────────────────────────────────────── */
  await page.goto('https://kd-mc.com/');
  await page.waitForFunction(() => { const h = document.getElementById('hub'); return h && !h.hidden; }, null, { timeout: 15000 });
  const r5 = await toucher(page, '#logout', () => { const g = document.getElementById('gate'); return g && !g.hidden; });
  note('« Se déconnecter »', r5.premier, r5.fin);
  await calme(page);

  /* ── P6. « J'ai déjà un compte — nom + code » ─────────────────────────────────────────────── */
  await page.goto('https://kd-mc.com/');
  await page.waitForFunction(() => { const g = document.getElementById('gate'); return g && !g.hidden && g.children.length > 0; }, null, { timeout: 15000 });
  if (await page.locator('#u-other').isVisible().catch(() => false)) {   /* écran « Bonjour Albert » : on passe par le code */
    await page.fill('#u-code', '271828');
    const r6 = await toucher(page, '#u-go', () => { const h = document.getElementById('hub'); return (h && !h.hidden) || !!document.getElementById('pk-skip'); }, 15000);
    note('« Se connecter » (code)', r6.premier, r6.fin);
  }

  /* ── P7/R7. compte en attente de l'administrateur : « Vérifier maintenant » ──────────────────── */
  lent = false;
  const ctxA = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await brancher(ctxA);
  let pa = await nouvelle(ctxA);
  await pa.goto('https://kd-mc.com/');
  await pa.waitForSelector('#f-create');
  Object.assign(env, WA);   /* l'attente de l'administrateur n'existe que quand WhatsApp est branché */
  const insc = await pa.evaluate(() => window.kdmcSSO.issueDetail('denise-fictive', 'Denise Fictive', true, null, '271828', '', 'admin'));
  if (!(insc && insc.ok)) console.log('  (inscription en attente refusée par le domaine : ' + JSON.stringify(insc) + ')');
  await pa.close(); pa = await nouvelle(ctxA);
  lent = true;
  await pa.goto('https://kd-mc.com/');
  await pa.waitForSelector('#aa-go', { timeout: 15000 });
  const r7 = await toucher(pa, '#aa-go', null, RETARD + 1500);
  note('« Vérifier maintenant » (compte en attente)', r7.premier, '—');
  ok(r7.premier != null && r7.premier >= 0 && r7.premier < RETARD, 'R7. « Vérifier maintenant » réagit à l\'écran avant la réponse du domaine', JSON.stringify(r7));
  await ctxA.close();
  Object.keys(WA).forEach((k) => { delete env[k]; });

  /* ── ADMIN : session admin vérifiée (code admin de TEST, jamais le vrai) ─────────────────────── */
  lent = false;
  await page.goto('https://kd-mc.com/');
  await page.evaluate(() => window.kdmcSSO.adminCode('424242'));
  lent = true;
  await page.close(); page = await nouvelle(ctx);
  t0 = Date.now();
  await page.goto('https://kd-mc.com/admin/');
  await page.waitForSelector('#a-traiter', { timeout: 20000 });
  const tCoq = Date.now() - t0;
  const tCoqP = await page.evaluate(() => performance.now());
  await page.waitForSelector('#commerce-app .kpis', { timeout: 20000 }).catch(() => {});
  const tCom = Date.now() - t0; const tComP = await page.evaluate(() => performance.now());
  await page.waitForSelector('#presence', { timeout: 20000 }).catch(() => {});
  const tPres = Date.now() - t0; const tPresP = await page.evaluate(() => performance.now());
  await dodo(RETARD + 500);
  const apA = await page.evaluate(() => window.__appels);
  const longA = await page.evaluate(() => window.__longues);
  const nWhoA = apA.filter((a) => /\/__sso\/whoami/.test(a.u)).length;
  const sCom = serie(apA, tComP, /\/__|commerce-data|kdmc-vente/);
  const sPres = serie(apA, tPresP, /\/__/);
  note('Tableau de bord admin : coquille (« À traiter maintenant »)', '—', tCoq, `allers-retours en série : ${serie(apA, tCoqP, /\/__/)}`);
  note('Tableau de bord admin : section Commerce remplie', '—', tCom, `allers-retours en série : ${sCom}`);
  note('Tableau de bord admin : comptes (connectés) affichés', '—', tPres, `allers-retours en série : ${sPres} · whoami : ${nWhoA} · tâches longues : ${longA.length} (max ${Math.max(0, ...longA)} ms)`);
  ok(nWhoA === 1, 'R5. tableau de bord admin : UN SEUL whoami (il y en avait 3)', apA.filter((a) => /whoami/.test(a.u)).length);
  ok(sCom <= 2, 'R5b. la section Commerce n\'attend plus un 2e whoami en série (whoami → caisse, sans whoami → données → caisse)', `série = ${sCom}`);
  ok(sPres <= 2, 'R8. les comptes : /__admin/acces et /__admin/accounts partent ensemble (whoami → comptes)', `série = ${sPres}`);

  /* R6 : les boutons ↻ */
  const r6a = await toucher(page, '#prefresh', null, RETARD + 1500);
  note('« ↻ Rafraîchir » (connectés)', r6a.premier, '—');
  ok(r6a.premier != null && r6a.premier >= 0 && r6a.premier < RETARD, 'R6. « ↻ Rafraîchir » réagit à l\'écran avant la réponse', JSON.stringify(r6a));
  const r6b = await toucher(page, '#rf', () => !!document.querySelector('#commerce-app .kpis') && !document.querySelector('#rf[disabled]'), RETARD * 3);
  note('« ↻ Relire la caisse »', r6b.premier, r6b.fin);
  ok(r6b.premier != null && r6b.premier >= 0 && r6b.premier < RETARD, 'R6b. « ↻ Relire la caisse » réagit à l\'écran avant la réponse', JSON.stringify(r6b));
  const r6c = await toucher(page, '#tb-boite', () => { const b = document.getElementById('boite-fen'); return b && !b.hidden; });
  note('« 📬 Ouvrir la boîte »', r6c.premier, r6c.fin);
  const r6d = await toucher(page, '[data-compteur="codes"]', null, 1500);
  note('Compteur « À traiter » → aller à la section', r6d.premier, '—');
} finally { await browser.close(); globalThis.fetch = vraiFetch; }

if (MESURE) {
  console.log('\n| Action | 1re réaction (ms) | Fin (ms) | Détail |\n|---|---|---|---|');
  lignes.forEach((l) => console.log(`| ${l.quoi} | ${l.reaction == null ? 'AUCUNE' : l.reaction} | ${l.fin == null ? '—' : l.fin} | ${l.detail} |`));
}
console.log(`\nRÉACTIVITÉ PORTAIL + ADMIN — ${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
