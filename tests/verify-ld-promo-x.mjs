/* GARDE — La Détente : le ✕ du bandeau promo est une vraie cible (≥ 44 px) et n'est plus collé au coin haut-droit où se pose la pastille 📲 du domaine
 * (8.11.2026, robot d'affichage run 42505210760 : [iphone-paysage] span.x 12×22 @728,7 sous 📲 @694,8). Vrai Chromium, la page réelle de la boutique.
 * SABOTAGE=1 : rejoue l'ancien style (✕ absolu à droite, 14 px) → doit être ROUGE. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let html = readFileSync(new URL('../shops/la-detente/index.html', import.meta.url), 'utf8');
if (process.env.SABOTAGE === '1') html = html.replace(/\.promobar \.x\{[^}]*\}/, '.promobar .x{position:absolute;right:10px;top:50%;transform:translateY(-50%);opacity:.85;cursor:pointer;font-size:14px}')
  .replace(/id="studioFab"([^>]*?)style="[^"]*"/, 'id="studioFab"$1style="display:none;position:fixed;left:12px;bottom:74px;padding:9px 14px;font:700 12px system-ui"')
  .replace(/;min-height:44px;display:inline-flex;align-items:center\}/, '}');
let pass = 0, fail = 0; const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${c ? '' : '  → ' + JSON.stringify(d)}`); };
const b = await chromium.launch();
for (const [w, h] of [[750, 340], [844, 390], [375, 667], [320, 568]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('https://ld.test/**', (r) => r.request().url() === 'https://ld.test/' ? r.fulfill({ status: 200, contentType: 'text/html', body: html }) : r.fulfill({ status: 404, body: '' }));
  await p.goto('https://ld.test/'); await p.waitForSelector('.promobar .x', { timeout: 8000 }).catch(() => {});
  const R = await p.evaluate(() => { const x = document.querySelector('.promobar .x'); if (!x) return null; const q = x.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height), cx: Math.round(q.left + q.width / 2), cy: Math.round(q.top + q.height / 2), W: innerWidth }; });
  ok(R && R.w >= 44 && R.h >= 44, `${w}×${h} : le ✕ du bandeau fait au moins 44×44`, R);
  ok(R && !(R.cx > R.W - 60 && R.cy < 56), `${w}×${h} : son centre n'est pas dans le coin haut-droit (place de la pastille 📲)`, R);
  /* 8.11 (run 42506236759) : « 🎨 Studio » (admin) était sous la pastille de version du domaine (bas-gauche, 93×44) ; le logo faisait moins de 44 px */
  const S = await p.evaluate(() => { const f = document.getElementById('studioFab'); f.style.display = 'block'; const q = f.getBoundingClientRect(), l = document.querySelector('.logo').getBoundingClientRect(); return { h: Math.round(q.height), left: Math.round(q.left), bas: Math.round(innerHeight - q.bottom), logo: Math.round(l.height) }; });
  ok(S.h >= 44 && !(S.left < 100 && S.bas < 110), `${w}×${h} : « 🎨 Studio » fait 44 px et n'est plus dans le coin bas-gauche (pastille de version, Vue admin)`, S);
  ok(S.logo >= 44, `${w}×${h} : le logo (lien vers l'accueil) fait au moins 44 px de haut`, S);
  await ctx.close();
}
await b.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
