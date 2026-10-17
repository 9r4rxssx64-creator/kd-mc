/* L'ENTRAÎNEMENT EST OUVERT À TOUS (Kevin 17.10.2026 : « Ouvre l'entraînement pour tous »).
   Sans code, sans compte, sans réseau : les 28 exercices sont cliquables, aucun cadenas, plus de bloc « La suite ».
   Sabotage intégré : avec l'ouverture générale coupée, ce contrôle doit devenir ROUGE (sinon il ne garde rien). */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
let sabotage = false;
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, 'shops/croupier', p.replace(/^\/+/, ''));
  if (!f.startsWith(path.join(ROOT, 'shops/croupier')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  r.end(sabotage && f.endsWith('entrainement.js') ? fs.readFileSync(f, 'utf8').replace('var OUVERT_A_TOUS = true;', 'var OUVERT_A_TOUS = false;') : fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8796, r));
const nav = await chromium.launch();

async function mesure() {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https:\/\//, (r) => r.abort());   // aucun réseau : ni code ni vente
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8796/entrainement.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__ENTRAINEUR, { timeout: 10000 });
  const m = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-mode]')];
    return {
      total: b.length,
      fermes: b.filter((x) => x.disabled).length,
      cadenas: [...document.querySelectorAll('.cadenas')].filter((c) => !c.hidden && c.offsetParent).length,
      suite: (() => { const s = document.getElementById('la-suite'); return !!s && !s.hidden && s.offsetParent !== null; })(),
    };
  });
  await ctx.close();
  return m;
}
const reel = await mesure();
sabotage = true;
const casse = await mesure();
await nav.close(); srv.close();

const echecs = [];
const v = (nom, c, d = '') => { if (!c) echecs.push(nom + (d ? ' — ' + d : '')); else console.log('  ✅ ' + nom); };
v('exercices présents à l\'écran', reel.total >= 28, JSON.stringify(reel));
v('sans code ni réseau : aucun exercice fermé', reel.fermes === 0, JSON.stringify(reel));
v('aucun cadenas visible', reel.cadenas === 0, JSON.stringify(reel));
v('le bloc « La suite » (verrous) n\'est plus affiché', reel.suite === false, JSON.stringify(reel));
v('sabotage : ouverture générale coupée → des exercices se referment (le contrôle garde bien quelque chose)', casse.fermes > 0 && casse.suite === true, JSON.stringify(casse));
console.log(`\n${echecs.length ? '❌' : '✅'} croupier-ouvert : ${echecs.length ? echecs.join('\n') : 'ok'}`);
process.exit(echecs.length ? 1 : 0);
