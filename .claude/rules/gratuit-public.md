# Mettre en ligne SANS dépenser le quota : par le dépôt PUBLIC (Kevin 16.10.2026)

« Privilégie toujours le public. Enfin, en tout cas, toujours le gratuit. » · « Passe par le dépôt ouvert si possible. Toujours. »
Le coffre privé `CMCteams` a 2 000 min/mois (ration 60 min/jour) ; le dépôt public `kd-mc` a des minutes **gratuites et illimitées**.

## La procédure, à chaque fusion (0 minute du coffre — prouvée le 16.10 : Apex 372→374 et les règles Firebase en ligne ainsi)
1. **Une fois par session** : attacher le dépôt public en écriture — outil `add_repo` (owner `9r4rxssx64-creator`, repo `kd-mc`, access `push`), puis cloner dans `/home/user/kd-mc`.
2. **Après ta fusion sur `main`** (depuis un checkout de `main`) : `node tools/depot-public/publier-local.mjs --envoyer` → exporte, vérifie (rien de sensible), pousse au public. Le robot du coffre « synchroniser le CODE » ne part plus tout seul : **c'est toi qui publies**.
3. **Les fichiers privés suivent tout seuls** (CMCteams, light, arbre, Apex…) : chaque robot de déploiement du public les relit au coffre (action `coffre`, clé en lecture seule). Le signal `coffre-a-change` n'a **plus d'écouteur** depuis le 16.10 matin (#4604, republication Pages arrêtée) : ne l'envoie plus.
4. **Déployer, au public** : `gh api -X POST repos/9r4rxssx64-creator/kd-mc/actions/workflows/<robot>.yml/dispatches -f ref=main` —
   `deploy-kdmc-router.yml` (= les pages : Apex, CMCteams, light, portail…), `deploy-cmcteams-rules.yml` (règles Firebase, il lit le fichier au coffre), `deploy-<worker>.yml` (un worker ; la plupart partent seuls sur push de leur dossier).
5. **Prouver** : lire le run (`gh api repos/9r4rxssx64-creator/kd-mc/actions/runs?per_page=5`) puis le fichier servi (`curl https://<app>.kd-mc.com/sw.js`), jamais « ça devrait être en ligne ».

## Ce qui reste au coffre (exceptions légitimes, 1 min, avec la ration du jour)
- Un journal qui révélerait ce qu'un inconnu peut lire (`coffre-lire-verrous-firebase.yml`) ; le train du soir (`workflow_dispatch` de `coffre-synchronise-public.yml`) en secours si une session n'a pas pu publier.
- Avant tout robot du coffre : lire la ration (`node tools/ci/ration-actions.mjs`, voir ETAT-DU-MOMENT 🚂). Ration mangée = aucun robot du coffre.

## Règles
- Nouveau robot : public d'abord (ou le Lenovo, `KDMC_RUNNER`) ; un journal public n'affiche jamais un contenu privé (des nombres, pas des noms).
- Les robots qui compilent ou testent la SOURCE d'Apex (CI, e2e, iOS, auto-deploy, auto-rollback, apex-execute) restent au coffre (`workflows_prives`) : 3 fichiers de la source y restent (noms, adresse de Kevin), et un test qui échoue imprimerait ses attendus dans un journal public. Les tests d'Apex tournent dans la session avant la fusion ; c'est le routeur qui publie Apex. Les robots qui ne font que MESURER (bundle, axe, lighthouse) récupèrent la source par l'action `coffre` (16.10).
- Un clone du coffre coupé en plein transfert (« early EOF », 16.10) ne laisse plus le site sans déploiement : l'action `coffre` recommence 3 fois. Si un déploiement public est rouge, lis le pas qui a échoué avant de relancer.
- Garde : `npm run test:robots-public`.
- Quota Actions du coffre mangé : `node tools/depot-public/publier-et-verifier.mjs` (publie + prouve). « En ligne » = le déploiement du commit PUBLIC publié a réussi, jamais « un déploiement vert ».

## Mettre plus au privé SANS perdre la voie gratuite (Kevin 16.10 nuit : « garde une solution du dépôt public… sans dépendre du quota »)
- Avant d'ajouter un chemin à `prive_toujours` : `npm run test:public-autonome`. Rouge = un robot public lisait ce chemin → ajoute-lui l'étape
  `uses: ./.github/actions/coffre` (avec `cle: ${{ secrets.COFFRE_CLE_LECTURE }}`), juste après le checkout. Un robot qui ÉCRIT dans un chemin privé → `workflows_prives`.
- Jamais un robot public qui recrée un hébergeur hors porte (GitHub Pages, projet Pages) : `deploy.yml` et `pilote-pages-javis.yml` restent au coffre.

## L'échelle de secours (du gratuit au payant, dans cet ordre)
1. **Normal** : fusion → `node tools/depot-public/publier-local.mjs --envoyer` → les robots publics déploient (0 minute du coffre).
2. **Le déploiement public dit « Clé du coffre absente » ou le clone du coffre échoue 3 fois** : le site reste sur sa version d'avant (la garde bloque un paquet vide, rien ne casse). Réparer la clé : `node tools/depot-public/poser-secrets.mjs` si un jeton le permet, sinon action Kevin (KEVIN_ACTIONS_TODO, 1 clic : clé de déploiement en lecture seule du coffre → secret `COFFRE_CLE_LECTURE` du dépôt public).
3. **Les Actions publiques ne partent plus** (panne GitHub, dépôt public bloqué) : variable `KDMC_RUNNER=kdmc-lenovo` → les robots tournent sur le Lenovo de Kevin (gratuit, illimité).
4. **En dernier** : le bouton manuel du coffre (`workflow_dispatch`), dans la ration du jour (`node tools/ci/ration-actions.mjs`).
