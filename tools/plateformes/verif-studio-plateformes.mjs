#!/usr/bin/env node
/* Créa Studio — TOUTES LES PLATEFORMES (Kevin 22.10.2026 : « teste toujours tout sur l'ordinateur, iPhone, Android, toutes les plateformes…
   aucun bug visuel, fonctionnel, de fluidité »). Le VRAI code du Studio (tools/crea-studio/, servi tel quel) dans de vrais navigateurs, sur une
   matrice d'appareils : iPhone (portrait + paysage, celui de Kevin), Android, tablettes, portable bas (le Lenovo), grand écran. Compte LOCAL fictif
   (porte du Studio : prénom + nom + code), aucun réseau (le domaine et le service IA sont coupés : on mesure l'ÉCRAN, pas l'IA).
   Par appareil et par moteur :
     - premier dessin (barre du bas prête) < 6 s ; 0 erreur JavaScript ; la page ne déborde pas en largeur ;
     - la barre du bas est ENTIÈRE dans l'écran, rien ne recouvre ses boutons, chaque bouton fait ≥ 40 px au toucher et répond à un VRAI toucher ;
     - chacun des 9 studios s'ouvre (section active), sans erreur ni débordement ;
     - Studio Cartoon : la galerie des styles IA (≥ 10 puces) est là, dans l'écran, et chaque puce est ≥ 44 px au toucher ;
     - la pastille de version est visible (vX.Y.Z) et dans l'écran ;
     - zones de toucher < 44 px sur les écrans Photo / Cartoon / Faire vivre (téléphones) : aucune, hors pastille de version.
   Moteurs : chromium (toujours), webkit = Safari/iPhone, firefox — si installés (dépôt PUBLIC, gratuit : workflow studio-plateformes.yml).
   Un moteur absent est DIT. node tools/plateformes/verif-studio-plateformes.mjs     ENGINES=chromium,webkit,firefox     PLAT=iPhone pour filtrer
   Sabotage : STUDIO_DIR=<dossier d'une ancienne version du Studio (avant v9.19)> → rouge (pas de galerie de styles). */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STUDIO = process.env.STUDIO_DIR ? path.resolve(process.env.STUDIO_DIR) : path.join(ROOT, 'tools', 'crea-studio');
let n = 0, ko = 0; const rouges = [];
const ok = (c, l) => { n++; if (!c) { ko++; rouges.push(l); } console.log((c ? '  ✅ ' : '  ❌ ') + l); };

let pw; for (const m of ['playwright', 'playwright-core']) { try { pw = await import(m); break; } catch (e) { /* suivant */ } }
if (!pw) { console.log('  ⏭  playwright absent : rien lancé'); process.exit(process.env.EXIGE_PLAYWRIGHT ? 1 : 0); }
const P = pw.default || pw;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); let f = decodeURIComponent(u.pathname);
  if (f.startsWith('/__')) { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":false,"reason":"hors_ligne_test"}'); return; }
  if (f === '/') f = '/index.html';
  const fp = path.join(STUDIO, f);
  if (!fp.startsWith(STUDIO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory() || /\/sw\.js$/.test(f)) { r.writeHead(404); r.end(); return; }
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
  { nom: 'Portable bas 1272x635 (Lenovo)', vp: { width: 1272, height: 635 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Portable 1366x768', vp: { width: 1366, height: 768 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  /* un navigateur de BUREAU étroit n'est pas un téléphone : il ne dézoome pas, il défile (Lenovo 23.10) */
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
if (!Object.keys(lanceurs).length) { console.log('  ❌ aucun moteur disponible : rien à mesurer'); process.exit(1); }

/* les 9 studios de la barre du bas, dans l'ordre de l'écran (data-go) */
const STUDIOS = ['photo', 'video', 'anim', 'aivid', 'cam', 'fam', 'mine', 'magic', 'mini'];
const NOMS = { photo: 'Studio Photo', video: 'Vidéo', anim: 'Studio Cartoon', aivid: 'Faire vivre / danse', cam: 'Caméra', fam: 'Famille', mine: 'Mes créations', magic: 'Magie', mini: 'Mini' };

async function ouvrir(moteur, ap) {
  const br = lanceurs[moteur];
  const opts = ap.dev ? { ...D[ap.dev], locale: 'fr-FR' } : ap.tactile ? { viewport: ap.vp, locale: 'fr-FR', hasTouch: true, isMobile: moteur !== 'firefox', deviceScaleFactor: 3 } : { viewport: ap.vp, locale: 'fr-FR', hasTouch: false };
  if (!ap.dev && moteur === 'chromium') opts.deviceScaleFactor = 1;
  const ctx = await br.newContext({ ...opts, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', (e) => erreurs.push('js: ' + String(e.message).slice(0, 120)));
  /* « Button failed to load, iconName = invalid-placard » = message INTERNE de WebKit sous Linux (thème d'icônes des contrôles média), pas une erreur de l'app (mesuré run 40217482338) */
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon|manifest|ERR_FAILED|status of 40[134]|403|NetworkError|Load failed|hors_ligne_test|abort|Button failed to load|invalid-placard/i.test(m.text())) erreurs.push('console: ' + m.text().slice(0, 120)); });
  const t0 = Date.now();
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  let pret = false;
  for (let k = 0; k < 80 && !pret; k++) { pret = await p.evaluate(() => document.querySelectorAll('#bnav button[data-go]').length >= 9).catch(() => false); if (!pret) await p.waitForTimeout(250); }
  if (!pret) throw new Error('la barre du bas ne s\'est pas dessinée en 20 s');
  const dessin = Date.now() - t0;
  /* la porte (prénom + nom + code) : un compte LOCAL fictif, comme un premier passage */
  const porte = await p.evaluate(() => { const g = document.getElementById('gate'); return !!g && !g.classList.contains('hidden'); }).catch(() => false);
  if (porte) {
    await p.fill('#gateName', 'Test Plateformes'); await p.fill('#gateCode', '123456');
    await p.click('#gateGo');
    /* attendre que la porte soit VRAIMENT refermée (run public 40217482338, 412 px : le robot touchait la barre sous la porte encore ouverte → tout « recouvert ») */
    let fermee = false;
    for (let k = 0; k < 40 && !fermee; k++) { fermee = await p.evaluate(() => { const g = document.getElementById('gate'); return !g || g.classList.contains('hidden') || getComputedStyle(g).display === 'none'; }).catch(() => false); if (!fermee) await p.waitForTimeout(150); }
    if (!fermee) throw new Error('la porte du Studio ne s\'est pas refermée après « Entrer » (prénom + nom + code)');
  }
  await p.waitForTimeout(500);
  return { ctx, p, erreurs, touch: !!opts.hasTouch, dessin, porte };
}

/* appui comme une personne : au doigt (tap) sur écran tactile, clic à la souris sinon — sur le centre RÉEL du bouton */
async function appuyer(p, touch, go) {
  const sel = '#bnav button[data-go="' + go + '"]';
  try { if (touch) await p.tap(sel, { timeout: 4000 }); else await p.click(sel, { timeout: 4000 }); return true; } catch (e) { return false; }
}
const largeur = (p) => p.evaluate(() => document.documentElement.scrollWidth - Math.round(window.visualViewport ? visualViewport.width : innerWidth)).catch(() => 0);
const petitesCibles = (p) => p.evaluate(() => { const o = []; document.querySelectorAll('a[href],button,select,textarea,input:not([type=checkbox]):not([type=file]):not([type=range]),[role=button],.chip').forEach((e) => {
  const q = e.getBoundingClientRect(), st = getComputedStyle(e);
  if (!q.width || !q.height || st.visibility === 'hidden' || st.display === 'none' || st.pointerEvents === 'none' || e.id === 'vbadge' || e.closest('#vbadge')) return;
  if (q.bottom < 0 || q.top > innerHeight) return;   /* hors écran = pas touchable maintenant */
  if (Math.min(q.width, q.height) < 43.5) o.push(e.tagName + '.' + (typeof e.className === 'string' ? e.className.split(' ')[0] : '') + (e.id ? '#' + e.id : '') + ' ' + Math.round(q.width) + 'x' + Math.round(q.height)); }); return o; }).catch(() => []);

async function scenario(moteur, ap) {
  const { ctx, p, erreurs, touch, dessin, porte } = await ouvrir(moteur, ap);
  const out = { erreurs, dessin, porte, touch };
  out.geo = await p.evaluate(() => {
    const W = Math.round(window.visualViewport ? visualViewport.width : innerWidth), b = document.getElementById('bnav'), r = b.getBoundingClientRect();
    const btns = [...b.querySelectorAll('button[data-go]')].map((t) => { const q = t.getBoundingClientRect(); return { x: q.left, r: q.right, w: q.width, h: q.height, go: t.dataset.go }; });
    const vb = document.getElementById('vbadge'); const vq = vb ? vb.getBoundingClientRect() : null;
    return { W, H: innerHeight, deborde: document.documentElement.scrollWidth - W, barreDans: r.left >= -1 && r.right <= W + 1 && r.bottom <= innerHeight + 1 && r.top >= 0, n: btns.length,
      sortis: btns.filter((t) => t.x < -1 || t.r > W + 1).map((t) => t.go), minCote: Math.min(...btns.map((t) => Math.min(t.w, t.h))),
      version: vb ? (vb.textContent || '').trim() : '', versionDans: !!vq && vq.width > 0 && vq.left >= 0 && vq.right <= W + 1 && vq.bottom <= innerHeight + 1 && getComputedStyle(vb).visibility !== 'hidden' };
  });
  out.recouverts = await p.evaluate(() => [...document.querySelectorAll('#bnav button[data-go]')].filter((t) => { const q = t.getBoundingClientRect(); if (!q.width || !q.height) return false; const e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(e && (e === t || t.contains(e))); }).map((t) => t.dataset.go));
  out.studios = []; out.petites = [];
  for (const go of STUDIOS) {
    const e0 = erreurs.length;
    const a = await appuyer(p, touch, go); await p.waitForTimeout(500);
    const actif = await p.evaluate((g) => { const s = document.getElementById('s-' + g); return !!s && s.classList.contains('active') && getComputedStyle(s).display !== 'none'; }, go).catch(() => false);
    const deb = await largeur(p);
    const st = { go, a, actif, erreurs: erreurs.length - e0, deborde: deb > 2 };
    if (go === 'anim') {
      st.galerie = await p.evaluate(() => { const W = Math.round(window.visualViewport ? visualViewport.width : innerWidth); const chips = [...document.querySelectorAll('#animStyles .chip')].map((c) => c.getBoundingClientRect());
        return { n: chips.length, dehors: chips.filter((q) => q.left < -1 || q.right > W + 1).length, minCote: chips.length ? Math.min(...chips.map((q) => Math.min(q.width, q.height))) : 0, visibles: chips.filter((q) => q.width > 0 && q.height > 0).length }; }).catch(() => ({ n: 0, dehors: 0, minCote: 0, visibles: 0 }));
    }
    if (['photo', 'anim', 'aivid'].includes(go) && out.geo.W >= 340 && out.geo.W <= 520) (await petitesCibles(p)).forEach((x) => { if (!out.petites.includes(NOMS[go] + ':' + x)) out.petites.push(NOMS[go] + ':' + x); });
    out.studios.push(st);
  }
  await ctx.close();
  return out;
}

for (const ap of MATRICE) {
  if (filtre && !filtre.test(ap.nom)) continue;
  if (ap.dev && !D[ap.dev]) { console.log(`\n== ${ap.nom} : profil « ${ap.dev} » inconnu de cette version de Playwright`); continue; }
  for (const moteur of ap.moteurs) {
    if (!lanceurs[moteur]) continue;
    console.log(`\n== ${ap.nom} — ${moteur} ==`);
    const tag = `${ap.nom}/${moteur}`; const t0 = Date.now(); let A;
    const limite = (pr) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('plus de 100 s : moteur figé')), 100000))]);
    try { A = await limite(scenario(moteur, ap)); } catch (e) { ok(false, `${tag} : le Studio ne s'ouvre pas — ${String(e.message).split('\n')[0].slice(0, 100)}`); continue; }
    if (process.env.GITHUB_ACTIONS) console.log('::notice title=plateformes-etape::' + tag + ' mesuré en ' + Math.round((Date.now() - t0) / 1000) + ' s');
    const g = A.geo; const touch = A.touch;
    ok(A.dessin < 6000, `${tag} : premier dessin (barre du bas prête) en ${A.dessin} ms (< 6 s)`);
    ok(A.porte, `${tag} : la porte (prénom + nom + code) s'affiche d'abord — aucune consultation sans compte`);
    ok(A.erreurs.length === 0, `${tag} : 0 erreur JavaScript` + (A.erreurs.length ? ' — ' + A.erreurs.slice(0, 2).join(' | ') : ''));
    ok(g.deborde <= 2, `${tag} : la page ne déborde pas en largeur (${g.deborde} px)`);
    ok(g.barreDans && g.sortis.length === 0 && g.n >= 9, `${tag} : barre du bas entière dans l'écran (${g.n} studios${g.sortis.length ? ', dehors : ' + g.sortis.join(',') : ''})`);
    ok(A.recouverts.length === 0, `${tag} : rien ne recouvre un bouton de la barre` + (A.recouverts.length ? ' — recouverts : ' + A.recouverts.join(',') : ''));
    if (touch) ok(g.minCote >= 40, `${tag} : boutons de la barre ≥ 40 px au toucher (${Math.round(g.minCote)})`);
    const muets = A.studios.filter((s) => !s.a || !s.actif).map((s) => NOMS[s.go]);
    ok(muets.length === 0, `${tag} : les 9 studios s'ouvrent au ${touch ? 'toucher' : 'clic'}` + (muets.length ? ' — MUETS : ' + muets.join(', ') : ''));
    const fautifs = A.studios.filter((s) => s.erreurs || s.deborde).map((s) => NOMS[s.go] + (s.erreurs ? ' (' + s.erreurs + ' erreur JS)' : '') + (s.deborde ? ' (déborde)' : ''));
    ok(fautifs.length === 0, `${tag} : aucun studio ne jette d'erreur ni ne déborde` + (fautifs.length ? ' — ' + fautifs.join(', ') : ''));
    const gal = (A.studios.find((s) => s.go === 'anim') || {}).galerie || { n: 0, dehors: 0, minCote: 0, visibles: 0 };
    ok(gal.n >= 10 && gal.visibles >= 10 && gal.dehors === 0, `${tag} : Studio Cartoon — galerie de ${gal.n} styles IA, ${gal.visibles} visibles, ${gal.dehors} hors écran`);
    if (touch) ok(gal.minCote >= 43.5, `${tag} : chaque style de la galerie ≥ 44 px au toucher (${Math.round(gal.minCote)})`);
    ok(/^v\d+\.\d+/.test(g.version) && g.versionDans, `${tag} : pastille de version visible et dans l'écran (${g.version || 'absente'})`);
    if (g.W >= 340 && g.W <= 520) ok(A.petites.length === 0, `${tag} : aucune zone de toucher < 44 px sur Photo / Cartoon / Faire vivre (hors pastille)` + (A.petites.length ? ' — ' + A.petites.slice(0, 6).join(' | ') : ''));
  }
}
for (const b of Object.values(lanceurs)) await b.close();
srv.close();
console.log(`\n${n - ko}/${n} contrôles OK` + (ko ? ` — ${ko} rouge(s) :\n  - ` + rouges.join('\n  - ') : ''));
if (process.env.GITHUB_ACTIONS) {
  for (const r of rouges.slice(0, 40)) console.log('::error title=studio-plateformes::' + r.replace(/[\r\n]+/g, ' ').slice(0, 400));
  console.log('::notice title=studio-plateformes::' + (n - ko) + '/' + n + ' contrôles OK ; moteurs : ' + Object.keys(lanceurs).join(', '));
}
console.log('Moteurs lancés : ' + Object.keys(lanceurs).join(', ') + (Object.keys(lanceurs).length < 3 ? '  (webkit/firefox : robot du dépôt public)' : ''));
process.exit(ko ? 1 : 0);
