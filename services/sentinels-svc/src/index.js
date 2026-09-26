/**
 * sentinels-svc — Cloudflare Worker pour audits hebdo automatiques
 *
 * Mission : sortir les sentinelles axProjectsAudit / axCodeQualityAudit /
 *           axCodeCompanionAudit du monolith Apex AI vers un cron worker dédié.
 *
 * Avantages :
 *   - Cron Cloudflare exécute chaque lundi 02:00 UTC sans charger le client
 *   - Push résultats Firebase + escalade Claude Code via ax_claude_todo
 *   - Email/Telegram alert si critique
 *   - Persistance KV pour historique audits
 *
 * TRIGGERS :
 *   - Cron : "0 2 * * 1" (lundi 02:00 UTC)
 *   - HTTP : POST /trigger {audit_type} pour test manuel
 *
 * SECRETS (wrangler secret put) :
 *   - GITHUB_PAT (workflow scope) pour interroger CI
 *   - FIREBASE_DB_URL pour push résultats
 *   - TELEGRAM_BOT_TOKEN (optionnel) pour alerts
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health") return json({ ok: true, service: "sentinels-svc" }, cors);

    if (url.pathname === "/trigger" && request.method === "POST") {
      const { audit_type } = await request.json().catch(() => ({}));
      const reports = {};
      if (!audit_type || audit_type === "projects") reports.projects = await runProjectsAudit(env);
      if (!audit_type || audit_type === "code_quality") reports.code_quality = await runCodeQualityAudit(env);
      if (!audit_type || audit_type === "code_companion") reports.code_companion = await runCodeCompanionAudit(env);
      return json({ ok: true, reports }, cors);
    }

    if (url.pathname === "/last" && request.method === "GET") {
      const last = await env.SENTINELS_KV.get("last_audits", "json");
      return json({ ok: true, last }, cors);
    }

    return json({ ok: false, error: "not_found" }, cors, 404);
  },

  async scheduled(event, env, ctx) {
    console.log("[sentinels-svc] scheduled audit trigger:", new Date().toISOString());
    const reports = {
      projects: await runProjectsAudit(env),
      code_quality: await runCodeQualityAudit(env),
      code_companion: await runCodeCompanionAudit(env),
      ts: Date.now()
    };
    await env.SENTINELS_KV.put("last_audits", JSON.stringify(reports));
    await pushToFirebase(env, "ax_sentinels_weekly", reports);
    if (hasCriticals(reports)) {
      await escalateClaude(env, reports);
      await alertTelegram(env, reports);
    }
  }
};

async function runProjectsAudit(env) {
  // Audit projets : check tokens présents dans Firebase
  const projects = ["kdmc", "cmcteams", "apexchat", "socialvideo", "remote", "crackpass", "ekdmc"];
  const tokens = ["ax_api_key", "ax_gh_pat"];
  const missing = [];
  for (const tk of tokens) {
    const r = await fetch(`${env.FIREBASE_DB_URL}/apex/${tk}.json`).catch(() => null);
    if (!r || !r.ok) missing.push(tk);
  }
  return { projects_total: projects.length, missing_tokens: missing, ts: Date.now() };
}

async function runCodeQualityAudit(env) {
  // Récupère index.html depuis GitHub raw + analyse basic
  const indexUrl = "https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/apex-ai/index.html";
  const txt = await fetch(indexUrl).then(r => r.ok ? r.text() : "").catch(() => "");
  const silentCatches = (txt.match(/catch\(_\)\{\}/g) || []).length;
  const safeCatches = (txt.match(/_axSafeCatch\(/g) || []).length;
  return {
    silent_catches: silentCatches,
    safe_catches: safeCatches,
    coverage_pct: safeCatches ? Math.round(100 * safeCatches / (safeCatches + silentCatches)) : 0,
    file_size_kb: Math.round(txt.length / 1024),
    ts: Date.now()
  };
}

async function runCodeCompanionAudit(env) {
  if (!env.GITHUB_PAT) return { error: "no_pat" };
  const r = await fetch(
    "https://api.github.com/repos/9r4rxssx64-creator/cmcteams/actions/runs?status=failure&per_page=10",
    { headers: { "Authorization": `Bearer ${env.GITHUB_PAT}`, "Accept": "application/vnd.github+json" } }
  ).catch(() => null);
  if (!r || !r.ok) return { error: "github_api_failed" };
  const data = await r.json();
  return {
    failed_runs: data.workflow_runs?.length || 0,
    recent: (data.workflow_runs || []).slice(0, 5).map(w => ({ id: w.id, name: w.name, conclusion: w.conclusion })),
    ts: Date.now()
  };
}

async function pushToFirebase(env, path, data) {
  if (!env.FIREBASE_DB_URL) return;
  try {
    await fetch(`${env.FIREBASE_DB_URL}/apex/${path}/${data.ts}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch (_) {}
}

async function escalateClaude(env, reports) {
  // Push entry ax_claude_todo pour que Claude Code traite à la prochaine session
  if (!env.FIREBASE_DB_URL) return;
  try {
    const todo = {
      id: "todo_" + Date.now(),
      context: { sentinelId: "sentinels-svc-weekly", reports },
      reason: "Critical issues detected by sentinels-svc",
      severity: "critical",
      src: "sentinels-svc",
      ts: Date.now(),
      status: "pending"
    };
    await fetch(`${env.FIREBASE_DB_URL}/apex/ax_claude_todo/${todo.id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(todo)
    });
  } catch (_) {}
}

async function alertTelegram(env, reports) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const msg = `🚨 Apex sentinels alert\nFailed runs: ${reports.code_companion?.failed_runs || 0}\nMissing tokens: ${reports.projects?.missing_tokens?.length || 0}\nCode coverage: ${reports.code_quality?.coverage_pct || 0}%`;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg })
    });
  } catch (_) {}
}

function hasCriticals(reports) {
  return (reports.code_companion?.failed_runs || 0) > 5 ||
         (reports.projects?.missing_tokens?.length || 0) > 2 ||
         (reports.code_quality?.silent_catches || 0) > 100;
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}
