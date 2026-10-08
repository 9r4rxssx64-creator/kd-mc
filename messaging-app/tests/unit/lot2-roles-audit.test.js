// @vitest-environment node
/**
 * Lot 2 — A (journal d'audit), B (rôles de groupe), U (DM = 1 pair),
 * rejoués sur le VRAI schéma (toutes les migrations, node:sqlite).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest, makeKV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

function seedUser(db, id, { admin = 0, phone } = {}) {
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,is_admin)
    VALUES (?,?,?,?,?,1,'k','k','k','active',?)`).run(id, 'p_' + id, 'Nom ' + id, phone || '+3361' + String(Math.abs(hash(id))).padStart(7, '0').slice(0, 7), 'h_' + id, admin);
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
function seedConv(db, id, type, members) {
  db.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do,member_count) VALUES (?,?,?,1,?,?)`)
    .run(id, type, members[0][0], 'do_' + id, members.length);
  for (const [uid, role] of members) {
    db.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES (?,?,?,1)`).run(id, uid, role);
  }
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const call = async (env, method, path, sub, body) =>
  worker.fetch(makeRequest({ method, path, body, token: sub ? await tok(sub) : undefined }), env, CTX);
const role = (db, conv, uid) => db.raw.prepare('SELECT role FROM conversation_members WHERE conv_id=? AND user_id=?').get(conv, uid);

describe('A — journal d\'audit sur le schéma réel (id INTEGER AUTOINCREMENT)', () => {
  it('grant-premium : 200 (plus de 500 « datatype mismatch »), premium posé, audit écrit en objet', async () => {
    const DB = d1Reel();
    seedUser(DB, 'boss', { admin: 1 });
    seedUser(DB, 'client');
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_KV: makeKV() });
    const r = await call(env, 'POST', '/api/admin/grant-premium', 'boss', { user_id: 'client', plan: 'yearly' });
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(DB.raw.prepare('SELECT premium_plan FROM users WHERE id=?').get('client').premium_plan).toBe('yearly');
    const a = DB.raw.prepare("SELECT actor_id, details FROM audit_log WHERE action='premium.granted'").get();
    expect(a && a.actor_id).toBe('boss');
    expect(JSON.parse(a.details)).toMatchObject({ user_id: 'client', plan: 'yearly' });
  });

  it('premium/request et force-update : la ligne d\'audit est réellement écrite', async () => {
    const DB = d1Reel();
    seedUser(DB, 'boss', { admin: 1 });
    seedUser(DB, 'client');
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_KV: makeKV() });
    expect((await call(env, 'POST', '/api/premium/request', 'client', { plan: 'monthly' })).status).toBe(200);
    expect((await call(env, 'POST', '/api/admin/force-update', 'boss', {})).status).toBe(200);
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/admin/force-update-via-token', extraHeaders: { 'X-Apex-Admin-Token': 'admin-secret' } }), env, CTX);
    expect(r.status).toBe(200);
    const actions = DB.raw.prepare('SELECT action FROM audit_log').all().map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(['premium.request', 'admin.force_update_all', 'admin.force_update_via_token']));
  });

  it('details n\'est plus encodé deux fois (PATCH /api/users/me)', async () => {
    const DB = d1Reel();
    seedUser(DB, 'u1');
    const env = ENV({ APEX_CHAT_DB: DB });
    expect((await call(env, 'PATCH', '/api/users/me', 'u1', { bio: 'salut' })).status).toBe(200);
    const a = DB.raw.prepare("SELECT details FROM audit_log WHERE action='profile_update'").get();
    const parsed = JSON.parse(a.details);
    expect(typeof parsed).toBe('object');
    expect(parsed.fields).toEqual(['bio']);
  });
});

describe('B — rôles de groupe', () => {
  function setup() {
    const DB = d1Reel();
    for (const u of ['own', 'adm', 'adm2', 'mem', 'out', 'newbie']) seedUser(DB, u);
    seedConv(DB, 'g1', 'group', [['own', 'owner'], ['adm', 'admin'], ['adm2', 'admin'], ['mem', 'member']]);
    return { DB, env: ENV({ APEX_CHAT_DB: DB }) };
  }

  it('un admin ne retire NI le propriétaire NI un autre admin ; le propriétaire retire un admin', async () => {
    const { DB, env } = setup();
    const r1 = await call(env, 'DELETE', '/api/conversations/g1/members/own', 'adm');
    expect(r1.status).toBe(403);
    expect(role(DB, 'g1', 'own')).toBeTruthy();
    const r2 = await call(env, 'DELETE', '/api/conversations/g1/members/adm2', 'adm');
    expect(r2.status).toBe(403);
    expect(role(DB, 'g1', 'adm2')).toBeTruthy();
    const r3 = await call(env, 'DELETE', '/api/conversations/g1/members/adm2', 'own');
    expect(r3.status).toBe(200);
    expect(role(DB, 'g1', 'adm2')).toBeUndefined();
    // un admin retire toujours un simple membre
    expect((await call(env, 'DELETE', '/api/conversations/g1/members/mem', 'adm')).status).toBe(200);
  });

  it('ajout : rôle limité à member/admin, admin nommé seulement par le propriétaire, compte existant', async () => {
    const { DB, env } = setup();
    const bad = await call(env, 'POST', '/api/conversations/g1/members', 'adm', { user_id: 'newbie', role: 'owner' });
    expect(bad.status).toBe(400);
    expect(role(DB, 'g1', 'newbie')).toBeUndefined();
    const noRight = await call(env, 'POST', '/api/conversations/g1/members', 'adm', { user_id: 'newbie', role: 'admin' });
    expect(noRight.status).toBe(403);
    expect(role(DB, 'g1', 'newbie')).toBeUndefined();
    const ghost = await call(env, 'POST', '/api/conversations/g1/members', 'adm', { user_id: 'nexiste_pas' });
    expect(ghost.status).toBe(404);
    expect(role(DB, 'g1', 'nexiste_pas')).toBeUndefined();
    const ok = await call(env, 'POST', '/api/conversations/g1/members', 'own', { user_id: 'newbie', role: 'admin' });
    expect(ok.status).toBe(200);
    expect(role(DB, 'g1', 'newbie').role).toBe('admin');
  });

  it('DELETE /api/conversations/:id : non-membre refusé sans fuite du compte de membres', async () => {
    const { DB, env } = setup();
    const r = await call(env, 'DELETE', '/api/conversations/g1', 'out');
    const j = await r.json();
    expect(r.status).toBe(404);
    expect(j.remaining).toBeUndefined();
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM conversation_members WHERE conv_id='g1'").get().c).toBe(4);
  });

  it('DELETE /api/conversations/:id : le propriétaire ne laisse pas le groupe sans propriétaire ; un DM reste quittable', async () => {
    const { DB, env } = setup();
    const r = await call(env, 'DELETE', '/api/conversations/g1', 'own');
    expect(r.status).toBe(400);
    expect(role(DB, 'g1', 'own').role).toBe('owner');
    seedConv(DB, 'd1', 'dm', [['own', 'owner'], ['mem', 'member']]);
    const dm = await call(env, 'DELETE', '/api/conversations/d1', 'own');
    expect(dm.status).toBe(200);
    expect(role(DB, 'd1', 'own')).toBeUndefined();
    // un simple membre quitte le groupe
    expect((await call(env, 'DELETE', '/api/conversations/g1', 'mem')).status).toBe(200);
  });
});

describe('U — un DM a exactement un correspondant', () => {
  it('DM avec deux pairs → 400, aucune conversation créée', async () => {
    const DB = d1Reel();
    for (const u of ['a', 'b', 'c']) seedUser(DB, u);
    const env = ENV({ APEX_CHAT_DB: DB });
    const r = await call(env, 'POST', '/api/conversations', 'a', { type: 'dm', members: ['b', 'c'] });
    expect(r.status).toBe(400);
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM conversation_members WHERE user_id='a'").get().c).toBe(0);
    const ok = await call(env, 'POST', '/api/conversations', 'a', { type: 'dm', members: ['b', 'a', 'b'] });
    expect(ok.status).toBe(200);
    const id = (await ok.json()).conversation.id;
    expect(DB.raw.prepare('SELECT COUNT(*) c FROM conversation_members WHERE conv_id=?').get(id).c).toBe(2);
  });
});
