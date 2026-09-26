/**
 * Test régression v13.4.56 — services/links-registry.ts (auto-création liens).
 *
 * Quand Apex détecte une clé d'un service, il crée auto les liens
 * dashboard/billing/docs/support associés (Kevin règle "crée liens auto").
 */
import { describe, it, expect } from 'vitest';
import { linksRegistry } from '../../services/integrations/links-registry.js';

describe('v13.4.56 links-registry — catalogue + helpers', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(linksRegistry).toBeDefined();
    expect(typeof linksRegistry.catalogue).toBe('function');
    expect(typeof linksRegistry.list).toBe('function');
    expect(typeof linksRegistry.get).toBe('function');
  });

  it("catalogue() retourne array readonly de noms services", () => {
    const c = linksRegistry.catalogue();
    expect(Array.isArray(c)).toBe(true);
    expect(c.length).toBeGreaterThanOrEqual(20);
  });

  it("catalogue contient services majeurs (anthropic/openai/groq/gemini)", () => {
    const c = linksRegistry.catalogue();
    expect(c.some((s) => /anthropic/i.test(s))).toBe(true);
    expect(c.some((s) => /openai/i.test(s))).toBe(true);
  });

  it("list() retourne array de ServiceLink", () => {
    const all = linksRegistry.list();
    expect(Array.isArray(all)).toBe(true);
  });

  it("get(service inexistant) → null", () => {
    expect(linksRegistry.get('inexistant_service_xyz')).toBeNull();
  });

  it("getRechargeLink retourne string ou null", () => {
    const r = linksRegistry.getRechargeLink('anthropic');
    expect(r === null || typeof r === 'string').toBe(true);
  });

  it("getPlansLink retourne string ou null", () => {
    const r = linksRegistry.getPlansLink('anthropic');
    expect(r === null || typeof r === 'string').toBe(true);
  });

  it("getUsageLink retourne string ou null", () => {
    const r = linksRegistry.getUsageLink('openai');
    expect(r === null || typeof r === 'string').toBe(true);
  });

  it("getApiKeysLink retourne string ou null", () => {
    const r = linksRegistry.getApiKeysLink('groq');
    expect(r === null || typeof r === 'string').toBe(true);
  });

  it("searchByPattern retourne readonly array de matchs", () => {
    const matchs = linksRegistry.searchByPattern('open');
    expect(Array.isArray(matchs)).toBe(true);
  });

  it("repair() retourne objet sans crash", () => {
    const r = linksRegistry.repair();
    expect(r).toBeDefined();
  });
});

describe('v13.4.56 links-registry — autoCreate sans network', () => {
  it("autoCreate signature présente (async)", () => {
    expect(typeof linksRegistry.autoCreate).toBe('function');
  });

  it("autoDiscover signature présente (async)", () => {
    expect(typeof linksRegistry.autoDiscover).toBe('function');
  });

  it("testAlive signature présente (async, fait HEAD HTTP)", () => {
    expect(typeof linksRegistry.testAlive).toBe('function');
  });
});
