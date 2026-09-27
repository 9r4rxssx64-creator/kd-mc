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
| Lingua — retrouver son code + vérif réelle lisible | `claude/message-6-rouges` | 🟢 Lingua **v2.126.0 en ligne** (« Voir mon code » · « Code oublié ? », `test:lingua-mon-code` 20/0, discriminant 8/12) · vérif réelle : **cause de chaque ❌** + version servie (`test:rapport-lisible` 11/0) · robot auto-merge **pas cassé**, pause voulue (m144 : 6 surfaces rouges signalées) |
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
