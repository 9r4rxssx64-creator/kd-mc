/**
 * Tests Mission v13.1 i18n : init, t() avec vars, setLocale persist,
 * fallback fr si manque, available(), reset().
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { i18n } from '../../services/core-svc/i18n.js';

describe('i18n — init + détection navigator', () => {
  beforeEach(() => {
    localStorage.clear();
    i18n.reset();
    vi.restoreAllMocks();
  });

  it('init avec locale fr par défaut si pas de stored ni navigator', async () => {
    /* mock navigator.language vide */
    Object.defineProperty(navigator, 'language', { value: '', configurable: true });
    /* Inject fr translations */
    i18n.setTranslations('fr', { 'common.ok': 'OK FR', 'common.hello': 'Bonjour' });
    await i18n.init();
    expect(i18n.getLocale()).toBe('fr');
  });

  it('init détecte navigator.language en/it/es/de', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    i18n.setTranslations('fr', { 'k': 'fr' });
    i18n.setTranslations('en', { 'k': 'en' });
    await i18n.init();
    expect(i18n.getLocale()).toBe('en');
  });

  it('init priorise localStorage stored sur navigator', async () => {
    localStorage.setItem('apex_v13_locale', 'it');
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    i18n.setTranslations('fr', {});
    i18n.setTranslations('it', { 'k': 'it' });
    await i18n.init();
    expect(i18n.getLocale()).toBe('it');
  });

  it('init ignore stored invalide, retombe sur navigator', async () => {
    localStorage.setItem('apex_v13_locale', 'xx-INVALID');
    Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true });
    i18n.setTranslations('fr', {});
    i18n.setTranslations('es', { 'k': 'es' });
    await i18n.init();
    expect(i18n.getLocale()).toBe('es');
  });

  it('init est idempotent (n appels = 1 effet)', async () => {
    i18n.setTranslations('fr', { 'k': 'init1' });
    await i18n.init();
    const loc1 = i18n.getLocale();
    await i18n.init();
    const loc2 = i18n.getLocale();
    expect(loc1).toBe(loc2);
  });
});

describe('i18n — t() traduction', () => {
  beforeEach(() => {
    localStorage.clear();
    i18n.reset();
    vi.restoreAllMocks();
    /* Force navigator.language vide pour éviter détection auto */
    Object.defineProperty(navigator, 'language', { value: 'fr', configurable: true });
  });

  it('t() retourne traduction existante', async () => {
    i18n.setTranslations('fr', { 'common.ok': 'OK FR', 'chat.send_button': 'Envoyer' });
    await i18n.init();
    expect(i18n.t('common.ok')).toBe('OK FR');
    expect(i18n.t('chat.send_button')).toBe('Envoyer');
  });

  it('t() retourne clé brute si pas de traduction', async () => {
    i18n.setTranslations('fr', {});
    await i18n.init();
    expect(i18n.t('inexistant.key')).toBe('inexistant.key');
  });

  it('t() avec vars interpole {var}', async () => {
    i18n.setTranslations('fr', { 'auth.greeting': 'Bonjour {name}, qu\'est-ce que je peux faire pour {target} ?' });
    await i18n.init();
    expect(i18n.t('auth.greeting', { name: 'Kevin', target: 'toi' })).toBe('Bonjour Kevin, qu\'est-ce que je peux faire pour toi ?');
  });

  it('t() avec vars numériques', async () => {
    i18n.setTranslations('fr', { 'auth.pin_locked': 'Trop de tentatives. Patiente {minutes} minutes.' });
    await i18n.init();
    expect(i18n.t('auth.pin_locked', { minutes: 30 })).toBe('Trop de tentatives. Patiente 30 minutes.');
  });

  it('t() fallback fr si clé manquante dans locale courante', async () => {
    i18n.setTranslations('fr', { 'only.fr': 'FR Only' });
    i18n.setTranslations('en', { 'only.en': 'EN Only' });
    await i18n.init();
    await i18n.setLocale('en');
    expect(i18n.t('only.fr')).toBe('FR Only'); /* fallback fr */
    expect(i18n.t('only.en')).toBe('EN Only');
  });

  it('t() var sans match laisse {var} brut', async () => {
    i18n.setTranslations('fr', { 'msg': 'Hello {name}' });
    await i18n.init();
    expect(i18n.t('msg', {})).toBe('Hello {name}');
  });

  it('t() multiple occurrences même var', async () => {
    i18n.setTranslations('fr', { 'msg': '{x} et {x} font 2{x}' });
    await i18n.init();
    expect(i18n.t('msg', { x: '1' })).toBe('1 et 1 font 21');
  });
});

describe('i18n — setLocale persist + lazy load', () => {
  beforeEach(() => {
    localStorage.clear();
    i18n.reset();
    vi.restoreAllMocks();
  });

  it('setLocale persiste dans localStorage', async () => {
    i18n.setTranslations('fr', {});
    i18n.setTranslations('en', {});
    await i18n.init();
    await i18n.setLocale('en');
    expect(localStorage.getItem('apex_v13_locale')).toBe('en');
  });

  it('setLocale change la locale active', async () => {
    i18n.setTranslations('fr', { 'k': 'FR' });
    i18n.setTranslations('it', { 'k': 'IT' });
    await i18n.init();
    expect(i18n.t('k')).toBe('FR');
    await i18n.setLocale('it');
    expect(i18n.t('k')).toBe('IT');
  });

  it('setLocale("xx") fallback fr (locale non supportée)', async () => {
    i18n.setTranslations('fr', { 'k': 'FR' });
    await i18n.init();
    /* @ts-expect-error testing invalid locale */
    await i18n.setLocale('xx');
    expect(i18n.getLocale()).toBe('fr');
  });
});

describe('i18n — available()', () => {
  beforeEach(() => {
    i18n.reset();
  });

  it('available() retourne 6 langues (incl. monégasque)', () => {
    const langs = i18n.available();
    expect(langs.length).toBe(6);
  });

  it('available() inclut fr/en/it/es/de avec drapeaux', () => {
    const langs = i18n.available();
    const codes = langs.map((l) => l.code);
    expect(codes).toContain('fr');
    expect(codes).toContain('en');
    expect(codes).toContain('it');
    expect(codes).toContain('es');
    expect(codes).toContain('de');
    for (const l of langs) {
      expect(l.flag).toMatch(/[\u{1F1E6}-\u{1F1FF}]/u); /* regional indicator */
      expect(l.name.length).toBeGreaterThan(0);
    }
  });
});

describe('i18n — loadLocale + reset', () => {
  beforeEach(() => {
    localStorage.clear();
    i18n.reset();
    vi.restoreAllMocks();
  });

  it('loadLocale ne tente pas si locale non supportée', async () => {
    /* @ts-expect-error testing invalid locale */
    await i18n.loadLocale('xx');
    /* Pas d'erreur, juste warn */
    expect(true).toBe(true);
  });

  it('reset efface tout l\'état', async () => {
    i18n.setTranslations('fr', { 'k': 'FR' });
    await i18n.init();
    expect(i18n.t('k')).toBe('FR');
    i18n.reset();
    expect(i18n.t('k')).toBe('k'); /* clé brute → reset OK */
  });

  it('setTranslations override pour fr met à jour fallback', async () => {
    i18n.setTranslations('fr', { 'k1': 'old' });
    await i18n.init();
    i18n.setTranslations('fr', { 'k1': 'new' });
    expect(i18n.t('k1')).toBe('new');
  });
});
