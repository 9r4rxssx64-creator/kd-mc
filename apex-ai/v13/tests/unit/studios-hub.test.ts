/**
 * Tests Studios Hub (15 studios).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { studiosHub, STUDIOS } from '../../features/studios/index.js';

describe('Studios Hub (15 studios créatifs)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
  });

  it('liste 15 studios complets', () => {
    expect(STUDIOS.length).toBe(15);
    const all = studiosHub.list();
    expect(all.length).toBe(15);
  });

  it('chaque studio a id + emoji + label + description + capabilities', () => {
    for (const s of STUDIOS) {
      expect(s.id).toBeTruthy();
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.capabilities.length).toBeGreaterThan(0);
      expect(s.intent_keywords.length).toBeGreaterThan(0);
    }
  });

  it('byId retourne studio existant + undefined sinon', () => {
    expect(studiosHub.byId('music')?.label).toContain('Mix');
    expect(studiosHub.byId('inexistant' as never)).toBeUndefined();
  });

  it('matchIntent détecte intent musique', () => {
    expect(studiosHub.matchIntent('je veux mixer une musique')?.id).toBe('music');
    expect(studiosHub.matchIntent('faire un montage vidéo')?.id).toBe('video');
    expect(studiosHub.matchIntent('générer un logo')?.id).toBe('logo');
  });

  it('matchIntent retourne null si aucun match', () => {
    expect(studiosHub.matchIntent('blabla random text')).toBe(null);
  });

  it('filterByCapability retourne studios avec capability', () => {
    const exportPdf = studiosHub.filterByCapability('export_pdf');
    expect(exportPdf.length).toBeGreaterThan(0);
    expect(exportPdf.every((s) => s.capabilities.includes('export_pdf'))).toBe(true);
  });

  it('filterByPremium sépare gratuits / premium', () => {
    const free = studiosHub.filterByPremium(false);
    const premium = studiosHub.filterByPremium(true);
    expect(free.length + premium.length).toBe(15);
    expect(free.every((s) => !s.premium)).toBe(true);
    expect(premium.every((s) => s.premium)).toBe(true);
  });

  it('render injecte HTML avec emoji + label + capabilities', async () => {
    await studiosHub.render('music', root);
    expect(root.innerHTML).toContain('🎚');
    expect(root.innerHTML).toContain('Mix');
    expect(root.innerHTML).toContain('data-studio="music"');
  });

  it('render studio premium ajoute badge PRO', async () => {
    await studiosHub.render('music', root);
    expect(root.innerHTML).toContain('PRO');
  });

  it('getStats retourne total + free + premium + capabilities_total', () => {
    const stats = studiosHub.getStats();
    expect(stats.total).toBe(15);
    expect(stats.free + stats.premium).toBe(15);
    expect(stats.capabilities_total).toBeGreaterThan(20);
  });

  it('IDs uniques (pas de doublon)', () => {
    const ids = new Set(STUDIOS.map((s) => s.id));
    expect(ids.size).toBe(STUDIOS.length);
  });
});
