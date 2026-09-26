/**
 * Envoi Web Push — worker→worker via Service Binding (voie supportée Cloudflare).
 *
 * CAUSE RACINE (Kevin 2026-06-18, diag "HTTP 404 error code: 1042") :
 *   l'api-worker ET ConversationDO faisaient `fetch('https://apex-push-worker
 *   .9r4rxssx64.workers.dev/web-push')` = un Worker qui fetch un AUTRE Worker
 *   sur la même zone workers.dev → Cloudflare bloque (erreur 1042 → 404) →
 *   100% des notifs (message ET appel) perdues en silence. Un curl externe vers
 *   /health marchait (200) car ce n'est pas worker→worker.
 *
 * FIX : passer par le Service Binding `PUSH_WORKER` (déclaré dans wrangler.toml)
 *   qui route vers le worker `apex-push-worker` en interne (autorisé, zéro latence).
 *   On garde la MÊME crypto/clés VAPID (le worker apex-push-worker inchangé) — on
 *   ne change que le TRANSPORT. Repli `fetch` direct conservé pour les tests /
 *   anciens environnements sans binding.
 *
 * @returns {Promise<Response>}
 */
export function sendPush(env, subscription, payload) {
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Apex-Push-Token': env.APEX_CHAT_ADMIN_TOKEN || '',
    },
    body: JSON.stringify({ subscription, payload }),
  };
  if (env.PUSH_WORKER && typeof env.PUSH_WORKER.fetch === 'function') {
    return env.PUSH_WORKER.fetch('https://apex-push-worker.internal/web-push', init);
  }
  const base = env.APEX_PUSH_WORKER_URL || 'https://apex-push-worker.9r4rxssx64.workers.dev';
  return fetch(base + '/web-push', init);
}
