#!/usr/bin/env node
/* verify-beatbot-iphone-se — PoolPilot / Beatbot (tools/poolrobot) tient sur un iPhone SE (320 × 568) :
 * aucun débordement horizontal et chaque bouton de la barre du bas (#nav) fait au moins 44 px de large et de haut.
 *
 * Bilan du robot d'affichage (pont 2578, run 43973722309, 17.11.2026) : « beatbot iphone-se déborde de 42 px,
 * 4 boutons de nav#nav < 44 px de large (40x50, 28x50) ». Cause mesurée ici : 7 boutons dans 320 px (marges et
 * espaces compris) et un bouton de thème qui sort de la barre du haut.
 * Sabotage : BEATBOT_RACINE=<ancienne copie du dépôt> → rouge.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const RACINE = process.env.BEATBOT_RACINE || new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };

const serveur = http.createServer((q, r) => {
  let f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(RACINE)) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((o) => serveur.listen(0, o));
const port = serveur.address().port;

const navigateur = await chromium.launch();
const ECRANS = [
  ['iPhone SE 320 × 568', devices['iPhone SE']],
  ['iPhone 13 390 × 844', { viewport: { width: 390, height: 844 } }],
  ['portable 1280 × 720', { viewport: { width: 1280, height: 720 } }],
];
for (const [nom, dev] of ECRANS) {
  console.log(nom);
  const page = await navigateur.newPage(dev);
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/poolrobot/`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForSelector('#nav button', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const vw = innerWidth;
    const hors = [...document.querySelectorAll('body *')]
      .filter((e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0 && Math.round(e.getBoundingClientRect().right) > vw; })
      .map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' ' + Math.round(e.getBoundingClientRect().right));
    const nav = [...document.querySelectorAll('#nav button')].map((b) => { const r = b.getBoundingClientRect(); return { l: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), d: Math.round(r.right) }; });
    return { vw, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), hors, nav, navSw: document.querySelector('#nav').scrollWidth, navCw: document.querySelector('#nav').clientWidth };
  });
  vrai(m.nav.length === 7, `7 boutons dans la barre du bas (${m.nav.length})`);
  vrai(m.sw <= m.vw, `aucun débordement horizontal (page ${m.sw} px pour un écran de ${m.vw} px)`);
  vrai(m.hors.length === 0, `aucun élément ne sort de l'écran à droite${m.hors.length ? ' : ' + m.hors.slice(0, 4).join(', ') : ''}`);
  const petits = m.nav.filter((b) => b.w < 44 || b.h < 44);
  vrai(petits.length === 0, `chaque bouton de la barre du bas fait ≥ 44 × 44 px${petits.length ? ' : ' + petits.map((b) => `${b.l} ${b.w}x${b.h}`).join(', ') : ''}`);
  vrai(m.nav.every((b) => b.d <= m.vw), 'la barre du bas se voit en entier (aucun bouton coupé)');
  vrai(erreurs.length === 0, `0 erreur JavaScript${erreurs.length ? ' : ' + erreurs[0] : ''}`);
  await page.close();
}
await navigateur.close(); serveur.close();
console.log(`\n${ok} ✅ · ${ko} ❌`);
process.exit(ko ? 1 : 0);
