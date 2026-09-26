/**
 * kdmc-ais — relais AIS MONDIAL pour World Monitor (kd-mc.com). SANS Durable Object.
 *
 * POURQUOI SANS DO : le Durable Object (même en SQLite) faisait échouer le démarrage du
 * worker sur ce compte Cloudflare → error code 1042 sur toutes les requêtes (4 fixes DO
 * essayés, tous KO — voir leçon #133). Ici, PAS de DO : /ships ouvre une WebSocket COURTE
 * vers aisstream.io au moment de la requête, collecte ~5 s de positions, puis renvoie du
 * GeoJSON. Plus lent (~5 s/appel) mais robuste et compatible plan FREE.
 *
 *   GET /health           → {ok:true, hasKey:<bool>, mode:"no-do", ts}
 *   GET /ships?bbox=minLon,minLat,maxLon,maxLat&limit=800&secs=5 → FeatureCollection GeoJSON
 *   OPTIONS               → préflight CORS
 *
 * SÉCURITÉ (règles CLAUDE.md) :
 * - La clé aisstream reste un SECRET Cloudflare (env.AISSTREAM_KEY) — JAMAIS exposée au client.
 * - Anti open-proxy : navigateur autorisé uniquement depuis une Origin whitelist.
 * - FAIL-OPEN : sans clé (ou erreur), /ships renvoie une FeatureCollection VIDE (200) → la
 *   page bascule proprement sur Digitraffic (Baltique). Aucune panne, aucune régression.
 *
 * URL prod : https://kdmc-ais.9r4rxssx64.workers.dev  (sous-domaine du COMPTE — leçon #85)
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
function json(obj, origin, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, cors(origin)),
  });
}

// Ouvre une WebSocket COURTE vers aisstream.io, collecte les positions pendant `ms`
// millisecondes (ou jusqu'à `cap` navires), puis ferme. Retourne un tableau de positions.
async function collectShips(key, ms, cap) {
  const resp = await fetch("https://stream.aisstream.io/v0/stream", { headers: { Upgrade: "websocket" } });
  const ws = resp.webSocket;
  if (!ws) throw new Error("aisstream: pas de webSocket dans la réponse");
  ws.accept();
  try { ws.binaryType = "arraybuffer"; } catch (e) {} // recevoir le binaire en ArrayBuffer (pas Blob)
  // APIKey nettoyée (un espace/retour collé dans le secret casserait l'abonnement).
  // BoundingBoxes = monde entier, chaque box = [[latSW,lonSW],[latNE,lonNE]] (format aisstream).
  ws.send(JSON.stringify({ APIKey: String(key).trim(), BoundingBoxes: [[[-90, -180], [90, 180]]] }));
  const ships = new Map();
  const dec = new TextDecoder();
  const debug = { msgs: 0, firstRaw: "", dataType: "", closeCode: null, closeReason: "" };
  const toText = (d) => {
    if (typeof d === "string") return d;
    if (d instanceof ArrayBuffer) return dec.decode(d);
    if (d && d.buffer instanceof ArrayBuffer) return dec.decode(d); // TypedArray (Uint8Array…)
    return null; // Blob ou inconnu → traité à part
  };
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; try { ws.close(); } catch (e) {} resolve(); };
    const timer = setTimeout(finish, ms);
    const handle = (txt) => {
      try {
        if (!debug.firstRaw && txt) debug.firstRaw = txt.slice(0, 220);
        const m = JSON.parse(txt);
        // aisstream : MetaData.{MMSI,ShipName,latitude,longitude} + Message.PositionReport.{Latitude,Longitude,Sog,Cog}
        const meta = m && m.MetaData;
        const pr = m && m.Message && (m.Message.PositionReport || m.Message.StandardClassBPositionReport);
        const lat = pr ? (pr.Latitude != null ? pr.Latitude : (meta && meta.latitude)) : (meta && meta.latitude);
        const lon = pr ? (pr.Longitude != null ? pr.Longitude : (meta && meta.longitude)) : (meta && meta.longitude);
        if (!meta || lat == null || lon == null) return;
        const mmsi = String(meta.MMSI || "");
        if (!mmsi) return;
        ships.set(mmsi, { lat, lon, sog: pr && pr.Sog, cog: pr && pr.Cog, name: (meta.ShipName || "").trim() });
        if (ships.size >= cap) { clearTimeout(timer); finish(); }
      } catch (e) {}
    };
    ws.addEventListener("message", (ev) => {
      debug.msgs++;
      if (!debug.dataType) debug.dataType = typeof ev.data === "string" ? "string" : (ev.data && ev.data.constructor && ev.data.constructor.name) || Object.prototype.toString.call(ev.data);
      const txt = toText(ev.data);
      if (txt != null) { handle(txt); return; }
      // Blob (ou autre) → conversion asynchrone en texte.
      if (ev.data && typeof ev.data.arrayBuffer === "function") {
        ev.data.arrayBuffer().then((ab) => handle(dec.decode(ab))).catch(() => {});
      } else if (ev.data && typeof ev.data.text === "function") {
        ev.data.text().then((t) => handle(t)).catch(() => {});
      }
    });
    ws.addEventListener("close", (ev) => { debug.closeCode = ev && ev.code; debug.closeReason = (ev && ev.reason) || ""; clearTimeout(timer); finish(); });
    ws.addEventListener("error", () => { clearTimeout(timer); finish(); });
  });
  const list = [...ships.entries()].map(([mmsi, s]) => Object.assign({ mmsi }, s));
  return { ships: list, debug };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    const hasKey = !!(env.AISSTREAM_KEY && String(env.AISSTREAM_KEY).length > 8);

    if (url.pathname === "/health") {
      return json({ ok: true, hasKey, mode: "no-do", ts: Date.now() }, origin);
    }

    if (url.pathname === "/ships") {
      // FAIL-OPEN : toute erreur → FeatureCollection vide + note → World Monitor bascule Digitraffic.
      if (!hasKey) return json({ type: "FeatureCollection", features: [], note: "AISSTREAM_KEY manquant" }, origin);
      const bbox = (url.searchParams.get("bbox") || "").split(",").map(Number);
      const hasBox = bbox.length === 4 && bbox.every((n) => Number.isFinite(n));
      const limit = Math.max(1, Math.min(2000, parseInt(url.searchParams.get("limit") || "1500", 10) || 1500));
      const secs = Math.max(1, Math.min(15, parseInt(url.searchParams.get("secs") || "6", 10) || 6));
      try {
        const { ships, debug } = await collectShips(env.AISSTREAM_KEY, secs * 1000, limit + 500);
        const feats = [];
        for (const s of ships) {
          if (hasBox && (s.lon < bbox[0] || s.lon > bbox[2] || s.lat < bbox[1] || s.lat > bbox[3])) continue;
          feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { mmsi: s.mmsi, sog: s.sog, cog: s.cog, name: s.name } });
          if (feats.length >= limit) break;
        }
        // Diagnostic TOUJOURS remonté (msgs reçus, 1er message brut, code de fermeture) — jamais la clé.
        return json({ type: "FeatureCollection", features: feats, count: feats.length, debug }, origin);
      } catch (e) {
        return json({ type: "FeatureCollection", features: [], note: "aisstream indisponible: " + String((e && e.message) || e) }, origin);
      }
    }

    return json({ ok: false, error: "not_found", endpoints: ["/health", "/ships?bbox=…"] }, origin, 404);
  },
};
