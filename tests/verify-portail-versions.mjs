/* GARDE — le portail (kdmc-home) : UNE version, partout la même (8.10.2026)
 *
 * Depuis la politique de cache du routeur (8.10), un fichier appelé avec `?v=` est gardé 1 AN, immuable, par le navigateur :
 * changer kdmc-boite.js sans changer son `?v=` = personne ne voit le changement (vécu le 8.10 : le bouton « Déconnecter ce compte
 * partout » en ligne, mais l'iPhone de Kevin gardait l'ancien fichier `?v=1.0.40`). Règle : la version de la page (commentaire,
 * badge, sw.js CACHE_VERSION) est la version de TOUS ses scripts à elle, et le service worker liste les mêmes `?v=` que la page.
 *   1. commentaire <!-- vX --> = badge data-version = sw.js CACHE_VERSION ;
 *   2. kdmc-portal.js et kdmc-boite.js portent cette version dans index.html ET dans le SHELL du service worker ;
 *   3. SABOTAGE : un `?v=` qui diverge entre index.html et sw.js, ou un script en retard sur la page, est rouge.
 * node tests/verify-portail-versions.mjs */
import { readFileSync, existsSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

export function verifier(html, sw) {
  const e = [];
  const page = (html.match(/<!--\s*v(\d+\.\d+\.\d+)\s*-->/) || [])[1] || '';
  const badge = (html.match(/data-version="v(\d+\.\d+\.\d+)"/) || [])[1] || '';
  const cache = (sw.match(/CACHE_VERSION\s*=\s*'[^']*?v(\d+\.\d+\.\d+)'/) || [])[1] || '';
  if (!page || page !== badge || page !== cache) e.push(`version de la page ${page || '?'} ≠ badge ${badge || '?'} ou sw.js ${cache || '?'}`);
  const vHtml = Object.fromEntries([...html.matchAll(/src="([a-z-]+\.js)\?v=(\d+\.\d+\.\d+)"/g)].map((m) => [m[1], m[2]]));
  const vSw = Object.fromEntries([...sw.matchAll(/'\.\/([a-z-]+\.js)\?v=(\d+\.\d+\.\d+)'/g)].map((m) => [m[1], m[2]]));
  for (const f of ['kdmc-portal.js', 'kdmc-boite.js']) if (vHtml[f] !== page) e.push(`${f} : ?v=${vHtml[f] || '?'} dans index.html, page en ${page}`);
  for (const [f, v] of Object.entries(vHtml)) if (vSw[f] && vSw[f] !== v) e.push(`${f} : ?v=${v} dans index.html mais ?v=${vSw[f]} dans sw.js`);
  return { ok: e.length === 0, erreurs: e, page };
}

if (process.argv[1] && /verify-portail-versions\.mjs$/.test(process.argv[1])) {
  const H = new URL('../kdmc-home/index.html', import.meta.url), S = new URL('../kdmc-home/sw.js', import.meta.url);
  if (!existsSync(H) || !existsSync(S)) { console.log('  ✅ (kdmc-home absent de ce dépôt : contrôlé au coffre)'); process.exit(0); }
  const html = readFileSync(H, 'utf8'), sw = readFileSync(S, 'utf8');
  const r = verifier(html, sw);
  ok(r.ok, `1-2. portail v${r.page} : commentaire = badge = sw.js, scripts à la version de la page, service worker aligné`, r.erreurs.join(' ; '));
  const sab1 = verifier(html.replace(/kdmc-boite\.js\?v=\d+\.\d+\.\d+/, 'kdmc-boite.js?v=1.0.40'), sw);
  ok(!sab1.ok && /kdmc-boite\.js : \?v=1\.0\.40/.test(sab1.erreurs.join()), '3a. SABOTAGE : un script en retard sur la page (boite ?v=1.0.40) est rouge');
  const sab2 = verifier(html, sw.replace(/'\.\/kdmc-portal\.js\?v=\d+\.\d+\.\d+'/, "'./kdmc-portal.js?v=1.0.41'"));
  ok(!sab2.ok && /sw\.js/.test(sab2.erreurs.join()), '3b. SABOTAGE : un service worker qui liste une autre version est rouge');
  const sab3 = verifier(html.replace(/data-version="v[\d.]+"/, 'data-version="v0.0.1"'), sw);
  ok(!sab3.ok, '3c. SABOTAGE : badge ≠ page est rouge');
  console.log(`\n${pass} OK / ${fail} échec(s)`);
  process.exit(fail ? 1 : 0);
}
