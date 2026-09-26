/* PREUVE — le repli par comparaison d'ARBRES reconnaît les branches vides,
 * y compris celles qui n'ont AUCUN ancêtre commun avec `main`.
 * ===========================================================================
 * Le ménage d'`auto-merge-claude.yml` demande « cette branche est-elle un
 * ancêtre de main ? ». Depuis la reconstruction d'historique du 09.08, la
 * réponse est NON pour 314 branches sur 361 — alors que leur contenu est déjà
 * dans `main`. Elles sont donc gardées pour toujours (0 supprimée sur 385).
 *
 * Ce test fabrique un petit dépôt où l'on connaît la vérité pour chaque cas,
 * et vérifie que `tools/menage/branches-superflues.mjs` tranche juste — en
 * particulier le cas qui motive tout : **branche orpheline, contenu identique**.
 *
 * Il est DISCRIMINANT par construction : il contient les deux familles de
 * pièges (des branches qui apportent quelque chose, des branches qui
 * n'apportent rien) ; un script qui répondrait toujours pareil échouerait.
 *
 * Lancer : node tests/verify-menage-branches.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { analyser } from '../tools/menage/branches-superflues.mjs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

/* --- garde de source : le menage du workflow doit REGARDER les deux familles
   jetables, et garder son filtre de surete. Mesure du 10.09 : 453 des 461
   `auto-deploy/*` etaient deja des ancetres de main et ne partaient pas, parce
   que la boucle ne les regardait pas. */
{
  const wf = readFileSync('.github/workflows/auto-merge-claude.yml', 'utf8');
  chk(/FAMILLES=.*claude.*auto-deploy/.test(wf),
    'source : le menage regarde claude/* ET auto-deploy/* (les deux familles jetables)');
  chk(!/grep '\^origin\/claude\/'/.test(wf),
    'source : plus de filtre code en dur sur la seule famille claude/*');
  chk(/merge-base --is-ancestor "\$b" origin\/main/.test(wf),
    'source : le filtre de surete est intact — seule une branche ENTIEREMENT dans main est supprimee');
}

const D = mkdtempSync(join(tmpdir(), 'menage-'));
const git = (...a) => execFileSync('git', ['-C', D, ...a], { encoding: 'utf8' });
/* Dater les commits : le verrou « moins de N jours » se teste avec de vraies dates.
   ATTENTION — `--date` ne fixe que la date d'AUTEUR ; `for-each-ref
   %(committerdate)` lit la date de COMMIT, qui ne se règle que par
   GIT_COMMITTER_DATE. Sans ça, toutes les branches paraissent d'aujourd'hui et
   le test croit à tort que le verrou d'âge fonctionne (vu ici avant correction). */
const commit = (msg, joursAvant) => {
  const d = new Date(Date.now() - joursAvant * 86400_000).toISOString();
  execFileSync('git', ['-C', D, 'commit', '-q', '--date', d, '-m', msg], {
    encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: d, GIT_AUTHOR_DATE: d },
  });
  return d;
};
const ecrire = (p, t) => { mkdirSync(join(D, p, '..'), { recursive: true }); writeFileSync(join(D, p), t); };

try {
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');

  /* --- main : trois fichiers ------------------------------------------- */
  ecrire('a.txt', 'A'); ecrire('b.txt', 'B');
  git('add', '-A'); commit('base', 40);
  const baseMain = git('rev-parse', 'HEAD').trim();

  /* 1. VIDE — même contenu que main, partage l'histoire */
  git('checkout', '-q', '-b', 'claude/vide', baseMain);

  /* 2. NOUVEAU — ajoute un fichier que main n'a pas */
  git('checkout', '-q', '-b', 'claude/nouveau', baseMain);
  ecrire('neuf.txt', 'N'); git('add', '-A'); commit('ajout', 40);

  /* 3. MODIFIE — change un fichier que main possède déjà. Aucun fichier ne
        disparaîtrait : c'est la LIMITE ASSUMÉE de la méthode, et elle est
        testée exprès pour qu'on ne la découvre pas en production. */
  git('checkout', '-q', '-b', 'claude/modifie', baseMain);
  ecrire('a.txt', 'A modifie'); git('add', '-A'); commit('modif', 40);

  /* 3bis. FABRIQUE — n'ajoute QUE de la sortie de compilation : ne compte pas. */
  git('checkout', '-q', '-b', 'claude/fabrique', baseMain);
  ecrire('apex-ai-v13/chunks/truc-A1b2C3.js', 'build'); git('add', '-A'); commit('build', 40);

  /* 4. RECENTE — vide, mais touchée aujourd'hui : le verrou d'âge doit primer */
  git('checkout', '-q', '-b', 'claude/recente', baseMain);
  ecrire('c.txt', 'C'); git('add', '-A'); commit('recent', 0);

  /* 5. ORPHELINE — AUCUN ancêtre commun, contenu identique à main.
        C'est LE cas que `--is-ancestor` rate et qui motive ce repli. */
  git('checkout', '-q', '--orphan', 'claude/orpheline');
  git('rm', '-rq', '--cached', '.'); execFileSync('rm', ['-f', join(D, 'c.txt')]);
  ecrire('a.txt', 'A'); ecrire('b.txt', 'B');
  git('add', '-A'); commit('orpheline, meme contenu', 40);

  /* 6. INSCRITE — vide et ancienne, mais une session vivante la suit */
  git('checkout', '-q', '-b', 'claude/inscrite', baseMain);

  /* 7. EN RETARD — main gagne un fichier après coup : la branche ne fait que
        « manquer » ce fichier (statut D), elle n'apporte rien. */
  git('checkout', '-q', 'main');
  ecrire('tard.txt', 'T'); ecrire('pipeline/sessions.json', JSON.stringify({
    sessions: {
      viv: { branche: 'claude/inscrite', etat: 'actif' },
      fin: { branche: 'claude/vide', etat: 'termine' },
    },
  }, null, 2));
  git('add', '-A'); commit('main avance', 40);

  const res = analyser({ depot: D, main: 'main', prefixe: 'refs/heads/claude/', jours: 7 });
  const v = (n) => res.find((r) => r.branche === 'claude/' + n) || {};

  chk(res.length === 7, `7 branches examinees (vu : ${res.length})`);
  chk(v('vide').verdict === 'supprimable',
    `« vide » → supprimable (${v('vide').raison})`);
  chk(v('orpheline').verdict === 'supprimable',
    `« orpheline » (aucun ancetre commun, meme contenu) → supprimable — LE cas que --is-ancestor rate`);
  chk(v('nouveau').verdict === 'gardee' && /sans aucune trace/.test(v('nouveau').raison || ''),
    `« nouveau » → gardee : un fichier n'existe QUE la, il disparaitrait`);
  chk((v('nouveau').uniques || []).includes('neuf.txt'),
    '« nouveau » → et on NOMME le fichier qui disparaitrait (neuf.txt)');
  chk(v('fabrique').verdict === 'supprimable',
    '« fabrique » → supprimable : n\'ajoute que de la sortie de compilation');
  /* LIMITE ASSUMÉE, testée exprès : une modification seule ne retient pas la
     branche. C'est ce qui rend l'outil utile, et c'est ce qui le rend faillible
     — d'ou les 30 jours et le registre en amont. */
  chk(v('modifie').verdict === 'supprimable',
    '« modifie » → supprimable : aucun fichier ne disparait (LIMITE ASSUMEE, cf. en-tete)');
  chk(v('recente').verdict === 'gardee' && /moins de 7 jours/.test(v('recente').raison || ''),
    `« recente » → gardee malgre son contenu : l'age passe avant`);
  chk(v('inscrite').verdict === 'gardee' && /registre/.test(v('inscrite').raison || ''),
    `« inscrite » → gardee : une session vivante la suit`);

  /* Le contrepoint qui prouve que le test mord : sur ce meme depot,
     l'ancienne question repond « garder » pour l'orpheline ET pour la vide. */
  const estAncetre = (b) => {
    try { git('merge-base', '--is-ancestor', b, 'main'); return true; } catch (e) { return false; }
  };
  chk(estAncetre('claude/vide') === true, 'contrepoint : --is-ancestor voit bien « vide »');
  chk(estAncetre('claude/orpheline') === false,
    'contrepoint : --is-ancestor NE voit PAS « orpheline » — sans ce repli, elle reste a vie');

  /* Verrou n°3 sans registre : le script ne doit pas planter. */
  rmSync(join(D, 'pipeline'), { recursive: true, force: true });
  const sansRegistre = analyser({ depot: D, main: 'main', prefixe: 'refs/heads/claude/', jours: 7 });
  chk(sansRegistre.length === 7, 'registre absent → le script fonctionne quand meme (aucun verrou n°3)');
} finally {
  rmSync(D, { recursive: true, force: true });
}

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
