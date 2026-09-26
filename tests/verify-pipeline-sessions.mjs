/* GARDE-FOU — aucune session ne doit être oubliée, déliée ou perdue.
 *
 * Kevin 2026-09-02 : « Sois sûr de ne rien oublier, lier ou perdre de chaque
 * session. Et le pipeline entre elles toutes et les futures. »
 *
 * Le risque, concrètement : une session créée un soir, jamais inscrite au
 * registre, qui travaille dans son coin sur une branche que personne ne connaît
 * — et dont le travail disparaît quand son conteneur est recyclé. Ou deux
 * sessions qui poussent sur la MÊME branche et s'écrasent l'une l'autre.
 *
 * Ce test relie les deux sources et refuse tout écart :
 *   1. le registre `pipeline/sessions.json` est cohérent (branches uniques…) ;
 *   2. CHAQUE session listée dans SESSIONS-ET-BRANCHES.md est au registre ;
 *   3. CHAQUE session du registre est dans SESSIONS-ET-BRANCHES.md ;
 *   4. les branches concordent entre les deux documents ;
 *   5. l'outil du pipeline existe et répond.
 *
 * Lancer : node tests/verify-pipeline-sessions.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const REG = 'pipeline/sessions.json';
const CARTE = 'SESSIONS-ET-BRANCHES.md';
const OUTIL = 'tools/pipeline/pipeline.mjs';

chk(existsSync(REG), `${REG} existe`);
chk(existsSync(OUTIL), `${OUTIL} existe`);
chk(existsSync(CARTE), `${CARTE} existe`);
if (R.ko.length) { R.ko.forEach((m) => console.log('  FAIL ' + m)); process.exit(1); }

/* --- 1. cohérence interne (déléguée à l'outil, source unique) --------------- */
let coherent = true;
try { execFileSync(process.execPath, [OUTIL, 'verifier'], { stdio: 'pipe' }); }
catch (_) { coherent = false; }
chk(coherent, coherent
  ? 'registre cohérent (branches uniques, messages bien adressés)'
  : `registre INCOHÉRENT — lance : node ${OUTIL} verifier`);

const reg = JSON.parse(readFileSync(REG, 'utf8'));
const sessions = reg.sessions || {};
chk(Object.keys(sessions).length > 0, `${Object.keys(sessions).length} sessions inscrites`);

/* --- 2/3/4. le registre et la carte disent-ils la MÊME chose ? -------------- */
/* La carte liste les branches dans un tableau markdown : `| Session | `branche` | … `
 * On ne lit QUE les lignes de tableau. Avant le 6.09.2026 la recherche portait sur tout
 * le fichier : citer une branche entre accents graves dans une simple PHRASE la faisait
 * passer pour une session déclarée, et le garde échouait sur de la prose. */
const carte = readFileSync(CARTE, 'utf8');
const branchesCarte = new Set(
  carte.split('\n')
    .filter((l) => l.trimStart().startsWith('|'))
    .flatMap((l) => [...l.matchAll(/`(claude\/[A-Za-z0-9._/-]+|publie-septembre)`/g)])
    .map((m) => m[1])
);
const branchesReg = new Map(Object.entries(sessions).map(([id, s]) => [s.branche, id]));

const absentesRegistre = [...branchesCarte].filter((b) => !branchesReg.has(b));
chk(absentesRegistre.length === 0,
  absentesRegistre.length === 0
    ? `les ${branchesCarte.size} branches de la carte sont TOUTES au registre`
    : `OUBLIÉES au registre : ${absentesRegistre.join(', ')} — une session hors registre travaille sans que personne ne le sache`);

const absentesCarte = [...branchesReg.keys()].filter((b) => !branchesCarte.has(b));
chk(absentesCarte.length === 0,
  absentesCarte.length === 0
    ? 'toutes les sessions du registre figurent aussi dans la carte'
    : `absentes de ${CARTE} : ${absentesCarte.join(', ')}`);

/* --- 5. chaque session porte le minimum vital ------------------------------- */
const incompletes = Object.entries(sessions)
  .filter(([, s]) => !s.titre || !s.branche || !s.sujet)
  .map(([id]) => id);
chk(incompletes.length === 0,
  incompletes.length === 0
    ? 'chaque session a un titre, une branche et un sujet'
    : `incomplètes : ${incompletes.join(', ')}`);

/* --- 6. les VRAIES branches git : aucune branche active ne doit être orpheline ---
 *
 * TROU TROUVÉ LE 6.09.2026. Les contrôles 1→5 ne comparent que deux DOCUMENTS entre
 * eux (registre ⇄ carte). Ils sont donc verts même si dix sessions travaillent sur des
 * branches que personne n'a inscrites — c'est-à-dire le risque exact décrit en tête de
 * ce fichier. Mesuré ce jour-là : 370 branches `claude/*` sur origin, 22 inscrites,
 * et **7 branches actives** (commit dans les 7 jours) inconnues du registre — dont
 * celle qui réparait le rouge bloquant les fusions de tout le monde.
 *
 * Même classe d'erreur que la leçon #103 : une vérification qui passe parce qu'elle ne
 * vérifie rien de réel.
 *
 * CLIQUET : les orphelines connues sont figées dans une base de référence. On échoue
 * seulement si une NOUVELLE apparaît → on bloque le nouveau sans allumer un rouge
 * permanent sur l'existant. Repli ouvert : sans git ni refs distantes (clone superficiel
 * de CI), on saute — jamais de faux rouge.
 */
const BASELINE = 'pipeline/branches-orphelines-baseline.json';
const JOURS = 7;

/* Une branche fabriquée par un WORKFLOW n'a pas de session à inscrire : son nom porte
   l'identifiant du run (`…-34079684358`), donc il est NEUF à chaque exécution — aucun
   cliquet ne peut le rattraper, et le contrôle virerait au rouge permanent (faux rouge :
   exactement ce que la leçon #103 interdit). Mesuré le 7.09.2026 sur les 377 `claude/*` :
   71 branches ont cette forme, **toutes** écrites uniquement par un robot (kdmc-bot ou
   github-actions[bot]), et **aucune** branche inscrite au registre ne l'a.
   Les DEUX signaux sont exigés ensemble : un nom en `-<chiffres>` ne suffit pas — il faut
   aussi que personne d'humain n'ait commité dessus. Une vraie session dont le nom finirait
   par des chiffres reste donc contrôlée. */
/* + (17.09.2026) la branche HEBDOMADAIRE de la pub autonome, `claude/pub-auto-<année>-<semaine>`,
   écrite par pub-videos.yml (routine « Pub — vidéos de la semaine ») : même nom chaque
   semaine, même règle — le robot seul y écrit, la PR est fusionnée par le robot. */
const PUB_AUTO = /^claude\/pub-auto-[0-9]{4}-[0-9]{2}$/;
const NOM_DE_ROBOT = new RegExp('-[0-9]{8,}$|' + PUB_AUTO.source);
const ROBOTS = new Set(['kdmc-bot', 'github-actions[bot]', 'claude-bot']);

/* Une branche dont TOUT est déjà dans `main` ne porte, par définition, aucun travail
   qui pourrait se perdre — c'est le seul risque que ce contrôle existe pour couvrir
   (voir l'en-tête : « son travail disparaît quand son conteneur est recyclé »).
   MESURÉ le 10.09.2026 : les **7** branches que ce contrôle signalait avaient
   **0 commit hors de main**. Il criait donc au loup sur du travail TERMINÉ, et le
   cliquet ne servait qu'à taire ce bruit. On ne signale plus qu'une branche qui
   porte réellement du travail que personne ne suit. */
function porteDuTravailNonFusionne(branche) {
  try {
    const n = execFileSync('git', ['rev-list', '--count', `origin/main..origin/${branche}`],
      { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return Number(n) > 0;
  } catch (_) { return true; }        /* illisible → on préfère signaler que taire */
}

function ecriteParUnRobotSeulement(branche) {
  let auteurs;
  try {
    auteurs = execFileSync('git', ['log', '--format=%an', `origin/main..origin/${branche}`],
      { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (_) { return false; }        /* pas lisible → on ne l'exclut pas */
  if (!auteurs) return false;
  /* Sur la branche hebdo de la pub, la session Claude Code qui tient la routine peut poser
     un correctif (vécu 17.09 : accents d'un script) — elle n'est pas « personne ». */
  const toleres = PUB_AUTO.test(branche) ? new Set([...ROBOTS, 'Claude']) : ROBOTS;
  return auteurs.split('\n').every((a) => toleres.has(a.trim()));
}

let refs = '';
try {
  refs = execFileSync('git', [
    'for-each-ref', '--format=%(refname:short)|%(committerdate:short)',
    'refs/remotes/origin/claude/',
  ], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
} catch (_) { refs = ''; }

if (!refs.trim()) {
  console.log('  ·    (pas de branches distantes visibles — contrôle des orphelines sauté)');
} else {
  const seuil = new Date(Date.now() - JOURS * 86400000).toISOString().slice(0, 10);
  const actives = refs.trim().split('\n').map((l) => {
    const [r, d] = l.split('|');
    return { branche: r.replace(/^origin\//, ''), date: d };
  }).filter((b) => b.date >= seuil);

  const inscrites = new Set(Object.values(sessions).map((s) => s.branche));
  const robots = actives.filter((b) => NOM_DE_ROBOT.test(b.branche)
    && ecriteParUnRobotSeulement(b.branche)).map((b) => b.branche);
  const aSuivre = actives.filter((b) => !robots.includes(b.branche));
  const orphelines = aSuivre
    .filter((b) => !inscrites.has(b.branche))
    .filter((b) => porteDuTravailNonFusionne(b.branche))   /* fusionnée = rien à perdre */
    .map((b) => b.branche).sort();

  if (robots.length) {
    console.log(`  ·    ${robots.length} branche(s) fabriquée(s) par un workflow, sans session à inscrire`);
  }

  let connues = [];
  if (existsSync(BASELINE)) {
    try { connues = JSON.parse(readFileSync(BASELINE, 'utf8')).orphelines || []; } catch (_) {}
  }
  const nouvelles = orphelines.filter((b) => !connues.includes(b));
  const parties = connues.filter((b) => !orphelines.includes(b));

  chk(nouvelles.length === 0, nouvelles.length === 0
    ? `${aSuivre.length} branche(s) active(s) suivie(s) · aucune NOUVELLE orpheline (${orphelines.length} connue(s), cliquet)`
    : `branche(s) ACTIVE(S) que personne ne suit : ${nouvelles.join(', ')} — inscris-la : ` +
      `node ${OUTIL} enregistrer --id <slug> --titre "…" --branche "<elle>" --sujet "…"`);

  if (parties.length) {
    console.log(`  ·    ${parties.length} orpheline(s) de la base ne sont plus actives : ${parties.join(', ')}`);
    console.log(`  ·    (elles peuvent sortir de ${BASELINE})`);
  }
  orphelines.forEach((b) => console.log(`  ·    orpheline connue : ${b}`));
}

/* --- 7. ce que le pipeline doit rendre visible ------------------------------ */
const attendKevin = Object.entries(sessions).filter(([, s]) => s.attend_kevin);
const attendSession = Object.entries(sessions).filter(([, s]) => s.attend_session);
console.log(`  · ${Object.keys(sessions).length} sessions · ${(reg.messages || []).length} message(s)`);
console.log(`  · ${attendKevin.length} en attente de Kevin, ${attendSession.length} en attente d'une autre session`);
attendKevin.forEach(([id, s]) => console.log(`     👤 ${id} : ${s.attend_kevin}`));
attendSession.forEach(([id, s]) => console.log(`     🔗 ${id} : ${s.attend_session}`));
console.log();

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
