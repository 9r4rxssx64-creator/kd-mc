/* GARDE — BEE ET BOURRICOT EN 3D D'OFFICE, PARTOUT, SANS BOUTON (Kevin 2026-10-03 : « tout jours en 3D partout… 3D d'office
 * partout, pas de bouton »).
 *
 * Ce test PROUVE, dans un vrai Chromium avec WebGL (pas « à la lecture du code ») :
 *  A. le moteur servi est FRAIS : l'empreinte écrite en tête de javis/perso3d.js = celle des sources (description des personnages
 *     + moteur) ; les 3 copies (javis, arbre, Lingua) sont identiques ; le script n'ouvre aucune porte (ni eval, ni réseau) ; la
 *     marionnette, le widget Bee et Lingua sont branchés dessus.
 *  B. SANS BOUTON : une page avec des personnages (rig de Bee, de Bourricot, images fixes de Lingua) passe TOUTE SEULE en 3D —
 *     vrai rendu (le jaune d'abeille est dans le canvas), yeux/ailes/lumière du dessin retirés, médaillon rond respecté.
 *  C. ils VIVENT : image après image le canvas change, pour chaque personnage.
 *  D. la bouche suit la voix (lèvres synchronisées) et le regard suit le doigt : mesuré sur les pixels (zone qui change = la bouche).
 *  E. toutes les humeurs que la marionnette sait nommer existent en 3D (aucune ne retombe en silence sur « repos »), sans valeur
 *     absurde, et chacune CHANGE la pose.
 *  F. repli, jamais d'écran vide : interrupteur coupé, moteur introuvable, économiseur de données / vieux téléphone, contexte WebGL
 *     perdu en route, moteur qui plante, exercice de prononciation (le dessin enseigne la bouche) → le 2D d'avant, 0 erreur.
 *  G. sobriété : hors écran = rien ne se dessine ; un personnage = peu d'appels de dessin ; le moteur reste petit.
 *  H. SABOTAGE : sans le branchement de la marionnette, B devient rouge ; un moteur périmé est vu par A.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { empreinte } from '../tools/3d/empreinte.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- A. frais, identique partout, sans porte ouverte ---------- */
console.log('A. Le moteur servi est frais, identique partout, et ne fait rien d\'autre');
const BUNDLE = lire('javis/perso3d.js');
const sha = (BUNDLE.match(/empreinte:([0-9a-f]{16})/) || [])[1];
chk(sha && sha === empreinte(lire), `l'empreinte du moteur (${sha}) = celle des sources (${empreinte(lire)}) — sinon : npm run build:3d (dans tools/3d)`);
for (const d of ['arbre', 'lingua']) chk(lire(d + '/perso3d.js') === BUNDLE, `${d}/perso3d.js = javis/perso3d.js, à l'octet`);
chk(!/\beval\(|new Function|fetch\(|XMLHttpRequest|importScripts|WebAssembly|document\.write/.test(BUNDLE), 'le moteur n\'ouvre aucune porte : ni eval, ni réseau, ni WebAssembly (CSP stricte des apps)');
chk(BUNDLE.length < 700 * 1024, `le moteur reste petit : ${Math.round(BUNDLE.length / 1024)} Ko (plafond 700 Ko ; chargé une fois, au calme)`);
/* 4.10 : une constante de three.js (conversion sRGB) ressemblait à un mobile pour le contrôle du dépôt public, qui a BLOQUÉ toute la publication du
   domaine. Le moteur ne doit contenir AUCUN motif de numéro de téléphone (mêmes motifs que tools/depot-public/verifier.mjs). */
chk(!/(?:\+377\s?\d{2}(?:[\s.]?\d{2}){3}|\b0[67](?:[\s.]?\d{2}){4}\b|\+33\s?[67](?:[\s.]?\d{2}){4})/.test(BUNDLE), 'le moteur ne contient aucun motif de numéro de téléphone (sinon le contrôle du dépôt public bloque toute la publication)');
let verif = '';
try { verif = execFileSync('node', ['tools/javis/sync.mjs', '--verif'], { cwd: ROOT, encoding: 'utf8' }); } catch (e) { verif = 'ÉCHEC ' + e.stdout; }
chk(!/ÉCHEC|✗/.test(verif), 'npm run sync:javis -- --verif : marionnette et widget identiques partout');
const MRN = lire('tools/javis/marionnette.js');
chk((MRN.match(/monter3D\(etat\);/g) || []).length === 2, 'la marionnette monte la 3D sur les DEUX sortes de personnages (rig des apps, images fixes de Lingua)');
chk(/ouv: e\.jaw/.test(MRN) && /regard: \{ x: e\.expr \? e\.expr\.vx/.test(MRN), 'la bouche (voix) et le regard (doigt) sont transmis à la 3D');
chk(/prefere3D\(\)\) \{ v\.pause\(\)/.test(lire('tools/javis/javis-widget.js')), 'widget Bee : en 3D la vidéo n\'est même pas chargée (3 à 4 Mo/min économisés)');
chk(/prefere3D&&KdmcMarionnette\.prefere3D\(\)\)\{ dv\.pause\(\)/.test(lire('lingua/app.js')), 'Lingua : en 3D la vidéo du coach n\'est pas chargée non plus');
chk(/\.p3d-on \.rig-lid[\s\S]{0,120}\.javis-vid/.test(MRN), 'CSS : en 3D, paupières / ailes dessinées / lumière / vidéo sont retirées');

/* ---------- serveur local ---------- */
const REQ = [];
let MODIF = null;     // (url, texte) → texte : pour les sabotages
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  REQ.push(u);
  if (u === '/') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(PAGE); }
  if (u === '/pron') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(PAGE_PRON); }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('access-control-allow-origin', '*');
  r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream');
  if (f.endsWith('.js') && MODIF) return r.end(MODIF(u, fs.readFileSync(f, 'utf8')));
  r.end(fs.readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((o) => srv.on('listening', o));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const rig = (id, dir, cls = '') => `<div id="${id}" class="bee-rig ${cls}" style="position:relative;width:240px;height:240px;overflow:hidden">` +
  `<div class="rig-look" style="position:absolute;inset:0"><img class="rig-base" crossorigin="anonymous" src="/lingua/${dir}/rig/base.webp" style="position:absolute;inset:0;width:100%;height:100%">` +
  `<div class="rig-lid ll"></div><div class="rig-lid lr"></div><div class="disc-mouth" style="position:absolute;left:50%;top:60%;width:20px;height:12px;background:#f66"></div></div></div>`;
const fixe = (n) => `<img class="mascot" crossorigin="anonymous" src="/lingua/${n}.webp" style="width:200px;height:200px">`;
const PAGE = '<!doctype html><meta charset=utf-8><body style="margin:0;display:flex;flex-wrap:wrap;gap:4px">' +
  rig('v2', 'bee/v2') + rig('douce', 'bee') + rig('ane', 'donkey') + fixe('bee/v2/wave') + fixe('donkey/party') +
  '<script src="/lingua/marionnette.js"></script>';
const PAGE_PRON = '<!doctype html><meta charset=utf-8><body style="margin:0">' + rig('p', 'bee/v2', 'pron-bee') + '<script src="/lingua/marionnette.js"></script>';

const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
async function ouvre({ init, url = '/', route } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });
  if (init) await ctx.addInitScript(init);
  if (route) await route(ctx);
  const page = await ctx.newPage();
  const err = [];
  page.on('pageerror', (e) => err.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|ERR_FAILED/.test(m.text())) err.push(m.text()); });
  await page.goto(BASE + url);
  return { ctx, page, err };
}
const etat = (page) => page.evaluate(() => KdmcMarionnette.etat());
const toutes3D = (page, n) => page.waitForFunction((n) => { const e = KdmcMarionnette.etat(); return e.length === n && e.every((x) => x.p3d); }, n, { timeout: 30000 }).then(() => true, () => false);

/* ---------- B. sans bouton : tout passe en 3D tout seul ---------- */
console.log('B. SANS BOUTON : la 3D s\'allume toute seule, partout');
{
  const { ctx, page, err } = await ouvre();
  const bon = await toutes3D(page, 5);
  const e = await etat(page);
  chk(bon, `les 5 personnages sont en 3D sans qu'on touche à rien (${e.map((x) => x.nom + (x.p3d ? '·3D' : '·2D')).join(', ')})`);
  const m = await page.evaluate(() => ({ moteur: KdmcMarionnette.moteur3D(), veut: KdmcMarionnette.prefere3D(), v: KdmcPerso3D.version, noms: KdmcPerso3D.noms }));
  chk(m.moteur === 2 && m.veut && m.noms.join() === 'bee,bourricot', `moteur prêt (v${m.v}), prêt pour ${m.noms.join(' + ')}`);
  chk(!(await page.evaluate(() => [...document.querySelectorAll('button,[role=button],a')].some((b) => /3d/i.test(b.textContent + b.getAttribute('aria-label'))))), 'aucun bouton « 3D » dans la page : c\'est automatique');
  const dom = await page.evaluate(() => ['v2', 'douce', 'ane'].map((id) => { const r = document.getElementById(id); return { cls: r.classList.contains('p3d-on'), lid: getComputedStyle(r.querySelector('.rig-lid')).display, cv: !!r.querySelector('.mrn-canvas') }; }));
  chk(dom.every((d) => d.cls && d.lid === 'none' && d.cv), 'p3d-on posé, paupières du dessin retirées (la 3D a ses propres yeux), le même canvas reçoit la 3D');
  /* un VRAI rendu : le jaune d'abeille / le brun d'âne sont dans le canvas, pas seulement le fond crème */
  const px = await page.evaluate(() => ['v2', 'ane'].map((id) => { const c = document.querySelector('#' + id + ' .mrn-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let jaune = 0, brun = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 225 && d[i + 1] > 150 && d[i + 1] < 215 && d[i + 2] < 90) jaune++; if (d[i] > 150 && d[i] < 215 && d[i + 1] > 100 && d[i + 1] < 150 && d[i + 2] > 50 && d[i + 2] < 100) brun++; } return { jaune, brun, n: d.length / 4 }; }));
  chk(px[0].jaune > px[0].n * 0.03, `Bee est rendue en 3D (jaune d'abeille : ${(100 * px[0].jaune / px[0].n).toFixed(1)} % du carré)`);
  chk(px[1].brun > px[1].n * 0.03, `Bourricot est rendu en 3D (pelage : ${(100 * px[1].brun / px[1].n).toFixed(1)} % du carré)`);
  /* le médaillon rond de Lingua est respecté : les coins de l'image fixe v2 restent transparents */
  const coins = await page.evaluate(() => { const c = [...document.querySelectorAll('canvas.mrn-image')][0]; const x = c.getContext('2d'); const a = (px, py) => x.getImageData(px, py, 1, 1).data[3]; return { coin: a(2, 2), centre: a(c.width >> 1, c.height >> 1) }; });
  chk(coins.coin === 0 && coins.centre === 255, `l'image fixe ronde garde sa découpe en 3D (coin alpha ${coins.coin}, centre ${coins.centre})`);
  chk(err.length === 0, err.length ? 'ERREURS JS : ' + err[0] : 'aucune erreur JS');

  /* ---------- C. ils vivent ---------- */
  console.log('C. Ils VIVENT en 3D');
  const e0 = await etat(page);
  const snap = () => page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice(0, 400000)));
  const s1 = await snap(); await dors(700); const s2 = await snap();
  const e1 = await etat(page);
  const diffs = s1.map((a, i) => { let n = 0; for (let k = 0; k < a.length; k += 4) if (Math.abs(a[k] - s2[i][k]) + Math.abs(a[k + 1] - s2[i][k + 1]) + Math.abs(a[k + 2] - s2[i][k + 2]) > 40) n++; return n; });
  chk(diffs.every((n) => n > 40), `chaque personnage change à l'écran en 0,7 s (points qui bougent : ${diffs.join(' / ')})`);
  chk(e1.every((x, i) => x.images - e0[i].images >= 8), `et il est redessiné en continu (${e1.map((x, i) => x.images - e0[i].images).join(' / ')} images en 0,7 s)`);

  /* ---------- D. bouche et regard ---------- */
  console.log('D. La bouche suit la voix, le regard suit le doigt');
  await page.evaluate(() => { const r = document.getElementById('v2'); r.classList.add('talk'); r.querySelector('.disc-mouth').style.transform = 'translate(-50%,-50%) scaleY(1.7)'; });
  await dors(700);
  const ouvert = (await etat(page))[0].ctx3D;
  await page.evaluate(() => { document.getElementById('v2').querySelector('.disc-mouth').style.transform = 'translate(-50%,-50%) scaleY(0.3)'; });
  await dors(700);
  const ferme = (await etat(page))[0].ctx3D;
  chk(ouvert && ferme && ouvert.ouv > 0.6 && ferme.ouv < 0.2, `la marionnette transmet la voix à la 3D : bouche ${ouvert && ouvert.ouv.toFixed(2)} (voix forte) → ${ferme && ferme.ouv.toFixed(2)} (voix faible)`);
  await page.evaluate(() => { document.getElementById('v2').classList.remove('talk'); const l = document.querySelector('#ane .rig-look'); l.style.setProperty('--lx', '3.2%'); l.style.setProperty('--ly', '0%'); });
  await dors(900);
  const regard = (await etat(page))[2].ctx3D;
  chk(regard && regard.regard.x > 0.5, `le regard (--lx posé par l'app quand ton doigt bouge) arrive à la 3D : x = ${regard && regard.regard.x.toFixed(2)}`);
  /* pixels : la zone qui change entre bouche fermée et ouverte est PETITE et au bas du visage */
  const zone = await page.evaluate(() => {
    const rendre = (ouv, regard) => { const p = KdmcPerso3D.creer('bee'), c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); p.dessiner(x, 300, 'parle', 1.0, { niveau: 0.5, ouv, regard }, '#ffffff'); p.liberer(); return x.getImageData(0, 0, 300, 300).data; };
    const box = (a, b) => { let n = 0, x0 = 999, x1 = 0, y0 = 999, y1 = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) { const k = i / 4, X = k % 300, Y = (k / 300) | 0; n++; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); } return { n, x0, x1, y0, y1 }; };
    return { bouche: box(rendre(0, null), rendre(1, null)), regard: box(rendre(0.4, { x: -1, y: 0 }), rendre(0.4, { x: 1, y: 0 })) };
  });
  chk(zone.bouche.n > 60 && zone.bouche.x1 - zone.bouche.x0 < 90 && zone.bouche.y1 - zone.bouche.y0 < 70 && zone.bouche.y0 > 100, `bouche fermée → ouverte : ${zone.bouche.n} points changent, dans une zone de ${zone.bouche.x1 - zone.bouche.x0} × ${zone.bouche.y1 - zone.bouche.y0} px sous les yeux (c'est bien la bouche qui bouge)`);
  chk(zone.regard.n > 400, `regard à gauche → à droite : la tête tourne (${zone.regard.n} points changent)`);
  await ctx.close();
}

/* ---------- E. toutes les humeurs existent en 3D ---------- */
console.log('E. Toutes les humeurs que la marionnette nomme existent en 3D');
{
  const { ctx, page } = await ouvre();
  await page.waitForFunction(() => window.KdmcPerso3D, null, { timeout: 30000 }).catch(() => {});
  /* le vocabulaire : lu dans la source de la marionnette (humeur() et les poses fixes), pas écrit à la main ici */
  const nommees = new Set([...(MRN.match(/function humeur\(el\)[\s\S]*?\n  \}/) || [''])[0].matchAll(/return '([a-z]+)'/g)].map((m) => m[1]));
  for (const m of MRN.matchAll(/'(salut|fete|lecture|montre|secoue)'/g)) nommees.add(m[1]);
  const r = await page.evaluate((noms) => {
    const sav = KdmcPerso3D.humeurs, sortie = { manque: noms.filter((n) => !sav.includes(n)), absurde: [], plat: [], total: 0 };
    for (const nom of KdmcPerso3D.noms) for (const h of sav) {
      let bouge = 0;
      for (const p of KdmcPerso3D._pieces(nom)) {
        const g = KdmcPerso3D._pose(nom, p, h, 1.3, { niveau: 0.8, ouv: 0.9, regard: { x: 0.5, y: 0.2 } }), b = KdmcPerso3D._pose(nom, p, 'repos', 1.3, { niveau: 0.8, ouv: 0.9, regard: { x: 0.5, y: 0.2 } });
        sortie.total++;
        if (![...g.r, ...g.p, ...g.s].every(Number.isFinite) || g.s.some((v) => v < 0 || v > 3) || g.r.some((v) => Math.abs(v) > 200) || g.p.some((v) => Math.abs(v) > 0.2)) sortie.absurde.push(nom + '/' + h + '/' + p);
        bouge += g.r.reduce((s, v, j) => s + Math.abs(v - b.r[j]), 0) + g.p.reduce((s, v, j) => s + 100 * Math.abs(v - b.p[j]), 0) + g.s.reduce((s, v, j) => s + 20 * Math.abs(v - b.s[j]), 0);
      }
      if (h !== 'repos' && bouge < 5) sortie.plat.push(nom + '/' + h);
    }
    return sortie;
  }, [...nommees]);
  chk(nommees.size >= 12, `${nommees.size} humeurs nommées par la marionnette (${[...nommees].join(', ')})`);
  chk(r.manque.length === 0, r.manque.length ? 'humeurs SANS pose 3D (retombent en silence sur « repos ») : ' + r.manque.join(', ') : 'chacune a sa pose 3D');
  chk(r.absurde.length === 0, r.absurde.length ? 'valeurs absurdes : ' + r.absurde.slice(0, 4).join(', ') : `${r.total} poses calculées, aucune valeur absurde (NaN, taille négative, angle fou)`);
  chk(r.plat.length === 0, r.plat.length ? 'humeurs qui ne changent rien à la pose : ' + r.plat.join(', ') : 'chaque humeur CHANGE vraiment la pose');
  const p = await page.evaluate(() => ({
    triste: KdmcPerso3D._pose('bee', 'tete', 'triste', 1, {}).r[0], dortYeux: KdmcPerso3D._pose('bee', 'yeux', 'dort', 1, {}).s[1],
    reposYeux: KdmcPerso3D._pose('bee', 'yeux', 'repos', 1, {}).s[1], rit: KdmcPerso3D._pose('bourricot', 'bouche', 'poke', 1, {}).s[1],
    oui: KdmcPerso3D._pose('bee', 'tete', 'repos', 1, { regard: { x: 1, y: 0 } }).r[1] - KdmcPerso3D._pose('bee', 'tete', 'repos', 1, { regard: { x: -1, y: 0 } }).r[1],
    voixF: KdmcPerso3D._pose('bee', 'bouche', 'parle', 1, { ouv: 1 }).s[1], voixP: KdmcPerso3D._pose('bee', 'bouche', 'parle', 1, { ouv: 0 }).s[1],
  }));
  chk(p.triste > 10 && p.dortYeux < 0.1 && p.dortYeux < p.reposYeux, `triste : tête baissée (${p.triste.toFixed(0)}°) · il dort : yeux fermés (${p.dortYeux.toFixed(2)})`);
  chk(p.voixF - p.voixP > 0.7 && p.oui > 30, `parle : bouche ${p.voixP.toFixed(2)} → ${p.voixF.toFixed(2)} avec la voix · le regard tourne la tête de ${p.oui.toFixed(0)}°`);
  await ctx.close();
}

/* ---------- F. replis : jamais d'écran vide ---------- */
console.log('F. Repli : le 2D d\'avant revient, sans erreur');
async function reste2D(page, err, qui, attente = 3500) {
  await dors(attente);
  const e0 = await etat(page); await dors(500); const e1 = await etat(page);
  const dom = await page.evaluate(() => ({ p3d: document.querySelectorAll('.p3d-on').length, on: document.querySelectorAll('.mrn-on').length, cv: document.querySelectorAll('canvas').length }));
  chk(e1.length >= 3 && e1.every((x) => !x.p3d) && dom.p3d === 0 && dom.on >= 3, `${qui} : aucun personnage en 3D, la marionnette 2D continue (${dom.on} rigs animés)`);
  chk(e1.every((x, i) => x.images > e0[i].images), `${qui} : et elle continue de bouger`);
  chk(err.length === 0, `${qui} : 0 erreur JS${err.length ? ' — ' + err[0] : ''}`);
}
{ /* 1. interrupteur coupé */
  REQ.length = 0;
  const { ctx, page, err } = await ouvre({ init: () => { try { localStorage.setItem('kdmc_perso3d', '0'); } catch (_) {} } });
  await reste2D(page, err, 'interrupteur kdmc_perso3d=0');
  chk(!REQ.some((u) => /perso3d\.js/.test(u)), 'le moteur 3D n\'est même pas téléchargé (0 octet)');
  await ctx.close();
}
{ /* 2. moteur introuvable */
  const { ctx, page, err } = await ouvre({ route: (c) => c.route('**/perso3d.js*', (r) => r.fulfill({ status: 404, body: 'absent' })) });
  await reste2D(page, err, 'moteur introuvable (404)');
  chk((await page.evaluate(() => KdmcMarionnette.moteur3D())) === -1, 'la marionnette le sait (moteur -1) et ne le redemande pas en boucle');
  await ctx.close();
}
{ /* 3. économiseur de données / téléphone très modeste */
  for (const [nom, init] of [['économiseur de données', () => Object.defineProperty(navigator, 'connection', { value: { saveData: true } })], ['mémoire < 2 Go', () => Object.defineProperty(navigator, 'deviceMemory', { value: 1 })]]) {
    REQ.length = 0;
    const { ctx, page, err } = await ouvre({ init });
    await reste2D(page, err, nom, 2500);
    chk(!REQ.some((u) => /perso3d\.js/.test(u)), `${nom} : le moteur n'est pas téléchargé`);
    await ctx.close();
  }
}
{ /* 4. le contexte WebGL est perdu en route */
  const { ctx, page, err } = await ouvre();
  await toutes3D(page, 5);
  await page.evaluate(() => KdmcPerso3D._perdreContexte());
  await dors(1200);
  const e0 = await etat(page); await dors(500); const e1 = await etat(page);
  const dom = await page.evaluate(() => ({ p3d: document.querySelectorAll('.p3d-on').length, canvas: [...document.querySelectorAll('.mrn-canvas,canvas.mrn-image')].map((c) => c.width > 0 && c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data[3]) }));
  chk(e1.every((x) => !x.p3d) && dom.p3d === 0, 'contexte WebGL perdu en route → tous retombent en 2D dans la seconde');
  chk(e1.every((x, i) => x.images > e0[i].images) && dom.canvas.every((a) => a === 255), 'et le canvas continue d\'être dessiné (jamais vide : ' + dom.canvas.join(',') + ')');
  chk(err.length === 0, '0 erreur JS' + (err.length ? ' — ' + err[0] : ''));
  await ctx.close();
}
{ /* 5. le moteur plante en dessinant */
  const { ctx, page, err } = await ouvre();
  await toutes3D(page, 5);
  await page.evaluate(() => {
    const vrai = KdmcPerso3D.creer;
    KdmcPerso3D.creer = function (n) { const p = vrai(n); if (p) p.dessiner = function () { throw new Error('panne simulée'); }; return p; };
    const im = document.createElement('div'); im.id = 'neuf'; im.className = 'bee-rig'; im.style.cssText = 'position:relative;width:200px;height:200px';
    im.innerHTML = '<div class="rig-look" style="position:absolute;inset:0"><img class="rig-base" crossorigin="anonymous" src="/lingua/donkey/rig/base.webp" style="position:absolute;inset:0;width:100%;height:100%"></div>';
    document.body.appendChild(im);
  });
  await dors(3500);
  const e = await page.evaluate(() => { const r = document.getElementById('neuf'); const n = KdmcMarionnette.etat().length; return { p3d: r.classList.contains('p3d-on'), on: r.classList.contains('mrn-on'), n, ok3d: KdmcMarionnette.etat().filter((x) => x.p3d).length }; });
  chk(!e.p3d && e.on, 'un moteur qui plante en dessinant → ce personnage retombe en 2D (mrn-on, plus de p3d-on)');
  chk(e.ok3d >= 5, `… et les autres restent en 3D (${e.ok3d})`);
  chk(err.length === 0, '0 erreur JS' + (err.length ? ' — ' + err[0] : ''));
  await ctx.close();
}
{ /* 6. « Regarde sa bouche, puis imite » : le dessin ENSEIGNE la prononciation, pas de 3D */
  const { ctx, page, err } = await ouvre({ url: '/pron' });
  await dors(4000);
  const r = await page.evaluate(() => ({ p3d: KdmcMarionnette.etat().some((e) => e.p3d), op: getComputedStyle(document.querySelector('.disc-mouth')).opacity }));
  chk(!r.p3d && r.op === '1', `exercice de prononciation (.pron-bee) : pas de 3D, le rond de la bouche reste visible (opacité ${r.op})`);
  chk(err.length === 0, '0 erreur JS');
  await ctx.close();
}

/* ---------- G. sobriété ---------- */
console.log('G. Sobriété');
{
  const { ctx, page } = await ouvre();
  await toutes3D(page, 5);
  const st = await page.evaluate(() => { const r = {}; for (const n of KdmcPerso3D.noms) { const p = KdmcPerso3D.creer(n), c = document.createElement('canvas'); c.width = c.height = 256; p.dessiner(c.getContext('2d'), 256, 'repos', 1, {}, '#fff'); r[n] = KdmcPerso3D._stats(); p.liberer(); } return r; });
  for (const [n, s] of Object.entries(st)) chk(s && s.appels <= 60 && s.triangles <= 30000, `${n} : ${s && s.appels} appels de dessin, ${s && s.triangles} triangles par image (plafonds 60 / 30 000)`);
  /* hors écran : plus rien ne se dessine */
  await page.evaluate(() => { document.getElementById('ane').style.cssText += ';position:fixed;top:4000px'; });
  await dors(500);
  const e0 = (await etat(page))[2].images; await dors(700); const e1 = (await etat(page))[2].images;
  chk(e1 - e0 <= 1, `un personnage hors écran ne se dessine plus (${e1 - e0} image en 0,7 s)`);
  await ctx.close();
}

/* ---------- H. sabotage : ces contrôles doivent devenir rouges sur la faute qu'ils visent ---------- */
console.log('H. Sabotage : chaque contrôle voit la faute qu\'il vise');
{
  MODIF = (u, t) => /marionnette\.js/.test(u) ? t.replace(/monter3D\(etat\);/g, '') : t;
  const { ctx, page } = await ouvre();
  const bon = await toutes3D(page, 5);
  const e = await etat(page);
  chk(!bon && e.every((x) => !x.p3d), 'SABOTAGE B : sans le branchement de la marionnette, plus rien n\'est en 3D → le contrôle B serait ROUGE');
  await ctx.close();
  MODIF = null;
}
{
  const faux = empreinte((f) => lire(f) + (f.endsWith('def.mjs') ? '\n// un personnage a changé' : ''));
  chk(faux !== sha, 'SABOTAGE A : un personnage modifié sans recompiler le moteur change l\'empreinte → le contrôle A serait ROUGE');
}

await nav.close();
srv.close();
console.log(`\n${ok} contrôles OK, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
