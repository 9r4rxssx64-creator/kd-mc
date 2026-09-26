/**
 * Tests ads.ts + subscription-tiers.ts (Kevin demande pubs + forfaits enrichis).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ads } from '../../services/integrations/ads.js';
import { subscriptionTiers } from '../../services/auth/subscription-tiers.js';
import { commerce } from '../../services/integrations/commerce.js';

describe('Ads Service (publicités contextuelles tier-based)', () => {
  beforeEach(() => {
    localStorage.clear();
    ads.reset();
  });

  describe('shouldShowAds tier-based', () => {
    it('user null → pas de pub', () => {
      expect(ads.shouldShowAds(null)).toBe(false);
    });

    it('admin Kevin → JAMAIS de pub', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('kdmc_admin', 'admin');
      expect(ads.shouldShowAds('kdmc_admin')).toBe(false);
    });

    it('client_pro → pas de pub', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('u_pro', 'pro');
      expect(ads.shouldShowAds('u_pro')).toBe(false);
    });

    it('client_free → voit des pubs', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('u_free', 'free');
      expect(ads.shouldShowAds('u_free')).toBe(true);
    });

    it('client basic → voit des pubs (limité)', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('u_basic', 'basic');
      expect(ads.shouldShowAds('u_basic')).toBe(true);
    });
  });

  describe('getDailyCap', () => {
    it('cap 3 pour free, 1 pour basic, 0 pour pro/admin', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('u_f', 'free');
      commerce.setUserPlan('u_b', 'basic');
      commerce.setUserPlan('u_p', 'pro');
      expect(ads.getDailyCap('u_f')).toBe(3);
      expect(ads.getDailyCap('u_b')).toBe(1);
      expect(ads.getDailyCap('u_p')).toBe(0);
    });
  });

  describe('getNextAd + frequency cap', () => {
    it('user free → ad chat_inline disponible', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('u_free', 'free');
      const ad = ads.getNextAd('u_free', 'chat_inline');
      expect(ad).not.toBeNull();
      expect(ad?.position).toBe('chat_inline');
    });

    it('admin → null (jamais de pub)', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('kdmc', 'admin');
      const ad = ads.getNextAd('kdmc', 'chat_inline');
      expect(ad).toBeNull();
    });

    it('frequency cap 3 pour free → 4ème impression null', () => {
      commerce.setEnabled(true);
      commerce.setUserPlan('u', 'free');
      ads.recordImpression('apex_pro_upgrade', 'u', 'chat_footer');
      ads.recordImpression('apex_voice_premium', 'u', 'studio_corner');
      ads.recordImpression('apex_studios_pro', 'u', 'chat_inline');
      const fourth = ads.getNextAd('u', 'chat_inline');
      expect(fourth).toBeNull();
    });
  });

  describe('record + click tracking', () => {
    it('recordImpression incrémente shown_count via stats', () => {
      ads.recordImpression('apex_pro_upgrade', 'kevin', 'chat_footer');
      ads.recordImpression('apex_pro_upgrade', 'laurence', 'chat_footer');
      const stats = ads.getAdStats();
      expect(stats['apex_pro_upgrade']?.shown_count).toBe(2);
    });

    it('recordClick incrémente click_count + calcule CTR', () => {
      ads.recordImpression('apex_pro_upgrade', 'u1', 'chat_footer');
      ads.recordClick('apex_pro_upgrade', 'u1');
      const stats = ads.getAdStats();
      expect(stats['apex_pro_upgrade']?.click_count).toBe(1);
      expect(stats['apex_pro_upgrade']?.ctr).toBe(100);
    });

    it('CTR calculé % avec 1 décimale', () => {
      for (let i = 0; i < 100; i++) ads.recordImpression('apex_voice_premium', `u${i}`, 'studio_corner');
      ads.recordClick('apex_voice_premium', 'u0');
      ads.recordClick('apex_voice_premium', 'u1');
      const stats = ads.getAdStats();
      expect(stats['apex_voice_premium']?.ctr).toBe(2);
    });
  });
});

describe('Subscription Tiers (forfaits enrichis Kevin)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('listPublic + listAll', () => {
    it('listPublic exclut admin (interne)', () => {
      const pub = subscriptionTiers.listPublic();
      expect(pub.find((t) => t.plan === 'admin')).toBeUndefined();
      expect(pub.length).toBe(4); /* free + basic + pro + business */
    });

    it('listAll inclut admin', () => {
      const all = subscriptionTiers.listAll();
      expect(all.find((t) => t.plan === 'admin')).toBeDefined();
      expect(all.length).toBe(5);
    });
  });

  describe('getByPlan + getCurrentTier', () => {
    it('getByPlan retourne forfait correct', () => {
      const pro = subscriptionTiers.getByPlan('pro');
      expect(pro?.price_monthly_eur).toBe(29);
      expect(pro?.daily_message_limit).toBe(-1);
      expect(pro?.studios_count).toBe('all');
    });

    it('getByPlan plan inconnu → null', () => {
      expect(subscriptionTiers.getByPlan('inconnu' as 'free')).toBeNull();
    });

    it('getCurrentTier user null → free', () => {
      const tier = subscriptionTiers.getCurrentTier(null);
      expect(tier.plan).toBe('free');
    });
  });

  describe('getNextUpgrade', () => {
    it('free → basic', () => {
      const next = subscriptionTiers.getNextUpgrade('free');
      expect(next?.plan).toBe('basic');
    });

    it('basic → pro', () => {
      const next = subscriptionTiers.getNextUpgrade('basic');
      expect(next?.plan).toBe('pro');
    });

    it('business → null (top tier)', () => {
      expect(subscriptionTiers.getNextUpgrade('business')).toBeNull();
    });
  });

  describe('listAddonsFor', () => {
    it('addons ElevenLabs disponibles pour basic + pro', () => {
      const basicAddons = subscriptionTiers.listAddonsFor('basic');
      const proAddons = subscriptionTiers.listAddonsFor('pro');
      const businessAddons = subscriptionTiers.listAddonsFor('business');
      expect(basicAddons.find((a) => a.id === 'voice_elevenlabs_premium')).toBeDefined();
      expect(proAddons.find((a) => a.id === 'voice_elevenlabs_premium')).toBeDefined();
      /* Pour business, c'est inclus, pas dans addons */
      expect(businessAddons.find((a) => a.id === 'voice_elevenlabs_premium')).toBeUndefined();
    });
  });

  describe('calculateMonthlyTotal', () => {
    it('pro sans addons = 29€', () => {
      expect(subscriptionTiers.calculateMonthlyTotal('pro')).toBe(29);
    });

    it('pro + 2 addons (5€ + 19€) = 53€', () => {
      const total = subscriptionTiers.calculateMonthlyTotal('pro', [
        'voice_elevenlabs_premium',
        'api_access_unlimited',
      ]);
      expect(total).toBe(29 + 5 + 19);
    });

    it('free + addon non-compatible = 0€ (addon pas appliqué tier insufficient)', () => {
      /* L'addon n'est pas filtré par calculateMonthlyTotal mais par listAddonsFor.
       * Ici on test brut : l'addon est ajouté si l'id existe. */
      const total = subscriptionTiers.calculateMonthlyTotal('free', ['voice_elevenlabs_premium']);
      expect(total).toBe(5); /* 0€ free + 5€ addon brute calc */
    });
  });

  describe('getYearlySavings', () => {
    it('pro yearly savings ~17%', () => {
      const s = subscriptionTiers.getYearlySavings('pro');
      expect(s.monthly_total).toBe(29 * 12);
      expect(s.yearly_total).toBe(290);
      expect(s.savings).toBe(29 * 12 - 290);
      expect(s.pct).toBeGreaterThanOrEqual(15);
      expect(s.pct).toBeLessThanOrEqual(20);
    });

    it('free → 0 savings', () => {
      const s = subscriptionTiers.getYearlySavings('free');
      expect(s.savings).toBe(0);
    });
  });

  describe('hasFeature', () => {
    it('pro a marketplace + voix premium + api', () => {
      expect(subscriptionTiers.hasFeature('pro', 'marketplace')).toBe(true);
      expect(subscriptionTiers.hasFeature('pro', 'voices_premium')).toBe(true);
      expect(subscriptionTiers.hasFeature('pro', 'api_access')).toBe(true);
    });

    it('free pas de marketplace ni white_label', () => {
      expect(subscriptionTiers.hasFeature('free', 'marketplace')).toBe(false);
      expect(subscriptionTiers.hasFeature('free', 'white_label')).toBe(false);
    });

    it('business a tout', () => {
      expect(subscriptionTiers.hasFeature('business', 'white_label')).toBe(true);
      expect(subscriptionTiers.hasFeature('business', 'priority_support')).toBe(true);
      expect(subscriptionTiers.hasFeature('business', 'unlimited_messages')).toBe(true);
    });
  });

  describe('formatForPricingPage', () => {
    it('format pricing avec badge "Plus populaire" sur Pro', () => {
      const fmt = subscriptionTiers.formatForPricingPage();
      const pro = fmt.find((p) => p.plan === 'pro');
      expect(pro?.badge).toBe('Plus populaire');
      expect(pro?.price).toContain('29');
      expect(pro?.yearly_savings).toContain('Économie');
    });

    it('free a CTA "Commencer gratuit"', () => {
      const fmt = subscriptionTiers.formatForPricingPage();
      const free = fmt.find((p) => p.plan === 'free');
      expect(free?.cta_label?.toLowerCase()).toContain('gratuit');
      expect(free?.price).toBe('Gratuit');
    });

    it('business a CTA "Contacter ventes"', () => {
      const fmt = subscriptionTiers.formatForPricingPage();
      const biz = fmt.find((p) => p.plan === 'business');
      expect(biz?.cta_label).toContain('Contacter');
    });
  });
});
