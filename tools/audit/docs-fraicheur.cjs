#!/usr/bin/env node
/* GARDE « DOCS TEMPS RÉEL » — Kevin 2026-08-12 :
   « Mets tous les documents à jour temps réel toujours sans que je te le répète. »
   RENFORCÉ le 2026-10-08 — Kevin : « Met toujours à jour tous les documents importants, leçons,
   sans que je te le répète sans cesse. […] Pourquoi, si c'est déjà la règle, tu ne l'appliques
   pas toujours ? »

   POURQUOI CE FICHIER EXISTE : la règle « docs à jour » était déjà écrite dans CLAUDE.md
   depuis le 2026-05-16… et Kevin a quand même dû la redemander (MEMO_RESUME et
   KEVIN_INVENTORY avaient une session complète de retard). Une règle qui ne vit que dans
   un document dépend de ma mémoire → elle finit par être sautée. Ici elle devient
   MÉCANIQUE : si du CODE change sans que les docs bougent, le contrôle échoue.

   POURQUOI IL A ÉTÉ RENFORCÉ (8.10.2026) : le garde ne regardait QUE MEMO_RESUME et
   KEVIN_INVENTORY. Une session entière (11 personnes retrouvées dans l'import, novembre 2026,
   journal admin, 3 nouveaux tests, 3 versions) est passée « verte » alors que LESSONS.md,
   NOTES_USER.md, ETAT-DU-MOMENT.md et IMPORTS-KEVIN.md n'avaient pas bougé. Un garde vert qui
   ne couvre pas la règle est pire qu'aucun garde : il rassure. Donc il couvre maintenant la
   règle entière, document par document.

   RÈGLES VÉRIFIÉES (par rapport à `main`, committé + en cours) :
     R1  du CODE a changé                      ⇒ MEMO_RESUME.md a changé (où on en est)
     R2  des fichiers de code ont été CRÉÉS    ⇒ KEVIN_INVENTORY.md a changé (liens cliquables)
     R3  un NOUVEAU TEST / garde a été créé     ⇒ LESSONS.md a changé (un garde = une leçon qui dit
                                                  pourquoi il existe, sinon il sera retiré un jour)
     R4  une VERSION a bougé (version.txt, tools/departs/version.txt)
                                               ⇒ la nouvelle version est ÉCRITE dans MEMO_RESUME.md
                                                  (pas seulement « le fichier a changé »)
     R5  un PLANNING de Kevin a été ajouté (tests/fixtures/*.pdf)
                                               ⇒ IMPORTS-KEVIN.md a changé (règle du 8.10 : chaque
                                                  import de Kevin est examiné et noté)
     R6  le ROUTEUR du domaine a changé (services/kdmc-router/worker.js)
                                               ⇒ ETAT-DU-MOMENT.md a changé (la vérité du jour,
                                                  servie à chaque réveil de chaque branche)

   FAIL-OPEN VOLONTAIRE (ne bloque jamais à tort) : pas de git, pas de `main`, aucune
   différence, ou rien qui déclenche une règle → on passe.

   Prouvé discriminant par tests/docs-fraicheur.test.mjs (dépôt git jetable, chaque règle
   rougit sans son document et verdit avec) — `npm run test:docs-frais-garde`.

   Lancement : node tools/audit/docs-fraicheur.cjs   (= npm run test:docs-frais)
*/
'use strict';
const { execSync } = require('child_process');
const { readFileSync, existsSync } = require('fs');

const DOC_SESSION = 'MEMO_RESUME.md';
const DOC_FICHIERS = 'KEVIN_INVENTORY.md';
const DOC_LECONS = 'LESSONS.md';
const DOC_IMPORTS = 'IMPORTS-KEVIN.md';
const DOC_ETAT = 'ETAT-DU-MOMENT.md';
const FICHIERS_VERSION = ['version.txt', 'tools/departs/version.txt'];
const ROUTEUR = 'services/kdmc-router/worker.js';
/* Docs et tests ne "comptent" pas comme du code : les modifier seuls n'oblige à rien (R1/R2). */
const NEUTRES = [
  /^[A-Z_]+\.md$/, /^docs\//, /^audit\//, /^tests?\//, /^tools\/audit\//,
  /^tools\/memory\//, /\.md$/, /^\.claude\//,
];
/* Un « test / garde » : tests/*.mjs|cjs|js, ou n'importe quel *.test.* ailleurs (routeur, apps). */
const EST_TEST = (f) => (/^tests?\/.*\.(mjs|cjs|js)$/.test(f) && !/^tests?\/(fixtures|lib)\//.test(f))
  || /\.test\.(mjs|cjs|js|ts)$/.test(f);
const EST_PLANNING = (f) => /^tests\/fixtures\/.*\.pdf$/i.test(f);

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return null; }
}
function ok(msg) { console.log('✅ ' + msg); }
function info(msg) { console.log('   ' + msg); }
function lire(f) { try { return readFileSync(f, 'utf8'); } catch (_) { return ''; } }

if (!sh('git rev-parse --git-dir')) { ok('docs : pas de dépôt git ici → contrôle sauté.'); process.exit(0); }

/* Base de comparaison : le point commun avec main (local, sinon origin). */
const base = sh('git merge-base HEAD origin/main') || sh('git merge-base HEAD main');
if (!base) { ok('docs : pas de branche `main` pour comparer → contrôle sauté.'); process.exit(0); }

const head = sh('git rev-parse HEAD');
const enCoursBrut = (sh('git status --porcelain') || '').split('\n').filter(Boolean);
if (base === head && !enCoursBrut.length) { ok('docs : rien de neuf par rapport à main → rien à documenter.'); process.exit(0); }

/* On regarde le travail COMMITTÉ (base..HEAD) **et** le travail EN COURS (working tree) :
   sinon le garde crierait à tort pendant qu'on est justement en train d'écrire les docs. */
/* Ligne porcelain = « XY chemin ». Pas de slice(3) : sh() fait trim() sur TOUT le résultat, donc la
   1ʳᵉ ligne « ␣M KEVIN_INVENTORY.md » perdait son espace et devenait « EVIN_INVENTORY.md » (vécu le
   5.09.2026 : l'inventaire, alphabétiquement premier, n'était JAMAIS vu comme modifié). */
const enCours = enCoursBrut
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
const testsCrees = crees.filter(EST_TEST);
const planningsAjoutes = crees.filter(EST_PLANNING);
const versionsBougees = FICHIERS_VERSION.filter((f) => modifies.includes(f) && existsSync(f));
const routeurBouge = modifies.includes(ROUTEUR);

/* Chaque manque = [document, pourquoi]. */
const manque = [];
const touche = (d) => modifies.includes(d);

if (code.length && !touche(DOC_SESSION)) manque.push([DOC_SESSION, 'R1 : du code a changé → où on en est (livré, décisions, pièges)']);
if (codeCree.length && !touche(DOC_FICHIERS)) manque.push([DOC_FICHIERS, 'R2 : des fichiers ont été créés → les lister avec leur lien GitHub cliquable']);
if (testsCrees.length && !touche(DOC_LECONS)) manque.push([DOC_LECONS, 'R3 : un nouveau test/garde existe → la leçon qui dit POURQUOI il existe (numérotée, ✅)']);
const versionsNonEcrites = [];
if (versionsBougees.length) {
  const memo = lire(DOC_SESSION);
  for (const f of versionsBougees) {
    const v = lire(f).trim();
    if (v && !memo.includes(v)) versionsNonEcrites.push(`${f} = ${v}`);
  }
  if (versionsNonEcrites.length) manque.push([DOC_SESSION, `R4 : version(s) livrée(s) mais pas ÉCRITE(S) dans ${DOC_SESSION} : ${versionsNonEcrites.join(', ')}`]);
}
if (planningsAjoutes.length && !touche(DOC_IMPORTS)) manque.push([DOC_IMPORTS, `R5 : planning(s) de Kevin ajouté(s) (${planningsAjoutes.join(', ')}) → ligne avec verdict (✅/🛠️/⏭️/🏠)`]);
if (routeurBouge && !touche(DOC_ETAT)) manque.push([DOC_ETAT, 'R6 : le routeur du domaine a changé → la vérité du jour (date en tête + ligne du tableau)']);

const rien = !code.length && !testsCrees.length && !versionsBougees.length && !planningsAjoutes.length && !routeurBouge;
if (rien) { ok('docs : seuls des documents ont changé → rien à documenter.'); process.exit(0); }

if (!manque.length) {
  const suivent = [DOC_SESSION];
  if (codeCree.length) suivent.push(DOC_FICHIERS);
  if (testsCrees.length) suivent.push(DOC_LECONS);
  if (planningsAjoutes.length) suivent.push(DOC_IMPORTS);
  if (routeurBouge) suivent.push(DOC_ETAT);
  ok(`docs à jour : ${code.length} fichier(s) de code, ${testsCrees.length} test(s) créé(s), ${versionsBougees.length} version(s), ` +
     `${planningsAjoutes.length} planning(s), routeur ${routeurBouge ? 'touché' : 'intact'} — ${[...new Set(suivent)].join(' + ')} suivent.`);
  process.exit(0);
}

console.log('\n❌ DOCS EN RETARD — règle Kevin « docs à jour en temps réel, sans avoir à le redire » (8.10.2026 : « toutes les leçons, tous les documents importants »).\n');
if (code.length) {
  console.log(`Code modifié depuis main (${code.length}) :`);
  code.slice(0, 12).forEach((f) => info('· ' + f));
  if (code.length > 12) info(`… et ${code.length - 12} autre(s)`);
}
if (codeCree.length) {
  console.log(`\nFichiers CRÉÉS (${codeCree.length}) — ils doivent être listés avec leur lien :`);
  codeCree.slice(0, 10).forEach((f) => info('· ' + f));
}
if (testsCrees.length) {
  console.log(`\nTests / gardes CRÉÉS (${testsCrees.length}) — chacun a une leçon :`);
  testsCrees.slice(0, 10).forEach((f) => info('· ' + f));
}
if (versionsBougees.length) console.log(`\nVersions livrées : ${versionsBougees.map((f) => f + ' = ' + lire(f).trim()).join(', ')}`);
if (planningsAjoutes.length) console.log(`\nPlannings de Kevin ajoutés : ${planningsAjoutes.join(', ')}`);
if (routeurBouge) console.log(`\nRouteur du domaine modifié : ${ROUTEUR}`);
console.log('\nÀ mettre à jour AVANT de pousser :');
manque.forEach(([d, pourquoi]) => info('→ ' + d + '  (' + pourquoi + ')'));
console.log('\n(Rappel : une nouvelle règle Kevin → CLAUDE-HISTOIRE.md puis `npm run claude-md:index` · une info métier → NOTES_USER.md ·');
console.log(' une action qui attend Kevin → KEVIN_ACTIONS_TODO.md · prévenir les autres branches → pipeline/sessions.json)\n');
process.exit(1);
