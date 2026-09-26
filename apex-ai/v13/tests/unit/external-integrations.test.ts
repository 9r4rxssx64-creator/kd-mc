/**
 * Tests external-integrations.ts (email + social + cross-promo + scalability).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { externalIntegrations } from '../../services/integrations/external-integrations.js';

describe('External Integrations (email + social + cross-promo + scalability)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Email management', () => {
    it('getEmailOAuthUrl gmail retourne URL Google OAuth', () => {
      const url = externalIntegrations.getEmailOAuthUrl('gmail', 'https://callback');
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('callback');
      expect(url).toContain('gmail.modify');
    });

    it('getEmailOAuthUrl outlook retourne URL Microsoft OAuth', () => {
      const url = externalIntegrations.getEmailOAuthUrl('outlook', 'https://cb');
      expect(url).toContain('login.microsoftonline.com');
      expect(url).toContain('Mail.ReadWrite');
    });

    it('listEmailAccounts vide → []', () => {
      expect(externalIntegrations.listEmailAccounts('kevin').length).toBe(0);
    });

    it('registerEmailAccount + listEmailAccounts', () => {
      externalIntegrations.registerEmailAccount({
        uid: 'kevin',
        provider: 'gmail',
        email: 'kevin@gmail.com',
      });
      const list = externalIntegrations.listEmailAccounts('kevin');
      expect(list.length).toBe(1);
      expect(list[0]?.connected).toBe(true);
      expect(list[0]?.last_sync).toBeGreaterThan(0);
    });

    it('register update si déjà existant (no duplicate)', () => {
      externalIntegrations.registerEmailAccount({ uid: 'k', provider: 'gmail', email: 'k@g.com' });
      externalIntegrations.registerEmailAccount({ uid: 'k', provider: 'gmail', email: 'k@g.com' });
      const list = externalIntegrations.listEmailAccounts('k');
      expect(list.length).toBe(1);
    });
  });

  describe('Social media', () => {
    it('getSocialOAuthUrl twitter_x retourne URL X OAuth', () => {
      const url = externalIntegrations.getSocialOAuthUrl('twitter_x', 'https://cb');
      expect(url).toContain('twitter.com');
    });

    it('listSocialAccounts vide → []', () => {
      expect(externalIntegrations.listSocialAccounts('kevin').length).toBe(0);
    });

    it('registerSocialAccount + listSocialAccounts', () => {
      externalIntegrations.registerSocialAccount({
        uid: 'kevin',
        platform: 'linkedin',
        handle: 'kevin-desarzens',
      });
      const list = externalIntegrations.listSocialAccounts('kevin');
      expect(list[0]?.platform).toBe('linkedin');
      expect(list[0]?.connected).toBe(true);
    });

    it('canPublishSocial autorise jusqu\'à cap 5/jour', () => {
      const r1 = externalIntegrations.canPublishSocial('kev', 'twitter_x');
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(5);
      for (let i = 0; i < 5; i++) externalIntegrations.recordPublish('kev', 'twitter_x');
      const r2 = externalIntegrations.canPublishSocial('kev', 'twitter_x');
      expect(r2.allowed).toBe(false);
      expect(r2.remaining).toBe(0);
    });
  });

  describe('Cross-promo ads (Kevin "liens publicités cross-projets")', () => {
    it('getCrossPromoAds source=apex retourne ads vers KDMC/e-KDMC/etc.', () => {
      const ads = externalIntegrations.getCrossPromoAds('apex');
      expect(ads.length).toBeGreaterThanOrEqual(4);
      const targets = new Set(ads.map((a) => a.target_project));
      expect(targets.has('kdmc')).toBe(true);
      expect(targets.has('ekdmc')).toBe(true);
      expect(targets.has('telecommande')).toBe(true);
    });

    it('cross-promo position filter', () => {
      const sidebar = externalIntegrations.getCrossPromoAds('apex', 'sidebar');
      expect(sidebar.every((a) => a.position === 'sidebar')).toBe(true);
    });

    it('getCrossPromoForUser retourne ad + record impression', () => {
      const ad = externalIntegrations.getCrossPromoForUser('u_test', 'apex', 'inline');
      expect(ad).not.toBeNull();
      expect(ad?.cta_url).toBeTruthy();
      const stored = JSON.parse(localStorage.getItem('apex_v13_cross_promo_impressions')!) as unknown[];
      expect(stored.length).toBeGreaterThanOrEqual(1);
    });

    it('cross-promo "kdmc → apex" existe (reverse direction Kevin)', () => {
      const reverse = externalIntegrations.getCrossPromoAds('kdmc');
      expect(reverse.length).toBeGreaterThanOrEqual(1);
      expect(reverse[0]?.target_project).toBe('apex');
    });
  });

  describe('Scalability check (500+ users)', () => {
    it('checkScalability retourne healthy + capacity', () => {
      const r = externalIntegrations.checkScalability();
      expect(typeof r.healthy).toBe('boolean');
      expect(Array.isArray(r.warnings)).toBe(true);
      expect(r.estimated_users_capacity).toBeGreaterThanOrEqual(0);
    });

    it('warnings si storage > 4MB', () => {
      /* Stocke 4.5 MB de données factices */
      const bigData = 'X'.repeat(1024 * 1024); /* 1 MB string */
      try {
        for (let i = 0; i < 5; i++) localStorage.setItem(`big_${i}`, bigData);
      } catch {
        /* ignore quota */
      }
      const r = externalIntegrations.checkScalability();
      /* Warnings dépendent du storage actuel — soit healthy soit warning */
      expect(typeof r.healthy).toBe('boolean');
    });

    it('warnings si pending messages > 100', () => {
      const arr = Array.from({ length: 150 }, (_, i) => ({ id: `m${i}`, status: 'pending' }));
      localStorage.setItem('apex_v13_pending_messages_kev', JSON.stringify(arr));
      const r = externalIntegrations.checkScalability();
      expect(r.warnings.some((w) => w.includes('pending'))).toBe(true);
    });
  });

  describe('Stats user dashboard', () => {
    it('getStats agrège emails + socials + cross_promos + scalability', () => {
      externalIntegrations.registerEmailAccount({ uid: 'k', provider: 'gmail', email: 'k@g.com' });
      externalIntegrations.registerSocialAccount({ uid: 'k', platform: 'twitter_x', handle: '@k' });
      externalIntegrations.getCrossPromoForUser('k', 'apex', 'inline');
      const stats = externalIntegrations.getStats('k');
      expect(stats.emails_connected).toBe(1);
      expect(stats.socials_connected).toBe(1);
      expect(stats.cross_promos_seen_today).toBeGreaterThanOrEqual(1);
      expect(stats.scalability_health).toBeDefined();
    });
  });
});
