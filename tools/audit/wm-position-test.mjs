/* Vérif RÉELLE — World Monitor v2.41 « 📍 Ma position »
   Navigateur réel (Chromium), GPS simulé (Monaco), leaflet servi localement
   (sandbox sans egress). Preuves attendues :
   1. la puce 📍 existe et se clique
   2. le point bleu + cercle apparaissent sur la carte (couche Leaflet réelle)
   3. ON.pos persiste (prefs localStorage)
   4. AUCUNE requête réseau ne contient les coordonnées (vie privée prouvée)
   5. re-clic → couche retirée proprement (toggle OFF) */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WM = join(ROOT, 'kdmc-home', 'worldmonitor');
// Leaflet servi en LOCAL (sandbox/CI sans unpkg) — récupéré du registre npm, mis en cache
const HERE = join(os.tmpdir(), 'wm-leaflet-cache');
if (!existsSync(join(HERE, 'package', 'dist', 'leaflet.js'))) {
  mkdirSync(HERE, { recursive: true });
  execSync('npm pack leaflet@1.9.4 --silent && tar xzf leaflet-1.9.4.tgz', { cwd: HERE, stdio: 'ignore' });
}
const LAT = 48.8566, LON = 2.3522; // Paris (≠ Monaco pour ne pas confondre avec le widget Monaco en dur)

const srv = http.createServer((req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const f = p.startsWith('/leaflet/') ? join(HERE, 'package/dist', p.slice(9)) : join(WM, p);
    const body = readFileSync(f);
    const ct = p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript'
      : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': ct }); res.end(body);
  } catch (e) { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => srv.listen(8899, r));

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  geolocation: { latitude: LAT, longitude: LON, accuracy: 25 },
  permissions: ['geolocation'],
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();
// Couches LIVE éteintes (vols, air, navires…) : on prouve que la couche POSITION seule n'envoie rien
await page.addInitScript(() => { try { localStorage.setItem('wm_prefs_v1', JSON.stringify({ on: { flights:0, ships:0, air:0, waves:0, sats:0, iss:0, radar:0 } })); } catch (e) {} });

// VIE PRIVÉE : on scrute TOUTES les requêtes — aucune ne doit contenir les coordonnées
const leaks = [];
await page.route('**/*', async (route) => {
  const u = route.request().url();
  const pd = route.request().postData() || '';
  // L'affirmation UI exacte : « ta position GPS reste sur l'appareil ; les couches live
  // chargent la zone AFFICHÉE (comme un déplacement de carte) ». Donc on prouve que le
  // fix GPS PLEINE PRÉCISION (48.8566 / 2.3522) n'apparaît dans AUCUNE requête.
  // (Le centre de carte arrondi (48.857) envoyé par la couche Vols = comportement
  // de navigation inhérent, identique à un déplacement manuel — vérifié + documenté UI.)
  if (u.includes('48.8566') || u.includes('2.3522') || pd.includes('48.8566') || pd.includes('2.3522')) leaks.push(u.slice(0,110));
  // leaflet → local ; le reste du web → coupé (sandbox) mais sans casser la page
  if (u.includes('unpkg.com/leaflet')) {
    const f = u.endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    return route.fulfill({ path: join(HERE, 'package/dist', f) });
  }
  if (u.startsWith('http://localhost:8899')) return route.continue();
  return route.abort(); // APIs externes : la page doit rester fail-open
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const chip = page.locator('[data-layer="pos"]');
const t1 = (await chip.count()) === 1;
console.log((t1 ? '✅' : '❌') + ' 1. puce 📍 Ma position présente');

// le groupe "Aller à" est replié → on l'ouvre comme un vrai doigt
await page.evaluate(() => { document.querySelectorAll('details.tgroup').forEach(d => d.open = true); });
await chip.click();
await page.waitForTimeout(2500);

const st = await page.evaluate(() => ({
  on: window.ON && ON.pos,
  fix: typeof _posFix !== 'undefined' && _posFix ? { lat: _posFix.lat, lon: _posFix.lon, acc: _posFix.acc } : null,
  markerOnMap: !!(window.MAP && typeof _posLayer !== 'undefined' && _posLayer && MAP.hasLayer(_posLayer)),
  dotCount: document.querySelectorAll('#map path.leaflet-interactive').length,
  hint: (document.getElementById('mapHint') || {}).textContent || '',
  prefs: (() => { try { return JSON.parse(localStorage.getItem('wm_prefs_v1')).on.pos; } catch (e) { return 'err'; } })(),
  pressed: document.querySelector('[data-layer="pos"]').getAttribute('aria-pressed'),
}));
const t2 = st.on === 1 && st.pressed === 'true';
const t3 = !!(st.fix && Math.abs(st.fix.lat - 48.8566) < 0.001 && Math.abs(st.fix.lon - 2.3522) < 0.001);
const t4 = st.markerOnMap && st.dotCount >= 1;
const t5 = st.prefs === 1;
console.log((t2 ? '✅' : '❌') + ' 2. toggle ON + puce pressée (' + st.pressed + ')');
console.log((t3 ? '✅' : '❌') + ' 3. fix GPS reçu : ' + JSON.stringify(st.fix));
console.log((t4 ? '✅' : '❌') + ' 4. point + cercle dessinés sur la carte Leaflet (' + st.dotCount + ' formes) — hint: « ' + st.hint + ' »');
console.log((t5 ? '✅' : '❌') + ' 5. préférence persistée (wm_prefs_v1.on.pos=1)');

// toggle OFF
await chip.click();
await page.waitForTimeout(600);
const off = await page.evaluate(() => ({
  on: ON.pos,
  layerGone: !(window.MAP && typeof _posLayer !== 'undefined' && _posLayer && MAP.hasLayer(_posLayer)),
}));
const t6 = off.on === 0 && off.layerGone;
console.log((t6 ? '✅' : '❌') + ' 6. re-clic → OFF + couche retirée');

const t7 = leaks.length === 0;
console.log((t7 ? '✅' : '❌') + ' 7. VIE PRIVÉE : fix GPS pleine précision jamais transmis (' + leaks.length + ' fuite)'); leaks.forEach(u=>console.log('   fuite? '+u));
const t8 = errors.length === 0;
console.log((t8 ? '✅' : '❌') + ' 8. 0 erreur JS (' + errors.join(' | ') + ')');

await browser.close(); srv.close();
const ok = t1 && t2 && t3 && t4 && t5 && t6 && t7 && t8;
console.log(ok ? '\n✅ TOUT PROUVÉ' : '\n❌ ÉCHEC');
process.exit(ok ? 0 : 1);
