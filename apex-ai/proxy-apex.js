/**
 * KDMC — Proxy Anthropic sécurisé (Cloudflare Workers)
 *
 * Ce worker protège votre clé API Anthropic en la gardant côté serveur.
 * L'app KDMC appelle ce proxy qui ajoute le header Authorization
 * et forward vers api.anthropic.com.
 *
 * ════════════════════════════════════════════════════════════════════
 * DIFFÉRENCES avec le proxy CMCteams original
 * ════════════════════════════════════════════════════════════════════
 *
 * ✅ Streaming natif — le body de la réponse Anthropic est pipé
 *    directement vers le client (pas de await .text() bloquant)
 * ✅ MAX_BODY_SIZE = 1 MB (au lieu de 500 KB) pour Claude Vision
 * ✅ Header X-Proxy = "KDMC-AI-v1"
 * ✅ Modèle par défaut = claude-sonnet-4-6 (dernier en date)
 * ✅ Endpoint /health (GET) pour monitoring
 *
 * ════════════════════════════════════════════════════════════════════
 * INSTALLATION (5 minutes, gratuit)
 * ════════════════════════════════════════════════════════════════════
 *
 * 1. Créez un compte gratuit sur https://dash.cloudflare.com (CB non requise)
 *
 * 2. Menu "Workers & Pages" → "Créer" → "Créer un Worker"
 *    Nom : "apex-ai-proxy" (ou ce que vous voulez)
 *
 * 3. Copiez-collez TOUT ce fichier dans l'éditeur → "Déployer"
 *
 * 4. Allez dans "Settings" → "Variables and Secrets"
 *    Ajoutez une variable SECRÈTE (type: Encrypted) :
 *       Name  : ANTHROPIC_API_KEY
 *       Value : sk-ant-api03-xxxxxxxxxxxxxx (votre vraie clé)
 *
 * 5. Notez l'URL de votre worker :
 *    https://apex-ai-proxy.VOTRE-USER.workers.dev
 *
 * 6. Dans l'app KDMC :
 *    - Configurez l'URL du proxy dans les paramètres
 *    - La clé API reste UNIQUEMENT sur Cloudflare (jamais côté client)
 *
 * 7. ✅ Votre clé API n'est plus exposée côté client !
 *
 * ════════════════════════════════════════════════════════════════════
 * SÉCURITÉ
 * ════════════════════════════════════════════════════════════════════
 *
 * ✅ Clé API stockée UNIQUEMENT sur Cloudflare (chiffrée at-rest)
 * ✅ CORS restreint à votre domaine GitHub Pages (configurable ci-dessous)
 * ✅ Rate limiting possible (voir ALLOW_ORIGINS)
 * ✅ Logs Cloudflare accessibles pour audit
 * ✅ Streaming : pas de buffering mémoire côté worker
 *
 * ⚠️  Le plan gratuit Cloudflare Workers = 100 000 requêtes/jour
 *     Largement suffisant pour KDMC en usage normal
 *
 * ════════════════════════════════════════════════════════════════════
 * STREAMING
 * ════════════════════════════════════════════════════════════════════
 *
 * Ce proxy pipe directement le body de la réponse Anthropic vers le
 * client. Cela permet :
 *   - Le streaming SSE (Server-Sent Events) avec stream: true
 *   - L'affichage en temps réel des tokens générés
 *   - Une latence perçue beaucoup plus faible (premier token rapide)
 *   - Pas de limite mémoire sur la taille de la réponse
 *
 * Le client peut envoyer { "stream": true } dans le body pour activer
 * le streaming côté Anthropic. Le proxy est transparent dans les deux cas.
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION — À ADAPTER
// ═══════════════════════════════════════════════════════════════════

// Domaines autorisés à appeler ce proxy (sécurité CORS)
// Remplacez/ajoutez VOTRE domaine GitHub Pages ou domaine custom
const ALLOW_ORIGINS = [
  "https://9r4rxssx64-creator.github.io",
  "http://localhost:8000",  // pour tests locaux
  "http://localhost:3000"
];

// Modèle Anthropic par défaut (peut être overridé par le body)
const DEFAULT_MODEL = "claude-sonnet-4-6";

// Limite taille requête (1 MB pour supporter Claude Vision / images)
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// Version de l'API Anthropic
const ANTHROPIC_API_VERSION = "2023-06-01";

// Identifiant du proxy (header X-Proxy)
const PROXY_ID = "KDMC-AI-v1";

// ── Rate-limit par IP (anti-abus facturation Anthropic) ────────────────
// Fenêtre glissante en mémoire de l'isolate Worker. Volontairement GÉNÉREUX
// (60 req/min/IP) pour ne JAMAIS gêner un usage légitime ; vise uniquement
// l'abus massif. Best-effort : l'état mémoire est par-isolate (pas global
// Cloudflare) → suffisant comme garde-fou, complété par la CORS allowlist.
const RL_MAX_PER_MIN = 60;
const RL_WINDOW_MS = 60 * 1000;
const _rlHits = new Map(); // ip -> number[] (timestamps)

function rateLimited(request) {
  try {
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "unknown";
    const now = Date.now();
    const arr = (_rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
    arr.push(now);
    _rlHits.set(ip, arr);
    // Garde la Map bornée (évite fuite mémoire si beaucoup d'IPs distinctes).
    if (_rlHits.size > 5000) {
      for (const [k, v] of _rlHits) {
        if (v.length === 0 || now - v[v.length - 1] > RL_WINDOW_MS) _rlHits.delete(k);
      }
    }
    return arr.length > RL_MAX_PER_MIN;
  } catch {
    return false; // fail-open : un bug de rate-limit ne doit JAMAIS bloquer un user
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Construit les headers CORS pour une origine donnée.
 * Réutilisé dans toutes les réponses pour éviter la duplication.
 */
function corsHeaders(corsOrigin) {
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "X-Proxy": PROXY_ID,
  };
}

/**
 * Retourne une réponse JSON d'erreur avec les headers CORS.
 */
function jsonError(message, status, corsOrigin, extra = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(corsOrigin),
    },
  });
}

/**
 * Détermine l'origine CORS autorisée pour cette requête.
 * Si l'origin est dans la liste → on la renvoie telle quelle.
 * Sinon → on renvoie la première origine de la liste (refus implicite).
 */
function resolveCorsOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
}

// ═══════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsOrigin = resolveCorsOrigin(request);

    // ─────────────────────────────────────────────────────────────
    // Endpoint /health — monitoring et vérification de disponibilité
    // ─────────────────────────────────────────────────────────────
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok", proxy: PROXY_ID }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(corsOrigin),
        },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // CORS preflight (OPTIONS)
    // ─────────────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, anthropic-version, x-api-key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Vérification de l'origine (sécurité CORS)
    // ─────────────────────────────────────────────────────────────
    const origin = request.headers.get("Origin") || "";
    if (!ALLOW_ORIGINS.includes(origin)) { // FIX audit 2026-07-08 : Origin vide (curl) ne bypass plus
      return jsonError("Origin not allowed", 403, corsOrigin, { origin });
    }

    // ─────────────────────────────────────────────────────────────
    // Rate-limit par IP (anti-abus facturation) — 429 si dépassement
    // ─────────────────────────────────────────────────────────────
    if (rateLimited(request)) {
      return jsonError("Trop de requêtes, réessaie dans 1 minute", 429, corsOrigin, {
        retry_after_s: 60,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Seul POST autorisé (pour les messages Anthropic)
    // ─────────────────────────────────────────────────────────────
    if (request.method !== "POST") {
      return new Response("Method not allowed. Use POST.", {
        status: 405,
        headers: corsHeaders(corsOrigin),
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Vérifier que la clé API est configurée côté Cloudflare
    // ─────────────────────────────────────────────────────────────
    const API_KEY = env.ANTHROPIC_API_KEY;
    if (!API_KEY) {
      return jsonError(
        "Clé API Anthropic non configurée sur le proxy",
        500,
        corsOrigin,
        { help: "Ajoutez ANTHROPIC_API_KEY dans Cloudflare Workers → Settings → Variables and Secrets" }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Lire et valider le body de la requête
    // ─────────────────────────────────────────────────────────────
    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_SIZE) {
        return jsonError(
          "Request too large (max " + (MAX_BODY_SIZE / 1024) + " KB)",
          413,
          corsOrigin
        );
      }
      body = JSON.parse(text);
    } catch (e) {
      return jsonError("Invalid JSON", 400, corsOrigin);
    }

    // Validation minimale — le tableau messages est obligatoire
    if (!body.messages || !Array.isArray(body.messages)) {
      return jsonError("Missing 'messages' array", 400, corsOrigin);
    }

    // Forcer un modèle si absent dans la requête
    if (!body.model) body.model = DEFAULT_MODEL;

    // ─────────────────────────────────────────────────────────────
    // Forward vers l'API Anthropic (avec streaming natif)
    // ─────────────────────────────────────────────────────────────
    try {
      const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(body),
      });

      // Pipe directement le body de la réponse Anthropic vers le client.
      // Pas de await .text() — le streaming SSE fonctionne nativement.
      // Le Content-Type est transmis tel quel (application/json ou text/event-stream).
      return new Response(anthropicResponse.body, {
        status: anthropicResponse.status,
        headers: {
          ...corsHeaders(corsOrigin),
          "Content-Type": anthropicResponse.headers.get("Content-Type") || "application/json",
        },
      });
    } catch (err) {
      // Erreur réseau entre le worker et l'API Anthropic
      return jsonError(
        "Proxy error: " + err.message,
        502,
        corsOrigin,
        { type: "proxy_fetch_failed" }
      );
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// TESTS LOCAUX (optionnel)
// ═══════════════════════════════════════════════════════════════════
//
// --- Health check ---
// curl https://apex-ai-proxy.VOTRE-USER.workers.dev/health
// Réponse attendue : {"status":"ok","proxy":"KDMC-AI-v1"}
//
// --- Message simple (sans streaming) ---
// curl -X POST https://apex-ai-proxy.VOTRE-USER.workers.dev \
//   -H "Content-Type: application/json" \
//   -H "Origin: https://9r4rxssx64-creator.github.io" \
//   -d '{"model":"claude-sonnet-4-6","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
//
// Réponse attendue : objet avec "content":[{"text":"..."}]
//
// --- Message avec streaming ---
// curl -N -X POST https://apex-ai-proxy.VOTRE-USER.workers.dev \
//   -H "Content-Type: application/json" \
//   -H "Origin: https://9r4rxssx64-creator.github.io" \
//   -d '{"model":"claude-sonnet-4-6","max_tokens":100,"stream":true,"messages":[{"role":"user","content":"Hello"}]}'
//
// Réponse attendue : flux SSE (event: message_start, content_block_delta, ...)
//
// --- Message avec image (Claude Vision) ---
// curl -X POST https://apex-ai-proxy.VOTRE-USER.workers.dev \
//   -H "Content-Type: application/json" \
//   -H "Origin: https://9r4rxssx64-creator.github.io" \
//   -d '{
//     "model":"claude-sonnet-4-6",
//     "max_tokens":300,
//     "messages":[{
//       "role":"user",
//       "content":[
//         {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"..."}},
//         {"type":"text","text":"Décris cette image"}
//       ]
//     }]
//   }'
