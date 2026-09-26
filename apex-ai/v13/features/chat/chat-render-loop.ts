/**
 * APEX v13 — chat-render-loop.ts
 * Boucle de rendu des messages du chat : renderMessages (liste complète),
 * updateAssistantBubble (maj bulle en streaming), smartAutoScroll, FAB.
 *
 * Extrait de features/chat/index.ts (v13.4.305, refactor monolithe — cœur).
 * La conversation (référence STABLE const) est fournie une fois via
 * setRenderLoopConversation() ; les fonctions gardent leur signature (rootEl).
 */
import { extractThinking } from '../../services/ai/reasoning-mode.js';
import { generateFollowUps, isFollowUpsEnabled } from '../../services/ai/suggestions.js';
import { renderMarkdownEnriched, wireMarkdownActions } from '../../ui/markdown.js';

import { renderMessageActions } from './chat-actions-render.js';
import { renderProviderBadge, renderToolPills } from './chat-badges.js';
import { renderMarkdownLight, escapeHtml } from './chat-markdown.js';
import { renderFollowUps } from './chat-renderers.js';

import type { DisplayMessage } from './index.js';

/* v13.4.352 — Affichage de la réflexion (parité "thinking display" flagship).
 * Sépare un bloc <thinking>…</thinking> de la réponse et le rend repliable.
 * S'applique UNIQUEMENT aux messages assistant ; additif (aucune surgery du stream). */
function renderThinkingBlock(thinking: string, streaming: boolean, label = '💭 Réflexion'): string {
  if (!thinking) return '';
  return (
    `<details class="ax-thinking"${streaming ? ' open' : ''}>` +
    `<summary class="ax-thinking-sum">${label}</summary>` +
    `<div class="ax-thinking-body">${escapeHtml(thinking)}</div></details>`
  );
}

/** Corps d'un message : réflexion repliable (assistant) + markdown de la réponse. */
function renderAssistantBody(m: DisplayMessage): string {
  if (m.role !== 'assistant') {
    return m.streaming ? renderMarkdownLight(m.text) : renderMarkdownEnriched(m.text);
  }
  const { thinking, answer } = extractThinking(m.text);
  const md = m.streaming ? renderMarkdownLight(answer) : renderMarkdownEnriched(answer);
  /* v13.4.355 : réflexion NATIVE Anthropic (extended thinking) — bloc dédié distinct
   * du bloc prompt-based (extractThinking). Les deux coexistent : natif si présent,
   * prompt-based sinon. Additif, aucune surgery du stream. */
  const nativeBlock = renderThinkingBlock(m.nativeThinking ?? '', !!m.streaming, '🧠 Raisonnement (natif)');
  return nativeBlock + renderThinkingBlock(thinking, !!m.streaming) + md;
}

/** Référence STABLE vers la conversation du module chat (fournie au boot). */
let _conv: DisplayMessage[] = [];

/** Lie la boucle de rendu à la conversation (réf stable mutée in-place). */
export function setRenderLoopConversation(conversation: DisplayMessage[]): void {
  _conv = conversation;
}

/** Pousse un message assistant dans la conversation + re-render. */
export function pushAssistantMessage(rootEl: HTMLElement, text: string): void {
  _conv.push({ id: `a_${Date.now()}`, role: 'assistant', text, ts: Date.now() });
  renderMessages(rootEl);
}

export function updateAssistantBubble(rootEl: HTMLElement, msg: DisplayMessage): void {
  const bubble = rootEl.querySelector(`[data-msg-id="${msg.id}"] .ax-msg-body`);
  if (bubble) {
    /* Pendant streaming → markdown light pour vitesse / hors → enrichi */
    const md = renderAssistantBody(msg);
    bubble.innerHTML =
      renderToolPills(msg) +
      md +
      (msg.streaming ? '<span class="ax-cursor">▌</span>' : '') +
      renderMessageActions(msg);
    /* Smart scroll : ne force PAS si user a scrollé manuellement vers le haut */
    smartAutoScroll(rootEl);
  } else {
    renderMessages(rootEl);
  }
}

/**
 * Smart auto-scroll v13.3.48 — ne force pas si user a scrollé volontairement haut.
 * Considère "user scrollé" si distance bottom > 200px.
 */
function smartAutoScroll(rootEl: HTMLElement): void {
  const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
  if (!scroll) return;
  const distFromBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
  if (distFromBottom < 200) {
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
  }
  /* v13.3.72 Kevin (style Claude Code): show/hide scroll-to-bottom FAB */
  const fab = rootEl.querySelector<HTMLElement>('#ax-scroll-bottom');
  if (fab) {
    if (distFromBottom > 240) fab.classList.add('visible');
    else fab.classList.remove('visible');
  }
}

/**
 * v13.3.72 Kevin: wire scroll-to-bottom FAB (apparaît si user scrollé > 240px depuis bottom).
 */
export function wireScrollToBottomFab(rootEl: HTMLElement): void {
  const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
  const fab = rootEl.querySelector<HTMLElement>('#ax-scroll-bottom');
  if (!scroll || !fab) return;
  const updateFabVisibility = (): void => {
    const dist = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    if (dist > 240) fab.classList.add('visible');
    else fab.classList.remove('visible');
  };
  scroll.addEventListener('scroll', updateFabVisibility, { passive: true });
  fab.addEventListener('click', () => {
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
    fab.classList.remove('visible');
  });
}

export function renderMessages(rootEl: HTMLElement): void {
  const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
  if (!scroll) return;
  /* v13.3.48 — Identifier le DERNIER assistant message non-streaming pour follow-ups */
  let lastAssistantNonStreamingIdx = -1;
  for (let i = _conv.length - 1; i >= 0; i--) {
    const m = _conv[i];
    if (m && m.role === 'assistant' && !m.streaming && m.text.trim().length > 0) {
      lastAssistantNonStreamingIdx = i;
      break;
    }
  }
  const html = _conv
    .map((m, idx) => {
      /* Streaming indicator amélioré : typing dots animés si pas encore de texte, sinon cursor blink */
      let trail = '';
      if (m.streaming) {
        if (m.text.length === 0) {
          trail = `
            <span class="ax-typing" aria-label="Apex réfléchit">
              <span class="ax-typing-dot"></span>
              <span class="ax-typing-dot"></span>
              <span class="ax-typing-dot"></span>
            </span>
          `;
        } else {
          trail = '<span class="ax-cursor">▌</span>';
        }
      }
      const pills = renderToolPills(m);
      const providerBadge = renderProviderBadge(m);
      const actions = renderMessageActions(m);
      /* v13.3.48 — Follow-up chips uniquement sur DERNIER message assistant terminé */
      let followUps = '';
      if (idx === lastAssistantNonStreamingIdx && isFollowUpsEnabled()) {
        const lastUser = [..._conv].reverse().find((mm) => mm && mm.role === 'user')?.text;
        followUps = renderFollowUps(generateFollowUps(m.text, lastUser));
      }
      /* Pendant streaming : markdown light, hors : enrichi */
      const md = renderAssistantBody(m);
      return `
        <div class="ax-msg ax-msg-${m.role} ax-modernized-msg ax-slide-up-fade" data-msg-id="${m.id}">
          <div class="ax-msg-body">${pills}${md}${trail}${providerBadge}${actions}${followUps}</div>
        </div>
      `;
    })
    .join('');
  scroll.innerHTML = html;
  /* Smart scroll : ne force pas si user a scrollé volontairement haut */
  smartAutoScroll(rootEl);
  /* Wire markdown actions (copy code blocks) — idempotent */
  wireMarkdownActions(scroll);
}
