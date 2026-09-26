// Rapport hebdo complet généré par Claude : stats, tendances, alertes
import { notifyTelegram } from "../lib/notifier.js";

export async function weeklyReport({ state, anthropic, cfg }) {
  if (!anthropic) return { skipped: "no anthropic client" };

  // Prépare les données brutes
  const emps = state.cmc_e || [];
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const ov = (state.cmc_ov || {})[`${y}-${m}`] || {};

  const summary = {
    mois: `${monthName(m)} ${y}`,
    empCount: emps.length,
    planningFilled: Object.keys(ov).length,
    chefsCount: emps.filter((e) => e.chef).length,
    seniorsCount: emps.filter((e) => e.senior).length,
    byFamily: counts(emps.map((e) => e.family || "bj")),
    recentChat: (state.cmc_chat || []).slice(-20).length,
  };

  // Demande à Claude un rapport narratif
  const systemPrompt = `Tu es l'assistant RH du Casino de Monte-Carlo. Génère un rapport hebdomadaire court (max 15 lignes) en français, ton professionnel et synthétique. Utilise des emoji pertinents. Signale les anomalies éventuelles.`;

  const userMsg = `Voici l'état de CMC Teams cette semaine :\n${JSON.stringify(summary, null, 2)}\n\nGénère un rapport hebdo.`;

  const resp = await anthropic.messages.create({
    model: cfg.CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

  await notifyTelegram(cfg, `📊 <b>Rapport hebdo CMC Teams</b>\n\n${text}`);

  return { summary, reportChars: text.length };
}

function counts(arr) {
  const out = {};
  arr.forEach((k) => { out[k] = (out[k] || 0) + 1; });
  return out;
}
function monthName(m) { return ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"][m]; }
