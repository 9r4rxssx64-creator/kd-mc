// Backup quotidien des données CMC Teams → JSON stocké dans Firebase + optionnellement Google Drive
import { fbSet } from "../lib/firebase.js";
import { notifyTelegram } from "../lib/notifier.js";

export async function dailyBackup({ state, cfg }) {
  const today = new Date().toISOString().slice(0, 10);
  const backupKey = `cmc_agent_backup_${today}`;

  // Construit un backup (sans mots de passe en clair — seulement hash)
  const pwd = state.cmc_pw || {};
  const pwdSafe = {};
  Object.keys(pwd).forEach((k) => {
    const e = pwd[k];
    pwdSafe[k] = e && e.h ? { h: e.h } : null;
  });

  const backup = {
    createdAt: new Date().toISOString(),
    trigger: "agent_daily",
    appVer: state.cmc_agent_last_report?.appVer || "?",
    employees: state.cmc_e || [],
    teams: state.cmc_t || [],
    overrides: state.cmc_ov || {},
    reg: state.cmc_reg || {},
    motd: state.cmc_motd || null,
    pwdHashCount: Object.keys(pwdSafe).length,
    empCount: (state.cmc_e || []).length,
  };

  const json = JSON.stringify(backup);
  const sizeKB = Math.round(json.length / 1024);

  try {
    await fbSet(cfg.FB_URL, backupKey, backup);
  } catch (e) {
    await notifyTelegram(cfg, `❌ Backup quotidien ÉCHEC : ${e.message}`);
    throw e;
  }

  // Rotation : supprimer backups > 14 jours (via parsing clés)
  try {
    const all = state;
    const oldBackups = Object.keys(all).filter((k) => k.startsWith("cmc_agent_backup_")).sort();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffKey = `cmc_agent_backup_${cutoff.toISOString().slice(0, 10)}`;
    const toDelete = oldBackups.filter((k) => k < cutoffKey);
    for (const k of toDelete) {
      await fbSet(cfg.FB_URL, k, null);
    }
  } catch (_) {}

  return { backupKey, sizeKB, empCount: backup.empCount };
}
