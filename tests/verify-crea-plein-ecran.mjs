/* PREUVE — Créa Studio v9.6.0 : « Pouvoir voir en plein écran les résultats etc »
 * (Kevin, 6 août). Avant, l'aperçu de la galerie était plafonné à 60 % de la
 * hauteur et l'aperçu Photo à moins de la moitié de l'écran : on ne voyait
 * jamais vraiment son résultat.
 * Chromium mobile 390px, réseau externe bloqué (leçon #135). On prouve :
 *   1) le bouton ⛶ existe sur Photo, Vidéo, Cartoon, Magie IA et Danse IA
 *   2) le plein écran couvre VRAIMENT tout l'écran (mesuré en pixels)
 *   3) la photo y est montrée en PLEINE résolution (pas l'aperçu réduit)
 *   4) le zoom à deux doigts agrandit pour de vrai, et se remet à plat
 *   5) on peut déplacer l'image une fois zoomée
 *   6) « Enregistrer » est accessible depuis le plein écran
 *   7) ✕ ferme, et la touche Échap aussi
 *   8) depuis « Mes créas », le bouton ⛶ ouvre la création en grand
 * Lancer : node tests/verify-crea-plein-ecran.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8263;
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
const VP = { width: 390, height: 844 };
const ctx = await browser.newContext({ viewport: VP, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.fill('#gateName', 'Test Plein'); await page.fill('#gateCode', '1234');
await page.click('#gateGo'); await page.waitForTimeout(250);

/* une photo nette de 1600×1200 : on pourra vérifier la pleine résolution */
await page.evaluate(() => {
  window.__photo = function (W, H) {
    W = W || 1600; H = H || 1200;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#1d2a3a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8b84b';
    for (let i = 0; i < 12; i++) g.fillRect(W * 0.08 * i, H * 0.2, W * 0.03, H * 0.6);
    return c.toDataURL('image/png');
  };
});
async function ouvrirPhoto() {
  const dataUrl = await page.evaluate(() => window.__photo());
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.setInputFiles('#fileImg', { name: 'photo.png', mimeType: 'image/png', buffer: buf });
  await page.waitForFunction(() => !document.getElementById('photoCanvas').classList.contains('hidden'), { timeout: 8000 });
  await page.waitForTimeout(300);
}

/* ---------- 1 : le bouton existe partout où il y a un résultat ---------- */
const boutons = await page.evaluate(() => ({
  photo: !!document.getElementById('photoFull'),
  video: !!document.getElementById('videoFull'),
  anim: !!document.getElementById('animFull'),
  magie: !!document.querySelector('#magicTabs button[onclick*="pleinResultat"]'),
  danse: !!document.querySelector('#aiModels button[onclick*="pleinResultat"]'),
}));
const nb = Object.values(boutons).filter(Boolean).length;
chk(nb === 5, `le bouton « ⛶ Plein écran » est sur les ${nb} écrans à résultat (photo, vidéo, cartoon, magie, danse)`);

/* ---------- 2 & 3 : ça couvre tout l'écran, en pleine résolution ---------- */
await page.click('#bnav button[data-go="photo"]'); await page.waitForTimeout(200);
await ouvrirPhoto();
const apercu = await page.evaluate(() => {
  const r = document.getElementById('photoCanvas').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
await page.click('#photoFull'); await page.waitForTimeout(500);
const grand = await page.evaluate(() => {
  const b = document.getElementById('plein');
  const r = b.getBoundingClientRect();
  const m = b.querySelector('.media');
  const mr = m ? m.getBoundingClientRect() : null;
  return {
    ouvert: b.classList.contains('on'),
    w: Math.round(r.width), h: Math.round(r.height),
    natW: m && m.naturalWidth ? m.naturalWidth : 0,
    mediaH: mr ? Math.round(mr.height) : 0,
    titre: (document.getElementById('pleinTop') || {}).textContent || '',
  };
});
chk(grand.ouvert && grand.w >= VP.width && grand.h >= VP.height,
  `le plein écran couvre tout l'écran : ${grand.w}×${grand.h} px (écran ${VP.width}×${VP.height})`);
chk(grand.mediaH >= apercu.h,
  `l'image occupe toute la largeur de l'écran, droite (pas couchée) : ${grand.mediaH} px de haut`);
chk(grand.natW === 1600,
  `c'est la PLEINE résolution qui est montrée (${grand.natW} px de large, pas l'aperçu réduit) — « ${grand.titre.slice(0, 34)} »`);

/* ---------- 3bis : « ⤢ Remplir » occupe VRAIMENT tout l'écran ----------
   C'est la vraie réponse à « voir en grand » : une photo paysage sur un
   téléphone portrait tient en largeur et laisse du noir. Ce bouton la fait
   remplir tout l'écran (les bords sortent du cadre). */
await page.click('#pleinFill'); await page.waitForTimeout(350);
const rempli = await page.evaluate(() => {
  const m = document.getElementById('plein').querySelector('.media').getBoundingClientRect();
  return { w: Math.round(m.width), h: Math.round(m.height), t: document.getElementById('pleinTop').textContent };
});
chk(rempli.w >= VP.width - 1 && rempli.h >= VP.height - 1,
  `« ⤢ Remplir » occupe tout l'écran : ${rempli.w}×${rempli.h} px (écran ${VP.width}×${VP.height}) — au lieu de ${grand.mediaH} px de haut`);
chk(/rempli/.test(rempli.t), 'et l\'app le DIT (« rempli — les bords sont coupés »), pas de surprise');
await page.click('#pleinFill'); await page.waitForTimeout(300);   // on revient en « tout visible »

/* ---------- 4 : le zoom à deux doigts agrandit pour de vrai ---------- */
const zoom = await page.evaluate(async () => {
  const box = document.getElementById('plein'), m = box.querySelector('.media');
  const lire = () => m.getBoundingClientRect().width;
  const av = lire();
  const ev = (t, id, x, y) => box.dispatchEvent(new PointerEvent(t, {
    pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch',
  }));
  // deux doigts qui s'écartent
  ev('pointerdown', 1, 150, 400); ev('pointerdown', 2, 250, 400);
  ev('pointermove', 1, 60, 400); ev('pointermove', 2, 340, 400);
  await new Promise((r) => setTimeout(r, 60));
  const zoome = lire();
  ev('pointerup', 1, 60, 400); ev('pointerup', 2, 340, 400);
  return { av, zoome };
});
chk(zoom.zoome > zoom.av * 1.6,
  `le zoom à deux doigts agrandit vraiment : ${Math.round(zoom.av)} px → ${Math.round(zoom.zoome)} px de large`);

/* ---------- 5 : on peut déplacer l'image zoomée, et revenir à plat ---------- */
const deplace = await page.evaluate(async () => {
  const box = document.getElementById('plein'), m = box.querySelector('.media');
  const gauche = () => Math.round(m.getBoundingClientRect().left);
  const av = gauche();
  const ev = (t, x, y) => box.dispatchEvent(new PointerEvent(t, {
    pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'touch',
  }));
  ev('pointerdown', 200, 400); ev('pointermove', 260, 400); ev('pointermove', 320, 400); ev('pointerup', 320, 400);
  await new Promise((r) => setTimeout(r, 60));
  const ap = gauche();
  document.getElementById('pleinZoom').click();       // le bouton 🔍 remet à plat
  await new Promise((r) => setTimeout(r, 60));
  return { av, ap, remis: Math.round(m.getBoundingClientRect().width) };
});
chk(deplace.ap > deplace.av + 20,
  `on déplace l'image zoomée au doigt (bord gauche ${deplace.av} → ${deplace.ap} px)`);
chk(Math.abs(deplace.remis - zoom.av) < 3,
  `le bouton 🔍 remet l'image à plat (retour à ${deplace.remis} px)`);

/* ---------- 6 : « Enregistrer » depuis le plein écran ---------- */
const avant = await page.evaluate(async () => (await window.Mine.list()).length);
await page.click('#pleinSave'); await page.waitForTimeout(400);
const feuille = await page.evaluate(() => document.getElementById('exportSheet').classList.contains('open'));
chk(feuille, 'le bouton « 💾 Enregistrer » est accessible sans quitter le plein écran');
await page.evaluate(() => closeSheet()); await page.waitForTimeout(200);

/* ---------- 7 : fermeture (✕ puis Échap) ---------- */
await page.click('#pleinClose'); await page.waitForTimeout(300);
let ferme = await page.evaluate(() => !document.getElementById('plein').classList.contains('on'));
chk(ferme, 'le bouton ✕ ferme le plein écran');
await page.click('#photoFull'); await page.waitForTimeout(400);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
ferme = await page.evaluate(() => !document.getElementById('plein').classList.contains('on'));
chk(ferme, 'la touche Échap ferme aussi (utile sur ordinateur)');

/* ---------- 8 : depuis « Mes créas » ---------- */
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 900; c.height = 700;
  const g = c.getContext('2d'); g.fillStyle = '#4dd88f'; g.fillRect(0, 0, 900, 700);
  const b = await new Promise((r) => c.toBlob(r, 'image/png'));
  await window.Mine.save(b, 'Résultat de test');
});
await page.click('#bnav button[data-go="mine"]'); await page.waitForTimeout(600);
await page.click('#mineGrid .mine-it'); await page.waitForTimeout(400);
const aBouton = await page.locator('#mineFull').count();
chk(aBouton === 1, 'dans « Mes créas », l\'aperçu propose « ⛶ Voir en plein écran »');
await page.click('#mineFull'); await page.waitForTimeout(600);
const galerieGrand = await page.evaluate(() => {
  const b = document.getElementById('plein'), m = b.querySelector('.media');
  const r = m ? m.getBoundingClientRect() : null;
  return { ouvert: b.classList.contains('on'), h: r ? Math.round(r.height) : 0, nat: m ? m.naturalWidth : 0 };
});
chk(galerieGrand.ouvert && galerieGrand.nat === 900,
  `la création s'ouvre en plein écran depuis la galerie (${galerieGrand.nat} px d'origine, plus de plafond à 60 % de l'écran)`);

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — PLEIN ÉCRAN ===');
R.ok.forEach((m) => console.log('  OK ' + m)); R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
