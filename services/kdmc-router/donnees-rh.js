/* DONNÉES RH NOMINATIVES — la liste UNIQUE des fichiers que le domaine ne sert qu'à une personne
 * reconnue (audit complet du 30.09.2026, P0-3 / R3).
 *
 * Mesuré : `tools/departs/boards-gen.js` (499 248 o) porte 291 noms de salariés et leurs plannings
 * du mois ; `tools/shared/planning-seed.js` (544 210 o) les plannings par matricule et nom ;
 * `seances-seed.js` (et sa copie `tools/departs/seances-gen.js`) 154 personnes et leurs séances.
 * Les deux apps les chargeaient par <script> AVANT toute connexion : n'importe qui, avec l'adresse,
 * lisait une donnée RH nominative (loi monégasque 1.565 + RGPD).
 *
 * Trois lecteurs partagent cette liste, pour qu'elle ne dérive jamais :
 *   - services/kdmc-router/worker.js  → `donneesRhFermees` : 401 sans session du domaine ; avec
 *     session, sert la copie déposée dans le KV (clé `cleKV`) et sinon laisse l'hébergeur répondre ;
 *   - .github/workflows/publier-site-prive.yml → dépose chaque fichier dans le KV à chaque publication ;
 *   - services/kdmc-router/prepare-secours.mjs → (étape B) ne met plus ces fichiers dans le paquet
 *     Pages, pour que l'adresse directe de l'hébergeur ne les serve pas non plus.
 *
 * Chemins tels que les pages les demandent (préfixe /CMCteams, celui que le routeur reçoit). */
export const DONNEES_RH = [
  '/CMCteams/tools/departs/boards-gen.js',
  '/CMCteams/tools/shared/planning-seed.js',
  '/CMCteams/tools/shared/seances-seed.js',
  '/CMCteams/tools/departs/seances-gen.js',
];

/* Même chemin, après décodage et mise en minuscules (ce que fait `cheminNormal` dans le routeur). */
export const DONNEES_RH_NORMALISEES = new Set(DONNEES_RH.map((c) => c.toLowerCase()));

/* Clé KV sous laquelle la publication dépose le fichier. Le chemin normalisé (minuscules) : le
   routeur cherche avec le chemin tel que le navigateur l'a demandé, après normalisation. */
export const cleKV = (cheminNormalise) => 'fichier:' + String(cheminNormalise).toLowerCase();

/* Chemin dans le dépôt (sans le préfixe /CMCteams), pour la publication et le paquet. */
export const cheminDepot = (chemin) => String(chemin).replace(/^\/CMCteams\//, '');
