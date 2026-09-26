/**
 * wm-quotes — mini worker Cloudflare pour le panneau Bourse de World Monitor.
 *
 * SÉCURITÉ / ISOLATION (règles CLAUDE.md) :
 * - La clé FINNHUB_API_KEY reste UNIQUEMENT côté worker (secret wrangler),
 *   jamais dans la page publique.
 * - Lecture seule, liste de symboles FIGÉE (aucune entrée utilisateur → pas d'abus).
 * - Cache edge 60s → max ~6 appels Finnhub/min (quota gratuit 60/min largement OK).
 * - Worker DÉDIÉ (isolation max) : ne touche à aucun autre worker/secret Apex.
 *
 * URL prod : https://wm-quotes.9r4rxssx64.workers.dev  (sous-domaine du COMPTE — leçon #85)
 */

const SYMS = [
  ["S&P 500 (SPY)", "SPY"],
  ["Nasdaq (QQQ)", "QQQ"],
  ["Apple", "AAPL"],
  ["Nvidia", "NVDA"],
  ["Tesla", "TSLA"],
  ["France (EWQ)", "EWQ"],
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(obj, extra, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json" }, CORS, extra || {}),
  });
}

export default {
  async fetch(req, env, ctx) {
    // Capture GLOBALE : toute exception devient un JSON avec la cause EXACTE
    // (règle CLAUDE.md « détailler les erreurs partout ») — jamais une page 11xx opaque.
    try {
      return await handle(req, env, ctx);
    } catch (e) {
      return json({ error: "exception", detail: String((e && e.message) || e), stack: String((e && e.stack) || "").slice(0, 300) }, null, 500);
    }
  },
};

async function handle(req, env, ctx) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return json({ ok: true, hasKey: !!env.FINNHUB_API_KEY, service: "wm-quotes" });
  }
  if (url.pathname !== "/quotes") return json({ error: "not_found" }, null, 404);
  if (!env.FINNHUB_API_KEY) {
    return json({ error: "no_key", detail: "Secret FINNHUB_API_KEY manquant sur le worker wm-quotes" }, null, 503);
  }

  // Cache edge 60s : tout le monde partage la même réponse (best-effort).
  const cacheKey = new Request(url.origin + "/quotes-v1");
  let cache = null;
  try {
    cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      Object.entries(CORS).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
  } catch (e) { cache = null; }

  const errors = [];
  const results = await Promise.all(
    SYMS.map(async ([label, sym]) => {
      try {
        const r = await fetch("https://finnhub.io/api/v1/quote?symbol=" + sym + "&token=" + env.FINNHUB_API_KEY);
        const body = await r.text();
        let q = null;
        try { q = JSON.parse(body); } catch (pe) { errors.push(sym + ": HTTP " + r.status + " " + body.slice(0, 80)); return null; }
        if (q && typeof q.c === "number" && q.c > 0) {
          return { label, sym, price: q.c, changePct: typeof q.dp === "number" ? q.dp : null };
        }
        errors.push(sym + ": HTTP " + r.status + " " + body.slice(0, 80));
        return null;
      } catch (e) {
        errors.push(sym + ": " + String((e && e.message) || e).slice(0, 100));
        return null;
      }
    })
  );

  const quotes = results.filter(Boolean);
  const payload = { quotes, ts: Date.now() };
  if (!quotes.length) payload.errors = errors.slice(0, 6); // cause exacte visible si tout échoue
  const resp = json(payload, { "Cache-Control": "public, max-age=60" });
  if (cache && quotes.length) { try { ctx.waitUntil(cache.put(cacheKey, resp.clone())); } catch (e) {} }
  return resp;
}
