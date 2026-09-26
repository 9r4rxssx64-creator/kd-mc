/**
 * CMC Teams — Proxy Anthropic sécurisé (Cloudflare Workers)
 *
 * Ce worker protège votre clé API Anthropic en la gardant côté serveur.
 * L'app CMC Teams appelle ce proxy qui ajoute le header Authorization
 * et forward vers api.anthropic.com.
 *
 * ════════════════════════════════════════════════════════════════════
 * INSTALLATION (5 minutes, gratuit)
 * ════════════════════════════════════════════════════════════════════
 *
 * 1. Créez un compte gratuit sur https://dash.cloudflare.com (CB non requise)
 *
 * 2. Menu "Workers & Pages" → "Créer" → "Créer un Worker"
 *    Nom : "cmcteams-ia-proxy" (ou ce que vous voulez)
 *
 * 3. Copiez-collez TOUT ce fichier dans l'éditeur → "Déployer"
 *
 * 4. Allez dans "Settings" → "Variables and Secrets"
 *    Ajoutez une variable SECRÈTE (type: Encrypted) :
 *       Name  : ANTHROPIC_API_KEY
 *       Value : sk-ant-api03-xxxxxxxxxxxxxx (votre vraie clé)
 *
 * 5. Notez l'URL de votre worker :
 *    https://cmcteams-ia-proxy.VOTRE-USER.workers.dev
 *
 * 6. Dans l'app CMC Teams :
 *    - Allez dans 🤖 Aide IA
 *    - Cliquez sur 🔗 (config proxy)
 *    - Collez l'URL de votre worker
 *    - Cliquez sur 🔑 (config clé) et LAISSEZ VIDE pour supprimer la clé locale
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
 *
 * ⚠️  Le plan gratuit Cloudflare Workers = 100 000 requêtes/jour
 *     Largement suffisant pour CMC Teams (~2 000 requêtes/jour max)
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION — À ADAPTER
// ═══════════════════════════════════════════════════════════════════

// Domaines autorisés à appeler ce proxy (sécurité CORS)
// Remplacez par VOTRE domaine GitHub Pages
const ALLOW_ORIGINS = [
  "https://9r4rxssx64-creator.github.io",
  "http://localhost:8000",  // pour tests locaux
  "http://localhost:3000",
  "file://"                   // autoriser le chargement depuis file:// (dev)
];

// Modèle Anthropic par défaut (peut être overridé par le body)
const DEFAULT_MODEL = "claude-sonnet-4-5";

// Limite taille requête (protection abuse)
const MAX_BODY_SIZE = 500 * 1024; // 500 KB

// ═══════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, anthropic-version, x-api-key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Vérifier l'origine (sécurité)
    if (!ALLOW_ORIGINS.includes(origin)) { // FIX audit 2026-07-08 : Origin vide (curl) ne bypass plus
      return new Response(JSON.stringify({ error: "Origin not allowed", origin }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Seul POST autorisé
    if (request.method !== "POST") {
      return new Response("Method not allowed. Use POST.", { status: 405 });
    }

    // Vérifier que la clé API est configurée
    const API_KEY = env.ANTHROPIC_API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({
        error: "Clé API Anthropic non configurée sur le proxy",
        help: "Ajoutez ANTHROPIC_API_KEY dans Cloudflare Workers → Settings → Variables and Secrets"
      }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Lire le body avec limite
    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_SIZE) {
        return new Response("Request too large", { status: 413 });
      }
      body = JSON.parse(text);
    } catch (e) {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Validation minimale
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: "Missing 'messages' array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forcer un modèle si absent
    if (!body.model) body.model = DEFAULT_MODEL;

    // Forward vers Anthropic
    try {
      const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      // Renvoyer la réponse avec CORS
      const responseBody = await anthropicResponse.text();
      return new Response(responseBody, {
        status: anthropicResponse.status,
        headers: {
          "Content-Type": anthropicResponse.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
          "X-Proxy": "CMCTeams-v1",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: "Proxy error: " + err.message,
        type: "proxy_fetch_failed"
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
        },
      });
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// TESTS LOCAUX (optionnel)
// ═══════════════════════════════════════════════════════════════════
//
// curl -X POST https://cmcteams-ia-proxy.VOTRE-USER.workers.dev \
//   -H "Content-Type: application/json" \
//   -H "Origin: https://9r4rxssx64-creator.github.io" \
//   -d '{"model":"claude-sonnet-4-5","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
//
// Réponse attendue : objet avec "content":[{"text":"..."}]
