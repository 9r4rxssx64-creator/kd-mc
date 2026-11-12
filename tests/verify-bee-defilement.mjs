/* GARDE — BEE SE REPLACE APRÈS UN DÉFILEMENT (pont 2344, 12.11 : « le cadre de Bee recouvre un bouton de CMCteams une fois la page défilée »).
 * Kevin 6.11 : l'abeille ne cache jamais rien ; l'évitement vit DANS l'élément flottant. Cas mesuré par le robot Servi sur iPhone 13 (390×664) :
 * un bouton sous la barre du bas au repos arrive, après un défilement, juste sous le cadre de Bee.
 * On prouve, dans Chromium : après le défilement, le cadre s'écarte du bouton en moins de 700 ms (et non 700 ms + attente de 4 s).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PARTOUT_JS, CADRE_HTML, CADRE_CSP, PARTOUT_TAG } from '../services/kdmc-router/bee-partout.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'self'";
const page0 = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>CMC</title></head><body><h1>CMC</h1>${PARTOUT_TAG}</body></html>`;
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  const J = (o, st = 200) => { r.writeHead(st, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
  if (u === '/') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(page0); }
  if (u === '/__javis/partout.js') { r.setHeader('content-type', 'text/javascript'); return r.end(PARTOUT_JS); }
  if (u === '/__javis/cadre') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CADRE_CSP }); return r.end(CADRE_HTML); }
  if (u === '/__javis/qui') return J({ ok: true });
  if (u === '/__sso/whoami') return J({ ok: true, uid: 'kdmc_admin', name: 'Kevin', verified: true, admin: true });
  if (u === '/__javis/moi') return J({ ok: false, reason: 'planning_absent' });
  r.statusCode = 404; r.end();
}).listen(0, '127.0.0.1');
await new Promise((o) => srv.on('listening', o));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await nav.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 664 }, deviceScaleFactor: 1 });
for (const [hote, dossier] of [['javis.kd-mc.com', 'javis'], ['lingua.kd-mc.com', 'lingua']]) {
  await ctx.route(`https://${hote}/**`, (rt) => {
    const f = path.join(ROOT, dossier, new URL(rt.request().url()).pathname.replace(/^\//, ''));
    if (!fs.existsSync(f) || f.endsWith('.mp4')) return rt.fulfill({ status: 404, body: '' });
    rt.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
}
await ctx.route('https://api.open-meteo.com/**', (rt) => rt.fulfill({ status: 200, body: '{}' }));
await ctx.addCookies([{ name: 'kdmc_k', value: '1', url: BASE }]);
const page = await ctx.newPage();
const err = [];
page.on('pageerror', (e) => err.push(e.message));
await page.goto(BASE + '/');
await page.waitForFunction(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); return f && getComputedStyle(f).display === 'block'; }, null, { timeout: 20000 }).catch(() => {});
const etat = () => page.evaluate(() => {
  const f = document.querySelector('iframe[src="/__javis/cadre"]'); const e = document.getElementById('x');
  if (!f) return null; const a = f.getBoundingClientRect(); const b = e ? e.getBoundingClientRect() : null;
  const w = b ? Math.min(a.right, b.right) - Math.max(a.left, b.left) : 0, h = b ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : 0;
  /* gêné = le centre du bouton est sous le cadre, ou plus du cinquième du bouton (la règle du routeur) */
  const cx = b ? (b.left + b.right) / 2 : 0, cy = b ? (b.top + b.bottom) / 2 : 0;
  const ov = !!b && w > 2 && h > 2 && ((cx > a.left && cx < a.right && cy > a.top && cy < a.bottom) || w * h > 0.2 * b.width * b.height);
  return { d: getComputedStyle(f).display, f: [Math.round(a.left), Math.round(a.top)], b: b && [Math.round(b.left), Math.round(b.top)], ov, sy: Math.round(scrollY) };
});
console.log('Bee et le défilement : un bouton arrive sous son cadre');
console.log('  départ : ' + JSON.stringify(await etat()));
await page.evaluate(() => { document.body.style.margin = '0'; document.body.style.height = '2400px'; }); /* via le script : la CSP de l'app interdit le style en ligne */
await dors(9500); /* la pose initiale de Bee (replacer à 0/1.2/3.5/8 s) est finie */
await page.evaluate(() => {
  const f = document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect();
  const e = document.createElement('button'); e.id = 'x'; e.textContent = 'Valider';
  e.style.cssText = 'position:absolute;width:87px;height:44px;left:' + Math.round(f.left - 10) + 'px;top:' + Math.round(f.top + 20 + 314) + 'px';
  document.body.appendChild(e);
});
await dors(1500);
const repos = await etat();
console.log('  au repos : ' + JSON.stringify(repos));
/* le bouton (à 818 px de la page) arrive à 500 px de l'écran, pile sous le cadre posé à ~484 px : comme le cas mesuré par le robot Servi */
await page.evaluate(() => { const b = document.getElementById('x').getBoundingClientRect(); window.scrollTo(0, Math.round(b.top + scrollY - 500)); });
const t0 = Date.now(); const mes = {};
for (const t of [0, 250, 650, 1200]) { const w = t - (Date.now() - t0); if (w > 0) await dors(w); mes[t] = await etat(); console.log(`  +${t} ms : ${JSON.stringify(mes[t])}`); }
chk(!repos.ov, 'au repos, le bouton (hors écran) n\'est pas sous le cadre');
chk(mes[0] && mes[0].sy > 250, 'la page a bien défilé (' + (mes[0] && mes[0].sy) + ' px)');
chk(mes[0] && mes[0].ov, 'à l\'instant du défilement, le bouton est bien sous le cadre (le cas à réparer)');
chk(!mes[650].ov, 'moins de 650 ms après le défilement, le cadre s\'est écarté du bouton');
chk(!mes[1200].ov, 'et il reste écarté à 1,2 s');
chk(err.length === 0, 'aucune erreur JavaScript' + (err[0] ? ' — ' + err[0].slice(0, 100) : ''));
await nav.close(); srv.close();
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
