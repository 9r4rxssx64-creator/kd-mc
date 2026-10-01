/* GARDE-FOU — GitHub Actions ne sert qu'à construire, tester et déployer CE dépôt.
 *
 * Le 15/08/2026, le compte GitHub de Kevin a été suspendu, et le support a
 * REFUSÉ de lever la restriction. Raison donnée mot pour mot :
 *
 *   « any repositories that use GitHub Actions solely to interact with 3rd
 *     party websites […] or for general computing purposes may fall afoul of
 *     the GitHub Additional Product Terms »
 *
 * Constat mesuré au moment de la suspension : 168 workflows, 51 avec
 * déclencheur horaire, ≈ 97 exécutions par jour, 44 qui n'appelaient QUE des
 * services extérieurs sans jamais toucher au code. C'est moi (Claude) qui ai
 * empilé la plupart de ces workflows, mois après mois, sans jamais vérifier
 * que ça correspondait à l'usage prévu. Ce test existe pour que ça ne
 * recommence pas — sur ce dépôt comme sur celui qui le remplacera.
 *
 * Il vérifie deux règles simples :
 *   1. AUCUNE exécution programmée (cron). Ce qui doit tourner en boucle
 *      appartient à un Cloudflare Worker, pas à un dépôt de code.
 *   2. AUCUN workflow dont le SEUL travail est d'appeler des services tiers.
 *      S'il n'installe rien, ne teste rien et ne déploie rien : il n'a rien à
 *      faire ici.
 *
 * Lancer : node tests/verify-actions-conformes.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { workflowAuCoffre } from '../tools/depot-public/au-coffre.mjs';

const DOSSIER = '.github/workflows';
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

const fichiers = existsSync(DOSSIER)
  ? readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f))
  : [];
chk(fichiers.length > 0, `on inspecte ${fichiers.length} workflow(s)`);

/* --- Règle 1 : plus aucune exécution programmée -------------------------- */
const avecCron = [];
for (const f of fichiers) {
  const s = readFileSync(join(DOSSIER, f), 'utf8');
  /* on ignore les lignes commentées : le commentaire qui EXPLIQUE le retrait
     ne doit évidemment pas déclencher l'alarme */
  const actif = s.split('\n').some((l) => /^\s*-\s*cron\s*:/.test(l) && !/^\s*#/.test(l));
  if (actif) avecCron.push(f);
}
chk(avecCron.length === 0,
  avecCron.length === 0
    ? 'Règle 1 : aucune exécution programmée (0 cron) — c\'était ~97/jour avant la suspension'
    : `Règle 1 VIOLÉE : ${avecCron.length} workflow(s) avec cron → ${avecCron.join(', ')}`);

/* --- Règle 2 : rien qui ne fasse QUE appeler l'extérieur ------------------ */
const HOTE = /https?:\/\/(?!(?:api\.)?github\.com|raw\.githubusercontent|objects\.githubusercontent|uploads\.github)[a-z0-9.-]+/gi;
/* Marqueurs d'un VRAI déploiement du code de Kevin (usage prévu d'Actions),
   par opposition au robot qui ne fait que sonner un site tiers — le motif
   nommé par GitHub. « wrangler@3 deploy » (version épinglée) était compté à
   tort comme un appel externe pur le 4.09 : la version entre le nom et la
   commande empêchait la reconnaissance. `git push` compte aussi : un
   pingeur externe ne réécrit jamais le dépôt. */
const CONSTRUIT = /npm (run|ci|test)|actions\/setup-node|wrangler(@[\w.]+)? (deploy|secret|pages)|npm install|actions\/deploy-pages|pytest|cargo |git push/;
/* Exceptions ASSUMÉES : elles déploient réellement le code de Kevin, ce qui est
   l'usage prévu d'Actions. Toute nouvelle exception doit être justifiée ici.
   (crypto-bot-deploy.yml en faisait partie — supprimé le 2.09, voir règle 3.) */
/* clayscore-extract-private.yml a été déplacé dans workflows-desactives le
   4.09 (il portait un cron) — l'exception n'a plus d'objet. */
/* firebase-backup.yml (1.10.2026, audit R7) : la SAUVEGARDE QUOTIDIENNE des données de Kevin (sa propre base
   Firebase, pas un site tiers). Elle ne part plus d'un cron GitHub mais d'un `repository_dispatch` envoyé par son
   propre worker Cloudflare, UNE fois par jour (marque KV, garde test:sauvegarde-quotidienne). Mesuré : 1 run de
   1 min 10, archive 5,7 Mo — contre ~97 exécutions/jour avant la suspension. Volume borné par construction. */
const TOLERES = new Set(['firebase-backup.yml']);
/* La règle ne vise que ce qui peut PARTIR TOUT SEUL. GitHub reprochait un
   VOLUME d'exécutions automatiques (~97/jour) ; un workflow qu'on ne peut
   lancer qu'à la main ne produit aucun volume — il tourne quand un humain
   appuie. Mesuré le 4.09 : sans cette distinction, la règle rangeait à tort
   la sauvegarde Firebase (données de Kevin, manuelle depuis le 15/08) et
   cassait la garde cross-app-preservation qui la déclare critique. */
const AUTOMATIQUE = /^\s{2}(schedule|push|pull_request|repository_dispatch|workflow_run):/m;
const purs = [];
for (const f of fichiers) {
  if (TOLERES.has(f)) continue;
  const s = readFileSync(join(DOSSIER, f), 'utf8');
  if (!AUTOMATIQUE.test(s)) continue;          // manuel seulement → hors sujet
  const hotes = [...s.matchAll(HOTE)].map((m) => m[0]);
  if (hotes.length && !CONSTRUIT.test(s)) purs.push(f);
}
chk(purs.length === 0,
  purs.length === 0
    ? 'Règle 2 : aucun workflow qui n\'appelle QUE des services tiers'
    : `Règle 2 VIOLÉE : ${purs.length} workflow(s) n'appellent que l'extérieur → ${purs.join(', ')}`);

/* --- Règle 4 : ne jamais RANGER un workflow déclaré CRITIQUE -------------- */
/* Née d'une vraie faute, le 4.09.2026. En mettant le dépôt en conformité,
   j'ai déplacé vers workflows-desactives/ deux workflows qui n'avaient PAS de
   cron et que la garde cross-app-preservation déclare critiques :
   handoff-sync.yml (les passations Apex ⇄ Claude Code) et firebase-backup.yml
   (la sauvegarde des données de Kevin). La CI a échoué et la capacité était
   perdue en silence jusque-là. On lit la liste DANS cross-app-preservation.yml
   plutôt que de la recopier : une liste recopiée finit toujours par diverger. */
const GARDE = join(DOSSIER, 'cross-app-preservation.yml');
let critiques = [];
try {
  const g = readFileSync(GARDE, 'utf8');
  const bloc = g.match(/REQUIRED_WORKFLOWS=\(([\s\S]*?)\)/);
  if (bloc) critiques = [...bloc[1].matchAll(/\.github\/workflows\/([\w.-]+\.ya?ml)/g)].map((m) => m[1]);
} catch { /* la garde a pu être renommée : on le dira plutôt que de rester muet */ }
chk(critiques.length > 0, `4. la liste des workflows critiques est lisible (${critiques.length} trouvés)`);
/* Un critique RANGÉ AU COFFRE (dépôt public) n'est pas perdu : il tourne là-bas. */
const ranges = critiques.filter((f) => !fichiers.includes(f) && !workflowAuCoffre(f));
chk(ranges.length === 0,
  ranges.length === 0
    ? `4. aucun workflow critique n'a été rangé ou supprimé (${critiques.length} vérifiés)`
    : `4. VIOLÉE : ${ranges.length} workflow(s) CRITIQUES absents des workflows actifs → ${ranges.join(', ')}`);

/* --- Règle 3 : aucune opération crypto ----------------------------------- */
/* Ajoutée le 3.09.2026. Le support GitHub (message « Wick », 2.09) nomme
   explicitement « cryptocurrency operations » parmi les usages interdits ;
   les 6 workflows crypto-bot-* ont été supprimés ce jour-là et les secrets
   Binance retirés par Kevin. Le bot lui-même n'est pas mort : il tourne sur
   Railway, et son déploiement passe par GitLab CI. Cette règle empêche
   seulement qu'il revienne s'exécuter DEPUIS GitHub Actions. */
const CRYPTO = /^crypto-bot-|\b(binance|kraken|coinbase|bybit|bitget)\b/i;
const cryptos = fichiers.filter((f) => CRYPTO.test(f) || CRYPTO.test(readFileSync(join(DOSSIER, f), 'utf8')));
chk(cryptos.length === 0,
  cryptos.length === 0
    ? 'Règle 3 : aucun workflow crypto (nommé par GitHub parmi les usages interdits)'
    : `Règle 3 VIOLÉE : ${cryptos.length} workflow(s) crypto → ${cryptos.join(', ')} — le deploiement du bot passe par GitLab CI`);

/* --- Règle 5 : un robot qui écrit sur les branches ne partage pas de chemin ---
 *
 * Née d'un vrai blocage, le 6-7.09.2026. `auto-merge-claude.yml` écrivait son
 * diagnostic d'échec dans `.github/AUTOMERGE-DIAGNOSTIC.md` — le MÊME chemin
 * pour TOUTES les branches, avec un contenu différent à chaque fois (le numéro
 * de PR, la branche, l'heure). Mesuré : 8 écritures en une journée sur 4
 * branches. Dès que deux de ces branches croisent `main`, le conflit est
 * CERTAIN : même fichier, contenus incompatibles, aucun des deux n'a tort.
 * C'est ce qui a bloqué la PR #3679, et une autre session avait déjà tenté de
 * supprimer le fichier — il revenait au run suivant.
 *
 * La règle : un fichier qu'un robot committe DEPUIS une branche doit porter le
 * nom de cette branche. Deux branches ne se disputent alors jamais un chemin.
 */
const CHEMINS_PARTAGES = [
  { motif: /["'`]\.github\/AUTOMERGE-DIAGNOSTIC\.md["'`]/, quoi: '.github/AUTOMERGE-DIAGNOSTIC.md' },
];
const partages = [];
for (const f of fichiers) {
  const s = readFileSync(join(DOSSIER, f), 'utf8');
  if (!/git push origin ["']?HEAD:/.test(s)) continue;   /* n'écrit pas sur une branche */
  /* On ne lit QUE le code : le commentaire qui RACONTE l'ancien chemin partagé ne
     doit pas déclencher l'alarme (même piège que la règle 1 — vécu ici même :
     ma propre explication du correctif faisait échouer ma propre garde). */
  const code = s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  for (const { motif, quoi } of CHEMINS_PARTAGES) {
    if (motif.test(code)) partages.push(`${f} → ${quoi}`);
  }
}
chk(partages.length === 0,
  partages.length === 0
    ? 'Règle 5 : aucun robot n\'écrit toutes les branches dans un chemin partagé (conflit garanti)'
    : `Règle 5 VIOLÉE : ${partages.join(', ')} — un fichier committé depuis une branche doit porter ` +
      'son nom (ex. .github/automerge-diag/<branche>.md), sinon deux branches entrent en conflit');

/* --- La note explicative doit rester lisible ----------------------------- */
const note = '.github/workflows-desactives/POURQUOI.md';
chk(existsSync(note), 'la note qui explique le retrait est présente (' + note + ')');
if (existsSync(note)) {
  const t = readFileSync(note, 'utf8');
  chk(/3rd party websites/.test(t), 'elle cite la raison EXACTE donnée par GitHub, pas un résumé');
}

R.ok.forEach((m) => console.log('  OK ' + m));
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
