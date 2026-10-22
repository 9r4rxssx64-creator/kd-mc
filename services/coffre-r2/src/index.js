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
  /* Audit du domaine 22.10.2026 (pont 197, point 2) : kd-mc.com et ses sous-domaines étaient refusés (seul github.io passait). */
  if (/^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/.test(origin)) return true;
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

/* Laissez-passer du domaine : la page envoie `Authorization: Bearer <kdmc_sso_token>` ; on demande au routeur s'il est valide.
   On transmet le User-Agent (le routeur lie le pass à la famille d'appareil, cf. kdmc-vente requireAdmin). */
async function sessionDomaine(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S{16,}/.test(auth)) return { ok: false, status: 401, detail: "laissez-passer du domaine manquant", step: "auth_header" };
  try {
    const h = { Authorization: auth }; const ua = request.headers.get("user-agent"); if (ua) h["user-agent"] = ua;
    const r = await fetch("https://kd-mc.com/__sso/whoami", { headers: h, cache: "no-store" });
    if (!r.ok) return { ok: false, status: 401, detail: "session refusée (" + r.status + ")", step: "whoami_http" };
    const j = await r.json();
    if (!j || !j.ok) return { ok: false, status: 401, detail: "session invalide", step: "whoami_session" };
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 502, detail: "vérification impossible", step: "whoami_exc" };
  }
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
    /* 17.10.2026 (audit sécurité Cloudflare, mesuré) : sans COFFRE_PUBLIC_TOKEN posé, et sans en-tête Origin (curl), lire, DÉPOSER
       et EFFACER les fichiers du coffre était ouvert à n'importe qui. Désormais chaque requête doit porter soit le jeton serveur,
       soit le laissez-passer du domaine (kdmc_sso), vérifié auprès de https://kd-mc.com/__sso/whoami (session valide). */
    const auth = request.headers.get("Authorization") || "";
    const jetonServeur = env.COFFRE_PUBLIC_TOKEN && auth === "Bearer " + env.COFFRE_PUBLIC_TOKEN;
    if (!jetonServeur) {
      const s = await sessionDomaine(request);
      if (!s.ok) return json({ error: "unauthorized", detail: s.detail, step: s.step }, s.status, origin);
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
