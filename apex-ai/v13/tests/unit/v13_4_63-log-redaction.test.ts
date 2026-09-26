/**
 * Test régression v13.4.63 — services/log-redaction-wrapper.ts.
 *
 * Redact PII (tokens API, IBAN, emails, etc.) avant tout console.log/warn/error.
 * Critique sécurité Apex commercialisable : pas de leak credentials dans logs.
 */
import { describe, it, expect } from 'vitest';
import { logRedaction } from '../../services/observability/log-redaction-wrapper.js';

describe('v13.4.63 log-redaction — redactString patterns', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(logRedaction).toBeDefined();
    expect(typeof logRedaction.redactString).toBe('function');
    expect(typeof logRedaction.redactValue).toBe('function');
    expect(typeof logRedaction.redactArgs).toBe('function');
    expect(typeof logRedaction.installGlobal).toBe('function');
    expect(typeof logRedaction.restoreGlobal).toBe('function');
    expect(typeof logRedaction.getStats).toBe('function');
    expect(typeof logRedaction.resetStats).toBe('function');
    expect(typeof logRedaction.isInstalled).toBe('function');
    expect(typeof logRedaction.listPatterns).toBe('function');
  });

  it("redactString string sans secret retourne identique count=0", () => {
    const r = logRedaction.redactString('Bonjour Kevin');
    expect(r.redacted).toBe('Bonjour Kevin');
    expect(r.count).toBe(0);
  });

  it("redactString string vide → count=0", () => {
    const r = logRedaction.redactString('');
    expect(r.redacted).toBe('');
    expect(r.count).toBe(0);
  });

  it("redactString détecte Anthropic API key", () => {
    const fake =
      'sk-ant-api03-' + 'a'.repeat(95);
    const r = logRedaction.redactString('Token: ' + fake);
    expect(r.count).toBeGreaterThan(0);
    expect(r.redacted).not.toContain(fake);
    expect(r.redacted).toContain('[REDACTED:');
  });

  it("redactString détecte OpenAI sk-...", () => {
    const fake = 'sk-' + 'X'.repeat(48);
    const r = logRedaction.redactString('Key: ' + fake);
    expect(r.count).toBeGreaterThan(0);
    expect(r.redacted).not.toContain(fake);
  });
});

describe('v13.4.63 log-redaction — redactValue récursif', () => {
  it("redactValue string identique si pas de secret", () => {
    const r = logRedaction.redactValue('hello world');
    expect(r).toBe('hello world');
  });

  it("redactValue number/boolean/null intacts", () => {
    expect(logRedaction.redactValue(42)).toBe(42);
    expect(logRedaction.redactValue(true)).toBe(true);
    expect(logRedaction.redactValue(null)).toBeNull();
    expect(logRedaction.redactValue(undefined)).toBeUndefined();
  });

  it("redactValue Error redacte message + préserve name", () => {
    const err = new TypeError('Failed sk-' + 'Y'.repeat(48));
    const r = logRedaction.redactValue(err) as Error;
    expect(r).toBeInstanceOf(Error);
    expect(r.name).toBe('TypeError');
    expect(r.message).not.toContain('sk-YYYY');
  });

  it("redactValue object JSON-roundtrip redacte les clés", () => {
    const obj = { token: 'sk-' + 'Z'.repeat(48), user: 'kevin' };
    const r = logRedaction.redactValue(obj) as Record<string, unknown>;
    expect(typeof r).toBe('object');
    expect(r['user']).toBe('kevin');
    expect(String(r['token'])).not.toContain('ZZZZ');
  });

  it("redactValue object cyclique retourne placeholder safe", () => {
    type Cyc = { name: string; self?: Cyc };
    const cyc: Cyc = { name: 'cyclic' };
    cyc.self = cyc;
    const r = logRedaction.redactValue(cyc);
    expect(typeof r).toBe('string');
    expect(r).toBe('[unserializable_object]');
  });
});

describe('v13.4.63 log-redaction — redactArgs + stats', () => {
  it("redactArgs applique sur array d'arguments", () => {
    const args = ['safe', 42, 'sk-' + 'W'.repeat(48)];
    const r = logRedaction.redactArgs(args);
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(3);
    expect(r[0]).toBe('safe');
    expect(r[1]).toBe(42);
    expect(String(r[2])).not.toContain('WWWW');
  });

  it("getStats retourne RedactionStats structuré", () => {
    const s = logRedaction.getStats();
    expect(s).toBeDefined();
    expect(typeof s.totalRedactions).toBe('number');
    expect(typeof s.byType).toBe('object');
  });

  it("resetStats() remet totalRedactions=0", () => {
    /* Sanity check : appel n'explose pas */
    expect(() => logRedaction.resetStats()).not.toThrow();
    const s = logRedaction.getStats();
    expect(s.totalRedactions).toBe(0);
  });

  it("listPatterns() retourne array de patterns avec name + label", () => {
    const patterns = logRedaction.listPatterns();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      expect(typeof p.name).toBe('string');
      expect(typeof p.label).toBe('string');
    }
  });

  it("isInstalled() retourne boolean", () => {
    expect(typeof logRedaction.isInstalled()).toBe('boolean');
  });
});
