/**
 * APEX v13.4.170 — Chat message actions rendering (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - renderMessageActions : pure function, génère HTML des boutons d'action sur
 *   message assistant non-streaming (🔊 Speak, 📋 Copy, 🔄 Regen, 📄 Export PDF).
 * - Zéro side effect, XSS-safe via escapeHtml.
 *
 * Re-exportée depuis chat/index.ts (façade backward-compat).
 */

import { escapeHtml } from './chat-markdown.js';

/** Sous-type minimal de DisplayMessage requis par renderMessageActions. */
export interface MessageActionInput {
  id: string;
  role: 'user' | 'assistant' | 'tool_card';
  text: string;
  streaming?: boolean;
}

/**
 * Render les boutons d'action d'un message assistant non-streaming.
 *
 * Returns chaîne vide si :
 * - rôle != 'assistant'
 * - message en streaming
 * - texte vide
 */
export function renderMessageActions(msg: MessageActionInput): string {
  if (msg.role !== 'assistant' || msg.streaming) return '';
  if (!msg.text || msg.text.length === 0) return '';
  const btnStyle =
    'width:32px;height:32px;border-radius:50%;background:rgba(201,162,39,0.1);' +
    'border:1px solid rgba(201,162,39,0.3);cursor:pointer;display:inline-flex;' +
    'align-items:center;justify-content:center;font-size:14px;color:var(--ax-gold);' +
    'transition:all 200ms;opacity:0.7;-webkit-tap-highlight-color:transparent;padding:0;';
  return (
    `<div class="ax-msg-actions" style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;flex-wrap:wrap">` +
    `<button class="ax-msg-action" data-action="speak" data-msg-id="${escapeHtml(msg.id)}" ` +
    `style="${btnStyle}" title="Lire la réponse à voix haute" aria-label="Lire la réponse">🔊</button>` +
    `<button class="ax-msg-action" data-action="copy" data-msg-id="${escapeHtml(msg.id)}" ` +
    `style="${btnStyle}" title="Copier dans presse-papiers" aria-label="Copier le texte">📋</button>` +
    `<button class="ax-msg-action" data-action="regen" data-msg-id="${escapeHtml(msg.id)}" ` +
    `style="${btnStyle}" title="Régénérer une autre réponse" aria-label="Régénérer">🔄</button>` +
    `<button class="ax-msg-action" data-action="export-pdf" data-msg-id="${escapeHtml(msg.id)}" ` +
    `style="${btnStyle}" title="Exporter en PDF" aria-label="Exporter PDF">📄</button>` +
    `</div>`
  );
}
