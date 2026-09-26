/* GARDE — un déploiement doit pouvoir PARTIR, et partir quand il faut.
 * ====================================================================
 * Kevin 2026-09-06 : « Pourquoi tu es bloqué par GitHub ? Trouve des solutions. »
 *
 * Mesuré ce jour-là : depuis l'agent, l'API GitHub refuse TOUS les chemins du dépôt
 * (« GitHub access is not enabled for this session ») → impossible de lancer un
 * déploiement à la main. Seul `git push` fonctionne. Donc la seule voie fiable est
 * le déclencheur `push` sur `claude/**` — c'est pour ça qu'Apex Chat s'était bien
 * déployé et que le relais Apex + World Monitor étaient restés en arrière.
 *
 * Deux pièges attrapés ici, définitivement :
 *   1. un worker de la chaîne IA dont le déploiement n'écoute PAS `claude/**`
 *      → je ne peux plus le mettre en ligne sans un clic de Kevin ;
 *   2. un worker qui IMPORTE le routage IA commun sans que son déploiement
 *      surveille ce fichier → modifier le routage ne redéploie rien, et le worker
 *      sert éternellement l'ancienne version (déploiement fantôme, leçon #213).
 *   3. un workflow qui ne surveille pas son PROPRE fichier → le modifier ne
 *      déclenche rien (c'était le cas de World Monitor).
 *
 * Lancer : node tests/verify-deploiement-declenche.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const lire = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/* worker → son workflow de déploiement (chaîne IA du domaine) */
const IA = [
  { nom: 'relais Apex (Qwen)', src: '.github/workflows/sync-apex-secrets-to-cf-worker.yml', wf: 'sync-apex-secrets-to-cf-worker' },
  { nom: 'hub apis.kd-mc.com', src: 'services/kdmc-apis/worker.js', wf: 'deploy-kdmc-apis' },
  { nom: 'Créa AI', src: 'services/kdmc-crea-ai/worker.js', wf: 'deploy-kdmc-crea-ai' },
  { nom: 'routeur (Lingua)', src: 'services/kdmc-router/worker.js', wf: 'deploy-kdmc-router' },
  { nom: 'World Monitor', src: 'tools/cloudflare/wm-brief/worker.js', wf: 'deploy-wm-brief' },
  { nom: 'Apex Chat', src: 'messaging-app/workers/api-worker.js', wf: 'deploy-apex-chat' },
];

console.log('— 1. Chaque déploiement IA part-il sur un push claude/** ? (sinon : bloqué) —');
for (const { nom, wf } of IA) {
  const y = lire(`.github/workflows/${wf}.yml`);
  chk(y.length > 0, `${nom} : le workflow ${wf}.yml existe`);
  chk(/branches:[\s\S]{0,120}?'claude\/\*\*'/.test(y), `${nom} : déclenché par un push sur claude/** (déploiement sans API GitHub ni clic)`);
}

console.log('— 2. Un workflow surveille-t-il son PROPRE fichier ? —');
for (const { nom, wf } of IA) {
  const y = lire(`.github/workflows/${wf}.yml`);
  chk(y.includes(`workflows/${wf}.yml`), `${nom} : modifier ${wf}.yml redéclenche bien son déploiement`);
}

console.log('— 3. Qui importe le routage IA commun le surveille-t-il ? (anti-déploiement fantôme) —');
const PARTAGE = 'services/_shared/ia-route.js';
chk(existsSync(PARTAGE), `le module commun ${PARTAGE} existe`);
/* un vrai `import … from '…/_shared/ia-route.js'` — pas une simple mention en commentaire
   (Créa AI cite le fichier dans un commentaire mais garde sa propre chaîne : rien à surveiller) */
const IMPORTE = /^\s*import\s[\s\S]{0,200}?from\s+['"][^'"]*_shared\/ia-route\.js['"]/m;
for (const { nom, src, wf } of IA) {
  const code = lire(src);
  if (!IMPORTE.test(code)) continue;
  const y = lire(`.github/workflows/${wf}.yml`);
  chk(y.includes('_shared/ia-route.js'),
    `${nom} : importe le routage commun ET son déploiement surveille ce fichier`);
}

/* Le piège le PLUS traître : le workflow part bien sur un push `claude/**`,
   il tourne, il affiche VERT… mais son `actions/checkout` est épinglé sur
   `ref: main` → il met en ligne le code de `main`, pas celui qu'on vient de
   pousser. Vécu le 2026-09-06 (Créa AI) : correctif poussé, déploiement vert,
   worker EN LIGNE encore à l'ancienne version. Un vert qui ment est pire que
   du rouge. Deux positions cohérentes, une seule interdite : soit on écoute
   `claude/**` et on déploie CETTE branche, soit on ne l'écoute pas. */
console.log('— 3 bis. Un déploiement déclenché par claude/** met-il en ligne CETTE branche ? —');
for (const { nom, wf } of IA) {
  const y = lire(`.github/workflows/${wf}.yml`);
  if (!/branches:[\s\S]{0,120}?'claude\/\*\*'/.test(y)) continue;
  const bloc = (y.match(/uses:\s*actions\/checkout@[^\n]*\n(?:[^\n]*\n){0,6}/) || [''])[0];
  /* On retire les commentaires AVANT de chercher : sinon un commentaire qui
     dit « pas de ref: main » déclenche la garde lui-même (vécu à l'écriture
     de ce test — un faux positif est aussi nuisible qu'un faux négatif). */
  const sansCom = bloc.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
  chk(!/ref:\s*main\b/.test(sansCom),
    `${nom} : le checkout n'est PAS épinglé sur main (sinon le push déploie l'ancien code = faux vert)`);
}

/* ── 3 ter. LA MÊME EXIGENCE, SUR TOUS LES DÉPLOIEMENTS ─────────────────────
   Kevin 2026-09-06 « que dois-je faire pour que tu sois autonome, et tes autres
   branches aussi ? ». Mesuré ce jour-là : 34 workflows de déploiement, mais
   seulement 7 partaient sur un push `claude/**` — les 27 autres m'obligeaient à
   attendre une fusion. Étendus à tous ceux qui ont un déclencheur `push` DÉJÀ
   filtré par `paths` (pas de volume ajouté : le compte a été suspendu pour ça).

   Quatre EXCLUSIONS volontaires, tranchées par Kevin — le cliquet ci-dessous
   empêche qu'on les ouvre par distraction :
     • deploy-firebase-rules / deploy-cmcteams-rules / firebase-rules-auto-apply
       → droits d'accès aux DONNÉES : une branche inachevée ne doit jamais
       pouvoir les réécrire. (Le 3ᵉ écoutait `claude/**` avant la décision du
       2026-09-06 ; retiré ce jour-là. Zéro clic perdu : le marker passe par
       `main` via le bot d'auto-fusion, et le push sur `main` applique.)
     • deploy (GitHub Pages) → publie le VRAI site, et sans filtre `paths` :
       l'ouvrir publierait le site à chaque push de n'importe quelle branche. */
const INTERDITS = ['deploy-firebase-rules', 'deploy-cmcteams-rules',
  'firebase-rules-auto-apply', 'deploy'];
console.log('— 3 ter. Tous les déploiements : autonomes, sauf les 3 exclus volontairement —');
for (const nom of INTERDITS) {
  const y = lire(`.github/workflows/${nom}.yml`);
  if (!y) continue;
  chk(!/branches:[\s\S]{0,160}?claude\/\*\*/.test(y),
    `${nom} : reste sur main (décision Kevin — données/site public, jamais depuis une branche)`);
}
/* Et la règle du faux vert (§3 bis) vaut pour TOUS ceux qui PUBLIENT, pas seulement
   la chaîne IA. « Publier » = mettre quelque chose en ligne : wrangler, firebase,
   vercel, Pages, netlify. On ne regarde QUE ceux-là, sinon on crie au loup sur des
   workflows qui lisent `main` pour de bonnes raisons — vécu à l'écriture de ce test :
   `branch-coordinator.yml` écoute claude/** et fait `ref: main` EXPRÈS, parce qu'il
   COMPARE les branches à main ; il ne déploie rien. Un garde qui hurle sur du
   légitime finit par être ignoré (faux positif = aussi nuisible qu'un faux négatif).

   (`firebase-rules-auto-apply.yml` est tenu par le cliquet ci-dessus : il publie
   des règles, il ne part donc plus d'une branche.) */
const PUBLIE = /wrangler\s+(deploy|pages\s+deploy|versions\s+upload)|wrangler-action|firebase\s+deploy|vercel\s+(deploy|--prod)|actions\/deploy-pages|netlify\s+deploy/i;
{
  const tous = readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'));
  let vus = 0;
  for (const f of tous) {
    const y = lire(`.github/workflows/${f}`);
    if (!/branches:[\s\S]{0,160}?claude\/\*\*/.test(y)) continue;
    if (!PUBLIE.test(y)) continue;
    vus++;
    const bloc = (y.match(/uses:\s*actions\/checkout@[^\n]*\n(?:[^\n]*\n){0,6}/) || [''])[0];
    const sansCom = bloc.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
    if (/ref:\s*main\b/.test(sansCom)) {
      chk(false, `${f} : écoute claude/** MAIS met en ligne main (faux vert, leçon #231)`);
    }
  }
  chk(vus >= 20, `au moins 20 mises en ligne partent depuis une branche claude/** (vu : ${vus})`);
}

console.log('— 4. La preuve live existe-t-elle ? (un déploiement vert ne prouve rien, leçon #95) —');
const apis = lire('.github/workflows/deploy-kdmc-apis.yml');
chk(/Preuve live/.test(apis), 'le hub pose de VRAIES questions aux IA après chaque déploiement');
chk(/\/ai\/analyse/.test(apis), 'il vérifie aussi la concertation (le type de question est voté)');
chk(/Origin: https:\/\/kd-mc\.com/.test(apis), 'il envoie une Origin de confiance (sinon 403, test faussement rouge)');
chk(/set \+e/.test(apis.split('Preuve live')[1] || ''), 'la preuve live n\'est JAMAIS bloquante (un moteur lent n\'annule pas un déploiement)');
const proxy = lire('.github/workflows/sync-apex-secrets-to-cf-worker.yml');
chk(/qwen HTTP/.test(proxy), 'le relais Apex teste réellement Qwen après déploiement');

/* ── 5. QUAND UNE MISE EN LIGNE RATE, EST-CE QUE J'APPRENDS POURQUOI ? ───────
   Kevin 2026-09-06 « Go ». Le connecteur GitHub Actions a été refusé DEUX FOIS
   par GitHub (« l'enregistrement automatique du client n'est pas pris en
   charge ») → je ne peux pas lire les journaux de la CI. Sans ça, un
   déploiement rouge ne m'apprend RIEN : je vois l'échec, pas la cause.
   Le contournement (déjà éprouvé par verifie-ia-gratuites.yml, leçon #229) :
   la CI, qui LIT le journal, en dépose l'essentiel dans le dépôt.
   Cette garde vérifie que le filet couvre bien TOUT ce qui part en autonomie —
   sinon une nouvelle mise en ligne serait ajoutée demain sans surveillance,
   et son échec redeviendrait muet. */
console.log('— 5. Une mise en ligne qui rate laisse-t-elle sa cause exacte dans le dépôt ? —');
{
  const jf = '.github/workflows/journal-deploiements.yml';
  const j = lire(jf);
  chk(j.length > 0, `le journal des déploiements ratés existe (${jf})`);
  chk(existsSync('tools/audit/journal-deploiement.py'),
    'le script qui met la panne en français existe (tools/audit/journal-deploiement.py)');
  chk(/conclusion == 'failure'/.test(j),
    'il ne tourne QUE sur un échec (un déploiement réussi n\'écrit rien = 0 volume ajouté)');
  /* On exige le [skip ci] SUR LA COMMANDE `git commit`, pas n'importe où :
     un simple commentaire qui dit « [skip ci] obligatoire » suffisait à faire
     passer le test (faux positif trouvé en le sabotant — même piège qu'au §3bis). */
  chk(/git commit -m[^\n]*\[skip ci\]/.test(j),
    'son commit porte [skip ci] (sinon cascade de workflows + boîte mail saturée)');
  chk(!/^\s*schedule:/m.test(j),
    'aucune exécution programmée (le compte a été suspendu le 15/08 pour du volume)');
  chk(/actions:\s*read/.test(j),
    'il a le droit de LIRE le journal du run raté (actions: read)');

  /* Le cœur : la liste surveillée doit couvrir chaque mise en ligne autonome. */
  const bloc = (j.match(/workflows:\n([\s\S]*?)\n\s*types:/) || ['', ''])[1];
  const surveilles = new Set(
    bloc.split('\n').map((l) => (l.match(/^\s*-\s*"?(.+?)"?\s*$/) || [])[1]).filter(Boolean));
  const oublies = [];
  for (const f of readdirSync('.github/workflows').filter((n) => n.endsWith('.yml'))) {
    const y = lire(`.github/workflows/${f}`);
    if (!/branches:[\s\S]{0,160}?claude\/\*\*/.test(y) || !PUBLIE.test(y)) continue;
    const nom = ((y.match(/^name:\s*(.+)$/m) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
    if (nom && !surveilles.has(nom)) oublies.push(`${f} (« ${nom} »)`);
  }
  chk(oublies.length === 0,
    `chaque mise en ligne autonome est surveillée${oublies.length ? ' — OUBLIÉES : ' + oublies.join(', ') : ` (${surveilles.size} au journal)`}`);

  /* La fusion automatique n'est PAS un déploiement — et c'est pourtant le maillon
     dont la panne bloque tout : si elle rate, le travail ne rejoint jamais `main`,
     donc rien ne se déploie. Vécu du 2026-09-06 au 09-10 : 4 jours dehors, cause
     invisible. Elle reste au journal, quoi qu'il arrive. */
  const AM = ((lire('.github/workflows/auto-merge-claude.yml')
    .match(/^name:\s*(.+)$/m) || [])[1] || '').trim();
  chk(AM.length > 0 && surveilles.has(AM),
    `la fusion automatique est surveillée aussi (sa panne bloque TOUT : « ${AM} »)`);
}

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
