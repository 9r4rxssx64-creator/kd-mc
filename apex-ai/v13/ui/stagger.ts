/**
 * APEX v13.3.29 — Stagger animations cascade (UX 17→20).
 *
 * Demande Kevin (CLAUDE.md règle "Innovation animations") :
 * "Stagger animations : quand liste apparaît, items animent en cascade
 *  (50ms delay each)"
 *
 * Implementation : injecte CSS variable `--ax-stagger-i` sur chaque enfant
 * pour que CSS calcule `animation-delay: calc(var(--ax-stagger-i) * 50ms)`.
 * Respect prefers-reduced-motion (no-op si user opt-out).
 */

interface StaggerOptions {
  /** Sélecteur des enfants (default: '> *') */
  selector?: string;
  /** Delay entre items en ms (default: 50) */
  step?: number;
  /** Animation CSS class à appliquer (default: 'ax-stagger-item') */
  animationClass?: string;
  /** Max delay (cap pour grosses listes) en ms (default: 800) */
  maxDelay?: number;
}

class Stagger {
  /**
   * Vérifie si user a opt-out animations.
   */
  private isReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Applique le stagger sur les enfants directs d'un container.
   * @returns nombre d'éléments staggered
   */
  apply(container: HTMLElement, opts: StaggerOptions = {}): number {
    if (this.isReducedMotion()) return 0;
    if (!container) return 0;

    const step = opts.step ?? 50;
    const animClass = opts.animationClass ?? 'ax-stagger-item';
    const maxDelay = opts.maxDelay ?? 800;

    /* Si selector custom fourni, utiliser querySelectorAll. Sinon enfants directs. */
    let children: HTMLElement[];
    if (opts.selector && opts.selector !== ':scope > *') {
      children = Array.from(container.querySelectorAll<HTMLElement>(opts.selector));
    } else {
      children = Array.from(container.children) as HTMLElement[];
    }

    children.forEach((child, idx) => {
      const delay = Math.min(idx * step, maxDelay);
      child.style.setProperty('--ax-stagger-i', String(idx));
      child.style.animationDelay = `${delay}ms`;
      child.classList.add(animClass);
    });
    return children.length;
  }

  /**
   * Applique stagger via IntersectionObserver (lazy : seulement quand visible).
   * Idéal pour grosses listes (perf).
   */
  applyLazy(container: HTMLElement, opts: StaggerOptions = {}): () => void {
    if (this.isReducedMotion() || typeof IntersectionObserver === 'undefined') {
      this.apply(container, opts);
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.apply(entry.target as HTMLElement, opts);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }

  /**
   * Remove stagger (cleanup).
   */
  clear(container: HTMLElement, opts: StaggerOptions = {}): void {
    if (!container) return;
    const animClass = opts.animationClass ?? 'ax-stagger-item';
    let children: HTMLElement[];
    if (opts.selector && opts.selector !== ':scope > *') {
      children = Array.from(container.querySelectorAll<HTMLElement>(opts.selector));
    } else {
      children = Array.from(container.children) as HTMLElement[];
    }
    children.forEach((child) => {
      child.style.removeProperty('--ax-stagger-i');
      child.style.removeProperty('animation-delay');
      child.classList.remove(animClass);
    });
  }
}

export const stagger = new Stagger();
