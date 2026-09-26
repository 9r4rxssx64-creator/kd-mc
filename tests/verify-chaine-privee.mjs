/* GARDE — CE QUE SEUL LE COFFRE PEUT VÉRIFIER DOIT ÊTRE VÉRIFIÉ QUELQUE PART (26.09.2026)
 *
 * Mesuré le jour de la bascule, une fois le site réparé : 134 des 166 robots du coffre sont en
 * pause (à juste titre : 134 en pause = 134 déclarés publics, ils tournent au dépôt public).
 * Mais AUCUN des 32 robots restés actifs ne lançait `test:ci`, et le dépôt public ne PEUT pas
 * lancer la chaîne complète — l'export retire 139 scripts npm qui ont besoin des fichiers
 * privés. Diff des deux chaînes : 221 étapes au coffre, 112 au public → **109 étapes ne
 * tournaient plus nulle part**, dont tout le cœur de CMCteams, de la Light, des plannings et
 * de l'arbre. Une PR verte ne prouvait plus qu'on n'avait pas cassé un planning de Kevin.
 *
 * LA RÈGLE : il existe, AU COFFRE, un robot qui lance les étapes que le public ne peut pas
 * lancer ; sa liste est DÉDUITE de l'export (jamais recopiée) ; et il ne part jamais au public.
 *
 * node tests/verify-chaine-privee.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github/workflows');
let pass = 0;
const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/* 1. L'outil existe, et il DÉDUIT sa liste au lieu de la recopier. */
const OUTIL = 'tools/depot-public/chaine-privee.mjs';
ok(existsSync(join(ROOT, OUTIL)), `${OUTIL} manque : plus rien ne sait QUELLES étapes seul le coffre peut lancer`);
if (existsSync(join(ROOT, OUTIL))) {
  const t = readFileSync(join(ROOT, OUTIL), 'utf8');
  ok(/exporter\.mjs/.test(t),
    `${OUTIL} : doit FABRIQUER l'export public pour en déduire la liste — une liste recopiée périme en silence (c'est ce qui a gelé le site le 26.09)`);
  ok(/process\.exit\(2\)/.test(t),
    `${OUTIL} : doit refuser de conclure si l'export est illisible ou si la liste ressort vide — « 0 contrôle » n'est pas « tout va bien » (leçon m108)`);
}

/* 2. Le script npm existe et appelle cet outil. */
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const sc = (pkg.scripts || {})['test:ci-prive'] || '';
ok(sc.includes('chaine-privee.mjs'), 'le script npm test:ci-prive doit lancer tools/depot-public/chaine-privee.mjs');

/* 3. Un robot du COFFRE le lance vraiment (une commande, pas une mention). */
const lanceurs = readdirSync(WF).filter((f) => /\.ya?ml$/.test(f))
  .filter((f) => /run:[^\n]*test:ci-prive|npm run -s test:ci-prive|npm run test:ci-prive/.test(sansCommentaires(readFileSync(join(WF, f), 'utf8'))));
ok(lanceurs.length > 0,
  'aucun workflow ne LANCE test:ci-prive : les 109 étapes que seul le coffre peut vérifier ne tourneraient nulle part (mesuré le 26.09 après la bascule)');

for (const f of lanceurs) {
  const t = readFileSync(join(WF, f), 'utf8');
  const code = sansCommentaires(t);
  /* 4. Il ne part jamais au dépôt public : là-bas, les fichiers privés n'existent pas. */
  const regles = JSON.parse(readFileSync(join(ROOT, 'tools/depot-public/regles.json'), 'utf8'));
  ok((regles.workflows_prives || []).includes('.github/workflows/' + f),
    `${f} : doit figurer dans workflows_prives de regles.json — au dépôt public il échouerait faute des fichiers privés`);
  /* 5. Il tourne au coffre, et seulement là. */
  ok(/if:[^\n]*github\.repository\s*==\s*'9r4rxssx64-creator\/CMCteams'/.test(code),
    `${f} : doit être limité au coffre (github.repository) — ailleurs il n'a pas les fichiers privés`);
  /* 6. Il se déclenche sur une vraie occasion (PR ou main), pas seulement à la main. */
  ok(/^on:/m.test(code) && /pull_request|push:/.test(code),
    `${f} : doit partir sur une pull_request ou un push (un contrôle qu'il faut penser à lancer ne protège personne)`);
  /* 7. Réflexe ci-no-stampede. */
  const grp = (code.match(/group:\s*([^\n]+)/) || [])[1] || '';
  ok(!/cancel-in-progress:\s*true/.test(code) || /github\.ref/.test(grp),
    `${f} : cancel-in-progress vrai sans \${{ github.ref }} dans le groupe → il annulerait la vérification d'une autre branche`);
  /* 8. Il installe les paquets : sans eux, la moitié des étapes meurt (mesuré le 26.09). */
  ok(/npm (install|ci)\b/.test(code),
    `${f} : doit installer les paquets — sans pdfjs-dist / axe-core / playwright, les étapes privées échouent pour une raison qui n'a rien à voir avec le code`);
}

console.log(`Chaîne privée du coffre : ${pass} vérifications OK, ${fails.length} échec(s)`);
if (lanceurs.length) console.log(`  (robot : ${lanceurs.join(', ')})`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
