/**
 * wm-brief — synthèse IA de l'actualité pour le panneau "Synthèse actu" de World Monitor.
 *
 * SÉCURITÉ / ISOLATION / COÛT (règles CLAUDE.md) :
 * - Les clés restent UNIQUEMENT côté worker (secrets wrangler), jamais dans la page.
 * - AUCUNE entrée utilisateur : le worker récupère lui-même les titres (GDELT + Hacker News)
 *   côté serveur → pas d'injection de prompt, pas d'abus possible.
 * - Cache edge 15 min sur une clé FIXE (indépendante de la query) → au plus ~1 appel IA
 *   par 15 min et par colo, quel que soit le trafic ou une tentative de cache-busting.
 * - Worker DÉDIÉ (isolation max) : ne touche à aucun autre worker/secret.
 *
 * Kevin 2026-09-05 « Qwen l'IA gratuite en principal, pareil dans mes autres projets » :
 * la synthèse est un RÉSUMÉ → le routage commun (services/_shared/ia-route.js) la confie
 * à QWEN sur Workers AI (binding AI, 0 clé, 0 €) ; Anthropic reste le secours si Qwen tombe.
 * La réponse dit toujours QUI a répondu (provider/model).
 *
 * URL prod : https://wm-brief.9r4rxssx64.workers.dev  (sous-domaine du COMPTE — leçon #85)
 */
import { routeText, councilText, availableProviders, routingStatus, freeVoices } from "../../../services/_shared/ia-route.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const TTL = 900; // 15 min
const SYSTEM = "Tu es un analyste d'actualité. À partir des titres fournis (actualité mondiale + tech), rédige une synthèse en français : 3 à 4 puces courtes des thèmes dominants du moment. Factuel, neutre, aucune spéculation. Commence chaque puce par '• '. Pas d'introduction ni de conclusion.";

function json(obj, extra, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json" }, CORS, extra || {}),
  });
}

export default {
  async fetch(req, env, ctx) {
    // Toute exception → JSON avec cause EXACTE (règle « détailler les erreurs partout »).
    try { return await handle(req, env, ctx); }
    catch (e) { return json({ error: "exception", detail: String((e && e.message) || e) }, null, 500); }
  },
};

async function fetchTitles() {
  const titles = [];
  // GDELT — actualité monde
  try {
    const r = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=" +
      encodeURIComponent("(world OR breaking)") + "&mode=artlist&maxrecords=18&sort=datedesc&format=json");
    const d = await r.json();
    (d.articles || []).forEach(a => { if (a.title) titles.push(a.title); });
  } catch (e) { /* best-effort */ }
  // Hacker News — tech
  try {
    const ids = await (await fetch("https://hacker-news.firebaseio.com/v0/topstories.json")).json();
    const top = await Promise.all((ids || []).slice(0, 8).map(id =>
      fetch("https://hacker-news.firebaseio.com/v0/item/" + id + ".json").then(r => r.json()).catch(() => null)));
    top.filter(Boolean).forEach(s => { if (s.title) titles.push(s.title); });
  } catch (e) { /* best-effort */ }
  return titles;
}

async function handle(req, env, ctx) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    const engines = availableProviders(env);
    return json({ ok: true, hasKey: !!env.ANTHROPIC_API_KEY, hasEngine: engines.length > 0, engines, service: "wm-brief", routing: routingStatus(env).first_by_domain.summary });
  }
  if (url.pathname !== "/brief") return json({ error: "not_found" }, null, 404);
  if (!availableProviders(env).length) {
    return json({ error: "no_engine", detail: "Aucune IA disponible : ni binding Workers AI ([ai] dans wrangler.toml), ni secret ANTHROPIC_API_KEY sur le worker wm-brief" }, null, 503);
  }

  // Cache edge 15 min, clé FIXE (ignore la query → borne le coût même en cache-busting).
  const cacheKey = new Request(url.origin + "/brief-v2");
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

  const titles = await fetchTitles();
  if (!titles.length) return json({ error: "no_sources", detail: "Aucun titre récupéré (GDELT + HN indisponibles)" }, null, 502);

  // Kevin 2026-09-06 « concertation d'IA gratuites… va plus loin » : la synthèse est écrite par
  // un CONSEIL de voix gratuites (chaque modèle Qwen = une voix) puis un juge gratuit garde ce
  // qui fait consensus (règle VÉRITÉ : une seule voix qui affirme seule est écartée). Moins de
  // 2 voix → une seule IA via le routage commun. Anthropic reste le secours.
  const ask = { domain: "summary", system: SYSTEM, prompt: "Titres du moment :\n" + titles.slice(0, 26).join("\n"), maxTokens: 320, temperature: 0.3 };
  let r = freeVoices(env).length >= 2 ? await councilText(env, ask) : { ok: false };
  if (!r.ok) r = await routeText(env, ask);
  if (!r.ok) {
    return json({ error: "ai", detail: r.error, tried: r.tried }, null, 502);
  }

  const payload = { brief: r.text.trim(), sources: titles.length, provider: r.provider, model: r.model, voices: r.voices || null, judge: r.judge || null, ts: Date.now() };
  const resp = json(payload, { "Cache-Control": "public, max-age=" + TTL });
  if (cache) { try { ctx.waitUntil(cache.put(cacheKey, resp.clone())); } catch (e) {} }
  return resp;
}
