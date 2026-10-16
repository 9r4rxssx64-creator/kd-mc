# Tous les documents à jour en temps réel (Kevin 16.10.2026, 4ᵉ rappel)

À CHAQUE livraison, dans le MÊME commit — pas seulement ce que le garde `docs-frais` exige :
1. MEMO_RESUME.md · 2. KEVIN_INVENTORY.md · 3. KEVIN_ACTIONS_TODO.md (en tête, ce qui attend Kevin ; retirer le fait)
4. ETAT-DU-MOMENT.md (date + ligne, ≤ 90 lignes) · 5. NOTES_USER.md (toute info de Kevin)
6. LESSONS.md (erreurs/découvertes) ; CLAUDE-HISTOIRE.md + `npm run claude-md:index` (nouvelle règle)
7. pipeline/sessions.json via `node tools/pipeline/pipeline.mjs maj --id <moi> …` (+ lire les messages)
8. hors dépôt : notes des fiches de l'arbre, PDF de recherche.
9. une VERSION d'app qui bouge (cache du `sw.js`, tout `version.txt`) : écrite au MEMO + ETAT (garde `docs-frais` R4/R7) ;
   le bloc « Versions sur `main` » se remesure seul (`maj-tout`).
10. session qui travaille HORS du dossier projet (copie de travail ailleurs) : le hook Stop ne tourne pas →
   `node tools/audit/maj-tout.mjs --rapide` avant chaque commit.
Avant de dire « fini » : relire cette liste.
