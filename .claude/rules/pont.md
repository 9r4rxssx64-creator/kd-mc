# Le pont entre toutes les sessions de Kevin (cloud ⇄ ordinateur) — Kevin 17.10.2026
- Base D1 `kdmc-pont` (id ad7b5970-cbed-426b-a1b3-dea57116f6c8), connecteur Cloudflare `d1_database_query`. Détail : `tools/pont/README.md`.
- En commençant : `INSERT OR REPLACE INTO sessions` (toi), puis lire `messages` adressés à toi ou à `toutes` et non lus.
- À chaque résultat utile : `INSERT INTO messages` ; marquer lu ce que tu as traité. Avant de t'arrêter : relire.
- Images : Gmail `[PONT→CLOUD]` (pièces jointes). Seule `arbre-cloud` écrit dans l'arbre.
- QUOTA D1 DÉPASSÉ (25.10.2026, Kevin : « trouve une solution gratuite pour débloquer le blocage du pont ») : `code 7500 … exceeded D1's free tier daily row read limit` = tout le pont est bloqué jusqu'à minuit UTC (5 M lignes lues/jour pour TOUT le compte). Ne pas réessayer en boucle. Écrire/lire dans la discussion privée n° 5236 du dépôt CMCteams (`node tools/pont/secours.mjs ecrire|lire|rejouer` ; Lenovo : connecteur GitHub). Lire pas cher : `WHERE id > <dernier lu> AND (a='<moi>' OR a='toutes') LIMIT 50`, jamais la table entière à chaque passage. Garde : `npm run test:pont-secours`. Détail : `tools/pont/README.md`.
