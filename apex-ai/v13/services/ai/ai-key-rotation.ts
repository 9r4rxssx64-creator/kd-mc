/**
 * APEX v13 — AI Key Rotation orchestrator
 *
 * Demande Kevin 2026-05-08 (audit Apex IA: anthropic+cohere+groq erreur simultanée) :
 * - History des clés par provider (chiffré via vault.encryptAuto, jamais en clair)
 * - Quand current fail (401/402/429) → essayer next clé du history
 * - Si dernière clé fail → marquer provider DEAD pour 1h + bascule failover
 * - Si quota épuisé sur tous providers → notif Kevin + suggérer recharge
 * - Auto-detect quand Kevin colle nouvelle clé via paste hook → ajouter au history
 *
 * Couche au-dessus de `multi-key-vault.ts` qui stocke les KeyEntry chiffrées.
 * Cette orchestration ajoute :
 *   - Classement HTTP fail → next-action (rotate-key / mark-dead / quota-alert)
 *   - DEAD timer per-provider (TTL configurable, défaut 1h)
 *   - Provider stats agrégées (latency, success_rate, last_fail) — alimentent ai-router policy
 *   - Paste hook : détection automatique via credential-patterns + add to history
 *   - Notification Kevin (toast + audit) si tous providers KO
 *
 * Règles CLAUDE.md :
 * - "Anti-blocage IA, auto-déblocage total" : ne jamais laisser Kevin bloqué silencieusement
 * - "Reconnaissance auto credentials" : paste hook détecte + stocke chiffré + audit
 * - "JAMAIS stocker en clair" : passe systématiquement par vault.encryptAuto
 * - "Backward compat" : ai-router.ts continue d'appeler multi-key-vault directement,
 *   cette couche orchestre par dessus sans casser les interfaces existantes.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { detectCredential, type CredentialPattern } from '../vault/credential-patterns.js';
import { multiKeyVault, type KeyEntry } from '../vault/multi-key-vault.js';

/* === Types publics === */

export type RotationProvider =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'groq'
  | 'gemini'
  | 'google'
  | 'mistral'
  | 'cohere'
  | 'perplexity'
  | 'deepseek';

export type FailClassification =
  | 'auth_invalid' /* 401/403 → marque clé invalid */
  | 'quota_exhausted' /* 402 → balance vide, marque rate-limited */
  | 'rate_limited' /* 429 → temporaire, marque rate-limited */
  | 'server_error' /* 5xx → bump fail counter */
  | 'network' /* timeout, abort, DNS fail */
  | 'unknown';

export interface RotateResult {
  ok: boolean;
  /** Provider ciblé (re-mappé : ex 'gemini' → 'google') */
  service: string;
  /** Action prise par l'orchestrator */
  action:
    | 'rotated_to_next' /* clé suivante du history sélectionnée */
    | 'no_more_keys' /* dernière clé du provider épuisée */
    | 'provider_dead' /* provider marqué dead pour TTL */
    | 'all_providers_dead' /* tous providers down → notif Kevin */
    | 'no_key_found'; /* aucune clé enregistrée pour ce service */
  /** Si rotated_to_next, ID de la nouvelle clé (préfixe 8 chars dans logs) */
  nextKeyId?: string;
  /** Si rotated_to_next, plaintext déchiffré (caller usera dans le fetch suivant) */
  nextPlaintext?: string;
  /** Provider de fallback à essayer si action = provider_dead */
  fallbackProvider?: string;
  classification: FailClassification;
  /** Message human-readable pour log/UI */
  reason: string;
}

export interface ProviderStats {
  provider: string;
  total_calls: number;
  success_count: number;
  fail_count: number;
  avg_latency_ms: number;
  last_success_ts: number;
  last_fail_ts: number;
  last_fail_classification?: FailClassification;
  last_fail_reason?: string;
  /** Si > Date.now(), provider est marqué DEAD jusqu'à ce TS */
  dead_until_ts: number;
}

export interface PasteHookResult {
  ok: boolean;
  service?: string;
  keyId?: string;
  pattern?: CredentialPattern;
  /** True = nouvelle clé ajoutée, false = doublon dédupé / pattern non IA / forbidden */
  added: boolean;
  reason?: string;
}

/* === Internals === */

const STORAGE_STATS = 'apex_v13_provider_stats';
const STORAGE_DEAD = 'apex_v13_provider_dead_until';
const DEFAULT_DEAD_TTL_MS = 60 * 60 * 1000; /* 1h par règle Kevin */
const DEFAULT_FALLBACK_CHAIN: ReadonlyArray<RotationProvider> = [
  'anthropic',
  'openrouter',
  'groq',
  'gemini',
  'mistral',
  'cohere',
  'openai',
  'perplexity',
  'deepseek',
];

/* Catégorie credential-patterns considérée comme rotable IA */
const AI_CATEGORY = 'ai' as const;

/* Map storageKey → service multi-key-vault.
 * credential-patterns expose `storageKey` (ex: 'ax_anthropic_key'), on dérive le service. */
function storageKeyToService(storageKey: string): string {
  const m = /^ax_([a-z0-9_]+?)_(?:key|token|api_key)$/i.exec(storageKey);
  if (m) return m[1]!.toLowerCase();
  /* Fallback : strip prefix ax_ et suffix générique */
  return storageKey.replace(/^ax_/, '').replace(/_(?:key|token|api_key)$/i, '').toLowerCase();
}

/**
 * Mappe RotationProvider → nom service utilisé par multi-key-vault.
 * Ex: 'gemini' partage la clé Google AI Studio sous 'google'.
 */
function providerToVaultService(provider: RotationProvider): string {
  if (provider === 'gemini') return 'google';
  return provider;
}

/**
 * Classifie une erreur HTTP / network en catégorie actionnable.
 *
 * `exactOptionalPropertyTypes: true` (tsconfig) demande qu'on accepte explicitement
 * `undefined` sur les champs optionnels — sinon les call sites qui passent
 * `{ status: number | undefined }` cassent.
 */
export function classifyError(input: { status?: number | undefined; message?: string | undefined }): FailClassification {
  const { status, message } = input;
  const msg = (message ?? '').toLowerCase();
  /* Cloudflare infra (Bot Management / challenge / 5xx edge) renvoie une page HTML
   * avec ces marqueurs — c'est l'INFRA Cloudflare, PAS la clé API. api.anthropic.com
   * & co sont derrière Cloudflare : pendant un incident CF, un 403/503 injecté par CF
   * était pris pour `auth_invalid` → rotation de clés → provider marqué DEAD 1h →
   * Apex restait en mode dégradé bien après le retour de CF (Kevin "ça bascule pas,
   * aucun réseau", récurrent). On le classe `network` (transitoire) : pas de pénalité
   * clé, pas de DEAD, retry/failover immédiat, recovery dès que CF répond 200. */
  if (/cloudflare|cf-ray|attention required|just a moment|error code:\s*1\d{3}|you have been blocked|bot management|enable cookies/i.test(msg)) {
    return 'network';
  }
  if (status === 401 || status === 403 || /invalid.api.key|unauthor|forbidden/i.test(msg)) {
    return 'auth_invalid';
  }
  if (status === 402 || /payment.required|balance|insufficient/i.test(msg)) {
    return 'quota_exhausted';
  }
  if (status === 429 || /rate.?limit|too.many.requests|quota/i.test(msg)) {
    return 'rate_limited';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'server_error';
  }
  if (/timeout|abort|network|fetch failed|enotfound|econnrefused/i.test(msg)) {
    return 'network';
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return 'unknown';
  }
  return 'unknown';
}

/**
 * v13.4.320 — message « Toutes les IA KO » PRÉCIS selon l'état (Kevin « toujours
 * détailler la cause exacte »). Pur/testable. Le cas n°1 (proxy on + code pas en
 * mémoire) = le bug vécu 2026-06-08 : l'auth proxy a besoin du code admin.
 */
export function allDeadMessage(s: { proxyOn: boolean; pinStored: boolean; hasLocalKey: boolean }): string {
  if (s.proxyOn && !s.pinStored && !s.hasLocalKey) {
    return '🔑 Ton code n’est pas en mémoire — l’IA passe par le proxy serveur qui en a besoin. Fais 🚪 Déco puis reconnecte-toi avec ton code pour activer l’IA.';
  }
  if (!s.hasLocalKey && !s.proxyOn) {
    return '🔑 Aucune clé IA locale et proxy inactif. Colle une clé dans le Coffre 🔐 (« Détecter & stocker ») pour activer l’IA.';
  }
  return '🚨 Toutes les IA sont KO. Tes clés (serveur ou Coffre) semblent expirées — vérifie le Coffre 🔐.';
}

class AIKeyRotation {
  private statsCache: Map<string, ProviderStats> | null = null;
  private deadCache: Map<string, number> | null = null;
  /** Notification "all providers dead" — anti-spam (1× / 10 min) */
  private lastAllDeadNotifTs = 0;

  constructor() {
    this.loadStats();
    this.loadDead();
    /* Récupération immédiate au retour réseau : un incident réseau/Cloudflare a pu
     * marquer des providers DEAD ; dès que le réseau revient, on leur redonne leur
     * chance (sinon Apex restait dégradé jusqu'à 1h après le retour de CF). */
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => { this.clearAllDead(); });
    }
  }

  /**
   * Sélection de la clé courante pour un provider, avec respect du DEAD timer.
   * Si provider DEAD → null ; caller doit failover.
   */
  async getCurrentKey(provider: RotationProvider): Promise<{ keyId: string; plaintext: string } | null> {
    const service = providerToVaultService(provider);
    if (this.isProviderDead(service)) {
      logger.info('ai-key-rotation', `${service} marked DEAD until ${new Date(this.getDeadUntil(service)).toISOString()}`);
      return null;
    }
    const result = await multiKeyVault.getCurrentKey(service);
    if (!result) {
      logger.info('ai-key-rotation', `${service} no key in vault`);
      return null;
    }
    return result;
  }

  /**
   * Appelé par ai-router quand un fetch échoue. Décide de :
   * - rotated_to_next : essayer prochaine clé du même provider
   * - provider_dead : marquer provider DEAD 1h + suggérer fallback
   * - all_providers_dead : tous providers down → notif Kevin
   *
   * @param provider provider courant qui a échoué
   * @param failedKeyId ID de la clé qui a échoué (ou undefined si pas multi-key)
   * @param error erreur (HTTP status + message)
   */
  async handleFailure(
    provider: RotationProvider,
    failedKeyId: string | undefined,
    error: { status?: number | undefined; message?: string | undefined },
  ): Promise<RotateResult> {
    const service = providerToVaultService(provider);
    const classification = classifyError(error);
    const reason = error.message ?? `HTTP ${error.status ?? 'unknown'}`;
    this.recordFail(service, classification, reason);

    /* Server error / network → ne pas pénaliser la clé, essayer même clé après backoff
       (caller gère le retry). Pas de rotate ici. */
    if (classification === 'server_error' || classification === 'network') {
      return {
        ok: false,
        service,
        action: 'no_more_keys', /* signal au caller : pas de rotate possible, retry ou failover */
        classification,
        reason,
      };
    }

    /* Auth/quota/rate-limit → tente clé suivante du history */
    if (failedKeyId !== undefined) {
      const next = await multiKeyVault.tryFailoverKey(service, failedKeyId, reason);
      if (next) {
        void auditLog.record('ai.key_rotated', {
          details: {
            service,
            from_key: failedKeyId.slice(0, 8),
            to_key: next.keyId.slice(0, 8),
            classification,
          },
        });
        logger.info('ai-key-rotation', `🔄 ${service} rotated key ${failedKeyId.slice(0, 8)} → ${next.keyId.slice(0, 8)} (${classification})`);
        return {
          ok: true,
          service,
          action: 'rotated_to_next',
          nextKeyId: next.keyId,
          nextPlaintext: next.plaintext,
          classification,
          reason,
        };
      }
    }

    /* Plus de clé dispo pour ce provider → marque DEAD pour TTL */
    this.markProviderDead(service, DEFAULT_DEAD_TTL_MS);
    void auditLog.record('ai.provider_dead', {
      details: {
        service,
        classification,
        reason,
        ttl_ms: DEFAULT_DEAD_TTL_MS,
      },
    });
    logger.warn('ai-key-rotation', `💀 ${service} marked DEAD for ${DEFAULT_DEAD_TTL_MS / 60000}min (${classification})`);

    /* Cherche un fallback provider non-DEAD avec au moins 1 clé */
    const fallback = await this.pickAliveFallback(service);
    if (fallback) {
      return {
        ok: false,
        service,
        action: 'provider_dead',
        fallbackProvider: fallback,
        classification,
        reason,
      };
    }

    /* Tous providers DEAD ou sans clé → alerte Kevin */
    this.notifyAllProvidersDead();
    return {
      ok: false,
      service,
      action: 'all_providers_dead',
      classification,
      reason,
    };
  }

  /**
   * Appelé par ai-router quand un fetch réussit (pour stats latency + success).
   */
  recordSuccess(provider: RotationProvider, latencyMs: number): void {
    const service = providerToVaultService(provider);
    const stats = this.getOrCreateStats(service);
    stats.total_calls += 1;
    stats.success_count += 1;
    stats.last_success_ts = Date.now();
    /* Moyenne mobile pondérée (alpha = 0.2) pour lisser */
    if (stats.avg_latency_ms === 0) stats.avg_latency_ms = latencyMs;
    else stats.avg_latency_ms = Math.round(stats.avg_latency_ms * 0.8 + latencyMs * 0.2);
    /* Reset DEAD si on a un succès (provider est revenu) */
    if (this.isProviderDead(service)) {
      this.clearDead(service);
      logger.info('ai-key-rotation', `${service} recovered (cleared DEAD)`);
    }
    this.persistStats();
  }

  /**
   * Paste hook : appelé quand Kevin colle un texte (chat input, vault input, etc.).
   * Détecte si c'est une clé IA, déchiffre/chiffre via vault, ajoute au history multi-key-vault.
   *
   * @param value texte collé
   * @returns PasteHookResult décrivant l'action prise
   */
  async onPasteDetect(value: string): Promise<PasteHookResult> {
    const trimmed = (value ?? '').trim();
    if (!trimmed || trimmed.length < 16) {
      return { ok: false, added: false, reason: 'too_short' };
    }
    const pattern = detectCredential(trimmed);
    if (!pattern) {
      return { ok: false, added: false, reason: 'no_pattern_match' };
    }
    if (pattern.category === 'forbidden') {
      logger.warn('ai-key-rotation', 'forbidden credential refused (seed/cb/etc.)', { pattern: pattern.name });
      return { ok: false, added: false, pattern, reason: 'forbidden' };
    }
    if (pattern.category !== AI_CATEGORY) {
      /* On ne stocke ici que les clés IA. Les autres credentials (saas/finance)
       * sont gérés par le pipeline credential-patterns standard (vault.autoStore). */
      return { ok: false, added: false, pattern, reason: 'not_ai_provider' };
    }
    const service = storageKeyToService(pattern.storageKey);
    try {
      const entry = await multiKeyVault.addKey(service, trimmed, {
        alias: `auto-detected ${new Date().toISOString().slice(0, 10)}`,
      });
      void auditLog.record('ai.key_auto_added', {
        details: {
          service,
          key_id: entry.id.slice(0, 8),
          pattern: pattern.name,
          source: 'paste_hook',
        },
      });
      logger.info('ai-key-rotation', `✅ paste detected ${pattern.name} → service=${service} keyId=${entry.id.slice(0, 8)}`);
      /* Auto-clear DEAD : Kevin vient de coller une nouvelle clé,
         on lui donne sa chance immédiatement. */
      if (this.isProviderDead(service)) {
        this.clearDead(service);
        logger.info('ai-key-rotation', `${service} DEAD cleared (new key pasted)`);
      }
      return { ok: true, added: true, service, keyId: entry.id, pattern };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('ai-key-rotation', 'addKey failed', { service, err: msg });
      return { ok: false, added: false, pattern, reason: msg };
    }
  }

  /**
   * Stats per-provider (lecture seule). Utilisé par ai-router policy + UI dashboard.
   */
  getStats(provider: RotationProvider): ProviderStats {
    const service = providerToVaultService(provider);
    return { ...this.getOrCreateStats(service) };
  }

  /**
   * Stats globales par service connu (UI admin).
   */
  getAllStats(): ProviderStats[] {
    this.loadStats();
    return Array.from((this.statsCache ?? new Map()).values()).map((s) => ({ ...s }));
  }

  /**
   * Ranking des providers utilisables (non-DEAD, ayant au moins 1 clé), trié par success_rate desc.
   */
  async rankProviders(): Promise<{ service: string; score: number; alive: boolean }[]> {
    const known = multiKeyVault.getKnownServices();
    const out: { service: string; score: number; alive: boolean }[] = [];
    for (const service of known) {
      const stats = this.getOrCreateStats(service);
      const alive = !this.isProviderDead(service);
      const total = stats.total_calls;
      const successRate = total > 0 ? stats.success_count / total : 0.5; /* unknown = 50% */
      const latencyPenalty = stats.avg_latency_ms > 0 ? Math.min(stats.avg_latency_ms / 10000, 0.5) : 0;
      const score = Math.max(0, Math.min(100, Math.round((successRate * 0.8 + (1 - latencyPenalty) * 0.2) * 100)));
      out.push({ service, score, alive });
    }
    out.sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.score - a.score;
    });
    return out;
  }

  /**
   * Réinitialise stats + DEAD pour un service (admin).
   */
  reset(provider: RotationProvider): void {
    const service = providerToVaultService(provider);
    this.statsCache?.delete(service);
    this.clearDead(service);
    this.persistStats();
  }

  /**
   * Reset complet (tests).
   */
  resetAll(): void {
    this.statsCache = new Map();
    this.deadCache = new Map();
    try {
      localStorage.removeItem(STORAGE_STATS);
      localStorage.removeItem(STORAGE_DEAD);
    } catch {
      /* ignore */
    }
    this.lastAllDeadNotifTs = 0;
  }

  /**
   * Force re-charge depuis localStorage (cross-tab sync, tests).
   */
  reloadFromStorage(): void {
    this.statsCache = null;
    this.deadCache = null;
    this.loadStats();
    this.loadDead();
  }

  /**
   * Indique si un provider est marqué DEAD.
   */
  isProviderDead(service: string): boolean {
    const until = this.getDeadUntil(service);
    return until > Date.now();
  }

  /**
   * Lit le DEAD timer pour un service.
   *
   * Note : on lit DIRECTEMENT localStorage à chaque appel (pas de cache mémoire qui
   * pourrait être stale entre tests via setup.ts beforeEach). Le coût est négligeable
   * (1 getItem + 1 JSON.parse de quelques bytes) et garantit la cohérence test/prod.
   */
  getDeadUntil(service: string): number {
    try {
      const raw = localStorage.getItem(STORAGE_DEAD);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const v = parsed[service];
      return typeof v === 'number' && v > Date.now() ? v : 0;
    } catch {
      return 0;
    }
  }

  /* === Internals === */

  private async pickAliveFallback(failedService: string): Promise<string | null> {
    /* Préfère ordre policy, mais filtre DEAD + sans clés. */
    for (const p of DEFAULT_FALLBACK_CHAIN) {
      const svc = providerToVaultService(p);
      if (svc === failedService) continue;
      if (this.isProviderDead(svc)) continue;
      const key = await multiKeyVault.getCurrentKey(svc);
      if (key) return svc;
    }
    return null;
  }

  private notifyAllProvidersDead(): void {
    const now = Date.now();
    if (now - this.lastAllDeadNotifTs < 10 * 60 * 1000) return; /* anti-spam */
    this.lastAllDeadNotifTs = now;
    void auditLog.record('ai.all_providers_dead', {
      details: {
        ts: now,
        services_dead: Array.from((this.deadCache ?? new Map()).entries())
          .filter(([, until]) => until > now)
          .map(([svc]) => svc),
      },
    });
    logger.error('ai-key-rotation', '🚨 TOUS providers IA DEAD ou sans clés — recharge nécessaire');
    /* Best-effort toast UI (non bloquant si module absent en SSR / tests).
       toast.show(text, 'warn') ou toast.error/info — l'API selon ui/toast.ts. */
    const msg = this.allDeadDiagnosticMessage();
    try {
      void import('../../ui/toast.js').then((mod) => {
        const t = (mod as { toast?: { show?: (msg: string, level?: string) => void; error?: (msg: string) => void } }).toast;
        if (t?.show) t.show(msg, 'error');
        else t?.error?.(msg);
      }).catch(() => { /* ignore */ });
    } catch {
      /* ignore */
    }
    /* v13.4.321 — si l'IA est KO faute de code admin en mémoire (proxy) → proposer
     * l'activation 1-tap (taper le code une fois, sans déconnexion). Self-gated :
     * promptProxyPinActivation ne s'affiche QUE si needsProxyPinActivation. */
    void import('../auth/proxy-pin-activation.js')
      .then((m) => m.promptProxyPinActivation())
      .catch(() => { /* ignore */ });
  }

  /**
   * v13.4.320 (Kevin « toujours détailler la cause exacte ») — message « IA KO »
   * PRÉCIS selon l'état réel, pas le générique « recharge tes clés » :
   *  - proxy activé + code admin PAS en mémoire → l'auth proxy est impossible →
   *    dire à Kevin de se reconnecter avec son code (cas exact 2026-06-08).
   *  - aucune clé locale + proxy off → coller une clé dans le Coffre.
   *  - sinon → clés (serveur/Coffre) probablement expirées.
   */
  private allDeadDiagnosticMessage(): string {
    try {
      const ls = (k: string): string => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
      const proxyFlag = ls('apex_v13_use_secrets_proxy');
      return allDeadMessage({
        proxyOn: proxyFlag === 'true' || proxyFlag === '1',
        pinStored: !!(ls('ax_pin_kdmc_admin') || ls('ax_pin')),
        hasLocalKey: ['anthropic', 'openai', 'openrouter', 'groq', 'google', 'mistral', 'deepseek', 'xai', 'cohere']
          .some((p) => ls('ax_' + p + '_key').length > 0),
      });
    } catch {
      return '🚨 Toutes les IA sont KO. Recharge tes clés (Coffre).';
    }
  }

  private markProviderDead(service: string, ttlMs: number): void {
    this.loadDead();
    if (!this.deadCache) this.deadCache = new Map();
    this.deadCache.set(service, Date.now() + ttlMs);
    this.persistDead();
  }

  private clearDead(service: string): void {
    this.loadDead();
    this.deadCache?.delete(service);
    this.persistDead();
  }

  /** Efface TOUS les DEAD (récupération immédiate). Appelé au retour réseau (online). */
  clearAllDead(): void {
    this.loadDead();
    if (this.deadCache && this.deadCache.size > 0) {
      const n = this.deadCache.size;
      this.deadCache.clear();
      this.persistDead();
      logger.info('ai-key-rotation', `${n} provider(s) DEAD effacé(s) (réseau revenu)`);
    }
  }

  private recordFail(service: string, classification: FailClassification, reason: string): void {
    const stats = this.getOrCreateStats(service);
    stats.total_calls += 1;
    stats.fail_count += 1;
    stats.last_fail_ts = Date.now();
    stats.last_fail_classification = classification;
    /* Tronque pour éviter de stocker secrets éventuels dans logs */
    stats.last_fail_reason = reason.slice(0, 200);
    this.persistStats();
  }

  private getOrCreateStats(service: string): ProviderStats {
    this.loadStats();
    if (!this.statsCache) this.statsCache = new Map();
    let s = this.statsCache.get(service);
    if (!s) {
      s = {
        provider: service,
        total_calls: 0,
        success_count: 0,
        fail_count: 0,
        avg_latency_ms: 0,
        last_success_ts: 0,
        last_fail_ts: 0,
        dead_until_ts: 0,
      };
      this.statsCache.set(service, s);
    }
    return s;
  }

  private loadStats(): void {
    if (this.statsCache !== null) return;
    this.statsCache = new Map();
    try {
      const raw = localStorage.getItem(STORAGE_STATS);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (
          item &&
          typeof item === 'object' &&
          'provider' in item &&
          typeof (item as { provider: unknown }).provider === 'string'
        ) {
          const s = item as ProviderStats;
          this.statsCache.set(s.provider, s);
        }
      }
    } catch (err: unknown) {
      logger.warn('ai-key-rotation', 'loadStats parse failed', { err });
    }
  }

  private persistStats(): void {
    try {
      const arr = Array.from((this.statsCache ?? new Map()).values());
      localStorage.setItem(STORAGE_STATS, JSON.stringify(arr));
    } catch (err: unknown) {
      logger.warn('ai-key-rotation', 'persistStats failed', { err });
    }
  }

  private loadDead(): void {
    if (this.deadCache !== null) return;
    this.deadCache = new Map();
    try {
      const raw = localStorage.getItem(STORAGE_DEAD);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return;
      const now = Date.now();
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'number' && v > now) {
          this.deadCache.set(k, v);
        }
      }
    } catch (err: unknown) {
      logger.warn('ai-key-rotation', 'loadDead parse failed', { err });
    }
  }

  private persistDead(): void {
    try {
      const obj: Record<string, number> = {};
      for (const [k, v] of (this.deadCache ?? new Map())) obj[k] = v;
      localStorage.setItem(STORAGE_DEAD, JSON.stringify(obj));
    } catch (err: unknown) {
      logger.warn('ai-key-rotation', 'persistDead failed', { err });
    }
  }
}

export const aiKeyRotation = new AIKeyRotation();

/* Re-export utility for callers needing the underlying KeyEntry */
export type { KeyEntry };
