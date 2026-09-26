// Endpoint /api/sentry-test — déclenche une erreur volontaire pour tester Sentry
// Protégé par AGENT_SECRET (pour éviter spam)
// Usage : GET /api/sentry-test?secret=<AGENT_SECRET>&type=sync|async|promise
//
// Retourne :
//   - 200 { ok: true, sent: true, eventId, sentryEnabled } si Sentry activé
//   - 200 { ok: true, sent: false, reason: "SENTRY_DSN not set" } si Sentry désactivé
//   - 401 si mauvais secret

import { loadConfig } from "../lib/config.js";
import { initSentry } from "../lib/sentry.js";

const cfg = loadConfig();
const Sentry = initSentry(cfg);

export default async function handler(req, res) {
  // Auth
  const authSecret = req.headers["authorization"]?.replace("Bearer ", "") || req.query?.secret;
  if (cfg.AGENT_SECRET && authSecret !== cfg.AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sentryEnabled = !!cfg.SENTRY_DSN;
  if (!sentryEnabled) {
    return res.status(200).json({
      ok: true,
      sent: false,
      reason: "SENTRY_DSN not set in env vars",
      hint: "Add SENTRY_DSN to Vercel env vars and redeploy",
    });
  }

  const type = (req.query?.type || "sync").toString();
  let eventId = null;

  try {
    // Capture une exception intentionnelle avec contexte riche
    if (type === "async") {
      try {
        await Promise.reject(new Error(`[SENTRY TEST] Async error at ${new Date().toISOString()}`));
      } catch (e) {
        eventId = Sentry.captureException(e, {
          tags: { test: "async", endpoint: "api/sentry-test" },
          contexts: { test_info: { triggered_by: "kevin_manual_test", method: "async_reject" } },
        });
      }
    } else if (type === "promise") {
      // Unhandled rejection (sera catchée par l'intégration globale)
      Sentry.captureMessage(`[SENTRY TEST] Message event at ${new Date().toISOString()}`, {
        level: "info",
        tags: { test: "message", endpoint: "api/sentry-test" },
      });
      eventId = "message-event";
    } else {
      // Synchronous error (default)
      try {
        throw new Error(`[SENTRY TEST] Sync error at ${new Date().toISOString()} — test from Kevin`);
      } catch (e) {
        eventId = Sentry.captureException(e, {
          tags: { test: "sync", endpoint: "api/sentry-test" },
          contexts: { test_info: { triggered_by: "kevin_manual_test", method: "throw" } },
        });
      }
    }

    // Forcer l'envoi avant la fin de la fonction serverless
    await Sentry.flush(3000);

    return res.status(200).json({
      ok: true,
      sent: true,
      sentryEnabled: true,
      eventId,
      type,
      sentryDashboard: "https://kdmc.sentry.io/issues/?project=cmcteams",
      hint: "Visit the dashboard in 10-30s to see the event",
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
}
