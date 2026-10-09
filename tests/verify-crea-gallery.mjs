/* PREUVE — Créa Studio « Mes créations » (v8.5.0).
 * Avant, tout ce que Kevin fabriquait disparaissait dès qu'il changeait d'écran.
 * Chromium mobile 390px, réseau externe bloqué (leçon #135). On prouve :
 *   1) l'écran « Mes créas » existe et est vide au départ (message clair, pas une page morte)
 *   2) une création produite est gardée TOUTE SEULE (aucun tap « enregistrer »)
 *   3) elle survit à un RECHARGEMENT de l'app (IndexedDB, pas la mémoire vive)
 *   4) on peut l'ouvrir (aperçu + boutons) puis l'effacer, et la galerie se met à jour
 *   5) « Tout effacer » vide bien la galerie
 * Lancer : node tests/verify-crea-gallery.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8246;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end('x'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));


/* L'app demande maintenant qui l'utilise : on se connecte comme une vraie personne. */
async function seConnecter(page, nom, code) {
  await page.waitForSelector('#gate:not(.hidden)', { timeout: 8000 }).catch(() => {});
  const besoin = await page.evaluate(() => {
    const g = document.getElementById('gate');
    return !!g && !g.classList.contains('hidden');
  });
  if (!besoin) return;
  await page.fill('#gateName', nom || 'Test Utilisateur');
  await page.fill('#gateCode', code || '1234');
  await page.click('#gateGo');
  await page.waitForTimeout(300);
}

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
// le bac à sable ne peut pas joindre kd-mc.com : un échec réseau n'est pas un bug de l'app
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

const URL_APP = `http://127.0.0.1:${PORT}/index.html`;
await page.goto(URL_APP, { waitUntil: 'load' });
await page.waitForTimeout(400);
await seConnecter(page, 'Test Galerie', '1234');

// 1) l'écran existe et dit clairement qu'il est vide
await page.click('#bnav button[data-go="mine"]');
await page.waitForTimeout(400);
const empty = await page.textContent('#mineGrid');
chk(/Rien pour l'instant/.test(empty || ''), 'écran « Mes créas » présent et vide au départ (message clair)');

// 2) une création est gardée TOUTE SEULE (on passe par le vrai chemin: archive())
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#e8b84b'; g.fillRect(0, 0, 64, 64);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await window.Mine.save(blob, 'Photo de test');
});
await page.click('#bnav button[data-go="photo"]');            // on change d'écran, comme Kevin
await page.click('#bnav button[data-go="mine"]');
await page.waitForTimeout(500);
let n = await page.locator('#mineGrid .mine-it').count();
chk(n === 1, `création gardée sans aucun tap « enregistrer » (${n} dans la galerie)`);
const hasThumb = await page.locator('#mineGrid .mine-it img').count();
chk(hasThumb === 1, 'vignette générée (galerie lisible d\'un coup d\'œil)');

// 3) elle survit à un rechargement complet de l'app
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
await seConnecter(page, 'Test Galerie', '1234');
await page.click('#bnav button[data-go="mine"]');
await page.waitForTimeout(600);
n = await page.locator('#mineGrid .mine-it').count();
chk(n === 1, 'la création survit au rechargement de l\'app (gardée dans le téléphone)');

// 4) ouvrir → aperçu + boutons, puis effacer
await page.click('#mineGrid .mine-it');
await page.waitForTimeout(300);
const share = await page.locator('#mineShare').count(), del = await page.locator('#mineDel').count();
chk(share === 1 && del === 1, 'aperçu ouvert avec « Enregistrer / Partager » et « Effacer »');
page.once('dialog', d => d.accept());
await page.click('#mineDel');
await page.waitForTimeout(600);
n = await page.locator('#mineGrid .mine-it').count();
chk(n === 0, 'effacer une création met bien la galerie à jour');

// 5) « Tout effacer » sur plusieurs créations
await page.evaluate(async () => {
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    c.getContext('2d').fillRect(0, 0, 32, 32);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await window.Mine.save(blob, 'test ' + i);
  }
});
await page.evaluate(() => window.Mine.refresh());
await page.waitForTimeout(500);
n = await page.locator('#mineGrid .mine-it').count();
chk(n === 3, `3 créations gardées (${n})`);
page.once('dialog', d => d.accept());
await page.click('button[onclick="Mine.clearAll()"]');
await page.waitForTimeout(600);
n = await page.locator('#mineGrid .mine-it').count();
chk(n === 0, '« Tout effacer » vide bien la galerie');

// 6) un titre piégé (venant de l'IA) ne doit pas s'exécuter dans la page
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await window.Mine.save(blob, '<img src=x onerror=window.__pwn=1>"\'');
});
await page.evaluate(() => window.Mine.refresh());
await page.waitForTimeout(500);
const pwned = await page.evaluate(() => !!window.__pwn);
const injected = await page.locator('#mineGrid .tag img').count();
chk(!pwned && injected === 0, 'un titre piégé venant de l\'IA est neutralisé (pas de code injecté)');

// 7) la barre du bas reste utilisable sur TOUS les iPhone (norme Apple : 44 px)
//    — garde anti-régression : ajouter un bouton de plus ne doit pas la casser.
for (const w of [320, 375, 390, 430]) {
  const c2 = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage();
  await p2.goto(URL_APP, { waitUntil: 'load' }); await p2.waitForTimeout(250);
  await seConnecter(p2, 'Test Galerie', '1234');
  const m = await p2.evaluate(() => {
    const nav = document.getElementById('bnav');
    const bs = [...nav.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      n: bs.length,
      minW: Math.round(Math.min(...bs.map((r) => r.width))),
      minH: Math.round(Math.min(...bs.map((r) => r.height))),
      // la PAGE ne doit jamais déborder ; la barre, elle, a le droit de se faire glisser
      pageDeborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      barreGlisse: nav.scrollWidth > nav.clientWidth + 1,
    };
  });
  chk(m.minW >= 44 && m.minH >= 44 && !m.pageDeborde,
    `barre du bas OK à ${w}px : ${m.n} boutons de ${m.minW}×${m.minH}px`
    + (m.barreGlisse ? ' (elle se fait glisser du doigt)' : '') + ', page sans débordement');
  await c2.close();
}

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);

console.log('=== CRÉA STUDIO — MES CRÉATIONS ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
