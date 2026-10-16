/**
 * v13.4.376 — le client MCP respecte la CSP de la page (16.10.2026).
 * Mesuré (Lighthouse au dépôt public, run 38958462368) : la sentinelle skills-watch sondait les 29 serveurs mcp.*
 * à chaque ouverture, tous absents de connect-src → 58 violations CSP. Un hôte interdit n'est pas appelé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpClient } from '../../services/ai/mcp-client.js';

let meta: HTMLMetaElement | null = null;
const poseCSP = (c: string) => { meta = document.createElement('meta'); meta.setAttribute('http-equiv', 'Content-Security-Policy'); meta.setAttribute('content', c); document.head.appendChild(meta); };
const SERVEUR = { id: 'test-mcp', name: 'Test', url: 'https://mcp.exemple.test/mcp', status: 'unknown', toolsExposed: [], lastCheck: 0, errorCount: 0 };

beforeEach(() => { localStorage.clear(); localStorage.setItem('ax_mcp_servers', JSON.stringify([SERVEUR])); });
afterEach(() => { meta?.remove(); meta = null; vi.restoreAllMocks(); });

describe('v13.4.376 — client MCP et CSP connect-src', () => {
  it('hôte absent de connect-src : healthCheck ne fait AUCUN fetch et répond mort ; listTools vide ; call refusé', async () => {
    poseCSP("default-src 'self'; connect-src 'self' https://apis.kd-mc.com");
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ result: { tools: [] } }), { status: 200 }));
    const sante = await mcpClient.healthCheck('test-mcp');
    const outils = await mcpClient.listTools('test-mcp');
    const appel = await mcpClient.call({ serverId: 'test-mcp', toolName: 'x', params: {} });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sante.alive).toBe(false);
    expect(outils).toEqual([]);
    expect(appel.success).toBe(false);
  });

  it('hôte autorisé par connect-src : le serveur est bien appelé (le chemin existe)', async () => {
    poseCSP("default-src 'self'; connect-src 'self' https://mcp.exemple.test");
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ result: { tools: [{ name: 'a' }] } }), { status: 200 }));
    const outils = await mcpClient.listTools('test-mcp');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('mcp.exemple.test');
    expect(outils.length).toBe(1);
  });
});
