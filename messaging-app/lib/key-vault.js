/**
 * Apex Chat — Key Vault (Étape A du plan E2E staged).
 *
 * Wrappe/déwrappe la clé privée ECDH avec le PIN utilisateur (PBKDF2 100k →
 * AES-GCM 256, via crypto-core). Objectif : ne plus stocker la clé privée EN
 * CLAIR dans localStorage (audit 2026-06-01 P0-1).
 *
 * Conçu PUR + testable (aucun accès DOM/localStorage ici — l'orchestration
 * vit dans index.html). Logique de migration exposée en fonction pure
 * `planKeyMigration` pour garantir « zéro lockout » par les tests.
 *
 * Source de vérité crypto : ./crypto-core.js
 */
import { wrapWithPin, unwrapWithPin } from './crypto-core.js';

/** Wrappe une clé privée (base64 JWK) avec le PIN. Retourne {ct, salt, v}. */
export async function wrapPrivKey(privB64, pin) {
  if (!privB64) throw new Error('no-priv');
  if (!pin || String(pin).length < 4) throw new Error('pin-too-short');
  const { ciphertext, salt } = await wrapWithPin({ priv: privB64 }, String(pin));
  return { ct: ciphertext, salt, v: 1 };
}

/** Déwrappe. Throw si PIN faux / données corrompues (le caller gère le fallback). */
export async function unwrapPrivKey(wrapped, pin) {
  if (!wrapped || !wrapped.ct || !wrapped.salt) throw new Error('no-wrapped-key');
  const payload = await unwrapWithPin(wrapped.ct, wrapped.salt, String(pin));
  if (!payload || !payload.priv) throw new Error('bad-payload');
  return payload.priv;
}

/**
 * Décision de migration PURE — prouvée « zéro lockout » par les tests.
 * Entrée : état de stockage + dispo du PIN. Sortie : action à effectuer.
 *  - 'unwrap'         : clé wrappée présente, PIN dispo → déwrapper pour charger.
 *  - 'defer'          : clé wrappée présente, PIN PAS dispo → NE RIEN générer
 *                       (évite de clobberer l'identité ; on attend l'unlock).
 *  - 'migrate'        : clé en clair + PIN dispo → wrapper puis effacer le clair.
 *  - 'keep-cleartext' : clé en clair, pas de PIN défini → on garde le clair
 *                       (rétrocompat totale, zéro régression pour les users sans PIN).
 *  - 'generate'       : rien de stocké → générer une nouvelle paire.
 *  - 'noop'           : déjà chargé.
 */
export function planKeyMigration({ hasCleartext, hasWrapped, pinAvailable, keysLoaded }) {
  if (keysLoaded) return { action: 'noop' };
  if (hasWrapped && pinAvailable) return { action: 'unwrap' };
  if (hasWrapped && !pinAvailable && !hasCleartext) return { action: 'defer' };
  if (hasCleartext && pinAvailable) return { action: 'migrate' };
  if (hasCleartext && !pinAvailable) return { action: 'keep-cleartext' };
  // Seul cas restant : aucune clé stockée (ni claire ni wrappée) → générer.
  // catch-all atteignable (couvre les combinaisons sans clé) — pas de code mort.
  return { action: 'generate' };
}

if (typeof window !== 'undefined') {
  window.ApexVault = { wrapPrivKey, unwrapPrivKey, planKeyMigration };
}
