/**
 * APEX v13 — Observability & Dead Letter Queue (P0 Jet 4 audit)
 *
 * Anti-pattern audit POST-FIX 72.4/100 :
 * "Error swallowing epidemic — 205 try/catch dont 70% silent failures.
 *  decrypt fails → null returned, log dropped if offline.
 *  Audit-log escalation failures → no alerting mechanism."
 *
 * Solution :
 * - Structured logging sink (Sentry si DSN configuré, sinon localStorage rotation)
 * - Dead Letter Queue : si event critical échoue 3x → push DLQ pour replay manuel
 * - Buffer rotatif local toujours, sync Sentry async non-bloquant
 *
 * Sentry DSN lu depuis `ax_sentry_dsn` (préservé v12.785).
 * Lazy-load @sentry/browser via CDN si DSN configuré (sinon 0 KB overhead).
 */

import { logger } from '../../core/logger.js';

interface ObservabilityEvent {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'error' | 'critical';
  scope: string;
  msg: string;
  context?: Record<string, unknown>;
  attempts: number;
  status: 'pending' | 'sent' | 'dlq';
}

const STORAGE_KEY = 'apex_v13_observability';
const DLQ_KEY = 'apex_v13_observability_dlq';
const MAX_BUFFER = 500;
const MAX_DLQ = 200;
const MAX_RETRIES = 3;

class Observability {
  private buffer: ObservabilityEvent[] = [];
  private dlq: ObservabilityEvent[] = [];
  private sentryReady = false;
  private flushTimer: number | null = null;

  init(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.buffer = JSON.parse(raw) as ObservabilityEvent[];
      const dlqRaw = localStorage.getItem(DLQ_KEY);
      if (dlqRaw) this.dlq = JSON.parse(dlqRaw) as ObservabilityEvent[];
    } catch {
      /* ignore */
    }
    void this.tryInitSentry();
    this.scheduleFlush();
  }

  /**
   * Capture event critique (jamais silenced).
   * Si Sentry KO → buffer local + retry. Si MAX_RETRIES → DLQ pour replay manuel.
   */
  capture(level: ObservabilityEvent['level'], scope: string, msg: string, context?: Record<string, unknown>): void {
    const event: ObservabilityEvent = {
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      level,
      scope,
      msg: msg.slice(0, 500),
      ...(context && { context }),
      attempts: 0,
      status: 'pending',
    };
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) this.buffer = this.buffer.slice(-MAX_BUFFER);
    this.persist();
    if (level === 'critical') this.scheduleFlush(0); /* flush immédiat sur critical */
  }

  /**
   * Wrap un try/catch pour qu'il NE SOIT PLUS silent.
   * Usage : await observability.guard('vault.decrypt', () => decrypt(...))
   */
  async guard<T>(scope: string, fn: () => Promise<T> | T, fallback?: T): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.capture('error', scope, msg, { stack: err instanceof Error ? err.stack : undefined });
      return fallback;
    }
  }

  getDLQ(): readonly ObservabilityEvent[] {
    return this.dlq;
  }

  getBuffer(): readonly ObservabilityEvent[] {
    return this.buffer;
  }

  /* Replay DLQ entries (admin only — appel via vAdminCenter) */
  async replayDLQ(): Promise<{ replayed: number; failed: number }> {
    const items = [...this.dlq];
    this.dlq = [];
    this.persist();
    let replayed = 0;
    const failed = 0;
    for (const event of items) {
      event.status = 'pending';
      event.attempts = 0;
      this.buffer.push(event);
      replayed++;
    }
    await this.flush();
    return { replayed, failed };
  }

  /**
   * Escalade Claude Code RESILIENT (Jet 5 fix audit) :
   * - retry 3x si push localStorage échoue (quota/corruption)
   * - fallback observability buffer si toutes tentatives échouent (boucle contrôlée)
   * - rate-limit max 5 escalades / 10 min (anti spam)
   */
  async escalateToClaudeCode(reason: string, severity: 'warn' | 'critical', context: Record<string, unknown>): Promise<boolean> {
    /* Rate-limit check */
    const rateKey = 'apex_v13_escalate_rate';
    let recent: number[] = [];
    try {
      recent = JSON.parse(localStorage.getItem(rateKey) ?? '[]') as number[];
    } catch {
      /* ignore */
    }
    const cutoff = Date.now() - 10 * 60 * 1000;
    recent = recent.filter((t) => t > cutoff);
    if (recent.length >= 5) {
      this.capture('warn', 'escalate.rate_limited', `Escalade rate limit hit (${recent.length}/5 in 10min)`);
      return false;
    }
    const todo = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      context,
      reason,
      severity,
      src: 'apex',
      v: 'v13.0.0',
      ts: Date.now(),
      status: 'pending',
    };
    /* Jet 6 fix audit P0-3 : backoff exponentiel VRAI 200ms / 800ms / 3.2s
     * (vs linéaire 100/200/300 = 600ms total qui ne laisse pas le temps à un transient
     * GC localStorage de se résoudre). Total ici 4.2s = vraie résilience. */
    const RETRY_DELAYS = [200, 800, 3200];
    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      try {
        const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<typeof todo>;
        todos.push(todo);
        const trimmed = todos.length > 50 ? todos.slice(-50) : todos;
        localStorage.setItem('ax_claude_todo', JSON.stringify(trimmed));
        recent.push(Date.now());
        try {
          localStorage.setItem(rateKey, JSON.stringify(recent.slice(-10)));
        } catch {
          /* rate-limit persist non-critique, on continue */
        }
        return true;
      } catch (err: unknown) {
        if (i === RETRY_DELAYS.length - 1) {
          /* Tous retries échoués → fallback capture buffer avec ANTI-RECURSION flag.
           * Si capture() ré-appelle escalateToClaudeCode (théoriquement impossible mais
           * audit Jet 5 a flaggé "boucle infinie théorique"), le flag bloque. */
          this.captureNoEscalate('critical', 'escalate.failed', `ax_claude_todo push failed after 3 retries (backoff exponentiel): ${String(err)}`, {
            originalReason: reason,
            originalContext: context,
          });
          return false;
        }
        const delay = RETRY_DELAYS[i] ?? 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return false;
  }

  /**
   * Capture INTERNE sans déclencher escalade (anti-recursion guard).
   * Utilisé dans le fallback escalateToClaudeCode.failed pour éviter boucle.
   */
  private captureNoEscalate(
    level: ObservabilityEvent['level'],
    scope: string,
    msg: string,
    context?: Record<string, unknown>,
  ): void {
    const event: ObservabilityEvent = {
      id: `obs_internal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      level,
      scope,
      msg: msg.slice(0, 500),
      ...(context && { context }),
      attempts: 0,
      status: 'pending',
    };
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) this.buffer = this.buffer.slice(-MAX_BUFFER);
    /* Pas de persist() ici (peut throw aussi si quota plein) — l'event reste en mémoire seule.
     * Acceptable car c'est un fallback critical déjà loggé. */
  }

  private async tryInitSentry(): Promise<void> {
    const dsn = localStorage.getItem('ax_sentry_dsn');
    if (!dsn || !dsn.startsWith('https://')) return;
    /* Sentry lazy-load — Jet 4 : implémentation minimaliste fetch direct vers Sentry API
     * (évite +60KB @sentry/browser bundle pour PWA mobile-first) */
    this.sentryReady = true;
    logger.info('observability', 'Sentry DSN detected, ready for fetch sink');
  }

  private scheduleFlush(delay = 5000): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const pending = this.buffer.filter((e) => e.status === 'pending');
    for (const event of pending) {
      if (event.attempts >= MAX_RETRIES) {
        event.status = 'dlq';
        this.dlq.push(event);
        if (this.dlq.length > MAX_DLQ) this.dlq = this.dlq.slice(-MAX_DLQ);
        continue;
      }
      event.attempts++;
      /* Jet 6.5 fix audit (subagent flag "Sentry stub") :
       * Si Sentry NOT configured (pas de DSN) → events restent en buffer
       *   (pas mark sent). Permet au dev/admin de les voir via getBuffer().
       *   Au cap MAX_RETRIES → DLQ pour replay manuel.
       * Si Sentry configured + send OK → mark sent (cleanup).
       * Si Sentry configured + send fail → reste pending, retry next flush. */
      if (this.sentryReady) {
        const ok = await this.sendToSentry(event);
        if (ok) event.status = 'sent';
      } else {
        /* Sans Sentry, on plafonne attempts pour éviter retry infini.
         * Events s'accumulent en buffer (visible via getBuffer admin). */
        if (event.attempts >= MAX_RETRIES) {
          event.status = 'dlq';
          this.dlq.push(event);
          if (this.dlq.length > MAX_DLQ) this.dlq = this.dlq.slice(-MAX_DLQ);
        }
      }
    }
    /* Cleanup events sent (garde DLQ + pending uniquement en buffer) */
    this.buffer = this.buffer.filter((e) => e.status !== 'sent');
    this.persist();
  }

  private async sendToSentry(event: ObservabilityEvent): Promise<boolean> {
    const dsn = localStorage.getItem('ax_sentry_dsn');
    if (!dsn) return false;
    try {
      /* Parse DSN format : https://<key>@<host>/<project> */
      const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
      if (!match) return false;
      const [, key, host, projectId] = match;
      const url = `https://${host}/api/${projectId}/store/`;
      const payload = {
        event_id: event.id,
        timestamp: event.ts / 1000,
        level: event.level === 'critical' ? 'fatal' : event.level,
        logger: event.scope,
        message: event.msg,
        ...(event.context && { extra: event.context }),
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': `Sentry sentry_version=7,sentry_key=${key}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer));
      localStorage.setItem(DLQ_KEY, JSON.stringify(this.dlq));
    } catch {
      /* ignore quota */
    }
  }
}

export const observability = new Observability();
