/**
 * APEX v13.4.167 — Chat paste detection + visual card (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - detectPasteKind : pure function, classification du contenu collé
 * - pushPasteCard : DOM injection, XSS-safe (textContent partout)
 *
 * Re-exportées depuis chat/index.ts (façade backward-compat).
 */

import { logger } from '../../core/logger.js';

/**
 * Type de paste détecté :
 * - 'credential' : token/key API → autoStore prompt
 * - 'code'       : code multi-line → preview card + sauve coffre
 * - 'url'        : URL valide → preview card
 * - 'planning'   : format SBM CMCteams → bridge (déjà géré ailleurs)
 * - 'text'       : fallback normal (texte libre)
 */
export type PasteKind = 'credential' | 'code' | 'url' | 'planning' | 'text';

/**
 * Détecte le kind de contenu collé (heuristiques regex/structure).
 * Pure function, zéro side effect.
 */
export function detectPasteKind(pasted: string): PasteKind {
  const trimmed = pasted.trim();
  if (!trimmed) return 'text';
  /* 1. Backtick block multi-line (```lang ... ```) */
  if (/```[\s\S]+?```/.test(trimmed)) return 'code';
  /* 2. Patterns code (3+ lignes ou 1 ligne avec mot-clé fort) */
  const lines = trimmed.split('\n');
  if (lines.length >= 3) {
    const codeKeywords = /\b(function|const|let|var|import|export|class|def|return|async|await|public|private|interface|type)\b/;
    const hits = lines.filter((l) => codeKeywords.test(l)).length;
    if (hits >= 2) return 'code';
    /* Syntaxe JSON/YAML/HTML structuré multi-line */
    if (/^\s*[{[]/.test(lines[0] ?? '') && /[}\]]\s*$/.test(lines[lines.length - 1] ?? '')) return 'code';
    if (/^<(\?php|!DOCTYPE|html|script|style)/i.test(lines[0] ?? '')) return 'code';
  }
  /* 3. URL pure (1 seule URL sans autre texte) */
  if (/^https?:\/\/\S+$/i.test(trimmed)) return 'url';
  /* 4. fallback */
  return 'text';
}

/**
 * Push visual card dans le chat scroll pour Kevin "visuel pas toast".
 *
 * Card format : icône type + preview tronqué + actions buttons (sauver coffre / annuler).
 * XSS-safe : utilise textContent partout (jamais innerHTML sur user input).
 *
 * Retourne l'élément HTMLElement créé (pour tests + caller manipulation).
 */
export function pushPasteCard(
  rootEl: HTMLElement,
  type: PasteKind,
  preview: string,
  actions: Array<{ label: string; onClick: () => void; primary?: boolean }> = [],
): HTMLElement | null {
  const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
  if (!scroll) return null;
  const icon = type === 'credential' ? '🔑'
    : type === 'code' ? '💻'
    : type === 'url' ? '🔗'
    : type === 'planning' ? '📋'
    : '📄';
  const typeLabel = type === 'credential' ? 'Identifiant détecté'
    : type === 'code' ? 'Code détecté'
    : type === 'url' ? 'Lien détecté'
    : type === 'planning' ? 'Planning détecté'
    : 'Texte';
  const card = document.createElement('div');
  card.className = 'ax-msg ax-msg-user ax-paste-card ax-slide-up-fade';
  card.style.cssText = 'background:rgba(201,162,39,0.08);border:1px solid rgba(201,162,39,0.3);border-radius:12px;padding:12px;margin:8px 0';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;color:#c9a227;font-weight:600;margin-bottom:8px';
  head.textContent = `${icon} ${typeLabel}`;
  card.appendChild(head);

  const previewDiv = document.createElement('pre');
  previewDiv.style.cssText = 'background:rgba(0,0,0,0.3);color:#e0e0e0;padding:8px;border-radius:6px;font-family:Consolas,Monaco,monospace;font-size:12px;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0 0 8px';
  /* XSS-safe : textContent uniquement */
  previewDiv.textContent = preview.length > 500 ? `${preview.slice(0, 500)}…` : preview;
  card.appendChild(previewDiv);

  if (actions.length > 0) {
    const actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = action.primary ? 'ax-btn ax-btn-primary' : 'ax-btn ax-btn-outline';
      btn.textContent = action.label;
      btn.style.cssText = 'padding:6px 14px;font-size:13px;border-radius:6px;cursor:pointer';
      btn.addEventListener('click', () => {
        try { action.onClick(); }
        catch (err: unknown) { logger.warn('chat-paste', 'paste-card action failed', { err }); }
        /* Disable buttons après clic action (évite double-trigger) */
        actionsDiv.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
      });
      actionsDiv.appendChild(btn);
    }
    card.appendChild(actionsDiv);
  }

  scroll.appendChild(card);
  scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
  return card;
}
