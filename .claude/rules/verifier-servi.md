# Jamais bloqué par la porte du domaine : je lance le robot « Servi » du dépôt public (Kevin 25.10.2026, absolue, TOUTES LES BRANCHES)
- « Trouve des solutions, crée, pour ne jamais être bloqué comme ça. » (Autorisations v1.3.3 : page derrière la porte, session sans code admin, Lenovo éteint.)
- Une page derrière la porte (Autorisations, Finances, Coffre, admin, boutiques…) se vérifie EN LIGNE sans Kevin ni Lenovo : workflow public `verifier-servi.yml`.
  `gh api -X POST repos/9r4rxssx64-creator/kd-mc/actions/workflows/verifier-servi.yml/dispatches -f ref=main -f inputs[urls]="autorisations.kd-mc.com https://kd-mc.com/liens/"`
  (après `node tools/depot-public/publier-local.mjs --envoyer`, comme tous les robots publics ; le dispatch demande que le fichier soit sur `main` du dépôt public).
- Il se connecte en ADMIN comme Kevin (secret CI, jamais écrit ni affiché), en LECTURE SEULE, et rend des NOMBRES en annotations « Servi N » sur **5 écrans** (Kevin 29.10 « portrait ET paysage sur tous les appareils, toujours ») : iPhone 13 portrait 390×664 (Safari) + paysage 844×390, iPad portrait 820×1180 + paysage 1180×820, et portable 1280×720 :
  `job=$(gh api repos/9r4rxssx64-creator/kd-mc/actions/runs/<id>/jobs --jq '.jobs[0].id'); gh api "repos/9r4rxssx64-creator/kd-mc/check-runs/$job/annotations?per_page=50"`.
  Ce qu'il dit : HTTP, hôte final (porte ou app), version servie (`sw`, `data-app-ver`, badge vX.Y.Z), bas de la pastille « ← Portail », premier texte et s'il passe SOUS la pastille, boutons cachés, haut coupé, débordement, cibles < 44 px.
- Il n'ouvre QUE des adresses `*.kd-mc.com` ; aucun texte de page n'est imprimé (dépôt public) ; jamais de cron. Il ne remplace pas « comme Kevin » pour ce qui exige son Face ID : là, mission au pont (Lenovo).
- Avant d'écrire « non vérifié, c'est derrière la porte » : avoir lancé ce robot. Garde : `npm run test:verifier-servi` (rouge si la pastille est ignorée).
