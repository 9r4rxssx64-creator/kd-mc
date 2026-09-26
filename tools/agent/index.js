// Agent Claude autonome 24/7 — point d'entrée
// Usage :
//   - Local : `node index.js` (lance les tâches cron locales)
//   - Vercel : déployé comme Serverless Function via vercel.json (cron)
//   - Railway / Fly.io : service continu (boucle setInterval)
//
// Orchestre :
//   - Lecture état CMC Teams depuis Firebase RTDB
//   - Invocation Claude (tools) pour analyses périodiques
//   - Notifications via Telegram/Gmail
//   - Sauvegardes auto dans Drive/GitHub

import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "./lib/config.js";
import { fetchCmcState, saveCmcState } from "./lib/firebase.js";
import { notifyTelegram, notifyEmail } from "./lib/notifier.js";
import { listTasks, runTask } from "./lib/tasks.js";

const cfg = loadConfig();
const anthropic = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });

/**
 * Exécute un cycle complet d'agent : lit l'état, analyse via Claude, déclenche les tâches.
 * Retourne un rapport structuré.
 */
export async function runAgentCycle({ trigger = "manual", verbose = false } = {}) {
  const startedAt = Date.now();
  const report = {
    trigger,
    startedAt: new Date(startedAt).toISOString(),
    tasks: [],
    errors: [],
  };

  try {
    // 1. Récupérer l'état de CMC Teams
    const state = await fetchCmcState(cfg.FB_URL);
    report.empCount = (state.cmc_e || []).length;
    report.monthsCount = Object.keys(state.cmc_ov || {}).length;

    // 2. Déterminer les tâches à lancer
    const taskList = listTasks(trigger, state);
    if (verbose) console.log(`[agent] ${taskList.length} tâche(s) à exécuter`);

    // 3. Lancer chaque tâche (parallèle max 3)
    const chunk = 3;
    for (let i = 0; i < taskList.length; i += chunk) {
      const batch = taskList.slice(i, i + chunk);
      const results = await Promise.allSettled(
        batch.map((t) => runTask(t, { state, anthropic, cfg }))
      );
      results.forEach((r, idx) => {
        const taskName = batch[idx].name;
        if (r.status === "fulfilled") {
          report.tasks.push({ name: taskName, status: "ok", result: r.value });
        } else {
          report.errors.push({ task: taskName, error: String(r.reason?.message || r.reason) });
        }
      });
    }

    // 4. Si erreurs critiques → notifier admin
    if (report.errors.length > 0) {
      const msg = `⚠ Agent KDMC : ${report.errors.length} erreur(s)\n` +
        report.errors.map((e) => `• ${e.task}: ${e.error}`).join("\n");
      try { await notifyTelegram(cfg, msg); } catch (_) {}
    }

    // 5. Résumé final
    report.duration = Date.now() - startedAt;
    report.status = report.errors.length === 0 ? "success" : "partial";
    if (verbose) console.log(`[agent] Terminé en ${report.duration}ms — ${report.status}`);

    // 6. Persister le dernier rapport (pour le dashboard)
    try { await saveCmcState(cfg.FB_URL, "cmc_agent_last_report", report); } catch (_) {}
  } catch (err) {
    report.status = "error";
    report.fatalError = err.message;
    console.error("[agent] Erreur fatale :", err);
    // Anti-spam (Kevin 2026-06-16 « Agent KDMC crash Firebase 401 » en boucle) :
    // un 401/403 Firebase = condition d'AUTH/règles (infra), pas un bug de code.
    // On NE notifie PAS Telegram dessus (sinon flood à chaque cron) — log only.
    // L'auth compte-de-service (lib/firebase.js) corrige la cause ; ce garde-fou
    // évite le spam tant que les creds ne sont pas en place côté Vercel.
    const isAuthErr = /HTTP 40[13]\b/.test(String(err.message || ""));
    if (!isAuthErr) {
      try { await notifyTelegram(cfg, `🚨 Agent KDMC crash : ${err.message}`); } catch (_) {}
    } else {
      console.warn("[agent] Firebase auth/règles (401/403) — alerte Telegram supprimée (anti-spam).");
    }
  }

  return report;
}

// --- Mode CLI : `node index.js` ou `node index.js cron` ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || "once";
  if (mode === "loop") {
    // Mode service continu (Railway/Fly.io) : boucle toutes les 15 min
    console.log("[agent] Mode boucle — toutes les 15 minutes");
    setInterval(() => runAgentCycle({ trigger: "loop", verbose: true }), 15 * 60 * 1000);
    runAgentCycle({ trigger: "startup", verbose: true });
  } else {
    // Mode unique (local/Vercel cron)
    runAgentCycle({ trigger: "cli", verbose: true })
      .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.status === "error" ? 1 : 0); })
      .catch((e) => { console.error(e); process.exit(1); });
  }
}
