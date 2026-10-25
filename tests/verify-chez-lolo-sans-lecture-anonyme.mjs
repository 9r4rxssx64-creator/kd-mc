#!/usr/bin/env node
/* verify-chez-lolo-sans-lecture-anonyme — la boutique ne lit plus la liste d'accès de la base au chargement.
 *
 * Contrôle réel du Lenovo (pont 970, 24.10.2026) : chez-lolo.kd-mc.com v2.0.19 recevait « 401 » de la base Firebase :
 * au démarrage, la page lisait SANS jeton shops_admin_v1/access (la liste d'accès de la boutique), que les règles
 * refusent à juste titre. La Détente ne fait plus cet appel ; l'admin est reconnu par le domaine (/__sso/whoami).
 * Ce test ouvre la VRAIE page (Chromium, 390 et 1250 px), note toutes les requêtes vers la base, et vérifie :
 * (1) aucune requête vers shops_admin_v1/access au chargement ; (2) 0 erreur JavaScript ; (3) la page s'affiche.
 * Sabotage : CL_DIR=<ancienne boutique> → rouge.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const RACINE = new URL('..', import.meta.url).pathname;
const DIR = process.env.CL_DIR || path.join(RACINE, 'shops/chez-lolo');
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

const serveur = http.createServer((q, r) => {
  const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => serveur.listen(0, ok));
const base = `http://127.0.0.1:${serveur.address().port}/index.html`;

const navigateur = await chromium.launch();
for (const largeur of [390, 1250]) {
  console.log(`— ${largeur} px`);
  const page = await navigateur.newPage({ viewport: { width: largeur, height: 800 } });
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  const base_ = [];
  await page.route(/firebasedatabase\.app|firebaseio\.com/, (route) => {
    base_.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{"error":"Permission denied"}' });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const acces = base_.filter((p) => p.includes('shops_admin_v1/access'));
  vrai(acces.length === 0, `aucune lecture anonyme de shops_admin_v1/access au chargement (mesuré : ${acces.length})`);
  vrai(erreurs.length === 0, `0 erreur JavaScript (mesuré : ${erreurs.length}${erreurs.length ? ' — ' + erreurs[0] : ''})`);
  const texte = await page.evaluate(() => (document.body && document.body.innerText || '').trim().length);
  vrai(texte > 200, `la page s'affiche (${texte} caractères visibles)`);
  await page.close();
}
await navigateur.close(); serveur.close();
console.log(`\nchez-lolo sans lecture anonyme : ${ok} ok / ${ko} ko`);
process.exit(ko ? 1 : 0);
