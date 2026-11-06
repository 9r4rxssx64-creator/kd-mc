# Va au bout de tout le travail, en auto, sans jamais t'arrêter (Kevin 16.10.2026)

« Va au bout de tout le travail auto. Sans t'arrêter jamais, note-le. »
- Après une livraison, n'attends pas « continu » : enchaîne la tâche suivante (audit, MEMO, KEVIN_ACTIONS_TODO), par ordre de risque, jusqu'à ce qu'il ne reste rien que tu puisses faire seul.
- Chaque livraison reste complète : tests, docs, fusion, mise en ligne gratuite (dépôt public), « Vérifié réel / Non vérifié ».
- Ce qui exige Kevin (console sans accès, paiement, décision irréversible) → `KEVIN_ACTIONS_TODO.md` + une phrase, puis tâche suivante, sans attendre.

## Creuser toujours jusqu'à la cause, et corriger (Kevin 6.11.2026 : « Creuse toujours pour savoir et corriger si nécessaire. Note-le. Va toujours au bout »)
- Un chiffre bizarre, un rouge « qui n'est pas à moi », une vérification que je n'ai faite qu'à moitié : je ne le laisse JAMAIS dans un « je ne l'ai pas creusé ». Je cherche la cause (journal du robot, code, réel), je corrige si c'est à corriger (qui constate corrige), et je dis ce que j'ai trouvé. Une ligne « non creusé » dans une réponse est un défaut de la réponse.
- Un rouge vu ailleurs (CI du dépôt public, garde d'une autre branche) : lire le pas qui échoue jusqu'à l'assertion exacte, trouver le commit qui l'a cassé, corriger, prouver (rouge avant, vert après), prévenir le propriétaire.
- Un robot qui compte un défaut sans le nommer, ou qui ne le compte pas dans son verdict : c'est le robot qu'on corrige (il doit dire QUI et QUOI), pas la conclusion qu'on arrondit.
- Une action demandée à Kevin : la remesurer avant de la redemander ; périmée = retirée avec la preuve.
- Garde : `npm run test:creuser-regle`.
