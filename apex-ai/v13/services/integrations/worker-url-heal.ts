/**
 * APEX v13.4.281 — Self-heal des URLs de Cloudflare Workers stockées.
 *
 * Kevin 2026-06-02 « vérifie autour pour les notifs » : le sous-domaine workers.dev
 * du compte est `9r4rxssx64` (pas `desarzens-kevin`, ancien worker orphelin). Une
 * URL périmée `*.desarzens-kevin.workers.dev` persistée en localStorage (push, cors,
 * proxy) ferait taper un worker orphelin → notifications/cors/proxy KO.
 *
 * Ce heal réécrit, une fois au boot, toute URL worker stockée contenant
 * `desarzens-kevin` → `9r4rxssx64`. Idempotent, silencieux, zéro effet si déjà bon.
 */

import { logger } from '../../core/logger.js';

const OLD_SUBDOMAIN = 'desarzens-kevin';
const NEW_SUBDOMAIN = '9r4rxssx64';

/* Toutes les clés localStorage susceptibles de contenir une URL *.workers.dev. */
const WORKER_URL_KEYS = [
  'apex_v13_push_worker_url',
  'apex_v13_secrets_proxy_url',
  'ax_push_worker_url',
  'ax_cors_proxy_url',
  'ax_proxy_url',
  'ax_push_worker',
];

export function healWorkerUrls(): { fixed: number; keys: string[] } {
  const fixed: string[] = [];
  try {
    for (const key of WORKER_URL_KEYS) {
      const val = localStorage.getItem(key);
      if (val && val.includes(`.${OLD_SUBDOMAIN}.workers.dev`)) {
        const next = val.replaceAll(`.${OLD_SUBDOMAIN}.workers.dev`, `.${NEW_SUBDOMAIN}.workers.dev`);
        localStorage.setItem(key, next);
        fixed.push(key);
      }
    }
    if (fixed.length > 0) {
      logger.info(
        'worker-url-heal',
        `🔧 ${fixed.length} URL(s) worker réécrites ${OLD_SUBDOMAIN}→${NEW_SUBDOMAIN}`,
        { keys: fixed },
      );
    }
  } catch (err: unknown) {
    logger.debug('worker-url-heal', 'heal skipped', { err });
  }
  return { fixed: fixed.length, keys: fixed };
}
