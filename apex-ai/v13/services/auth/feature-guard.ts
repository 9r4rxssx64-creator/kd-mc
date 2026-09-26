/**
 * APEX v13 — Feature Guard centralized helper.
 *
 * Règle CLAUDE.md erreur #28 (DECLARATION ≠ DEPLOYMENT) :
 *   "Tout helper P0/P1 doit être WIRÉ dans le flow opérationnel réel,
 *    pas seulement déclaré console-only".
 *
 * Ce module fournit 3 helpers utilitaires pour wirer les 117 features
 * du registry `feature-toggles.ts` dans :
 *  - les modules UI (`render(rootEl)`) → `guardFeatureEnabled`
 *  - les sentinelles (`task()`)        → `guardSentinelEnabled`
 *  - les services au boot              → `guardFeatureBoot`
 *
 * Pattern d'utilisation dans une vue/feature :
 * ```ts
 * import { guardFeatureEnabled } from '../../services/feature-guard.js';
 * import { store } from '../../core/store.js';
 *
 * export function render(rootEl: HTMLElement): void {
 *   const userId = store.get('user')?.id;
 *   if (!guardFeatureEnabled('studio.music', rootEl, userId)) return;
 *   // ... rendu normal
 * }
 * ```
 *
 * Pattern dans une sentinelle :
 * ```ts
 * task: async () => {
 *   if (!guardSentinelEnabled('sentinel.token-watch')) return;
 *   // ... travail sentinelle
 * }
 * ```
 *
 * Pattern dans un service au boot :
 * ```ts
 * if (!guardFeatureBoot('feature.realtime-backup')) {
 *   logger.info('realtime-backup', 'feature disabled — skip start');
 *   return;
 * }
 * ```
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { logger } from '../../core/logger.js';

import { isFeatureEnabled, renderDisabledNotice } from './feature-toggles.js';

/**
 * Garde une vue (`render(rootEl)`) selon le toggle d'une feature.
 *
 * @param featureId Identifiant feature dans le registry (ex: 'studio.music')
 * @param rootEl    Élément racine de la vue (sera rempli avec un fallback HTML si désactivée)
 * @param userId    User courant (pour resolution per-user > global > default)
 * @param customFallbackHtml HTML personnalisé en cas de désactivation (sinon notice standard)
 * @returns true si feature activée, false si désactivée (rootEl rempli avec notice + early return conseillé)
 */
export function guardFeatureEnabled(
  featureId: string,
  rootEl: HTMLElement,
  userId?: string,
  customFallbackHtml?: string,
): boolean {
  if (isFeatureEnabled(featureId, userId)) return true;
  try {
    safeSetHTML(rootEl, customFallbackHtml ?? renderDisabledNotice(featureId));
  } catch (err) {
    logger.warn('feature-guard', 'failed to render disabled notice', { featureId, err });
  }
  return false;
}

/**
 * Garde une sentinelle / agent / job dans son `task()`.
 *
 * @param sentinelId Id de la sentinelle (ex: 'sentinel.token-watch')
 * @returns true si activée, false si désactivée (caller doit return early)
 */
export function guardSentinelEnabled(sentinelId: string): boolean {
  return isFeatureEnabled(sentinelId);
}

/**
 * Garde au boot d'un service.
 * Retourne false si la feature est OFF — le caller décide quoi faire (skip start, log).
 *
 * @param featureId Id feature
 * @returns true si activée, false sinon
 */
export function guardFeatureBoot(featureId: string): boolean {
  return isFeatureEnabled(featureId);
}

/**
 * Garde pour les tools IA (apex-tools-dispatch).
 * Retourne un message d'erreur user-friendly si désactivée, sinon null.
 *
 * @param toolId Id tool (ex: 'tool.web_search')
 * @param userId User qui appelle le tool
 * @returns null si OK, sinon objet avec message d'erreur formaté pour Claude tool_result
 */
export function guardToolEnabled(
  toolId: string,
  userId?: string,
): { error: string } | null {
  if (isFeatureEnabled(toolId, userId)) return null;
  return {
    error: `Tool ${toolId} désactivé par l'admin. Action ignorée.`,
  };
}
