/**
 * APEX v13.3.29 — Mode PRO/FUN toggle global (UX 17→20).
 *
 * Demande Kevin (CLAUDE.md règle "DUAL PRO + FUN PARTOUT") :
 * "Toggle global Mode Sérieux / Mode Fun en topbar — affecte toute UI"
 * - PRO : fonts serif, palette gold #c9a227, animations sobres
 * - FUN : emojis partout, palette néon, micro-animations rebondissantes
 *
 * Test mental obligatoire : "Cette feature a-t-elle ses 2 styles (PRO + FUN) ?"
 */

import { logger } from '../core/logger.js';

import { haptic } from './haptic.js';

export type DualMode = 'pro' | 'fun';

type ModeListener = (mode: DualMode) => void;

class ProFunMode {
  private current: DualMode = 'pro';
  private listeners: Set<ModeListener> = new Set();
  private storageKey = 'ax_mode_dual';

  /** Mode courant */
  getCurrent(): DualMode {
    return this.current;
  }

  isPro(): boolean {
    return this.current === 'pro';
  }

  isFun(): boolean {
    return this.current === 'fun';
  }

  /** Initialise au boot depuis localStorage */
  init(): DualMode {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
      if (raw === 'pro' || raw === 'fun') {
        this.apply(raw, { persist: false });
        return raw;
      }
    } catch {
      /* ignore */
    }
    /* Default : pro (sérieux par défaut, l'utilisateur active fun explicitement) */
    this.apply('pro', { persist: false });
    return 'pro';
  }

  /**
   * Applique le mode (toggle CSS class sur <html>, fire listeners).
   */
  apply(mode: DualMode, opts: { persist?: boolean; haptic?: boolean } = {}): void {
    const previous = this.current;
    this.current = mode;

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.setAttribute('data-mode', mode);
      root.classList.toggle('ax-mode-pro', mode === 'pro');
      root.classList.toggle('ax-mode-fun', mode === 'fun');
    }

    if (opts.persist !== false) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey, mode);
      } catch {
        /* ignore quota */
      }
    }

    if (opts.haptic !== false && previous !== mode) {
      haptic.selection();
    }

    /* Notify */
    this.listeners.forEach((fn) => {
      try {
        fn(mode);
      } catch (err) {
        logger.warn('pro-fun-mode', 'listener threw', { err });
      }
    });
  }

  /** Toggle PRO ↔ FUN */
  toggle(): DualMode {
    this.apply(this.current === 'pro' ? 'fun' : 'pro');
    return this.current;
  }

  /** Subscribe à chaque changement */
  subscribe(fn: ModeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Helper : retourne le label adapté au mode courant.
   * Permet à l'UI d'avoir 2 styles de label sans dupliquer le code.
   *
   * @example
   *   proFunMode.pickLabel('Profil utilisateur', 'Ton profil 😎')
   */
  pickLabel(proLabel: string, funLabel: string): string {
    return this.current === 'pro' ? proLabel : funLabel;
  }

  /**
   * Helper : retourne l'emoji uniquement en mode FUN.
   */
  emoji(funEmoji: string): string {
    return this.current === 'fun' ? funEmoji : '';
  }

  /**
   * Décore un texte avec emoji en mode fun.
   */
  decorate(text: string, funEmoji: string, position: 'before' | 'after' = 'before'): string {
    if (this.current !== 'fun') return text;
    return position === 'before' ? `${funEmoji} ${text}` : `${text} ${funEmoji}`;
  }
}

export const proFunMode = new ProFunMode();
