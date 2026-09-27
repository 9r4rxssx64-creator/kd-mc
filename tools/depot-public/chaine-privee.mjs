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
    const brut = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
    const fin = brut.slice(-12);
    fin.forEach((l) => console.log('        ' + l));
    /* L'annotation ne gardait que la DERNIÈRE ligne de la sortie. Pour un test qui
       compte ses cas, cette ligne est le total — « === 44 OK / 1 FAIL === » : on
       apprend qu'un cas casse, jamais LEQUEL. Mesuré le 27.09.2026 sur le run
       36336413696 (job 108667994323, test:fiches-privees, 44 OK / 1 FAIL : l'annotation
       publiée portait ce total et RIEN d'autre) : le journal du job est le SEUL endroit
       qui nomme le cas, et il est servi par *.blob.core.windows.net — que le proxy
       d'agent refuse (vérifié : CONNECT rejeté). Un contrôle qu'on ne peut pas LIRE
       ne vaut pas mieux qu'un contrôle qui n'a pas tourné (leçon #322). On joint donc
       les lignes qui NOMMENT les cas fautifs, comme verif-reelle.yml le fait depuis
       le 27.09 pour la raison de chaque rouge.
       Anti-fuite : on élargit ce qui sort d'ici, donc on re-barre le code admin et les
       empreintes — mêmes motifs que le filtre de verif-reelle.yml. Garde :
       test:rapport-chaine-privee (prouvée discriminante). */
    const FUITE = /code admin|pinhash|PIN_HASH|[0-9a-f]{8,}/i;
    const fautifs = brut
      .filter((l) => /(^|\s)(FAIL|✗|✘|not ok|AssertionError|Error:)/.test(l))
      .filter((l) => !FUITE.test(l))
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10);
    const resume = (fin[fin.length - 1] || 'échec').trim();
    const msg = [...fautifs, resume].join('\n').slice(0, 800)
      .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=${e}::${msg}`);
  }
}
const min = Math.round((Date.now() - debut) / 60000);
console.log(`\n=== chaîne privée : ${ok} OK / ${echecs.length} en échec · ${min} min ===`);
echecs.forEach((e) => console.log('  ✗ ' + e));
process.exit(echecs.length ? 1 : 0);
