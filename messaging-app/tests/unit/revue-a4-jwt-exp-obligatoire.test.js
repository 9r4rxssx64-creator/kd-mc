// @vitest-environment node
/**
 * Revue 08.10.2026 — A4 (P2) : verifyJWT (worker ET Durable Object) acceptait un
 * jeton SANS exp — valable à vie. exp est désormais obligatoire. Les jetons
 * internes (ticket WS 60 s, ticket média 300 s, relais DO « wsfwd » 60 s) en
 * portent bien un : prouvé ici avec le vrai worker et la vraie vérification du DO.
 * Sabotage : remettre `if (payload.exp && …)` → le test 1 ou 2 passe au rouge.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { signJWT, verifyJWT } from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { ENV } from './api-worker-helpers.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{"ok":true}')); });

const S = 'secret-de-test';
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

describe('A4 — exp obligatoire', () => {
  it('1. worker : sans exp → null ; exp non numérique → null ; avec exp → payload', async () => {
    expect(await verifyJWT(await signJWT({ sub: 'u' }, S), S)).toBeNull();
    expect(await verifyJWT(await signJWT({ sub: 'u', exp: 'jamais' }, S), S)).toBeNull();
    const ok = await verifyJWT(await signJWT({ sub: 'u', exp: Math.floor(Date.now() / 1000) + 60 }, S), S);
    expect(ok && ok.sub).toBe('u');
  });

  it('2. Durable Object : sans exp → null ; avec exp → payload', async () => {
    const E = ENV({ JWT_SIGN_KEY: S });
    const doObj = new ConversationDO({ id: { toString: () => 'do_c1' }, storage: { get: async () => 0 }, blockConcurrencyWhile: (f) => f() }, E);
    expect(await doObj.verifyJWT(await signJWT({ sub: 'u' }, S))).toBeNull();
    const ok = await doObj.verifyJWT(await signJWT({ sub: 'u', exp: Math.floor(Date.now() / 1000) + 60 }, S));
    expect(ok && ok.sub).toBe('u');
  });

  it('3. les jetons internes portent exp : ticket WS, ticket média, relais wsfwd accepté par le DO', async () => {
    const seen = [];
    const E = ENV({
      APEX_CHAT_DB: {
        prepare(sql) {
          const st = { _a: [], bind(...a) { st._a = a; return st; },
            async first() {
              if (sql.includes('last_force_logout_at')) return { last_force_logout_at: null, is_banned: 0, status: 'active', is_admin: 0 };
              if (sql.includes('FROM conversation_members')) return { conv_id: 'c1', user_id: 'u_alice', role: 'member' };
              if (sql.includes('FROM conversations')) return { id: 'c1', sharded_to_do: 'do_c1' };
              return null;
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
            async all() { return { results: [] }; } };
          return st;
        },
      },
      CONVERSATION_DO: { idFromName: (n) => n, get: () => ({ fetch: async (req) => { seen.push(req.url); return new Response('OK'); } }) },
    });
    const session = await signJWT({ sub: 'u_alice', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, E.JWT_SIGN_KEY);
    const hdr = { Authorization: 'Bearer ' + session };
    const ws = await (await worker.fetch(new Request('https://api.apex/api/auth/ws-ticket', { method: 'POST', headers: hdr }), E, { waitUntil() {} })).json();
    expect(Number.isFinite(decode(ws.ticket).exp)).toBe(true);
    const mt = await (await worker.fetch(new Request('https://api.apex/api/auth/media-ticket', { method: 'POST', headers: hdr }), E, { waitUntil() {} })).json();
    expect(Number.isFinite(decode(mt.ticket).exp)).toBe(true);

    const req = new Request('https://api.apex/api/conversations/c1/ws?ticket=' + encodeURIComponent(ws.ticket) + '&uid=u_alice');
    const h = new Headers(req.headers); h.set('Upgrade', 'websocket');
    Object.defineProperty(req, 'headers', { value: h });
    expect((await worker.fetch(req, E, { waitUntil() {} })).status).toBe(200);
    const fwd = new URL(seen[0]).searchParams.get('token');
    expect(decode(fwd).typ).toBe('wsfwd');
    expect(Number.isFinite(decode(fwd).exp)).toBe(true);
    const doObj = new ConversationDO({ id: { toString: () => 'do_c1' }, storage: { get: async () => 0 }, blockConcurrencyWhile: (f) => f() }, E);
    expect((await doObj.verifyJWT(fwd))?.sub).toBe('u_alice');
  });
});
