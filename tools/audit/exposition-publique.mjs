#!/usr/bin/env node
/* ============================================================================
 * QU'EST-CE QUI EST RÉELLEMENT PUBLIC SUR kdmc-site.pages.dev ?
 * ----------------------------------------------------------------------------
 * Kevin, 4.09.2026 : capture d'écran de l'arbre familial ouvert sur
 * kdmc-site.pages.dev — 119 personnes, noms, dates de naissance, enfants,
 * divorces. Sans code.
 *
 * Le site est construit par Cloudflare Pages À PARTIR DU DÉPÔT ENTIER. Donc la
 * question n'est pas « l'arbre est-il public » mais « QUOI d'autre l'est ».
 * Ce script va le VÉRIFIER, page par page, au lieu de le supposer.
 *
 * Il ne peut pas tourner depuis la machine de l'agent (pare-feu) : sa place est
 * le runner, comme les autres vérifications réelles.
 *
 * PRUDENCE : il n'affiche JAMAIS les données trouvées, seulement le fait qu'un
 * marqueur est présent et combien de fois. Un journal de CI n'est pas l'endroit
 * où recopier les dates de naissance d'une famille.
 *
 * Lancer : node tools/audit/exposition-publique.mjs [--site https://...]
 * ========================================================================== */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nomsFamille } from '../depot-public/exporter.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = join(RACINE, 'patrimoine-resultats');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = (arg('--site', 'https://kdmc-site.pages.dev')).replace(/\/$/, '');

/* Les chemins à sonder, du plus sensible au moins sensible.
 *
 * `docTravail: true` = un document de TRAVAIL, que les deux publications sont
 * censées retirer (l'étape « Retirer les documents de travail » de
 * .github/workflows/deploy.yml côté GitHub Pages, les `--exclude` de
 * tools/gitlab/publier.sh côté miroir Cloudflare). Aucune page du site ne les
 * charge — vérifié. S'il en reste UN de public, c'est une vraie fuite et ce
 * script sort en ERREUR (code 1).
 *
 * Les entrées SANS ce drapeau sont le site lui-même (l'app CMCteams, ses
 * plannings, l'arbre). Elles sont « graves » parce qu'elles contiennent
 * réellement des noms, mais on ne peut pas les retirer sans supprimer le site :
 * leur correctif est architectural (servir la donnée derrière la connexion du
 * domaine), pas un `rm`. Les compter comme des échecs mettrait un rouge
 * PERMANENT que plus personne ne regarderait. */
/* Le même chemin doit marcher sur les DEUX publications, qui ne rangent pas pareil :
   le miroir Cloudflare sert l'app à la RACINE, GitHub Pages la sert sous /CMCteams/
   (« project pages »). Certaines entrées portent donc déjà ce préfixe. Si le site
   sondé le porte lui aussi, on ne le met pas deux fois — sinon on demande
   /CMCteams/CMCteams/index.html, on récolte un 404, et le rapport annonce que
   l'application n'est pas publiée alors qu'elle l'est. */
const adresseDe = (chemin) => {
  const prefixe = SITE.match(/\/[^/]+$/);
  if (prefixe && chemin.startsWith(prefixe[0] + '/')) return SITE.slice(0, -prefixe[0].length) + chemin;
  return SITE + chemin;
};

const CHEMINS = [
  /* — Le site lui-même. `u:` = adresse ABSOLUE, parce que le domaine range ses
       apps par SOUS-DOMAINE (arbre.kd-mc.com) alors que le miroir les met à la
       racine. Sondé le 5.09 sur kd-mc.com : /arbre/index.html y répond 404 — pas
       parce que l'arbre serait privé, mais parce qu'il est ailleurs. Un rapport
       qui laisse croire l'inverse est pire que pas de rapport. — */
  { u: 'https://arbre.kd-mc.com/', quoi: 'arbre familial (noms, dates de naissance, enfants)', grave: 3 },
  { p: '/arbre/index.html', quoi: 'arbre familial (copie à la racine, sur le miroir)', grave: 3 },
  { p: '/tools/shared/planning-seed.js', quoi: 'plannings : ~280 employés nommés', grave: 3 },
  { p: '/CMCteams/tools/shared/planning-seed.js', quoi: 'plannings (chemin /CMCteams/)', grave: 3 },
  { p: '/tools/departs/boards-gen.js', quoi: 'ordres de départ par employé', grave: 3 },
  { p: '/CMCteams/index.html', quoi: 'application CMCteams (effectif complet)', grave: 3 },
  { p: '/index.html', quoi: 'application CMCteams (à la racine, sur le miroir)', grave: 3 },

  /* — Les documents de travail : doivent TOUS être absents — */
  { p: '/NOTES_USER.md', quoi: 'notes métier (employés du casino, règles internes)', grave: 3, docTravail: true },
  { p: '/arbre/research/actes.json', quoi: 'index des actes d\'état civil de la famille', grave: 3, docTravail: true },
  { p: '/KEVIN_ACTIONS_TODO.md', quoi: 'actions en attente (comptes, fournisseurs)', grave: 2, docTravail: true },
  { p: '/KEVIN_INVENTORY.md', quoi: 'inventaire des fichiers créés', grave: 1, docTravail: true },
  { p: '/MEMO_RESUME.md', quoi: 'mémo de session', grave: 1, docTravail: true },
  { p: '/CLAUDE.md', quoi: 'règles de travail', grave: 1, docTravail: true },
  { p: '/LESSONS.md', quoi: 'leçons apprises', grave: 1, docTravail: true },
  { p: '/ETAT-INFRA.md', quoi: 'état de l\'infra (comptes, dépôts, jetons cités)', grave: 2, docTravail: true },
  { p: '/SESSIONS-ET-BRANCHES.md', quoi: 'carte des sessions de travail', grave: 1, docTravail: true },
  { p: '/CLAUDE_HANDOFF.json', quoi: 'passation entre sessions', grave: 1, docTravail: true },
  { p: '/pipeline/sessions.json', quoi: 'registre des sessions de travail', grave: 1, docTravail: true },
  /* Kevin 2026-09-18 : « que personne ne puisse tout voir, les noms de chaque personne ».
     MESURÉ le 18.09 : la publication servait tests/fixtures/*.pdf — les CINQ PLANNINGS SBM
     D'ORIGINE (10 Mo), téléchargeables par n'importe qui. Retirés depuis ; sondés ici pour
     que le jour où le retrait échoue, on le sache. */
  { p: '/tests/fixtures/septembre-2026-v2.pdf', quoi: 'planning SBM d\'origine (tout le personnel, un mois entier)', grave: 3, docTravail: true },
  { p: '/tests/fixtures/octobre-2026.pdf', quoi: 'planning SBM d\'origine (tout le personnel, un mois entier)', grave: 3, docTravail: true },
  { p: '/tests/fixtures/octobre-2026-v2.pdf', quoi: 'planning SBM d\'origine (tout le personnel, un mois entier)', grave: 3, docTravail: true },
  { p: '/audit/github-reponse-support.md', quoi: 'échange avec le support GitHub', grave: 2, docTravail: true },
  { p: '/arbre/research/RECHERCHES.md', quoi: 'notes de recherche généalogique', grave: 2, docTravail: true },
  { p: '/patrimoine/00-A-FAIRE.md', quoi: 'dossier patrimoine', grave: 3, docTravail: true },
  { p: '/patrimoine-resultats/rapport.md', quoi: 'résultats des recherches', grave: 3, docTravail: true },
  { p: '/coffre-fort/memo/01-secrets-github.pdf', quoi: 'mémo perso « secrets GitHub » (formulaire vierge, mais rien à faire en ligne)', grave: 2, docTravail: true },
  /* Quelques documents pris au hasard dans le lot : si la règle « aucun Markdown
     publié » se cassait, ce sont eux qui le diraient, pas seulement les fichiers
     que quelqu'un a pensé à lister un jour. */
  { p: '/tools/gitlab/secrets-map.txt', quoi: 'carte des NOMS de secrets par Worker (aucune valeur, mais rien à faire en ligne)', grave: 2, docTravail: true },
  { p: '/AGENTS.md', quoi: 'consignes de travail (contrôle de la règle « aucun .md publié »)', grave: 1, docTravail: true },
  { p: '/archives/PLAINTE_ANTHROPIC.md', quoi: 'courrier personnel archivé', grave: 2, docTravail: true },
  { p: '/_PROJECTS_KDMC/e-KDMC/NOTES_USER.md', quoi: 'notes métier d\'un sous-projet', grave: 2, docTravail: true },
];

function familleOuRien() {
  try { return nomsFamille(); } catch { console.log('(arbre absent ici : noms de la famille non contrôlés par cette sonde)'); return []; }
}

/* Marqueurs de données personnelles — on compte, on n'affiche jamais. */
const MARQUEURS = [
  /* Les noms de la famille ne s'écrivent dans AUCUN fichier du dépôt public (24.09.2026) : ils
     sont lus dans l'arbre, qui reste au coffre. Au public sans l'arbre, seul le nom de Kevin est
     contrôlé ici — la sonde de fuite du routeur couvre le domaine. */
  { nom: 'noms de famille de la lignée', re: new RegExp('\\b(' + ['DESARZENS', ...familleOuRien()].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi') },
  { nom: 'dates de naissance complètes', re: /\b\d{1,2}[./]\d{1,2}[./](19|20)\d{2}\b/g },
  { nom: 'adresses e-mail', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { nom: 'numéros de téléphone', re: /\b(?:\+33|0|\+377)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}\b/g },
];

mkdirSync(SORTIE, { recursive: true });
const lignes = [];
console.log(`Site sondé : ${SITE}\n`);

/* PIÈGE À ÉVITER : le site renvoie la PAGE D'ACCUEIL (HTTP 200) pour tout
   chemin inconnu, au lieu d'un 404. Au premier passage, ça m'a fait annoncer
   deux « fuites » qui n'existaient pas — les deux pesaient exactement la taille
   de l'accueil. On récupère donc l'accueil une fois, et tout ce qui lui est
   identique est compté ABSENT. Mieux vaut vérifier que crier au loup. */
let accueil = '';
/* Anti-cache OBLIGATOIRE. Mesuré le 5.09 : après avoir retiré NOTES_USER.md de
   la publication (11228 → 11102 fichiers, vérifié dans le journal), le site
   répondait TOUJOURS 200 sur ce fichier — c'était le cache de bordure. Un audit
   d'exposition qui se fait berner par un cache ment dans les deux sens : il
   crie au loup sur une fuite déjà bouchée, et il rassurerait à tort si le cache
   servait une ancienne version propre. On casse donc le cache à chaque appel. */
const SANS_CACHE = { cache: 'no-store', headers: { 'cache-control': 'no-cache', pragma: 'no-cache' } };
const bust = (u) => u + (u.includes('?') ? '&' : '?') + '_nocache=' + Date.now();

/* AVANT TOUT : est-ce qu'on ATTEINT le site ? Sans ce contrôle, un réseau
   coupé donne « tout est absent » — donc un ✅ franc et massif alors qu'on n'a
   RIEN mesuré. Vécu le 5.09 depuis le conteneur de l'agent : le pare-feu
   répondait 403 à chaque adresse et l'audit annonçait fièrement « aucun
   document de travail publié ». Un contrôle qui ment est pire que pas de
   contrôle. On exige donc que la page d'accueil réponde vraiment. */
let statutAccueil = 0;
try {
  const r0 = await fetch(bust(SITE + '/'), SANS_CACHE);
  statutAccueil = r0.status;
  if (r0.ok) accueil = await r0.text();
} catch (e) { statutAccueil = -1; accueil = ''; }
if (!accueil) {
  console.log(`❌ MESURE IMPOSSIBLE : ${SITE}/ ne répond pas (HTTP ${statutAccueil}).`);
  console.log('   Je ne peux donc RIEN affirmer sur ce qui est publié — et surtout pas');
  console.log('   « tout va bien ». Depuis le conteneur de l\'agent, le pare-feu bloque');
  console.log('   ces adresses : cet audit doit tourner sur un runner (GitHub Actions');
  console.log('   après la publication, ou le job GitLab), pas ici.');
  process.exit(2);
}

for (const c of CHEMINS) {
  let statut = 0, taille = 0, trouves = [];
  try {
    const r = await fetch(bust(c.u || adresseDe(c.p)), { redirect: 'follow', ...SANS_CACHE });
    statut = r.status;
    if (r.ok) {
      const t = await r.text();
      taille = t.length;
      /* Deux formes du MÊME piège, et la 2e m'a coûté 4 déploiements rouges
         le 19.09 : (a) l'hébergeur renvoie EXACTEMENT la page d'accueil ;
         (b) il renvoie une AUTRE page HTML (Cloudflare Pages, sans 404.html,
         sert l'index du projet pour toute adresse inconnue — et ce n'est pas
         l'accueil du sous-domaine qu'on a mesuré). Dans les deux cas le
         fichier demandé n'existe pas. On demandait un .pdf, un .json, un .md :
         recevoir un document HTML ne peut pas être ce fichier-là. */
      const estHtml = /<(!doctype|html)\b/i.test(t.slice(0, 400));
      const demandeFichier = /\.(pdf|json|md|js|mjs|cjs|yml|yaml|txt|csv|map)$/i.test(c.u || c.p);
      if (accueil && t === accueil) { statut = 404; taille = 0; trouves = ['(page d\'accueil renvoyée — le fichier n\'existe pas)']; }
      else if (estHtml && demandeFichier) { statut = 404; taille = 0; trouves = ['(page HTML renvoyée à la place du fichier — repli de l\'hébergeur, le fichier n\'existe pas)']; }
      else {
      for (const m of MARQUEURS) {
        const n = (t.match(m.re) || []).length;
        if (n > 0) trouves.push(`${m.nom} ×${n}`);
      }
      }
    }
  } catch (e) {
    statut = -1;
    trouves = [String(e.message).slice(0, 60)];
  }
  const publique = statut >= 200 && statut < 300;
  const alerte = c.docTravail
    ? (publique ? '🚨 FUITE' : '✅ retiré')
    : (publique && c.grave >= 3 ? '🔶 le site' : publique ? 'ℹ️ public' : '— pas ici');
  lignes.push({ ...c, statut, taille, trouves, publique, alerte });
  console.log(`${alerte.padEnd(10)} HTTP ${String(statut).padEnd(4)} ${String(taille).padStart(8)} o  ${c.u || c.p}`);
  if (trouves.length) console.log(`             ↳ ${trouves.join(' · ')}`);
}

const fuites = lignes.filter((l) => l.docTravail && l.publique);
const structurel = lignes.filter((l) => !l.docTravail && l.publique && l.grave >= 3);
let md = `# Ce qui est réellement public sur ${SITE}\n\n`;
md += `Sondé le ${new Date().toLocaleString('fr-FR')}. **${fuites.length} document(s) de travail encore publié(s)**`;
md += ` · ${structurel.length} page(s) du site portant des noms (correctif architectural, pas un retrait).\n\n`;
md += `| État | Chemin | Ce que c'est | HTTP | Taille | Données personnelles détectées |\n|---|---|---|---|---|---|\n`;
for (const l of lignes) {
  md += `| ${l.alerte} | \`${l.u || l.p}\` | ${l.quoi} | ${l.statut} | ${l.taille || '—'} | ${l.trouves.join(', ') || '—'} |\n`;
}
md += `\n*Les données elles-mêmes ne sont jamais recopiées ici : seulement le nombre\n`;
md += `d'occurrences. Un rapport n'a pas à republier ce qu'il dénonce.*\n`;
writeFileSync(join(SORTIE, 'exposition-publique.md'), md);
writeFileSync(join(SORTIE, 'exposition-publique.json'), JSON.stringify({ site: SITE, quand: new Date().toISOString(), lignes }, null, 2));

console.log('');
if (fuites.length) {
  console.log(`🚨 ${fuites.length} document(s) de TRAVAIL encore publié(s) sur ${SITE} :`);
  for (const f of fuites) console.log(`   ${f.p}  (${f.quoi})`);
  console.log('');
  console.log('Ce sont des documents qu\'aucune page du site ne charge. Les deux');
  console.log('publications sont censées les retirer :');
  console.log('  · GitHub Pages  → étape « Retirer les documents de travail » de');
  console.log('                     .github/workflows/deploy.yml');
  console.log('  · miroir Cloudflare → les --exclude de tools/gitlab/publier.sh');
  console.log('Si l\'un des deux vient de changer, il peut aussi s\'agir du CACHE de');
  console.log('bordure : ce script casse déjà le cache à chaque appel, donc une');
  console.log('réponse 200 ici est un vrai fichier, pas un souvenir.');
} else {
  console.log(`✅ Aucun document de travail publié sur ${SITE}.`);
}
if (structurel.length) {
  console.log('');
  console.log(`🔶 ${structurel.length} page(s) du SITE portent des noms — c'est le site lui-même`);
  console.log('   (l\'app CMCteams, ses plannings, l\'arbre). On ne les retire pas : leur');
  console.log('   correctif est de servir la donnée derrière la connexion du domaine.');
}
const pasIci = lignes.filter((l) => !l.docTravail && !l.publique);
if (pasIci.length) {
  console.log('');
  console.log(`ℹ️  ${pasIci.length} adresse(s) du site n'existent pas ICI — et ça ne veut PAS dire`);
  console.log('   « pas public » : le domaine range ses apps par sous-domaine, le miroir les');
  console.log('   met à la racine. Une même app est donc absente d\'un côté et présente de');
  console.log('   l\'autre. Ne rien conclure d\'un « pas ici ».');
}
console.log(`\nDétail : patrimoine-resultats/exposition-publique.md`);
/* Sortie en erreur UNIQUEMENT sur les documents de travail. Faire échouer sur
   les pages du site mettrait un rouge permanent — et un rouge permanent, plus
   personne ne le regarde. */
if (fuites.length) process.exitCode = 1;
