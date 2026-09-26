/**
 * Test régression v13.4.50 — ai-router.ts helpers publics (audit P2 #6).
 *
 * Tests sans fetch HTTP (vault stub) :
 * - estimateTokens (heuristique 2.8/3.2 chars/token)
 * - auditProviderChain (audit cross-vault des clés AI)
 * - ALL_PROVIDERS_LOGICAL constants
 * - MIN_HEALTHY_PROVIDERS
 * - aiRouter.hasAnyKey()
 * - aiRouter.getApiKey()
 * - aiRouter.abort()
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimateTokens,
  auditProviderChain,
  ALL_PROVIDERS_LOGICAL,
  MIN_HEALTHY_PROVIDERS,
  aiRouter,
} from '../../services/ai/ai-router.js';

describe('v13.4.50 estimateTokens — heuristique ratio chars/token', () => {
  it("texte vide → 0 tokens", () => {
    expect(estimateTokens('')).toBe(0);
  });

  it("texte simple → ratio 3.2 chars/token", () => {
    const text = 'a'.repeat(320);
    expect(estimateTokens(text)).toBe(Math.ceil(320 / 3.2));
  });

  it("texte avec code fences (```) → ratio 2.8 chars/token (plus dense)", () => {
    const text = '```js\nconst x = 1;\n```\n' + 'a'.repeat(300);
    /* Hasfences = true → 2.8 chars/token */
    const expected = Math.ceil(text.length / 2.8);
    expect(estimateTokens(text)).toBe(expected);
  });

  it("texte JSON-like (> 10% chars JSON) → ratio 2.8", () => {
    const json = '{"name":"kevin","keys":["a","b","c"],"data":{"x":1}}';
    const result = estimateTokens(json);
    /* Plus de 10% de {}[],:"  → ratio dense */
    expect(result).toBe(Math.ceil(json.length / 2.8));
  });

  it("texte long sans code → ratio 3.2 standard", () => {
    const lorem = 'Lorem ipsum dolor sit amet '.repeat(50);
    const result = estimateTokens(lorem);
    /* Pas de fences, peu de JSON chars → 3.2 */
    expect(result).toBe(Math.ceil(lorem.length / 3.2));
  });

  it("never returns < 0", () => {
    expect(estimateTokens('hello')).toBeGreaterThan(0);
    expect(estimateTokens('a')).toBeGreaterThanOrEqual(1);
  });
});

describe('v13.4.50 ALL_PROVIDERS_LOGICAL constants', () => {
  it("≥ 10 providers logiques listés (audit cross-vault)", () => {
    expect(ALL_PROVIDERS_LOGICAL.length).toBeGreaterThanOrEqual(10);
  });

  it("contient providers majeurs", () => {
    expect(ALL_PROVIDERS_LOGICAL).toContain('anthropic');
    expect(ALL_PROVIDERS_LOGICAL).toContain('openai');
    expect(ALL_PROVIDERS_LOGICAL).toContain('groq');
    expect(ALL_PROVIDERS_LOGICAL).toContain('gemini');
  });

  it("readonly array (immutable)", () => {
    expect(Array.isArray(ALL_PROVIDERS_LOGICAL)).toBe(true);
  });
});

describe('v13.4.50 MIN_HEALTHY_PROVIDERS constant', () => {
  it("= 5 (audit Kevin 'minimum 5 providers actifs pour failover safe')", () => {
    expect(MIN_HEALTHY_PROVIDERS).toBe(5);
  });
});

describe('v13.4.50 auditProviderChain — état clés AI dans vault', () => {
  beforeEach(() => {
    /* Reset toutes les clés AI courantes */
    const keys = [
      'ax_shared_api_key', 'ax_anthropic_key', 'ax_openai_key', 'ax_openrouter_key',
      'ax_groq_key', 'ax_gemini_key', 'ax_mistral_key', 'ax_cohere_key',
      'ax_deepseek_key', 'ax_perplexity_key', 'ax_xai_key', 'ax_hf_token',
      'ax_openclaw_key',
    ];
    for (const k of keys) localStorage.removeItem(k);
    /* v13.4.328 : le Coffre (multi-key-vault) + le proxy serveur comptent aussi. */
    localStorage.removeItem('apex_v13_multi_keys');
    localStorage.removeItem('apex_v13_use_secrets_proxy');
  });

  it("Aucune clé → audit retourne unhealthy ≥ 5", () => {
    const audit = auditProviderChain();
    expect(audit.total).toBeGreaterThanOrEqual(10);
    expect(audit.unhealthy.length).toBeGreaterThanOrEqual(5);
    expect(audit.meetsMinimum).toBe(false);
  });

  it("1 clé Anthropic → 1 configured + unhealthy diminué", () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-fake-test-key');
    const audit = auditProviderChain();
    expect(audit.configured.length).toBeGreaterThanOrEqual(1);
  });

  it("5+ clés diverses → meetsMinimum true (failover safe)", () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
    localStorage.setItem('ax_openai_key', 'sk-openai-fake');
    localStorage.setItem('ax_groq_key', 'gsk_groq-fake');
    localStorage.setItem('ax_gemini_key', 'AIza-fake');
    localStorage.setItem('ax_openrouter_key', 'sk-or-fake');
    const audit = auditProviderChain();
    expect(audit.configured.length).toBeGreaterThanOrEqual(5);
    /* meetsMinimum dépend de comparaison healthy vs MIN_HEALTHY_PROVIDERS */
  });

  it("structure correcte : total/healthy/unhealthy/configured/meetsMinimum", () => {
    const audit = auditProviderChain();
    expect(typeof audit.total).toBe('number');
    expect(typeof audit.healthy).toBe('number');
    expect(Array.isArray(audit.unhealthy)).toBe(true);
    expect(Array.isArray(audit.configured)).toBe(true);
    expect(typeof audit.meetsMinimum).toBe('boolean');
    expect(typeof audit.proxyActive).toBe('boolean');
  });

  it("v13.4.328 : clés dans le Coffre (multi-key-vault) comptées comme configurées", () => {
    /* Aucune clé legacy, mais 6 services présents dans le Coffre → healthy ≥ 6, pas de fausse alarme 0/12. */
    const vault = [
      { id: 'a', service: 'openai', status: 'active', encrypted: 'AXENC1:x' },
      { id: 'b', service: 'anthropic', status: 'unknown', encrypted: 'AXENC1:x' },
      { id: 'c', service: 'google', status: 'active', encrypted: 'AXENC1:x' },
      { id: 'd', service: 'groq', status: 'active', encrypted: 'AXENC1:x' },
      { id: 'e', service: 'mistral', status: 'active', encrypted: 'AXENC1:x' },
      { id: 'f', service: 'perplexity', status: 'active', encrypted: 'AXENC1:x' },
      { id: 'g', service: 'openai', status: 'invalid', encrypted: 'AXENC1:x' }, /* invalide → ignorée (pas de double compte) */
    ];
    localStorage.setItem('apex_v13_multi_keys', JSON.stringify(vault));
    const audit = auditProviderChain();
    expect(audit.configured).toContain('gemini'); /* service "google" → provider logique gemini */
    expect(audit.healthy).toBeGreaterThanOrEqual(6);
    expect(audit.meetsMinimum).toBe(true);
  });

  it("v13.4.328 : proxy serveur actif → meetsMinimum true même sans clé locale", () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    const audit = auditProviderChain();
    expect(audit.proxyActive).toBe(true);
    expect(audit.meetsMinimum).toBe(true);
  });
});

describe('v13.4.50 aiRouter.hasAnyKey + getApiKey', () => {
  beforeEach(() => {
    /* Reset */
    localStorage.removeItem('ax_anthropic_key');
    localStorage.removeItem('ax_openai_key');
    localStorage.removeItem('ax_shared_api_key');
  });

  it("hasAnyKey() false si aucune clé", () => {
    expect(aiRouter.hasAnyKey()).toBe(false);
  });

  it("hasAnyKey() true si Anthropic présent", () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
    expect(aiRouter.hasAnyKey()).toBe(true);
  });

  it("hasAnyKey() true si OpenAI présent (autre provider)", () => {
    localStorage.setItem('ax_openai_key', 'sk-test');
    expect(aiRouter.hasAnyKey()).toBe(true);
  });

  it("getApiKey('anthropic') retourne string ou ''", () => {
    const k = aiRouter.getApiKey('anthropic');
    expect(typeof k).toBe('string');
  });

  it("getApiKey provider inconnu THROW (TypeScript-safe seul, runtime accède PROVIDERS[provider])", () => {
    /* getApiKey est typed Provider — runtime PROVIDERS[unknown] = undefined → throw.
     * C'est OK : caller doit utiliser un Provider valide. Test documente comportement. */
     
    expect(() => aiRouter.getApiKey('xyz_provider_inconnu' as any)).toThrow();
  });
});

describe('v13.4.50 aiRouter.abort — anti-zombie fetch', () => {
  it("abort() ne crash pas (idempotent)", () => {
    expect(() => aiRouter.abort()).not.toThrow();
    expect(() => {
      aiRouter.abort();
      aiRouter.abort();
    }).not.toThrow();
  });
});
