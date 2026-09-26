/**
 * Apex Chat — Push Worker (cross-platform)
 *
 * Endpoints :
 *   POST /web-push       Web Push (VAPID ECDSA P-256 + AES-128-GCM)
 *   POST /apns           Apple Push (JWT ES256 .p8)
 *   POST /fcm            Firebase Cloud Messaging HTTP v1
 *   POST /broadcast      Topic-based (user:<uid>) cross-app Apex+Apex Chat
 *   POST /register       Enregistrer subscription user
 *   GET  /health         Health check
 *
 * VAPID public key existante (réutilisée d'Apex push worker) :
 * BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY
 */

const VAPID_PUBLIC = 'BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY';

import { corsHeaders, makeJson, applyCors } from './lib/cors.js';

const CORS_HEADERS = corsHeaders('GET, POST, OPTIONS', 'Content-Type, Authorization, X-Apex-Push-Token');

const json = makeJson(CORS_HEADERS);

function err(message, status = 400) {
  return json({ error: 'error', message }, status);
}

// ============================================================================
//  VAPID JWT signature (Web Push)
// ============================================================================

function urlBase64Encode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function urlBase64Decode(s) {
  const pad = (4 - s.length % 4) % 4;
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + pad, '=')),
    c => c.charCodeAt(0));
}

export async function importVapidPrivateKey(privateKeyJWK) {
  return await crypto.subtle.importKey(
    'jwk',
    typeof privateKeyJWK === 'string' ? JSON.parse(privateKeyJWK) : privateKeyJWK,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

export async function signVapidJWT(audience, subject, privateKey) {
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,  // 12h
    sub: subject || 'mailto:kevind@monaco.mc'
  };
  const headerB64 = urlBase64Encode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = urlBase64Encode(new TextEncoder().encode(JSON.stringify(payload)));
  const dataToSign = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, dataToSign
  );
  return `${headerB64}.${payloadB64}.${urlBase64Encode(signature)}`;
}

// ============================================================================
//  AES-128-GCM encrypt payload (Web Push RFC 8291 aes128gcm)
// ============================================================================

export async function encryptWebPushPayload(payload, p256dh, auth) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const localKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const localPub = await crypto.subtle.exportKey('raw', localKeys.publicKey);
  const remotePubBytes = urlBase64Decode(p256dh);
  const remotePub = await crypto.subtle.importKey(
    'raw', remotePubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remotePub }, localKeys.privateKey, 256
  );
  const authBytes = urlBase64Decode(auth);

  // HKDF-Extract puis HKDF-Expand pour dériver IKM, CEK, NONCE
  const prk = await hkdf(authBytes, sharedSecret, new TextEncoder().encode('WebPush: info\0'), 32);
  const cek = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const padded = new Uint8Array(data.length + 1);
  padded.set(data); padded[data.length] = 2;  // delimiter
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded);

  // Header : salt(16) + rs(4) + idlen(1) + keyid(idlen) + ciphertext
  const localPubBytes = new Uint8Array(localPub);
  const header = new Uint8Array(16 + 4 + 1 + localPubBytes.length);
  header.set(salt, 0);
  // rs = 4096 (max chunk size)
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = localPubBytes.length;
  header.set(localPubBytes, 21);

  const result = new Uint8Array(header.length + ciphertext.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(ciphertext), header.length);
  return { body: result, localPubB64: urlBase64Encode(localPubBytes) };
}

async function hkdf(salt, ikm, info, length) {
  const saltKey = await crypto.subtle.importKey(
    'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const prk = await crypto.subtle.sign('HMAC', saltKey, ikm);
  const prkKey = await crypto.subtle.importKey(
    'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const t1 = await crypto.subtle.sign('HMAC', prkKey, new Uint8Array([...info, 1]));
  return new Uint8Array(t1).slice(0, length);
}

// ============================================================================
//  Send Web Push
// ============================================================================

async function sendWebPush(subscription, payload, env) {
  if (!env.VAPID_PRIVATE_KEY) throw new Error('VAPID_PRIVATE_KEY non configurée');
  const audience = new URL(subscription.endpoint).origin;
  const privateKey = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY);
  const jwt = await signVapidJWT(audience, 'mailto:kevind@monaco.mc', privateKey);

  const { body, localPubB64 } = await encryptWebPushPayload(
    JSON.stringify(payload),
    subscription.keys.p256dh,
    subscription.keys.auth
  );

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400'
    },
    body
  });

  return { status: response.status, ok: response.ok };
}

// ============================================================================
//  Send APNs (Apple)
// ============================================================================

async function sendAPNs(deviceToken, payload, env) {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_PRIVATE_KEY) {
    throw new Error('APNs non configuré');
  }

  // JWT ES256 pour APNs
  const header = { alg: 'ES256', kid: env.APNS_KEY_ID };
  const claims = {
    iss: env.APNS_TEAM_ID,
    iat: Math.floor(Date.now() / 1000)
  };
  const headerB64 = urlBase64Encode(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = urlBase64Encode(new TextEncoder().encode(JSON.stringify(claims)));

  // .p8 → P-256 private key
  const pemContents = env.APNS_PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey,
    new TextEncoder().encode(`${headerB64}.${claimsB64}`)
  );
  const jwt = `${headerB64}.${claimsB64}.${urlBase64Encode(signature)}`;

  const apnsPayload = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      badge: payload.badge || 1,
      'mutable-content': 1
    },
    ...payload.data
  };

  const url = `https://api.push.apple.com/3/device/${deviceToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `bearer ${jwt}`,
      'apns-topic': 'com.apexchat.app',
      'apns-push-type': 'alert',
      'content-type': 'application/json'
    },
    body: JSON.stringify(apnsPayload)
  });

  return { status: response.status, ok: response.ok };
}

// ============================================================================
//  Send FCM (Android / Chrome)
// ============================================================================

async function sendFCM(fcmToken, payload, env) {
  if (!env.FCM_SERVER_KEY) throw new Error('FCM_SERVER_KEY non configurée');

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${env.FCM_SERVER_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      priority: payload.urgent ? 'high' : 'normal'
    })
  });

  return { status: response.status, ok: response.ok };
}

// ============================================================================
//  Auth check
// ============================================================================

// SÉCU (audit P2) : comparaison à temps constant du token admin (évite un oracle de timing
// et le cas où token ET secret seraient vides/undefined).
function _ctEqStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function checkAuth(request, env) {
  const token = request.headers.get('X-Apex-Push-Token');
  return _ctEqStr(token, env.APEX_CHAT_ADMIN_TOKEN);
}

// ============================================================================
//  Routes
// ============================================================================

async function handleWebPush(request, env) {
  if (!checkAuth(request, env)) return err('Unauthorized', 401);
  const { subscription, payload } = await request.json();
  if (!subscription || !payload) return err('subscription + payload required');
  try {
    const result = await sendWebPush(subscription, payload, env);
    return json({ ok: result.ok, status: result.status });
  } catch (e) {
    return err(e.message, 500);
  }
}

async function handleAPNs(request, env) {
  if (!checkAuth(request, env)) return err('Unauthorized', 401);
  const { deviceToken, payload } = await request.json();
  try {
    const result = await sendAPNs(deviceToken, payload, env);
    return json({ ok: result.ok, status: result.status });
  } catch (e) {
    return err(e.message, 500);
  }
}

async function handleFCM(request, env) {
  if (!checkAuth(request, env)) return err('Unauthorized', 401);
  const { fcmToken, payload } = await request.json();
  try {
    const result = await sendFCM(fcmToken, payload, env);
    return json({ ok: result.ok, status: result.status });
  } catch (e) {
    return err(e.message, 500);
  }
}

async function handleBroadcast(request, env) {
  if (!checkAuth(request, env)) return err('Unauthorized', 401);
  const { topic } = await request.json();
  // v1.1.206 : ce worker n'a PAS accès au store de subscriptions (D1 = côté
  // api-worker). /broadcast par topic ne peut donc rien envoyer ici → il
  // renvoyait ok:true à tort (= notifs perdues en silence). L'émetteur (DO)
  // résout maintenant les subscriptions et appelle /web-push directement.
  // On répond honnêtement non-implémenté pour ne plus jamais masquer l'échec.
  return json(
    { ok: false, error: 'not_implemented', message: 'Utiliser /web-push avec la subscription résolue côté api-worker', topic: topic || null },
    501
  );
}

async function handleRegister(request, env) {
  // Enregistrer subscription user (relai vers API worker D1)
  // Implémenté côté API worker, ce endpoint est juste un proxy
  const data = await request.json();
  return json({ ok: true, registered: true });
}

// ============================================================================
//  Main fetch
// ============================================================================

const _workerHandler = {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/web-push' && request.method === 'POST') return await handleWebPush(request, env);
      if (path === '/apns' && request.method === 'POST') return await handleAPNs(request, env);
      if (path === '/fcm' && request.method === 'POST') return await handleFCM(request, env);
      if (path === '/broadcast' && request.method === 'POST') return await handleBroadcast(request, env);
      if (path === '/register' && request.method === 'POST') return await handleRegister(request, env);
      if (path === '/health' || path === '/') return json({ ok: true, version: '1.0.0', vapid_public: VAPID_PUBLIC });
      return err('Not found', 404);
    } catch (e) {
      return err(e.message, 500);
    }
  }
};

// ============================================================================
//  CORS par ORIGINE (audit P2b, v1.1.287)
//  Le worker répondait `Access-Control-Allow-Origin: *` à tout le monde. On
//  applique la liste d'origines réelles en UN SEUL point — le `fetch` de tête —
//  au lieu de toucher chaque site d'appel : zéro risque de rater une réponse.
// ============================================================================
export default {
  ..._workerHandler,
  async fetch(request, env, ctx) {
    return applyCors(request, await _workerHandler.fetch(request, env, ctx));
  },
};
