/**
 * APEX v13 — Firebase queue transactionnelle (P0-4 fix audit)
 *
 * Anti-pattern audit : "Firebase dual-write async non-atomic — commerce toggle/users list:
 * écrit localStorage + Firebase = race condition perte sync."
 *
 * Solution : queue ordonnée + retry exponentiel + idempotency-key.
 * Toute écriture passe par add() — flush appelé dès online ou cycle 5s.
 * Si échec persistant (5+ retries) → escalate ax_claude_todo Firebase.
 */

import { logger } from '../../core/logger.js';

interface QueueEntry {
  id: string;
  key: string;
  value: unknown;
  ts: number;
  attempts: number;
  status: 'pending' | 'flushing' | 'failed';
}

const STORAGE_KEY = 'apex_v13_fb_queue';
const MAX_QUEUE = 200;
const MAX_RETRIES = 5;

class FirebaseQueue {
  private queue: QueueEntry[] = [];
  private flushing = false;
  private flushTimer: number | null = null;

  init(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.queue = JSON.parse(raw) as QueueEntry[];
    } catch {
      /* ignore */
    }
    this.scheduleFlush();
    /* Auto-flush sur online event */
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flush());
    }
  }

  add(key: string, value: unknown): void {
    const entry: QueueEntry = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      key,
      value,
      ts: Date.now(),
      attempts: 0,
      status: 'pending',
    };
    this.queue.push(entry);
    if (this.queue.length > MAX_QUEUE) this.queue = this.queue.slice(-MAX_QUEUE);
    this.persist();
    this.scheduleFlush();
  }

  size(): number {
    return this.queue.filter((e) => e.status !== 'failed').length;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 5000);
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    this.flushing = true;
    try {
      const pending = this.queue.filter((e) => e.status === 'pending');
      for (const entry of pending) {
        if (entry.attempts >= MAX_RETRIES) {
          entry.status = 'failed';
          this.escalate(entry);
          continue;
        }
        entry.status = 'flushing';
        entry.attempts++;
        const ok = await this.writeOne(entry);
        if (ok) {
          /* Retire de la queue */
          this.queue = this.queue.filter((q) => q.id !== entry.id);
        } else {
          entry.status = 'pending';
          /* Backoff exponentiel pour next attempt : 2s, 4s, 8s, 16s, 32s */
          await this.sleep(Math.min(32_000, 2_000 * Math.pow(2, entry.attempts - 1)));
        }
      }
      this.persist();
    } finally {
      this.flushing = false;
    }
  }

  private async writeOne(entry: QueueEntry): Promise<boolean> {
    try {
      const { firebase } = await import('./firebase.js');
      /* Option A audit subagent : passe entry.id comme idempotencyKey → Firebase skip
       * si même write dans 60s (anti orphan post browser crash + replay queue) */
      await firebase.write(entry.key, entry.value, { idempotencyKey: entry.id });
      return true;
    } catch (err: unknown) {
      logger.warn('fb-queue', `write failed ${entry.key} attempt ${entry.attempts}`, { err });
      return false;
    }
  }

  private escalate(entry: QueueEntry): void {
    logger.error('fb-queue', `Escalating to Claude Code: ${entry.key} after ${MAX_RETRIES} fails`);
    try {
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<Record<string, unknown>>;
      todos.push({
        id: `escalate_${entry.id}`,
        context: { key: entry.key, attempts: entry.attempts, ts: entry.ts },
        reason: 'Firebase queue persistent failure',
        severity: 'critical',
        src: 'apex',
        v: 'v13.0.0',
        ts: Date.now(),
        status: 'pending',
      });
      localStorage.setItem('ax_claude_todo', JSON.stringify(todos.slice(-50)));
    } catch {
      /* ignore */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      /* ignore quota */
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const firebaseQueue = new FirebaseQueue();
