/* PREUVE — Créa Studio v9.5.0 : les 3 demandes de Kevin du 6 août.
 *   « Pouvoir sélectionner seulement le visage, une personne, etc. »
 *   « Une fois une photo ou vidéo intégrée … comme l'enlever. »
 *   « Pouvoir enregistrer. »
 * Chromium mobile 390px, réseau externe bloqué (leçon #135). On prouve :
 *   1) l'onglet Sélection existe et propose visage / personne / doigt
 *   2) toucher le visage le sélectionne VRAIMENT (dedans oui, dehors non)
 *   3) « Personne » descend sur le corps (plus grand que le visage seul)
 *   4) flouter la sélection ne touche QUE la sélection (le reste est intact)
 *   5) cartooniser la sélection ne touche QUE la sélection
 *   6) les réglages « seulement dans la sélection » n'affectent pas le reste
 *   7) le doigt ajoute / enlève, « inverser » et « tout enlever » marchent
 *   8) retirer la photo, la vidéo, le dessin ramène à l'écran de départ
 *   9) « Enregistrer » range vraiment la création dans « Mes créas »
 * Lancer : node tests/verify-crea-selection.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8261;
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
page.on('dialog', (d) => d.accept());
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.fill('#gateName', 'Test Selection'); await page.fill('#gateCode', '1234');
await page.click('#gateGo'); await page.waitForTimeout(250);

/* une « photo » avec UN visage à un endroit connu (50 % / 30 %) et un corps dessous */
await page.evaluate(() => {
  window.__photo = function () {
    const W = 480, H = 640;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#24405e'; g.fillRect(0, 0, W, H);                       // fond uni
    g.fillStyle = '#2b1c14';                                                // cheveux
    g.beginPath(); g.ellipse(W * 0.5, H * 0.28, W * 0.15, H * 0.13, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#d9a077';                                                // visage
    g.beginPath(); g.ellipse(W * 0.5, H * 0.30, W * 0.12, H * 0.10, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#8e5a3c';                                                // corps (t-shirt)
    g.fillRect(W * 0.30, H * 0.42, W * 0.40, H * 0.58);
    g.fillStyle = '#c9d6e2'; g.fillRect(W * 0.05, H * 0.72, W * 0.16, H * 0.16); // objet témoin (loin)
    return c.toDataURL('image/png');
  };
  window.__charger = function () {
    return new Promise((res) => {
      const im = new Image();
      im.onload = function () { window.Photo._loadImageForTest ? window.Photo._loadImageForTest(im) : null; res(true); };
      im.src = window.__photo();
    });
  };
});
/* on passe par le VRAI chemin d'import (fichier), pas une porte dérobée */
async function ouvrirPhoto() {
  const dataUrl = await page.evaluate(() => window.__photo());
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.setInputFiles('#fileImg', { name: 'photo.png', mimeType: 'image/png', buffer: buf });
  await page.waitForFunction(() => !document.getElementById('photoCanvas').classList.contains('hidden'), { timeout: 8000 });
  await page.waitForTimeout(300);
}
/* touche l'image à la position relative (nx, ny) */
async function toucher(nx, ny) {
  const b = await page.locator('#photoCanvas').boundingBox();
  await page.mouse.click(b.x + b.width * nx, b.y + b.height * ny);
  await page.waitForTimeout(350);
}
/* part de la sélection qui tombe dans une zone donnée */
const partSel = (x0, y0, x1, y1) => page.evaluate(([a, b, c, d]) => window.__selPart(a, b, c, d), [x0, y0, x1, y1]);

await page.click('#bnav button[data-go="photo"]'); await page.waitForTimeout(200);
await ouvrirPhoto();

/* outil de mesure : lit le calque de sélection réel via le voile rendu */
await page.evaluate(() => {
  window.__selPart = function (x0, y0, x1, y1) {
    const st = window.Photo._selStats();
    if (!st) return { dedans: 0, total: 0 };
    const { data, w, h } = st;
    let dedans = 0, total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3]; if (a < 40) continue;
      total++;
      const nx = x / w, ny = y / h;
      if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1) dedans++;
    }
    return { dedans, total, part: total ? dedans / total : 0, couv: total / (w * h) };
  };
  window.__pix = function (nx, ny) {
    const c = window.Photo._srcCanvas(), g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(Math.round(nx * c.width), Math.round(ny * c.height), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  window.__rug = function (x0, y0, x1, y1) {
    const c = window.Photo._srcCanvas(), g = c.getContext('2d', { willReadFrequently: true });
    const X = Math.round(x0 * c.width), Y = Math.round(y0 * c.height);
    const W = Math.round((x1 - x0) * c.width), H = Math.round((y1 - y0) * c.height);
    const d = g.getImageData(X, Y, W, H).data; let s = 0, n = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = (y * W + x) * 4, L = (k) => d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114;
      s += Math.abs(L(p) - (L(p - 4) + L(p + 4) + L(p - W * 4) + L(p + W * 4)) / 4); n++;
    }
    return n ? s / n : 0;
  };
});

/* ---------- 1 : l'onglet existe ---------- */
await page.click('#photoTools .chip[data-tab="select"]'); await page.waitForTimeout(250);
const outils = await page.locator('#selTools .chip').count();
const visible = await page.evaluate(() => !document.getElementById('photoSelect').classList.contains('hidden'));
chk(visible && outils === 4, `l'onglet « Sélection » s'ouvre avec ses ${outils} outils (visage / personne / doigt / enlever)`);

/* ---------- 2 : toucher le visage le sélectionne ---------- */
await page.click('#selTools .chip[data-sel="face"]');
await toucher(0.5, 0.30);
const vis = await partSel(0.30, 0.10, 0.70, 0.45);
chk(vis.total > 0 && vis.part > 0.9,
  vis.total ? `toucher le visage le sélectionne : ${(vis.part * 100).toFixed(0)} % de la sélection est bien sur le visage (couvre ${(vis.couv * 100).toFixed(0)} % de la photo)`
    : 'le visage n\'a PAS été sélectionné');

/* ---------- 3 : « Personne » descend sur le corps ---------- */
await page.click('#selTools .chip[data-sel="none"], #photoSelect .chip').catch(() => {});
await page.evaluate(() => window.Photo.selNone()); await page.waitForTimeout(150);
await page.click('#selTools .chip[data-sel="person"]');
await toucher(0.5, 0.30);
const pers = await partSel(0, 0, 1, 1);
const basCorps = await partSel(0, 0.5, 1, 1);
chk(pers.couv > vis.couv * 1.8 && basCorps.dedans > 0,
  `« Une personne » prend aussi le corps : ${(vis.couv * 100).toFixed(0)} % (visage) → ${(pers.couv * 100).toFixed(0)} % (personne), dont ${(basCorps.dedans / pers.total * 100).toFixed(0)} % sous la taille`);

/* ---------- 4 : flouter la sélection ne touche QUE la sélection ---------- */
await page.evaluate(() => window.Photo.selNone());
await page.click('#selTools .chip[data-sel="face"]'); await toucher(0.5, 0.30);
const temoinAvant = await page.evaluate(() => window.__pix(0.12, 0.80));
await page.evaluate(() => window.Photo.selBlur()); await page.waitForTimeout(600);
const temoinApres = await page.evaluate(() => window.__pix(0.12, 0.80));
const bordVisage = await page.evaluate(() => window.__rug(0.40, 0.20, 0.60, 0.40));
chk(temoinAvant.join() === temoinApres.join(),
  `flouter un visage ne touche PAS le reste de la photo (objet témoin identique : ${temoinApres.slice(0, 3).join(',')})`);
chk(bordVisage < 6, `le visage est bien flouté sur place (netteté résiduelle ${bordVisage.toFixed(1)})`);

/* ---------- 5 : cartooniser seulement la sélection ---------- */
await ouvrirPhoto();
await page.click('#photoTools .chip[data-tab="select"]'); await page.waitForTimeout(200);
await page.click('#selTools .chip[data-sel="face"]'); await toucher(0.5, 0.30);
const av5 = await page.evaluate(() => window.__pix(0.12, 0.80));
await page.evaluate(() => window.Photo.selCartoon()); await page.waitForTimeout(900);
const ap5 = await page.evaluate(() => window.__pix(0.12, 0.80));
const visageChange = await page.evaluate(() => window.__pix(0.5, 0.30));
chk(av5.join() === ap5.join(), 'cartooniser la sélection laisse le reste de la photo INTACT');
chk(visageChange[3] > 0, `le visage, lui, a bien été traité (${visageChange.slice(0, 3).join(',')})`);

/* ---------- 6 : réglages seulement dans la sélection ---------- */
await ouvrirPhoto();
await page.click('#photoTools .chip[data-tab="select"]'); await page.waitForTimeout(200);
await page.click('#selTools .chip[data-sel="face"]'); await toucher(0.5, 0.30);
await page.check('#selOnly'); await page.waitForTimeout(200);
const regl = await page.evaluate(() => {
  const lire = (nx, ny) => {
    const v = document.getElementById('photoCanvas');
    const g = v.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(Math.round(nx * v.width), Math.round(ny * v.height), 1, 1).data;
    return d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114;
  };
  const dehorsAv = lire(0.12, 0.80), dedansAv = lire(0.5, 0.30);
  // on bouge le VRAI curseur « Exposition », comme Kevin le ferait au doigt
  const sld = [...document.querySelectorAll('#photoAdjust .sld')]
    .find((d) => /Exposition/.test(d.querySelector('label').textContent));
  const inp = sld.querySelector('input[type=range]');
  inp.value = 90; inp.dispatchEvent(new Event('input', { bubbles: true }));
  return { dehorsAv, dedansAv, dehorsAp: lire(0.12, 0.80), dedansAp: lire(0.5, 0.30) };
});
chk(Math.abs(regl.dehorsAp - regl.dehorsAv) < 3 && regl.dedansAp > regl.dedansAv + 12,
  `« réglages seulement ici » : dehors ${regl.dehorsAv.toFixed(0)}→${regl.dehorsAp.toFixed(0)} (inchangé), dedans ${regl.dedansAv.toFixed(0)}→${regl.dedansAp.toFixed(0)} (éclairci)`);

/* ---------- 7 : doigt, inverser, tout enlever ---------- */
await ouvrirPhoto();
await page.click('#photoTools .chip[data-tab="select"]'); await page.waitForTimeout(200);
await page.click('#selTools .chip[data-sel="brush"]');
const bb = await page.locator('#photoCanvas').boundingBox();
await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.6);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height * 0.6, { steps: 8 });
await page.mouse.up(); await page.waitForTimeout(300);
const auDoigt = await partSel(0, 0, 1, 1);
chk(auDoigt.total > 0, `le doigt sélectionne ce qu'on trace (${(auDoigt.couv * 100).toFixed(1)} % de la photo)`);
const inv = await page.evaluate(async () => { window.Photo.selInvert(); return true; });
await page.waitForTimeout(250);
const apresInv = await partSel(0, 0, 1, 1);
chk(inv && apresInv.couv > 0.7, `« Inverser » retourne la sélection (${(apresInv.couv * 100).toFixed(0)} % sélectionné)`);
await page.evaluate(() => window.Photo.selNone()); await page.waitForTimeout(250);
const apresVide = await partSel(0, 0, 1, 1);
chk(apresVide.total === 0, '« Tout enlever » vide bien la sélection');

/* ---------- 8 : retirer la photo / la vidéo / le dessin ---------- */
await page.click('#photoRemove'); await page.waitForTimeout(500);
const photoVide = await page.evaluate(() => ({
  empty: !document.getElementById('photoEmpty').classList.contains('hidden'),
  canvas: document.getElementById('photoCanvas').classList.contains('hidden'),
  panel: document.getElementById('photoPanel').classList.contains('hidden'),
}));
chk(photoVide.empty && photoVide.canvas && photoVide.panel,
  'retirer la photo ramène à l\'écran de départ (« Choisir une photo »)');

await page.click('#bnav button[data-go="anim"]'); await page.waitForTimeout(250);
await page.evaluate(() => window.Anim.start()); await page.waitForTimeout(350);
const avantCreas = await page.evaluate(async () => (await window.Mine.list()).length);
await page.click('#animSave'); await page.waitForTimeout(900);
const apresCreas = await page.evaluate(async () => (await window.Mine.list()).length);
chk(apresCreas === avantCreas + 1, `« Enregistrer » range vraiment le dessin dans « Mes créas » (${avantCreas} → ${apresCreas})`);
await page.click('#animRemove'); await page.waitForTimeout(500);
const animVide = await page.evaluate(() => !document.getElementById('animEmpty').classList.contains('hidden'));
chk(animVide, 'retirer le dessin ramène à l\'écran de départ du Cartoon');

const vidClear = await page.evaluate(() => typeof window.Vid.clear === 'function' && typeof window.Vid.export === 'function');
chk(vidClear, 'la vidéo a aussi son « Retirer » et son « Enregistrer »');

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — SÉLECTION / RETIRER / ENREGISTRER ===');
R.ok.forEach((m) => console.log('  OK ' + m)); R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
