/**
 * APEX v13 — Notification Actions Mapper.
 *
 * Demande Kevin 2026-05-08 :
 * "beaucoup d'actes de fonctions dans l'application, quand je clique dessus,
 *  il ne se passe rien" (notif iOS '🔑 71 credentials manquants' → click → rien).
 *
 * Centralise le mapping `action` → URL/route. Utilisé par :
 *   - sw.js notificationclick (postMessage `notification_clicked`)
 *   - core/bootstrap.ts listener `notification:clicked`
 *   - services/kevin-alerts.ts → tryBrowserPush (data.cta_url)
 *   - services/push-notifications.ts → send (cta_url)
 *
 * Pattern : chaque alerte/notif émise par l'app DOIT inclure soit `cta_url`
 * (URL absolue/relative) soit `tag`/`source` connu de ce mapping. Sans ça,
 * fallback `#chat` (jamais "rien" comme avant).
 */

import { logger } from '../../core/logger.js';
import { router } from '../../core/router.js';

/**
 * Map : `tag` ou `source` connu → route hash. Étendre selon les notifs émises.
 * Quand un nouveau use-case nécessite un click handler dédié, ajouter ici.
 */
const ACTION_TO_ROUTE: Readonly<Record<string, string>> = Object.freeze({
  /* Credentials manquants (auto-restore-watch / alerts) */
  credentials_missing: 'admin-credentials-status',
  'credentials-missing': 'admin-credentials-status',
  'auto-restore-watch': 'admin-credentials-status',
  'apex-credentials': 'admin-credentials-status',

  /* Auto ultra-reset */
  auto_reset: 'self-diag',
  'auto-ultra-reset': 'self-diag',

  /* Sentinelles + provider health */
  'token-watch': 'admin-credentials-status',
  'ai-providers-health': 'smart-router',
  'smart-router-watch': 'smart-router',
  'uptime-monitor': 'self-diag',

  /* Backup + vault */
  'backup-watch': 'admin-backup',
  'vault-firebase-backup': 'vault',
  'vault-watch': 'vault',

  /* Memory + storage */
  'memory-watch': 'knowledge',
  'storage-watch': 'self-diag',

  /* Pipeline temps-réel Apex↔Claude Code */
  'claude-todo': 'admin',
  handoff_received: 'admin',
  todo_resolved: 'admin',

  /* IoT / domotique */
  'iot-providers': 'iot-providers',
  broadlink: 'broadlink-setup',

  /* Inscription clients (waiting approval) */
  signup_otp: 'signup-approval',
  signup_pending: 'signup-approval',

  /* Chat fallback */
  chat: 'chat',
  default: 'chat',
});

/**
 * Resolve un `action`/`tag`/`source`/URL en route hash exploitable.
 *
 * @param input  - cta_url, tag, source, ou action arbitraire (peut être URL absolue,
 *                 relative `#route`, ou clé du mapping).
 * @returns      - hash route (sans `#`) ou null si rien d'utilisable.
 */
export function resolveNotificationRoute(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  /* Déjà un hash route → strip le # */
  if (trimmed.startsWith('#')) return trimmed.replace(/^#\/?/, '');

  /* URL absolue → extrait le hash si présent, sinon ouvre dans nouveau tab côté SW */
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.hash) return u.hash.replace(/^#\/?/, '');
      return null; /* URL externe → SW openWindow gère */
    } catch {
      return null;
    }
  }

  /* Mapping action / tag / source */
  const lookup = ACTION_TO_ROUTE[trimmed] ?? ACTION_TO_ROUTE[trimmed.toLowerCase()];
  if (lookup) return lookup;

  /* Possible déjà un nom de route (ex: 'admin', 'chat') */
  return trimmed;
}

/**
 * Navigate vers la route correspondant à la notification cliquée.
 * Utilise router.navigate() (hash-based, lazy load route).
 *
 * @returns true si navigation déclenchée, false si fallback.
 */
export function handleNotificationClick(payload: {
  url?: string | null | undefined;
  tag?: string | null | undefined;
  source?: string | null | undefined;
}): boolean {
  const candidates = [payload.url, payload.tag, payload.source].filter((s): s is string => Boolean(s));
  for (const c of candidates) {
    const route = resolveNotificationRoute(c);
    if (route) {
      logger.info('notif-actions', `notification click → #${route}`, { input: c });
      try {
        router.navigate(route);
        return true;
      } catch (err: unknown) {
        logger.warn('notif-actions', 'router.navigate failed, fallback location.hash', { err });
        location.hash = '#' + route;
        return true;
      }
    }
  }
  /* Fallback final → chat */
  logger.warn('notif-actions', 'no route found, fallback #chat', { payload });
  try {
    router.navigate('chat');
  } catch {
    location.hash = '#chat';
  }
  return false;
}

export const notificationActions = {
  resolveRoute: resolveNotificationRoute,
  handleClick: handleNotificationClick,
};
