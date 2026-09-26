// Initialisation centralisée de Sentry Node SDK (v1.1 — intégration P4)
// https://docs.sentry.io/platforms/javascript/guides/node/
//
// Bonne pratique (cf. https://github.com/getsentry/sentry-for-ai/blob/main/skills/sentry-sdk-setup/SKILL.md)
//   - Init AVANT tout autre import applicatif
//   - Tracer les fonctions critiques (runAgentCycle, tasks)
//   - Capturer explicitement les erreurs dans les catches importants
//   - Fournir un context (tags: trigger, release, environment)

import * as Sentry from "@sentry/node";

let _initialized = false;

export function initSentry(cfg) {
  if (_initialized) return Sentry;
  if (!cfg?.SENTRY_DSN) {
    // Pas de DSN → pas de Sentry (agent fonctionne quand même)
    return Sentry;
  }

  Sentry.init({
    dsn: cfg.SENTRY_DSN,
    environment: cfg.SENTRY_ENVIRONMENT || "production",
    release: cfg.SENTRY_RELEASE || "unknown",

    // Performance : tracer 10 % des transactions (gratuit 5k events/mois)
    tracesSampleRate: 0.1,

    // Capture des erreurs non gérées (uncaughtException, unhandledRejection)
    integrations: [
      Sentry.httpIntegration({ breadcrumbs: true }),
      Sentry.consoleIntegration(),
    ],

    // Ajouter contexte applicatif
    initialScope: {
      tags: {
        component: "kdmc-agent",
        admin: cfg.AGENT_ADMIN_ID || "U11804",
      },
    },

    // Filtrer les erreurs peu utiles (ex: abort réseau normal)
    beforeSend(event, hint) {
      const err = hint?.originalException;
      if (err?.name === "AbortError" || err?.code === "ECONNRESET") return null;
      return event;
    },
  });

  _initialized = true;
  return Sentry;
}

export { Sentry };
