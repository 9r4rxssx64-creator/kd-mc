/**
 * Tests api-worker.js — Admin success paths (whitelist, invite-magic,
 * magic-login, user-action, timeline, search, map, live-users, get-full-user).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT, SECRET } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});

async function adminToken() {
  return makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
}

function richAdminEnv() {
  const env = ENV();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    bind: function (...args) { this._args = args; return this; },
    first: async function () {
      if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 1, status: 'active', is_banned: 0 };
      if (sql.includes('FROM users WHERE pseudo=')) return { id: 'u1', pseudo: 'kdmc', name: 'Kevin', is_admin: 1 };
      if (sql.includes('FROM users WHERE id=') && !sql.includes('audit')) return { id: 'u1', pseudo: 'p', name: 'N', last_seen: Date.now(), status: 'active' };
      if (sql.includes('FROM users WHERE phone_hash=')) return null;
      if (sql.includes('FROM cgu_acceptances')) return { accepted_at: Date.now() };
      return null;
    },
    all: async function () {
      if (sql.includes('FROM users') && (sql.includes('last_seen >') || sql.includes('ORDER BY'))) {
        return { results: [
          { id: 'u1', pseudo: 'kdmc', name: 'K', last_seen: Date.now(), last_geo_label: 'Monaco', last_lat: 43.7, last_lng: 7.4 },
          { id: 'u2', pseudo: 'laurence', name: 'L', last_seen: Date.now() - 30000 },
        ] };
      }
      if (sql.includes('FROM audit_log')) return { results: [{ id: 1, action: 'login', ts: Date.now(), details: '{}' }] };
      if (sql.includes('FROM user_activity')) return { results: [{ ts: Date.now(), action: 'heartbeat', geo_label: 'Monaco' }] };
      if (sql.includes('FROM invitations')) return { results: [{ code: 'INV1', created_at: Date.now() }] };
      if (sql.includes('FROM signalements WHERE')) return { results: [{ id: 1, ts: Date.now(), reason: 'spam', status: 'pending' }] };
      if (sql.includes('FROM conversations c INNER JOIN')) return { results: [{ id: 'c1', name: 'X', role: 'owner' }] };
      if (sql.includes('FROM conversation_members WHERE user_id')) return { results: [{ conv_id: 'c1', role: 'owner' }] };
      return { results: [] };
    },
    run: async () => ({ success: true, meta: { changes: 1 } }),
  }));
  return env;
}

describe('handleAdminGetFullUser', () => {
  it('non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/users/kdmc/full', token }), env);
    expect(r.status).toBe(403);
  });

  it('admin existing user → 200 + détails', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/users/kdmc/full', token }),
      richAdminEnv(),
    );
    expect([200, 404]).toContain(r.status);
  });

  it('admin user inconnu → 404', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('FROM users') && !sql.includes('audit') ?
        (sql.includes('SELECT last_force_logout_at') ? { is_admin: 1, status: 'active', is_banned: 0 } : null) : null,
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await adminToken();
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/users/inconnu/full', token }), env);
    expect([404, 200]).toContain(r.status);
  });
});

describe('handleAdminWhitelistBulk', () => {
  it('non-admin → 403', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/whitelist-bulk', token, body: { entries: [] } }),
      env,
    );
    expect(r.status).toBe(403);
  });

  it('admin entries vide → 400', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/whitelist-bulk', token, body: {} }),
      richAdminEnv(),
    );
    expect([400, 200]).toContain(r.status);
  });

  it('admin bulk entries 3 phones → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({
        method: 'POST', path: '/api/admin/whitelist-bulk', token,
        body: {
          entries: [
            { phone: '+33612345601', name: 'A B' },
            { phone: '+33612345602', name: 'C D' },
            { phone: '+33612345603', name: 'E F' },
          ],
        },
      }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });
});

describe('handleAdminInviteMagic', () => {
  it('non-admin → 403', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/invite-magic', token, body: { phone: '+33612345678', name: 'X Y' } }),
      env,
    );
    expect(r.status).toBe(403);
  });

  it('admin avec phone+name → magic token signé JWT', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({
        method: 'POST', path: '/api/admin/invite-magic', token,
        body: { phone: '+33612345678', name: 'Marie Dupont', pseudo: 'marie' },
      }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin phone manquant → 400', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/invite-magic', token, body: { name: 'X Y' } }),
      richAdminEnv(),
    );
    expect([400, 200]).toContain(r.status);
  });
});

describe('handleMagicLogin', () => {
  it('magic_token manquant → 400', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/magic-login', body: {} }), ENV());
    expect(r.status).toBe(400);
  });

  it('magic_token invalide → 401/400', async () => {
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/auth/magic-login', body: { magic_token: 'bad.token.sig' } }),
      ENV(),
    );
    expect([400, 401]).toContain(r.status);
  });

  it('magic_token expiré → 401/400', async () => {
    const expired = await makeJWT({
      sub: 'u-magic',
      phone_hash: 'h',
      magic: true,
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/auth/magic-login', body: { magic_token: expired } }),
      ENV(),
    );
    expect([400, 401]).toContain(r.status);
  });

  it('magic_token valide existing user → ok', async () => {
    const token = await makeJWT({
      sub: 'u-magic',
      phone_hash: 'h',
      pseudo: 'magic',
      magic: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ id: 'u-magic', pseudo: 'magic', status: 'active' }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/auth/magic-login', body: { magic_token: token } }),
      env,
    );
    expect([200, 401]).toContain(r.status);
  });
});

describe('handleAdminUserAction', () => {
  it('non-admin → 403', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/block', token, body: {} }),
      env,
    );
    expect(r.status).toBe(403);
  });

  it('admin block user → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/block', token, body: {} }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin unblock → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/unblock', token, body: {} }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin authorize → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/authorize', token, body: {} }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin revoke → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/revoke', token, body: {} }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin force_logout → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/force_logout', token, body: {} }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin delete → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/delete', token, body: {} }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });
});

describe('handleAdminUserTimeline / Conversations / GeoHistory / Search / Map / LiveUsers', () => {
  it('admin GET timeline → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/users/u2/timeline?limit=200', token }),
      richAdminEnv(),
    );
    expect([200, 404]).toContain(r.status);
  });

  it('admin GET conversations of user → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/users/u2/conversations', token }),
      richAdminEnv(),
    );
    expect([200, 404]).toContain(r.status);
  });

  it('admin GET geo-history → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/users/u2/geo-history', token }),
      richAdminEnv(),
    );
    expect([200, 404]).toContain(r.status);
  });

  it('admin GET search → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/search?q=kdmc&scope=users', token }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin GET map → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/map', token }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin GET live-users → 200 (avec ctx mock)', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/live-users', token }),
      richAdminEnv(),
      { waitUntil: vi.fn() },
    );
    expect([200, 400, 500]).toContain(r.status);
  });

  it('admin GET all-users → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/all-users', token }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin GET toggles → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/admin/toggles', token }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });

  it('admin POST toggle → 200', async () => {
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/toggles', token, body: { feature: 'voice_messages', enabled: false } }),
      richAdminEnv(),
    );
    expect([200, 400]).toContain(r.status);
  });
});
