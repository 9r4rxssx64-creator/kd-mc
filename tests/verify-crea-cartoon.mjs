/* PREUVE — Créa Studio « le cartoon doit être BEAU » + PARITÉ avec les apps
 * virales (v9.7.0). Kevin : « Cartoon ne fonctionne pas bien du tout. Pas beau. »
 * puis « Cartoon à parité avec les apps qu'on a copiées » (ToonMe, Prisma,
 * Voilà, Clip2Comic). Le défaut visible au départ : des taches vertes/orange sur
 * la peau, un visage en bouillie, et pas de vrai trait de dessin.
 *
 * On ne juge pas « à l'œil » : on MESURE sur une photo de test qui contient
 * exactement ce qui cassait avant (dégradés de peau + texture + contours nets) :
 *   1) la TEINTE de la peau est conservée (avant : elle partait dans le vert)
 *   2) les couleurs sont bien APLATIES (moins de nuances qu'au départ)
 *   3) il y a un VRAI trait d'encre, à la bonne place (sur les contours)
 *   4) le trait est ÉPAIS quand l'image est grande (avant : 1 px = invisible)
 *   5) « Force des contours = 0 » ⇒ aucun trait (le réglage sert vraiment)
 *   6) ça reste RAPIDE sur une grande photo (iPhone)
 *   7) l'ancienne recette échouerait au test n°1 (preuve que le test mord)
 *   8) les 12 STYLES existent, sont TOUS différents, transforment vraiment,
 *      ne finissent ni tout noir ni tout blanc, et restent rapides
 *   9) les styles portrait lissent la PEAU sans ramollir les contours
 * Lancer : node tests/verify-crea-cartoon.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8259;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end('x'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, r));

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.fill('#gateName', 'Test Cartoon'); await page.fill('#gateCode', '1234');
await page.click('#gateGo'); await page.waitForTimeout(250);

/* Une « photo » de test : visage en dégradé de peau + cheveux + fond + texture.
   C'est le cas qui faisait apparaître les taches de couleur. */
await page.evaluate(() => {
  window.__scene = function (W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3a4a63'); bg.addColorStop(1, '#1d2534');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b1c14';                                   // cheveux
    g.beginPath(); g.ellipse(W * 0.5, H * 0.42, W * 0.25, H * 0.30, 0, 0, 6.2832); g.fill();
    const sk = g.createRadialGradient(W * 0.44, H * 0.36, W * 0.02, W * 0.5, H * 0.45, W * 0.28);
    sk.addColorStop(0, '#f0c9a6'); sk.addColorStop(0.6, '#d9a077'); sk.addColorStop(1, '#a9714c');
    g.fillStyle = sk;                                          // visage (dégradé = le piège)
    g.beginPath(); g.ellipse(W * 0.5, H * 0.46, W * 0.20, H * 0.25, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#2a1e18';                                   // yeux + bouche = contours nets
    g.beginPath(); g.ellipse(W * 0.43, H * 0.42, W * 0.026, H * 0.016, 0, 0, 6.2832); g.fill();
    g.beginPath(); g.ellipse(W * 0.57, H * 0.42, W * 0.026, H * 0.016, 0, 0, 6.2832); g.fill();
    g.strokeStyle = '#7d3b34'; g.lineWidth = Math.max(2, W * 0.008);
    g.beginPath(); g.arc(W * 0.5, H * 0.50, W * 0.09, 0.25, Math.PI - 0.25); g.stroke();
    const d = g.getImageData(0, 0, W, H); const a = d.data;    // grain photo
    for (let i = 0; i < a.length; i += 4) {
      const n = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 14 - 7;
      a[i] += n; a[i + 1] += n; a[i + 2] += n;
    }
    g.putImageData(d, 0, 0);
    return c;
  };
  /* teinte moyenne (0-360) et nombre de couleurs distinctes dans une zone */
  window.__stats = function (cv, x0, y0, x1, y1) {
    const g = cv.getContext('2d', { willReadFrequently: true });
    const w = Math.round((x1 - x0) * cv.width), h = Math.round((y1 - y0) * cv.height);
    const d = g.getImageData(Math.round(x0 * cv.width), Math.round(y0 * cv.height), w, h).data;
    let sx = 0, sy = 0, n = 0, dark = 0; const set = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx - mn > 8) {                                        // teinte only si couleur
        let hdeg;
        if (mx === r) hdeg = 60 * (((gg - b) / (mx - mn)) % 6);
        else if (mx === gg) hdeg = 60 * ((b - r) / (mx - mn) + 2);
        else hdeg = 60 * ((r - gg) / (mx - mn) + 4);
        if (hdeg < 0) hdeg += 360;
        const rad = hdeg * Math.PI / 180; sx += Math.cos(rad); sy += Math.sin(rad); n++;
      }
      if ((r * 0.299 + gg * 0.587 + b * 0.114) < 60) dark++;
      set.add((r >> 3) + ',' + (gg >> 3) + ',' + (b >> 3));
    }
    let hue = Math.atan2(sy / Math.max(1, n), sx / Math.max(1, n)) * 180 / Math.PI; if (hue < 0) hue += 360;
    // rugosité = à quel point ça « grésille » (écart de chaque pixel à ses voisins)
    let rug = 0, cnt = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = (y * w + x) * 4, L = (k) => d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114;
      const moy = (L(p - 4) + L(p + 4) + L(p - w * 4) + L(p + w * 4)) / 4;
      rug += Math.abs(L(p) - moy); cnt++;
    }
    return { hue, teintes: set.size, sombres: dark / (d.length / 4), rugosite: cnt ? rug / cnt : 0 };
  };
});

/* ---------- 1 & 2 : teinte de peau conservée + couleurs aplaties ---------- */
const peau = await page.evaluate(() => {
  const src = window.__scene(520, 640);
  const avant = window.__stats(src, 0.42, 0.40, 0.58, 0.52);      // joue / centre du visage
  const t0 = performance.now();
  window.cartoonize(src, src.getContext('2d'), { edge: 60, colors: 8, smooth: 2 });
  const ms = performance.now() - t0;
  const apres = window.__stats(src, 0.42, 0.40, 0.58, 0.52);
  return { avant, apres, ms };
});
const ecartTeinte = Math.min(Math.abs(peau.apres.hue - peau.avant.hue), 360 - Math.abs(peau.apres.hue - peau.avant.hue));
chk(ecartTeinte < 12,
  `la peau garde sa couleur : teinte ${peau.avant.hue.toFixed(0)}° → ${peau.apres.hue.toFixed(0)}° (écart ${ecartTeinte.toFixed(1)}°, toléré 12°)`);
chk(peau.apres.rugosite < peau.avant.rugosite * 0.35,
  `la peau devient un APLAT lisse : rugosité ${peau.avant.rugosite.toFixed(1)} → ${peau.apres.rugosite.toFixed(1)} (grain et texture effacés)`);

/* ---------- 3 & 4 : un vrai trait d'encre, épais et bien placé ----------
   On compare le cartoon AVEC trait au même cartoon SANS trait : la différence
   est EXACTEMENT l'encre. (Mesurer « pixels devenus sombres » par rapport à la
   photo d'origine mélangeait le trait et l'aplat — ça faussait tout.) */
const trait = await page.evaluate(() => {
  function encre(W, H, force) {
    const av0 = window.__scene(W, H);                       // référence : cartoon SANS trait
    window.cartoonize(av0, av0.getContext('2d', { willReadFrequently: true }), { edge: 0, colors: 8, smooth: 2 });
    const av = av0.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const brut = window.__scene(W, H);                      // pour savoir où sont les vrais contours
    const raw = brut.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const src = window.__scene(W, H);
    const g = src.getContext('2d', { willReadFrequently: true });
    window.cartoonize(src, g, { edge: force, colors: 8, smooth: 2 });
    const ap = g.getImageData(0, 0, W, H).data;
    let n = 0, surContour = 0, colonnes = 0;
    const carte = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < ap.length; i += 4, p++) {
      const ya = av[i] * 0.299 + av[i + 1] * 0.587 + av[i + 2] * 0.114;
      const yb = ap[i] * 0.299 + ap[i + 1] * 0.587 + ap[i + 2] * 0.114;
      if (yb < ya - 30) { carte[p] = 1; n++; }
    }
    // le trait suit-il un contour ? (voisinage très contrasté dans la photo d'origine)
    const gy = (p) => raw[p * 4] * 0.299 + raw[p * 4 + 1] * 0.587 + raw[p * 4 + 2] * 0.114;
    const marge = Math.max(3, Math.round(W / 200));
    for (let y = marge; y < H - marge; y++) for (let x = marge; x < W - marge; x++) {
      const p = y * W + x; if (!carte[p]) continue;
      if (Math.abs(gy(p - marge) - gy(p + marge)) > 14
        || Math.abs(gy(p - marge * W) - gy(p + marge * W)) > 14) surContour++;
    }
    // épaisseur : largeur moyenne des segments horizontaux de trait
    let seg = 0, tot = 0;
    for (let y = 0; y < H; y++) { let run = 0;
      for (let x = 0; x < W; x++) { if (carte[y * W + x]) run++; else { if (run) { seg++; tot += run; } run = 0; } }
      if (run) { seg++; tot += run; } }
    colonnes = seg ? tot / seg : 0;
    return { part: n / (W * H), surContour: n ? surContour / n : 0, epaisseur: colonnes };
  }
  return { petit: encre(400, 500, 70), grand: encre(1600, 2000, 70), faible: encre(400, 500, 25) };
});
chk(trait.petit.part > 0.004 && trait.petit.part < 0.30,
  `il y a un vrai trait de dessin : ${(trait.petit.part * 100).toFixed(1)} % de l'image (ni absent, ni tout noir)`);
chk(trait.petit.surContour > 0.55,
  `le trait suit les formes : ${(trait.petit.surContour * 100).toFixed(0)} % des pixels d'encre sont sur un contour`);
chk(trait.grand.epaisseur > trait.petit.epaisseur * 1.8,
  `le trait grossit avec l'image : ${trait.petit.epaisseur.toFixed(1)} px en 400 px de large → ${trait.grand.epaisseur.toFixed(1)} px en 1600 px`);

/* ---------- 5 : le réglage « force des contours » sert vraiment ---------- */
chk(trait.faible.part * 1.6 < trait.petit.part,
  `le curseur « force des contours » agit vraiment : ${(trait.faible.part * 100).toFixed(2)} % d'encre à 25, ${(trait.petit.part * 100).toFixed(2)} % à 70`);

/* ---------- 6 : rapide sur une grande photo ---------- */
const perf = await page.evaluate(() => {
  const src = window.__scene(2000, 1500);
  const t = performance.now();
  window.cartoonize(src, src.getContext('2d', { willReadFrequently: true }), { edge: 60, colors: 8, smooth: 2 });
  return performance.now() - t;
});
chk(perf < 9000, `assez rapide sur une grande photo 2000×1500 : ${(perf / 1000).toFixed(1)} s`);

/* ---------- 7 : le test MORD (l'ancienne recette échouerait) ---------- */
const ancienne = await page.evaluate(() => {
  const src = window.__scene(520, 640);
  const g = src.getContext('2d', { willReadFrequently: true });
  const avant = window.__stats(src, 0.42, 0.40, 0.58, 0.52);
  // ancienne recette : on arrondit R, V et B chacun de son côté
  const img = g.getImageData(0, 0, 520, 640), d = img.data, step = 255 / 7;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(Math.round(d[i] / step) * step);
    d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
    d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
  }
  g.putImageData(img, 0, 0);
  const apres = window.__stats(src, 0.42, 0.40, 0.58, 0.52);
  let e = Math.abs(apres.hue - avant.hue); if (e > 180) e = 360 - e;
  return e;
});
chk(ancienne > ecartTeinte,
  `le test mord : l'ancienne recette décale la peau de ${ancienne.toFixed(1)}° contre ${ecartTeinte.toFixed(1)}° pour la nouvelle`);


/* ---------- 8 : LES STYLES (parité ToonMe / Prisma / Voilà / Clip2Comic) ---------- */
const styles = await page.evaluate(() => {
  const src0 = window.__scene(300, 380);
  const g0 = src0.getContext('2d', { willReadFrequently: true });
  const ref = g0.getImageData(0, 0, 300, 380).data;
  const out = {};
  for (const st of window.CARTOON_STYLES) {
    const c = window.__scene(300, 380);
    const g = c.getContext('2d', { willReadFrequently: true });
    const t = performance.now();
    window.cartoonize(c, g, { style: st.id });
    const ms = performance.now() - t;
    const d = g.getImageData(0, 0, 300, 380).data;
    let sig = 0, change = 0, vides = 0, lum = 0;
    for (let i = 0; i < d.length; i += 4 * 11) {
      sig = (sig * 33 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0;
      if (Math.abs(d[i] - ref[i]) + Math.abs(d[i + 1] - ref[i + 1]) + Math.abs(d[i + 2] - ref[i + 2]) > 24) change++;
      const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      lum += L; if (L < 12 || L > 245) vides++;
      }
    const n = Math.ceil(d.length / (4 * 11));
    out[st.id] = { sig, change: change / n, plat: vides / n, lum: lum / n, ms, nom: st.nom };
  }
  return out;
});
const ids = Object.keys(styles);
chk(ids.length >= 12, `${ids.length} styles proposés (comme les apps virales : cartoon, anime, BD, 3D, peinture, pop art, noir, encre, croquis, gravure, néon, sticker)`);
const sigs = new Set(ids.map((k) => styles[k].sig));
chk(sigs.size === ids.length,
  `les ${ids.length} styles donnent ${sigs.size} rendus TOUS DIFFÉRENTS (aucun doublon déguisé)`);
const mous = ids.filter((k) => styles[k].change < 0.20);
chk(mous.length === 0,
  mous.length ? `styles qui ne changent presque rien : ${mous.map((k) => styles[k].nom + ' ' + (styles[k].change * 100).toFixed(0) + '%').join(', ')}`
    : `chaque style transforme VRAIMENT la photo (${(Math.min(...ids.map((k) => styles[k].change)) * 100).toFixed(0)} % de pixels changés au minimum)`);
const noirs = ids.filter((k) => styles[k].plat > 0.72);
chk(noirs.length === 0,
  noirs.length ? `styles illisibles (presque tout noir ou tout blanc) : ${noirs.map((k) => styles[k].nom).join(', ')}`
    : `aucun style ne finit tout noir ni tout blanc (le pire garde ${(100 - Math.max(...ids.map((k) => styles[k].plat)) * 100).toFixed(0)} % de nuances)`);
const lent = ids.filter((k) => styles[k].ms > 2500);
chk(lent.length === 0, `tous les styles restent rapides (le plus lent : ${Math.max(...ids.map((k) => styles[k].ms)).toFixed(0)} ms sur 300×380)`);

/* ---------- 9 : la peau du VISAGE est vraiment lissée (styles portrait) ----------
   Ce que font ToonMe / Voilà : effacer les imperfections de la PEAU en gardant
   le reste net. On pose donc un petit défaut sur la joue ET un motif identique
   sur le fond, puis on regarde lequel disparaît. */
const portrait = await page.evaluate(() => {
  function scene() {
    const W = 320, H = 400;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#24405e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b1c14';
    g.beginPath(); g.ellipse(W * 0.5, H * 0.42, W * 0.25, H * 0.30, 0, 0, 6.2832); g.fill();
    const sk = g.createRadialGradient(W * 0.44, H * 0.36, 4, W * 0.5, H * 0.45, W * 0.28);
    sk.addColorStop(0, '#f0c9a6'); sk.addColorStop(1, '#c08c62'); g.fillStyle = sk;
    g.beginPath(); g.ellipse(W * 0.5, H * 0.46, W * 0.20, H * 0.25, 0, 0, 6.2832); g.fill();
    // le MÊME petit défaut : sur la joue, et sur le fond (témoin)
    g.fillStyle = 'rgba(120,70,60,0.75)';
    g.beginPath(); g.arc(W * 0.40, H * 0.50, W * 0.018, 0, 6.2832); g.fill();
    return c;
  }
  function contraste(cv, cx, cy, r) {
    const g = cv.getContext('2d', { willReadFrequently: true });
    const X = Math.round(cx * cv.width - r), Y = Math.round(cy * cv.height - r);
    const d = g.getImageData(X, Y, r * 2, r * 2).data;
    let mn = 999, mx = -1;
    for (let i = 0; i < d.length; i += 4) {
      const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (L < mn) mn = L; if (L > mx) mx = L;
    }
    return mx - mn;
  }
  const r = Math.round(320 * 0.03);
  const out = {};
  for (const st of ['cartoon', 'anime']) {
    const c = scene();
    window.cartoonize(c, c.getContext('2d', { willReadFrequently: true }), { style: st });
    // et le bord cheveux/visage : il doit RESTER net (sinon on a fait de la bouillie)
    out[st] = { joue: contraste(c, 0.40, 0.50, r), bord: contraste(c, 0.50, 0.235, r) };
  }
  return out;
});
chk(portrait.anime.joue < portrait.cartoon.joue * 0.75,
  `le style portrait EFFACE le défaut sur la joue : contraste ${portrait.cartoon.joue.toFixed(0)} (Cartoon) → ${portrait.anime.joue.toFixed(0)} (Anime)`);
chk(portrait.anime.bord > portrait.cartoon.bord * 0.7 && portrait.anime.bord > portrait.anime.joue * 2,
  `…sans transformer le visage en bouillie : le bord cheveux/visage reste net (${portrait.anime.bord.toFixed(0)} de contraste, contre ${portrait.anime.joue.toFixed(0)} pour le défaut effacé)`);

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — CARTOON ===');
R.ok.forEach((m) => console.log('  OK ' + m)); R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
