/**
 * APEX v13.4.5 — Mode Autonome Apex (Kevin 2026-05-10).
 *
 * Demande Kevin :
 *   "Mode Autonome Apex où Apex IA prend le relais après commande chat et bosse SEUL
 *    jusqu'à épuisement forfait Anthropic (quota tokens) ou stop manuel."
 *
 * Plus avancé que autonomous-loop.ts (queue tasks simple) :
 *  - 1 SESSION centrée sur un OBJECTIF
 *  - Auto-décomposition en sous-tâches (l'IA propose la suite)
 *  - Détection quota Anthropic via consumption-monitor → arrêt gracieux + notif Telegram
 *  - Triple persistence (localStorage + IDB shadow via firebase-queue + Firebase sync)
 *  - Cross-device via firebase-queue (slash /autonomous sur iPhone → autre device prend le relais)
 *  - Garde-fous : maxIterations, quotaLimit, timeout par task, cooldown, anti-boucle
 *
 * Wire :
 *  - Slash command `/autonomous <objectif>` ouvre une session
 *  - Sentinelle autonomous-watch.ts tick toutes les 30s
 *  - Vue admin `admin-autonomous` pour monitoring + kill switch
 *  - GitHub Action `apex-autonomous-watcher.yml` cron 5min si app fermée
 *  - Telegram notif quand quota_exhausted
 *
 * Anti-patterns évités (CLAUDE.md erreurs) :
 *  - #28 Declaration ≠ Deployment : wired dans bootstrap + tick fonctionnel
 *  - #50 régression : pas de modif des services existants (sentinels.ts, ai-router.ts)
 *  - #55 XOR-obf device-bound : pas de crypto exotique, persistence simple JSON
 */

import { logger } from '../../core/logger.js';
import { aiRouter, type ChatMessage } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';
import { firebaseQueue } from '../storage/firebase-queue.js';

/** Statut d'une session autonome */
export type AutonomousStatus =
  | 'running'
  | 'paused'
  | 'stopped'
  | 'quota_exhausted'
  | 'completed'
  | 'failed';

/** Statut d'une task individuelle */
export type AutonomousTaskStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface AutonomousTask {
  id: string;
  description: string;
  status: AutonomousTaskStatus;
  output?: string;
  error?: string;
  /** ID de la task qui a spawn celle-ci (None = task initiale) */
  spawnedFrom?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AutonomousSession {
  id: string;
  initialObjective: string;
  startedAt: number;
  status: AutonomousStatus;
  taskQueue: AutonomousTask[];
  tasksCompleted: AutonomousTask[];
  tokensConsumed: number;
  lastActivityAt: number;
  iterations: number;
  /** Logs courts pour UI live */
  logs: Array<{ ts: number; msg: string; level: 'info' | 'warn' | 'error' }>;
  endedAt?: number;
  endReason?: string;
}

export interface AutonomousStartOptions {
  maxIterations?: number;
  quotaLimit?: number; /* tokens (cumulés) max ; default 50000 */
}

const ACTIVE_KEY = 'apex_v13_autonomous_active';
const HISTORY_KEY = 'apex_v13_autonomous_history';
const HISTORY_CAP = 20;
const LOGS_CAP = 50;
const TASK_TIMEOUT_MS = 5 * 60 * 1000; /* 5 min par task */
const DEFAULT_MAX_ITERATIONS = 50;
const HARD_CAP_ITERATIONS = 200;
const DEFAULT_QUOTA_TOKENS = 50000; /* ~5€ Sonnet 4.6 input+output */
const MIN_TICK_INTERVAL_MS = 3000; /* anti-spam tick */
const FIREBASE_QUEUE_KEY = 'apex/autonomous_sessions';

/* Heuristique 1 token ≈ 4 chars FR/EN */
const CHARS_PER_TOKEN = 4;

/* Regex détection sous-tâches : "1. ... 2. ... 3. ..." OU "- ... - ... - ..." */
const SUBTASK_LINE_RE = /^\s*(?:\d+[.)]|[-*])\s+(.{8,200})$/gm;

/* Marqueurs de fin de session injectés dans le prompt */
const COMPLETION_MARKERS = ['TERMINÉ', 'TERMINE', 'FINI', 'DONE', 'OBJECTIF ATTEINT'];

class ApexAutonomousMode {
  private currentSession: AutonomousSession | null = null;
  private lastTickAt = 0;
  /** AbortController pour stop() pendant tick */
  private currentAbort: AbortController | null = null;

  constructor() {
    /* Auto-restore au boot */
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as AutonomousSession;
        if (s && s.status === 'running') {
          /* Si lastActivityAt > 30min → marque stopped (était orphelin) */
          if (Date.now() - s.lastActivityAt > 30 * 60 * 1000) {
            s.status = 'stopped';
            s.endReason = 'orphaned-on-boot';
            s.endedAt = Date.now();
            this.archive(s);
          } else {
            this.currentSession = s;
            this.log('info', `Session restaurée au boot : ${s.id}`);
          }
        } else if (s && s.status === 'paused') {
          this.currentSession = s; /* keep paused */
        }
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Démarre une nouvelle session autonome.
   * Si une session est déjà active → la stoppe d'abord (1 session à la fois).
   */
  async start(objective: string, opts: AutonomousStartOptions = {}): Promise<AutonomousSession> {
    const obj = (objective || '').trim();
    if (!obj) throw new Error('Objectif vide');
    if (obj.length > 2000) throw new Error('Objectif trop long (max 2000 chars)');

    /* Si session déjà active → stoppe avant nouvelle */
    if (this.currentSession && this.currentSession.status === 'running') {
      this.stop(this.currentSession.id, 'replaced-by-new-session');
    }

    const maxIter = Math.min(opts.maxIterations ?? DEFAULT_MAX_ITERATIONS, HARD_CAP_ITERATIONS);
    const quotaLimit = opts.quotaLimit ?? DEFAULT_QUOTA_TOKENS;

    const session: AutonomousSession = {
      id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      initialObjective: obj.slice(0, 2000),
      startedAt: Date.now(),
      status: 'running',
      taskQueue: [
        {
          id: `task_${Date.now()}_0`,
          description: obj.slice(0, 2000),
          status: 'pending',
        },
      ],
      tasksCompleted: [],
      tokensConsumed: 0,
      lastActivityAt: Date.now(),
      iterations: 0,
      logs: [
        {
          ts: Date.now(),
          msg: `Session démarrée. Objectif : "${obj.slice(0, 120)}". maxIter=${maxIter}, quotaLimit=${quotaLimit} tokens.`,
          level: 'info',
        },
      ],
    };
    /* On stocke maxIter/quotaLimit dans la session via logs (immutables ensuite) */
    (session as AutonomousSession & { maxIterations: number; quotaLimit: number }).maxIterations = maxIter;
    (session as AutonomousSession & { maxIterations: number; quotaLimit: number }).quotaLimit = quotaLimit;

    this.currentSession = session;
    this.persist();
    this.pushFirebase('start', session);
    await auditLog.record('autonomous.start', { details: { id: session.id, objective: obj.slice(0, 100) } });
    logger.info('apex-autonomous-mode', `Started session ${session.id}`);
    return session;
  }

  /** Stoppe la session active (kill switch user) */
  stop(sessionId?: string, reason = 'manual-stop'): void {
    const s = this.currentSession;
    if (!s) return;
    if (sessionId && s.id !== sessionId) return;
    this.currentAbort?.abort();
    this.currentAbort = null;
    s.status = 'stopped';
    s.endedAt = Date.now();
    s.endReason = reason;
    this.log('warn', `Session arrêtée : ${reason}`);
    this.archive(s);
    this.currentSession = null;
    this.persist();
    this.pushFirebase('stop', s);
    void auditLog.record('autonomous.stop', { details: { id: s.id, reason } });
  }

  /** Pause/resume */
  pause(): void {
    const s = this.currentSession;
    if (!s || s.status !== 'running') return;
    s.status = 'paused';
    this.log('info', 'Session pausée');
    this.persist();
    this.pushFirebase('pause', s);
  }

  resume(): void {
    const s = this.currentSession;
    if (!s || s.status !== 'paused') return;
    s.status = 'running';
    s.lastActivityAt = Date.now();
    this.log('info', 'Session reprise');
    this.persist();
    this.pushFirebase('resume', s);
  }

  /** Snapshot session active (null si aucune) */
  getActiveSession(): AutonomousSession | null {
    return this.currentSession;
  }

  /** Historique sessions clos */
  getHistory(limit = HISTORY_CAP): AutonomousSession[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as AutonomousSession[];
      return Array.isArray(arr) ? arr.slice(-limit).reverse() : [];
    } catch {
      return [];
    }
  }

  /** Helper externe : indique si une session active est en running */
  isRunning(): boolean {
    return this.currentSession?.status === 'running';
  }

  /**
   * Appelé par sentinelle autonomous-watch toutes les 30s.
   * Fait avancer la session active si possible.
   */
  async tick(): Promise<void> {
    const now = Date.now();
    if (now - this.lastTickAt < MIN_TICK_INTERVAL_MS) return;
    this.lastTickAt = now;

    const s = this.currentSession;
    if (!s) return;
    if (s.status !== 'running') return;

    /* Quota check (avant tout appel IA) */
    const quotaCheck = await this.checkQuota(s);
    if (quotaCheck.exhausted) {
      s.status = 'quota_exhausted';
      s.endedAt = now;
      s.endReason = quotaCheck.reason;
      this.log('warn', `Quota épuisé : ${quotaCheck.reason}`);
      this.archive(s);
      this.pushFirebase('quota_exhausted', s);
      await auditLog.record('autonomous.quota_exhausted', { details: { id: s.id, reason: quotaCheck.reason } });
      /* Notif Kevin Telegram non-bloquant */
      void this.notifyKevinQuotaExhausted(s);
      this.currentSession = null;
      this.persist();
      return;
    }

    /* Check iterations / queue */
    const maxIter = (s as AutonomousSession & { maxIterations?: number }).maxIterations ?? DEFAULT_MAX_ITERATIONS;
    if (s.iterations >= maxIter) {
      this.complete(s, `max iterations atteint (${maxIter})`);
      return;
    }
    const next = s.taskQueue.find((t) => t.status === 'pending');
    if (!next) {
      /* Vérifie aussi qu'il n'y a pas de in_progress qui timeout */
      const stuck = s.taskQueue.find((t) => t.status === 'in_progress');
      if (stuck && stuck.startedAt && now - stuck.startedAt > TASK_TIMEOUT_MS) {
        stuck.status = 'failed';
        stuck.error = 'timeout 5min';
        s.tasksCompleted.push(stuck);
        s.taskQueue = s.taskQueue.filter((t) => t.id !== stuck.id);
        this.log('error', `Task timeout : ${stuck.description.slice(0, 60)}`);
        this.persist();
        return;
      }
      if (!stuck) {
        this.complete(s, 'queue vide, objectif accompli');
        return;
      }
      return; /* a in_progress encore dans la fenêtre */
    }

    /* Marquer in_progress */
    next.status = 'in_progress';
    next.startedAt = now;
    s.iterations += 1;
    s.lastActivityAt = now;
    this.persist();
    this.log('info', `▶️ Task ${s.iterations} : ${next.description.slice(0, 100)}`);

    /* Build prompt enrichi */
    const messages = this.buildMessages(s, next);
    const system = this.buildSystemPrompt(s);

    let collected = '';
    let streamError: Error | undefined;
    this.currentAbort = new AbortController();
    try {
      await aiRouter.stream(
        messages,
        system,
        (chunk) => {
          if (chunk.text) collected += chunk.text;
        },
        (err) => {
          streamError = err;
        },
      );
    } catch (err: unknown) {
      streamError = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.currentAbort = null;
    }

    /* Track tokens (heuristique chars/4) */
    const tokensThis =
      Math.ceil(
        (messages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0) +
          system.length +
          collected.length) /
          CHARS_PER_TOKEN,
      );
    s.tokensConsumed += tokensThis;

    if (streamError || !collected) {
      next.status = 'failed';
      next.error = streamError?.message ?? 'no output from IA';
      next.completedAt = Date.now();
      this.log('error', `❌ Task échouée : ${next.error.slice(0, 100)}`);
      /* 3 fails consécutifs → fail session */
      const recentFails = s.tasksCompleted
        .slice(-2)
        .filter((t) => t.status === 'failed').length;
      if (recentFails >= 2) {
        s.status = 'failed';
        s.endedAt = Date.now();
        s.endReason = '3 task fails consécutifs';
        this.archive(s);
        this.pushFirebase('failed', s);
        this.currentSession = null;
        this.persist();
        return;
      }
    } else {
      next.status = 'done';
      next.output = collected.slice(0, 4000);
      next.completedAt = Date.now();
      this.log('info', `✅ Task done (${tokensThis} tokens, ${collected.length} chars sortie)`);

      /* Détection completion marker */
      const upper = collected.toUpperCase();
      const completed = COMPLETION_MARKERS.some((m) => upper.includes(m));

      /* Détection sous-tâches dans la réponse */
      const subtasks = this.extractSubtasks(collected, next.id);
      if (!completed && subtasks.length > 0) {
        /* Cap : max 5 sous-tâches par task pour éviter explosion */
        const toAdd = subtasks.slice(0, 5);
        s.taskQueue.push(...toAdd);
        this.log('info', `📋 ${toAdd.length} sous-tâche(s) ajoutée(s)`);
      } else if (completed) {
        this.log('info', '🎯 Marqueur fin détecté dans réponse');
        /* On laisse la queue se vider naturellement au prochain tick */
      }
    }

    /* Move next out of queue → completed */
    s.taskQueue = s.taskQueue.filter((t) => t.id !== next.id);
    s.tasksCompleted.push(next);
    /* Cap tasksCompleted à 100 pour éviter blow storage */
    if (s.tasksCompleted.length > 100) {
      s.tasksCompleted = s.tasksCompleted.slice(-100);
    }

    this.persist();
    this.pushFirebase('tick', s);
  }

  /* ========================== Privates ========================== */

  private complete(s: AutonomousSession, reason: string): void {
    s.status = 'completed';
    s.endedAt = Date.now();
    s.endReason = reason;
    this.log('info', `🏁 Session terminée : ${reason}`);
    this.archive(s);
    this.pushFirebase('completed', s);
    void auditLog.record('autonomous.completed', { details: { id: s.id, reason, iterations: s.iterations, tokens: s.tokensConsumed } });
    this.currentSession = null;
    this.persist();
  }

  /** Build messages chat pour appel IA (incluant historique court) */
  private buildMessages(s: AutonomousSession, current: AutonomousTask): ChatMessage[] {
    const messages: ChatMessage[] = [];
    /* Recap tasks faites (dernières 5) pour continuité */
    const doneRecent = s.tasksCompleted
      .filter((t) => t.status === 'done')
      .slice(-5);
    if (doneRecent.length > 0) {
      const recap =
        '## Tâches déjà accomplies\n' +
        doneRecent
          .map(
            (t, i) =>
              `${i + 1}. ${t.description.slice(0, 100)}\n   → ${(t.output ?? '').slice(0, 200)}`,
          )
          .join('\n');
      messages.push({ role: 'user', content: recap });
      messages.push({ role: 'assistant', content: 'Compris, je tiens compte de ce contexte.' });
    }
    /* Task courante */
    const taskMsg =
      `## Tâche courante (#${s.iterations}/${(s as AutonomousSession & { maxIterations?: number }).maxIterations ?? DEFAULT_MAX_ITERATIONS})\n\n${current.description}\n\n` +
      `**Format de sortie attendu :**\n` +
      `- Si la tâche nécessite des étapes intermédiaires, liste-les en "1. ..." "2. ..." (max 5).\n` +
      `- Si la tâche est complète et que l'objectif global est atteint, finis ta réponse par "TERMINÉ".\n` +
      `- Sinon, réponds avec le résultat de cette étape (max 500 mots).\n` +
      `- Pas de salutations, pas de méta-commentaires, action directe.`;
    messages.push({ role: 'user', content: taskMsg });
    return messages;
  }

  private buildSystemPrompt(s: AutonomousSession): string {
    return [
      'Tu es Apex en MODE AUTONOME — tu travailles seul sans intervention humaine.',
      '',
      `OBJECTIF GLOBAL : ${s.initialObjective}`,
      '',
      'Règles :',
      '1. Tu décomposes en sous-tâches si nécessaire (max 5 par étape).',
      '2. Tu produis du concret, pas de questions, pas de "voulez-vous que je…".',
      '3. Tu finis par "TERMINÉ" quand l\'objectif global est atteint.',
      '4. Tu respectes les règles permanentes Kevin (CLAUDE.md, sécurité, jamais effacer données).',
      '5. Si une action nécessite une intervention humaine physique (KYC, paiement CB, signature), tu le notes mais tu continues autre chose.',
      `6. Tu as déjà fait ${s.iterations} itération(s). Tokens consommés ≈ ${s.tokensConsumed}.`,
    ].join('\n');
  }

  /**
   * Parse les sous-tâches d'une réponse IA.
   * Format: "1. xxx", "2. xxx" OU "- xxx", "* xxx"
   */
  private extractSubtasks(text: string, parentId: string): AutonomousTask[] {
    const matches: AutonomousTask[] = [];
    let m: RegExpExecArray | null;
    SUBTASK_LINE_RE.lastIndex = 0;
    while ((m = SUBTASK_LINE_RE.exec(text)) !== null) {
      const desc = (m[1] ?? '').trim();
      if (desc.length < 8) continue;
      matches.push({
        id: `task_${Date.now()}_${matches.length}_${Math.random().toString(36).slice(2, 6)}`,
        description: desc.slice(0, 500),
        status: 'pending',
        spawnedFrom: parentId,
      });
    }
    return matches;
  }

  /** Vérifie via consumption-monitor si quota anthropic ≥90% ou via tokensConsumed ≥ quotaLimit */
  private async checkQuota(
    s: AutonomousSession,
  ): Promise<{ exhausted: boolean; reason: string }> {
    const limit = (s as AutonomousSession & { quotaLimit?: number }).quotaLimit ?? DEFAULT_QUOTA_TOKENS;
    if (s.tokensConsumed >= limit) {
      return { exhausted: true, reason: `Tokens session ≥ limit (${s.tokensConsumed}/${limit})` };
    }
    /* Check consumption-monitor (lazy import) */
    try {
      const { consumptionMonitor } = (await import('../observability/consumption-monitor.js')) as {
        consumptionMonitor: { getServiceStatus: (svc: string) => { pct_used: number; severity: string } };
      };
      const anth = consumptionMonitor.getServiceStatus('anthropic');
      if (anth.severity === 'critical' && anth.pct_used >= 95) {
        return {
          exhausted: true,
          reason: `Budget Anthropic ${anth.pct_used.toFixed(0)}% — recharge requise`,
        };
      }
    } catch {
      /* monitor indispo → continue */
    }
    return { exhausted: false, reason: '' };
  }

  private log(level: 'info' | 'warn' | 'error', msg: string): void {
    const s = this.currentSession;
    if (!s) return;
    s.logs.push({ ts: Date.now(), msg: msg.slice(0, 300), level });
    if (s.logs.length > LOGS_CAP) s.logs = s.logs.slice(-LOGS_CAP);
    if (level === 'error') logger.warn('apex-autonomous-mode', msg);
    else if (level === 'warn') logger.warn('apex-autonomous-mode', msg);
    else logger.info('apex-autonomous-mode', msg);
  }

  private persist(): void {
    try {
      if (this.currentSession) {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(this.currentSession));
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch (err: unknown) {
      logger.warn('apex-autonomous-mode', 'persist failed', { err });
    }
  }

  private archive(s: AutonomousSession): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr: AutonomousSession[] = raw ? (JSON.parse(raw) as AutonomousSession[]) : [];
      arr.push({ ...s });
      const trimmed = arr.slice(-HISTORY_CAP);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('apex-autonomous-mode', 'archive failed', { err });
    }
  }

  /** Push event Firebase cross-device via firebase-queue */
  private pushFirebase(event: string, s: AutonomousSession): void {
    try {
      const uid = (typeof localStorage !== 'undefined' && localStorage.getItem('apex_v13_uid')) || 'anon';
      firebaseQueue.add(`${FIREBASE_QUEUE_KEY}/${uid}/${s.id}`, {
        event,
        status: s.status,
        lastActivityAt: s.lastActivityAt,
        iterations: s.iterations,
        tokensConsumed: s.tokensConsumed,
        queueSize: s.taskQueue.length,
        completedSize: s.tasksCompleted.length,
        objective: s.initialObjective.slice(0, 200),
        ts: Date.now(),
      });
    } catch {
      /* firebase queue indispo → skip silent */
    }
  }

  /** Notif Kevin Telegram via push worker quand quota épuisé */
  private async notifyKevinQuotaExhausted(s: AutonomousSession): Promise<void> {
    try {
      const { telegramNotifier } = await import('../integrations/telegram-notifier.js');
      const doneCount = s.tasksCompleted.filter((t) => t.status === 'done').length;
      const title = '🪫 Apex Autonomie — Quota épuisé';
      const body =
        `Session "${s.initialObjective.slice(0, 80)}" stoppée.\n` +
        `✅ ${doneCount} tâches accomplies sur ${s.iterations} itérations.\n` +
        `📊 ${s.tokensConsumed} tokens consommés.\n` +
        `🔄 Raison : ${s.endReason ?? 'quota'}`;
      await telegramNotifier.notify({
        title,
        body,
        ctaUrl: 'https://console.anthropic.com/settings/billing',
        priority: 'high',
      });
    } catch (err: unknown) {
      logger.warn('apex-autonomous-mode', 'notify Kevin failed', { err });
    }
  }
}

export const apexAutonomousMode = new ApexAutonomousMode();
