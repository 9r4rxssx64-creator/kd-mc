/* GARDE — Croupier et Rotaplan : la version se voit SANS défiler (règle « badge version visible toujours », Kevin 16.05).
 * Robot public Servi, 12.11.2026 (pont 2346) : span.version-site seulement dans le pied de page, à 7 900-10 400 px sous l'écran → « badge visibles 0 ».
 * Ces pages n'acceptent AUCUN script (CSP script-src 'none') : la pastille partagée du domaine (version-badge-pwa.js) y est refusée.
 * Correctif : la version du pied de page devient une pastille FIXE en CSS pur (bas gauche, place et identifiant de la pastille du domaine).
 * Vrai Chromium, la page réelle de chaque boutique, 4 écrans. SABOTAGE=1 : retire la règle CSS de la pastille → doit être ROUGE. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${c ? '' : '  ' + JSON.stringify(d)}`); };
const b = await chromium.launch();
for (const app of ['croupier', 'rotaplan']) {
  let html = readFileSync(new URL(`../shops/${app}/index.html`, import.meta.url), 'utf8');
  if (process.env.SABOTAGE === '1') html = html.replace(/#kdmc-version-badge\{[^}]*\}/, '');
  const ver = (html.match(/class="version-site" data-app-ver="(v[\d.]+)"/) || [])[1];
  ok(!!ver, `${app} : la page porte sa version`, ver);
  for (const [w, h] of [[390, 664], [844, 390], [375, 667], [1280, 720]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route('https://b.test/**', (r) => new URL(r.request().url()).pathname === '/'
      ? r.fulfill({ status: 200, contentType: 'text/html', body: html }) : r.fulfill({ status: 404, body: '' }));
    await p.goto('https://b.test/'); await p.waitForTimeout(300);
    const R = await p.evaluate((v) => {
      const vus = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && (e.textContent || '').trim() === v).filter((e) => {
        const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.left >= 0 && r.right <= innerWidth)) return false;
        for (let a = e; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; }
        return true;
      });
      const e = document.getElementById('kdmc-version-badge'), st = e && getComputedStyle(e);
      return { vus: vus.length, defile: Math.round(scrollY), fixe: st && st.position, clic: st && st.pointerEvents, taille: st && st.fontSize };
    }, ver);
    ok(R.vus === 1 && R.defile === 0, `${app} ${w}×${h} : la version ${ver} se voit sans défiler, une seule fois`, R);
    ok(R.fixe === 'fixed' && R.clic === 'none', `${app} ${w}×${h} : pastille fixe qui ne prend jamais un toucher (rien de caché dessous)`, R);
    await ctx.close();
  }
}
await b.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
