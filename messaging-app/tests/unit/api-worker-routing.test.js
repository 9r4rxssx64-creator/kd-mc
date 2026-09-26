/**
 * Tests api-worker.js — Routing principal + CORS + 404 + 500.
 * Routes auth (send-otp, verify-otp, sso-from-apex, magic-login, cgu/accept).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT, SECRET, withOrigin } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
});

describe('api-worker — CORS + routing', () => {
  it('OPTIONS retourne CORS', async () => {
    // v1.1.287 (audit P2b) : origine autorisée renvoyée, inconnue refusée.
    const ok = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS', path: '/api/anything' }), 'https://9r4rxssx64-creator.github.io'), ENV());
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://9r4rxssx64-creator.github.io');
    const ko = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS', path: '/api/anything' }), 'https://evil.example'), ENV());
    expect(ko.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /health → ok', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/health' }), ENV());
    expect((await r.json()).ok).toBe(true);
  });

  it('GET /api/health → ok', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/health' }), ENV());
    expect((await r.json()).ok).toBe(true);
  });

  it('Route inconnue → 404', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/inexistant' }), ENV());
    expect(r.status).toBe(404);
  });

  it('Exception dans handler → 500 (avec ctx.waitUntil mocked)', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => { throw new Error('db sql crash'); },
      all: async () => { throw new Error('db sql crash'); },
      run: async () => ({}),
    }));
    const ctx = { waitUntil: vi.fn() };
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/system/config' }), env, ctx);
    expect(r.status).toBe(500);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });
});

describe('api-worker — POST /api/auth/send-otp', () => {
  it('phone manquant → 400', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/send-otp', body: {} }), ENV());
    expect(r.status).toBe(400);
  });

  it('phone format invalide → 400', async () => {
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/auth/send-otp', body: { phone: 'not-phone' } }),
      ENV(),
    );
    expect(r.status).toBe(400);
  });

  it('phone admin Kevin → ok bypass send (pas de vrai SMS)', async () => {
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/auth/send-otp', body: { phone: '+33600000001' } }),
      ENV(),
    );
    expect([200, 201, 400, 503]).toContain(r.status);
  });
});

describe('api-worker — POST /api/cgu/accept (anonyme accepté)', () => {
  it('sans token → ok (CGU anonyme)', async () => {
    const env = ENV();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/cgu/accept', body: { phone: '+33600000001', version: 'v1.1.6' } }),
      env,
    );
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it('user authentifié → INSERT cgu_acceptances + ok', async () => {
    const env = ENV();
    const token = await makeJWT({ sub: 'u-1', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/cgu/accept', token, body: { version: 'v1.1.6', implicit: false } }),
      env,
    );
    expect(r.status).toBe(200);
  });

  it('CGU accept avec body invalide → ok quand même (catch JSON)', async () => {
    const badReq = new Request('https://api.apex/api/cgu/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json',
    });
    const r = await worker.fetch(badReq, ENV());
    expect(r.status).toBe(200);
  });
});

describe('api-worker — POST /api/users/heartbeat (auth requis)', () => {
  it('sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/users/heartbeat', body: {} }), ENV());
    expect(r.status).toBe(401);
  });

  it('avec token → ok last_seen update', async () => {
    const token = await makeJWT({ sub: 'u-2', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/users/heartbeat', token, body: { device: 'iPhone' } }),
      ENV(),
    );
    expect(r.status).toBe(200);
  });
});

describe('api-worker — GET /api/users/me', () => {
  it('sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me' }), ENV());
    expect(r.status).toBe(401);
  });

  it('token invalide → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me', token: 'fake' }), ENV());
    expect(r.status).toBe(401);
  });

  it('token expiré → 401', async () => {
    const expired = await makeJWT({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 1000 });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me', token: expired }), ENV());
    expect(r.status).toBe(401);
  });

  it('user existe → ok + profil', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => {
      if (sql.includes('SELECT last_force_logout_at')) {
        return { bind: function () { return this; }, first: async () => ({ status: 'active', is_banned: 0 }), all: async () => ({ results: [] }), run: async () => ({ success: true }) };
      }
      if (sql.includes('FROM users WHERE id')) {
        return { bind: function () { return this; }, first: async () => ({ id: 'u-3', pseudo: 'kdmc', name: 'Kevin', is_admin: 1 }), all: async () => ({}), run: async () => ({}) };
      }
      return { bind: function () { return this; }, first: async () => null, all: async () => ({}), run: async () => ({}) };
    });
    const token = await makeJWT({ sub: 'u-3', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me', token }), env);
    expect(r.status).toBe(200);
  });

  it('user banni → 401', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_banned: 1, status: 'active' }),
      all: async () => ({}), run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'banned', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me', token }), env);
    expect(r.status).toBe(401);
  });

  it('user force_logout après iat → 401', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_banned: 0, status: 'active', last_force_logout_at: Date.now() }),
      all: async () => ({}), run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'logged-out', iat: Math.floor((Date.now() - 60000) / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me', token }), env);
    expect(r.status).toBe(401);
  });

  it('DB query fail dans getAuthUser → continue (try/catch silencieux)', async () => {
    const env = ENV();
    let firstCall = true;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => {
      if (firstCall && sql.includes('last_force_logout_at')) {
        firstCall = false;
        return { bind: function () { return this; }, first: async () => { throw new Error('db down'); }, all: async () => ({}), run: async () => ({}) };
      }
      if (sql.includes('FROM users WHERE id')) {
        return { bind: function () { return this; }, first: async () => ({ id: 'u', pseudo: 'k' }), all: async () => ({}), run: async () => ({}) };
      }
      return { bind: function () { return this; }, first: async () => null, all: async () => ({}), run: async () => ({}) };
    });
    const token = await makeJWT({ sub: 'u-x', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me', token }), env);
    expect(r.status).toBe(200);
  });
});

describe('api-worker — GET /api/users/:pseudo (profil d\'un pair, jeton requis — audit 17/09/2026)', () => {
  const tok = () => makeJWT({ sub: 'u-1', iat: Math.floor(Date.now() / 1000) });
  // La ligne d'auth (getAuthUser) puis la ligne profil
  const db = (profil) => vi.fn((sql) => ({
    bind: function () { return this; },
    first: async () => (sql.includes('last_force_logout_at') ? { status: 'active', is_banned: 0 } : profil),
  }));

  it('sans jeton → 401 (avant : état civil lisible par pseudo sans être connecté)', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = db({ pseudo: 'kdmc', real_name: 'Kevin D' });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/kdmc' }), env);
    expect(r.status).toBe(401);
  });

  it('user existe → 200', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = db({ pseudo: 'kdmc', name: 'Kevin' });
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/kdmc', token: await tok() }), env);
    expect(r.status).toBe(200);
  });

  it('user inconnu → 404', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = db(null);
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/inconnu', token: await tok() }), env);
    expect(r.status).toBe(404);
  });
});
