/* SIGNATURE DE THÈME — combien de couleurs de marque sont écrites EN DUR dans l'app.
 *
 * POURQUOI (Kevin 2026-09-15 : « CMCteams actuel est fait pour Monaco le casino ;
 * il faudra adapter les thèmes pour les futurs clients ») :
 * mesuré le 15.09, l'app compte ~1700 emplacements où une couleur de marque est
 * écrite en dur au lieu de venir d'un jeton. Tant qu'ils sont là, vendre l'app à
 * une clinique ou un hôtel demande de les reprendre un par un — et un
 * chercher-remplacer aveugle CASSE l'app (24 de ces emplacements sont des
 * comparaisons de chaîne : `=== "#c9a227"`, qui deviendraient fausses en silence).
 *
 * Ce fichier ne convertit rien. Il MESURE, et sert de cliquet : la dette peut
 * baisser, jamais monter. Un nouveau `#c9a227` écrit à la main fait échouer le gate.
 *
 * Usage : node tools/audit/theme-signature.mjs [--maj-baseline]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = resolve(RACINE, 'tools/audit/theme-signature-baseline.json');

/* Les couleurs qui PORTENT l'identité du casino. Pas les couleurs sémantiques
   (rouge = alerte, vert = ok) ni les couleurs de données (une par famille de jeux) :
   celles-là restent identiques chez un autre client. */
const MARQUE = {
  '#c9a227': 'or Monaco',
  '#ffdc40': 'or vif',
  '#0a1408': 'fond vert nuit',
  '#ce1126': 'rouge du drapeau monégasque',
  '#3a8a50': 'vert Monaco',
};
const OR_RVB = /rgba\(\s*201\s*,\s*162\s*,\s*39\s*,/g;   /* l'or en rgba() : var() n'y marche pas tel quel */

const FICHIERS = ['index.html', 'tools/departs/index.html'];

function mesurer() {
  const total = {};
  for (const f of FICHIERS) {
    const p = resolve(RACINE, f);
    if (!existsSync(p)) continue;
    let src = readFileSync(p, 'utf8');
    /* On EXCLUT le bloc :root — c'est là que les jetons DOIVENT être définis.
       Une couleur de marque n'y compte pas comme de la dette. */
    src = src.replace(/:root\s*\{[\s\S]*?\}/g, '');
    const par = {};
    for (const [coul, nom] of Object.entries(MARQUE)) {
      const n = (src.match(new RegExp(coul, 'gi')) || []).length;
      if (n) par[`${coul} (${nom})`] = n;
    }
    const rgba = (src.match(OR_RVB) || []).length;
    if (rgba) par['rgba(201,162,39,…) — or en transparence'] = rgba;
    if (Object.keys(par).length) total[f] = par;
  }
  return total;
}

const mesure = mesurer();
const somme = (o) => Object.values(o).reduce((a, v) => a + Object.values(v).reduce((x, y) => x + y, 0), 0);

if (process.argv.includes('--maj-baseline')) {
  writeFileSync(BASELINE, JSON.stringify({ mesure, total: somme(mesure), le: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
  console.log(`Baseline figée : ${somme(mesure)} couleur(s) de marque en dur.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('Pas de baseline. Lance : node tools/audit/theme-signature.mjs --maj-baseline');
  process.exit(1);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

console.log('SIGNATURE DE THÈME — couleurs de marque écrites en dur (hors :root)\n');
const hausses = [];
for (const [f, par] of Object.entries(mesure)) {
  console.log(`  ${f}`);
  for (const [k, n] of Object.entries(par)) {
    const avant = (base.mesure[f] || {})[k] ?? 0;
    const signe = n > avant ? `⬆ +${n - avant}` : n < avant ? `⬇ −${avant - n}` : '=';
    console.log(`     ${String(n).padStart(4)}  ${k}   ${signe}`);
    if (n > avant) hausses.push(`${f} · ${k} : ${avant} → ${n}`);
  }
}
const tot = somme(mesure);
console.log(`\n  TOTAL ${tot}  (baseline ${base.total} du ${base.le})`);
console.log('  Ces emplacements ne suivent PAS les jetons : tant qu\'ils sont là, changer');
console.log('  le thème pour un client se fait à la main, emplacement par emplacement.');

if (hausses.length) {
  console.error('\nÉCHEC — la dette de thème AUGMENTE :');
  for (const l of hausses) console.error('  ⬆ ' + l);
  console.error('\n  Utilise les jetons : style="color:var(--cmc-gold)" au lieu de "#c9a227".');
  console.error('  Baisse volontaire ou reprise assumée : --maj-baseline, et dis pourquoi dans le commit.');
  process.exit(1);
}
console.log(tot < base.total
  ? `\nOK — la dette a BAISSÉ de ${base.total - tot}. Pense à re-figer la baseline (--maj-baseline).`
  : '\nOK — la dette de thème n\'augmente pas.');
