/**
 * APEX v13.4.7 — Connecteur MCP OpenLégi / Légifrance (Kevin 2026-05-12).
 *
 * Server MCP officiel : https://mcp.openlegi.fr/legifrance/mcp
 * Token Apex stocké chiffré dans le coffre : `ax_openlegi_mcp_token`.
 *
 * Tools MCP exposés (auto-discover) :
 *  - rechercher_dans_texte_legal : recherche LODA full-text
 *  - rechercher_code             : recherche dans codes français
 *  - rechercher_jurisprudence_judiciaire : Cassation
 *  - rechercher_jurisprudence_administrative : Conseil d'État
 *  - consulter_article           : article par ID Légifrance
 *  - creer_ticket                : feedback bug
 *
 * Protocole : MCP 2024-11-05 (JSON-RPC 2.0 + SSE).
 * Session : header `mcp-session-id` à conserver pendant toute la session.
 *
 * Référence Kevin règle "Légal niveau expert" : intégration officielle
 * Légifrance via MCP > scraping HTML > PISTE OAuth.
 */

import { logger } from '../../core/logger.js';

const MCP_BASE_URL = 'https://mcp.openlegi.fr/legifrance/mcp';
const FETCH_TIMEOUT_MS = 25_000;
const PROTOCOL_VERSION = '2024-11-05';

export interface OpenLegiMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface OpenLegiMcpCallResult {
  ok: boolean;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  error?: string;
}

class OpenLegiMcpConnector {
  private sessionId: string | null = null;
  private tools: OpenLegiMcpTool[] = [];
  private initialized = false;

  /** Token Apex (stocké chiffré dans le coffre — ne JAMAIS le logger). */
  private getToken(): string | null {
    return localStorage.getItem('ax_openlegi_mcp_token');
  }

  /** Initialise la session MCP (idempotent, cache session-id). */
  async init(): Promise<{ ok: boolean; sessionId?: string; toolsCount?: number; reason?: string }> {
    if (this.initialized && this.sessionId) {
      return { ok: true, sessionId: this.sessionId, toolsCount: this.tools.length };
    }
    const token = this.getToken();
    if (!token) {
      return { ok: false, reason: 'token_missing — colle ton token MCP OpenLégi dans le Coffre (ax_openlegi_mcp_token)' };
    }

    /* 1. Initialize handshake (récupère session-id du header response) */
    try {
      const initRes = await this.rawFetch('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'apex-v13', version: '13.4.7' },
      });
      if (!initRes.ok) {
        return { ok: false, reason: `initialize HTTP ${initRes.status}` };
      }
      const sid = initRes.headers.get('mcp-session-id');
      if (!sid) {
        return { ok: false, reason: 'no mcp-session-id header' };
      }
      this.sessionId = sid;
      /* Drain SSE response (on n'a pas besoin du body initialize) */
      await initRes.text();
    } catch (err: unknown) {
      return { ok: false, reason: `initialize failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    /* 2. Notify initialized (no response expected) */
    try {
      await this.rawFetch('notifications/initialized', undefined, true);
    } catch (err: unknown) {
      logger.warn('openlegi-mcp', 'notifications/initialized failed (continuing)', { err });
    }

    /* 3. List tools (mise en cache locale) */
    try {
      const listRes = await this.rpcCall('tools/list', {});
      const result = listRes as { tools?: OpenLegiMcpTool[] };
      this.tools = result.tools ?? [];
    } catch (err: unknown) {
      logger.warn('openlegi-mcp', 'tools/list failed', { err });
    }

    this.initialized = true;
    logger.info('openlegi-mcp', `init OK — session=${this.sessionId.slice(0, 8)}… tools=${this.tools.length}`);
    return { ok: true, sessionId: this.sessionId, toolsCount: this.tools.length };
  }

  /** Liste les tools MCP disponibles (init() doit avoir été appelé). */
  async listTools(): Promise<OpenLegiMcpTool[]> {
    if (!this.initialized) {
      await this.init();
    }
    return this.tools;
  }

  /**
   * Appelle un tool MCP.
   * Exemples :
   *   call('rechercher_code', { search: 'vie privée', code_name: 'Code civil' })
   *   call('rechercher_dans_texte_legal', { search: 'signature électronique' })
   */
  async call(toolName: string, args: Record<string, unknown>): Promise<OpenLegiMcpCallResult> {
    const initRes = await this.init();
    if (!initRes.ok) {
      return {
        ok: false,
        content: [{ type: 'text', text: '' }],
        isError: true,
        error: initRes.reason ?? 'init failed',
      };
    }
    try {
      const result = await this.rpcCall('tools/call', {
        name: toolName,
        arguments: args,
      });
      const r = result as { content?: Array<{ type: string; text: string }>; isError?: boolean };
      return {
        ok: !r.isError,
        content: (r.content ?? []).filter((c) => c.type === 'text').map((c) => ({ type: 'text' as const, text: c.text })),
        ...(r.isError !== undefined && { isError: r.isError }),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('openlegi-mcp', `tools/call ${toolName} failed`, { err: msg, args: Object.keys(args) });
      return {
        ok: false,
        content: [{ type: 'text', text: '' }],
        isError: true,
        error: msg,
      };
    }
  }

  /** Helper haut-niveau : recherche dans un code français. */
  async searchCode(query: string, codeName: string, opts: { page?: number; pageSize?: number; champ?: string } = {}): Promise<string> {
    const r = await this.call('rechercher_code', {
      search: query,
      code_name: codeName,
      champ: opts.champ ?? 'ALL',
      page_number: opts.page ?? 1,
      page_size: opts.pageSize ?? 10,
    });
    if (!r.ok) return `Erreur recherche : ${r.error ?? 'unknown'}`;
    return r.content.map((c) => c.text).join('\n\n');
  }

  /** Helper haut-niveau : recherche LODA texte légal. */
  async searchLegalText(query: string, opts: { textId?: string; page?: number } = {}): Promise<string> {
    const args: Record<string, unknown> = {
      search: query,
      page_number: opts.page ?? 1,
    };
    if (opts.textId) args['text_id'] = opts.textId;
    const r = await this.call('rechercher_dans_texte_legal', args);
    if (!r.ok) return `Erreur recherche : ${r.error ?? 'unknown'}`;
    return r.content.map((c) => c.text).join('\n\n');
  }

  /** Status connecteur (admin debug). */
  status(): { initialized: boolean; session_id_set: boolean; token_configured: boolean; tools_count: number } {
    return {
      initialized: this.initialized,
      session_id_set: this.sessionId !== null,
      token_configured: this.getToken() !== null,
      tools_count: this.tools.length,
    };
  }

  /** Reset session (force re-init au prochain appel). */
  reset(): void {
    this.sessionId = null;
    this.initialized = false;
    this.tools = [];
  }

  /* ────────── Internals ────────── */

  private async rawFetch(method: string, params: unknown, isNotification = false): Promise<Response> {
    const token = this.getToken();
    if (!token) throw new Error('token_missing');
    const url = `${MCP_BASE_URL}?token=${encodeURIComponent(token)}`;
    const body: Record<string, unknown> = {
      jsonrpc: '2.0',
      method,
    };
    if (params !== undefined) body['params'] = params;
    if (!isNotification) body['id'] = Math.floor(Math.random() * 1_000_000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async rpcCall(method: string, params: unknown): Promise<unknown> {
    const res = await this.rawFetch(method, params);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    /* Parse SSE response : "event: message\ndata: {...}\n\n" */
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) {
      /* JSON pur (notification ack) */
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    }
    const payload = JSON.parse(dataLine.slice(6)) as { result?: unknown; error?: { message?: string } };
    if (payload.error) {
      throw new Error(payload.error.message ?? 'MCP error');
    }
    return payload.result;
  }
}

export const openLegiMcpConnector = new OpenLegiMcpConnector();
