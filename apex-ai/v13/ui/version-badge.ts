/**
 * APEX v13.4.9 — Indicateur version (Kevin "plus de visuel de version").
 *
 * Affiche un badge discret en bas à droite avec la version courante.
 * Kevin peut vérifier d'un coup d'œil quelle version d'Apex il utilise.
 *
 * Clic = toast détaillé (version, dernière vérification MAJ, statut SW).
 *
 * v13.4.9 fix Ultra Review C1/C2 :
 *  - CSS via styleInjector (CSP-safe, nonce auto)
 *  - Guard contre doublon si #apex-version-badge-static déjà présent dans le HTML
 *    (statique HTML rendu par index.html en cas de crash JS = source de vérité visuelle)
 */

import { APP_VER } from '../core/bootstrap.js';
import { logger } from '../core/logger.js';
import { styleInjector } from '../services/core-svc/style-injector.js';

const BADGE_ID = 'apex-version-badge';
const STATIC_BADGE_ID = 'apex-version-badge-static';
const STYLE_INJECTOR_ID = 'apex-version-badge';

/* v13.4.177 (Kevin "Je ne vois pas la version de l app") :
 * AVANT : right:8px masqué par SOS bouton (right:16px, z-index 2147483647).
 * APRÈS : bottom-LEFT (loin du SOS) + z-index élevé pour rester au-dessus
 * de tout sauf modals. opacity 0.85 (vs 0.6) pour lisibilité immédiate. */
const BADGE_CSS = `
  #${BADGE_ID} {
    position: fixed;
    bottom: max(8px, env(safe-area-inset-bottom, 8px));
    left: 8px;
    z-index: 2147483646;
    padding: 5px 10px;
    background: linear-gradient(135deg, rgba(232, 184, 48, 0.22), rgba(232, 184, 48, 0.12));
    border: 1px solid rgba(232, 184, 48, 0.55);
    color: #c9a227;
    font-size: 11px;
    font-family: 'SF Mono', Menlo, monospace;
    font-weight: 700;
    border-radius: 12px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    opacity: 0.85;
    transition: opacity 200ms ease;
    pointer-events: auto;
    line-height: 1;
    letter-spacing: 0.02em;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  #${BADGE_ID}:hover, #${BADGE_ID}:active {
    opacity: 1;
  }
  @media (max-width: 480px) {
    #${BADGE_ID} {
      font-size: 10px;
      padding: 4px 8px;
    }
  }
`;

export function installVersionBadge(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BADGE_ID)) return;

  /* v13.4.9 fix C2 (Ultra Review) : si le badge statique HTML est déjà présent
   * (rendu inline dans index.html pour fallback "JS crashed"), on ne double pas
   * l'affichage avec une version JS-injectée. On enrichit juste le statique
   * avec le click handler "détails" qui n'est pas câblé en pur HTML. */
  const staticBadge = document.getElementById(STATIC_BADGE_ID);
  if (staticBadge) {
    if (!staticBadge.dataset['axHandlerAttached']) {
      staticBadge.dataset['axHandlerAttached'] = '1';
      staticBadge.addEventListener('click', () => void showVersionDetails());
      /* v13.4.9 fix I-10 (Ultra Review² a11y) : div agissant comme button
       * doit aussi répondre à Enter/Space (keyboard-only users). */
      staticBadge.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void showVersionDetails();
        }
      });
      staticBadge.setAttribute('role', 'button');
      staticBadge.setAttribute('tabindex', '0');
      staticBadge.setAttribute('aria-label', `Version Apex ${APP_VER} · clic pour détails`);
      staticBadge.title = `Apex AI ${APP_VER} · clic pour détails`;
    }
    logger.info('version-badge', `static badge enriched: ${APP_VER}`);
    return;
  }

  /* CSS via styleInjector (CSP-safe, nonce attaché auto si style-src nonce-only).
   * Fallback automatique vers Constructible Stylesheets ou <style nonce>. */
  styleInjector.inject(STYLE_INJECTOR_ID, BADGE_CSS);

  const badge = document.createElement('button');
  badge.id = BADGE_ID;
  badge.type = 'button';
  badge.textContent = APP_VER;
  badge.title = `Apex AI ${APP_VER} · clic pour détails`;
  badge.setAttribute('aria-label', `Version Apex ${APP_VER}`);
  badge.addEventListener('click', () => {
    void showVersionDetails();
  });
  document.body.appendChild(badge);
  logger.info('version-badge', `installé visible : ${APP_VER}`);
}

async function showVersionDetails(): Promise<void> {
  try {
    const { toast } = await import('./toast.js');
    const swReg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    const swState = swReg?.active?.state ?? 'aucun';
    const lastCheck = parseInt(localStorage.getItem('apex_v13_last_visibility_update_check') ?? '0', 10);
    const lastCheckStr = lastCheck > 0 ? new Date(lastCheck).toLocaleTimeString('fr-FR') : 'jamais';
    toast.info(
      `Apex ${APP_VER} · SW: ${swState} · Dernier check MAJ: ${lastCheckStr}`,
      { duration: 6000 },
    );
  } catch (err: unknown) {
    logger.warn('version-badge', 'showVersionDetails failed', { err });
  }
}

/** Affiche un toast boot "Apex vX.Y.Z chargé" pour confirmer à Kevin la version active. */
export function showBootToast(): void {
  if (typeof document === 'undefined') return;
  /* v13.4.9 : passe sessionStorage (pas localStorage) — 1 toast par session, pas par heure.
   * Permet vérifier la nouvelle version après chaque force-update. */
  try {
    if (sessionStorage.getItem('apex_v13_boot_toast_shown')) return;
    sessionStorage.setItem('apex_v13_boot_toast_shown', '1');
  } catch { /* ignore */ }

  void import('./toast.js').then(({ toast }) => {
    toast.success(`✅ Apex ${APP_VER} chargé`, { duration: 3000 });
  }).catch(() => { /* ignore */ });
}
