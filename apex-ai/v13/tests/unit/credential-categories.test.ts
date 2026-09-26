/**
 * APEX v13 — Tests credential-categories.ts
 *
 * Coverage: getCriticality(), computeStats(), ESSENTIAL_KEYS, RECOMMENDED_KEYS.
 * Cible Kevin "100/100 réel chaque axe" — services orphelins non testés.
 */
import { describe, it, expect } from 'vitest';

import {
  ESSENTIAL_KEYS,
  RECOMMENDED_KEYS,
  getCriticality,
  computeStats,
} from '../../services/vault/credential-categories.js';

describe('credential-categories — constants', () => {
  it('ESSENTIAL_KEYS contient au moins 1 provider IA', () => {
    expect(ESSENTIAL_KEYS.length).toBeGreaterThan(0);
    expect(ESSENTIAL_KEYS).toContain('ax_anthropic_key');
  });

  it('ESSENTIAL_KEYS reste ≤ 8 entrées (règle Kevin)', () => {
    expect(ESSENTIAL_KEYS.length).toBeLessThanOrEqual(8);
  });

  it('RECOMMENDED_KEYS contient services clés (GitHub, push, search)', () => {
    expect(RECOMMENDED_KEYS).toContain('ax_github_token');
    expect(RECOMMENDED_KEYS).toContain('ax_brave_key');
  });

  it('ESSENTIAL et RECOMMENDED sont disjoints', () => {
    const overlap = ESSENTIAL_KEYS.filter((k) => RECOMMENDED_KEYS.includes(k));
    expect(overlap).toHaveLength(0);
  });
});

describe('credential-categories — getCriticality()', () => {
  it('reconnaît une clé ESSENTIAL (Anthropic)', () => {
    expect(getCriticality('ax_anthropic_key')).toBe('essential');
  });

  it('reconnaît une clé ESSENTIAL (Gemini alias)', () => {
    expect(getCriticality('ax_google_key')).toBe('essential');
    expect(getCriticality('ax_gemini_key')).toBe('essential');
  });

  it('reconnaît une clé RECOMMENDED (GitHub)', () => {
    expect(getCriticality('ax_github_token')).toBe('recommended');
  });

  it('reconnaît une clé RECOMMENDED (Stripe)', () => {
    expect(getCriticality('ax_stripe_sk')).toBe('recommended');
  });

  it('défaut OPTIONAL pour clé inconnue', () => {
    expect(getCriticality('ax_spotify_key')).toBe('optional');
    expect(getCriticality('totally_random_key')).toBe('optional');
    expect(getCriticality('')).toBe('optional');
  });
});

describe('credential-categories — computeStats()', () => {
  it('aucune clé présente → has_any_essential=false', () => {
    const stats = computeStats([], ['ax_anthropic_key', 'ax_github_token']);
    expect(stats.has_any_essential).toBe(false);
    expect(stats.essential.present).toBe(0);
    expect(stats.essential.missing.length).toBe(ESSENTIAL_KEYS.length);
  });

  it('1 essential présent → has_any_essential=true (règle "AU MOINS 1 IA")', () => {
    const stats = computeStats(['ax_anthropic_key'], ['ax_anthropic_key']);
    expect(stats.has_any_essential).toBe(true);
    expect(stats.essential.present).toBe(1);
  });

  it('plusieurs essential présents → comptage correct', () => {
    const stats = computeStats(
      ['ax_anthropic_key', 'ax_openai_key', 'ax_groq_key'],
      ESSENTIAL_KEYS as string[],
    );
    expect(stats.essential.present).toBe(3);
    expect(stats.essential.missing.length).toBe(ESSENTIAL_KEYS.length - 3);
  });

  it('clés RECOMMENDED comptées séparément', () => {
    const stats = computeStats(
      ['ax_github_token', 'ax_brave_key'],
      ['ax_github_token', 'ax_brave_key', 'ax_anthropic_key'],
    );
    expect(stats.recommended.present).toBe(2);
    expect(stats.essential.present).toBe(0);
  });

  it('clés OPTIONAL = allKnown sans essential/recommended', () => {
    const stats = computeStats(
      ['ax_spotify_key'],
      ['ax_spotify_key', 'ax_notion_key', 'ax_anthropic_key', 'ax_github_token'],
    );
    expect(stats.optional.total_known).toBe(2); /* spotify + notion */
    expect(stats.optional.present).toBe(1); /* spotify present */
    expect(stats.optional.missing_known).toContain('ax_notion_key');
  });

  it('total des missing essential = total - present', () => {
    const stats = computeStats(['ax_anthropic_key'], ESSENTIAL_KEYS as string[]);
    expect(stats.essential.missing.length).toBe(ESSENTIAL_KEYS.length - 1);
    expect(stats.essential.missing).not.toContain('ax_anthropic_key');
  });

  it('clé inconnue dans presentKeys ne casse pas le compteur', () => {
    const stats = computeStats(
      ['ax_anthropic_key', 'ax_random_unknown'],
      ESSENTIAL_KEYS as string[],
    );
    expect(stats.essential.present).toBe(1);
    expect(stats.has_any_essential).toBe(true);
  });

  it('allKnownKeys vide → tout vide sauf essential/recommended', () => {
    const stats = computeStats([], []);
    expect(stats.optional.total_known).toBe(0);
    expect(stats.optional.present).toBe(0);
    expect(stats.optional.missing_known).toHaveLength(0);
  });

  it('toutes les essential présentes → missing array vide', () => {
    const stats = computeStats(ESSENTIAL_KEYS as string[], ESSENTIAL_KEYS as string[]);
    expect(stats.essential.missing).toHaveLength(0);
    expect(stats.essential.present).toBe(ESSENTIAL_KEYS.length);
    expect(stats.has_any_essential).toBe(true);
  });
});
