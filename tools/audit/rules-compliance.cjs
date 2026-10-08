#!/usr/bin/env node
/**
 * AUDIT DE CONFORMITÉ DES RÈGLES — « vérifie que toutes tes règles soient respectées
 * automatiquement » (Kevin 2026-08-09).
 *
 *   node tools/audit/rules-compliance.cjs                     → tableau règle → garde-fou
 *   node tools/audit/rules-compliance.cjs --update-baseline   → fige le nb de règles sans garde
 *
 * POURQUOI : le 2026-08-09 Kevin a dû me rappeler la parité Apex alors qu'elle était écrite noir
 * sur blanc dans CLAUDE.md. Cause racine : une règle qui ne vit QUE dans un document dépend de ma
 * mémoire → elle finit par être sautée. Cet outil rend le trou VISIBLE et MESURÉ : pour chaque
 * règle, quel test / workflow / garde la fait respecter TOUT SEUL — et lesquelles n'en ont aucun.
 *
 * RATCHET : on échoue si le nombre de règles SANS garde AUGMENTE (= une nouvelle règle a été
 * ajoutée sans automatisme). L'existant ne met pas un rouge permanent.
 *
 * Statuts : ✅ AUTO (garde existe et tourne) · 🟡 PARTIEL (garde existe, hors gate) ·
 *           🔴 DÉCLARATIF (aucun automatisme — dépend de ma mémoire).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASELINE = path.join(__dirname, 'rules-compliance-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
const VERBOSE = process.argv.includes('--all');

/* Depuis le decoupage du 17.09.2026, les REGLES et leurs gardes vivent dans
   CLAUDE-HISTOIRE.md (le recit complet) ; CLAUDE.md n'en est plus que l'index,
   charge a chaque message. Cet outil analyse donc le RECIT, avec repli sur
   l'index si le decoupage n'a pas (encore) ete fait. */
const FICHIER_REGLES = fs.existsSync(path.join(ROOT, 'CLAUDE-HISTOIRE.md')) ? 'CLAUDE-HISTOIRE.md' : 'CLAUDE.md';
const claude = fs.readFileSync(path.join(ROOT, FICHIER_REGLES), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const gate = pkg.scripts['test:ci'] || '';
const wfDir = path.join(ROOT, '.github', 'workflows');
const workflows = fs.existsSync(wfDir) ? fs.readdirSync(wfDir) : [];

/* ─── 1. Toutes les règles déclarées dans CLAUDE.md ─── */
const rules = [];
for (const line of claude.split('\n')) {
  const m = line.match(/^##+\s+.*RÈGLE\s+(?:ABSOLUE|PERMANENTE|MÉTIER ABSOLUE|SUPRÊME|CRITIQUE|EXPERT|BATCHING|UX|DE FIN)?\s*—?\s*(.+)$/);
  if (!m) continue;
  const titre = m[1].replace(/\(Kevin[^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  if (titre) rules.push(titre);
}

/* ─── 2. Registre : règle (motif du titre) → garde-fou qui la fait respecter ───
   'npm:x'  = script npm (✅ si aussi dans test:ci, 🟡 sinon)
   'wf:x'   = workflow GitHub Actions
   'file:x' = fichier/test qui doit exister                                       */
const REGISTRE = [
  // Règle « Qwen gratuit » (CLAUDE.md, Kevin 5.09.2026) : ses 5 gardes existaient déjà et
  // tournaient dans test:ci, mais l'entrée manquait ici → le ratchet comptait la règle comme
  // « sans automatisme » (19 → 20) et rougissait test:ci pour TOUTES les sessions (6.09).
  [/QWEN GRATUIT EN IA PRINCIPALE/i, ['npm:test:qwen-gratuit', 'npm:test:bascule', 'npm:test:ia-route', 'npm:test:cmc-ia-gratuite', 'npm:test:apex-proxy-qwen']],
  // Règle « prévenir ne suffit pas » (CLAUDE.md, Kevin 10.09.2026) : un signalement ouvert de plus
  // de 2 jours doit porter un suivi daté (réveil, relance, prise en charge, vérification).
  [/PRÉVENIR NE SUFFIT PAS/i, ['npm:test:messages-suivis', 'npm:test:pipeline-sessions']],
  [/TOUT LE MONDE A UN PLANNING/i, ['npm:test:everyone-has-planning']],
  // Regle « chaque app distincte, toutes liees dans le domaine » (CLAUDE.md, Kevin 15.09.2026) :
  // ses DEUX gardes existent et tournent dans test:ci (parite ROUTES/APPS + reglage au doigt
  // prouve en vrai navigateur), mais l'entree manquait ICI -> le ratchet comptait la regle
  // « sans automatisme » (19 -> 20) et rougissait test:ci pour TOUTES les sessions (17.09).
  // TROISIEME fois que ce scenario se produit (cf. Qwen et « j'ai internet » ci-dessus) :
  // ajouter une regle a CLAUDE.md = ajouter son entree ICI dans le MEME commit.
  [/CHAQUE APP DISTINCTE/i, ['npm:test:perimetre-apps', 'npm:test:perimetre-page']],
  [/UNE SEULE V[ÉE]RIT[ÉE] DU MOMENT/i, ['npm:test:etat-du-moment']],
  // Règle « J'ai internet et des outils » (CLAUDE.md, Kevin 14.08.2026) : sa garde EXISTE
  // depuis le 6.09 (tools/audit/liens-check.mjs, joué par le job GitLab « liens-reels » —
  // pinguer des sites tiers n'a pas sa place sur GitHub, cf. règle des destinations), mais
  // l'entrée manquait ICI. Le ratchet la comptait donc « sans automatisme » (19 → 20) et
  // rougissait test:ci pour TOUTES les sessions — exactement la même cause que Qwen ci-dessus.
  [/J'AI INTERNET ET DES OUTILS/i, ['file:tools/audit/liens-check.mjs']],
  // Regle « VERIFIER TOUJOURS SES LIENS EN REEL » (Kevin 23.09.2026) : elle renforce
  // « J'AI INTERNET » et s'appuie sur LE MEME outil, deja en place depuis le 6.09
  // (tools/audit/liens-check.mjs, joue par le job GitLab « liens-reels »). Son entree
  // manquait ici : quatrieme fois que ce scenario se produit (Qwen gratuit, j'ai internet,
  // perimetre des apps) — une regle nouvelle dont le garde EXISTE deja, mais qui n'est pas
  // declaree, fait rougir le gate de TOUT LE MONDE.
  [/VÉRIFIER TOUJOURS SES LIENS EN RÉEL/i, ['file:tools/audit/liens-check.mjs']],
  // Regle « LE FICHIER DE REGLES PORTE LA REGLE, PAS SON RECIT » (17.09.2026) : son garde
  // est ecrit et cable le jour meme (test:claude-md) — aucune regle ne peut disparaitre.
  [/LE FICHIER DE RÈGLES SE LIT À CHAQUE MESSAGE/i, ['npm:test:claude-md']],
  // Regle « LES DOCUMENTS SE METTENT A JOUR TOUT SEULS » (24.09.2026) : garde ecrit et cable
  // le jour meme — un document perime fait echouer la chaine.
  [/LES DOCUMENTS SE METTENT À JOUR TOUT SEULS/i, ['npm:test:maj-tout']],
  // Ajoutés le 1.10.2026 : trois règles de fin septembre (27 et 30.09) avaient DÉJÀ leurs gardes
  // dans test:ci (ou le workflow réel), mais pas leur entrée ici → ratchet 19 → 22, test:ci rouge
  // pour tout le monde. Cinquième fois : règle nouvelle = entrée ICI dans le même commit.
  [/GRATUIT PAR DÉFAUT/i, ['npm:test:gratuit']],
  // Règle « CONFÉRENCE DES IA GRATUITES … POUR TOUTES LES APPS » (Kevin 2.10.2026 soir) : garde = test:conference-partout
  // (chaque app entre par routeSmart / /ai, balayage des workers, sabotage) + test:ia-route (3 tours, compétence durable).
  // L'entrée avait été PERDUE à la fusion #4242 (résolution « version de main » du fichier) → ratchet 19 → 21 (3.10 00h23).
  [/CONFÉRENCE DES IA GRATUITES/i, ['npm:test:conference-partout', 'npm:test:ia-route']],
  // Règle « LA BOÎTE UNIQUE : TOUS LES MESSAGES DE TOUTES LES APPS … » (Kevin 3.10.2026) : gardes = boite.test.mjs (adaptateurs
  // Lingua / CMCteams / dépôts / Rotaplan / Arbre / alertes, réponse directe, 0 écriture KV) + portail réel dans Chromium.
  [/LA BOÎTE UNIQUE/i, ['npm:test:boite', 'npm:test:boite-portail']],
  // Règle « AUCUNE CONSULTATION SANS COMPTE, NULLE PART » (Kevin 3.10.2026) : garde = compte-obligatoire.test.mjs (toutes les adresses, sabotage).
  [/AUCUNE CONSULTATION SANS COMPTE/i, ['npm:test:compte-obligatoire']],
  // Règle « ARBRE : AJOUTER TOUT SEUL LES NOUVELLES PERSONNES QUAND L'INFO EST SÛRE » (Kevin 3.10.2026, session arbre,
  // commit 23ed102f6 sans entrée → ratchet rouge pour tout le monde). Ce qui est MÉCANISABLE vit dans le robot d'écriture de
  // l'arbre (essai à blanc → écriture → rejouer = 0, anti-doublon par `ref`) et dans la section « à relier » ; le jugement
  // « l'info est sûre » reste celui de la session. Entrée posée par la session conférence (3.10 00h55), à affiner par arbre.
  [/ARBRE : AJOUTER TOUT SEUL/i, ['wf:arbre-nuage.yml', 'npm:test:arbre-relier']],
  // Règle « CONTRÔLER TOUT, PARTOUT, SUR LE VRAI » (Kevin 3.10.2026, ajoutée par la session arbre sans entrée ici → test:improvements-guard
  // rouge 19 → 20) : ses contrôles existent déjà — le vrai nuage (arbre-nuage.yml + test:arbre-nuage, garde-fou homonymes),
  // le rendu sur 10 appareils (verify-visuel-appareils.mjs, test:arbre-dates-visuel).
  [/CONTRÔLER TOUT, PARTOUT, SUR LE VRAI/i, ['wf:arbre-nuage.yml', 'npm:test:arbre-nuage', 'npm:test:arbre-dates-visuel', 'file:tools/arbre/verify-visuel-appareils.mjs']],
  // Règle « FORMATION / ÉCOLE DE JEUX : MÊME ÉQUIPE, MAIS DÉPARTS ENTRE EUX » (Kevin 5.10.2026, PDF octobre « GR1 CRAPS ») :
  // garde = lecture du vrai PDF + contre-épreuve « chaque numéro = groupe tournant seul » (app + light), parité app ⇄ light.
  [/FORMATION \/ ÉCOLE DE JEUX/i, ['npm:test:departs-groupes', 'npm:test:departs-compare']],
  // Règle « INSCRIPTION UNIQUE DU DOMAINE » (Kevin 7.10.2026) : conditions une fois par compte, porte unique, refus hors planning.
  // Règle « DÉPARTS : LES SÉRIES » (Kevin 7.10.2026 soir, « 4235-2351-3514 ») : son exemple exact verrouillé.
  [/DÉPARTS : LES SÉRIES/i, ['npm:test:departs-cycle', 'npm:test:departs-render', 'npm:test:verif-live-robot']],
  [/INSCRIPTION UNIQUE DU DOMAINE/i, ['npm:test:inscription-unique', 'npm:test:cgu-une-fois', 'npm:test:matricule-fiche']],
  // Règle « TOUT GRATUIT, PARTOUT, TOUJOURS » (Kevin 2.10.2026 soir) : garde = test:tout-gratuit (chaque cascade du dépôt —
  // ia-route, kdmc-apis, Créa, chat-svc, messagerie, outils Lingua, Apex — commence par un gratuit ; sabotage prouvé).
  [/TOUT GRATUIT, PARTOUT, TOUJOURS/i, ['npm:test:tout-gratuit', 'npm:test:ia-route']],
  // Règle « QUAND UN GRATUIT S'ÉPUISE, LE RELAIS EST GRATUIT, DE MÊME NIVEAU, ET PRÉVU D'AVANCE » (Kevin 2.10.2026) :
  // ses gardes = ia-route.test.mjs (niveaux A/B, pauses d'épuisement durables, anticipation par en-têtes, relais de
  // modèle retiré — 26 contrôles, 2 sabotages) + la sonde réelle des paliers gratuits (test:sonde-ia-gratuites).
  // Cinquième fois que ce scénario se produit : l'entrée manquait ici → ratchet 19 → 20, test:ci-prive rouge (2.10).
  [/QUAND UN GRATUIT S'ÉPUISE/i, ['npm:test:ia-route', 'npm:test:sonde-ia-gratuites']],
  [/TOUT S'OUVRE AUTOMATIQUEMENT/i, ['npm:test:admin-partout', 'npm:test:admin-sans-code', 'npm:test:sso-duree']],
  // Règle « BEE ET BOURRICOT : TOUT LE CORPS BOUGE, PARTOUT, TOUJOURS » (Kevin 3.10.2026) : garde = la marionnette
  // jouée dans Chromium + WebGL (chaque membre, 15 dessins sans pli, humeurs, replis, sobriété).
  [/CHAQUE SESSION VÉRIFIE SON PROPRE TRAVAIL/i, ['npm:test:hygiene-depot', 'file:tests/verify-hygiene-depot.mjs']],
  [/ASSISTANTE PERSONNELLE DE KEVIN/i, ['npm:test:bee-partout', 'npm:test:bee-agir', 'npm:test:bee-partout-navigateur', 'npm:test:bee-fil', 'npm:test:bee-fil-navigateur', 'file:services/kdmc-router/bee-agir.js', 'file:services/kdmc-router/bee-fil.js']],
  [/BEE ET BOURRICOT SONT COMPÉTENTS/i, ['npm:test:bee-outils', 'file:services/_shared/outils-lecture.js']],
  [/VRAIS PETITS PERSONNAGES ANIMÉS/i, ['npm:test:marionnette', 'file:tools/javis/marionnette.js', 'npm:test:3d', 'file:javis/3d.html']],
  [/RÉEL TOUJOURS : RIEN N'EST/i, ['wf:verif-reelle.yml', 'wf:audit-lingua.yml', 'file:tools/ci/plafond-verifs.mjs']],
  [/LISTE DE COMMANDES COMPLÈTE/i, ['file:apex-ai/v13/tests/unit/v13_4_317-commands-completeness.test.ts']],
  [/SÉCURITÉ MAXIMALE PARTOUT/i, ['wf:security-suite.yml', 'npm:test:xss-guard', 'npm:test:ia-key-privacy']],
  [/ARCHITECTURE AUDITÉE EN PREMIER/i, ['npm:test:render-views', 'npm:audit:improvements']],
  [/COORDINATION MULTI-SESSIONS/i, ['wf:branch-coordinator.yml']],
  [/UX PROFESSIONNEL EXPERT/i, ['npm:test:a11y']],
  [/DÉTECTION ÉQUIPES SBM/i, ['npm:test:team-rule', 'npm:test:validated-teams', 'npm:test:teamhistory']],
  [/BADGE VERSION VISIBLE/i, ['npm:test:badge']],
  [/MAJ AUTO FORCÉE/i, ['npm:test:autoupdate', 'wf:sw-cache-sync.yml']],
  [/SW CACHE_VERSION = APP_VER/i, ['wf:sw-cache-sync.yml']],
  [/RECONNAISSANCE AUTO APRÈS 1|RECONNU AUTO/i, ['npm:test:faceid']],
  [/FACEID\/TOUCHID/i, ['npm:test:faceid']],
  [/LOGIN TOUJOURS PRÉNOM \+ NOM/i, ['npm:test:pin', 'npm:test:session-kevin']],
  [/COMPTE ADMIN UNIQUE KEVIN/i, ['npm:test:pin', 'npm:test:kevin']],
  [/PIN PER-USER/i, ['npm:test:pin']],
  [/CODE ADMIN NE S'ÉCRIT NULLE PART/i, ['npm:test:no-pin-leak', 'npm:test:departs-pin', 'npm:test:apex-messages']],
  [/NOMS SECRETS GITHUB/i, ['wf:security-suite.yml']],
  [/IMPORT LOSSLESS/i, ['npm:test:fidelity', 'npm:test:fidelity-pb']],
  [/IMPORTS PDF INCRÉMENTAUX/i, ['npm:test:v702-import-e2e']],
  [/CADRES UNIFIÉS/i, ['npm:test:no-cadres', 'npm:test:encadres']],
  [/JAMAIS RÉGRESSER/i, ['wf:regression-watch.yml', 'npm:test:ci']],
  [/COMPACT BRANCHES/i, ['wf:cleanup-stale-branches.yml', 'wf:stale-pr-cleanup.yml']],
  [/DECLARATION ≠ DEPLOYMENT/i, ['npm:audit:improvements']],
  [/PARITÉ APEX TOTALE/i, ['file:apex-ai/v13/services/admin/apex-claude-code-parity.ts',
    'file:apex-ai/v13/tests/unit/agent-toolkit-catalog.test.ts', 'npm:test:improvements-guard']],
  [/"FAIS L'AUDIT"|FAIS L.AUDIT/i, ['npm:test:improvements-guard', 'wf:audit-live.yml', 'wf:verif-reelle.yml',
    'wf:ai-review-independent.yml', 'wf:security-suite.yml']],
  [/TOUJOURS TESTER END-TO-END|VÉRIFIER END-TO-END/i, ['wf:verif-reelle.yml', 'wf:audit-live.yml']],
  [/VÉRIFIER AVANT D'ENVOYER/i, ['wf:verif-reelle.yml']],
  /* claude-todo-watcher.yml RETIRÉ le 15/08/2026 : son travail consistait à
     interroger Firebase en boucle et à lui répondre — exactement ce que GitHub
     a sanctionné (« Actions used solely to interact with 3rd party websites »).
     On ne le remplace PAS par une fausse référence : ces règles retombent dans
     la dette réelle, visible et comptée. Leur vraie place est un Cloudflare
     Worker avec son propre déclencheur — c'est noté dans KEVIN_ACTIONS_TODO. */
  [/AUTO-TEST \+ AUTO-FIX/i, ['file:apex-ai/v13/services/admin/auto-test-runner.ts']],
  [/WARNING = CORRECTION AUTO/i, ['file:apex-ai/v13/services/admin/auto-test-runner.ts']],
  [/PIPELINE SELF-HEALING|PIPELINE AUTONOMIE/i, ['wf:apex-audit-escalate.yml']],
  [/RIEN PERDRE/i, ['npm:test:pw-noclear']],
  [/SKILLS APEX 2026/i, ['file:apex-ai/v13/tests/unit/skills-dispatch.test.ts']],
  [/APEX N'OUBLIE JAMAIS PERSONNE/i, ['file:apex-ai/v13/tests/unit/rules-injection-watch.test.ts']],
  [/APEX RELIT TOUTE SA DOCUMENTATION/i, ['file:apex-ai/v13/tests/unit/rules-injection-watch.test.ts']],
  [/RGPD|MES DONNÉES/i, ['npm:test:rgpd']],
  [/WORKFLOWS?.*PIPEFAIL|ANTI-SPAM MAILS/i, ['npm:test:workflows-pipefail']],
  [/BOÎTE À OUTILS AGENTS|6 DÉPÔTS DE RÉFÉRENCE/i, ['file:apex-ai/v13/tests/unit/agent-toolkit-catalog.test.ts']],
  [/TAILLE|MONOLITH/i, ['npm:test:file-size-guard']],
  [/DÉTAILLER LES ERREURS/i, ['npm:test:bg-url']],
  /* Ajoutés le 5.09 : ces trois règles avaient DÉJÀ leur garde, il manquait
     seulement leur entrée ici — donc l'outil les comptait comme « dette » à
     tort. Une mesure fausse est pire que pas de mesure : on la corrige, on ne
     re-fige pas le compteur pour faire taire le rouge. */
  [/CMCteams .{0,4}ET.{0,4} LIGHT|TOUJOURS LES DEUX/i, ['npm:test:parite-cmcteams-light']],
  [/TEST EN LIVE EN PERMANENCE|TOUJOURS TESTER END-TO-END/i, ['wf:verif-reelle.yml', 'wf:audit-live.yml']],
  [/AUDIT EXTÉRIEUR INDÉPENDANT|SECOND AVIS INDÉPENDANT/i, ['wf:ai-review-independent.yml']],
  /* Ajoutées le 5.09 en même temps que leur garde — jamais une règle sans son
     automatisme, c'est justement ce que ce compteur mesure. */
  [/DÉPÔT PUBLIC|PUBLIC MAIS SÉCURISÉ/i, ['npm:test:depot-public-sain']],
  [/DESTINATION ÉCRITE|GITHUB, GITLAB, WORKER/i, ['npm:test:destinations-workflows']],
  [/DOCUMENTS? DE TRAVAIL|NE PUBLIE PLUS/i, ['npm:test:documents-travail']],
  /* 26.09 : la règle « une seule vérité du moment » a son garde depuis sa création
     (test:etat-du-moment, dans test:ci) ; il manquait seulement son entrée ici. */
  [/SEULE VÉRITÉ DU MOMENT/i, ['npm:test:etat-du-moment']],
];

/* ─── 2-bis. Règles COMPORTEMENTALES : elles portent sur MA façon de travailler (ton, autonomie,
   méthode, niveau d'exigence). Aucun test ne peut les vérifier — prétendre le contraire serait
   malhonnête. On les compte à part pour ne pas gonfler artificiellement la « dette de gardes ».
   Ce qui reste en 🔴 est donc la VRAIE dette : mécanisable, mais pas encore mécanisé. */
const COMPORTEMENTAL = [
  /AUTONOMIE TOTALE/i, /CARTE BLANCHE|PLEINE AUTONOMIE/i, /TOUT FAIRE À LA PLACE DE KEVIN/i,
  /SI AUCUN OUTIL N'EXISTE/i, /TROUVE DES SOLUTIONS/i, /NE JAMAIS DIRE/i,
  /EXPERT TOUJOURS PARTOUT/i, /NIVEAU EXPERT PRO/i, /EXPERT DES EXPERTS/i,
  /KEVIN N'EST PAS CODEUR/i, /LANGAGE SIMPLE/i, /PARLE SIMPLEMENT/i,
  /TOUT AU MAX/i, /DÉPASSER LES ATTENTES/i, /VA PLUS LOIN/i, /TOUJOURS DÉPASSER/i,
  /JAMAIS ESTIMER/i, /HONNÊTE|HONNÊTETÉ/i, /RECONNAÎTRE/i,
  /LIT TOUS SES DOSSIERS|RELIT TOUTE SA DOCUMENTATION|RECONSULTATION/i,
  /MÉMOIRE LONG TERME|CONCERTATION \+ MÉMOIRE/i,
  /1 CLIC|MOINS DE CLICS|CLIC ADMIN GITHUB/i, /LIENS TOUJOURS CLIQUABLES/i,
  /MULTI-ANGLES|MULTI-IA PARALLÈLE|SUBAGENTS AU MAXIMUM|AGENTS DÉDIÉS PARTOUT/i,
  /DÉLÉGATION CLAUDE CODE/i, /AUTOMATISE TOUT|AUTOMATISATION TOTALE|AUTONOMIE SUR TÂCHES/i,
  /DISTINCTION PROJETS/i, /AUCUNE RÈGLE EXTERNE/i, /BATCHING CI/i,
  /100\/100 RÉEL/i, /TEMPLATE AUDIT PRO/i, /LEÇONS DE LA SESSION/i,
  /ANTICIPATIFS|AUTO-APPARENTS|DUAL PRO \+ FUN|SMART STUDIOS/i,
  /SÉCURITÉ AVANT AUTONOMIE/i, /JAMAIS STOCKER CERTAINS SECRETS/i,
  /SOURCES MULTIPLES|ENRICHISSEMENT/i, /SCAN & DICTÉE|IA NAVIGUE/i,
  /RECONNAISSANCE AUTO CREDENTIALS|RECONNAISSANCE MULTI-SOURCE|ASSOCIE IDENTIFIANT/i,
  /APEX EXÉCUTE TOUTES LES DEMANDES|APEX TOUS ACCÈS|APEX VÉRIFIE LE FONCTIONNEMENT/i,
  /BROWSER SANS BLOCAGE|ANTI-BLOCAGE IA|NIVEAU PRODUCTION/i,
  /UX ÉPURÉE CLIENT|ZÉRO DOUBLON UX|ADMIN-FIRST|UX allégement/i,
  /INVENTAIRE FICHIERS|DOCS TEMPS RÉEL/i, /MCP AUTO-INSTALLÉS/i,
  /SANDBOX BLOCKAGES/i, /AUTO-ULTRA-RESET/i, /OUTILS & RÉFLEXES|BOÎTE À OUTILS/i,
  /RECONNAISSANCE VOCALE|VOIX RÉELLEMENT/i, /SURVEILLANCE LIVE/i,
  /REPRODUIRE AUTOMATIQUEMENT DANS APEX|CRÉE LES LIENS AUTO/i,
  /ISOLATION MAXIMALE/i, /TOUTE NOUVELLE INFO/i, /TRAVAILLE SUR IPHONE/i,
  /RECHERCHE NOM|MÉMOIRE MAX|TOUJOURS DÉTAILLER LES ERREURS/i,
  /PROTECTION ≠ STABILITÉ/i, /TEMPS RÉEL \/ LIVE/i, /ÉQUITÉ|PARITÉ/i,
];

/* ─── 3. Vérification réelle de chaque garde ─── */
function checkGuard(g) {
  if (g.startsWith('npm:')) {
    const name = g.slice(4);
    if (!pkg.scripts[name]) return { ok: false, wired: false, why: 'script npm absent' };
    return { ok: true, wired: gate.includes('npm run ' + name) || name === 'test:ci', why: '' };
  }
  if (g.startsWith('wf:')) {
    const f = g.slice(3);
    return { ok: workflows.includes(f), wired: true, why: workflows.includes(f) ? '' : 'workflow absent' };
  }
  if (g.startsWith('file:')) {
    const f = g.slice(5);
    const e = fs.existsSync(path.join(ROOT, f));
    return { ok: e, wired: e, why: e ? '' : 'fichier absent' };
  }
  return { ok: false, wired: false, why: 'type de garde inconnu' };
}

const res = { auto: [], partiel: [], declaratif: [], casses: [], comportemental: [] };
const vus = new Set();
for (const titre of rules) {
  if (vus.has(titre)) continue; /* doublon de règle dans CLAUDE.md */
  vus.add(titre);
  const entry = REGISTRE.find(([re]) => re.test(titre));
  if (!entry) {
    /* pas de garde → est-ce mécanisable, ou est-ce une règle de comportement ? */
    if (COMPORTEMENTAL.some((re) => re.test(titre))) res.comportemental.push({ titre });
    else res.declaratif.push({ titre });
    continue;
  }
  const checks = entry[1].map((g) => ({ g, ...checkGuard(g) }));
  const manquants = checks.filter((c) => !c.ok);
  if (manquants.length) { res.casses.push({ titre, manquants }); continue; }
  const horsGate = checks.filter((c) => !c.wired);
  if (horsGate.length) res.partiel.push({ titre, checks, horsGate });
  else res.auto.push({ titre, checks });
}

/* ─── 4. Rapport ─── */
const total = vus.size;
console.log('\n════ CONFORMITÉ DES RÈGLES — sont-elles tenues PAR LA MACHINE ? ════');
console.log('  Règles déclarées dans CLAUDE.md : ' + total + ' (uniques ; ' + rules.length + ' titres, ' +
  (rules.length - total) + ' doublon(s))');
console.log('  ✅ AUTO (garde qui tourne)      : ' + res.auto.length);
console.log('  🟡 PARTIEL (garde hors gate)     : ' + res.partiel.length);
console.log('  🔵 COMPORTEMENTAL (non mécanisable): ' + res.comportemental.length);
console.log('  🔴 MÉCANISABLE MAIS SANS GARDE   : ' + res.declaratif.length + '  ← la VRAIE dette');
if (res.casses.length) console.log('  ❌ GARDE ANNONCÉE MAIS ABSENTE   : ' + res.casses.length);
const mecanisables = total - res.comportemental.length;
console.log('  → sur les ' + mecanisables + ' règles mécanisables, couverture réelle : ' +
  Math.round(((res.auto.length + res.partiel.length) / mecanisables) * 100) + '%');

if (res.casses.length) {
  console.log('\n❌ GARDES ANNONCÉES MAIS INTROUVABLES (le pire cas : on se croit couvert)');
  for (const c of res.casses) {
    console.log('  · ' + c.titre.slice(0, 70));
    c.manquants.forEach((m) => console.log('      ↳ ' + m.g + ' — ' + m.why));
  }
}
if (res.partiel.length) {
  console.log('\n🟡 PARTIEL — la garde existe mais ne tourne pas dans `test:ci`');
  for (const p of res.partiel) {
    console.log('  · ' + p.titre.slice(0, 70) + ' → ' + p.horsGate.map((h) => h.g).join(', '));
  }
}
console.log('\n🔴 MÉCANISABLE MAIS SANS GARDE — vraie dette, ces règles dépendent de ma mémoire (' + res.declaratif.length + ')');
const show = VERBOSE ? res.declaratif : res.declaratif.slice(0, 20);
show.forEach((d) => console.log('  · ' + d.titre.slice(0, 80)));
if (!VERBOSE && res.declaratif.length > show.length) {
  console.log('  … +' + (res.declaratif.length - show.length) + ' autres (--all pour tout voir)');
}
if (VERBOSE) {
  console.log('\n✅ AUTO — détail');
  res.auto.forEach((a) => console.log('  · ' + a.titre.slice(0, 60) + ' → ' + a.checks.map((c) => c.g).join(', ')));
}

/* ─── 5. Ratchet ─── */
let fail = 0;
const now = { total, declaratif: res.declaratif.length, casses: res.casses.length };
if (UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify({
    _note: 'Référence. On échoue si le nombre de règles SANS garde augmente (= nouvelle règle ajoutée ' +
      'sans automatisme), ou si une garde annoncée disparaît.',
    updated: new Date().toISOString().slice(0, 10), metrics: now,
  }, null, 2) + '\n');
  console.log('\n[ratchet] référence mise à jour.');
} else if (fs.existsSync(BASELINE)) {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).metrics || {};
  console.log('\n[ratchet]');
  if (typeof base.declaratif === 'number' && now.declaratif > base.declaratif) {
    console.log('  ❌ règles sans garde : ' + base.declaratif + ' → ' + now.declaratif +
      ' — une règle a été ajoutée SANS automatisme. Ajoute son garde-fou (ou son entrée au registre).');
    fail++;
  } else console.log('  ✅ règles sans garde : ' + now.declaratif + ' (≤ ' + base.declaratif + ')');
  if (now.casses > (base.casses || 0)) { console.log('  ❌ gardes annoncées disparues : ' + now.casses); fail++; }
  else console.log('  ✅ gardes annoncées toutes présentes : ' + (now.casses === 0 ? 'oui' : now.casses + ' manquante(s), inchangé'));
} else {
  console.log('\n[ratchet] aucune référence — lancer une fois avec --update-baseline.');
}
console.log('');
process.exit(fail ? 1 : 0);
