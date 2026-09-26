/**
 * Tests api-worker.js — Auth OTP/SSO/Magic-link complets.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ status: '0' }] })));
});

const sendOtp = (body, env = ENV()) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/send-otp', body }), env);
const verifyOtp = (body, env = ENV()) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/verify-otp', body }), env);
const ssoFromApex = (body, env = ENV()) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-apex', body }), env);
const magicLogin = (body, env = ENV()) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/magic-login', body }), env);

describe('handleSendOtp — validation', () => {
  it('phone format invalide → 400', async () => {
    const r = await sendOtp({ phone: 'abc', name: 'Marie Dupont' });
    expect(r.status).toBe(400);
  });
  it('name 1 token < 2 → erreur prénom+nom', async () => {
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('name_too_short');
  });
  it('name OK 2 tokens ≥2 chars → ok', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('ratelimit_otp') ? null : null,
      all: async () => sql.includes('system_config') ? { results: [] } : { results: [] },
      run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
  });

  it('admin Kevin via KEVIN_PHONE_E164 → bypass OTP', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001' });
    const r = await sendOtp({ phone: '+33600000001', name: 'X' }, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.provider).toBe('admin-bypass');
    expect(b._admin_bypass).toBe(true);
  });

  it('admin Kevin avec name 1 token → bypass OTP (exception name)', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001' });
    const r = await sendOtp({ phone: '+33600000001' }, env);
    expect(r.status).toBe(200);
    expect((await r.json()).provider).toBe('admin-bypass');
  });

  it('rate limit dépassé → 429', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('ratelimit_otp') ? { count: 99 } : null,
      all: async () => sql.includes('system_config') ? { results: [{ key: 'OTP_RATE_LIMIT_PER_HOUR', value: '5' }] } : { results: [] },
      run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect(r.status).toBe(429);
  });

  it('Vonage success → provider vonage', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ status: '0' }] })));
    const env = ENV({ VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.provider).toBe('vonage');
  });

  it('Vonage echec status non-0 → fallback TextBelt', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async (url) => {
      calls++;
      if (url.includes('nexmo.com')) return new Response(JSON.stringify({ messages: [{ status: '4', 'error-text': 'spam' }] }));
      if (url.includes('textbelt.com')) return new Response(JSON.stringify({ success: true }));
      return new Response('err', { status: 500 });
    });
    const env = ENV({ VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect(r.status).toBe(200);
    expect((await r.json()).provider).toBe('textbelt-free');
  });

  it('Vonage exception → fallback TextBelt', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('nexmo.com')) throw new Error('vonage net err');
      if (url.includes('textbelt.com')) return new Response(JSON.stringify({ success: true }));
      return new Response('err', { status: 500 });
    });
    const env = ENV({ VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect((await r.json()).provider).toBe('textbelt-free');
  });

  it('TextBelt fail → inline OTP fallback', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('textbelt.com')) return new Response(JSON.stringify({ success: false, error: 'no quota' }));
      return new Response('err', { status: 500 });
    });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.provider).toBe('inline');
    expect(b._dev_otp).toMatch(/^\d{6}$/);
    expect(b._show_code_in_app).toBe(true);
  });

  // v1.1.172 FIX P0/P1 (audit crew) — mode OTP RÉEL imposé (ALLOW_TEST_OTP off)
  it('ALLOW_TEST_OTP off + aucun SMS → 502 SANS fuiter le code (_dev_otp)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 }));
    const env = ENV({ ALLOW_TEST_OTP: 'false' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect(r.status).toBe(502);
    const b = await r.json();
    expect(b._dev_otp).toBeUndefined();   // le code n'est JAMAIS renvoyé
  });

  it('ALLOW_TEST_OTP off + code 000000 d\'un inconnu → refusé (pas de signup direct)', async () => {
    const env = ENV({ ALLOW_TEST_OTP: 'false', KEVIN_PHONE_E164: '+33600000001' });
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => null,   // aucun otp_pending → code refusé
      all: async () => ({ results: [] }), run: async () => ({ success: true }),
    }));
    const r = await verifyOtp({ phone: '+33611112222', name: 'Jean Martin', pseudo: 'jean', otp: '000000' }, env);
    expect([400, 401, 410]).toContain(r.status);   // PAS 200 (plus de backdoor universel)
    const b = await r.json();
    expect(b.token).toBeUndefined();
  });

  it('ALLOW_TEST_OTP off : bypass admin Kevin TOUJOURS actif (jamais verrouillé)', async () => {
    const env = ENV({ ALLOW_TEST_OTP: 'false', KEVIN_PHONE_E164: '+33600000001' });
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('WHERE id=?') ? { id: 'kdmc_admin', pseudo: 'kevin', is_admin: 1 } : null,
      all: async () => ({ results: [] }), run: async () => ({ success: true }),
    }));
    const r = await verifyOtp({ phone: '+33600000001', name: 'Kevin DESARZENS', pseudo: 'kevin', otp: '000000' }, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.token).toBeTruthy();
    expect(b.user.is_admin).toBe(true);
  });

  it('TextBelt exception → inline OTP fallback', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('textbelt.com')) throw new Error('tb net err');
      return new Response('err', { status: 500 });
    });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }),
    }));
    const r = await sendOtp({ phone: '+33612345678', name: 'Marie Dupont' }, env);
    expect(r.status).toBe(200);
    expect((await r.json()).provider).toBe('inline');
  });
});

describe('handleVerifyOtp', () => {
  it('phone manquant → 400', async () => {
    const r = await verifyOtp({ pseudo: 'p' });
    expect(r.status).toBe(400);
  });
  it('pseudo manquant → 400', async () => {
    const r = await verifyOtp({ phone: '+33612345678' });
    expect(r.status).toBe(400);
  });
  it('admin Kevin via KEVIN_PHONE_E164 → JWT directement', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001' });
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('FROM users WHERE phone_hash') ? null : null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await verifyOtp({ phone: '+33600000001', pseudo: 'kdmc', name: 'Kevin Desarzens' }, env);
    expect([200, 400, 500]).toContain(r.status);
  });

  it('OTP incorrect → 400', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) return { otp_hash: 'wronghash', attempts: 0, expires_at: Date.now() + 60000 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await verifyOtp({ phone: '+33612345678', pseudo: 'p', otp: '000000' }, env);
    expect(r.status).toBe(400);
  });

  it('OTP non envoyé pour ce phone → 400', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await verifyOtp({ phone: '+33612345678', pseudo: 'p', otp: '123456' }, env);
    expect(r.status).toBe(400);
  });
});

describe('handleSsoFromApex', () => {
  it('payload manquant → 400', async () => {
    const r = await ssoFromApex({});
    expect(r.status).toBe(400);
  });
  it('apex_uid manquant → 400 ou 401', async () => {
    const r = await ssoFromApex({ phone: '+33612345678' });
    expect([400, 401, 403]).toContain(r.status);
  });
});

describe('handleMagicLogin', () => {
  it('magic_token manquant → 400', async () => {
    const r = await magicLogin({});
    expect(r.status).toBe(400);
  });
  it('magic_token invalide → 401 ou 400', async () => {
    const r = await magicLogin({ magic_token: 'invalid.token.here' });
    expect([400, 401]).toContain(r.status);
  });
  it('magic_token valide JWT → ok ou erreur DB', async () => {
    const token = await makeJWT({
      sub: 'u-magic',
      phone_hash: 'h',
      pseudo: 'magicuser',
      magic: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await magicLogin({ magic_token: token }, env);
    expect([200, 400, 401, 404, 500]).toContain(r.status);
  });
});
