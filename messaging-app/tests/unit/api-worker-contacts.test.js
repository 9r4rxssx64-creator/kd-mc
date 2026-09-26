/**
 * Tests api-worker.js — GET /api/contacts (v1.1.196)
 * Contacts pour TOUT utilisateur (pas admin-only). Laurence (non-admin)
 * appelait /api/admin/all-users → 403. /api/contacts renvoie ses pairs de
 * conversation + TOUJOURS Kevin (kdmc_admin), sans 403.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});

function db(state) {
  return {
    prepare(sql) {
      return {
        _a: [],
        bind(...a) { this._a = a; return this; },
        async first() {
          if (sql.includes('SELECT last_force_logout_at')) {
            const u = state.users.find(x => x.id === this._a[0]);
            return { last_force_logout_at: null, is_banned: 0, status: u ? (u.status || 'active') : 'active' };
          }
          if (sql.includes('SELECT merged_into FROM users')) {
            const u = state.users.find(x => x.id === this._a[0]);
            return u ? { merged_into: u.merged_into || null } : null;
          }
          if (sql.includes('FROM users WHERE id=?') && sql.includes('avatar_url')) {
            return state.users.find(x => x.id === this._a[0]) || null;
          }
          return null;
        },
        async all() {
          if (sql.includes('m2.user_id AS uid')) {
            // pairs de conversation du caller (this._a[0])
            const me = this._a[0];
            const myConvs = state.members.filter(m => m.user_id === me).map(m => m.conv_id);
            const peers = state.members
              .filter(m => myConvs.includes(m.conv_id) && m.user_id !== me)
              .map(m => ({ uid: m.user_id }));
            return { results: peers };
          }
          if (sql.includes("status != 'deleted'") && sql.includes('SELECT id FROM users')) {
            return { results: state.users.filter(u => u.status !== 'deleted').map(u => ({ id: u.id })) };
          }
          return { results: [] };
        },
        async run() { return { success: true }; },
      };
    },
  };
}

describe('GET /api/contacts (v1.1.196)', () => {
  it('Laurence (non-admin) obtient Kevin sans 403, même avec 0 conversation', async () => {
    const state = {
      users: [
        { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS', status: 'active', merged_into: null },
        { id: 'lolo', pseudo: 'lolo', real_name: 'Laurence', status: 'active', merged_into: null },
      ],
      members: [], // aucune conversation
    };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const token = await makeJWT({ sub: 'lolo', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/contacts', token }), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.users.some(u => u.id === 'kdmc_admin')).toBe(true);
    expect(d.users.some(u => u.id === 'lolo')).toBe(false); // pas soi-même
  });

  it('renvoie aussi les pairs des conversations (canoniques)', async () => {
    const state = {
      users: [
        { id: 'kdmc_admin', pseudo: 'kevin', status: 'active', merged_into: null },
        { id: 'lolo', pseudo: 'lolo', status: 'active', merged_into: null },
        { id: 'bob', pseudo: 'bob', status: 'active', merged_into: null },
      ],
      members: [
        { conv_id: 'c1', user_id: 'lolo' },
        { conv_id: 'c1', user_id: 'bob' },
      ],
    };
    const env = ENV({ APEX_CHAT_DB: db(state) });
    const token = await makeJWT({ sub: 'lolo', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/contacts', token }), env);
    const d = await res.json();
    expect(d.users.some(u => u.id === 'bob')).toBe(true);
    expect(d.users.some(u => u.id === 'kdmc_admin')).toBe(true);
  });

  it('exige une authentification (401 sans token)', async () => {
    const env = ENV({ APEX_CHAT_DB: db({ users: [], members: [] }) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/contacts' }), env);
    expect(res.status).toBe(401);
  });
});
