/**
 * APEX v13 — AI Unblock Watch (Sprint 13.3.71 Kevin règle absolue
 * "ANTI-BLOCAGE IA, AUTO-DÉBLOCAGE TOTAL" 2026-04-26)
 *
 * Sentinelle 5 min : detect provider IA en panne AVANT que Kevin tape un message.
 *
 * Détection :
 * - HTTP 401 (auth fail) → clé invalide / révoquée
 * - HTTP 402 (payment required) → quota épuisé / facturation
 * - HTTP 429 (rate-limit) → throttle temporaire
 * - HTTP 5xx (server) → indispo
 * - Network err (DNS / timeout / CORS) → réseau coupé
 *
 * Auto-déblocage :
 * - 2 fails consécutifs → bascule failover préemptif vers next provider sain
 * - Auto-rotate via multi-key-vault.history (autre clé du même service si dispo)
 * - Toast user : "🔧 Anthropic KO, je passe sur Gemini"
 * - Log dans `ax_provider_health` (max 200 entries, FIFO)
 *
 * Règle Kevin : "Apex doit s'auto-débloquer en autonomie totale, JAMAIS user bloqué."
 */

import { logger } from '../../core/logger.js';

export type UnblockProviderId = 'anthropic' | 'openrouter' | 'groq' | 'gemini';

export type UnblockReason =
  | 'auth_fail'      /* 401 */
  | 'quota'          /* 402 */
  | 'rate_limit'     /* 429 */
  | 'server_error'   /* 5xx */
  | 'network'        /* fetch failed / timeout */
  | 'ok';

export interface ProviderProbeResult {
  provider: UnblockProviderId;
  ok: boolean;
  status: number;
  reason: UnblockReason;
  latency_ms: number;
  ts: number;
  error?: string;
}

export interface UnblockHealthEntry {
  provider: UnblockProviderId;
  reason: UnblockReason;
  status: number;
  ts: number;
  consecutive_failures: number;
  failover_triggered?: boolean;
  rotated_key?: boolean;
  message?: string;
}

interface ProviderState {
  provider: UnblockProviderId;
  consecutive_failures: number;
  last_reason: UnblockReason;
  last_check_ts: number;
  failover_active: boolean;
}

const HEALTH_LOG_KEY = 'ax_provider_health';
const HEALTH_LOG_CAP = 200;
const FAILOVER_THRESHOLD = 2; /* 2 fails consécutifs → failover */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Endpoints "preflight light" : OPTIONS / GET minimal.
 * Pour Anthropic : POST /v1/messages avec 1 token max → on lit le HTTP status uniquement.
 * Codes considérés comme "service vivant" : 200, 400 (request mal formée mais serveur up), 405.
 */
const PROBE_ENDPOINTS: Record<UnblockProviderId, { url: string; method: 'OPTIONS' | 'GET' | 'POST'; needsAuth: boolean }> = {
  anthropic: { url: 'https://api.anthropic.com/v1/messages', method: 'OPTIONS', needsAuth: false },
  openrouter: { url: 'https://openrouter.ai/api/v1/models', method: 'GET', needsAuth: false },
  groq: { url: 'https://api.groq.com/openai/v1/models', method: 'GET', needsAuth: false },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models', method: 'GET', needsAuth: false },
};

const PROVIDER_LIST: readonly UnblockProviderId[] = ['anthropic', 'openrouter', 'groq', 'gemini'];

/**
 * Mapping clé Coffre par provider (utilisé pour auto-rotate via multi-key-vault).
 */
const PROVIDER_KEY_MAP: Record<UnblockProviderId, string> = {
  anthropic: 'ax_anthropic_key',
  openrouter: 'ax_openrouter_key',
  groq: 'ax_groq_key',
  gemini: 'ax_gemini_key',
};

class AIUnblockWatch {
  private state = new Map<UnblockProviderId, ProviderState>();

  constructor() {
    for (const p of PROVIDER_LIST) {
      this.state.set(p, {
        provider: p,
        consecutive_failures: 0,
        last_reason: 'ok',
        last_check_ts: 0,
        failover_active: false,
      });
    }
  }

  /**
   * Détecte le motif de panne depuis un HTTP status code + erreur réseau.
   */
  classifyHttpStatus(status: number): UnblockReason {
    if (status === 401) return 'auth_fail';
    if (status === 402) return 'quota';
    if (status === 429) return 'rate_limit';
    if (status >= 500 && status < 600) return 'server_error';
    if (status === 0) return 'network';
    /* 200/204/400/403/404/405 = service vivant */
    return 'ok';
  }

  /**
   * Ping un provider (timeout 5s). Retourne ProviderProbeResult.
   */
  async probeProvider(provider: UnblockProviderId): Promise<ProviderProbeResult> {
    const cfg = PROBE_ENDPOINTS[provider];
    const start = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(cfg.url, {
        method: cfg.method,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const latency = Date.now() - start;
      const reason = this.classifyHttpStatus(res.status);
      return {
        provider,
        ok: reason === 'ok',
        status: res.status,
        reason,
        latency_ms: latency,
        ts: Date.now(),
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const latency = Date.now() - start;
      const e = err instanceof Error ? err : new Error(String(err));
      const errorMsg = e.name === 'AbortError' ? 'timeout' : e.message;
      return {
        provider,
        ok: false,
        status: 0,
        reason: 'network',
        latency_ms: latency,
        ts: Date.now(),
        error: errorMsg,
      };
    }
  }

  /**
   * Run sentinelle 1×: ping tous providers + applique failover si seuil atteint.
   * Retourne summary { downCount, recoveredCount, failoverTriggered }.
   */
  async runOnce(): Promise<{
    probes: ProviderProbeResult[];
    failoverTriggered: UnblockProviderId[];
    rotatedKeys: UnblockProviderId[];
    healthyProviders: UnblockProviderId[];
  }> {
    const probes = await Promise.all(PROVIDER_LIST.map((p) => this.probeProvider(p)));
    const failoverTriggered: UnblockProviderId[] = [];
    const rotatedKeys: UnblockProviderId[] = [];
    const healthyProviders: UnblockProviderId[] = [];

    for (const probe of probes) {
      const st = this.state.get(probe.provider);
      if (!st) continue;
      st.last_check_ts = probe.ts;
      st.last_reason = probe.reason;

      if (probe.ok) {
        /* Reset failures on success */
        if (st.consecutive_failures > 0 || st.failover_active) {
          this.recordHealth({
            provider: probe.provider,
            reason: 'ok',
            status: probe.status,
            ts: probe.ts,
            consecutive_failures: 0,
            message: `recovered after ${st.consecutive_failures} failure(s)`,
          });
        }
        st.consecutive_failures = 0;
        st.failover_active = false;
        healthyProviders.push(probe.provider);
        continue;
      }

      /* Fail */
      st.consecutive_failures += 1;
      const entry: UnblockHealthEntry = {
        provider: probe.provider,
        reason: probe.reason,
        status: probe.status,
        ts: probe.ts,
        consecutive_failures: st.consecutive_failures,
      };

      if (st.consecutive_failures >= FAILOVER_THRESHOLD && !st.failover_active) {
        st.failover_active = true;
        failoverTriggered.push(probe.provider);
        entry.failover_triggered = true;

        /* Auto-rotate clé depuis history (auth_fail / quota uniquement) */
        if (probe.reason === 'auth_fail' || probe.reason === 'quota') {
          const rotated = await this.tryRotateKey(probe.provider);
          if (rotated) {
            entry.rotated_key = true;
            rotatedKeys.push(probe.provider);
          }
        }

        /* Toast user */
        const fallback = this.pickFallbackProvider(probe.provider);
        const msg = fallback
          ? `🔧 ${this.providerLabel(probe.provider)} ${this.reasonLabel(probe.reason)}, je passe sur ${this.providerLabel(fallback)}`
          : `🔧 ${this.providerLabel(probe.provider)} ${this.reasonLabel(probe.reason)}`;
        entry.message = msg;
        this.notifyToast(msg);
      }

      this.recordHealth(entry);
    }

    return { probes, failoverTriggered, rotatedKeys, healthyProviders };
  }

  /**
   * Snapshot état runtime (lecture seule). Utile pour UI dashboard.
   */
  getState(): readonly ProviderState[] {
    return Array.from(this.state.values()).map((s) => ({ ...s }));
  }

  /**
   * Lecture log santé providers (FIFO, cap 200).
   */
  getHealthLog(): readonly UnblockHealthEntry[] {
    try {
      const raw = localStorage.getItem(HEALTH_LOG_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as UnblockHealthEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Reset complet (pour tests + admin "Réinitialiser santé providers").
   */
  reset(): void {
    for (const p of PROVIDER_LIST) {
      this.state.set(p, {
        provider: p,
        consecutive_failures: 0,
        last_reason: 'ok',
        last_check_ts: 0,
        failover_active: false,
      });
    }
    try {
      localStorage.removeItem(HEALTH_LOG_KEY);
    } catch {
      /* skip */
    }
  }

  /**
   * Détermine fallback à proposer si provider courant est KO.
   * Pondération simple : ordre fixe ou state non-failover.
   */
  pickFallbackProvider(failed: UnblockProviderId): UnblockProviderId | null {
    for (const p of PROVIDER_LIST) {
      if (p === failed) continue;
      const st = this.state.get(p);
      if (st && !st.failover_active && st.consecutive_failures < FAILOVER_THRESHOLD) {
        return p;
      }
    }
    return null;
  }

  /* === Internals === */

  private recordHealth(entry: UnblockHealthEntry): void {
    try {
      const raw = localStorage.getItem(HEALTH_LOG_KEY);
      const list = raw ? (JSON.parse(raw) as UnblockHealthEntry[]) : [];
      list.push(entry);
      const trimmed = list.slice(-HEALTH_LOG_CAP);
      localStorage.setItem(HEALTH_LOG_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('ai-unblock-watch', 'health log persist failed', { err });
    }
  }

  private async tryRotateKey(provider: UnblockProviderId): Promise<boolean> {
    const keyName = PROVIDER_KEY_MAP[provider];
    try {
      const mod = await import('../vault/multi-key-vault.js');
      const vault = mod.multiKeyVault;
      if (!vault || typeof vault !== 'object') return false;
      /* multi-key-vault expose listKeys(service) ; on cherche une autre active */
      const v = vault as unknown as {
        listKeys?: (service: string) => Array<{ id: string; status: string }>;
        markFailing?: (id: string) => void;
      };
      if (typeof v.listKeys !== 'function') return false;
      const keys = v.listKeys(keyName);
      if (!Array.isArray(keys) || keys.length < 2) return false;
      /* S'il existe une 2ème clé "active" → la précédente est marquée failing
       * (le routeur IA picking the next active key automatically) */
      const failing = keys.find((k) => k.status === 'active');
      if (failing && typeof v.markFailing === 'function') {
        v.markFailing(failing.id);
        logger.info('ai-unblock-watch', `key rotated for ${provider}`, { id: failing.id });
        return true;
      }
      return false;
    } catch (err: unknown) {
      logger.warn('ai-unblock-watch', 'rotate key failed', { provider, err });
      return false;
    }
  }

  private notifyToast(msg: string): void {
    try {
      const w = globalThis as unknown as {
        toast?: (m: string, kind?: string) => void;
        ApexToast?: { info?: (m: string) => void };
      };
      if (typeof w.toast === 'function') {
        w.toast(msg, 'info');
        return;
      }
      if (w.ApexToast && typeof w.ApexToast.info === 'function') {
        w.ApexToast.info(msg);
      }
    } catch {
      /* skip */
    }
  }

  private providerLabel(p: UnblockProviderId): string {
    switch (p) {
      case 'anthropic':
        return 'Anthropic';
      case 'openrouter':
        return 'OpenRouter';
      case 'groq':
        return 'Groq';
      case 'gemini':
        return 'Gemini';
    }
  }

  private reasonLabel(r: UnblockReason): string {
    switch (r) {
      case 'auth_fail':
        return 'auth invalide';
      case 'quota':
        return 'quota épuisé';
      case 'rate_limit':
        return 'rate-limit atteint';
      case 'server_error':
        return 'serveur KO';
      case 'network':
        return 'réseau coupé';
      case 'ok':
        return 'OK';
    }
  }
}

export const aiUnblockWatch = new AIUnblockWatch();
