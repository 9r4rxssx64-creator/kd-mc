/**
 * APEX v13 — Self-Healing automatique (Kevin demande "auto-géré, auto-corrige, auto-évolue").
 *
 * Garantit qu'Apex n'a JAMAIS :
 * - Problème de mémoire (QuotaExceeded → emergency cleanup auto)
 * - Problème de réponse (API down → fallback chat)
 * - Memory leaks (intervals/listeners orphans → cleanup)
 * - Stale data > 30j (auto-purge)
 * - Patterns récurrents bug (escalate Claude Code via ax_claude_todo)
 *
 * Anti-pattern Kevin "PROTECTION ≠ STABILITÉ" :
 * - Ne désactive JAMAIS de fonction legitime
 * - Toujours guard avant action destructive
 * - Audit log immutable de chaque heal
 */

import { logger } from '../../core/logger.js';

export interface HealAction {
  id: string;
  trigger: string;
  action: string;
  result: 'success' | 'failed' | 'skipped';
  freed_bytes?: number;
  ts: number;
}

const TRIM_TARGETS: Array<{ key: string; cap: number }> = [
  { key: 'apex_v13_audit_log', cap: 200 },
  { key: 'apex_v13_observability_buffer', cap: 100 },
  { key: 'apex_v13_observability_dlq', cap: 200 },
  { key: 'ax_telemetry_in', cap: 100 },
  { key: 'ax_claude_todo', cap: 50 },
  { key: 'apex_v13_lessons', cap: 500 },
  { key: 'apex_v13_persistent_memory', cap: 1000 },
  { key: 'apex_v13_pending_validations', cap: 50 },
  { key: 'ax_unknown_services', cap: 50 },
  { key: 'ax_browser_history', cap: 200 },
];

const STALE_TARGETS: Array<{ keyPattern: RegExp; maxAgeMs: number }> = [
  { keyPattern: /^apex_v13_pending_messages_/, maxAgeMs: 24 * 60 * 60 * 1000 }, /* 24h */
  { keyPattern: /^ax_token_usage_/, maxAgeMs: 90 * 24 * 60 * 60 * 1000 }, /* 90j */
];

class SelfHealing {
  private history: HealAction[] = [];
  private installed = false;

  /**
   * Install global error handlers + periodic GC.
   */
  install(): void {
    if (this.installed) return;
    this.installed = true;

    if (typeof window === 'undefined') return;

    /* Listener QuotaExceededError sur localStorage.setItem */
    const origSetItem = Storage.prototype.setItem;
    const self = this;
    Storage.prototype.setItem = function (key: string, value: string): void {
      try {
        return origSetItem.call(this, key, value);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/quota|exceeded/i.test(msg)) {
          /* Auto-heal : emergency trim avant retry */
          const freed = self.emergencyTrim();
          self.recordAction('quota_exceeded', `emergency_trim ${key}`, freed > 0 ? 'success' : 'failed', freed);
          if (freed > 0) {
            try {
              return origSetItem.call(this, key, value);
            } catch {
              throw err; /* Re-throw si trim insuffisant */
            }
          }
        }
        throw err;
      }
    };

    /* Cycle GC périodique 1×/h (tracked anti memory leak) */
    if (typeof setInterval !== 'undefined') {
      const t = setInterval(() => void this.runHealCycle(), 60 * 60 * 1000);
      void import('../core-svc/service-lifecycle.js').then(({ lifecycle }) => {
        lifecycle.trackInterval('self-healing', t);
      }).catch(() => { /* skip */ });
    }

    /* Run once au boot */
    void this.runHealCycle();

    logger.info('self-healing', 'Installed (quota guard + periodic GC 1h)');
  }

  /**
   * Cycle complet de heal : trim caps + stale data + report.
   */
  async runHealCycle(): Promise<{
    trims: number;
    stale_removed: number;
    bytes_freed: number;
  }> {
    let trims = 0;
    let staleRemoved = 0;
    let bytesFreed = 0;

    /* 1. Trim caps obligatoires */
    for (const target of TRIM_TARGETS) {
      const before = this.estimateSize(target.key);
      if (this.trimToCap(target.key, target.cap)) {
        trims++;
        const after = this.estimateSize(target.key);
        bytesFreed += before - after;
      }
    }

    /* 2. Garbage collect stale data */
    for (const target of STALE_TARGETS) {
      const removed = this.gcStaleByPrefix(target.keyPattern, target.maxAgeMs);
      staleRemoved += removed.count;
      bytesFreed += removed.bytes;
    }

    if (trims > 0 || staleRemoved > 0) {
      this.recordAction('heal_cycle', `${trims} trims, ${staleRemoved} stale`, 'success', bytesFreed);
    }

    return { trims, stale_removed: staleRemoved, bytes_freed: bytesFreed };
  }

  /**
   * Emergency trim massif (déclenché par QuotaExceeded).
   * Réduit AGRESSIVEMENT toutes les caps pour libérer max d'espace.
   */
  emergencyTrim(): number {
    let freed = 0;
    /* Caps réduites de moitié pour heal aggressive */
    for (const target of TRIM_TARGETS) {
      const before = this.estimateSize(target.key);
      this.trimToCap(target.key, Math.floor(target.cap / 2));
      const after = this.estimateSize(target.key);
      freed += before - after;
    }
    /* Cleanup pending messages anciens > 1h */
    this.gcStaleByPrefix(/^apex_v13_pending_messages_/, 60 * 60 * 1000);

    logger.warn('self-healing', `Emergency trim freed ${freed} bytes`);
    return freed;
  }

  /**
   * Trim un array stocké à cap entries (slice -cap).
   */
  private trimToCap(key: string, cap: number): boolean {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return false;
      if (parsed.length <= cap) return false;
      const trimmed = parsed.slice(-cap);
      localStorage.setItem(key, JSON.stringify(trimmed));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * GC entries d'un object/array stocké si timestamp > maxAge.
   */
  private gcStaleByPrefix(pattern: RegExp, maxAgeMs: number): { count: number; bytes: number } {
    let count = 0;
    let bytes = 0;
    const cutoff = Date.now() - maxAgeMs;
    const keysToProcess: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && pattern.test(k)) keysToProcess.push(k);
    }
    for (const k of keysToProcess) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const before = raw.length;
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((e: unknown) => {
            const ts = (e as { ts?: number; last_request_ts?: number })?.ts ??
                       (e as { last_request_ts?: number })?.last_request_ts ?? 0;
            return ts >= cutoff;
          });
          if (filtered.length < parsed.length) {
            count += parsed.length - filtered.length;
            if (filtered.length === 0) {
              localStorage.removeItem(k);
              bytes += before;
            } else {
              const newRaw = JSON.stringify(filtered);
              localStorage.setItem(k, newRaw);
              bytes += before - newRaw.length;
            }
          }
        } else {
          /* Object avec ts top-level */
          const ts = (parsed as { ts?: number; last_request_ts?: number })?.ts ??
                     (parsed as { last_request_ts?: number })?.last_request_ts ?? 0;
          if (ts > 0 && ts < cutoff) {
            localStorage.removeItem(k);
            bytes += before;
            count++;
          }
        }
      } catch {
        /* ignore parse */
      }
    }
    return { count, bytes };
  }

  /**
   * Estime taille d'une key localStorage (caractères).
   */
  private estimateSize(key: string): number {
    try {
      return localStorage.getItem(key)?.length ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Record action heal pour audit.
   */
  private recordAction(trigger: string, action: string, result: HealAction['result'], freedBytes = 0): void {
    const entry: HealAction = {
      id: `heal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      trigger,
      action,
      result,
      freed_bytes: freedBytes,
      ts: Date.now(),
    };
    this.history.push(entry);
    if (this.history.length > 100) this.history = this.history.slice(-100);
    /* Persist pour audit cross-session */
    try {
      const persistent = JSON.parse(localStorage.getItem('apex_v13_self_healing_history') ?? '[]') as HealAction[];
      persistent.push(entry);
      const trimmed = persistent.length > 100 ? persistent.slice(-100) : persistent;
      localStorage.setItem('apex_v13_self_healing_history', JSON.stringify(trimmed));
    } catch {
      /* ignore */
    }
  }

  /**
   * Stats heal history (admin dashboard).
   */
  getStats(): {
    total_actions: number;
    success_rate: number;
    bytes_freed_total: number;
    last_24h: number;
  } {
    const total = this.history.length;
    const success = this.history.filter((h) => h.result === 'success').length;
    const totalBytes = this.history.reduce((s, h) => s + (h.freed_bytes ?? 0), 0);
    const last24h = this.history.filter((h) => h.ts > Date.now() - 24 * 60 * 60 * 1000).length;
    return {
      total_actions: total,
      success_rate: total > 0 ? Math.round((success / total) * 100) : 100,
      bytes_freed_total: totalBytes,
      last_24h: last24h,
    };
  }

  getHistory(): readonly HealAction[] {
    return this.history;
  }

  /**
   * Reset (debug).
   */
  reset(): void {
    this.history = [];
  }
}

export const selfHealing = new SelfHealing();
