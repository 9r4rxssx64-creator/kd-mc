/**
 * Tests claude-code-mcp-bridge v13.4.140 (Kevin "100/100 réel").
 *
 * Module : services/claude-code-mcp-bridge.ts (345 stmts, était 0% coverage).
 * Couvre : catalogue, detectMCPIntent, listServers, escalateMCPRequest, prompt, stats.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/ai/claude-bridge.js', () => ({
  claudeBridge: {
    pushTodo: vi.fn().mockResolvedValue({ id: 'todo_xyz_123', ts: Date.now(), status: 'pending' }),
  },
}));

import { claudeCodeMCPBridge, MCP_CATALOG } from '../../services/ai/claude-code-mcp-bridge.js';
import { claudeBridge } from '../../services/ai/claude-bridge.js';

describe('claude-code-mcp-bridge (v13.4.140 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('MCP_CATALOG', () => {
    it('expose un catalogue non vide avec tous les champs requis', () => {
      expect(Array.isArray(MCP_CATALOG)).toBe(true);
      expect(MCP_CATALOG.length).toBeGreaterThan(0);
      MCP_CATALOG.forEach((cap) => {
        expect(cap.server).toBeTypeOf('string');
        expect(cap.tool).toBeTypeOf('string');
        expect(cap.description).toBeTypeOf('string');
        expect(cap.category).toBeTypeOf('string');
        expect(Array.isArray(cap.triggers)).toBe(true);
        expect(['auto', 'notify', 'validate']).toContain(cap.authorization);
      });
    });

    it('couvre les principaux serveurs MCP', () => {
      const servers = new Set(MCP_CATALOG.map((c) => c.server));
      expect(servers.has('github')).toBe(true);
    });
  });

  describe('detectMCPIntent', () => {
    it('matche un trigger simple (issue)', () => {
      const matches = claudeCodeMCPBridge.detectMCPIntent('Crée une issue pour ce bug');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m) => m.tool.includes('create_issue'))).toBe(true);
    });

    it('matche un trigger pull request', () => {
      const matches = claudeCodeMCPBridge.detectMCPIntent('Ouvre une pull request');
      expect(matches.some((m) => m.tool.includes('create_pull_request'))).toBe(true);
    });

    it('retourne tableau vide si aucun trigger', () => {
      const matches = claudeCodeMCPBridge.detectMCPIntent('xyz random text 12345');
      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBe(0);
    });

    it('matche case-insensitive', () => {
      const matches = claudeCodeMCPBridge.detectMCPIntent('CRÉER UNE ISSUE MAJUSCULE');
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('listServers', () => {
    it('retourne liste avec id, toolCount, categories', () => {
      const servers = claudeCodeMCPBridge.listServers();
      expect(Array.isArray(servers)).toBe(true);
      expect(servers.length).toBeGreaterThan(0);
      servers.forEach((s) => {
        expect(s.id).toBeTypeOf('string');
        expect(s.toolCount).toBeGreaterThan(0);
        expect(Array.isArray(s.categories)).toBe(true);
      });
    });

    it('groupe correctement les capabilities par serveur', () => {
      const servers = claudeCodeMCPBridge.listServers();
      const totalTools = servers.reduce((acc, s) => acc + s.toolCount, 0);
      expect(totalTools).toBe(MCP_CATALOG.length);
    });
  });

  describe('escalateMCPRequest', () => {
    it('escalade une requête valide via claudeBridge', async () => {
      const validCap = MCP_CATALOG[0];
      const r = await claudeCodeMCPBridge.escalateMCPRequest({
        server: validCap.server,
        tool: validCap.tool,
        args: { foo: 'bar' },
        reason: 'Test escalation',
        severity: 'high',
      });
      expect(r.ok).toBe(true);
      expect(r.todoId).toBeTypeOf('string');
      expect(claudeBridge.pushTodo).toHaveBeenCalled();
    });

    it('refuse une tool inconnue', async () => {
      const r = await claudeCodeMCPBridge.escalateMCPRequest({
        server: 'github',
        tool: 'mcp__github__UNKNOWN_TOOL_XYZ',
        args: {},
        reason: 'test',
      });
      expect(r.ok).toBe(false);
      expect(r.todoId).toBeUndefined();
    });

    it('gère échec pushTodo gracefully', async () => {
      vi.mocked(claudeBridge.pushTodo).mockRejectedValueOnce(new Error('Firebase offline'));
      const validCap = MCP_CATALOG[0];
      const r = await claudeCodeMCPBridge.escalateMCPRequest({
        server: validCap.server,
        tool: validCap.tool,
        args: {},
        reason: 'Test fail',
      });
      expect(r.ok).toBe(false);
    });

    it('utilise severity medium par défaut', async () => {
      const validCap = MCP_CATALOG[0];
      await claudeCodeMCPBridge.escalateMCPRequest({
        server: validCap.server,
        tool: validCap.tool,
        args: {},
        reason: 'Default sev',
      });
      const call = vi.mocked(claudeBridge.pushTodo).mock.calls[0]?.[0];
      expect(call?.severity).toBe('medium');
    });
  });

  describe('buildSystemPromptSection', () => {
    it('génère section markdown non vide', () => {
      const section = claudeCodeMCPBridge.buildSystemPromptSection();
      expect(section).toBeTypeOf('string');
      expect(section.length).toBeGreaterThan(50);
      expect(section).toContain('MCP');
    });

    it('liste tous les serveurs', () => {
      const section = claudeCodeMCPBridge.buildSystemPromptSection();
      const servers = claudeCodeMCPBridge.listServers();
      servers.forEach((s) => {
        expect(section.toLowerCase()).toContain(s.id.toLowerCase());
      });
    });
  });

  describe('getStats', () => {
    it('retourne stats complètes', () => {
      const stats = claudeCodeMCPBridge.getStats();
      expect(stats.totalCapabilities).toBe(MCP_CATALOG.length);
      expect(stats.byServer).toBeTypeOf('object');
      expect(stats.byCategory).toBeTypeOf('object');
      expect(stats.byAuthorization).toBeTypeOf('object');
    });

    it('byServer somme == totalCapabilities', () => {
      const stats = claudeCodeMCPBridge.getStats();
      const sum = Object.values(stats.byServer).reduce((a, b) => a + b, 0);
      expect(sum).toBe(stats.totalCapabilities);
    });

    it('byAuthorization contient au moins 1 niveau', () => {
      const stats = claudeCodeMCPBridge.getStats();
      const keys = Object.keys(stats.byAuthorization);
      expect(keys.length).toBeGreaterThan(0);
    });
  });
});
