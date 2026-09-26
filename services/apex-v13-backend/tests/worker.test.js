/**
 * Tests Worker apex-v13-backend (Jet 7 fix audit "0 tests endpoints").
 * Mock KV, fetch (Anthropic), signature Stripe, counter WebAuthn.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/index.js';

/* === Mock KV namespace === */
function createMockKV() {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value, opts = {}) {
      store.set(key, value);
      /* TTL : clamp à MAX_INT32 ms (Node setTimeout > 2^31-1 wrap → exécute immédiat).
       * Pour tests, on simule juste sans vraiment expirer (suffisant pour valider logique). */
      if (opts.expirationTtl && opts.expirationTtl < 2_000_000) {
        setTimeout(() => store.delete(key), opts.expirationTtl * 1000);
      }
    },
    async delete(key) {
      store.delete(key);
    },
    _store: store,
  };
}

function createEnv() {
  return {
    IDEMPOTENCY: createMockKV(),
    RATE_LIMIT: createMockKV(),
    WEBAUTHN: createMockKV(),
    SESSIONS: createMockKV(),
    STRIPE_EVENTS: createMockKV(),
    ESCALATIONS: createMockKV(),
    USER_PLANS: createMockKV(),
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_1234567890',
    ANTHROPIC_KEY: 'sk-ant-api03-test-fake',
  };
}

function makeRequest(path, opts = {}) {
  const url = `https://apex-v13-backend.test.workers.dev${path}`;
  /* En happy-dom env, le header Origin natif est filtré pour sécurité.
   * On utilise une URL incluant 'localhost' pour passer la condition origin.includes('localhost'). */
  const customHeaders = { ...opts.headers };
  if (!customHeaders['Origin'] && !customHeaders['origin']) {
    customHeaders['Origin'] = 'http://localhost:4173';
  }
  if (!customHeaders['CF-Connecting-IP']) {
    customHeaders['CF-Connecting-IP'] = '127.0.0.1';
  }
  if (opts.body !== undefined && !customHeaders['Content-Type']) {
    customHeaders['Content-Type'] = 'application/json';
  }
  return new Request(url, {
    method: opts.method ?? 'POST',
    headers: customHeaders,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

describe('apex-v13-backend Worker (Jet 7 tests)', () => {
  let env;
  beforeEach(() => {
    env = createEnv();
    vi.restoreAllMocks();
  });

  describe('CORS + Rate-limit', () => {
    it('OPTIONS preflight retourne 204 + headers CORS', async () => {
      const req = makeRequest('/health', { method: 'OPTIONS' });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });

    it('Origin non whitelisted retourne 403', async () => {
      const req = makeRequest('/health', { method: 'GET', headers: { Origin: 'https://evil.com' } });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });

    it('Rate-limit déclenche 429 après 100 req', async () => {
      for (let i = 0; i < 100; i++) {
        await worker.fetch(makeRequest('/health', { method: 'GET' }), env, {});
      }
      const res = await worker.fetch(makeRequest('/health', { method: 'GET' }), env, {});
      expect(res.status).toBe(429);
    });
  });

  describe('/health', () => {
    it('retourne ok=true + version', async () => {
      const req = makeRequest('/health', { method: 'GET' });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.ver).toBe('v13.0.0');
    });
  });

  describe('/idempotency/check', () => {
    it('skip=false la première fois', async () => {
      const req = makeRequest('/idempotency/check', { body: { hash: 'first_hash_12345' } });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.skip).toBe(false);
    });

    it('skip=true sur deuxième appel même hash (60s window)', async () => {
      await worker.fetch(makeRequest('/idempotency/check', { body: { hash: 'replay_hash' } }), env, {});
      const res = await worker.fetch(makeRequest('/idempotency/check', { body: { hash: 'replay_hash' } }), env, {});
      const data = await res.json();
      expect(data.skip).toBe(true);
      expect(data.seenAt).toBeGreaterThan(0);
    });

    it('refuse hash trop court (< 8 chars)', async () => {
      const req = makeRequest('/idempotency/check', { body: { hash: 'short' } });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });

    it('refuse sans hash', async () => {
      const req = makeRequest('/idempotency/check', { body: {} });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });
  });

  describe('/webauthn/register', () => {
    it('stocke credential dans KV', async () => {
      const req = makeRequest('/webauthn/register', {
        body: { uid: 'kdmc_admin', credentialId: 'cred_b64', publicKey: 'pubkey_b64' },
      });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.uid).toBe('kdmc_admin');
      const stored = await env.WEBAUTHN.get('u:kdmc_admin');
      expect(stored).toBeTruthy();
    });

    it('refuse sans uid/credentialId/publicKey', async () => {
      const req = makeRequest('/webauthn/register', { body: { uid: 'a' } });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });
  });

  describe('/webauthn/verify', () => {
    beforeEach(async () => {
      await env.WEBAUTHN.put('u:test_uid', JSON.stringify({
        credentialId: 'cred_test',
        publicKey: 'pk_test',
        counter: 5,
        registeredAt: Date.now(),
      }));
    });

    it('verify OK avec counter incrément', async () => {
      const req = makeRequest('/webauthn/verify', {
        body: { uid: 'test_uid', credentialId: 'cred_test', counter: 6 },
      });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.verified).toBe(true);
    });

    it('REPLAY ATTACK : refuse counter ≤ stored', async () => {
      const req = makeRequest('/webauthn/verify', {
        body: { uid: 'test_uid', credentialId: 'cred_test', counter: 5 },
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.detail || data.error).toBeTruthy();
    });

    it('refuse credentialId mismatch', async () => {
      const req = makeRequest('/webauthn/verify', {
        body: { uid: 'test_uid', credentialId: 'wrong_cred', counter: 99 },
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(401);
    });

    it('404 si uid inconnu', async () => {
      const req = makeRequest('/webauthn/verify', {
        body: { uid: 'unknown_uid', credentialId: 'x' },
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(404);
    });
  });

  describe('/stripe/webhook', () => {
    async function signPayload(payload, secret) {
      const ts = Math.floor(Date.now() / 1000);
      const data = `${ts}.${payload}`;
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
      const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `t=${ts},v1=${sigHex}`;
    }

    it('refuse sans signature', async () => {
      const req = makeRequest('/stripe/webhook', { body: { type: 'test' } });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });

    it('refuse signature invalide', async () => {
      const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
      const req = new Request('https://test/stripe/webhook', {
        method: 'POST',
        headers: {
          'Origin': 'https://9r4rxssx64-creator.github.io',
          'CF-Connecting-IP': '127.0.0.1',
          'Content-Type': 'application/json',
          'Stripe-Signature': 't=1234,v1=fake_sig_invalid',
        },
        body: payload,
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(401);
    });

    it('accepte signature valide HMAC', async () => {
      const payload = JSON.stringify({ id: 'evt_valid_test', type: 'checkout.session.completed' });
      const sig = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET);
      const req = new Request('https://test/stripe/webhook', {
        method: 'POST',
        headers: {
          'Origin': 'https://9r4rxssx64-creator.github.io',
          'CF-Connecting-IP': '127.0.0.1',
          'Content-Type': 'application/json',
          'Stripe-Signature': sig,
        },
        body: payload,
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
    });
  });

  describe('/auth/verify', () => {
    it('refuse sans Bearer token', async () => {
      const req = makeRequest('/auth/verify', { method: 'GET' });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(401);
    });

    it('valide token actif', async () => {
      await env.SESSIONS.put('t:valid_token_123', JSON.stringify({
        uid: 'kdmc_admin',
        isAdmin: true,
        expiresAt: Date.now() + 3600 * 1000,
      }));
      const req = makeRequest('/auth/verify', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid_token_123' },
      });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.uid).toBe('kdmc_admin');
      expect(data.isAdmin).toBe(true);
    });

    it('refuse token expiré', async () => {
      await env.SESSIONS.put('t:expired', JSON.stringify({
        uid: 'u', isAdmin: false, expiresAt: Date.now() - 1000,
      }));
      const req = makeRequest('/auth/verify', {
        method: 'GET',
        headers: { Authorization: 'Bearer expired' },
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(401);
    });

    it('refuse token inconnu', async () => {
      const req = makeRequest('/auth/verify', {
        method: 'GET',
        headers: { Authorization: 'Bearer ghost_token' },
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(401);
    });
  });

  describe('/escalate', () => {
    it('persiste event critical avec id', async () => {
      const req = makeRequest('/escalate', {
        body: { reason: 'test escalation', severity: 'critical', context: { foo: 'bar' } },
      });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.id).toMatch(/^esc_/);
    });

    it('refuse sans reason ou severity', async () => {
      const req = makeRequest('/escalate', { body: { reason: 'test' } });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });
  });

  describe('/ai/judge', () => {
    it('refuse sans 3 paramètres', async () => {
      const req = makeRequest('/ai/judge', { body: { promptOriginal: 'x' } });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });

    it('appelle Anthropic API + retourne verdict', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: '{"consistent": true, "confidence": 0.9, "reason": "same fact"}' }],
        }), { status: 200 }),
      );
      const req = makeRequest('/ai/judge', {
        body: {
          promptOriginal: 'Capitale France ?',
          responseA: 'Paris',
          responseB: 'C est Paris',
        },
      });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.consistent).toBe(true);
      expect(data.method).toBe('llm_judge_haiku');
      fetchSpy.mockRestore();
    });

    it('503 si ANTHROPIC_KEY absent', async () => {
      const envNoKey = { ...env, ANTHROPIC_KEY: undefined };
      const req = makeRequest('/ai/judge', {
        body: { promptOriginal: 'a', responseA: 'b', responseB: 'c' },
      });
      const res = await worker.fetch(req, envNoKey, {});
      expect(res.status).toBe(503);
    });
  });

  describe('Endpoints inconnus', () => {
    it('404 sur path non routé', async () => {
      const req = makeRequest('/inexistant', { method: 'GET' });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(404);
    });
  });

  describe('/plan/get + Stripe metier (Jet 7)', () => {
    it('retourne plan free par defaut si jamais set', async () => {
      const req = makeRequest('/plan/get?uid=u_new', { method: 'GET' });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.plan).toBe('free');
      expect(data.source).toBe('default');
    });

    it('retourne plan stocke apres webhook checkout.session.completed', async () => {
      await env.USER_PLANS.put('p:u_paid', JSON.stringify({
        plan: 'pro',
        stripeCustomerId: 'cus_x',
        activatedAt: Date.now(),
      }));
      const req = makeRequest('/plan/get?uid=u_paid', { method: 'GET' });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      expect(data.plan).toBe('pro');
      expect(data.source).toBe('stripe_synced');
    });

    it('refuse sans uid query', async () => {
      const req = makeRequest('/plan/get', { method: 'GET' });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });
  });

  describe('Stripe webhook logique metier (Jet 7)', () => {
    async function signPayload(payload, secret) {
      const ts = Math.floor(Date.now() / 1000);
      const data = `${ts}.${payload}`;
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
      const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `t=${ts},v1=${sigHex}`;
    }

    async function postWebhook(eventBody) {
      const payload = JSON.stringify(eventBody);
      const sig = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET);
      return new Request('https://test/stripe/webhook', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:4173',
          'CF-Connecting-IP': '127.0.0.1',
          'Content-Type': 'application/json',
          'Stripe-Signature': sig,
        },
        body: payload,
      });
    }

    it('checkout.session.completed met a jour USER_PLANS', async () => {
      const event = {
        id: 'evt_co_1',
        type: 'checkout.session.completed',
        data: { object: {
          client_reference_id: 'u_purchase',
          customer: 'cus_x',
          subscription: 'sub_y',
          metadata: { plan: 'pro' },
        }},
      };
      const res = await worker.fetch(await postWebhook(event), env, {});
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.processed).toContain('upgrade_pro_u_purchase');
      const stored = JSON.parse(await env.USER_PLANS.get('p:u_purchase'));
      expect(stored.plan).toBe('pro');
    });

    it('customer.subscription.deleted downgrade plan free', async () => {
      await env.USER_PLANS.put('p:u_cancel', JSON.stringify({ plan: 'pro' }));
      const event = {
        id: 'evt_cancel_1',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_cancelled', metadata: { uid: 'u_cancel' } } },
      };
      const res = await worker.fetch(await postWebhook(event), env, {});
      const data = await res.json();
      expect(data.processed).toContain('downgrade_u_cancel');
      const stored = JSON.parse(await env.USER_PLANS.get('p:u_cancel'));
      expect(stored.plan).toBe('free');
    });

    it('invoice.payment_failed escalade pour Kevin admin', async () => {
      const event = {
        id: 'evt_fail_1',
        type: 'invoice.payment_failed',
        data: { object: { id: 'in_fail', metadata: { uid: 'u_fail' }, amount_due: 2900 } },
      };
      const res = await worker.fetch(await postWebhook(event), env, {});
      const data = await res.json();
      expect(data.processed).toContain('payment_failed');
      const escalation = await env.ESCALATIONS.get('e:payment_failed_in_fail');
      expect(escalation).toBeTruthy();
    });

    it('charge.dispute.created escalade critical', async () => {
      const event = {
        id: 'evt_disp_1',
        type: 'charge.dispute.created',
        data: { object: { id: 'dp_x', amount: 5000, reason: 'fraudulent' } },
      };
      const res = await worker.fetch(await postWebhook(event), env, {});
      const data = await res.json();
      expect(data.processed).toContain('dispute_dp_x');
      const escalation = await env.ESCALATIONS.get('e:dispute_dp_x');
      expect(escalation).toBeTruthy();
    });

    it('IDEMPOTENCY (Jet 7 P0-2) : double POST même event.id ne charge qu\'une fois', async () => {
      const event = {
        id: 'evt_idempotent_1',
        type: 'checkout.session.completed',
        data: { object: { client_reference_id: 'u_idem', metadata: { plan: 'pro' } } },
      };
      const req1 = await postWebhook(event);
      const res1 = await worker.fetch(req1, env, {});
      const data1 = await res1.json();
      expect(data1.processed).toContain('upgrade_pro_u_idem');
      /* 2e POST même event.id (Stripe retry) → already_processed */
      const req2 = await postWebhook(event);
      const res2 = await worker.fetch(req2, env, {});
      const data2 = await res2.json();
      expect(res2.status).toBe(200); /* Stripe attend 200 sinon retry */
      expect(data2.processed).toBe('already_processed');
    });

    it('refuse webhook sans event.id', async () => {
      const event = { type: 'checkout.session.completed', data: { object: {} } };
      const res = await worker.fetch(await postWebhook(event), env, {});
      expect(res.status).toBe(400);
    });
  });
});

describe('Stripe edge cases (Jet 7.7)', () => {
  let env;
  beforeEach(() => {
    env = createEnv();
  });

  async function signPayload(payload, secret) {
    const ts = Math.floor(Date.now() / 1000);
    const data = `${ts}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${ts},v1=${sigHex}`;
  }

  it('refuse signature avec mauvais secret HMAC', async () => {
    const payload = JSON.stringify({ id: 'evt_wrong_secret', type: 'checkout.session.completed' });
    const sig = await signPayload(payload, 'wrong_secret');
    const req = new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': sig,
      },
      body: payload,
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it('refuse signature header malformé sans t= ou v1=', async () => {
    const req = new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': 'malformed_no_keys',
      },
      body: '{}',
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it('refuse webhook payload non-JSON', async () => {
    const sig = await signPayload('not_json_at_all', env.STRIPE_WEBHOOK_SECRET);
    const req = new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': sig,
      },
      body: 'not_json_at_all',
    });
    const res = await worker.fetch(req, env, {});
    /* JSON.parse throw → 500 ou 400 selon error path */
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('subscription.updated synchronise expiresAt + cancelAtPeriodEnd', async () => {
    await env.USER_PLANS.put('p:u_sub', JSON.stringify({ plan: 'pro' }));
    const futureTs = Math.floor(Date.now() / 1000) + 30 * 86400;
    const event = {
      id: 'evt_sub_update_1',
      type: 'customer.subscription.updated',
      data: { object: {
        id: 'sub_x',
        metadata: { uid: 'u_sub' },
        current_period_end: futureTs,
        cancel_at_period_end: true,
      }},
    };
    const payload = JSON.stringify(event);
    const sig = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET);
    const req = new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': sig,
      },
      body: payload,
    });
    const res = await worker.fetch(req, env, {});
    const data = await res.json();
    expect(data.processed).toContain('update_u_sub');
    const stored = JSON.parse(await env.USER_PLANS.get('p:u_sub'));
    expect(stored.cancelAtPeriodEnd).toBe(true);
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  it('event sans uid dans metadata fait skip silencieux', async () => {
    const event = {
      id: 'evt_no_uid_skip',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_no_uid', metadata: {} } },
    };
    const payload = JSON.stringify(event);
    const sig = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET);
    const req = new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': sig,
      },
      body: payload,
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200); /* webhook reçu */
    const data = await res.json();
    expect(data.received).toBe(true);
  });

  it('invoice.payment_failed sans uid metadata fait skip', async () => {
    const event = {
      id: 'evt_invoice_no_uid',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_no_uid', amount_due: 1000 } },
    };
    const payload = JSON.stringify(event);
    const sig = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET);
    const req = new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': sig,
      },
      body: payload,
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
  });

  it('event type inconnu fait skip silencieux (forward compat)', async () => {
    const event = {
      id: 'evt_unknown_type',
      type: 'random.future.event',
      data: { object: {} },
    };
    const payload = JSON.stringify(event);
    const sig = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET);
    const req = new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': sig,
      },
      body: payload,
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
    expect(data.processed).toBeNull();
  });
});

describe('Stripe audit trail RÉEL (Jet 7.8 anti-théâtre)', () => {
  let env;
  beforeEach(() => {
    env = createEnv();
  });

  async function signPayload(payload, secret) {
    const ts = Math.floor(Date.now() / 1000);
    const data = `${ts}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${ts},v1=${sigHex}`;
  }

  async function postWebhook(eventBody) {
    const payload = JSON.stringify(eventBody);
    const sig = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET);
    return new Request('https://test/stripe/webhook', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:4173',
        'CF-Connecting-IP': '127.0.0.1',
        'Content-Type': 'application/json',
        'Stripe-Signature': sig,
      },
      body: payload,
    });
  }

  it('TOUS events validés persistent dans STRIPE_EVENTS KV (audit trail)', async () => {
    const event = {
      id: 'evt_audit_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u_audit', metadata: { plan: 'pro' } } },
    };
    await worker.fetch(await postWebhook(event), env, {});
    /* Audit trail : event STOCKÉ (anti perte si traitement échoue) */
    const stored = await env.STRIPE_EVENTS.get('e:evt_audit_1');
    expect(stored).toBeTruthy();
    /* Original payload exact préservé pour replay/debug */
    expect(JSON.parse(stored).id).toBe('evt_audit_1');
  });

  it('event sans uid skip MAIS audit trail conservé (pas de perte)', async () => {
    const event = {
      id: 'evt_no_uid_audit',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_x', metadata: {} } },
    };
    await worker.fetch(await postWebhook(event), env, {});
    /* Skip silencieux mais event quand même persisté pour audit Kevin admin */
    const stored = await env.STRIPE_EVENTS.get('e:evt_no_uid_audit');
    expect(stored).toBeTruthy();
  });

  it('checkout.session.completed met USER_PLANS + audit trail (atomic)', async () => {
    const event = {
      id: 'evt_atomic_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u_atomic', metadata: { plan: 'pro' } } },
    };
    const res = await worker.fetch(await postWebhook(event), env, {});
    const data = await res.json();
    expect(data.processed).toContain('upgrade');
    /* Atomicité : event + plan tous les deux persistés */
    expect(await env.STRIPE_EVENTS.get('e:evt_atomic_1')).toBeTruthy();
    expect(await env.USER_PLANS.get('p:u_atomic')).toBeTruthy();
  });

  it('event type unknown skip + 200 (forward compat) MAIS audit trail OK', async () => {
    const event = {
      id: 'evt_future_type',
      type: 'random.future.event_2026',
      data: { object: { something: 'new' } },
    };
    const res = await worker.fetch(await postWebhook(event), env, {});
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.processed).toBeNull();
    /* Audit trail : event archivé même si pas traité (Kevin peut investiguer plus tard) */
    expect(await env.STRIPE_EVENTS.get('e:evt_future_type')).toBeTruthy();
  });

  it('IDEMPOTENCY : 2nd POST same event.id ne ré-ajoute PAS d\'escalation', async () => {
    /* invoice.payment_failed crée 1 escalation. 2nd POST → skip already_processed,
     * NE doit PAS créer 2e escalation (anti spam Kevin) */
    const event = {
      id: 'evt_no_double_escalate',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_no_dup', metadata: { uid: 'u_dup' }, amount_due: 1000 } },
    };
    await worker.fetch(await postWebhook(event), env, {});
    /* 1ère escalation */
    const esc1 = await env.ESCALATIONS.get('e:payment_failed_in_no_dup');
    expect(esc1).toBeTruthy();
    /* 2nd POST identique → skip */
    const res2 = await worker.fetch(await postWebhook(event), env, {});
    const data2 = await res2.json();
    expect(data2.processed).toBe('already_processed');
    /* Pas de 2e escalation key (toujours la même) */
    const esc2 = await env.ESCALATIONS.get('e:payment_failed_in_no_dup');
    expect(esc2).toBe(esc1); /* même contenu, pas écrasé */
  });
});
