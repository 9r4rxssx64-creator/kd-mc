/**
 * kdmc-uptime — surveillance du domaine kd-mc.com
 *
 * POURQUOI CE WORKER EXISTE
 * -------------------------
 * Le 15/08/2026, les 7 workflows de surveillance ont été rangés dans
 * .github/workflows-desactives/ pour retirer les crons qui avaient fait
 * suspendre le compte GitHub. Personne ne les a remis ailleurs.
 * Résultat mesuré le 05/09 : dernier relevé le 14/08 à 18h52 → 22 jours
 * SANS aucun contrôle. Et même avant, la sonde ne couvrait que 13 des
 * 26 sous-domaines (arbre, cuisine, lingua, studio, shops… jamais testés).
 *
 * Sa place est ICI et pas sur GitHub : règle « jamais de tâche programmée
 * sur GitHub Actions » (fait n°10/11 de ETAT-INFRA.md). Un cron Cloudflare
 * est hors quota GitLab CI et n'expose pas le compte.
 *
 * CONTRAINTES DU COMPTE (respectées, pas devinées)
 * ------------------------------------------------
 * - Pas de Durable Object (error 1042 sur ce compte, leçons #132/#133), pas de
 *   KV à id placeholder (ça casse `wrangler deploy`). L'état vit dans le KV
 *   ACCOUNTS déjà provisionné du compte (même namespace que le routeur, Outlook,
 *   Monaco — id réel dans wrangler.toml), préfixe `upt:`. Repli Cache API si le
 *   binding manque. Pourquoi pas le Cache API seul (relecture 05/09) : il est
 *   PAR DATACENTER → un passage lancé depuis un autre lieu ne voyait pas l'état
 *   précédent, chaque panne était « nouvelle » à chaque fois → notification à
 *   chaque passage, jamais de « de retour ».
 * - Fail-open sur la notification : sans jeton le worker continue de sonder et
 *   de servir son état. Une surveillance qui tombe en panne parce qu'un secret
 *   manque ne surveille rien.
 * - Pas de cron à lui (plan gratuit : 5 par compte, tous pris) : le cron de
 *   kdmc-outlook appelle /run toutes les 2 h par Service Binding.
 *
 * ENDPOINTS
 *   GET  /         → état du dernier passage (JSON, public, sans URL internes)
 *   GET  /health   → {ok:true} (pour être soi-même surveillé)
 *   POST /run      → force un passage. Réservé : en-tête x-uptime-key =
 *                    sha256(UPTIME_RUN_KEY + ':uptime-run'), 1 passage / 5 min.
 *                    Public, c'était un amplificateur ×33 sur le quota gratuit
 *                    (100 000 requêtes/jour, tout le compte) + push en rafale.
 */

const RUN_MIN_INTERVAL_MS = 5 * 60 * 1000;
const LASTRUN_URL = 'https://kdmc-uptime.internal/lastrun/v1';
const KV_STATE_KEY = 'upt:state:v1';

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** La clé attendue sur /run : dérivée du secret, jamais le secret lui-même sur le fil. */
async function expectedRunKey(env) {
  const base = env && env.UPTIME_RUN_KEY;
  if (!base) return null;
  return sha256hex(base + ':uptime-run');
}

/* ------------------------------------------------------------------ *
 * LES CIBLES
 *
 * ⚠️ Cette liste DOIT rester le miroir exact de ROUTES dans
 *    services/kdmc-router/worker.js. C'est précisément la dérive qui a
 *    laissé 13 adresses sans surveillance pendant des mois : on ajoutait
 *    un sous-domaine au routeur, jamais à la sonde, et rien ne le disait.
 *    Le test tests/uptime-couverture.test.mjs échoue désormais si un
 *    sous-domaine du routeur manque ici. Ajouter une app = 3 endroits :
 *    wrangler.toml du routeur + ROUTES du routeur + CETTE liste.
 * ------------------------------------------------------------------ */
const SITES = [
  'kd-mc.com',
  'www.kd-mc.com',
  'cmcteams.kd-mc.com',
  'cmcteams-light.kd-mc.com',
  'departs.kd-mc.com',
  'apex-ai.kd-mc.com',
  'apex-chat.kd-mc.com',
  'dashboard.kd-mc.com',
  'sourcing.kd-mc.com',
  'coffre.kd-mc.com',
  'la-detente.kd-mc.com',
  'chez-lolo.kd-mc.com',
  'bot.kd-mc.com',
  'beatbot.kd-mc.com',
  'rotaplan.kd-mc.com',   /* offre B2B Rotaplan (page de vente) — ajoutée 15.09.2026 */
  'kit.kd-mc.com',        /* Kit IA (indépendants) — produit numérique, 16.09 */
  'croupier.kd-mc.com',   /* Devenir croupier — guide de métier */
  'javis.kd-mc.com',    /* Javis — app installable de Bee */
  'tor.kd-mc.com',        /* « Tor en clair » — routée le 15.09 sans être surveillée */
  'dossiers.kd-mc.com',   /* routée sans être surveillée — une adresse hors sonde tombe SANS que personne le sache (22.09) */
  'autorisations.kd-mc.com',
  'arbre.kd-mc.com',
  'lingua.kd-mc.com',
  'studio.kd-mc.com',
  'worldmonitor.kd-mc.com',
  'osint.kd-mc.com',
  'ia.kd-mc.com',
  'outils.kd-mc.com',
  'shops.kd-mc.com',
  'cuisine.kd-mc.com',
  'cocina.kd-mc.com',
  'cujina.kd-mc.com',
];

/* Workers critiques : leur /health est sondé PAR LA CI (étape « Santé des workers »
   de deploy-kdmc-uptime.yml), PAS d'ici — et c'est une contrainte, pas un choix.
   MESURÉ le 5.09 (passage n°11) : les 6 adresses `*.workers.dev` répondaient 404 en
   10-21 ms pendant que les 26 adresses du domaine répondaient normalement. 10-21 ms =
   la requête n'est jamais sortie du réseau Cloudflare : un Worker n'atteint pas une
   URL workers.dev du MÊME compte (même famille que l'erreur 1042 côté Outlook, qui a
   exigé un Service Binding). Résultat : 6 fausses pannes à chaque passage — exactement
   le genre d'alerte qu'on finit par ne plus lire.
   Le runner GitHub, lui, a un vrai réseau : c'est lui qui les sonde et qui le prouve.
   `apex-v13-backend` retiré : il n'existe pas sur le compte (workers_list du 5.09). */
/* kdmc-vente encaisse et livre : s'il tombe, un client paie et ne reçoit rien.
   C'est la panne la plus chère du domaine — surveillée comme telle. */
const WORKERS = [
  'apex-secrets-proxy',
  'kdmc-ais',
  'kdmc-live',
  'kdmc-rag',
  'apex-auth-worker',
  'kdmc-vente',
  'kdmc-social',
];

/* Ces adresses exigent une session admin : un 401/403 est la BONNE réponse,
   pas une panne. Les confondre produirait une alerte permanente que plus
   personne ne lirait — c'est comme ça qu'on cesse de lire les alertes. */
const ADMIN_GATED = new Set(['autorisations.kd-mc.com', 'beatbot.kd-mc.com']);

const TIMEOUT_MS = 12000;
const STATE_URL = 'https://kdmc-uptime.internal/state/v1';

/* Ce que CE worker sonde : les 26 adresses du domaine — celles que Kevin ouvre
   vraiment depuis son menu. Les workers passent par la CI (voir WORKERS ci-dessus). */
function targets() {
  return SITES.map((host) => ({
    id: host,
    url: 'https://' + host + '/',
    kind: 'site',
    adminGated: ADMIN_GATED.has(host),
  }));
}

/** Sonde une cible. Ne jette jamais : une exception ici tuerait tout le passage. */
async function probe(t) {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(t.url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'user-agent': 'kdmc-uptime/1.0 (+https://kd-mc.com)' },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const ms = Date.now() - started;
    const code = res.status;
    try { if (res.body) await res.body.cancel(); } catch (_) { /* rien */ }
    // 401/403 sur une page admin = verrou qui fonctionne, donc en bonne santé.
    // 429 sur un worker = il est VIVANT et se protège (apex-v13-backend limite par IP
    // avant /health) : ce n'est pas une panne.
    const ok = code < 400 || (t.adminGated && (code === 401 || code === 403)) || (t.kind === 'worker' && code === 429);
    return { id: t.id, url: t.url, kind: t.kind, code: String(code), ms, ok };
  } catch (e) {
    const ms = Date.now() - started;
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e && e.message)));
    return {
      id: t.id,
      url: t.url,
      kind: t.kind,
      code: aborted ? 'timeout' : 'erreur',
      ms,
      ok: false,
      // Cause EXACTE conservée (règle « toujours détailler les erreurs »).
      detail: String((e && e.message) || e).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readState(env) {
  try {
    if (env && env.ACCOUNTS) {
      const s = await env.ACCOUNTS.get(KV_STATE_KEY, 'json');
      if (s) return s;
    }
  } catch (_) { /* KV indisponible → repli cache */ }
  try {
    const hit = await caches.default.match(STATE_URL);
    if (!hit) return null;
    return await hit.json();
  } catch (_) {
    return null;
  }
}

async function writeState(env, state) {
  try {
    if (env && env.ACCOUNTS) await env.ACCOUNTS.put(KV_STATE_KEY, JSON.stringify(state));
  } catch (_) { /* best-effort */ }
  try {
    await caches.default.put(
      STATE_URL,
      new Response(JSON.stringify(state), {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'max-age=86400',
        },
      }),
    );
  } catch (_) {
    /* best-effort : perdre l'état ne doit pas faire échouer le passage */
  }
}

/**
 * Notifie l'iPhone via apex-push-worker. Best-effort et silencieux :
 * pas de jeton → on ne notifie pas, mais on continue de sonder.
 */
async function notify(env, title, body) {
  const url = env && env.KDMC_PUSH_URL;
  const token = env && env.KDMC_PUSH_TOKEN;
  if (!url || !token) return { sent: false, why: 'push non configuré' };
  try {
    // /send-all + {payload:{…}} : c'est le contrat réel d'apex-push-worker (le routeur fait
    // pareil, kdmc-router/worker.js). Relecture 05/09 : /send + {title, body} répondait
    // 400 « no_userIds » → aucune notification n'était jamais partie.
    const r = await fetch(url.replace(/\/+$/, '') + '/send-all', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ payload: { title, body, tag: 'kdmc-uptime', url: 'https://kdmc-uptime.9r4rxssx64.workers.dev/' } }),
    });
    const out = { sent: r.ok, code: r.status };
    if (!r.ok) out.why = (await r.text().catch(() => '')).slice(0, 120);
    return out;
  } catch (e) {
    return { sent: false, why: String((e && e.message) || e).slice(0, 120) };
  }
}

async function runPass(env) {
  const list = targets();
  const results = [];
  // Par paquets de 6 = la limite de connexions simultanées d'un worker : au-delà,
  // la 7e attend en file pendant que son chrono de 12 s court déjà → faux « timeout ».
  for (let i = 0; i < list.length; i += 6) {
    const chunk = list.slice(i, i + 6);
    results.push(...(await Promise.all(chunk.map(probe))));
  }

  const prev = await readState(env);
  const prevDown = new Set((prev && prev.down) || []);
  const down = results.filter((r) => !r.ok).map((r) => r.id);
  const nowDown = new Set(down);

  const tombees = down.filter((id) => !prevDown.has(id));
  const revenues = [...prevDown].filter((id) => !nowDown.has(id));

  const state = {
    ts: new Date().toISOString(),
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    down,
    results,
  };
  await writeState(env, state);

  let push = { sent: false, why: 'rien à signaler' };
  if (tombees.length) {
    const lignes = results
      .filter((r) => tombees.includes(r.id))
      .map((r) => `${r.id} → ${r.code}`)
      .join('\n');
    push = await notify(
      env,
      `⚠️ ${tombees.length} adresse(s) ne répondent plus`,
      lignes,
    );
  } else if (revenues.length) {
    push = await notify(env, `✅ ${revenues.length} adresse(s) de nouveau en ligne`, revenues.join('\n'));
  }

  return { ...state, tombees, revenues, push };
}

function json(obj, status, opts) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  // CORS ouvert seulement sur les lectures publiques (/ et /health), jamais sur /run.
  if (opts && opts.cors) headers['access-control-allow-origin'] = '*';
  return new Response(JSON.stringify(obj, null, 2), { status: status || 200, headers });
}

/** Vue publique de l'état : ni URL internes (recensement), ni détails d'erreur longs. */
function publicView(state) {
  return {
    ...state,
    results: (state.results || []).map(({ url, detail, ...r }) => (detail ? { ...r, detail: String(detail).slice(0, 80) } : r)),
  };
}

/** Anti-rafale : au plus un passage toutes les 5 min (best-effort, Cache API par lieu). */
async function tooSoon() {
  try {
    const hit = await caches.default.match(LASTRUN_URL);
    if (hit && Date.now() - Number(await hit.text()) < RUN_MIN_INTERVAL_MS) return true;
    await caches.default.put(LASTRUN_URL, new Response(String(Date.now()), { headers: { 'cache-control': 'max-age=300' } }));
  } catch (_) { /* pas de cache → on laisse passer */ }
  return false;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPass(env));
  },

  async fetch(request, env) {
    const path = new URL(request.url).pathname;

    if (path === '/health') {
      return json({ ok: true, service: 'kdmc-uptime', cibles: targets().length }, 200, { cors: true });
    }

    if (path === '/run') {
      if (request.method !== 'POST') return json({ ok: false, error: 'POST requis' }, 405);
      const expected = await expectedRunKey(env);
      if (!expected) return json({ ok: false, error: 'UPTIME_RUN_KEY non configuré sur le worker' }, 503);
      if ((request.headers.get('x-uptime-key') || '') !== expected) return json({ ok: false, error: 'non autorisé' }, 401);
      if (await tooSoon()) return json({ ok: false, error: 'trop tôt : 1 passage / 5 min' }, 429);
      return json(await runPass(env));
    }

    if (path === '/' || path === '') {
      const state = await readState(env);
      if (!state) {
        return json({
          ok: true,
          etat: 'aucun passage enregistré pour le moment',
          note: 'Le prochain passage est déclenché toutes les 2 h par le cron de kdmc-outlook.',
          cibles: targets().length,
        }, 200, { cors: true });
      }
      return json({ ok: true, ...publicView(state) }, 200, { cors: true });
    }

    return json({ ok: false, error: 'chemin inconnu', chemins: ['/', '/health', 'POST /run'] }, 404);
  },
};
