#!/usr/bin/env node
/* verify-worldmonitor-gdacs — worldmonitor : alertes ONU (GDACS) affichées + boutons tactiles ≥ 44 px.
 *
 * Contrôle réel du Lenovo (pont 970, 24.10.2026) : worldmonitor.kd-mc.com v2.44 recevait « 400 » de
 * gdacs.org/gdacsapi/api/events/geteventlist/MAP — mesuré le 25.10 : sans type, l'API répond
 * « Eventtype is required » ; elle exige UN type par demande (?eventtype=EQ) et répond 404 quand un type n'a
 * aucun événement. Le calque « 🚨 Alertes ONU » restait donc vide. Et 386 cibles < 44 px (filtres à 34 px).
 * Ce test ouvre la VRAIE page dans Chromium (iPhone 390 px et 1250 px), GDACS simulé avec le même
 * comportement que le vrai service, et vérifie : (1) aucune demande sans type ; (2) les événements de
 * plusieurs types arrivent sur la carte ; (3) un type vide (404) ne casse rien ; (4) 0 erreur JS ;
 * (5) 0 bouton / lien / champ de l'interface sous 44 px (hors points de la carte et crédit Leaflet).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const RACINE = new URL('..', import.meta.url).pathname;
const DIR = process.env.WM_DIR || path.join(RACINE, 'kdmc-home/worldmonitor');
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };

const serveur = http.createServer((q, r) => {
  const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => serveur.listen(0, ok));
const base = `http://127.0.0.1:${serveur.address().port}/index.html`;

const point = (t, lvl, lon, lat) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { eventtype: t, alertlevel: lvl, eventname: 'Essai ' + t, eventid: t + '1' } });
const FAUX = { EQ: [point('EQ', 'Orange', 140, 35)], FL: [point('FL', 'Green', 30, 10), point('FL', 'Green', 31, 11)], TC: [point('TC', 'Green', -60, 20)] };

const navigateur = await chromium.launch();
for (const largeur of [390, 1250]) {
  console.log(`— ${largeur} px`);
  const page = await navigateur.newPage({ viewport: { width: largeur, height: 800 } });
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  const demandes = [];
  await page.route(/gdacs\.org\//, (route) => {
    const u = new URL(route.request().url()); demandes.push(u.search);
    const t = u.searchParams.get('eventtype');
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (!t) return route.fulfill({ status: 400, headers: h, body: '{"message":"Eventtype is required."}' });
    if (t.includes(';')) return route.fulfill({ status: 400, headers: h, body: '{"message":"Please specify only 1 eventtype."}' });
    if (!FAUX[t]) return route.fulfill({ status: 404, headers: h, body: '{"message":"No events"}' });
    return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ type: 'FeatureCollection', features: FAUX[t] }) });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.DL && DL.gdacs && DL.gdacs.length > 0, null, { timeout: 20000 }).catch(() => {});
  const n = await page.evaluate(() => (window.DL && DL.gdacs ? DL.gdacs.length : -1));
  vrai(demandes.length > 0 && demandes.every((s) => /eventtype=[A-Z]+$/.test(s)), `chaque demande GDACS porte UN type (${demandes.length} demandes : ${[...new Set(demandes)].join(' ')})`);
  vrai(n === 4, `les 4 alertes simulées (séisme, 2 inondations, cyclone) sont sur la carte (mesuré : ${n})`);
  const petits = await page.evaluate(() => [...document.querySelectorAll('a,button,input,select,summary,[role=button]')]
    .filter((e) => !e.closest('.leaflet-marker-pane,.leaflet-control-attribution'))
    .filter((e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; const q = e.getBoundingClientRect(); return q.width && q.height && (q.width < 44 || q.height < 44); })
    .map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
  vrai(petits.length === 0, `0 commande de l'interface sous 44 px (mesuré : ${petits.length}${petits.length ? ' — ' + petits.slice(0, 6).join(', ') : ''})`);
  vrai(erreurs.length === 0, `0 erreur JavaScript (mesuré : ${erreurs.length}${erreurs.length ? ' — ' + erreurs[0] : ''})`);
  await page.close();
}
await navigateur.close(); serveur.close();
console.log(`\nworldmonitor GDACS + cibles : ${ok} ok / ${ko} ko`);
process.exit(ko ? 1 : 0);
