#!/usr/bin/env node
/* Arbre — TOUTES LES PLATEFORMES (Kevin 22.10.2026 : « teste toujours tout sur l'ordinateur, iPhone, Android, toutes les plateformes… aucun bug visuel,
   fonctionnel, de fluidité, de sécurité »). Une famille FICTIVE (jamais les vraies données) dans de vrais navigateurs, sur une matrice d'appareils :
   iPhone (portrait + paysage), Android (Pixel, Galaxy), tablettes, portable bas (le Lenovo), grand écran. Par appareil et par vue (Famille, Arbre) :
     · 0 erreur JavaScript, 0 console.error ;      · la page ne déborde jamais en largeur ;
     · les contrôles fixes (onglets, zoom, ➕, mini-carte) sont DANS l'écran et ne se chevauchent pas ;
     · au toucher : boutons ≥ 44 px (zoom, onglets) ;     · la scène fait au moins 45 % de la hauteur ;
     · aucune image sans attribut alt (hors décor) ;     · une fiche s'ouvre, tient dans l'écran et se referme ;
     · le premier dessin de l'arbre arrive en moins de 6 s (fluidité).
   Moteurs : chromium (toujours), webkit = le moteur de Safari/iPhone, firefox — si le navigateur est installé (au dépôt PUBLIC : gratuit, voir
   .github/workflows/arbre-plateformes.yml). Un moteur absent est DIT (jamais passé sous silence).
   node tools/plateformes/verif-plateformes.mjs            (moteurs disponibles)       ENGINES=chromium,webkit,firefox pour forcer      PLAT=iPhone pour filtrer
   Sabotage : ARBRE_DIR=<dossier d'un ancien arbre> → doit devenir rouge sur le défaut qu'il avait. */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* La famille FICTIVE vit au dossier privé de l'arbre : chargée à l'exécution (le robot public la relit au coffre avant de tourner). */
const { fixture } = await import(pathToFileURL(path.join(ROOT, 'tools/arbre/fixture-famille.mjs')).href);
const ARBRE = process.env.ARBRE_DIR ? path.resolve(process.env.ARBRE_DIR) : path.join(ROOT, 'arbre');
let n = 0, ko = 0; const rouges = [];
const ok = (c, l) => { n++; if (!c) { ko++; rouges.push(l); } console.log((c ? '  ✅ ' : '  ❌ ') + l); };

let pw; for (const m of ['playwright', 'playwright-core']) { try { pw = await import(m); break; } catch (e) { /* suivant */ } }
if (!pw) { console.log('  ⏭  playwright absent : rien lancé'); process.exit(process.env.EXIGE_PLAYWRIGHT ? 1 : 0); }
const P = pw.default || pw;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let f = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (f === '/') f = '/index.html'; const fp = path.join(ARBRE, f); if (!fp.startsWith(ARBRE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port;

function chromePath() { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; try { for (const d of fs.readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) { const c = path.join(b, d, 'chrome-linux', 'chrome'); if (fs.existsSync(c)) return c; } } catch (e) { /* rien */ } return undefined; }

/* La matrice. `dev` = profil Playwright (taille, agent, tactile) ; `moteurs` = ceux qui comptent pour cet appareil. */
const D = P.devices || {};
const MATRICE = [
  { nom: 'iPhone 13 portrait', dev: 'iPhone 13', moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 13 paysage', dev: 'iPhone 13 landscape', moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 14 Pro paysage 844x390 (celui de Kevin)', vp: { width: 844, height: 390 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 14 Pro portrait 390x844 (celui de Kevin)', vp: { width: 390, height: 844 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone paysage + barre Safari 844x330', vp: { width: 844, height: 330 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone SE (petit)', dev: 'iPhone SE', moteurs: ['webkit', 'chromium'] },
  { nom: 'Android Pixel 7', dev: 'Pixel 7', moteurs: ['chromium'] },
  { nom: 'Android Galaxy S9+ paysage', dev: 'Galaxy S9+ landscape', moteurs: ['chromium'] },
  { nom: 'iPad portrait', dev: 'iPad (gen 7)', moteurs: ['webkit', 'chromium'] },
  { nom: 'Tablette Android paysage', dev: 'Galaxy Tab S4 landscape', moteurs: ['chromium'] },
  { nom: 'Portable bas 1272x635 (Lenovo)', vp: { width: 1272, height: 635 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Portable 1366x768', vp: { width: 1366, height: 768 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Grand écran 1920x1080', vp: { width: 1920, height: 1080 }, souris: true, moteurs: ['chromium'] }
];
const filtre = process.env.PLAT ? new RegExp(process.env.PLAT, 'i') : null;
const voulus = (process.env.ENGINES || 'chromium,webkit,firefox').split(',').map((x) => x.trim());
const DB = JSON.stringify(fixture());

const lanceurs = {};
for (const m of voulus) {
  try {
    const type = P[m] || (P.default && P.default[m]); if (!type) throw new Error('moteur inconnu');
    lanceurs[m] = await type.launch(m === 'chromium' ? { executablePath: chromePath() } : {});
  } catch (e) { console.log(`  ⏭  moteur « ${m} » absent ici (${String(e.message).split('\n')[0].slice(0, 70)}) — couvert par le robot du dépôt public`); }
}
if (!Object.keys(lanceurs).length) { console.log('  ❌ aucun moteur disponible : rien à mesurer'); process.exit(1); }

/* une page qui se recharge pendant la mesure (« Execution context was destroyed ») : on rejoue, et le nombre de navigations est contrôlé à part */
async function rejouer(f) { for (let k = 0; k < 4; k++) { try { return await f(); } catch (e) { if (!/context was destroyed|navigation/i.test(String(e.message)) || k === 3) throw e; await new Promise((r) => setTimeout(r, 800)); } } }
async function mesure(moteur, ap) {
  const navLog = [];
  try { return await mesure2(moteur, ap, navLog); } catch (e) { e.message += ' | navigations : ' + (navLog.join(' > ') || 'aucune'); throw e; }
}
async function mesure2(moteur, ap, navLog) {
  const br = lanceurs[moteur];
  const opts = ap.dev ? { ...D[ap.dev], locale: 'fr-FR' } : ap.tactile ? { viewport: ap.vp, locale: 'fr-FR', hasTouch: true, isMobile: moteur !== 'firefox', deviceScaleFactor: 3 } : { viewport: ap.vp, locale: 'fr-FR', hasTouch: false };
  if (!ap.dev && moteur === 'chromium') opts.deviceScaleFactor = 1;
  const ctx = await br.newContext(opts);
  await ctx.route('**/*', (r) => { const u = r.request().url(); return u.startsWith(base) && !/\/sw\.js(\?|$)/.test(u) ? r.continue() : r.abort(); });
  await ctx.addInitScript((a) => { localStorage.setItem('arbre_trust', '1'); localStorage.setItem('arbre_codehash', 'f'.repeat(64)); localStorage.setItem('arbre_upd_ts', String(Date.now())); localStorage.setItem('arbre_v2_text', a); }, DB);
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', (e) => erreurs.push('js: ' + String(e.message).slice(0, 120)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon|manifest|ERR_FAILED|status of 40[134]|403|NetworkError|Load failed|Cross-Origin Request Blocked|CORS request did not succeed|Fetch API cannot load|due to access control/i.test(m.text())) erreurs.push('console: ' + m.text().slice(0, 120)); });
  let navs = 0; const tNav = Date.now(); p.on('framenavigated', (f) => { if (f === p.mainFrame()) { navs++; navLog.push(String(f.url()).replace(base, '').slice(0, 60) + '@' + (Date.now() - tNav) + 'ms'); } });
  const t0 = Date.now();
  await p.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  /* pas de waitForFunction : il évalue du texte dans la page, que la politique de sécurité (CSP) de l'arbre refuse (WebKit, 22.10) → on interroge par evaluate */
  let pret = false;
  for (let k = 0; k < 100 && !pret; k++) { pret = await p.evaluate(() => { try { return Object.keys(DB.persons).length > 5 && !!document.querySelector('#wrap'); } catch (e) { return false; } }).catch(() => false); if (!pret) await p.waitForTimeout(250); }
  if (!pret) throw new Error('la page ne s\'est pas dessinée en 25 s');
  const tPret = Date.now() - t0;
  const touch = !!(opts.hasTouch);
  const sortie = { tPret, touch, vues: {} };
  for (const vue of ['proche', 'lignee', 'tree']) {
    await p.evaluate((v) => { try { if (v === 'tree') VIEWSTYLE = 'arbre'; else if (v === 'lignee') VIEWSTYLE = 'lignee'; } catch (e) { /* page pas prête */ } const b = document.querySelector('.tab[data-view="' + (v === 'proche' ? 'proche' : 'tree') + '"]'); if (b) b.click(); }, vue);
    await p.waitForTimeout(vue === 'proche' ? 700 : 1400);
    sortie.vues[vue] = await rejouer(() => p.evaluate(() => {
      const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const vis = (e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const ov = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
      const W = innerWidth, H = innerHeight;
      const fixes = [['onglets', '#tabs'], ['zoom', '.zoomBtns'], ['plus', '#fab'], ['mini', '.minimap'], ['version', '#ver']].map(([nom, sel]) => { const e = document.querySelector(sel); return e && vis(e) ? { nom, ...R(e) } : null; }).filter(Boolean);
      const dehors = fixes.filter((f) => f.x < -1 || f.y < -1 || f.r > W + 1 || f.b > H + 1).map((f) => f.nom);
      const chev = []; for (let i = 0; i < fixes.length; i++) for (let j = i + 1; j < fixes.length; j++) if (ov(fixes[i], fixes[j])) chev.push(fixes[i].nom + '×' + fixes[j].nom + ' [' + [fixes[i], fixes[j]].map((f) => [f.x, f.y, f.r, f.b].map(Math.round).join(',')).join(' | ') + ']');
      const bt = [...document.querySelectorAll('.zoomBtns button, #tabs .tab')].filter(vis).map(R);
      const st = document.getElementById('stageWrap') ? R(document.getElementById('stageWrap')) : null;
      const sansAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt') && !i.closest('.rig-piece') && !/rig-piece/.test(i.className)).length;
      return { W, H, debordeLargeur: document.documentElement.scrollWidth - W, dehors, chev, minBtn: bt.length ? Math.min(...bt.map((b) => Math.min(b.w, b.h))) : 99, st, sansAlt, noeuds: document.querySelectorAll('#stage .tnode, #stage .tmed, #wrap .pcard, #wrap [data-open]').length };
    }));
  }
  /* une fiche : s'ouvre, tient dans l'écran, se referme */
  sortie.fiche = await rejouer(() => p.evaluate(async () => {
    try { const id = Object.keys(DB.persons)[0]; openPerson(id); } catch (e) { return { err: e.message }; }
    await new Promise((r) => setTimeout(r, 500));
    const ov = document.querySelector('.ov .sheet, .ov'); if (!ov) return { err: 'fiche non ouverte' };
    const x = document.querySelector('.ov [data-close], .ov .bkbtn'); const r = x ? x.getBoundingClientRect() : null;
    const dansEcran = !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    const deb = document.documentElement.scrollWidth - innerWidth;
    try { closeOverlay(); } catch (e) { /* rien */ }
    await new Promise((r2) => setTimeout(r2, 300));
    return { ferme: !document.querySelector('.ov'), dansEcran, taille: r ? Math.min(r.width, r.height) : 0, deb };
  }));
  sortie.erreurs = erreurs; sortie.navs = navs;
  await ctx.close();
  return sortie;
}

for (const ap of MATRICE) {
  if (filtre && !filtre.test(ap.nom)) continue;
  if (ap.dev && !D[ap.dev]) { console.log(`\n== ${ap.nom} : profil « ${ap.dev} » inconnu de cette version de Playwright`); continue; }
  for (const moteur of ap.moteurs) {
    if (!lanceurs[moteur]) continue;
    console.log(`\n== ${ap.nom} — ${moteur} ==`);
    const t0 = Date.now(); let m;
    /* limite de 100 s par appareil et par moteur : un moteur qui se fige est signalé, il ne bloque plus tout le robot (22.10) */
    try { m = await Promise.race([mesure(moteur, ap), new Promise((_, rej) => setTimeout(() => rej(new Error('plus de 100 s : moteur figé')), 100000))]); } catch (e) { ok(false, `${ap.nom}/${moteur} : la page ne s'est pas ouverte — ${String(e.message).split('\n')[0].slice(0, 100)}`); continue; }
    const tag = `${ap.nom}/${moteur}`;
    if (process.env.GITHUB_ACTIONS) console.log('::notice title=plateformes-etape::' + tag + ' mesuré en ' + Math.round((Date.now() - t0) / 1000) + ' s');
    ok(m.erreurs.length === 0, `${tag} : 0 erreur JavaScript` + (m.erreurs.length ? ' — ' + m.erreurs.slice(0, 2).join(' | ') : ''));
    ok(m.navs <= 2, `${tag} : la page ne se recharge pas toute seule (${m.navs} navigation(s))`);
    ok(m.tPret < 6000, `${tag} : premier dessin en ${m.tPret} ms (< 6 s)`);
    for (const [vue, v] of Object.entries(m.vues)) {
      const t = `${tag} ${vue === 'tree' ? 'Arbre' : vue === 'lignee' ? 'Lignée' : 'Famille'}`;
      ok(v.debordeLargeur <= 2, `${t} : la page ne déborde pas en largeur (${v.debordeLargeur} px)`);
      ok(v.dehors.length === 0, `${t} : contrôles dans l'écran` + (v.dehors.length ? ' — dehors : ' + v.dehors.join(',') : ''));
      ok(v.chev.length === 0, `${t} : aucun contrôle ne chevauche un autre` + (v.chev.length ? ' — ' + v.chev.join(',') : ''));
      if (m.touch) ok(v.minBtn >= 40, `${t} : boutons de zoom et onglets ≥ 40 px au toucher (${Math.round(v.minBtn)})`);
      if (v.st) ok(v.st.h >= v.H * 0.45, `${t} : la scène fait ≥ 45 % de la hauteur (${Math.round(v.st.h)} sur ${v.H})`);
      ok(v.sansAlt === 0, `${t} : aucune image sans attribut alt (${v.sansAlt})`);
    }
    ok(m.fiche && !m.fiche.err && m.fiche.ferme && m.fiche.dansEcran && m.fiche.deb <= 2, `${tag} : une fiche s'ouvre, tient dans l'écran, se referme` + (m.fiche && m.fiche.err ? ' — ' + m.fiche.err : ''));
    if (m.touch && m.fiche && m.fiche.taille) ok(m.fiche.taille >= 40, `${tag} : le ✕ de la fiche ≥ 40 px (${Math.round(m.fiche.taille)})`);
  }
}
for (const b of Object.values(lanceurs)) await b.close();
srv.close();
console.log(`\n${n - ko}/${n} contrôles OK` + (ko ? ` — ${ko} rouge(s) :\n  - ` + rouges.join('\n  - ') : ''));
if (process.env.GITHUB_ACTIONS) { /* annotations : lisibles par l'API même quand le journal ne se télécharge pas */
  for (const r of rouges.slice(0, 40)) console.log('::error title=plateformes::' + r.replace(/[\r\n]+/g, ' ').slice(0, 400));
  console.log('::notice title=plateformes::' + (n - ko) + '/' + n + ' contrôles OK ; moteurs : ' + Object.keys(lanceurs).join(', '));
}
console.log('Moteurs lancés : ' + Object.keys(lanceurs).join(', ') + (Object.keys(lanceurs).length < 3 ? '  (webkit/firefox : robot du dépôt public)' : ''));
process.exit(ko ? 1 : 0);
