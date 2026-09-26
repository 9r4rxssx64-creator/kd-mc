/* ============================================================
   Coffre-fort R2 Worker — stockage chiffré de fichiers de TOUTE taille.
   Le worker ne reçoit et ne renvoie QUE du chiffré (E2E côté client).
   Routes:
     PUT    /v1/chunk/:id   body = payload chiffré (CFENC1:...)  -> stocke dans R2
     GET    /v1/chunk/:id                                         -> renvoie le payload
     DELETE /v1/chunk/:id                                         -> supprime
     GET    /health                                               -> {ok:true}
   Sécurité:
     - CORS allowlist stricte (github.io du repo + localhost).
     - Token d'app optionnel (env.COFFRE_PUBLIC_TOKEN) en Bearer (défense en profondeur).
     - Les données sont déjà chiffrées AES-256 côté client : le worker ne voit jamais le clair.
   ============================================================ */
const ALLOW_ORIGINS = [
  "https://9r4rxssx64-creator.github.io",
  "http://localhost",
  "http://127.0.0.1"
];
const MAX_BYTES = 200 * 1024 * 1024; // 200 Mo / objet (chunké côté client au besoin)

function originAllowed(origin) {
  if (!origin) return false;
  return ALLOW_ORIGINS.some((o) => origin === o || origin.startsWith(o + ":") || origin.startsWith(o + "/"));
}
function corsHeaders(origin) {
  const allow = originAllowed(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", ...corsHeaders(origin) }
  });
}
function safeId(raw) {
  // n'autorise que des ids du type it_xxx / u_xxx / [a-zA-Z0-9_-], jamais de path traversal
  const id = decodeURIComponent(raw || "");
  return /^[A-Za-z0-9_\-]{3,128}$/.test(id) ? id : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (path === "/health") {
      return json({ ok: true, service: "coffre-r2", r2: !!env.COFFRE_BUCKET, ts: Date.now() }, 200, origin);
    }

    // CORS gate (navigateur uniquement depuis origine de confiance)
    if (origin && !originAllowed(origin)) {
      return json({ error: "forbidden", detail: "origin not allowed: " + origin }, 403, origin);
    }
    // Token d'app optionnel
    if (env.COFFRE_PUBLIC_TOKEN) {
      const auth = request.headers.get("Authorization") || "";
      if (auth !== "Bearer " + env.COFFRE_PUBLIC_TOKEN) {
        return json({ error: "unauthorized", detail: "missing/invalid bearer token" }, 401, origin);
      }
    }
    if (!env.COFFRE_BUCKET) {
      return json({ error: "no_bucket", detail: "R2 binding COFFRE_BUCKET absent (déploiement)" }, 500, origin);
    }

    const m = path.match(/^\/v1\/chunk\/(.+)$/);
    if (!m) return json({ error: "not_found", detail: path }, 404, origin);
    const id = safeId(m[1]);
    if (!id) return json({ error: "bad_id", detail: "id invalide" }, 400, origin);
    const key = "chunk/" + id;

    try {
      if (request.method === "PUT") {
        const buf = await request.arrayBuffer();
        if (buf.byteLength > MAX_BYTES) {
          return json({ error: "too_large", detail: "max " + MAX_BYTES + " bytes/objet" }, 413, origin);
        }
        await env.COFFRE_BUCKET.put(key, buf);
        return json({ ok: true, id, size: buf.byteLength }, 200, origin);
      }
      if (request.method === "GET") {
        const obj = await env.COFFRE_BUCKET.get(key);
        if (!obj) return json({ error: "not_found", detail: id }, 404, origin);
        const body = await obj.text(); // payload = chaîne CFENC1:...
        return new Response(body, { status: 200, headers: { "content-type": "text/plain", ...corsHeaders(origin) } });
      }
      if (request.method === "DELETE") {
        await env.COFFRE_BUCKET.delete(key);
        return json({ ok: true, id }, 200, origin);
      }
      return json({ error: "method", detail: request.method }, 405, origin);
    } catch (e) {
      return json({ error: "internal", detail: (e && e.message) || String(e) }, 500, origin);
    }
  }
};
