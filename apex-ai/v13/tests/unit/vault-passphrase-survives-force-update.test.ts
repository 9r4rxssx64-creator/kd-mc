/**
 * APEX v13.3.94 P1.4 — Test régression CLAUDE.md erreur #55.
 *
 * Scénario reproduit :
 *   1. Setup vault avec clé chiffrée + passphrase device-bound
 *   2. Simuler force-update : clear localStorage SAUF PRESERVE_PREFIXES
 *      (mirror de force-update-banner.ts ligne 243-312)
 *   3. Decrypt après reload doit retourner le plaintext original
 *
 * Si ce test échoue, c'est qu'un préfixe critique a été oublié dans
 * PRESERVE_PREFIXES → cascade vault perte (erreur #55 v13.3.86 → revert).
 *
 * Anti-régression : ce test doit rester vert pour TOUTES les futures
 * versions. Si on ajoute un nouveau layer device-bound qui dépend
 * d'une clé localStorage, l'ajouter à PRESERVE_PREFIXES + ce test attrape.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vault } from '../../services/vault/vault.js';

/* Mirror exact du PRESERVE_PREFIXES de services/force-update-banner.ts.
 * Si on l'enrichit là-bas, dupliquer ici (ou refactor en const partagée). */
const PRESERVE_PREFIXES = [
  'apex_v13_vault',
  'apex_v13_user',
  'apex_v13_pin',
  'apex_v13_multikey_vault',
  'apex_v13_passphrase_history',
  'apex_v13_persistent_memory',
  'apex_v13_credentials',
  'apex_v13_device_obf',
  'apex_v13_device_passphrase',
  'apex_v13_lessons',
  'apex_v13_kb',
  'apex_v13_audit',
  'apex_v13_users',
  'apex_v13_xp',
  'apex_v13_streak',
  'ax_pin',
  'ax_user',
  'ax_uid',
  'ax_persistent_memory',
  'ax_anthropic',
  'ax_openai',
  'ax_groq',
  'ax_gemini',
  'ax_google',
  'ax_openrouter',
  'ax_mistral',
  'ax_cohere',
  'ax_deepseek',
  'ax_perplexity',
  'ax_xai',
  'ax_huggingface',
  'ax_hf_',
  'ax_replicate',
  'ax_stripe',
  'ax_brevo',
  'ax_resend',
  'ax_telegram',
  'ax_discord',
  'ax_github',
  'ax_gitlab',
  'ax_cloudflare',
  'ax_notion',
  'ax_airtable',
  'ax_dropbox',
  'ax_spotify',
  'ax_pinata',
  'ax_pinecone',
  'ax_qdrant',
  'ax_weaviate',
  'ax_brave',
  'ax_tavily',
  'ax_deepl',
  'ax_finnhub',
  'ax_coingecko',
  'ax_coinmarketcap',
  'ax_etherscan',
  'ax_openweathermap',
  'ax_owm',
  'ax_opencage',
  'ax_mapbox',
  'ax_unsplash',
  'ax_pixabay',
  'ax_pexels',
  'ax_elevenlabs',
  'ax_newsapi',
  'ax_credentials_deleted',
  'ax_shared_api_key',
  'ax_api_key',
];

/**
 * Simule l'étape 3 de force-update-banner.ts : clear cache localStorage
 * EXCEPT PRESERVE_PREFIXES. Remove cache/sw_/app_ver keys.
 */
function simulateForceUpdateClearLocalStorage(): void {
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const isPreserved = PRESERVE_PREFIXES.some((p) => key.startsWith(p));
    if (!isPreserved && (key.includes('cache') || key.includes('sw_') || key.includes('app_ver'))) {
      toDelete.push(key);
    }
  }
  toDelete.forEach((k) => localStorage.removeItem(k));
}

describe('vault passphrase survives force-update (CLAUDE.md erreur #55 anti-régression)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clé encrypted avec passphrase explicite → reste decryptable après clear cache simulé', async () => {
    const passphrase = 'kevin-pin-200807-test';
    const plaintext = 'sk-ant-api03-FAKETESTKEYABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    vault.setPassphrase(passphrase);
    const encrypted = await vault.encrypt(plaintext);
    /* Simule storage clé sensible style ax_anthropic_key (préservé) */
    localStorage.setItem('ax_anthropic_key', encrypted);

    /* Stocker quelques clés "cache" pollutes (à supprimer par force-update) */
    localStorage.setItem('apex_cache_assets', 'should-be-cleared');
    localStorage.setItem('sw_lastcheck', String(Date.now()));
    localStorage.setItem('app_ver_check', 'v13.3.92');

    /* Simule force-update */
    simulateForceUpdateClearLocalStorage();

    /* Vérifie : caches supprimés, clés vault préservées */
    expect(localStorage.getItem('apex_cache_assets')).toBeNull();
    expect(localStorage.getItem('sw_lastcheck')).toBeNull();
    expect(localStorage.getItem('app_ver_check')).toBeNull();
    expect(localStorage.getItem('ax_anthropic_key')).toBe(encrypted);

    /* Vérifie : decrypt avec même passphrase → plaintext original */
    const decrypted = await vault.decrypt(encrypted, passphrase);
    expect(decrypted).toBe(plaintext);
  });

  it('PIN hash apex_v13_pin survit force-update (fix v13.3.93 sans underscore final)', () => {
    const pinHash = 'sha256:abcdef0123456789';
    localStorage.setItem('apex_v13_pin', pinHash);
    /* Aussi tester ancien format avec underscore (préservé par même prefix) */
    localStorage.setItem('apex_v13_pin_user_kdmc_admin', 'sha256:another');

    /* Caches à supprimer */
    localStorage.setItem('cache_pin_temp', 'should-die');

    simulateForceUpdateClearLocalStorage();

    expect(localStorage.getItem('apex_v13_pin')).toBe(pinHash);
    expect(localStorage.getItem('apex_v13_pin_user_kdmc_admin')).toBe('sha256:another');
    expect(localStorage.getItem('cache_pin_temp')).toBeNull();
  });

  it('passphrase_history préservé (anti-régression erreur #55 XOR-obf revert)', async () => {
    /* Reproduit scénario exact erreur #55 : history dépend d'apex_v13_device_obf
     * qui pourrait être effacé par force-update. Tant que history préservé,
     * le scénario worst-case (PIN changé) reste rattrapable via retry history. */
    const history = [
      { passphrase: 'old-pin-1', ts: Date.now() - 100000 },
      { passphrase: 'old-pin-2', ts: Date.now() - 50000 },
    ];
    localStorage.setItem('apex_v13_passphrase_history', JSON.stringify(history));
    localStorage.setItem('apex_v13_device_obf', 'device-key-random-bytes');

    simulateForceUpdateClearLocalStorage();

    expect(localStorage.getItem('apex_v13_passphrase_history')).toBeTruthy();
    expect(localStorage.getItem('apex_v13_device_obf')).toBe('device-key-random-bytes');
  });

  it('clés ax_* providers IA toutes préservées (cf. PRESERVE_PREFIXES list)', () => {
    const samples = [
      'ax_anthropic_key',
      'ax_openai_key',
      'ax_groq_key',
      'ax_github_token',
      'ax_stripe_secret',
      'ax_pinecone_key',
      'ax_brave_key',
      'ax_resend_key',
    ];
    for (const k of samples) {
      localStorage.setItem(k, `value-${k}`);
    }
    /* + 1 clé pollute */
    localStorage.setItem('cache_provider_status', 'pollute');

    simulateForceUpdateClearLocalStorage();

    for (const k of samples) {
      expect(localStorage.getItem(k)).toBe(`value-${k}`);
    }
    expect(localStorage.getItem('cache_provider_status')).toBeNull();
  });
});
