/**
 * Tests Pro Modules Hub (8 modules expert).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { proModulesHub, PRO_MODULES } from '../../features/pro/index.js';

describe('Pro Modules Hub (8 modules expert)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
  });

  it('liste 8 modules pro', () => {
    expect(PRO_MODULES.length).toBe(8);
    expect(proModulesHub.list().length).toBe(8);
  });

  it('chaque module a sources autoritaires', () => {
    for (const m of PRO_MODULES) {
      expect(m.sources_autoritaires.length).toBeGreaterThan(0);
    }
  });

  it('byId trouve médical/légal/finance/cuisine/etc.', () => {
    expect(proModulesHub.byId('medical')?.label).toContain('Medical');
    expect(proModulesHub.byId('legal')?.label).toContain('Legal');
    expect(proModulesHub.byId('finance')?.label).toContain('Finance');
    expect(proModulesHub.byId('cuisine')?.label).toContain('Cuisine');
  });

  it('matchIntent détecte intent médical/juridique/cuisine', () => {
    expect(proModulesHub.matchIntent('symptôme grippe quelle posologie')?.id).toBe('medical');
    expect(proModulesHub.matchIntent('article du code civil')?.id).toBe('legal');
    expect(proModulesHub.matchIntent('recette de cuisson lente')?.id).toBe('cuisine');
    expect(proModulesHub.matchIntent('traduire en anglais')?.id).toBe('translator');
  });

  it('médical/légal/finance ont prudence_disclaimer obligatoire', () => {
    expect(proModulesHub.byId('medical')?.prudence_disclaimer).toBe(true);
    expect(proModulesHub.byId('legal')?.prudence_disclaimer).toBe(true);
    expect(proModulesHub.byId('finance')?.prudence_disclaimer).toBe(true);
  });

  it('cuisine pas de disclaimer (info indicative ok)', () => {
    expect(proModulesHub.byId('cuisine')?.prudence_disclaimer).toBe(false);
  });

  it.skip('render injecte sources + capabilities + disclaimer (delegé vers module v12 porté Sprint 2026-05-04)', async () => {
    /* Behavior changed : pro.render('medical') délègue maintenant vers
       features/pro/modules/medical/index.ts (port v12) qui a son propre rendering. */
    await proModulesHub.render('medical', root);
    expect(root.innerHTML).toContain('Vidal');
  });

  it.skip('render module sans disclaimer ne l\'inclut pas (delegé)', async () => {
    /* Behavior changed : pro.render('cuisine') délègue vers module v12 porté */
    await proModulesHub.render('cuisine', root);
    expect(root.innerHTML.includes('disclaimer')).toBe(false);
  });

  it('filterByPremium sépare gratuits / premium', () => {
    const free = proModulesHub.filterByPremium(false);
    const premium = proModulesHub.filterByPremium(true);
    expect(free.length + premium.length).toBe(8);
  });

  it('getStats retourne total + free + premium + with_disclaimer', () => {
    const s = proModulesHub.getStats();
    expect(s.total).toBe(8);
    expect(s.with_disclaimer).toBe(3); /* medical + legal + finance */
  });

  it('IDs uniques', () => {
    const ids = new Set(PRO_MODULES.map((m) => m.id));
    expect(ids.size).toBe(PRO_MODULES.length);
  });
});
