/**
 * Tests Theme Switcher v13.3.29 (UX Premium 6 thèmes).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { themeSwitcher } from '../../ui/theme-switcher.js';

describe('Theme Switcher v13.3.29', () => {
  beforeEach(() => {
    themeSwitcher.reset();
    localStorage.clear();
  });

  it('liste 8 thèmes minimum (6 manuels + 3 saisonniers)', () => {
    const themes = themeSwitcher.list();
    expect(themes.length).toBeGreaterThanOrEqual(8);
    expect(themes.find((t) => t.id === 'casino-gold')).toBeDefined();
    expect(themes.find((t) => t.id === 'ocean-blue')).toBeDefined();
    expect(themes.find((t) => t.id === 'pride')).toBeDefined();
  });

  it('apply applique CSS vars sur <html>', () => {
    themeSwitcher.apply('ocean-blue');
    expect(document.documentElement.getAttribute('data-theme')).toBe('ocean-blue');
    expect(document.documentElement.style.getPropertyValue('--ax-theme-accent')).toBe('#29b6f6');
  });

  it('apply persiste dans localStorage', () => {
    themeSwitcher.apply('emerald');
    expect(localStorage.getItem('ax_theme')).toBe('emerald');
  });

  it('apply ne persiste pas si persist=false', () => {
    themeSwitcher.apply('emerald', { persist: false });
    expect(localStorage.getItem('ax_theme')).toBeNull();
  });

  it('init récupère thème depuis localStorage', () => {
    localStorage.setItem('ax_theme', 'sunset-orange');
    const theme = themeSwitcher.init();
    expect(theme.id).toBe('sunset-orange');
  });

  it('init détecte saisonnier Halloween si pas de preference', () => {
    /* 20 octobre */
    const oct20 = new Date(2026, 9, 20);
    const seasonal = themeSwitcher.detectSeasonal(oct20);
    expect(seasonal?.id).toBe('halloween');
  });

  it('detectSeasonal Christmas en décembre', () => {
    const dec15 = new Date(2026, 11, 15);
    const seasonal = themeSwitcher.detectSeasonal(dec15);
    expect(seasonal?.id).toBe('christmas');
  });

  it('detectSeasonal null en mars (rien de saisonnier)', () => {
    const mar15 = new Date(2026, 2, 15);
    expect(themeSwitcher.detectSeasonal(mar15)).toBeNull();
  });

  it('cycle passe au thème suivant', () => {
    themeSwitcher.apply('casino-gold');
    const next = themeSwitcher.cycle();
    expect(next.id).toBe('ocean-blue');
  });

  it('subscribe + unsubscribe fonctionnent', () => {
    let called = 0;
    const unsub = themeSwitcher.subscribe(() => {
      called++;
    });
    themeSwitcher.apply('emerald');
    expect(called).toBe(1);
    unsub();
    themeSwitcher.apply('pride');
    expect(called).toBe(1);
  });

  it('reset revient à casino-gold + clear storage', () => {
    themeSwitcher.apply('pride');
    themeSwitcher.reset();
    expect(themeSwitcher.getCurrent().id).toBe('casino-gold');
    expect(localStorage.getItem('ax_theme')).toBeNull();
  });

  it('byId inconnu retourne null', () => {
    expect(themeSwitcher.byId('inexistant' as never)).toBeNull();
  });
});
