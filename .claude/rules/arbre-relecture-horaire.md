# Arbre — chaque modification, par n'importe quel compte, est relue et propagée (Kevin 29.10.2026, absolue)

« À chaque modification, peu importe par quel compte ou par qui, tout doit être mis à jour automatiquement, en toute autonomie, et vérifié sur erreur — toujours gratuit, sécurisé. »

Trois couches, toutes gratuites :
1. **Sur l'appareil qui saisit** : `propagerTextes` (date / lieu de naissance et de décès, mariage, métier) corrige les textes de la fiche et de ses proches ; un seul envoi par fiche (`_pousserTextes`).
2. **Sur chaque appareil qui reçoit** : `cloudPull` rejoue la même propagation pour toute fiche changée ailleurs (autre compte, robot). Garde : `tools/arbre/verify-suivi-ailleurs.mjs`.
3. **Chaque heure, dans la routine « Arbre : relire le pont et les branches », AVANT le pont** :
   `node tools/arbre/appliquer-nuage.mjs --exporter f.json` ; lire D1 `kdmc-pont` : `SELECT id,h FROM arbre_vu` → `vus.json` ;
   entrée = `{"export": <f.json>, "vus": <résultat D1>}` sur l'entrée standard : `node tools/arbre/session/relecture-modifs.mjs --json < entree.json` ; puis `... --sql < entree.json` = les nouvelles empreintes, à exécuter dans D1 **après** avoir traité.
   - écart de texte sûr (année, lieu, date) → corriger par `ecrire.sh` (`notesReecrite` si le début change) ;
   - personne nouvelle sans preuve → mission au Lenovo (`arbre-pc`, contenu complet dans le message) : actes, sources, JO / archives, puis ses parents (on remonte) ;
   - filiation ou conjoint contredit → ne pas deviner : question à Kevin en une phrase.
L'état D1 ne contient que l'id de la fiche et une empreinte ; rien de familial dans le dépôt. Garde : `tools/arbre/verify-relecture-modifs.mjs`.
