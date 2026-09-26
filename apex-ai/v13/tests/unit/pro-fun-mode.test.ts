/**
 * Tests Pro/Fun Mode v13.3.29 (DUAL toggle global).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { proFunMode } from '../../ui/pro-fun-mode.js';

describe('Pro/Fun Mode v13.3.29', () => {
  beforeEach(() => {
    localStorage.clear();
    proFunMode.apply('pro', { persist: false, haptic: false });
  });

  it('défaut = pro', () => {
    expect(proFunMode.isPro()).toBe(true);
    expect(proFunMode.isFun()).toBe(false);
  });

  it('toggle PRO ↔ FUN', () => {
    expect(proFunMode.toggle()).toBe('fun');
    expect(proFunMode.isFun()).toBe(true);
    expect(proFunMode.toggle()).toBe('pro');
  });

  it('apply ajoute classe sur <html>', () => {
    proFunMode.apply('fun');
    expect(document.documentElement.classList.contains('ax-mode-fun')).toBe(true);
    expect(document.documentElement.classList.contains('ax-mode-pro')).toBe(false);
  });

  it('apply persiste dans localStorage', () => {
    proFunMode.apply('fun');
    expect(localStorage.getItem('ax_mode_dual')).toBe('fun');
  });

  it('init récupère mode depuis localStorage', () => {
    localStorage.setItem('ax_mode_dual', 'fun');
    expect(proFunMode.init()).toBe('fun');
  });

  it('init défaut pro si rien stocké', () => {
    expect(proFunMode.init()).toBe('pro');
  });

  it('subscribe notifie au changement', () => {
    let lastMode: string = '';
    const unsub = proFunMode.subscribe((mode) => {
      lastMode = mode;
    });
    proFunMode.apply('fun');
    expect(lastMode).toBe('fun');
    unsub();
    proFunMode.apply('pro');
    expect(lastMode).toBe('fun'); /* pas de nouveau notif */
  });

  it('pickLabel retourne pro version en mode pro', () => {
    proFunMode.apply('pro');
    expect(proFunMode.pickLabel('Profil', 'Ton profil 😎')).toBe('Profil');
  });

  it('pickLabel retourne fun version en mode fun', () => {
    proFunMode.apply('fun');
    expect(proFunMode.pickLabel('Profil', 'Ton profil 😎')).toBe('Ton profil 😎');
  });

  it('emoji vide en mode pro, présent en fun', () => {
    proFunMode.apply('pro');
    expect(proFunMode.emoji('🎉')).toBe('');
    proFunMode.apply('fun');
    expect(proFunMode.emoji('🎉')).toBe('🎉');
  });

  it('decorate ajoute emoji avant texte (fun mode)', () => {
    proFunMode.apply('fun');
    expect(proFunMode.decorate('Hello', '🎉')).toBe('🎉 Hello');
    expect(proFunMode.decorate('Hello', '🎉', 'after')).toBe('Hello 🎉');
  });

  it('decorate retourne texte tel quel en mode pro', () => {
    proFunMode.apply('pro');
    expect(proFunMode.decorate('Hello', '🎉')).toBe('Hello');
  });
});
