/**
 * APEX v13 — Tests Tâches programmées (schedule/nextRun/due/run).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  scheduledTasks,
  computeNextRun,
  runDueTasks,
} from '../../services/ai/scheduled-tasks.js';

const U = 'user_sched';
/* jeudi 2026-05-14 10:00 local */
const NOW = new Date('2026-05-14T10:00:00').getTime();

describe('scheduled-tasks — computeNextRun', () => {
  it('daily : aujourd\'hui si l\'heure est future, sinon demain', () => {
    const soon = computeNextRun({ kind: 'daily', timeMin: 11 * 60 }, NOW); // 11h > 10h
    expect(new Date(soon).getHours()).toBe(11);
    expect(new Date(soon).getDate()).toBe(14);
    const tomorrow = computeNextRun({ kind: 'daily', timeMin: 9 * 60 }, NOW); // 9h < 10h → demain
    expect(new Date(tomorrow).getDate()).toBe(15);
  });
  it('interval : +N min (min 15)', () => {
    expect(computeNextRun({ kind: 'interval', everyMin: 60 }, NOW)).toBe(NOW + 3_600_000);
    expect(computeNextRun({ kind: 'interval', everyMin: 5 }, NOW)).toBe(NOW + 15 * 60_000);
  });
  it('once : renvoie at', () => {
    expect(computeNextRun({ kind: 'once', at: NOW + 999 }, NOW)).toBe(NOW + 999);
  });
  it('weekly : prochain jour de semaine à l\'heure', () => {
    const next = computeNextRun({ kind: 'weekly', timeMin: 9 * 60, weekday: 1 }, NOW); // lundi
    expect(new Date(next).getDay()).toBe(1);
    expect(new Date(next).getTime()).toBeGreaterThan(NOW);
  });
});

describe('scheduled-tasks — CRUD + due', () => {
  beforeEach(() => localStorage.clear());

  it('create + list + nextRun calculé', () => {
    const t = scheduledTasks.create({ prompt: 'Résume l\'actu', kind: 'daily', timeMin: 11 * 60 }, NOW, U);
    expect(t).not.toBeNull();
    expect(t!.enabled).toBe(true);
    expect(t!.nextRun).toBe(computeNextRun({ kind: 'daily', timeMin: 11 * 60 }, NOW));
    expect(scheduledTasks.list(U)).toHaveLength(1);
  });
  it('refuse prompt vide', () => {
    expect(scheduledTasks.create({ prompt: '  ', kind: 'daily' }, NOW, U)).toBeNull();
  });
  it('toggle active/désactive', () => {
    const t = scheduledTasks.create({ prompt: 'x', kind: 'interval', everyMin: 30 }, NOW, U)!;
    expect(scheduledTasks.toggle(t.id, U)).toBe(false);
    expect(scheduledTasks.list(U)[0]!.enabled).toBe(false);
  });
  it('getDue ne renvoie que les activées et échues', () => {
    const past = scheduledTasks.create({ prompt: 'due', kind: 'once', at: NOW - 1000 }, NOW, U)!;
    scheduledTasks.create({ prompt: 'future', kind: 'once', at: NOW + 10_000 }, NOW, U);
    const due = scheduledTasks.getDue(NOW, U);
    expect(due).toHaveLength(1);
    expect(due[0]!.id).toBe(past.id);
  });
  it('markRun : once → désactive ; récurrent → nextRun avance', () => {
    const once = scheduledTasks.create({ prompt: 'o', kind: 'once', at: NOW - 1 }, NOW, U)!;
    scheduledTasks.markRun(once.id, NOW, U);
    expect(scheduledTasks.get?.(once.id) ?? scheduledTasks.list(U).find((t) => t.id === once.id)!).toBeDefined();
    expect(scheduledTasks.list(U).find((t) => t.id === once.id)!.enabled).toBe(false);

    const daily = scheduledTasks.create({ prompt: 'd', kind: 'daily', timeMin: 9 * 60 }, NOW, U)!;
    const before = daily.nextRun;
    scheduledTasks.markRun(daily.id, NOW, U);
    const after = scheduledTasks.list(U).find((t) => t.id === daily.id)!;
    expect(after.lastRun).toBe(NOW);
    expect(after.nextRun).toBeGreaterThanOrEqual(before);
  });
  it('tolère localStorage corrompu', () => {
    localStorage.setItem('apex_v13_scheduled_tasks_' + U, '{bad');
    expect(scheduledTasks.list(U)).toEqual([]);
  });
});

describe('scheduled-tasks — runDueTasks', () => {
  beforeEach(() => localStorage.clear());
  it('exécute les tâches dues via le runner + les marque', async () => {
    scheduledTasks.create({ prompt: 'tache A', kind: 'once', at: NOW - 1 }, NOW, U);
    scheduledTasks.create({ prompt: 'tache B', kind: 'once', at: NOW - 1 }, NOW, U);
    const runner = vi.fn();
    const n = await runDueTasks(runner, NOW, 5, U);
    expect(n).toBe(2);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(scheduledTasks.getDue(NOW, U)).toHaveLength(0); // toutes marquées
  });
  it('respecte maxPerTick', async () => {
    for (let i = 0; i < 5; i++) scheduledTasks.create({ prompt: 'p' + i, kind: 'once', at: NOW - 1 }, NOW, U);
    const n = await runDueTasks(vi.fn(), NOW, 2, U);
    expect(n).toBe(2);
  });
  it('runner qui throw → marque quand même (anti-boucle)', async () => {
    scheduledTasks.create({ prompt: 'boom', kind: 'daily', timeMin: 9 * 60, at: NOW - 1 } as never, NOW, U);
    /* force une tâche due */
    const t = scheduledTasks.list(U)[0]!;
    scheduledTasks.markRun(t.id, NOW - 100, U);
    const runner = vi.fn(() => { throw new Error('x'); });
    await runDueTasks(runner, NOW + 10 ** 9, 5, U);
    expect(scheduledTasks.list(U)[0]!.lastRun).toBeGreaterThan(0);
  });
});
