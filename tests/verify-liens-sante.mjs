/* GARDE — la page « Liens » (kd-mc.com/liens/) montre l'état des services EN DIRECT (25.10.2026).
 * Avant : elle lisait workers-status.json, figé au 14.08 et non servi → aucune pastille, rien d'affiché (même cause que
 * l'admin, pont 970). Maintenant : résumé « 🟢 N/N services en ligne » lu sur la surveillance kdmc-uptime (nombres seulement).
 *  L1. sous la carte santé : « 34/34 services en ligne » (surveillance simulée, comme la vraie sans clé).
 *  L2. une panne simulée → « 🔴 33/34 … · 1 en panne ».
 *  L3. surveillance injoignable → aucune erreur JavaScript, aucun message trompeur.
 * SABOTAGE : `LIENS_DIR=<ancien dossier liens>` → L1, L2 rouges.
 * Lancer : npm run test:liens-sante
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const RACINE = new URL('../kdmc-home/', import.meta.url).pathname;
const LIENS = process.env.LIENS_DIR || join(RACINE, 'liens');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/kdmc-sso.js') { res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end("window.kdmcSSO={whoami:function(){return Promise.resolve({uid:'kdmc_admin',name:'Kevin',admin:true,verified:true});},token:function(){return '';},consumeHashToken:function(){}};"); }
  try {
    const f = url.startsWith('/liens/') ? join(LIENS, normalize(url.slice('/liens/'.length) || 'index.html')) : join(RACINE, normalize(url));
    const buf = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'text/html; charset=utf-8' }); res.end(buf);
  } catch { res.writeHead(404).end('non trouvé'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

let ko = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };
const b = await chromium.launch({ headless: true });

async function essai(reponse) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  const erreurs = []; p.on('pageerror', e => erreurs.push(String(e)));
  await p.route('https://kdmc-uptime.9r4rxssx64.workers.dev/**', r => reponse ? r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reponse) }) : r.abort());
  await p.route('https://kdmc-balances.9r4rxssx64.workers.dev/**', r => r.abort());
  await p.goto(BASE + '/liens/');
  await p.waitForTimeout(1500);
  const txt = await p.evaluate(() => { const e = document.querySelector('.hsum'); return e ? e.textContent : ''; });
  await p.close();
  return { txt, erreurs };
}

const ts = new Date(Date.now() - 30 * 60000).toISOString();
const a = await essai({ ok: true, ts, total: 34, en_ligne: 34, en_panne: 0 });
ok('L1. résumé en direct sous la carte santé : 34/34', /🟢 34\/34 services en ligne/.test(a.txt), a.txt || '(rien)');
const c = await essai({ ok: true, ts, total: 34, en_ligne: 33, en_panne: 1 });
ok('L2. une panne se voit : 🔴 33/34 · 1 en panne', /🔴 33\/34 services en ligne · 1 en panne/.test(c.txt), c.txt || '(rien)');
const d = await essai(null);
ok('L3. surveillance injoignable : aucune erreur JS, rien de trompeur', d.erreurs.length === 0 && !/en ligne/.test(d.txt), d.erreurs.join(' | ') || d.txt || '(rien)');

await b.close(); srv.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Page Liens : état des services en direct'));
process.exit(ko ? 1 : 0);
