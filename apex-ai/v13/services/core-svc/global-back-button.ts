/**
 * APEX v13 — Global Back Button.
 *
 * Demande Kevin 2026-05-08 :
 * "Sur ces vues on peut non plus pas revenir en arrière, il manque le bouton chat
 *  ou quelque chose et il faut que tu règle le problème là ça va plus par rapport
 *  aux IA ça revient souvent"
 *
 * Solution : bouton flottant ← Chat z-index max sur TOUTES les vues sauf chat.
 * - Auto-injecté dans <body> au boot.
 * - Visible top-left, sous safe-area iOS, 44×44 px touch target.
 * - Click → router.navigate('chat').
 * - Auto-hide sur la vue chat (pas de boucle).
 * - Respect prefers-reduced-motion.
 */

import { logger } from '../../core/logger.js';

const BTN_ID = 'apex-global-back-btn';
const STYLE_ID = 'apex-global-back-style';

class GlobalBackButton {
  private installed = false;

  install(): void {
    if (this.installed || typeof document === 'undefined') return;
    this.installed = true;
    this.injectStyle();
    this.mountButton();
    this.attachRouterHook();
    logger.info('global-back-button', 'installed');
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #${BTN_ID} {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 8px); /* v13.4.341 : + 8px SOUS la safe-area (lecon #103c) — avant : posé PILE sur l'heure iOS */
        left: max(env(safe-area-inset-left, 8px), 8px);
        z-index: 999999;
        min-width: 44px;
        min-height: 44px;
        padding: 8px 14px;
        background: rgba(20, 20, 30, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #c9a227;
        border: 1px solid rgba(201, 162, 39, 0.4);
        border-radius: 22px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        gap: 6px;
        transition: opacity 200ms ease, transform 150ms ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        -webkit-tap-highlight-color: transparent;
      }
      #${BTN_ID}:active {
        transform: scale(0.94);
      }
      #${BTN_ID}.is-hidden {
        opacity: 0;
        pointer-events: none;
      }
      @media (prefers-reduced-motion: reduce) {
        #${BTN_ID} { transition: none; }
        #${BTN_ID}:active { transform: none; }
      }
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  private mountButton(): void {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Retour au chat');
    btn.title = 'Retour au chat';
    btn.textContent = '← Chat';
    btn.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        location.hash = '#chat';
      },
      { passive: false },
    );
    document.body.appendChild(btn);
    this.updateVisibility();
  }

  private attachRouterHook(): void {
    /* Update visibility quand route change via hashchange (cross-router compatible) */
    window.addEventListener('hashchange', () => this.updateVisibility(), { passive: true });
    /* Update au resize/orientation change (safe-area peut changer) */
    window.addEventListener('orientationchange', () => this.updateVisibility(), { passive: true });
  }

  private updateVisibility(): void {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    /* replace(/\?.*$/,'') au lieu de split('?')[0] : évite l'accès indexé
     * (string|undefined sous noUncheckedIndexedAccess) → pas de `?? 'chat'`
     * inatteignable. Comportement identique : route = partie avant '?'. */
    const route = (location.hash || '#chat').replace(/^#/, '').replace(/\?.*$/, '');
    const isChat = route === 'chat' || route === '' || route === 'chatlite';
    if (isChat) {
      btn.classList.add('is-hidden');
    } else {
      btn.classList.remove('is-hidden');
    }
  }
}

export const globalBackButton = new GlobalBackButton();
