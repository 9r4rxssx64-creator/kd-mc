#!/usr/bin/env node
// CLI pour lancer une tâche spécifique manuellement
// Usage : node cli.js <task-name>
//        node cli.js all   (toutes les tâches)
//        node cli.js list  (liste les tâches)

import { runAgentCycle } from "./index.js";
import { REGISTRY } from "./lib/tasks.js";

const cmd = process.argv[2];

async function main() {
  if (!cmd || cmd === "list") {
    console.log("Tâches disponibles :");
    REGISTRY.forEach((t) => console.log(`  - ${t.name}`));
    console.log("\nUsage: node cli.js <task-name> | all");
    return;
  }

  if (cmd === "all") {
    const report = await runAgentCycle({ trigger: "manual", verbose: true });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const task = REGISTRY.find((t) => t.name === cmd);
  if (!task) {
    console.error(`❌ Tâche inconnue : ${cmd}`);
    console.log("Tâches : " + REGISTRY.map((t) => t.name).join(", "));
    process.exit(1);
  }

  // Lance uniquement cette tâche
  const { loadConfig } = await import("./lib/config.js");
  const { fetchCmcState } = await import("./lib/firebase.js");
  const Anthropic = (await import("@anthropic-ai/sdk")).default;

  const cfg = loadConfig();
  const state = await fetchCmcState(cfg.FB_URL);
  const anthropic = cfg.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY }) : null;

  const result = await task.run({ state, anthropic, cfg });
  console.log(JSON.stringify({ task: cmd, result }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
