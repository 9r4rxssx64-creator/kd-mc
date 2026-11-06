/* Garde écran (6.11.2026, robot Servi : sur iPhone et iPad, la pastille « ← Portail » du domaine recouvrait le logo de Rotaplan et son titre).
 * Les trois pages de vente sont servies avec la VRAIE pastille du routeur (PASTILLE_SANS_SCRIPT) et lues dans un vrai Chromium sur 4 écrans :
 * aucun lien ni bouton visible ne doit passer sous la pastille, page tout en haut. ARBRE-like sabotage : SHOPS_DIR=<ancien dossier shops> doit être rouge. */
import { chromium } from 'playwright';
import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { PASTILLE_SANS_SCRIPT } from '../services/kdmc-router/worker.js';
const SHOPS = process.env.SHOPS_DIR || 'shops';
const PAGES = ['rotaplan', 'croupier', 'kit-ia'];
const ECRANS = [[390, 664], [844, 390], [820, 1180], [1280, 720]];
let rouges = 0;
const b = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
for (const d of PAGES) {
  const racine = path.join(SHOPS, d);
  const srv = http.createServer((q, r) => { let p = path.join(racine, q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { r.writeHead(404); return r.end(); }
    let c = readFileSync(p); if (p.endsWith('.html')) c = String(c).replace(/<body([^>]*)>/, (m) => m + PASTILLE_SANS_SCRIPT);
    r.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(c); }).listen(0);
  for (const [w, h] of ECRANS) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`http://127.0.0.1:${srv.address().port}/`); await p.waitForTimeout(300);
    const sous = await p.evaluate(() => {
      const pa = document.querySelector('[data-kdmc-pastille]').getBoundingClientRect(); const out = [];
      for (const e of document.querySelectorAll('a[href], button, h1')) { if (e.matches('[data-kdmc-pastille]')) continue;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') continue;
        if (!(r.left >= pa.right || r.right <= pa.left || r.top >= pa.bottom || r.bottom <= pa.top)) out.push(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '')); }
      return out; });
    const ok = sous.length === 0; if (!ok) rouges++;
    console.log(`${ok ? '✅' : '❌'} ${d} ${w}×${h} : ${ok ? 'rien sous la pastille' : 'sous la pastille → ' + sous.join(', ')}`);
    await p.close();
  }
  srv.close();
}
await b.close();
console.log(rouges ? `\n${rouges} écran(s) rouge(s)` : '\nPages de vente : rien sous la pastille du domaine, 4 écrans'); process.exit(rouges ? 1 : 0);
