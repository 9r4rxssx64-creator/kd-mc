#!/usr/bin/env node
/* verify-lingua-haut-320 — sur le plus petit iPhone (320 px), les 3 boutons du haut de Lingua (drapeau, cercle, avatar) font 44×44 px et la page ne déborde pas.
 * Robot d'affichage du domaine, run 43973722309 (16.11.2026) : « button#tbFlag 36x36, button#tbCercle 36x36, button#tbAv 36x36 » sur iPhone SE.
 * Vrai Chromium, vraie page locale. Sabotage : LINGUA_RACINE=<ancienne copie du dépôt> → rouge. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const RACINE = process.env.LINGUA_RACINE || new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const serveur = http.createServer((q, r) => {
  let f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]).replace(/^\/CMCteams/, ''));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(RACINE)) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((res) => serveur.listen(0, res));
const port = serveur.address().port;
const navigateur = await chromium.launch();
for (const largeur of [320, 375]) {
  const page = await (await navigateur.newContext({ viewport: { width: largeur, height: 568 }, isMobile: true, hasTouch: true })).newPage();
  await page.addInitScript(() => {
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Test', avatar: '🐝', code: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('a1'));
    localStorage.setItem('lingua_a_a1_course', JSON.stringify('en'));
    localStorage.setItem('lingua_a_a1_prog', JSON.stringify({ en: {} }));
  });
  await page.goto(`http://127.0.0.1:${port}/lingua/index.html`);
  await page.waitForSelector('.topbar', { timeout: 15000 });
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => ({
    deborde: document.documentElement.scrollWidth - innerWidth,
    boutons: ['tbFlag', 'tbCercle', 'tbAv'].map((id) => { const e = document.getElementById(id); if (!e) return id + ' absent'; const r = e.getBoundingClientRect(); return { id, w: Math.round(r.width), h: Math.round(r.height), dedans: r.left >= 0 && r.right <= innerWidth }; }),
  }));
  const petits = m.boutons.filter((x) => typeof x === 'string' || x.w < 44 || x.h < 44 || !x.dedans);
  vrai(petits.length === 0, `${largeur} px : drapeau, cercle et avatar font 44×44 et restent dans l'écran${petits.length ? ' — ' + JSON.stringify(petits) : ''}`);
  vrai(m.deborde <= 0, `${largeur} px : la page ne déborde pas (${m.deborde} px)`);
  await page.close();
}
await navigateur.close(); serveur.close();
console.log(`\nlingua haut 320 : ${ok} ok / ${ko} ko`);
process.exit(ko ? 1 : 0);
