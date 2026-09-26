/**
 * APEX v13 — Claude Bridge (relais bidirectionnel Apex ↔ Claude Code).
 *
 * Demande Kevin 2026-05-04 : "Bridge API vers Claude conversationnel"
 *
 * Architecture concertation bidirectionnelle (CLAUDE.md règle permanente) :
 *
 * APEX → Claude Code (escalade) :
 * - ax_claude_todo Firebase RTDB array
 * - GitHub Action cron 2h poll → ouvre issue si critical pending > 30min
 * - Prochaine session Claude Code lit todos → fix → ax_handoff_journal
 *
 * Claude Code → APEX (réponse) :
 * - ax_handoff_journal Firebase RTDB array (réponses Claude Code)
 * - Apex SSE listener applique les fixes/réponses
 * - Affiche dans vClaudeHandoff admin
 *
 * Cross-app (CMCteams, KDMC, etc.) :
 * - Tous projets partagent ax_claude_todo + ax_handoff_journal via FB_FIX
 * - Apex orchestre comme central
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { firebase } from '../storage/firebase.js';
import { vault } from '../vault/vault.js';

export type TodoType =
  | 'self_audit_escalation'
  | 'add_credential_pattern'
  | 'fix_bug'
  | 'add_feature'
  | 'investigate'
  | 'add_test'
  | 'security_finding'
  | 'performance_issue'
  | 'ux_improvement';

export type TodoStatus = 'pending' | 'in_progress' | 'resolved' | 'wontfix';

export interface ClaudeTodo {
  id: string;
  type: TodoType;
  src: string; /* 'apex' | 'cmcteams' | 'kdmc' | etc. */
  src_version?: string;
  title: string;
  description: string;
  context?: Record<string, unknown>;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ts: number;
  status: TodoStatus;
  resolved_ts?: number;
  resolved_by?: string;
  fix_summary?: string;
  fix_commit_sha?: string;
}

export interface HandoffEntry {
  id: string;
  todo_id: string;
  ts: number;
  by: string; /* 'claude-code' | 'apex' | ... */
  action: 'acknowledged' | 'investigated' | 'fixed' | 'wontfix' | 'needs_input';
  notes: string;
  commit_sha?: string;
  files_changed?: string[];
}

const TODO_KEY = 'ax_claude_todo';
const HANDOFF_KEY = 'ax_handoff_journal';
const MAX_TODOS = 100;
const MAX_HANDOFF = 200;

/* Pipeline temps-réel Apex↔Claude (Kevin 2026-05-07) — repository_dispatch GitHub */
const GITHUB_REPO = '9r4rxssx64-creator/cmcteams';
const DISPATCH_URL = `https://api.github.com/repos/${GITHUB_REPO}/dispatches`;
const ESCALATE_RETRIES = 3;
const ESCALATE_BACKOFF_MS = [1000, 3000, 7000];

class ClaudeBridge {
  /**
   * Apex → Claude Code : push une todo.
   */
  async pushTodo(todo: Omit<ClaudeTodo, 'id' | 'ts' | 'status'>): Promise<ClaudeTodo> {
    const newTodo: ClaudeTodo = {
      id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      ts: Date.now(),
      status: 'pending',
      ...todo,
    };
    const todos = this.listTodos();
    todos.push(newTodo);
    if (todos.length > MAX_TODOS) {
      /* Trim resolved oldest first */
      todos.sort((a, b) => {
        if (a.status === 'resolved' && b.status !== 'resolved') return -1;
        if (b.status === 'resolved' && a.status !== 'resolved') return 1;
        return a.ts - b.ts;
      });
      todos.splice(0, todos.length - MAX_TODOS);
    }
    try {
      localStorage.setItem(TODO_KEY, JSON.stringify(todos));
    } catch (err: unknown) {
      logger.warn('claude-bridge', 'pushTodo persist failed', { err });
    }
    void auditLog.record('claude_bridge.todo_pushed', {
      details: { id: newTodo.id, type: newTodo.type, severity: newTodo.severity },
    });
    logger.info('claude-bridge', `Todo pushed ${newTodo.id} (${newTodo.severity}): ${newTodo.title}`);
    /* Sync Firebase pour que cron 5min + repository_dispatch puissent voir la todo */
    void firebase.write(TODO_KEY, todos).catch(() => { /* offline OK, queue géré par firebase.ts */ });
    /* Pipeline temps-réel Kevin 2026-05-07 : si critical → escalate now (instantané) */
    if (newTodo.severity === 'critical') {
      void this.escalateNow(newTodo).catch((err: unknown) => {
        logger.warn('claude-bridge', 'escalateNow failed (fallback Firebase only)', { err });
      });
    }
    return newTodo;
  }

  /**
   * Pipeline temps-réel Apex → Claude Code (Kevin 2026-05-07).
   * POST /repos/.../dispatches event_type=apex_escalation pour déclencher
   * .github/workflows/claude-todo-watcher.yml IMMÉDIATEMENT (sans attendre cron 5min).
   *
   * - Lit ax_github_token via vault.readKey() (déchiffré si AXENC1:)
   * - Retry exponentiel 3× (1s/3s/7s) si fail (token expiré, rate limit)
   * - Fallback : si tous échecs → log warn + Firebase reste source (cron rattrape dans 5min)
   * - Audit log immutable pour traçabilité
   */
  async escalateNow(todo: ClaudeTodo): Promise<{ ok: boolean; status?: number; attempts: number; reason?: string }> {
    let token = '';
    try {
      token = await vault.readKey('ax_github_token');
    } catch (err: unknown) {
      logger.warn('claude-bridge', 'escalateNow: vault.readKey failed', { err });
    }
    if (!token) {
      const reason = 'no_github_token';
      void auditLog.record('claude_bridge.escalate_now_skipped', { details: { todo_id: todo.id, reason } });
      return { ok: false, attempts: 0, reason };
    }
    const payload = {
      event_type: 'apex_escalation',
      client_payload: {
        todo_id: todo.id,
        severity: todo.severity,
        type: todo.type,
        title: String(todo.title || '').slice(0, 200),
        reason: String(todo.description || '').slice(0, 500),
        src: todo.src,
        src_version: todo.src_version ?? '',
        ts: todo.ts,
      },
    };
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    for (let attempt = 0; attempt < ESCALATE_RETRIES; attempt++) {
      try {
        const res = await fetch(DISPATCH_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 204 || res.ok) {
          void auditLog.record('claude_bridge.escalate_now_ok', {
            details: { todo_id: todo.id, attempt: attempt + 1, status: res.status },
          });
          logger.info('claude-bridge', `🚨 escalateNow OK (todo=${todo.id}, attempt=${attempt + 1})`);
          return { ok: true, status: res.status, attempts: attempt + 1 };
        }
        /* 401/403 = token invalide, inutile de retry */
        if (res.status === 401 || res.status === 403) {
          const reason = `auth_failed_${res.status}`;
          void auditLog.record('claude_bridge.escalate_now_auth_fail', {
            details: { todo_id: todo.id, status: res.status },
          });
          return { ok: false, status: res.status, attempts: attempt + 1, reason };
        }
        logger.warn('claude-bridge', `escalateNow HTTP ${res.status} (attempt ${attempt + 1})`);
      } catch (err: unknown) {
        logger.warn('claude-bridge', `escalateNow network error (attempt ${attempt + 1})`, { err });
      }
      /* Backoff avant retry */
      if (attempt < ESCALATE_RETRIES - 1) {
        const wait = ESCALATE_BACKOFF_MS[attempt] ?? 5000;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    void auditLog.record('claude_bridge.escalate_now_failed', { details: { todo_id: todo.id, attempts: ESCALATE_RETRIES } });
    return { ok: false, attempts: ESCALATE_RETRIES, reason: 'all_retries_failed' };
  }

  /**
   * Déclenche un workflow GitHub Actions via repository_dispatch (même canal
   * que escalateNow — token ax_github_token du Coffre, retry 3× backoff).
   *
   * Utilisé par les slash-commands sécurité (/audit → security-suite,
   * /pentest → strix-scan, /web → agent-reach). Le résultat arrive de façon
   * asynchrone dans Firebase (ax_security_last / ax_strix_last / ax_agent_reach_last).
   *
   * @param eventType type de repository_dispatch (doit matcher `types:` du workflow)
   * @param payload   client_payload (target/model/channel/query + exec_id auto)
   */
  async dispatchWorkflow(
    eventType: string,
    payload: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; status?: number; attempts: number; reason?: string; exec_id: string }> {
    const exec_id = `apex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let token = '';
    try {
      token = await vault.readKey('ax_github_token');
    } catch (err: unknown) {
      logger.warn('claude-bridge', 'dispatchWorkflow: vault.readKey failed', { err });
    }
    if (!token) {
      void auditLog.record('claude_bridge.dispatch_skipped', { details: { eventType, reason: 'no_github_token' } });
      return { ok: false, attempts: 0, reason: 'no_github_token', exec_id };
    }
    const body = {
      event_type: eventType,
      client_payload: { ...payload, exec_id, ts: Date.now() },
    };
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    for (let attempt = 0; attempt < ESCALATE_RETRIES; attempt++) {
      try {
        const res = await fetch(DISPATCH_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 204 || res.ok) {
          void auditLog.record('claude_bridge.dispatch_ok', { details: { eventType, exec_id, attempt: attempt + 1 } });
          logger.info('claude-bridge', `🚀 dispatchWorkflow OK (${eventType}, attempt ${attempt + 1})`);
          return { ok: true, status: res.status, attempts: attempt + 1, exec_id };
        }
        if (res.status === 401 || res.status === 403) {
          const reason = `auth_failed_${res.status}`;
          void auditLog.record('claude_bridge.dispatch_auth_fail', { details: { eventType, status: res.status } });
          return { ok: false, status: res.status, attempts: attempt + 1, reason, exec_id };
        }
        logger.warn('claude-bridge', `dispatchWorkflow HTTP ${res.status} (attempt ${attempt + 1})`);
      } catch (err: unknown) {
        logger.warn('claude-bridge', `dispatchWorkflow network error (attempt ${attempt + 1})`, { err });
      }
      if (attempt < ESCALATE_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, ESCALATE_BACKOFF_MS[attempt] ?? 5000));
      }
    }
    void auditLog.record('claude_bridge.dispatch_failed', { details: { eventType, attempts: ESCALATE_RETRIES } });
    return { ok: false, attempts: ESCALATE_RETRIES, reason: 'all_retries_failed', exec_id };
  }

  /**
   * Liste todos avec filtres.
   */
  listTodos(filters?: { status?: TodoStatus; severity?: ClaudeTodo['severity']; src?: string; limit?: number }): ClaudeTodo[] {
    try {
      let todos = JSON.parse(localStorage.getItem(TODO_KEY) ?? '[]') as ClaudeTodo[];
      if (filters?.status) todos = todos.filter((t) => t.status === filters.status);
      if (filters?.severity) todos = todos.filter((t) => t.severity === filters.severity);
      if (filters?.src) todos = todos.filter((t) => t.src === filters.src);
      todos.sort((a, b) => b.ts - a.ts);
      if (filters?.limit) todos = todos.slice(0, filters.limit);
      return todos;
    } catch {
      return [];
    }
  }

  /**
   * Marquer todo résolu (appelé par Claude Code après fix).
   */
  resolveTodo(todoId: string, resolvedBy: string, fixSummary: string, commitSha?: string): boolean {
    const todos = this.listTodos();
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return false;
    todo.status = 'resolved';
    todo.resolved_ts = Date.now();
    todo.resolved_by = resolvedBy;
    todo.fix_summary = fixSummary;
    if (commitSha) todo.fix_commit_sha = commitSha;
    try {
      localStorage.setItem(TODO_KEY, JSON.stringify(todos));
    } catch (err: unknown) {
      logger.warn('claude-bridge', 'resolveTodo persist failed', { err });
    }
    void this.pushHandoff({
      todo_id: todoId,
      by: resolvedBy,
      action: 'fixed',
      notes: fixSummary,
      ...(commitSha && { commit_sha: commitSha }),
    });
    return true;
  }

  /**
   * Claude Code → Apex : push handoff entry (réponse/log).
   */
  async pushHandoff(entry: Omit<HandoffEntry, 'id' | 'ts'>): Promise<HandoffEntry> {
    const newEntry: HandoffEntry = {
      id: `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      ts: Date.now(),
      ...entry,
    };
    const journal = this.listHandoff();
    journal.push(newEntry);
    if (journal.length > MAX_HANDOFF) {
      journal.splice(0, journal.length - MAX_HANDOFF);
    }
    try {
      localStorage.setItem(HANDOFF_KEY, JSON.stringify(journal));
    } catch (err: unknown) {
      logger.warn('claude-bridge', 'pushHandoff persist failed', { err });
    }
    void auditLog.record('claude_bridge.handoff_pushed', {
      details: { id: newEntry.id, by: newEntry.by, action: newEntry.action },
    });
    return newEntry;
  }

  /**
   * Liste handoff entries (admin journal).
   */
  listHandoff(filters?: { todo_id?: string; by?: string; limit?: number }): HandoffEntry[] {
    try {
      let journal = JSON.parse(localStorage.getItem(HANDOFF_KEY) ?? '[]') as HandoffEntry[];
      if (filters?.todo_id) journal = journal.filter((e) => e.todo_id === filters.todo_id);
      if (filters?.by) journal = journal.filter((e) => e.by === filters.by);
      journal.sort((a, b) => b.ts - a.ts);
      if (filters?.limit) journal = journal.slice(0, filters.limit);
      return journal;
    } catch {
      return [];
    }
  }

  /**
   * Stats : todos pending, resolved, escaladés cette semaine.
   */
  getStats(): {
    todos_pending: number;
    todos_critical_pending: number;
    todos_resolved_7d: number;
    handoff_entries_7d: number;
    avg_resolution_time_h: number;
  } {
    const todos = this.listTodos();
    const journal = this.listHandoff();
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const pendingTodos = todos.filter((t) => t.status === 'pending');
    const resolvedRecent = todos.filter((t) => t.status === 'resolved' && (t.resolved_ts ?? 0) >= sevenDaysAgo);
    const totalResolutionMs = resolvedRecent.reduce((acc, t) => acc + ((t.resolved_ts ?? 0) - t.ts), 0);
    return {
      todos_pending: pendingTodos.length,
      todos_critical_pending: pendingTodos.filter((t) => t.severity === 'critical').length,
      todos_resolved_7d: resolvedRecent.length,
      handoff_entries_7d: journal.filter((e) => e.ts >= sevenDaysAgo).length,
      avg_resolution_time_h: resolvedRecent.length > 0 ? Math.round(totalResolutionMs / resolvedRecent.length / 3600000 * 10) / 10 : 0,
    };
  }

  /**
   * Format markdown briefing pour Claude Code (next session reads).
   */
  formatBriefing(): string {
    const pending = this.listTodos({ status: 'pending', limit: 20 });
    const recentHandoff = this.listHandoff({ limit: 10 });
    const stats = this.getStats();
    const lines: string[] = [
      '# 🤝 Claude Bridge Briefing',
      '',
      '## Stats',
      `- Pending: ${stats.todos_pending} (critical: ${stats.todos_critical_pending})`,
      `- Resolved 7d: ${stats.todos_resolved_7d}`,
      `- Avg resolution: ${stats.avg_resolution_time_h}h`,
      '',
      '## Pending todos (top 20)',
    ];
    for (const t of pending) {
      lines.push(`- [${t.severity}][${t.type}] ${t.title} (${t.src} ${t.src_version ?? ''})`);
    }
    lines.push('');
    lines.push('## Recent handoff (10)');
    for (const e of recentHandoff) {
      lines.push(`- ${new Date(e.ts).toISOString().slice(0, 10)} ${e.by} → ${e.action}: ${e.notes.slice(0, 80)}`);
    }
    return lines.join('\n');
  }

  /**
   * Pipeline temps-réel Claude Code → Apex (Kevin 2026-05-07).
   * S'abonne aux events Firebase remote_change pour :
   * - auto-résoudre les todos quand Claude Code écrit un handoff entry avec action='fixed'
   * - émettre claude_bridge:handoff_received pour que l'UI affiche un toast doré
   *
   * Idempotent : appelable plusieurs fois (réutilise unique listener).
   */
  private listenerStarted = false;
  startListening(): void {
    if (this.listenerStarted) return;
    this.listenerStarted = true;
    events.on('firebase:remote_change', ({ key, data }) => {
      if (key !== HANDOFF_KEY || !data) return;
      try {
        const journal = (Array.isArray(data) ? data : []) as HandoffEntry[];
        /* Détecte nouvelles entries vs ce qu'on a déjà dans localStorage */
        const known = new Set(this.listHandoff().map((e) => e.id));
        const newEntries = journal.filter((e) => e && e.id && !known.has(e.id));
        for (const entry of newEntries) {
          /* Persist local pour qu'au prochain listHandoff() on l'inclue */
          try {
            const local = JSON.parse(localStorage.getItem(HANDOFF_KEY) ?? '[]') as HandoffEntry[];
            local.push(entry);
            if (local.length > MAX_HANDOFF) local.splice(0, local.length - MAX_HANDOFF);
            localStorage.setItem(HANDOFF_KEY, JSON.stringify(local));
          } catch { /* quota OK */ }
          /* Émet event UI (toast doré "Claude Code a fixé X") */
          events.emit('claude_bridge:handoff_received', {
            entry_id: entry.id,
            todo_id: entry.todo_id,
            by: entry.by,
          });
          /* Auto-résolution todo si action='fixed' et by != apex */
          if (entry.action === 'fixed' && entry.by !== 'apex' && entry.todo_id) {
            const todos = this.listTodos();
            const todo = todos.find((t) => t.id === entry.todo_id);
            if (todo && todo.status !== 'resolved') {
              todo.status = 'resolved';
              todo.resolved_ts = entry.ts;
              todo.resolved_by = entry.by;
              todo.fix_summary = entry.notes;
              if (entry.commit_sha) todo.fix_commit_sha = entry.commit_sha;
              try {
                localStorage.setItem(TODO_KEY, JSON.stringify(todos));
              } catch { /* quota OK */ }
              events.emit('claude_bridge:todo_resolved', {
                todo_id: entry.todo_id,
                ...(entry.commit_sha && { commit_sha: entry.commit_sha }),
                fix_summary: entry.notes,
              });
              void auditLog.record('claude_bridge.todo_auto_resolved', {
                details: { todo_id: entry.todo_id, by: entry.by, commit_sha: entry.commit_sha },
              });
              logger.info('claude-bridge', `✅ Todo ${entry.todo_id} auto-résolu par ${entry.by}`);
            }
          }
        }
      } catch (err: unknown) {
        logger.warn('claude-bridge', 'startListening handler error', { err });
      }
    });
    logger.info('claude-bridge', '🛰 Pipeline temps-réel actif (listener ax_handoff_journal)');
  }
}

export const claudeBridge = new ClaudeBridge();
/* Auto-start listener au chargement module (idempotent — guard listenerStarted) */
try {
  claudeBridge.startListening();
} catch { /* SSR / boot order tolérant */ }
