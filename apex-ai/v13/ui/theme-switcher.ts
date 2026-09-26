/**
 * APEX v13.3.29 — Theme Switcher (UX 17→20).
 *
 * Demande Kevin (CLAUDE.md règle "Dark/Light + 6 thèmes custom") :
 * "Themes : Casino Gold (default), Ocean Blue, Sunset Orange, Emerald,
 *  Rainbow Pride, Halloween (saisonnier auto-detect)"
 *
 * Architecture :
 * - 6 thèmes via CSS variables (data-theme="X" sur <html>)
 * - Persist dans localStorage `ax_theme`
 * - Auto-detect Halloween (15-31 oct) + Christmas (1-31 déc) + Valentine (10-15 fév)
 * - Subscriber pattern pour réactivité (chat refresh, etc.)
 */

import { logger } from '../core/logger.js';

export type ThemeId =
  | 'casino-gold'
  | 'ocean-blue'
  | 'sunset-orange'
  | 'emerald'
  | 'pride'
  | 'halloween'
  | 'christmas'
  | 'valentine';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  emoji: string;
  description: string;
  seasonal?: { from: string /* MM-DD */; to: string /* MM-DD */ };
  palette: {
    bg: string;
    fg: string;
    accent: string;
    accentSoft: string;
    border: string;
  };
}

const THEMES: readonly ThemeMeta[] = [
  {
    id: 'casino-gold',
    label: 'Casino Gold',
    emoji: '👑',
    description: 'Or sobre Monaco — défaut',
    palette: {
      bg: '#0d0d0d',
      fg: '#f4f4f4',
      accent: '#c9a227',
      accentSoft: '#e8b830',
      border: '#2a2a2a',
    },
  },
  {
    id: 'ocean-blue',
    label: 'Ocean Blue',
    emoji: '🌊',
    description: 'Bleu profond apaisant',
    palette: {
      bg: '#0a1929',
      fg: '#e3f2fd',
      accent: '#29b6f6',
      accentSoft: '#4fc3f7',
      border: '#1e3a5f',
    },
  },
  {
    id: 'sunset-orange',
    label: 'Sunset',
    emoji: '🌅',
    description: 'Coucher soleil chaleureux',
    palette: {
      bg: '#1a0e0a',
      fg: '#fff3e0',
      accent: '#ff7043',
      accentSoft: '#ffab91',
      border: '#3e2723',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    emoji: '💚',
    description: 'Vert émeraude fortune',
    palette: {
      bg: '#081c14',
      fg: '#e8f5e9',
      accent: '#10b981',
      accentSoft: '#34d399',
      border: '#1b5e20',
    },
  },
  {
    id: 'pride',
    label: 'Rainbow Pride',
    emoji: '🏳️‍🌈',
    description: 'Arc-en-ciel dégradé',
    palette: {
      bg: '#100a14',
      fg: '#ffffff',
      accent: '#e91e63',
      accentSoft: '#ff5e8a',
      border: '#311b92',
    },
  },
  {
    id: 'halloween',
    label: 'Halloween',
    emoji: '🎃',
    description: 'Citrouille spooky (auto 15-31 oct)',
    seasonal: { from: '10-15', to: '10-31' },
    palette: {
      bg: '#0a0710',
      fg: '#ff9800',
      accent: '#ff6f00',
      accentSoft: '#bb86fc',
      border: '#4a148c',
    },
  },
  {
    id: 'christmas',
    label: 'Noël',
    emoji: '🎄',
    description: 'Rouge & vert festif (auto déc)',
    seasonal: { from: '12-01', to: '12-31' },
    palette: {
      bg: '#0a1a0a',
      fg: '#fff5f5',
      accent: '#d32f2f',
      accentSoft: '#ef5350',
      border: '#1b5e20',
    },
  },
  {
    id: 'valentine',
    label: 'Saint-Valentin',
    emoji: '💝',
    description: 'Rose tendre (auto 10-15 fév)',
    seasonal: { from: '02-10', to: '02-15' },
    palette: {
      bg: '#1a0a14',
      fg: '#ffe4ec',
      accent: '#ec407a',
      accentSoft: '#f48fb1',
      border: '#880e4f',
    },
  },
];

type ThemeListener = (theme: ThemeMeta) => void;

class ThemeSwitcher {
  private current: ThemeId = 'casino-gold';
  private listeners: Set<ThemeListener> = new Set();
  private storageKey = 'ax_theme';

  /** Liste tous les thèmes disponibles */
  list(): readonly ThemeMeta[] {
    return THEMES;
  }

  /** Trouve un thème par id */
  byId(id: ThemeId): ThemeMeta | null {
    return THEMES.find((t) => t.id === id) ?? null;
  }

  /** Thème courant (dernier appliqué) */
  getCurrent(): ThemeMeta {
    return this.byId(this.current) ?? (THEMES[0] as ThemeMeta);
  }

  /**
   * Détecte si une période saisonnière est active aujourd'hui.
   * Format MM-DD, comparaison sans année.
   */
  detectSeasonal(now: Date = new Date()): ThemeMeta | null {
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const today = `${mm}-${dd}`;
    for (const t of THEMES) {
      if (!t.seasonal) continue;
      if (today >= t.seasonal.from && today <= t.seasonal.to) {
        return t;
      }
    }
    return null;
  }

  /**
   * Initialise le thème au boot.
   * Priorité : user override (localStorage) > saisonnier auto > default.
   */
  init(): ThemeMeta {
    let saved: ThemeId | null = null;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
      if (raw && this.byId(raw as ThemeId)) saved = raw as ThemeId;
    } catch {
      /* ignore */
    }

    let theme: ThemeMeta;
    if (saved) {
      theme = this.byId(saved) ?? (THEMES[0] as ThemeMeta);
    } else {
      const seasonal = this.detectSeasonal();
      theme = seasonal ?? (THEMES[0] as ThemeMeta);
    }
    this.apply(theme.id, { persist: false });
    return theme;
  }

  /**
   * Applique un thème (write CSS vars + persist).
   */
  apply(id: ThemeId, opts: { persist?: boolean } = {}): boolean {
    const theme = this.byId(id);
    if (!theme) {
      logger.warn('theme-switcher', `Theme inconnu: ${id}`);
      return false;
    }
    this.current = id;

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.setAttribute('data-theme', id);
      root.style.setProperty('--ax-theme-bg', theme.palette.bg);
      root.style.setProperty('--ax-theme-fg', theme.palette.fg);
      root.style.setProperty('--ax-theme-accent', theme.palette.accent);
      root.style.setProperty('--ax-theme-accent-soft', theme.palette.accentSoft);
      root.style.setProperty('--ax-theme-border', theme.palette.border);
    }

    if (opts.persist !== false) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey, id);
      } catch {
        /* QuotaExceeded — ignore */
      }
    }

    /* Notify subscribers */
    this.listeners.forEach((fn) => {
      try {
        fn(theme);
      } catch (err) {
        logger.warn('theme-switcher', 'listener threw', { err });
      }
    });
    return true;
  }

  /**
   * Cycle automatique vers le thème suivant (utilisé par bouton 🎲).
   */
  cycle(): ThemeMeta {
    const idx = THEMES.findIndex((t) => t.id === this.current);
    const next = THEMES[(idx + 1) % THEMES.length] as ThemeMeta;
    this.apply(next.id);
    return next;
  }

  /**
   * Tirage aléatoire (mode "Surprise me").
   */
  random(): ThemeMeta {
    const others = THEMES.filter((t) => t.id !== this.current);
    const pick = others[Math.floor(Math.random() * others.length)] as ThemeMeta;
    this.apply(pick.id);
    return pick;
  }

  /** Subscribe : appelé à chaque changement de thème */
  subscribe(fn: ThemeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Reset au défaut Casino Gold + clear persist */
  reset(): void {
    this.apply('casino-gold', { persist: false });
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(this.storageKey);
    } catch {
      /* ignore */
    }
  }
}

export const themeSwitcher = new ThemeSwitcher();
