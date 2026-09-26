/**
 * kdmc-clone — moteur de lecture / clone de sites web pour Kevin + Apex.
 *
 * Récupère une page publique CÔTÉ SERVEUR (le worker n'a pas les restrictions réseau
 * d'un navigateur ni du sandbox) et la renvoie sous 4 formes :
 *   /read?url=   → texte lisible + markdown (nav/scripts retirés)
 *   /html?url=   → HTML brut
 *   /clone?url=  → HTML "portable" : URLs absolutisées + <base> → 1 fichier qui s'ouvre seul
 *   /meta?url=   → titre, description, og:image, favicon, liens internes, technos détectées
 *
 * SÉCURITÉ (règles CLAUDE.md — cet endpoint fetch des URLs arbitraires) :
 * - Anti open-proxy : navigateur autorisé UNIQUEMENT depuis une Origin de la whitelist
 *   (kd-mc.com, *.kd-mc.com, github.io, localhost). Usage serveur (sans Origin) refusé
 *   sauf en-tête X-Clone-Token == secret CLONE_TOKEN (opt-in, non requis pour le navigateur).
 * - Anti-SSRF : http/https uniquement ; hôtes privés/loopback/metadata bloqués.
 * - Taille de réponse plafonnée (4 Mo) ; timeout 15 s.
 * - Lecture seule, aucune donnée stockée.
 *
 * URL prod : https://kdmc-clone.9r4rxssx64.workers.dev  (sous-domaine du COMPTE — leçon #85)
 */

const ORIGIN_OK = [
  /^https?:\/\/kd-mc\.com$/i,
  /^https?:\/\/[a-z0-9-]+\.kd-mc\.com$/i,
  /^https?:\/\/9r4rxssx64-creator\.github\.io$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];
const MAX_BYTES = 4 * 1024 * 1024;

function cors(origin) {
  const allow = origin && ORIGIN_OK.some((re) => re.test(origin)) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-clone-token",
    "Vary": "Origin",
  };
}
function json(obj, origin, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, cors(origin), extra || {}),
  });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    try { return await handle(req, env, origin); }
    catch (e) { return json({ error: "exception", detail: String((e && e.message) || e) }, origin, 500); }
  },
};

// Bloque loopback / réseaux privés / metadata (anti-SSRF, défense en profondeur).
function hostBlocked(host) {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "metadata.google.internal") return true;
  return false;
}

function authorize(req, env, origin) {
  if (origin) return ORIGIN_OK.some((re) => re.test(origin)); // navigateur : whitelist Origin
  // Pas d'Origin (usage serveur) : autorisé seulement si un token est configuré ET fourni.
  const tok = env.CLONE_TOKEN;
  return !!tok && req.headers.get("X-Clone-Token") === tok;
}

async function handle(req, env, origin) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const url = new URL(req.url);
  const mode = url.pathname.replace(/^\//, "") || "read";

  if (mode === "health") return json({ ok: true, service: "kdmc-clone", hasToken: !!env.CLONE_TOKEN }, origin);
  if (["read", "html", "clone", "meta"].indexOf(mode) < 0) return json({ error: "not_found", detail: "modes: read|html|clone|meta|health" }, origin, 404);

  if (!authorize(req, env, origin)) {
    return json({ error: "forbidden", detail: "Origin non autorisée (navigateur : kd-mc.com/github.io/localhost) ou token serveur manquant." }, origin, 403);
  }

  const target = url.searchParams.get("url");
  if (!target) return json({ error: "missing_url", detail: "Paramètre ?url= requis" }, origin, 400);
  let t;
  try { t = new URL(target); } catch (e) { return json({ error: "bad_url", detail: "URL invalide : " + target }, origin, 400); }
  if (t.protocol !== "http:" && t.protocol !== "https:") return json({ error: "bad_scheme", detail: "http/https uniquement" }, origin, 400);
  if (hostBlocked(t.hostname)) return json({ error: "blocked_host", detail: "Hôte privé/loopback interdit : " + t.hostname }, origin, 400);

  // Fetch cible, timeout 15 s, taille plafonnée.
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  let r, buf;
  try {
    r = await fetch(t.toString(), {
      signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KDMC-Clone/1.0; +https://kd-mc.com)", "Accept": "text/html,*/*" },
    });
    const reader = r.body.getReader(); const chunks = []; let n = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length; if (n > MAX_BYTES) { try { reader.cancel(); } catch (e) {} break; }
      chunks.push(value);
    }
    buf = new Uint8Array(n > MAX_BYTES ? MAX_BYTES : n);
    let off = 0; for (const c of chunks) { if (off + c.length > buf.length) { buf.set(c.subarray(0, buf.length - off), off); break; } buf.set(c, off); off += c.length; }
  } catch (e) {
    clearTimeout(to);
    return json({ error: "fetch_failed", detail: (e && e.name === "AbortError") ? "Timeout 15 s" : String((e && e.message) || e), url: t.toString() }, origin, 502);
  }
  clearTimeout(to);
  const ct = r.headers.get("content-type") || "";
  const html = new TextDecoder("utf-8").decode(buf);

  if (mode === "html") {
    return new Response(html, { status: 200, headers: Object.assign({ "content-type": "text/plain; charset=utf-8" }, cors(origin)) });
  }
  if (mode === "clone") {
    return new Response(portableClone(html, t), { status: 200, headers: Object.assign({ "content-type": "text/plain; charset=utf-8" }, cors(origin)) });
  }
  if (mode === "meta") return json(extractMeta(html, t, r.status, ct), origin);
  // read
  const rd = readable(html);
  return json({ url: t.toString(), status: r.status, title: rd.title, text: rd.text, markdown: rd.markdown, words: rd.words }, origin);
}

/* --------- helpers de parsing (regex légères, pas de DOM côté worker) --------- */
function absolutize(html, base) {
  // src/href relatifs → absolus (pour clone + affichage correct)
  return html.replace(/\b(src|href)\s*=\s*("|')(?!https?:|data:|mailto:|#|\/\/)([^"']*)\2/gi, function (m, attr, q, val) {
    try { return attr + "=" + q + new URL(val, base).toString() + q; } catch (e) { return m; }
  });
}
function portableClone(html, base) {
  let out = absolutize(html, base);
  // injecte un <base> pour tout ce qui reste relatif
  if (!/<base\b/i.test(out)) out = out.replace(/<head([^>]*)>/i, '<head$1><base href="' + base.toString() + '">');
  return out;
}
function stripTag(html, tag) { return html.replace(new RegExp("<" + tag + "[\\s\\S]*?</" + tag + ">", "gi"), " "); }
function decodeEnt(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (m, d) { try { return String.fromCodePoint(+d); } catch (e) { return m; } });
}
function readable(html) {
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = tm ? decodeEnt(tm[1]).trim() : "";
  let body = html.match(/<body[\s\S]*?<\/body>/i); body = body ? body[0] : html;
  body = stripTag(body, "script"); body = stripTag(body, "style"); body = stripTag(body, "noscript");
  body = stripTag(body, "svg"); body = stripTag(body, "nav"); body = stripTag(body, "footer"); body = stripTag(body, "header");
  // markdown grossier : titres, liens, paragraphes
  let md = body
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, function (m, n, t) { return "\n" + "#".repeat(+n) + " " + decodeEnt(t.replace(/<[^>]+>/g, "")).trim() + "\n"; })
    .replace(/<a[^>]*href=("|')(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, function (m, q, href, t) { const tx = decodeEnt(t.replace(/<[^>]+>/g, "")).trim(); return tx ? "[" + tx + "](" + href + ")" : ""; })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, function (m, t) { return "\n- " + decodeEnt(t.replace(/<[^>]+>/g, "")).trim(); })
    .replace(/<(p|div|section|article|br)[^>]*>/gi, "\n");
  md = decodeEnt(md.replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const text = md.replace(/[#*\[\]()]/g, "").replace(/\n{2,}/g, "\n").trim();
  return { title, markdown: md, text, words: (text.match(/\S+/g) || []).length };
}
function meta1(html, re) { const m = html.match(re); return m ? decodeEnt(m[1]).trim() : ""; }
function extractMeta(html, base, status, ct) {
  const title = meta1(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = meta1(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || meta1(html, /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const og = meta1(html, /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
  let fav = meta1(html, /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']*)["']/i);
  try { if (fav) fav = new URL(fav, base).toString(); } catch (e) {}
  const links = [], seen = {}, re = /<a[^>]*href=["']([^"'#]+)["']/gi; let m, n = 0;
  while ((m = re.exec(html)) && n < 100) { let u; try { u = new URL(m[1], base).toString(); } catch (e) { continue; } if (u.startsWith("http") && !seen[u]) { seen[u] = 1; links.push(u); n++; } }
  const internal = links.filter((u) => { try { return new URL(u).hostname === base.hostname; } catch (e) { return false; } });
  const tech = [];
  if (/wp-content|wp-includes/i.test(html)) tech.push("WordPress");
  if (/__NEXT_DATA__|\/_next\//.test(html)) tech.push("Next.js");
  if (/data-reactroot|react(-dom)?/i.test(html)) tech.push("React");
  if (/ng-version|angular/i.test(html)) tech.push("Angular");
  if (/cdn\.shopify\.com|Shopify\./i.test(html)) tech.push("Shopify");
  if (/gtag\(|googletagmanager/i.test(html)) tech.push("Google Tag");
  return { url: base.toString(), status, contentType: ct, title, description: desc, ogImage: og || "", favicon: fav || "", techno: tech, links: links.slice(0, 40), internalLinks: internal.slice(0, 40), linkCount: links.length };
}
