/* PREUVE (Kevin 19.10.2026 : « je suis reconnu par le domaine, pourquoi il me demande le code ? »). La page Messages (admin) demandait le code à chaque
 * nouvel onglet. Désormais : session déjà prouvée (grant du domaine) → entre toute seule ; sinon seulement l'écran du code.
 * Vrai navigateur, domaine simulé : /__admin/grant ok → pas d'écran de code ; refus → écran du code.  node tests/verify-messages-reconnu-domaine.mjs */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(ROOT, 'tools/messages/index.html'), 'utf8');
let reconnu = true;
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/__admin/grant')) { r.writeHead(reconnu ? 200 : 403, { 'content-type': 'application/json' }); return r.end(JSON.stringify(reconnu ? { ok: true, grant: 'g' } : { ok: false })); }
  if (q.url.startsWith('/__admin/fbtoken')) { r.writeHead(403, { 'content-type': 'application/json' }); return r.end('{}'); }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html);
});
await new Promise((r) => srv.listen(8797, r));
const nav = await chromium.launch(); let fails = 0; const rec = (c, m) => { if (!c) fails++; console.log((c ? 'OK ' : 'FAIL ') + m); };
async function ecranCode(h) {
  html = h; const ctx = await nav.newContext(); await ctx.route(/^https:\/\/(?!127)/, (r) => r.abort()); const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8797/', { waitUntil: 'load' }); await p.waitForTimeout(900);
  const visible = await p.evaluate(() => { const g = document.getElementById('gate'); return !!g && getComputedStyle(g).display !== 'none'; });
  await ctx.close(); return visible;
}
const SRC = fs.readFileSync(path.join(ROOT, 'tools/messages/index.html'), 'utf8');
reconnu = true;  rec((await ecranCode(SRC)) === false, 'session du domaine reconnue → AUCUN écran de code');
reconnu = false; rec((await ecranCode(SRC)) === true, 'session non reconnue → l\'écran du code reste (la porte tient)');
reconnu = true;  rec((await ecranCode(SRC.replace(/_reconnuParLeDomaine\(\)\.then/, 'Promise.resolve(false).then'))) === true, 'sabotage (grant ignoré) → l\'écran du code revient : le test garde bien quelque chose');
await nav.close(); srv.close();
console.log(`\n${fails ? '❌' : '✅'} ${fails ? fails + ' échec(s)' : 'Messages : reconnu par le domaine, pas de code'}`); process.exit(fails ? 1 : 0);
