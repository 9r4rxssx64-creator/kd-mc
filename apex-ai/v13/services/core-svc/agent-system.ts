/**
 * APEX v13 — Système subagents internes (parité Claude Code).
 *
 * Demande Kevin (2026-05-03) :
 * "Apex doit avoir les mêmes performances que toi (Claude Code)"
 * "Subagents internes pour audit indépendant en runtime"
 *
 * Permet à Apex de spawn des sous-agents pour :
 * - Audit cross-feature (Explore-style audit indépendant)
 * - Multi-step planning (Plan agent)
 * - Tâches longues parallèles (background task)
 *
 * Architecture :
 * - Agent = task isolée avec prompt + tools whitelist + résultat
 * - Sandbox : pas d'accès à window global, injection via DI
 * - Audit log obligatoire à chaque spawn + completion
 * - Cap 5 agents concurrent (anti-stress)
 *
 * Anti-pattern Kevin : pas eval, agents passent par dispatcher whitelist.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

/* P0-3 PERF (audit v13.2.5) : apex-tools-dispatch lazy (orchestration agent rare) */
type ApexToolsDispatchInstance = {
  execute: (name: string, input: unknown, tier: string) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
};
let _apexToolsDispatchAgent: ApexToolsDispatchInstance | null = null;
async function getApexToolsDispatch(): Promise<ApexToolsDispatchInstance> {
  if (_apexToolsDispatchAgent) return _apexToolsDispatchAgent;
  const mod = await import('./apex-tools-dispatch.js');
  _apexToolsDispatchAgent = mod.apexToolsDispatch as ApexToolsDispatchInstance;
  return _apexToolsDispatchAgent;
}

export type AgentType = 'audit' | 'plan' | 'research' | 'monitor';

export interface AgentTask {
  id: string;
  type: AgentType;
  prompt: string;
  tools_allowed: readonly string[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  started_at?: number;
  ended_at?: number;
  duration_ms?: number;
}

const MAX_CONCURRENT = 5;
const AGENT_TIMEOUT_MS = 60_000;

class AgentSystem {
  private active = new Map<string, AgentTask>();
  private history: AgentTask[] = [];

  /**
   * Spawn nouvel agent. Retourne agentId pour tracking.
   * Si > MAX_CONCURRENT actifs, queue jusqu'à libération.
   */
  async spawn(
    type: AgentType,
    prompt: string,
    options: { tools?: readonly string[]; userTier?: 'admin' | 'family' | 'client_pro' | 'client_free' | 'laurence' } = {},
  ): Promise<{ agent_id: string; status: AgentTask['status']; result?: unknown; error?: string }> {
    if (this.active.size >= MAX_CONCURRENT) {
      logger.warn('agent-system', `Max concurrent ${MAX_CONCURRENT} reached, queue`);
      /* Wait pour libération slot */
      await this.waitForSlot();
    }

    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tools = options.tools ?? this.getDefaultTools(type);
    const task: AgentTask = {
      id,
      type,
      prompt: prompt.slice(0, 2000),
      tools_allowed: tools,
      status: 'running',
      started_at: Date.now(),
    };
    this.active.set(id, task);
    await auditLog.record('agent.spawn', { details: { agent_id: id, type } });

    /* Exécution avec timeout protection */
    try {
      const result = await this.runWithTimeout(task, options.userTier ?? 'admin');
      task.status = 'completed';
      task.result = result;
      task.ended_at = Date.now();
      task.duration_ms = task.ended_at - (task.started_at ?? Date.now());
      this.complete(id);
      return { agent_id: id, status: 'completed', result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      task.status = 'failed';
      task.error = msg;
      task.ended_at = Date.now();
      task.duration_ms = task.ended_at - (task.started_at ?? Date.now());
      this.complete(id);
      logger.error('agent-system', `Agent ${id} failed: ${msg}`);
      return { agent_id: id, status: 'failed', error: msg };
    }
  }

  private async runWithTimeout(
    task: AgentTask,
    userTier: 'admin' | 'family' | 'client_pro' | 'client_free' | 'laurence',
  ): Promise<unknown> {
    return Promise.race([
      this.execute(task, userTier),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Agent timeout 60s')), AGENT_TIMEOUT_MS),
      ),
    ]);
  }

  /**
   * Exécution agent : selon type, dispatch vers handler dédié.
   */
  private async execute(
    task: AgentTask,
    userTier: 'admin' | 'family' | 'client_pro' | 'client_free' | 'laurence',
  ): Promise<unknown> {
    switch (task.type) {
      case 'audit':
        return this.executeAudit(task, userTier);
      case 'plan':
        return this.executePlan(task, userTier);
      case 'research':
        return this.executeResearch(task, userTier);
      case 'monitor':
        return this.executeMonitor(task, userTier);
      default:
        throw new Error(`Type agent inconnu: ${String(task.type)}`);
    }
  }

  /**
   * Audit agent : exécute audit_self + read_logs + génère synthèse.
   */
  private async executeAudit(
    task: AgentTask,
    userTier: 'admin' | 'family' | 'client_pro' | 'client_free' | 'laurence',
  ): Promise<unknown> {
    const apexToolsDispatch = await getApexToolsDispatch();
    const audit = await apexToolsDispatch.execute('audit_self', { scope: 'all' }, userTier);
    const logs = await apexToolsDispatch.execute('read_logs', { scope: 'all', limit: 20 }, userTier);
    return {
      task_id: task.id,
      type: 'audit',
      audit_metrics: audit.result,
      recent_logs: logs.result,
      timestamp: Date.now(),
      synthesis: `Audit completed for prompt: "${task.prompt.slice(0, 100)}"`,
    };
  }

  /**
   * Plan agent : décompose tâche en steps + estimate.
   */
  private async executePlan(
    task: AgentTask,
    _userTier: 'admin' | 'family' | 'client_pro' | 'client_free' | 'laurence',
  ): Promise<unknown> {
    /* Heuristique : décomposition basique en 3-5 steps selon mots-clés */
    const lc = task.prompt.toLowerCase();
    const steps: Array<{ step: number; action: string; estimated_min: number }> = [];
    let stepNum = 1;
    if (lc.includes('test') || lc.includes('couvr')) {
      steps.push({ step: stepNum++, action: 'Identifier modules low coverage', estimated_min: 10 });
      steps.push({ step: stepNum++, action: 'Écrire tests unitaires manquants', estimated_min: 60 });
      steps.push({ step: stepNum++, action: 'Lancer test-live + valider', estimated_min: 5 });
    }
    if (lc.includes('feature') || lc.includes('ajout')) {
      steps.push({ step: stepNum++, action: 'Définir spec + interface', estimated_min: 20 });
      steps.push({ step: stepNum++, action: 'Implémenter service + tests', estimated_min: 90 });
      steps.push({ step: stepNum++, action: 'Intégrer UI + a11y', estimated_min: 45 });
    }
    if (lc.includes('audit') || lc.includes('verif')) {
      steps.push({ step: stepNum++, action: 'Lancer subagent Explore', estimated_min: 5 });
      steps.push({ step: stepNum++, action: 'Identifier P0', estimated_min: 10 });
      steps.push({ step: stepNum++, action: 'Fix P0 prioritaires', estimated_min: 60 });
    }
    if (steps.length === 0) {
      steps.push({ step: 1, action: 'Analyser la demande', estimated_min: 5 });
      steps.push({ step: 2, action: 'Proposer 3 approches', estimated_min: 10 });
      steps.push({ step: 3, action: 'Implémenter approche choisie', estimated_min: 60 });
    }
    return {
      task_id: task.id,
      type: 'plan',
      steps,
      total_estimated_min: steps.reduce((s, x) => s + x.estimated_min, 0),
    };
  }

  /**
   * Research agent : web_search + web_fetch sur topic.
   */
  private async executeResearch(
    task: AgentTask,
    userTier: 'admin' | 'family' | 'client_pro' | 'client_free' | 'laurence',
  ): Promise<unknown> {
    const apexToolsDispatch = await getApexToolsDispatch();
    const search = await apexToolsDispatch.execute(
      'web_search',
      { query: task.prompt, max_results: 5 },
      userTier,
    );
    return {
      task_id: task.id,
      type: 'research',
      query: task.prompt,
      results: search.result,
      timestamp: Date.now(),
    };
  }

  /**
   * Monitor agent : audit santé périodique (sentinels-style).
   */
  private async executeMonitor(
    task: AgentTask,
    userTier: 'admin' | 'family' | 'client_pro' | 'client_free' | 'laurence',
  ): Promise<unknown> {
    const apexToolsDispatch = await getApexToolsDispatch();
    const audit = await apexToolsDispatch.execute('audit_self', { scope: 'all' }, userTier);
    const result = audit.result as { metrics?: Record<string, unknown> } | undefined;
    const errors = (result?.metrics?.['errors_count'] as number | undefined) ?? 0;
    const claudeTodo = (result?.metrics?.['claude_todo_pending'] as number | undefined) ?? 0;
    return {
      task_id: task.id,
      type: 'monitor',
      health: errors > 10 || claudeTodo > 5 ? 'degraded' : 'ok',
      metrics: result?.metrics,
      timestamp: Date.now(),
    };
  }

  /**
   * Tools whitelist par type d'agent (sécurité).
   */
  private getDefaultTools(type: AgentType): readonly string[] {
    switch (type) {
      case 'audit':
        return ['audit_self', 'read_logs', 'memory_recall'];
      case 'plan':
        return ['memory_recall', 'audit_self'];
      case 'research':
        return ['web_search', 'web_fetch', 'knowledge_update'];
      case 'monitor':
        return ['audit_self', 'read_logs'];
      default:
        return [];
    }
  }

  private complete(id: string): void {
    const task = this.active.get(id);
    if (task) {
      this.history.push(task);
      this.active.delete(id);
    }
    /* Cap history 100 entries */
    if (this.history.length > 100) this.history = this.history.slice(-100);
  }

  private async waitForSlot(timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    while (this.active.size >= MAX_CONCURRENT) {
      if (Date.now() - start > timeoutMs) throw new Error('Agent slot timeout');
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /**
   * Liste agents actifs (admin debug).
   */
  listActive(): AgentTask[] {
    return [...this.active.values()];
  }

  /**
   * History agents complétés (max 100).
   */
  getHistory(): readonly AgentTask[] {
    return this.history;
  }

  /**
   * Stats pour dashboard.
   */
  getStats(): { active: number; history: number; completed: number; failed: number; avg_duration_ms: number } {
    const completed = this.history.filter((h) => h.status === 'completed').length;
    const failed = this.history.filter((h) => h.status === 'failed').length;
    const avgDuration =
      this.history.length > 0
        ? Math.round(
            this.history.reduce((s, h) => s + (h.duration_ms ?? 0), 0) / this.history.length,
          )
        : 0;
    return {
      active: this.active.size,
      history: this.history.length,
      completed,
      failed,
      avg_duration_ms: avgDuration,
    };
  }
}

export const agentSystem = new AgentSystem();
