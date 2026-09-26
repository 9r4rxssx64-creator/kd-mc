import { describe, it, expect, beforeEach } from 'vitest';
import { commerce } from '../../services/integrations/commerce.js';
import { store } from '../../core/store.js';

describe('commerce', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.0.0' });
    store.set('isAdmin', false);
  });

  it("Kevin admin a toujours plan 'admin' (bypass)", () => {
    store.set('isAdmin', true);
    expect(commerce.getEffectivePlan('kdmc_admin')).toBe('admin');
  });

  it('si commerce OFF, tout le monde a plan admin (mode test)', () => {
    commerce.setEnabled(false);
    expect(commerce.getEffectivePlan('any-uid')).toBe('admin');
  });

  it('si commerce ON, user free par défaut', () => {
    commerce.setEnabled(true);
    expect(commerce.getEffectivePlan('client_xyz')).toBe('free');
  });

  it('admin ne consomme jamais de quota', () => {
    store.set('isAdmin', true);
    const r = commerce.consumeMessage('kdmc_admin');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(-1);
  });

  /* v13.3.41 (mission INNOVATION-COMM) — landing config publique */
  describe('getPlansForLanding', () => {
    it('retourne 4 plans publics ordonnés free/basic/pro/business', () => {
      const plans = commerce.getPlansForLanding();
      expect(plans.length).toBe(4);
      expect(plans[0]?.id).toBe('free');
      expect(plans[1]?.id).toBe('basic');
      expect(plans[2]?.id).toBe('pro');
      expect(plans[3]?.id).toBe('business');
    });

    it('Basic est featured (recommandé)', () => {
      const plans = commerce.getPlansForLanding();
      const featured = plans.filter((p) => p.featured);
      expect(featured.length).toBe(1);
      expect(featured[0]?.id).toBe('basic');
    });

    it('Free a prix 0€', () => {
      const plans = commerce.getPlansForLanding();
      const free = plans.find((p) => p.id === 'free');
      expect(free?.pricePerMonth).toBe(0);
    });

    it('Basic 9€, Pro 29€', () => {
      const plans = commerce.getPlansForLanding();
      expect(plans.find((p) => p.id === 'basic')?.pricePerMonth).toBe(9);
      expect(plans.find((p) => p.id === 'pro')?.pricePerMonth).toBe(29);
    });

    it('Business prix -1 (sur devis)', () => {
      const plans = commerce.getPlansForLanding();
      expect(plans.find((p) => p.id === 'business')?.pricePerMonth).toBe(-1);
    });

    it('chaque plan a au moins 4 features', () => {
      const plans = commerce.getPlansForLanding();
      for (const p of plans) {
        expect(p.features.length).toBeGreaterThanOrEqual(4);
      }
    });
  });
});
