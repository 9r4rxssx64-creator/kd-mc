/**
 * APEX v13.4.3 — Autonomous Loop service (Kevin 2026-05-09 — TikTok IA IRL #1)
 *
 * Slash command `/loop <task>` → ajoute task dans queue persistante.
 * Sentinelle 60s pop le head et invoke aiRouter.stream pour exécution.
 *
 * Storage : `apex_v13_loop_queue` (localStorage).
 * Cap 50 tasks pour éviter quota explosion. FIFO stricte.
 *
 * Méthodes :
 *  - `loop.add(task)` : pousse en queue
 *  - `loop.list()` : retourne snapshot { tasks, paused, runningTaskId }
 *  - `loop.pause()` / `loop.resume()` / `loop.toggle()` : kill switch
 *  - `loop.clear()` : reset
 *  - `loop.start()` : lance la sentinelle (idempotent)
 *
 * Anti-loops infinies :
 *  - throttle 60s entre exécutions
 *  - max 5 retries par task (puis drop avec lesson learned)
 *  - kill switch persistant
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const STORAGE_KEY = 'apex_v13_loop_queue';
const PAUSED_KEY = 'apex_v13_loop_paused';
const TICK_MS = 60_000;
const MAX_TASKS = 50;
const MAX_RETRIES = 5;

export interface LoopTask {
  id: string;
  task: string;
  createdAt: number;
  retries: number;
  lastError?: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  result?: string;
}

export interface LoopSnapshot {
  tasks: LoopTask[];
  paused: boolean;
  runningTaskId: string | null;
  intervalActive: boolean;
}

class AutonomousLoopService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private runningTaskId: string | null = null;

  add(task: string): LoopTask {
    const trimmed = (task || '').trim();
    if (!trimmed) throw new Error('Task vide');
    const tasks = this.readTasks();
    if (tasks.length >= MAX_TASKS) throw new Error(`Queue pleine (max ${MAX_TASKS})`);
    const entry: LoopTask = {
      id: `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      task: trimmed.slice(0, 2000),
      createdAt: Date.now(),
      retries: 0,
      status: 'queued',
    };
    tasks.push(entry);
    this.writeTasks(tasks);
    void auditLog.record('loop.add', { details: { task: entry.task.slice(0, 100) } });
    logger.info('autonomous-loop', `Added task ${entry.id}`);
    return entry;
  }

  list(): LoopSnapshot {
    return {
      tasks: this.readTasks(),
      paused: this.isPaused(),
      runningTaskId: this.runningTaskId,
      intervalActive: this.timer !== null,
    };
  }

  pause(): void {
    localStorage.setItem(PAUSED_KEY, '1');
    void auditLog.record('loop.pause');
    logger.info('autonomous-loop', 'Paused');
  }

  resume(): void {
    localStorage.removeItem(PAUSED_KEY);
    void auditLog.record('loop.resume');
    logger.info('autonomous-loop', 'Resumed');
  }

  toggle(): boolean {
    const paused = this.isPaused();
    if (paused) this.resume(); else this.pause();
    return !paused;
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    void auditLog.record('loop.clear');
    logger.info('autonomous-loop', 'Cleared queue');
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
    logger.info('autonomous-loop', `Started (tick ${TICK_MS}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('autonomous-loop', 'Stopped');
    }
  }

  /** Force un tick (utile pour tests / debug). */
  async tick(): Promise<void> {
    if (this.isPaused()) return;
    if (this.runningTaskId) return;
    const tasks = this.readTasks();
    const next = tasks.find((t) => t.status === 'queued');
    if (!next) return;
    this.runningTaskId = next.id;
    next.status = 'running';
    this.writeTasks(tasks);

    try {
      let collected = '';
      let lastErr: Error | undefined;
      await aiRouter.stream(
        [{ role: 'user', content: next.task }],
        'Tu es Apex en mode autonome. Réponds de façon concise (max 500 mots) et actionnable. Pas de salutations.',
        (chunk) => { if (chunk.text) collected += chunk.text; },
        (err) => { lastErr = err; },
      );
      if (lastErr || !collected) {
        next.retries += 1;
        next.lastError = lastErr?.message ?? 'no output';
        if (next.retries >= MAX_RETRIES) {
          next.status = 'failed';
        } else {
          next.status = 'queued';
        }
      } else {
        next.status = 'done';
        next.result = collected.slice(0, 4000);
      }
    } catch (err: unknown) {
      next.retries += 1;
      next.lastError = err instanceof Error ? err.message : String(err);
      next.status = next.retries >= MAX_RETRIES ? 'failed' : 'queued';
    } finally {
      this.runningTaskId = null;
      const refreshed = this.readTasks();
      const idx = refreshed.findIndex((t) => t.id === next.id);
      if (idx >= 0) {
        refreshed[idx] = next;
        this.writeTasks(refreshed);
      }
      void auditLog.record('loop.tick', { details: { id: next.id, status: next.status, retries: next.retries } });
    }
  }

  private isPaused(): boolean {
    try { return localStorage.getItem(PAUSED_KEY) === '1'; } catch { return false; }
  }

  private readTasks(): LoopTask[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as LoopTask[];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private writeTasks(tasks: LoopTask[]): void {
    try {
      const trimmed = tasks.slice(-MAX_TASKS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('autonomous-loop', 'persist failed', { err });
    }
  }
}

export const autonomousLoop = new AutonomousLoopService();
