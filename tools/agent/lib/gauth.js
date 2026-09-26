// gauth.js — Mint un access_token Google OAuth2 depuis un compte de service
// (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY), SANS dépendance externe.
//
// Sert à authentifier les appels REST Firebase RTDB de l'agent KDMC : la base
// exige désormais `auth != null` → un GET non authentifié = HTTP 401 (crash).
// Un access_token de compte de service contourne les règles (accès admin).
//
// Fail-open : si les creds manquent ou si l'échange échoue → renvoie '' (l'appelant
// fait alors un appel non authentifié, comme avant — pas de throw).

import { createSign, createPrivateKey } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE =
  "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email";

let cachedToken = "";
let cachedExp = 0;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Normalise la chaîne brute (guillemets encadrants, \n/\r littéraux, \r Windows).
function normalizeRaw(raw) {
  let s = String(raw || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");
}

/**
 * Construit une LISTE de candidats de clé à essayer dans l'ordre (le 1er qui
 * signe ET mint un token gagne → self-healing quel que soit le format stocké).
 * Chaque `key` est soit un PEM (string), soit un KeyObject Node (DER/auto-détecté).
 * @returns {{name:string, key:(string|import('node:crypto').KeyObject)}[]}
 */
export function keyCandidates(raw) {
  const s = normalizeRaw(raw);
  const out = [];

  // 1) Tel quel — PEM déjà armuré (cas normal). Non-régression.
  out.push({ name: "asis", key: s });

  // 2) Auto-détection Node (tolère PKCS#1/PKCS#8, armures variées).
  try {
    out.push({ name: "auto", key: createPrivateKey(s) });
  } catch (_) {
    /* pas un PEM lisible tel quel */
  }

  // 3) base64(PEM entier) : PEM ré-encodé base64.
  try {
    const dec = Buffer.from(s.replace(/\s+/g, ""), "base64").toString("utf8");
    if (dec.includes("BEGIN") && dec.includes("PRIVATE KEY")) {
      out.push({ name: "b64pem", key: dec });
      try {
        out.push({ name: "b64pem-obj", key: createPrivateKey(dec) });
      } catch (_) {
        /* ignore */
      }
    }
  } catch (_) {
    /* ignore */
  }

  // 4) Corps base64 nu (armure retirée) → décoder en DER + re-wrap PEM.
  if (!s.includes("BEGIN")) {
    const body = s.replace(/[^A-Za-z0-9+/=]/g, "");
    if (body.length > 100) {
      // 4a) DER direct via KeyObject (le plus robuste : pas de dépendance à
      //     l'armure/au wrap de lignes).
      try {
        const der = Buffer.from(body, "base64");
        for (const type of ["pkcs8", "pkcs1"]) {
          try {
            out.push({
              name: "der-" + type,
              key: createPrivateKey({ key: der, format: "der", type }),
            });
          } catch (_) {
            /* format suivant */
          }
        }
      } catch (_) {
        /* base64 invalide */
      }
      // 4b) Re-wrap PEM (secours si le KeyObject DER n'a pas été construit).
      const wrapped = (body.match(/.{1,64}/g) || []).join("\n");
      out.push({
        name: "rewrap-pkcs8",
        key: `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`,
      });
      out.push({
        name: "rewrap-pkcs1",
        key: `-----BEGIN RSA PRIVATE KEY-----\n${wrapped}\n-----END RSA PRIVATE KEY-----\n`,
      });
    }
  }
  return out;
}

// Ancien nom conservé pour compat (renvoie uniquement les candidats string PEM).
export function pemCandidates(raw) {
  return keyCandidates(raw).filter((c) => typeof c.key === "string");
}

/**
 * Diagnostic structurel NON secret de la clé stockée : dit si le corps base64
 * décode réellement en une clé RSA valide (ou si le secret est corrompu/tronqué).
 * Le préfixe d'en-tête d'algo est identique pour TOUTES les clés RSA PKCS#8 →
 * l'exposer ne révèle rien de secret.
 */
export function keyStructure(raw) {
  try {
    const s = normalizeRaw(raw);
    const body = s.replace(/[^A-Za-z0-9+/=]/g, "");
    const der = Buffer.from(body, "base64");
    const st = {
      raw_len: s.length,
      has_begin: s.includes("BEGIN"),
      body_len: body.length,
      prefix16: body.slice(0, 16), // en-tête d'algo (non secret)
      der_len: der.length,
    };
    for (const t of ["pkcs8", "pkcs1", "sec1"]) {
      try {
        createPrivateKey({ key: der, format: "der", type: t });
        st["der_" + t] = "OK";
      } catch (e) {
        st["der_" + t] = String((e && e.message) || e).slice(0, 40);
      }
    }
    try {
      createPrivateKey(s);
      st.auto_pem = "OK";
    } catch (e) {
      st.auto_pem = String((e && e.message) || e).slice(0, 40);
    }
    return st;
  } catch (e) {
    return { err: String((e && e.message) || e).slice(0, 80) };
  }
}

// Signe l'assertion JWT avec une clé candidate (PEM string ou KeyObject).
// Renvoie l'assertion ou null (sign KO).
function signAssertion(clientEmail, key) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({
        iss: clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signingInput = `${header}.${claims}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${b64url(signer.sign(key))}`;
  } catch (_) {
    return null;
  }
}

/**
 * @returns {Promise<string>} access_token valide (>60s), ou '' (fail-open).
 */
export async function getFirebaseAccessToken(clientEmail, privateKey) {
  try {
    if (!clientEmail || !privateKey) return "";
    // Token encore valide en cache (marge 60s) → réutiliser.
    if (cachedToken && cachedExp > Date.now() + 60_000) return cachedToken;

    // Essaie chaque format de clé jusqu'à ce qu'un mint réussisse (self-healing).
    for (const cand of keyCandidates(privateKey)) {
      const assertion = signAssertion(clientEmail, cand.key);
      if (!assertion) continue; // ce format ne signe pas → suivant
      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      });
      const r = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!r.ok) {
        console.warn(`[gauth] token exchange HTTP ${r.status} (variant ${cand.name})`);
        continue; // signé localement mais Google refuse → autre format
      }
      const data = await r.json();
      if (data && data.access_token) {
        cachedToken = data.access_token;
        cachedExp = Date.now() + (Number(data.expires_in) || 3600) * 1000;
        return cachedToken;
      }
    }
    return "";
  } catch (e) {
    console.warn("[gauth] mint failed (fail-open):", e && e.message);
    return "";
  }
}
