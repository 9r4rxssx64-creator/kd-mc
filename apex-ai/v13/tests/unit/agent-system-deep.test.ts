/**
 * Tests agent-system deep v13.4.164 (Kevin "100/100 réel sans régression").
 *
 * Module : services/agent-system.ts (315 lines, peu testé).
 * Focus : spawn flow + listActive + getHistory + getStats.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAuditLog, mockAiRouter } = vi.hoisted(() => ({
  mockAuditLog: { record: vi.fn().mockResolvedValue(undefined) },
  mockAiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string; done?: boolean }) => void) => {
      onChunk({ text: 'Mocked response', done: true });
      return Promise.resolve();
    }),
  },
}));

vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));
vi.mock('../../services/ai/ai-router.js', () => ({ aiRouter: mockAiRouter }));

import { agentSystem } from '../../services/core-svc/agent-system.js';

describe('agent-system deep (v13.4.164)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    /* Reset singleton state (active + history) */
    (agentSystem as unknown as { active: Map<string, unknown>; history: unknown[] }).active.clear();
    (agentSystem as unknown as { active: Map<string, unknown>; history: unknown[] }).history.length = 0;
  });

  afterEach(() => {
    (agentSystem as unknown as { active: Map<string, unknown>; history: unknown[] }).active.clear();
    (agentSystem as unknown as { active: Map<string, unknown>; history: unknown[] }).history.length = 0;
  });

  describe('listActive', () => {
    it('retourne array vide initialement', () => {
      expect(agentSystem.listActive()).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('retourne readonly array vide initialement', () => {
      expect(agentSystem.getHistory()).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('retourne stats vides initial', () => {
      const s = agentSystem.getStats();
      expect(s.active).toBe(0);
      expect(s.history).toBe(0);
      expect(s.completed).toBe(0);
      expect(s.failed).toBe(0);
      expect(s.avg_duration_ms).toBe(0);
    });
  });

  describe('spawn audit', () => {
    it('spawn type audit retourne agent_id + status', async () => {
      const r = await agentSystem.spawn('audit', 'Audit sécurité', { userTier: 'admin' });
      expect(r.agent_id).toMatch(/^agent_/);
      expect(['completed', 'failed']).toContain(r.status);
    });

    it('spawn ajoute à history après completion', async () => {
      await agentSystem.spawn('audit', 'Test audit short', { userTier: 'admin' });
      const hist = agentSystem.getHistory();
      expect(hist.length).toBe(1);
      expect(['completed', 'failed']).toContain(hist[0]?.status);
    });

    it('spawn audit log record appelé', async () => {
      await agentSystem.spawn('audit', 'test', { userTier: 'admin' });
      expect(mockAuditLog.record).toHaveBeenCalledWith('agent.spawn', expect.any(Object));
    });
  });

  describe('spawn plan / research / monitor', () => {
    it('spawn plan', async () => {
      const r = await agentSystem.spawn('plan', 'Plan refactor', { userTier: 'admin' });
      expect(r.agent_id).toMatch(/^agent_/);
    });

    it('spawn research', async () => {
      const r = await agentSystem.spawn('research', 'Recherche AI safety', { userTier: 'admin' });
      expect(r.agent_id).toBeDefined();
    });

    it('spawn monitor', async () => {
      const r = await agentSystem.spawn('monitor', 'Monitor health', { userTier: 'admin' });
      expect(r.agent_id).toBeDefined();
    });
  });

  describe('prompt truncation', () => {
    it('tronque prompt à 2000 chars', async () => {
      const longPrompt = 'x'.repeat(5000);
      const r = await agentSystem.spawn('audit', longPrompt, { userTier: 'admin' });
      const hist = agentSystem.getHistory();
      expect(hist[0]?.prompt.length).toBeLessThanOrEqual(2000);
      expect(r.agent_id).toBeDefined();
    });
  });

  describe('tools custom', () => {
    it('accepte tools custom passés', async () => {
      await agentSystem.spawn('audit', 'X', {
        userTier: 'admin',
        tools: ['custom_tool_1', 'custom_tool_2'],
      });
      const hist = agentSystem.getHistory();
      expect(hist[0]?.tools_allowed).toContain('custom_tool_1');
    });

    it('utilise default tools si non fournis', async () => {
      await agentSystem.spawn('audit', 'X', { userTier: 'admin' });
      const hist = agentSystem.getHistory();
      expect(hist[0]?.tools_allowed.length).toBeGreaterThan(0);
    });
  });

  describe('stats après runs', () => {
    it('stats compte completed', async () => {
      await agentSystem.spawn('audit', 'X', { userTier: 'admin' });
      await agentSystem.spawn('plan', 'Y', { userTier: 'admin' });
      const s = agentSystem.getStats();
      expect(s.history).toBe(2);
      expect(s.completed + s.failed).toBe(2);
    });

    it('avg_duration_ms >= 0', async () => {
      await agentSystem.spawn('audit', 'X', { userTier: 'admin' });
      const s = agentSystem.getStats();
      expect(s.avg_duration_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
