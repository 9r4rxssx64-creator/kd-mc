/* PREUVE — Créa Studio « Caméra » + import multiformat (v9.1.0).
 * Chromium mobile 390px avec une FAUSSE caméra (--use-fake-device-for-media-stream)
 * → on filme vraiment, sans matériel. Réseau externe bloqué (leçon #135).
 * On prouve :
 *   1) l'écran Caméra existe, avec ses réglages (avant/arrière, lampe, minuteur, grille, miroir)
 *   2) les filtres sont RÉELLEMENT différents (pas 16 noms pour la même image)
 *   3) la caméra démarre et une photo est prise ET rangée dans « Mes créas »
 *   4) le filtre choisi est CUIT dans la photo (ce qu'on voit = ce qu'on obtient)
 *   5) filmer produit une vraie vidéo, elle aussi rangée
 *   6) quitter l'écran ÉTEINT la caméra (batterie + vie privée)
 *   7) l'import reconnaît photo / vidéo / son, refuse proprement un fichier trop
 *      lourd et un format inconnu (message clair, jamais un échec muet)
 *   8) une photo trop grande est allégée automatiquement
 * Lancer : node tests/verify-crea-camera.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8255;
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
// on se connecte comme une vraie personne
await page.fill('#gateName', 'Test Camera'); await page.fill('#gateCode', '1234');
await page.click('#gateGo'); await page.waitForTimeout(300);

// 1) l'écran et ses réglages
await page.click('#bnav button[data-go="cam"]'); await page.waitForTimeout(300);
const reglages = await page.evaluate(() => ['camSwap', 'camTorch', 'camTimer', 'camGridBtn', 'camMirror']
  .filter(id => !!document.getElementById(id)).length);
chk(reglages === 5, `écran Caméra avec ses 5 réglages (avant/arrière, lampe, minuteur, grille, miroir)`);
const nFx = await page.locator('#camFilters .chip').count();
chk(nFx >= 12, `${nFx} filtres proposés`);

// 2) les filtres sont vraiment différents (aucun doublon d'effet)
const fxUniques = await page.evaluate(() => {
  const c = window.Cam.filters.map(f => f.css);
  return { total: c.length, uniques: new Set(c).size };
});
chk(fxUniques.uniques === fxUniques.total,
  `les ${fxUniques.total} filtres donnent ${fxUniques.uniques} rendus DIFFÉRENTS (aucun doublon)`);

// 3) la caméra démarre et prend une photo
await page.click('#camStart');
await page.waitForFunction(() => {
  const v = document.getElementById('camView');
  return v && v.videoWidth > 0;
}, { timeout: 15000 }).catch(() => {});
const live = await page.evaluate(() => (document.getElementById('camView') || {}).videoWidth || 0);
chk(live > 0, `la caméra est allumée et affiche l'image (${live}px de large)`);

const avant = await page.evaluate(async () => (await window.Mine.list()).length);
await page.evaluate(() => window.Cam.shoot());
await page.waitForTimeout(900);
const apres = await page.evaluate(async () => (await window.Mine.list()).length);
chk(apres === avant + 1, `la photo est prise ET rangée dans « Mes créas » (${avant} → ${apres})`);

// 4) le filtre est cuit dans l'image : noir & blanc ⇒ pixels gris
const fermer = () => page.evaluate(() => { try { closeSheet(); } catch (e) {} });
await fermer();
const couleur = await page.evaluate(async (fx) => {
  window.Cam.setFx(fx);
  await new Promise(r => setTimeout(r, 200));
  window.Cam.shoot();
  await new Promise(r => setTimeout(r, 700));
  const l = await window.Mine.list();
  const b = l[0].blob;
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, bmp.width, bmp.height).data;
  let ecart = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 997) {
    ecart += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); n++;
  }
  return { ecartMoyen: n ? ecart / n : -1 };
}, 'nb');
chk(couleur.ecartMoyen >= 0 && couleur.ecartMoyen < 12,
  `le filtre est CUIT dans la photo (noir & blanc → écart de couleur ${couleur.ecartMoyen.toFixed(1)}, proche de 0)`);

await fermer();
// 5) filmer produit une vraie vidéo
const avantV = await page.evaluate(async () => (await window.Mine.list()).length);
// la caméra doit VRAIMENT donner des images avant de filmer, sinon on
// enregistre du vide (c'est ce qui rendait ce test capricieux, pas l'app)
await page.waitForFunction(() => {
  const el = document.getElementById('camView');
  return el && el.srcObject && el.videoWidth > 0 && el.readyState >= 2;
}, null, { timeout: 15000 });
// 10.09 — rouge intermittent (« galerie 2 → 2 ») sans aucune cause lisible : on
// journalise l'enregistreur (démarrage, morceaux, arrêt, ERREUR) pour que le
// prochain rouge dise POURQUOI au lieu de « pas de vidéo ».
await page.evaluate(() => {
  window.__mr = [];
  const S = MediaRecorder.prototype.start;
  MediaRecorder.prototype.start = function () {
    const r = this;
    r.addEventListener('error', e => __mr.push('ERREUR ' + (e.error && (e.error.name + ' ' + e.error.message))));
    r.addEventListener('stop', () => __mr.push('stop'));
    r.addEventListener('dataavailable', e => __mr.push('data ' + e.data.size));
    __mr.push('start ' + r.mimeType + ' ' + r.stream.getTracks().map(t => t.kind + ':' + t.readyState).join(','));
    window.__lastRec = r;
    return S.apply(this, arguments);
  };
});
await page.evaluate(() => window.Cam.startVideo());
await page.waitForTimeout(1600);
await page.evaluate(() => window.Cam.stopVideo());
// on attend que la vidéo soit VRAIMENT écrite (elle l'est en tâche de fond) —
// une attente fixe rendait ce test instable sans que l'app ait le moindre défaut ;
// 30 s : sur une machine chargée (barrière complète), l'encodeur peut être lent
await page.waitForFunction(async (n) => (await window.Mine.list()).length > n, avantV, { timeout: 30000 })
  .catch(() => {});
const vid = await page.evaluate(async () => {
  const l = await window.Mine.list();
  const v = l.find(o => o.kind === 'video') || l[0];
  return { n: l.length, kind: v.kind, size: v.blob.size, mr: window.__mr.join(' | '),
    hint: ((document.querySelector('#cam .hint, #camHint') || {}).textContent || '').slice(0, 90) };
});
chk(vid.n > avantV && vid.kind === 'video' && vid.size > 3000,
  `filmer produit une vraie vidéo rangée (${Math.round(vid.size / 1024)} Ko, galerie ${avantV} → ${vid.n})`
  + (vid.n > avantV ? '' : ` — DIAGNOSTIC enregistreur : [${vid.mr}] · message affiché : « ${vid.hint} »`));

// 5b) v9.18.2 — une ERREUR d'encodeur ne rend plus le bouton muet pour toujours :
//     la cause est dite, le bouton est libéré, et ce qui était déjà filmé est rangé.
const lireHint = () => page.evaluate(() => (document.querySelector('#cam .hint, #camHint') || {}).textContent || '');
const simulerErreur = (nom, msg) => page.evaluate(({ nom, msg }) => {
  const ev = new Event('error'); ev.error = new DOMException(msg, nom); window.__lastRec.dispatchEvent(ev);
}, { nom, msg });
await page.evaluate(() => window.Cam.startVideo()); await page.waitForTimeout(50);
await simulerErreur('UnknownError', 'codec cassé (simulé)'); await page.waitForTimeout(300);
const hintErr = await lireHint();
const boutonLibre = await page.evaluate(() => !document.getElementById('camShoot').classList.contains('rec'));
chk(/UnknownError/.test(hintErr) && /simulé/.test(hintErr) && boutonLibre,
  `erreur d'encodeur AVANT toute image → la cause est affichée (« ${hintErr.slice(0, 60)}… ») et le bouton est libéré`);
const avantR = await page.evaluate(async () => (await window.Mine.list()).length);
await page.evaluate(() => window.Cam.startVideo()); await page.waitForTimeout(1500);
await page.evaluate(() => window.Cam.stopVideo());
const reprise = await page.waitForFunction(async (n) => (await window.Mine.list()).length > n, avantR, { timeout: 30000 }).then(() => true).catch(() => false);
chk(reprise, `après l'erreur, un nouvel enregistrement marche (galerie ${avantR} → ${avantR + 1})`);
const avantQ = await page.evaluate(async () => (await window.Mine.list()).length);
await page.evaluate(() => window.Cam.startVideo()); await page.waitForTimeout(1200);
await simulerErreur('QuotaExceededError', 'disque plein (simulé)');
const sauve = await page.waitForFunction(async (n) => (await window.Mine.list()).length > n, avantQ, { timeout: 30000 }).then(() => true).catch(() => false);
const hintQ = await lireHint();
chk(sauve && /interrompu/.test(hintQ) && /QuotaExceededError/.test(hintQ),
  `erreur d'encodeur APRÈS des images → ce qui était filmé est quand même rangé, et on dit pourquoi (« ${hintQ.slice(0, 50)}… »)`);

// 6) quitter l'écran éteint la caméra
await fermer();
await page.click('#bnav button[data-go="photo"]'); await page.waitForTimeout(500);
const eteinte = await page.evaluate(() => !document.getElementById('camView').srcObject);
chk(eteinte, 'quitter l\'écran ÉTEINT la caméra (batterie + vie privée)');

// 7) import : reconnaissance des formats + refus clairs
const imports = await page.evaluate(() => {
  const F = (n, t, size) => Object.assign(new File([new Uint8Array(size || 10)], n, { type: t }), {});
  const gros = (n, t, mo) => new File([new Uint8Array(mo * 1048576)], n, { type: t });
  return {
    heic: window.Import.kind(F('IMG_1234.HEIC', '')),
    mov: window.Import.kind(F('film.MOV', '')),
    m4a: window.Import.kind(F('note.m4a', '')),
    webp: window.Import.kind(F('img.webp', 'image/webp')),
    zip: window.Import.kind(F('archive.zip', 'application/zip')),
    grosseVideo: !!window.Import.tropGros(gros('v.mp4', 'video/mp4', 300), 'video'),
    videoOk: !window.Import.tropGros(gros('v.mp4', 'video/mp4', 50), 'video'),
    grossePhoto: !!window.Import.tropGros(gros('p.jpg', 'image/jpeg', 40), 'image'),
  };
});
chk(imports.heic === 'image' && imports.mov === 'video' && imports.m4a === 'audio' && imports.webp === 'image',
  'les formats iPhone sont reconnus (HEIC, MOV, M4A, WEBP)');
chk(imports.zip === 'inconnu', 'un format non géré est identifié comme tel (message clair, pas un plantage)');
chk(imports.grosseVideo && imports.videoOk && imports.grossePhoto,
  'les fichiers trop lourds sont refusés AVANT de figer le téléphone (vidéo 300 Mo, photo 40 Mo)');

// 8) une photo trop grande est allégée
const reduc = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
  const g = c.getContext('2d'); g.fillStyle = '#3366aa'; g.fillRect(0, 0, 4000, 3000);
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  const r = await window.Import.reduire(new File([b], 'grande.jpg', { type: 'image/jpeg' }));
  return { avant: b.size, apres: r.file.size, w: r.w, h: r.h, reduit: r.reduit };
});
chk(reduc.reduit && reduc.w <= 2400 && reduc.apres < reduc.avant,
  `une photo 4000×3000 est allégée toute seule → ${reduc.w}×${reduc.h}`);

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — CAMÉRA + IMPORT ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
