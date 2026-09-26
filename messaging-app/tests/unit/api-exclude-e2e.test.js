/**
 * Tests api-worker.js — exclusion des comptes de test E2E (v1.1.203)
 * Kevin « toujours Alice et Bob » : les comptes source='e2e-test' ne doivent
 * JAMAIS apparaître dans /api/contacts ni /api/admin/all-users.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{"ok":true}')); });

function db(users) {
  return {
    prepare(sql) {
      return {
        _a: [], bind(...a) { return { ...this, _a: a }; },
        async first() {
          if (sql.includes('SELECT last_force_logout_at')) { const u = users.find(x => x.id === this._a[0]); return u ? { last_force_logout_at: null, is_banned: 0, status: u.status || 'active', phone: u.phone } : null; }
          if (sql.includes('SELECT merged_into FROM users')) { const u = users.find(x => x.id === this._a[0]); return u ? { merged_into: u.merged_into || null } : null; }
          if (sql.includes('FROM users WHERE id=?')) { return users.find(x => x.id === this._a[0]) || null; }
          return null;
        },
        async all() {
          // contacts admin branch : respecte l'exclusion source != 'e2e-test'
          if (sql.includes("SELECT id FROM users WHERE")) {
            return { results: users.filter(u => u.status !== 'deleted' && (!u.source || u.source !== 'e2e-test')).map(u => ({ id: u.id })) };
          }
          // admin all-users : la requête contient l'exclusion → on la simule
          if (sql.includes('FROM users WHERE 1=1')) {
            return { results: users.filter(u => !u.source || u.source !== 'e2e-test') };
          }
          if (sql.includes('contact_id, nickname FROM contacts')) return { results: [] };
          return { results: [] };
        },
        async run() { return { success: true }; },
      };
    },
  };
}

const USERS = [
  { id: 'kdmc_admin', pseudo: 'kevin', is_admin: 1, status: 'active', source: 'apex-sso' },
  { id: 'lolo', pseudo: 'lolo', status: 'active', source: 'direct-signup' },
  { id: 'a1', pseudo: 'alice_e2e', status: 'active', source: 'e2e-test', phone: '+33600000091' },
  { id: 'b1', pseudo: 'bob_e2e', status: 'active', source: 'e2e-test', phone: '+33600000092' },
];

describe('Exclusion comptes de test E2E (v1.1.203)', () => {
  it('/api/contacts (admin) ne renvoie PAS Alice/Bob (e2e-test)', async () => {
    const env = ENV({ APEX_CHAT_DB: db(USERS) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/contacts', token: await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: Math.floor(Date.now() / 1000) }) }), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    const ids = d.users.map(u => u.id);
    expect(ids).toContain('lolo');
    expect(ids).not.toContain('a1');
    expect(ids).not.toContain('b1');
  });

  it('/api/admin/all-users ne renvoie PAS Alice/Bob (e2e-test)', async () => {
    const env = ENV({ APEX_CHAT_DB: db(USERS) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/all-users?filter=all', token: await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: Math.floor(Date.now() / 1000) }) }), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    const ids = (d.users || []).map(u => u.id);
    expect(ids).not.toContain('a1');
    expect(ids).not.toContain('b1');
  });
});
