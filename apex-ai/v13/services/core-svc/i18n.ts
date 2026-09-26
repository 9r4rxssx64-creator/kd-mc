/**
 * APEX v13 — Internationalization (i18n) Service
 *
 * Mission Kevin v13.1 : i18n EN/IT/ES/DE pour commercialisation EU.
 *
 * Features :
 * - 5 langues : fr, en, it, es, de
 * - Lazy-load JSON files (économise bundle initial)
 * - ICU MessageFormat simple (vars {name} + plurals basiques)
 * - Persistance préférence user (localStorage `apex_v13_locale`)
 * - Fallback automatique fr si clé manquante
 * - Détection langue navigator au premier boot
 *
 * Usage :
 *   import { i18n } from '@services/core-svc/i18n.js';
 *   await i18n.init();
 *   const text = i18n.t('chat.send_button'); // "Envoyer"
 *   const greeting = i18n.t('auth.greeting', { name: 'Kevin' }); // "Bonjour Kevin, …"
 */

import { logger } from '../../core/logger.js';

export type Locale = 'fr' | 'en' | 'it' | 'es' | 'de' | 'mc';

interface LocaleMeta {
  name: string;
  code: Locale;
  flag: string;
  version: string;
}

interface LocaleData {
  _meta: LocaleMeta;
  [key: string]: string | LocaleMeta;
}

const STORAGE_KEY = 'apex_v13_locale';
const DEFAULT_LOCALE: Locale = 'fr';
const SUPPORTED_LOCALES: readonly Locale[] = ['fr', 'en', 'it', 'es', 'de', 'mc'] as const;

/**
 * Métadonnées des langues disponibles. Permet d'éviter de charger les fichiers
 * juste pour avoir le nom + drapeau dans le sélecteur de langue.
 */
const LOCALE_META: Record<Locale, { name: string; flag: string }> = {
  fr: { name: 'Français', flag: '🇫🇷' },
  en: { name: 'English', flag: '🇬🇧' },
  it: { name: 'Italiano', flag: '🇮🇹' },
  es: { name: 'Español', flag: '🇪🇸' },
  de: { name: 'Deutsch', flag: '🇩🇪' },
  mc: { name: 'Munegascu', flag: '🇲🇨' },
};

class I18n {
  private currentLocale: Locale = DEFAULT_LOCALE;
  private translations: Map<Locale, Record<string, string>> = new Map();
  private initialized = false;
  private fallbackTranslations: Record<string, string> = {};

  /**
   * Initialise i18n :
   * - Détecte langue depuis localStorage > navigator.language > default
   * - Charge la locale courante + le fallback (fr)
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    /* Déterminer langue à utiliser */
    const stored = this.readStoredLocale();
    if (stored) {
      this.currentLocale = stored;
    } else {
      this.currentLocale = this.detectFromNavigator() ?? DEFAULT_LOCALE;
    }

    /* Charger fallback (fr) toujours, sauf si déjà injecté (tests) */
    if (!this.translations.has(DEFAULT_LOCALE)) {
      await this.loadLocale(DEFAULT_LOCALE);
    }
    this.fallbackTranslations = this.translations.get(DEFAULT_LOCALE) ?? {};

    /* Charger locale courante si différent et pas déjà injectée */
    if (this.currentLocale !== DEFAULT_LOCALE && !this.translations.has(this.currentLocale)) {
      await this.loadLocale(this.currentLocale);
    }

    logger.info('i18n', `Initialized with locale ${this.currentLocale}`, {
      stored,
      detected: stored ?? this.currentLocale,
      loaded: Array.from(this.translations.keys()),
    });
  }

  /**
   * Récupère traduction par clé. Supporte interpolation simple `{var}`.
   * Fallback automatique : currentLocale → fr → clé brute.
   */
  t(key: string, vars?: Record<string, string | number>): string {
    const current = this.translations.get(this.currentLocale);
    let template = current?.[key] ?? this.fallbackTranslations[key] ?? key;

    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }

    return template;
  }

  /**
   * Change la langue active. Lazy-load si pas déjà chargée.
   * Persiste dans localStorage.
   */
  async setLocale(locale: Locale): Promise<void> {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      logger.warn('i18n', `Unsupported locale: ${locale}, falling back to ${DEFAULT_LOCALE}`);
      locale = DEFAULT_LOCALE;
    }
    if (!this.translations.has(locale)) {
      await this.loadLocale(locale);
    }
    this.currentLocale = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch (err: unknown) {
      logger.warn('i18n', 'Persist locale failed', { err });
    }
    logger.info('i18n', `Locale changed to ${locale}`);
  }

  /**
   * Retourne la locale actuelle.
   */
  getLocale(): Locale {
    return this.currentLocale;
  }

  /**
   * Liste des langues supportées avec métadonnées (pour sélecteur UI).
   */
  available(): Array<{ code: Locale; name: string; flag: string }> {
    return SUPPORTED_LOCALES.map((code) => {
      const meta = LOCALE_META[code];
      return { code, name: meta.name, flag: meta.flag };
    });
  }

  /**
   * Charge un fichier de traductions. Idempotent.
   * Tente import() (Vite bundling) puis fallback fetch.
   */
  async loadLocale(locale: Locale): Promise<void> {
    if (this.translations.has(locale)) {
      return;
    }
    if (!SUPPORTED_LOCALES.includes(locale)) {
      logger.warn('i18n', `Refused to load unsupported locale ${locale}`);
      return;
    }

    let data: LocaleData | null = null;

    /* Tentative 1 : fetch direct (compatible test + prod statique) */
    try {
      const res = await fetch(`/locales/${locale}.json`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        data = (await res.json()) as LocaleData;
      }
    } catch {
      /* fall-through */
    }

    /* Tentative 2 : import dynamique (bundle Vite) */
    if (!data) {
      try {
        const mod = (await import(/* @vite-ignore */ `../locales/${locale}.json`)) as { default?: LocaleData };
        data = mod.default ?? (mod as unknown as LocaleData);
      } catch (err: unknown) {
        logger.warn('i18n', `Failed to load locale ${locale}`, { err });
        return;
      }
    }

    if (!data) {
      return;
    }

    /* Extraire toutes les clés sauf _meta */
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === '_meta') {
        continue;
      }
      if (typeof v === 'string') {
        flat[k] = v;
      }
    }
    this.translations.set(locale, flat);
    logger.info('i18n', `Loaded locale ${locale}`, { keysCount: Object.keys(flat).length });
  }

  /**
   * Permet d'injecter directement des traductions (utile pour tests + SSR).
   */
  setTranslations(locale: Locale, translations: Record<string, string>): void {
    this.translations.set(locale, translations);
    if (locale === DEFAULT_LOCALE) {
      this.fallbackTranslations = translations;
    }
  }

  /**
   * Réinitialise (utile pour tests).
   */
  reset(): void {
    this.translations.clear();
    this.fallbackTranslations = {};
    this.currentLocale = DEFAULT_LOCALE;
    this.initialized = false;
  }

  private readStoredLocale(): Locale | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && SUPPORTED_LOCALES.includes(raw as Locale)) {
        return raw as Locale;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private detectFromNavigator(): Locale | null {
    try {
      const navLang = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : '').toLowerCase();
      if (!navLang) {
        return null;
      }
      /* fr-FR → fr, en-US → en, etc. */
      const short = navLang.split('-')[0];
      if (short && SUPPORTED_LOCALES.includes(short as Locale)) {
        return short as Locale;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

export const i18n = new I18n();
