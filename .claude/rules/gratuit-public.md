# Mettre en ligne SANS dépenser le quota : par le dépôt PUBLIC (Kevin 16.10.2026)

« Privilégie toujours le public. Enfin, en tout cas, toujours le gratuit. » · « Passe par le dépôt ouvert si possible. Toujours. »
Le coffre privé `CMCteams` a 2 000 min/mois (ration 60 min/jour) ; le dépôt public `kd-mc` a des minutes **gratuites et illimitées**.

## La procédure, à chaque fusion (0 minute du coffre — prouvée le 16.10 : Apex 372→374 et les règles Firebase en ligne ainsi)
1. **Une fois par session** : attacher le dépôt public en écriture — outil `add_repo` (owner `9r4rxssx64-creator`, repo `kd-mc`, access `push`), puis cloner dans `/home/user/kd-mc`.
2. **Après ta fusion sur `main`** (depuis un checkout de `main`) : `node tools/depot-public/publier-local.mjs --envoyer` → exporte, vérifie (rien de sensible), pousse au public. Le robot du coffre « synchroniser le CODE » ne part plus tout seul : **c'est toi qui publies**.
3. **Faire suivre les fichiers privés** (CMCteams, light, arbre, Apex…) : `gh api -X POST repos/9r4rxssx64-creator/kd-mc/dispatches -f event_type=coffre-a-change`.
4. **Déployer, au public** : `gh api -X POST repos/9r4rxssx64-creator/kd-mc/actions/workflows/<robot>.yml/dispatches -f ref=main` —
   `deploy-kdmc-router.yml` (= les pages : Apex, CMCteams, light, portail…), `deploy-cmcteams-rules.yml` (règles Firebase, il lit le fichier au coffre), `deploy-<worker>.yml` (un worker ; la plupart partent seuls sur push de leur dossier).
5. **Prouver** : lire le run (`gh api repos/9r4rxssx64-creator/kd-mc/actions/runs?per_page=5`) puis le fichier servi (`curl https://<app>.kd-mc.com/sw.js`), jamais « ça devrait être en ligne ».

## Ce qui reste au coffre (exceptions légitimes, 1 min, avec la ration du jour)
- Un journal qui révélerait ce qu'un inconnu peut lire (`coffre-lire-verrous-firebase.yml`) ; le train du soir (`workflow_dispatch` de `coffre-synchronise-public.yml`) en secours si une session n'a pas pu publier.
- Avant tout robot du coffre : lire la ration (`node tools/ci/ration-actions.mjs`, voir ETAT-DU-MOMENT 🚂). Ration mangée = aucun robot du coffre.

## Règles
- Nouveau robot : public d'abord (ou le Lenovo, `KDMC_RUNNER`) ; un journal public n'affiche jamais un contenu privé (des nombres, pas des noms).
- Le robot public « Auto-deploy Apex v13 build » est rouge depuis le 27.09 (fichiers privés absents du public) : c'est le routeur qui publie Apex, pas lui.
- Garde : `npm run test:robots-public`.
