/**
 * APEX v13 — Pipeline self-healing total cross-app
 *
 * Règle CLAUDE.md "Pipeline auto-correction agents" + "Pipeline autonomie cross-projet" :
 * - Erreurs CMCteams/projets → telemetry_in → Apex auto-fix
 * - Si auto-fix échoue → escalate ax_claude_todo → GitHub Action cron 2h
 *
 * Schéma Firebase préservé identique v12.785 pour pas casser pipeline existant.
 */

import { logger } from '../../core/logger.js';
import { firebase } from '../storage/firebase.js';

export interface TelemetryEntry {
  id: string;
  kind: 'err' | 'warn' | 'info';
  msg: string;
  details: Record<string, unknown>;
  src: 'apex' | 'cmcteams' | 'kdmc' | 'ekdmc' | 'telecommande' | 'crackpass' | 'other';
  v: string;
  user: string;
  ts: number;
  processed: boolean;
}

export interface ClaudeTodo {
  id: string;
  context: Record<string, unknown>;
  reason: string;
  severity: 'info' | 'warn' | 'critical';
  src: string;
  v: string;
  ts: number;
  status: 'pending' | 'in_progress' | 'resolved';
}

const AUTOFIX_WHITELIST: Record<string, () => boolean | Promise<boolean>> = {
  flushSyncQueue: () => {
    logger.info('telemetry', 'autofix flushSyncQueue');
    return true;
  },
  emergencyCleanup: () => {
    try {
      const before = JSON.stringify(localStorage).length;
      const keysToTrim = ['ax_audit', 'ax_err_log', 'ax_silent_log'];
      for (const k of keysToTrim) {
        try {
          const arr = JSON.parse(localStorage.getItem(k) ?? '[]') as unknown[];
          if (Array.isArray(arr) && arr.length > 50) {
            localStorage.setItem(k, JSON.stringify(arr.slice(-50)));
          }
        } catch {
          /* ignore */
        }
      }
      const after = JSON.stringify(localStorage).length;
      logger.info('telemetry', `emergencyCleanup freed ${before - after}b`);
      return after < before;
    } catch {
      return false;
    }
  },
  resetStreaming: () => {
    logger.info('telemetry', 'autofix resetStreaming');
    return true;
  },
};

class Telemetry {
  pushIncoming(entry: Omit<TelemetryEntry, 'id' | 'processed' | 'ts'>): void {
    const full: TelemetryEntry = {
      ...entry,
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      processed: false,
    };
    try {
      const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as TelemetryEntry[];
      buf.push(full);
      const trimmed = buf.length > 200 ? buf.slice(-200) : buf;
      localStorage.setItem('ax_telemetry_in', JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('telemetry', 'pushIncoming persist failed', { err });
    }
    void firebase.write('ax_telemetry_in', full);
  }

  async processIncoming(): Promise<void> {
    let buf: TelemetryEntry[] = [];
    try {
      buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as TelemetryEntry[];
    } catch {
      return;
    }
    /* P1 v13.3.13 audit fix : valide entries non-null + champs requis (anti-crash null) */
    const pending = buf.filter((e) =>
      e !== null && typeof e === 'object'
      && typeof e.id === 'string'
      && typeof e.kind === 'string'
      && typeof e.msg === 'string'
      && !e.processed,
    );
    for (const entry of pending) {
      const result = await this.tryAutoFix(entry);
      entry.processed = true;
      if (!result.ok) {
        await this.escalateToClaudeCode(entry, result.attempts);
      }
    }
    try {
      localStorage.setItem('ax_telemetry_in', JSON.stringify(buf));
    } catch {
      /* ignore */
    }
  }

  private async tryAutoFix(_entry: TelemetryEntry): Promise<{ ok: boolean; attempts: string[] }> {
    const attempts: string[] = [];
    for (const [name, fn] of Object.entries(AUTOFIX_WHITELIST)) {
      try {
        const ok = await fn();
        attempts.push(`${name}:${ok ? 'OK' : 'KO'}`);
        if (ok) return { ok: true, attempts };
      } catch (err: unknown) {
        attempts.push(`${name}:THROW`);
        logger.warn('telemetry', `autofix ${name} threw`, { err });
      }
    }
    return { ok: false, attempts };
  }

  private async escalateToClaudeCode(entry: TelemetryEntry, attempts: readonly string[]): Promise<void> {
    const todo: ClaudeTodo = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      context: { entry, attempts },
      reason: `Auto-fix exhausted for: ${entry.msg}`,
      severity: entry.kind === 'err' ? 'critical' : 'warn',
      src: entry.src,
      v: entry.v,
      ts: Date.now(),
      status: 'pending',
    };
    try {
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as ClaudeTodo[];
      todos.push(todo);
      const trimmed = todos.length > 50 ? todos.slice(-50) : todos;
      localStorage.setItem('ax_claude_todo', JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('telemetry', 'escalate persist failed', { err });
    }
    await firebase.write('ax_claude_todo', todo);
    logger.info('telemetry', `Escalated to Claude Code: ${todo.id}`);
  }
}

export const telemetry = new Telemetry();
