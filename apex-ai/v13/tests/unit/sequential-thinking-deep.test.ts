/**
 * Tests sequential-thinking deep v13.4.157 (Kevin "100/100 réel").
 *
 * Module : services/sequential-thinking.ts (336 stmts, était 78.6%).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { sequentialThinking } from '../../services/ai/sequential-thinking.js';

describe('sequential-thinking deep (v13.4.157)', () => {
  beforeEach(async () => {
    await sequentialThinking.reset().catch(() => null);
  });

  afterEach(async () => {
    await sequentialThinking.reset().catch(() => null);
  });

  describe('init', () => {
    it('init retourne stats', async () => {
      const stats = await sequentialThinking.init();
      expect(stats.ready).toBe(true);
      expect(stats.total).toBe(0);
    });
  });

  describe('startThought', () => {
    it('crée thought avec id', async () => {
      const r = await sequentialThinking.startThought('Problem to solve');
      expect(r.thoughtId).toBeTypeOf('string');
      expect(r.thoughtId).toMatch(/^thought_/);
    });

    it('throw si problem vide', async () => {
      await expect(sequentialThinking.startThought('')).rejects.toThrow(/problem/);
    });

    it('clamp estimated_steps à max', async () => {
      const r = await sequentialThinking.startThought('X', 9999);
      const t = await sequentialThinking.getThought(r.thoughtId);
      expect(t?.estimated_steps).toBeLessThanOrEqual(200);
    });
  });

  describe('addStep', () => {
    it('ajoute step à thought actif', async () => {
      const { thoughtId } = await sequentialThinking.startThought('Problem');
      const r = await sequentialThinking.addStep(thoughtId, 'Step 1');
      expect(r.stepIndex).toBe(0);
      expect(r.total).toBe(1);
    });

    it('throw si thought inconnu', async () => {
      await expect(sequentialThinking.addStep('not_exist', 'X')).rejects.toThrow();
    });

    it('throw si content vide', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      await expect(sequentialThinking.addStep(thoughtId, '')).rejects.toThrow(/content/);
    });

    it('accepte reflections option', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      const r = await sequentialThinking.addStep(thoughtId, 'S1', { reflections: 'thinking deeper' });
      expect(r.total).toBe(1);
    });
  });

  describe('revise', () => {
    it('crée step revision', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      await sequentialThinking.addStep(thoughtId, 'Original');
      const r = await sequentialThinking.revise(thoughtId, 0, 'Revised');
      expect(r.ok).toBe(true);
      expect(r.revision_step).toBe(1);
    });

    it('throw si stepIndex out of range', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      await expect(sequentialThinking.revise(thoughtId, 999, 'X')).rejects.toThrow(/out of range/);
    });
  });

  describe('branch', () => {
    it('crée step branch', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      await sequentialThinking.addStep(thoughtId, 'A');
      const r = await sequentialThinking.branch(thoughtId, 0, 'Alternative');
      expect(r.ok).toBe(true);
      expect(r.branch_id).toMatch(/^branch_/);
    });

    it('throw si fromStep invalid', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      await expect(sequentialThinking.branch(thoughtId, -1, 'X')).rejects.toThrow();
    });
  });

  describe('complete', () => {
    it('marque thought completed', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      await sequentialThinking.addStep(thoughtId, 'S');
      const t = await sequentialThinking.complete(thoughtId, 'Conclusion');
      expect(t.status).toBe('completed');
      expect(t.conclusion).toBe('Conclusion');
    });

    it('throw si conclusion vide', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      await expect(sequentialThinking.complete(thoughtId, '')).rejects.toThrow(/conclusion/);
    });
  });

  describe('abandon', () => {
    it('marque thought abandoned', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      const r = await sequentialThinking.abandon(thoughtId, 'too complex');
      expect(r.ok).toBe(true);
      const t = await sequentialThinking.getThought(thoughtId);
      expect(t?.status).toBe('abandoned');
    });

    it('abandon sans reason ok', async () => {
      const { thoughtId } = await sequentialThinking.startThought('P');
      const r = await sequentialThinking.abandon(thoughtId);
      expect(r.ok).toBe(true);
    });
  });

  describe('getThought / listThoughts', () => {
    it('getThought retourne null si absent', async () => {
      const r = await sequentialThinking.getThought('unknown');
      expect(r).toBeNull();
    });

    it('listThoughts retourne array', async () => {
      await sequentialThinking.startThought('P1');
      await sequentialThinking.startThought('P2');
      const list = await sequentialThinking.listThoughts(50);
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('listThoughts respecte limit', async () => {
      for (let i = 0; i < 5; i++) await sequentialThinking.startThought(`P${i}`);
      const list = await sequentialThinking.listThoughts(2);
      expect(list.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getStats', () => {
    it('retourne total + by_status', async () => {
      await sequentialThinking.startThought('P1');
      const stats = await sequentialThinking.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('reset', () => {
    it('vide tout', async () => {
      await sequentialThinking.startThought('P');
      await sequentialThinking.reset();
      const stats = await sequentialThinking.getStats();
      expect(stats.total).toBe(0);
    });
  });
});
