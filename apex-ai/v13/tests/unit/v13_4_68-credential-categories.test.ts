/**
 * Test régression v13.4.68 — services/credential-categories.ts.
 *
 * Classification 3 niveaux : essential (au moins 1 provider IA) /
 * recommended (features Apex étendues) / optional (le reste).
 * Logique notif anti-spam : has_any_essential=true → 0 warn même si autres absents.
 */
import { describe, it, expect } from 'vitest';
import {
  ESSENTIAL_KEYS,
  RECOMMENDED_KEYS,
  getCriticality,
  computeStats,
} from '../../services/vault/credential-categories.js';

describe('v13.4.68 credential-categories — constants exposées', () => {
  it("ESSENTIAL_KEYS array non-vide ≤ 8", () => {
    expect(Array.isArray(ESSENTIAL_KEYS)).toBe(true);
    expect(ESSENTIAL_KEYS.length).toBeGreaterThan(0);
    expect(ESSENTIAL_KEYS.length).toBeLessThanOrEqual(8);
  });

  it("ESSENTIAL_KEYS contient anthropic + openai + gemini", () => {
    expect(ESSENTIAL_KEYS).toContain('ax_anthropic_key');
    expect(ESSENTIAL_KEYS).toContain('ax_openai_key');
    expect(ESSENTIAL_KEYS).toContain('ax_gemini_key');
  });

  it("RECOMMENDED_KEYS array non-vide", () => {
    expect(Array.isArray(RECOMMENDED_KEYS)).toBe(true);
    expect(RECOMMENDED_KEYS.length).toBeGreaterThan(0);
  });

  it("RECOMMENDED_KEYS contient github + telegram + stripe", () => {
    expect(RECOMMENDED_KEYS).toContain('ax_github_token');
    expect(RECOMMENDED_KEYS).toContain('ax_telegram_token');
    expect(RECOMMENDED_KEYS).toContain('ax_stripe_sk');
  });

  it("Aucune duplication entre ESSENTIAL et RECOMMENDED", () => {
    for (const e of ESSENTIAL_KEYS) {
      expect(RECOMMENDED_KEYS).not.toContain(e);
    }
  });
});

describe('v13.4.68 getCriticality classification 3 niveaux', () => {
  it("ax_anthropic_key → essential", () => {
    expect(getCriticality('ax_anthropic_key')).toBe('essential');
  });

  it("ax_openai_key → essential", () => {
    expect(getCriticality('ax_openai_key')).toBe('essential');
  });

  it("ax_github_token → recommended", () => {
    expect(getCriticality('ax_github_token')).toBe('recommended');
  });

  it("ax_stripe_sk → recommended", () => {
    expect(getCriticality('ax_stripe_sk')).toBe('recommended');
  });

  it("clé inconnue → optional (fallback)", () => {
    expect(getCriticality('ax_zzzz_unknown_xxx')).toBe('optional');
  });

  it("string vide → optional (defensive)", () => {
    expect(getCriticality('')).toBe('optional');
  });
});

describe('v13.4.68 computeStats — règle anti-spam has_any_essential', () => {
  it("0 essential présent → has_any_essential=false (WARN attendu)", () => {
    const s = computeStats([], ESSENTIAL_KEYS as unknown as string[]);
    expect(s.has_any_essential).toBe(false);
    expect(s.essential.present).toBe(0);
    expect(s.essential.total).toBe(ESSENTIAL_KEYS.length);
    expect(s.essential.missing.length).toBe(ESSENTIAL_KEYS.length);
  });

  it("1 essential présent (anthropic) → has_any_essential=true (PAS de WARN)", () => {
    const s = computeStats(['ax_anthropic_key'], ESSENTIAL_KEYS as unknown as string[]);
    expect(s.has_any_essential).toBe(true);
    expect(s.essential.present).toBe(1);
  });

  it("TOUS essential présents → has_any_essential=true + missing=[]", () => {
    const s = computeStats(
      ESSENTIAL_KEYS as unknown as string[],
      ESSENTIAL_KEYS as unknown as string[],
    );
    expect(s.has_any_essential).toBe(true);
    expect(s.essential.missing).toEqual([]);
  });
});

describe('v13.4.68 computeStats — structure 3 catégories', () => {
  it("retourne 4 propriétés (essential/recommended/optional/has_any_essential)", () => {
    const s = computeStats([], []);
    expect(s.essential).toBeDefined();
    expect(s.recommended).toBeDefined();
    expect(s.optional).toBeDefined();
    expect(typeof s.has_any_essential).toBe('boolean');
  });

  it("Chaque catégorie a present/total/missing structurés", () => {
    const s = computeStats([], []);
    expect(typeof s.essential.present).toBe('number');
    expect(typeof s.essential.total).toBe('number');
    expect(Array.isArray(s.essential.missing)).toBe(true);
    expect(typeof s.recommended.present).toBe('number');
    expect(typeof s.recommended.total).toBe('number');
    expect(Array.isArray(s.recommended.missing)).toBe(true);
    expect(typeof s.optional.present).toBe('number');
    expect(typeof s.optional.total_known).toBe('number');
    expect(Array.isArray(s.optional.missing_known)).toBe(true);
  });

  it("recommended : 0 présent → missing.length = total", () => {
    const s = computeStats([], []);
    expect(s.recommended.missing.length).toBe(RECOMMENDED_KEYS.length);
    expect(s.recommended.present).toBe(0);
  });

  it("recommended : 1 github_token présent → present=1", () => {
    const s = computeStats(['ax_github_token'], []);
    expect(s.recommended.present).toBe(1);
    expect(s.recommended.missing).not.toContain('ax_github_token');
  });

  it("optional : allKnownKeys vide → 0 optional", () => {
    const s = computeStats([], []);
    expect(s.optional.total_known).toBe(0);
    expect(s.optional.missing_known).toEqual([]);
  });

  it("optional : key custom dans allKnownKeys (non essential/recommended) → comptée optional", () => {
    const s = computeStats(['ax_custom_key_xyz'], ['ax_custom_key_xyz']);
    expect(s.optional.total_known).toBe(1);
    expect(s.optional.present).toBe(1);
  });
});
