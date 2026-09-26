/* GARDE-FOU — ne jamais demander à Kevin un geste qui ne SERT À RIEN,
 * ni lui donner un numéro de ligne faux.
 *
 * Trois erreurs vécues :
 *   16/08 — je lui fais poser deux variables Cloudflare (UPSTREAM_BASE,
 *           UPSTREAM_PREFIX) : le code réellement en ligne ne les lisait
 *           NULLE PART. Geste inutile.
 *   17/08 — je lui annonce « change la ligne 14 » : vrai seulement si le paquet
 *           est rangé dans un dossier CMCteams/. Cloudflare Pages a aplati le
 *           dossier déposé → les fichiers sont à la RACINE → il fallait une
 *           autre ligne. Consigne fausse.
 *   10/09 — le routeur lit désormais les deux variables (la bascule est un
 *           RÉGLAGE, 0 ligne à toucher) mais la consigne écrite disait encore
 *           « change UNE ligne » : consigne PÉRIMÉE, et ce test ne le voyait pas
 *           parce que sa référence git (`github/…`) n'existait que chez moi.
 *
 * Sa réponse : « vérifie tout avant de me le faire faire ».
 *
 * Ce test compare la CONSIGNE écrite dans REMETTRE_EN_LIGNE.md au CODE
 * RÉELLEMENT EN LIGNE (= ce que déploie deploy-kdmc-router.yml au push sur main,
 * donc `origin/main` ; repli `HEAD` dit clairement si absent).
 *
 * Lancer : node tests/verify-consigne-reelle.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const DOC = 'REMETTRE_EN_LIGNE.md';
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

function refEnLigne() {
  for (const r of ['origin/main', 'main', 'HEAD']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '-q', r + '^{commit}'], { stdio: 'pipe' });
      return r;
    } catch (_) { /* suivant */ }
  }
  return null;
}
const REF = refEnLigne();
chk(!!REF, REF ? `référence « en ligne » : ${REF}${REF === 'HEAD' ? ' (⚠️ HEAD, pas origin/main : décrit la branche, pas la mise en ligne)' : ''}` : 'aucune référence git lisible (origin/main, main, HEAD)');

chk(existsSync(DOC), `${DOC} existe`);
const doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';

let deploye = '';
try {
  if (REF) deploye = execFileSync('git', ['show', `${REF}:services/kdmc-router/worker.js`], { encoding: 'utf8' });
} catch (_) { /* on le dit plutôt que de passer en vert */ }
chk(deploye.length > 1000, `le code EN LIGNE est lisible (${deploye.length} caractères, réf ${REF})`);
const lignes = deploye.split('\n');

/* --- Règle 1 : toute variable citée comme consigne doit être LUE en ligne --- */
/* On relève les noms en majuscules présentés dans un tableau de consigne
   (`| \`NOM\` | …`) ou en `env.NOM` — pas les mots d'explication. */
const citees = new Set();
for (const m of doc.matchAll(/\|\s*`([A-Z][A-Z0-9_]{3,})`\s*\|/g)) citees.add(m[1]);
for (const m of doc.matchAll(/`env\.([A-Z][A-Z0-9_]{3,})`/g)) citees.add(m[1]);
chk(citees.size >= 2, `Règle 1 : la consigne nomme au moins les deux variables de la bascule (${[...citees].join(', ') || 'aucune'})`);
const mortes = [...citees].filter((v) => !new RegExp('env(\\.|\\[[\'"])' + v).test(deploye));
chk(mortes.length === 0,
  mortes.length === 0
    ? `Règle 1 : les ${citees.size} variable(s) citée(s) sont bien lues par le code en ligne`
    : `Règle 1 VIOLÉE : ${mortes.join(', ')} — la consigne demande de la poser, le code EN LIGNE ne la lit PAS`);

/* --- Règle 2 : si la doc fait toucher au code, la ligne existe au bon numéro ; ---
   --- sinon (bascule par variables) elle ne doit plus montrer d'ancienne ligne --- */
const avant = (doc.match(/^(.*?)\s*\/\/\s*←\s*avant\s*$/m) || [])[1];
const annonce = (doc.match(/ligne\s+\*\*(\d+)\*\*/) || [])[1];
if (!avant) {
  chk(!annonce, annonce
    ? `Règle 2 VIOLÉE : la doc annonce une « ligne **${annonce}** » sans montrer la ligne (« ← avant ») → consigne invérifiable`
    : 'Règle 2 : la consigne ne demande plus de toucher au code (0 « ← avant », 0 numéro de ligne) — cohérent avec une bascule par variables');
} else {
  const code = avant.trim();
  const trouvees = lignes.map((l, i) => (l.trim() === code ? i + 1 : 0)).filter(Boolean);
  chk(trouvees.length === 1,
    trouvees.length === 1
      ? `Règle 2 : cette ligne existe une seule fois dans le code en ligne (ligne ${trouvees[0]})`
      : `Règle 2 VIOLÉE : la ligne montrée apparaît ${trouvees.length} fois dans le code en ligne → consigne ambiguë`);
  chk(!!annonce, annonce ? `Règle 2 : un numéro de ligne est annoncé (${annonce})` : 'Règle 2 VIOLÉE : aucun numéro de ligne annoncé à Kevin');
  if (annonce && trouvees.length === 1) {
    chk(Number(annonce) === trouvees[0],
      Number(annonce) === trouvees[0]
        ? `Règle 2 : le numéro annoncé (${annonce}) est le BON`
        : `Règle 2 VIOLÉE : la doc annonce la ligne ${annonce}, c'est en réalité la ${trouvees[0]}`);
  }
}

/* --- Règle 3 : la consigne s'accorde avec le RANGEMENT réel du paquet ------- */
/* Le routeur en ligne demande /CMCteams/… par défaut (préfixe en dur dans ROUTES).
   Cloudflare Pages sert le paquet à la RACINE (constaté par Kevin le 17/08) → la
   consigne DOIT dire de vider UPSTREAM_PREFIX, et le code DOIT alors retirer le
   préfixe — les deux, sinon 404 partout. */
chk(/'cmcteams\.kd-mc\.com': '\/CMCteams'/.test(deploye),
  'Règle 3 : le code en ligne demande bien /CMCteams par défaut (préfixe en dur dans ROUTES)');
chk(/PREFIX_SORTIE\s*!==\s*PAGES_PREFIX_DEFAUT[\s\S]{0,200}slice\(PAGES_PREFIX_DEFAUT\.length\)/.test(deploye),
  'Règle 3 : le code en ligne RETIRE le préfixe /CMCteams quand UPSTREAM_PREFIX est posée (sinon la variable ne servirait à rien)');
const prefixeVide = /`UPSTREAM_PREFIX`[^\n]*\|[^\n]*(vide|`''`|« »)/i.test(doc);
chk(prefixeVide,
  prefixeVide
    ? 'Règle 3 : la consigne dit de laisser UPSTREAM_PREFIX VIDE — accordée au paquet servi à la RACINE'
    : 'Règle 3 VIOLÉE : la consigne ne dit pas que UPSTREAM_PREFIX doit être vide alors que Pages sert à la RACINE → 404 partout');
chk(/prepare-secours\.mjs --pages/.test(doc) && /pages-upload/.test(doc),
  'Règle 3 : la consigne nomme le vrai générateur (--pages) et le vrai dossier de sortie (pages-upload)');
chk(existsSync('services/kdmc-router/prepare-secours.mjs'), 'Règle 3 : le générateur existe (services/kdmc-router/prepare-secours.mjs)');

/* --- Règle 4 : le test qui sert de preuve dans la doc existe vraiment ------- */
for (const t of [...doc.matchAll(/tests\/([a-z0-9-]+\.mjs)/g)].map((m) => m[1])) {
  chk(existsSync('tests/' + t), `Règle 4 : le test cité comme preuve existe (tests/${t})`);
}

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
