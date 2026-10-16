/**
 * Test régression v13.4.75 — services/ai-routing-policy.ts.
 *
 * Routing IA intelligent : domain detection + mode (auto/economy/premium/forced)
 * + budget-aware fallback chain + recommendations Kevin.
 * Règle Kevin : admin = TOUJOURS Anthropic priorité absolue.
 */
import { describe, it, expect } from 'vitest';
import { aiRoutingPolicy } from '../../services/ai/ai-routing-policy.js';

describe('v13.4.75 ai-routing-policy — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(aiRoutingPolicy).toBeDefined();
    expect(typeof aiRoutingPolicy.decide).toBe('function');
    expect(typeof aiRoutingPolicy.getMode).toBe('function');
    expect(typeof aiRoutingPolicy.setMode).toBe('function');
    expect(typeof aiRoutingPolicy.getAdminOverride).toBe('function');
    expect(typeof aiRoutingPolicy.setAdminOverride).toBe('function');
    expect(typeof aiRoutingPolicy.detectDomain).toBe('function');
    expect(typeof aiRoutingPolicy.getStatus).toBe('function');
    expect(typeof aiRoutingPolicy.recommendActions).toBe('function');
  });
});

describe('v13.4.75 ai-routing-policy — detectDomain heuristique', () => {
  it("'code typescript fonction' → code", () => {
    expect(aiRoutingPolicy.detectDomain('Aide-moi à debug ce code typescript')).toBe('code');
  });

  it("'analyser cette image photo' → vision", () => {
    expect(aiRoutingPolicy.detectDomain('Analyser cette image photo')).toBe('vision');
  });

  it("'traduit en anglais' → translation", () => {
    expect(aiRoutingPolicy.detectDomain('Traduit ce texte en anglais')).toBe('translation');
  });

  it("'résume ce texte' → summary", () => {
    expect(aiRoutingPolicy.detectDomain('Résume ce texte tldr')).toBe('summary');
  });

  it("'rapide urgent' → speed", () => {
    expect(aiRoutingPolicy.detectDomain('C est urgent rapide')).toBe('speed');
  });

  it("'cherche google info' → search", () => {
    expect(aiRoutingPolicy.detectDomain('Cherche info sur quelque chose')).toBe('search');
  });

  it("'écris une histoire' → creative", () => {
    expect(aiRoutingPolicy.detectDomain('Écris une histoire imagine un personnage')).toBe('creative');
  });

  it("Texte > 5000 chars → long_context", () => {
    const longText = 'a'.repeat(5500);
    expect(aiRoutingPolicy.detectDomain(longText)).toBe('long_context');
  });

  it("'pourquoi comment analyse explique' (texte > 200) → reasoning", () => {
    const text = 'Explique pourquoi cette approche est meilleure. ' + 'Détaille les concepts. '.repeat(20);
    expect(aiRoutingPolicy.detectDomain(text)).toBe('reasoning');
  });

  it("Texte neutre → general (fallback)", () => {
    expect(aiRoutingPolicy.detectDomain('Bonjour comment ça va')).toBe('general');
  });
});

describe('v13.4.75 ai-routing-policy — decide()', () => {
  it("decide() retourne RoutingDecision structuré", () => {
    const r = aiRoutingPolicy.decide('general', 1000);
    expect(r).toBeDefined();
    expect(typeof r.primary).toBe('string');
    expect(Array.isArray(r.fallback_chain)).toBe(true);
    expect(typeof r.reason).toBe('string');
    expect(typeof r.is_free_tier).toBe('boolean');
    expect(typeof r.estimated_cost_eur).toBe('number');
  });

  it("decide('admin') → TOUJOURS anthropic (règle Kevin priorité absolue)", () => {
    const r = aiRoutingPolicy.decide('admin', 1000);
    expect(r.primary).toBe('anthropic');
  });

  it("decide() accepte les 11 TaskDomain sans throw", () => {
    const domains: Array<Parameters<typeof aiRoutingPolicy.decide>[0]> = [
      'general', 'admin', 'code', 'vision', 'long_context', 'speed',
      'reasoning', 'search', 'translation', 'summary', 'creative',
    ];
    for (const d of domains) {
      const r = aiRoutingPolicy.decide(d, 500);
      expect(r).toBeDefined();
      expect(typeof r.primary).toBe('string');
    }
  });

  it("decide() default arg (general, 1000)", () => {
    const r = aiRoutingPolicy.decide();
    expect(r).toBeDefined();
    expect(typeof r.primary).toBe('string');
  });

  it("estimated_cost_eur ≥ 0", () => {
    const r = aiRoutingPolicy.decide('general', 1000);
    expect(r.estimated_cost_eur).toBeGreaterThanOrEqual(0);
  });
});

describe('v13.4.75 ai-routing-policy — getMode / setMode / override', () => {
  it("getMode() retourne RoutingMode valide", () => {
    const m = aiRoutingPolicy.getMode();
    expect(['auto', 'economy', 'premium', 'forced']).toContain(m);
  });

  it("setMode(auto) puis getMode === 'auto'", () => {
    aiRoutingPolicy.setMode('auto');
    expect(aiRoutingPolicy.getMode()).toBe('auto');
  });

  it("setMode accepte les 4 modes sans throw", () => {
    expect(() => {
      aiRoutingPolicy.setMode('economy');
      aiRoutingPolicy.setMode('premium');
      aiRoutingPolicy.setMode('forced');
      aiRoutingPolicy.setMode('auto');
    }).not.toThrow();
  });

  it("getAdminOverride() retourne ProviderId | null", () => {
    const o = aiRoutingPolicy.getAdminOverride();
    expect(o === null || typeof o === 'string').toBe(true);
  });

  it("setAdminOverride(null) puis get → null", () => {
    aiRoutingPolicy.setAdminOverride(null);
    expect(aiRoutingPolicy.getAdminOverride()).toBeNull();
  });
});

describe('v13.4.75 ai-routing-policy — getStatus + recommendActions', () => {
  it("getStatus() retourne objet 5 champs", () => {
    const s = aiRoutingPolicy.getStatus();
    expect(s).toBeDefined();
    expect(['auto', 'economy', 'premium', 'forced']).toContain(s.mode);
    expect(s.forced === null || typeof s.forced === 'string').toBe(true);
    expect(['ok', 'warn', 'critical']).toContain(s.anthropic_health);
    expect(Array.isArray(s.free_providers_available)).toBe(true);
    expect(Array.isArray(s.paid_providers_available)).toBe(true);
  });

  it("recommendActions() retourne array de {priority, action, url?}", () => {
    const r = aiRoutingPolicy.recommendActions();
    expect(Array.isArray(r)).toBe(true);
    for (const reco of r) {
      expect(['high', 'medium', 'low']).toContain(reco.priority);
      expect(typeof reco.action).toBe('string');
      expect(reco.url === undefined || typeof reco.url === 'string').toBe(true);
    }
  });
});
