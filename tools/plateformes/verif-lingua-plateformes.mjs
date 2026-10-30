#!/usr/bin/env node
/* Lingua — TOUTES LES PLATEFORMES (Kevin 22.10.2026 : « teste toujours tout sur l'ordinateur, iPhone, Android, toutes les plateformes… aucun bug visuel,
   fonctionnel, de fluidité »). Le VRAI code de Lingua (dossier lingua/, servi tel quel) dans de vrais navigateurs, sur une matrice d'appareils :
   iPhone (portrait + paysage), Android, tablettes, portable bas (le Lenovo), grand écran. Compte LOCAL fictif, aucun réseau, aucune vraie donnée.
   Par appareil et par moteur, deux scénarios :
     A. compte avec un cours (anglais) : 0 erreur JavaScript ; la page ne déborde pas en largeur ; la barre d'onglets est ENTIÈRE dans l'écran ;
        chaque onglet répond à un VRAI toucher/clic (le doigt tombe bien sur l'onglet, rien ne le recouvre) et change d'écran ; au toucher chaque
        onglet fait ≥ 40 px ; la version est dans la barre ; « La vraie vie » s'ouvre ; une leçon s'ouvre et se referme.
     B. compte SANS langue (« Choisis une langue ») : les onglets Traduire et Profil s'ouvrent, Réviser dit « Choisis d'abord une langue » (bug de septembre).
   Moteurs : chromium (toujours), webkit = le moteur de Safari/iPhone, firefox — si installés (dépôt PUBLIC : gratuit, workflow lingua-plateformes.yml).
   Un moteur absent est DIT. node tools/plateformes/verif-lingua-plateformes.mjs     ENGINES=chromium,webkit,firefox     PLAT=iPhone pour filtrer
   Sabotage : LINGUA_DIR=<dossier d'une ancienne version de lingua/> → doit devenir rouge sur le défaut qu'elle avait. */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINGUA = process.env.LINGUA_DIR ? path.resolve(process.env.LINGUA_DIR) : path.join(ROOT, 'lingua');
let n = 0, ko = 0; const rouges = [];
const ok = (c, l) => { n++; if (!c) { ko++; rouges.push(l); } console.log((c ? '  ✅ ' : '  ❌ ') + l); };

let pw; for (const m of ['playwright', 'playwright-core']) { try { pw = await import(m); break; } catch (e) { /* suivant */ } }
if (!pw) { console.log('  ⏭  playwright absent : rien lancé'); process.exit(process.env.EXIGE_PLAYWRIGHT ? 1 : 0); }
const P = pw.default || pw;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); let f = decodeURIComponent(u.pathname);
  if (f.startsWith('/__')) { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":false,"reason":"hors_ligne_test"}'); return; }
  if (f === '/') f = '/index.html';
  const fp = path.join(LINGUA, f);
  if (!fp.startsWith(LINGUA) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory() || /\/sw\.js$/.test(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r);
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port;

function chromePath() { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; try { for (const d of fs.readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) { const c = path.join(b, d, 'chrome-linux', 'chrome'); if (fs.existsSync(c)) return c; } } catch (e) { /* rien */ } return undefined; }

const D = P.devices || {};
const MATRICE = [
  { nom: 'iPhone 13 portrait', dev: 'iPhone 13', moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 13 paysage', dev: 'iPhone 13 landscape', moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 14 Pro portrait 390x844 (celui de Kevin)', vp: { width: 390, height: 844 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 14 Pro paysage 844x390 (celui de Kevin)', vp: { width: 844, height: 390 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone SE (petit 375)', dev: 'iPhone SE', moteurs: ['webkit', 'chromium'] },
  { nom: 'Android Pixel 7', dev: 'Pixel 7', moteurs: ['chromium'] },
  { nom: 'Android Galaxy S9+ paysage', dev: 'Galaxy S9+ landscape', moteurs: ['chromium'] },
  { nom: 'iPad portrait', dev: 'iPad (gen 7)', moteurs: ['webkit', 'chromium'] },
  { nom: 'Tablette Android paysage', dev: 'Galaxy Tab S4 landscape', moteurs: ['chromium'] },
  { nom: 'iPad Air portrait 820x1180', vp: { width: 820, height: 1180 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPad Air paysage 1180x820', vp: { width: 1180, height: 820 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'Portable bas 1272x635 (Lenovo)', vp: { width: 1272, height: 635 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Portable 1366x768', vp: { width: 1366, height: 768 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  /* 23.10 (Lenovo, Chrome de bureau étroit : « à 375 px, défilement horizontal = OUI ») : un navigateur de BUREAU étroit n'est pas un téléphone — il ne dézoome pas, il défile.
     Largeurs réelles de téléphones, SANS émulation mobile. */
  { nom: 'Navigateur étroit 340 px', vp: { width: 340, height: 740 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Navigateur étroit 360 px (Android courant)', vp: { width: 360, height: 780 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Navigateur étroit 375 px (iPhone SE/mini)', vp: { width: 375, height: 800 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Navigateur étroit 390 px (iPhone Pro)', vp: { width: 390, height: 844 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Navigateur étroit 412 px (Pixel)', vp: { width: 412, height: 915 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Grand écran 1920x1080', vp: { width: 1920, height: 1080 }, souris: true, moteurs: ['chromium'] }
];
const filtre = process.env.PLAT ? new RegExp(process.env.PLAT, 'i') : null;
const voulus = (process.env.ENGINES || 'chromium,webkit,firefox').split(',').map((x) => x.trim());

const lanceurs = {};
for (const m of voulus) {
  try {
    const type = P[m] || (P.default && P.default[m]); if (!type) throw new Error('moteur inconnu');
    lanceurs[m] = await type.launch(m === 'chromium' ? { executablePath: chromePath() } : {});
  } catch (e) { console.log(`  ⏭  moteur « ${m} » absent ici (${String(e.message).split('\n')[0].slice(0, 70)}) — couvert par le robot du dépôt public`); }
}
if (!Object.keys(lanceurs).length) { console.log('  ❌ aucun moteur disponible : rien à mesurer'); process.exit(1); }   /* un job par moteur en CI : chacun n\'en lance qu\'un */

const ONGLETS = ['Accueil', 'Réviser', 'Coach', 'Traduire', 'Ligue', 'Profil'];

async function ouvrir(moteur, ap, avecCours) {
  const br = lanceurs[moteur];
  const opts = ap.dev ? { ...D[ap.dev], locale: 'fr-FR' } : ap.tactile ? { viewport: ap.vp, locale: 'fr-FR', hasTouch: true, isMobile: moteur !== 'firefox', deviceScaleFactor: 3 } : { viewport: ap.vp, locale: 'fr-FR', hasTouch: false };
  if (!ap.dev && moteur === 'chromium') opts.deviceScaleFactor = 1;
  const ctx = await br.newContext({ ...opts, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript((cours) => {
    if (sessionStorage.getItem('seed')) return; sessionStorage.setItem('seed', '1');
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'k', name: 'Élève Test', avatar: '🦊', code: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('k'));
    if (cours) { localStorage.setItem('lingua_a_k_course', JSON.stringify('en')); localStorage.setItem('lingua_a_k_placeAsked', 'true'); }
    localStorage.setItem('lingua_a_k_sound', 'false'); localStorage.setItem('lingua_a_k_voice', JSON.stringify('device'));
  }, avecCours);
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', (e) => erreurs.push('js: ' + String(e.message).slice(0, 120)));
  const attente = [];
  p.on('console', (m) => {
    if (m.type() !== 'error' || /Failed to load resource|net::ERR|favicon|manifest|ERR_FAILED|status of 40[134]|403|NetworkError|Load failed|hors_ligne_test/i.test(m.text())) return;
    const txt = 'console: ' + m.text().slice(0, 120);
    /* 30.10 : le moteur 3D (three.js) ne marche qu'en WebGL2. Un navigateur SANS WebGL2 (Firefox du dépôt public, vieux téléphone) le dit dans la console
       et Lingua garde la marionnette 2D — ce n'est pas une erreur de Lingua. On ne passe sous silence ce message QUE si la page n'a vraiment pas de WebGL2 ;
       s'il y en a un et que le moteur échoue quand même, l'erreur reste rouge. */
    if (/WebGLRenderer/i.test(m.text())) attente.push(p.evaluate(() => { try { return !document.createElement('canvas').getContext('webgl2'); } catch (e) { return true; } }).then((sans) => { if (!sans) erreurs.push(txt); }, () => { erreurs.push(txt); }));
    else erreurs.push(txt);
  });
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  let pret = false;
  for (let k = 0; k < 80 && !pret; k++) { pret = await p.evaluate(() => document.querySelectorAll('.tabbar .tab').length >= 6).catch(() => false); if (!pret) await p.waitForTimeout(250); }
  if (!pret) throw new Error('la barre d\'onglets ne s\'est pas dessinée en 20 s');
  await p.waitForTimeout(900);
  await Promise.all(attente);
  return { ctx, p, erreurs, touch: !!opts.hasTouch };
}

/* appui comme une personne : au doigt (tap) sur écran tactile, clic à la souris sinon — sur le centre RÉEL de l'onglet (si quelque chose le recouvre, rien ne se passe) */
async function appuyer(p, touch, i) {
  const sel = '.tabbar .tab:nth-child(' + (i + 1) + ')';
  try { if (touch) await p.tap(sel, { timeout: 4000 }); else await p.click(sel, { timeout: 4000 }); return true; } catch (e) { return false; }
}
const actif = (p) => p.evaluate(() => ((document.querySelector('.tabbar .tab.active') || {}).textContent || '').trim()).catch(() => '');
const texte = (p) => p.evaluate(() => (document.body.innerText || '').trim()).catch(() => '');

async function scenarioA(moteur, ap) {
  const { ctx, p, erreurs, touch } = await ouvrir(moteur, ap, true);
  const out = { erreurs };
  out.geo = await p.evaluate(() => {
    const W = Math.round(window.visualViewport ? visualViewport.width : innerWidth), b = document.querySelector('.tabbar'), r = b.getBoundingClientRect();
    const tabs = [...b.querySelectorAll('.tab')].map((t) => { const q = t.getBoundingClientRect(); return { x: q.left, r: q.right, y: q.top, b: q.bottom, w: q.width, h: q.height, txt: (t.textContent || '').trim() }; });
    return { W, H: innerHeight, deborde: document.documentElement.scrollWidth - W, barreDans: r.left >= -1 && r.right <= W + 1 && r.bottom <= innerHeight + 1 && r.top >= 0, n: tabs.length,
      sortis: tabs.filter((t) => t.x < -1 || t.r > W + 1).map((t) => t.txt.slice(0, 10)), minCote: Math.min(...tabs.map((t) => Math.min(t.w, t.h))),
      hautPetit: Math.round(Math.min(...['.tb-flag', '.tb-av', '.tb-cercle'].map((q) => { const e = document.querySelector(q); const r = e && e.getBoundingClientRect(); return r ? Math.min(r.width, r.height) : 99; }))),
      version: !!document.querySelector('.tabbar .tab-ver'), portail: !!document.querySelector('.tabbar a[data-kdmc-retour]'),
      cartes: ['vie-link', 'appel-link', 'cercle-link', 'verbs-link', 'pron-link', 'hist-link', 'stats-link'].filter((c) => document.querySelector('.' + c)).length };
  });
  /* rien ne recouvre un onglet : l'élément qui reçoit le doigt au centre est l'onglet lui-même */
  out.recouverts = await p.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].filter((t) => { const q = t.getBoundingClientRect(); if (!q.width || !q.height) return false; const e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(e && (e === t || t.contains(e))); }).map((t) => (t.textContent || '').trim().slice(0, 10)));
  const vus = new Set(); const muets = []; const debordent = []; const petitesCibles = [];
  const largeur = () => p.evaluate(() => document.documentElement.scrollWidth - Math.round(window.visualViewport ? visualViewport.width : innerWidth)).catch(() => 0);
  for (let i = 0; i < ONGLETS.length; i++) {
    const nomOnglet = await p.evaluate((k) => ((document.querySelectorAll('.tabbar .tab')[k] || {}).textContent || '').trim(), i);
    if (/Portail/.test(nomOnglet)) continue;
    const a = await appuyer(p, touch, i); await p.waitForTimeout(700);
    const t = await texte(p); const act = await actif(p);
    if (!a || !act || t.length < 30) muets.push(ONGLETS[i]); else vus.add(t.slice(0, 160));
    if ((await largeur()) > 2) debordent.push(ONGLETS[i]);
    /* zones de toucher < 44 px (mission 958 du Lenovo) : exceptions voulues = l'étiquette de version de la barre (.tab-ver) et les cases à cocher (leur étiquette entière est la cible) */
    const petites = await p.evaluate(() => { const o = []; document.querySelectorAll('a[href],button,select,textarea,input:not([type=checkbox]),[role=button],.tab').forEach((e) => { const q = e.getBoundingClientRect(), st = getComputedStyle(e);
      if (!q.width || !q.height || st.visibility === 'hidden' || st.display === 'none' || st.pointerEvents === 'none' || e.classList.contains('tab-ver')) return; if (Math.min(q.width, q.height) < 43.5) o.push((e.tagName + '.' + (typeof e.className === 'string' ? e.className.split(' ')[0] : '') + ' ' + Math.round(q.width) + 'x' + Math.round(q.height))); }); return o; }).catch(() => []);
    petites.forEach((x) => { if (!petitesCibles.includes(ONGLETS[i] + ':' + x)) petitesCibles.push(ONGLETS[i] + ':' + x); });
  }
  out.muets = muets; out.distincts = vus.size; out.debordent = debordent; out.petitesCibles = petitesCibles;
  /* La vraie vie + une leçon */
  await appuyer(p, touch, 0); await p.waitForTimeout(600);
  out.vie = await p.evaluate(async () => {
    const l = document.querySelector('.vie-link'); if (!l) return { err: 'carte absente' }; l.click(); await new Promise((r) => setTimeout(r, 600));
    const leçons = document.querySelectorAll('.vie-lecon').length; const first = document.querySelector('.vie-lecon'); if (!first) return { err: 'aucune leçon', leçons };
    first.click(); await new Promise((r) => setTimeout(r, 1200));
    const corps = !!document.querySelector('.lesson-body'); const deb = document.documentElement.scrollWidth - innerWidth;
    const foot = document.querySelector('.lesson-foot'); const fr = foot ? foot.getBoundingClientRect() : null;
    return { leçons, corps, deb, footDans: !!fr && fr.bottom <= innerHeight + 1 };
  });
  await ctx.close();
  return out;
}

/* C. tous les autres écrans, un par un (verbes, prononciation, histoires, anecdotes, statistiques, deux jeux, Réviser, dictionnaire, révision, Ligue, Profil) */
async function scenarioC(moteur, ap) {
  const { ctx, p, erreurs, touch } = await ouvrir(moteur, ap, true);
  const res = []; const retour = async () => {
    for (let k = 0; k < 4; k++) {
      if (await p.$('.tabbar')) { if (await appuyer(p, touch, 0)) { await p.waitForTimeout(450); return true; } }
      await p.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /Accueil|Quitter|Fermer|Terminer|^✕$|^×$|^←/.test((x.textContent || '').trim()) || x.classList.contains('quit') || x.classList.contains('bz-quit')); if (b) b.click(); }).catch(() => {});
      await p.waitForTimeout(600);
    }
    return !!(await p.$('.tabbar'));
  };
  const ECRANS = [['Les verbes', '.verbs-link'], ['Prononciation', '.pron-link'], ['Histoires', '.stories-card:not(.verbs-link):not(.pron-link):not(.hist-link):not(.vie-link):not(.appel-link):not(.cercle-link):not(.stats-link)'],
    ['Histoire et anecdotes', '.hist-link'], ['Statistiques', '.stats-link'], ['Défi éclair', '.game-card.blitz'], ['Paires', '.game-card.pairs'], ['Mon cercle', '.cercle-link']];
  for (const [nom, sel] of ECRANS) {
    const rentre = await retour(); if (!rentre) { res.push({ nom, bloque: true }); break; }
    const e0 = erreurs.length;
    const clique = await p.evaluate((q) => { const e = document.querySelector(q); if (!e) return false; e.click(); return true; }, sel).catch(() => false);
    await p.waitForTimeout(1100);
    const t = await texte(p); const dehors = await p.evaluate(() => document.documentElement.scrollWidth - Math.round(window.visualViewport ? visualViewport.width : innerWidth)).catch(() => 0);
    res.push({ nom, clique, dessin: t.length > 60, erreurs: erreurs.length - e0, deborde: dehors > 2 });
  }
  const r2 = await retour(); let revue = null;
  if (r2) {
    await appuyer(p, touch, 1); await p.waitForTimeout(800);
    revue = await p.evaluate(async () => { const o = { boutons: document.querySelectorAll('.review-card button').length };
      const d = [...document.querySelectorAll('.review-card button')].find((x) => /dictionnaire/i.test(x.textContent)); if (d) { d.click(); await new Promise((r) => setTimeout(r, 800)); o.dict = document.querySelectorAll('.dict-unit, .dict-grid').length; }
      return o; }).catch(() => ({}));
    await appuyer(p, touch, 4); await p.waitForTimeout(700); const lig = (await texte(p)).length > 60;
    await appuyer(p, touch, 5); await p.waitForTimeout(700); const pro = (await texte(p)).length > 80;
    revue.lig = lig; revue.pro = pro;
  }
  await ctx.close();
  return { res, revue, r2 };
}

async function scenarioB(moteur, ap) {
  const { ctx, p, erreurs, touch } = await ouvrir(moteur, ap, false);
  const choix = await p.evaluate(() => /Choisis une langue/.test(document.body.innerText || '')).catch(() => false);
  const idx = await p.evaluate((noms) => noms.map((n) => [...document.querySelectorAll('.tabbar .tab')].findIndex((x) => (x.textContent || '').includes(n))), ['Traduire', 'Profil', 'Réviser']);
  await appuyer(p, touch, idx[0]); await p.waitForTimeout(700); const tr = (await actif(p)).includes('Traduire') && !/Choisis une langue/.test(await texte(p));
  await appuyer(p, touch, idx[1]); await p.waitForTimeout(700); const pr = (await actif(p)).includes('Profil');
  await appuyer(p, touch, idx[2]); await p.waitForTimeout(600); const rv = await p.evaluate(() => /Choisis d'abord une langue/.test(document.body.innerText)).catch(() => false);
  await ctx.close();
  return { choix, tr, pr, rv, erreurs };
}

for (const ap of MATRICE) {
  if (filtre && !filtre.test(ap.nom)) continue;
  if (ap.dev && !D[ap.dev]) { console.log(`\n== ${ap.nom} : profil « ${ap.dev} » inconnu de cette version de Playwright`); continue; }
  for (const moteur of ap.moteurs) {
    if (!lanceurs[moteur]) continue;
    console.log(`\n== ${ap.nom} — ${moteur} ==`);
    const tag = `${ap.nom}/${moteur}`; const t0 = Date.now(); let A, B;
    const limite = (pr) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('plus de 100 s : moteur figé')), 100000))]);
    try { A = await limite(scenarioA(moteur, ap)); } catch (e) { ok(false, `${tag} : Lingua avec cours ne s'ouvre pas — ${String(e.message).split('\n')[0].slice(0, 100)}`); continue; }
    let C; try { C = await limite(scenarioC(moteur, ap)); } catch (e) { ok(false, `${tag} : parcours des écrans — ${String(e.message).split('\n')[0].slice(0, 100)}`); }
    try { B = await limite(scenarioB(moteur, ap)); } catch (e) { ok(false, `${tag} : Lingua sans langue ne s'ouvre pas — ${String(e.message).split('\n')[0].slice(0, 100)}`); }
    if (process.env.GITHUB_ACTIONS) console.log('::notice title=plateformes-etape::' + tag + ' mesuré en ' + Math.round((Date.now() - t0) / 1000) + ' s');
    const g = A.geo; const touch = !!(ap.dev ? D[ap.dev].hasTouch : ap.tactile);
    ok(A.erreurs.length === 0, `${tag} : 0 erreur JavaScript` + (A.erreurs.length ? ' — ' + A.erreurs.slice(0, 2).join(' | ') : ''));
    ok(A.debordent.length === 0, `${tag} : aucun des 6 écrans ne déborde en largeur (le navigateur ne dézoome pas la page)` + (A.debordent.length ? ' — débordent : ' + A.debordent.join(',') : ''));
    ok(g.deborde <= 2, `${tag} : la page ne déborde pas en largeur (${g.deborde} px)`);
    ok(g.barreDans && g.sortis.length === 0 && g.n >= 6, `${tag} : barre d'onglets entière dans l'écran (${g.n} onglets${g.sortis.length ? ', dehors : ' + g.sortis.join(',') : ''})`);
    ok(A.recouverts.length === 0, `${tag} : rien ne recouvre un onglet` + (A.recouverts.length ? ' — recouverts : ' + A.recouverts.join(',') : ''));
    ok(A.muets.length === 0 && A.distincts >= 5, `${tag} : les 6 onglets répondent au ${touch ? 'toucher' : 'clic'} et changent d'écran (${A.distincts} écrans distincts${A.muets.length ? ', MUETS : ' + A.muets.join(',') : ''})`);
    if (touch) ok(g.minCote >= 40, `${tag} : onglets ≥ 40 px au toucher (${Math.round(g.minCote)})`);
    if (g.W >= 340 && g.W <= 520) ok(g.hautPetit >= 43, `${tag} : drapeau, cercle et avatar de la barre du haut ≥ 44 px (${g.hautPetit} px)`);
    if (g.W >= 340 && g.W <= 520) ok(A.petitesCibles.length === 0, `${tag} : aucune zone de toucher < 44 px sur les 6 écrans (hors étiquette de version et cases à cocher)` + (A.petitesCibles.length ? ' — ' + A.petitesCibles.slice(0, 5).join(' | ') : ''));
    ok(g.version, `${tag} : la version est dans la barre`);
    ok(g.portail, `${tag} : « Portail » est dans la barre`);
    ok(g.cartes >= 6, `${tag} : cartes de l'accueil ${g.cartes}/7`);
    ok(A.vie && !A.vie.err && A.vie.leçons >= 10 && A.vie.corps && A.vie.deb <= 2 && A.vie.footDans, `${tag} : « La vraie vie » s'ouvre et une leçon démarre, bouton du bas dans l'écran` + (A.vie && A.vie.err ? ' — ' + A.vie.err : ''));
    if (C) {
      for (const x of C.res) ok(!x.bloque && x.clique && x.dessin && x.erreurs === 0 && !x.deborde, `${tag} : écran « ${x.nom} » s'ouvre, affiche du contenu, 0 erreur, ne déborde pas` + (x.bloque ? ' — plus de retour à l\'accueil' : !x.clique ? ' — carte absente' : x.erreurs ? ' — ' + x.erreurs + ' erreur(s) JS' : x.deborde ? ' — déborde' : ''));
      ok(C.revue && C.revue.boutons >= 3 && C.revue.dict > 0 && C.revue.lig && C.revue.pro, `${tag} : Réviser (${C.revue ? C.revue.boutons : 0} boutons), dictionnaire (${C.revue ? C.revue.dict : 0} unités), Ligue et Profil s'affichent`);
    }
    if (B) {
      ok(B.choix, `${tag} : sans langue, l'écran « Choisis une langue » s'affiche`);
      ok(B.tr && B.pr && B.rv, `${tag} : sans langue, les onglets réagissent (Traduire ${B.tr ? 'ouvert' : 'MUET'}, Profil ${B.pr ? 'ouvert' : 'MUET'}, Réviser ${B.rv ? 'explique' : 'MUET'})`);
      ok(B.erreurs.length === 0, `${tag} : sans langue, 0 erreur JavaScript` + (B.erreurs.length ? ' — ' + B.erreurs.slice(0, 2).join(' | ') : ''));
    }
  }
}
/* D. CHAQUE LANGUE DE LINGUA (24.10) : un cours par langue, une vraie leçon ouverte — 0 erreur JavaScript, la page ne déborde pas (alphabets, arabe de droite à gauche,
   chinois/japonais/coréen), la leçon affiche du texte. Un contexte neuf par langue ; un seul appareil (téléphone 390 px). Filtrer avec PLAT=Langues. */
if (!filtre || filtre.test('Langues')) for (const moteur of Object.keys(lanceurs)) {
  console.log(`\n== Chaque langue de Lingua — ${moteur} ==`);
  let codes = [];
  try { const c0 = await ouvrir(moteur, { vp: { width: 390, height: 844 }, tactile: moteur !== 'firefox' }, true); codes = await c0.p.evaluate(() => Object.keys(COURSES || {})).catch(() => []); await c0.ctx.close(); } catch (e) { ok(false, `langues/${moteur} : la liste des cours ne se lit pas — ${String(e.message).split('\n')[0].slice(0, 90)}`); continue; }
  ok(codes.length >= 14, `langues/${moteur} : ${codes.length} cours dans Lingua (≥ 14 attendus)`);
  for (const code of codes) {
    const tag = `langue ${code}/${moteur}`;
    try {
      const br = lanceurs[moteur];
      const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', serviceWorkers: 'block', hasTouch: moteur !== 'firefox', isMobile: false });
      await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
      await ctx.addInitScript((c) => { if (sessionStorage.getItem('seed')) return; sessionStorage.setItem('seed', '1');
        localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'k', name: 'Élève Test', avatar: '🦊', code: '', created: 1 }])); localStorage.setItem('lingua_g_current', JSON.stringify('k'));
        localStorage.setItem('lingua_a_k_course', JSON.stringify(c)); localStorage.setItem('lingua_a_k_placeAsked', 'true'); localStorage.setItem('lingua_a_k_sound', 'false'); localStorage.setItem('lingua_a_k_voice', JSON.stringify('device')); }, code);
      const pg = await ctx.newPage(); const err = [];
      pg.on('pageerror', (e) => err.push(String(e.message).slice(0, 100)));
      await pg.goto(base + '/', { waitUntil: 'domcontentloaded' });
      for (let k = 0; k < 60; k++) { if (await pg.evaluate(() => document.querySelectorAll('.tabbar .tab').length >= 6).catch(() => false)) break; await pg.waitForTimeout(250); }
      await pg.waitForTimeout(700);
      const r = await pg.evaluate(async () => {
        const deb = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const o = { deb0: deb(), vie: !!document.querySelector('.vie-link') };
        const l = document.querySelector('.vie-link'); if (l) { l.click(); await new Promise((r2) => setTimeout(r2, 500)); const le = document.querySelector('.vie-lecon'); if (le) { le.click(); await new Promise((r2) => setTimeout(r2, 1000)); } }
        const corps = document.querySelector('.lesson-body');
        o.lecon = !!corps; o.texte = corps ? (corps.innerText || '').trim().length : 0; o.deb1 = deb();
        return o; }).catch((e) => ({ err: String(e.message).slice(0, 80) }));
      await ctx.close();
      ok(!r.err && err.length === 0 && r.deb0 <= 2 && r.deb1 <= 2 && (!r.vie || (r.lecon && r.texte > 5)), `${tag} : 0 erreur JS, pas de débordement, ${r.vie ? 'une leçon s\'ouvre avec du texte (' + r.texte + ' car.)' : 'accueil affiché (pas de « vraie vie » pour ce cours)'}`
        + (r.err ? ' — ' + r.err : '') + (err.length ? ' — ' + err.slice(0, 2).join(' | ') : '') + (r.deb0 > 2 || r.deb1 > 2 ? ' — déborde ' + r.deb0 + '/' + r.deb1 + ' px' : ''));
    } catch (e) { ok(false, `${tag} : ne s'ouvre pas — ${String(e.message).split('\n')[0].slice(0, 90)}`); }
  }
}
for (const b of Object.values(lanceurs)) await b.close();
srv.close();
console.log(`\n${n - ko}/${n} contrôles OK` + (ko ? ` — ${ko} rouge(s) :\n  - ` + rouges.join('\n  - ') : ''));
if (process.env.GITHUB_ACTIONS) {
  for (const r of rouges.slice(0, 40)) console.log('::error title=lingua-plateformes::' + r.replace(/[\r\n]+/g, ' ').slice(0, 400));
  console.log('::notice title=lingua-plateformes::' + (n - ko) + '/' + n + ' contrôles OK ; moteurs : ' + Object.keys(lanceurs).join(', '));
}
console.log('Moteurs lancés : ' + Object.keys(lanceurs).join(', ') + (Object.keys(lanceurs).length < 3 ? '  (webkit/firefox : robot du dépôt public)' : ''));
process.exit(ko ? 1 : 0);
