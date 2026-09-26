#!/usr/bin/env node
/* GARDE « DOCS TEMPS RÉEL » — Kevin 2026-08-12 :
   « Mets tous les documents à jour temps réel toujours sans que je te le répète. »

   POURQUOI CE FICHIER EXISTE : la règle « docs à jour » était déjà écrite dans CLAUDE.md
   depuis le 2026-05-16… et Kevin a quand même dû la redemander (MEMO_RESUME et
   KEVIN_INVENTORY avaient une session complète de retard). Une règle qui ne vit que dans
   un document dépend de ma mémoire → elle finit par être sautée. Ici elle devient
   MÉCANIQUE : si du CODE change sans que les docs bougent, le contrôle échoue.

   RÈGLE VÉRIFIÉE : sur une branche de travail, si des fichiers de CODE ont changé
   par rapport à `main`, alors MEMO_RESUME.md (état de session) doit avoir changé aussi.
   Si des fichiers ont été CRÉÉS, KEVIN_INVENTORY.md doit avoir changé aussi
   (c'est là que Kevin retrouve ses fichiers + liens cliquables).

   FAIL-OPEN VOLONTAIRE (ne bloque jamais à tort) : pas de git, pas de `main`,
   aucune différence, ou uniquement des docs/tests modifiés → on passe.

   Lancement : node tools/audit/docs-fraicheur.cjs   (= npm run test:docs-frais)
*/
'use strict';
const { execSync } = require('child_process');

const DOC_SESSION = 'MEMO_RESUME.md';
const DOC_FICHIERS = 'KEVIN_INVENTORY.md';
/* Docs et tests ne "comptent" pas comme du code : les modifier seuls n'oblige à rien. */
const NEUTRES = [
  /^[A-Z_]+\.md$/, /^docs\//, /^audit\//, /^tests?\//, /^tools\/audit\//,
  /^tools\/memory\//, /\.md$/, /^\.claude\//,
];

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return null; }
}
function ok(msg) { console.log('✅ ' + msg); }
function info(msg) { console.log('   ' + msg); }

if (!sh('git rev-parse --git-dir')) { ok('docs : pas de dépôt git ici → contrôle sauté.'); process.exit(0); }

/* Base de comparaison : le point commun avec main (local, sinon origin). */
const base = sh('git merge-base HEAD origin/main') || sh('git merge-base HEAD main');
if (!base) { ok('docs : pas de branche `main` pour comparer → contrôle sauté.'); process.exit(0); }

const head = sh('git rev-parse HEAD');
if (base === head) { ok('docs : rien de neuf par rapport à main → rien à documenter.'); process.exit(0); }

/* On regarde le travail COMMITTÉ (base..HEAD) **et** le travail EN COURS (working tree) :
   sinon le garde crierait à tort pendant qu'on est justement en train d'écrire les docs. */
/* Ligne porcelain = « XY chemin ». Pas de slice(3) : sh() fait trim() sur TOUT le résultat, donc la
   1ʳᵉ ligne « ␣M KEVIN_INVENTORY.md » perdait son espace et devenait « EVIN_INVENTORY.md » (vécu le
   5.09.2026 : l'inventaire, alphabétiquement premier, n'était JAMAIS vu comme modifié). */
const enCours = (sh('git status --porcelain') || '').split('\n').filter(Boolean)
  .map((l) => l.trim().replace(/^\S{1,2}\s+/, '').replace(/^.* -> /, '')).filter(Boolean);
const modifies = [...new Set([
  ...(sh(`git diff --name-only ${base} HEAD`) || '').split('\n').filter(Boolean),
  ...enCours,
])];
const crees = [...new Set([
  ...(sh(`git diff --name-only --diff-filter=A ${base} HEAD`) || '').split('\n').filter(Boolean),
  ...(sh('git ls-files --others --exclude-standard') || '').split('\n').filter(Boolean),
])];
if (!modifies.length) { ok('docs : aucun fichier modifié → contrôle sauté.'); process.exit(0); }

const estNeutre = (f) => NEUTRES.some((r) => r.test(f));
const code = modifies.filter((f) => !estNeutre(f));
const codeCree = crees.filter((f) => !estNeutre(f));

if (!code.length) { ok('docs : seuls des documents/tests ont changé → rien à documenter.'); process.exit(0); }

const manque = [];
if (!modifies.includes(DOC_SESSION)) manque.push(DOC_SESSION);
if (codeCree.length && !modifies.includes(DOC_FICHIERS)) manque.push(DOC_FICHIERS);

if (!manque.length) {
  ok(`docs à jour : ${code.length} fichier(s) de code modifié(s), ${DOC_SESSION}` +
     (codeCree.length ? ` + ${DOC_FICHIERS}` : '') + ' suivent.');
  process.exit(0);
}

console.log('\n❌ DOCS EN RETARD — règle Kevin « docs à jour en temps réel, sans avoir à le redire ».\n');
console.log(`Code modifié depuis main (${code.length}) :`);
code.slice(0, 12).forEach((f) => info('· ' + f));
if (code.length > 12) info(`… et ${code.length - 12} autre(s)`);
if (codeCree.length) {
  console.log(`\nFichiers CRÉÉS (${codeCree.length}) — ils doivent être listés avec leur lien :`);
  codeCree.slice(0, 10).forEach((f) => info('· ' + f));
}
console.log('\nÀ mettre à jour AVANT de pousser :');
manque.forEach((d) => info('→ ' + d + (d === DOC_SESSION
  ? '  (où on en est : ce qui est livré, les décisions, les pièges)'
  : '  (les nouveaux fichiers + leur lien GitHub cliquable)')));
console.log('\n(Rappel : une nouvelle règle Kevin → CLAUDE.md · une leçon → LESSONS.md ·');
console.log(' une action qui attend Kevin → KEVIN_ACTIONS_TODO.md)\n');
process.exit(1);
