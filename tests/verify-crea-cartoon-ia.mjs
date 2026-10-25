/* PREUVE — Créa Studio v9.19.0 : le cartoon passe par l'IA D'ABORD, et la photo peut « vivre »
 * (Kevin 25.10.2026 : « Le rendu est vraiment dégueulasse… je voulais créer une vidéo avec la photo
 *  où la personne fait du rodéo sur le sanglier… qualité professionnelle commerciale »).
 * Avant : le Studio Cartoon appliquait un FILTRE LOCAL à la photo importée et n'appelait jamais l'IA ;
 * un style du Studio Photo = filtre local seulement ; la vidéo = poses de DANSE en coupes sèches.
 * Chromium mobile 390 px, l'app servie en local, le service IA MOQUÉ (aucun réseau, leçon #135) :
 *   1) Studio Cartoon, « partir d'une photo » → UNE demande /cartoon avec le STYLE choisi,
 *      et c'est l'image rendue par l'IA qui devient la base du dessin (pixel vérifié)
 *   2) IA en panne → version locale affichée ET annoncée comme « version rapide »
 *   3) Studio Photo, un tap sur un style → aperçu immédiat PUIS /cartoon avec ce style,
 *      la version IA remplace l'aperçu (pixel vérifié)
 *   4) Danse IA : le premier choix est « Faire vivre la photo » (mode motion, 6 instants),
 *      /frames reçoit mode=motion, et une vraie vidéo (fondu) est montée dans le téléphone
 * Lancer : node tests/verify-crea-cartoon-ia.mjs
 *          node tests/verify-crea-cartoon-ia.mjs --sabotage   (le service IA refuse tout : doit être rouge)
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import zlib from 'zlib';

const SABOTAGE = process.argv.includes('--sabotage');
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

/* Un PNG 1×1 d'une couleur donnée, fabriqué ici (aucune dépendance) : étiré sur tout le
   canvas par l'app, il colore le centre — c'est notre « image IA » reconnaissable. */
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png1x1(r, g, b) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.from([0, r, g, b]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const MAGENTA = png1x1(255, 0, 255);
const FRAMES = [png1x1(255, 0, 0), png1x1(0, 255, 0), png1x1(0, 0, 255)].map((b) => 'data:image/png;base64,' + b.toString('base64'));

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const vus = []; let iaKo = SABOTAGE;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('crea_ai_url', 'https://crea-ai.test'); localStorage.setItem('crea_sso_token', 'pass-test'); } catch (_) {} });
await ctx.route('https://crea-ai.test/**', async (route) => {
  const rq = route.request(); let body = {}; try { body = JSON.parse(rq.postData() || '{}'); } catch (_) {}
  const u = new URL(rq.url()); vus.push({ path: u.pathname, body, auth: rq.headers()['authorization'] || '' });
  if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-crea-provider,x-crea-style' };
  if (iaKo) return route.fulfill({ status: 502, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ error: 'gemini_429_credits | cf_img2img_vide' }) });
  if (u.pathname === '/cartoon') return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'image/png', 'x-crea-provider': 'gemini:test', 'x-crea-style': body.style || 'cartoon' }, cors), body: MAGENTA });
  if (u.pathname === '/frames') return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ frames: FRAMES, provider: 'gemini:test', mode: body.mode || 'dance', asked: body.n, got: 3 }) });
  return route.fulfill({ status: 404, headers: cors, body: '{}' });
});
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.fill('#gateName', 'Test Cartoon'); await page.fill('#gateCode', '123456');
await page.click('#gateGo'); await page.waitForTimeout(300);

/* une « photo » de test : un dégradé 300×400 (jamais magenta) */
const faireFichier = () => page.evaluateHandle(() => new Promise((res) => {
  const c = document.createElement('canvas'); c.width = 300; c.height = 400; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 300, 400); g.addColorStop(0, '#1e3a5f'); g.addColorStop(1, '#f0c36d'); x.fillStyle = g; x.fillRect(0, 0, 300, 400);
  x.fillStyle = '#222'; x.fillRect(90, 120, 120, 160);
  c.toBlob((b) => res(new File([b], 'photo.png', { type: 'image/png' })), 'image/png');
}));
const pixelCentre = (sel) => page.evaluate((s) => { const c = document.querySelector(s); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data; return [d[0], d[1], d[2]]; }, sel);
const magenta = (p) => !!p && p[0] > 200 && p[1] < 60 && p[2] > 200;
async function attendre(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(150); } return false; }

/* 1) Studio Cartoon : partir d'une photo → IA d'abord, avec le style */
await page.click('#bnav button[data-go="anim"]'); await page.waitForTimeout(300);
const nStyles = await page.locator('#animStyles .chip').count();
chk(nStyles >= 10, `1) écran Cartoon : galerie de ${nStyles} styles IA avant d'importer`);
await page.evaluate(() => window.Anim._setStyle('anime'));
let f = await faireFichier(); await page.evaluate((file) => window.Anim._fromImage(file), f);
const okCartoon = await attendre(async () => vus.some((v) => v.path === '/cartoon'), 8000);
const d1 = vus.find((v) => v.path === '/cartoon');
chk(okCartoon && d1 && d1.body.style === 'anime' && /^data:image\/jpeg;base64,/.test(d1.body.image || ''), `1) UNE demande /cartoon avec le style choisi (${d1 ? d1.body.style : 'aucune demande'}) et la photo`);
chk(!!d1 && /^Bearer /.test(d1.auth), '1) la demande porte le pass du compte');
const okPix = await attendre(async () => magenta(await pixelCentre('#animCanvas')), 8000);
chk(okPix, '1) l\'image dessinée par l\'IA devient la base du dessin (pixel central = image IA)');

/* 2) IA en panne → version locale, annoncée */
iaKo = true; vus.length = 0;
const txtAvant = await page.evaluate(() => document.body.innerText);
f = await faireFichier(); await page.evaluate((file) => window.Anim._fromImage(file), f);
await attendre(async () => vus.some((v) => v.path === '/cartoon'), 8000);
const okLocal = await attendre(async () => { const p = await pixelCentre('#animCanvas'); return !!p && !magenta(p); }, 8000);
chk(okLocal, '2) IA en panne → l\'image locale (filtre) est affichée, pas une image IA fantôme');
const okDit = await attendre(async () => /Version rapide|rapide \(hors IA\)|IA indisponible|réessaie/i.test(await page.evaluate(() => document.body.innerText)), 6000);
chk(okDit, '2) … et l\'app le DIT (« version rapide » / IA indisponible), au lieu de faire comme si');
iaKo = SABOTAGE; vus.length = 0;

/* 3) Studio Photo : un style = aperçu local puis version IA */
await page.click('#bnav button[data-go="photo"]'); await page.waitForTimeout(300);
f = await faireFichier(); await page.evaluate((file) => window.Photo._load(file), f);
await attendre(async () => page.evaluate(() => !document.getElementById('photoCanvas').classList.contains('hidden')), 6000);
await page.evaluate(() => window.Photo.appliqueStyle('bd'));
const okReq3 = await attendre(async () => vus.some((v) => v.path === '/cartoon' && v.body.style === 'bd'), 8000);
chk(okReq3, '3) un tap sur le style BD → demande /cartoon avec style=bd');
const okPix3 = await attendre(async () => magenta(await pixelCentre('#photoCanvas')), 10000);
chk(okPix3, '3) la version IA remplace l\'aperçu local sur la photo (pixel central = image IA)');
const etat = await page.evaluate(() => (document.getElementById('cartoonIaEtat') || {}).textContent || '');
chk(/Version IA appliquée/.test(etat), `3) l'écran dit « Version IA appliquée » (${etat.slice(0, 50)})`);

/* 4) Danse IA : « faire vivre la photo » */
await page.click('#bnav button[data-go="aivid"]'); await page.waitForTimeout(300);
const vibes = await page.evaluate(() => window.AiVid._vibes());
chk(vibes[0] && vibes[0].id === 'vivre' && vibes[0].mode === 'motion' && vibes[0].n === 6, `4) premier choix = « Faire vivre la photo » (mode ${vibes[0] && vibes[0].mode}, ${vibes[0] && vibes[0].n} instants)`);
chk(vibes.some((v) => v.id === 'vivre_cartoon' && v.style === 'cartoon'), '4) une variante « vivante en cartoon » existe');
f = await faireFichier(); await page.evaluate((file) => window.AiVid._load(file), f);
await page.waitForTimeout(400);
await page.evaluate(() => { window.AiVid._setVibe('vivre'); window.AiVid.generate(); });
const okReq4 = await attendre(async () => vus.some((v) => v.path === '/frames'), 8000);
const d4 = vus.find((v) => v.path === '/frames');
chk(okReq4 && d4 && d4.body.mode === 'motion' && d4.body.n === 6, `4) /frames reçoit mode=motion et n=6 (${d4 ? d4.body.mode + ', ' + d4.body.n : 'aucune demande'})`);
const okVid = await attendre(async () => page.evaluate(() => { const v = document.getElementById('aividVideo'); return !!v && /^blob:/.test(v.src || '') && !v.classList.contains('hidden'); }), 25000);
chk(okVid, '4) une vidéo est montée dans le téléphone à partir des instants (fondu)');
const taille = okVid ? await page.evaluate(async () => { const v = document.getElementById('aividVideo'); const b = await (await fetch(v.src)).blob(); return b.size; }) : 0;
chk(taille > 3000, `4) la vidéo pèse ${taille} octets (> 3 000)`);

chk(errs.length === 0, `aucune erreur JS (${errs.length})${errs.length ? ' : ' + errs[0] : ''}`);

await browser.close(); srv.close();
console.log('\nCréa Studio v9.19.0 — cartoon IA d\'abord + « faire vivre la photo »' + (SABOTAGE ? ' — SABOTAGE : le service IA refuse tout' : '') + '\n');
R.ok.forEach((m) => console.log('  ✅ ' + m)); R.ko.forEach((m) => console.log('  ❌ ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===` + (SABOTAGE ? ' (attendu : rouge)' : ''));
if (SABOTAGE) process.exit(R.ko.length >= 4 ? 0 : 1);
process.exit(R.ko.length ? 1 : 0);
