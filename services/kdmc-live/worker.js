/**
 * kdmc-live — relais LIVE multi-sources pour World Monitor (kd-mc.com/worldmonitor/).
 * Modèle : tools/cloudflare/kdmc-ais-proxy (kdmc-ais). SANS Durable Object.
 *
 * POURQUOI SANS DO : le Durable Object (même SQLite) fait échouer le démarrage du worker
 * sur ce compte Cloudflare → error code 1042 sur toutes les requêtes (leçons #132/#133).
 * Ici : WebSocket COURTE ouverte AU MOMENT de la requête (foudre), fetch serveur simple
 * (cyclones, feux). Compatible plan FREE, zéro état persistant.
 *
 *   GET /health     → {ok:true, endpoints:[...], hasFirmsKey:<bool>, mode:"no-do", ts}
 *   GET /lightning  → foudre temps réel Blitzortung (WS courte ~5 s) → {strikes:[{lat,lon,time}], debug}
 *   GET /cyclones   → relais CORS de https://www.nhc.noaa.gov/CurrentStorms.json (cache ~10 min)
 *   GET /fires?bbox=w,s,e,n → NASA FIRMS VIIRS_SNPP_NRT (24 h) → FeatureCollection GeoJSON
 *   GET /cve?limit=N → relais CORS de https://cvedb.shodan.io/cves (classé EPSS, sans clé) → {cves:[…]}
 *   GET /planes?lat=&lon=&radius= → relais CORS avions adsb.lol→airplanes.live → {ac:[…]}
 *   OPTIONS         → préflight CORS
 *
 * SÉCURITÉ (règles CLAUDE.md, leçon #130) :
 * - FIRMS_MAP_KEY = SECRET Cloudflare (env), JAMAIS renvoyé au client (ni dans debug).
 * - Anti open-proxy : CORS whitelist Origins (kd-mc.com / *.kd-mc.com / github.io / localhost).
 * - FAIL-OPEN : sans clé FIRMS → FeatureCollection VIDE (200) + debug.noKey:true ; toute
 *   erreur source → réponse vide 200 + note. Foudre + cyclones marchent SANS AUCUNE clé.
 * - Toujours renvoyer un OBJET {…, debug:{…}} — jamais un array décoré (leçon #133 :
 *   une propriété non-index sur un array est perdue au JSON.stringify).
 *
 * URL prod : https://kdmc-live.9r4rxssx64.workers.dev  (sous-domaine du COMPTE — leçon #85)
 */

const ORIGIN_OK = [
  /^https?:\/\/kd-mc\.com$/i,
  /^https?:\/\/[a-z0-9-]+\.kd-mc\.com$/i,
  /^https?:\/\/9r4rxssx64-creator\.github\.io$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];

function cors(origin) {
  const allow = origin && ORIGIN_OK.some((re) => re.test(origin)) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(obj, origin, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign(
      { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      cors(origin),
      extraHeaders || {}
    ),
  });
}

/* ============================== /lightning (Blitzortung) ============================== */

// Décodeur LZW "maison" Blitzortung (dictionnaire dynamique sur chaînes) — implémentation
// défensive du decode() connu du JS public de blitzortung.org. Si le flux est déjà du JSON
// clair, on ne passe PAS par ici (on tente JSON.parse d'abord).
function lzwDecode(b) {
  try {
    if (!b || typeof b !== "string" || b.length < 2) return null;
    const dict = {};
    const data = b.split("");
    let currChar = data[0];
    let oldPhrase = currChar;
    const out = [currChar];
    let code = 256;
    let phrase;
    for (let i = 1; i < data.length; i++) {
      const currCode = data[i].charCodeAt(0);
      if (currCode < 256) {
        phrase = data[i];
      } else {
        phrase = dict[currCode] ? dict[currCode] : oldPhrase + currChar;
      }
      out.push(phrase);
      currChar = phrase.charAt(0);
      dict[code] = oldPhrase + currChar;
      code++;
      oldPhrase = phrase;
    }
    return out.join("");
  } catch (e) {
    return null;
  }
}

// Parse une frame Blitzortung : JSON clair d'abord, sinon décodage LZW puis JSON.
function parseStrikeFrame(txt) {
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (e) { /* pas du JSON clair */ }
  const decoded = lzwDecode(txt);
  if (decoded == null) return null;
  try { return JSON.parse(decoded); } catch (e) { return null; }
}

// Serveurs publics Blitzortung (essayés dans l'ordre — le protocole/les hosts peuvent
// changer, d'où l'instrumentation debug OBLIGATOIRE dans la réponse, leçon #133).
const BLITZ_HOSTS = [
  "https://ws1.blitzortung.org:443/",
  "https://ws7.blitzortung.org:443/",
  "https://ws8.blitzortung.org:443/",
  "https://ws3.blitzortung.org:443/",
];

// WebSocket COURTE : collecte ~ms millisecondes d'éclairs puis ferme (pas de DO, leçon #133).
async function collectLightning(host, ms, cap) {
  const strikes = [];
  const dec = new TextDecoder();
  const debug = { host, msgs: 0, parsed: 0, firstRaw: "", dataType: "", closeCode: null, closeReason: "" };
  const resp = await fetch(host, { headers: { Upgrade: "websocket" } });
  const ws = resp.webSocket;
  if (!ws) throw new Error("blitzortung: pas de webSocket dans la réponse (" + host + ")");
  ws.accept();
  try { ws.binaryType = "arraybuffer"; } catch (e) {} // binaire en ArrayBuffer, jamais Blob (leçon #133)
  // Abonnement : le client web Blitzortung envoie {"a":111} après connexion.
  try { ws.send(JSON.stringify({ a: 111 })); } catch (e) {}
  const toText = (d) => {
    if (typeof d === "string") return d;
    if (d instanceof ArrayBuffer) return dec.decode(d);
    if (d && d.buffer instanceof ArrayBuffer) return dec.decode(d); // TypedArray
    return null; // Blob ou inconnu → traité en asynchrone
  };
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; try { ws.close(); } catch (e) {} resolve(); };
    const timer = setTimeout(finish, ms);
    const handle = (txt) => {
      try {
        if (!debug.firstRaw && txt) debug.firstRaw = txt.slice(0, 220);
        const m = parseStrikeFrame(txt);
        if (!m) return;
        // Frame éclair : {time (ns epoch), lat, lon, …} — défensif sur les noms de champs.
        const lat = m.lat != null ? m.lat : m.latitude;
        const lon = m.lon != null ? m.lon : m.longitude;
        if (typeof lat !== "number" || typeof lon !== "number") return;
        // time = nanosecondes epoch chez Blitzortung → ms ; défensif si déjà en ms/s.
        let t = m.time != null ? Number(m.time) : Date.now();
        if (t > 1e17) t = Math.round(t / 1e6);       // ns → ms
        else if (t > 1e14) t = Math.round(t / 1e3);  // µs → ms
        else if (t < 1e11 && t > 1e9) t = t * 1000;  // s → ms
        strikes.push({ lat, lon, time: t });
        debug.parsed++;
        if (strikes.length >= cap) { clearTimeout(timer); finish(); }
      } catch (e) {}
    };
    ws.addEventListener("message", (ev) => {
      debug.msgs++;
      if (!debug.dataType) debug.dataType = typeof ev.data === "string" ? "string" : (ev.data && ev.data.constructor && ev.data.constructor.name) || Object.prototype.toString.call(ev.data);
      const txt = toText(ev.data);
      if (txt != null) { handle(txt); return; }
      if (ev.data && typeof ev.data.arrayBuffer === "function") {
        ev.data.arrayBuffer().then((ab) => handle(dec.decode(ab))).catch(() => {});
      } else if (ev.data && typeof ev.data.text === "function") {
        ev.data.text().then((t) => handle(t)).catch(() => {});
      }
    });
    ws.addEventListener("close", (ev) => { debug.closeCode = ev && ev.code; debug.closeReason = (ev && ev.reason) || ""; clearTimeout(timer); finish(); });
    ws.addEventListener("error", () => { clearTimeout(timer); finish(); });
  });
  return { strikes, debug };
}

async function handleLightning(url, origin) {
  const cap = Math.max(1, Math.min(2000, parseInt(url.searchParams.get("limit") || "2000", 10) || 2000));
  const secs = Math.max(2, Math.min(10, parseInt(url.searchParams.get("secs") || "5", 10) || 5));
  const attempts = [];
  for (const host of BLITZ_HOSTS) {
    try {
      const { strikes, debug } = await collectLightning(host, secs * 1000, cap);
      attempts.push(debug);
      // Succès si on a parsé des éclairs, OU si le serveur a répondu (msgs>0) même sans
      // éclair parsé (instrumentation honnête : firstRaw dira la cause exacte).
      if (strikes.length > 0 || debug.msgs > 0) {
        return json({ strikes, count: strikes.length, debug: { tried: attempts.length, last: debug, attempts } }, origin);
      }
    } catch (e) {
      attempts.push({ host, error: String((e && e.message) || e) });
    }
  }
  // FAIL-OPEN : aucune connexion exploitable → réponse vide 200 + diagnostic complet.
  return json({ strikes: [], count: 0, debug: { tried: attempts.length, attempts, note: "blitzortung indisponible ou protocole changé — voir attempts" } }, origin);
}

/* ============================== /cyclones (NOAA NHC) ============================== */

const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
const CYCLONES_TTL = 600; // 10 min

async function handleCyclones(request, origin) {
  // Fetch DIRECT de NHC (pas de caches.default ni d'options cf:{} — NHC est lui-même
  // derrière Cloudflare, et un fetch Worker→zone-Cloudflare avec cacheEverything peut
  // jeter une erreur edge 1104, cf. leçons #132/#133). Cache géré par le navigateur
  // via Cache-Control. Tout échec = fail-open (structure NHC vide + cause exacte).
  try {
    const r = await fetch(NHC_URL, { headers: { "user-agent": "kdmc-live-worker (kd-mc.com World Monitor)", "accept": "application/json" } });
    const txt = await r.text();
    if (!r.ok) {
      return json({ activeStorms: [], debug: { upstreamStatus: r.status, body: txt.slice(0, 300) } }, origin);
    }
    let parsed;
    try { parsed = JSON.parse(txt); } catch (e) {
      return json({ activeStorms: [], debug: { note: "NHC a renvoyé du non-JSON", firstRaw: txt.slice(0, 300) } }, origin);
    }
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: Object.assign(
        { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + CYCLONES_TTL },
        cors(origin)
      ),
    });
  } catch (e) {
    return json({ activeStorms: [], debug: { error: String((e && e.message) || e) } }, origin);
  }
}

/* ============================== /cve (Shodan CVEDB) ============================== */

// Relais CORS de cvedb.shodan.io — la meilleure source de vulnérabilités publiques SANS clé,
// classée par risque EPSS, mais qui BLOQUE le CORS navigateur (bruit console côté World Monitor
// + OSINT). Ici, fetch serveur simple → réponse renvoyée telle quelle au client. Cache court.
// FAIL-OPEN : toute erreur/amont non-200 → {cves:[]} 200 + debug (cause exacte), jamais un 5xx.
const CVE_TTL = 600; // 10 min
async function handleCve(url, origin) {
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "25", 10) || 25));
  const upstream = "https://cvedb.shodan.io/cves?limit=" + limit + "&sort_by_epss=true";
  try {
    const r = await fetch(upstream, { headers: { "accept": "application/json", "user-agent": "kdmc-live-worker (kd-mc.com World Monitor)" } });
    const txt = await r.text();
    if (!r.ok) return json({ cves: [], debug: { upstreamStatus: r.status, body: txt.slice(0, 300) } }, origin);
    let parsed;
    try { parsed = JSON.parse(txt); } catch (e) {
      return json({ cves: [], debug: { note: "CVEDB a renvoyé du non-JSON", firstRaw: txt.slice(0, 300) } }, origin);
    }
    // Passthrough {cves:[…]} avec cache navigateur court.
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: Object.assign(
        { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + CVE_TTL },
        cors(origin)
      ),
    });
  } catch (e) {
    return json({ cves: [], debug: { error: String((e && e.message) || e) } }, origin);
  }
}

/* ============================== /planes (adsb.lol / airplanes.live) ============================== */

// Relais CORS des avions temps réel. adsb.lol ET airplanes.live BLOQUENT le CORS navigateur
// (vérifié par la vérif live — l'hypothèse « adsb.lol CORS-OK » était fausse). Ici, fetch
// serveur simple → {ac:[…]} renvoyé au client. Repli adsb.lol → airplanes.live. FAIL-OPEN.
const PLANES_TTL = 20; // 20 s (avions = 15-20 s de fraîcheur)
async function handlePlanes(url, origin) {
  const lat = parseFloat(url.searchParams.get("lat"));
  const lon = parseFloat(url.searchParams.get("lon"));
  const radius = Math.max(1, Math.min(250, parseInt(url.searchParams.get("radius") || "250", 10) || 250));
  const la = Number.isFinite(lat) ? lat : 46, lo = Number.isFinite(lon) ? lon : 7;
  const sources = [
    "https://api.adsb.lol/v2/point/" + la + "/" + lo + "/" + radius,
    "https://api.airplanes.live/v2/point/" + la + "/" + lo + "/" + radius,
  ];
  const attempts = [];
  for (const src of sources) {
    try {
      const r = await fetch(src, { headers: { "accept": "application/json", "user-agent": "kdmc-live-worker (kd-mc.com World Monitor)" } });
      const txt = await r.text();
      if (!r.ok) { attempts.push({ src, status: r.status }); continue; }
      let parsed;
      try { parsed = JSON.parse(txt); } catch (e) { attempts.push({ src, note: "non-JSON", firstRaw: txt.slice(0, 120) }); continue; }
      const ac = (parsed && Array.isArray(parsed.ac)) ? parsed.ac : [];
      return new Response(JSON.stringify({ ac, count: ac.length, src, debug: { attempts } }), {
        status: 200,
        headers: Object.assign(
          { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + PLANES_TTL },
          cors(origin)
        ),
      });
    } catch (e) {
      attempts.push({ src, error: String((e && e.message) || e) });
    }
  }
  // FAIL-OPEN : aucune source → {ac:[]} 200 + diagnostic.
  return json({ ac: [], count: 0, debug: { attempts, note: "adsb.lol + airplanes.live indisponibles" } }, origin);
}

/* ============================== /fires (NASA FIRMS) ============================== */

// Parse CSV FIRMS (header en 1re ligne) → tableau d'objets. Les champs FIRMS ne contiennent
// pas de virgules quotées → split simple suffit (défensif quand même sur les longueurs).
function parseCsv(txt) {
  const lines = String(txt || "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { header: lines[0] || "", rows: [] };
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 2) continue;
    const o = {};
    for (let j = 0; j < header.length && j < parts.length; j++) o[header[j]] = parts[j].trim();
    rows.push(o);
  }
  return { header: lines[0], rows };
}

async function handleFires(url, origin, env) {
  const key = env.FIRMS_MAP_KEY && String(env.FIRMS_MAP_KEY).trim();
  const hasKey = !!(key && key.length > 8);
  // FAIL-OPEN : sans clé → FeatureCollection vide 200 + debug.noKey (leçon #130).
  if (!hasKey) {
    return json({ type: "FeatureCollection", features: [], count: 0, debug: { noKey: true, note: "FIRMS_MAP_KEY manquant — crée la clé gratuite sur firms.modaps.eosdis.nasa.gov/api/map_key/" } }, origin);
  }
  // bbox = w,s,e,n (ordre FIRMS area API). Défaut : monde entier.
  let bbox = (url.searchParams.get("bbox") || "").split(",").map(Number);
  if (!(bbox.length === 4 && bbox.every((n) => Number.isFinite(n)))) bbox = [-180, -90, 180, 90];
  const cap = Math.max(1, Math.min(3000, parseInt(url.searchParams.get("limit") || "3000", 10) || 3000));
  const firmsUrl = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/" + encodeURIComponent(key) + "/VIIRS_SNPP_NRT/" + bbox.join(",") + "/1";
  try {
    const r = await fetch(firmsUrl, { cf: { cacheTtl: 600, cacheEverything: true } });
    const txt = await r.text();
    if (!r.ok) {
      // Cause exacte remontée (statut + corps tronqué) — JAMAIS la clé (elle est dans l'URL amont, pas dans la réponse).
      return json({ type: "FeatureCollection", features: [], count: 0, debug: { upstreamStatus: r.status, body: txt.slice(0, 300) } }, origin);
    }
    const { header, rows } = parseCsv(txt);
    const feats = [];
    for (const row of rows) {
      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          bright: row.bright_ti4 != null ? parseFloat(row.bright_ti4) : undefined,
          frp: row.frp != null ? parseFloat(row.frp) : undefined,
          confidence: row.confidence,
          date: row.acq_date,
          time: row.acq_time,
          daynight: row.daynight,
          satellite: row.satellite,
        },
      });
      if (feats.length >= cap) break;
    }
    return json({ type: "FeatureCollection", features: feats, count: feats.length, debug: { rows: rows.length, header: header.slice(0, 200), bbox } }, origin);
  } catch (e) {
    return json({ type: "FeatureCollection", features: [], count: 0, debug: { error: String((e && e.message) || e) } }, origin);
  }
}

/* ============================== router ============================== */

const ENDPOINTS = ["/health", "/lightning", "/cyclones", "/fires?bbox=w,s,e,n", "/cve?limit=25", "/planes?lat=46&lon=7&radius=250"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    const hasFirmsKey = !!(env.FIRMS_MAP_KEY && String(env.FIRMS_MAP_KEY).trim().length > 8);

    if (url.pathname === "/health") {
      return json({ ok: true, endpoints: ENDPOINTS, hasFirmsKey, mode: "no-do", ts: Date.now() }, origin);
    }
    // Chaque handler est enveloppé : toute exception → JSON fail-open (jamais une
    // page d'erreur edge Cloudflare 11xx, cf. leçon #133 — toujours un objet).
    try {
      if (url.pathname === "/lightning") return await handleLightning(url, origin);
      if (url.pathname === "/cyclones") return await handleCyclones(request, origin);
      if (url.pathname === "/fires") return await handleFires(url, origin, env);
      if (url.pathname === "/cve") return await handleCve(url, origin);
      if (url.pathname === "/planes") return await handlePlanes(url, origin);
    } catch (e) {
      return json({ ok: false, error: "handler_threw", detail: String((e && e.message) || e), path: url.pathname }, origin);
    }

    return json({ ok: false, error: "not_found", endpoints: ENDPOINTS }, origin, 404);
  },
};
