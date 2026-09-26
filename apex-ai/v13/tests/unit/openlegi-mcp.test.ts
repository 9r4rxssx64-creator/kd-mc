/**
 * Tests openlegi-mcp connector v13.4.141 (Kevin "100/100 réel").
 *
 * Module : services/connectors/openlegi-mcp.ts (174 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openLegiMcpConnector } from '../../services/connectors/openlegi-mcp.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/** Build SSE-style response body */
function sseResponse(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

describe('openlegi-mcp connector (v13.4.141 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    openLegiMcpConnector.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    openLegiMcpConnector.reset();
  });

  describe('status', () => {
    it('non-initialisé, pas de token', () => {
      const s = openLegiMcpConnector.status();
      expect(s.initialized).toBe(false);
      expect(s.session_id_set).toBe(false);
      expect(s.token_configured).toBe(false);
      expect(s.tools_count).toBe(0);
    });

    it('détecte token configuré', () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_xyz_123');
      const s = openLegiMcpConnector.status();
      expect(s.token_configured).toBe(true);
    });
  });

  describe('init', () => {
    it('refuse si pas de token', async () => {
      const r = await openLegiMcpConnector.init();
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('token_missing');
    });

    it('init OK retourne sessionId + tools', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('', { status: 200, headers: { 'mcp-session-id': 'sess_abc123' } }),
        )
        .mockResolvedValueOnce(new Response('', { status: 200 })) /* notifications/initialized */
        .mockResolvedValueOnce(
          new Response(sseResponse({ result: { tools: [{ name: 'rechercher_code', description: 'desc', inputSchema: {} }] } }), { status: 200 }),
        );
      const r = await openLegiMcpConnector.init();
      expect(r.ok).toBe(true);
      expect(r.sessionId).toBe('sess_abc123');
      expect(r.toolsCount).toBe(1);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('init est idempotent (2e appel retourne cache)', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('', { status: 200, headers: { 'mcp-session-id': 'sess_xyz' } }),
        )
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(
          new Response(sseResponse({ result: { tools: [] } }), { status: 200 }),
        );
      await openLegiMcpConnector.init();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const r2 = await openLegiMcpConnector.init();
      expect(r2.ok).toBe(true);
      /* Pas de nouvel appel fetch */
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('échec initialize HTTP retourne ok=false', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 401 }),
      );
      const r = await openLegiMcpConnector.init();
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('401');
    });

    it('échec si pas de session-id header', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 200 }) /* no mcp-session-id header */,
      );
      const r = await openLegiMcpConnector.init();
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('session-id');
    });

    it('échec si fetch throw', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await openLegiMcpConnector.init();
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('failed');
    });
  });

  describe('call', () => {
    it('retourne erreur si init échoue', async () => {
      const r = await openLegiMcpConnector.call('rechercher_code', { search: 'test' });
      expect(r.ok).toBe(false);
      expect(r.isError).toBe(true);
    });

    it('appelle tool OK', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('', { status: 200, headers: { 'mcp-session-id': 'sess_call' } }),
        )
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(
          new Response(sseResponse({ result: { tools: [] } }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            sseResponse({ result: { content: [{ type: 'text', text: 'Article 1240' }] } }),
            { status: 200 },
          ),
        );
      const r = await openLegiMcpConnector.call('rechercher_code', { search: 'vie privée' });
      expect(r.ok).toBe(true);
      expect(r.content.length).toBe(1);
      expect(r.content[0]?.text).toBe('Article 1240');
    });

    it('gère erreur RPC dans payload', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('', { status: 200, headers: { 'mcp-session-id': 'sess_err' } }),
        )
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(
          new Response(sseResponse({ result: { tools: [] } }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(sseResponse({ error: { message: 'Tool not found' } }), { status: 200 }),
        );
      const r = await openLegiMcpConnector.call('unknown_tool', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Tool not found');
    });
  });

  describe('searchCode helper', () => {
    it('retourne texte concaténé si OK', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('', { status: 200, headers: { 'mcp-session-id': 'sess_sc' } }),
        )
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(
          new Response(sseResponse({ result: { tools: [] } }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            sseResponse({ result: { content: [{ type: 'text', text: 'Code civil article 9' }] } }),
            { status: 200 },
          ),
        );
      const r = await openLegiMcpConnector.searchCode('vie privée', 'Code civil');
      expect(r).toContain('Code civil article 9');
    });

    it('retourne erreur format string si appel échoue', async () => {
      const r = await openLegiMcpConnector.searchCode('q', 'CC');
      expect(r).toMatch(/^Erreur recherche/);
    });
  });

  describe('searchLegalText helper', () => {
    it('retourne erreur format string sans token', async () => {
      const r = await openLegiMcpConnector.searchLegalText('signature électronique');
      expect(r).toMatch(/^Erreur recherche/);
    });
  });

  describe('listTools', () => {
    it('appelle init si nécessaire et retourne tools', async () => {
      localStorage.setItem('ax_openlegi_mcp_token', 'tok_test');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('', { status: 200, headers: { 'mcp-session-id': 'sess_lt' } }),
        )
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            sseResponse({
              result: { tools: [{ name: 't1', description: 'd1', inputSchema: {} }] },
            }),
            { status: 200 },
          ),
        );
      const tools = await openLegiMcpConnector.listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(1);
    });
  });

  describe('reset', () => {
    it('reset() vide état', () => {
      openLegiMcpConnector.reset();
      const s = openLegiMcpConnector.status();
      expect(s.initialized).toBe(false);
      expect(s.session_id_set).toBe(false);
      expect(s.tools_count).toBe(0);
    });
  });
});
