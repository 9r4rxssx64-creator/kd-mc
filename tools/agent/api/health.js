// Endpoint de test sans auth — vérifie que l'agent est déployé ET que l'auth
// Firebase (compte de service) fonctionne réellement.
// URL : /api/health
//
// Sonde Firebase (Kevin 2026-07-15 « tjs opérationnel ? » + captures crash 401) :
// on tente une VRAIE lecture RTDB authentifiée (shallow, minuscule) via le même
// gauth que l'agent → distingue « cause racine réparée » (200) de « seul le spam
// supprimé » (401 = compte de service absent/invalide sur Vercel).
// Aucune valeur secrète n'est exposée : uniquement des booléens + le status HTTP.
//
// build-marker 2026-07-15e : sonde structurelle de la clé (dit si le corps base64
// décode en RSA valide ou si le secret est corrompu) + candidats KeyObject DER +
// diag par variante. Aucune valeur secrète exposée (l'en-tête d'algo prefix16 est
// identique pour toutes les clés RSA → non secret).
import { createSign } from "node:crypto";
import {
  getFirebaseAccessToken,
  keyCandidates,
  keyStructure,
} from "../lib/gauth.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE =
  "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email";
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Mint diagnostique : sonde structurelle + essaie CHAQUE candidat de clé et
// rapporte, par candidat, si la signature OpenSSL passe et le status HTTP du mint.
// Ne renvoie jamais la clé ni le token — uniquement des métadonnées de diagnostic.
async function diagMint(clientEmail, privateKeyRaw) {
  const d = {
    email_present: !!clientEmail,
    structure: keyStructure(privateKeyRaw),
    variants: [],
  };
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
    for (const cand of keyCandidates(privateKeyRaw)) {
      const v = { name: cand.name, key_type: typeof cand.key };
      let assertion;
      try {
        const signer = createSign("RSA-SHA256");
        signer.update(signingInput);
        signer.end();
        assertion = `${signingInput}.${b64url(signer.sign(cand.key))}`;
        v.sign_ok = true;
      } catch (se) {
        v.sign_ok = false;
        v.sign_error = String((se && se.message) || se).slice(0, 120);
        d.variants.push(v);
        continue;
      }
      const r = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
      });
      v.token_http = r.status;
      if (r.ok) {
        v.token_ok = true;
        d.winner = cand.name;
        d.variants.push(v);
        break; // un format marche → inutile d'essayer les autres
      }
      v.token_error = (await r.text()).slice(0, 160);
      d.variants.push(v);
    }
  } catch (e) {
    d.diag_error = String((e && e.message) || e).slice(0, 160);
  }
  return d;
}

export default async function handler(req, res) {
  const hasClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
  const hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;
  const FB_URL =
    process.env.FB_URL ||
    "https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app";

  let firebase = { probe: "skipped" };
  try {
    const token = await getFirebaseAccessToken(
      process.env.FIREBASE_CLIENT_EMAIL || "",
      process.env.FIREBASE_PRIVATE_KEY || "",
    );
    // shallow=true → réponse minuscule (clés de 1er niveau en booléens).
    const qs = token
      ? `?shallow=true&access_token=${encodeURIComponent(token)}`
      : "?shallow=true";
    const r = await fetch(`${FB_URL}/cmcteams.json${qs}`);
    firebase = {
      token_minted: !!token,
      read_status: r.status,
      read_ok: r.ok,
      verdict: r.ok
        ? "OK — auth Firebase fonctionne (plus de crash 401)"
        : `HTTP ${r.status} — auth Firebase KO (compte de service manquant/invalide)`,
    };
    // Si le mint a échoué mais les creds sont présents → diag granulaire.
    if (!token && hasClientEmail && hasPrivateKey) {
      firebase.mint_diag = await diagMint(
        process.env.FIREBASE_CLIENT_EMAIL,
        process.env.FIREBASE_PRIVATE_KEY,
      );
    }
  } catch (e) {
    firebase = { probe: "error", error: String((e && e.message) || e) };
  }

  res.status(200).json({
    ok: true,
    agent: "kdmc-bot-2026",
    timestamp: new Date().toISOString(),
    message:
      "Agent KDMC en ligne. Utilise /api/cron?secret=...&trigger=manual pour lancer les tâches.",
    env_check: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
        ? "set (" + process.env.ANTHROPIC_API_KEY.slice(0, 8) + "...)"
        : "MISSING",
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? "set" : "MISSING",
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID
        ? "set (" + process.env.TELEGRAM_CHAT_ID + ")"
        : "MISSING",
      AGENT_SECRET: process.env.AGENT_SECRET
        ? "set (" + process.env.AGENT_SECRET.length + " chars)"
        : "NOT SET (auth disabled)",
      FIREBASE_CLIENT_EMAIL: hasClientEmail ? "set" : "MISSING",
      FIREBASE_PRIVATE_KEY: hasPrivateKey ? "set" : "MISSING",
    },
    firebase,
  });
}
