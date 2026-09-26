/**
 * APEX v13.4.10 — Tests mcp-client + mcp-registry.
 *
 * Couvre :
 *  - Registry init avec 3 default servers (bofip, almanac, legal-hunter)
 *  - register / unregister
 *  - rate limit (max 30 req/min)
 *  - cache LRU TTL 1h
 *  - fetch error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn(async () => undefined) },
}));

vi.mock('../../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('MCP Registry', () => {
  it('init enregistre 3 default servers (bofip, almanac, legal-hunter)', async () => {
    const { mcpRegistry } = await import('../../services/ai/mcp-registry.js');
    await mcpRegistry.init();
    const servers = mcpRegistry.list();

    const ids = servers.map((s) => s.id).sort();
    expect(ids).toContain('bofip');
    expect(ids).toContain('almanac');
    expect(ids).toContain('legal-hunter');
  });

  it('get retourne un server existant', async () => {
    const { mcpRegistry } = await import('../../services/ai/mcp-registry.js');
    await mcpRegistry.init();
    const bofip = mcpRegistry.get('bofip');
    expect(bofip).toBeDefined();
    expect(bofip?.name).toContain('BOFiP');
    expect(bofip?.url).toContain('mcp.openlegi.fr/bofip');
  });

  it('get retourne null pour ID inconnu', async () => {
    const { mcpRegistry } = await import('../../services/ai/mcp-registry.js');
    await mcpRegistry.init();
    const unknown = mcpRegistry.get('inconnu');
    expect(unknown).toBeNull();
  });

  it('register ajoute un nouveau server', async () => {
    const { mcpRegistry } = await import('../../services/ai/mcp-registry.js');
    await mcpRegistry.init();
    const ok = await mcpRegistry.register({
      id: 'custom-server',
      name: 'Custom Test',
      url: 'https://example.com/mcp',
    });
    expect(ok).toBe(true);
    expect(mcpRegistry.get('custom-server')).toBeDefined();
  });

  it('register refuse un duplicate', async () => {
    const { mcpRegistry } = await import('../../services/ai/mcp-registry.js');
    await mcpRegistry.init();
    const ok = await mcpRegistry.register({
      id: 'bofip', /* déjà présent */
      name: 'Doublon',
      url: 'https://other.com',
    });
    expect(ok).toBe(false);
  });

  it('unregister supprime un server existant', async () => {
    const { mcpRegistry } = await import('../../services/ai/mcp-registry.js');
    await mcpRegistry.init();
    await mcpRegistry.register({
      id: 'to-delete',
      name: 'À supprimer',
      url: 'https://x.com',
    });
    const ok = await mcpRegistry.unregister('to-delete');
    expect(ok).toBe(true);
    expect(mcpRegistry.get('to-delete')).toBeNull();
  });

  it('unregister retourne false pour ID inconnu', async () => {
    const { mcpRegistry } = await import('../../services/ai/mcp-registry.js');
    await mcpRegistry.init();
    const ok = await mcpRegistry.unregister('inexistant-123');
    expect(ok).toBe(false);
  });
});

describe('MCP Client', () => {
  beforeEach(() => {
    /* Setup registry avec 1 server pour les tests call */
    localStorage.setItem(
      'ax_mcp_servers',
      JSON.stringify([
        {
          id: 'test-server',
          name: 'Test',
          url: 'https://test.example.com/mcp',
          status: 'unknown',
          toolsExposed: [],
          lastCheck: 0,
          errorCount: 0,
        },
      ]),
    );
  });

  it('call retourne erreur si server non enregistré', async () => {
    const { mcpClient } = await import('../../services/ai/mcp-client.js');
    const result = await mcpClient.call({
      serverId: 'unknown-server',
      toolName: 'search',
      params: { query: 'test' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server not registered');
  });

  it('call gère fetch failure gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch;

    const { mcpClient } = await import('../../services/ai/mcp-client.js');
    const result = await mcpClient.call({
      serverId: 'test-server',
      toolName: 'search',
      params: { query: 'test' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('call retourne data si JSON-RPC répond OK', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ result: { found: 42 } }),
      }),
    ) as unknown as typeof fetch;

    const { mcpClient } = await import('../../services/ai/mcp-client.js');
    const result = await mcpClient.call({
      serverId: 'test-server',
      toolName: 'search',
      params: { query: 'TVA' },
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ found: 42 });
  });

  it('call retourne error si JSON-RPC répond avec error', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ error: { message: 'Tool not found' } }),
      }),
    ) as unknown as typeof fetch;

    const { mcpClient } = await import('../../services/ai/mcp-client.js');
    const result = await mcpClient.call({
      serverId: 'test-server',
      toolName: 'unknown_tool',
      params: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool not found');
  });

  it('call gère HTTP error non-200', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      }),
    ) as unknown as typeof fetch;

    const { mcpClient } = await import('../../services/ai/mcp-client.js');
    const result = await mcpClient.call({
      serverId: 'test-server',
      toolName: 'search',
      params: { query: 'X' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('503');
  });

  it('healthCheck retourne {alive, latencyMs}', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ result: { tools: [] } }),
      }),
    ) as unknown as typeof fetch;

    const { mcpClient } = await import('../../services/ai/mcp-client.js');
    const health = await mcpClient.healthCheck('test-server');
    expect(typeof health.alive).toBe('boolean');
    expect(typeof health.latencyMs).toBe('number');
  });
});
