// Vérifie que l'app CMC Teams est accessible et que les données sont saines
import { notifyTelegram } from "../lib/notifier.js";

export async function healthCheck({ state, cfg }) {
  const report = { timestamp: Date.now(), issues: [] };

  // 1. App accessible ?
  try {
    const r = await fetch("https://9r4rxssx64-creator.github.io/CMCteams/", { method: "HEAD" });
    report.appStatus = r.ok ? "up" : `down (${r.status})`;
    if (!r.ok) report.issues.push(`App HTTP ${r.status}`);
  } catch (e) {
    report.appStatus = "unreachable";
    report.issues.push(`App unreachable: ${e.message}`);
  }

  // 2. Employés présents
  const emps = state.cmc_e || [];
  if (emps.length < 200) report.issues.push(`Employés < 200 : ${emps.length} (anomalie)`);

  // 3. Overrides mois courant
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}`;
  const ov = (state.cmc_ov || {})[key] || {};
  report.ovThisMonth = Object.keys(ov).length;
  if (report.ovThisMonth === 0) {
    report.issues.push(`Aucune donnée planning pour ${key} — import peut-être manquant`);
  }

  // 4. Dernier backup
  const backupKeys = Object.keys(state).filter((k) => k.startsWith("cmc_auto_backup_"));
  if (backupKeys.length === 0) {
    report.issues.push("Aucun auto-backup trouvé");
  } else {
    backupKeys.sort();
    report.lastBackup = backupKeys[backupKeys.length - 1];
  }

  // 5. Notif si 3+ issues
  if (report.issues.length >= 3) {
    await notifyTelegram(cfg,
      `⚠ Health-check CMC : ${report.issues.length} problèmes\n` +
      report.issues.map((i) => `• ${i}`).join("\n")
    );
  }

  report.healthy = report.issues.length === 0;
  return report;
}
