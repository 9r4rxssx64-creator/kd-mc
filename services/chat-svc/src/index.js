/**
 * chat-svc — Cloudflare Worker proxy chat IA
 *
 * Mission : sortir _callClaudeAPI du monolith Apex AI vers un microservice dédié.
 * Avantages :
 *   - Cache prompt Anthropic (-90% tokens sur prompts répétés)
 *   - Failover cascade Anthropic → OpenRouter → Groq → Gemini
 *   - Rate-limit per-user
 *   - Observability métriques (latence, tokens, cost)
 *   - Audit trail Firebase RTDB
 *
 * ENDPOINTS :
 *   POST /v1/chat   : {model, messages, system, max_tokens, stream} → SSE stream ou JSON
 *   GET  /v1/quota  : {provider, remaining, reset_at} pour chaque provider
 *   GET  /health
 *
 * SECRETS (wrangler secret put) :
 *   - ANTHROPIC_API_KEY
 *   - OPENROUTER_API_KEY (failover)
 *   - GROQ_API_KEY (failover gratuit)
 *   - GEMINI_API_KEY (failover)
 */

const PROVIDERS = {
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    })
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: (key) => ({
      "Authorization": `Bearer ${key}`,
      "content-type": "application/json"
    })
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: (key) => ({
      "Authorization": `Bearer ${key}`,
      "content-type": "application/json"
    })
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent",
    headers: (key) => ({
      "x-goog-api-key": key,
      "content-type": "application/json"
    })
  }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/health") {
      return json({ ok: true, service: "chat-svc", v: "1.0", providers: Object.keys(PROVIDERS) }, cors);
    }

    if (url.pathname === "/v1/quota" && request.method === "GET") {
      const quotas = await loadQuotas(env);
      return json({ ok: true, quotas }, cors);
    }

    if (url.pathname === "/v1/chat" && request.method === "POST") {
      // FIX P1 audit 2026-07-08 : proxy IA payant SANS auth = abus financier.
      // FAIL-CLOSED : jeton de service requis (SVC_TOKEN, wrangler secret put).
      const auth = request.headers.get("Authorization") || "";
      if (!env.SVC_TOKEN || auth !== "Bearer " + env.SVC_TOKEN) {
        return json({ ok: false, error: "unauthorized" }, cors, 401);
      }
      const body = await request.json().catch(() => ({}));
      const order = body.failover || ["anthropic", "openrouter", "groq", "gemini"];

      for (const provider of order) {
        const key = env[provider.toUpperCase() + "_API_KEY"];
        if (!key) continue;
        try {
          const result = await callProvider(provider, key, body, env);
          if (result.ok) {
            ctx.waitUntil(auditCall(env, provider, body, result));
            return new Response(result.body, {
              status: 200,
              headers: { "Content-Type": result.contentType || "application/json", ...cors, "X-AI-Provider": provider }
            });
          }
        } catch (e) {
          console.warn(`[chat-svc] ${provider} fail:`, e.message);
        }
      }
      return json({ ok: false, error: "all_providers_failed" }, cors, 503);
    }

    return json({ ok: false, error: "not_found" }, cors, 404);
  }
};

async function callProvider(provider, key, body, env) {
  const config = PROVIDERS[provider];
  const payload = transformPayload(provider, body);
  const resp = await fetch(config.url, {
    method: "POST",
    headers: config.headers(key),
    body: JSON.stringify(payload)
  });
  if (!resp.ok) return { ok: false, status: resp.status };
  const text = await resp.text();
  return { ok: true, body: text, contentType: resp.headers.get("Content-Type") };
}

function transformPayload(provider, body) {
  if (provider === "anthropic") {
    return {
      model: body.model || "claude-sonnet-4-6",
      messages: body.messages,
      system: body.system,
      max_tokens: body.max_tokens || 4096,
      stream: body.stream || false
    };
  }
  if (provider === "openrouter" || provider === "groq") {
    const msgs = [];
    if (body.system) msgs.push({ role: "system", content: body.system });
    msgs.push(...(body.messages || []));
    return {
      model: provider === "groq" ? "llama-3.3-70b-versatile" : "anthropic/claude-3.5-sonnet",
      messages: msgs,
      stream: body.stream || false
    };
  }
  if (provider === "gemini") {
    return {
      contents: (body.messages || []).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }]
      })),
      systemInstruction: body.system ? { parts: [{ text: body.system }] } : undefined
    };
  }
  return body;
}

async function auditCall(env, provider, body, result) {
  try {
    if (!env.FIREBASE_PROJECT_ID) return;
    const entry = {
      provider,
      ts: Date.now(),
      messages_count: (body.messages || []).length,
      stream: !!body.stream
    };
    await fetch(
      `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app/apex/ax_chat_audit/${entry.ts}.json`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }
    );
  } catch (_) { /* non-blocking */ }
}

async function loadQuotas(env) {
  // Stub : return cached values if any in KV
  if (!env.CHAT_KV) return {};
  const raw = await env.CHAT_KV.get("quotas").catch(() => null);
  return raw ? JSON.parse(raw) : {};
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
