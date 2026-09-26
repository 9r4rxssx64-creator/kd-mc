// RGPD + interrupteurs admin réels (audit 17/09/2026, P0/P1 commercial).
//
// Avant : aucune route ne permettait à un utilisateur de supprimer son compte (le lien des
// CGU pointait dans le vide), l'export ne couvrait que le téléphone, et deux interrupteurs
// admin (kevin_invisible, e2e_strict) affichaient « ON » sans rien piloter.
import { describe, it, expect, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

const IAT = () => Math.floor(Date.now() / 1000);
const userTok = () => makeJWT({ sub: 'u_del_1', pseudo: 'marie', iat: IAT() });
const adminTok = () => makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: IAT() });

/** D1 mock à règles : [motif, {first|all|run}] ; enregistre chaque run. */
function db(rules = []) {
  const runs = [];
  const all = [...rules, ['SELECT last_force_logout_at', { first: { status: 'active', is_banned: 0 } }]];
  const find = (sql) => all.find(([p]) => (p instanceof RegExp ? p.test(sql) : sql.includes(p)));
  return {
    runs,
    prepare: vi.fn((sql) => ({
      _a: [], bind(...a) { this._a = a; return this; },
      first: async function () { const r = find(sql); return r && r[1].first !== undefined ? (typeof r[1].first === 'function' ? r[1].first(this._a) : r[1].first) : null; },
      all: async function () { const r = find(sql); return { results: r && r[1].all ? r[1].all : [] }; },
      run: async function () { runs.push({ sql, args: this._a }); return { success: true, meta: { changes: 1 } }; },
    })),
    batch: vi.fn(async () => ({ success: true })),
  };
}

describe('DELETE /api/users/me — suppression de compte', () => {
  it('sans confirmation → 400, rien n\'est touché', async () => {
    const env = ENV({ APEX_CHAT_DB: db() });
    const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/users/me', body: {}, token: await userTok() }), env);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('confirm_required');
    expect(env.APEX_CHAT_DB.runs.length).toBe(0);
  });

  it('un admin ne se supprime pas par cette voie (403)', async () => {
    const env = ENV({ APEX_CHAT_DB: db() });
    const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/users/me', body: { confirm: 'SUPPRIMER' }, token: await adminTok() }), env);
    expect(r.status).toBe(403);
  });

  it('avec « SUPPRIMER » : médias R2 effacés, messages rendus illisibles, liens/appareils supprimés, compte anonymisé', async () => {
    const r2 = { delete: vi.fn(async () => {}) };
    const env = ENV({
      APEX_CHAT_DB: db([['FROM media WHERE owner_id', { all: [{ r2_key: 'media/u_del_1/a.jpg', thumbnail_r2_key: 'media/u_del_1/a_t.jpg' }] }]]),
      APEX_CHAT_MEDIA: r2,
    });
    const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/users/me', body: { confirm: 'supprimer' }, token: await userTok() }), env);
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.deleted).toBe(true);
    expect(r2.delete).toHaveBeenCalledTimes(2);
    const sqls = env.APEX_CHAT_DB.runs.map((x) => x.sql);
    expect(sqls.some((q) => q.includes('UPDATE messages SET ciphertext=NULL'))).toBe(true);
    for (const t of ['DELETE FROM media', 'DELETE FROM conversation_members', 'DELETE FROM contacts', 'DELETE FROM push_subscriptions', 'DELETE FROM connections', 'DELETE FROM user_activity']) {
      expect(sqls.some((q) => q.includes(t)), t).toBe(true);
    }
    const anon = env.APEX_CHAT_DB.runs.find((x) => x.sql.includes("UPDATE users SET status='deleted'"));
    expect(anon).toBeTruthy();
    expect(anon.sql).toContain('phone=NULL');
    expect(anon.sql).toContain('identity_key_pub=NULL');
    expect(anon.args[anon.args.length - 1]).toBe('u_del_1');
  });
});

describe('GET /api/users/me/export — toutes mes données côté serveur', () => {
  it('sans jeton → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me/export' }), ENV({ APEX_CHAT_DB: db() }));
    expect(r.status).toBe(401);
  });

  it('renvoie un JSON téléchargeable avec profil, conversations, messages, contacts, appareils, CGU', async () => {
    const env = ENV({ APEX_CHAT_DB: db([
      ['SELECT * FROM users WHERE id=?', { first: { id: 'u_del_1', pseudo: 'marie', phone: '+33600000010', real_name: 'Marie T', identity_key_pub: 'SECRET-PUB', crypto_caps: 'x' } }],
      ['FROM messages WHERE sender_id', { all: [{ id: 'm1', conv_id: 'c1', ciphertext: 'E2E1:zzz', ts: 1 }] }],
      ['FROM contacts WHERE user_id', { all: [{ contact_id: 'u2', nickname: 'Bob' }] }],
    ]) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me/export', token: await userTok() }), env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Disposition')).toMatch(/attachment; filename="apex-chat-mes-donnees-/);
    const j = await r.json();
    expect(j.profile.phone).toBe('+33600000010');
    expect(j.profile.identity_key_pub).toBeUndefined();   // clés/colonnes techniques hors export
    expect(j.messages_sent[0].ciphertext).toBe('E2E1:zzz');
    expect(j.contacts[0].nickname).toBe('Bob');
    for (const k of ['conversations', 'invitations_sent', 'media', 'push_devices', 'connections', 'cgu_acceptances', 'reports_made']) expect(Array.isArray(j[k]), k).toBe(true);
  });
});

describe('Interrupteurs admin — reflètent et pilotent la réalité', () => {
  it('GET toggles : kevin_invisible suit KEVIN_INVISIBLE_ADMIN, e2e_strict est OFF sauf activation', async () => {
    const env = ENV({ APEX_CHAT_DB: db([['FROM system_config', { all: [{ key: 'KEVIN_INVISIBLE_ADMIN', value: 'false' }, { key: 'FEATURE_STORIES', value: 'true' }] }]]) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/toggles', token: await adminTok() }), env);
    const j = await r.json();
    expect(j.toggles.kevin_invisible).toBe(false);
    expect(j.toggles.e2e_strict).toBe(false);
    expect(j.toggles.stories).toBe(true);
  });

  it('POST toggles kevin_invisible=true écrit KEVIN_INVISIBLE_ADMIN (la clé réellement lue)', async () => {
    const env = ENV({ APEX_CHAT_DB: db() });
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/admin/toggles', body: { feature: 'kevin_invisible', enabled: true }, token: await adminTok() }), env);
    expect(r.status).toBe(200);
    const w = env.APEX_CHAT_DB.runs.find((x) => x.sql.includes('INSERT INTO system_config'));
    expect(w.args[0]).toBe('KEVIN_INVISIBLE_ADMIN');
    expect(w.args[1]).toBe('true');
  });
});

describe('ConversationDO — e2e_strict appliqué', () => {
  class WS { constructor() { this.sent = []; } send(d) { this.sent.push(JSON.parse(d)); } }
  function makeDo(strict) {
    const state = { id: { toString: () => 'x' }, storage: { get: async () => 0, put: async () => {}, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn) => { await fn(); } };
    const dbm = { prepare: () => ({ bind() { return this; }, first: async () => null, run: async () => ({}), all: async () => ({ results: strict ? [{ key: 'FEATURE_E2E_STRICT', value: 'true' }] : [] }) }), batch: async () => ({}) };
    const d = new ConversationDO(state, { JWT_SIGN_KEY: 's', APEX_CHAT_DB: dbm });
    return d;
  }
  const sess = () => ({ userId: 'u1', deviceId: 'd', convId: 'c', lastSeq: 0, connectedAt: Date.now(), messageCount: 0, lastReset: Date.now() });

  it('ON : un message en clair est refusé (e2e_required), un message E2E1: passe', async () => {
    const d = makeDo(true); await new Promise((r) => setTimeout(r, 5));
    vi.spyOn(d, 'notifyOfflineMembers').mockResolvedValue();
    const ws = new WS(); d.sessions.set(ws, sess());
    await d.handleMessage(ws, { type: 'message', ciphertext: 'coucou en clair' });
    expect(ws.sent.pop()).toMatchObject({ type: 'error', code: 'e2e_required' });
    await d.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    expect(ws.sent.pop().type).toBe('ack');
  });

  it('OFF (défaut) : le clair passe encore (aucune régression pour les conversations existantes)', async () => {
    const d = makeDo(false); await new Promise((r) => setTimeout(r, 5));
    vi.spyOn(d, 'notifyOfflineMembers').mockResolvedValue();
    const ws = new WS(); d.sessions.set(ws, sess());
    await d.handleMessage(ws, { type: 'message', ciphertext: 'coucou en clair' });
    expect(ws.sent.pop().type).toBe('ack');
  });
});
