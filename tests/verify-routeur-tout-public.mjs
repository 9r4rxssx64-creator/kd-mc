/* LE ROUTEUR DU DOMAINE NE DOIT IMPORTER QUE DES FICHIERS EXPORTABLES AU DÉPÔT PUBLIC (6.10.2026).
 *
 * Mesuré : le routeur se déploie DEPUIS le dépôt public. Le 6.10 à 00h16, `membre-planning.js` (nouveau)
 * citait deux vrais noms d'employés en exemple dans un commentaire → l'export l'a gardé au coffre (à juste
 * titre), `worker.js` l'importait → au public : « Cannot find module » → déploiement du routeur ROUGE, et
 * avec lui 3 autres robots. Rien n'avait vu venir ça au coffre, où le fichier existe.
 * Ici : on suit TOUTES les importations locales de worker.js (récursivement) et chaque fichier doit être
 * classé « public » par la VRAIE règle de l'export (tools/depot-public/exporter.mjs).
 *   node tests/verify-routeur-tout-public.mjs        (SABOTAGE=1 → un vrai nom glissé dans un import → rouge)
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nomsSensibles, classer } from '../tools/depot-public/exporter.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* Les deux serveurs du domaine qui se déploient depuis le dépôt public : le routeur et le serveur des codes. */
const DEPARTS = ['services/kdmc-router/worker.js', 'services/apex-auth-worker/src/index.js'];
const noms = nomsSensibles(ROOT);
const lire = (f) => {
  const t = readFileSync(join(ROOT, f), 'utf8');
  return process.env.SABOTAGE && f.endsWith('membre-planning.js') ? t + '\n/* ' + noms[0] + ' */' : t;
};
/* Les importations locales (« ./x.js », « ../_shared/y.js ») d'un fichier, sous forme de chemins du dépôt. */
function importsDe(f) {
  const t = readFileSync(join(ROOT, f), 'utf8');
  const out = [];
  /* « … from './x.js' », « import './x.js' » et « import('./x.js') » : trois motifs simples, sans retour en arrière. */
  const motifs = [/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g, /\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g, /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]/g];
  for (const re of motifs) for (const m of t.matchAll(re)) out.push(normalize(join(dirname(f), m[1])));
  return out.filter((x) => existsSync(join(ROOT, x)));
}
const vus = new Set();
const pile = [...DEPARTS];
while (pile.length) {
  const f = pile.pop();
  if (vus.has(f)) continue;
  vus.add(f);
  pile.push(...importsDe(f));
}
const res = classer([...vus], lire, noms);
let ko = 0;
console.log(`\nRouteur + serveur des codes : ${vus.size} fichier(s) importé(s), tous exportables au dépôt public ?\n`);
for (const [f, v] of [...res].sort((x, y) => x[0].localeCompare(y[0]))) {
  const bon = v.classe === 'public';
  if (!bon) ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${relative('.', f)}${bon ? '' : '  → ' + v.classe + ' (' + (v.raison || '') + ') : au public, le routeur ne démarrerait pas'}`);
}
if (vus.size < 5) { ko++; console.log('  ❌ moins de 5 fichiers suivis : la lecture des importations ne marche plus'); }
console.log(ko ? `\n=== ROUTEUR-PUBLIC : ${ko} ÉCHEC(S) ===` : '\n=== ROUTEUR-PUBLIC : OK ===');
process.exit(ko ? 1 : 0);
