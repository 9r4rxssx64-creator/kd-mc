/* GARDE EN VRAI NAVIGATEUR — Bee se met à jour TOUTE SEULE, partout dans le domaine, sans qu'on la touche.
 *
 * Retour de Kevin (29.10) : « Javis n'est pas à jour de partout sur l'ordinateur, il est toujours en 26. Vérifie les mises à jour en temps réel, qu'elles soient
 * automatiques et autonomes. Et vraiment de partout dans tout le domaine : chaque application, chaque page, chaque fenêtre, chaque image, chaque vue. »
 *
 * Cause MESURÉE : dans les autres apps du domaine Bee vit dans un CADRE (/__javis/cadre) dont le widget vient de javis.kd-mc.com. Pour savoir si une version plus
 * récente est servie, elle relisait son propre fichier par fetch() : depuis une AUTRE adresse, sans cookie (401) et sans CORS → réponse vide → elle ne voyait
 * JAMAIS de nouvelle version. Et même vue, la mise à jour automatique n'existait que dans l'app installée (JAVIS_MODE=app).
 *
 * Rejoué ICI avec deux adresses différentes (deux ports = deux origines) :
 *   A. cadre, chat fermé, version plus récente servie → le cadre se recharge tout seul ;
 *   B. même version servie → rien ne bouge ;
 *   C. cadre, chat OUVERT → on ne coupe pas la conversation ;
 *   D. le cadre ne touche JAMAIS aux caches ni aux service workers de l'origine (ils ne sont pas à Bee : portail, apps) ;
 *   E. page qui porte Bee elle-même (arbre…), onglet visible → la page n'est pas rechargée sous les doigts ;
 *   F. … onglet caché + page calme → elle se recharge ;
 *   G. … onglet caché mais une saisie en cours → jamais rechargée (rien ne se perd) ;
 *   H. javis-version.js (la ligne que le cadre lit) existe, et dit la version du widget (synchro).
 *
 * node tests/verify-bee-maj-auto.mjs      (BEE_WIDGET=<autre widget> pour les sabotages)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = { ok: [], ko: [] };
const chk = (c, m) => { (c ? R.ok : R.ko).push(m); console.log((c ? '  ✅ ' : '  ❌ ') + m); };
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDGET = process.env.BEE_WIDGET || join(ROOT, 'tools/javis/javis-widget.js');
const brut = fs.readFileSync(WIDGET, 'utf8');
const VRAIE = (brut.match(/var JAVIS_VER = '([^']+)'/) || [])[1];
if (!VRAIE) { console.log('❌ JAVIS_VER introuvable'); process.exit(1); }
/* le widget SERVI est une « vieille » version (v1.0) : le serveur dit ensuite qu'il y en a une plus récente */
const VIEUX = brut.replace(`var JAVIS_VER = '${VRAIE}';`, "var JAVIS_VER = 'v1.0';");

let servie = 'v9.99';                       // ce que dit javis-version.js
const compte = { cadre: 0, direct: 0 };
function repondreCommun(p, res) {
  if (p === '/__sso/whoami') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', verified: true, admin: true })); return true; }
  if (p === '/__javis/ai' || p === '/__javis/qui') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, reponse: 'ok' })); return true; }
  return false;
}
/* B = « javis.kd-mc.com » : le widget et sa ligne de version. Pas de CORS, exprès. */
const srvB = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (repondreCommun(p, res)) return;
  if (p === '/javis-widget.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(VIEUX); }
  if (p === '/javis-version.js') { res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' }); return res.end(`window.__javisVerServie = '${servie}';\n`); }
  res.writeHead(404); res.end('nope');
});
await new Promise((r) => srvB.listen(0, r));
const portB = srvB.address().port;
/* A = « kd-mc.com » : la page de l'app, le cadre, et (pour E/F/G) une page qui porte Bee elle-même */
const srvA = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (repondreCommun(p, res)) return;
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><meta charset=utf-8><body style="background:#112"><h1>App</h1><iframe id="c" src="/__javis/cadre" style="position:fixed;right:8px;bottom:8px;width:92px;height:92px;border:0"></iframe>'); }
  if (p === '/__javis/cadre') { compte.cadre++; res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); return res.end(`<!doctype html><meta charset=utf-8><body class="javis-cadre"><script src="http://localhost:${portB}/javis-widget.js" defer></script>`); }
  if (p === '/direct') { compte.direct++; res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); return res.end('<!doctype html><meta charset=utf-8><body style="background:#112"><input id="champ"><script src="/javis-widget.js" defer></script>'); }
  /* même adresse que le widget chargé : la page le relit (fetch ?_v=) → la version SERVIE est celle du vrai fichier ; au chargement normal, la copie « ancienne » */
  if (p === '/javis-widget.js') { res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' }); return res.end(/_v=/.test(req.url) ? brut.replace(`var JAVIS_VER = '${VRAIE}';`, `var JAVIS_VER = '${servie}';`) : VIEUX); }
  res.writeHead(404); res.end('nope');
});
await new Promise((r) => srvA.listen(0, r));
const portA = srvA.address().port;
const browser = await chromium.launch();

async function ouvrir() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const appels = { caches: 0, sw: 0 };
  await page.exposeFunction('__espion', (nom) => { appels[nom]++; });
  await page.addInitScript(() => {
    try { const d = window.caches && window.caches.delete; if (d) window.caches.delete = function () { window.__espion('caches'); return d.apply(this, arguments); }; } catch (_) { /* */ }
    try { const g = navigator.serviceWorker && navigator.serviceWorker.getRegistrations; if (g) navigator.serviceWorker.getRegistrations = function () { window.__espion('sw'); return g.apply(this, arguments); }; } catch (_) { /* */ }
  });
  await page.route('**/lingua.kd-mc.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{}' }));
  return { ctx, page, appels };
}
const cacher = (page) => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });

/* ---- A + D : cadre fermé, version plus récente → rechargement tout seul, sans toucher aux caches ---- */
servie = 'v9.99'; compte.cadre = 0;
{
  const { ctx, page, appels } = await ouvrir();
  await page.goto(`http://localhost:${portA}/`);
  await dors(7500);
  chk(compte.cadre >= 2, `A. cadre fermé + version plus récente servie → le cadre se recharge tout seul (${compte.cadre} chargements)`);
  chk(appels.caches === 0 && appels.sw === 0, `D. le cadre ne purge ni caches ni service workers de l'origine (${appels.caches} / ${appels.sw})`);
  await ctx.close();
}
/* ---- B : même version → rien ne bouge ---- */
servie = VIEUX.match(/var JAVIS_VER = '([^']+)'/)[1]; compte.cadre = 0;
{
  const { ctx, page } = await ouvrir();
  await page.goto(`http://localhost:${portA}/`);
  await dors(5500);
  chk(compte.cadre === 1, `B. même version servie → aucun rechargement (${compte.cadre} chargement)`);
  await ctx.close();
}
/* ---- C : chat ouvert → on ne coupe pas ---- */
servie = 'v9.99'; compte.cadre = 0;
{
  const { ctx, page } = await ouvrir();
  await page.goto(`http://localhost:${portA}/`);
  await dors(1500);
  const fr = page.frames().find((x) => /__javis\/cadre/.test(x.url()));
  await fr.evaluate(() => { const l = document.querySelector('#javis-launcher'); if (l) l.click(); }).catch(() => {});
  await dors(700);
  const ouvert = await page.frames().find((x) => /__javis\/cadre/.test(x.url())).evaluate(() => !!document.querySelector('#javis-panel.javis-open')).catch(() => false);
  await dors(5500);
  chk(ouvert && compte.cadre === 1, `C. chat OUVERT + version plus récente → la conversation n'est pas coupée (panneau ouvert : ${ouvert}, ${compte.cadre} chargement)`);
  await ctx.close();
}
/* ---- E / F / G : page qui porte Bee elle-même ---- */
servie = 'v9.99'; compte.direct = 0;
{
  const { ctx, page } = await ouvrir();
  await page.goto(`http://localhost:${portA}/direct`);
  await dors(4500);
  chk(compte.direct === 1, `E. page qui porte Bee, onglet visible → pas rechargée sous les doigts (${compte.direct} chargement)`);
  await cacher(page); await dors(3500);
  chk(compte.direct >= 2, `F. … onglet caché + page calme → elle se recharge (${compte.direct} chargements)`);
  await ctx.close();
}
compte.direct = 0;
{
  const { ctx, page } = await ouvrir();
  await page.goto(`http://localhost:${portA}/direct`);
  await page.fill('#champ', 'une réponse commencée');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());   /* le champ n'a plus le focus : seule la « page calme » doit retenir le rechargement */
  await dors(4000); await cacher(page); await dors(3500);
  chk(compte.direct === 1, `G. … onglet caché mais une saisie en cours → jamais rechargée (${compte.direct} chargement)`);
  await ctx.close();
}
/* ---- H : la ligne lue par le cadre existe et suit le widget ---- */
for (const d of ['javis', 'arbre']) {
  const f = join(ROOT, d, 'javis-version.js');
  const t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  chk(t.includes(`'${VRAIE}'`), `H. ${d}/javis-version.js dit ${VRAIE} (${t.trim() || 'absent'})`);
}
await browser.close(); srvA.close(); srvB.close();
console.log(`\n${R.ok.length} contrôles OK, ${R.ko.length} échec(s)`);
process.exit(R.ko.length ? 1 : 0);
