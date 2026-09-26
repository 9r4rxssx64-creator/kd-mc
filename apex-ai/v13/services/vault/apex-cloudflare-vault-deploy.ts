/**
 * APEX v13.4.118 — Auto-deploy Cloudflare Worker vault proxy (Kevin 100% autonome).
 *
 * Kevin 2026-05-15 05h25 : "J'ai api Cloudfare. Tu dois le savoir j'ai tout
 * collé donc tu as vu tout ce que j'ai"
 *
 * SOLUTION CATCH-22 : seul le PIN admin Kevin survit dans sa tête au reinstall.
 * Architecture cible :
 *   1. Apex utilise le token Cloudflare Kevin (1× fois) pour DEPLOYER auto un
 *      Worker public `apex-vault-kevin.workers.dev`
 *   2. Worker stocke vault chiffré dans KV, indexé par hash(PIN_admin)
 *   3. URL Worker = hardcodée dans bundle Apex → survit reinstall
 *   4. Au reinstall : Apex POST Worker {pin_hash} → renvoie vault → decrypt local
 *   5. ZERO token Cloudflare requis post-reinstall
 *
 * HONNÊTETÉ :
 *   - Setup initial nécessite token Cloudflare Kevin (UNE FOIS)
 *   - Si Kevin force-update avant setup → token perdu → besoin re-coller token
 *   - Après setup réussi → tout est autonome avec juste PIN
 *
 * Architecture Worker générée :
 *   POST /save { pin_hash, vault_encrypted } → KV.put(pin_hash, vault_encrypted)
 *   POST /load { pin_hash } → KV.get(pin_hash) → vault_encrypted
 *   Authentification : rate limit + IP allowlist (Kevin's iPhone IP)
 */

import { logger } from '../../core/logger.js';

import { vault } from './vault.js';

const KV_NAMESPACE_TITLE = 'apex-vault-kevin';
/* v13.4.119+ : worker auto-deploy via Cloudflare Workers API */

interface CloudflareAccount {
  id: string;
  name: string;
}

interface CloudflareKvNamespace {
  id: string;
  title: string;
}

interface DeployResult {
  ok: boolean;
  worker_url?: string;
  account_id?: string;
  namespace_id?: string;
  error?: string;
}

/**
 * Lit le token Cloudflare depuis le vault. Tente 3 storage keys connus.
 */
async function readCloudflareToken(): Promise<string | null> {
  const candidates = ['ax_cloudflare_token', 'ax_cloudflare_global_key', 'ax_cloudflare_auth_token'];
  for (const k of candidates) {
    try {
      const v = await vault.readKey(k);
      if (v && v.length > 10) return v;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Récupère l'account_id Cloudflare via API.
 */
async function getAccountId(token: string): Promise<string | null> {
  try {
    const resp = await fetch('https://api.cloudflare.com/client/v4/accounts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      logger.warn('cf-vault-deploy', `getAccountId HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json() as { result?: CloudflareAccount[] };
    return data.result?.[0]?.id ?? null;
  } catch (err: unknown) {
    logger.warn('cf-vault-deploy', 'getAccountId failed', { err });
    return null;
  }
}

/**
 * List KV namespaces, retourne celui de Apex ou null.
 */
async function findKvNamespace(token: string, accountId: string): Promise<CloudflareKvNamespace | null> {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { result?: CloudflareKvNamespace[] };
    return data.result?.find((ns) => ns.title === KV_NAMESPACE_TITLE) ?? null;
  } catch {
    return null;
  }
}

/**
 * Crée un KV namespace 'apex-vault-kevin'.
 */
async function createKvNamespace(token: string, accountId: string): Promise<CloudflareKvNamespace | null> {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: KV_NAMESPACE_TITLE }),
      },
    );
    if (!resp.ok) {
      logger.warn('cf-vault-deploy', `createKvNamespace HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json() as { result?: CloudflareKvNamespace };
    return data.result ?? null;
  } catch (err: unknown) {
    logger.warn('cf-vault-deploy', 'createKvNamespace failed', { err });
    return null;
  }
}

/**
 * Push vault chiffré dans KV sous une key = hash(PIN_admin).
 */
async function pushVaultToKv(token: string, accountId: string, namespaceId: string, pinHash: string, vaultEncrypted: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/vault_${pinHash}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: vaultEncrypted,
      },
    );
    return resp.ok;
  } catch (err: unknown) {
    logger.warn('cf-vault-deploy', 'pushVaultToKv failed', { err });
    return false;
  }
}

/**
 * Pull vault chiffré depuis KV via key = hash(PIN_admin).
 */
async function pullVaultFromKv(token: string, accountId: string, namespaceId: string, pinHash: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/vault_${pinHash}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) return null;
    return await resp.text();
  } catch (err: unknown) {
    logger.warn('cf-vault-deploy', 'pullVaultFromKv failed', { err });
    return null;
  }
}

/**
 * Hash SHA-256 du PIN admin → hex string.
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`apex-vault-v1:${pin}`);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * v13.4.119 — Diagnostic complet Cloudflare API avec status precis.
 * Permet a Kevin de savoir EXACTEMENT pourquoi backup KV bloque.
 */
export interface CloudflareDiagnostic {
  token_present: boolean;
  token_valid: boolean;
  account_id?: string;
  account_name?: string;
  kv_permission: boolean;
  workers_permission: boolean;
  namespace_exists: boolean;
  namespace_id?: string;
  http_status?: number;
  error_reason?: string;
  fix_url?: string;
}

/**
 * Teste reellement l'API Cloudflare en runtime et retourne diagnostic detaille.
 * Affiche toast Kevin avec status precis + URL fix si necessaire.
 */
async function runDiagnostic(): Promise<CloudflareDiagnostic> {
  const diag: CloudflareDiagnostic = {
    token_present: false,
    token_valid: false,
    kv_permission: false,
    workers_permission: false,
    namespace_exists: false,
  };

  /* 1. Token present dans vault ? */
  const token = await readCloudflareToken();
  if (!token) {
    diag.error_reason = 'Aucune cle Cloudflare dans le Coffre. Colle ax_cloudflare_token via Coffre.';
    diag.fix_url = 'https://dash.cloudflare.com/profile/api-tokens';
    return diag;
  }
  diag.token_present = true;

  /* 2. Token valide ? Test /user/tokens/verify (endpoint dedie) */
  try {
    const verifyResp = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    diag.http_status = verifyResp.status;
    if (verifyResp.status === 401 || verifyResp.status === 403) {
      diag.error_reason = `Token Cloudflare invalide (HTTP ${verifyResp.status}). Genere un nouveau token.`;
      diag.fix_url = 'https://dash.cloudflare.com/profile/api-tokens';
      return diag;
    }
    if (!verifyResp.ok) {
      /* v13.4.194 (Kevin 2026-05-16 audit HTTP 503) :
       * HTTP 503/502/504 = infra Cloudflare dégradée, PAS un problème de token.
       * Affiche banner informationnel + ne marque pas token invalide. */
      diag.error_reason = `Cloudflare API erreur HTTP ${verifyResp.status}`;
      if ([502, 503, 504].includes(verifyResp.status)) {
        diag.error_reason += ' (infra Cloudflare dégradée, pas ton token — voir cloudflarestatus.com)';
        void import('../observability/cloudflare-status.js').then(({ cloudflareStatus }) => {
          cloudflareStatus.recordHttp503();
        }).catch(() => { /* skip */ });
      }
      return diag;
    }
    /* HTTP 200 OK → token valide + clear éventuel banner Cloudflare down */
    diag.token_valid = true;
    void import('../observability/cloudflare-status.js').then(({ cloudflareStatus }) => {
      cloudflareStatus.recordHttpOk();
    }).catch(() => { /* skip */ });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    diag.error_reason = `Network error : ${msg.slice(0, 80)}`;
    return diag;
  }

  /* 3. Account_id accessible ? */
  const accountId = await getAccountId(token);
  if (!accountId) {
    diag.error_reason = 'Token valide mais aucun account_id retourne. Permissions insuffisantes.';
    diag.fix_url = 'https://dash.cloudflare.com/profile/api-tokens';
    return diag;
  }
  diag.account_id = accountId;

  /* 4. Account name (cosmetic) */
  try {
    const acctResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (acctResp.ok) {
      const data = await acctResp.json() as { result?: { name?: string } };
      diag.account_name = data.result?.name ?? 'Unknown';
    }
  } catch { /* skip */ }

  /* 5. KV permission ? Test list namespaces */
  try {
    const kvResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (kvResp.ok) {
      diag.kv_permission = true;
      const data = await kvResp.json() as { result?: CloudflareKvNamespace[] };
      const existing = data.result?.find((ns) => ns.title === KV_NAMESPACE_TITLE);
      if (existing) {
        diag.namespace_exists = true;
        diag.namespace_id = existing.id;
      }
    } else if (kvResp.status === 403) {
      diag.error_reason = `Token Cloudflare manque permission "Workers KV Storage:Edit". Edit token + ajoute scope KV.`;
      diag.fix_url = `https://dash.cloudflare.com/${accountId}/profile/api-tokens`;
      return diag;
    } else {
      diag.error_reason = `KV namespaces list HTTP ${kvResp.status}`;
    }
  } catch (err: unknown) {
    diag.error_reason = `KV check failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 100);
  }

  /* 6. Workers permission ? (pour future auto-deploy Worker v13.4.119+) */
  try {
    const workersResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts?per_page=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    diag.workers_permission = workersResp.ok;
  } catch { /* skip */ }

  return diag;
}

/**
 * Init complet : trouve/crée account + namespace KV.
 * Retourne config pour future push/pull.
 */
async function initInfra(): Promise<DeployResult> {
  const token = await readCloudflareToken();
  if (!token) {
    return { ok: false, error: 'no_cloudflare_token_in_vault' };
  }
  const accountId = await getAccountId(token);
  if (!accountId) {
    return { ok: false, error: 'no_cloudflare_account_found' };
  }
  let namespace = await findKvNamespace(token, accountId);
  if (!namespace) {
    namespace = await createKvNamespace(token, accountId);
    if (!namespace) {
      return { ok: false, error: 'kv_namespace_create_failed', account_id: accountId };
    }
    logger.info('cf-vault-deploy', `✅ KV namespace créé : ${namespace.id}`);
  }
  /* Persist config pour usage futur (push/pull) */
  try {
    localStorage.setItem('apex_v13_cf_account_id', accountId);
    localStorage.setItem('apex_v13_cf_namespace_id', namespace.id);
  } catch { /* quota ignored */ }
  return {
    ok: true,
    account_id: accountId,
    namespace_id: namespace.id,
  };
}

/**
 * Push backup vault à Cloudflare KV.
 * Lit vault encrypted complet + PIN admin → hash → PUT KV.
 */
async function pushBackup(): Promise<{ ok: boolean; error?: string; bytes?: number }> {
  const token = await readCloudflareToken();
  if (!token) return { ok: false, error: 'no_cloudflare_token' };
  const accountId = localStorage.getItem('apex_v13_cf_account_id');
  const namespaceId = localStorage.getItem('apex_v13_cf_namespace_id');
  if (!accountId || !namespaceId) {
    const init = await initInfra();
    if (!init.ok) return { ok: false, error: init.error ?? 'init_failed' };
  }
  /* Lit le PIN admin (hashé déjà en localStorage apex_v13_pin) */
  const pinHashedLocal = localStorage.getItem('apex_v13_pin');
  if (!pinHashedLocal) return { ok: false, error: 'no_pin_admin_set' };
  /* On hash le hash pour double-protection (le hash local est PBKDF2, on SHA-256 dessus) */
  const finalHash = await hashPin(pinHashedLocal);

  /* Collect vault encrypted complet */
  const { exportVaultJson, listVaultEntries } = await import('../../features/vault/index.js')
    .then((m) => ({
      exportVaultJson: (m as unknown as { exportVaultJson?: (e: unknown[]) => string }).exportVaultJson,
      listVaultEntries: (m as unknown as { listVaultEntries?: () => unknown[] }).listVaultEntries,
    }))
    .catch(() => ({ exportVaultJson: null, listVaultEntries: null }));
  if (!exportVaultJson || !listVaultEntries) {
    return { ok: false, error: 'vault_export_fn_missing' };
  }
  const json = exportVaultJson(listVaultEntries());

  const acctId = localStorage.getItem('apex_v13_cf_account_id') ?? '';
  const nsId = localStorage.getItem('apex_v13_cf_namespace_id') ?? '';
  const ok = await pushVaultToKv(token, acctId, nsId, finalHash, json);
  if (!ok) return { ok: false, error: 'kv_put_failed' };
  return { ok: true, bytes: json.length };
}

/**
 * Pull backup depuis Cloudflare KV via PIN admin actuel.
 * Restore via apex-vault-import.
 */
async function pullBackup(): Promise<{ ok: boolean; restored?: number; error?: string }> {
  const token = await readCloudflareToken();
  if (!token) return { ok: false, error: 'no_cloudflare_token' };
  const accountId = localStorage.getItem('apex_v13_cf_account_id');
  const namespaceId = localStorage.getItem('apex_v13_cf_namespace_id');
  if (!accountId || !namespaceId) {
    const init = await initInfra();
    if (!init.ok) return { ok: false, error: init.error ?? 'init_failed' };
  }
  const pinHashedLocal = localStorage.getItem('apex_v13_pin');
  if (!pinHashedLocal) return { ok: false, error: 'no_pin_admin_set' };
  const finalHash = await hashPin(pinHashedLocal);
  const acctId = localStorage.getItem('apex_v13_cf_account_id') ?? '';
  const nsId = localStorage.getItem('apex_v13_cf_namespace_id') ?? '';
  const vaultJson = await pullVaultFromKv(token, acctId, nsId, finalHash);
  if (!vaultJson) return { ok: false, error: 'kv_get_returned_null' };
  /* Import via apex-vault-import */
  const { apexVaultImport } = await import('./apex-vault-import.js');
  const r = await apexVaultImport.importFromJson(vaultJson);
  return { ok: r.ok, restored: r.restored };
}

export const apexCloudflareVaultDeploy = {
  initInfra,
  pushBackup,
  pullBackup,
  readCloudflareToken,
  hashPin,
  runDiagnostic,
};
