/**
 * apex-auth-worker.js — Cloudflare Worker pour Phase 5 Firebase Auth
 *
 * Mission : générer custom tokens Firebase signés pour Apex AI clients.
 * Sans ce serveur, impossible d'avoir un vrai per-user UID gate Firebase.
 *
 * DÉPLOIEMENT KEVIN (PHASE5_DEPLOY.md) :
 *   1. Créer un compte Cloudflare (gratuit) si pas déjà fait
 *   2. Tape `wrangler deploy` dans le dossier apex-auth-worker/
 *   3. Configurer secrets : FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL
 *   4. Coller URL worker dans Apex Coffre key `ax_auth_worker_url`
 *
 * SECRETS REQUIS (wrangler secret put) :
 *   - FIREBASE_PROJECT_ID : "kdmc-clients" (depuis console Firebase)
 *   - FIREBASE_PRIVATE_KEY : PEM key (depuis Firebase Service Account JSON)
 *   - FIREBASE_CLIENT_EMAIL : "firebase-adminsdk-XXX@kdmc-clients.iam.gserviceaccount.com"
 *
 * ENDPOINTS :
 *   POST /login    : {uid, pin_hash} → {custom_token} (TTL 1h)
 *   POST /refresh  : {refresh_token} → {custom_token}
 *   GET  /health   : status check
 *
 * SÉCURITÉ :
 *   - Validation pin_hash contre Firebase RTDB /apex/ax_pin_<uid>
 *   - Rate-limit : 5 tentatives par IP par 15 min (KV namespace)
 *   - HMAC-SHA256 signature custom token via Firebase service-account
 *   - Pas de stockage logs PII (RGPD Art.5)
 *   - Audit trail dans Firebase /apex/ax_auth_log (admin-only via rules)
 */

import { verifyCmcPw, hashPwV2 } from "./cmc-hash.js";
import { dansLaBanque } from "./membre.js";

const FIREBASE_AUTH_BASE = "https://identitytoolkit.googleapis.com/v1";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // --- /health ---
      if (url.pathname === "/health" && request.method === "GET") {
        return jsonResp({ ok: true, version: "v1.1", capacites: ["cmc_secret", "cmc_code"], ts: Date.now() }, corsHeaders);
      }

      // --- /login ---
      if (url.pathname === "/login" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const { uid, pin_hash } = body;

        if (!uid || !pin_hash) {
          return jsonResp({ ok: false, error: "missing_uid_or_pin_hash" }, corsHeaders, 400);
        }

        // Rate-limit par IP (KV namespace)
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const rateKey = `rl:${ip}`;
        const attempts = parseInt(await env.AUTH_KV.get(rateKey) || "0");
        if (attempts >= 5) {
          return jsonResp({ ok: false, error: "rate_limited", retry_after: 900 }, corsHeaders, 429);
        }
        await env.AUTH_KV.put(rateKey, String(attempts + 1), { expirationTtl: 900 });

        // Vérifier pin_hash contre Firebase RTDB.
        // Lecture AUTHENTIFIÉE via service account (OAuth Google) → fonctionne même
        // sous les règles strictes Phase 5 où /apex/ax_pin_$uid n'est plus lisible en
        // anonyme. Fallback anonyme conservé pour compat Phase 4 (règles ouvertes).
        // Sans ce correctif, activer les règles strictes casserait TOUT login (le
        // worker ne pourrait plus lire ax_pin → 403). Voir CLAUDE.md Phase 5.
        const pinRead = await readPinHash(uid, env, ctx);
        if (!pinRead.ok) {
          const status = pinRead.status === 404 ? 404 : 502;
          return jsonResp(
            { ok: false, error: pinRead.detail || "user_not_found", detail: pinRead.detail, mode: pinRead.mode },
            corsHeaders,
            status
          );
        }

        if (pinRead.hash !== pin_hash) {
          return jsonResp({ ok: false, error: "pin_mismatch" }, corsHeaders, 401);
        }

        // Reset rate-limit après succès
        await env.AUTH_KV.delete(rateKey);

        // Générer custom token Firebase signé
        const customToken = await generateCustomToken(uid, env);

        // Audit trail
        ctx.waitUntil(auditLog(env, uid, "login_success", ip));

        const out = { ok: true, custom_token: customToken, uid: uid, expires_in: 3600 };
        // Échange serveur-side custom_token → id_token (si FIREBASE_WEB_API_KEY présent).
        // Le client n'a alors qu'à attacher id_token en ?auth=. Fail-open si absent.
        const idt = await exchangeForIdToken(customToken, env);
        if (idt) { out.id_token = idt.idToken; out.refresh_token = idt.refreshToken; out.expires_in = parseInt(idt.expiresIn, 10) || 3600; }
        return jsonResp(out, corsHeaders);
      }

      // --- /login-cmc (CMCteams : valide cmc_pw via service account) ---
      if (url.pathname === "/login-cmc" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const { uid, password } = body;
        if (!uid || !password) {
          return jsonResp({ ok: false, error: "missing_uid_or_password" }, corsHeaders, 400);
        }
        if (!cmcIdOk(uid)) return jsonResp({ ok: false, error: "bad_uid" }, corsHeaders, 400);

        // Rate-limit par IP (clé distincte de /login Apex) ET par compte (27.09.2026 : les
        // mots de passe ne sont plus lisibles par les téléphones → le seul moyen d'en deviner
        // un est ICI ; 10 essais / 15 min par compte, quel que soit le nombre d'adresses IP).
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const rateKey = `rlc:${ip}`, rateUid = `rlu:${uid}`;
        const attempts = parseInt(await env.AUTH_KV.get(rateKey) || "0");
        const attemptsUid = parseInt(await env.AUTH_KV.get(rateUid) || "0");
        if (attempts >= 5 || attemptsUid >= 10) {
          return jsonResp({ ok: false, error: "rate_limited", retry_after: 900 }, corsHeaders, 429);
        }
        await env.AUTH_KV.put(rateKey, String(attempts + 1), { expirationTtl: 900 });
        await env.AUTH_KV.put(rateUid, String(attemptsUid + 1), { expirationTtl: 900 });

        // Lecture cmc_pw/<uid> en admin (service account) → survit aux règles strictes.
        // Le mot de passe en clair ne transite QUE sur HTTPS, jamais loggé (RGPD).
        const stored = await readCmcPw(uid, env, ctx);
        if (!stored.ok) {
          const status = stored.status === 404 ? 404 : 502;
          return jsonResp({ ok: false, error: stored.detail || "user_not_found", detail: stored.detail }, corsHeaders, status);
        }
        if (!verifyCmcPw(password, stored.value)) {
          return jsonResp({ ok: false, error: "password_mismatch" }, corsHeaders, 401);
        }

        await env.AUTH_KV.delete(rateKey);
        await env.AUTH_KV.delete(rateUid);
        const customToken = await generateCustomToken(uid, env, "cmc");
        ctx.waitUntil(auditLog(env, uid, "login_cmc_success", ip));

        const out = { ok: true, custom_token: customToken, uid, scope: "cmc", expires_in: 3600 };
        const idt = await exchangeForIdToken(customToken, env);
        if (idt) { out.id_token = idt.idToken; out.refresh_token = idt.refreshToken; out.expires_in = parseInt(idt.expiresIn, 10) || 3600; }
        return jsonResp(out, corsHeaders);
      }

      // --- /cmc/code/new : code d'inscription CMCteams tiré ICI, rangé au secret (27.09.2026) ---
      if (url.pathname === "/cmc/code/new" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const [data, status] = await cmcCodeNew(body, request, env, ctx);
        return jsonResp(data, corsHeaders, status);
      }
      // --- /cmc/pw/recreer : un collègue de la banque / des imports recrée SON mot de passe (6.10.2026) ---
      if (url.pathname === "/cmc/pw/recreer" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const [data, status] = await cmcPwRecreer(body, request, env, ctx);
        return jsonResp(data, corsHeaders, status);
      }
      // --- /cmc/code/check : vérifie le code ICI, valide le compte, ouvre la session ---
      if (url.pathname === "/cmc/code/check" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const [data, status] = await cmcCodeCheck(body, request, env, ctx);
        return jsonResp(data, corsHeaders, status);
      }

      // --- /refresh ---
      if (url.pathname === "/refresh" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const { uid, refresh_token } = body;
        if (!uid || !refresh_token) {
          return jsonResp({ ok: false, error: "missing_params" }, corsHeaders, 400);
        }
        // Vrai refresh via Firebase securetoken (valide le refresh_token côté Google).
        // Fail-open : si pas de Web API key, on remint un custom token (le client
        // refera l'échange). Ne JAMAIS mint un id_token sans valider le refresh_token.
        if (env.FIREBASE_WEB_API_KEY) {
          try {
            const refreshed = await refreshIdToken(refresh_token, env);
            return jsonResp({ ok: true, id_token: refreshed.id_token, refresh_token: refreshed.refresh_token, expires_in: parseInt(refreshed.expires_in, 10) || 3600 }, corsHeaders);
          } catch (e) {
            return jsonResp({ ok: false, error: "refresh_failed", detail: String(e.message || e).slice(0, 140) }, corsHeaders, 401);
          }
        }
        const newToken = await generateCustomToken(uid, env);
        return jsonResp({ ok: true, custom_token: newToken, expires_in: 3600 }, corsHeaders);
      }

      return jsonResp({ ok: false, error: "not_found" }, corsHeaders, 404);
    } catch (e) {
      console.error("[auth-worker] error:", e.message);
      return jsonResp({ ok: false, error: "internal_error", message: e.message }, corsHeaders, 500);
    }
  }
};

function jsonResp(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

async function auditLog(env, uid, action, ip) {
  try {
    const ipHash = await sha256(ip);
    const entry = {
      uid,
      action,
      ip_hash: ipHash.slice(0, 16),
      ts: Date.now(),
      worker_version: "v1.0"
    };
    // Écriture authentifiée (service account) → fonctionne sous règles strictes Phase 5
    // (ax_auth_log .write: auth != null). Fallback anonyme si le token échoue.
    let logUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app/apex/ax_auth_log/${entry.ts}.json`;
    try {
      const tok = await getGoogleAccessToken(env, null);
      if (tok) logUrl += `?access_token=${encodeURIComponent(tok)}`;
    } catch (_) { /* fallback anonyme */ }
    await fetch(logUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
  } catch (e) {
    console.warn("audit log failed:", e.message);
  }
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Génère un Firebase custom token signé via service-account.
 * Utilise jose-like JWT signing avec RS256.
 */
async function generateCustomToken(uid, env, scope = "apex") {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  // Rôle selon le périmètre : Apex (admin = kdmc_admin) ou CMCteams (admin = U11804).
  const role = scope === "cmc"
    ? (uid === "U11804" ? "admin" : "employee")
    : (uid === "kdmc_admin" ? "admin" : "user");
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid: uid,
    claims: { role, scope }
  };

  const encoder = new TextEncoder();
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(signingInput)
  );
  const sigB64 = base64urlEncode(new Uint8Array(signature));

  return `${signingInput}.${sigB64}`;
}

/**
 * Lit le hash de PIN d'un user dans RTDB /apex/ax_pin_<uid>.
 * Priorité : lecture authentifiée service account (survit aux règles strictes Phase 5).
 * Fallback : lecture anonyme (compat Phase 4 où /apex est encore lisible).
 * RTDB renvoie le corps `null` (200) quand le path n'existe pas → traité user_not_found.
 */
async function readPinHash(uid, env, ctx) {
  const base = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app/apex/ax_pin_${encodeURIComponent(uid)}.json`;

  // 1) Lecture authentifiée (service account)
  let token = null;
  try { token = await getGoogleAccessToken(env, ctx); } catch (_) { /* fallback anon */ }
  if (token) {
    const r = await fetch(`${base}?access_token=${encodeURIComponent(token)}`);
    if (r.ok) {
      const hash = cleanFbVal(await r.text());
      if (hash === "" || hash === "null") return { ok: false, status: 404, detail: "user_not_found", mode: "admin" };
      return { ok: true, hash, mode: "admin" };
    }
    if (r.status !== 404) return { ok: false, status: r.status, detail: `rtdb_admin_read_${r.status}`, mode: "admin" };
    return { ok: false, status: 404, detail: "user_not_found", mode: "admin" };
  }

  // 2) Fallback anonyme (Phase 4)
  const r = await fetch(base);
  if (r.status === 404) return { ok: false, status: 404, detail: "user_not_found", mode: "anon" };
  if (!r.ok) return { ok: false, status: r.status, detail: `rtdb_anon_read_${r.status}`, mode: "anon" };
  const hash = cleanFbVal(await r.text());
  if (hash === "" || hash === "null") return { ok: false, status: 404, detail: "user_not_found", mode: "anon" };
  return { ok: true, hash, mode: "anon" };
}

export function cleanFbVal(t) {
  return String(t || "").trim().replace(/^"|"$/g, "");
}

/**
 * Échange un custom token Firebase contre un id_token (utilisable en RTDB ?auth=).
 * Gated sur FIREBASE_WEB_API_KEY (clé publique). Retourne null si absente (fail-open :
 * le client recevra alors seulement custom_token et ne s'authentifiera pas → comportement
 * actuel inchangé). Requiert que Firebase Authentication soit activé sur le projet.
 */
export async function exchangeForIdToken(customToken, env) {
  if (!env.FIREBASE_WEB_API_KEY) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true })
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error(`[auth-worker] signInWithCustomToken ${r.status}: ${t.slice(0, 140)}`);
      return null; // fail-open : login réussit, juste sans id_token
    }
    const d = await r.json();
    return { idToken: d.idToken, refreshToken: d.refreshToken, expiresIn: d.expiresIn };
  } catch (e) {
    console.error("[auth-worker] exchangeForIdToken error:", e.message);
    return null;
  }
}

/** Rafraîchit un id_token via le endpoint securetoken (valide le refresh_token côté Google). */
async function refreshIdToken(refreshToken, env) {
  const r = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    }
  );
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`securetoken_${r.status}:${t.slice(0, 120)}`);
  }
  return r.json(); // { id_token, refresh_token, expires_in, ... }
}

/**
 * Lit l'enregistrement de mot de passe CMCteams /cmcteams/cmc_pw/<uid>.
 * Renvoie la valeur parsée (objet { h, ... } ou string legacy) pour verifyCmcPw.
 * Lecture authentifiée service account (survit aux règles strictes), fallback anonyme.
 */
async function readCmcPw(uid, env, ctx) {
  // 27.09.2026 : le hash vit désormais dans /cmcteams_secret/pw (illisible par tout téléphone).
  // Avant la migration, il n'y est pas encore → on relit l'ancien emplacement public.
  const sec = await rtdb(env, ctx, "GET", `cmcteams_secret/pw/${encodeURIComponent(uid)}`);
  if (sec.ok && sec.value && (typeof sec.value === "string" || sec.value.h)) return { ok: true, value: sec.value, mode: "secret" };
  const base = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app/cmcteams/cmc_pw/${encodeURIComponent(uid)}.json`;
  let token = null;
  try { token = await getGoogleAccessToken(env, ctx); } catch (_) { /* fallback anon */ }
  const r = await fetch(token ? `${base}?access_token=${encodeURIComponent(token)}` : base);
  if (!r.ok) {
    if (r.status === 404) return { ok: false, status: 404, detail: "user_not_found" };
    return { ok: false, status: r.status, detail: `rtdb_read_${r.status}`, mode: token ? "admin" : "anon" };
  }
  const text = await r.text();
  if (!text || text.trim() === "null") return { ok: false, status: 404, detail: "user_not_found" };
  let value;
  try { value = JSON.parse(text); } catch (_) { value = cleanFbVal(text); }
  // Une fois migré, l'ancien emplacement ne garde qu'un repère sans hash → compte inconnu ici.
  if (value && typeof value === "object" && !value.h) return { ok: false, status: 404, detail: "user_not_found" };
  return { ok: true, value, mode: token ? "admin" : "anon" };
}

/**
 * Mint un access token OAuth2 Google pour le service account (scope firebase.database).
 * Permet au worker de lire/écrire RTDB en admin (bypass des règles) → indispensable
 * pour que /login fonctionne une fois les règles strictes Phase 5 publiées.
 * Caché dans KV (gtoken) jusqu'à ~expiry-60s pour éviter de re-signer à chaque requête.
 */
async function getGoogleAccessToken(env, ctx) {
  if (!env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_CLIENT_EMAIL) {
    throw new Error("missing_service_account_secrets");
  }
  try {
    const cached = env.AUTH_KV && (await env.AUTH_KV.get("gtoken"));
    if (cached) return cached;
  } catch (_) { /* KV indispo → on mint */ }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const signingInput = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(claims))}`;
  const privateKey = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const assertion = `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" + encodeURIComponent(assertion)
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`google_oauth_${resp.status}:${t.slice(0, 140)}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error("google_oauth_no_token");
  const ttl = Math.max(60, (parseInt(data.expires_in, 10) || 3600) - 60);
  try {
    const put = env.AUTH_KV && env.AUTH_KV.put("gtoken", data.access_token, { expirationTtl: ttl });
    if (put && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put); else await put;
  } catch (_) { /* cache best-effort */ }
  return data.access_token;
}

export function base64urlEncode(input) {
  let str;
  if (typeof input === "string") {
    str = btoa(input);
  } else {
    str = btoa(String.fromCharCode.apply(null, input));
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function importPrivateKey(pem) {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/* ───────────── CMCteams : secrets vérifiés ICI, jamais sur les téléphones (27.09.2026) ─────────────
   Mesuré ce jour : /cmcteams/cmc_pw (hash rapides, sel fixe) et /cmcteams/cmc_verif_codes (codes à
   6 chiffres EN CLAIR) étaient lisibles par n'importe quel visiteur (jeton anonyme). Ils déménagent
   dans /cmcteams_secret (illisible par tout téléphone ; les codes au rôle admin seulement) :
   - /login-cmc lit le hash au secret ;
   - le code d'inscription est tiré, rangé et vérifié ICI ; l'admin le voit dans son écran. */
export const CMC_ADMIN_UID = "U11804";
export function cmcIdOk(uid) { return typeof uid === "string" && /^[A-Za-z0-9_-]{2,40}$/.test(uid); }

/** Lecture / écriture RTDB au compte de service (les règles ne s'appliquent pas à lui). */
export async function rtdb(env, ctx, method, path, body) {
  let token;
  try { token = await getGoogleAccessToken(env, ctx); } catch (e) { return { ok: false, status: 0, detail: "sa_" + String(e.message || e).slice(0, 60) }; }
  const url = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app/${path}.json?access_token=${encodeURIComponent(token)}`;
  const init = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(url, init);
  if (!r.ok) return { ok: false, status: r.status, detail: `rtdb_${method.toLowerCase()}_${r.status}` };
  const t = await r.text();
  let value = null;
  try { value = t ? JSON.parse(t) : null; } catch (_) { value = cleanFbVal(t); }
  return { ok: true, status: r.status, value };
}

/** 6 chiffres tirés au hasard cryptographique (sans biais de modulo). */
export function genCode6() {
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= 4294000000);
  return String(a[0] % 1000000).padStart(6, "0");
}
/** Comparaison en temps constant (longueur comprise). */
export function ctEq(a, b) {
  a = String(a || ""); b = String(b || "");
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
async function limite(env, cle, max, ttl) {
  const n = parseInt((await env.AUTH_KV.get(cle)) || "0", 10);
  if (n >= max) return false;
  await env.AUTH_KV.put(cle, String(n + 1), { expirationTtl: ttl });
  return true;
}
const CODE_TTL_MS = 15 * 60 * 1000, CODE_ESSAIS_MAX = 5;

/**
 * POST /cmc/code/new {uid, email, nom, prenom} → {ok, expiresAt}. Le code n'est JAMAIS renvoyé :
 * il part au secret, où l'écran admin le lit (rôle admin). Refusé pour un compte déjà validé
 * (sinon le code servirait à ouvrir la session de quelqu'un d'autre) et pour l'admin.
 */
export async function cmcCodeNew(body, request, env, ctx) {
  const uid = body && body.uid;
  if (!cmcIdOk(uid)) return [{ ok: false, error: "bad_uid" }, 400];
  if (uid === CMC_ADMIN_UID) return [{ ok: false, error: "refuse" }, 403];
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await limite(env, `rcn:${ip}`, 10, 3600)) || !(await limite(env, `rcu:${uid}`, 5, 3600))) {
    return [{ ok: false, error: "rate_limited", retry_after: 3600 }, 429];
  }
  const reg = await rtdb(env, ctx, "GET", `cmcteams/cmc_reg/${encodeURIComponent(uid)}`);
  if (!reg.ok) return [{ ok: false, error: reg.detail || "rtdb" }, 502];
  if (reg.value && (reg.value.verified === true || reg.value.verifiedByAdmin === true)) return [{ ok: false, error: "deja_valide" }, 409];
  const txt = (v, n) => String(v == null ? "" : v).slice(0, n);
  const now = Date.now();
  const entry = { code: genCode6(), email: txt(body.email, 120), nom: txt(body.nom, 60), prenom: txt(body.prenom, 60), createdAt: now, expiresAt: now + CODE_TTL_MS, used: false, essais: 0 };
  const w = await rtdb(env, ctx, "PUT", `cmcteams_secret/codes/${encodeURIComponent(uid)}`, entry);
  if (!w.ok) return [{ ok: false, error: w.detail || "rtdb" }, 502];
  ctx.waitUntil(auditLog(env, uid, "cmc_code_new", ip));
  return [{ ok: true, expiresAt: entry.expiresAt }, 200];
}

/**
 * POST /cmc/pw/recreer {uid, nom, prenom, password} → {ok, id_token?, custom_token?} (Kevin 6.10.2026 : « Oui, s'ils
 * sont présents dans les imports ou la banque de données »).
 * MESURÉ le 5.10 : le déménagement des mots de passe du 27.09 n'en a rangé qu'UN au secret ; les autres collègues
 * tombaient sur « compte inconnu » et devaient attendre un code de Kevin. Ici, la personne recrée SON mot de passe,
 * SEULEMENT si :
 *   1. le serveur ne lui connaît AUCUN mot de passe (on n'écrase jamais celui de quelqu'un : sinon, connaître le nom
 *      et le matricule d'un collègue suffirait à lui voler son compte) ;
 *   2. prénom + nom + matricule sont ensemble dans la BANQUE (cmcteams/cmc_e) ou dans les IMPORTS (planning publié,
 *      vérifié par le domaine /__dep/membre) ;
 *   3. essais limités (10 / heure par adresse, 5 / heure par compte) ; jamais pour l'admin.
 * Le hash (v2, sel aléatoire) part au secret ; la copie publique ne garde qu'un repère ; la session s'ouvre comme
 * /login-cmc. Journalisé (cmc_pw_recreer) ; l'app prévient Kevin.
 */
/* La demande, nettoyée : matricule en majuscules, nom et prénom bornés. */
function demandeRecreer(body) {
  return { uid: String(body?.uid || "").trim().toUpperCase(), nom: String(body?.nom || "").slice(0, 60),
    prenom: String(body?.prenom || "").slice(0, 60), pw: String(body?.password || "") };
}
/* Ce qui est refusé avant même de toucher à la base. Rend [corps, statut] ou null. */
function refusRecreer(d) {
  if (!/^U\d{3,6}$/.test(d.uid)) return [{ ok: false, error: "bad_uid" }, 400];
  if (d.uid === CMC_ADMIN_UID) return [{ ok: false, error: "refuse" }, 403];
  if (d.pw.length < 6 || d.pw.length > 128) return [{ ok: false, error: "mot_de_passe_trop_court" }, 400];
  return null;
}
/* Prénom + nom + matricule dans la BANQUE (cmcteams/cmc_e), sinon dans les IMPORTS (planning publié, domaine). */
async function presentBanqueOuImports(env, ctx, d) {
  const banque = await rtdb(env, ctx, "GET", "cmcteams/cmc_e");
  if (banque.ok && dansLaBanque(banque.value, d.uid, d.nom, d.prenom)) return true;
  try {
    const r = await fetch(env.CMC_MEMBRE_URL || "https://kd-mc.com/__dep/membre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matricule: d.uid, nom: d.nom, prenom: d.prenom }) });
    const j = r.ok ? await r.json().catch(() => null) : null;
    return j?.ok === true;
  } catch (_) {
    return false;   /* domaine muet : la banque seule a décidé (non) */
  }
}
/* Range le nouveau hash au secret (repère seul dans la copie publique) et ouvre la session, comme /login-cmc. */
async function rangerEtOuvrir(env, ctx, d, ip) {
  const sel = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  const w = await rtdb(env, ctx, "PUT", `cmcteams_secret/pw/${encodeURIComponent(d.uid)}`, { h: hashPwV2(d.pw, sel), setBy: "recreation", setAt: now });
  if (!w.ok) return [{ ok: false, error: w.detail || "rtdb" }, 502];
  await rtdb(env, ctx, "PUT", `cmcteams/cmc_pw/${encodeURIComponent(d.uid)}`, { set: true, setBy: "recreation", setAt: now });
  ctx.waitUntil(auditLog(env, d.uid, "cmc_pw_recreer", ip));
  const customToken = await generateCustomToken(d.uid, env, "cmc");
  const out = { ok: true, uid: d.uid, scope: "cmc", custom_token: customToken, expires_in: 3600 };
  const idt = await exchangeForIdToken(customToken, env);
  if (idt) { out.id_token = idt.idToken; out.refresh_token = idt.refreshToken; out.expires_in = Number.parseInt(idt.expiresIn, 10) || 3600; }
  return [out, 200];
}
export async function cmcPwRecreer(body, request, env, ctx) {
  const d = demandeRecreer(body);
  const refus = refusRecreer(d);
  if (refus) return refus;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await limite(env, `rpr:${ip}`, 10, 3600)) || !(await limite(env, `rpu:${d.uid}`, 5, 3600))) {
    return [{ ok: false, error: "rate_limited", retry_after: 3600 }, 429];
  }
  const deja = await readCmcPw(d.uid, env, ctx);
  if (deja.ok) return [{ ok: false, error: "deja_un_mot_de_passe" }, 409];
  if (deja.status !== 404) return [{ ok: false, error: deja.detail || "rtdb" }, 502];
  if (!(await presentBanqueOuImports(env, ctx, d))) return [{ ok: false, error: "absent" }, 403];
  return rangerEtOuvrir(env, ctx, d, ip);
}

/**
 * POST /cmc/code/check {uid, code} → {ok, id_token?, refresh_token?, custom_token?}. Vérifie ICI,
 * 5 essais par code, marque le code utilisé, valide la fiche (verified) et ouvre la session du compte.
 */
export async function cmcCodeCheck(body, request, env, ctx) {
  const uid = body && body.uid, code = String((body && body.code) || "").trim();
  if (!cmcIdOk(uid) || !/^\d{6}$/.test(code)) return [{ ok: false, error: "bad_input" }, 400];
  if (uid === CMC_ADMIN_UID) return [{ ok: false, error: "refuse" }, 403];
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await limite(env, `rcc:${ip}`, 20, 900))) return [{ ok: false, error: "rate_limited", retry_after: 900 }, 429];
  const p = `cmcteams_secret/codes/${encodeURIComponent(uid)}`;
  const g = await rtdb(env, ctx, "GET", p);
  if (!g.ok) return [{ ok: false, error: g.detail || "rtdb" }, 502];
  const e = g.value;
  if (!e || !e.code) return [{ ok: false, error: "aucun_code" }, 404];
  if (e.used) return [{ ok: false, error: "deja_utilise" }, 409];
  if (Date.now() > (+e.expiresAt || 0)) return [{ ok: false, error: "expire" }, 410];
  if ((+e.essais || 0) >= CODE_ESSAIS_MAX) return [{ ok: false, error: "trop_essais" }, 429];
  if (!ctEq(code, e.code)) {
    await rtdb(env, ctx, "PATCH", p, { essais: (+e.essais || 0) + 1 });
    return [{ ok: false, error: "code_incorrect", restants: CODE_ESSAIS_MAX - (+e.essais || 0) - 1 }, 401];
  }
  const now = Date.now();
  const u = await rtdb(env, ctx, "PATCH", p, { used: true, usedAt: now });
  if (!u.ok) return [{ ok: false, error: u.detail || "rtdb" }, 502];
  await rtdb(env, ctx, "PATCH", `cmcteams/cmc_reg/${encodeURIComponent(uid)}`, { verified: true, verifiedAt: now });
  ctx.waitUntil(auditLog(env, uid, "cmc_code_ok", ip));
  const customToken = await generateCustomToken(uid, env, "cmc");
  const out = { ok: true, uid, scope: "cmc", custom_token: customToken, expires_in: 3600 };
  const idt = await exchangeForIdToken(customToken, env);
  if (idt) { out.id_token = idt.idToken; out.refresh_token = idt.refreshToken; out.expires_in = parseInt(idt.expiresIn, 10) || 3600; }
  return [out, 200];
}
