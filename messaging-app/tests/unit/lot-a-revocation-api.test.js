// @vitest-environment node
// Lot A (audit A2-02, 15.10.2026) — un membre retiré / exclu / suspendu / supprimé est coupé du
// temps réel TOUT DE SUITE : chaque chemin de l'api-worker appelle la route interne /internal/revoke
// du VRAI ConversationDO (jeton signé typ 'dorevoke'), sur un vrai SQLite (d1Reel).
// Sabotage prouvé : retirer l'appel dans un chemin → son test échoue (socket encore ouverte).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { revokeConvSockets, revokeUserSockets, userConvIds } from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import './_support/do-hibernation.js'; // Lot E1 : API d'hibernation du runtime (acceptWebSocket, attachments, réveil)
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
class WS {
  constructor() { this.sent = []; this.closed = null; }
  send(d) { this.sent.push(d); }
  close(code, reason) { this.closed = { code, reason }; }
}

function seedUser(db, id, extra = '') {
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,is_admin)
    VALUES (?,?,?,?,?,1,'k','k','k','active',?)`).run(id, 'p_' + id, 'Nom ' + id, 'tel_' + id, 'h_' + id, extra === 'admin' ? 1 : 0);
}
function setup() {
  const DB = d1Reel();
  for (const u of ['alice', 'bob', 'carol']) seedUser(DB, u);
  seedUser(DB, 'root', 'admin');
  for (const [c, ts] of [['g1', 10], ['g2', 20]]) {
    DB.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do,member_count,last_msg_ts) VALUES (?,'group','alice',1,?,3,?)`).run(c, 'do_' + c, ts);
    DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES (?,'alice','owner',1)`).run(c);
    for (const u of ['bob', 'carol']) DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES (?,?,'member',1)`).run(c, u);
  }
  const instances = new Map();
  const calls = [];
  const env = ENV({ APEX_CHAT_DB: DB });
  env.CONVERSATION_DO = {
    idFromName: (name) => ({ name }),
    get: (id) => {
      if (!instances.has(id.name)) {
        const state = { id: { toString: () => id.name }, storage: { get: async () => undefined, put: async () => {} }, blockConcurrencyWhile: async (fn) => fn() };
        instances.set(id.name, new ConversationDO(state, { APEX_CHAT_DB: DB, JWT_SIGN_KEY: env.JWT_SIGN_KEY }));
      }
      const d = instances.get(id.name);
      return { fetch: (req) => { calls.push(req); return d.fetch(req); } };
    },
  };
  /** Ouvre une socket (session déjà authentifiée) de `uid` sur la conversation `conv`. */
  const open = (conv, uid) => {
    env.CONVERSATION_DO.get({ name: 'do_' + conv });
    const ws = new WS();
    instances.get('do_' + conv).sessions.set(ws, { userId: uid, convId: conv, connectedAt: Date.now(), lastMemberCheck: Date.now(), messageCount: 0, lastReset: Date.now() });
    return ws;
  };
  return { DB, env, open, calls, instances };
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const call = async (env, method, path, sub, body) => worker.fetch(makeRequest({ method, path, body, token: await tok(sub) }), env, CTX);

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('A2-02 — chaque chemin de retrait coupe les sockets du membre IMMÉDIATEMENT', () => {
  it('le propriétaire retire bob du groupe → la socket de bob est fermée (1008), celles des autres restent', async () => {
    const { env, open } = setup();
    const bob = open('g1', 'bob'); const carol = open('g1', 'carol');
    const r = await call(env, 'DELETE', '/api/conversations/g1/members/bob', 'alice');
    expect(r.status).toBe(200);
    expect(bob.closed).toEqual({ code: 1008, reason: 'Accès retiré' });
    expect(carol.closed).toBeNull();
  });

  it('bob quitte / supprime la conversation de son côté → ses sockets sur cette conv sont fermées', async () => {
    const { env, open } = setup();
    const bob1 = open('g1', 'bob'); const bob2 = open('g2', 'bob');
    const r = await call(env, 'DELETE', '/api/conversations/g1', 'bob');
    expect(r.status).toBe(200);
    expect(bob1.closed).toMatchObject({ code: 1008 });
    expect(bob2.closed).toBeNull();                                         // l'autre conversation n'est pas concernée
  });

  it('admin : kickUser (une conv), banUser et forceLogout (toutes ses conversations)', async () => {
    const { env, open } = setup();
    const k = open('g1', 'bob'); const kOther = open('g2', 'bob');
    expect((await call(env, 'POST', '/api/admin/commands', 'root', { command: 'kickUser', params: { convId: 'g1', userId: 'bob' }, confirm_token: 'ok' })).status).toBe(200);
    expect(k.closed).toMatchObject({ code: 1008 });
    expect(kOther.closed).toBeNull();
    const c1 = open('g1', 'carol'); const c2 = open('g2', 'carol');
    expect((await call(env, 'POST', '/api/admin/commands', 'root', { command: 'banUser', params: { userId: 'carol' }, confirm_token: 'ok' })).status).toBe(200);
    expect([c1.closed, c2.closed]).toMatchObject([{ code: 1008 }, { code: 1008 }]);
    const b2 = open('g2', 'bob');
    expect((await call(env, 'POST', '/api/admin/commands', 'root', { command: 'forceLogout', params: { userId: 'bob' }, confirm_token: 'ok' })).status).toBe(200);
    expect(b2.closed).toMatchObject({ code: 1008 });
  });

  it('admin, fiche utilisateur : block / ban / force_logout / delete coupent ; authorize ne coupe pas', async () => {
    for (const action of ['block', 'ban', 'force_logout', 'delete']) {
      const { env, open } = setup();
      const s = open('g2', 'bob');
      const r = await call(env, 'POST', `/api/admin/users/bob/${action}`, 'root');
      expect(r.status, action).toBe(200);
      expect(s.closed, action).toMatchObject({ code: 1008 });
    }
    const { env, open } = setup();
    const s = open('g1', 'bob');
    expect((await call(env, 'POST', '/api/admin/users/bob/authorize', 'root')).status).toBe(200);
    expect(s.closed).toBeNull();
  });

  it('suppression de compte (RGPD) : conversations lues AVANT la rupture des liens → toutes ses sockets fermées', async () => {
    const { env, open } = setup();
    const a = open('g1', 'bob'); const b = open('g2', 'bob');
    const r = await call(env, 'DELETE', '/api/users/me', 'bob', { confirm: 'SUPPRIMER' });
    expect(r.status).toBe(200);
    expect([a.closed, b.closed]).toMatchObject([{ code: 1008 }, { code: 1008 }]);
  });

  it('le jeton interne est court, typé, lié à la conv — et ne vaut JAMAIS jeton de session', async () => {
    const { env, open, calls } = setup();
    open('g1', 'bob');
    await revokeConvSockets(env, 'g1', 'bob');
    const req = calls.at(-1);
    expect(req.method).toBe('POST');
    const token = req.headers.get('Authorization').replace('Bearer ', '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload).toMatchObject({ sub: 'bob', conv: 'g1', typ: 'dorevoke' });
    expect(payload.exp - payload.iat).toBe(60);
    const asSession = await worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations', token }), env, CTX);
    expect(asSession.status).toBe(401);
  });
});

describe('A2-02 — aides de révocation (best-effort, bornées)', () => {
  it('sans liaison DO → false ; DO en panne → false et journalisé (l’action REST n’échoue jamais)', async () => {
    const { env } = setup();
    expect(await revokeConvSockets({ ...env, CONVERSATION_DO: undefined }, 'g1', 'bob')).toBe(false);
    const broken = { ...env, CONVERSATION_DO: { idFromName: () => ({}), get: () => ({ fetch: async () => { throw new Error('DO down'); } }) } };
    expect(await revokeConvSockets(broken, 'g1', 'bob')).toBe(false);
    expect(console.warn).toHaveBeenCalled();
    const { DB } = setup();
    const r = await call({ ...broken, APEX_CHAT_DB: DB }, 'DELETE', '/api/conversations/g1/members/bob', 'alice');
    expect(r.status).toBe(200);
  });

  it('conversations de l’utilisateur : plus actives d’abord, base illisible → [] ; au plus 40 appels', async () => {
    const { env, DB } = setup();
    expect(await userConvIds(env, 'bob')).toEqual(['g2', 'g1']);
    expect(await userConvIds({ ...env, APEX_CHAT_DB: { prepare: () => { throw new Error('D1 down'); } } }, 'bob')).toEqual([]);
    const ids = Array.from({ length: 55 }, (_, i) => 'c' + i);
    const fetches = [];
    const ns = { idFromName: (n) => n, get: () => ({ fetch: async (r) => { fetches.push(r); return new Response('{}', { status: 200 }); } }) };
    expect(await revokeUserSockets({ ...env, APEX_CHAT_DB: DB, CONVERSATION_DO: ns }, 'bob', ids)).toBe(40);
    expect(fetches).toHaveLength(40);
  });
});
