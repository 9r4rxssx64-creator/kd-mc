/**
 * APEX v13.4.46 — Anti-Zoom iOS Safari PWA (Kevin "Toujours en zoom").
 *
 * Bug critique iPhone PWA : malgré viewport user-scalable=no + font-size 16px
 * inputs + touch-action: manipulation, l'app peut rester stuck en zoom après :
 * - Double-tap accidentel sur élément non-touch-action manipulation
 * - Pinch-zoom initial (avant que la page charge user-scalable=no)
 * - Bug iOS Safari 16+ qui ignore parfois user-scalable
 *
 * Solution triple :
 * 1. Détection visualViewport.scale > 1 + reset programmatique
 * 2. Bloquer gesturestart/change/end (events iOS-specific anti-pinch)
 * 3. Détection touchstart multi-doigts (>1 touch) + preventDefault
 * 4. Re-check au visibilitychange (Kevin revient sur app stuck zoom)
 */

import { logger } from '../../core/logger.js';

class AntiZoomIOS {
  private installed = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  install(): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;

    /* 1. Bloque les gesture events iOS Safari (pinch-zoom) */
    const blockGesture = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('gesturestart', blockGesture, { passive: false });
    document.addEventListener('gesturechange', blockGesture, { passive: false });
    document.addEventListener('gestureend', blockGesture, { passive: false });

    /* 2. Bloque touchstart multi-doigts (pinch-zoom backup) */
    document.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });

    /* 3. Détection double-tap rapproché (anti double-tap-zoom) */
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd < 350) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });

    /* 4. Reset zoom programmatique si détecté */
    this.checkAndResetZoom();
    /* Check périodique (1s) + visibilitychange */
    this.checkInterval = setInterval(() => this.checkAndResetZoom(), 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkAndResetZoom();
      }
    });
    window.addEventListener('focus', () => this.checkAndResetZoom());

    logger.info('anti-zoom-ios', 'Triple protection installée (gesture + multi-touch + reset)');
  }

  /** Détecte zoom actif via visualViewport.scale et reset. */
  private checkAndResetZoom(): void {
    if (typeof window === 'undefined') return;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const vv = (window as any).visualViewport;
    if (!vv) return;
    if (vv.scale && vv.scale > 1.01) {
      logger.warn('anti-zoom-ios', `Zoom détecté scale=${vv.scale} → tentative reset`);
      /* Tentative 1 : modifier viewport meta dynamiquement (force re-eval) */
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) {
        const original = meta.getAttribute('content') ?? '';
        meta.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');
        /* Force re-render via brief change */
        setTimeout(() => meta.setAttribute('content', original), 50);
      }
      /* Tentative 2 : scroll reset (parfois ça force iOS à re-evaluate viewport) */
      window.scrollTo(0, 0);
    }
  }

  /** Cleanup pour tests. */
  uninstall(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = null;
    this.installed = false;
  }
}

export const antiZoomIOS = new AntiZoomIOS();
