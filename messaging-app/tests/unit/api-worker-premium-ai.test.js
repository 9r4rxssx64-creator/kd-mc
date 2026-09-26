/**
 * Tests api-worker.js v1.1.24 — endpoints /api/ai/summarize + /api/premium/*
 *
 * Couvre :
 * - handleAiSummarize : auth 401, prompt validation, cache D1 hit, failover providers
 * - handlePremiumRequest : auth, plan validation, demande pending @kdmc + KV + fail-open
 * - handleAdminGrantPremium : admin-only (403 sinon), activation premium_until + plan
 * - handleAdminPremiumRequests : admin-only, liste KV pending
 * - handlePremiumStatus : query D1 premium_until + lifetime detect
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleAiSummarize,
  handleAiSmartReply,
  handleAiTranslate,
  handleAiVoiceTranscribe,
  handleAiImageDescribe,
  handlePremiumRequest,
  handleAdminGrantPremium,
  handleAdminPremiumRequests,
  handlePremiumStatus,
  handlePremiumQuota,
  handleAiRewrite,
} from '../../workers/api-worker.js';
import { ENV, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

async function userToken() {
  return makeJWT({ sub: 'user_test', email: 'test@apex.fr', iat: Math.floor(Date.now() / 1000) });
}

function makeReq(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return new Request('https://api.apex/' + path.replace(/^\//, ''), {
    method,
    headers,
    body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}

function userEnv(overrides = {}) {
  const env = ENV(overrides);
  env.APEX_CHAT_DB.prepare = vi.fn(() => ({
    bind: function () { return this; },
    first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  }));
  return env;
}

describe('handleAiSummarize', () => {
  it('refuse non-auth (401)', async () => {
    const req = makeReq('POST', '/api/ai/summarize', { prompt: 'résume moi ça' });
    const env = userEnv();
    const r = await handleAiSummarize(req, env);
    expect(r.status).toBe(401);
  });

  it('refuse prompt vide ou trop court', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiSummarize(makeReq('POST', '/api/ai/summarize', { prompt: '' }, tok), env);
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.message).toMatch(/prompt required/i);
  });

  it('refuse prompt > 50k chars', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiSummarize(
      makeReq('POST', '/api/ai/summarize', { prompt: 'a'.repeat(60000) }, tok),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('aucun provider configuré → 503', async () => {
    const env = userEnv(); /* pas de clé IA */
    delete env.ANTHROPIC_API_KEY;
    delete env.GROQ_API_KEY;
    delete env.GEMINI_API_KEY;
    delete env.DEEPSEEK_API_KEY;
    const tok = await userToken();
    const r = await handleAiSummarize(
      makeReq('POST', '/api/ai/summarize', { prompt: 'résume cette conversation longue de mai 2025' }, tok),
      env,
    );
    expect(r.status).toBe(503);
  });

  it('cache D1 hit → retourne cached sans appeler IA', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('ai_summary_cache')) {
          return { text: 'résumé en cache', ts: Date.now() };
        }
        return { is_admin: 0 };
      },
      run: async () => ({ success: true }),
    }));
    globalThis.fetch = vi.fn(); /* ne doit PAS être appelé */
    const tok = await userToken();
    const r = await handleAiSummarize(
      makeReq('POST', '/api/ai/summarize', { prompt: 'résume mes messages anciens' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.cached).toBe(true);
    expect(j.text).toBe('résumé en cache');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('Anthropic success → retourne text + cache D1', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('anthropic.com')) {
        return new Response(JSON.stringify({ content: [{ text: 'voici le résumé IA' }] }), { status: 200 });
      }
      return new Response('not implemented', { status: 500 });
    });
    const tok = await userToken();
    const r = await handleAiSummarize(
      makeReq('POST', '/api/ai/summarize', { prompt: 'résume cette discussion intéressante' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.text).toBe('voici le résumé IA');
    expect(j.provider).toBe('anthropic');
    expect(j.cached).toBe(false);
  });

  it('Anthropic fail → failover Groq', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k1', GROQ_API_KEY: 'k2' });
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('anthropic.com')) {
        return new Response('error', { status: 500 });
      }
      if (url.includes('groq.com')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: 'groq résumé' } }] }), { status: 200 });
      }
      return new Response('?', { status: 500 });
    });
    const tok = await userToken();
    const r = await handleAiSummarize(
      makeReq('POST', '/api/ai/summarize', { prompt: 'résume cette discussion sur mai' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.text).toBe('groq résumé');
    expect(j.provider).toBe('groq');
  });
});

describe('handlePremiumRequest (v1.1.208 — @kdmc)', () => {
  it('refuse non-auth', async () => {
    const r = await handlePremiumRequest(makeReq('POST', '/api/premium/request', { plan: 'monthly' }), userEnv());
    expect(r.status).toBe(401);
  });

  it('refuse plan invalide', async () => {
    const env = userEnv();
    const tok = await userToken();
    const r = await handlePremiumRequest(makeReq('POST', '/api/premium/request', { plan: 'unknown' }, tok), env);
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.message).toMatch(/Plan invalide/i);
  });

  it('crée une demande pending + infos paiement @kdmc', async () => {
    const env = userEnv();
    const tok = await userToken();
    const r = await handlePremiumRequest(makeReq('POST', '/api/premium/request', { plan: 'monthly' }, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.pending).toBe(true);
    expect(j.plan).toBe('monthly');
    expect(j.price_eur).toBe(6.99);
    expect(j.pay.paypal).toBe('https://paypal.me/kdmc/6.99');
    expect(j.pay.revolut).toBe('https://revolut.me/kdmc');
    expect(j.pay.iban_holder).toBe('Kevin DESARZENS');
  });

  it('persiste la demande dans KV (premium_req:<user_id>)', async () => {
    const env = userEnv();
    const tok = await userToken();
    await handlePremiumRequest(makeReq('POST', '/api/premium/request', { plan: 'yearly' }, tok), env);
    const stored = await env.APEX_CHAT_KV.get('premium_req:user_test');
    expect(stored).toBeTruthy();
    const rec = JSON.parse(stored);
    expect(rec.user_id).toBe('user_test');
    expect(rec.plan).toBe('yearly');
    expect(rec.price_eur).toBe(69.99);
    expect(rec.status).toBe('pending');
    expect(rec.method).toBe('kdmc');
  });

  it('fail-open : KV indispo → demande quand même acceptée', async () => {
    const env = userEnv();
    env.APEX_CHAT_KV = undefined;
    const tok = await userToken();
    const r = await handlePremiumRequest(makeReq('POST', '/api/premium/request', { plan: 'lifetime' }, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.price_eur).toBe(199);
  });

  it('semi-auto : PUSH admin avec action 1-tap grant_premium + tous les renseignements', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => (/from users/i.test(sql) ? { pseudo: 'sandrine', real_name: 'Sandrine TARDIEU' } : { is_admin: 0 }),
      all: async () => (/push_subscriptions/i.test(sql)
        ? { results: [{ endpoint: 'https://push.example/x', vapid_p256dh: 'p', vapid_auth: 'a' }] }
        : { results: [] }),
      run: async () => ({ success: true }),
    }));
    let pushBody = null;
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('/web-push')) pushBody = JSON.parse(opts.body);
      return new Response('{}', { status: 200 });
    });
    const tok = await userToken();
    const r = await handlePremiumRequest(makeReq('POST', '/api/premium/request', { plan: 'monthly' }, tok), env);
    expect(r.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(pushBody).toBeTruthy();
    const p = pushBody.payload; /* sendPushToUser envoie { subscription, payload } */
    expect(p.title).toContain('Premium');
    expect(p.payload.type).toBe('premium_request');
    expect(p.payload.user_id).toBe('user_test');
    expect(p.payload.plan).toBe('monthly');
    expect(p.actions.some((a) => a.action === 'grant_premium')).toBe(true);
    /* tous les renseignements (qui + prix) dans le corps */
    expect(p.body).toContain('Sandrine');
    expect(p.body).toContain('6.99');
  });
});

describe('handleAdminGrantPremium (v1.1.208)', () => {
  it('refuse non-auth', async () => {
    const r = await handleAdminGrantPremium(makeReq('POST', '/api/admin/grant-premium', { user_id: 'u1', plan: 'monthly' }), userEnv());
    expect(r.status).toBe(401);
  });

  it('refuse non-admin → 403', async () => {
    const env = userEnv(); // userToken n'a pas is_admin
    const tok = await userToken();
    const r = await handleAdminGrantPremium(makeReq('POST', '/api/admin/grant-premium', { user_id: 'u1', plan: 'monthly' }, tok), env);
    expect(r.status).toBe(403);
    const j = await r.json();
    expect(j.message).toMatch(/Admin/i);
  });

  it('admin → active premium_until futur + plan', async () => {
    const env = userEnv();
    let updateSql = '', updateArgs = null;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function (...args) {
        if (sql.includes('UPDATE users SET premium_until')) { updateSql = sql; updateArgs = args; }
        return this;
      },
      first: async () => ({ is_admin: 1, status: 'active', is_banned: 0 }),
      run: async () => ({ success: true }),
    }));
    const tok = await makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const r = await handleAdminGrantPremium(makeReq('POST', '/api/admin/grant-premium', { user_id: 'u_target', plan: 'monthly' }, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.user_id).toBe('u_target');
    expect(j.plan).toBe('monthly');
    expect(j.premium_until).toBeGreaterThan(Date.now());
    expect(updateSql).toContain('UPDATE users SET premium_until');
    expect(updateArgs[2]).toBe('u_target'); // WHERE id=?
  });

  it('admin + lifetime → premium_until quasi-infini', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 1, status: 'active', is_banned: 0 }),
      run: async () => ({ success: true }),
    }));
    const tok = await makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const r = await handleAdminGrantPremium(makeReq('POST', '/api/admin/grant-premium', { user_id: 'u2', plan: 'lifetime' }, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium_until).toBe(9999999999000);
  });

  it('admin → refuse user_id manquant', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 1, status: 'active', is_banned: 0 }),
      run: async () => ({ success: true }),
    }));
    const tok = await makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const r = await handleAdminGrantPremium(makeReq('POST', '/api/admin/grant-premium', { plan: 'monthly' }, tok), env);
    expect(r.status).toBe(400);
  });

  it('admin → refuse plan invalide', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 1, status: 'active', is_banned: 0 }),
      run: async () => ({ success: true }),
    }));
    const tok = await makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const r = await handleAdminGrantPremium(makeReq('POST', '/api/admin/grant-premium', { user_id: 'u1', plan: 'bogus' }, tok), env);
    expect(r.status).toBe(400);
  });
});

describe('handleAdminPremiumRequests (v1.1.208)', () => {
  it('refuse non-admin → 403', async () => {
    const env = userEnv();
    const tok = await userToken();
    const r = await handleAdminPremiumRequests(makeReq('GET', '/api/admin/premium-requests', undefined, tok), env);
    expect(r.status).toBe(403);
  });

  it('admin → liste les demandes pending depuis KV', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 1, status: 'active', is_banned: 0 }),
      run: async () => ({ success: true }),
    }));
    await env.APEX_CHAT_KV.put('premium_req:u1', JSON.stringify({ user_id: 'u1', plan: 'monthly', price_eur: 6.99, ts: 1000, status: 'pending' }));
    await env.APEX_CHAT_KV.put('premium_req:u2', JSON.stringify({ user_id: 'u2', plan: 'yearly', price_eur: 69.99, ts: 2000, status: 'pending' }));
    const tok = await makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const r = await handleAdminPremiumRequests(makeReq('GET', '/api/admin/premium-requests', undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.count).toBe(2);
    // Tri par ts desc → u2 d'abord
    expect(j.requests[0].user_id).toBe('u2');
  });
});

describe('Non-premium reste limité tant qu\'admin n\'a pas activé (v1.1.208)', () => {
  it('user sans premium_until → status premium false', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: null, premium_plan: null }),
    }));
    const tok = await userToken();
    const r = await handlePremiumStatus(makeReq('GET', '/api/premium/status', undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium).toBe(false);
  });

  it('après activation admin (premium_until futur) → status premium true', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: Date.now() + 31 * 86400 * 1000, premium_plan: 'monthly' }),
    }));
    const tok = await userToken();
    const r = await handlePremiumStatus(makeReq('GET', '/api/premium/status', undefined, tok), env);
    const j = await r.json();
    expect(j.premium).toBe(true);
    expect(j.plan).toBe('monthly');
  });
});

describe('handleAiSmartReply (v1.1.26)', () => {
  it('refuse non-auth', async () => {
    const r = await handleAiSmartReply(makeReq('POST', '/api/ai/smart-reply'), userEnv());
    expect(r.status).toBe(401);
  });

  it('refuse last_message vide', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiSmartReply(makeReq('POST', '/api/ai/smart-reply', { last_message: '' }, tok), env);
    expect(r.status).toBe(400);
  });

  it('refuse last_message > 2000 chars', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiSmartReply(
      makeReq('POST', '/api/ai/smart-reply', { last_message: 'x'.repeat(2500) }, tok),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('IA Anthropic retourne JSON valide → 3 replies', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ text: '{"replies":["Bien sûr !","D\'accord","Je dois voir"]}' }],
      })),
    );
    const tok = await userToken();
    const r = await handleAiSmartReply(
      makeReq('POST', '/api/ai/smart-reply', { last_message: 'Tu viens samedi ?' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.replies).toHaveLength(3);
    expect(j.replies[0]).toBe('Bien sûr !');
  });

  it('IA retourne markdown code block → parse robuste', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ text: '```json\n{"replies":["Oui","Non","Peut-être"]}\n```' }],
      })),
    );
    const tok = await userToken();
    const r = await handleAiSmartReply(
      makeReq('POST', '/api/ai/smart-reply', { last_message: 'Ça te va ?' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.replies).toHaveLength(3);
  });

  it('IA réponse non-JSON → failover Groq', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k1', GROQ_API_KEY: 'k2' });
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('anthropic')) {
        return new Response(JSON.stringify({ content: [{ text: 'pas du JSON' }] }));
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"replies":["G1","G2","G3"]}' } }],
      }));
    });
    const tok = await userToken();
    const r = await handleAiSmartReply(
      makeReq('POST', '/api/ai/smart-reply', { last_message: 'hello' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.provider).toBe('groq');
  });

  it('cap à 3 replies (si IA en retourne plus)', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ text: '{"replies":["A","B","C","D","E"]}' }],
      })),
    );
    const tok = await userToken();
    const r = await handleAiSmartReply(
      makeReq('POST', '/api/ai/smart-reply', { last_message: 'hello' }, tok),
      env,
    );
    const j = await r.json();
    expect(j.replies).toHaveLength(3);
  });
});

describe('handleAiTranslate (v1.1.26)', () => {
  it('refuse non-auth', async () => {
    const r = await handleAiTranslate(makeReq('POST', '/api/ai/translate'), userEnv());
    expect(r.status).toBe(401);
  });

  it('refuse text vide', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiTranslate(makeReq('POST', '/api/ai/translate', { text: '' }, tok), env);
    expect(r.status).toBe(400);
  });

  it('refuse text > 5000 chars', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiTranslate(
      makeReq('POST', '/api/ai/translate', { text: 'x'.repeat(6000) }, tok),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('Anthropic → retourne traduction', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ text: 'Bonjour le monde' }],
      })),
    );
    const tok = await userToken();
    const r = await handleAiTranslate(
      makeReq('POST', '/api/ai/translate', { text: 'Hello world', target_lang: 'fr' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.translated).toBe('Bonjour le monde');
    expect(j.target_lang).toBe('fr');
    expect(j.provider).toBe('anthropic');
  });

  it('failover providers si Anthropic vide', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k1', GROQ_API_KEY: 'k2' });
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('anthropic')) {
        return new Response(JSON.stringify({ content: [{ text: '' }] }));
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Hola mundo' } }],
      }));
    });
    const tok = await userToken();
    const r = await handleAiTranslate(
      makeReq('POST', '/api/ai/translate', { text: 'Bonjour', target_lang: 'es' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.translated).toBe('Hola mundo');
    expect(j.provider).toBe('groq');
  });

  it('aucun provider → 503', async () => {
    const env = userEnv();
    delete env.ANTHROPIC_API_KEY;
    delete env.GROQ_API_KEY;
    delete env.GEMINI_API_KEY;
    const tok = await userToken();
    const r = await handleAiTranslate(
      makeReq('POST', '/api/ai/translate', { text: 'hello' }, tok),
      env,
    );
    expect(r.status).toBe(503);
  });

  it('target_lang clamp à 5 chars', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    let capturedSysPrompt = '';
    globalThis.fetch = vi.fn(async (_, opts) => {
      const body = JSON.parse(opts.body);
      // system can be string OR array (Anthropic prompt caching format)
      const sys = body.system;
      capturedSysPrompt = Array.isArray(sys) ? sys[0]?.text : sys;
      return new Response(JSON.stringify({ content: [{ text: 'OK' }] }));
    });
    const tok = await userToken();
    await handleAiTranslate(
      makeReq('POST', '/api/ai/translate', { text: 'hi', target_lang: 'verylonglangcode' }, tok),
      env,
    );
    /* slice(0,5) → "veryl" (5 chars max) */
    expect(capturedSysPrompt).toContain('veryl');
    expect(capturedSysPrompt).not.toContain('verylonglangcode');
  });
});

describe('handleAiVoiceTranscribe (v1.1.28)', () => {
  function makeMultipartReq(audioBlob, filename, token) {
    const form = new FormData();
    form.append('audio', audioBlob, filename);
    const req = new Request('https://api.apex/api/ai/voice-transcribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form,
    });
    return req;
  }

  it('refuse non-auth', async () => {
    const req = new Request('https://api.apex/api/ai/voice-transcribe', { method: 'POST' });
    const r = await handleAiVoiceTranscribe(req, userEnv());
    expect(r.status).toBe(401);
  });

  it('refuse sans GROQ_API_KEY', async () => {
    const env = userEnv();
    delete env.GROQ_API_KEY;
    const tok = await userToken();
    const blob = new Blob(['fake audio'], { type: 'audio/webm' });
    const r = await handleAiVoiceTranscribe(makeMultipartReq(blob, 'a.webm', tok), env);
    expect(r.status).toBe(503);
  });

  it('refuse content-type non supporté', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    const tok = await userToken();
    const req = new Request('https://api.apex/api/ai/voice-transcribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    const r = await handleAiVoiceTranscribe(req, env);
    expect(r.status).toBe(400);
  });

  it('refuse audio vide', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    const tok = await userToken();
    const blob = new Blob([], { type: 'audio/webm' });
    const r = await handleAiVoiceTranscribe(makeMultipartReq(blob, 'empty.webm', tok), env);
    expect(r.status).toBe(400);
  });

  // Délai élargi (10/09, happy-dom 20 + vitest 5) : le multipart de 26 Mo passe par le
  // Blob/FormData de happy-dom, ~14 s sous --coverage (5 s avant) → le test expirait en CI
  // (run 34527870783) alors qu'il est déterministe. On garde la VRAIE taille (c'est ce
  // que le worker refuse) et on donne le temps ; une régression rendrait toujours ≠ 400.
  it('refuse audio > 25 MB', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    const tok = await userToken();
    /* 26 MB fake buffer */
    const big = new Uint8Array(26 * 1024 * 1024);
    const blob = new Blob([big], { type: 'audio/webm' });
    const r = await handleAiVoiceTranscribe(makeMultipartReq(blob, 'big.webm', tok), env);
    expect(r.status).toBe(400);
  }, 60_000);

  it('audio binary direct (application/octet-stream)', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    const tok = await userToken();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: 'Bonjour à tous', language: 'fr', duration: 2.5 }), { status: 200 }),
    );
    const buf = new TextEncoder().encode('fake audio bytes here');
    const req = new Request('https://api.apex/api/ai/voice-transcribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'audio/webm' },
      body: buf,
    });
    const r = await handleAiVoiceTranscribe(req, env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.text).toBe('Bonjour à tous');
    expect(j.language).toBe('fr');
    expect(j.provider).toContain('whisper');
  });

  it('Groq Whisper success → text + language + duration', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: 'Hello world', language: 'en', duration: 1.2 }), { status: 200 }),
    );
    const tok = await userToken();
    const blob = new Blob(['x'.repeat(100)], { type: 'audio/webm' });
    const r = await handleAiVoiceTranscribe(makeMultipartReq(blob, 'h.webm', tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.text).toBe('Hello world');
    expect(j.language).toBe('en');
    expect(j.duration_s).toBe(1.2);
  });

  it('Whisper HTTP 500 → 502', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 }));
    const tok = await userToken();
    const blob = new Blob(['x'.repeat(100)], { type: 'audio/webm' });
    const r = await handleAiVoiceTranscribe(makeMultipartReq(blob, 'h.webm', tok), env);
    expect(r.status).toBe(502);
  });

  it('lang query param transmis à Whisper', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    let capturedForm = null;
    globalThis.fetch = vi.fn(async (_, opts) => {
      capturedForm = opts.body;
      return new Response(JSON.stringify({ text: 'OK' }));
    });
    const tok = await userToken();
    const form = new FormData();
    form.append('audio', new Blob(['x'.repeat(100)], { type: 'audio/webm' }), 'h.webm');
    const req = new Request('https://api.apex/api/ai/voice-transcribe?lang=fr', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok },
      body: form,
    });
    await handleAiVoiceTranscribe(req, env);
    /* FormData stringify n'expose pas keys facilement, mais on vérifie qu'on est passé par */
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('lang param invalide (non 2 chars) → ignoré', async () => {
    const env = userEnv({ GROQ_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ text: 'OK' })));
    const tok = await userToken();
    const form = new FormData();
    form.append('audio', new Blob(['x'.repeat(100)], { type: 'audio/webm' }), 'h.webm');
    const req = new Request('https://api.apex/api/ai/voice-transcribe?lang=french', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok },
      body: form,
    });
    const r = await handleAiVoiceTranscribe(req, env);
    expect(r.status).toBe(200); /* pas crash */
  });
});

describe('handleAiImageDescribe (v1.1.28)', () => {
  it('refuse non-auth', async () => {
    const r = await handleAiImageDescribe(makeReq('POST', '/api/ai/image-describe'), userEnv());
    expect(r.status).toBe(401);
  });

  it('refuse sans ANTHROPIC_API_KEY', async () => {
    const env = userEnv();
    delete env.ANTHROPIC_API_KEY;
    const tok = await userToken();
    const r = await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', { image_base64: 'x'.repeat(200) }, tok),
      env,
    );
    expect(r.status).toBe(503);
  });

  it('refuse image_base64 vide ou trop court', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', { image_base64: 'x' }, tok),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('refuse image > 5 MB base64', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const huge = 'A'.repeat(6 * 1024 * 1024);
    const r = await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', { image_base64: huge }, tok),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('Anthropic Vision success → description', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ text: 'Une plage au coucher du soleil avec des palmiers.' }],
      }), { status: 200 }),
    );
    const tok = await userToken();
    const fakeB64 = 'A'.repeat(500);
    const r = await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', { image_base64: fakeB64 }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.description).toContain('plage');
    expect(j.provider).toContain('vision');
  });

  it('détecte media_type depuis data: prefix', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (_, opts) => {
      capturedBody = opts.body;
      return new Response(JSON.stringify({ content: [{ text: 'PNG image' }] }));
    });
    const tok = await userToken();
    const b64WithPrefix = 'data:image/png;base64,' + 'A'.repeat(500);
    await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', { image_base64: b64WithPrefix }, tok),
      env,
    );
    expect(capturedBody).toContain('"media_type":"image/png"');
    /* Le prefix data:image doit être strippé */
    expect(capturedBody).not.toContain('data:image/png;base64,');
  });

  it('custom prompt utilisé', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (_, opts) => {
      capturedBody = opts.body;
      return new Response(JSON.stringify({ content: [{ text: 'OK' }] }));
    });
    const tok = await userToken();
    await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', {
        image_base64: 'A'.repeat(500),
        prompt: 'Quel est le texte visible dans cette photo ?',
      }, tok),
      env,
    );
    expect(capturedBody).toContain('texte visible');
  });

  it('Anthropic HTTP 400 → 502', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 400 }));
    const tok = await userToken();
    const r = await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', { image_base64: 'A'.repeat(500) }, tok),
      env,
    );
    expect(r.status).toBe(502);
  });
});

describe('handlePremiumStatus', () => {
  it('refuse non-auth', async () => {
    const r = await handlePremiumStatus(makeReq('GET', '/api/premium/status'), userEnv());
    expect(r.status).toBe(401);
  });

  it('user inconnu → premium false', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => null,
    }));
    const tok = await userToken();
    const r = await handlePremiumStatus(makeReq('GET', '/api/premium/status', undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium).toBe(false);
  });

  it('user avec premium_until futur → premium true', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: Date.now() + 30 * 86400 * 1000, premium_plan: 'monthly' }),
    }));
    const tok = await userToken();
    const r = await handlePremiumStatus(makeReq('GET', '/api/premium/status', undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium).toBe(true);
    expect(j.plan).toBe('monthly');
    expect(j.lifetime).toBe(false);
  });

  it('user avec lifetime → premium true + lifetime true', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: 9999999999000, premium_plan: 'lifetime' }),
    }));
    const tok = await userToken();
    const r = await handlePremiumStatus(makeReq('GET', '/api/premium/status', undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium).toBe(true);
    expect(j.lifetime).toBe(true);
  });

  it('user avec premium_until passé → premium false', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: Date.now() - 86400 * 1000, premium_plan: 'monthly' }),
    }));
    const tok = await userToken();
    const r = await handlePremiumStatus(makeReq('GET', '/api/premium/status', undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium).toBe(false);
  });
});

// ============================================================================
//  v1.1.30 — Premium quota daily middleware tests
//  Vérifie : non-premium = limite/jour, premium = illimité, KV increment, 429
// ============================================================================
describe('Premium quota middleware (v1.1.30)', () => {
  function mkUserWithPremium(env, isPremium, plan = 'monthly') {
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({
        is_admin: 0, status: 'active', is_banned: 0,
        premium_until: isPremium ? Date.now() + 86400_000 : 0,
        premium_plan: isPremium ? plan : null,
      }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
  }

  it('non-premium user : quota 5/jour voice-transcribe → 429 au 6e', async () => {
    const env = userEnv();
    mkUserWithPremium(env, false);
    // Pré-remplit KV à la limite (5/5)
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:voice-transcribe:${today}`, '5');
    const tok = await userToken();
    const fd = new FormData();
    fd.append('audio', new File([new Uint8Array(1000)], 'a.webm', { type: 'audio/webm' }));
    const req = new Request('https://api.apex/api/ai/voice-transcribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok },
      body: fd,
    });
    const r = await handleAiVoiceTranscribe(req, env);
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.error).toBe('quota_exceeded');
    expect(j.limit).toBe(5);
    expect(j.feature).toBe('voice-transcribe');
  });

  it('premium user : pas de check quota, fetch Groq direct', async () => {
    const env = userEnv();
    mkUserWithPremium(env, true);
    // Même si quota préfill 100 → ignoré pour premium
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:voice-transcribe:${today}`, '100');
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ text: 'Bonjour Apex', language: 'fr', duration: 1.5 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    const tok = await userToken();
    const fd = new FormData();
    fd.append('audio', new File([new Uint8Array(1000)], 'a.webm', { type: 'audio/webm' }));
    const req = new Request('https://api.apex/api/ai/voice-transcribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok },
      body: fd,
    });
    const r = await handleAiVoiceTranscribe(req, env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.premium).toBe(true);
  });

  it('non-premium : 1er appel → 200 + KV incrémenté à 1', async () => {
    const env = userEnv();
    mkUserWithPremium(env, false);
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ text: 'OK', language: 'fr' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    const tok = await userToken();
    const fd = new FormData();
    fd.append('audio', new File([new Uint8Array(1000)], 'a.webm', { type: 'audio/webm' }));
    const req = new Request('https://api.apex/api/ai/voice-transcribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok },
      body: fd,
    });
    const r = await handleAiVoiceTranscribe(req, env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium).toBe(false);
    const today = new Date().toISOString().slice(0, 10);
    const stored = await env.APEX_CHAT_KV.get(`quota:user_test:voice-transcribe:${today}`);
    expect(stored).toBe('1');
  });

  it('non-premium : image-describe quota 10/jour', async () => {
    const env = userEnv();
    mkUserWithPremium(env, false);
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:image-describe:${today}`, '10');
    const tok = await userToken();
    const r = await handleAiImageDescribe(
      makeReq('POST', '/api/ai/image-describe', { image_base64: 'a'.repeat(200) }, tok),
      env,
    );
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.feature).toBe('image-describe');
    expect(j.limit).toBe(10);
  });

  it('non-premium : summarize quota 3/jour', async () => {
    const env = userEnv();
    mkUserWithPremium(env, false);
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:summarize:${today}`, '3');
    const tok = await userToken();
    const r = await handleAiSummarize(
      makeReq('POST', '/api/ai/summarize', { prompt: 'résume ceci stp longtemps' }, tok),
      env,
    );
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.feature).toBe('summarize');
    expect(j.limit).toBe(3);
  });

  it('non-premium : smart-reply quota 30/jour', async () => {
    const env = userEnv();
    mkUserWithPremium(env, false);
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:smart-reply:${today}`, '30');
    const tok = await userToken();
    const r = await handleAiSmartReply(
      makeReq('POST', '/api/ai/smart-reply', { last_message: 'salut ça va ?' }, tok),
      env,
    );
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.feature).toBe('smart-reply');
  });

  it('non-premium : translate quota 20/jour', async () => {
    const env = userEnv();
    mkUserWithPremium(env, false);
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:translate:${today}`, '20');
    const tok = await userToken();
    const r = await handleAiTranslate(
      makeReq('POST', '/api/ai/translate', { text: 'hello', target_lang: 'fr' }, tok),
      env,
    );
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.feature).toBe('translate');
    expect(j.limit).toBe(20);
  });

  it('KV indisponible → fail-open (pas de blocage)', async () => {
    const env = userEnv();
    mkUserWithPremium(env, false);
    delete env.APEX_CHAT_KV; // simule absence binding
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ text: 'OK', language: 'fr' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    const tok = await userToken();
    const fd = new FormData();
    fd.append('audio', new File([new Uint8Array(1000)], 'a.webm', { type: 'audio/webm' }));
    const req = new Request('https://api.apex/api/ai/voice-transcribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok },
      body: fd,
    });
    const r = await handleAiVoiceTranscribe(req, env);
    // KV null → check_failed → fail open → 200 OK
    expect(r.status).toBe(200);
  });
});

// ============================================================================
//  v1.1.31 — handlePremiumQuota tests (GET /api/premium/quota)
// ============================================================================
describe("handlePremiumQuota (v1.1.31)", () => {
  it("refuse non-auth (401)", async () => {
    const r = await handlePremiumQuota(makeReq("GET", "/api/premium/quota"), userEnv());
    expect(r.status).toBe(401);
  });

  it("non-premium user : retourne usage 0/limit pour chaque feature", async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: 0, premium_plan: null }),
    }));
    const tok = await userToken();
    const r = await handlePremiumQuota(makeReq("GET", "/api/premium/quota", undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.premium).toBe(false);
    expect(j.usage["voice-transcribe"].limit).toBe(5);
    expect(j.usage["voice-transcribe"].used).toBe(0);
    expect(j.usage["voice-transcribe"].remaining).toBe(5);
    expect(j.usage["voice-transcribe"].unlimited).toBe(false);
    expect(j.usage["image-describe"].limit).toBe(10);
    expect(j.usage["summarize"].limit).toBe(3);
    expect(j.usage["smart-reply"].limit).toBe(30);
    expect(j.usage["translate"].limit).toBe(20);
  });

  it("non-premium user : usage incrémenté reflète KV", async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: 0, premium_plan: null }),
    }));
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:voice-transcribe:${today}`, "3");
    await env.APEX_CHAT_KV.put(`quota:user_test:translate:${today}`, "20");
    const tok = await userToken();
    const r = await handlePremiumQuota(makeReq("GET", "/api/premium/quota", undefined, tok), env);
    const j = await r.json();
    expect(j.usage["voice-transcribe"].used).toBe(3);
    expect(j.usage["voice-transcribe"].remaining).toBe(2);
    expect(j.usage["translate"].used).toBe(20);
    expect(j.usage["translate"].remaining).toBe(0);
  });

  it("premium user : unlimited:true sur tous", async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: Date.now() + 86400_000, premium_plan: "monthly" }),
    }));
    const tok = await userToken();
    const r = await handlePremiumQuota(makeReq("GET", "/api/premium/quota", undefined, tok), env);
    const j = await r.json();
    expect(j.premium).toBe(true);
    expect(j.plan).toBe("monthly");
    Object.values(j.usage).forEach(u => expect(u.unlimited).toBe(true));
  });

  it("KV indispo : usage remains 0 (pas crash)", async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: 0 }),
    }));
    delete env.APEX_CHAT_KV;
    const tok = await userToken();
    const r = await handlePremiumQuota(makeReq("GET", "/api/premium/quota", undefined, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.usage["voice-transcribe"].used).toBe(0);
  });
});

// ============================================================================
//  v1.1.41 — handleAiRewrite tests (8 styles, share translate quota)
// ============================================================================
describe('handleAiRewrite (v1.1.41)', () => {
  it('refuse non-auth (401)', async () => {
    const r = await handleAiRewrite(makeReq('POST', '/api/ai/rewrite', { text: 'hello' }), userEnv());
    expect(r.status).toBe(401);
  });

  it('refuse text vide', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiRewrite(makeReq('POST', '/api/ai/rewrite', { text: 'a' }, tok), env);
    expect(r.status).toBe(400);
  });

  it('refuse text > 2000 chars', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    const tok = await userToken();
    const r = await handleAiRewrite(
      makeReq('POST', '/api/ai/rewrite', { text: 'a'.repeat(3000), style: 'friendly' }, tok),
      env,
    );
    expect(r.status).toBe(400);
  });

  it('Anthropic success retourne rewritten + style', async () => {
    const env = userEnv({ ANTHROPIC_API_KEY: 'k' });
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: Date.now() + 86400_000, premium_plan: 'monthly' }),
    }));
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ content: [{ text: 'Bonjour, ravi de te rencontrer 🙏' }] }),
      { status: 200 }
    ));
    const tok = await userToken();
    const r = await handleAiRewrite(
      makeReq('POST', '/api/ai/rewrite', { text: 'salut', style: 'formal' }, tok),
      env,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.rewritten).toMatch(/Bonjour/);
    expect(j.style).toBe('formal');
    expect(j.original).toBe('salut');
    expect(j.premium).toBe(true);
  });

  it('quota dépassé → 429', async () => {
    const env = userEnv();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ premium_until: 0 }),
    }));
    const today = new Date().toISOString().slice(0, 10);
    await env.APEX_CHAT_KV.put(`quota:user_test:translate:${today}`, '20');
    const tok = await userToken();
    const r = await handleAiRewrite(
      makeReq('POST', '/api/ai/rewrite', { text: 'bonjour comment vas-tu' }, tok),
      env,
    );
    expect(r.status).toBe(429);
  });
});
