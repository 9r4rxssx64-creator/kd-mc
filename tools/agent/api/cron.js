// Endpoint HTTP pour Vercel Cron / manual trigger
// Protégé par un secret admin (pour éviter les appels non autorisés)

import { runAgentCycle } from "../index.js";
import { loadConfig } from "../lib/config.js";

export default async function handler(req, res) {
  const cfg = loadConfig();

  // Vérification secret
  const authSecret = req.headers["authorization"]?.replace("Bearer ", "") || req.query?.secret;
  if (cfg.AGENT_SECRET && authSecret !== cfg.AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Détecter le cron path pour le trigger
  const trigger = req.query?.trigger || req.headers["x-cron-trigger"] || "vercel-cron";

  try {
    const report = await runAgentCycle({ trigger, verbose: false });
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
