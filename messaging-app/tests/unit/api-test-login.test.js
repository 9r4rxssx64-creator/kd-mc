/**
 * Tests api-worker.js — POST /api/test/login (v1.1.198)
 * Login de test SÛR : jeton UNIQUEMENT pour 2 numéros fixes ET seulement avec le
 * header X-Test-Auth == APEX_CHAT_ADMIN_TOKEN. Pas de backdoor universel.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{"ok":true}')); });

function statefulDB() {
  const users = [];
  return {
    _users: users,
    prepare(sql) {
      const stmt = { _a: [], bind(...a) { return { ...stmt, _a: a }; },
        async first() {
          if (sql.includes('SELECT * FROM users WHERE phone=?')) return users.find(u => u.phone === this._a[0]) || null;
          if (sql.includes('last_force_logout_at')) { const u = users.find(x => x.id === this._a[0]); return u ? { last_force_logout_at: null, is_banned: 0, status: 'active', phone: u.phone } : null; }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO users')) {
            const [id, pseudo, real_name, phone] = this._a;
            if (!users.some(u => u.pseudo === pseudo) && !users.some(u => u.phone === phone)) users.push({ id, pseudo, real_name, phone, is_admin: 0, status: 'active' });
          }
          return { success: true };
        },
        async all() { return { results: [] }; } };
      return stmt;
    },
  };
}

function req(headers, body) {
  return new Request('https://api.apex/api/test/login', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

describe('POST /api/test/login (v1.1.198)', () => {
  it('refuse sans le secret X-Test-Auth (403)', async () => {
    const env = ENV({ APEX_CHAT_DB: statefulDB() });
    const res = await worker.fetch(req({}, { phone: '+33600000091' }), env);
    expect(res.status).toBe(403);
  });

  it('refuse un numéro NON-test même avec le secret (400)', async () => {
    const env = ENV({ APEX_CHAT_DB: statefulDB() });
    const res = await worker.fetch(req({ 'X-Test-Auth': env.APEX_CHAT_ADMIN_TOKEN }, { phone: '+33699999999' }), env);
    expect(res.status).toBe(400);
  });

  it('mint un JWT pour un numéro de test fixe avec le bon secret', async () => {
    const env = ENV({ APEX_CHAT_DB: statefulDB() });
    const res = await worker.fetch(req({ 'X-Test-Auth': env.APEX_CHAT_ADMIN_TOKEN }, { phone: '+33600000091', name: 'Alice', pseudo: 'alice_e2e' }), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.token).toBeTruthy();
    expect(d.user.id).toBeTruthy();
    expect(d.user.is_admin).toBe(false);
  });

  it('désactivable via ALLOW_E2E_TEST_LOGIN=false (403)', async () => {
    const env = ENV({ APEX_CHAT_DB: statefulDB(), ALLOW_E2E_TEST_LOGIN: 'false' });
    const res = await worker.fetch(req({ 'X-Test-Auth': env.APEX_CHAT_ADMIN_TOKEN }, { phone: '+33600000091' }), env);
    expect(res.status).toBe(403);
  });
});
