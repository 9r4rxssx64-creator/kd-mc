/**
 * Test régression v13.4.76 — services/auto-discover-links.ts.
 *
 * Découverte auto liens (login/dashboard/billing/api_keys/docs/etc.)
 * pour services détectés. Règle Kevin "Apex crée liens auto à chaque
 * nouveau credential".
 */
import { describe, it, expect } from 'vitest';
import { autoDiscoverLinks } from '../../services/integrations/auto-discover-links.js';

describe('v13.4.76 auto-discover-links — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(autoDiscoverLinks).toBeDefined();
    expect(typeof autoDiscoverLinks.discover).toBe('function');
    expect(typeof autoDiscoverLinks.discoverAllStored).toBe('function');
    expect(typeof autoDiscoverLinks.findServiceFromIdentifier).toBe('function');
    expect(typeof autoDiscoverLinks.generateLoginUrl).toBe('function');
    expect(typeof autoDiscoverLinks.getCached).toBe('function');
    expect(typeof autoDiscoverLinks.reVerifyAll).toBe('function');
  });
});

describe('v13.4.76 auto-discover-links — generateLoginUrl', () => {
  it("Service connu retourne string URL", () => {
    const url = autoDiscoverLinks.generateLoginUrl('github');
    expect(typeof url).toBe('string');
    expect((url ?? '').length).toBeGreaterThan(0);
  });

  it("Service vide retourne null", () => {
    const url = autoDiscoverLinks.generateLoginUrl('');
    expect(url).toBeNull();
  });

  it("Service avec redirect param encode l'URL", () => {
    const url = autoDiscoverLinks.generateLoginUrl('anthropic', { redirectTo: 'https://example.com/cb' });
    expect(typeof url).toBe('string');
    if (url) {
      expect(url).toContain('return_to=');
      expect(url).toContain('example.com');
    }
  });

  it("Service inconnu fallback login.{service}.com", () => {
    const url = autoDiscoverLinks.generateLoginUrl('unknownservicexyz');
    expect(typeof url).toBe('string');
    if (url) {
      expect(url).toContain('login.');
    }
  });
});

describe('v13.4.76 auto-discover-links — getCached', () => {
  it("getCached(inconnu) retourne null", () => {
    const r = autoDiscoverLinks.getCached('inexistant_service_xyz_999');
    expect(r).toBeNull();
  });

  it("getCached(service vide) retourne null", () => {
    expect(autoDiscoverLinks.getCached('')).toBeNull();
  });
});

describe('v13.4.76 auto-discover-links — discover() async', () => {
  it("discover('github') retourne DiscoveredLinks structuré", async () => {
    const r = await autoDiscoverLinks.discover('github');
    expect(r).toBeDefined();
    expect(typeof r.service).toBe('string');
    expect(['pre_configured', 'web_search', 'pattern_discovery', 'user_provided']).toContain(r.source);
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.alive).toBe('boolean');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('v13.4.76 auto-discover-links — discoverAllStored + reVerifyAll', () => {
  it("discoverAllStored() retourne DiscoverAllResult structuré", async () => {
    const r = await autoDiscoverLinks.discoverAllStored();
    expect(r).toBeDefined();
    expect(typeof r.total).toBe('number');
    expect(typeof r.new).toBe('number');
    expect(typeof r.verified).toBe('number');
  });

  it("reVerifyAll() retourne ReVerifyResult structuré", async () => {
    const r = await autoDiscoverLinks.reVerifyAll();
    expect(r).toBeDefined();
    expect(typeof r.tested).toBe('number');
    expect(typeof r.alive).toBe('number');
    expect(typeof r.broken).toBe('number');
  });
});

describe('v13.4.76 auto-discover-links — findServiceFromIdentifier', () => {
  it("findServiceFromIdentifier(email) retourne objet structuré", async () => {
    const r = await autoDiscoverLinks.findServiceFromIdentifier('user@gmail.com');
    expect(r).toBeDefined();
    expect(typeof r).toBe('object');
  });

  it("findServiceFromIdentifier(string vide) ne throw pas", async () => {
    await expect(autoDiscoverLinks.findServiceFromIdentifier('')).resolves.toBeDefined();
  });
});
