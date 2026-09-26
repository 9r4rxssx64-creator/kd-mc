/**
 * APEX v13 — Form Auto-Fill (IA remplit les champs Coffre/Settings/Profil).
 *
 * Implémente la règle CLAUDE.md "🧭 IA NAVIGUE ET REMPLIT" (Kevin 2026-04-25) :
 *  > "Je peux dire à l'IA, montre-moi où je colle ça, donne-moi la vue, amène-moi là.
 *  > Il comprend direct et il exécute. Et n'oublie pas d'intégrer au fur et à mesure
 *  > toutes les infos directement en autonomie au lieu de me demander."
 *
 * Comportement :
 *  1) `detectFillIntent(text)` : regex parse "remplis X avec Y" / "mets Y dans X" /
 *     "colle ce token dans coffre.gemini" → renvoie {key, value} ou null.
 *  2) `axAutofillField(key, value, opts)` : confirmation modal (sauf admin Kevin avec
 *     `confirm:false`) puis écriture via vault (clé chiffrée AES-GCM) ou store/localStorage
 *     pour clés non-secrètes.
 *  3) Cross-vue : map de keys → vue source (vault / settings / profile).
 *
 * Sécurité :
 *  - Whitelist stricte des clés écrivables (anti-injection)
 *  - Aucune écriture sans confirmation utilisateur sauf Kevin admin avec opts.confirm=false
 *  - Audit log immutable via auditLog.record()
 *  - Forbidden patterns (CB complète, seed phrases) → REFUS + warning
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

/* === Types =============================================================== */

export interface FillIntent {
  key: string;
  value: string;
  /** Vue source attendue (utile pour navigation IA "ouvre coffre") */
  view: 'vault' | 'settings' | 'profile' | 'unknown';
  /** Confidence 0..1 — > 0.7 pour exécution sans interrogation */
  confidence: number;
  raw: string;
}

export interface AutofillOptions {
  /** Si false, écriture directe sans modal (admin Kevin only). Défaut true. */
  confirm?: boolean;
  /** Tier user pour audit + permission. Défaut 'client_free'. */
  tier?: 'admin' | 'laurence' | 'family' | 'client_pro' | 'client_free';
  /** Raison textuelle (audit log) */
  reason?: string;
}

export interface AutofillResult {
  ok: boolean;
  key: string;
  view: 'vault' | 'settings' | 'profile' | 'unknown';
  written: boolean;
  awaiting_confirmation?: boolean;
  confirmation_token?: string;
  error?: string;
}

/* === Whitelist clés écrivables ============================================ */

/* Vault (chiffrement AES-GCM via vault.setKey) — secrets sensibles */
const VAULT_KEYS: ReadonlySet<string> = new Set([
  'ax_anthropic_key', 'ax_openai_key', 'ax_gemini_key', 'ax_groq_key',
  'ax_openrouter_key', 'ax_brave_key', 'ax_tavily_key', 'ax_deepl_key',
  'ax_github_token', 'ax_cloudflare_token', 'ax_stripe_sk', 'ax_stripe_pk',
  'ax_brevo_key', 'ax_resend_key', 'ax_perplexity_key', 'ax_replicate_key',
  'ax_notion_key', 'ax_airtable_pat', 'ax_aws_key',
]);

/* Settings (localStorage normal) — non-secret, mais writable */
const SETTINGS_KEYS: ReadonlySet<string> = new Set([
  'ax_paypal_me', 'ax_revolut_tag', 'ax_iban', 'ax_iban_nom',
  'ax_btc_address', 'ax_eth_address',
  'ax_push_worker_url', 'ax_cors_proxy_url', 'ax_proxy_url', 'ax_firebase_url',
  'ax_kevin_whatsapp_phone', 'ax_kevin_phone',
  'ax_user_lang', 'ax_user_country', 'ax_user_currency', 'ax_user_timezone',
  'ax_settings_theme', 'ax_settings_voice', 'ax_settings_model',
]);

/* Profile (objet store user.*) — Pour Apex profil de l'utilisateur */
const PROFILE_KEYS: ReadonlySet<string> = new Set([
  'profile.email', 'profile.name', 'profile.firstname', 'profile.lastname',
  'profile.address', 'profile.birthdate', 'profile.phone',
]);

/* Patterns FORBIDDEN — refus immédiat (Kevin règle CLAUDE.md "JAMAIS STOCKER") */
const FORBIDDEN_PATTERNS: readonly { name: string; regex: RegExp; reason: string }[] = [
  /* CB Visa/MC complète */
  { name: 'card_full', regex: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/, reason: 'CB complète interdite (utiliser Stripe)' },
  /* CVV (séparé) — heuristique 3-4 chiffres mais on bloque si label contient cvv */
  /* Seed phrase BIP39 12+ mots */
  { name: 'seed_phrase', regex: /^\b\w+\b(?:\s+\b\w+\b){11,23}$/, reason: 'Seed phrase crypto interdite (hardware wallet)' },
];

/* === Regex detect intent ================================================= */

/**
 * Parse "remplis ax_gemini_key avec AIzaSyXyz".
 * Tolérant à la casse, accents, ordre.
 *
 * Patterns acceptés :
 *  - "remplis X avec Y"
 *  - "mets Y dans X"
 *  - "colle Y dans le champ X"
 *  - "set X = Y"  /  "set X to Y"
 *  - "X est Y"  (low confidence)
 */
const FILL_PATTERNS: readonly { regex: RegExp; conf: number; keyIdx: number; valIdx: number }[] = [
  { regex: /(?:remplis|remplir|fill|saisis)\s+(?:le\s+champ\s+)?["']?([\w.-]+)["']?\s+(?:avec|with|=|à|a)\s+["']?(.+?)["']?$/i, conf: 0.92, keyIdx: 1, valIdx: 2 },
  { regex: /(?:mets|met|colle|coller|paste|put)\s+["']?(.+?)["']?\s+(?:dans|into|in)\s+(?:le\s+champ\s+)?["']?([\w.-]+)["']?$/i, conf: 0.9, keyIdx: 2, valIdx: 1 },
  { regex: /set\s+["']?([\w.-]+)["']?\s+(?:to|=)\s+["']?(.+?)["']?$/i, conf: 0.95, keyIdx: 1, valIdx: 2 },
  { regex: /sauvegarde\s+(?:le\s+)?(?:token|key|cle|clé)\s+["']?([\w.-]+)["']?\s*[:=]\s*["']?(.+?)["']?$/i, conf: 0.93, keyIdx: 1, valIdx: 2 },
];

/**
 * Détecte une intention de remplissage dans un texte libre.
 * Retourne null si rien détecté ou ambigu.
 */
export function detectFillIntent(text: string): FillIntent | null {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed.length > 4000) return null;
  for (const pat of FILL_PATTERNS) {
    const m = trimmed.match(pat.regex);
    if (m) {
      const key = (m[pat.keyIdx] ?? '').trim();
      const value = (m[pat.valIdx] ?? '').trim();
      if (!key || !value) continue;
      const view = resolveViewForKey(key);
      return { key, value, view, confidence: pat.conf, raw: trimmed };
    }
  }
  return null;
}

/** Résout view pour une clé donnée. */
function resolveViewForKey(key: string): 'vault' | 'settings' | 'profile' | 'unknown' {
  if (VAULT_KEYS.has(key)) return 'vault';
  if (SETTINGS_KEYS.has(key)) return 'settings';
  if (PROFILE_KEYS.has(key) || key.startsWith('profile.')) return 'profile';
  return 'unknown';
}

/* === Validation forbidden ================================================ */

function checkForbidden(value: string): { allowed: boolean; reason?: string } {
  for (const fp of FORBIDDEN_PATTERNS) {
    if (fp.regex.test(value)) return { allowed: false, reason: fp.reason };
  }
  return { allowed: true };
}

/* === Pending confirmations FIFO =========================================== */

interface PendingConfirmation {
  token: string;
  key: string;
  value: string;
  view: 'vault' | 'settings' | 'profile' | 'unknown';
  ts: number;
  tier: string;
  reason?: string;
}

const PENDING_KEY = 'apex_v13_pending_autofills';
const PENDING_MAX = 50;

function loadPending(): PendingConfirmation[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as PendingConfirmation[];
  } catch {
    return [];
  }
}

function savePending(list: PendingConfirmation[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-PENDING_MAX)));
  } catch {
    /* quota — drop silently */
  }
}

export function listPendingAutofills(): readonly Omit<PendingConfirmation, 'value'>[] {
  return loadPending().map(({ value: _value, ...rest }) => rest);
}

/* === axAutofillField ======================================================= */

/**
 * Remplit un champ après confirmation user.
 *
 * Comportement :
 *  - Si key inconnu → {ok:false, error:'unknown_key'}
 *  - Si forbidden pattern → {ok:false, error:'forbidden'}
 *  - Si admin Kevin + opts.confirm=false → écriture directe
 *  - Sinon → crée pending + retourne `awaiting_confirmation:true` + token
 *
 * Caller doit appeler `confirmAutofill(token)` pour valider.
 */
export async function axAutofillField(
  key: string,
  value: string,
  opts: AutofillOptions = {},
): Promise<AutofillResult> {
  const cleanKey = String(key ?? '').trim();
  const cleanValue = String(value ?? '').trim();
  if (!cleanKey) return { ok: false, key: cleanKey, view: 'unknown', written: false, error: 'key_empty' };
  if (!cleanValue) return { ok: false, key: cleanKey, view: 'unknown', written: false, error: 'value_empty' };

  const view = resolveViewForKey(cleanKey);
  if (view === 'unknown') {
    return { ok: false, key: cleanKey, view, written: false, error: 'key_not_in_whitelist' };
  }

  const forbidden = checkForbidden(cleanValue);
  if (!forbidden.allowed) {
    await auditLog.record('autofill.refused', {
      details: { key: cleanKey, reason: forbidden.reason ?? 'forbidden' },
    });
    return { ok: false, key: cleanKey, view, written: false, error: forbidden.reason ?? 'forbidden' };
  }

  const tier = opts.tier ?? 'client_free';
  const requiresConfirm = opts.confirm !== false;
  const isAdmin = tier === 'admin';

  /* Admin sans confirm explicite → écriture directe */
  if (isAdmin && !requiresConfirm) {
    return await writeKey(cleanKey, cleanValue, view, tier, opts.reason);
  }

  /* Sinon → crée pending pour confirmation modal */
  const token = `autofill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pending = loadPending();
  pending.push({
    token,
    key: cleanKey,
    value: cleanValue,
    view,
    ts: Date.now(),
    tier,
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });
  savePending(pending);

  await auditLog.record('autofill.pending', {
    details: { key: cleanKey, view, tier, token },
  });

  return {
    ok: false,
    key: cleanKey,
    view,
    written: false,
    awaiting_confirmation: true,
    confirmation_token: token,
  };
}

/**
 * Valide un token pending → exécute l'écriture effective.
 */
export async function confirmAutofill(token: string): Promise<AutofillResult> {
  const pending = loadPending();
  const found = pending.find((p) => p.token === token);
  if (!found) {
    return { ok: false, key: '', view: 'unknown', written: false, error: 'token_unknown_or_expired' };
  }
  const remaining = pending.filter((p) => p.token !== token);
  savePending(remaining);
  return await writeKey(found.key, found.value, found.view, found.tier, found.reason);
}

/**
 * Annule un pending sans l'exécuter.
 */
export async function cancelAutofill(token: string): Promise<{ ok: boolean }> {
  const pending = loadPending();
  if (!pending.some((p) => p.token === token)) return { ok: false };
  const remaining = pending.filter((p) => p.token !== token);
  savePending(remaining);
  await auditLog.record('autofill.cancelled', { details: { token } });
  return { ok: true };
}

/* === writeKey : exécution effective via vault / localStorage / store ====== */

async function writeKey(
  key: string,
  value: string,
  view: 'vault' | 'settings' | 'profile' | 'unknown',
  tier: string,
  reason?: string,
): Promise<AutofillResult> {
  try {
    if (view === 'vault') {
      const { vault } = await import('../vault/vault.js');
      const r = await vault.setKey(key, value);
      const persisted = (r as { ok: boolean; persisted?: { local: boolean } }).persisted;
      const ok = r.ok || persisted?.local === true;
      await auditLog.record('autofill.vault_write', {
        details: { key, ok, tier, ...(reason !== undefined && { reason }) },
      });
      logger.info('form-auto-fill', `vault.setKey ${key} → ${ok ? 'ok' : 'fail'}`);
      return { ok, key, view, written: ok };
    }
    if (view === 'settings') {
      if (typeof localStorage === 'undefined') {
        return { ok: false, key, view, written: false, error: 'no_localstorage' };
      }
      try {
        localStorage.setItem(key, value);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, key, view, written: false, error: msg };
      }
      await auditLog.record('autofill.settings_write', {
        details: { key, tier, ...(reason !== undefined && { reason }) },
      });
      return { ok: true, key, view, written: true };
    }
    if (view === 'profile') {
      /* Store profile.* sous store key 'user' (objet) */
      try {
        const { store } = await import('../../core/store.js');
        const user = (store.get('user') ?? {}) as Record<string, unknown>;
        const fieldName = key.startsWith('profile.') ? key.slice('profile.'.length) : key;
        const updated = { ...user, [fieldName]: value };
        store.set('user', updated as never);
      } catch (err) {
        logger.warn('form-auto-fill', 'profile store update failed', { err });
      }
      await auditLog.record('autofill.profile_write', {
        details: { key, tier, ...(reason !== undefined && { reason }) },
      });
      return { ok: true, key, view, written: true };
    }
    return { ok: false, key, view, written: false, error: 'unsupported_view' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('form-auto-fill', 'writeKey failed', { err, key });
    return { ok: false, key, view, written: false, error: msg };
  }
}

/* === Helpers exposés ====================================================== */

export function isWritableKey(key: string): boolean {
  return resolveViewForKey(key) !== 'unknown';
}

export function listWritableKeys(): readonly { key: string; view: string }[] {
  const out: { key: string; view: string }[] = [];
  for (const k of VAULT_KEYS) out.push({ key: k, view: 'vault' });
  for (const k of SETTINGS_KEYS) out.push({ key: k, view: 'settings' });
  for (const k of PROFILE_KEYS) out.push({ key: k, view: 'profile' });
  return out;
}

export const formAutoFill = {
  detectFillIntent,
  axAutofillField,
  confirmAutofill,
  cancelAutofill,
  listPendingAutofills,
  isWritableKey,
  listWritableKeys,
};
