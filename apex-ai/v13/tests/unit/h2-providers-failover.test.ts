/**
 * APEX v13.3.74 — Tests H2 (audit Apex v13.3.73 issue #240).
 *
 * "Anti-blocage IA: 2/4 providers seulement"
 * Cible : ≥ 5 providers actifs en chain failover.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  ALL_PROVIDERS_LOGICAL,
  MIN_HEALTHY_PROVIDERS,
  auditProviderChain,
} from '../../services/ai/ai-router.js';

describe('H2 — Failover chain providers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ALL_PROVIDERS_LOGICAL contient ≥ 5 providers logiques (cohère, deepseek, mistral, perplexity inclus)', () => {
    expect(ALL_PROVIDERS_LOGICAL.length).toBeGreaterThanOrEqual(5);
    expect(ALL_PROVIDERS_LOGICAL).toContain('anthropic');
    expect(ALL_PROVIDERS_LOGICAL).toContain('openai');
    expect(ALL_PROVIDERS_LOGICAL).toContain('groq');
    expect(ALL_PROVIDERS_LOGICAL).toContain('gemini');
    expect(ALL_PROVIDERS_LOGICAL).toContain('cohere');
    expect(ALL_PROVIDERS_LOGICAL).toContain('mistral');
    expect(ALL_PROVIDERS_LOGICAL).toContain('deepseek');
    /* MIN_HEALTHY_PROVIDERS = 5 → assure résilience contre 2-3 providers down */
    expect(MIN_HEALTHY_PROVIDERS).toBeGreaterThanOrEqual(5);
  });

  it('auditProviderChain() rapporte 0 healthy si aucune clé', () => {
    const audit = auditProviderChain();
    expect(audit.healthy).toBe(0);
    expect(audit.total).toBeGreaterThanOrEqual(5);
    expect(audit.meetsMinimum).toBe(false);
    expect(audit.unhealthy.length).toBeGreaterThanOrEqual(audit.total - 1);
  });

  it('auditProviderChain() rapporte healthy=N quand N clés configurées', () => {
    /* Configure 5 clés (anthropic + openai + groq + gemini-key + openrouter + openclaw) */
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-' + 'a'.repeat(40));
    localStorage.setItem('ax_openai_key', 'sk-' + 'b'.repeat(40));
    localStorage.setItem('ax_groq_key', 'gsk_' + 'c'.repeat(20));
    localStorage.setItem('ax_openrouter_key', 'sk-or-v1-' + 'd'.repeat(40));
    localStorage.setItem('ax_openclaw_key', 'oc_' + 'e'.repeat(20));

    const audit = auditProviderChain();
    /* 5 providers configurés → healthy ≥ 5 → meetsMinimum: true */
    expect(audit.healthy).toBeGreaterThanOrEqual(5);
    expect(audit.meetsMinimum).toBe(true);
    expect(audit.configured).toContain('anthropic');
    expect(audit.configured).toContain('openai');
  });
});
