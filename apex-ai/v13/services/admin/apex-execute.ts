/**
 * APEX v13 — Apex Execute (pont autonome IA → Claude Code via GitHub Actions).
 *
 * @experimental v13.3.87 (Kevin audit externe brutal 2026-05-08) :
 * Service WIRÉ (apex-tools-dispatch.ts, services-bootstrap.ts, features/admin/index.ts,
 * apex-claude-code-parity.ts) MAIS jamais déclenché end-to-end en production
 * (stats Firebase: total=0, pending=0). Le system prompt (memory.ts) annonce ce
 * service comme "expérimental" tant que ≥5 round-trips réels n'ont pas été validés
 * (workflow apex-execute-bridge.yml doit recevoir → traiter → renvoyer résultat).
 * @see core/memory.ts section "Auto-modification autonomie totale ⚠️ EXPÉRIMENTAL"
 *
 * Demande Kevin 2026-05-04 :
 * "Apex doit pouvoir tout faire en autonomie totale. Mais Apex IA elle-même
 * reconnaît qu'elle ne peut pas exécuter code (juste générer plan).
 * Solution : pont autonome → quand Apex IA décide qu'il faut exécuter
 * quelque chose (modify file, run command, deploy, etc.), elle call
 * apex-execute qui pousse la tâche dans claude_todo + déclenche workflow
 * GitHub Actions qui utilise Claude Code Action pour vraiment exécuter."
 *
 * Architecture :
 * 1. Apex IA → requestExecution(task, params)
 * 2. Push payload dans ax_claude_todo (existant via claudeBridge)
 * 3. POST GitHub repository_dispatch event_type=apex-execute
 * 4. GitHub Actions workflow apex-execute.yml se déclenche
 * 5. Workflow Claude Code Action exécute vraiment + commit + push
 * 6. Apex polls résultat via GitHub Actions API + listPendingExecutions
 *
 * Sécurité (règle Kevin CLAUDE.md) :
 * - Whitelist stricte tâches autorisées (8 baseline + 14 extensions niveau MAX 2026-05-04)
 * - Forbidden tasks (sécurité avant autonomie) : delete_file, force_push, modify_credentials_external, etc.
 * - Path validation par task (ex: skill → .claude/skills/, hook → .claude/hooks/)
 * - Audit log immutable (avant + après) avec chaque task tracée
 * - PII redaction des params
 * - Rate-limit 50 exécutions / heure (anti-runaway)
 * - Snapshot git auto avant chaque batch sensible
 * - Auto-rollback si tests fail post-modif (orchestré côté workflow)
 *
 * Niveau MAX (Kevin 2026-05-04) — Apex peut modifier en autonomie :
 *   1. Son propre code TypeScript (modify_file/create_file)
 *   2. Scripts Node/Shell/Python (modify_script/create_script dans tools/)
 *   3. Skills (.claude/skills/*.md) — create_skill/modify_skill
 *   4. Hooks (.claude/hooks/*) — create_hook/modify_hook
 *   5. GitHub Actions workflows (.github/workflows/*.yml) — modify_workflow seulement
 *   6. Sentinelles registry runtime — register_sentinel/unregister_sentinel
 *   7. Mémoire (CLAUDE.md, NOTES_USER.md, MEMO_RESUME.md) — append_to_memory
 *   8. TOP_RULES system prompt — append_to_top_rules (append-only)
 *   9. Self-audit + auto-fix — self_audit_and_fix
 *  10. Rotation credentials 90j — rotate_credentials
 *  11. Sync 3 backends mémoire (Notion + Gist + Firebase) — sync_memory_bridge
 *  12. Release version (bump APP_VER + sw.js + build + push) — release_version
 *
 * Anti-pattern Kevin : pas d'eval, pas de new Function, dispatch whitelist + token validation.
 */

import { logger } from '../../core/logger.js';
import { claudeBridge } from '../ai/claude-bridge.js';
import { auditLog } from '../observability/audit-log.js';

/* === Types === */

/** Tâches autorisées (whitelist sécurité Kevin règle 1-clic + sécu avant autonomie). */
export type AllowedTask =
  | 'modify_file'
  | 'create_file'
  | 'run_test'
  | 'run_lint'
  | 'audit_repo'
  | 'deploy_canary'
  | 'backup_user_data'
  | 'restore_from_backup'
  /* Extensions niveau MAX autonomie 2026-05-04 */
  | 'create_skill'
  | 'modify_skill'
  | 'create_hook'
  | 'modify_hook'
  | 'modify_workflow'
  | 'register_sentinel'
  | 'unregister_sentinel'
  | 'modify_script'
  | 'create_script'
  | 'append_to_memory'
  | 'append_to_top_rules'
  | 'self_audit_and_fix'
  | 'rotate_credentials'
  | 'sync_memory_bridge'
  | 'release_version'
  /* v13.4.40 PARITÉ CLAUDE CODE Kevin 2026-05-14 "Parité apex total général optimal".
   * Tools de LECTURE + RECHERCHE + COMMUNICATION que Claude Code a et qu'Apex
   * doit avoir aussi (règle CLAUDE.md ABSOLUE 2026-05-04 "Apex = même accès"). */
  | 'read_file' /* Read tool — lire fichier */
  | 'list_files' /* ls — list directory */
  | 'grep_code' /* Grep tool — search pattern */
  | 'glob_pattern' /* Glob tool — find by name */
  | 'bash_safe' /* Bash whitelist commands */
  | 'web_fetch' /* WebFetch URL content */
  | 'web_search' /* WebSearch query */
  | 'spawn_subagent' /* Agent tool — délégation */
  | 'create_pr' /* GitHub MCP — create PR */
  | 'comment_on_pr' /* GitHub MCP — PR comment */
  | 'merge_pr_safe' /* GitHub MCP — merge (avec guards) */
  | 'create_issue' /* GitHub MCP — issue create */
  | 'close_issue_safe' /* GitHub MCP — close issue safe */
  | 'list_branches' /* GitHub MCP — branches list */
  | 'get_file_contents' /* GitHub MCP — fetch file remote */
  | 'search_code' /* GitHub MCP — search code repo */
  /* v13.4.90 — iOS Simulator auto-trigger (Kevin "Apex utilise iOS simulator pour
   * verif réel"). Apex IA peut déclencher Playwright WebKit iPhone 14 Pro via
   * workflow apex-ios-simulator.yml (repository_dispatch). Permission admin only. */
  | 'run_ios_e2e'; /* Déclenche tests E2E WebKit iPhone simulé */

/** Tâches INTERDITES (règle Kevin "sécurité avant autonomie totale"). */
export type ForbiddenTask =
  | 'delete_file'
  | 'force_push'
  | 'modify_user_credentials_external'
  | 'send_external_email_without_consent'
  /* Extensions interdites 2026-05-04 (anti-abus auto-modification) */
  | 'delete_skill'
  | 'delete_workflow'
  | 'delete_sentinel_critical'
  | 'modify_admin_kevin'
  | 'modify_top_rules_replace'
  | 'execute_shell_arbitrary'
  | 'modify_csp_meta'
  | 'disable_sentinel_security';

const ALLOWED_TASKS: ReadonlySet<AllowedTask> = new Set<AllowedTask>([
  'modify_file',
  'create_file',
  'run_test',
  'run_lint',
  'audit_repo',
  'deploy_canary',
  'backup_user_data',
  'restore_from_backup',
  'create_skill',
  'modify_skill',
  'create_hook',
  'modify_hook',
  'modify_workflow',
  'register_sentinel',
  'unregister_sentinel',
  'modify_script',
  'create_script',
  'append_to_memory',
  'append_to_top_rules',
  'self_audit_and_fix',
  'rotate_credentials',
  'sync_memory_bridge',
  'release_version',
  /* v13.4.40 PARITÉ CLAUDE CODE — Kevin "Parité apex total maximum optimal" */
  'read_file',
  'list_files',
  'grep_code',
  'glob_pattern',
  'bash_safe',
  'web_fetch',
  'web_search',
  'spawn_subagent',
  'create_pr',
  'comment_on_pr',
  'merge_pr_safe',
  'create_issue',
  'close_issue_safe',
  'list_branches',
  'get_file_contents',
  'search_code',
  /* v13.4.90 — iOS Simulator (Playwright WebKit iPhone 14 Pro) */
  'run_ios_e2e',
]);

/**
 * Event_type repository_dispatch ciblé selon la task.
 * - run_ios_e2e → 'apex_e2e_request' (déclenche apex-ios-simulator.yml = Playwright
 *   WebKit iPhone, l'équivalent "test visuel" qu'a Claude Code).
 * - tout le reste → 'apex-execute' (apex-execute.yml, runner générique).
 * v13.4.316 — corrige Erreur #28 (run_ios_e2e partait en 'apex-execute' → jamais lancé).
 */
export function eventTypeForTask(task: AllowedTask): 'apex_e2e_request' | 'apex-execute' {
  return task === 'run_ios_e2e' ? 'apex_e2e_request' : 'apex-execute';
}

const FORBIDDEN_TASKS: ReadonlySet<string> = new Set<string>([
  'delete_file',
  'force_push',
  'modify_user_credentials_external',
  'send_external_email_without_consent',
  /* niveau MAX additions */
  'delete_skill',
  'delete_workflow',
  'delete_sentinel_critical',
  'modify_admin_kevin',
  'modify_top_rules_replace',
  'execute_shell_arbitrary',
  'modify_csp_meta',
  'disable_sentinel_security',
]);

/** Sentinelles critiques jamais désactivables/supprimables (sécurité). */
const CRITICAL_SENTINELS: ReadonlySet<string> = new Set<string>([
  'security-watch',
  'token-watch',
  'sentinel-meta',
  'persistence-watch',
  'audit-chain-watch',
]);

/** Mémoire append-only autorisée. */
const MEMORY_FILES: ReadonlySet<string> = new Set<string>([
  'CLAUDE.md',
  'NOTES_USER.md',
  'MEMO_RESUME.md',
]);

/** Path roots universellement interdits (peu importe la task). */
const BANNED_PATH_ROOTS: readonly string[] = [
  'node_modules/',
  '.git/',
  '_archive_v12/',
  '.env',
  'package-lock.json',
];

/**
 * Fichiers PROTÉGÉS — irrévocables par self-modify (Kevin 2026-05-08).
 * Aucune task `modify_file`/`create_file`/`delete_file_safe` ne peut les toucher.
 * Si Apex tente de modifier ces fichiers via parité Claude Code → refusé + audit.
 *
 * Justification : ces fichiers définissent l'identité IRRÉVOCABLE d'Apex,
 * de Kevin, de Laurence ❤️, et les règles immuables. Une modification runtime
 * autonome casserait la source de vérité hardcodée.
 */
const PROTECTED_FILES: readonly string[] = [
  'apex-ai/v13/core/apex-identity.ts',
  'core/apex-identity.ts', /* path relatif depuis apex-ai/v13/ */
];

export type ExecutionStatus = 'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

export interface ExecutionParams {
  /** Pour modify_file/create_file/skill/hook/workflow/script : path relatif depuis racine repo */
  path?: string;
  /** Pour modify_file/create_file/skill/hook/script : contenu (utf-8 string) */
  content?: string;
  /** Pour modify_file : ancien contenu à remplacer (anti race) */
  old_content?: string;
  /** Pour run_test : commande test ou pattern */
  command?: string;
  /** Pour audit_repo : profondeur (shallow|deep|full) */
  depth?: 'shallow' | 'deep' | 'full';
  /** Pour deploy_canary : env cible (canary|staging|prod-readonly) */
  env?: 'canary' | 'staging' | 'prod-readonly';
  /** Pour backup_user_data / restore_from_backup */
  uid?: string;
  /** Pour restore_from_backup : timestamp snapshot */
  ts?: number;
  /** Pour register_sentinel/unregister_sentinel */
  sentinel_id?: string;
  sentinel_name?: string;
  sentinel_description?: string;
  sentinel_interval_ms?: number;
  /** Pour append_to_memory / append_to_top_rules : texte à ajouter (append-only) */
  append_text?: string;
  /** Pour self_audit_and_fix : confidence min pour appliquer fix auto (0..1) */
  min_confidence?: number;
  /** Pour rotate_credentials : nom credential à roter */
  credential_name?: string;
  /** Pour sync_memory_bridge : backends ciblés */
  backends?: Array<'notion' | 'gist' | 'firebase'>;
  /** Pour release_version : nouveau APP_VER */
  new_version?: string;
  /** Confirmation Kevin requise pour task sensible (release_version, modify_workflow) */
  confirmed_by_kevin?: boolean;
  /** v13.4.38 Kevin "Donne accès apex à ta branche" :
   * Branche cible pour le commit (default: 'claude/test-699LQ').
   * Override possible si Apex veut une branche dédiée par task. */
  target_branch?: string;
  /** Champs custom additionnels */
  [k: string]: unknown;
}

export interface ExecutionRequest {
  id: string;
  task: AllowedTask;
  params: ExecutionParams;
  status: ExecutionStatus;
  ts_created: number;
  ts_dispatched?: number;
  ts_completed?: number;
  todo_id?: string;
  workflow_run_id?: string;
  workflow_run_url?: string;
  result?: unknown;
  error?: string;
  /* Métadonnées pour audit / orchestration */
  src: string;
  src_version?: string;
  initiated_by: string; /* 'apex_ia' | 'admin' | 'auto_sentinel' */
  duration_ms?: number;
  /* Hashes pour audit diff (modify_*, append_*) */
  before_hash?: string;
  after_hash?: string;
  /* Snapshot git ref pris avant exécution (rollback possible) */
  git_snapshot_ref?: string;
}

export interface ExecuteOptions {
  /** Source projet (apex, cmcteams, kdmc, etc.) */
  src?: string;
  /** Version source (pour traçabilité) */
  src_version?: string;
  /** Qui a initié (apex_ia / admin / auto_sentinel) */
  initiated_by?: string;
  /** Skip GitHub dispatch (utile tests / mode offline) */
  skipDispatch?: boolean;
  /** Forcer ré-exécution même si rate-limit (admin only) */
  bypassRateLimit?: boolean;
  /** Skip snapshot git (utile tests) */
  skipSnapshot?: boolean;
}

export interface ExecuteResult {
  ok: boolean;
  request_id?: string;
  todo_id?: string;
  workflow_dispatched?: boolean;
  reason?: string;
  /* Hash diff résumé */
  before_hash?: string;
  after_hash?: string;
}

export interface ExecuteStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  success_rate: number;
  avg_duration_ms: number;
  by_task: Record<string, number>;
}

/* === Constantes === */

const STORAGE_KEY = 'apex_v13_executions';
const AUDIT_KEY = 'apex_v13_execute_audit';
const MAX_EXECUTIONS = 200;
const MAX_AUDIT_ENTRIES = 500;
const RATE_LIMIT_PER_HOUR = 50;
const TIMEOUT_MS = 15 * 60 * 1000; /* 15 min : workflow CI cap */
const GITHUB_REPO_OWNER = '9r4rxssx64-creator';
const GITHUB_REPO_NAME = 'cmcteams';
const GITHUB_DISPATCH_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`;
const GITHUB_ACTIONS_RUNS_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/runs`;

/* Tasks requérant confirmation explicite Kevin (push notif). */
const KEVIN_CONFIRM_TASKS: ReadonlySet<AllowedTask> = new Set<AllowedTask>([
  'release_version',
  'modify_workflow',
  'rotate_credentials',
]);

/* === Service === */

class ApexExecuteService {
  /**
   * Demande d'exécution autonome via Claude Code Action.
   * Path principal de l'API publique.
   */
  async requestExecution(
    task: AllowedTask | string,
    params: ExecutionParams = {},
    options: ExecuteOptions = {},
  ): Promise<ExecuteResult> {
    /* 1. Validation whitelist : tâche dans ALLOWED, pas dans FORBIDDEN */
    if (FORBIDDEN_TASKS.has(task)) {
      void auditLog.record('apex_execute.forbidden_task_blocked', {
        details: { task, params: this.redactParams(params) },
      });
      logger.warn('apex-execute', `Forbidden task blocked: ${task}`);
      return { ok: false, reason: `Tâche interdite par règle Kevin sécurité : ${task}` };
    }
    if (!ALLOWED_TASKS.has(task as AllowedTask)) {
      void auditLog.record('apex_execute.unknown_task_blocked', { details: { task } });
      logger.warn('apex-execute', `Unknown task blocked: ${task}`);
      return { ok: false, reason: `Tâche inconnue : ${task}` };
    }

    /* 2. Validation params spécifiques par tâche */
    const validation = this.validateParams(task as AllowedTask, params);
    if (!validation.ok) {
      void auditLog.record('apex_execute.validation_failed', {
        details: { task, reason: validation.reason },
      });
      return { ok: false, reason: validation.reason ?? 'Params invalides' };
    }

    /* 3. Rate-limit (anti runaway) */
    if (!options.bypassRateLimit && this.isRateLimited()) {
      void auditLog.record('apex_execute.rate_limited', { details: { task } });
      return { ok: false, reason: `Rate limit atteint (max ${RATE_LIMIT_PER_HOUR}/h). Attendre.` };
    }

    /* 4. Confirmation Kevin requise pour task sensible ? */
    if (KEVIN_CONFIRM_TASKS.has(task as AllowedTask) && !params.confirmed_by_kevin) {
      void auditLog.record('apex_execute.kevin_confirm_required', { details: { task } });
      return {
        ok: false,
        reason: `Confirmation Kevin requise pour ${task} (param confirmed_by_kevin:true). Push notif envoyée.`,
      };
    }

    /* 5. Création requête */
    const req: ExecutionRequest = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      task: task as AllowedTask,
      params: this.cloneParams(params),
      status: 'pending',
      ts_created: Date.now(),
      src: options.src ?? 'apex',
      ...(options.src_version && { src_version: options.src_version }),
      initiated_by: options.initiated_by ?? 'apex_ia',
    };

    /* 6. Hash before (pour modify_*, append_*) — basé sur old_content si fourni */
    if (typeof params['old_content'] === 'string') {
      req.before_hash = await this.simpleHash(params['old_content']);
    } else if (typeof params['content'] === 'string') {
      /* create_file : pas de before, juste after */
      req.after_hash = await this.simpleHash(params['content']);
    }
    if (typeof params['content'] === 'string' && req.before_hash) {
      req.after_hash = await this.simpleHash(params['content']);
    }

    /* 7. Snapshot git ref auto (utile rollback) — sauf si options.skipSnapshot */
    if (!options.skipSnapshot && this.taskRequiresSnapshot(task as AllowedTask)) {
      req.git_snapshot_ref = `apex-snapshot-${req.id}`;
    }

    /* 8. Push todo dans claude_todo (traçabilité bidirectionnelle) */
    try {
      const todo = await claudeBridge.pushTodo({
        type: this.mapTaskToTodoType(task as AllowedTask),
        src: req.src,
        ...(req.src_version && { src_version: req.src_version }),
        title: `[apex-execute] ${task}`,
        description: this.formatDescription(task as AllowedTask, params),
        severity: this.severityForTask(task as AllowedTask),
        context: { task, params: this.redactParams(params), exec_id: req.id },
      });
      req.todo_id = todo.id;
    } catch (err: unknown) {
      logger.warn('apex-execute', 'pushTodo failed (non-fatal)', { err });
    }

    /* 9. Persist request avant dispatch (récupération possible si crash) */
    this.persistRequest(req);

    /* 10. Audit log enrichi avant dispatch (immutable) */
    void auditLog.record('apex_execute.requested', {
      details: {
        id: req.id,
        task,
        src: req.src,
        initiated_by: req.initiated_by,
        before_hash: req.before_hash,
        after_hash: req.after_hash,
        path: typeof params['path'] === 'string' ? params['path'] : undefined,
      },
    });
    this.appendAuditEntry({
      ts: Date.now(),
      exec_id: req.id,
      task: req.task,
      initiated_by: req.initiated_by,
      path: typeof params['path'] === 'string' ? params['path'] : undefined,
      before_hash: req.before_hash,
      after_hash: req.after_hash,
      status: 'requested',
    });

    /* 11. Dispatch GitHub Actions (sauf si options.skipDispatch=true pour tests/offline) */
    let dispatched = false;
    if (!options.skipDispatch) {
      const dispatchResult = await this.dispatchWorkflow(req);
      dispatched = dispatchResult.ok;
      if (dispatched) {
        req.status = 'dispatched';
        req.ts_dispatched = Date.now();
        this.persistRequest(req);
      } else {
        if (dispatchResult.reason) req.error = dispatchResult.reason;
        /* On garde pending pour retry manuel possible — pas failed direct */
        this.persistRequest(req);
      }
    }

    logger.info('apex-execute', `Request created ${req.id} (task=${task}, dispatched=${dispatched})`);

    const result: ExecuteResult = {
      ok: true,
      request_id: req.id,
      workflow_dispatched: dispatched,
    };
    if (req.todo_id) result.todo_id = req.todo_id;
    if (req.before_hash) result.before_hash = req.before_hash;
    if (req.after_hash) result.after_hash = req.after_hash;
    return result;
  }

  /**
   * Liste exécutions en cours / récentes (admin only via UI).
   */
  listPendingExecutions(filters?: {
    status?: ExecutionStatus;
    task?: AllowedTask;
    src?: string;
    limit?: number;
  }): ExecutionRequest[] {
    const all = this.loadAll();
    let filtered = all;
    if (filters?.status) filtered = filtered.filter((r) => r.status === filters.status);
    if (filters?.task) filtered = filtered.filter((r) => r.task === filters.task);
    if (filters?.src) filtered = filtered.filter((r) => r.src === filters.src);
    filtered.sort((a, b) => b.ts_created - a.ts_created);
    if (filters?.limit && filters.limit > 0) filtered = filtered.slice(0, filters.limit);
    return filtered;
  }

  /**
   * Poll résultat d'une exécution.
   * Retourne status local. Si dispatched + workflow_run_id → tente API GitHub.
   */
  async pollResult(taskId: string): Promise<ExecutionRequest | null> {
    const all = this.loadAll();
    const req = all.find((r) => r.id === taskId);
    if (!req) return null;

    /* Détection timeout : pending/dispatched/running > TIMEOUT_MS */
    if (
      (req.status === 'pending' || req.status === 'dispatched' || req.status === 'running') &&
      Date.now() - req.ts_created > TIMEOUT_MS
    ) {
      req.status = 'timeout';
      req.ts_completed = Date.now();
      req.error = `Timeout après ${Math.round(TIMEOUT_MS / 60000)} min`;
      req.duration_ms = req.ts_completed - req.ts_created;
      this.persistRequest(req);
      return req;
    }

    /* Si workflow_run_id présent → check GitHub API status */
    if (req.workflow_run_id && (req.status === 'dispatched' || req.status === 'running')) {
      const updated = await this.fetchWorkflowStatus(req);
      if (updated) return updated;
    }

    return req;
  }

  /**
   * Annule une exécution pending/dispatched.
   * Si workflow déjà running on garde tel quel (la CI va terminer normalement).
   */
  cancelExecution(taskId: string): boolean {
    const all = this.loadAll();
    const req = all.find((r) => r.id === taskId);
    if (!req) return false;
    if (req.status === 'completed' || req.status === 'failed' || req.status === 'cancelled' || req.status === 'timeout') {
      return false; /* Déjà terminé */
    }
    req.status = 'cancelled';
    req.ts_completed = Date.now();
    req.duration_ms = req.ts_completed - req.ts_created;
    this.persistRequest(req);

    /* Auto-resolve todo associée (si claudeBridge dispo) */
    if (req.todo_id) {
      try {
        claudeBridge.resolveTodo(req.todo_id, 'apex_execute', 'cancelled by user/admin');
      } catch {
        /* skip */
      }
    }

    void auditLog.record('apex_execute.cancelled', { details: { id: taskId } });
    return true;
  }

  /**
   * Marquer terminé (appelé par GitHub Action callback ou polling).
   * Public pour permettre tests + integration backend.
   */
  markCompleted(taskId: string, result: unknown, error?: string): boolean {
    const all = this.loadAll();
    const req = all.find((r) => r.id === taskId);
    if (!req) return false;
    req.status = error ? 'failed' : 'completed';
    req.ts_completed = Date.now();
    req.duration_ms = req.ts_completed - req.ts_created;
    if (error) req.error = error;
    else req.result = result;
    this.persistRequest(req);
    if (req.todo_id) {
      try {
        claudeBridge.resolveTodo(req.todo_id, 'github-actions', error ?? `task ${req.task} OK`);
      } catch {
        /* skip */
      }
    }
    void auditLog.record('apex_execute.completed', {
      details: { id: taskId, ok: !error, duration_ms: req.duration_ms },
    });
    this.appendAuditEntry({
      ts: Date.now(),
      exec_id: req.id,
      task: req.task,
      initiated_by: req.initiated_by,
      status: error ? 'failed' : 'completed',
      error: error ?? undefined,
    });
    return true;
  }

  /**
   * Stats d'utilisation : success rate, avg duration, breakdown par task.
   */
  getStats(): ExecuteStats {
    const all = this.loadAll();
    const total = all.length;
    const pending = all.filter((r) => r.status === 'pending' || r.status === 'dispatched').length;
    const running = all.filter((r) => r.status === 'running').length;
    const completed = all.filter((r) => r.status === 'completed').length;
    const failed = all.filter((r) => r.status === 'failed' || r.status === 'timeout').length;
    const cancelled = all.filter((r) => r.status === 'cancelled').length;
    const finished = completed + failed;
    const successRate = finished > 0 ? Math.round((completed / finished) * 1000) / 10 : 0;
    const durations = all
      .filter((r) => r.duration_ms !== undefined && r.status === 'completed')
      .map((r) => r.duration_ms ?? 0);
    const avgDurationMs =
      durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;
    const byTask: Record<string, number> = {};
    for (const r of all) {
      byTask[r.task] = (byTask[r.task] ?? 0) + 1;
    }
    return {
      total,
      pending,
      running,
      completed,
      failed,
      cancelled,
      success_rate: successRate,
      avg_duration_ms: avgDurationMs,
      by_task: byTask,
    };
  }

  /**
   * Liste les tâches autorisées (pour UI / docs / IA system prompt).
   */
  listAllowedTasks(): readonly AllowedTask[] {
    return Array.from(ALLOWED_TASKS);
  }

  /**
   * Liste les tâches INTERDITES (pour UI / docs / sécu transparency).
   */
  listForbiddenTasks(): readonly string[] {
    return Array.from(FORBIDDEN_TASKS);
  }

  /**
   * Liste les sentinelles critiques (jamais désactivables).
   */
  listCriticalSentinels(): readonly string[] {
    return Array.from(CRITICAL_SENTINELS);
  }

  /**
   * Capabilities Apex auto-modification (pour UI admin + system prompt).
   */
  getCapabilities(): { allowed: number; forbidden: number; critical_sentinels: number; max_autonomy: boolean } {
    return {
      allowed: ALLOWED_TASKS.size,
      forbidden: FORBIDDEN_TASKS.size,
      critical_sentinels: CRITICAL_SENTINELS.size,
      max_autonomy: true,
    };
  }

  /**
   * Lit l'audit log enrichi (pour vue admin + debug).
   */
  getAuditLog(limit = 100): unknown[] {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown[];
      if (!Array.isArray(arr)) return [];
      return arr.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Purge exécutions terminées > 7 jours (lifecycle cleanup).
   */
  purgeOld(maxAgeMs: number = 7 * 24 * 3600 * 1000): number {
    const all = this.loadAll();
    const cutoff = Date.now() - maxAgeMs;
    const kept = all.filter(
      (r) =>
        !(
          (r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled' || r.status === 'timeout') &&
          (r.ts_completed ?? r.ts_created) < cutoff
        ),
    );
    const purged = all.length - kept.length;
    if (purged > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
      } catch {
        /* quota — skip */
      }
      logger.info('apex-execute', `purged ${purged} old executions`);
    }
    return purged;
  }

  /* === Privé : validation / dispatch / persist === */

  private validateParams(task: AllowedTask, params: ExecutionParams): { ok: boolean; reason?: string } {
    /* Validation universelle path (si présent) */
    if (typeof params['path'] === 'string') {
      const pathErr = this.validateUniversalPath(params['path']);
      if (pathErr) return { ok: false, reason: pathErr };
    }

    switch (task) {
      case 'modify_file':
      case 'create_file': {
        const path = String(params['path'] ?? '');
        if (!path) return { ok: false, reason: 'path requis' };
        /* Restriction zones autorisées (anti modif système) */
        const banned = ['.github/workflows/apex-execute.yml'];
        if (banned.some((b) => path.includes(b))) {
          return { ok: false, reason: `path protégé : ${path}` };
        }
        if (typeof params['content'] !== 'string') {
          return { ok: false, reason: 'content (string) requis' };
        }
        /* Cap content size 1 MB pour éviter abus */
        if ((params['content'] as string).length > 1024 * 1024) {
          return { ok: false, reason: 'content > 1 MB refusé' };
        }
        return { ok: true };
      }
      case 'run_test':
      case 'run_lint':
        return { ok: true };
      case 'audit_repo': {
        const depth = params['depth'];
        if (depth && !['shallow', 'deep', 'full'].includes(String(depth))) {
          return { ok: false, reason: 'depth doit être shallow|deep|full' };
        }
        return { ok: true };
      }
      case 'deploy_canary': {
        const env = params['env'];
        if (!env || !['canary', 'staging', 'prod-readonly'].includes(String(env))) {
          return { ok: false, reason: 'env requis (canary|staging|prod-readonly)' };
        }
        return { ok: true };
      }
      case 'backup_user_data':
      case 'restore_from_backup': {
        const uid = params['uid'];
        if (!uid || typeof uid !== 'string') {
          return { ok: false, reason: 'uid requis' };
        }
        if (task === 'restore_from_backup' && !params['ts']) {
          return { ok: false, reason: 'ts (timestamp snapshot) requis pour restore' };
        }
        return { ok: true };
      }
      /* === Niveau MAX autonomie 2026-05-04 === */
      case 'create_skill':
      case 'modify_skill': {
        const path = String(params['path'] ?? '');
        if (!path) return { ok: false, reason: 'path requis' };
        if (!path.startsWith('.claude/skills/')) {
          return { ok: false, reason: 'path doit être dans .claude/skills/' };
        }
        if (!path.endsWith('.md')) {
          return { ok: false, reason: 'skill doit être .md' };
        }
        if (typeof params['content'] !== 'string') {
          return { ok: false, reason: 'content (string) requis' };
        }
        if ((params['content'] as string).length > 256 * 1024) {
          return { ok: false, reason: 'skill content > 256 KB refusé' };
        }
        return { ok: true };
      }
      case 'create_hook':
      case 'modify_hook': {
        const path = String(params['path'] ?? '');
        if (!path) return { ok: false, reason: 'path requis' };
        if (!path.startsWith('.claude/hooks/')) {
          return { ok: false, reason: 'path doit être dans .claude/hooks/' };
        }
        if (typeof params['content'] !== 'string') {
          return { ok: false, reason: 'content (string) requis' };
        }
        return { ok: true };
      }
      case 'modify_workflow': {
        const path = String(params['path'] ?? '');
        if (!path) return { ok: false, reason: 'path requis' };
        if (!path.startsWith('.github/workflows/')) {
          return { ok: false, reason: 'path doit être dans .github/workflows/' };
        }
        if (!path.endsWith('.yml') && !path.endsWith('.yaml')) {
          return { ok: false, reason: 'workflow doit être .yml/.yaml' };
        }
        if (path.includes('apex-execute.yml')) {
          return { ok: false, reason: 'apex-execute.yml protégé (auto-référent)' };
        }
        if (typeof params['content'] !== 'string') {
          return { ok: false, reason: 'content (string) requis' };
        }
        return { ok: true };
      }
      case 'register_sentinel': {
        const id = String(params['sentinel_id'] ?? '');
        if (!id || !/^[a-z0-9_-]+$/i.test(id)) {
          return { ok: false, reason: 'sentinel_id requis (alphanumeric + - _)' };
        }
        if (!params['sentinel_name'] || !params['sentinel_description']) {
          return { ok: false, reason: 'sentinel_name + sentinel_description requis' };
        }
        const interval = Number(params['sentinel_interval_ms'] ?? 0);
        if (!interval || interval < 60 * 1000) {
          return { ok: false, reason: 'sentinel_interval_ms >= 60000 requis' };
        }
        return { ok: true };
      }
      case 'unregister_sentinel': {
        const id = String(params['sentinel_id'] ?? '');
        if (!id) return { ok: false, reason: 'sentinel_id requis' };
        if (CRITICAL_SENTINELS.has(id)) {
          return { ok: false, reason: `sentinelle critique ${id} non désactivable` };
        }
        return { ok: true };
      }
      case 'modify_script':
      case 'create_script': {
        const path = String(params['path'] ?? '');
        if (!path) return { ok: false, reason: 'path requis' };
        if (!path.startsWith('tools/') && !path.startsWith('scripts/')) {
          return { ok: false, reason: 'path doit être dans tools/ ou scripts/' };
        }
        if (!/\.(js|sh|py|mjs|cjs|ts)$/.test(path)) {
          return { ok: false, reason: 'script doit être .js/.sh/.py/.mjs/.cjs/.ts' };
        }
        if (typeof params['content'] !== 'string') {
          return { ok: false, reason: 'content (string) requis' };
        }
        return { ok: true };
      }
      case 'append_to_memory': {
        const path = String(params['path'] ?? '');
        if (!MEMORY_FILES.has(path)) {
          return { ok: false, reason: `path doit être un de : ${Array.from(MEMORY_FILES).join(', ')}` };
        }
        const text = params['append_text'];
        if (typeof text !== 'string' || !text.trim()) {
          return { ok: false, reason: 'append_text (string non vide) requis' };
        }
        if (text.length > 10000) {
          return { ok: false, reason: 'append_text > 10000 chars refusé' };
        }
        return { ok: true };
      }
      case 'append_to_top_rules': {
        const text = params['append_text'];
        if (typeof text !== 'string' || !text.trim()) {
          return { ok: false, reason: 'append_text (string non vide) requis' };
        }
        if (text.length > 500) {
          return { ok: false, reason: 'append_text > 500 chars (règle trop longue)' };
        }
        return { ok: true };
      }
      case 'self_audit_and_fix': {
        const conf = params['min_confidence'];
        if (conf !== undefined) {
          const n = Number(conf);
          if (Number.isNaN(n) || n < 0 || n > 1) {
            return { ok: false, reason: 'min_confidence ∈ [0..1]' };
          }
          if (n < 0.5) {
            return { ok: false, reason: 'min_confidence trop bas (recommandé ≥0.95)' };
          }
        }
        return { ok: true };
      }
      case 'rotate_credentials': {
        const name = String(params['credential_name'] ?? '');
        if (!name) return { ok: false, reason: 'credential_name requis' };
        if (!/^ax_[a-z0-9_]+$/i.test(name)) {
          return { ok: false, reason: 'credential_name doit matcher ax_* (vault key)' };
        }
        return { ok: true };
      }
      case 'sync_memory_bridge': {
        const backends = params['backends'];
        if (!Array.isArray(backends) || backends.length === 0) {
          return { ok: false, reason: 'backends requis (array non vide)' };
        }
        const valid = ['notion', 'gist', 'firebase'];
        for (const b of backends) {
          if (!valid.includes(String(b))) {
            return { ok: false, reason: `backend invalide : ${String(b)}` };
          }
        }
        return { ok: true };
      }
      case 'release_version': {
        const v = String(params['new_version'] ?? '');
        if (!v) return { ok: false, reason: 'new_version requis (ex: v13.0.21)' };
        if (!/^v\d+\.\d+\.\d+$/.test(v)) {
          return { ok: false, reason: 'new_version doit matcher vX.Y.Z' };
        }
        return { ok: true };
      }
      default:
        return { ok: false, reason: 'tâche inconnue' };
    }
  }

  /**
   * Validation universelle de path (anti path traversal + zones bannies + protégées).
   */
  private validateUniversalPath(path: string): string | null {
    if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
      return 'path invalide (relatif obligatoire, pas de ..)';
    }
    for (const banned of BANNED_PATH_ROOTS) {
      if (path.startsWith(banned) || path.includes('/' + banned)) {
        return `path banni : ${banned}`;
      }
    }
    /* Path absolu Windows (C:\) */
    if (/^[A-Z]:\\/.test(path)) {
      return 'path absolu Windows interdit';
    }
    /* Fichiers PROTÉGÉS — identité irrévocable Apex/Kevin/Laurence (Kevin 2026-05-08). */
    const norm = path.replace(/\\/g, '/');
    for (const protectedFile of PROTECTED_FILES) {
      if (norm === protectedFile || norm.endsWith('/' + protectedFile)) {
        return `path protégé (identité irrévocable) : ${path}`;
      }
    }
    return null;
  }

  private taskRequiresSnapshot(task: AllowedTask): boolean {
    return [
      'modify_file',
      'modify_skill',
      'modify_hook',
      'modify_workflow',
      'modify_script',
      'append_to_memory',
      'append_to_top_rules',
      'release_version',
    ].includes(task);
  }

  private mapTaskToTodoType(
    task: AllowedTask,
  ): 'fix_bug' | 'add_feature' | 'investigate' | 'add_test' | 'security_finding' | 'performance_issue' {
    switch (task) {
      case 'modify_file':
      case 'create_file':
      case 'modify_script':
      case 'create_script':
        return 'fix_bug';
      case 'run_test':
      case 'run_lint':
        return 'add_test';
      case 'audit_repo':
      case 'self_audit_and_fix':
        return 'investigate';
      case 'deploy_canary':
      case 'release_version':
      case 'create_skill':
      case 'modify_skill':
      case 'create_hook':
      case 'modify_hook':
      case 'register_sentinel':
        return 'add_feature';
      case 'modify_workflow':
        return 'add_feature';
      case 'unregister_sentinel':
      case 'rotate_credentials':
        return 'security_finding';
      case 'sync_memory_bridge':
        return 'performance_issue';
      case 'append_to_memory':
      case 'append_to_top_rules':
      case 'backup_user_data':
      case 'restore_from_backup':
        return 'fix_bug';
      default:
        return 'investigate';
    }
  }

  private severityForTask(task: AllowedTask): 'critical' | 'high' | 'medium' | 'low' {
    switch (task) {
      case 'restore_from_backup':
      case 'deploy_canary':
      case 'release_version':
      case 'rotate_credentials':
      case 'modify_workflow':
        return 'high';
      case 'modify_file':
      case 'create_file':
      case 'backup_user_data':
      case 'modify_script':
      case 'create_script':
      case 'append_to_memory':
      case 'append_to_top_rules':
      case 'modify_skill':
      case 'modify_hook':
      case 'register_sentinel':
      case 'unregister_sentinel':
        return 'medium';
      default:
        return 'low';
    }
  }

  private formatDescription(task: AllowedTask, params: ExecutionParams): string {
    const parts: string[] = [`Task: ${task}`];
    if (params['path']) parts.push(`Path: ${String(params['path'])}`);
    if (params['env']) parts.push(`Env: ${String(params['env'])}`);
    if (params['depth']) parts.push(`Depth: ${String(params['depth'])}`);
    if (params['command']) parts.push(`Cmd: ${String(params['command']).slice(0, 100)}`);
    if (params['uid']) parts.push(`UID: ${String(params['uid'])}`);
    if (params['sentinel_id']) parts.push(`Sentinel: ${String(params['sentinel_id'])}`);
    if (params['credential_name']) parts.push(`Credential: ${String(params['credential_name'])}`);
    if (params['new_version']) parts.push(`Version: ${String(params['new_version'])}`);
    if (params['append_text']) {
      const t = String(params['append_text']);
      parts.push(`Append: ${t.length > 80 ? t.slice(0, 80) + '...' : t}`);
    }
    return parts.join('\n');
  }

  /**
   * Redaction PII pour audit log (cap content size, masque secrets éventuels).
   */
  private redactParams(params: ExecutionParams): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if ((k === 'content' || k === 'append_text') && typeof v === 'string') {
        safe[k] = v.length > 200 ? v.slice(0, 200) + `...[${v.length - 200} chars truncated]` : v;
      } else if (k === 'old_content' && typeof v === 'string') {
        safe[k] = v.length > 200 ? v.slice(0, 200) + '...' : v;
      } else if (typeof v === 'string' && /^(sk-|pk_|xkeysib-|ghp_|gho_|github_pat_)/.test(v)) {
        safe[k] = `[REDACTED ${v.slice(0, 6)}***]`;
      } else {
        safe[k] = v;
      }
    }
    return safe;
  }

  private cloneParams(params: ExecutionParams): ExecutionParams {
    try {
      return JSON.parse(JSON.stringify(params)) as ExecutionParams;
    } catch {
      return { ...params };
    }
  }

  /**
   * Hash simple SHA-256 → hex (8 premiers chars pour audit court).
   * Fallback : hash JS rapide non-crypto si subtle indispo.
   */
  private async simpleHash(s: string): Promise<string> {
    try {
      if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
        const buf = new TextEncoder().encode(s);
        const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        return hex.slice(0, 16);
      }
    } catch {
      /* fallback */
    }
    /* Fallback djb2 hash 32-bit */
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = (h * 33) ^ s.charCodeAt(i);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Append entry au registre audit dédié (séparé de auditLog hash chain).
   */
  private appendAuditEntry(entry: Record<string, unknown>): void {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      const arr = (raw ? JSON.parse(raw) : []) as unknown[];
      const list = Array.isArray(arr) ? arr : [];
      list.push(entry);
      const trimmed = list.length > MAX_AUDIT_ENTRIES ? list.slice(-MAX_AUDIT_ENTRIES) : list;
      localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
    } catch {
      /* quota — skip */
    }
  }

  /**
   * Rate limit : max RATE_LIMIT_PER_HOUR exécutions / heure rolling.
   */
  private isRateLimited(): boolean {
    const all = this.loadAll();
    const oneHourAgo = Date.now() - 3600 * 1000;
    const recent = all.filter((r) => r.ts_created >= oneHourAgo);
    return recent.length >= RATE_LIMIT_PER_HOUR;
  }

  /**
   * Persist (avec cap MAX_EXECUTIONS, trim oldest finished first).
   */
  private persistRequest(req: ExecutionRequest): void {
    const all = this.loadAll();
    const idx = all.findIndex((r) => r.id === req.id);
    if (idx >= 0) {
      all[idx] = req;
    } else {
      all.push(req);
    }
    if (all.length > MAX_EXECUTIONS) {
      /* Trim : terminés en premier, puis vieux pending */
      all.sort((a, b) => {
        const aFinished = ['completed', 'failed', 'cancelled', 'timeout'].includes(a.status) ? 1 : 0;
        const bFinished = ['completed', 'failed', 'cancelled', 'timeout'].includes(b.status) ? 1 : 0;
        if (aFinished !== bFinished) return bFinished - aFinished;
        return a.ts_created - b.ts_created;
      });
      all.splice(0, all.length - MAX_EXECUTIONS);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (err: unknown) {
      logger.warn('apex-execute', 'persist failed (quota?)', { err });
    }
  }

  private loadAll(): ExecutionRequest[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as ExecutionRequest[];
    } catch {
      return [];
    }
  }

  /**
   * Dispatch GitHub Actions repository_dispatch event.
   * Nécessite GitHub PAT scopé (repo) stocké dans Vault.
   */
  private async dispatchWorkflow(req: ExecutionRequest): Promise<{ ok: boolean; reason?: string }> {
    const token = this.getGitHubToken();
    if (!token) {
      return { ok: false, reason: 'GitHub token absent (vault key ax_github_token requis)' };
    }
    /* v13.4.316 (Kevin "vérifie qu'Apex utilise bien ces outils comme toi") —
     * Erreur #28 corrigée : run_ios_e2e DOIT viser apex-ios-simulator.yml qui
     * écoute event_type 'apex_e2e_request' (npx playwright test WebKit iPhone).
     * Avant, TOUS les tasks partaient en 'apex-execute' → le workflow Playwright
     * iPhone d'Apex ne se déclenchait JAMAIS (sa parité "visuel" était morte). */
    const eventType = eventTypeForTask(req.task);
    const payload = {
      event_type: eventType,
      client_payload: {
        exec_id: req.id,
        task: req.task,
        params: this.redactParams(req.params),
        src: req.src,
        src_version: req.src_version,
        ts: req.ts_created,
      },
    };
    try {
      const res = await fetch(GITHUB_DISPATCH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 204) {
        /* Dispatch OK, GitHub n'a pas de run_id avant que le job ne démarre.
           On laisse fetchWorkflowStatus le retrouver via timestamp. */
        void auditLog.record('apex_execute.dispatched', {
          details: { id: req.id, task: req.task },
        });
        return { ok: true };
      }
      const text = await res.text().catch(() => '');
      return { ok: false, reason: `GitHub dispatch HTTP ${res.status}: ${text.slice(0, 100)}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `Network error: ${msg}` };
    }
  }

  /**
   * Recherche workflow run associé à exec_id (par recherche timestamp + event).
   */
  private async fetchWorkflowStatus(req: ExecutionRequest): Promise<ExecutionRequest | null> {
    const token = this.getGitHubToken();
    if (!token) return null;
    try {
      const url = `${GITHUB_ACTIONS_RUNS_URL}?event=repository_dispatch&per_page=20`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        workflow_runs?: Array<{ id: number; status: string; conclusion: string | null; html_url: string; created_at: string; name: string }>;
      };
      const runs = data.workflow_runs ?? [];
      /* Match approximatif : run créé après ts_dispatched */
      const candidate = runs.find((r) => {
        if (!r.name?.toLowerCase().includes('apex')) return false;
        const created = Date.parse(r.created_at);
        return created >= (req.ts_dispatched ?? req.ts_created);
      });
      if (!candidate) return req;
      req.workflow_run_id = String(candidate.id);
      req.workflow_run_url = candidate.html_url;
      if (candidate.status === 'completed') {
        if (candidate.conclusion === 'success') {
          req.status = 'completed';
          req.result = { conclusion: 'success', url: candidate.html_url };
        } else {
          req.status = 'failed';
          req.error = `Workflow ${candidate.conclusion}`;
        }
        req.ts_completed = Date.now();
        req.duration_ms = req.ts_completed - req.ts_created;
      } else if (candidate.status === 'in_progress' || candidate.status === 'queued') {
        req.status = 'running';
      }
      this.persistRequest(req);
      return req;
    } catch {
      return null;
    }
  }

  /**
   * Récupère token GitHub depuis Vault (ou localStorage en fallback dev).
   */
  private getGitHubToken(): string | null {
    try {
      const direct = localStorage.getItem('ax_github_token');
      if (direct) return direct;
      const fromVault = localStorage.getItem('apex_v13_vault_ax_github_token');
      if (fromVault) return fromVault;
      return null;
    } catch {
      return null;
    }
  }
}

export const apexExecute = new ApexExecuteService();
