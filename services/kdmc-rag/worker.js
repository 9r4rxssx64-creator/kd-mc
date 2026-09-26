/**
 * kdmc-rag — mémoire intelligente (RAG) d'Apex : embeddings Workers AI + rangement D1.
 * Modèle : services/kdmc-live (SANS Durable Object — leçons #132/#133, plan FREE OK).
 *
 * Les embeddings tournent DANS le worker (@cf/baai/bge-m3, multilingue → FR) → AUCUNE
 * clé externe.
 *
 * ⚠️ 22.09.2026 — POURQUOI CE N'EST PLUS VECTORIZE.
 * Ce service n'était plus déployé depuis le 8 juillet : la création de l'index Vectorize
 * échouait, et le worker ne pouvait pas partir sans elle. Mesuré ce jour-là, sans
 * supposition : le compte de Kevin est « Super Administrator — All Privileges », mais la
 * clé d'API qu'utilise GitHub (identifiant 1b93a11a…) reçoit un **HTTP 403 « Authentication
 * error », code 10000** dès qu'elle touche `/vectorize/v2/indexes`. Il aurait donc fallu
 * un geste de plus sur la bonne clé, à répéter le jour où elle change.
 * Décision de Kevin : « prends le gratuit, ne me demande rien. »
 *
 * D1 (la base SQL gratuite de Cloudflare) remplace Vectorize. Ce qui NE change pas :
 * l'intelligence (les empreintes de sens sont toujours calculées par Workers AI, gratuit),
 * la recherche par similarité, et les 4 routes ci-dessous — le client Apex n'a rien à
 * changer. Ce qui change : le tiroir de rangement, et le fait que ça coûte 0 €.
 * La comparaison se fait ici, dans le worker : pour quelques milliers de souvenirs c'est
 * instantané, et on lit par paquets pour ne jamais saturer la mémoire (voir PAGE/MAX_SCAN).
 *
 *   OPTIONS         → préflight CORS
 *   GET  /health    → {ok, hasVec, hasAI, model, dims, magasin, ts}
 *   POST /upsert    → {items:[{id,text,meta?}]} → embed + stocke → {upserted, debug}
 *   POST /query     → {text, topK?} → embed + recherche → {matches:[{id,score,text,meta}], debug}
 *   POST /forget    → {ids:[...]} → supprime → {deleted}
 *
 * SÉCURITÉ (règles CLAUDE.md) :
 * - AUTH obligatoire (mémoire perso) : header x-apex-pin = SHA-256 du PIN admin, comparé
 *   à env.APEX_ADMIN_PIN_SHA256. Tolère header==secret OU sha256(header)==secret (leçon #95).
 * - Anti open-proxy : CORS whitelist Origins (kd-mc.com / *.kd-mc.com / github.io / localhost).
 * - FAIL-OPEN CÔTÉ CLIENT : si le worker ou la base manque, le client Apex renvoie vide →
 *   Apex fonctionne comme aujourd'hui (0 régression). Le worker, lui, renvoie une erreur
 *   JSON claire (jamais un secret). Toujours un OBJET {…, debug} (leçon #133).
 *
 * URL prod : https://kdmc-rag.9r4rxssx64.workers.dev  (sous-domaine du COMPTE — leçon #85)
 */

const EMBED_MODEL = "@cf/baai/bge-m3"; // multilingue (FR), 1024 dims
const EMBED_DIMS = 1024;

/* Lecture par paquets : un paquet de 300 souvenirs ≈ 1,7 Mo de texte base64, très loin des
   limites du worker. MAX_SCAN borne le pire cas (une mémoire qui aurait trop grossi) : on
   préfère une réponse honnête et rapide à un worker qui tombe. */
const PAGE = 300;
const MAX_SCAN = 9000;

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-apex-pin",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(origin) },
  });
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Auth : header x-apex-pin doit valoir le SHA du PIN admin, OU son SHA (double-hash toléré). */
async function authOk(req, env) {
  const secret = env.APEX_ADMIN_PIN_SHA256 || "";
  if (!secret) return false; // pas de secret configuré → refuse (fail-closed côté auth)
  const h = req.headers.get("x-apex-pin") || "";
  if (!h) return false;
  if (h === secret) return true;
  try { return (await sha256Hex(h)) === secret; } catch { return false; }
}

async function embed(env, texts) {
  const r = await env.AI.run(EMBED_MODEL, { text: texts });
  // { shape:[n,dims], data:[[...],...] }
  return (r && r.data) || [];
}

/* ───────────────────────── le rangement des vecteurs ─────────────────────────
   On NORMALISE chaque vecteur à l'écriture (longueur 1). Du coup la similarité
   « cosinus » se réduit à un simple produit scalaire à la lecture : moins de calcul,
   et aucune racine carrée à refaire des milliers de fois par recherche.
   On range en base64 de Float32 : 1024 nombres = 4 096 octets = ~5,5 Ko de texte, qui
   traverse D1 sans surprise (un BLOB ne revient pas du même type selon les runtimes ;
   du texte, si). Ces fonctions sont PURES et exportées EXPRÈS : la garde les exécute
   pour de vrai, au lieu de relire le code (leçon « une garde qui lit ne prouve rien »). */

export function normaliser(arr) {
  const out = new Float32Array(arr.length);
  let somme = 0;
  for (let i = 0; i < arr.length; i++) somme += arr[i] * arr[i];
  const n = Math.sqrt(somme);
  if (!n || !isFinite(n)) return out; // vecteur nul → reste nul, jamais NaN
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / n;
  return out;
}

export function vecVersTexte(arr) {
  const f32 = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  const octets = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = "";
  for (let i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]);
  return btoa(s);
}

export function texteVersVec(txt) {
  const bin = atob(txt);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return new Float32Array(octets.buffer, octets.byteOffset, octets.byteLength / 4);
}

export function produitScalaire(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/* Garde les topK meilleurs sans jamais trier toute la mémoire. */
export function garderMeilleurs(liste, candidat, topK) {
  if (liste.length < topK) {
    liste.push(candidat);
    liste.sort((x, y) => y.score - x.score);
    return liste;
  }
  if (candidat.score <= liste[liste.length - 1].score) return liste;
  liste[liste.length - 1] = candidat;
  liste.sort((x, y) => y.score - x.score);
  return liste;
}

/* La table est créée à la demande : si la migration du workflow n'a pas tourné (ou si la
   base est recréée un jour), le service se répare seul au lieu de tomber. */
async function assurerTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS memoire (" +
      "id TEXT PRIMARY KEY, texte TEXT NOT NULL, meta TEXT, vecteur TEXT NOT NULL, maj INTEGER" +
    ")"
  ).run();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

      if (path === "/health" || path === "/") {
        /* `hasVec` garde son nom : c'est « le rangement des souvenirs est disponible »,
           et d'anciens lecteurs peuvent encore le regarder. `magasin` dit lequel c'est. */
        return json({ ok: true, hasVec: !!env.DB, hasAI: !!env.AI, model: EMBED_MODEL, dims: EMBED_DIMS, magasin: "d1", mode: "no-do", ts: Date.now() }, 200, origin);
      }

      // toutes les routes de données exigent l'auth
      if (!(await authOk(request, env))) {
        return json({ ok: false, error: "unauthorized", debug: { hint: "x-apex-pin manquant/incorrect" } }, 401, origin);
      }
      if (!env.AI || !env.DB) {
        return json({ ok: false, error: "bindings_missing", debug: { hasAI: !!env.AI, hasVec: !!env.DB } }, 503, origin);
      }

      if (path === "/upsert" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
        const clean = items.filter((it) => it && typeof it.text === "string" && it.text.trim());
        if (!clean.length) return json({ ok: true, upserted: 0, debug: { note: "aucun item valide" } }, 200, origin);
        const vecs = await embed(env, clean.map((it) => String(it.text).slice(0, 4000)));
        const rows = clean.map((it, i) => ({
          id: String(it.id || crypto.randomUUID()),
          texte: String(it.text).slice(0, 4000),
          meta: JSON.stringify(it.meta && typeof it.meta === "object" ? it.meta : {}),
          vecteur: Array.isArray(vecs[i]) && vecs[i].length === EMBED_DIMS ? vecVersTexte(normaliser(vecs[i])) : null,
        })).filter((r) => r.vecteur);
        if (!rows.length) return json({ ok: false, error: "embed_failed", debug: { got: vecs.length } }, 502, origin);

        await assurerTable(env);
        const maintenant = Date.now();
        const req = env.DB.prepare(
          "INSERT INTO memoire (id, texte, meta, vecteur, maj) VALUES (?1, ?2, ?3, ?4, ?5) " +
          "ON CONFLICT(id) DO UPDATE SET texte=?2, meta=?3, vecteur=?4, maj=?5"
        );
        await env.DB.batch(rows.map((r) => req.bind(r.id, r.texte, r.meta, r.vecteur, maintenant)));
        return json({ ok: true, upserted: rows.length, debug: { magasin: "d1" } }, 200, origin);
      }

      if (path === "/query" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const topK = Math.max(1, Math.min(20, Number(body.topK) || 5));
        if (!text) return json({ ok: true, matches: [], debug: { note: "text vide" } }, 200, origin);
        const vecs = await embed(env, [text.slice(0, 4000)]);
        if (!vecs[0]) return json({ ok: false, error: "embed_failed", matches: [], debug: {} }, 502, origin);
        const cible = normaliser(vecs[0]);

        await assurerTable(env);
        const lire = env.DB.prepare("SELECT id, texte, meta, vecteur FROM memoire ORDER BY maj DESC LIMIT ?1 OFFSET ?2");
        let meilleurs = [];
        let vus = 0;
        for (let offset = 0; offset < MAX_SCAN; offset += PAGE) {
          const res = await lire.bind(PAGE, offset).all();
          const lignes = (res && res.results) || [];
          if (!lignes.length) break;
          for (const l of lignes) {
            vus++;
            let score;
            try { score = produitScalaire(cible, texteVersVec(l.vecteur)); } catch { continue; }
            if (!isFinite(score)) continue;
            meilleurs = garderMeilleurs(meilleurs, { id: l.id, score, texte: l.texte, meta: l.meta }, topK);
          }
          if (lignes.length < PAGE) break;
        }
        const matches = meilleurs.map((m) => {
          let meta = {};
          try { meta = JSON.parse(m.meta || "{}") || {}; } catch { meta = {}; }
          return { id: m.id, score: m.score, text: m.texte || "", meta: { text: m.texte || "", ...meta } };
        });
        return json({ ok: true, matches, debug: { count: matches.length, parcourus: vus, magasin: "d1" } }, 200, origin);
      }

      if (path === "/forget" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 100) : [];
        if (!ids.length) return json({ ok: true, deleted: 0 }, 200, origin);
        await assurerTable(env);
        const del = env.DB.prepare("DELETE FROM memoire WHERE id = ?1");
        await env.DB.batch(ids.map((id) => del.bind(id)));
        return json({ ok: true, deleted: ids.length }, 200, origin);
      }

      return json({ ok: false, error: "not_found", debug: { path } }, 404, origin);
    } catch (e) {
      // fail-open JSON (jamais un secret) — leçon #133
      return json({ ok: false, error: "worker_error", debug: { message: String((e && e.message) || e).slice(0, 200) } }, 200, origin);
    }
  },
};
