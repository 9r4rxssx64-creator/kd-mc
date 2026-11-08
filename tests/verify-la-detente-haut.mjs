/* PREUVE EN VRAI NAVIGATEUR — La Détente : le premier texte de la page ne passe pas sous la pastille « ← Portail » du domaine
 * (Servi 8.11, mission 2108 : « 1er texte span @4 sous pastille OUI », iPhone 13 portrait). Écran 390×664, réseau extérieur coupé,
 * pastille simulée : fixe, haut-gauche, 52 px de haut (mesure du Servi). LD_ANCIEN=<ancien index.html> : doit être ROUGE.
 * node tests/verify-la-detente-haut.mjs */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(ROOT + '/package.json')('playwright');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const ANCIEN = process.env.LD_ANCIEN ? path.resolve(process.env.LD_ANCIEN) : '';
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  let f = path.join(ROOT, p); if (ANCIEN && p === '/shops/la-detente/index.html') f = ANCIEN;
  if (!(f === ANCIEN || f.startsWith(ROOT)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise((r) => srv.listen(0, r));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };
const b = await chromium.launch();
try {
  const c = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
  await c.route(/^https?:\/\//, (r) => /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(r.request().url()) ? r.continue() : r.abort());
  const pg = await c.newPage();
  await pg.goto('http://localhost:' + srv.address().port + '/shops/la-detente/', { waitUntil: 'domcontentloaded' });
  await pg.waitForSelector('.promobar', { timeout: 15000 });
  const m = await pg.evaluate(() => {
    const bar = document.querySelector('.promobar'); const rg = document.createRange(); rg.selectNodeContents(bar);
    const t = Array.from(rg.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    const haut = Math.min(...t.map((r) => r.top));
    return { n: t.length, haut: Math.round(haut), hauteurBande: Math.round(bar.getBoundingClientRect().height) };
  });
  console.log('  mesure :', JSON.stringify(m));
  ok(m.n > 0, 'le texte de la bande promo est dessiné');
  ok(m.haut >= 52, 'le texte de la bande commence sous la pastille « ← Portail » (haut du texte à ' + m.haut + ' px, pastille jusqu\'à 52 px)');
} catch (e) { fails.push('exception : ' + (e && e.message)); console.log('  ❌ ' + (e && e.stack)); }
await b.close(); srv.close();
console.log(`\n${pass} ok / ${fails.length} échec(s)`); process.exit(fails.length ? 1 : 0);
