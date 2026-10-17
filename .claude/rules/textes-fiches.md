# Les textes des fiches de l'arbre (Kevin 17.10.2026, absolue, pour tout le monde)
- À jour des documents à chaque ajout : la note est RÉÉCRITE en entier à partir de tous les actes/sources de la fiche.
- Fait prouvé par un document = écrit sans réserve. Plus jamais « probable / probablement / piste / peut-être / sans doute ».
- Ce qui manque : « 🔎 À retrouver » en phrase neutre, une fois.
- Décès : une phrase sobre, une fois ; jamais de recherche négative sur un décès, jamais d'insistance.
- Style petite histoire (tools/arbre/consignes/HISTOIRES.md), neutre, sans répétition, sans bruit de travail.
- Contrôle : `node tools/arbre/session/textes-controle.mjs <export.json>` doit ne rien signaler.
- Avant d'écrire une réécriture : `node tools/arbre/session/textes-controle.mjs <export-avec-nouvelles-notes.json> --avant <export-base.json>` — aucune date / aucun numéro d'acte de l'ancienne note ne doit disparaître (17.10 : des faits de 84 fiches avaient sauté à la réécriture, remis le jour même).
