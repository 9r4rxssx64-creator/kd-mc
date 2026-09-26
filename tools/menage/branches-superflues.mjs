#!/usr/bin/env node
/* Quelles branches `claude/*` ne contiennent PLUS rien que `main` n'ait déjà ?
 * ===========================================================================
 * POURQUOI CE FICHIER EXISTE (mesuré le 10.09.2026, ETAT-INFRA « Ménage des branches »)
 *
 * Le ménage d'`auto-merge-claude.yml` garde une branche tant que
 * `git merge-base --is-ancestor <branche> origin/main` est faux. C'est la bonne
 * question quand les deux partagent une histoire. Ici ce n'est plus le cas :
 * **l'historique de `main` a été reconstruit le 09.08** (main = 115 commits,
 * ancêtre commun à 3 commits), et **314 branches sur 361 n'ont AUCUN ancêtre
 * commun** avec elle. Pour toutes celles-là la réponse est « pas ancêtre » —
 * donc gardées pour toujours — alors que leur contenu est déjà dans `main`.
 *
 * Quand l'histoire ment, on regarde le CONTENU. `git diff --name-status main
 * <branche>` dit, fichier par fichier, ce que la branche ferait à `main` :
 *   A = un fichier que `main` n'a pas   → il DISPARAÎTRAIT avec la branche
 *   M = un fichier différent            → voir l'avertissement ci-dessous
 *   D = un fichier que `main` a en plus → la branche est simplement en retard
 *
 * ⚠️ CORRECTION du 10.09 (mesurée — ma première version de ce raisonnement était
 * FAUSSE, et elle était déjà écrite dans ETAT-INFRA) : je comptais `M` comme
 * « la branche apporte quelque chose ». Résultat : **0 branche sur 385** jugée
 * superflue, donc un outil inutile. Or `M` ne veut pas dire « plus récent », il
 * veut dire « différent » — et une branche d'août est différente parce qu'elle
 * est VIEILLE. Mesuré sur `claude/lingua-stories-langs-1` : 568 `A` / 378 `M`,
 * dont seulement **30 `A` hors sortie de compilation**. Les 376 `M` sont des
 * versions périmées de fichiers que `main` a en plus récent.
 *
 * La question à laquelle on PEUT répondre sûrement est donc :
 * **« quel FICHIER disparaîtrait si on supprimait cette branche ? »** — c'est-à-dire
 * les `A`, hors fichiers fabriqués (les morceaux compilés portent une empreinte
 * dans leur nom : ils sont « nouveaux » à chaque build sans rien apporter).
 * Aucun fichier unique → aucune perte de fichier.
 *
 * ⚠️ CE QUE ÇA NE PROUVE PAS, et il faut le dire : un `M` PEUT être du travail
 * non fusionné sur un fichier que `main` possède déjà (le correctif Lingua du
 * 5.09 était exactement ça). Aucune comparaison de contenu ne sait distinguer
 * « version périmée » de « correctif jamais fusionné » quand l'histoire commune
 * a disparu. C'est pour ça que le seuil d'âge par défaut est de **30 jours**
 * (la règle « stale » du dépôt) et non 7 : après un mois sans y toucher et sans
 * session inscrite, une branche n'est plus un travail en cours.
 *
 * PRUDENCE — trois verrous avant de proposer une suppression :
 *   1. jamais `main`/`master`/`develop`/`production`, jamais hors `claude/`;
 *   2. jamais une branche touchée depuis moins de N jours (30 par défaut);
 *   3. jamais une branche inscrite au registre des sessions avec un état
 *      autre que « termine » — une session vivante garde sa branche.
 *
 * LIMITE ASSUMÉE, à connaître : une branche dont le seul apport serait de
 * MODIFIER ou de SUPPRIMER un fichier que `main` possède déjà apparaît ici comme
 * superflue (aucun fichier ne disparaîtrait). C'est le prix à payer pour que
 * l'outil serve à quelque chose — compensé par les 30 jours et le registre.
 * Le dire vaut mieux que le cacher.
 *
 * Ce script ne supprime RIEN. Il constate et il liste — c'est le workflow qui
 * décide. Aujourd'hui la suppression est de toute façon refusée par le ruleset
 * `16725169` (condition `~ALL` au lieu de la branche par défaut).
 *
 * Lancer :
 *   node tools/menage/branches-superflues.mjs              # tableau lisible
 *   node tools/menage/branches-superflues.mjs --json       # pour un script
 *   node tools/menage/branches-superflues.mjs --jours 90   # encore plus prudent
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROTEGEES = ['main', 'master', 'develop', 'production'];
/* Fichiers FABRIQUÉS : leur nom porte une empreinte de compilation, ils sont
   « nouveaux » à chaque build sans rien apporter. Mesuré : 37 120 des 37 871
   fichiers absents de `main` sont des morceaux compilés d'apex-ai-v13. Les
   compter comme un apport rend l'outil aveugle. */
const FABRIQUES = [/^apex-ai-v13\/chunks\//, /^apex-ai-v13\/core\//, /^apex-ai-v13\/assets\//, /^node_modules\//];

function opt(nom, defaut) {
  const i = process.argv.indexOf('--' + nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}
const drapeau = (nom) => process.argv.includes('--' + nom);

const DEPOT = opt('depot', process.cwd());
const MAIN = opt('main', 'origin/main');
const PREFIXE = opt('prefixe', 'refs/remotes/origin/claude/');
const JOURS = Number(opt('jours', '30'));   /* règle « stale » du dépôt */

const git = (...args) =>
  execFileSync('git', ['-C', DEPOT, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

/* Sessions vivantes : leur branche ne se touche pas, même si son contenu est
   déjà dans main (elle va resservir). Registre absent → on ne protège personne,
   mais on ne plante pas non plus. */
function branchesSuivies() {
  const suivies = new Set();
  try {
    const reg = JSON.parse(readFileSync(join(DEPOT, 'pipeline/sessions.json'), 'utf8'));
    for (const s of Object.values(reg.sessions || {})) {
      if (s && s.branche && s.etat !== 'termine') suivies.add(String(s.branche));
    }
  } catch (e) { /* pas de registre ici : aucun verrou n°3, c'est tout */ }
  return suivies;
}

export function analyser({ depot = DEPOT, main = MAIN, prefixe = PREFIXE, jours = JOURS } = {}) {
  const g = (...a) => execFileSync('git', ['-C', depot, ...a], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const suivies = (() => {
    const s = new Set();
    try {
      const reg = JSON.parse(readFileSync(join(depot, 'pipeline/sessions.json'), 'utf8'));
      for (const v of Object.values(reg.sessions || {})) {
        if (v && v.branche && v.etat !== 'termine') s.add(String(v.branche));
      }
    } catch (e) { /* idem */ }
    return s;
  })();

  /* Empreintes de CONTENU présentes dans `main`, quel que soit le chemin. Un
     fichier « unique » à une branche dont le contenu existe déjà dans `main`
     n'a pas été perdu : il a été DÉPLACÉ (mesuré : 389 des 589 fichiers non
     fabriqués sont dans ce cas — surtout des workflows passés en
     `workflows-desactives`). Comparer les noms les compterait comme des pertes. */
  const arbreMain = g('ls-tree', '-r', main).split('\n').filter(Boolean);
  const contenusDeMain = new Set(arbreMain.map((l) => l.split(/\s+/)[2]));
  /* …et par NOM DE FICHIER. Le dépôt réorganise beaucoup (mesuré : les 223
     `apex-ai/v13/services/*.ts` « uniques » d'une branche d'août sont en réalité
     rangés en sous-dossiers dans `main` — `services/vault.ts` → `services/vault/…`).
     Contenu modifié + chemin changé = l'empreinte ne suffit pas ; le nom, si. */
  const nomsDeMain = new Set(arbreMain.map((l) => l.split(/\s+/).slice(3).join(' ').split('/').pop()));

  const limite = Math.floor(Date.now() / 1000) - jours * 86400;
  const lignes = g('for-each-ref', '--format=%(refname:short)%09%(committerdate:unix)', prefixe)
    .split('\n').filter(Boolean);

  const out = [];
  for (const ligne of lignes) {
    const [ref, ts] = ligne.split('\t');
    /* nom tel que GitHub le connaît : « claude/xxx », sans le « origin/ » local */
    const nom = ref.replace(/^origin\//, '');
    const base = { branche: nom, ref, date: new Date(Number(ts) * 1000).toISOString().slice(0, 10) };

    if (PROTEGEES.includes(nom) || !nom.startsWith('claude/')) {
      out.push({ ...base, verdict: 'gardee', raison: 'branche protegee' }); continue;
    }
    if (Number(ts) >= limite) {
      out.push({ ...base, verdict: 'gardee', raison: `touchee il y a moins de ${jours} jours` }); continue;
    }
    if (suivies.has(nom)) {
      out.push({ ...base, verdict: 'gardee', raison: 'session encore active au registre' }); continue;
    }

    /* --no-renames : un renommage doit compter comme A+D, pas comme un R qu'on
       aurait à interpréter. Moins malin, mais on ne se trompe pas. */
    let statuts;
    try {
      statuts = g('diff', '--name-status', '--no-renames', main, ref).split('\n').filter(Boolean);
    } catch (e) {
      out.push({ ...base, verdict: 'gardee', raison: 'comparaison impossible' }); continue;
    }
    /* Seuls les `A` sont une PERTE possible : un fichier qui n'existe que là.
       Les fichiers fabriqués sont écartés — leur nom porte une empreinte de
       build, ils sont « nouveaux » à chaque compilation sans rien apporter. */
    let uniques = statuts
      .filter((l) => l.startsWith('A'))
      .map((l) => l.split('\t').slice(1).join(' '))
      .filter((f) => !FABRIQUES.some((re) => re.test(f)));
    /* Déplacé ≠ perdu : on garde uniquement ceux dont le CONTENU est introuvable
       ailleurs dans `main`. */
    if (uniques.length) {
      const shas = g('ls-tree', '-r', ref, '--', ...uniques)
        .split('\n').filter(Boolean)
        .map((l) => { const m = l.split(/\s+/); return [m.slice(3).join(' '), m[2]]; });
      const deplaces = new Set(shas.filter(([, sha]) => contenusDeMain.has(sha)).map(([f]) => f));
      uniques = uniques.filter((f) => !deplaces.has(f) && !nomsDeMain.has(f.split('/').pop()));
    }
    const modifies = statuts.filter((l) => l.startsWith('M')).length;

    if (uniques.length) {
      out.push({
        ...base, verdict: 'gardee',
        raison: `${uniques.length} fichier(s) sans aucune trace dans main`,
        uniques: uniques.slice(0, 2000),
      });
    } else {
      out.push({
        ...base, verdict: 'supprimable',
        raison: `aucun fichier ne disparaitrait (${modifies} fichier(s) en version plus ancienne que main)`,
        modifies,
      });
    }
  }
  return out;
}

/* Exécution directe seulement — importé par le test, il ne doit rien afficher. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const res = analyser();
  if (drapeau('fichiers')) {
    /* LA liste qui compte : au lieu de trancher 321 branches une par une, on
       relit UNE fois les fichiers qui n'existent que sur ces branches. */
    const u = new Set();
    for (const r of res) for (const f of r.uniques || []) u.add(f);
    console.log(`\n📄 ${u.size} fichier(s) n'existent QUE sur des branches — a valider une fois :\n`);
    for (const f of [...u].sort()) console.log('   ' + f);
    console.log('');
  } else if (drapeau('json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    const sup = res.filter((r) => r.verdict === 'supprimable');
    const gard = res.filter((r) => r.verdict === 'gardee');
    console.log(`\n🧹 ${res.length} branche(s) examinee(s) — reference : ${MAIN}, seuil : ${JOURS} jours\n`);
    console.log(`  ✅ ${sup.length} dont AUCUN fichier ne disparaitrait`);
    console.log(`  🔒 ${gard.length} gardee(s)\n`);
    const motifs = {};
    for (const g of gard) motifs[g.raison.replace(/\d+/g, 'N')] = (motifs[g.raison.replace(/\d+/g, 'N')] || 0) + 1;
    for (const [m, n] of Object.entries(motifs).sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)} · ${m}`);
    if (sup.length) {
      console.log('\n  Les 15 plus anciennes parmi les supprimables :');
      for (const s of sup.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 15)) {
        console.log(`     ${s.date}  ${s.branche}`);
      }
    }
    console.log('\n  Ce script ne supprime rien. Aujourd\'hui la suppression est refusee par le');
    console.log('  ruleset 16725169 (condition ~ALL) — voir ETAT-INFRA, « Menage des branches ».\n');
  }
}
