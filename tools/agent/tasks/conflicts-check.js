// Détecte les conflits planning (repos insuffisant, horaires dans absence, etc.)
// et notifie l'admin si critiques
import { notifyTelegram } from "../lib/notifier.js";

export async function conflictsCheck({ state, cfg }) {
  const report = { conflicts: [] };
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const key = `${y}-${m}`;
  const ov = (state.cmc_ov || {})[key] || {};
  const emps = state.cmc_e || [];
  const days = daysInMonth(y, m);

  // ABS codes (identique à _absTypes de l'app v9.118)
  const ABS = { CP: 1, AF: 1, M: 1, PAT: 1, MT: 1, AT: 1, FL: 1, ABS: 1, ABI: 1, CSS: 1, RH: 1, R: 1, RRT: 1 };
  const isWork = (c) => c && !ABS[c];

  emps.forEach((e) => {
    const codes = ov[e.id] || {};
    let consec = 0, maxConsec = 0;
    for (let d = 1; d <= days; d++) {
      const c = codes[d] || "";
      if (isWork(c)) { consec++; if (consec > maxConsec) maxConsec = consec; }
      else consec = 0;
      // Règle : horaire entre 2 jours d'absence = suspect
      if (d > 1 && d < days) {
        const prev = codes[d - 1] || "", next = codes[d + 1] || "";
        if (ABS[prev] && ABS[next] && prev !== "RH" && prev !== "R" && isWork(c)) {
          report.conflicts.push({ emp: e.name, day: d, type: "horaire_dans_absence", code: c });
        }
      }
    }
    if (maxConsec > 7) {
      report.conflicts.push({ emp: e.name, type: "serie_longue", value: maxConsec + "j consécutifs" });
    }
  });

  report.count = report.conflicts.length;
  report.critical = report.conflicts.filter((c) => c.type === "horaire_dans_absence").length;

  if (report.critical >= 3) {
    await notifyTelegram(cfg,
      `🚨 CMC : ${report.critical} conflits critiques planning détectés\n` +
      report.conflicts.slice(0, 10).map((c) => `• ${c.emp}: ${c.type}${c.day ? ` j${c.day}` : ""}`).join("\n")
    );
  }
  return report;
}

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
