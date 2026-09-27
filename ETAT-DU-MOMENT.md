# 🧭 ÉTAT DU MOMENT — la vérité d'aujourd'hui, en une page (MAJ : 27.09.2026, 14h10)

> **LIS CECI EN PREMIER, quelle que soit ta branche et sa date.** Cette page est servie depuis
> `main` à chaque démarrage ou réveil de session (hook `.claude/hooks/etat-du-moment.sh`) :
> même une branche vieille de trois mois la reçoit à jour. `ETAT-INFRA.md` est l'**historique**
> (22 faits datés) ; ici, **seulement ce qui est vrai maintenant**. Toute session qui change l'un
> de ces points **met cette page à jour dans le même commit** (garde `npm run test:etat-du-moment`,
> dans `test:ci` : la date en tête doit être ≥ au fait le plus récent d'ETAT-INFRA).

## ✅ Vrai aujourd'hui

| Sujet | État (et date de la mesure) |
|---|---|
| **GitHub Actions** | **REPARTIES le 26.09 ~17:05 UTC** : Kevin a posé un budget Actions de 20 $ (compte + dépôt) ; il le remet à 0 $ une fois la bascule faite. Le dépôt **public** `kd-mc` a des minutes illimitées ; le coffre retombe sous les 2 000 min offertes (quota remis à zéro le 1.10). |
| **CE QUI VÉRIFIE TON CODE** | Après la bascule, **134 des 166 robots du coffre sont en pause** — c'est voulu (134 en pause = 134 déclarés publics, aucun éteint par erreur : ils tournent au dépôt public). **Trou mesuré et bouché le 26.09 à 19h** : aucun des 32 robots restés actifs ne lançait `test:ci`, et le public ne PEUT pas lancer la chaîne complète (l'export retire 139 scripts qui ont besoin des fichiers privés) → **109 étapes sur 221 ne tournaient plus nulle part** (test:all, fidelity, everyone-has-planning, validated-teams, vplan, departs-*, equipes-*, pdf-* : le cœur de CMCteams, Light, plannings, arbre). Robot neuf `coffre-chaine-privee.yml` (déclenché sur PR et sur `main`, **seulement** quand une surface privée bouge) + `npm run test:ci-prive` (liste **déduite** de l'export, jamais recopiée) + garde `npm run test:chaine-privee` (10/0, 7 sabotages). |
| **QUI PUBLIE kd-mc.com** | **LE DÉPÔT PUBLIC `kd-mc`, depuis la bascule du 26.09 à 17h36 UTC** (pas le 1er octobre : une session l'a lancée à la main). Le robot de publication du COFFRE est `disabled_manually` et sa variable `PUBLICATION_PAR=public` : le coffre ne publie plus. **Trou mesuré et bouché le 26.09 à 19h** : rien ne mettait à jour la COPIE DU CODE du dépôt public (l'étape de dépôt de la bascule « refuse un dépôt déjà rempli »), donc le site est resté figé en **v1.0.33** pendant que `main` était en **v1.0.34** — ni cache ni propagation (paramètre inédit : même vieille version). Robot neuf `coffre-synchronise-public.yml` + garde `npm run test:sync-public` (14/0). **Ne rallume PAS le robot du coffre** sans retirer `PUBLICATION_PAR` : deux éditeurs pour une production. |
| **`npm install` du dépôt** | **RÉPARÉ le 26.09 ~17:50 UTC.** Il échouait pour TOUT LE MONDE sur « Cannot read properties of null (reading 'edgesOut') » — machine GitHub comme conteneur d'agent (run 36260183940). Cause : `@vitest/coverage-v8` orphelin dans le `package.json` de la **racine** (vitest vit dans les sous-projets). **82 workflows font `npm i`** : ils étaient tous morts, et rien n'était rouge. Garde `npm run test:paquets-racine` (dans `test:ci`). Si un de tes robots meurt en ~15 s à une étape d'installation : **fusionne `main` avant de chercher ailleurs**. |
| **Fusionner une PR** | Si les Actions retombent (run qui échoue en ~5 s sans étape) : à la main **par l'API** après tests **en local** (`PUT /repos/…/pulls/{n}/merge`). Sinon, chemin normal. |
| **GitLab** | **Ni bloqué, ni en panne : ses deux jetons sont RÉVOQUÉS** (3.09, réponse 401). Aucune session ne peut y publier, **et personne n'en a besoin** : la publication passe par GitHub. Ne rien y chercher, ne rien y proposer à Kevin, ne pas lui redemander un jeton. |
| **Le site kd-mc.com** | **EN LIGNE et REPUBLIÉ le 26.09** (run 36258040661 : 26 adresses OK). Audit LIVE 36259402798 : **40/40**, les 3 boutiques (La Détente, Chez Lolo, Rotaplan) **réparées**. |
| **GitHub Pages / github.io** | **ÉTEINT** (dépôt privé). Toute adresse `9r4rxssx64-creator.github.io` est morte. |
| **Le plan « deux dépôts »** | **FAIT le 26.09** (run 36259782148, toutes étapes vertes) : https://github.com/9r4rxssx64-creator/kd-mc est **public**, 1 seul commit, sans `arbre/`, `index.html`, `tools/departs`, `tools/shared` (vérifié). Il **publie le site** ; le coffre a mis en pause ses robots en double. Routine du 1.10 06:00 désactivée. |
| **Après la bascule** | Le coffre garde 27 robots privés = **57 min sur 1 980** mesurées sur les 29 dernières heures d'activité (3 %) → il tient sous les 2 000 min. Les 132 autres robots partent au public. |
| **Le Lenovo comme runner** | **ABANDONNÉ par Kevin le 25.09** (« trop compliqué »). Fichiers gardés dans `tools/runner/`, interrupteur `KDMC_RUNNER` **inactif** = comportement d'avant. Ne pas le lui reproposer. |
| **Bot auto-merge** | Les Actions tournent de nouveau : il peut refusionner. Vérifier avant de compter dessus. |
| **Routeur du domaine (`services/kdmc-router`)** | ⚠️ **Fusionne `main` AVANT tout push qui le touche** : déployé depuis une branche dont `wrangler.toml` n'a pas `UPSTREAM_BASE`, le routeur renvoie sur `github.io` (mort) et le déploiement reste VERT (message m123, 23.09 : kit.kd-mc.com 12 adresses en 404 pendant 5 min). Correctif dans `main` depuis le commit f497c3b87. |
| **Déployer la production** | **Depuis `main` seulement** (Kevin 26.09 « limité ») : les 25 workflows de déploiement ne partent plus sur un push `claude/**`. Une branche de travail ne déploie rien ; on fusionne, `main` déploie. Manuel : `workflow_dispatch`. Garde `test:deploiement-main`. |
| **Règles des boutiques** | **FERMÉES le 26.09** (run 36264927425, `shops_lock=on`) : écriture de produits, logos, sélection sourcing, abonnement d'alertes = admin seulement ; commandes clients toujours ouvertes. Testé en vrai (5 refus 401, lecture 200, commande 200). Le robot des règles est **en pause dans le coffre** (il vit au public) : pour le relancer d'ici, l'activer, le lancer, le remettre en pause. |
| **Qui entre où (routeur)** | **Depuis le 27.09** : les verrous se décident sur le **DOSSIER** demandé, plus sur l'adresse (avant : PoolPilot et Autorisations s'ouvraient sans code par `kd-mc.com/CMCteams/tools/…`, mesuré). Liste `PORTES` dans `worker.js` : **admin** = PoolPilot, Autorisations ; **fiche obligatoire avant d'entrer** = cuisine, World Monitor, OSINT, Outils IA, Mes outils, Tor, Dossiers (choix de Kevin) ; boutiques et pages de vente **visibles**, fiche **à la commande** (Chez Lolo : prénom, nom, e-mail, adresse, CGV ; Kit IA : prénom, nom, CGV revérifiés par le serveur de vente — `test:chez-lolo-commande`, `test:kit-fiche-commande`, `test:vente-fiche`). Un **nouveau compte** exige prénom + nom + conditions, **vérifié par le serveur**. Face ID se prouve aussi depuis les apps du domaine (connexion seulement). Garde `test:portes-dossier`. ⚠️ `kdmc-site-bj5.pages.dev` sert les pages en direct (hors routeur) : le texte est public (dépôt public), les données/actions restent vérifiées serveur. |
| **Fiches CMCteams (`cmc_reg`)** | **Depuis le 27.09 (v9.922)** : e-mail, téléphone, adresse, date de naissance, n° USM vivent dans **`/cmcteams_prive`** (lecture rôle admin seul), plus dans `cmc_reg`. Tout code qui lit ces champs pour un AUTRE employé ne les aura plus (sauf l'admin). N'écris jamais `cmc_reg` en contournant `fbWrite` (le tri passe par `_cmcRegPub`). Robot : `coffre-fiches-privees.yml` ; garde `test:fiches-privees`. **ACTIF depuis le 27.09 14h02 UTC** (run 36324428817, feu vert de Kevin) : règles publiées, drapeau `cmc_prive_actif` posé, 0 fiche publique avec un champ perso, `/cmcteams_prive` → 401 sans jeton (revérifié de l'extérieur). ⚠️ Les règles se publient **depuis le coffre** (`firebase-rules-apex.json` n'est pas au dépôt public ; `deploy-cmcteams-rules.yml` est en pause) : le robot des fiches le fait lui-même. |
| **Tests ↔ vraie base CMCteams** | **Depuis le 27.09 (v9.923)** : les robots `coffre-chaine-privee` et `cmc-runtime-audit` rendent la base de production **injoignable** avant les tests (`tools/ci/couper-base-prod.sh`, échoue si elle répond). Mesuré : 116 tests sur 143 ouvraient `index.html` sans simuler Firebase → en CI ils la lisaient ET y écrivaient. Un test qui a besoin d'une base la **simule** (`page.route`, marche toujours). Et l'app ne laisse plus un non-admin envoyer « planning vide » (garde `test:visiteur-ne-vide-pas`). |
| **Sessions Claude entre elles** | Registre + boîte aux lettres = `pipeline/sessions.json` sur **GitHub `main`** (pas GitLab). Se déclarer : `node tools/pipeline/pipeline.mjs enregistrer --id <slug> --titre … --branche … --sujet …`. Lire son courrier : `… etat --id <slug>`. |

## 🚫 Plus vrai — ne le redis plus à Kevin, ne le relis pas comme actuel

- « GitHub est suspendu » (levé le 4.09.2026) · « le seul site vivant est `kdmc-site.pages.dev` » ·
  « publie via GitLab avec `GITLAB_TOKEN` » · « le bot fusionne les PR `claude/*` » ·
  « branche de dev courante = `claude/graphity-auto-install-sm3f92` » (supprimée le 10.09) ·
  « il faut le runner Lenovo » · « envoie la réponse au support GitHub » (fait le 4.09).

## 📌 Décisions de Kevin de la semaine

- **24.09** : dépôt public tout neuf + coffre privé, tout automatique, « que je n'aie rien à faire ».
- **25.09** : Lenovo abandonné ; « Trouve d'autres solutions auto » → la bascule du 1er suffit.
- **26.09** : « tout le monde au courant en temps réel, même les vieilles branches qui se réveillent,
  pas de double travail, pas d'annulation » → cette page + le hook + la garde.

## 👤 Ce qui attend Kevin (inévitable, tout le reste est automatique)

- Réclamer son crédit Claude **avant le 7.10** · remplacer les **4 codes** rendus publics (section 🔴
  de `KEVIN_ACTIONS_TODO.md`) · **3 réponses oui/non** (section 🟠). Pour la bascule : **rien**.

## 🔁 Qui fait quoi

Le hook ajoute sous cette page, **à chaque démarrage**, les 8 branches les plus actives (date, nom,
dernier commit) et le retard de ta branche sur `main` — mesuré dans git à l'instant, jamais écrit à
la main. Avant de toucher un fichier partagé : `node tools/pipeline/retard-branches.mjs`, et
`npm run bilan` pour le point complet.
