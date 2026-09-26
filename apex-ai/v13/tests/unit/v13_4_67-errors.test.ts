/**
 * Test régression v13.4.67 — core/errors.ts.
 *
 * toUserMessage convertit erreurs techniques en messages français actionnables.
 * Règle CLAUDE.md "ZÉRO blocage user" + UX simple.
 * Ordre critique : QuotaExceededError AVANT /quota/, ^aborted$ AVANT /abort/,
 * tool.not.found AVANT /404|not.found/ (bugs v13.4.18 documentés, fix v13.4.28).
 */
import { describe, it, expect } from 'vitest';
import { errors } from '../../core/errors.js';

describe('v13.4.67 errors — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(errors).toBeDefined();
    expect(typeof errors.installGlobalHandlers).toBe('function');
    expect(typeof errors.capture).toBe('function');
    expect(typeof errors.toUserMessage).toBe('function');
  });
});

describe('v13.4.67 errors — toUserMessage patterns critiques', () => {
  it("QuotaExceededError → stockage saturé (AVANT /quota/)", () => {
    expect(errors.toUserMessage(new Error('QuotaExceededError: setItem failed')))
      .toContain('Stockage saturé');
  });

  it("quota Anthropic distinct → quota épuisé + lien billing", () => {
    expect(errors.toUserMessage(new Error('insufficient_quota: balance 0')))
      .toContain('Quota Anthropic');
  });

  it("Network errors → réseau coupé", () => {
    const r = errors.toUserMessage(new Error('Failed to fetch'));
    expect(r).toContain('Réseau');
  });

  it("CORS → bloqué sécurité", () => {
    expect(errors.toUserMessage(new Error('CORS blocked')))
      .toContain('CORS');
  });

  it("'aborted' (anchored exact) → iOS Safari normal", () => {
    expect(errors.toUserMessage(new Error('aborted')))
      .toContain('iOS Safari');
  });

  it("'abort' générique → action interrompue", () => {
    expect(errors.toUserMessage(new Error('User aborted request')))
      .toContain('interrompue');
  });

  it("timeout → retente autre modèle IA", () => {
    expect(errors.toUserMessage(new Error('Request timeout')))
      .toContain('Pas de réponse');
  });

  it("rate limit 429 → attends 30s", () => {
    expect(errors.toUserMessage(new Error('Rate limit exceeded 429')))
      .toContain('Trop de requêtes');
  });

  it("401 unauthorized → clé API invalide", () => {
    expect(errors.toUserMessage(new Error('401 Unauthorized: invalid api key')))
      .toContain('Clé API');
  });

  it("403 forbidden → action non autorisée", () => {
    expect(errors.toUserMessage(new Error('403 Forbidden')))
      .toContain('non autorisée');
  });

  it("'tool not found' AVANT /404|not.found/ (bug v13.4.18 fix)", () => {
    const r = errors.toUserMessage(new Error('Tool not found: xyz'));
    expect(r).toContain('Outil indisponible');
    /* Doit NE PAS dire 'ressource introuvable' (mauvais pattern) */
    expect(r).not.toContain('introuvable');
  });

  it("404 not found → ressource introuvable", () => {
    expect(errors.toUserMessage(new Error('404 not found')))
      .toContain('introuvable');
  });

  it("5xx server error → bascule failover", () => {
    expect(errors.toUserMessage(new Error('500 Internal Server Error')))
      .toContain('Serveur');
  });

  it("parse error → format cassé", () => {
    expect(errors.toUserMessage(new Error('JSON parse error')))
      .toContain('Format');
  });

  it("IndexedDB → cache local inaccessible", () => {
    expect(errors.toUserMessage(new Error('IndexedDB open failed')))
      .toContain('Cache local');
  });

  it("'openai no key' (provider failover sans clé) → message neutre", () => {
    expect(errors.toUserMessage(new Error('openai no key')))
      .toContain('autre modèle');
  });

  it("Erreur inconnue → message générique avec SOS", () => {
    const r = errors.toUserMessage(new Error('Some random weird error'));
    expect(r.length).toBeGreaterThan(0);
    /* Soit message admin debug, soit fallback générique avec SOS */
    expect(r).toMatch(/SOS|Souci technique|admin debug/);
  });
});

describe('v13.4.67 errors — toUserMessage edge cases', () => {
  it("string brute (pas Error)", () => {
    const r = errors.toUserMessage('network timeout');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it("null/undefined → retourne string non-vide", () => {
    const r1 = errors.toUserMessage(null);
    const r2 = errors.toUserMessage(undefined);
    expect(typeof r1).toBe('string');
    expect(typeof r2).toBe('string');
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
  });

  it("Error sans message → string générique", () => {
    const r = errors.toUserMessage(new Error());
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});
