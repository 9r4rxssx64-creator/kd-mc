/**
 * Test régression v13.4.37 — economy-mode integration (ai-router + bootstrap).
 *
 * Vérifie que la résolution model + max_tokens utilise économie quand actif.
 * Test indirect via économie singleton (impossible de mocker fetch ai-router
 * sans gros setup, donc on teste les helpers utilisés par ai-router).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { economyMode } from '../../services/core-svc/economy-mode.js';

describe('v13.4.37 economy-mode integration ai-router pattern', () => {
  beforeEach(() => {
    economyMode.setActive(false);
  });

  it("ai-router pattern : resolveModel(defaultModel) sans économie → default", () => {
    /* Réplique exacte du pattern ai-router.ts ligne 180 */
    const defaultModel = 'claude-sonnet-4-6';
    const model = economyMode.resolveModel(defaultModel);
    expect(model).toBe(defaultModel);
  });

  it("ai-router pattern : économie ACTIVE → modèle haiku économique", () => {
    economyMode.setActive(true);
    const defaultModel = 'claude-sonnet-4-6';
    const model = economyMode.resolveModel(defaultModel);
    expect(model).toContain('haiku');
    expect(model).not.toBe(defaultModel);
  });

  it("ai-router pattern : max_tokens default sans économie", () => {
    const defaultMaxTokens = 4096;
    const max = economyMode.resolveMaxTokens(defaultMaxTokens);
    expect(max).toBe(defaultMaxTokens);
  });

  it("ai-router pattern : max_tokens divisé en économie", () => {
    economyMode.setActive(true);
    const defaultMaxTokens = 4096;
    const max = economyMode.resolveMaxTokens(defaultMaxTokens);
    expect(max).toBe(2048); /* factor 0.5 */
  });

  it("bypass temporaire → ai-router utilise defaults (pas économie)", () => {
    economyMode.setActive(true);
    expect(economyMode.resolveModel('claude-sonnet-4-6')).toContain('haiku');
    economyMode.bypassFor('long_form_writing');
    expect(economyMode.resolveModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(economyMode.resolveMaxTokens(4096)).toBe(4096);
    economyMode.restoreNow();
  });
});

describe('v13.4.37 economy-mode init flow bootstrap', () => {
  beforeEach(() => {
    localStorage.removeItem('apex_v13_economy_mode');
    economyMode.setActive(false);
  });

  it("init() sans localStorage → default inactive", () => {
    economyMode.init();
    expect(economyMode.isActive()).toBe(false);
  });

  it("init() avec localStorage active=true → restaure état", () => {
    localStorage.setItem('apex_v13_economy_mode', JSON.stringify({ active: true }));
    economyMode.init();
    expect(economyMode.isActive()).toBe(true);
  });

  it("init() avec localStorage active=false → reste inactive", () => {
    localStorage.setItem('apex_v13_economy_mode', JSON.stringify({ active: false }));
    economyMode.init();
    expect(economyMode.isActive()).toBe(false);
  });

  it("init() avec JSON corrompu → fallback inactive (no crash)", () => {
    localStorage.setItem('apex_v13_economy_mode', 'NOT_JSON');
    expect(() => economyMode.init()).not.toThrow();
    expect(economyMode.isActive()).toBe(false);
  });

  it("init() restaure modelOverride et factors automatiquement", () => {
    localStorage.setItem('apex_v13_economy_mode', JSON.stringify({ active: true }));
    economyMode.init();
    /* applyModelOverride doit être appelé en interne */
    expect(economyMode.resolveModel('claude-sonnet-4-6')).toContain('haiku');
    expect(economyMode.resolveMaxTokens(4096)).toBe(2048);
  });

  it("tempDisabled NON persisté (reset au boot)", () => {
    /* Setup : activer + bypass, persister, init */
    economyMode.setActive(true);
    economyMode.bypassFor('image_gen');
    /* Bypass actif → isActive() false */
    expect(economyMode.isActive()).toBe(false);
    /* Simule reload : init re-lit localStorage qui n'a PAS tempDisabled */
    economyMode.init();
    /* Au reload, économie active mais tempDisabled reset → isActive vrai */
    expect(economyMode.isActive()).toBe(true);
  });
});
