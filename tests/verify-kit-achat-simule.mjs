/* Achat SIMULÉ dans la boutique Kit (Kevin 23.10.2026 : « en vue membre… abonné max… je peux acheter si je veux, comme ça on simule »).
 * Vrai Chromium, vraie page Kit servie en HTTP : (S1) vue membre de l'admin → bandeau + boutons « 🎁 Acheter (simulé) » ;
 * (S2) un toucher → la caisse /caisse/simulation reçoit le pass du domaine, AUCUN appel à la vraie caisse (intention/commande) ; le code s'affiche ;
 * (S3) visiteur normal → rien de simulé, la vraie caisse est appelée. Sabotage : ancien kit.js → S1/S2 rouges.   node tests/verify-kit-achat-simule.mjs */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
const RACINE = new URL('../shops/kit-ia/', import.meta.url).pathname;
const KITJS = process.env.KITJS || join(RACINE, 'kit.js');
let simu = true;
const srv = createServer(async (q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/__sso/whoami') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(simu ? { ok: true, admin: false, apercu: 'membre', abonnement: 'max', simulation: true } : { ok: true, admin: false })); }
  if (u === '/__sso/pass') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"ok":true,"token":"PASS-ESSAI","vue":"TICKET-VUE"}'); }
  try { const f = u === '/kit.js' ? KITJS : join(RACINE, u === '/' ? 'bureau.html' : u); const b = await readFile(f); r.writeHead(200, { 'content-type': extname(f) === '.js' ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(b); } catch { r.writeHead(404).end(); }
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const LOCAL = 'http://127.0.0.1:' + srv.address().port; const BASE = 'https://kit.kd-mc.com';
let ko = 0; const ok = (m, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c ? '' : ' → ' + d)); if (!c) ko++; };
const b = await chromium.launch();
async function essai() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
  const caisse = []; const err = []; p.on('pageerror', e => err.push(String(e)));
  await p.route('https://kdmc-vente.9r4rxssx64.workers.dev/**', rt => { const rq = rt.request(); caisse.push({ url: rq.url(), auth: rq.headers()['authorization'] || '', vue: rq.headers()['x-kdmc-vue'] || '' });
    const chemin = new URL(rq.url()).pathname;
    rt.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type' }, body: chemin === '/caisse/simulation' ? '{"ok":true,"simulation":true,"code":"SIMU-1234","montant":0}' : '{"ok":false}' }); });
  await p.route('https://kit.kd-mc.com/**', async rt => { const u = new URL(rt.request().url()); const rep = await fetch(LOCAL + u.pathname); rt.fulfill({ status: rep.status, headers: { 'content-type': rep.headers.get('content-type') || 'text/html' }, body: Buffer.from(await rep.arrayBuffer()) }); });
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  return { p, ctx, caisse, err };
}
{ const { p, ctx, caisse, err } = await essai();
  const bandeau = await p.locator('[data-simulation]').count();
  const btn = p.locator('[data-produit][data-caisse]').first();
  ok('S1. vue membre : bandeau « abonné au maximum » + bouton « 🎁 Acheter (simulé) »', bandeau === 1 && (await btn.textContent()).includes('simulé'), bandeau + ' / ' + await btn.textContent());
  await btn.click(); await p.waitForTimeout(800);
  const appelSim = caisse.find(c => c.url.endsWith('/caisse/simulation'));
  const appelVrai = caisse.filter(c => /\/caisse\/(intention|commande)/.test(c.url)).length;
  const avis = await p.evaluate(() => Array.from(document.querySelectorAll('[data-caisse-avis]')).map(e => e.textContent).join(' '));
  ok('S2. un toucher → caisse simulée avec le pass du domaine, 0 appel à la vraie caisse, code affiché', !!appelSim && appelSim.auth === 'Bearer PASS-ESSAI' && appelSim.vue === 'TICKET-VUE' && appelVrai === 0 && avis.includes('SIMU-1234'), JSON.stringify({ appelSim, appelVrai, avis: avis.slice(0, 80) }));
  ok('aucune erreur JavaScript (vue membre)', err.length === 0, err.join(' | '));
  await ctx.close(); }
simu = false;
{ const { p, ctx, caisse } = await essai();
  ok('S3. visiteur normal : ni bandeau ni « simulé »', (await p.locator('[data-simulation]').count()) === 0 && !(await p.locator('[data-produit][data-caisse]').first().textContent()).includes('simulé'));
  ok('S3. visiteur normal : jamais d\'appel à la caisse simulée', !caisse.some(c => c.url.endsWith('/caisse/simulation')));
  await ctx.close(); }
await b.close(); srv.close();
console.log(ko ? '❌ ' + ko + ' échec(s)' : '✅ achat simulé : seulement en vue membre, rien de payé'); process.exit(ko ? 1 : 0);
