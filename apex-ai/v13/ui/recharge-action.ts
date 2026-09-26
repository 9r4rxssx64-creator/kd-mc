/* APEX v13.4.232 — Composant partagé "Recharge / Rotate" action
 *
 * Élimine doublon UI identifié par subagent UX audit P0.3 :
 *   - dashboard/index.ts:376-401 (bouton dans card service)
 *   - settings/index.ts:237-350 (lien dans conso-scan)
 *
 * Helper unique → 1 source de vérité, styling cohérent, futur changement à 1 endroit.
 */

import { escapeHtml } from '../core/escape-html.js';

export interface RechargeActionOptions {
  rechargeUrl?: string | undefined;
  rotateUrl?: string | undefined;
  /** Variant compact (inline link, ex: settings) vs full (button, ex: dashboard) */
  variant?: 'inline' | 'button' | undefined;
  /** Label custom (default: "Recharge") */
  label?: string | undefined;
}

/**
 * Render le couple Recharge + Rotate URLs en HTML.
 * Returns empty string si aucune URL fournie.
 */
export function renderRechargeAction(opts: RechargeActionOptions): string {
  const { rechargeUrl, rotateUrl, variant = 'inline', label = 'Recharge' } = opts;
  if (!rechargeUrl && !rotateUrl) return '';

  if (variant === 'button') {
    const safeRecharge = rechargeUrl ? escapeHtml(rechargeUrl) : '';
    const safeRotate = rotateUrl ? escapeHtml(rotateUrl) : '';
    return `<div class="ax-recharge-action ax-recharge-action-button" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
      ${rechargeUrl ? `<a class="ax-btn-health ax-btn-health-primary" href="${safeRecharge}" target="_blank" rel="noopener" style="text-decoration:none;font-size:12px">💳 ${escapeHtml(label)}</a>` : ''}
      ${rotateUrl ? `<a class="ax-btn-health ax-btn-health-blue" href="${safeRotate}" target="_blank" rel="noopener" style="text-decoration:none;font-size:12px">🔄 Rotate</a>` : ''}
    </div>`;
  }

  /* inline variant */
  const safeRecharge = rechargeUrl ? escapeHtml(rechargeUrl) : '';
  const safeRotate = rotateUrl ? escapeHtml(rotateUrl) : '';
  return `<div class="ax-recharge-action ax-recharge-action-inline" style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;font-size:11px">
    ${rechargeUrl ? `<a href="${safeRecharge}" target="_blank" rel="noopener" style="color:var(--ax-gold-deep);text-decoration:none;font-weight:600">💳 ${escapeHtml(label)} →</a>` : ''}
    ${rotateUrl ? `<a href="${safeRotate}" target="_blank" rel="noopener" style="color:var(--ax-gold-deep);text-decoration:none;font-weight:600">🔄 Rotate →</a>` : ''}
  </div>`;
}
