# Arbre : seules les informations SENSIBLES (surtout des vivants) sont privées, visibles de Kevin seul ; tout le reste est public (Kevin 24.10.2026)
- « Pour les fiches, tu mets seulement les informations sensibles, que ce soit les informations sensibles des vivants, tu les mets seulement en privé pour moi. Tout le reste, tu peux le mettre public. »
- Public = dans la fiche (notes, sources, documents), comme avant. Privé = tiroir à part `/__arbre/prive` (routeur, KV `arbre:prive`), lu et écrit par l'ADMIN prouvé seul ; jamais dans la seed, jamais dans une fiche.
- Sensible, c'est : adresses, téléphones, mails, santé, finances, vie privée d'un vivant, état civil d'un mineur au-delà de l'essentiel. Une info sur un défunt prouvée par un document n'est pas sensible : elle va dans la fiche.
- Chaque information privée porte : personne (id de fiche), texte, catégorie, certitude (`sur` / `a_verifier` / `douteux`), source, date. Format d'import (Outils › Importer trouvailles.json) : liste de `{personne, texte, categorie, certitude, source, url, date}`.
- Garde : `npm run test:arbre-infos-privees` (dans test:ci).
