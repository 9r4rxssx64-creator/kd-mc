/**
 * Tests services/vault/vault.ts — restauration UNIVERSELLE depuis le shadow IDB.
 *
 * ROOT CAUSE Kevin "coffre vide / clés disparues récurrent même réseau OK" :
 * la restauration IDB ne couvrait qu'une liste codée en dur (~22 clés) → tout
 * service hors-liste (130+ possibles) jamais restauré même présent dans le shadow.
 * restoreAllShadowKeys() énumère TOUT le shadow et restaure toute clé credential
 * manquante, sans écraser l'existant, en respectant ax_credentials_deleted.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { vault } from '../../services/vault/vault.js';

/** Écrit directement dans le shadow IDB (store keys de apex_v13_vault_shadow). */
function putShadow(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('apex_v13_vault_shadow', 1);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
    };
    req.onsuccess = (): void => {
      const db = req.result;
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(value, key);
      tx.oncomplete = (): void => { db.close(); resolve(); };
      tx.onerror = (): void => { db.close(); reject(tx.error); };
    };
    req.onerror = (): void => reject(req.error);
  });
}

describe('vault.restoreAllShadowKeys() — restauration universelle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restaure TOUT service du shadow, y compris hors VAULT_KEYS_CRITICAL', async () => {
    await putShadow('ax_anthropic_key', 'AXENC1:enc-anthropic');
    await putShadow('ax_tavily_key', 'AXENC1:enc-tavily');     /* hors liste */
    await putShadow('ax_finnhub_key', 'AXENC1:enc-finnhub');   /* hors liste */
    await putShadow('ax_vonage_token', 'AXENC1:enc-vonage');   /* hors liste */
    await putShadow('apex_v13_multi_keys', '{"v":1}');

    const n = await vault.restoreAllShadowKeys();

    expect(n).toBeGreaterThanOrEqual(5);
    expect(localStorage.getItem('ax_tavily_key')).toBe('AXENC1:enc-tavily');
    expect(localStorage.getItem('ax_finnhub_key')).toBe('AXENC1:enc-finnhub');
    expect(localStorage.getItem('ax_vonage_token')).toBe('AXENC1:enc-vonage');
    expect(localStorage.getItem('apex_v13_multi_keys')).toBe('{"v":1}');
  });

  it("n'écrase JAMAIS une valeur déjà présente en localStorage", async () => {
    localStorage.setItem('ax_anthropic_key', 'AXENC1:local-courant');
    await putShadow('ax_anthropic_key', 'AXENC1:vieux-shadow');

    await vault.restoreAllShadowKeys();

    expect(localStorage.getItem('ax_anthropic_key')).toBe('AXENC1:local-courant');
  });

  it('ne restaure PAS une clé volontairement supprimée (ax_credentials_deleted)', async () => {
    localStorage.setItem('ax_credentials_deleted', JSON.stringify(['ax_stripe_sk']));
    await putShadow('ax_stripe_sk', 'AXENC1:enc-stripe');

    await vault.restoreAllShadowKeys();

    expect(localStorage.getItem('ax_stripe_sk')).toBeNull();
  });

  it('ignore les clés non-credential du shadow', async () => {
    await putShadow('ax_browser_history', 'pas-un-credential');
    await putShadow('apex_v13_sw_cache_x', 'cache');

    await vault.restoreAllShadowKeys();

    expect(localStorage.getItem('ax_browser_history')).toBeNull();
    expect(localStorage.getItem('apex_v13_sw_cache_x')).toBeNull();
  });
});
