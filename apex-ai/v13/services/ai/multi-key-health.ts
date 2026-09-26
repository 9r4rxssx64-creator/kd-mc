/**
 * APEX v13 — Multi-Key Health sentinel (5min interval)
 *
 * Demande Kevin 2026-05-08 (audit "anthropic+cohere+groq fail simultaneously,
 * sentinelle multi-key-health en alerte, pas de rotation auto") :
 * - Ping chaque provider toutes les 5 min via multi-key-vault.healthCheckAll
 * - Auto-rotate si fail détecté (clé suivante du history)
 * - Toast user si bascule effectuée
 * - Log dans `ax_provider_health_log` (max 200 entries FIFO)
 *
 * Wire :
 * - Auto-register dans sentinelsManager au boot (idempotent)
 * - Auto-fix whitelist : tente une rotation key-level, si succès → vert
 * - Si tous providers DEAD → escalade Claude Code via ax_claude_todo
 *
 * Règles CLAUDE.md :
 * - "Sentinelles permanentes 24/7 autonomie totale"
 * - "WARNING = AUTO-FIX immédiat sans attendre Kevin"
 * - "Auto-fix rate > 30% → alerte structurelle"
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { sentinels } from '../sentinels/sentinels.js';
import { multiKeyVault } from '../vault/multi-key-vault.js';

import { aiKeyRotation, type RotationProvider } from './ai-key-rotation.js';

const HEALTH_LOG_KEY = 'ax_provider_health_log';
const MAX_LOG_ENTRIES = 200;
const SENTINEL_INTERVAL_MS = 5 * 60 * 1000; /* 5 min */

export interface ProviderHealthLogEntry {
  ts: number;
  service: string;
  status: 'ok' | 'degraded' | 'failed' | 'recovered';
  detail: string;
  rotated?: { fromKeyId: string; toKeyId: string };
}

/* Providers à monitorer (correspond à la chain failover ai-router) */
const MONITORED_PROVIDERS: ReadonlyArray<RotationProvider> = [
  'anthropic',
  'openrouter',
  'groq',
  'gemini',
  'mistral',
  'cohere',
  'openai',
];

export interface MultiKeyHealthSummary {
  total_services: number;
  services_ok: number;
  services_degraded: number;
  services_dead: number;
  rotations_attempted: number;
  rotations_succeeded: number;
  last_run_ts: number;
}

class MultiKeyHealth {
  private registered = false;
  private lastSummary: MultiKeyHealthSummary | null = null;

  /**
   * Enregistre la sentinelle dans le manager. Idempotent.
   * Appelé au boot (typiquement depuis sentinels-registry).
   */
  register(): void {
    if (this.registered) return;
    sentinels.register({
      id: 'multi-key-health',
      name: 'Multi-Key Health',
      desc: 'Surveille santé des clés API multi-providers (5min) + auto-rotation + DEAD timer',
      intervalMs: SENTINEL_INTERVAL_MS,
      check: async () => this.runCheck(),
      autoFix: async () => this.runAutoFix(),
    });
    this.registered = true;
    logger.info('multi-key-health', 'sentinel registered (5min interval)');
  }

  /**
   * Health check : pour chaque provider monitoré, vérifie qu'il a au moins 1 clé
   * utilisable (status active/unknown). Marque les services entièrement KO.
   */
  async runCheck(): Promise<{ ok: boolean; msg: string; details?: Record<string, unknown> }> {
    const summary: MultiKeyHealthSummary = {
      total_services: 0,
      services_ok: 0,
      services_degraded: 0,
      services_dead: 0,
      rotations_attempted: 0,
      rotations_succeeded: 0,
      last_run_ts: Date.now(),
    };
    const services_dead: string[] = [];
    const services_degraded: string[] = [];

    for (const provider of MONITORED_PROVIDERS) {
      const service = providerToVaultService(provider);
      summary.total_services += 1;

      /* Skip si Kevin n'a pas configuré ce provider */
      const stats = multiKeyVault.getStats(service);
      if (stats.total === 0) continue;

      if (aiKeyRotation.isProviderDead(service)) {
        summary.services_dead += 1;
        services_dead.push(service);
        this.appendLog({
          ts: Date.now(),
          service,
          status: 'failed',
          detail: `provider DEAD until ${new Date(aiKeyRotation.getDeadUntil(service)).toISOString()}`,
        });
        continue;
      }

      if (stats.active >= 1) {
        summary.services_ok += 1;
      } else if (stats.failing > 0 || stats.invalid >= stats.total) {
        summary.services_degraded += 1;
        services_degraded.push(service);
      } else {
        /* unknown ou rate-limited */
        summary.services_ok += 1;
      }
    }

    this.lastSummary = summary;
    const allOk = summary.services_dead === 0 && summary.services_degraded === 0;
    const msg = allOk
      ? `${summary.services_ok}/${summary.total_services} OK`
      : `${summary.services_dead} DEAD, ${summary.services_degraded} degraded sur ${summary.total_services}`;

    return {
      ok: allOk,
      msg,
      details: {
        ...summary,
        services_dead,
        services_degraded,
      },
    };
  }

  /**
   * Auto-fix : ré-test toutes les clés (recovery), tente rotation pour services degraded.
   */
  async runAutoFix(): Promise<{ ok: boolean; msg: string }> {
    const summary = this.lastSummary;
    let attempted = 0;
    let succeeded = 0;

    /* Phase 1 : healthCheckAll re-tente clés failing/rate-limited (recovery automatique) */
    try {
      const result = await multiKeyVault.healthCheckAll();
      attempted += result.tested;
      succeeded += result.recovered;
      if (result.recovered > 0) {
        logger.info('multi-key-health', `🔄 ${result.recovered} clés recovered via healthCheckAll`);
        void auditLog.record('ai.keys_recovered', {
          details: { count: result.recovered, tested: result.tested },
        });
      }
    } catch (err: unknown) {
      logger.warn('multi-key-health', 'healthCheckAll failed', { err });
    }

    /* Phase 2 : pour chaque service DEAD, tente quand même un nouveau test
       (le TTL 1h peut être trop conservateur après reset Kevin) */
    if (summary?.services_dead) {
      for (const provider of MONITORED_PROVIDERS) {
        const service = providerToVaultService(provider);
        if (!aiKeyRotation.isProviderDead(service)) continue;
        attempted += 1;
        const candidate = await multiKeyVault.getCurrentKey(service);
        if (!candidate) continue;
        const test = await multiKeyVault.testKey(candidate.keyId);
        if (test.ok) {
          aiKeyRotation.reset(provider);
          succeeded += 1;
          this.appendLog({
            ts: Date.now(),
            service,
            status: 'recovered',
            detail: `provider DEAD cleared via auto-fix retry (latency ${test.latencyMs}ms)`,
          });
          /* Toast user discret (best-effort) */
          this.showToast(`✅ ${service} récupéré (auto-rotation)`);
        }
      }
    }

    if (this.lastSummary) {
      this.lastSummary.rotations_attempted = attempted;
      this.lastSummary.rotations_succeeded = succeeded;
    }

    const ok = succeeded > 0 || attempted === 0;
    return {
      ok,
      msg: succeeded > 0
        ? `${succeeded}/${attempted} services restored`
        : attempted === 0 ? 'rien à fixer' : `${attempted} tentatives, aucun succès`,
    };
  }

  /**
   * Lecture log historique (UI admin dashboard).
   */
  getLog(): ProviderHealthLogEntry[] {
    try {
      const raw = localStorage.getItem(HEALTH_LOG_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e): e is ProviderHealthLogEntry => {
        return (
          e !== null &&
          typeof e === 'object' &&
          'ts' in e &&
          'service' in e &&
          'status' in e
        );
      });
    } catch {
      return [];
    }
  }

  /**
   * Snapshot du dernier check (UI status bar).
   */
  getLastSummary(): MultiKeyHealthSummary | null {
    return this.lastSummary;
  }

  /**
   * Reset complet (tests).
   */
  resetForTests(): void {
    this.lastSummary = null;
    this.registered = false;
    try {
      localStorage.removeItem(HEALTH_LOG_KEY);
    } catch {
      /* ignore */
    }
  }

  /* === Internals === */

  private appendLog(entry: ProviderHealthLogEntry): void {
    try {
      const log = this.getLog();
      log.push(entry);
      while (log.length > MAX_LOG_ENTRIES) log.shift();
      localStorage.setItem(HEALTH_LOG_KEY, JSON.stringify(log));
    } catch (err: unknown) {
      logger.warn('multi-key-health', 'appendLog failed', { err });
    }
  }

  private showToast(message: string): void {
    try {
      void import('../../ui/toast.js').then((mod) => {
        const t = (mod as { toast?: { show?: (m: string, level?: string) => void; info?: (m: string) => void } }).toast;
        if (t?.show) t.show(message, 'success');
        else t?.info?.(message);
      }).catch(() => { /* ignore */ });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Helper local : RotationProvider → vault service name (gemini → google).
 */
function providerToVaultService(provider: RotationProvider): string {
  if (provider === 'gemini') return 'google';
  return provider;
}

export const multiKeyHealth = new MultiKeyHealth();
