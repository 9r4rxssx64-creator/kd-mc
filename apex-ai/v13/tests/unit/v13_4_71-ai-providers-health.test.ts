/**
 * Test régression v13.4.71 — services/ai-providers-health.ts.
 *
 * Sentinelle ping 60s health providers IA (anthropic/openrouter/groq/gemini).
 * Critique : router IA priorise providers OK > SLOW > UNKNOWN > DOWN.
 * openclaw exclu PROBE_PROVIDERS (placeholder fake, fix v13.3.87 P1.11).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aiProvidersHealth } from '../../services/ai/ai-providers-health.js';

describe('v13.4.71 ai-providers-health — API publique', () => {
  afterEach(() => {
    aiProvidersHealth.stop();
  });

  it("singleton défini avec méthodes attendues", () => {
    expect(aiProvidersHealth).toBeDefined();
    expect(typeof aiProvidersHealth.start).toBe('function');
    expect(typeof aiProvidersHealth.stop).toBe('function');
    expect(typeof aiProvidersHealth.getStatus).toBe('function');
    expect(typeof aiProvidersHealth.getDetails).toBe('function');
    expect(typeof aiProvidersHealth.getHealthyProviders).toBe('function');
    expect(typeof aiProvidersHealth.pingAll).toBe('function');
    expect(typeof aiProvidersHealth.pingOne).toBe('function');
    expect(typeof aiProvidersHealth.reset).toBe('function');
  });

  it("start() + stop() idempotents", () => {
    expect(() => {
      aiProvidersHealth.start();
      aiProvidersHealth.start();
      aiProvidersHealth.stop();
      aiProvidersHealth.stop();
    }).not.toThrow();
  });
});

describe('v13.4.71 ai-providers-health — getStatus snapshot', () => {
  afterEach(() => {
    aiProvidersHealth.stop();
  });

  it("getStatus() retourne objet avec 5 providers (anthropic/openrouter/groq/gemini/openclaw)", () => {
    const s = aiProvidersHealth.getStatus();
    expect(s).toBeDefined();
    expect(s.anthropic).toBeDefined();
    expect(s.openrouter).toBeDefined();
    expect(s.groq).toBeDefined();
    expect(s.gemini).toBeDefined();
    expect(s.openclaw).toBeDefined();
  });

  it("getStatus() chaque valeur ∈ {ok, slow, down, unknown}", () => {
    const s = aiProvidersHealth.getStatus();
    const validStatuses = ['ok', 'slow', 'down', 'unknown'];
    expect(validStatuses).toContain(s.anthropic);
    expect(validStatuses).toContain(s.openrouter);
    expect(validStatuses).toContain(s.groq);
    expect(validStatuses).toContain(s.gemini);
    expect(validStatuses).toContain(s.openclaw);
  });
});

describe('v13.4.71 ai-providers-health — getDetails structure', () => {
  it("getDetails() retourne array de 5 ProviderHealth", () => {
    const d = aiProvidersHealth.getDetails();
    expect(Array.isArray(d)).toBe(true);
    expect(d.length).toBe(5);
  });

  it("Chaque ProviderHealth a 5 champs requis", () => {
    const d = aiProvidersHealth.getDetails();
    for (const h of d) {
      expect(typeof h.provider).toBe('string');
      expect(typeof h.status).toBe('string');
      expect(typeof h.latency_ms).toBe('number');
      expect(typeof h.last_ping_ts).toBe('number');
      expect(typeof h.consecutive_failures).toBe('number');
    }
  });

  it("Providers énumérés (anthropic/openrouter/groq/gemini/openclaw)", () => {
    const d = aiProvidersHealth.getDetails();
    const ids = d.map((h) => h.provider).sort();
    expect(ids).toEqual(['anthropic', 'gemini', 'groq', 'openclaw', 'openrouter']);
  });
});

describe('v13.4.71 ai-providers-health — getHealthyProviders ranking', () => {
  it("getHealthyProviders() retourne array de ProviderId", () => {
    const h = aiProvidersHealth.getHealthyProviders();
    expect(Array.isArray(h)).toBe(true);
    /* Tous éléments valides */
    for (const p of h) {
      expect(['anthropic', 'openrouter', 'groq', 'gemini', 'openclaw']).toContain(p);
    }
  });

  it("getHealthyProviders() exclut down providers (rank=3)", () => {
    const h = aiProvidersHealth.getHealthyProviders();
    const status = aiProvidersHealth.getStatus();
    for (const p of h) {
      expect(status[p]).not.toBe('down');
    }
  });
});

describe('v13.4.71 ai-providers-health — reset', () => {
  it("reset() ne throw pas", () => {
    expect(() => aiProvidersHealth.reset()).not.toThrow();
  });

  it("Après reset, getDetails() retourne toujours 5 providers", () => {
    aiProvidersHealth.reset();
    const d = aiProvidersHealth.getDetails();
    expect(d.length).toBe(5);
  });
});
