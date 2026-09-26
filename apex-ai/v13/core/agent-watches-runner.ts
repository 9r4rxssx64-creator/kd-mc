/**
 * APEX v13 — Agent Watches Runner (C4 fix audit v13.3.73).
 *
 * Audit signalait : "1 agents en erreur" sans identification précise.
 *
 * Cette couche orchestratrice ajoute :
 * - `getAgentHealth()` — état complet par agent (status, lastError, uptime, lastRun)
 * - Auto-restart avec backoff (1s → 5s → 15s, 3 tentatives)
 * - Audit log via `auditLog.record('agent.restart', ...)`
 * - Toast admin si agent mort > 3 fois consécutives
 * - Stats globales pour dashboard admin
 *
 * Délègue exécution aux 8 agents nommés via `agentWatches.runAll()`.
 *
 * Demande Kevin (CLAUDE.md règle "Auto-fix toujours") :
 * "Si warning correction automatique et autonome. Toujours."
 */

import { auditLog } from '../services/observability/audit-log.js';
import { agentWatches, type AgentReport, type AgentSeverity } from '../services/sentinels/agent-watches.js';

import { logger } from './logger.js';

export type AgentStatus = 'healthy' | 'warn' | 'error' | 'unknown';

export interface AgentHealth {
  /** Identifiant agent (ex: "import-watch") */
  name: string;
  /** Statut courant inféré du dernier rapport */
  status: AgentStatus;
  /** Message dernière erreur (si status==='error') */
  lastError: string | null;
  /** Uptime en ms depuis dernier restart success (0 si jamais run) */
  uptime: number;
  /** Timestamp dernier run (ms epoch, 0 si jamais) */
  lastRun: number;
  /** Compteur échecs consécutifs (reset à 0 si run OK) */
  consecutiveFailures: number;
  /** Compteur restart attempts dans la session courante */
  restartAttempts: number;
}

interface RestartAttempt {
  ok: boolean;
  attempt: number;
  delayMs: number;
  error?: string;
}

export interface RestartResult {
  agent: string;
  success: boolean;
  attempts: RestartAttempt[];
  finalStatus: AgentStatus;
  escalated: boolean;
}

/* Backoff schedule : 1s, 5s, 15s */
const RESTART_DELAYS_MS = [1000, 5000, 15000] as const;
const MAX_CONSECUTIVE_FAILURES_BEFORE_TOAST = 3;

class AgentWatchesRunner {
  private healthMap = new Map<string, AgentHealth>();
  private restartLocks = new Set<string>();
  private startupTime = Date.now();

  /**
   * Run un cycle complet (8 agents) + update healthMap.
   * Retourne reports inchangé pour back-compat.
   */
  async runCycle(uid?: string): Promise<readonly AgentReport[]> {
    const reports = await agentWatches.runAll(uid);
    for (const report of reports) {
      this.updateHealth(report);
    }

    /* Auto-restart agents en error (sauf si déjà en cours de restart) */
    const errored = reports.filter(
      (r) => (r.severity === 'err' || r.severity === 'critical') && !this.restartLocks.has(r.agent_id),
    );
    for (const r of errored) {
      void this.attemptRestart(r.agent_id);
    }

    return reports;
  }

  /**
   * Récupère l'état de santé d'un agent.
   */
  getAgentHealth(agentId: string): AgentHealth {
    return (
      this.healthMap.get(agentId) ?? {
        name: agentId,
        status: 'unknown',
        lastError: null,
        uptime: 0,
        lastRun: 0,
        consecutiveFailures: 0,
        restartAttempts: 0,
      }
    );
  }

  /**
   * Liste l'état de santé de tous les agents connus.
   */
  getAllHealth(): readonly AgentHealth[] {
    return [...this.healthMap.values()];
  }

  /**
   * Identifie les agents défaillants (status===error).
   * @returns liste des `agentId` à restart
   */
  identifyFailing(): readonly string[] {
    const failing: string[] = [];
    for (const [id, h] of this.healthMap) {
      if (h.status === 'error') failing.push(id);
    }
    return failing;
  }

  /**
   * Tente de redémarrer un agent défaillant avec backoff exponentiel.
   * 3 tentatives max : 1s → 5s → 15s.
   * Audit log à chaque tentative.
   * Toast admin si > 3 échecs consécutifs (avant restart).
   * Escalade `ax_claude_todo` si fail final.
   */
  async attemptRestart(agentId: string): Promise<RestartResult> {
    if (this.restartLocks.has(agentId)) {
      return {
        agent: agentId,
        success: false,
        attempts: [],
        finalStatus: this.getAgentHealth(agentId).status,
        escalated: false,
      };
    }
    this.restartLocks.add(agentId);

    const attempts: RestartAttempt[] = [];
    let success = false;
    const health = this.getAgentHealth(agentId);

    /* Toast admin si déjà 3+ échecs consécutifs avant ce cycle */
    if (health.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_TOAST) {
      this.notifyAdmin(agentId, health.consecutiveFailures);
    }

    for (let i = 0; i < RESTART_DELAYS_MS.length; i++) {
      const delayMs = RESTART_DELAYS_MS[i] ?? 1000;
      const attemptNum = i + 1;
      health.restartAttempts++;

      await this.sleep(delayMs);

      try {
        await auditLog.record('agent.restart', {
          actor: 'agent-watches-runner',
          target: agentId,
          details: { attempt: attemptNum, delay_ms: delayMs },
        });
      } catch {
        /* audit best-effort */
      }

      let attemptOk = false;
      let attemptErr: string | undefined;
      try {
        const report = await this.runSingleAgent(agentId);
        attemptOk = report ? report.severity === 'ok' || report.severity === 'warn' : false;
        if (report) this.updateHealth(report);
      } catch (err: unknown) {
        attemptErr = err instanceof Error ? err.message : String(err);
        logger.warn('agent-watches-runner', `restart attempt ${attemptNum} threw`, {
          agent: agentId,
          err: attemptErr,
        });
      }

      const attemptEntry: RestartAttempt = attemptErr
        ? { ok: attemptOk, attempt: attemptNum, delayMs, error: attemptErr }
        : { ok: attemptOk, attempt: attemptNum, delayMs };
      attempts.push(attemptEntry);

      if (attemptOk) {
        success = true;
        break;
      }
    }

    this.restartLocks.delete(agentId);
    const finalStatus = this.getAgentHealth(agentId).status;
    let escalated = false;

    if (!success) {
      escalated = await this.escalate(agentId, attempts);
    }

    return { agent: agentId, success, attempts, finalStatus, escalated };
  }

  /**
   * Update health map à partir d'un AgentReport.
   * Calcule status / uptime / consecutiveFailures.
   */
  private updateHealth(report: AgentReport): void {
    const existing = this.healthMap.get(report.agent_id);
    const status: AgentStatus = this.severityToStatus(report.severity);
    const isOk = status === 'healthy' || status === 'warn';

    const health: AgentHealth = {
      name: report.agent_id,
      status,
      lastError: !isOk ? report.msg : null,
      uptime: isOk ? Date.now() - this.startupTime : 0,
      lastRun: report.ts,
      consecutiveFailures: isOk ? 0 : (existing?.consecutiveFailures ?? 0) + 1,
      restartAttempts: existing?.restartAttempts ?? 0,
    };
    this.healthMap.set(report.agent_id, health);
  }

  private severityToStatus(severity: AgentSeverity): AgentStatus {
    if (severity === 'ok') return 'healthy';
    if (severity === 'warn') return 'warn';
    return 'error';
  }

  /**
   * Run un agent individuel pour vérifier qu'il répond.
   * Mappe agent_id → méthode `agentWatches.<x>()`.
   */
  private async runSingleAgent(agentId: string): Promise<AgentReport | null> {
    /* Re-run global cycle and pick this agent's latest report.
     * Pas de méthode `runOne` exposée par agentWatches → safe fallback. */
    try {
      const reports = await agentWatches.runAll();
      return reports.find((r) => r.agent_id === agentId) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Toast admin pour signaler agent défaillant > 3 fois.
   * Lazy import to avoid coupling tests.
   */
  private notifyAdmin(agentId: string, failures: number): void {
    void (async () => {
      try {
        const { toast } = await import('../ui/toast.js');
        toast.warn(`Agent ${agentId} défaillant ${failures}× — auto-restart en cours…`, {
          duration: 6000,
        });
      } catch {
        /* toast unavailable (SSR/test) */
      }
    })();
  }

  /**
   * Escalade Claude Code via `ax_claude_todo` Firebase si restart fails.
   */
  private async escalate(agentId: string, attempts: readonly RestartAttempt[]): Promise<boolean> {
    try {
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<{
        id: string;
        kind: string;
        msg: string;
        details: Record<string, unknown>;
        ts: number;
        status: string;
      }>;
      todos.push({
        id: `agent-fail_${agentId}_${Date.now()}`,
        kind: 'agent_restart_failed',
        msg: `Agent ${agentId} restart failed after ${attempts.length} attempts`,
        details: {
          agent: agentId,
          attempts: attempts.length,
          last_error: attempts[attempts.length - 1]?.error ?? 'unknown',
          severity: 'critical',
        },
        ts: Date.now(),
        status: 'pending',
      });
      const trimmed = todos.length > 50 ? todos.slice(-50) : todos;
      localStorage.setItem('ax_claude_todo', JSON.stringify(trimmed));

      await auditLog.record('agent.restart_escalated', {
        actor: 'agent-watches-runner',
        target: agentId,
        details: { attempts: attempts.length },
      });
      return true;
    } catch (err) {
      logger.error('agent-watches-runner', 'escalation failed', {
        agent: agentId,
        err: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stats globales pour dashboard.
   */
  getStats(): {
    total: number;
    healthy: number;
    warn: number;
    error: number;
    total_restart_attempts: number;
  } {
    const all = this.getAllHealth();
    return {
      total: all.length,
      healthy: all.filter((a) => a.status === 'healthy').length,
      warn: all.filter((a) => a.status === 'warn').length,
      error: all.filter((a) => a.status === 'error').length,
      total_restart_attempts: all.reduce((sum, a) => sum + a.restartAttempts, 0),
    };
  }

  /**
   * Reset (debug only).
   */
  reset(): void {
    this.healthMap.clear();
    this.restartLocks.clear();
    this.startupTime = Date.now();
  }
}

export const agentWatchesRunner = new AgentWatchesRunner();
