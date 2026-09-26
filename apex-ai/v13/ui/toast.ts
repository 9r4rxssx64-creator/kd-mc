/**
 * APEX v13 — Toast notifications (Apple-inspired sliding from top).
 *
 * Usage:
 *   import { toast } from '@ui/toast.js';
 *   toast.show('Sauvegardé', 'success');
 *   toast.error('Réseau coupé');
 *
 * Stack vertical, auto-dismiss 3s (ou cliquable pour fermer immédiat).
 * Touch-friendly 44px min, swipe-to-dismiss.
 */

import { haptic } from './haptic.js';

type ToastLevel = 'info' | 'success' | 'warn' | 'error';

interface ToastOptions {
  duration?: number;
  haptic?: boolean;
  premium?: boolean;
}

/**
 * Queue stack max — au-delà, dismiss le plus ancien (FIFO).
 * Évite spam visuel si app pousse 50 toasts d'un coup.
 */
const MAX_TOAST_STACK = 5;

class Toast {
  private container: HTMLElement | null = null;
  private idCounter = 0;

  private getContainer(): HTMLElement {
    if (this.container && document.body.contains(this.container)) return this.container;
    const el = document.createElement('div');
    el.className = 'ax-toast-container';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    /* P0 Kevin v13.0.78 — inline fallback si CSS bundle stale (cache iPhone)
     * v13.4.329 (Kevin "le bandeau orange couvre la barre du haut + le lien KDMC") :
     * top descendu sous la status bar ET sous la pastille ← KDMC (qui occupe
     * env(safe-area-inset-top)+8 → +~45px). +52px garantit que les toasts/bannières
     * ne chevauchent plus ni l'heure/batterie iOS ni le lien retour portail. */
    el.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 52px);left:50%;transform:translateX(-50%);z-index:99998;display:flex;flex-direction:column;gap:8px;padding:8px;max-width:96vw;pointer-events:none';
    document.body.appendChild(el);
    this.container = el;
    return el;
  }

  show(message: string, level: ToastLevel = 'info', opts: ToastOptions = {}): string {
    const id = `toast-${++this.idCounter}-${Date.now()}`;
    const duration = opts.duration ?? 3000;
    const useHaptic = opts.haptic ?? true;
    const premium = opts.premium ?? false;

    const el = document.createElement('div');
    /* Premium variant : colored borders + glass blur (Kevin v13 redesign) */
    const premiumClass = premium ? ' ax-toast-premium' : '';
    el.className = `ax-toast ax-toast-${level}${premiumClass}`;
    el.id = id;
    el.setAttribute('role', 'alert');
    /* Inline fallback styles — garantit visible même si CSS bundle stale */
    const bgColors: Record<ToastLevel, string> = {
      success: 'rgba(34,204,119,0.95)',
      error: 'rgba(255,91,91,0.95)',
      warn: 'rgba(255,170,0,0.95)',
      info: 'rgba(20,20,35,0.95)',
    };
    el.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 16px;background:${bgColors[level] ?? 'rgba(20,20,35,0.95)'};color:#fff;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,0.3);max-width:100%;font-size:14px;line-height:1.4;font-family:system-ui,-apple-system,sans-serif;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:axToastSlide 250ms ease-out`;

    const icon = this.getIcon(level);
    el.innerHTML = `
      <span class="ax-toast-icon">${icon}</span>
      <span class="ax-toast-text"></span>
      <button class="ax-toast-close" aria-label="Fermer" type="button">×</button>
    `;
    /* Set text safely (no innerHTML for user message) */
    const textEl = el.querySelector<HTMLElement>('.ax-toast-text');
    if (textEl) textEl.textContent = message;

    /* Bouton fermer dédié (P0 audit UX premium — visible touch target 44px) */
    const closeBtn = el.querySelector<HTMLButtonElement>('.ax-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismiss(id);
      });
    }

    /* Click anywhere autre que close → dismiss */
    el.addEventListener('click', (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('.ax-toast-close')) return;
      this.dismiss(id);
    });

    /* Queue stack management : si trop de toasts ACTIFS (non leaving), retire le plus ancien.
     * Synchrone : on enlève immédiatement du DOM pour respecter MAX_TOAST_STACK strict. */
    const container = this.getContainer();
    const active = container.querySelectorAll<HTMLElement>('.ax-toast:not(.ax-toast-leaving)');
    if (active.length >= MAX_TOAST_STACK) {
      const oldest = active[0];
      if (oldest) oldest.remove();
    }
    container.appendChild(el);

    /* Trigger entrance animation */
    requestAnimationFrame(() => {
      el.classList.add('ax-toast-visible');
    });

    /* Haptic feedback */
    if (useHaptic) {
      if (level === 'success') haptic.success();
      else if (level === 'warn') haptic.warning();
      else if (level === 'error') haptic.error();
      else haptic.tap();
    }

    /* Auto-dismiss */
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  dismiss(id: string): void {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('ax-toast-visible');
    el.classList.add('ax-toast-leaving');
    setTimeout(() => {
      try {
        el.remove();
      } catch {
        /* DOM torn down (test environment) */
      }
    }, 300);
  }

  dismissAll(): void {
    if (typeof document === 'undefined') return;
    const c = this.container;
    if (!c) return;
    c.querySelectorAll<HTMLElement>('.ax-toast').forEach((el) => {
      this.dismiss(el.id);
    });
  }

  /* Shortcuts */
  info(message: string, opts?: ToastOptions): string {
    return this.show(message, 'info', opts);
  }

  success(message: string, opts?: ToastOptions): string {
    return this.show(message, 'success', opts);
  }

  warn(message: string, opts?: ToastOptions): string {
    return this.show(message, 'warn', opts);
  }

  error(message: string, opts?: ToastOptions): string {
    return this.show(message, 'error', opts);
  }

  /**
   * Premium variant (glassmorphism + colored border-left).
   * Idéal pour notifications importantes/branded.
   */
  premium(message: string, level: ToastLevel = 'info', opts: ToastOptions = {}): string {
    return this.show(message, level, { ...opts, premium: true });
  }

  /**
   * Count of toasts currently displayed (queue stack).
   * Vérifie via DOM réel (au cas où container détaché par test reset).
   */
  count(): number {
    if (typeof document === 'undefined') return 0;
    return document.querySelectorAll('.ax-toast-container .ax-toast').length;
  }

  /**
   * Stack max constant (Kevin v13 premium queue management).
   */
  getMaxStack(): number {
    return MAX_TOAST_STACK;
  }

  private getIcon(level: ToastLevel): string {
    switch (level) {
      case 'success':
        return '✓';
      case 'warn':
        return '!';
      case 'error':
        return '✕';
      case 'info':
      default:
        return 'i';
    }
  }
}

export const toast = new Toast();
