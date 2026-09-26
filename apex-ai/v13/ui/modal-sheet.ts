/**
 * APEX v13 — Modal Apple half-sheet (iOS-inspired bottom sheet).
 *
 * Slide-up depuis le bas, drag-to-dismiss, backdrop tap-to-close.
 * Touch-friendly mobile-first iPhone PWA.
 *
 * Usage :
 *   const sheet = modalSheet.open({
 *     title: 'Confirmer',
 *     content: '<p>Es-tu sûr ?</p>',
 *     actions: [
 *       { label: 'Annuler', variant: 'ghost', onClick: () => sheet.close() },
 *       { label: 'OK', variant: 'primary', onClick: () => doSomething() },
 *     ],
 *   });
 */

import { haptic } from './haptic.js';

interface SheetAction {
  label: string;
  variant?: 'primary' | 'ghost' | 'danger';
  onClick: () => void;
}

interface SheetOptions {
  title?: string;
  content: string;
  actions?: SheetAction[];
  dismissable?: boolean;
  /** Premium drag-to-dismiss (Kevin v13 UX premium). Default true. */
  draggable?: boolean;
}

interface SheetHandle {
  el: HTMLElement;
  close: () => void;
}

class ModalSheet {
  private idCounter = 0;
  private active: SheetHandle | null = null;

  open(opts: SheetOptions): SheetHandle {
    /* Close existing si actif (1 sheet à la fois) */
    if (this.active) this.active.close();

    const id = `ax-sheet-${++this.idCounter}-${Date.now()}`;
    const overlay = document.createElement('div');
    overlay.className = 'ax-sheet-overlay';
    overlay.id = id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    if (opts.title) overlay.setAttribute('aria-label', opts.title);
    /* P0 fix Kevin v13.0.78 — inline styles fallback si CSS bundle pas chargé (cache iPhone old) */
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,8,15,0.85);z-index:99999;display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity 200ms ease';

    const sheet = document.createElement('div');
    sheet.className = 'ax-sheet';
    /* Inline styles fallback — garantit affichage même si CSS bundle stale */
    sheet.style.cssText = 'width:min(640px,100%);max-height:90vh;background:#14141f;color:#fff;border-radius:18px 18px 0 0;border-top:1px solid rgba(201,162,39,0.3);box-shadow:0 -10px 40px rgba(0,0,0,0.6);padding:14px 22px calc(env(safe-area-inset-bottom,0px) + 22px);transform:translateY(100%);transition:transform 250ms cubic-bezier(0.34,1.56,0.64,1);display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,sans-serif';
    const titleHTML = opts.title
      ? `<div class="ax-sheet-header">
          <h2 class="ax-sheet-title">${this.escapeHtml(opts.title)}</h2>
          ${opts.dismissable !== false ? '<button class="ax-sheet-close" aria-label="Fermer">×</button>' : ''}
        </div>`
      : '';
    const actionsHTML =
      opts.actions && opts.actions.length > 0
        ? `<div class="ax-sheet-actions">${opts.actions
            .map(
              (a, i) => `
              <button class="ax-btn ax-btn-${a.variant ?? 'ghost'}" data-action-idx="${i}">
                ${this.escapeHtml(a.label)}
              </button>`,
            )
            .join('')}</div>`
        : '';

    sheet.innerHTML = `
      <div class="ax-sheet-handle"></div>
      ${titleHTML}
      <div class="ax-sheet-body">${opts.content}</div>
      ${actionsHTML}
    `;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    /* Trigger entrance */
    requestAnimationFrame(() => {
      overlay.classList.add('ax-sheet-visible');
      sheet.classList.add('ax-sheet-up');
      /* Inline fallback : force opacity + transform (au cas où classes CSS pas chargées) */
      overlay.style.opacity = '1';
      sheet.style.transform = 'translateY(0)';
      /* P0 audit UX iOS : auto-focus input/textarea + scrollIntoView pour keyboard ne masque pas */
      const firstInput = sheet.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select',
      );
      if (firstInput) {
        firstInput.focus();
        /* iOS Safari : scroll input into view quand keyboard apparaît */
        setTimeout(() => {
          firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
      }
    });

    haptic.medium();

    /* Close handlers */
    const close = (): void => {
      overlay.classList.remove('ax-sheet-visible');
      sheet.classList.remove('ax-sheet-up');
      sheet.classList.add('ax-sheet-down');
      setTimeout(() => {
        overlay.remove();
        if (this.active && this.active.el === overlay) this.active = null;
      }, 300);
    };

    if (opts.dismissable !== false) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          haptic.tap();
          close();
        }
      });
      sheet.querySelector('.ax-sheet-close')?.addEventListener('click', () => {
        haptic.tap();
        close();
      });
      /* Escape key */
      const handleKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          close();
          document.removeEventListener('keydown', handleKey);
        }
      };
      document.addEventListener('keydown', handleKey);
    }

    /* Action handlers */
    if (opts.actions) {
      sheet.querySelectorAll<HTMLButtonElement>('[data-action-idx]').forEach((btn) => {
        const idx = Number(btn.dataset['actionIdx']);
        const action = opts.actions?.[idx];
        if (!action) return;
        btn.addEventListener('click', () => {
          haptic.tap();
          action.onClick();
        });
      });
    }

    /* Drag-to-dismiss premium (Kevin v13 UX premium iOS-style)
     * Touch sur drag-handle → suit le doigt → si > 100px : dismiss
     * Sinon → snap back to top */
    if (opts.draggable !== false && opts.dismissable !== false) {
      this.attachDragToDismiss(sheet, close);
    }

    const handle: SheetHandle = { el: overlay, close };
    this.active = handle;
    return handle;
  }

  /**
   * iOS-style drag-to-dismiss sur drag-handle.
   * Pointer events (cross-platform touch + mouse).
   */
  private attachDragToDismiss(sheet: HTMLElement, close: () => void): void {
    const dragHandle = sheet.querySelector<HTMLElement>('.ax-sheet-handle');
    if (!dragHandle) return;
    /* Étendre la zone de drag pour mobile (44px min Apple HIG) */
    dragHandle.style.padding = '12px';
    dragHandle.style.cursor = 'grab';
    dragHandle.style.touchAction = 'none';

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const onPointerDown = (e: PointerEvent): void => {
      isDragging = true;
      startY = e.clientY;
      currentY = e.clientY;
      dragHandle.style.cursor = 'grabbing';
      dragHandle.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (!isDragging) return;
      currentY = e.clientY;
      const delta = currentY - startY;
      /* Empêcher glissement vers le haut */
      const translateY = Math.max(0, delta);
      sheet.style.transform = `translateY(${translateY}px)`;
      sheet.style.transition = 'none';
    };

    const onPointerUp = (e: PointerEvent): void => {
      if (!isDragging) return;
      isDragging = false;
      dragHandle.style.cursor = 'grab';
      dragHandle.releasePointerCapture?.(e.pointerId);
      sheet.style.transition = '';
      const delta = currentY - startY;
      if (delta > 100) {
        /* Threshold dépassé → dismiss */
        haptic.tap();
        close();
      } else {
        /* Snap back */
        sheet.style.transform = '';
      }
    };

    dragHandle.addEventListener('pointerdown', onPointerDown);
    dragHandle.addEventListener('pointermove', onPointerMove);
    dragHandle.addEventListener('pointerup', onPointerUp);
    dragHandle.addEventListener('pointercancel', onPointerUp);
  }

  closeAll(): void {
    if (this.active) {
      this.active.close();
      this.active = null;
    }
    document.querySelectorAll<HTMLElement>('.ax-sheet-overlay').forEach((el) => el.remove());
  }

  private escapeHtml(s: string): string {
    return s.replace(
      /[&<>"']/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
    );
  }
}

export const modalSheet = new ModalSheet();
