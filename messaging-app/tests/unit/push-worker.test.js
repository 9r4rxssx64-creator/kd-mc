/**
 * Tests workers/push-worker.js — VAPID Web Push + APNs + FCM + broadcast
 * 100% coverage v8 via mocks crypto.subtle + fetch.
 */
import { withOrigin } from './api-worker-helpers.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, {
  importVapidPrivateKey,
  signVapidJWT,
  encryptWebPushPayload,
} from '../../workers/push-worker.js';

// --- Vraie VAPID private key JWK pour tests réels (générée avec ECDSA P-256) ---
// On la génère au runtime pour rester reproductible et sûr.
let VAPID_JWK;
let APNS_PKCS8_B64;

beforeEach(async () => {
  vi.restoreAllMocks();

  if (!VAPID_JWK) {
    const kp = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    VAPID_JWK = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
  }
  if (!APNS_PKCS8_B64) {
    const kp = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
    APNS_PKCS8_B64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  }
});

const ENV = () => ({
  APEX_CHAT_ADMIN_TOKEN: 'admin-secret',
  VAPID_PRIVATE_KEY: VAPID_JWK,
  APNS_KEY_ID: 'KEYID',
  APNS_TEAM_ID: 'TEAMID',
  APNS_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${APNS_PKCS8_B64}\n-----END PRIVATE KEY-----`,
  FCM_SERVER_KEY: 'fcm-key',
});

function makeRequest({ method = 'POST', path = '/web-push', headers = {}, body = {} } = {}) {
  return new Request('https://push.apex/' + path.replace(/^\//, ''), {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body),
  });
}

// Génère un subscription Web Push valide pour test (vraie ECDH P-256 publique)
async function makeSubscription(endpoint = 'https://fcm.googleapis.com/wp/abc') {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw = await crypto.subtle.exportKey('raw', kp.publicKey);
  const p256dh = btoa(String.fromCharCode(...new Uint8Array(pubRaw)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const auth = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return { endpoint, keys: { p256dh, auth } };
}

// ----------------------------------------------------------------------------
describe('push-worker — routing & CORS', () => {
  it('OPTIONS → CORS', async () => {
    // v1.1.287 (audit P2b) : origine autorisée renvoyée, inconnue refusée.
    const ok = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS', path: '/web-push' }), 'https://apex-chat.kd-mc.com'), ENV());
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://apex-chat.kd-mc.com');
    const ko = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS', path: '/web-push' }), 'https://evil.example'), ENV());
    expect(ko.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /health → ok', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/health' }), ENV());
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.vapid_public).toBeTruthy();
  });

  it('GET / → ok (alias health)', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/' }), ENV());
    expect((await r.json()).ok).toBe(true);
  });

  it('route inconnue → 404', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/xyz' }), ENV());
    expect(r.status).toBe(404);
  });

  it('exception générale → 500', async () => {
    const badReq = new Request('https://push.apex/web-push', {
      method: 'POST',
      headers: { 'X-Apex-Push-Token': 'admin-secret' },
      body: 'not-json',
    });
    const r = await worker.fetch(badReq, ENV());
    expect(r.status).toBe(500);
  });
});

// ----------------------------------------------------------------------------
describe('push-worker — checkAuth', () => {
  it('manque header → 401 sur web-push', async () => {
    const r = await worker.fetch(makeRequest({ path: '/web-push', body: {} }), ENV());
    expect(r.status).toBe(401);
  });
  it('mauvais token → 401', async () => {
    const r = await worker.fetch(makeRequest({ path: '/web-push', headers: { 'X-Apex-Push-Token': 'wrong' }, body: {} }), ENV());
    expect(r.status).toBe(401);
  });
  it('mauvais token → 401 sur apns', async () => {
    const r = await worker.fetch(makeRequest({ path: '/apns', body: {} }), ENV());
    expect(r.status).toBe(401);
  });
  it('mauvais token → 401 sur fcm', async () => {
    const r = await worker.fetch(makeRequest({ path: '/fcm', body: {} }), ENV());
    expect(r.status).toBe(401);
  });
  it('mauvais token → 401 sur broadcast', async () => {
    const r = await worker.fetch(makeRequest({ path: '/broadcast', body: {} }), ENV());
    expect(r.status).toBe(401);
  });
});

// ----------------------------------------------------------------------------
describe('push-worker — POST /web-push', () => {
  it('subscription/payload manquant → 400', async () => {
    const r = await worker.fetch(
      makeRequest({ headers: { 'X-Apex-Push-Token': 'admin-secret' }, body: {} }),
      ENV(),
    );
    expect(r.status).toBe(400);
  });

  it('VAPID_PRIVATE_KEY manquant → 500', async () => {
    const env = ENV();
    delete env.VAPID_PRIVATE_KEY;
    const sub = await makeSubscription();
    const r = await worker.fetch(
      makeRequest({
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { subscription: sub, payload: { title: 'X' } },
      }),
      env,
    );
    expect(r.status).toBe(500);
    expect((await r.json()).message).toContain('VAPID_PRIVATE_KEY');
  });

  it('Web Push success → ok+status', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 201 }));
    const sub = await makeSubscription();
    const r = await worker.fetch(
      makeRequest({
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { subscription: sub, payload: { title: 'Hello', body: 'Test' } },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.status).toBe(201);
    // Vérifie que fetch a été appelé avec headers VAPID
    expect(globalThis.fetch).toHaveBeenCalled();
    const call = globalThis.fetch.mock.calls[0];
    expect(call[1].headers.Authorization).toMatch(/^vapid t=[A-Za-z0-9_.\-]+, k=/);
    expect(call[1].headers['Content-Encoding']).toBe('aes128gcm');
  });

  it('Web Push fail (provider 410) → ok=false, status passé', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 410 }));
    const sub = await makeSubscription();
    const r = await worker.fetch(
      makeRequest({
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { subscription: sub, payload: { title: 'X' } },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(false);
    expect(b.status).toBe(410);
  });
});

// ----------------------------------------------------------------------------
describe('push-worker — POST /apns', () => {
  it('APNS_KEY_ID manquant → 500', async () => {
    const env = ENV();
    delete env.APNS_KEY_ID;
    const r = await worker.fetch(
      makeRequest({
        path: '/apns',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { deviceToken: 'tok', payload: { title: 'X', body: 'Y' } },
      }),
      env,
    );
    expect(r.status).toBe(500);
  });

  it('APNs success → ok+200', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const r = await worker.fetch(
      makeRequest({
        path: '/apns',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { deviceToken: 'devtok-abc', payload: { title: 'Hello', body: 'Test', badge: 5, data: { extra: 1 } } },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    const call = globalThis.fetch.mock.calls[0];
    expect(call[0]).toBe('https://api.push.apple.com/3/device/devtok-abc');
    expect(call[1].headers.authorization).toMatch(/^bearer /);
    expect(call[1].headers['apns-topic']).toBe('com.apexchat.app');
  });

  it('APNs payload sans badge → utilise 1 par défaut', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const r = await worker.fetch(
      makeRequest({
        path: '/apns',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { deviceToken: 'devtok', payload: { title: 'X', body: 'Y' } },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.aps.badge).toBe(1);
  });
});

// ----------------------------------------------------------------------------
describe('push-worker — POST /fcm', () => {
  it('FCM_SERVER_KEY manquant → 500', async () => {
    const env = ENV();
    delete env.FCM_SERVER_KEY;
    const r = await worker.fetch(
      makeRequest({
        path: '/fcm',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { fcmToken: 'fcm-tok', payload: { title: 'X', body: 'Y' } },
      }),
      env,
    );
    expect(r.status).toBe(500);
    expect((await r.json()).message).toContain('FCM_SERVER_KEY');
  });

  it('FCM success → ok+200', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: 1 }), { status: 200 }));
    const r = await worker.fetch(
      makeRequest({
        path: '/fcm',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { fcmToken: 'fcm-abc', payload: { title: 'X', body: 'Y', data: { foo: 'bar' }, urgent: true } },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.priority).toBe('high');
    expect(sentBody.to).toBe('fcm-abc');
  });

  it('FCM payload sans urgent → priority normal', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const r = await worker.fetch(
      makeRequest({
        path: '/fcm',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { fcmToken: 'tok', payload: { title: 'X', body: 'Y' } },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.priority).toBe('normal');
    expect(sentBody.data).toEqual({});
  });
});

// ----------------------------------------------------------------------------
describe('push-worker — POST /broadcast', () => {
  // v1.1.206 : /broadcast ne peut pas résoudre les subscriptions ici (pas de D1)
  // → répond honnêtement 501 not_implemented au lieu de ok:true (qui masquait la
  // perte de TOUTES les notifs de message). L'envoi réel passe par /web-push.
  it('broadcast → 501 not_implemented (honnête, plus de faux ok:true)', async () => {
    const r = await worker.fetch(
      makeRequest({
        path: '/broadcast',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: { topic: 'user:abc', title: 'X', body: 'Y' },
      }),
      ENV(),
    );
    expect(r.status).toBe(501);
    const b = await r.json();
    expect(b.ok).toBe(false);
    expect(b.error).toBe('not_implemented');
    expect(b.topic).toBe('user:abc');
  });

  it('broadcast sans topic → 501 + topic:null', async () => {
    const r = await worker.fetch(
      makeRequest({
        path: '/broadcast',
        headers: { 'X-Apex-Push-Token': 'admin-secret' },
        body: {},
      }),
      ENV(),
    );
    expect(r.status).toBe(501);
    const b = await r.json();
    expect(b.topic).toBeNull();
  });
});

// ----------------------------------------------------------------------------
describe('push-worker — POST /register', () => {
  it('register → ok + registered=true (proxy)', async () => {
    const r = await worker.fetch(
      makeRequest({
        path: '/register',
        body: { fcmToken: 'tok' },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.registered).toBe(true);
  });
});

describe('push-worker — internal helpers (branch coverage)', () => {
  it('importVapidPrivateKey accepte JWK objet (pas seulement string)', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    // Branch object (pas string) — test direct du helper
    const key = await importVapidPrivateKey(jwk);
    expect(key.algorithm.name).toBe('ECDSA');
  });

  it('signVapidJWT subject undefined → fallback mailto:kevind@monaco.mc', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwt = await signVapidJWT('https://fcm.googleapis.com', undefined, kp.privateKey);
    // Decode payload (middle segment)
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(jwt.split('.')[1].length + ((4 - jwt.split('.')[1].length % 4) % 4), '=')));
    expect(payload.sub).toBe('mailto:kevind@monaco.mc');
  });

  it('encryptWebPushPayload accepte Uint8Array directement (pas seulement string)', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const pubRaw = await crypto.subtle.exportKey('raw', kp.publicKey);
    const p256dh = btoa(String.fromCharCode(...new Uint8Array(pubRaw))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const auth = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payloadBytes = new TextEncoder().encode('{"a":1}');
    const r = await encryptWebPushPayload(payloadBytes, p256dh, auth);
    expect(r.body).toBeInstanceOf(Uint8Array);
    expect(r.localPubB64).toBeTruthy();
  });
});
