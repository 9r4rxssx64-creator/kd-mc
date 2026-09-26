/**
 * APEX v13.4.269 — Helper de préservation du scroll + refresh intelligent.
 *
 * Kevin 2026-05-23 : "Dans toute lapp, où la vue ne se mets pas au bon enfroit
 * ou quand je clic qlq par, ça remonte en haut de page. Actualisé les vues.
 * intelligente"
 *
 * Cause : chaque feature qui appelle `render(rootEl)` fait `rootEl.innerHTML = ...`
 * → scroll position perdue → la vue saute en haut à chaque action.
 *
 * Fix : wrapper qui save `scrollTop` AVANT render, restaure APRÈS. Idempotent,
 * pas de side-effect si pas de scroll. Marche aussi pour scroll horizontal.
 */

import { logger } from './logger.js';

/**
 * Wrap un re-render pour préserver la position de scroll. Utile pour les
 * features qui font `render(rootEl)` après une action (push backup, test all,
 * diag, etc.) — sans ce wrapper, la vue saute en haut.
 *
 * @param el Élément racine de la feature (ou null/undefined → no-op safe)
 * @param fn Fonction de re-render (sync ou async)
 * @returns Le résultat de fn() (passthrough)
 */
export async function preserveScroll<T>(
  el: HTMLElement | null | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const win = typeof window !== 'undefined' ? window : null;
  /* Capture scroll AVANT render. On capture les 3 sources possibles :
   * - window scroll (la plus fréquente)
   * - element.scrollTop (si el a un overflow propre)
   * - document.documentElement.scrollTop (fallback)
   * et on restaure tout. */
  const winY = win?.scrollY ?? 0;
  const elTop = el?.scrollTop ?? 0;
  const elLeft = el?.scrollLeft ?? 0;
  /* Capture aussi l'élément qui a le focus (input/textarea) pour le restorer */
  const activeId = document.activeElement && document.activeElement !== document.body
    ? (document.activeElement as HTMLElement).id
    : null;
  const activeSel = activeId ? `#${activeId}` : null;
  /* Capture la position du curseur dans l'input/textarea actif */
  let cursorPos: { start: number; end: number } | null = null;
  if (activeSel) {
    const ae = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (ae && typeof ae.selectionStart === 'number' && typeof ae.selectionEnd === 'number') {
      cursorPos = { start: ae.selectionStart, end: ae.selectionEnd };
    }
  }

  try {
    return await fn();
  } finally {
    /* Restore APRÈS render dans un microtask pour laisser le DOM se settle */
    queueMicrotask(() => {
      try {
        if (win && winY > 0) {
          /* `instant` (sans animation) car re-render = pas une navigation */
          win.scrollTo({ top: winY, left: 0, behavior: 'instant' as ScrollBehavior });
        }
        if (el) {
          if (elTop > 0) el.scrollTop = elTop;
          if (elLeft > 0) el.scrollLeft = elLeft;
        }
        /* Restore focus + position curseur si possible */
        if (activeSel) {
          const target = document.querySelector(activeSel) as HTMLElement | null;
          if (target && typeof target.focus === 'function') {
            target.focus({ preventScroll: true });
            if (cursorPos && 'setSelectionRange' in target) {
              const inp = target as HTMLInputElement | HTMLTextAreaElement;
              try {
                inp.setSelectionRange(cursorPos.start, cursorPos.end);
              } catch {
                /* not all input types support setSelectionRange */
              }
            }
          }
        }
      } catch (err: unknown) {
        logger.debug('view-utils', 'preserveScroll restore failed', { err });
      }
    });
  }
}
