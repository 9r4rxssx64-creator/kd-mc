/* GARDE — HYGIÈNE DU DÉPÔT : ce qu'une session pressée casse sans le voir (Kevin 3.10.2026 : « dis à tes autres branches qu'elles
 * vérifient leur travail en automatisant au maximum tout »).
 *
 * Trois accidents réels du 3.10, tous silencieux, tous attrapés ici avant la fusion :
 *   1. un LIEN SYMBOLIQUE `node_modules` (créé pour un worktree) commité par `git add -A` — « node_modules/ » dans .gitignore ne vise que
 *      les dossiers. Fusionné, il remplaçait le vrai dossier par un lien sur lui-même : « Too many levels of symbolic links », les
 *      138 étapes de la chaîne privée tombaient en 0 s sans un mot ;
 *   2. des SCRIPTS FANTÔMES dans package.json (un nom de script = un chemin, une commande vers un fichier qui n'existe pas), appelés par
 *      test:ci → test:ci rouge pour TOUTES les sessions (commit 662f846a8, retiré deux fois à la main) ;
 *   3. une RÈGLE ajoutée à CLAUDE-HISTOIRE.md sans garde au registre (déjà couverte par test:improvements-guard).
 *
 * Ce garde ajoute les contrôles mécaniques manquants :
 *   A. aucun lien symbolique suivi par git (sauf liste blanche) ;
 *   B. chaque étape de test:ci est un script qui existe ;
 *   C. chaque script `node <fichier>` vise un fichier qui existe ;
 *   D. aucun nom de script ne ressemble à un chemin (« services/x/y.test.mjs », « tests/z.mjs ») ;
 *   E. aucune étape en double dans test:ci (du temps de chaîne et des minutes gratuites perdus) ;
 *   F. un test ÉCRIT mais jamais LANCÉ est une déclaration sans déploiement (règle du 30.04) : le nombre de tests orphelins ne peut
 *      qu'AVANCER VERS ZÉRO (plafond mesuré, qui ne monte jamais).
 * Sabotage prouvé : chaque contrôle devient rouge sur la faute qu'il vise (tests/verify-hygiene-depot.mjs --sabotage).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m, detail) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m + (detail ? ' — ' + detail : '')); } };
/* Plafond des tests écrits mais jamais lancés. MESURÉ le 3.10.2026 ; il ne doit que BAISSER (quand un orphelin est câblé ou supprimé,
   baisser ce nombre dans le même commit : le garde l'exige, sinon le plafond ne serait qu'un trou). */
export const PLAFOND_ORPHELINS = 0;   // mesuré le 3.10 : 12 → 11 câblés (test:routeur-divers, test:kdmc-access) + 1 déclaré manuel ci-dessous
/* Tests LANCÉS À LA MAIN, jamais en CI, avec la raison écrite : un orphelin s'avoue ici ou se câble, il ne reste pas silencieux. */
export const MANUELS = {
  'tests/verify-app-as-kevin.mjs': 'ouvre l\'app EN VRAI comme Kevin (session et réseau réels) : lancé par le robot de vérif réelle, pas par test:ci',
};

export function analyser(pkg, fichiersSuivis, liensSuivis, existe) {
  const S = pkg.scripts || {};
  const r = { liens: [], etapesAbsentes: [], fichiersAbsents: [], nomsChemins: [], doublons: [], orphelins: [] };
  r.liens = liensSuivis.filter((l) => !/^(?:docs?\/)?exemple\//.test(l));
  const ci = String(S['test:ci'] || '').split('&&').map((x) => x.trim()).filter(Boolean);
  const vus = new Set();
  for (const e of ci) {
    const m = e.match(/^npm run (?:-s )?(\S+)$/);
    if (!m) continue;
    if (!(m[1] in S)) r.etapesAbsentes.push(m[1]);
    if (vus.has(m[1])) r.doublons.push(m[1]); vus.add(m[1]);
  }
  const cibles = new Set(), motifs = [];
  for (const [nom, cmd] of Object.entries(S)) {
    if (/[\/]/.test(nom) || /\.(?:mjs|cjs|js|ts)$/.test(nom)) r.nomsChemins.push(nom);
    for (const seg of String(cmd).split(/&&|;|\|\|/)) {
      const m = seg.trim().match(/^(?:node(?:\s+--?[\w-]+(?:=\S+)?)*)\s+(\S+\.(?:mjs|cjs|js))\b/);
      /* un fichier de /tmp est fabriqué par le script lui-même ; un motif à * se compare aux fichiers suivis (plus bas) */
      if (m && !m[1].startsWith('/tmp/') && !m[1].includes('*')) { cibles.add(m[1]); if (!existe(m[1])) r.fichiersAbsents.push(nom + ' → ' + m[1]); }
    }
    for (const m of String(cmd).matchAll(/\b(?:node|bash|sh|python3?)\s+(?:--test\s+)?((?:tests|tools|services|scripts)\/[\w./*-]+\.(?:mjs|cjs|js|test\.mjs|sh|py))/g)) {
      if (m[1].includes('*')) motifs.push(new RegExp('^' + m[1].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$')); else cibles.add(m[1]);
    }
  }
  const candidats = fichiersSuivis.filter((f) => /^tests\/(?:verify-[\w.-]+|[\w.-]+\.test)\.mjs$/.test(f) || /^services\/[\w-]+\/[\w.-]+\.test\.mjs$/.test(f));
  for (const f of candidats) {
    const cite = cibles.has(f) || motifs.some((re) => re.test(f));
    /* un test peut aussi être lancé par un autre test ou un workflow : on cherche son nom dans les workflows et les scripts */
    if (!cite) r.orphelins.push(f);
  }
  return r;
}

function git(...a) { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const suivis = git('ls-files').split('\n').filter(Boolean);
  const liens = git('ls-files', '-s').split('\n').filter((l) => l.startsWith('120000')).map((l) => l.split('\t')[1]);
  const existe = (f) => fs.existsSync(path.join(ROOT, f));
  /* les workflows lancent aussi des tests directement (node tests/x.mjs) : on les compte comme « lancés » */
  const wf = suivis.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f)).map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const r = analyser(pkg, suivis, liens, existe);
  r.orphelins = r.orphelins.filter((f) => !wf.includes(f) && !wf.includes(path.basename(f)) && !(f in MANUELS));

  console.log('A. Liens symboliques');
  chk(r.liens.length === 0, 'aucun lien symbolique suivi par git (un `node_modules` commité casse npm run chez tout le monde)', r.liens.join(', '));
  console.log('B. Les étapes de test:ci existent');
  chk(r.etapesAbsentes.length === 0, 'chaque étape de test:ci est un script qui existe', r.etapesAbsentes.join(', '));
  console.log('C. Les scripts visent des fichiers qui existent');
  chk(r.fichiersAbsents.length === 0, 'chaque script « node <fichier> » vise un fichier présent', r.fichiersAbsents.slice(0, 5).join(' ; '));
  console.log('D. Aucun nom de script ne ressemble à un chemin');
  chk(r.nomsChemins.length === 0, 'pas de script nommé comme un chemin (outil d\'ajout de script mal utilisé)', r.nomsChemins.join(', '));
  console.log('E. Pas d\'étape en double');
  chk(r.doublons.length === 0, 'aucune étape en double dans test:ci', r.doublons.join(', '));
  console.log('F. Tests écrits mais jamais lancés');
  chk(r.orphelins.length <= PLAFOND_ORPHELINS, `tests orphelins : ${r.orphelins.length} ≤ plafond ${PLAFOND_ORPHELINS}`, r.orphelins.slice(0, 8).join(', '));
  chk(r.orphelins.length === PLAFOND_ORPHELINS, `le plafond est JUSTE (${r.orphelins.length} mesurés, plafond ${PLAFOND_ORPHELINS}) — s'il a baissé, baisse-le dans ce même commit`);

  /* sabotage : chaque contrôle voit la faute qu'il vise (sur une copie en mémoire, rien n'est écrit) */
  console.log('G. Sabotage (chaque contrôle devient rouge sur sa faute)');
  const base = { scripts: { 'test:a': 'node tests/a.mjs', 'test:ci': 'npm run test:a' } };
  const bon = analyser(base, ['tests/a.mjs'], [], () => true);
  chk(!bon.liens.length && !bon.etapesAbsentes.length && !bon.fichiersAbsents.length && !bon.nomsChemins.length && !bon.doublons.length && !bon.orphelins.length, 'une copie saine est verte');
  chk(analyser(base, [], ['node_modules'], () => true).liens.length === 1, 'sabotage A : un lien `node_modules` suivi est vu');
  chk(analyser({ scripts: { 'test:ci': 'npm run test:fantome' } }, [], [], () => true).etapesAbsentes[0] === 'test:fantome', 'sabotage B : une étape de test:ci sans script est vue');
  chk(analyser(base, [], [], () => false).fichiersAbsents.length === 1, 'sabotage C : un script vers un fichier absent est vu');
  chk(analyser({ scripts: { 'services/x/y.test.mjs': 'node tests/a.mjs' } }, [], [], () => true).nomsChemins.length === 1, 'sabotage D : un script nommé comme un chemin est vu');
  chk(analyser({ scripts: { 'test:a': 'node tests/a.mjs', 'test:ci': 'npm run test:a && npm run test:a' } }, [], [], () => true).doublons[0] === 'test:a', 'sabotage E : une étape en double est vue');
  chk(analyser(base, ['tests/a.mjs', 'tests/verify-oublie.mjs'], [], () => true).orphelins[0] === 'tests/verify-oublie.mjs', 'sabotage F : un test jamais lancé est vu');

  console.log(`\n${ok} ✅ / ${ko} ❌`);
  process.exit(ko ? 1 : 0);
}
