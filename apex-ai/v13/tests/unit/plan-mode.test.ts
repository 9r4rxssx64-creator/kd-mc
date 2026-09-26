/**
 * Tests plan-mode.ts (Kevin v13.4.3 — TikTok IA IRL #2).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { planMode } from '../../services/admin/plan-mode.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({
        text: '{"summary":"Plan test","steps":[{"title":"Étape 1","files":["a.ts"],"risk":"low"},{"title":"Étape 2","files":[],"risk":"medium"}]}',
      });
      return Promise.resolve();
    }),
  },
}));

describe('Plan Mode (IA IRL)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('génère un plan structuré valide', async () => {
    const plan = await planMode.generate('Refactor X');
    expect(plan.objective).toBe('Refactor X');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.risk).toBe('low');
    expect(plan.steps[1]?.risk).toBe('medium');
    expect(plan.id).toMatch(/^plan_/);
  });

  it('refuse objectif vide', async () => {
    await expect(planMode.generate('')).rejects.toThrow(/vide/);
  });

  it('persiste le plan actif et permet revoke', async () => {
    await planMode.generate('Test 1');
    expect(planMode.getActive()).not.toBeNull();
    planMode.revoke();
    expect(planMode.getActive()).toBeNull();
  });

  it('buildExecutionContext retourne un context formaté', async () => {
    const plan = await planMode.generate('Test');
    const ctx = planMode.buildExecutionContext(plan);
    expect(ctx).toContain('PLAN VALIDÉ');
    expect(ctx).toContain('Test');
    expect(ctx).toContain('Étape 1');
  });
});
