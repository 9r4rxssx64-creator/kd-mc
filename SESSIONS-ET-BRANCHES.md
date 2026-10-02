# 🌿 Carte des sessions et de leurs branches — et où pousser jusqu'à nouvel ordre

> Écrit le 2.09.2026 depuis la session « Studio créa ». Kevin : *« pointe toutes tes branches pour
> que je puisse continuer à travailler sur chacune d'entre elles, comme avant »* et *« tout par
> GitLab maintenant jusqu'à nouvel ordre »*.
> À lire au démarrage, avec `ETAT-INFRA.md` (les 16 faits).


> ⚠️ **10.09 au soir — 253 branches `claude/*` supprimees** (389 → 126) apres la correction du ruleset `16725169` (`~ALL` → `~DEFAULT_BRANCH`). Les branches listees plus bas peuvent avoir disparu : **verifiez avant de vous y fier** (`git ls-remote --heads origin`). 18 des 19 sessions concernees avaient une PR fusionnee (numero dans `pipeline/sessions.json`), la 19e (`meta`) n'avait aucun commit. Rien n'est perdu.

## ⚡ PÉRIMÉ — ne redemandez PLUS le clic du connecteur GitHub (mis à jour le 6.09)

> Cette section demandait à Kevin de retaper l'autorisation du connecteur GitHub. **C'est faux
> depuis le 2.09 et inutile depuis le 4.09** — on le laisse écrit ici pour que personne ne le
> ressorte des archives.

Ce que l'erreur *« Authentication failed … verify the integration is authorized »* voulait
vraiment dire : le **compte GitHub était SUSPENDU** (2.09), pas l'autorisation de l'application.
Le tap du connecteur ne débloquait rien (message m005). **Le support a levé la restriction le
4.09 à 16h34 UTC** (message m016) : `git fetch`/`push` marchent depuis un conteneur avec les
identifiants du harnais, **rien à coller**, et les Actions tournent de nouveau.

**Aujourd'hui : on publie par GitHub.** `git push -u origin claude/…` → PR → **fusion par l'API**
(le bot auto-merge est refusé par la protection de branche, message m019 point 4 — essayez la
fusion par l'API depuis votre session, ne demandez pas un clic à Kevin). GitLab ne sert plus
qu'à une remise à niveau occasionnelle (`ETAT-INFRA.md` fait n°13).

**Aucune session ne doit redemander ce clic à Kevin.** C'est écrit ici, une fois.

## 🔗 Le pipeline entre sessions — lis-le avant de commencer

Ce document est la carte **humaine**. La version **machine**, avec la boîte aux lettres
entre sessions, est `pipeline/sessions.json`, pilotée par `tools/pipeline/pipeline.mjs`.
Le mode d'emploi complet tient dans **`PIPELINE-SESSIONS.md`**.

```bash
node tools/pipeline/pipeline.mjs etat --id <moi>     # qui fait quoi + mon courrier
```

Une session **future** s'inscrit elle-même (`enregistrer`) et devient visible de toutes.
Un garde (`npm run test:pipeline-sessions`, dans `test:ci`) refuse qu'une session soit
oubliée du registre ou que deux sessions partagent une branche.

## 📋 Les branches, par session

| Session | Branche | État au 2.09 |
| Lingua — retrouver son code + vérif réelle lisible | `claude/plafond-verifs` | 🟢 **Plafond 2 vérifs réelles/jour** (6 robots, garde) · Lingua **v2.128.0** (sauvegardes regroupées) · sondes = 0 écriture KV · garde des branches jugée sur le contenu · Lingua v2.127.0 : une seule adresse (301 depuis kd-mc.com) + « Mettre à jour l'app » · v2.126.0 en ligne (« Voir mon code » · « Code oublié ? », `test:lingua-mon-code` 20/0, discriminant 8/12) · vérif réelle : **cause de chaque ❌** + version servie (`test:rapport-lisible` 11/0) · robot auto-merge **pas cassé**, pause voulue (m144 : 6 surfaces rouges signalées) |
| Publication — données RH jamais remises sur l'hébergeur (plafond KV) | `claude/publication-rh-sans-fuite` | 🟢 2.10 : lecture KV d'abord (0 écriture si identique), plafond → copie KV d'avant gardée, fichier hors paquet ; garde 4/4 dont sabotage |
| KV — qui écrit ? (1 406 écritures le 2.10) | `claude/kv-qui-ecrit` | 🟢 2.10 : robot coffre-kv-inventaire (PR #4224), garde 8/8 ; à lancer après fusion |
| IA gratuites — règle du relais (niveaux, pauses durables, paliers) | `claude/ia-gratuites-cablage` | 🟢 2.10 : ia-route NIVEAU A/B, pauses d'épuisement durables (cache du Worker), relais de modèle (404 → suivant), noms de modèles MESURÉS (Groq/Cerebras : gpt-oss-120b), Cohere câblé, Together = crédits ; PR à fusionner après la chaîne |
| IA gratuites — sonde /models + test:bascule réparé | `claude/bascule-bot-ia` | 🟢 2.10 : sonde réelle 37056539492 = 1/5 répondent, 8 clés absentes, Groq/Cerebras 404 (modèles retirés) ; la sonde lit GET /models sur 404 ; `bot-ia.js` ajouté à la copie de test:bascule |
| Lingua — garde sur le parcours | `claude/lingua-parcours-garde` | 🟢 P0 live du m051 fermé · `test:lingua-parcours` 11/11, discriminant (6 échecs sans le correctif) |
| Lingua — voix rectifiée | `claude/lingua-voix-rectifiee` | 🟢 `test:lingua-voix` 26/26 (était 21/5). Écran blanc sans `prog` corrigé, mot dit une seule fois, voix de secours nommée |
| Javis / Bee — persona, voix, animation | `claude/persona-personnage-javis-hqd55e` | 🟢 Bee (mascotte Lingua) parle avec SA voix + lip-sync **mesuré** (1,20 → 0,30, vrai navigateur) · app installable **javis.kd-mc.com** enfin routée · gardes `test:javis-bee` 39/0 et `test:javis-bee-reelle` 22/0 (dans `test:ci`) |
| Ménage auto-deploy — clôture | `claude/menage-autodeploy-cloture` | ✅ déclenche le 1er passage avec le filtre étendu |
| Ménage — extension aux `auto-deploy/*` | `claude/menage-auto-deploy` | 🟢 452 branches de build supprimables (453/461 déjà dans main), garde de source 15/15 |
| État de l'infra (quota Actions) | `claude/etat-infra-quota-actions` | 🟢 `ETAT-INFRA.md` fait n°21 : quota GitHub Actions épuisé le 24.09 (depuis levé — Kevin a monté le budget à 20 $ le 26.09) *(branche active non inscrite par sa session : inscrite par `javis-bee` le 26.09 pour que `test:pipeline-sessions` redevienne vert pour TOUTES les sessions — sa session propriétaire peut corriger titre et sujet)* |
| Coffre, quota GitHub, état du moment | `claude/etat-du-moment` | 🟢 `ETAT-DU-MOMENT.md` servi depuis `main` à chaque réveil de session (hook `.claude/hooks/etat-du-moment.sh`) · garde `test:etat-du-moment` · plan « deux dépôts » et bascule automatique du 1.10 (inscrite ici par `tor-securite` le 26.09 : elle était au registre mais pas sur la carte, ce qui rendait `test:pipeline-sessions` rouge sur `main` pour tout le monde) |
|---|---|---|
| Studio créa | `claude/capcut-mini-versions-66tfum` | ✅ **sur GitLab**, 18 commits |
| CMCteams | `claude/cmcteams-clicking-issue-rmli6m` | ✅ **sur GitLab**, 15 commits |
| Domain Kdmc | `publie-septembre` | ✅ sur GitLab — pilote la publication |
| Livre numérique de cuisine | `claude/cuisine-ebook-1m9xm7` | 🔴 bloquée GitHub |
| Duolingo reverse-engineering | `claude/duolingo-reverse-engineering-kocs92` | 🔴 bloquée GitHub |
| Arbre v3.38 — visuel, filiations, dates entières, familles, vue paysage | `claude/arbre-rapatriement-v338` | ✅ le visuel de chaque personne sur chaque appareil (126 × 10 × 8 vues, vrai arbre), parents rapatriés au-dessus de leurs enfants, pleine page, dates en entier, choix de la famille, vue paysage |
| Arbre — les quatre corrections de la famille (fusionnée, PR #4173) | `claude/arbre-corrections-famille` | ✅ Attilio frère de Marie-Judith, Hélène Julia en une seule fiche, Renée et Madeleine sous Honora, une seule femme pour Charles — branche fusionnée, non supprimable d'ici (HTTP 403) |
| Arbre généalogique Sarzance | `claude/sarzance-family-tree-3jxi7i` | 🔴 attend `ETAT-INFRA.md` → **il est à la racine, lis-le** |
| Divers | `claude/graphity-auto-install-sm3f92` | 🟠 à republier sur GitLab |
| Meta | `claude/meta-krzqz8` | 🟠 en attente d'une décision de Kevin |
| La détente | `claude/priority-action-workflow-iKc0T` | 🟠 en attente d'une réponse de Kevin |
| ClayScore | `claude/clayscore-development-df6rj1` | 🟢 travail prêt |
| Apex ai | `claude/apex-ultra-review-crew-MZ8nS` | 🟢 travail prêt |
| Apex chat | `claude/apex-chat-mfa-faceid` | 🟢 travail prêt (branche réelle depuis le 10.09 — l'ancienne `apex-chat-multi-messenger-dvpo2u` restait inscrite à cause du faux succès de `enregistrer`, m056) |
| Pool robot | `claude/pool-robot-app-mapping-kcmx03` | 🟢 travail prêt |
| Jacob (finances) | `claude/finances-engins-tracking` | 🟢 travail prêt |
| Crypto trading bot | `claude/crypto-trading-bot-irrfu6` | 🟢 travail prêt |
| Free APIs | `claude/free-apis-analysis-c4sy5d` | 🟢 travail prêt |
| Reverse-engineering / consolidation | `claude/reverse-engineer-app-consolidation-t0y4u5` | 🟢 travail prêt |
| Audit du domaine + surveillance | `claude/suivi-domaine-suite` | 🟢 branche neuve partie de main le 10.09 — la précédente (surveillance-domaine-26-adresses, sans accents graves : le garde lirait ce tableau comme une déclaration) a fusionné le 7.09, PR #3679 |
| Correctif Vercel (annexe de la précédente) | `claude/vercel-config-main` | ✅ **fusionnée** (0 commit hors de main, mesuré le 10.09) — l'alerte ci-dessous est conservée pour l'historique : — partie de `main` le 6.09, 4 fichiers. Répare les 2 `vercel.json` refusés par le schéma Vercel : tant qu'elle n'est pas dans `main`, **chaque push de chaque branche envoie un mail d'échec à Kevin**. Voir message m036. |
| Garde anti-fuite de secrets (annexe) | `claude/secrets-guard-main` | ✅ **fusionnée** (0 commit hors de main, mesuré le 10.09) — l'alerte ci-dessous est conservée pour l'historique : — partie de `main` le 6.09. 4 secrets encore en clair sur `main` (dépôt PUBLIC) + la garde qui les attrape. Voir message m036. |
| Lingua — connexion prénom + nom | `claude/lingua-connexion-honnete` | ✅ fusionnée (0 commit hors de main, mesuré le 10.09) |
| Ménage des branches — pourquoi 0 supprimée sur 379 | `claude/menage-branches-cause-exacte` | 🟢 diagnostic mesuré le 10.09 : ruleset `16725169` en `~ALL` (bloque toute suppression) + historique de `main` reconstruit le 09.08 (314 branches sur 361 sans ancêtre commun). PR #3725 |
| Ménage des branches — l'outil | `claude/menage-repli-arbres` | 🟢 `tools/menage/branches-superflues.mjs` + garde `test:menage-branches` (12/12). 385 branches → 2 sûres et **190 fichiers** à relire une fois. Corrige la promesse fausse du matin |
| Registre — remise à plat après le ménage | `claude/registre-branches-supprimees` | 🟢 19 sessions repointées, PR de fusion notée pour chacune |
| Ménage — clôture | `claude/registre-clore-menage` | ✅ chantier terminé : 389 → 125 branches, gardes câblées, règle écrite |
| « Voir comme Kevin » (sous-produit de workflow) | `claude/voir-34519286077` | 🟡 3 commits hors main, dont 2 de `cmcteams-pdf` — à elle de trancher (inscrite seulement pour éteindre le rouge du gate) |
| Ménage — vérification de la levée | `claude/menage-verif-suppression` | ⚫ épuisée : fusionnée (PR #3746) avant mon dernier commit, contenu repris dans la ligne au-dessus |
| CMCteams — Départs light (miroir pour chaque) | `claude/miroir-pour-chaque` | 🟢 Départs v1.39 + vérif LIVE écrite dans le dépôt (5.09) |
| CMCteams — fidélité au PDF (planning/équipes/départs) | `claude/verify-cmcteams-light-data-rzlvau` | 🟢 septembre 2026 : 248/248 personnes et 7 440/7 440 cellules identiques au PDF, des deux côtés (6.09) |
| Coffre, quota GitHub, état du moment (`coffre-etat`) | `claude/etat-du-moment` | 🟢 ETAT-DU-MOMENT.md servi à chaque réveil de session (26.09) |
| Audit du domaine 27.09 (`audit-domaine`) | `claude/audit-domaine-2709` | 🟢 Rapport privé 36/100, sonde audit-domaine, routeur durci, relais Apex fermé (27.09) |
| Audit domaine : admin en https (`audit-domaine-admin`) | `claude/audit-domaine-admin-https` | 🟢 http→https sur admin.kd-mc.com (27.09) |
| Compte unique du domaine (`compte-unique`) | `claude/compte-unique-domaine` | 🟢 Code vérifié au domaine, /__sso/login, reconnu partout sauf apps perso (27.09) |
| Compte unique : apps (`compte-unique-apps`) | `claude/compte-unique-apps` | 🟢 Créa Studio sur le compte du domaine, jeton « code prouvé » (27.09) |
| Kevin reconnu partout (`kevin-reconnu-partout`) | `claude/kevin-reconnu-partout` | 🟢 Code admin = session vérifiée, /__sso/entrer, passkeys admin canoniques (27.09) |
| Conditions une fois, Lingua / La Détente (`cgu-une-fois`) | `claude/cgu-une-fois` | 🟢 /__sso/cgu, Lingua v2.129.0, La Détente v1.53.24 (27.09) |
| Tout s'ouvre pour Kevin (`kevin-tout-ouvert`) | `claude/kevin-tout-ouvert` | 🟢 /__admin/grant, CMCteams v9.928 sans PIN si reconnu, 8 portes admin, Chez Lolo v2.0.16 (27.09) |
| Tout s'ouvre pour Kevin : mesure réelle (`kevin-tout-ouvert-sonde`) | `claude/kevin-tout-ouvert-sonde` | 🟢 sonde : /__admin/grant anonyme → 403, versions CMCteams / Chez Lolo lues (27.09) |
| Domaine coupé 1027 (`domaine-1027`) | `claude/domaine-1027` | 🟢 docs : constat 22h06, leçon #361, message m162, mesure reportée à 00h10 UTC (27.09) |
| « Note le » : règle tout s'ouvre (`note-tout-ouvert`) | `claude/note-tout-ouvert` | 🟢 règle absolue dans CLAUDE-HISTOIRE + index CLAUDE.md + mémoire (27.09) |
| Tout s'ouvre : mesure réelle (`mesure-tout-ouvert`) | `claude/mesure-tout-ouvert` | 🟢 30.09 11h05 UTC : /__admin/grant 403 en ligne, v9.928 / Chez Lolo v2.0.16 servis, 1027 terminé |
| Gratuit par défaut (`gratuit-par-defaut`) | `claude/gratuit-par-defaut` | 🟢 règle absolue + garde test:gratuit (R1-R5, sabotage), 121 jobs bornés, chaîne privée à la fusion seulement (30.09) |
| Publication à la main + plan « fichiers sans Worker » (`publication-manuelle`) | `claude/publication-manuelle` | ✅ fusionnée #4137 : site en v9.929 sans robot du coffre, leçon #365, plan mesuré du levier Cloudflare (30.09) |
| Mesure « requêtes par le Worker » (`mesure-worker`) | `claude/mesure-worker` | ✅ fusionnée #4138 ; AVANT mesuré 30.09 19h44 : CMCteams 17/17 par le Worker, javis 3/3 |
| Pilote javis en statique (`pilote-javis`) | `claude/pilote-javis` | ✅ fusionnée #4139 ; `lire` (run 36773826689) : zone OK, domaine Worker OK, DNS refusé (jeton sans droit DNS) |
| Pilote javis : essai sur adresse neuve (`pilote-javis-essai`) | `claude/pilote-javis-essai` | ✅ fusionnée #4140 ; essai 1 : le sous-domaine pages.dev porte un suffixe, non lu |
| Pilote javis : essai 2 (`pilote-javis-essai-2`) | `claude/pilote-javis-essai-2` | ✅ fusionnée #4141 ; kdmc-javis.pages.dev EN LIGNE, 200 statique ; domaine javis-statique pending (pas de DNS par l'API) |
| Pilote javis : bilan (`pilote-javis-bilan`) | `claude/pilote-javis-bilan` | ✅ fusionnée #4142 : copie statique 0/3 par le Worker (mesuré 20h47), action Kevin = droit DNS sur le jeton (TODO 🔑), leçon #366, message m169 (30.09) |
| Audit complet 30.09 (`audit-complet`) | `claude/audit-complet` | ✅ fusionnée #4143 : rapport privé 40/100 (4 P0 mesurés), message m170 |
| Audit, Phase 1 (`audit-suite`) | `claude/audit-suite` | ✅ fusionnée #4144, publiée 21h28 UTC (run 36779606214) : v9.930 : R1 version.txt (6 o au lieu de 3,4 Mo/min), R2 lsLocal (317 PUT → 6, sabotage 323), garde test:boot-sobre ; ETAT dédoublonné ; 5 branches inscrites (30.09) |
| v9.930 publiée (`audit-suite-publiee`) | `claude/audit-suite-publiee` | ✅ fusionnée #4145 : docs : publication à la main 21h28 UTC, Pages sert le paquet ; domaine à lire demain (30.09) |
| Pilote javis : bascule (`pilote-javis-bascule`) | `claude/pilote-javis-bascule` | ✅ fusionnée #4147 ; basculer ✅ au 2e passage 23h37 UTC : javis.kd-mc.com = Pages, /__sso/whoami = Worker ; Kevin a donné Zone→DNS→Edit (23h30) ; lire OK ; l'étape DNS retire l'AAAA 100:: du domaine Worker avant le CNAME (30.09) |
| Coûts, Firebase allégé, voix gratuites, R3-R7 (`etat-robots-publics`) | `claude/ia-gratuites-empilees` |
| Mémoire veille (`memoire-veille-fusionnee`, terminée) | `claude/memoire-veille` | ✅ fusionnée #4211 | 2.10 |
| (ancienne ligne) |
| ETAT voix en ligne (`etat-voix-en-ligne-fusionnee`, terminée) | `claude/etat-voix-en-ligne` | ✅ fusionnée #4206 | 2.10 |
| (ancienne ligne) |
| Voix Chirp 3 HD en ligne (`voix-chirp-en-ligne-fusionnee`, terminée) | `claude/voix-chirp-en-ligne` | ✅ fusionnée #4205 | 2.10 |
| (ancienne ligne) |
| Pipeline, branches suivies (`pipeline-branches-suivies-fusionnee`, terminée) | `claude/pipeline-branches-suivies` | ✅ fusionnée #4204 | 2.10 |
| (ancienne ligne) | 🟢 2.10 : Go Firebase mesuré (−39 %), R7 fermé (1ʳᵉ sauvegarde auto 04h00), R3 B en effet réel, voix Chirp 3 HD en ligne ; **phase 2 Firebase v9.934** (documents à la demande, `/cmcteams_docs`, robot `coffre-docs-migrer`) en PR | 2.10 11h40 |
| Firebase phase 2, documents à la demande (`docs-a-la-demande-fusionnee`, terminée) | `claude/docs-a-la-demande` | ✅ fusionnée #4202 ; /cmcteams = 1 002 Ko mesuré | 2.10 |
| Robots qui parlent + iOS + seed (`robots-qui-parlent-fusionnee`, terminée) | `claude/robots-qui-parlent` | ✅ fusionnée #4203 | 2.10 |
| Sauvegarde Firebase complète (`sauvegarde-voix-fusionnee`, terminée) | `claude/sauvegarde-voix` | ✅ fusionnée #4198 ; branche à supprimer (l'agent n'a pas le droit : API 403) | 2.10 |
| Robots publics + harnais sans SW — fusionnée #4163 (ancienne ligne, gardée pour l'historique) | `claude/etat-robots-publics` | 🟢 `tests.yml` public rallumé (run 36876618219 ✅) ; `test:donnees-rh-app` rouge au coffre (run 36874003734) → cause mesurée et reproduite : le navigateur de la CI installe le SW de production hors du harnais (leçon #380) ; `serviceWorkers: 'block'` dans 5 harnais + garde `test:harnais-sans-sw` | 1.10 14h50 |
| Chaîne privée verte (`chaine-privee-verte`) | `claude/chaine-privee-verte` | 🟢 v9.932 / light v1.63 : appels gardés, seed régénéré, test:bascule + donnees-rh-app + light-firebase (date figée) + mois-passes réparés, leçon #379 (1.10) |
| R7 : sauvegarde quotidienne (`sauvegarde-quotidienne`) | `claude/sauvegarde-quotidienne` | ✅ fusionnée #4159 (+ #4160 règle d'export) ; jeton posé (run 36871846671) ; sauvegarde refaite 13h40 (5,7 Mo), cron outlook → dispatch coffre 1/jour, garde 15/0, leçon #378 (1.10) |
| KV : cadence de présence (`kv-cadence-presence`) | `claude/kv-cadence-presence` | ✅ fusionnée #4158, routeur déployé 10h45 ; mesuré 1 264 écritures avant 10h27 (pics nuit sans robot) → cadence 10 min, admin vu < 13 min, garde enrich-cadence, leçon #377 (1.10) |
| R4 + mesure KV (`legal-et-mesure-kv`) | `claude/legal-et-mesure-kv` | ✅ fusionnée #4157 ; mesure-kv a tourné (36850395794) ; pages légales vraies (loi 1.565, Kevin à titre personnel), robot mesure-kv (1.10) |
| R3 : données RH derrière la connexion (`donnees-rh-connexion`) | `claude/donnees-rh-connexion` | ✅ fusionnée #4153 (+ #4154-4156 : diagnostic KV, plafond 10048 toléré) ; routeur en ligne 10h19, publication 10h31 ; KV vide (plafond) → étape B en attente ; étape A : routeur 401/KV, CMCteams v9.931 + light v1.62 (recharge une fois), publication → KV, 27 + 12 contrôles, leçon #376 (1.10) |
| Javis : mesure après (`javis-apres-mesure`) | `claude/javis-apres-mesure` | ✅ fusionnée #4151 ; docs : javis 3 → 1 requête Worker (run 36794683653), routeur redéployé, coffre reparti 00h11, v9.930 servie, message m174 (1.10) |
| Routeur : tests au public (`routeur-tests-public`) | `claude/routeur-tests-public` | ✅ fusionnée #4149, synchro be795f6, routeur déployé 36794505168 ✅ déploiement du routeur rouge au public depuis 23h38 (3 sondes au coffre) : `au-coffre.json` + `scriptAuCoffre`, leçon #375 (1.10) |
| Routeur : route javis `/__*` (`routeur-javis-route`) | `claude/routeur-javis-route` | ✅ fusionnée #4148, synchro publique 72ea84f ; wrangler.toml route+zone_name au lieu du custom_domain ; version.txt ajouté au paquet (leçon #373) ; trap ERR dans le pilote ; leçons #373-374, message m173 (30.09) |
| Branche vue active, session non identifiée (`vue-arbre-listes-vides`) | `claude/arbre-listes-vides` | ⚪ inscrite par audit-suite le 30.09 (garde pipeline) ; la session propriétaire complète |
| Branche vue active, session non identifiée (`vue-arbre-nouvelle-personne`) | `claude/arbre-nouvelle-personne` | ⚪ inscrite par audit-suite le 30.09 (garde pipeline) ; la session propriétaire complète |
| Branche vue active, session non identifiée (`vue-berceau`) | `claude/berceau` | ⚪ inscrite par audit-suite le 30.09 (garde pipeline) ; la session propriétaire complète |
| Branche vue active, session non identifiée (`vue-kv-ecritures`) | `claude/kv-ecritures` | ⚪ inscrite par audit-suite le 30.09 (garde pipeline) ; la session propriétaire complète |
| Branche vue active, session non identifiée (`vue-lingua-mon-code-2026-09-27`) | `claude/lingua-mon-code-2026-09-27` | ⚪ inscrite par audit-suite le 30.09 (garde pipeline) ; la session propriétaire complète |
| Kevin reconnu partout : mesures (`kevin-reconnu-mesure`) | `claude/kevin-reconnu-partout-mesure` | ✅ fusionnée #4109 (docs seulement) |
| Sonde jetable 26.09 (`zz-sonde-1er-octobre`) | `claude/zz-sonde-1er-octobre` | ⚪ Branche de sonde CI, à supprimer par le ménage des branches (suppression refusée au proxy) |

## 📅 État RÉEL mesuré le 10.09.2026 — `git for-each-ref` + `git rev-list origin/main..<branche>`

**378 branches `claude/*`** sur origin. Ce qui compte n'est pas leur nombre mais ceci :
**combien portent du travail qui n'est PAS encore dans `main`** — c'est le seul travail
qui puisse se perdre. Réponse mesurée : **4** (hors branches de robot).

| Branche | Avance | Ce qu'elle fait | Territoire |
|---|---|---|---|
| `claude/apex-ultra-review-crew-MZ8nS` | +2 | Apex AI — revue croisée | `apex-ai-v13` |
| `claude/miroir-pour-chaque` | +1 | `verif-live-rapport.yml` : la CI vérifie kd-mc.com et écrit `audit/verif-live/rapport.md` | `tests/verif-live-rapport.mjs`, `audit/verif-live/` |
| `claude/lingua-prenom-nom` | +1 | connexion PRÉNOM + NOM (voir m030 : fait doublon avec `lingua-connexion-honnete`, désormais fusionnée) | `lingua/app.js` |
| `claude/suivi-domaine-suite` | +1 | audit du domaine — suite (diagnostic d'auto-fusion par branche) | `.github/workflows`, `tests/` |
| `claude/video-review-wqnqdw` | +1 | lire une vidéo envoyée par Kevin (recette CI) puis offre B2B **Rotaplan** (page de vente refaite sous le système de design `levels`) | `.claude/skills/lire-video/`, `shops/rotaplan/`, `tests/rotaplan-page.test.mjs` |
| `claude/crypto-bots-status-ocgu3i` | +1 | (non inscrite par sa session — ajoutée pour que le gate passe) | — |
| `claude/security-review-4j3mct` | +1 | (non inscrite par sa session — ajoutée pour que le gate passe) | — |
| `claude/work-summary-ai-alternatives-cj6s29` | +1 | **paquet de reprise** (`TRANSFERT-COMPLET.md`, `npm run transfert`) + **bilan du pipeline** (`npm run bilan` : 41 sessions × 219 branches × 93 discussions croisées) + commande `pipeline suivi` qui manquait | `TRANSFERT-COMPLET.md`, `BILAN-BRANCHES.md`, `tools/transfert/`, `tools/pipeline/bilan.mjs`, `tools/pipeline/pipeline.mjs` |
| `claude/apex-chat-f30-patch-conv` | +1 | Apex Chat — correctif patch conversation *(branche active non inscrite par sa session : inscrite par `transfert-ia` le 24.09 pour que le gate du registre passe pour tout le monde)* | `messaging-app/` |
| `claude/etat-du-moment` | +1 | **une seule page de vérité datée** (`ETAT-DU-MOMENT.md`) servie depuis `main` à chaque réveil de session, pour qu'une branche ancienne ne relise pas le monde de sa date de naissance *(branche active non inscrite par sa session : inscrite par `javis-bee` le 26.09 pour que le gate du registre passe pour tout le monde)* | `ETAT-DU-MOMENT.md`, `.claude/hooks/etat-du-moment.sh` |
| `claude/printify-order-config-34459553021` | +1 | **branche écrite par un workflow** (La Détente) : URL du worker `ld-printify-order` + clé push VAPID. Aucune session humaine derrière — à fusionner ou supprimer par `la-detente` | `shops/la-detente/` |
| `claude/worker-config-34459553323` | +1 | **branche écrite par un workflow** (La Détente) : URL du worker `ld-gemini-proxy`. Aucune session humaine derrière — à fusionner ou supprimer par `la-detente` | `shops/la-detente/` |

6 autres branches en avance sont fabriquées par des **workflows** (`printify-order-config-…`,
`worker-config-…`, nom terminé par l'identifiant du run) : aucune session à inscrire.

> ⚠️ **Le tableau précédent (5.09) était devenu FAUX** : il annonçait « +1 devant main » pour
> `surveillance-domaine-26-adresses`, `fix-mois-ouverture`, `apex-chat-mfa-faceid`,
> `cuisine-6-recettes`… alors que **les 7 ont 0 commit hors de `main`** (mesuré le 10.09) —
> leur travail est en prod. Un instantané daté se périme : le mesurer vaut mieux que le lire.

Avant de commencer une session : **regarde les branches du jour, pas celles du tableau** — et inscris la tienne (`node tools/pipeline/pipeline.mjs enregistrer …`), sinon les autres ne te voient pas.

## 🔎 Mesure du 6.09.2026 — le registre ne voit qu'une partie de ce qui bouge

`git for-each-ref refs/remotes/origin/claude/` + `pipeline/sessions.json`, comptés le jour même :

| | |
|---|---|
| branches `claude/*` sur origin | **370** |
| inscrites au registre | **22** |
| **actives** (commit dans les 7 derniers jours) | **15** |
| actives **que personne ne suit** | **7** |

Les 370 ne sont pas un problème : la plupart sont finies et fusionnées. Les **7 actives
orphelines** en sont un — dont `claude/verify-cmcteams-light-data-rzlvau`, la session qui
réparait le rouge `e2e-tests` bloquant les fusions de **tout le monde**, sans que personne
ne puisse le savoir.

**Pourquoi le garde ne le voyait pas** : `test:pipeline-sessions` comparait le registre à
cette carte — deux **documents** — et **jamais aux vraies branches git**. Il était donc vert
alors que sept sessions travaillaient dans leur coin : c'est exactement le risque écrit en
tête de `tests/verify-pipeline-sessions.mjs`, et la même classe d'erreur que la leçon #103
(une vérification qui passe parce qu'elle ne vérifie rien de réel).

**Corrigé le 6.09** : le garde lit désormais les branches git. Cliquet sur
`pipeline/branches-orphelines-baseline.json` : les 7 connues sont figées, **une NOUVELLE
orpheline fait échouer le gate**. Repli ouvert si git ou les refs distantes manquent (clone
superficiel de CI) — jamais de faux rouge. Prouvé discriminant par 2 sabotages.

> Si ta branche est dans la liste des 7 : inscris-toi, c'est une commande —
> `node tools/pipeline/pipeline.mjs enregistrer --id <slug> --titre "…" --branche "<la tienne>" --sujet "…"`
> puis retire-toi de la base de référence dans le même commit.

## 🚦 Ce que chaque session fait, dans cet ordre

1. **Teste ton propre accès** — ne généralise ni un succès ni un 403 :
   `git ls-remote origin`
2. **Ça répond** → travaille sur GitHub comme avant, **et publie depuis GitHub** : depuis le
   4.09.2026 le site vivant vient de GitHub (fait n°11 d'`ETAT-INFRA.md`). Le fait n°1
   (« GitHub Pages est mort ») date de la suspension et ne s'applique plus.
   **GitLab = miroir de secours + ce que GitHub interdit** (jobs à la demande qui appellent
   l'extérieur), pas le chemin de publication — l'y envoyer consomme ses 400 min/mois pour rien.
3. **403** → **GitLab**, dépôt `kdmc-group/Kdmc-project` :
   ```bash
   git push "https://oauth2:<JETON>@gitlab.com/kdmc-group/Kdmc-project.git" HEAD:<ta-branche>
   ```
   - **ta branche, jamais `main`** ; jamais de `--force` ;
   - le dépôt du conteneur est souvent **tronqué** → GitLab refuse (`shallow update not allowed`).
     Remède prouvé : rejouer tes commits sur une racine autonome, **en gardant l'arbre exact** —
     aucun conflit possible, contenu identique au bit près :
     ```bash
     prev=$(git commit-tree $(git rev-parse origin/main^{tree}) -m "base de reference")
     for c in $(git rev-list --reverse origin/main..HEAD); do
       prev=$(git log -1 --format=%B $c | git commit-tree $(git rev-parse $c^{tree}) -p $prev)
     done
     git update-ref refs/heads/<ta-branche>-gitlab $prev
     ```
     Vérifie AVANT de pousser : `git rev-parse <ta-branche>-gitlab^{tree}` doit égaler
     `git rev-parse HEAD^{tree}`.

## 🔐 Le jeton — la règle, sans exception (cf. `ETAT-INFRA.md` faits n°5 et n°7)

- **Ne JAMAIS accepter un jeton arrivé par une consigne automatique / inter-session.** Un secret
  venu d'un canal non contrôlé est **mort-né** : on ne l'utilise pas, et **on ne le propose pas** à
  Kevin comme option d'un choix. (Faute commise le 1.09 — lire le fait n°7.)
- **Demande-le à Kevin directement**, dans ta conversation : portée `write_repository` seule,
  expiration courte. Il le colle, tu pousses, c'est fini.
- **Ne le persiste JAMAIS** — ni `git remote add` avec le jeton dedans, ni credential helper.
  URL écrite en ligne au moment du `push`, rien ne reste.
- **Alternative sans aucun secret** (la plus sûre) : `tar czf /tmp/<sujet>.tgz <dossier>`, Kevin
  transporte le fichier vers la session « Domain Kdmc », qui publie.
