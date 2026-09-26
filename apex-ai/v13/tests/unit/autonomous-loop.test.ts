/**
 * Tests autonomous-loop.ts (Kevin v13.4.3 — TikTok IA IRL #1).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { autonomousLoop } from '../../services/admin/autonomous-loop.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({ text: 'Réponse simulée du loop autonome.' });
      return Promise.resolve();
    }),
  },
}));

describe('Autonomous Loop (IA IRL)', () => {
  beforeEach(() => {
    autonomousLoop.stop();
    autonomousLoop.clear();
    autonomousLoop.resume();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('add une tâche dans la queue', () => {
    const t = autonomousLoop.add('Faire X');
    const snap = autonomousLoop.list();
    expect(snap.tasks).toHaveLength(1);
    expect(snap.tasks[0]?.task).toBe('Faire X');
    expect(t.status).toBe('queued');
    expect(t.id).toMatch(/^loop_/);
  });

  it('pause / resume / toggle', () => {
    autonomousLoop.pause();
    expect(autonomousLoop.list().paused).toBe(true);
    autonomousLoop.resume();
    expect(autonomousLoop.list().paused).toBe(false);
    autonomousLoop.toggle();
    expect(autonomousLoop.list().paused).toBe(true);
  });

  it('tick exécute la première task et la marque done', async () => {
    autonomousLoop.add('Hello world');
    await autonomousLoop.tick();
    const snap = autonomousLoop.list();
    expect(snap.tasks[0]?.status).toBe('done');
    expect(snap.tasks[0]?.result).toContain('simulée');
  });

  it('clear vide la queue', () => {
    autonomousLoop.add('A');
    autonomousLoop.add('B');
    expect(autonomousLoop.list().tasks).toHaveLength(2);
    autonomousLoop.clear();
    expect(autonomousLoop.list().tasks).toHaveLength(0);
  });

  it('refuse une tâche vide', () => {
    expect(() => autonomousLoop.add('')).toThrow(/vide/);
    expect(() => autonomousLoop.add('   ')).toThrow(/vide/);
  });
});
