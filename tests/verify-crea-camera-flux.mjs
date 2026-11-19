/* PREUVE — Créa Studio « Caméra » : le flux s'affiche vraiment, et « Prêt ✅ » ne ment plus (v9.22.16).
 * Cas réel (pc-config, Chrome du Lenovo, 19.11.2026) : la caméra marchait en direct, mais « Démarrer la caméra »
 * laissait la vidéo à 0×0 (readyState 0) avec « Prêt ✅ » affiché ; et sur ordinateur le cadre faisait 1 707 px de haut.
 * Chromium DESKTOP, fausse caméra, SANS le réglage qui autorise la lecture automatique (celui qui cachait le défaut).
 * On prouve :
 *   1) sur un écran d'ordinateur 1280×720 le cadre de la caméra tient dans l'écran (≤ 80 % de la hauteur) ;
 *   2) après « Démarrer » : une vraie image (largeur > 0, readyState ≥ 2, en lecture) ET « Prêt ✅ » ;
 *   3) flux qui n'envoie JAMAIS d'image au 1er essai : le Studio ne dit PAS « Prêt ✅ », réessaie plus simple, puis dit « Prêt » avec une image ;
 *   4) caméra qui n'envoie jamais d'image : message honnête (« n'envoie pas d'image »), jamais « Prêt ✅ » ;
 *   5) micro absent (la demande avec audio échoue) : la caméra démarre quand même, sans micro ;
 *   6) permission refusée : message de refus, aucun nouvel essai.
 * CREA_DIR=<ancien dossier> : sabotage (doit devenir rouge sur v9.22.15).
 * Lancer : node tests/verify-crea-camera-flux.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = process.env.CREA_DIR ? path.resolve(process.env.CREA_DIR) : path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8262;
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
// SANS --autoplay-policy : un vrai Chrome n'a pas ce réglage
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

async function ouvrir(initScript) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  if (initScript) await page.addInitScript(initScript);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.fill('#gateName', 'Test Camera'); await page.fill('#gateCode', '123456');
  await page.click('#gateGo'); await page.waitForTimeout(400);
  await page.click('#bnav button[data-go="cam"]'); await page.waitForTimeout(300);
  return { ctx, page, errs };
}
const etat = page => page.evaluate(() => {
  const e = document.getElementById('camView');
  return { vw: e.videoWidth, rs: e.readyState, paused: e.paused, hint: (document.getElementById('camHint') || {}).textContent || '' };
});

// 1 + 2) écran d'ordinateur, vraie fausse caméra
{
  const { ctx, page, errs } = await ouvrir();
  const h = await page.evaluate(() => document.getElementById('camWrap').getBoundingClientRect().height);
  chk(h <= 720 * 0.8, `1) le cadre de la caméra tient dans l'écran d'ordinateur (hauteur ${Math.round(h)} px ≤ 576)`);
  await page.click('#camStart'); await page.waitForTimeout(3500);
  const e = await etat(page);
  chk(e.vw > 0 && e.rs >= 2 && !e.paused, `2) après « Démarrer » une vraie image arrive (largeur ${e.vw}, readyState ${e.rs}, lecture ${!e.paused})`);
  chk(/Prêt ✅/.test(e.hint), `2b) « Prêt ✅ » affiché avec l'image (« ${e.hint.slice(0, 40)} »)`);
  chk(errs.length === 0, `2c) aucune erreur JavaScript (${errs.length})`);
  await ctx.close();
}

// 3) 1er essai sans aucune image (flux vide), 2e essai normal
{
  const { ctx, page } = await ouvrir(`(() => { const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); let n = 0;
    window.__essais = []; navigator.mediaDevices.getUserMedia = c => { window.__essais.push(JSON.stringify(c)); n++; return n === 1 ? Promise.resolve(new MediaStream()) : g(c); }; })()`);
  await page.click('#camStart'); await page.waitForTimeout(1500);
  const milieu = await etat(page);
  chk(!/Prêt ✅/.test(milieu.hint), `3a) flux sans image : le Studio NE dit PAS « Prêt ✅ » (« ${milieu.hint.slice(0, 50)} »)`);
  await page.waitForTimeout(6000);
  const fin = await etat(page); const essais = await page.evaluate(() => window.__essais.length);
  chk(essais >= 2, `3b) le Studio a réessayé tout seul (${essais} demandes à la caméra)`);
  chk(fin.vw > 0 && fin.rs >= 2 && /Prêt ✅/.test(fin.hint), `3c) après le nouvel essai : image (largeur ${fin.vw}) ET « Prêt ✅ »`);
  await ctx.close();
}

// 4) caméra qui ne donne jamais d'image
{
  const { ctx, page } = await ouvrir(`navigator.mediaDevices.getUserMedia = () => Promise.resolve(new MediaStream());`);
  await page.click('#camStart'); await page.waitForTimeout(12000);
  const e = await etat(page);
  chk(!/Prêt ✅/.test(e.hint) && /n'envoie pas d'image/.test(e.hint), `4) caméra muette : message honnête, jamais « Prêt ✅ » (« ${e.hint.slice(0, 60)} »)`);
  await ctx.close();
}

// 5) micro absent : la demande avec audio échoue, sans audio ça marche
{
  const { ctx, page } = await ouvrir(`(() => { const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => (c && c.audio) ? Promise.reject(new DOMException('no mic', 'NotFoundError')) : g(c); })()`);
  await page.click('#camStart'); await page.waitForTimeout(4000);
  const e = await etat(page);
  chk(e.vw > 0 && /Prêt ✅/.test(e.hint), `5) micro absent : la caméra démarre quand même (largeur ${e.vw}, « ${e.hint.slice(0, 30)} »)`);
  await ctx.close();
}

// 6) permission refusée : un seul essai, message de refus
{
  const { ctx, page } = await ouvrir(`window.__n = 0; navigator.mediaDevices.getUserMedia = () => { window.__n++; return Promise.reject(new DOMException('no', 'NotAllowedError')); };`);
  await page.click('#camStart'); await page.waitForTimeout(1500);
  const e = await etat(page); const n = await page.evaluate(() => window.__n);
  chk(/refusé/.test(e.hint) && n === 1, `6) caméra refusée : message de refus, un seul essai (${n})`);
  await ctx.close();
}

await browser.close(); srv.close();
for (const m of R.ok) console.log('  ✓', m);
for (const m of R.ko) console.log('  ✗', m);
console.log(`\n${R.ok.length} OK / ${R.ko.length} FAIL`);
process.exit(R.ko.length ? 1 : 0);
