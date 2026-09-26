/**
 * En-têtes CORS partagés — Apex Chat workers (SMS, push, IA, API).
 *
 * Fabrique PURE : produit exactement le même objet qu'avant (comportement
 * strictement inchangé), mutualisé pour supprimer la duplication répétée dans
 * les 4 workers. `Access-Control-Allow-Origin: '*'` conservé à l'identique ;
 * le durcissement par allowlist d'origines se fera séparément, avec test live.
 *
 * Pas de branche / pas de paramètre par défaut → 100% de couverture garantie
 * dès qu'un worker l'appelle (gate vitest workers/** à 100%).
 */
export function corsHeaders(methods, headers) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': headers,
  };
}

/**
 * Origines RÉELLES d'où l'application est servie (audit P2b, v1.1.287).
 *
 * Mesurées, pas devinées :
 *   - `apex-chat.kd-mc.com`      → domaine canonique (services/kdmc-router/worker.js:34)
 *   - `9r4rxssx64-creator.github.io` → hôte GitHub Pages réel (celui que charge
 *      apex-chat-e2e.yml, et derrière lequel le routeur kd-mc.com sert la page)
 *   - `kd-mc.com` / `www.kd-mc.com` → le portail, d'où l'app est ouverte
 *
 * Leçon #218 : c'est exactement le VRAI hôte GitHub Pages qu'on avait oublié
 * ailleurs — un test dérive donc cette liste des fichiers du dépôt.
 */
export const ALLOWED_ORIGINS = [
  'https://apex-chat.kd-mc.com',
  'https://9r4rxssx64-creator.github.io',
  'https://kd-mc.com',
  'https://www.kd-mc.com',
];

/**
 * Développement local (`npm run preview`, tests navigateur sur port éphémère).
 *
 * `https?` et pas `http` — trouvé le 2026-09-10 : les tests navigateur se servent
 * en **HTTPS** (`tests/serve-https.sh`, obligatoire pour WebKit à cause de
 * `upgrade-insecure-requests`), donc l'origine est `https://localhost:4173`.
 * Avec `http` seul, WebKit refusait chaque appel API depuis cette origine
 * (« due to access control checks ») et les deux voies iPhone de
 * `messaging-app-tests.yml` étaient rouges à chaque exécution — pendant que
 * Chromium, plus silencieux sur ce point, restait vert. Même machine, même
 * confiance : autoriser `https://localhost` n'ouvre rien de plus que `http://`.
 */
const LOCAL_DEV = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

export function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_DEV.test(origin);
}

/**
 * Remplace le `Access-Control-Allow-Origin: *` par l'origine demandeuse quand
 * elle est autorisée, et le RETIRE sinon. Appliqué en UN seul point par worker
 * (le `fetch` de tête) : aucun site d'appel n'est touché.
 *
 * Sans en-tête `Origin` (curl, appel serveur à serveur, Service Binding), il
 * n'y a pas de contrôle CORS à faire : on n'envoie simplement rien.
 *
 * `Vary: Origin` est obligatoire — sans lui, un cache pourrait servir à un site
 * la réponse autorisée d'un autre.
 */
export function applyCors(request, response) {
  // Un upgrade WebSocket (101) transporte un objet `webSocket` qu'on ne peut
  // PAS reconstruire : le recopier casserait le temps réel. On le laisse passer.
  if (response.status === 101) return response;
  const origin = request.headers.get('Origin');
  const headers = new Headers(response.headers);
  // `Vary` s'AJOUTE : écraser un `Vary: Accept-Encoding` existant casserait la
  // négociation de compression en amont.
  headers.append('Vary', 'Origin');
  if (isAllowedOrigin(origin)) headers.set('Access-Control-Allow-Origin', origin);
  else headers.delete('Access-Control-Allow-Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Fabrique de la réponse JSON standard des workers, liée à un objet CORS donné.
 * Remplace la fonction `json()` dupliquée à l'identique dans chaque worker —
 * SEULE la définition change (aucun site d'appel touché), sortie strictement
 * identique : Content-Type JSON + en-têtes CORS + en-têtes optionnels (api).
 */
export function makeJson(cors) {
  return (data, status = 200, extraHeaders = {}) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors, ...extraHeaders },
    });
}
