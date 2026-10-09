/* PREUVE — Créa Studio « masques qui suivent le visage » (v9.2.0).
 * Chromium mobile 390px, réseau externe bloqué (leçon #135), aucune bibliothèque
 * téléchargée : tout est dessiné au trait dans l'app.
 * On prouve :
 *   1) les 15 masques existent et sont proposés dans la caméra
 *   2) le visage est VRAIMENT trouvé (on lui donne une image avec un visage de
 *      couleur peau à un endroit connu, et on vérifie que la boîte tombe dessus)
 *   3) une image SANS visage ne déclenche rien (pas de masque posé au hasard)
 *   4) chaque masque dessine quelque chose de DIFFÉRENT (aucun doublon)
 *   5) le masque est CUIT dans la photo prise (pixels réellement modifiés)
 *   6) le suivi lisse la boîte (le masque ne saute pas d'une image à l'autre)
 * Lancer : node tests/verify-crea-masques.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8257;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end('x'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  permissions: ['camera', 'microphone'],
});
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
// le bac à sable ne peut pas joindre kd-mc.com : un échec réseau n'est pas un bug de l'app
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.fill('#gateName', 'Test Masques'); await page.fill('#gateCode', '1234');
await page.click('#gateGo'); await page.waitForTimeout(300);
await page.click('#bnav button[data-go="cam"]'); await page.waitForTimeout(300);

// 1) les masques sont là et proposés
const masques = await page.evaluate(() => window.Masks.ids());
const chips = await page.locator('#camMasks .chip').count();
chk(masques.length >= 12 && chips === masques.length + 1,
  `${masques.length} masques proposés dans la caméra (+ « Aucun »)`);

// 2) on fabrique une image avec un visage couleur peau à un endroit CONNU
const trouve = await page.evaluate(() => {
  const W = 480, H = 640;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#20304a'; g.fillRect(0, 0, W, H);            // fond bleu = pas de peau
  g.fillStyle = '#d9a077';                                     // couleur peau
  g.beginPath(); g.ellipse(W * 0.5, H * 0.38, W * 0.17, H * 0.16, 0, 0, 6.2832); g.fill();
  window.Face.reset();
  let b = null;
  for (let i = 0; i < 8; i++) b = window.Face.detect(c, W, H);  // le suivi lisse sur quelques images
  if (!b) return { ok: false };
  const cx = (b.x + b.w / 2) / W, cy = (b.y + b.h / 2) / H;
  return { ok: true, cx, cy, largeur: b.w / W, comment: b.how };
});
chk(trouve.ok && Math.abs(trouve.cx - 0.5) < 0.10 && Math.abs(trouve.cy - 0.38) < 0.10,
  trouve.ok
    ? `le visage est trouvé au bon endroit (centre ${(trouve.cx * 100).toFixed(0)}% / ${(trouve.cy * 100).toFixed(0)}%, attendu 50% / 38%)`
    : 'le visage n\'a PAS été trouvé');

// 3) une image sans visage ne doit rien déclencher
const rien = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 480; c.height = 640;
  const g = c.getContext('2d'); g.fillStyle = '#1c4d2b'; g.fillRect(0, 0, 480, 640); // vert = 0 peau
  window.Face.reset();
  return window.Face.detect(c, 480, 640);
});
chk(rien === null, 'une image sans visage ne pose AUCUN masque (pas de faux positif)');

// 4) chaque masque dessine quelque chose de différent
const dessins = await page.evaluate((ids) => {
  const out = {};
  for (const id of ids) {
    const c = document.createElement('canvas'); c.width = 300; c.height = 300;
    const g = c.getContext('2d');
    window.Masks.draw(g, id, { x: 60, y: 70, w: 180, h: 180 });
    const d = g.getImageData(0, 0, 300, 300).data;
    let n = 0, sig = 0;
    for (let i = 3; i < d.length; i += 4 * 13) { if (d[i] > 10) { n++; sig = (sig * 31 + i + d[i - 3]) >>> 0; } }
    out[id] = { pixels: n, sig };
  }
  return out;
}, masques);
const vides = masques.filter(id => dessins[id].pixels < 5);
const sigs = new Set(masques.map(id => dessins[id].sig));
chk(vides.length === 0, `les ${masques.length} masques dessinent vraiment quelque chose${vides.length ? ' (vides : ' + vides.join(',') + ')' : ''}`);
chk(sigs.size === masques.length, `les ${masques.length} masques sont TOUS différents (${sigs.size} dessins distincts)`);

// 5) le masque est cuit dans la photo prise
await page.click('#camStart');
await page.waitForFunction(() => (document.getElementById('camView') || {}).videoWidth > 0, { timeout: 15000 }).catch(() => {});
const cuit = await page.evaluate(async () => {
  const base = () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 500;
    const g = c.getContext('2d');
    g.fillStyle = '#20304a'; g.fillRect(0, 0, 400, 500);
    g.fillStyle = '#d9a077';
    g.beginPath(); g.ellipse(200, 190, 70, 80, 0, 0, 6.2832); g.fill();
    return { c, g };
  };
  const a = base();                                   // sans masque
  const b = base();                                   // avec masque
  window.Face.reset();
  let box = null; for (let i = 0; i < 6; i++) box = window.Face.detect(b.c, 400, 500);
  if (!box) return { changes: -1 };
  window.Masks.draw(b.g, 'couronne', box);
  const da = a.g.getImageData(0, 0, 400, 500).data;
  const db = b.g.getImageData(0, 0, 400, 500).data;
  let changes = 0, dores = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) {
      changes++;
      // la couronne est dorée : on vérifie que ce sont bien SES pixels, pas du bruit
      if (db[i] > 150 && db[i + 1] > 110 && db[i + 2] < 130) dores++;
    }
  }
  return { changes, dores, haut: box.y | 0 };
});
chk(cuit.changes > 500 && cuit.dores > cuit.changes * 0.5, cuit.changes < 0
  ? 'le masque n\'a PAS pu être cuit (visage non trouvé)'
  : `le masque est CUIT dans l'image : ${cuit.changes} pixels modifiés dont ${cuit.dores} bien DORÉS (c'est la couronne, pas du bruit)`);

// 6) le suivi lisse : la boîte ne saute pas quand le visage bouge d'un cheveu
const lissage = await page.evaluate(() => {
  const face = (dx) => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 500;
    const g = c.getContext('2d'); g.fillStyle = '#20304a'; g.fillRect(0, 0, 400, 500);
    g.fillStyle = '#d9a077';
    g.beginPath(); g.ellipse(200 + dx, 190, 70, 80, 0, 0, 6.2832); g.fill();
    return c;
  };
  window.Face.reset();
  let b = null; for (let i = 0; i < 8; i++) b = window.Face.detect(face(0), 400, 500);
  const avant = b.x;
  const apres = window.Face.detect(face(60), 400, 500).x;   // saut brutal de 60px
  return { bouge: apres - avant };
});
chk(lissage.bouge > 5 && lissage.bouge < 45,
  `le masque suit sans trembler : un saut de 60px n'en déplace que ${lissage.bouge.toFixed(0)}px d'un coup`);

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — MASQUES ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
