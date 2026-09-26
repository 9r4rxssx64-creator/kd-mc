// Registre des tâches disponibles pour l'agent
// Chaque tâche = { name, schedule, run(ctx) }

import { dailyBackup } from "../tasks/daily-backup.js";
import { healthCheck } from "../tasks/health-check.js";
import { burnoutDetect } from "../tasks/burnout-detect.js";
import { weeklyReport } from "../tasks/weekly-report.js";
import { conflictsCheck } from "../tasks/conflicts-check.js";

const REGISTRY = [
  { name: "health-check", schedule: ["loop", "cron:*/15 * * * *", "manual"], run: healthCheck },
  { name: "conflicts-check", schedule: ["loop", "cron:0 * * * *", "manual"], run: conflictsCheck },
  { name: "burnout-detect", schedule: ["cron:0 8 * * *", "manual"], run: burnoutDetect },
  { name: "daily-backup", schedule: ["cron:0 3 * * *", "manual"], run: dailyBackup },
  { name: "weekly-report", schedule: ["cron:0 9 * * 1", "manual"], run: weeklyReport },
];

/**
 * Retourne les tâches à exécuter selon le trigger.
 */
export function listTasks(trigger, state) {
  if (trigger === "manual" || trigger === "cli" || trigger === "all") return REGISTRY;
  return REGISTRY.filter((t) =>
    t.schedule.some((s) => s === trigger || (s === "loop" && trigger === "startup"))
  );
}

/**
 * Exécute une tâche avec timeout + try/catch.
 */
export async function runTask(task, ctx) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Task ${task.name} timeout 120s`)), 120000)
  );
  return Promise.race([task.run(ctx), timeout]);
}

export { REGISTRY };
