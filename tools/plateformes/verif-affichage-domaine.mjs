#!/usr/bin/env node
/* Vérif RÉELLE de l'AFFICHAGE de toutes les apps du domaine, sur téléphone ET ordinateur (Kevin 25.10.2026 : « Dans bcp d'apps du domaine,
 * que ce soit sur tel ou ordi, il y a pas mal d'erreurs d'affichage. Des boutons qui en cachent d'autres, manque une flèche retour, le haut
 * est caché dans l'écran, page mal positionnée… Vérifie tout partout en réel »).
 *
 * Vrai Chromium, vraies adresses *.kd-mc.com, 7 écrans (iPhone SE, iPhone 13, iPhone paysage, Android, tablette, portable, grand écran).
 * Connecté EN ADMIN si l'empreinte du code est fournie (KDMC_ADMIN_PIN_SHA256, secret CI — jamais écrite ni affichée), sinon en anonyme.
 * LECTURE SEULE : toute requête qui écrit (POST/PUT/PATCH/DELETE) est bloquée, sauf la connexion admin et les lectures de session du domaine.
 *
 * Mesures, par app et par écran (au chargement, page en haut) :
 *   cache    : bouton/lien visible dont le CENTRE est recouvert par un autre élément (le doigt touche l'autre) — « des boutons qui en cachent d'autres » ;
 *   haut     : contenu visible coupé AU-DESSUS de l'écran (top < 0) alors que la page est en haut — « le haut est caché » ;
 *   deborde  : la page est plus large que l'écran (défilement horizontal) — « page mal positionnée » ;
 *   petit    : boutons < 44 px (au doigt) — téléphones seulement ;
 *   js       : erreurs JavaScript ;
 *   ms       : temps jusqu'au chargement.
 * La « flèche retour » se juge par app (navigation interne) : listée à part pour les pages ouvertes depuis un lien (`?depuis=`), pas mesurable en aveugle.
 *
 * Dépôt public : AUCUN texte de page n'est imprimé (il peut contenir des noms) — seulement balise#id.classe des éléments en cause et des nombres.
 *   node tools/plateformes/verif-affichage-domaine.mjs [hote…]     (sans argument : les 33 adresses)
 *   SORTIE=fichier.json  → détail complet en JSON (local / artefact privé seulement).
 */
import { chromium, webkit, devices } from 'playwright';
import { writeFileSync } from 'node:fs';

export const ADRESSES = ['kd-mc.com', 'www', 'cmcteams', 'cmcteams-light', 'apex-ai', 'apex-chat', 'arbre', 'autorisations', 'beatbot', 'bot',
  'chez-lolo', 'cocina', 'coffre', 'croupier', 'cuisine', 'cujina', 'dashboard', 'departs', 'dossiers', 'ia', 'javis', 'kit', 'la-detente',
  'lingua', 'osint', 'outils', 'rotaplan', 'shops', 'sourcing', 'staging', 'studio', 'tor', 'worldmonitor'];
export const url = (h) => 'https://' + (h.includes('.') ? h : h + '.kd-mc.com') + '/';

export const ECRANS = [
  { nom: 'iphone-se', tel: true, ...devices['iPhone SE'] },
  { nom: 'iphone-13', tel: true, explorer: true, ...devices['iPhone 13'] },
  { nom: 'iphone-paysage', tel: true, ...devices['iPhone 13 landscape'] },
  { nom: 'android', tel: true, ...devices['Pixel 7'] },
  { nom: 'tablette', tel: true, ...devices['iPad Mini'] },
  { nom: 'portable', tel: false, explorer: true, viewport: { width: 1280, height: 720 } },
  { nom: 'grand-ecran', tel: false, viewport: { width: 1440, height: 900 } },
];

/* Exécuté DANS la page. Ne renvoie jamais de texte de page : des sélecteurs courts et des nombres. */
export function mesurer(tel) {
  const W = innerWidth, H = innerHeight;
  const court = (e) => {
    if (!e || !e.tagName) return '?';
    let s = e.tagName.toLowerCase();
    if (e.id) s += '#' + String(e.id).slice(0, 24);
    if (e.tagName === 'IFRAME') { try { s += '[' + new URL(e.src, location.href).pathname.slice(0, 30) + ']'; } catch (_) { /* adresse illisible */ } }
    const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (c.length) s += '.' + c.map((x) => x.slice(0, 18)).join('.');
    return s;
  };
  const visible = (e) => {
    const st = getComputedStyle(e);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const cliquables = [...document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, [onclick], summary')]
    .filter(visible);
  const caches = [], petits = [], toasts = [];
  for (const e of cliquables) {
    const r = e.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;          // hors de l'écran : pas jugé (défilement)
    const dessus = document.elementFromPoint(cx, cy);
    if (dessus && dessus !== e && !e.contains(dessus) && !dessus.contains(e)) {
      /* pas un recouvrement : un libellé du même champ, un marqueur de carte sous les contrôles de la carte (normal) */
      const lab = dessus.closest && dessus.closest('label');
      const carte = e.closest && e.closest('.leaflet-marker-pane, .leaflet-tile-pane, .leaflet-overlay-pane, .maplibregl-canvas-container');
      const ephemere = dessus.closest && dessus.closest('[class*="toast"], [id*="toast"], [role="status"], [role="alert"]');
      if (lab && (lab.contains(e) || (e.id && lab.htmlFor === e.id))) { /* même champ */ }
      else if (carte) { /* marqueur / tuile de carte */ }
      else if (ephemere) toasts.push(court(e));
      else caches.push(court(e) + ' ⟵ sous ' + court(dessus));
    }
    if (tel && (r.width < 44 || r.height < 44) && e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA' && e.tagName !== 'SELECT') petits.push(court(e));
  }
  /* haut coupé : un élément visible qui porte du texte ou une image, dont le haut est AU-DESSUS de l'écran alors que la page est tout en haut */
  const haut = [];
  if ((scrollY || document.scrollingElement.scrollTop) < 2) {
    for (const e of document.body ? document.body.querySelectorAll('h1, h2, header, nav, [class*="head"], [class*="top"], button, a, img') : []) {
      if (!visible(e)) continue;
      if (e.closest('.leaflet-container, .maplibregl-map') || /skip|sr-only|visually-hidden/i.test(typeof e.className === 'string' ? e.className : '')) continue;   // carte qui déborde exprès, lien « aller au contenu »
      const r = e.getBoundingClientRect();
      if (r.top < -4 && r.bottom > 0 && r.left < W && r.right > 0) haut.push(court(e) + ' (' + Math.round(r.top) + ' px)');
    }
  }
  /* encoche iPhone : la page s'étend SOUS la barre d'état (viewport-fit=cover) mais aucune règle ne la décale (safe-area-inset-top) →
     sur l'iPhone, en app installée, le haut passe sous l'heure et la batterie. Chromium ne simule pas l'encoche : on lit la règle. */
  const vp = (document.querySelector('meta[name="viewport"]') || {}).content || '';
  let safe = /safe-area-inset-top/.test(document.documentElement.outerHTML.slice(0, 200000));
  if (!safe) { for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { if (/safe-area-inset-top/.test(r.cssText)) { safe = true; break; } } } catch (_) { /* feuille d'un autre domaine */ } if (safe) break; } }
  const encoche = /viewport-fit\s*=\s*cover/.test(vp) && !safe;
  /* largeur VRAIE de l'écran, en px CSS : un mobile qui « avale » une page trop large se dézoome (innerWidth grossit, l'échelle baisse) ;
     largeur visible × échelle = la fenêtre d'origine, en portrait comme en paysage (25.10 : screen.width donnait un faux « +360 px » en paysage). */
  const vv = window.visualViewport;
  const LARG_ECRAN = vv ? Math.round(vv.width * vv.scale) : W;
  const largeur = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  return {
    titre: !!document.title,
    cache: caches.length, cacheEx: caches.slice(0, 4), toast: toasts.length,
    haut: haut.length, hautEx: haut.slice(0, 3),
    /* sur téléphone, Chrome/Safari ÉLARGISSENT la page pour faire tenir un contenu trop large (innerWidth grossit, la page se dézoome) :
       on compare donc à la largeur de l'ÉCRAN, pas à innerWidth. */
    deborde: largeur > LARG_ECRAN + 2 ? largeur - LARG_ECRAN : 0,
    encoche,
    petit: petits.length, petitEx: petits.slice(0, 3),
    cliquables: cliquables.length,
  };
}

/* EXPLORATION (Kevin 25.10 : « va plus loin, réel aussi test ») : un niveau plus loin dans chaque app. Exécuté DANS la page :
   les candidats = onglets, barres de navigation, menus (jamais un bouton qui envoie/supprime/achète : filtré par son libellé). */
export function candidatsNavigation() {
  const DANGER = /supprim|effac|envoy|valid|achet|pay|commander|déconnex|deconnex|logout|quitter|réinit|reinit|publier|signer|accepter|refuser|bloquer|bannir/i;
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 8 && r.height > 8 && st.visibility !== 'hidden' && st.display !== 'none' && r.top < innerHeight && r.bottom > 0; };
  const sel = 'nav a, nav button, [role="tab"], [role="tablist"] > *, .tabs > *, .tab, .tabbar > *, .nav > *, .onglets > *, footer button, header button, [data-tab], [data-onglet], [data-va]';
  const vus = new Set(), out = [];
  /* pas de barre d'onglets : on prend les tuiles / boutons du contenu (portail, tableaux de bord) */
  const repli = 'main a[href], main button, .grid a, .grid button, a.tile, .tile, .tuile, a.card, [class*="card"] a, section button';
  const liste = [...document.querySelectorAll(sel)];
  if (!liste.some(vis)) liste.push(...document.querySelectorAll(repli));
  for (const e of liste) {
    if (vus.has(e) || !vis(e)) continue; vus.add(e);
    const lib = ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim();
    if (DANGER.test(lib)) continue;
    /* l'onglet DÉJÀ ouvert ne change rien quand on le touche : ce n'est pas un bouton mort */
    if (e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') || /(^|\s)(active|actif|on|sel|selected|courant)(\s|$)/.test(typeof e.className === 'string' ? e.className : '')) continue;
    if (e.tagName === 'A' && e.href && new URL(e.href, location.href).host !== location.host) continue;   // on reste dans l'app
    e.setAttribute('data-kdmc-explo', String(out.length));
    out.push(out.length);
    if (out.length >= 6) break;
  }
  return out.length;
}
export function aUnRetour() {
  const RET = /^\s*(←|‹|⟵|◀|<|✕|×|✖)|retour|revenir|fermer|back|close/i;
  return [...document.querySelectorAll('a, button, [role="button"]')].some((e) => {
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.top > innerHeight || r.bottom < 0) return false;
    return RET.test((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.textContent || '').trim().slice(0, 20));
  });
}

async function connecterAdmin(page, hash) {
  await page.goto('https://kd-mc.com/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page.evaluate(async (h) => {
    const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
    const j = await x.json().catch(() => ({}));
    try { if (j.token) localStorage.setItem('kdmc_sso_token', j.token); } catch (_) { /* stockage interdit */ }
    return { st: x.status, ok: !!j.ok };
  }, hash);
}

/* Lecture seule : on laisse passer les lectures, la connexion admin et les échanges de session du domaine ; tout le reste qui écrit est bloqué. */
const ECRITURE_PERMISE = /\/__admin\/login$|\/__sso\/(whoami|pass|refresh|session)/;
export async function lectureSeule(ctx) {
  await ctx.route('**/*', (r) => {
    const q = r.request();
    if (q.method() === 'GET' || q.method() === 'HEAD' || q.method() === 'OPTIONS' || ECRITURE_PERMISE.test(q.url())) return r.continue();
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"lecture_seule":true}' });
  });
}

export async function verifier({ hotes = ADRESSES, ecrans = ECRANS, hash = '', journal = console.log } = {}) {
  const b = await chromium.launch({ headless: true });
  /* WEBKIT=1 (CI) : les écrans d'iPhone / iPad passent par le moteur de Safari, comme sur l'appareil de Kevin. */
  const bw = process.env.WEBKIT === '1' ? await webkit.launch({ headless: true }).catch(() => null) : null;
  const res = [];
  try {
    for (const ec of ecrans) {
      const { nom, tel, explorer, ...opts } = ec;
      const moteur = bw && /iphone|tablette/.test(nom) ? bw : b;
      delete opts.defaultBrowserType;
      const ctx = await moteur.newContext({ ...opts });
      await lectureSeule(ctx);
      const page = await ctx.newPage();
      let admin = false;
      if (hash) { const c = await connecterAdmin(page, hash).catch(() => ({ ok: false })); admin = c.ok; journal(`=== ${nom} [${moteur === bw ? 'webkit' : 'chromium'}] (${opts.viewport.width}×${opts.viewport.height}) — connexion admin : ${admin ? 'oui' : 'NON'}`); }
      else journal(`=== ${nom} [${moteur === bw ? 'webkit' : 'chromium'}] (${opts.viewport.width}×${opts.viewport.height}) — anonyme`);
      for (const h of hotes) {
        const js = [];
        const onErr = (e) => js.push(String(e && e.message).replace(/["'«][^"'»]{12,}["'»]/g, '"…"').replace(/\S+@\S+/g, '…@…').replace(/\d{6,}/g, '…').slice(0, 70));
        page.on('pageerror', onErr);
        const t0 = Date.now(); let st = 0, m = null, err = '';
        try {
          const rep = await page.goto(url(h), { waitUntil: 'load', timeout: 30000 });
          st = rep ? rep.status() : 0;
          await page.waitForTimeout(4500);                               // laisser les apps dessiner ET Bee se ranger (il se replace à 1,2 s puis 3,5 s)
          await page.evaluate(() => window.scrollTo(0, 0));
          m = await page.evaluate(mesurer, tel);
        } catch (e) { err = String(e && e.message).split('\n')[0].slice(0, 90); }
        page.off('pageerror', onErr);
        /* un niveau plus loin (écrans « explorer ») : toucher chaque onglet/menu, remesurer, noter s'il a réagi et si un retour existe */
        let explo = null;
        if (m && ec.explorer) {
          explo = { touches: 0, morts: 0, sansRetour: 0, cache: 0, haut: 0, deborde: 0, js: 0, ex: [] };
          const n = await page.evaluate(candidatsNavigation).catch(() => 0);
          for (let k = 0; k < n; k++) {
            try {
              const avant = await page.evaluate(() => location.href + '|' + document.body.innerHTML.length + '|' + document.querySelectorAll('*').length);
              const cible = page.locator('[data-kdmc-explo="' + k + '"]').first();
              if (!(await cible.count())) continue;
              const jsAvant = js.length;
              await cible.click({ timeout: 4000, trial: false });
              await page.waitForTimeout(1200);
              explo.touches++;
              const apres = await page.evaluate(() => location.href + '|' + document.body.innerHTML.length + '|' + document.querySelectorAll('*').length);
              if (apres === avant) { explo.morts++; if (explo.ex.length < 4) explo.ex.push('sans réaction : n°' + k); }
              const m2 = await page.evaluate(mesurer, tel);
              const changePage = apres.split('|')[0] !== avant.split('|')[0];
              if (changePage && !(await page.evaluate(aUnRetour))) { explo.sansRetour++; if (explo.ex.length < 4) explo.ex.push('pas de retour après n°' + k); }
              explo.cache += m2.cache; explo.haut += m2.haut; explo.deborde = Math.max(explo.deborde, m2.deborde); explo.js += js.length - jsAvant;
              if (m2.cache && explo.ex.length < 4) explo.ex.push('caché après n°' + k + ' : ' + m2.cacheEx[0]);
              if (changePage) { await page.goto(url(h), { waitUntil: 'load', timeout: 30000 }); await page.waitForTimeout(1500); await page.evaluate(candidatsNavigation); }
            } catch (e) { /* un onglet qui ne se laisse pas toucher : compté comme mort */ explo.morts++; }
          }
        }
        const ligne = { app: h, ecran: nom, admin, st, ms: Date.now() - t0, js: js.length, jsEx: [...new Set(js)].slice(0, 2), err, ...(m || {}), explo };
        res.push(ligne);
        const pb = m ? [m.cache && `${m.cache} caché(s)`, m.haut && `haut coupé ×${m.haut}`, tel && m.encoche && 'haut sous l\'encoche iPhone', m.deborde && `déborde +${m.deborde}px`, tel && m.petit && `${m.petit} < 44px`, js.length && `${js.length} err JS`].filter(Boolean) : [err || 'échec'];
        journal(`${pb.length ? '❌' : '✅'} ${h} · ${nom} · HTTP ${st} · ${ligne.ms} ms${pb.length ? ' · ' + pb.join(' · ') : ''}`);
        if (m && m.cache) journal('   ↳ caché : ' + m.cacheEx.join(' | '));
        if (m && m.haut) journal('   ↳ haut : ' + m.hautEx.join(' | '));
        if (js.length) journal('   ↳ js : ' + [...new Set(js)].slice(0, 2).join(' | '));
        if (explo) journal(`   ↳ exploré : ${explo.touches} touché(s) · ${explo.morts} sans réaction · ${explo.sansRetour} page(s) sans retour · ${explo.cache} caché(s) · haut ${explo.haut} · déborde ${explo.deborde}${explo.ex.length ? ' · ' + explo.ex.join(' | ') : ''}`);
      }
      await ctx.close();
    }
  } finally { await b.close(); if (bw) await bw.close(); }
  return res;
}

export function bilan(res) {
  const parApp = {};
  for (const r of res) {
    const a = (parApp[r.app] ||= { cache: 0, haut: 0, deborde: 0, petit: 0, js: 0, encoche: false, ecransKO: [], ex: new Set(), err: '' });
    if (r.encoche) a.encoche = true;
    if (r.explo) { a.morts = (a.morts || 0) + r.explo.morts; a.sansRetour = (a.sansRetour || 0) + r.explo.sansRetour; a.cache += r.explo.cache; a.haut += r.explo.haut; a.deborde = Math.max(a.deborde, r.explo.deborde); a.js += r.explo.js; for (const x of r.explo.ex) if (a.ex.size < 6) a.ex.add(x); }
    if (r.err && !a.err) a.err = r.err;
    if (r.jsEx && r.jsEx.length && !a.jsEx) a.jsEx = r.jsEx;
    for (const x of [...(r.cacheEx || []).slice(0, 2).map((v) => 'caché ' + v), ...(r.hautEx || []).slice(0, 1).map((v) => 'haut ' + v)]) if (a.ex.size < 4) a.ex.add(x);
    a.cache += r.cache || 0; a.haut += r.haut || 0; a.deborde = Math.max(a.deborde, r.deborde || 0); a.js += r.js || 0;
    if (ECRANS.find((e) => e.nom === r.ecran)?.tel) a.petit = Math.max(a.petit, r.petit || 0);
    if (r.err || r.cache || r.haut || r.deborde || r.js) a.ecransKO.push(r.ecran);
  }
  return parApp;
}

if (process.argv[1] && process.argv[1].endsWith('verif-affichage-domaine.mjs')) {
  const hotes = process.argv.slice(2).length ? process.argv.slice(2) : ADRESSES;
  const res = await verifier({ hotes, hash: process.env.KDMC_ADMIN_PIN_SHA256 || '' });
  const B = bilan(res);
  console.log('\n=== BILAN par app (cache = boutons recouverts, haut = haut coupé, deborde = px de trop, petit = max < 44 px sur téléphone) ===');
  let ko = 0;
  for (const [app, a] of Object.entries(B)) {
    const mauvais = a.cache || a.haut || a.deborde || a.js || a.encoche || a.morts || a.sansRetour || a.ecransKO.length;
    if (mauvais) ko++;
    console.log(`${mauvais ? '❌' : '✅'} ${app} · cache ${a.cache} · haut ${a.haut} · deborde ${a.deborde} · petit ${a.petit} · js ${a.js}${a.morts ? ' · ' + a.morts + ' bouton(s) sans réaction' : ''}${a.sansRetour ? ' · ' + a.sansRetour + ' page(s) sans retour' : ''}${a.encoche ? ' · encoche iPhone' : ''}${a.ecransKO.length ? ' · écrans : ' + [...new Set(a.ecransKO)].join(',') : ''}${a.err ? ' · erreur : ' + a.err : ''}${a.jsEx ? ' · js ex : ' + a.jsEx.join(' / ') : ''}${a.ex.size ? ' · ex : ' + [...a.ex].join(' | ') : ''}`);
  }
  console.log(`\nℹ️ ${Object.keys(B).length} apps × ${ECRANS.length} écrans = ${res.length} pages ; ${ko} app(s) à corriger`);
  if (process.env.SORTIE) writeFileSync(process.env.SORTIE, JSON.stringify(res, null, 1));
}
