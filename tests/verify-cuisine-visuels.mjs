/* VISUELS DU LIVRE DE CUISINE — Kevin 2026-09-27 « Améliore les visuels, présentation, etc. Dans le thème tjs ».
 * Ce que la photo de Kevin (portable Windows, page vue par Marie) montrait : des cartes blanches quasi vides
 * (un petit médaillon gravé, deux lignes de texte), des origines sans repère de pays, les tomes avec le
 * compte collé au titre (« Sucrées12 recettes »), les recettes de la liste avec la famille collée au nom.
 * Le thème (marine · or · papier · rouge de Monaco) est GARDÉ ; on l'habille :
 *   - le plat du jour : une grande photo, le nom, l'origine, un bouton or — le même plat pour tout le
 *     monde un jour donné (aucun hasard) ;
 *   - chaque famille : la photo d'un de ses plats sous un voile marine, le nom en crème, le compte en or ;
 *   - les origines : le drapeau du pays en liseré (Monaco rouge/blanc, Ligurie vert/blanc/rouge) ;
 *   - les tomes : numéro romain en or, titre et compte sur deux lignes, dans une seule carte ;
 *   - la liste des recettes : vignette carrée arrondie, nom puis famille · tome sur des lignes séparées.
 * Ce test charge LA VRAIE page dans un vrai Chromium (iPhone 390 px et bureau 1280 px, thème clair et
 * sombre), hors ligne sauf son propre serveur (leçons #65/#220), et MESURE : photos réellement chargées,
 * textes sur des lignes séparées (rectangles), contraste du nom sur la photo, 0 défilement horizontal,
 * cibles tactiles ≥ 44 px, 0 erreur JS. Prouvé discriminant : l'ancienne page → échec.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tools', 'cuisine');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const fails = [];
const ko = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

/* (1) statique : les briques du nouveau sommaire existent, l'ancien balisage en ligne a disparu */
const html = readFileSync(join(DIR, 'index.html'), 'utf8');
console.log('— statique');
for (const must of ['class="fam fam-ph"', 'class="pdj"', 'function platDuJour', 'function famPhotoId', 'function roman(', '.fam.fam-ph img{', '.orig-card.oc-monaco::before{background:linear-gradient(180deg,#CE1126', '.orig-card.oc-ligurie::before{', '.tome .tx .d{display:block', '.ritem .rn2{display:block', '.ritem .rmeta{display:block', 'class="tomes"', 'class="fam row surprise"', 'class="fam row dial"', 'class="fam row papier"', '.section-t h2::before{content:"◆"', '.pdj{display:none!important}']) {
  if (!html.includes(must)) ko('manque « ' + must + ' »');
}
if (/class="fam" style="width:100%;flex-direction:row/.test(html)) ko('il reste des cartes pleine largeur stylées en ligne (à la place de .fam.row)');
if (!/var FAM_PHOTO=\{/.test(html)) ko('pas de table des photos de famille (FAM_PHOTO)');
/* le thème reste le thème : les couleurs de base ne bougent pas */
for (const c of ['--marine:#0E2A34', '--gold:#B4863B', '--gold-bright:#CBA14C', '--paper:#FBF8F1', '--rouge:#9E3B34']) {
  if (!html.includes(c)) ko('le thème a changé : « ' + c + ' » a disparu');
}
if (!fails.length) ok('les briques du nouveau sommaire sont là, le thème est intact');

/* (2) dans le navigateur */
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  try { const body = readFileSync(join(DIR, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const browser = await chromium.launch();
const lum = (rgb) => { const m = String(rgb).match(/\d+(\.\d+)?/g) || [0, 0, 0]; const [r, g, b] = m.slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

const scenarios = [
  { n: 'iPhone clair', w: 390, h: 844, scheme: 'light' },
  { n: 'iPhone sombre', w: 390, h: 844, scheme: 'dark' },
  { n: 'iPhone SE (375)', w: 375, h: 667, scheme: 'light' },
  { n: 'bureau clair', w: 1280, h: 800, scheme: 'light' },
  { n: 'bureau sombre', w: 1280, h: 800, scheme: 'dark' },
];
let pdjIds = [];
for (const s of scenarios) {
  console.log('— ' + s.n);
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: s.scheme });
  await ctx.route(/^https?:\/\//, (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:\/]/.test(r.request().url()) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.go === 'function' && Array.isArray(window.R) && window.R.length > 0);
  await page.evaluate(() => { const c = document.getElementById('cover'); if (c) { c.style.display = 'none'; } if (typeof openBook === 'function') { /* pas de transition */ } });
  /* les photos sont chargées en différé : on attend qu'elles soient là */
  await page.waitForFunction(() => [...document.querySelectorAll('.pdj img, .fam.fam-ph img')].every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
  const home = await page.evaluate(() => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
    const rect = (e) => e ? e.getBoundingClientRect() : null;
    const pdj = q('.pdj'), pdjImg = q('.pdj img'), pdjH3 = q('.pdj h3'), pdjGo = q('.pdj .pdj-go');
    const fams = qa('.fam.fam-ph').map(f => { const img = f.querySelector('img'), nm = f.querySelector('.nm'), n = f.querySelector('.n'); return {
      h: rect(f).height, w: rect(f).width, img: !!img, loaded: !!(img && img.complete && img.naturalWidth > 0), nm: nm && nm.textContent.trim(), n: n && n.textContent.trim(),
      nmColor: nm && getComputedStyle(nm).color, nColor: n && getComputedStyle(n).color }; });
    const tomes = qa('.tomes .tome').map(t => { const rt = rect(t.querySelector('.t')), rd = rect(t.querySelector('.d')); return { h: rect(t).height, roman: (t.querySelector('.rn b') || {}).textContent, sep: rd.top >= rt.bottom - 1, d: t.querySelector('.d').textContent.trim() }; });
    const origs = qa('.orig-card').map(o => ({ h: rect(o).height, before: getComputedStyle(o, '::before').backgroundImage, n: o.querySelector('.oc-n').textContent.trim() }));
    const rows = qa('.fam.row').map(r => ({ h: rect(r).height, txt: r.textContent.trim().slice(0, 30) }));
    const b = q('.searchbar input');
    return {
      title: (document.querySelector('.home-hd h1') || {}).textContent,
      pdj: pdj ? { h: rect(pdj).height, w: rect(pdj).width, loaded: !!(pdjImg && pdjImg.complete && pdjImg.naturalWidth > 0), name: pdjH3 && pdjH3.textContent.trim(), goH: pdjGo && rect(pdjGo).height, h3Color: pdjH3 && getComputedStyle(pdjH3).color, id: (typeof platDuJour === 'function') ? platDuJour().id : -1 } : null,
      fams, tomes, origs, rows,
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      sectionDiamond: qa('.section-t h2').map(h => getComputedStyle(h, '::before').content).every(c => c.includes('◆')),
      catsExpected: (typeof CATS !== 'undefined') ? CATS.length : -1,
      tomesExpected: (typeof TOMES !== 'undefined') ? TOMES.length : -1,
      R: window.R.length,
    };
  });
  if (home.scrollW > home.innerW) ko(`${s.n} : la page défile horizontalement (${home.scrollW} > ${home.innerW})`);
  if (!home.pdj) ko(`${s.n} : pas de plat du jour`);
  else {
    if (!home.pdj.loaded) ko(`${s.n} : la photo du plat du jour n'est pas chargée`);
    if (!home.pdj.name) ko(`${s.n} : le plat du jour n'a pas de nom`);
    if (home.pdj.h < 160) ko(`${s.n} : plat du jour trop bas (${Math.round(home.pdj.h)} px)`);
    if (!(home.pdj.goH >= 34)) ko(`${s.n} : bouton « Voir la recette » trop petit (${home.pdj.goH})`);
    if (lum(home.pdj.h3Color) < 0.7) ko(`${s.n} : le nom du plat du jour n'est pas clair sur la photo (${home.pdj.h3Color})`);
    pdjIds.push(home.pdj.id);
  }
  if (home.fams.length !== home.catsExpected) ko(`${s.n} : ${home.fams.length} cartes de famille au lieu de ${home.catsExpected}`);
  home.fams.forEach((f, i) => {
    if (!f.loaded) ko(`${s.n} : famille ${i} (${f.nm}) : photo absente ou non chargée`);
    if (f.h < 140) ko(`${s.n} : famille ${i} (${f.nm}) : carte trop basse (${Math.round(f.h)} px)`);
    if (!/^\d+ recettes$/.test(f.n || '')) ko(`${s.n} : famille ${i} : compte illisible « ${f.n} »`);
    /* le texte repose sur le voile marine (rgba(10,30,37,.92) ≈ luminance 0,02) : contraste WCAG ≥ 4,5 */
    const contrast = (c) => (lum(c) + 0.05) / (0.02 + 0.05);
    if (contrast(f.nmColor) < 4.5) ko(`${s.n} : famille ${i} : nom illisible sur le voile (${f.nmColor}, contraste ${contrast(f.nmColor).toFixed(1)})`);
    if (contrast(f.nColor) < 4.5) ko(`${s.n} : famille ${i} : compte illisible sur le voile (${f.nColor}, contraste ${contrast(f.nColor).toFixed(1)})`);
  });
  if (home.tomes.length !== home.tomesExpected) ko(`${s.n} : ${home.tomes.length} tomes affichés au lieu de ${home.tomesExpected}`);
  home.tomes.forEach((t, i) => {
    if (!t.sep) ko(`${s.n} : tome ${i + 1} : le compte est collé au titre`);
    if (!/^[IVX]+$/.test(t.roman || '')) ko(`${s.n} : tome ${i + 1} : numéro romain absent (« ${t.roman} »)`);
    if (t.h < 44) ko(`${s.n} : tome ${i + 1} : ligne trop basse (${Math.round(t.h)} px)`);
    if (!/^\d+ recettes$/.test(t.d)) ko(`${s.n} : tome ${i + 1} : compte « ${t.d} »`);
  });
  if (home.origs.length !== 2) ko(`${s.n} : ${home.origs.length} cartes d'origine`);
  home.origs.forEach((o, i) => {
    if (!/linear-gradient/.test(o.before)) ko(`${s.n} : origine ${i} : pas de liseré drapeau`);
    if (o.h < 44) ko(`${s.n} : origine ${i} : carte trop basse`);
    if (!/^\d+ recettes$/.test(o.n)) ko(`${s.n} : origine ${i} : compte « ${o.n} »`);
  });
  if (home.rows.length < 3) ko(`${s.n} : ${home.rows.length} cartes pleine largeur (surprise, lexique, papier attendus)`);
  home.rows.forEach(r => { if (r.h < 44) ko(`${s.n} : carte « ${r.txt} » : ${Math.round(r.h)} px < 44`); });
  if (!home.sectionDiamond) ko(`${s.n} : les titres de section n'ont pas leur losange or`);

  /* le plat du jour s'ouvre d'un appui */
  if (home.pdj) {
    await page.click('.pdj');
    await page.waitForTimeout(150);
    const opened = await page.evaluate(() => ({ view: STATE.view, id: STATE.id }));
    if (opened.view !== 'recipe' || opened.id !== home.pdj.id) ko(`${s.n} : l'appui sur le plat du jour n'ouvre pas la bonne recette (${opened.view} #${opened.id})`);
  } else await page.evaluate(() => go('recipe', { id: 0, _from: "go('home')", _portions: null }));
  if (!/Tome [IVX]+ · /.test((await page.evaluate(() => (document.querySelector('.rp-hero .tt') || {}).textContent)) || '')) ko(`${s.n} : la fiche recette n'affiche pas « Tome <romain> »`);

  /* la liste : vignette + nom / famille sur des lignes séparées */
  await page.evaluate(() => go('list', { cat: CATS[0].name, tome: null, origine: null, style: null, q: '' }));
  await page.waitForFunction(() => document.querySelectorAll('.ritem').length > 3);
  await page.waitForFunction(() => [...document.querySelectorAll('.ritem .rthumb img')].slice(0, 4).every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
  const list = await page.evaluate(() => [...document.querySelectorAll('.ritem')].slice(0, 5).map(it => {
    const r = (e) => e.getBoundingClientRect(); const nm = it.querySelector('.rn2'), me = it.querySelector('.rmeta'), th = it.querySelector('.rthumb'), img = th.querySelector('img');
    return { sep: r(me).top >= r(nm).bottom - 1, thumbW: r(th).width, loaded: !!(img && img.complete && img.naturalWidth > 0), meta: me.textContent.trim(), h: r(it).height, radius: getComputedStyle(th).borderRadius };
  }));
  list.forEach((it, i) => {
    if (!it.sep) ko(`${s.n} : recette ${i} : la famille est collée au nom`);
    if (it.thumbW < 60) ko(`${s.n} : recette ${i} : vignette trop petite (${Math.round(it.thumbW)} px)`);
    if (!it.loaded) ko(`${s.n} : recette ${i} : vignette non chargée`);
    if (!/Tome [IVX]+$/.test(it.meta)) ko(`${s.n} : recette ${i} : « ${it.meta} » sans tome romain`);
    if (it.h < 44) ko(`${s.n} : recette ${i} : ligne trop basse`);
    if (it.radius === '50%') ko(`${s.n} : recette ${i} : la vignette est encore ronde`);
  });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!sw) ko(`${s.n} : la liste défile horizontalement`);
  if (jsErrors.length) ko(`${s.n} : ${jsErrors.length} erreur(s) JS : ${jsErrors[0]}`);
  if (!fails.some(f => f.startsWith(s.n))) ok(`${s.n} : plat du jour photo ✓ · ${home.fams.length} familles en photo ✓ · ${home.tomes.length} tomes lisibles ✓ · liste ✓ · 0 erreur JS`);
  await ctx.close();
}
/* le plat du jour est le même pour tout le monde (pas de hasard) */
if (new Set(pdjIds).size !== 1) ko('le plat du jour change d\'une ouverture à l\'autre : ' + pdjIds.join(','));
else ok('le plat du jour est le même à chaque ouverture aujourd\'hui (recette #' + pdjIds[0] + ')');

await browser.close(); server.close();
if (fails.length) { console.log(`\n❌ verify-cuisine-visuels : ${fails.length} problème(s)`); process.exit(1); }
console.log('\n✅ verify-cuisine-visuels : sommaire illustré, tomes et liste lisibles, thème intact, 5 écrans, 0 erreur JS');
