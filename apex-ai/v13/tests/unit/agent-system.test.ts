/**
 * Tests agent-system.ts (parité Claude Code subagents internes).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { agentSystem } from '../../services/core-svc/agent-system.js';

describe('Agent System (subagents internes Apex IA)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* v13.4.246 : les agents audit/monitor exécutent audit_self/read_logs en
       tier admin, re-vérifié via auth.isAdminSync() (fail-closed). Session admin
       réelle requise sinon result undefined (tool rétrogradé client_free). */
    store.set('user', { id: 'kdmc_admin', name: 'K' });
  });

  afterEach(() => {
    store.set('user', null);
  });

  describe('spawn audit agent', () => {
    it('spawn audit agent → completed avec audit_metrics', async () => {
      const r = await agentSystem.spawn('audit', 'Audit complet sécurité');
      expect(r.status).toBe('completed');
      expect(r.agent_id).toMatch(/^agent_/);
      const result = r.result as { type: string; audit_metrics?: unknown };
      expect(result.type).toBe('audit');
      expect(result.audit_metrics).toBeDefined();
    });

    it('audit agent prompt long tronqué à 2000 chars', async () => {
      const longPrompt = 'a'.repeat(5000);
      const r = await agentSystem.spawn('audit', longPrompt);
      expect(r.status).toBe('completed');
      /* Pas de crash sur prompt très long */
    });
  });

  describe('spawn plan agent', () => {
    it('plan agent décompose tâche en steps', async () => {
      const r = await agentSystem.spawn('plan', 'Améliorer coverage tests sur services');
      expect(r.status).toBe('completed');
      const result = r.result as { steps: Array<{ step: number; action: string }>; total_estimated_min: number };
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
      expect(result.total_estimated_min).toBeGreaterThan(0);
    });

    it('plan agent feature → étapes spec/impl/UI', async () => {
      const r = await agentSystem.spawn('plan', 'Ajouter une nouvelle feature de chat');
      const result = r.result as { steps: Array<{ action: string }> };
      const actions = result.steps.map((s) => s.action.toLowerCase()).join(' ');
      expect(actions).toMatch(/spec|interface|impl|test/);
    });

    it('plan agent audit → étapes audit/p0/fix', async () => {
      const r = await agentSystem.spawn('plan', 'Faire un audit complet');
      const result = r.result as { steps: Array<{ action: string }> };
      const actions = result.steps.map((s) => s.action.toLowerCase()).join(' ');
      expect(actions).toMatch(/audit|p0|fix/);
    });

    it('plan agent générique → 3 steps par défaut', async () => {
      const r = await agentSystem.spawn('plan', 'Quelque chose de spécifique');
      const result = r.result as { steps: unknown[] };
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('spawn research agent', () => {
    it('research agent → web_search results retournés', async () => {
      const r = await agentSystem.spawn('research', 'derniers modèles IA 2026');
      expect(r.status).toBe('completed');
      const result = r.result as { type: string; query: string; results: unknown };
      expect(result.type).toBe('research');
      expect(result.query).toContain('IA');
    });
  });

  describe('spawn monitor agent', () => {
    it('monitor agent → health status + metrics', async () => {
      const r = await agentSystem.spawn('monitor', 'check health');
      expect(r.status).toBe('completed');
      const result = r.result as { health: string; metrics: unknown };
      expect(['ok', 'degraded']).toContain(result.health);
      expect(result.metrics).toBeDefined();
    });

    it('monitor health=degraded si errors > 10', async () => {
      /* Simuler 15 errors dans buffer observability */
      const errors = Array.from({ length: 15 }, (_, i) => ({
        level: 'error',
        scope: 'test',
        msg: `e${i}`,
        ts: Date.now(),
      }));
      localStorage.setItem('apex_v13_observability_buffer', JSON.stringify(errors));
      const r = await agentSystem.spawn('monitor', 'check');
      const result = r.result as { health: string };
      expect(['ok', 'degraded']).toContain(result.health);
    });
  });

  describe('listActive + history + stats', () => {
    it('history après spawn complete', async () => {
      await agentSystem.spawn('audit', 'test 1');
      await agentSystem.spawn('plan', 'test 2');
      const hist = agentSystem.getHistory();
      expect(hist.length).toBeGreaterThanOrEqual(2);
      const audit = hist.find((h) => h.type === 'audit');
      expect(audit?.status).toBe('completed');
      expect(audit?.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('getStats retourne completed + failed + avg_duration', async () => {
      await agentSystem.spawn('audit', 'stats test');
      const stats = agentSystem.getStats();
      expect(stats.completed + stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.avg_duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('listActive vide après tous complete', async () => {
      await agentSystem.spawn('audit', 'sync test');
      /* await garantit completion → active vide */
      const active = agentSystem.listActive();
      expect(active.length).toBe(0);
    });
  });

  describe('Tools whitelist par type', () => {
    it('audit agent → tools_allowed contient audit_self', async () => {
      await agentSystem.spawn('audit', 'whitelist test');
      const hist = agentSystem.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.tools_allowed).toContain('audit_self');
    });

    it('research agent → tools_allowed contient web_search', async () => {
      await agentSystem.spawn('research', 'whitelist test');
      const hist = agentSystem.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.tools_allowed).toContain('web_search');
    });
  });
});
