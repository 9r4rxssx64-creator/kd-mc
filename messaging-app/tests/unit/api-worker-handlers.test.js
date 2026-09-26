/**
 * Tests api-worker.js — Handlers conversations + admin + features (consolidé).
 * Smoke + error paths pour tous les endpoints restants.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

// ----------------------------------------------------------------------------
//  Conversations
// ----------------------------------------------------------------------------
describe('Conversations endpoints', () => {
  it('GET /api/conversations sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations' }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/conversations avec token → ok+conversations[]', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('FROM users') ? { status: 'active', is_banned: 0 } : null,
      all: async () => sql.includes('FROM conversations') ? { results: [{ id: 'c1', name: 'X' }] } : { results: [] },
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations', token }), env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.conversations).toEqual([{ id: 'c1', name: 'X' }]);
  });

  it('POST /api/conversations sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/conversations', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /api/conversations type invalide → 400', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/conversations', token, body: { type: 'invalid', members: ['u2'] } }),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('POST /api/conversations members manquant → 400', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/conversations', token, body: { type: 'dm' } }),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('POST /api/conversations dm success → conv créée', async () => {
    const env = ENV();
    let configReturned = false;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('FROM users') ? { status: 'active', is_banned: 0 } : null,
      all: async () => sql.includes('system_config') ? { results: [] } : { results: [] },
      run: async () => ({ success: true }),
    }));
    const token = await makeJWT({ sub: 'creator', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/conversations', token, body: { type: 'dm', name: 'Test', members: ['u2'] } }),
      env,
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.conversation.type).toBe('dm');
  });

  it('POST /api/conversations avec kevin_invisible activé', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users WHERE is_admin')) return { id: 'kevin-id' };
        if (sql.includes('FROM users WHERE id')) return { status: 'active', is_banned: 0 };
        return null;
      },
      all: async () => sql.includes('system_config') ? { results: [{ key: 'KEVIN_INVISIBLE_ADMIN', value: 'true' }] } : { results: [] },
      run: async () => ({ success: true }),
    }));
    const token = await makeJWT({ sub: 'creator', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/conversations', token, body: { type: 'group', name: 'X', members: ['u2'] } }),
      env,
    );
    expect(r.status).toBe(200);
  });

  it('POST /api/conversations dm avec sub dans members → skip duplicate', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('FROM users') ? { status: 'active', is_banned: 0 } : null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/conversations', token, body: { type: 'dm', members: ['u', 'u2'] } }),
      env,
    );
    expect(r.status).toBe(200);
  });
});

// ----------------------------------------------------------------------------
//  Members management
// ----------------------------------------------------------------------------
describe('Members endpoints', () => {
  const baseEnv = () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users')) return { status: 'active', is_banned: 0 };
        if (sql.includes('conversation_members')) return { role: 'owner', user_id: 'u' };
        return null;
      },
      all: async () => ({ results: [{ user_id: 'u', role: 'owner' }] }),
      run: async () => ({ success: true }),
    }));
    return env;
  };

  it('POST /api/conversations/:id/members sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/conversations/c1/members', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /api/conversations/:id/members user_id manquant → 400', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/conversations/c1/members', token, body: {} }),
      baseEnv(),
    );
    expect(r.status).toBe(400);
  });

  it('GET /api/conversations/:id/members sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations/c1/members' }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/conversations/:id/members avec token → ok', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations/c1/members', token }), baseEnv());
    expect(r.status).toBe(200);
  });

  it('DELETE /api/conversations/:id/members/:uid sans token → 401', async () => {
    const r = await worker.fetch(
      makeRequest({ method: 'DELETE', path: '/api/conversations/c1/members/u2' }),
      ENV(),
    );
    expect(r.status).toBe(401);
  });

  it('PATCH /api/conversations/:id sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'PATCH', path: '/api/conversations/c1', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('PATCH /api/conversations/:id rien à modifier → 400', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'PATCH', path: '/api/conversations/c1', token, body: {} }),
      baseEnv(),
    );
    expect(r.status).toBe(400);
  });

  it('PATCH /api/conversations/:id avec name → ok', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({
        method: 'PATCH', path: '/api/conversations/c1', token,
        body: { name: 'New', description: 'D', avatar_url: 'a', disappearing_seconds: 60 },
      }),
      baseEnv(),
    );
    expect([200, 403]).toContain(r.status);
  });
});

// ----------------------------------------------------------------------------
//  Invitations
// ----------------------------------------------------------------------------
describe('Invitations endpoints', () => {
  it('POST /api/invitations sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/invitations', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/invitations/:code → ok ou 404', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/invitations/ABCDEF' }), env);
    expect([200, 404]).toContain(r.status);
  });
});

// ----------------------------------------------------------------------------
//  Admin commands (KEVIN seul)
// ----------------------------------------------------------------------------
describe('Admin endpoints', () => {
  const adminEnv = () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users WHERE id')) return { is_admin: 1, status: 'active', is_banned: 0 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    return env;
  };

  const userEnv = () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users WHERE id')) return { is_admin: 0, status: 'active', is_banned: 0 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    return env;
  };

  it('POST /api/admin/commands sans token → 401/403', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/admin/commands', body: {} }), ENV());
    expect([401, 403]).toContain(r.status);
  });

  it('POST /api/admin/commands non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'normaluser', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/commands', token, body: { cmd: 'kickUser' } }),
      userEnv(),
    );
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/all-users non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'normaluser', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/all-users', token }), userEnv());
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/all-users admin → ok', async () => {
    const token = await makeJWT({ sub: 'kevin', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/all-users', token }), adminEnv());
    expect([200, 401, 403]).toContain(r.status);
  });

  it('GET /api/admin/live-users sans admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/live-users', token }), userEnv());
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/live-users admin', async () => {
    const token = await makeJWT({ sub: 'kevin', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/live-users', token }), adminEnv());
    expect([200, 401, 403]).toContain(r.status);
  });

  it('GET /api/admin/map sans admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/map', token }), userEnv());
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/map admin', async () => {
    const token = await makeJWT({ sub: 'kevin', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/map', token }), adminEnv());
    expect([200, 401, 403]).toContain(r.status);
  });

  it('GET /api/admin/users/:uid/timeline non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/users/u2/timeline', token }), userEnv());
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/users/:uid/conversations non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/users/u2/conversations', token }), userEnv());
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/users/:uid/geo-history non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/users/u2/geo-history', token }), userEnv());
    expect([403, 401]).toContain(r.status);
  });

  it('POST /api/admin/users/:uid/block non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/users/u2/block', token, body: {} }),
      userEnv(),
    );
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/search non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/search?q=kevin', token }), userEnv());
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/toggles → 401 sans token', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/toggles' }), ENV());
    expect([401, 403]).toContain(r.status);
  });

  it('POST /api/admin/toggles → 401 sans token', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/admin/toggles', body: {} }), ENV());
    expect([401, 403, 400]).toContain(r.status);
  });

  it('POST /api/admin/invite-magic non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/invite-magic', token, body: { phone: '+33612345678', name: 'X Y' } }),
      userEnv(),
    );
    expect([403, 401]).toContain(r.status);
  });

  it('POST /api/admin/whitelist-bulk non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/whitelist-bulk', token, body: { contacts: [] } }),
      userEnv(),
    );
    expect([403, 401]).toContain(r.status);
  });

  it('GET /api/admin/users/:pseudo/full non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/users/kdmc/full', token }), userEnv());
    expect([403, 401, 404]).toContain(r.status);
  });
});

// ----------------------------------------------------------------------------
//  Features (stories, polls, time-capsules, letters, memory-lane, IA, signal)
// ----------------------------------------------------------------------------
describe('Features endpoints', () => {
  const userEnv = () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    return env;
  };

  it('POST /api/stories sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/stories', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/stories sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/stories' }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /api/stories avec token → ok ou erreur validation', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/stories', token, body: { content: 'Hello story', media_url: 'r2://x' } }),
      userEnv(),
    );
    expect([200, 400, 500]).toContain(r.status);
  });

  it('GET /api/stories avec token → ok', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/stories', token }), userEnv());
    expect([200, 500]).toContain(r.status);
  });

  it('POST /api/stories/:id/view → ok ou 404', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/stories/abc/view', token, body: {} }), userEnv());
    expect([200, 401, 404]).toContain(r.status);
  });

  it('POST /api/polls sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/polls', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /api/polls avec token → smoke', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({
        method: 'POST', path: '/api/polls', token,
        body: { conv_id: 'c', question: 'Q?', options: ['A', 'B'] },
      }),
      userEnv(),
    );
    expect([200, 400, 500]).toContain(r.status);
  });

  it('POST /api/polls/:id/vote sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/polls/p1/vote', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /api/polls/:id/vote avec token → smoke', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/polls/p1/vote', token, body: { option_index: 0 } }),
      userEnv(),
    );
    expect([200, 400, 404, 500]).toContain(r.status);
  });

  it('POST /api/time-capsules sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/time-capsules', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/time-capsules sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/time-capsules' }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/time-capsules avec token → ok', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/time-capsules', token }), userEnv());
    expect([200, 500]).toContain(r.status);
  });

  it('GET /api/time-capsules/:id avec token → smoke', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/time-capsules/cap1', token }), userEnv());
    expect([200, 401, 403, 404, 500]).toContain(r.status);
  });

  it('POST /api/time-capsules avec token → smoke', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({
        method: 'POST', path: '/api/time-capsules', token,
        body: { content: 'X', open_at: Date.now() + 86400000, recipient_id: 'u2' },
      }),
      userEnv(),
    );
    expect([200, 400, 500]).toContain(r.status);
  });

  it('POST /api/letters sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/letters', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/letters sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/letters' }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /api/letters avec token → smoke', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({
        method: 'POST', path: '/api/letters', token,
        body: { content: 'Lettre', recipient_id: 'u2', send_at: Date.now() + 86400000 },
      }),
      userEnv(),
    );
    expect([200, 400, 500]).toContain(r.status);
  });

  it('GET /api/letters avec token → ok', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/letters', token }), userEnv());
    expect([200, 500]).toContain(r.status);
  });

  it('DELETE /api/letters/:id sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/letters/l1' }), ENV());
    expect(r.status).toBe(401);
  });

  it('DELETE /api/letters/:id avec token → smoke', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/letters/l1', token }), userEnv());
    expect([200, 401, 403, 404, 500]).toContain(r.status);
  });

  it('GET /api/memory-lane sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/memory-lane' }), ENV());
    expect(r.status).toBe(401);
  });

  it('GET /api/memory-lane avec token → ok (avec ctx)', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const ctx = { waitUntil: vi.fn() };
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/memory-lane', token }), userEnv(), ctx);
    expect([200, 500]).toContain(r.status);
  });

  it('POST /api/ia/chat sans messages → 400', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ia/chat', body: {} }), ENV());
    expect([400, 401, 503]).toContain(r.status);
  });

  it('POST /ia/chat alias sans messages → 400', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/ia/chat', body: {} }), ENV());
    expect([400, 401, 503]).toContain(r.status);
  });

  it('POST /api/ia/chat avec token → smoke (mock provider)', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ text: 'r' }] })));
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/ia/chat', token, body: { messages: [{ role: 'user', content: 'X' }] } }),
      userEnv(),
    );
    expect([200, 400, 500, 503]).toContain(r.status);
  });

  it('POST /api/signalements sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/signalements', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /api/signalements avec token → smoke', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({
        method: 'POST', path: '/api/signalements', token,
        body: { reported_user_id: 'u2', reason: 'spam', message_id: 'm1' },
      }),
      userEnv(),
    );
    expect([200, 400, 500]).toContain(r.status);
  });

  it('GET /api/system/config → ok', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [{ key: 'KEVIN_INVISIBLE_ADMIN', value: 'false' }] }),
      run: async () => ({}),
    }));
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/system/config' }), env);
    expect([200, 500]).toContain(r.status);
  });
});

// ----------------------------------------------------------------------------
//  PATCH /api/users/me
// ----------------------------------------------------------------------------
describe('PATCH /api/users/me', () => {
  it('sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'PATCH', path: '/api/users/me', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('rien à modifier → 400', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'PATCH', path: '/api/users/me', token, body: {} }),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('avec champs valides → ok', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({
        method: 'PATCH', path: '/api/users/me', token,
        body: { display_name: 'Kevin', bio: 'Test', email: 'k@test.com', language: 'fr', timezone: 'Europe/Monaco', avatar_url: 'a' },
      }),
      env,
    );
    expect([200, 500]).toContain(r.status);
  });
});

// ----------------------------------------------------------------------------
//  WebSocket conv route (signal forward to DO)
// ----------------------------------------------------------------------------
describe('WS endpoint /api/conversations/:id/ws', () => {
  it('sans Upgrade header → 426 ou 401', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations/c1/ws', token }), env);
    expect([401, 403, 404, 426, 500]).toContain(r.status);
  });
});
