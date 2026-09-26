/* LA CHAÎNE QUE SEUL LE COFFRE PEUT LANCER (26.09.2026)
 *
 * Pourquoi cet outil existe, mesuré le jour de la bascule :
 * la bascule de 17h36 a mis en pause 134 des 166 robots du coffre — à juste titre, ils
 * tournent désormais au dépôt public. Mais AUCUN des 32 robots restés actifs ne lance
 * `test:ci`, et le dépôt public ne PEUT pas lancer la chaîne complète : l'export retire
 * 139 scripts npm qui ont besoin des fichiers privés (regles.json → scripts_npm_prives).
 * Diff mesuré des deux chaînes : 221 étapes au coffre, 112 au public → **109 étapes ne
 * tournaient plus nulle part**, dont tout le cœur de CMCteams, de la Light, des plannings
 * et de l'arbre. Une PR verte ne prouvait plus qu'on n'avait pas cassé un planning.
 *
 * Cet outil relance EXACTEMENT ces étapes-là, et rien d'autre (les 112 autres tournent au
 * public : les relancer ici brûlerait les 2 000 minutes du coffre pour rien).
 *
 * LA LISTE N'EST PAS RECOPIÉE. Elle est DÉDUITE : on fabrique l'export public et on compare
 * sa chaîne à la nôtre. Une liste recopiée périme en silence — c'est exactement ce qui a gelé
 * le site aujourd'hui (une copie figée du code) et ce qui a rendu 4 gardes rouges pendant
 * des jours (un remède appliqué à une copie sur quatre).
 *
 * npm run test:ci-prive            · toutes les étapes que seul le coffre peut lancer
 * npm run test:ci-prive -- --lister  · les lister sans rien lancer
 */
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LISTER = process.argv.includes('--lister');

const etapes = (json) => String((json.scripts || {})['test:ci'] || '')
  .split('&&').map((x) => x.trim().replace(/^npm run (-s )?/, '')).filter(Boolean);

const nous = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
const sortie = mkdtempSync(join(tmpdir(), 'chaine-privee-'));
execFileSync(process.execPath, [join(RACINE, 'tools/depot-public/exporter.mjs'), '--sortie', sortie],
  { cwd: RACINE, stdio: 'pipe' });
const pkgPublic = join(sortie, 'package.json');
if (!existsSync(pkgPublic)) {
  console.error('✗ l\'export public n\'a pas de package.json — impossible de savoir ce que le public lance. On refuse de deviner.');
  process.exit(2);
}
const auPublic = new Set(etapes(JSON.parse(readFileSync(pkgPublic, 'utf8'))));
const aNous = etapes(nous);
const privees = aNous.filter((e) => !auPublic.has(e));

console.log(`Chaîne du coffre : ${aNous.length} étapes · au dépôt public : ${auPublic.size} · QUE LE COFFRE PEUT LANCER : ${privees.length}`);
if (!privees.length) {
  console.error('✗ aucune étape privée trouvée : soit l\'export a changé de forme, soit la comparaison est cassée. On refuse de conclure « tout va bien » sur 0 contrôle.');
  process.exit(2);
}
if (LISTER) { privees.forEach((e) => console.log('  ' + e)); process.exit(0); }

let ok = 0;
const echecs = [];
const debut = Date.now();
for (const [i, e] of privees.entries()) {
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', '-s', e], { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' });
  const s = Math.round((Date.now() - t0) / 1000);
  if (r.status === 0) { ok++; console.log(`  ✅ ${String(i + 1).padStart(3)}/${privees.length}  ${e}  (${s}s)`); }
  else {
    echecs.push(e);
    console.log(`  ❌ ${String(i + 1).padStart(3)}/${privees.length}  ${e}  (${s}s)`);
    const fin = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-12);
    fin.forEach((l) => console.log('        ' + l));
    console.log(`::error title=${e}::${(fin[fin.length - 1] || 'échec').slice(0, 300)}`);
  }
}
const min = Math.round((Date.now() - debut) / 60000);
console.log(`\n=== chaîne privée : ${ok} OK / ${echecs.length} en échec · ${min} min ===`);
echecs.forEach((e) => console.log('  ✗ ' + e));
process.exit(echecs.length ? 1 : 0);
