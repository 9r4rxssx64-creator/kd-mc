/**
 * Tests api-worker.js — Fiches de renseignement contacts (v1.1.201)
 * GET/PATCH/DELETE /api/contact/:id + PUT /api/contact/:id/nickname (alias
 * d'affichage par utilisateur) + POST /api/test/cleanup (efface Alice/Bob).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{"ok":true}')); });

function db(state) {
  return {
    _s: state,
    prepare(sql) {
      const stmt = {
        _a: [], bind(...a) { return { ...stmt, _a: a }; },
        async first() {
          if (sql.includes('SELECT last_force_logout_at')) { const u = state.users.find(x => x.id === this._a[0]); return u ? { last_force_logout_at: null, is_banned: 0, status: u.status || 'active', phone: u.phone } : null; }
          if (sql.includes('SELECT merged_into FROM users')) { const u = state.users.find(x => x.id === this._a[0]); return u ? { merged_into: u.merged_into || null } : null; }
          if (sql.includes('FROM users WHERE id=?')) { return state.users.find(x => x.id === this._a[0]) || null; }
          if (sql.includes('SELECT nickname FROM contacts')) { const n = state.contacts.find(c => c.user_id === this._a[0] && c.contact_id === this._a[1]); return n ? { nickname: n.nickname } : null; }
          if (sql.includes('FROM conversation_members a JOIN conversation_members b')) {
            const [me, other] = this._a;
            const myConvs = state.members.filter(m => m.user_id === me).map(m => m.conv_id);
            return state.members.some(m => m.user_id === other && myConvs.includes(m.conv_id)) ? { 1: 1 } : null;
          }
          if (sql.includes('COUNT(*) AS n FROM conversation_members')) { return { n: state.members.filter(m => m.conv_id === this._a[0]).length }; }
          return null;
        },
        async all() {
          if (sql.includes("source='e2e-test'")) return { results: state.users.filter(u => u.source === 'e2e-test' || ['+33600000091', '+33600000092'].includes(u.phone)).map(u => ({ id: u.id })) };
          if (sql.includes('conv_id FROM conversation_members WHERE user_id=?')) return { results: state.members.filter(m => m.user_id === this._a[0]).map(m => ({ conv_id: m.conv_id })) };
          if (sql.includes('contact_id, nickname FROM contacts')) return { results: state.contacts.filter(c => c.user_id === this._a[0]) };
          return { results: [] };
        },
        async run() {
          if (sql.startsWith('UPDATE users SET') && sql.includes('updated_at')) {
            // parse SET cols
            const u = state.users.find(x => x.id === this._a[this._a.length - 1]); if (u) u._updated = true;
          }
          if (sql.includes("UPDATE users SET status='deleted'")) { const u = state.users.find(x => x.id === this._a[this._a.length - 1]); if (u) { u.status = 'deleted'; u.phone = this._a[0]; } }
          if (sql.includes('INSERT INTO contacts')) { const [uid, cid, nick] = this._a; const ex = state.contacts.find(c => c.user_id === uid && c.contact_id === cid); if (ex) ex.nickname = nick; else state.contacts.push({ user_id: uid, contact_id: cid, nickname: nick }); }
          if (sql.includes('UPDATE contacts SET nickname=NULL')) { const c = state.contacts.find(c => c.user_id === this._a[0] && c.contact_id === this._a[1]); if (c) c.nickname = null; }
          if (sql.includes('DELETE FROM users WHERE id=?')) { state.users = state.users.filter(u => u.id !== this._a[0]); }
          if (sql.includes('DELETE FROM conversation_members WHERE user_id=?')) { state.members = state.members.filter(m => m.user_id !== this._a[0]); }
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

const ADMIN = (sub = 'kdmc_admin') => makeJWT({ sub, is_admin: true, iat: Math.floor(Date.now() / 1000) });
const USER = (sub) => makeJWT({ sub, is_admin: false, iat: Math.floor(Date.now() / 1000) });

describe('Fiches contacts (v1.1.201)', () => {
  it('GET /api/contact/:id — admin voit tous les champs', async () => {
    const state = { users: [{ id: 'kdmc_admin', is_admin: 1, status: 'active' }, { id: 'lolo', pseudo: 'lolo', real_name: 'Laurence', phone: '+33600000010', city: 'Monaco', status: 'active' }], contacts: [], members: [] };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/contact/lolo', token: await ADMIN() }), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.contact.phone).toBe('+33600000010');
    expect(d.contact.city).toBe('Monaco');
    expect(d.contact.can_edit).toBe(true);
    expect(d.contact.can_delete).toBe(true);
  });

  it('GET /api/contact/:id — non-admin SANS conv partagée = 403', async () => {
    const state = { users: [{ id: 'bob', status: 'active' }, { id: 'alice', pseudo: 'alice', status: 'active' }], contacts: [], members: [] };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/contact/alice', token: await USER('bob') }), env);
    expect(res.status).toBe(403);
  });

  it('PUT nickname — alias d\'affichage par utilisateur', async () => {
    const state = { users: [{ id: 'kdmc_admin', is_admin: 1, status: 'active' }, { id: 'lolo', status: 'active' }], contacts: [], members: [] };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const res = await worker.fetch(makeRequest({ method: 'PUT', path: '/api/contact/lolo/nickname', token: await ADMIN(), body: { nickname: 'Lolo ❤️' } }), env);
    expect(res.status).toBe(200);
    expect(state.contacts.find(c => c.user_id === 'kdmc_admin' && c.contact_id === 'lolo').nickname).toBe('Lolo ❤️');
  });

  it('DELETE /api/contact/:id — admin supprime, jamais kdmc_admin', async () => {
    const state = { users: [{ id: 'kdmc_admin', is_admin: 1, status: 'active' }, { id: 'bob', phone: '+33611112222', status: 'active' }], contacts: [], members: [] };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const ok = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/contact/bob', token: await ADMIN() }), env);
    expect(ok.status).toBe(200);
    expect(state.users.find(u => u.id === 'bob').status).toBe('deleted');
    // protège kdmc_admin
    const ko = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/contact/kdmc_admin', token: await ADMIN() }), env);
    expect(ko.status).toBe(400);
  });

  it('DELETE /api/contact/:id — non-admin refusé (403)', async () => {
    const state = { users: [{ id: 'bob', status: 'active' }, { id: 'alice', status: 'active' }], contacts: [], members: [] };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const res = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/contact/alice', token: await USER('bob') }), env);
    expect(res.status).toBe(403);
  });

  it('POST /api/test/cleanup — efface Alice/Bob avec le secret', async () => {
    const state = { users: [{ id: 'a1', source: 'e2e-test', phone: '+33600000091', status: 'active' }, { id: 'b1', source: 'e2e-test', phone: '+33600000092', status: 'active' }, { id: 'lolo', source: 'direct-signup', status: 'active' }], contacts: [], members: [] };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const res = await worker.fetch(new Request('https://api.apex/api/test/cleanup', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Test-Auth': env.APEX_CHAT_ADMIN_TOKEN }, body: '{}' }), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.removed_count).toBe(2);
    expect(state.users.find(u => u.id === 'lolo')).toBeTruthy(); // pas touché
    expect(state.users.find(u => u.id === 'a1')).toBeUndefined();
  });

  it('POST /api/test/cleanup — refusé sans secret (403)', async () => {
    const env = ENV({ APEX_CHAT_DB: db({ users: [], contacts: [], members: [] }) });
    const res = await worker.fetch(new Request('https://api.apex/api/test/cleanup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env);
    expect(res.status).toBe(403);
  });
});
