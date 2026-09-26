/**
// Last trigger: 2026-05-26T11:48:25Z - retry after spending limit
 * Apex Push Worker - Cloudflare Worker
 * Backend qui envoie les notifications push Web Push (VAPID) aux subscribers Apex.
 *
 * Endpoints :
 *   POST /send       { userIds: [...], payload: {title, body, url?, tag?} }   -> push cibles
 *   POST /send-all   { payload: {...} }                                        -> push a tous
 *   POST /test       { userId: "...", payload: {...} }                         -> push 1 user
 *   GET  /stats                                                                -> stats subs
 *   GET  /health                                                               -> ping
 *
 * Auth : header "Authorization: Bearer <ADMIN_TOKEN>" requis sur tous endpoints sauf /health.
 *
 * Variables d'environnement (Cloudflare Workers > Settings > Variables) :
 *   - ADMIN_TOKEN       : mot de passe secret (ex 32 chars random)
 *   - VAPID_PUBLIC_KEY  : cle publique VAPID (base64url, generee via gen-vapid.html)
 *   - VAPID_PRIVATE_KEY : cle privee VAPID (base64url, generee via gen-vapid.html)
 *   - VAPID_EMAIL       : ton@email.com (mailto: prefixe ajoute auto)
 *   - FIREBASE_URL      : https://cmcteams-xxx.firebasedatabase.app (sans trailing /)
 *
 * Implementation Web Push native (ECDSA P-256 + AES-128-GCM via crypto.subtle).
 * Compatible Safari iOS 16.4+, Chrome, Firefox.
 *
 * Deploy : voir DEPLOY-PUSH-WORKER.md
 * Version : v1.0 (Apex v12.200, 2026-04-25)
 */

const APEX_PATH = "/apex/ax_push_subs.json"; // chemin Firebase Realtime DB
const APEX_HISTORY_PATH = "/apex/ax_push_history.json";
const APEX_STATS_PATH = "/apex/ax_push_stats.json";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Health check public
    if (url.pathname === "/health") {
      return jsonResp({
        ok: true,
        version: "v1.0",
        time: Date.now(),
        configured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.FIREBASE_URL && env.ADMIN_TOKEN),
        // v1.1.278 — la clé VAPID PUBLIQUE est publique PAR DESIGN (elle voyage déjà
        // dans le header VAPID de chaque envoi Web Push + est intégrée dans
        // applicationServerKey côté navigateur). On l'expose ici pour que l'app
        // S'ABONNE avec la clé qui SIGNE réellement les push — sinon Apple accepte
        // (201) mais DROP en silence (applicationServerKey ≠ clé de signature).
        // Cause exacte du « 201 mais rien reçu » (diag v1.1.276). Fin du hardcode.
        vapidPublic: env.VAPID_PUBLIC_KEY || ""
      }, cors);
    }

    // Auth required pour tous autres endpoints.
    // v1.1.239 : accepte AUSSI le header X-Apex-Push-Token (utilisé par api-worker +
    // ConversationDO pour /web-push) en plus de Authorization: Bearer.
    // v1.1.241 : accepte AUSSI le jeton Apex Chat (env.APEX_CHAT_ADMIN_TOKEN) — l'api-worker
    // envoie son APEX_CHAT_ADMIN_TOKEN, qui peut être ≠ de l'ADMIN_TOKEN (Apex AI). Sans ça,
    // un éventuel décalage de secret → 401 silencieux sur 100% des notifs Apex Chat.
    const authHeader = request.headers.get("Authorization") || "";
    const xToken = request.headers.get("X-Apex-Push-Token") || "";
    const expected = "Bearer " + (env.ADMIN_TOKEN || "");
    const authed = !!env.ADMIN_TOKEN && (
      authHeader === expected ||
      xToken === env.ADMIN_TOKEN ||
      (!!env.APEX_CHAT_ADMIN_TOKEN && xToken === env.APEX_CHAT_ADMIN_TOKEN)
    );
    if (!authed) {
      return jsonResp({ error: "unauthorized" }, cors, 401);
    }

    try {
      // v1.1.239 : /web-push — envoi à UNE subscription fournie dans le body
      // (api-worker.sendPushToUser + ConversationDO._pushToUsers résolvent les
      // subscriptions côté D1 et appellent ici). Avant : route absente → 404 →
      // 100% des notifs message/appel perdues en silence.
      if (url.pathname === "/web-push" && request.method === "POST") {
        const body = await safeJson(request);
        const sub = body.subscription;
        if (!sub || !sub.endpoint || !sub.keys) return jsonResp({ error: "no_subscription" }, cors, 400);
        let status = 0;
        try {
          status = await sendOnePush(env, sub, body.payload || { title: "Apex Chat", body: "Nouveau message" });
        } catch (e) {
          return jsonResp({ ok: false, error: String(e && e.message || e).slice(0, 160) }, cors, 502);
        }
        const ok = status >= 200 && status < 300;
        return jsonResp({ ok, status }, cors, ok ? 200 : (status >= 400 && status < 600 ? status : 502));
      }
      if (url.pathname === "/stats" && request.method === "GET") {
        return await handleStats(env, cors);
      }
      if (url.pathname === "/send" && request.method === "POST") {
        const body = await safeJson(request);
        return await handleSend(env, body, cors);
      }
      if (url.pathname === "/send-all" && request.method === "POST") {
        const body = await safeJson(request);
        return await handleSendAll(env, body, cors);
      }
      if (url.pathname === "/test" && request.method === "POST") {
        const body = await safeJson(request);
        return await handleTest(env, body, cors);
      }
      return jsonResp({ error: "not_found", paths: ["/web-push", "/send", "/send-all", "/test", "/stats", "/health"] }, cors, 404);
    } catch (e) {
      return jsonResp({ error: "internal", msg: String(e && e.message || e).slice(0, 200) }, cors, 500);
    }
  }
};

function jsonResp(obj, extraHeaders, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {})
  });
}

async function safeJson(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

/* ============================================================
   Auth Firebase par SERVICE ACCOUNT (durcissement /apex auth != null, Kevin 2026-07-04).
   Mint un access_token Google OAuth2 (JWT RS256 signé WebCrypto) depuis
   FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (wrangler secrets), caché en
   module scope (~55 min). FAIL-OPEN : secrets absents / mint KO → "" → URL
   identique à avant (marche tant que les règles restent ouvertes).
   ============================================================ */
let _fbTokCache = { tok: "", exp: 0 };
function _b64u(buf) {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function _importSaKey(raw) {
  let k = String(raw || "").trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
  if (k.startsWith("{")) { try { const j = JSON.parse(k); if (j.private_key) k = j.private_key; } catch (_) {} }
  k = k.replace(/\\n/g, "\n");
  let b64 = k.replace(/-----BEGIN[^-]*-----/g, "").replace(/-----END[^-]*-----/g, "").replace(/[^A-Za-z0-9+/]/g, "");
  while (b64.length % 4) b64 += "=";
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
async function fbAccessToken(env) {
  try {
    if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return "";
    if (_fbTokCache.tok && _fbTokCache.exp > Date.now() + 60000) return _fbTokCache.tok;
    const key = await _importSaKey(env.FIREBASE_PRIVATE_KEY);
    const now = Math.floor(Date.now() / 1000);
    const enc = new TextEncoder();
    const header = _b64u(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const claim = _b64u(enc.encode(JSON.stringify({
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
      aud: "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600
    })));
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(header + "." + claim));
    const jwt = header + "." + claim + "." + _b64u(sig);
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + encodeURIComponent(jwt)
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.access_token) { console.error("[fbAccessToken] OAuth KO HTTP " + r.status + " " + JSON.stringify(j).slice(0, 200)); return ""; }
    _fbTokCache = { tok: j.access_token, exp: Date.now() + (Number(j.expires_in || 3600) - 300) * 1000 };
    return _fbTokCache.tok;
  } catch (e) { console.error("[fbAccessToken] " + (e && e.message)); return ""; }
}
async function fbAuthQS(env) {
  const t = await fbAccessToken(env);
  return t ? "?access_token=" + encodeURIComponent(t) : "";
}

async function fbRead(env, path) {
  const url = env.FIREBASE_URL.replace(/\/$/, "") + path + (await fbAuthQS(env));
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error("Firebase read " + r.status);
  const txt = await r.text();
  if (!txt || txt === "null") return {};
  try { return JSON.parse(txt); } catch (_) { return {}; }
}

async function fbWrite(env, path, data) {
  const url = env.FIREBASE_URL.replace(/\/$/, "") + path + (await fbAuthQS(env));
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

async function handleStats(env, cors) {
  const subs = await fbRead(env, APEX_PATH);
  const userIds = Object.keys(subs || {});
  const byDevice = { ios: 0, android: 0, desktop: 0, other: 0 };
  let lastActivity = 0;
  userIds.forEach(uid => {
    const s = subs[uid];
    if (!s) return;
    if (s.ts && s.ts > lastActivity) lastActivity = s.ts;
    const ua = (s.userAgent || "").toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) byDevice.ios++;
    else if (/android/.test(ua)) byDevice.android++;
    else if (/windows|mac|linux|x11/.test(ua)) byDevice.desktop++;
    else byDevice.other++;
  });
  return jsonResp({
    ok: true,
    total: userIds.length,
    byDevice,
    lastActivity,
    lastActivityHuman: lastActivity ? new Date(lastActivity).toISOString() : null
  }, cors);
}

async function handleSend(env, body, cors) {
  const userIds = Array.isArray(body.userIds) ? body.userIds : [];
  const payload = body.payload || { title: "Apex", body: "Notification" };
  if (!userIds.length) return jsonResp({ error: "no_userIds" }, cors, 400);

  const subs = await fbRead(env, APEX_PATH);
  const targets = userIds.map(uid => ({ uid, sub: subs[uid] && subs[uid].sub })).filter(x => x.sub);
  if (!targets.length) return jsonResp({ error: "no_subscribers", sent: 0, failed: 0 }, cors, 200);

  const results = await pushBatch(env, targets, payload);
  await logHistory(env, payload, results);
  return jsonResp(results, cors);
}

async function handleSendAll(env, body, cors) {
  const payload = body.payload || { title: "Apex", body: "Notification" };
  const subs = await fbRead(env, APEX_PATH);
  const targets = Object.keys(subs).map(uid => ({ uid, sub: subs[uid] && subs[uid].sub })).filter(x => x.sub);
  if (!targets.length) return jsonResp({ error: "no_subscribers", sent: 0, failed: 0 }, cors, 200);

  const results = await pushBatch(env, targets, payload);
  await logHistory(env, payload, results);
  return jsonResp(results, cors);
}

async function handleTest(env, body, cors) {
  const userId = body.userId;
  const payload = body.payload || { title: "Apex Test", body: "Test push depuis worker" };
  if (!userId) return jsonResp({ error: "no_userId" }, cors, 400);
  const subs = await fbRead(env, APEX_PATH);
  if (!subs[userId] || !subs[userId].sub) return jsonResp({ error: "user_not_subscribed", userId }, cors, 404);
  const results = await pushBatch(env, [{ uid: userId, sub: subs[userId].sub }], payload);
  return jsonResp(results, cors);
}

async function pushBatch(env, targets, payload) {
  const out = { sent: 0, failed: 0, details: [] };
  for (const t of targets) {
    try {
      const status = await sendOnePush(env, t.sub, payload);
      if (status >= 200 && status < 300) {
        out.sent++;
        out.details.push({ uid: t.uid, ok: true, status });
      } else {
        out.failed++;
        out.details.push({ uid: t.uid, ok: false, status });
        // 410 = expired, 404 = unsubscribed -> nettoyer
        if (status === 410 || status === 404) {
          await pruneSubscription(env, t.uid);
        }
      }
    } catch (e) {
      out.failed++;
      out.details.push({ uid: t.uid, ok: false, error: String(e && e.message || e).slice(0, 100) });
    }
  }
  return out;
}

async function pruneSubscription(env, uid) {
  try {
    const url = env.FIREBASE_URL.replace(/\/$/, "") + "/apex/ax_push_subs/" + encodeURIComponent(uid) + ".json" + (await fbAuthQS(env));
    await fetch(url, { method: "DELETE" });
  } catch (_) {}
}

async function logHistory(env, payload, results) {
  try {
    const hist = await fbRead(env, APEX_HISTORY_PATH);
    const arr = Array.isArray(hist) ? hist : [];
    arr.push({
      ts: Date.now(),
      title: (payload.title || "").slice(0, 80),
      body: (payload.body || "").slice(0, 120),
      sent: results.sent,
      failed: results.failed
    });
    while (arr.length > 200) arr.shift();
    await fbWrite(env, APEX_HISTORY_PATH, arr);
  } catch (_) {}
}

// =========================
// Web Push protocol (RFC 8030 + RFC 8291 + RFC 8292)
// =========================

async function sendOnePush(env, subscription, payload) {
  // payload encoding
  const payloadStr = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadStr);

  // Generate VAPID JWT for the endpoint origin
  const endpointUrl = new URL(subscription.endpoint);
  const audience = endpointUrl.origin;
  const jwt = await buildVapidJwt(env, audience);

  // Encrypt payload using aes128gcm scheme (RFC 8188)
  const encrypted = await encryptPayload(payloadBytes, subscription.keys);

  // VAPID public key in base64url -> need raw bytes for header
  const vapidPubBytes = base64urlDecode(env.VAPID_PUBLIC_KEY);
  const vapidPubB64 = base64urlEncode(vapidPubBytes);

  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    "TTL": "86400", // 1 day
    "Authorization": `vapid t=${jwt}, k=${vapidPubB64}`,
    "Urgency": "normal"
  };

  const r = await fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body: encrypted
  });
  return r.status;
}

async function buildVapidJwt(env, audience) {
  const header = { typ: "JWT", alg: "ES256" };
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12h
  const payload = {
    aud: audience,
    exp,
    sub: "mailto:" + (env.VAPID_EMAIL || "admin@apex.local")
  };
  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = headerB64 + "." + payloadB64;

  // Import VAPID private key
  const privKey = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privKey,
    new TextEncoder().encode(unsigned)
  );
  return unsigned + "." + base64urlEncode(new Uint8Array(sig));
}

async function importVapidPrivateKey(privB64, pubB64) {
  // privKey raw bytes (32 bytes) + pubKey raw uncompressed (65 bytes starting 0x04)
  const d = base64urlDecode(privB64);
  const pub = base64urlDecode(pubB64);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("VAPID public key must be uncompressed (65 bytes, starts 0x04)");
  if (d.length !== 32) throw new Error("VAPID private key must be 32 bytes raw");
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: base64urlEncode(d),
    x: base64urlEncode(x),
    y: base64urlEncode(y),
    ext: true
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

// RFC 8188 aes128gcm + RFC 8291 (Web Push)
async function encryptPayload(plaintext, subKeys) {
  // subKeys.p256dh = client public key (base64url, 65 bytes uncompressed)
  // subKeys.auth   = client auth secret (base64url, 16 bytes)
  const clientPubBytes = base64urlDecode(subKeys.p256dh);
  const authSecret = base64urlDecode(subKeys.auth);

  // Generate ephemeral ECDH key pair
  const localKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeys.publicKey));

  // ECDH: derive shared secret with client public key
  const clientPubKey = await crypto.subtle.importKey(
    "raw",
    clientPubBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPubKey },
    localKeys.privateKey,
    256
  ));

  // PRK_key = HMAC-SHA-256(authSecret, sharedSecret)
  // key_info = "WebPush: info\0" || clientPub || localPub
  const keyInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    clientPubBytes,
    localPubRaw
  );
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  // Generate salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK (Content Encryption Key) - aes128gcm
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  // Nonce
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Pad: plaintext || 0x02 (single record marker)
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext, 0);
  padded[plaintext.length] = 0x02;

  // AES-128-GCM encrypt
  const cekKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt"]
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cekKey,
    padded
  );
  const cipher = new Uint8Array(cipherBuf);

  // Build header per RFC 8188 sec 2.1:
  //  salt(16) || rs(4 BE) || idlen(1) || keyid(0..255)  -- here keyid = localPub (65 bytes)
  const rs = new Uint8Array(4);
  // rs = 4096 (default)
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([localPubRaw.length]);

  return concat(salt, rs, idlen, localPubRaw, cipher);
}

async function hkdf(salt, ikm, info, length) {
  const saltKey = await crypto.subtle.importKey(
    "raw",
    salt,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
  const prkKey = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  // T(1) = HMAC(PRK, info || 0x01)
  const t1Input = new Uint8Array(info.length + 1);
  t1Input.set(info, 0);
  t1Input[info.length] = 0x01;
  const t1 = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, t1Input));
  return t1.slice(0, length);
}

function concat(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function base64urlEncode(bytes) {
  let s = btoa(String.fromCharCode.apply(null, bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
