// @vitest-environment node
/**
 * Panne trouvée à la revue du 08.10.2026 — le temps réel était REFUSÉ pour
 * toute app à jour : elle ouvre le WebSocket avec ?ticket= (v1.1.286), le
 * worker vérifie le ticket… puis transmettait la requête telle quelle au
 * Durable Object, qui ne lit QUE ?token= → fermeture 1008 « Auth required ».
 * Les tests existants simulaient le Durable Object et ne pouvaient pas le voir.
 *
 * Ce fichier prouve, avec le vrai worker ET la vraie vérification du DO :
 *   1. ce que reçoit le DO porte un ?token= que le DO accepte, au nom du BON
 *      utilisateur, et plus aucun ?ticket= ;
 *   2. la conversation transmise est celle du CHEMIN (vérifiée), jamais un
 *      ?conv= choisi par le client ;
 *   3. le ticket reste à usage unique.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { signJWT } from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { ENV } from './api-worker-helpers.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{"ok":true}')); });

const UID = 'u_alice';

function stubDB() {
  const tickets = new Set();
  return {
    prepare(sql) {
      const stmt = {
        _a: [],
        bind(...a) { return { ...stmt, _a: a }; },
        async first() {
          if (sql.includes('last_force_logout_at')) return { last_force_logout_at: null, is_banned: 0, status: 'active', phone: '+33600000091' };
          if (sql.includes('FROM conversation_members')) return { conv_id: 'c1', user_id: UID, role: 'member' };
          if (sql.includes('FROM conversations')) return { id: 'c1', sharded_to_do: 'do_c1' };
          return null;
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE INTO ws_tickets')) {
            const jti = this._a[0];
            if (tickets.has(jti)) return { success: true, meta: { changes: 0 } };
            tickets.add(jti);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
}

function env() {
  const seen = [];
  return {
    seen,
    ...ENV(),
    APEX_CHAT_DB: stubDB(),
    CONVERSATION_DO: {
      idFromName: (n) => n,
      get: () => ({ fetch: async (req) => { seen.push(req.url); return new Response('DO_OK', { status: 200 }); } }),
    },
  };
}

// Node interdit de poser `Upgrade` à la construction d'une Request : on le pose
// sur l'objet Headers ensuite (garde « none »), comme le ferait workerd.
function wsRequest(url) {
  const req = new Request(url);
  const h = new Headers(req.headers);
  h.set('Upgrade', 'websocket');
  Object.defineProperty(req, 'headers', { value: h });
  return req;
}

async function ticketFor(E, uid) {
  const session = await signJWT({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }, E.JWT_SIGN_KEY);
  const r = await worker.fetch(new Request('https://api.apex/api/auth/ws-ticket', {
    method: 'POST', headers: { Authorization: 'Bearer ' + session },
  }), E, { waitUntil() {} });
  return (await r.json()).ticket;
}

describe('WebSocket par ticket : le Durable Object reçoit une identité qu\'il accepte', () => {
  it('le DO reçoit ?token= valide pour le bon utilisateur, sans ticket, conv = chemin', async () => {
    const E = env();
    const ticket = await ticketFor(E, UID);
    const r = await worker.fetch(wsRequest(
      'https://api.apex/api/conversations/c1/ws?ticket=' + encodeURIComponent(ticket) + '&uid=' + UID + '&conv=AUTRE_CONV'
    ), E, { waitUntil() {} });
    expect(r.status).toBe(200);
    expect(E.seen.length).toBe(1);

    const fwd = new URL(E.seen[0]);
    expect(fwd.searchParams.get('ticket')).toBeNull();
    expect(fwd.searchParams.get('conv')).toBe('c1');
    expect(fwd.searchParams.get('uid')).toBe(UID);

    // La VRAIE vérification du Durable Object doit accepter ce jeton.
    const doObj = new ConversationDO({ id: { toString: () => 'do_c1' }, storage: { get: async () => 0 }, blockConcurrencyWhile: (f) => f() }, E);
    const payload = await doObj.verifyJWT(fwd.searchParams.get('token'));
    expect(payload && payload.sub).toBe(UID);
  });

  it('le ticket reste à usage unique : 2ᵉ ouverture refusée avant le DO', async () => {
    const E = env();
    const ticket = await ticketFor(E, UID);
    const url = 'https://api.apex/api/conversations/c1/ws?ticket=' + encodeURIComponent(ticket) + '&uid=' + UID;
    await worker.fetch(wsRequest(url), E, { waitUntil() {} });
    const r2 = await worker.fetch(wsRequest(url), E, { waitUntil() {} });
    expect(r2.status).toBe(401);
    expect(E.seen.length).toBe(1);
  });
});
