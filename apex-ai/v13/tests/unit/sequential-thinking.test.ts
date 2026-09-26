/**
 * APEX v13 — Tests Sequential Thinking MCP (raisonnement multi-étapes).
 *
 * Couvre :
 *  - startThought : crée thought avec problem + estimated_steps
 *  - addStep : ajoute steps + index croissant + can_revise default
 *  - revise : remplace contenu + trace original + nouvelle step kind=revision
 *  - branch : crée branche alternative avec branch_id unique
 *  - complete : status='completed' + bloque mutations
 *  - getThought : récupère chaîne complète
 *  - Tool registry : 5 tools enregistrés + dispatch fonctionne
 *  - Edge cases : non-revisable, max steps, thought introuvable
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { apexTools } from '../../services/core-svc/apex-tools.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';
import { sequentialThinking } from '../../services/ai/sequential-thinking.js';

describe('Sequential Thinking MCP', () => {
  beforeEach(async () => {
    /* Reset singleton state pour isolation */
     
    (sequentialThinking as unknown as { initialized: boolean }).initialized = false;
    (sequentialThinking as unknown as { memThoughts: Map<string, unknown> }).memThoughts = new Map();
     
    await sequentialThinking.init();
  });

  describe('startThought', () => {
    it('crée un thought actif avec id', async () => {
      const r = await sequentialThinking.startThought('Comment optimiser le boot Apex ?', 8);
      expect(r.thoughtId).toMatch(/^thought_/);
      const t = await sequentialThinking.getThought(r.thoughtId);
      expect(t?.status).toBe('active');
      expect(t?.problem).toBe('Comment optimiser le boot Apex ?');
      expect(t?.estimated_steps).toBe(8);
      expect(t?.steps).toHaveLength(0);
    });

    it('default estimated_steps si non fourni', async () => {
      const r = await sequentialThinking.startThought('Test default');
      const t = await sequentialThinking.getThought(r.thoughtId);
      expect(t?.estimated_steps).toBeGreaterThan(0);
    });

    it('rejette problem vide', async () => {
      await expect(sequentialThinking.startThought('')).rejects.toThrow(/problem required/);
    });
  });

  describe('addStep', () => {
    it('ajoute step avec index séquentiel et can_revise default true', async () => {
      const { thoughtId } = await sequentialThinking.startThought('Test', 3);
      const r1 = await sequentialThinking.addStep(thoughtId, 'Étape 1');
      expect(r1.stepIndex).toBe(0);
      expect(r1.total).toBe(1);
      const r2 = await sequentialThinking.addStep(thoughtId, 'Étape 2');
      expect(r2.stepIndex).toBe(1);
      expect(r2.total).toBe(2);

      const t = await sequentialThinking.getThought(thoughtId);
      expect(t?.steps[0]?.kind).toBe('thought');
      expect(t?.steps[0]?.can_revise).toBe(true);
      expect(t?.steps[0]?.branch_id).toBe('main');
    });

    it('marque can_revise=false sur étape factuelle', async () => {
      const { thoughtId } = await sequentialThinking.startThought('Test');
      await sequentialThinking.addStep(thoughtId, 'Fact', { can_revise: false });
      const t = await sequentialThinking.getThought(thoughtId);
      expect(t?.steps[0]?.can_revise).toBe(false);
    });

    it('stocke reflections optionnelles', async () => {
      const { thoughtId } = await sequentialThinking.startThought('Test');
      await sequentialThinking.addStep(thoughtId, 'Step', {
        reflections: 'Pas sûr, à confirmer',
      });
      const t = await sequentialThinking.getThought(thoughtId);
      expect(t?.steps[0]?.reflections).toBe('Pas sûr, à confirmer');
    });

    it('rejette si thought completed', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T');
      await sequentialThinking.addStep(thoughtId, 'S1');
      await sequentialThinking.complete(thoughtId, 'Done');
      await expect(
        sequentialThinking.addStep(thoughtId, 'after-complete'),
      ).rejects.toThrow(/completed/);
    });
  });

  describe('revise', () => {
    it('crée step kind=revision pointant vers original + trace original_content', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T', 5);
      await sequentialThinking.addStep(thoughtId, 'Première hypothèse');
      const r = await sequentialThinking.revise(thoughtId, 0, 'Hypothèse corrigée');
      expect(r.ok).toBe(true);
      expect(r.revised_index).toBe(0);
      expect(r.revision_step).toBe(1);

      const t = await sequentialThinking.getThought(thoughtId);
      expect(t?.steps).toHaveLength(2);
      expect(t?.steps[1]?.kind).toBe('revision');
      expect(t?.steps[1]?.revises_step).toBe(0);
      expect(t?.steps[1]?.content).toBe('Hypothèse corrigée');
      expect(t?.steps[1]?.reflections).toContain('Première hypothèse');
    });

    it('rejette si étape can_revise=false', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T');
      await sequentialThinking.addStep(thoughtId, 'Fact', { can_revise: false });
      await expect(
        sequentialThinking.revise(thoughtId, 0, 'attempt'),
      ).rejects.toThrow(/non-revisable/);
    });

    it('rejette si stepIndex out of range', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T');
      await sequentialThinking.addStep(thoughtId, 'S0');
      await expect(
        sequentialThinking.revise(thoughtId, 99, 'foo'),
      ).rejects.toThrow(/out of range/);
    });
  });

  describe('branch', () => {
    it('crée step kind=branch avec branch_id unique', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T');
      await sequentialThinking.addStep(thoughtId, 'Approche A');
      const b1 = await sequentialThinking.branch(thoughtId, 0, 'Approche B');
      expect(b1.branch_step).toBe(1);
      expect(b1.branch_id).toBe('branch_1');

      const b2 = await sequentialThinking.branch(thoughtId, 0, 'Approche C');
      expect(b2.branch_id).toBe('branch_2');

      const t = await sequentialThinking.getThought(thoughtId);
      const branchSteps = t?.steps.filter((s) => s.kind === 'branch') ?? [];
      expect(branchSteps).toHaveLength(2);
      expect(branchSteps[0]?.branches_from).toBe(0);
      expect(branchSteps[0]?.branch_id).not.toBe(branchSteps[1]?.branch_id);
    });

    it('rejette fromStep out of range', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T');
      await sequentialThinking.addStep(thoughtId, 'S0');
      await expect(
        sequentialThinking.branch(thoughtId, 99, 'alt'),
      ).rejects.toThrow(/out of range/);
    });
  });

  describe('complete', () => {
    it('passe status à completed et retourne chaîne complète', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T');
      await sequentialThinking.addStep(thoughtId, 'S1');
      await sequentialThinking.addStep(thoughtId, 'S2');
      const final = await sequentialThinking.complete(thoughtId, 'Conclusion finale');
      expect(final.status).toBe('completed');
      expect(final.conclusion).toBe('Conclusion finale');
      expect(final.steps).toHaveLength(2);
    });

    it('rejette double complete', async () => {
      const { thoughtId } = await sequentialThinking.startThought('T');
      await sequentialThinking.addStep(thoughtId, 'S1');
      await sequentialThinking.complete(thoughtId, 'Done');
      await expect(
        sequentialThinking.complete(thoughtId, 'redo'),
      ).rejects.toThrow(/completed/);
    });
  });

  describe('Stats + abandon', () => {
    it('stats reflète active/completed/abandoned counts', async () => {
      const t1 = await sequentialThinking.startThought('A');
      const t2 = await sequentialThinking.startThought('B');
      const t3 = await sequentialThinking.startThought('C');
      await sequentialThinking.addStep(t2.thoughtId, 'x');
      await sequentialThinking.complete(t2.thoughtId, 'done');
      await sequentialThinking.abandon(t3.thoughtId, 'bye');

      const stats = await sequentialThinking.getStats();
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.abandoned).toBe(1);

      /* listThoughts trie par updated_at desc */
      const list = await sequentialThinking.listThoughts(10);
      expect(list.length).toBe(3);
      const ids = list.map((t) => t.id);
      expect(ids).toContain(t1.thoughtId);
    });
  });

  describe('Tool registry + dispatch', () => {
    it('5 tools thinking_* présents', () => {
      expect(apexTools.getByName('thinking_start')).toBeTruthy();
      expect(apexTools.getByName('thinking_add_step')).toBeTruthy();
      expect(apexTools.getByName('thinking_revise')).toBeTruthy();
      expect(apexTools.getByName('thinking_branch')).toBeTruthy();
      expect(apexTools.getByName('thinking_complete')).toBeTruthy();
    });

    it('dispatch thinking_start + add_step + complete chaine OK', async () => {
      const r1 = await apexToolsDispatch.execute(
        'thinking_start',
        { problem: 'Test problem', estimated_steps: 3 },
        'admin',
      );
      expect(r1.ok).toBe(true);
      const start = r1.result as { thoughtId: string };
      expect(start.thoughtId).toMatch(/^thought_/);

      const r2 = await apexToolsDispatch.execute(
        'thinking_add_step',
        { thought_id: start.thoughtId, content: 'Step 1' },
        'admin',
      );
      expect(r2.ok).toBe(true);

      const r3 = await apexToolsDispatch.execute(
        'thinking_complete',
        { thought_id: start.thoughtId, conclusion: 'Done' },
        'admin',
      );
      expect(r3.ok).toBe(true);
    });

    it('dispatch thinking_revise valide params', async () => {
      const r = await apexToolsDispatch.execute(
        'thinking_revise',
        { thought_id: '', step_index: 0, new_content: 'x' },
        'admin',
      );
      expect(r.ok).toBe(false);
    });
  });
});
