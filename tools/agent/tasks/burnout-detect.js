// Détection burn-out quotidienne (admin-only, respecte PAT=paternité v9.118)
import { notifyTelegram } from "../lib/notifier.js";

export async function burnoutDetect({ state, cfg }) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const key = `${y}-${m}`;
  const ov = (state.cmc_ov || {})[key] || {};
  const emps = state.cmc_e || [];
  const days = daysInMonth(y, m);

  const ABS = { CP: 1, AF: 1, M: 1, PAT: 1, MT: 1, AT: 1, FL: 1, ABS: 1, ABI: 1, CSS: 1, RH: 1, R: 1, RRT: 1 };
  const isWork = (c) => c && !ABS[c];

  const risks = [];
  emps.forEach((e) => {
    const codes = ov[e.id] || {};
    let trav = 0, nuits = 0, consec = 0, maxConsec = 0;
    for (let d = 1; d <= days; d++) {
      const c = codes[d] || "";
      if (isWork(c)) {
        trav++;
        if (/^22\/|^20\//.test(c)) nuits++;
        consec++;
        if (consec > maxConsec) maxConsec = consec;
      } else consec = 0;
    }
    if (nuits > 8 || maxConsec > 7) {
      risks.push({ id: e.id, name: e.name, trav, nuits, maxConsec });
    }
  });

  const report = { month: `${monthName(m)} ${y}`, totalEmps: emps.length, risksCount: risks.length, risks };

  if (risks.length > 0) {
    const lines = risks.map((r) => `• ${r.name}: ${r.trav}j travail, ${r.nuits}n nuits, ${r.maxConsec}j consécutifs`);
    await notifyTelegram(cfg,
      `👁 Burn-out CMC (${report.month}) : ${risks.length} à risque\n${lines.join("\n")}`
    );
  }

  return report;
}

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function monthName(m) { return ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"][m]; }
