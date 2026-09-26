/**
 * APEX v13.3.29 — Easter Eggs (UX 17→20).
 *
 * Demande Kevin (CLAUDE.md règle "Mode Surprise me + Easter eggs") :
 * - Konami code → mode rétro 8-bit
 * - Triple-tap logo → confettis dorés
 * - Bouton 🎲 random
 *
 * Architecture :
 * - Détection séquences clavier (Konami : ↑↑↓↓←→←→BA)
 * - Détection triple-tap multitouch
 * - Confettis CSS pure (pas de dep, GPU-accelerated)
 * - Mode 8-bit : applique CSS class avec font pixel + filter sépia
 */

import { logger } from '../core/logger.js';

import { haptic } from './haptic.js';

const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

type EasterEggListener = (egg: { id: string; name: string; emoji: string }) => void;

class EasterEggs {
  private konamiBuffer: string[] = [];
  private retroModeActive = false;
  private listeners: Set<EasterEggListener> = new Set();
  private installed = false;

  /**
   * Active la détection clavier Konami sur window.
   * Idempotent : safe à appeler plusieurs fois.
   */
  install(): void {
    if (this.installed) return;
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    this.installed = true;
  }

  uninstall(): void {
    /* En pratique, pas besoin (window listener live tant que page) */
    this.installed = false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.konamiBuffer.push(e.code);
    if (this.konamiBuffer.length > KONAMI_SEQUENCE.length) {
      this.konamiBuffer.shift();
    }
    if (this.konamiBuffer.length === KONAMI_SEQUENCE.length) {
      const matches = this.konamiBuffer.every((k, i) => k === KONAMI_SEQUENCE[i]);
      if (matches) {
        this.activateKonami();
        this.konamiBuffer = [];
      }
    }
  }

  /**
   * Active le mode rétro 8-bit (toggle).
   */
  activateKonami(): void {
    this.retroModeActive = !this.retroModeActive;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('ax-retro-8bit', this.retroModeActive);
    }
    haptic.success();
    this.fire({
      id: 'konami',
      name: this.retroModeActive ? 'Mode Rétro 8-bit ACTIVÉ' : 'Mode Rétro 8-bit désactivé',
      emoji: '🕹️',
    });
    logger.info('easter-egg', `konami:${this.retroModeActive}`);
  }

  isRetroActive(): boolean {
    return this.retroModeActive;
  }

  /**
   * Lance une pluie de confettis dorés (triple-tap logo).
   * @param count - Nombre de confettis (default 60)
   * @param colors - Palette CSS (default doré)
   */
  spawnConfetti(count = 60, colors: readonly string[] = ['#c9a227', '#e8b830', '#f4d160', '#fff8dc']): void {
    if (typeof document === 'undefined') return;
    const root = document.body;
    if (!root) return;

    const container = document.createElement('div');
    container.className = 'ax-confetti-container';
    container.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'ax-confetti-piece';
      const color = colors[Math.floor(Math.random() * colors.length)] ?? '#c9a227';
      const left = Math.random() * 100;
      const delay = Math.random() * 0.5;
      const duration = 2 + Math.random() * 1.5;
      const rotate = Math.random() * 360;
      piece.style.cssText = `
        background:${color};
        left:${left}%;
        animation-delay:${delay}s;
        animation-duration:${duration}s;
        transform:rotate(${rotate}deg);
      `;
      container.appendChild(piece);
    }
    root.appendChild(container);
    haptic.success();
    this.fire({ id: 'confetti', name: 'Confettis dorés !', emoji: '🎉' });

    /* Auto-cleanup après 4s */
    setTimeout(() => {
      try {
        container.remove();
      } catch {
        /* ignore */
      }
    }, 4000);
  }

  /**
   * Wire un élément pour triple-tap → confettis.
   * @returns cleanup function
   */
  wireTripleTap(el: HTMLElement, onTriple: () => void = () => this.spawnConfetti()): () => void {
    let count = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = (): void => {
      count++;
      if (timer) clearTimeout(timer);
      if (count >= 3) {
        count = 0;
        onTriple();
        return;
      }
      timer = setTimeout(() => {
        count = 0;
      }, 600);
    };
    el.addEventListener('click', handler);
    el.addEventListener('touchend', handler);
    return () => {
      el.removeEventListener('click', handler);
      el.removeEventListener('touchend', handler);
      if (timer) clearTimeout(timer);
    };
  }

  subscribe(fn: EasterEggListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private fire(egg: { id: string; name: string; emoji: string }): void {
    this.listeners.forEach((fn) => {
      try {
        fn(egg);
      } catch (err) {
        logger.warn('easter-egg', 'listener threw', { err });
      }
    });
  }

  /** Reset state (test util) */
  reset(): void {
    this.konamiBuffer = [];
    this.retroModeActive = false;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('ax-retro-8bit');
    }
  }
}

export const easterEggs = new EasterEggs();
