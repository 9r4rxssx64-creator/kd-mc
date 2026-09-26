/**
 * Tests workers/sms-worker.js — Vonage SMS proxy (invite + OTP)
 * Target : 100% coverage v8 via mock fetch global.
 */
import { withOrigin } from './api-worker-helpers.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/sms-worker.js';

const ENV = {
  APEX_CHAT_ADMIN_TOKEN: 'admin-secret',
  VONAGE_API_KEY: 'vonage-key',
  VONAGE_API_SECRET: 'vonage-secret',
};

function makeRequest({ method = 'POST', path = '/sms/invite', headers = {}, body = {} } = {}) {
  return new Request('https://x.com' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('sms-worker — routing & CORS', () => {
  it('OPTIONS retourne CORS headers', async () => {
    // v1.1.287 (audit P2b) : plus de `*`. L'origine autorisée est renvoyée
    // telle quelle ; une origine inconnue n'obtient AUCUN en-tête CORS.
    const ok = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS' }), 'https://apex-chat.kd-mc.com'), ENV);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://apex-chat.kd-mc.com');
    expect(ok.headers.get('Vary')).toContain('Origin');
    const ko = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS' }), 'https://evil.example'), ENV);
    expect(ko.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /health → ok+version+provider', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/health' }), ENV);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.provider).toBe('vonage');
  });

  it('GET / → ok (alias health)', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/' }), ENV);
    expect((await r.json()).ok).toBe(true);
  });

  it('route inconnue → 404', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/unknown' }), ENV);
    expect(r.status).toBe(404);
  });

  it('exception non gérée → 500', async () => {
    // Force une erreur en créant request qui throw au .json()
    const badReq = new Request('https://x.com/sms/invite', {
      method: 'POST',
      headers: { 'X-Apex-Sms-Token': 'admin-secret', 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const r = await worker.fetch(badReq, ENV);
    expect(r.status).toBe(500);
  });
});

describe('sms-worker — POST /sms/invite', () => {
  it('sans X-Apex-Sms-Token → 401', async () => {
    const r = await worker.fetch(makeRequest({ body: { phone: '+33612345678' } }), ENV);
    expect(r.status).toBe(401);
  });

  it('mauvais token → 401', async () => {
    const r = await worker.fetch(
      makeRequest({ headers: { 'X-Apex-Sms-Token': 'wrong' }, body: { phone: '+33612345678' } }),
      ENV,
    );
    expect(r.status).toBe(401);
  });

  it('phone manquant → 400', async () => {
    const r = await worker.fetch(
      makeRequest({ headers: { 'X-Apex-Sms-Token': 'admin-secret' }, body: {} }),
      ENV,
    );
    expect(r.status).toBe(400);
    expect((await r.json()).message).toContain('phone required');
  });

  it('phone format invalide → 400', async () => {
    const r = await worker.fetch(
      makeRequest({ headers: { 'X-Apex-Sms-Token': 'admin-secret' }, body: { phone: 'abc' } }),
      ENV,
    );
    expect(r.status).toBe(400);
    expect((await r.json()).message).toContain('invalid format');
  });

  it('Vonage success → 200 + id', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ status: '0', 'message-id': 'msg-123', 'message-price': '0.0075' }] })),
    );
    const r = await worker.fetch(
      makeRequest({
        headers: { 'X-Apex-Sms-Token': 'admin-secret' },
        body: { phone: '+33612345678', code: 'ABC123', inviter_pseudo: 'Kevin' },
      }),
      ENV,
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.id).toBe('msg-123');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://rest.nexmo.com/sms/json',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Vonage success sans code/pseudo → utilise GENERIC + baseUrl par défaut', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ status: '0', 'message-id': 'mid' }] })),
    );
    const r = await worker.fetch(
      makeRequest({
        headers: { 'X-Apex-Sms-Token': 'admin-secret' },
        body: { phone: '+33612345678' },
      }),
      ENV,
    );
    expect(r.status).toBe(200);
    const call = globalThis.fetch.mock.calls[0];
    const body = call[1].body.toString();
    expect(body).toContain('GENERIC');
  });

  it('Vonage error status → 500', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ status: '4', 'error-text': 'invalid number' }] })),
    );
    const r = await worker.fetch(
      makeRequest({ headers: { 'X-Apex-Sms-Token': 'admin-secret' }, body: { phone: '+33612345678' } }),
      ENV,
    );
    expect(r.status).toBe(500);
    expect((await r.json()).message).toContain('invalid number');
  });

  it('Vonage error sans error-text → "unknown"', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ status: '99' }] })));
    const r = await worker.fetch(
      makeRequest({ headers: { 'X-Apex-Sms-Token': 'admin-secret' }, body: { phone: '+33612345678' } }),
      ENV,
    );
    expect(r.status).toBe(500);
    expect((await r.json()).message).toContain('unknown');
  });

  it('Vonage non configuré → 500 explicite', async () => {
    const ENV_NO_VONAGE = { APEX_CHAT_ADMIN_TOKEN: 'admin-secret' };
    const r = await worker.fetch(
      makeRequest({ headers: { 'X-Apex-Sms-Token': 'admin-secret' }, body: { phone: '+33612345678' } }),
      ENV_NO_VONAGE,
    );
    expect(r.status).toBe(500);
    expect((await r.json()).message).toContain('Vonage non configuré');
  });

  it('utilise baseUrl custom si fourni', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ status: '0', 'message-id': 'mid' }] })),
    );
    await worker.fetch(
      makeRequest({
        headers: { 'X-Apex-Sms-Token': 'admin-secret' },
        body: { phone: '+33612345678', code: 'XYZ', baseUrl: 'https://custom.com/' },
      }),
      ENV,
    );
    const body = globalThis.fetch.mock.calls[0][1].body.toString();
    expect(body).toContain('https%3A%2F%2Fcustom.com%2Fi%2FXYZ');
  });
});

describe('sms-worker — POST /sms/otp', () => {
  it('sans token → 401', async () => {
    const r = await worker.fetch(makeRequest({ path: '/sms/otp', body: { phone: '+33612345678', code: '1234' } }), ENV);
    expect(r.status).toBe(401);
  });

  it('phone ou code manquant → 400', async () => {
    const r1 = await worker.fetch(
      makeRequest({ path: '/sms/otp', headers: { 'X-Apex-Sms-Token': 'admin-secret' }, body: { phone: '+33612345678' } }),
      ENV,
    );
    expect(r1.status).toBe(400);
    const r2 = await worker.fetch(
      makeRequest({ path: '/sms/otp', headers: { 'X-Apex-Sms-Token': 'admin-secret' }, body: { code: '1234' } }),
      ENV,
    );
    expect(r2.status).toBe(400);
  });

  it('code format invalide → 400', async () => {
    const r = await worker.fetch(
      makeRequest({
        path: '/sms/otp',
        headers: { 'X-Apex-Sms-Token': 'admin-secret' },
        body: { phone: '+33612345678', code: 'abc' },
      }),
      ENV,
    );
    expect(r.status).toBe(400);
    expect((await r.json()).message).toContain('code invalid');
  });

  it('Vonage success → 200', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ status: '0', 'message-id': 'otp-mid' }] })),
    );
    const r = await worker.fetch(
      makeRequest({
        path: '/sms/otp',
        headers: { 'X-Apex-Sms-Token': 'admin-secret' },
        body: { phone: '+33612345678', code: '1234' },
      }),
      ENV,
    );
    expect(r.status).toBe(200);
    expect((await r.json()).id).toBe('otp-mid');
  });

  it('Vonage erreur → 500', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ status: '5', 'error-text': 'rate' }] })));
    const r = await worker.fetch(
      makeRequest({
        path: '/sms/otp',
        headers: { 'X-Apex-Sms-Token': 'admin-secret' },
        body: { phone: '+33612345678', code: '5678' },
      }),
      ENV,
    );
    expect(r.status).toBe(500);
  });
});
