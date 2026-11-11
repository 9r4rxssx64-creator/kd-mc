---
name: improve-system
description: >
  « /improve-system » — relire l'historique des sessions de Kevin, repérer ce qu'il répète et ce qu'il corrige, dire quelles règles existent déjà
  et lesquelles manquent. Ne modifie JAMAIS une règle seul : il rend un rapport, la session propose, Kevin valide. Créé le 11.11.2026
  (Kevin « AB » après la vidéo de Henri · Exploria sur /improve-system). Utiliser quand Kevin dit « relis », « améliore-toi »,
  « qu'est-ce que je dois te répéter », ou à la fin d'un gros chantier.
---

# /improve-system — relire pour s'améliorer

1. `node tools/memory/improve-system.mjs` (ajouter `--json` pour une sortie lisible par un autre outil).
2. Lire le rapport : **thème répété + règle existante = un défaut d'APPLICATION** (je relis la règle avant de répondre) ; **thème répété sans règle = règle à PROPOSER** ; **corrections** (« déjà », « encore », « je t'ai dit ») = erreurs précises à noter en leçon.
3. Proposer à Kevin, en français simple, les 1 à 3 changements utiles. Seulement après son accord : écrire la règle (`CLAUDE-HISTOIRE.md` + `npm run claude-md:index`) ou la leçon (`node tools/docs/lecon-suivante.mjs`).
4. Ne rien envoyer hors de la session : le rapport contient des phrases de Kevin, il reste local (jamais dans le dépôt public, jamais au pont en entier).
Garde : `npm run test:improve-system`.
