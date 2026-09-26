/* PREUVE — la file d'attente GitHub ne peut plus s'engorger toute seule.
 *
 * Le 6 août 2026, 399 exécutions étaient bloquées en file d'attente (la plus
 * vieille datait de l'avant-veille) alors qu'UNE SEULE tournait : chaque commit
 * empilait une nouvelle vague sans effacer la précédente. Résultat : plus rien
 * ne sortait, et les vérifications qui comptent (déploiements, tests) restaient
 * coincées derrière des exécutions déjà périmées.
 *
 * Garde permanente : tout ouvrage déclenché par un commit ou une pull request
 * DOIT porter un garde « une seule à la fois par branche » :
 *     concurrency:
 *       group: ${{ github.workflow }}-${{ github.ref }}
 *       cancel-in-progress: true     (false pour un déploiement)
 * Ainsi un nouveau commit REMPLACE l'ancien au lieu de s'ajouter à la file.
 *
 * Lancer : node tests/verify-ci-no-stampede.mjs
 */
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(new URL('../.github/workflows', import.meta.url).pathname);
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

const fichiers = fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
chk(fichiers.length > 0, `${fichiers.length} ouvrages automatiques analysés`);

/** Extrait le bloc « on: » (jusqu'à la prochaine clé de premier niveau). */
function blocOn(src) {
  const m = src.match(/^on:(.*?)(?=^[A-Za-z]|\Z)/ms);
  return m ? m[1] : '';
}
/** Bloc « concurrency: » SANS les commentaires (sinon un exemple écrit dans un
 *  commentaire — « ne pas remettre true » — serait lu comme un réglage réel). */
function blocGarde(src) {
  const m = src.match(/^concurrency:\s*\n((?:[ \t]+.*\n)+)/m);
  if (!m) return null;
  return m[1].split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
}
/** Un déploiement ne doit jamais être coupé en plein vol (leçon Pages 2026-08-04). */
const estDeploiement = (f) => /deploy|publish|release|pages|wrangler|merge/i.test(f);

const sansGarde = [];
const tueLesAutresBranches = [];
const deploiementCoupable = [];
const surChaqueCommit = [];
let total = 0;

for (const f of fichiers) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const on = blocOn(src);
  if (!/^\s+(push|pull_request|pull_request_target):/m.test(on)) continue;
  total++;

  // sans filtre de chemins = tourne à CHAQUE commit du dépôt
  if (!/paths(-ignore)?:/.test(on)) surChaqueCommit.push(f);

  const bloc = blocGarde(src);
  if (!bloc) { sansGarde.push(f); continue; }
  const grp = (bloc.match(/group:\s*(.+)/) || [, ''])[1];
  const annule = /cancel-in-progress:\s*true/.test(bloc);
  // un groupe FIXE (sans ${{ }}) qui annule = un commit sur une branche efface
  // les vérifications d'une AUTRE branche. Groupe fixe sans annulation = OK
  // (mise en file d'attente volontaire sur une cible partagée, ex. Pages).
  if (annule && !grp.includes('${{')) tueLesAutresBranches.push(`${f} (group: ${grp.trim()})`);
  if (estDeploiement(f) && annule) deploiementCoupable.push(f);
}

chk(sansGarde.length === 0,
  sansGarde.length === 0
    ? `les ${total} ouvrages lancés par un commit ont tous un garde anti-empilement`
    : `${sansGarde.length} ouvrage(s) SANS garde — ils s'empileront dans la file : ${sansGarde.slice(0, 8).join(', ')}`);

chk(tueLesAutresBranches.length === 0,
  tueLesAutresBranches.length === 0
    ? 'aucun garde n\'annule les vérifications d\'une AUTRE branche (groupe fixe + annulation)'
    : `un commit y efface le travail d\'une autre branche : ${tueLesAutresBranches.join(', ')}`);

chk(deploiementCoupable.length === 0,
  deploiementCoupable.length === 0
    ? 'aucun déploiement ne peut être coupé en plein vol (cancel-in-progress: false)'
    : `déploiement interruptible (risque de laisser un site à moitié publié) : ${deploiementCoupable.join(', ')}`);

// plafond : ne pas laisser repousser le nombre d'ouvrages qui tournent sur CHAQUE commit
const PLAFOND = 8;
chk(surChaqueCommit.length <= PLAFOND,
  `${surChaqueCommit.length} ouvrage(s) tournent sur chaque commit sans filtre de fichiers (plafond ${PLAFOND})`
  + (surChaqueCommit.length ? ' : ' + surChaqueCommit.join(', ') : ''));

console.log('=== FILE D\'ATTENTE GITHUB — ANTI-EMPILEMENT ===');
R.ok.forEach((m) => console.log('  OK ' + m));
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
