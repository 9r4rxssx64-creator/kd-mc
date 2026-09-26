/**
 * APEX v13 — Haptic feedback helper (iOS Safari + Android Chrome).
 *
 * Wrap navigator.vibrate avec patterns Apple-inspired.
 * Respect prefers-reduced-motion (no haptic si user opt-out).
 *
 * Usage : haptic.tap(), haptic.success(), haptic.error(), haptic.warning(), haptic.medium()
 */

type HapticPattern = 'tap' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

class Haptic {
  private enabled = true;

  constructor() {
    /* Auto-detect prefers-reduced-motion */
    if (typeof window !== 'undefined' && window.matchMedia) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (reducedMotion.matches) this.enabled = false;
      reducedMotion.addEventListener('change', (e) => {
        this.enabled = !e.matches;
      });
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  trigger(pattern: HapticPattern): void {
    if (!this.enabled) return;
    if (!this.isAvailable()) return;
    const ms = this.getDuration(pattern);
    try {
      navigator.vibrate(ms);
    } catch {
      /* Permission denied or browser block — fail silently */
    }
  }

  /* Shortcuts pour les patterns courants */
  tap(): void {
    this.trigger('tap');
  }

  selection(): void {
    this.trigger('selection');
  }

  medium(): void {
    this.trigger('medium');
  }

  heavy(): void {
    this.trigger('heavy');
  }

  success(): void {
    this.trigger('success');
  }

  warning(): void {
    this.trigger('warning');
  }

  error(): void {
    this.trigger('error');
  }

  private getDuration(pattern: HapticPattern): number | number[] {
    switch (pattern) {
      case 'tap':
        return 10;
      case 'selection':
        return 5;
      case 'medium':
        return 25;
      case 'heavy':
        return 50;
      case 'success':
        return [10, 50, 20];
      case 'warning':
        return [30, 80, 30];
      case 'error':
        return [50, 100, 50, 100, 50];
      default:
        return 10;
    }
  }
}

export const haptic = new Haptic();
