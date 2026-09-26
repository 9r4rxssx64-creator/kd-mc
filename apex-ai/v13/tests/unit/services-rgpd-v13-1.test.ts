/**
 * Tests Mission v13.1 RGPD : nouvelles méthodes Cookie banner, setConsent,
 * hasConsent par catégorie, portableExport, optOutAutomation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rgpd } from '../../services/auth/rgpd.js';

describe('rgpd v13.1 — Cookie banner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('showCookieBanner true au premier visit (pas de localStorage)', () => {
    const r = rgpd.showCookieBanner();
    expect(r.shouldShow).toBe(true);
    expect(r.reason).toBe('first_visit');
  });

  it('showCookieBanner false si consent valide récent', () => {
    rgpd.setConsent({ analytics: true, marketing: false, preferences: true });
    const r = rgpd.showCookieBanner();
    expect(r.shouldShow).toBe(false);
    expect(r.reason).toBe('consent_valid');
  });

  it('showCookieBanner true si consent expiré 13 mois', () => {
    const fourteenMonthsAgo = Date.now() - 14 * 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem('apex_v13_cookies_accepted', JSON.stringify({
      analytics: true,
      ts: fourteenMonthsAgo,
    }));
    const r = rgpd.showCookieBanner();
    expect(r.shouldShow).toBe(true);
    expect(r.reason).toBe('consent_expired_13_months');
  });

  it('showCookieBanner true si parse error', () => {
    localStorage.setItem('apex_v13_cookies_accepted', 'invalid_json{{');
    const r = rgpd.showCookieBanner();
    expect(r.shouldShow).toBe(true);
    expect(r.reason).toBe('parse_error');
  });
});

describe('rgpd v13.1 — setConsent + hasConsent par catégorie', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('setConsent persiste consents avec timestamp', () => {
    rgpd.setConsent({ analytics: true, marketing: false, preferences: true });
    const stored = localStorage.getItem('apex_v13_cookies_accepted');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored ?? '{}');
    expect(parsed.analytics).toBe(true);
    expect(parsed.marketing).toBe(false);
    expect(parsed.preferences).toBe(true);
    expect(parsed.essential).toBe(true);
    expect(parsed.ts).toBeGreaterThan(0);
  });

  it('hasConsent("analytics") retourne true après setConsent({analytics:true})', () => {
    rgpd.setConsent({ analytics: true });
    expect(rgpd.hasConsent('analytics')).toBe(true);
  });

  it('hasConsent("analytics") retourne false si refusé', () => {
    rgpd.setConsent({ analytics: false, marketing: false });
    expect(rgpd.hasConsent('analytics')).toBe(false);
    expect(rgpd.hasConsent('marketing')).toBe(false);
  });

  it('hasConsent("essential") toujours true (exemption Art. 82 LIL)', () => {
    expect(rgpd.hasConsent('essential')).toBe(true);
    rgpd.setConsent({ analytics: false });
    expect(rgpd.hasConsent('essential')).toBe(true);
  });

  it('hasConsent("marketing") false par défaut', () => {
    expect(rgpd.hasConsent('marketing')).toBe(false);
  });

  it('hasConsent("preferences") true si setConsent', () => {
    rgpd.setConsent({ preferences: true });
    expect(rgpd.hasConsent('preferences')).toBe(true);
  });

  it('hasConsent rétrocompatible (uid) fonctionne toujours', () => {
    rgpd.recordConsent('user_123', { aiTraining: true, analytics: true, thirdParty: false });
    expect(rgpd.hasConsent('user_123')).toBe(true);
    expect(rgpd.hasConsent('user_inexistant')).toBe(false);
  });

  it('setConsent par défaut (toutes catégories à false)', () => {
    rgpd.setConsent({});
    const stored = JSON.parse(localStorage.getItem('apex_v13_cookies_accepted') ?? '{}');
    expect(stored.analytics).toBe(false);
    expect(stored.marketing).toBe(false);
    expect(stored.preferences).toBe(false);
    expect(stored.essential).toBe(true);
  });
});

describe('rgpd v13.1 — portableExport (Art. 20)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('portableExport retourne un Blob JSON', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'u1', name: 'Test' }));
    const blob = await rgpd.portableExport('u1');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('portableExport contient @context schema.org JSON-LD', async () => {
    const blob = await rgpd.portableExport('u_jsonld');
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('PersonalDataExport');
    expect(parsed.uid).toBe('u_jsonld');
  });

  it('portableExport contient generator + exportedAt ISO', async () => {
    const blob = await rgpd.portableExport('u_iso');
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.generator).toBe('Apex AI v13');
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('rgpd v13.1 — optOutAutomation (Art. 22)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('optOutAutomation(uid, true) persiste flag', () => {
    rgpd.optOutAutomation('u1', true);
    expect(localStorage.getItem('apex_v13_optout_automation_u1')).toBe('1');
    expect(rgpd.isAutomationOptedOut('u1')).toBe(true);
  });

  it('optOutAutomation(uid, false) retire flag', () => {
    rgpd.optOutAutomation('u1', true);
    rgpd.optOutAutomation('u1', false);
    expect(localStorage.getItem('apex_v13_optout_automation_u1')).toBeNull();
    expect(rgpd.isAutomationOptedOut('u1')).toBe(false);
  });

  it('optOutAutomation par défaut true (sans 2e arg)', () => {
    rgpd.optOutAutomation('u_default');
    expect(rgpd.isAutomationOptedOut('u_default')).toBe(true);
  });

  it('isAutomationOptedOut false par défaut', () => {
    expect(rgpd.isAutomationOptedOut('jamais_set')).toBe(false);
  });

  it('automation et IA training sont indépendants', () => {
    rgpd.optOutAutomation('u1', true);
    rgpd.optOutAITraining('u1', false);
    expect(rgpd.isAutomationOptedOut('u1')).toBe(true);
    expect(rgpd.isOptedOut('u1')).toBe(false);
  });
});
