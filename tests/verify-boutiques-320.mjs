#!/usr/bin/env node
/* verify-boutiques-320 — sur le plus petit iPhone (320 px), les pages des boutiques ne débordent pas (pas de défilement horizontal).
 * Robot d'affichage du domaine, run 43973722309 (16.11.2026) : « chez-lolo · iphone-se · déborde +63px » (pied de page en 2 colonnes trop larges).
 * Vrai Chromium, vraies pages locales, mesure du robot lui-même (`mesurer`). Sabotage : BOUTIQUES_RACINE=<ancienne copie du dépôt> → rouge. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { mesurer } from '../tools/plateformes/verif-affichage-domaine.mjs';

const RACINE = path.resolve(process.env.BOUTIQUES_RACINE || new URL('..', import.meta.url).pathname);
const PAGES = process.env.PAGES ? process.env.PAGES.split(',') : ['shops/chez-lolo/', 'shops/la-detente/', 'shops/kit-ia/', 'shops/croupier/', 'shops/rotaplan/'];
const LARGEUR = Number(process.env.LARGEUR) || 320;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const serveur = http.createServer((q, r) => {
  let f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]).replace(/^\/CMCteams/, ''));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(RACINE) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((res) => serveur.listen(0, res));
const port = serveur.address().port;
const navigateur = await chromium.launch();
for (const p of PAGES) {
  const ctx = await navigateur.newContext({ viewport: { width: LARGEUR, height: 568 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());   /* hors ligne : seules les pages locales comptent */
  await page.goto(`http://127.0.0.1:${port}/${p}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  const m = await page.evaluate(mesurer, true).catch((e) => ({ erreur: String(e && e.message).slice(0, 80) }));
  vrai(m && !m.erreur && m.deborde === 0, `${p} à 320 px : la page ne déborde pas${m && m.deborde ? ' — +' + m.deborde + ' px : ' + (m.debordeEx || []).slice(0, 3).join(' | ') : ''}${m && m.erreur ? ' — ' + m.erreur : ''}`);
  await ctx.close();
}
await navigateur.close(); serveur.close();
console.log(`\nboutiques 320 : ${ok} ok / ${ko} ko`);
process.exit(ko ? 1 : 0);
