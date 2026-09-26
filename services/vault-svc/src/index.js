/**
 * vault-svc — Cloudflare Worker pour stockage secrets chiffrés
 *
 * Mission : sortir le Coffre du monolith Apex AI vers un microservice dédié.
 * Avantages :
 *   - AES-GCM 256 server-side (vs PBKDF2 client v12.529)
 *   - Master key stored in Cloudflare Secrets (jamais leakée client)
 *   - Per-user encryption avec auth.uid
 *   - Audit trail accès secrets
 *   - Backup chiffré quotidien Firebase
 *
 * ENDPOINTS :
 *   POST /v1/get   : {uid, key} → {value_encrypted}
 *   POST /v1/set   : {uid, key, value} → {ok, ts}
 *   POST /v1/list  : {uid} → {keys: [{key, last_modified}]}
 *   DELETE /v1/del : {uid, key} → {ok}
 *   GET  /health
 *
 * SECRETS (wrangler secret put) :
 *   - VAULT_MASTER_KEY : base64 32-byte AES-GCM key
 *   - JWT_VERIFY_KEY : Firebase project public key (RS256)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, DELETE, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health") return json({ ok: true, service: "vault-svc" }, cors);

    // Auth check obligatoire (sauf /health)
    const authToken = request.headers.get("Authorization") || "";
    const tokenMatch = authToken.match(/^Bearer\s+(.+)$/);
    if (!tokenMatch) return json({ ok: false, error: "unauthorized" }, cors, 401);

    // TODO Phase 5.1 : valider JWT contre Firebase public key
    // Pour l'instant accepte token non-vide (à durcir post-deploy)
    const uid = await extractUidFromToken(tokenMatch[1], env);
    if (!uid) return json({ ok: false, error: "invalid_token" }, cors, 401);

    if (url.pathname === "/v1/get" && request.method === "POST") {
      const { key } = await request.json();
      if (!key) return json({ ok: false, error: "missing_key" }, cors, 400);
      const stored = await env.VAULT_KV.get(`u:${uid}:${key}`);
      if (!stored) return json({ ok: false, error: "not_found" }, cors, 404);
      return json({ ok: true, value_encrypted: stored }, cors);
    }

    if (url.pathname === "/v1/set" && request.method === "POST") {
      const { key, value } = await request.json();
      if (!key || value === undefined) return json({ ok: false, error: "missing_params" }, cors, 400);
      const encrypted = await encryptAESGCM(JSON.stringify(value), env.VAULT_MASTER_KEY);
      await env.VAULT_KV.put(`u:${uid}:${key}`, encrypted);
      ctx.waitUntil(audit(env, uid, "set", key));
      return json({ ok: true, ts: Date.now() }, cors);
    }

    if (url.pathname === "/v1/list" && request.method === "POST") {
      const list = await env.VAULT_KV.list({ prefix: `u:${uid}:` });
      const keys = list.keys.map(k => ({ key: k.name.replace(`u:${uid}:`, ""), last_modified: k.metadata?.ts || null }));
      return json({ ok: true, keys }, cors);
    }

    if (url.pathname === "/v1/del" && request.method === "DELETE") {
      const { key } = await request.json();
      await env.VAULT_KV.delete(`u:${uid}:${key}`);
      ctx.waitUntil(audit(env, uid, "del", key));
      return json({ ok: true }, cors);
    }

    return json({ ok: false, error: "not_found" }, cors, 404);
  }
};

async function extractUidFromToken(token, env) {
  // FIX P0 audit 2026-07-08 : l'ancien stub décodait le payload SANS vérifier la
  // signature → n'importe qui forgeait un uid (écriture/suppression du coffre
  // d'autrui). Désormais FAIL-CLOSED : sans clé de vérification déployée, AUCUN
  // accès ; avec la clé, signature RS256 + exp vérifiées.
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    if (!env.JWT_VERIFY_KEY) return null; // fail-closed : pas de clé → pas d'accès
    const b64u = (x) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - x.length % 4) % 4)), c => c.charCodeAt(0));
    const header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
    if (header.alg !== "RS256") return null; // anti alg-confusion
    const pem = env.JWT_VERIFY_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("spki", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null; // expiré
    return payload.uid || payload.sub || null;
  } catch { return null; }
}

async function encryptAESGCM(plaintext, masterKeyB64) {
  const keyBytes = Uint8Array.from(atob(masterKeyB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function audit(env, uid, action, key) {
  if (!env.FIREBASE_PROJECT_ID) return;
  try {
    await fetch(
      `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app/apex/ax_vault_audit/${Date.now()}.json`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, action, key, ts: Date.now() }) }
    );
  } catch (_) {}
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}
