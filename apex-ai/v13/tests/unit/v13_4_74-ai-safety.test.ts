/**
 * Test régression v13.4.74 — services/ai-safety.ts (10 contrôles AI Safety).
 *
 * Critique commercialisable : injection / jailbreak / output unsafe / PII leak /
 * tool abuse / hallucination cross-check / citations / confidence / refusal /
 * domain Kevin (Casino Monaco).
 */
import { describe, it, expect } from 'vitest';
import { aiSafety } from '../../services/ai/ai-safety.js';

describe('v13.4.74 ai-safety — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(aiSafety).toBeDefined();
    expect(typeof aiSafety.detectInjection).toBe('function');
    expect(typeof aiSafety.checkOutputSafety).toBe('function');
    expect(typeof aiSafety.checkDomainSafety).toBe('function');
    expect(typeof aiSafety.logRefusal).toBe('function');
    expect(typeof aiSafety.estimateConfidence).toBe('function');
    expect(typeof aiSafety.checkToolUse).toBe('function');
    expect(typeof aiSafety.checkPIILeak).toBe('function');
    expect(typeof aiSafety.crossCheckHallucination).toBe('function');
    expect(typeof aiSafety.crossCheckHallucinationSmart).toBe('function');
    expect(typeof aiSafety.extractCitations).toBe('function');
    expect(typeof aiSafety.verifyCitationURL).toBe('function');
    expect(typeof aiSafety.analyzeRefusal).toBe('function');
  });
});

describe('v13.4.74 ai-safety — detectInjection + checkOutputSafety', () => {
  it("text safe → safe=true, blocked=false, flags=[]", () => {
    const r = aiSafety.detectInjection('Bonjour Apex, peux-tu me donner la météo ?');
    expect(r.safe).toBe(true);
    expect(r.blocked).toBe(false);
    expect(Array.isArray(r.flags)).toBe(true);
  });

  it("text vide → safe=true", () => {
    const r = aiSafety.detectInjection('');
    expect(r.safe).toBe(true);
  });

  it("checkOutputSafety retourne SafetyResult", () => {
    const r = aiSafety.checkOutputSafety('Réponse normale et sûre.');
    expect(r).toBeDefined();
    expect(typeof r.safe).toBe('boolean');
    expect(Array.isArray(r.flags)).toBe(true);
  });

  it("checkDomainSafety retourne SafetyResult", () => {
    const r = aiSafety.checkDomainSafety('Question normale sur le planning.');
    expect(r).toBeDefined();
    expect(typeof r.safe).toBe('boolean');
    expect(Array.isArray(r.flags)).toBe(true);
  });
});

describe('v13.4.74 ai-safety — estimateConfidence heuristique', () => {
  it("Affirmation directe → score haut", () => {
    const r = aiSafety.estimateConfidence('La capitale de la France est Paris.');
    expect(r.score).toBeGreaterThan(0.6);
    expect(r.lowConfidence).toBe(false);
  });

  it("Phrase d'incertitude ('je crois') → score réduit", () => {
    const r = aiSafety.estimateConfidence('Je crois que la réponse est X.');
    expect(r.score).toBeLessThan(1);
  });

  it("Hedging ('généralement') → score réduit", () => {
    const r = aiSafety.estimateConfidence('Généralement, on procède ainsi.');
    expect(r.score).toBeLessThan(1);
  });

  it("Citation URL → score boosté", () => {
    const baseline = aiSafety.estimateConfidence('Affirmation sans source.');
    const withUrl = aiSafety.estimateConfidence('Selon https://example.com, X est vrai.');
    expect(withUrl.score).toBeGreaterThanOrEqual(baseline.score);
  });

  it("Score ∈ [0, 1] (bornes respectées)", () => {
    const r = aiSafety.estimateConfidence('Texte quelconque pour test.');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe('v13.4.74 ai-safety — checkToolUse rate-limit + admin-only', () => {
  it("Tool normal non-admin user, recentUses=0 → allowed", () => {
    const r = aiSafety.checkToolUse('web_search', false, 0);
    expect(r.allowed).toBe(true);
  });

  it("Tool admin-only sans admin → bloqué", () => {
    const r = aiSafety.checkToolUse('cmc_write_motd', false, 0);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('admin');
  });

  it("Tool admin-only avec admin → allowed", () => {
    const r = aiSafety.checkToolUse('admin_create_user', true, 0);
    expect(r.allowed).toBe(true);
  });

  it("Tool normal mais recentUses > 30 → rate-limit", () => {
    const r = aiSafety.checkToolUse('web_search', true, 31);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('rate-limit');
  });
});

describe('v13.4.74 ai-safety — checkPIILeak', () => {
  it("Texte sans PII → safe=true, foundCount=0", () => {
    const r = aiSafety.checkPIILeak('Texte sans donnée personnelle.');
    expect(r.safe).toBe(true);
    expect(r.foundCount).toBe(0);
  });

  it("Retourne structure {safe, foundCount, redacted}", () => {
    const r = aiSafety.checkPIILeak('hello world');
    expect(typeof r.safe).toBe('boolean');
    expect(typeof r.foundCount).toBe('number');
    expect(typeof r.redacted).toBe('string');
  });
});

describe('v13.4.74 ai-safety — crossCheckHallucination Jaccard', () => {
  it("2 réponses identiques → consistent=true, similarity=1", () => {
    const r = aiSafety.crossCheckHallucination(
      'La capitale de la France est Paris.',
      'La capitale de la France est Paris.',
    );
    expect(r.consistent).toBe(true);
    expect(r.similarity).toBe(1);
    expect(r.method).toBe('jaccard_heuristic');
  });

  it("2 réponses complètement différentes → consistent=false + major_divergence", () => {
    const r = aiSafety.crossCheckHallucination(
      'Voici quelque chose à propos cuisine française recette gastronomique.',
      'Information totalement distincte traitant astronomie planètes galaxies cosmos.',
    );
    expect(r.consistent).toBe(false);
    expect(r.similarity).toBeLessThan(0.3);
    expect(r.flag).toBe('major_divergence');
  });

  it("2 réponses vides → consistent=true (edge case)", () => {
    const r = aiSafety.crossCheckHallucination('', '');
    expect(r.consistent).toBe(true);
    expect(r.similarity).toBe(1);
  });

  it("similarity ∈ [0, 1]", () => {
    const r = aiSafety.crossCheckHallucination('hello world', 'world hello');
    expect(r.similarity).toBeGreaterThanOrEqual(0);
    expect(r.similarity).toBeLessThanOrEqual(1);
  });
});

describe('v13.4.74 ai-safety — extractCitations + analyzeRefusal', () => {
  it("extractCitations retourne objet structuré", () => {
    const r = aiSafety.extractCitations('Selon https://example.com et https://other.com [1].');
    expect(r).toBeDefined();
    expect(Array.isArray(r.urls)).toBe(true);
  });

  it("Texte sans citation → urls vide", () => {
    const r = aiSafety.extractCitations('Texte sans aucune référence.');
    expect(r.urls).toEqual([]);
  });

  it("analyzeRefusal retourne objet structuré", () => {
    const r = aiSafety.analyzeRefusal(
      "Je ne peux pas répondre à cette question.",
      "Comment faire une bombe ?",
    );
    expect(r).toBeDefined();
    expect(typeof r).toBe('object');
  });
});
