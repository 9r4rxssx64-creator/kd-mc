/* PREUVE — Lingua se met à jour à la main ET toute seule (Kevin 27.09 : « Je ne peux pas
 * mettre à jour la version manuellement comme dans les autres apps »).
 * ===========================================================================
 * Avant : ni bouton, ni vérification. Le service worker sert « réseau d'abord », donc la
 * nouvelle version arrivait à la réouverture suivante — sans le dire, sans moyen de la
 * forcer, et sans que Kevin puisse savoir s'il avait la dernière.
 *
 * Ce test sert l'app sur un petit serveur HTTP local (la sonde de version lit
 * `app.js?_v=…` par le réseau : impossible en file://) et prouve :
 *   1. le Profil porte « 🔄 Mettre à jour l'app » avec la version courante ;
 *   2. l'appui vide les caches et recharge la page avec un cache-buster (`?_upd=`) ;
 *   3. si le domaine sert une version PLUS RÉCENTE, l'app se recharge toute seule ;
 *   4. si le domaine sert la MÊME version (ou une plus vieille), elle ne bouge pas —
 *      jamais de boucle de rechargement ;
 *   5. le service worker ne met pas en cache les sondes `?_v=` ni les `?_upd=`
 *      (sinon le cache grossirait d'une entrée par minute).
 *
 * Lancer : node tests/verify-lingua-maj.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lingua');
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

/* --- serveur local : l'app telle quelle, avec un réglage « version servie » --------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const appJs = readFileSync(join(RACINE, 'app.js'), 'utf8');
const VER_LOCALE = (appJs.match(/APP_VER\s*=\s*"([^"]+)"/) || [])[1];
let versionServie = VER_LOCALE;              // ce que « le domaine » répond à la sonde
const requetesAppJs = [];
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  const f = join(RACINE, p === '/' ? 'index.html' : p);
  if (!f.startsWith(RACINE) || !existsSync(f)) { r.writeHead(404); return r.end('non'); }
  if (p === '/app.js') {
    requetesAppJs.push(q.url);
    r.writeHead(200, { 'content-type': 'text/javascript' });
    return r.end(appJs.replace(/APP_VER\s*=\s*"[^"]+"/, 'APP_VER="' + versionServie + '"'));
  }
  r.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const nav = await chromium.launch();
const erreurs = [];
const ouvre = async () => {
  const ctx = await nav.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Audit Maj', avatar: '🦊', code: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('a1'));
    localStorage.setItem('lingua_a_a1_course', JSON.stringify('en'));
  });
  await page.goto(BASE + '/');
  await page.waitForTimeout(1500);
  return { ctx, page };
};
const versProfil = (page) => page.evaluate(() => { const t = [...document.querySelectorAll('.tabbar .tab')].find((x) => /Profil/.test(x.textContent)); if (t) t.click(); return !!t; });

chk(!!VER_LOCALE, `0. version de l'app lue dans app.js : ${VER_LOCALE}`);

/* ---------- 1 + 2. le bouton, et ce qu'il fait ---------------------------- */
{
  const { ctx, page } = await ouvre();
  await versProfil(page); await page.waitForTimeout(700);
  const btn = await page.$('#btnMaj');
  chk(!!btn, '1. le Profil propose « 🔄 Mettre à jour l\'app »');
  const libelle = btn ? await btn.textContent() : '';
  chk(libelle.includes(VER_LOCALE), `1b. le bouton affiche la version courante (${VER_LOCALE})`);
  /* on pose un cache et une inscription de SW pour vérifier qu'ils sont vidés */
  await page.evaluate(async () => { const c = await caches.open('lingua-test-vieux'); await c.put('/x', new Response('x')); });
  const avant = await page.evaluate(async () => (await caches.keys()).length);
  chk(avant >= 1, `2a. avant l'appui : ${avant} cache(s) présent(s)`);
  await page.evaluate(() => { const b = document.getElementById('btnMaj'); if (b) b.click(); });
  await page.waitForTimeout(2500);
  chk(/[?&]_upd=\d+/.test(page.url()), `2b. après l'appui, la page est rechargée avec un cache-buster (${page.url().replace(BASE, '')})`);
  const apres = await page.evaluate(async () => (await caches.keys()).filter((k) => k === 'lingua-test-vieux').length).catch(() => -1);
  chk(apres === 0, '2c. le cache d\'avant a été vidé (le SW recrée le sien au démarrage)');
  chk((await page.evaluate(() => (document.body.innerText || '').length)) > 100, '2d. et l\'app est bien revenue (pas de page blanche après le rechargement)');
  await ctx.close();
}

/* ---------- 3. version plus récente servie → rechargement automatique ----- */
{
  /* La page doit avoir CHARGÉ l'app avant qu'on change ce que « le domaine » sert :
     sinon l'app en cours EST déjà la v99, et il n'y a rien à mettre à jour. */
  const { ctx, page } = await ouvre();
  const urlAvant = page.url();
  versionServie = 'v99.0.0';
  await page.waitForTimeout(4500);   // la sonde part 2,5 s après le démarrage
  chk(requetesAppJs.some((u) => /app\.js\?_v=/.test(u)), '3a. l\'app SONDE la version servie (app.js?_v=…) sans qu\'on lui demande');
  chk(page.url() !== urlAvant && /_upd=/.test(page.url()), `3b. version servie plus récente (${versionServie}) → l'app s'est rechargée toute seule`);
  await ctx.close();
}

/* ---------- 4. même version → aucune boucle --------------------------------- */
{
  versionServie = VER_LOCALE;
  const n0 = requetesAppJs.length;
  const { ctx, page } = await ouvre();
  await page.waitForTimeout(4500);
  chk(requetesAppJs.slice(n0).some((u) => /_v=/.test(u)), '4a. la sonde est bien partie');
  chk(!/_upd=/.test(page.url()), '4b. même version servie → l\'app ne se recharge PAS (aucune boucle)');
  versionServie = 'v0.0.1';
  await page.evaluate(() => { localStorage.removeItem('lingua_upd_ts'); });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1500);
  chk(!/_upd=/.test(page.url()), '4c. version servie PLUS VIEILLE (CDN en retard) → pas de rechargement non plus');
  await ctx.close();
}

/* ---------- 5. le service worker ne stocke pas les sondes ------------------- */
{
  const sw = readFileSync(join(RACINE, 'sw.js'), 'utf8');
  chk(/_\(v\|upd\)=/.test(sw), '5. sw.js laisse passer les requêtes ?_v= et ?_upd= sans les mettre en cache');
}

chk(erreurs.length === 0, `6. aucune erreur JavaScript${erreurs.length ? ' — ' + erreurs[0].slice(0, 100) : ''}`);

await nav.close();
srv.close();
R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
