#!/usr/bin/env node
/* ============================================================================
   BOUÉE DE SECOURS kd-mc.com — remet le domaine en ligne SANS GitHub.
   ----------------------------------------------------------------------------
   Le 14/08/2026, le compte GitHub de Kevin a été suspendu. Or le routeur
   Cloudflare (qui, lui, tourne toujours) va chercher CHAQUE page ici :

       const UPSTREAM = 'https://9r4rxssx64-creator.github.io';

   GitHub Pages s'éteint avec le compte → les 20 sous-domaines renvoient 404.
   Vérifié par Kevin sur son iPhone : « 404 ».

   Ce script recopie les dossiers réellement servis (et EUX SEULS) dans
   services/kdmc-router/public/, en gardant le préfixe /CMCteams/… attendu par
   la table ROUTES. Le Worker les sert alors lui-même quand GitHub ne répond
   pas — et REDEVIENT un simple proxy dès que GitHub revient, sans rien
   toucher : le repli ne se déclenche que sur échec de l'amont.

   Usage :
     node services/kdmc-router/prepare-secours.mjs            # apps + médias
     node services/kdmc-router/prepare-secours.mjs --leger    # apps seules (rapide)
   ========================================================================== */

import { cpSync, existsSync, mkdirSync, rmSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '../..');
const LEGER = process.argv.includes('--leger');
/* --pages : sortie destinée à Cloudflare Pages, qui sert à la RACINE.
   GitHub Pages ajoutait le préfixe /CMCteams (le nom du dépôt) ; Pages non.
   Le routeur retire ce préfixe quand UPSTREAM_PREFIX est vide — les deux
   doivent donc s'accorder, sinon on obtient des 404 partout. */
const POUR_PAGES = process.argv.includes('--pages');
/* --app <chemin> : un paquet pour UNE SEULE application, servie à la racine.
   Plan de rechange si l'éditeur de code du routeur est indisponible (il a 3
   fichiers, certains éditeurs ne gèrent que les Workers à fichier unique) :
   on crée alors un projet Pages par sous-domaine et on y rattache le domaine
   directement — le routeur est contourné pour cette app.
   Limite honnête : on perd ce que le routeur apporte (session unique, verrous
   admin, /__deces…). À réserver aux applications qui n'en dépendent pas. */
const iApp = process.argv.indexOf('--app');
const UNE_APP = iApp >= 0 ? process.argv[iApp + 1] : null;
const SORTIE = UNE_APP ? join(ICI, 'app-' + UNE_APP.replace(/\//g, '-'))
  : (POUR_PAGES ? join(ICI, 'pages-upload') : join(ICI, 'public', 'CMCteams'));

/* Exactement la table ROUTES du worker. Toute entrée ajoutée là-bas doit
   l'être ici — un test de parité le vérifie (rien ne doit rester sans secours). */
const APPS = [
  { chemin: 'kdmc-home', quoi: 'accueil kd-mc.com' },
  { chemin: 'apex-ai-v13', quoi: 'apex-ai' },
  { chemin: 'messaging-app', quoi: 'apex-chat' },
  { chemin: 'coffre-fort', quoi: 'coffre' },
  { chemin: 'tools/departs', quoi: 'départs / cmcteams-light' },
  { chemin: 'tools/crea-studio', quoi: 'studio' },
  { chemin: 'tools/crypto-bot-dashboard', quoi: 'bot' },
  { chemin: 'tools/poolrobot', quoi: 'beatbot' },
  { chemin: 'javis', quoi: 'javis' },  // l'app installable de Bee (16.09)
  { chemin: 'tools/tor', quoi: 'tor' },  // 27e adresse, ajoutee sur main le 15.09 : sans elle, GitHub eteint = 404
  { chemin: 'tools/approvals', quoi: 'autorisations' },
  { chemin: 'lingua', quoi: 'lingua' },
  { chemin: 'shops/dashboard', quoi: 'dashboard' },
  { chemin: 'shops/sourcing', quoi: 'sourcing' },
  { chemin: 'dossiers', quoi: 'dossiers (archive Epstein : index des sources officielles)' },  // 18.09 — 5e endroit obligatoire, sinon GitHub eteint = 404
  /* 11/09/2026 — la parité avec ROUTES échouait (6 entrées) depuis que ces routes existent :
     personne ne l'avait relancée. tools/cuisine = cujina/cocina/cuisine.kd-mc.com. */
  { chemin: 'tools/cuisine', quoi: 'cuisine (A Cüjina de Mùnegu)' },
  /* shops.kd-mc.com = le PORTAIL (shops/index.html + pages légales), pas tout le dossier :
     chaque boutique a sa propre entrée (dashboard, sourcing, chez-lolo, la-detente). */
  { chemin: 'shops', quoi: 'portail boutiques', fichiers: ['index.html', 'legal'] },
  /* 18.09.2026 — MESURÉ en préparant le passage du dépôt en privé : le portail
     boutiques (publié, ci-dessus) renvoie vers ces quatre vitrines, et la page
     admin renvoie vers le studio de La Détente. Aucune n'était dans le paquet :
     le jour où GitHub s'éteint (ou où le dépôt devient privé), ces liens
     tombent en 404 SANS erreur nulle part. On publie donc ce qui est LIÉ depuis
     une page publiée — c'est la règle, et elle se vérifie (test:liens-paquet). */
  { chemin: 'shops/tech-hub', quoi: 'boutique Tech Hub (liée par le portail)' },
  { chemin: 'shops/ecocraft', quoi: 'boutique EcoCraft (liée par le portail)' },
  { chemin: 'shops/digital-vault', quoi: 'boutique Digital Vault (liée par le portail)' },
  { chemin: 'shops/pawsome', quoi: 'boutique Pawsome (liée par le portail)' },
  /* 19.09.2026 — Kevin : « pourquoi l'app a plusieurs adresses ? »
     MESURÉ : rotaplan, kit et croupier sont dans la table ROUTES (chacune a son
     sous-domaine) mais n'étaient dans AUCUNE liste de ce fabricant. L'hébergeur
     ne trouvant pas leur page, il répondait par /index.html — c'est-à-dire
     CMCteams — avec un code 200. Trois adresses servaient donc l'app à la place
     de leur propre boutique, sans la moindre erreur. */
  { chemin: 'shops/rotaplan', quoi: 'rotaplan.kd-mc.com' },
  { chemin: 'shops/kit-ia', quoi: 'kit.kd-mc.com' },
  { chemin: 'shops/croupier', quoi: 'croupier.kd-mc.com' },
];
/* Routes servies par un dossier PARENT déjà copié ci-dessus (cpSync est récursif) :
   les « belles adresses » de kdmc-home. Listées pour la parité avec ROUTES. */
const COUVERTS_PAR_PARENT = ['kdmc-home/worldmonitor', 'kdmc-home/osint', 'kdmc-home/ia', 'kdmc-home/outils'];
/* ⚠️ DOSSIERS PARTAGÉS — oubliés au premier jet, et c'était grave.
   Mesuré le 15/08/2026 en ouvrant vraiment les pages dans un navigateur :
   tools/shared est appelé par 83 pages (badge de version, données de planning,
   authentification Firebase) et shops/_shared par 10. Sans eux, presque toutes
   les applications se chargent mais sont cassées à l'usage.
   Le test verify-paquet-pages.mjs vérifie désormais qu'aucun fichier ne manque. */
const PARTAGES = [
  { chemin: 'tools/shared', quoi: 'briques communes — 83 pages en dépendent' },
  /* Un seul fichier posé à la racine de tools/ : Apex y renvoie (« décodeur de
     codes »). Il était servi par github.io ; sans lui ici, le lien meurt le jour
     où le dépôt passe en privé. On copie CE fichier, pas tout le dossier. */
  { chemin: 'tools', fichiers: ['codes-decoder.html'], quoi: 'décodeur de codes (lien Apex)' },
  { chemin: 'shops/_shared', quoi: 'briques communes des boutiques — 10 pages' },
];
/* Lourds en photos : on peut les remettre dans un second temps. */
const MEDIAS = [
  { chemin: 'arbre', quoi: 'arbre généalogique' },
  { chemin: 'shops/chez-lolo', quoi: 'chez-lolo' },
  { chemin: 'la-detente', quoi: 'la-detente' },
  /* OUBLIÉ jusqu'au 10/09/2026 : cuisine.kd-mc.com (+ cocina, cujina) est
     dans la table ROUTES depuis le 13/08 mais n'était recopié NULLE PART.
     GitHub éteint = ces trois adresses restaient en 404, sans secours.
     19 Mo, 136 fichiers : c'est un livre illustré → il va avec les médias. */
  { chemin: 'tools/cuisine', quoi: 'cuisine / cocina / cujina' },
  /* Le studio de La Détente (shops/la-detente/studio.html) est lié depuis la
     page admin publiée. Le dossier porte aussi des documents de travail (.md) :
     ils sont retirés par le filtre commun, comme partout ailleurs. */
  { chemin: 'shops/la-detente', quoi: 'la-detente (studio + vitrine, liés par l\'admin)' },
];
/* PORTAILS — un dossier dont SEULE la page d'accueil est servie. Ses vitrines
   vivent dans des sous-dossiers déjà recopiés plus haut (chez-lolo, dashboard,
   sourcing…), donc recopier `shops` en entier coûterait 167 Mo pour 16 Ko
   utiles. OUBLIÉ jusqu'au 10/09/2026 : shops.kd-mc.com pointe sur la RACINE de
   `shops`, et cette racine (index.html, robots.txt, sitemap.xml) n'était dans
   aucune liste — la page d'accueil des boutiques n'avait pas de secours. */
const PORTAILS = [
  { chemin: 'shops', quoi: 'portail boutiques — page d\'accueil seule' },
];
/* cmcteams.kd-mc.com pointe sur la RACINE du dépôt : on ne recopie donc que
   les fichiers de l'app, surtout pas les 500 Mo de coulisses. */
const RACINE_FICHIERS = ['index.html', 'sw.js', 'manifest.webmanifest', 'manifest.json', 'favicon.ico', 'robots.txt'];

/* Dossiers jamais recopiés. « tests » et « workers » s'ajoutent au ménage
   habituel : mesuré le 15/08/2026 sur l'ancien site, on publiait 77 fichiers de
   test, 289 cartes de code source (elles exposent TOUT le source) et 9 fichiers
   de code SERVEUR. Aucune page ne les charge — vérifié, 0 référence. Refaire le
   paquet est l'occasion de ne plus les mettre en ligne. */
const IGNORER = new Set(['node_modules', '.git', 'coverage', '.DS_Store', 'tests', '__tests__', 'workers']);
/* Documents de travail qui ne sont PAS des Markdown. Ce sont exactement ceux que
   deploy.yml retire et que publier.sh exclut — décision déjà prise le 5.09, jamais
   appliquée ICI (mesuré le 10/09 : les deux étaient dans le paquet). On ne
   RE-décide rien, on aligne la troisième surface sur les deux autres.
   ⚠️ `arbre/research/actesimg/` reste, lui : l'app arbre s'en sert vraiment
   (19 références dans arbre/index.html) — même exception que les deux autres. */
const TRAVAIL = new Set([
  'arbre/research/actes.json', 'coffre-fort/memo', 'CLAUDE_HANDOFF.json',
  /* CODE SERVEUR ET SCRIPTS DE FABRICATION — mesuré le 19.09.2026 : le paquet
     publiait le code de DEUX workers Cloudflare de La Détente (avec leurs
     `wrangler.toml`, qui nomment les liaisons et les secrets attendus), sept
     scripts de fabrication de catalogue, et deux outils de la messagerie dont
     un de DÉCHIFFREMENT de sauvegarde. Vérifié avant de retirer : AUCUNE page
     ne les charge (0 référence dans les .html). Même raison que `workers` et
     `_*.mjs` plus bas — un site n'a pas à servir ses propres coulisses. */
  'shops/la-detente/worker', 'shops/la-detente/worker-order', 'shops/la-detente/scripts',
  'messaging-app/tools',
  /* Migrations de base de données : des ordres SQL, rien qu'un navigateur
     charge. 0 référence dans le paquet (mesuré le 22.09). */
  'messaging-app/d1-migrations',
]);
function filtre(src) {
  const base = src.split('/').pop();
  const rel = src.startsWith(RACINE + '/') ? src.slice(RACINE.length + 1) : '';
  if (TRAVAIL.has(rel)) return false;
  if (IGNORER.has(base)) return false;
  if (/\.(mp4|mov|avi|zip|patch)$/i.test(base)) return false;   // trop lourd, inutile au dépannage
  if (/\.map$/i.test(base)) return false;                       // carte de code source = tout le source exposé
  /* ⚠️ `.mjs` MANQUAIT : `[jt]sx?` couvre js/jsx/ts/tsx, PAS mjs. Mesuré le
     22.09 — `shops/_shared/firebase-orders-auth.test.mjs` était servi au
     public. Un nom de fichier qui ressemble à la règle n'est pas couvert par
     la règle. */
  if (/\.(test|spec)\.(m|c)?[jt]sx?$/i.test(base)) return false;
  /* COULISSES DE FABRICATION — retirées le 22.09, le jour où le dépôt est
     passé en PRIVÉ.
     Fermer le dépôt et continuer à servir ses scripts de déploiement et ses
     scripts de test sur le site public, c'est fermer la porte en laissant la
     fenêtre ouverte. Mesuré avant de retirer : `deploy.sh`, `gen-pdf.sh`,
     `print-fails.py`, `report-fails.py`, `playwright.config.js`,
     `vitest.config.js`, `package-lock.json` — **0 page du paquet ne les
     charge** (les 2 seules mentions de package-lock.json sont du texte dans
     le code d'Apex, pas un chargement).
     Volontairement LAISSÉS : `package.json` et `messaging-app/docs/`
     (10 renvois dans le paquet) — on ne retire que ce dont on a prouvé que
     personne ne s'en sert. */
  if (/\.(sh|py)$/i.test(base)) return false;
  if (/^(playwright|vitest)\.config\.[cm]?[jt]s$/i.test(base)) return false;
  if (base === 'package-lock.json') return false;
  /* AUCUN document de travail, comme sur les DEUX autres publications
     (deploy.yml retire `*.md`, publier.sh les exclut du miroir). Ce paquet est
     la TROISIÈME surface publique : quand GitHub est éteint, c'est LUI qui sert
     kd-mc.com — il doit obéir à la même règle, sinon la panne publie ce que le
     fonctionnement normal cache.
     MESURÉ le 10/09/2026 : la liste par préfixes (SECRETS|CLAUDE|NOTES_|MEMO|
     KEVIN_) en laissait passer **33**, dont les 21 fiches de recherche
     généalogique d'`arbre/research/` (données personnelles de la famille) et
     l'architecture des règles Firebase des boutiques.
     Sûr : 0 page du site ne charge un `.md` local — vérifié, tous les renvois
     sont des adresses absolues vers github.com (même mesure que le 5.09). */
  if (/\.md$/i.test(base)) return false;
  /* Scripts internes de fabrication (_gen-boards.mjs, _crosscheck.mjs…) :
     aucune page ne les charge — vérifié, 0 référence — et ils n'ont rien à
     faire sur un site public. */
  if (/^_.*\.(mjs|js|cjs)$/i.test(base)) return false;
  try { if (statSync(src).size > 24 * 1024 * 1024) return false; } catch (_) { /* rien */ }
  return true;
}
function compte(dir) {
  let n = 0, o = 0;
  const pile = [dir];
  while (pile.length) {
    const d = pile.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!IGNORER.has(e.name)) pile.push(p); }
      else { n++; try { o += statSync(p).size; } catch (_) { /* rien */ } }
    }
  }
  return { n, o };
}

rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });

/* Les partagés sont TOUJOURS inclus, même en mode léger : sans eux, rien ne marche. */
let liste = (LEGER ? APPS : APPS.concat(MEDIAS)).concat(PARTAGES);
if (UNE_APP) {
  /* L'app demandée + les briques communes : sans tools/shared, 83 pages sont
     cassées (mesuré le 15/08). On ne refait pas cette erreur. */
  liste = [{ chemin: UNE_APP, quoi: 'application demandée', racine: true }].concat(PARTAGES);
}
let totalFichiers = 0, totalOctets = 0;
const absents = [];
for (const a of liste) {
  const src = join(RACINE, a.chemin);
  if (!existsSync(src)) { absents.push(a.chemin); continue; }
  /* racine:true → l'app est servie À LA RACINE du projet Pages, pas dans son
     sous-dossier (c'est ce qu'attend un domaine rattaché directement). */
  const dst = a.racine ? SORTIE : join(SORTIE, a.chemin);
  mkdirSync(dirname(dst), { recursive: true });
  if (a.fichiers) {
    /* entrée « portail » : seulement les fichiers/dossiers nommés, pas tout le dossier */
    mkdirSync(dst, { recursive: true });
    for (const f of a.fichiers) { const s = join(src, f); if (existsSync(s)) cpSync(s, join(dst, f), { recursive: true, filter: filtre }); }
  } else {
    cpSync(src, dst, { recursive: true, filter: filtre });
  }
  const { n, o } = compte(dst);
  totalFichiers += n; totalOctets += o;
  console.log(`  ${String(n).padStart(5)} fichiers  ${(o / 1048576).toFixed(1).padStart(6)} Mo   ${a.chemin}  (${a.quoi})`);
}
/* Portails : on copie les fichiers posés À LA RACINE du dossier, et rien
   d'autre — pas de descente dans les sous-dossiers (ils sont déjà traités,
   ou volontairement laissés de côté). Un seul mode l'exclut : --app, qui
   fabrique un paquet pour UNE application servie à la racine. */
for (const p of (UNE_APP ? [] : PORTAILS)) {
  const src = join(RACINE, p.chemin);
  if (!existsSync(src)) { absents.push(p.chemin); continue; }
  const dst = join(SORTIE, p.chemin);
  mkdirSync(dst, { recursive: true });
  let n = 0, o = 0;
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const f = join(src, e.name);
    if (!filtre(f)) continue;
    cpSync(f, join(dst, e.name));
    n++; o += statSync(f).size;
  }
  totalFichiers += n; totalOctets += o;
  console.log(`  ${String(n).padStart(5)} fichiers  ${(o / 1048576).toFixed(1).padStart(6)} Mo   ${p.chemin}  (${p.quoi})`);
}

for (const f of RACINE_FICHIERS) {
  const src = join(RACINE, f);
  if (!existsSync(src)) continue;
  cpSync(src, join(SORTIE, f));
  totalFichiers++; totalOctets += statSync(src).size;
}
console.log(`  ${String(RACINE_FICHIERS.filter((f) => existsSync(join(RACINE, f))).length).padStart(5)} fichiers          racine (cmcteams.kd-mc.com)`);
console.log(`        déjà dedans (dossier parent copié) : ${COUVERTS_PAR_PARENT.join(', ')}`);

console.log('\n────────────────────────────────────────────────');
console.log(`  TOTAL : ${totalFichiers} fichiers, ${(totalOctets / 1048576).toFixed(1)} Mo`);
console.log(`  Limite Cloudflare : 20 000 fichiers, 25 Mo par fichier`);
if (absents.length) console.log(`  ⚠️  absents du dépôt (ignorés) : ${absents.join(', ')}`);
if (totalFichiers > 20000) {
  console.error('\n❌ trop de fichiers pour Cloudflare — relance avec --leger');
  process.exit(1);
}
if (POUR_PAGES) {
  console.log('\n✅ Prêt pour Cloudflare Pages (envoi direct, sans aucun dépôt de code).');
  console.log('   Dossier : ' + SORTIE);
  console.log('   Les fichiers sont à la RACINE (pas de préfixe /CMCteams) :');
  console.log('   il faudra donc laisser UPSTREAM_PREFIX VIDE dans le routeur.\n');
} else {
  console.log('\n✅ Prêt. Pour remettre kd-mc.com en ligne :');
  console.log('     cd services/kdmc-router && npx wrangler login && npx wrangler deploy\n');
}

/* ── REPÈRE DU PAQUET ───────────────────────────────────────────────────────
   Pourquoi ce fichier minuscule : le 18.09.2026, pour savoir si le domaine
   servait encore l'ancien hébergeur, j'ai comparé un fichier présent chez l'un
   et absent chez l'autre (package.json). Mauvaise idée : Cloudflare Pages, en
   l'absence de 404.html, répond à TOUTE adresse inconnue par la page d'accueil
   AVEC un code 200. Le contrôle criait « fuite » et « bascule ratée » alors que
   tout allait bien. Un repère explicite ne ment pas : il n'existe que dans ce
   paquet, et son CONTENU se vérifie (une page d'accueil ne ressemble pas à ça).
   Il ne révèle rien : ni chemin interne, ni version, ni nom de fichier. */
if (POUR_PAGES) {
  writeFileSync(join(SORTIE, '__paquet.txt'),
    'paquet-applications-kdmc\n'
    + 'Ce fichier prouve que le site servi est le paquet trie (applications seules).\n');
  console.log('   repère du paquet : __paquet.txt');
}
