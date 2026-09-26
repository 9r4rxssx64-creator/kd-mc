/**
 * Tests api-worker.js — Connexion-tracking (migration 0007)
 * captureConnection (isNew true/false, request.cf undefined, parse UA,
 * push admin seulement si isNew && pas admin) + route GET /api/admin/connections.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker, { captureConnection, parseUserAgent, sendPushToUser } from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});
afterEach(() => { vi.restoreAllMocks(); });

/** Construit une Request avec un objet cf + UA optionnels (cf=null → undefined). */
function reqWith(cf, ua) {
  const r = makeRequest({ method: 'POST', path: '/api/auth/verify-otp' });
  if (cf !== undefined) Object.defineProperty(r, 'cf', { value: cf, configurable: true });
  if (ua) Object.defineProperty(r, 'headers', {
    value: { get: (k) => (k.toLowerCase() === 'user-agent' ? ua : null) },
    configurable: true,
  });
  return r;
}

describe('parseUserAgent', () => {
  it('iOS Safari mobile', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E Safari/604.1';
    expect(parseUserAgent(ua)).toEqual({ os: 'iOS', browser: 'Safari', device: 'mobile' });
  });
  it('Android Chrome mobile', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537 Chrome/120 Mobile Safari/537';
    expect(parseUserAgent(ua)).toEqual({ os: 'Android', browser: 'Chrome', device: 'mobile' });
  });
  it('Windows Edge desktop', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537 Chrome/120 Safari/537 Edg/120';
    expect(parseUserAgent(ua)).toEqual({ os: 'Windows', browser: 'Edge', device: 'desktop' });
  });
  it('macOS Firefox desktop', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Gecko/20100101 Firefox/121';
    expect(parseUserAgent(ua)).toEqual({ os: 'macOS', browser: 'Firefox', device: 'desktop' });
  });
  it('Linux Chrome desktop', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537 Chrome/120 Safari/537';
    expect(parseUserAgent(ua)).toEqual({ os: 'Linux', browser: 'Chrome', device: 'desktop' });
  });
  it('UA vide → tout vide, desktop par défaut', () => {
    expect(parseUserAgent('')).toEqual({ os: '', browser: '', device: 'desktop' });
    expect(parseUserAgent(null)).toEqual({ os: '', browser: '', device: 'desktop' });
  });
});

describe('captureConnection', () => {
  function connEnv(existing) {
    const env = ENV();
    const calls = { insert: 0, update: 0 };
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind() { return this; },
      first: async () => (sql.includes('SELECT id FROM connections') ? existing : null),
      run: async () => {
        if (sql.includes('INSERT INTO connections')) calls.insert++;
        if (sql.includes('UPDATE connections')) calls.update++;
        return { success: true };
      },
      // sendPushToUser interroge push_subscriptions → fournir 1 abonnement
      // pour que le push-worker (fetch) soit réellement appelé.
      all: async () => (sql.includes('FROM push_subscriptions')
        ? { results: [{ endpoint: 'https://push.example/abc', vapid_p256dh: 'p', vapid_auth: 'a' }] }
        : { results: [] }),
    }));
    env._calls = calls;
    return env;
  }

  it('user manquant → isNew false, aucune écriture', async () => {
    const env = connEnv(null);
    const out = await captureConnection(env, reqWith({ country: 'MC' }), null);
    expect(out).toEqual({ isNew: false });
    expect(env._calls.insert).toBe(0);
  });

  it('signature inconnue → INSERT + isNew true + push admin (non-admin)', async () => {
    const env = connEnv(null);
    const pushSpy = vi.spyOn(globalThis, 'fetch');
    const out = await captureConnection(
      env,
      reqWith({ country: 'MC', city: 'Monaco', region: 'MC' }, 'Mozilla/5.0 (iPhone) Safari'),
      { id: 'u1', pseudo: 'marie', real_name: 'Marie D' },
    );
    expect(out.isNew).toBe(true);
    expect(out.os).toBe('iOS');
    expect(out.country).toBe('MC');
    expect(env._calls.insert).toBe(1);
    expect(env._calls.update).toBe(0);
    // push admin envoyé via push-worker (fetch)
    expect(pushSpy).toHaveBeenCalled();
  });

  it('signature connue → UPDATE last_seen/hits + isNew false (pas de push)', async () => {
    const env = connEnv({ id: 'c1' });
    const pushSpy = vi.spyOn(globalThis, 'fetch');
    const out = await captureConnection(env, reqWith({ country: 'MC' }), { id: 'u1', pseudo: 'marie' });
    expect(out).toEqual({ isNew: false });
    expect(env._calls.update).toBe(1);
    expect(env._calls.insert).toBe(0);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('request.cf undefined → pas de throw, valeurs géo vides', async () => {
    const env = connEnv(null);
    const out = await captureConnection(env, reqWith(undefined), { id: 'u1', pseudo: 'x' });
    expect(out.isNew).toBe(true);
    expect(out.country).toBe('');
    expect(out.city).toBe('');
  });

  it('admin kdmc_admin nouveau device → INSERT mais AUCUN push', async () => {
    const env = connEnv(null);
    const pushSpy = vi.spyOn(globalThis, 'fetch');
    const out = await captureConnection(env, reqWith({ country: 'MC' }), { id: 'kdmc_admin', pseudo: 'kevin' });
    expect(out.isNew).toBe(true);
    expect(env._calls.insert).toBe(1);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('erreur DB → catch interne → isNew false (ne casse jamais le login)', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => { throw new Error('db down'); });
    const out = await captureConnection(env, reqWith({ country: 'MC' }), { id: 'u1', pseudo: 'x' });
    expect(out).toEqual({ isNew: false });
  });

  it('push qui throw → capture réussit quand même (best-effort)', async () => {
    const env = connEnv(null);
    // push-worker (fetch) rejette → le catch interne du push absorbe
    globalThis.fetch = vi.fn(async () => { throw new Error('push down'); });
    const out = await captureConnection(env, reqWith({ country: 'MC' }), { id: 'u1', pseudo: 'x' });
    expect(out.isNew).toBe(true);
    expect(env._calls.insert).toBe(1);
  });
});

describe('GET /api/admin/connections', () => {
  it('non-admin → 403', async () => {
    const token = await makeJWT({ sub: 'u', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind() { return this; },
      first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/connections', token }), env);
    expect(r.status).toBe(403);
  });

  it('admin → 200 + liste connexions', async () => {
    const token = await makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind() { return this; },
      first: async () => (sql.includes('SELECT last_force_logout_at') ? { is_admin: 1, status: 'active', is_banned: 0 } : null),
      all: async () => (sql.includes('FROM connections')
        ? { results: [{ id: 'c1', user_id: 'u1', sig: 'iOS|Safari|MC|Monaco', os: 'iOS', browser: 'Safari', city: 'Monaco', country: 'MC', hits: 3, last_seen: Date.now() }] }
        : { results: [] }),
      run: async () => ({}),
    }));
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/admin/connections', token }), env);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.connections)).toBe(true);
    expect(body.connections[0].user_id).toBe('u1');
  });
});

describe('sendPushToUser export (sanity)', () => {
  it('est exporté et appelable', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind() { return this; },
      all: async () => ({ results: [] }),
    }));
    await expect(sendPushToUser('kdmc_admin', { title: 't', body: 'b' }, env)).resolves.toBeUndefined();
  });
});
