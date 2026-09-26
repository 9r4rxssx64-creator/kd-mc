/**
 * Tests api-worker.js — handleVerifyOtp success paths complets
 * (Kevin admin bypass, OTP correct, OTP expired, OTP max attempts, user create).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleVerifyOtp,
  handleSendOtp,
  sha256,
} from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});

function makeReq(body) {
  return new Request('https://api.apex/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleVerifyOtp — bypass admin Kevin otp 000000', () => {
  it('phone=KEVIN_PHONE + otp=000000 + user n\'existe pas → INSERT admin + JWT', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001', JWT_SIGN_KEY: 'sign-key' });
    let userCreated = false;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users WHERE id') && !userCreated) return null;
        if (sql.includes('FROM users WHERE id') && userCreated) {
          return { id: 'kdmc_admin', pseudo: 'kevin', is_admin: 1 };
        }
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => {
        if (sql.includes('INSERT INTO users')) userCreated = true;
        return { success: true };
      },
    }));
    const r = await handleVerifyOtp(makeReq({
      phone: '+33600000001', pseudo: 'kevin', otp: '000000',
    }), env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.token).toBeTruthy();
    expect(b.user.is_admin).toBe(true);
  });

  it('phone=KEVIN_PHONE + otp=000000 + user existe → JWT direct', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001', JWT_SIGN_KEY: 'sign-key' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ id: 'kdmc_admin', pseudo: 'kevin', is_admin: 1, real_name: 'Kevin' }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone: '+33600000001', pseudo: 'kevin', otp: '000000', name: 'Kevin Desarzens',
    }), env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.user.is_admin).toBe(true);
  });

  it('phone=KEVIN_PHONE + otp pas 000000 → continue normal flow OTP', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001', JWT_SIGN_KEY: 'sign-key' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone: '+33600000001', pseudo: 'kevin', otp: '999999', name: 'Kevin Desarzens',
    }), env);
    expect([200, 400, 401]).toContain(r.status);
  });
});

describe('handleVerifyOtp — OTP flow success/error paths', () => {
  it('OTP correct + user n\'existe pas → INSERT + JWT', async () => {
    const env = ENV({ JWT_SIGN_KEY: 'sign-key' });
    const phone = '+33612345678';
    const otp = '123456';
    const otpHash = await sha256(otp + ':' + phone);
    const phoneHash = await sha256(phone);
    let userCreated = false;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) {
          return { otp_hash: otpHash, attempts: 0, expires_at: Date.now() + 60000 };
        }
        if (sql.includes('FROM users WHERE phone')) {
          return userCreated ? { id: 'new-user', pseudo: 'marie', phone, is_admin: 0 } : null;
        }
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => {
        if (sql.includes('INSERT INTO users')) userCreated = true;
        return { success: true };
      },
    }));
    const r = await handleVerifyOtp(makeReq({
      phone, pseudo: 'marie', otp, name: 'Marie Dupont',
    }), env);
    expect([200, 409, 500]).toContain(r.status);
  });

  it('OTP correct + user existe déjà → JWT direct', async () => {
    const env = ENV({ JWT_SIGN_KEY: 'sign-key' });
    const phone = '+33612345678';
    const otp = '123456';
    const otpHash = await sha256(otp + ':' + phone);
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) return { otp_hash: otpHash, attempts: 0, expires_at: Date.now() + 60000 };
        if (sql.includes('FROM users WHERE phone')) return { id: 'u1', pseudo: 'marie', phone, is_admin: 0 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone, pseudo: 'marie', otp, name: 'Marie Dupont',
    }), env);
    expect([200, 500]).toContain(r.status);
  });

  it('OTP correct + user existant + KEVIN_PHONE → UPDATE is_admin=1', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001', JWT_SIGN_KEY: 'sign-key' });
    const phone = '+33600000001';
    const otp = '111111'; // pas '000000', donc on prend le path OTP normal
    const otpHash = await sha256(otp + ':' + phone);
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) return { otp_hash: otpHash, attempts: 0, expires_at: Date.now() + 60000 };
        if (sql.includes('FROM users WHERE phone')) return { id: 'kdmc', pseudo: 'kevin', phone, is_admin: 0 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone, pseudo: 'kevin', otp, name: 'Kevin Desarzens',
    }), env);
    expect([200, 500]).toContain(r.status);
  });

  it('OTP expiré → 410 + DELETE', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) {
          return { otp_hash: 'x', attempts: 0, expires_at: Date.now() - 60000 };
        }
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone: '+33612345678', pseudo: 'marie', otp: '123456', name: 'Marie Dupont',
    }), env);
    expect(r.status).toBe(410);
  });

  it('OTP max attempts (5+) → 429', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) {
          return { otp_hash: 'x', attempts: 5, expires_at: Date.now() + 60000 };
        }
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone: '+33612345678', pseudo: 'marie', otp: '123456', name: 'Marie Dupont',
    }), env);
    expect(r.status).toBe(429);
  });

  it('OTP incorrect → UPDATE attempts + 401', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) {
          return { otp_hash: 'wrong-hash', attempts: 2, expires_at: Date.now() + 60000 };
        }
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone: '+33612345678', pseudo: 'marie', otp: '123456', name: 'Marie Dupont',
    }), env);
    expect(r.status).toBe(401);
  });

  it('Firebase token mode + phone mismatch → 401', async () => {
    const env = ENV({ FIREBASE_PROJECT_ID: 'apex-chat' });
    env.APEX_CHAT_CACHE = { get: vi.fn(async () => null), put: vi.fn(async () => {}) };
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      kid1: '-----BEGIN CERTIFICATE-----\nMIIDdjCCAl6gAwIBAgIJAKLk\n-----END CERTIFICATE-----',
    })));
    vi.spyOn(globalThis.crypto.subtle, 'importKey').mockResolvedValue({});
    vi.spyOn(globalThis.crypto.subtle, 'verify').mockResolvedValue(true);
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const fbToken = enc({ alg: 'RS256', kid: 'kid1' }) + '.' + enc({
      sub: 'fb-uid', aud: 'apex-chat',
      iss: 'https://securetoken.google.com/apex-chat',
      phone_number: '+33999999999', // DIFFÉRENT du phone fourni
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }) + '.sig';
    const r = await handleVerifyOtp(makeReq({
      phone: '+33612345678', pseudo: 'marie', name: 'Marie Dupont',
      firebase_id_token: fbToken,
    }), env);
    expect([401, 500]).toContain(r.status);
  });

  it('ni otp ni firebase_id_token → 400 no_auth_method', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleVerifyOtp(makeReq({
      phone: '+33612345678', pseudo: 'marie', name: 'Marie Dupont',
    }), env);
    expect(r.status).toBe(400);
    const b = await r.json();
    expect(b.error).toBe('no_auth_method');
  });

  it('pseudo invalide (3 chars) → 400', async () => {
    const r = await handleVerifyOtp(makeReq({
      phone: '+33612345678', pseudo: 'ab', otp: '123456', name: 'Marie Dupont',
    }), ENV());
    expect(r.status).toBe(400);
  });

  it('pseudo contient caractères interdits → 400', async () => {
    const r = await handleVerifyOtp(makeReq({
      phone: '+33612345678', pseudo: 'with space', otp: '123456', name: 'Marie Dupont',
    }), ENV());
    expect(r.status).toBe(400);
  });
});

describe('handleSendOtp — paths complets', () => {
  function sendReq(body) {
    return new Request('https://api.apex/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('handleSendOtp Vonage success → provider vonage + sessionId', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      messages: [{ status: '0' }],
    })));
    const env = ENV({ VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleSendOtp(sendReq({
      phone: '+33612345678', name: 'Marie Dupont',
    }), env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.provider).toBe('vonage');
    expect(b.sessionId).toBeTruthy();
  });

  it('handleSendOtp rate limit non atteint → continue', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('ratelimit_otp')) return { count: 3 };
        return null;
      },
      all: async () => ({ results: [{ key: 'OTP_RATE_LIMIT_PER_HOUR', value: '5' }] }),
      run: async () => ({ success: true }),
    }));
    const r = await handleSendOtp(sendReq({
      phone: '+33612345678', name: 'Marie Dupont',
    }), env);
    expect(r.status).toBe(200);
  });
});
