/**
 * APEX v13.4.168 — Chat renderers pures (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - 3 fonctions pures : getTransformEmoji + renderFollowUps + renderSlashAutocomplete
 * - HTML string builders, XSS-safe via escapeHtml.
 * - Zéro state, zéro side effect.
 *
 * Re-exportées depuis chat/index.ts (façade backward-compat).
 */

import { filterCommands, type SlashCommand } from '../../services/admin/slash-commands.js';
import type { FollowUpSuggestion } from '../../services/ai/suggestions.js';

import { escapeHtml } from './chat-markdown.js';

/** Emoji représentatif d'un type de transformation image. */
export function getTransformEmoji(type: string): string {
  const map: Record<string, string> = {
    cartoon: '🎨',
    anime: '🤖',
    video: '🎬',
    'remove-bg': '✂️',
    stylize: '🎭',
  };
  return map[type] ?? '🖼️';
}

/**
 * Rendu HTML des suggestions follow-up (chips cliquables).
 * Retourne chaîne vide si liste vide.
 */
export function renderFollowUps(suggestions: FollowUpSuggestion[]): string {
  if (!suggestions || suggestions.length === 0) return '';
  /* v13.4.187 fix Kevin "Ultra review détaillé tronqué après Ultra" :
   * max-width 100% + white-space normal + word-break break-word pour wrap
   * labels longs au lieu de déborder hors viewport portrait iPhone. */
  const chipStyle =
    'display:inline-flex;align-items:center;gap:6px;padding:8px 12px;' +
    'background:rgba(232,184,48,0.08);border:1px solid rgba(232,184,48,0.25);' +
    'border-radius:18px;font-size:12.5px;color:rgba(255,255,255,0.85);' +
    'cursor:pointer;transition:all 160ms cubic-bezier(0.16,1,0.3,1);' +
    '-webkit-tap-highlight-color:transparent;min-height:36px;line-height:1.2;' +
    'max-width:100%;white-space:normal;word-break:break-word;overflow-wrap:anywhere;text-align:left;';
  const chips = suggestions
    .map(
      (s) =>
        `<button class="ax-followup-chip" data-followup-prompt="${escapeHtml(s.prompt)}" ` +
        `style="${chipStyle}" aria-label="Suggestion : ${escapeHtml(s.label)}">` +
        `<span aria-hidden="true">${escapeHtml(s.emoji)}</span>` +
        `<span>${escapeHtml(s.label)}</span></button>`,
    )
    .join('');
  return (
    `<div class="ax-followups" style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px;` +
    `padding-top:8px;border-top:1px dashed rgba(232,184,48,0.15)">` +
    `<span style="font-size:11px;color:rgba(255,255,255,0.45);width:100%;margin-bottom:2px">` +
    `💡 Pour aller plus loin :</span>${chips}</div>`
  );
}

/**
 * Rendu HTML de l'autocomplete des slash commands.
 * Retourne chaîne vide si aucune commande matche le préfix.
 */
export function renderSlashAutocomplete(prefix: string): string {
  const cmds = filterCommands(prefix);
  if (cmds.length === 0) return '';
  const items = cmds
    .map(
      (c: SlashCommand) =>
        `<button class="ax-slash-item" data-slash-name="${escapeHtml(c.name)}" ` +
        `style="display:flex;width:100%;text-align:left;padding:8px 12px;background:transparent;` +
        `border:none;color:#fff;cursor:pointer;align-items:center;gap:10px;` +
        `font-size:13px;border-radius:6px;-webkit-tap-highlight-color:transparent">` +
        `<span style="width:22px;text-align:center" aria-hidden="true">${escapeHtml(c.emoji)}</span>` +
        `<span style="font-weight:600;color:#e8b830">/${escapeHtml(c.name)}</span>` +
        `<span style="color:rgba(255,255,255,0.5);font-size:11.5px;flex:1">${escapeHtml(c.description)}</span>` +
        `</button>`,
    )
    .join('');
  return (
    `<div class="ax-slash-autocomplete" style="position:absolute;bottom:100%;left:0;right:0;` +
    `background:rgba(20,20,35,0.97);backdrop-filter:blur(16px);border:1px solid rgba(232,184,48,0.2);` +
    `border-radius:10px;padding:6px;margin-bottom:6px;max-height:240px;overflow-y:auto;` +
    `box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:100">${items}</div>`
  );
}
