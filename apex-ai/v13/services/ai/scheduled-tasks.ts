/**
 * APEX v13 — Tâches programmées (Scheduled Tasks / Automations).
 *
 * Parité flagship 2026 (ChatGPT Tasks, Grok Tasks, Gemini Scheduled Actions).
 * Une PWA ne peut pas garantir un vrai fond de tâche → modèle honnête : les tâches
 * dues s'exécutent quand l'app est ouverte/au premier plan (au boot + focus + tick),
 * comme le fait un client. Persistées per-user, avec calcul déterministe du prochain
 * déclenchement. Exécution = injection du prompt dans le chat (via callback runner).
 *
 * Additif, testable (schedule/nextRun/due), aucune surgery du routage IA.
 */

import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';

export type ScheduleKind = 'once' | 'daily' | 'weekly' | 'interval';

export interface ScheduledTask {
  id: string;
  prompt: string;
  kind: ScheduleKind;
  /** 'once' : timestamp ms d'exécution. */
  at?: number;
  /** 'daily'/'weekly' : minutes depuis minuit (0-1439). */
  timeMin?: number;
  /** 'weekly' : jour 0=dimanche … 6=samedi. */
  weekday?: number;
  /** 'interval' : période en minutes (min 15). */
  everyMin?: number;
  enabled: boolean;
  nextRun: number;
  lastRun: number | null;
  createdAt: number;
}

const PREFIX = 'apex_v13_scheduled_tasks_';
const MAX_TASKS = 40;
const MIN_INTERVAL = 15;

function keyFor(uid: string): string {
  return `${PREFIX}${uid}`;
}
function currentUid(): string {
  const u = store.get('user') as { id?: string } | null;
  return u?.id ?? 'anon';
}

function isValid(t: unknown): t is ScheduledTask {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['prompt'] === 'string' &&
    (o['prompt'] as string).length > 0 &&
    typeof o['kind'] === 'string' &&
    typeof o['nextRun'] === 'number'
  );
}

/**
 * Calcule le prochain déclenchement (ms) à partir de `from`.
 * Déterministe : testable sans horloge réelle.
 */
export function computeNextRun(t: Pick<ScheduledTask, 'kind' | 'at' | 'timeMin' | 'weekday' | 'everyMin'>, from: number): number {
  const d = new Date(from);
  switch (t.kind) {
    case 'once':
      return t.at ?? from;
    case 'interval':
      return from + Math.max(MIN_INTERVAL, t.everyMin ?? MIN_INTERVAL) * 60_000;
    case 'daily': {
      const tm = t.timeMin ?? 9 * 60;
      const next = new Date(d);
      next.setHours(Math.floor(tm / 60), tm % 60, 0, 0);
      if (next.getTime() <= from) next.setDate(next.getDate() + 1);
      return next.getTime();
    }
    case 'weekly': {
      const tm = t.timeMin ?? 9 * 60;
      const wd = t.weekday ?? 1;
      const next = new Date(d);
      next.setHours(Math.floor(tm / 60), tm % 60, 0, 0);
      let add = (wd - next.getDay() + 7) % 7;
      if (add === 0 && next.getTime() <= from) add = 7;
      next.setDate(next.getDate() + add);
      return next.getTime();
    }
    default:
      return from;
  }
}

class ScheduledTasksStore {
  list(uid: string = currentUid()): ScheduledTask[] {
    try {
      const raw = localStorage.getItem(keyFor(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isValid) : [];
    } catch (err) {
      logger.warn('scheduled-tasks', 'list failed', { err });
      return [];
    }
  }

  private persist(uid: string, arr: ScheduledTask[]): void {
    try {
      localStorage.setItem(keyFor(uid), JSON.stringify(arr.slice(0, MAX_TASKS)));
    } catch (err) {
      logger.warn('scheduled-tasks', 'persist failed', { err });
    }
  }

  create(
    input: { prompt: string; kind: ScheduleKind; at?: number; timeMin?: number; weekday?: number; everyMin?: number },
    now: number = Date.now(),
    uid: string = currentUid(),
  ): ScheduledTask | null {
    const prompt = String(input.prompt ?? '').trim();
    if (!prompt) return null;
    const arr = this.list(uid);
    if (arr.length >= MAX_TASKS) return null;
    const base = {
      kind: input.kind,
      ...(input.at !== undefined ? { at: input.at } : {}),
      ...(input.timeMin !== undefined ? { timeMin: input.timeMin } : {}),
      ...(input.weekday !== undefined ? { weekday: input.weekday } : {}),
      ...(input.everyMin !== undefined ? { everyMin: input.everyMin } : {}),
    };
    const task: ScheduledTask = {
      id: `task_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      prompt,
      ...base,
      enabled: true,
      nextRun: computeNextRun(base, now),
      lastRun: null,
      createdAt: now,
    };
    arr.unshift(task);
    this.persist(uid, arr);
    return task;
  }

  remove(id: string, uid: string = currentUid()): boolean {
    const arr = this.list(uid);
    const next = arr.filter((t) => t.id !== id);
    if (next.length === arr.length) return false;
    this.persist(uid, next);
    return true;
  }

  toggle(id: string, uid: string = currentUid()): boolean {
    const arr = this.list(uid);
    const t = arr.find((x) => x.id === id);
    if (!t) return false;
    t.enabled = !t.enabled;
    this.persist(uid, arr);
    return t.enabled;
  }

  /** Tâches activées dont nextRun est passé (dues), à `now`. */
  getDue(now: number = Date.now(), uid: string = currentUid()): ScheduledTask[] {
    return this.list(uid).filter((t) => t.enabled && t.nextRun <= now);
  }

  /** Marque une tâche exécutée : lastRun=now, recalcule nextRun (ou désactive si 'once'). */
  markRun(id: string, now: number = Date.now(), uid: string = currentUid()): void {
    const arr = this.list(uid);
    const t = arr.find((x) => x.id === id);
    if (!t) return;
    t.lastRun = now;
    if (t.kind === 'once') t.enabled = false;
    else t.nextRun = computeNextRun(t, now);
    this.persist(uid, arr);
  }
}

export const scheduledTasks = new ScheduledTasksStore();

/**
 * Exécute les tâches dues via un runner (injecté). Appelé au boot/focus.
 * Le runner reçoit le prompt (ex : le pousse dans le chat). Retourne le nb exécuté.
 * Anti-rafale : traite au plus `maxPerTick` tâches par appel.
 */
export async function runDueTasks(
  runner: (prompt: string, task: ScheduledTask) => Promise<void> | void,
  now: number = Date.now(),
  maxPerTick = 3,
  uid: string = currentUid(),
): Promise<number> {
  const due = scheduledTasks.getDue(now, uid).slice(0, maxPerTick);
  let n = 0;
  for (const t of due) {
    try {
      await runner(t.prompt, t);
      scheduledTasks.markRun(t.id, now, uid);
      n++;
    } catch (err) {
      logger.warn('scheduled-tasks', 'runner failed for task', { id: t.id, err });
      /* on marque quand même pour éviter une boucle infinie sur une tâche cassée */
      scheduledTasks.markRun(t.id, now, uid);
    }
  }
  return n;
}
