/**
 * push-key — logique PURE de cohérence de clé VAPID pour l'abonnement push.
 *
 * Contexte (diag v1.1.276) : Apple accepte l'envoi (201) mais l'iPhone ne
 * reçoit RIEN. Cause racine : l'app s'abonnait avec une clé VAPID PUBLIQUE
 * HARDCODÉE (`applicationServerKey`), alors que le worker SIGNE les push avec
 * une clé dérivée de son secret `VAPID_PRIVATE_KEY`. Si les deux diffèrent
 * (clé regénérée), le service push d'Apple accepte puis DROP en silence.
 *
 * Correctif : l'app récupère la vraie clé publique du worker (via /health) et
 * (re)crée l'abonnement avec CELLE-CI. Ce module isole la décision, testée 100%.
 */

/** Une vraie clé VAPID P-256 base64url fait ~87 caractères. On exige > 40
 *  pour écarter une réponse vide/tronquée du worker (fail-open sinon). */
export function isValidVapidKey(key) {
  return typeof key === 'string' && key.length > 40;
}

/**
 * Clé à utiliser pour s'abonner : la clé SERVEUR si elle est valide (source de
 * vérité = celle qui signe), sinon repli sur la clé embarquée (hors-ligne /
 * worker muet → on ne bloque jamais l'abonnement, règle « jamais de lockout »).
 */
export function effectiveVapidKey(serverKey, hardcodedKey) {
  return isValidVapidKey(serverKey) ? serverKey : hardcodedKey;
}

/**
 * Faut-il (re)créer l'abonnement ?
 *  - pas d'abonnement existant → OUI (il faut s'abonner) ;
 *  - clé serveur inconnue/invalide → NON (garder l'existant, fail-open) ;
 *  - clé utilisée pour l'abonnement courant ≠ clé serveur → OUI (clé a changé,
 *    l'abonnement actuel est signé par la mauvaise clé → à recréer).
 */
export function needsResubscribe(storedKey, serverKey, hasExistingSub) {
  if (!hasExistingSub) return true;
  if (!isValidVapidKey(serverKey)) return false;
  return String(storedKey || '') !== String(serverKey);
}

if (typeof window !== 'undefined') {
  window.ApexPushKey = { isValidVapidKey, effectiveVapidKey, needsResubscribe };
}
