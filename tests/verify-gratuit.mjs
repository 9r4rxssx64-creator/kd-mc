/* GARDE « GRATUIT PAR DÉFAUT » — Kevin 30.09.2026 :
 * « Fais en sorte qu'à l'avenir toutes les branches, tout ton travail, respecte toutes les règles pour
 *   rester dans le gratuit […] que ça me consomme le moins de forfait […] avec une performance et un
 *   résultat équivalents à une fonction payante. Trouve des solutions, mais tout en place. »
 *
 * MESURÉ le 30.09 (API GitHub, 1 000 derniers runs du coffre, 23→30.09) : 5 241 minutes bord à bord
 * en UNE semaine sur un dépôt privé dont le forfait gratuit est de 2 000 minutes PAR MOIS ; 75 % de
 * ces minutes venaient de pushs sur des branches `claude/*` ; la chaîne privée tournait 18 min à
 * CHAQUE push d'une PR (86 fois) ; 111 workflows sur 170 n'avaient AUCUNE borne de temps (un job
 * bloqué = 6 h de quota). Résultat : budget épuisé, plus aucun robot ne démarre, le site ne se
 * republie plus. Ce garde rend la règle MÉCANIQUE (règle d'or n° 9 : une règle sans garde finit sautée).
 *
 *   R1. TOUT job de TOUT workflow porte `timeout-minutes` ≤ 45 (borne = durée max mesurée + marge).
 *   R2. Un workflow du coffre déclenché par un push sur `claude/**` : filtre `paths` obligatoire
 *       ET bornes ≤ 20 min (les branches de travail ne paient pas de longs robots).
 *   R3. Un workflow du coffre déclenché par `pull_request` : `paths` obligatoire ET bornes ≤ 10 min
 *       (une PR ne relance pas une chaîne de 18 min à chaque push : la chaîne tourne à la fusion
 *       sur `main`, et la session la lance EN LOCAL avant — règle d'or n° 4).
 *   R4. Aucun `schedule:` (déjà interdit) et aucun `workflow_run` qui repart sur TOUT run
 *       (fan-out) sans condition sur la conclusion.
 *   R5. Le socle « sans timeout » est à ZÉRO (tests/workflows-timeout-baseline.json).
 *
 *   PÉRIMÈTRE : « sans borne » (R1) vaut pour TOUS les fichiers ; les plafonds (R1 ≤ 45, R2, R3, R4) ne
 *   visent que les robots qui DÉPENSENT le quota du coffre = les robots privés (regles.json
 *   `workflows_prives`) + les robots ACTIFS au coffre (tests/coffre-workflows-actifs.json, relevé API).
 *   Un robot en pause au coffre et déclaré public tourne au dépôt public : minutes illimitées.
 *
 * Prouvé discriminant (sabotage) : voir --sabotage ci-dessous (chaque règle a son cas qui rougit).
 * node tests/verify-gratuit.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github/workflows');
const R1_MAX = 45, R2_MAX = 20, R3_MAX = 10;
let pass = 0; const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/* Lecture SANS dépendance : on découpe le YAML en blocs de premier niveau, puis les jobs. */
export function analyser(src) {
  const t = sansCommentaires(src);
  const bloc = (cle) => { const m = t.match(new RegExp(`^${cle}:(.*?)(?=^[A-Za-z_"]|$(?![\\r\\n]))`, 'ms')); return m ? m[1] : ''; };
  const on = bloc('on') || bloc('"on"');
  const push = (on.match(/^  push:(.*?)(?=^  [a-z_]+:|$(?![\r\n]))/ms) || [])[1] || '';
  const pr = (on.match(/^  pull_request(?:_target)?:(.*?)(?=^  [a-z_]+:|$(?![\r\n]))/ms) || [])[1] || '';
  const surClaude = /^  push:\s*$/m.test(on) ? /claude\//.test(push) || !/branches/.test(push) : /^\s*-\s*push\s*$/m.test(on) || /^on:\s*push\s*$/m.test(t) || /^on:\s*\[.*\bpush\b/m.test(t);
  const jobsBloc = bloc('jobs');
  const jobs = [];
  for (const m of jobsBloc.matchAll(/^  ([A-Za-z0-9_"-]+):\s*$([\s\S]*?)(?=^  [A-Za-z0-9_"-]+:\s*$|$(?![\r\n]))/gm)) {
    const corps = m[2]; const to = corps.match(/^\s{4}timeout-minutes:\s*(\d+)/m);
    jobs.push({ nom: m[1], timeout: to ? +to[1] : null });
  }
  return {
    schedule: /^  schedule:/m.test(on),
    workflowRun: /^  workflow_run:/m.test(on),
    push: /^  push:/m.test(on) || /^\s*-\s*push\s*$/m.test(on) || /^on:\s*push\s*$/m.test(t),
    pushClaude: surClaude && (/claude\//.test(push) || (!/branches/.test(push) && /^  push:/m.test(on))),
    pushPaths: /^\s+paths(-ignore)?:/m.test(push),
    pr: /^  pull_request/m.test(on),
    prPaths: /^\s+paths(-ignore)?:/m.test(pr),
    jobs,
  };
}

function verifier(fichiers, lire, dansPerimetre = () => true) {
  const pb = [];
  for (const f of fichiers) {
    const a = analyser(lire(f));
    for (const j of a.jobs) if (j.timeout === null) pb.push(`R1 ${f} : job « ${j.nom} » sans timeout-minutes`);
    if (!dansPerimetre(f)) continue;
    for (const j of a.jobs) if (j.timeout > R1_MAX) pb.push(`R1 ${f} : job « ${j.nom} » borné à ${j.timeout} min > ${R1_MAX}`);
    if (a.pushClaude) {
      if (!a.pushPaths) pb.push(`R2 ${f} : push sur claude/** sans filtre paths`);
      for (const j of a.jobs) if (j.timeout > R2_MAX) pb.push(`R2 ${f} : push sur claude/** avec job « ${j.nom} » à ${j.timeout} min > ${R2_MAX}`);
    }
    if (a.pr) {
      if (!a.prPaths) pb.push(`R3 ${f} : pull_request sans filtre paths`);
      for (const j of a.jobs) if (j.timeout > R3_MAX) pb.push(`R3 ${f} : pull_request avec job « ${j.nom} » à ${j.timeout} min > ${R3_MAX}`);
    }
    if (a.schedule) pb.push(`R4 ${f} : schedule interdit`);
    if (a.workflowRun && !/conclusion|workflow_run\.event|if:/.test(sansCommentaires(lire(f)))) pb.push(`R4 ${f} : workflow_run sans condition (fan-out)`);
  }
  return pb;
}

const fichiers = readdirSync(WF).filter((f) => /\.ya?ml$/.test(f)).sort();
const lire = (f) => readFileSync(join(WF, f), 'utf8');

if (process.argv.includes('--sabotage')) {
  /* Chaque règle doit rougir sur un cas fabriqué — sinon le garde ne garde rien. */
  const base = 'on:\n  push:\n    branches: [main]\n    paths: [a]\njobs:\n  j:\n    runs-on: x\n    timeout-minutes: 5\n';
  const cas = [
    ['R1 sans borne', base.replace('    timeout-minutes: 5\n', ''), /R1 .*sans timeout/],
    ['R1 trop long', base.replace('timeout-minutes: 5', 'timeout-minutes: 60'), /R1 .*> 45/],
    ['R2 claude sans paths', 'on:\n  push:\n    branches: [claude/**]\njobs:\n  j:\n    runs-on: x\n    timeout-minutes: 5\n', /R2 .*sans filtre/],
    ['R2 claude trop long', 'on:\n  push:\n    branches: [claude/**]\n    paths: [a]\njobs:\n  j:\n    runs-on: x\n    timeout-minutes: 30\n', /R2 .*> 20/],
    ['R3 PR sans paths', 'on:\n  pull_request:\n    branches: [main]\njobs:\n  j:\n    runs-on: x\n    timeout-minutes: 5\n', /R3 .*sans filtre/],
    ['R3 PR trop long', 'on:\n  pull_request:\n    paths: [a]\njobs:\n  j:\n    runs-on: x\n    timeout-minutes: 18\n', /R3 .*> 10/],
    ['R4 schedule', base.replace('on:\n', 'on:\n  schedule:\n    - cron: "0 * * * *"\n'), /R4 .*schedule/],
    ['sain', base, null],
  ];
  for (const [nom, src, attendu] of cas) {
    const pb = verifier(['x.yml'], () => src);
    ok(attendu ? pb.some((p) => attendu.test(p)) : pb.length === 0, `sabotage « ${nom} » : ${attendu ? 'rougit' : 'reste vert'} (${pb.join(' | ') || 'rien'})`);
  }
} else {
  const regles = JSON.parse(readFileSync(join(ROOT, 'tools/depot-public/regles.json'), 'utf8'));
  const actifs = JSON.parse(readFileSync(join(ROOT, 'tests/coffre-workflows-actifs.json'), 'utf8'));
  const perimetre = new Set([...(regles.workflows_prives || []).map((p) => p.split('/').pop()), ...(actifs.actifs || [])]);
  ok(perimetre.size >= 14 && actifs.actifs.length > 0, `périmètre = ${perimetre.size} robots (privés + actifs au coffre, relevé ${actifs._date})`);
  const pb = verifier(fichiers, lire, (f) => perimetre.has(f));
  ok(fichiers.length > 100, `${fichiers.length} workflows lus`);
  for (const p of pb) fails.push(p);
  if (!pb.length) pass++;
  const socle = JSON.parse(readFileSync(join(ROOT, 'tests/workflows-timeout-baseline.json'), 'utf8'));
  ok(socle.sansTimeout === 0, `R5 socle « sans timeout » = ${socle.sansTimeout} (attendu 0)`);
}

console.log(`\nGratuit par défaut : ${pass} OK / ${fails.length} problème(s)`);
for (const f of fails) console.log('  ❌ ' + f);
process.exit(fails.length ? 1 : 0);
