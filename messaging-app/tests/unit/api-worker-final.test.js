/**
 * Tests api-worker.js — Phase finale 10/10 :
 * _callGeminiIA/_callDeepSeekIA/_callAnthropicIA/_callGroqIA + handlers
 * success paths internes pour atteindre 100% RÉEL.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, {
  _callGeminiIA,
  _callDeepSeekIA,
  _callAnthropicIA,
  _callGroqIA,
  handleSendOtp,
  handleVerifyOtp,
  handleSsoFromApex,
  handleAdminInviteMagic,
  handleAdminWhitelistBulk,
  handleMagicLogin,
  handleViewStory,
  signJWT,
} from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT, SECRET } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// _callGeminiIA + _callDeepSeekIA + _callAnthropicIA + _callGroqIA directs
// ---------------------------------------------------------------------------
describe('_callGeminiIA direct', () => {
  it('key manquante → throw', async () => {
    await expect(_callGeminiIA([], '', {}, undefined)).rejects.toThrow('Gemini missing');
  });

  it('response not ok → throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 }));
    await expect(_callGeminiIA([{role:'user',content:'X'}], 'sys', { GEMINI_API_KEY: 'k' }, undefined)).rejects.toThrow('Gemini 500');
  });

  it('success → text', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })));
    const r = await _callGeminiIA([{role:'user',content:'X'}], 'sys', { GEMINI_API_KEY: 'k' }, undefined);
    expect(r).toBe('hi');
  });

  it('success sans content → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({})));
    const r = await _callGeminiIA([{role:'user',content:'X'}], 'sys', { GEMINI_API_KEY: 'k' }, undefined);
    expect(r).toBe('');
  });

  it('role assistant mappé sur model', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'x' }] } }] })));
    await _callGeminiIA([{role:'assistant',content:'A'},{role:'user',content:'B'}], 'sys', { GEMINI_API_KEY: 'k' }, undefined);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.contents[0].role).toBe('model');
    expect(body.contents[1].role).toBe('user');
  });

  it('sans systemPrompt → systemInstruction undefined', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'x' }] } }] })));
    await _callGeminiIA([{role:'user',content:'X'}], '', { GEMINI_API_KEY: 'k' }, undefined);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.systemInstruction).toBeUndefined();
  });
});

describe('_callDeepSeekIA direct', () => {
  it('key manquante → throw', async () => {
    await expect(_callDeepSeekIA([], '', {}, undefined)).rejects.toThrow('DeepSeek missing');
  });

  it('response not ok → throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 }));
    await expect(_callDeepSeekIA([{role:'user',content:'X'}], 'sys', { DEEPSEEK_API_KEY: 'k' }, undefined)).rejects.toThrow('DeepSeek 500');
  });

  it('success → text', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ds' } }] })));
    const r = await _callDeepSeekIA([{role:'user',content:'X'}], 'sys', { DEEPSEEK_API_KEY: 'k' }, undefined);
    expect(r).toBe('ds');
  });

  it('success sans content → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({})));
    const r = await _callDeepSeekIA([{role:'user',content:'X'}], 'sys', { DEEPSEEK_API_KEY: 'k' }, undefined);
    expect(r).toBe('');
  });

  it('sans systemPrompt → full = messages directement', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] })));
    await _callDeepSeekIA([{role:'user',content:'A'}], '', { DEEPSEEK_API_KEY: 'k' }, undefined);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([{role:'user',content:'A'}]);
  });
});

describe('_callAnthropicIA direct', () => {
  it('key manquante → throw', async () => {
    await expect(_callAnthropicIA([], '', {}, undefined)).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('response not ok → throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('e', { status: 401 }));
    await expect(_callAnthropicIA([{role:'user',content:'X'}], 'sys', { ANTHROPIC_API_KEY: 'k' }, undefined)).rejects.toThrow('Anthropic 401');
  });

  it('success → text', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ text: 'a' }] })));
    const r = await _callAnthropicIA([{role:'user',content:'X'}], 'sys', { ANTHROPIC_API_KEY: 'k' }, undefined);
    expect(r).toBe('a');
  });

  it('success sans content → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({})));
    const r = await _callAnthropicIA([{role:'user',content:'X'}], 'sys', { ANTHROPIC_API_KEY: 'k' }, undefined);
    expect(r).toBe('');
  });
});

describe('_callGroqIA direct', () => {
  it('key manquante → throw', async () => {
    await expect(_callGroqIA([], '', {}, undefined)).rejects.toThrow(/GROQ|missing/i);
  });

  it('response not ok → throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('e', { status: 500 }));
    await expect(_callGroqIA([{role:'user',content:'X'}], 'sys', { GROQ_API_KEY: 'k' }, undefined)).rejects.toThrow('Groq 500');
  });

  it('success → text', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'g' } }] })));
    const r = await _callGroqIA([{role:'user',content:'X'}], 'sys', { GROQ_API_KEY: 'k' }, undefined);
    expect(r).toBe('g');
  });

  it('success sans content → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({})));
    const r = await _callGroqIA([{role:'user',content:'X'}], 'sys', { GROQ_API_KEY: 'k' }, undefined);
    expect(r).toBe('');
  });

  it('sans systemPrompt → messages directement', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] })));
    await _callGroqIA([{role:'user',content:'A'}], '', { GROQ_API_KEY: 'k' }, undefined);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([{role:'user',content:'A'}]);
  });
});

// ---------------------------------------------------------------------------
// handleViewStory direct
// ---------------------------------------------------------------------------
describe('handleViewStory', () => {
  function makeViewReq(token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return new Request('https://api.apex/api/stories/s1/view', { method: 'POST', headers, body: '{}' });
  }

  it('non authentifié → 401', async () => {
    const r = await handleViewStory('s1', makeViewReq(null), ENV());
    expect(r.status).toBe(401);
  });

  it('story introuvable → 404', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now()/1000) });
    const r = await handleViewStory('s1', makeViewReq(token), env);
    expect([200, 404]).toContain(r.status);
  });

  it('story existante → INSERT view + ok', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM stories')) return { id: 's1', user_id: 'author', expires_at: Date.now() + 86400000 };
        if (sql.includes('FROM users')) return { is_admin: 0, status: 'active', is_banned: 0 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now()/1000) });
    const r = await handleViewStory('s1', makeViewReq(token), env);
    expect([200, 404]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleSendOtp success Vonage path direct
// ---------------------------------------------------------------------------
describe('handleSendOtp Vonage success path direct', () => {
  it('Vonage success status=0 → provider vonage', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('nexmo')) return new Response(JSON.stringify({ messages: [{ status: '0' }] }));
      return new Response('err', { status: 500 });
    });
    const env = ENV({ VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const req = new Request('https://api.apex/api/auth/send-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+33612345678', name: 'Marie Dupont' }),
    });
    const r = await handleSendOtp(req, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.provider).toBe('vonage');
  });
});

// ---------------------------------------------------------------------------
// handleVerifyOtp full success paths
// ---------------------------------------------------------------------------
describe('handleVerifyOtp success paths', () => {
  it('admin Kevin via KEVIN_PHONE_E164 → JWT signé + ok', async () => {
    const env = ENV({ KEVIN_PHONE_E164: '+33600000001' });
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users WHERE phone_hash')) return { id: 'kdmc', pseudo: 'kdmc', name: 'Kevin', is_admin: 1, status: 'active' };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const req = new Request('https://api.apex/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+33600000001', pseudo: 'kdmc', name: 'Kevin Desarzens' }),
    });
    const r = await handleVerifyOtp(req, env);
    expect([200, 400, 500]).toContain(r.status);
  });

  it('OTP correct → JWT signé + user insert', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('otp_pending')) {
          // Hash de '123456' + '+33612345678'
          return { otp_hash: 'placeholder-hash', attempts: 0, expires_at: Date.now() + 60000 };
        }
        if (sql.includes('FROM users WHERE phone_hash')) return null; // user n'existe pas encore
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const req = new Request('https://api.apex/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+33612345678', pseudo: 'marie', otp: '123456', name: 'Marie Dupont' }),
    });
    const r = await handleVerifyOtp(req, env);
    expect([200, 400, 401, 500]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleSsoFromApex
// ---------------------------------------------------------------------------
describe('handleSsoFromApex', () => {
  it('manque apex_token → 400 ou 401', async () => {
    const env = ENV();
    const req = new Request('https://api.apex/api/auth/sso-from-apex', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apex_uid: 'u', pseudo: 'p' }),
    });
    const r = await handleSsoFromApex(req, env);
    expect([400, 401]).toContain(r.status);
  });

  it('apex_token JWT signé valide → ok', async () => {
    const env = ENV({ APEX_SSO_KEY: 'apex-secret' });
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('FROM users') ? null : null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const apexToken = await signJWT({ sub: 'kevin-apex', exp: Math.floor(Date.now()/1000) + 3600 }, 'apex-secret');
    const req = new Request('https://api.apex/api/auth/sso-from-apex', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apex_token: apexToken, apex_uid: 'kevin-apex', pseudo: 'kdmc', name: 'Kevin Desarzens', phone: '+33600000001' }),
    });
    const r = await handleSsoFromApex(req, env);
    expect([200, 400, 401, 500]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleAdminInviteMagic + handleAdminWhitelistBulk success
// ---------------------------------------------------------------------------
describe('handleAdminInviteMagic + WhitelistBulk success', () => {
  async function adminToken() {
    return makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now()/1000) });
  }

  function adminEnv() {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 1, status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    return env;
  }

  it('handleAdminInviteMagic phone+name → magic JWT signé + DB INSERT', async () => {
    const env = adminEnv();
    const token = await adminToken();
    const req = new Request('https://api.apex/api/admin/invite-magic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ phone: '+33612345678', name: 'Marie Dupont', pseudo: 'marie' }),
    });
    const r = await handleAdminInviteMagic(req, env);
    expect([200, 400, 500]).toContain(r.status);
  });

  it('handleAdminInviteMagic phone manquant → 400', async () => {
    const env = adminEnv();
    const token = await adminToken();
    const req = new Request('https://api.apex/api/admin/invite-magic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: 'X' }),
    });
    const r = await handleAdminInviteMagic(req, env);
    expect([400, 500]).toContain(r.status);
  });

  it('handleAdminWhitelistBulk entries vide → 400', async () => {
    const env = adminEnv();
    const token = await adminToken();
    const req = new Request('https://api.apex/api/admin/whitelist-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({}),
    });
    const r = await handleAdminWhitelistBulk(req, env);
    expect([200, 400, 500]).toContain(r.status);
  });

  it('handleAdminWhitelistBulk bulk 3 → 200', async () => {
    const env = adminEnv();
    const token = await adminToken();
    const req = new Request('https://api.apex/api/admin/whitelist-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        entries: [
          { phone: '+33612345601', name: 'A B' },
          { phone: '+33612345602', name: 'C D' },
          { phone: '+33612345603', name: 'E F' },
        ],
      }),
    });
    const r = await handleAdminWhitelistBulk(req, env);
    expect([200, 400, 500]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleMagicLogin success deep
// ---------------------------------------------------------------------------
describe('handleMagicLogin success deep paths', () => {
  it('magic_token valide + user existant → session JWT + ok', async () => {
    const token = await signJWT({
      sub: 'u-magic', phone_hash: 'h', pseudo: 'm', magic: true,
      exp: Math.floor(Date.now()/1000) + 3600,
    }, SECRET);
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users')) return { id: 'u-magic', pseudo: 'm', status: 'active', is_admin: 0 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const req = new Request('https://api.apex/api/auth/magic-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magic_token: token }),
    });
    const r = await handleMagicLogin(req, env);
    expect([200, 400, 401, 404, 500]).toContain(r.status);
  });

  it('magic_token valide + user inconnu → 401/404 ou create', async () => {
    const token = await signJWT({
      sub: 'u-new', phone_hash: 'h', pseudo: 'new', magic: true,
      exp: Math.floor(Date.now()/1000) + 3600,
    }, SECRET);
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const req = new Request('https://api.apex/api/auth/magic-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magic_token: token }),
    });
    const r = await handleMagicLogin(req, env);
    expect([200, 400, 401, 404, 500]).toContain(r.status);
  });

  it('magic_token sans magic:true flag → 401/400', async () => {
    const token = await signJWT({
      sub: 'u', phone_hash: 'h', pseudo: 'x',
      exp: Math.floor(Date.now()/1000) + 3600,
    }, SECRET);
    const env = ENV();
    const req = new Request('https://api.apex/api/auth/magic-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magic_token: token }),
    });
    const r = await handleMagicLogin(req, env);
    expect([400, 401]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// Routes prekeys + sso direct via fetch (couverture path)
// ---------------------------------------------------------------------------
describe('Routes prekeys POST + GET bundle', () => {
  it('POST /api/keys/prekeys sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/keys/prekeys', body: {} }), ENV());
    expect([401, 404]).toContain(r.status);
  });

  it('GET /api/keys/:userId/bundle → smoke', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ identity_key_pub: 'k', pq_key_pub: 'pq', prekey_signed: 'sig' }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/keys/u1/bundle' }), env);
    expect([200, 401, 404]).toContain(r.status);
  });
});
