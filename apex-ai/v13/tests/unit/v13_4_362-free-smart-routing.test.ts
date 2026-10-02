/**
 * v13.4.362 — Kevin « Privilégie les IA gratuites suivant les questions ».
 *
 * Mode 'free-smart' (défaut admin) : questions SIMPLES → IA gratuite (Gemini/Groq),
 * questions COMPLEXES (code/reasoning/admin/creative) → Anthropic. Anthropic reste
 * TOUJOURS dans le fallback → une panne Anthropic ne bloque plus rien.
 *
 * hasKey est proxy-aware : le proxy Cloudflare (défaut ON) rend Gemini/Groq dispo
 * côté serveur, donc free-smart route réellement vers le gratuit même sans clé locale.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { aiRoutingPolicy } from '../../services/ai/ai-routing-policy.js';

describe('v13.4.362 — free-smart routing (IA gratuites selon la question)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Admin Kevin — le défaut doit devenir free-smart (proxy actif par défaut). */
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
  });

  it('défaut admin = free-smart (plus premium-always)', () => {
    expect(aiRoutingPolicy.getMode()).toBe('free-smart');
  });

  it('question SIMPLE (traduction) → IA GRATUITE (Gemini/Groq/OpenRouter)', () => {
    const d = aiRoutingPolicy.decide('translation');
    expect(['qwen', 'gemini', 'groq', 'openrouter']).toContain(d.primary); /* v13.4.366 : qwen = gratuit en tête */
    expect(d.is_free_tier).toBe(true);
    /* Anthropic reste joignable en secours */
    expect([d.primary, ...d.fallback_chain]).toContain('anthropic');
  });

  it('résumé / speed / general / vision = simples → gratuit', () => {
    for (const dom of ['summary', 'speed', 'general', 'vision'] as const) {
      const d = aiRoutingPolicy.decide(dom);
      expect(['qwen', 'gemini', 'groq', 'openrouter']).toContain(d.primary); /* v13.4.366 : qwen = gratuit en tête */
    }
  });

  it('question COMPLEXE (code) → le meilleur GRATUIT (Qwen coder), Anthropic en secours (tout gratuit, partout — Kevin 2.10)', () => {
    const d = aiRoutingPolicy.decide('code');
    expect(d.primary).toBe('qwen');
    expect(d.is_free_tier).toBe(true);
    /* Anthropic reste en secours → 0 blocage, mais jamais en tête */
    expect(d.fallback_chain).toContain('anthropic');
    expect(d.fallback_chain.indexOf('anthropic')).toBeGreaterThan(d.fallback_chain.indexOf('groq'));
  });

  it('reasoning / admin / creative = complexes → quand même un GRATUIT en tête, Anthropic derrière les gratuits', () => {
    for (const dom of ['reasoning', 'admin', 'creative'] as const) {
      const d = aiRoutingPolicy.decide(dom);
      expect(['qwen', 'groq', 'cerebras', 'gemini', 'openrouter', 'cohere']).toContain(d.primary);
      expect(d.fallback_chain).toContain('anthropic');
    }
  });

  it('detectDomain classe correctement simple vs complexe (les deux partent en gratuit)', () => {
    expect(aiRoutingPolicy.detectDomain('traduis ceci en anglais')).toBe('translation');
    expect(aiRoutingPolicy.detectDomain('debug ce code typescript')).toBe('code');
    expect(aiRoutingPolicy.decide('code').primary).not.toBe('anthropic');
  });

  it('hasKey proxy-aware : Gemini/Groq dispo via proxy même sans clé locale', () => {
    /* Aucune clé locale ax_*_key posée, mais proxy ON par défaut → gratuit routable. */
    const d = aiRoutingPolicy.decide('general');
    expect(['qwen', 'gemini', 'groq', 'openrouter']).toContain(d.primary); /* v13.4.366 : qwen = gratuit en tête */
  });

  it('proxy OFF + aucune clé locale gratuite → retombe sur Anthropic (pas de crash)', () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'false');
    /* plus aucun gratuit dispo → free-smart bascule sur le primaire du domaine */
    const d = aiRoutingPolicy.decide('translation');
    expect(d.primary).toBe('anthropic');
  });

  it('choix EXPLICITE premium (⚡) reste respecté → Anthropic toujours (leçon #124)', () => {
    aiRoutingPolicy.setMode('premium', true);
    expect(aiRoutingPolicy.getMode()).toBe('premium');
    expect(aiRoutingPolicy.decide('translation').primary).toBe('anthropic');
  });

  it('client non-admin : free-smart aussi (tout gratuit, partout — Kevin 2.10) ; « auto » reste un choix explicite', () => {
    localStorage.setItem('apex_v13_uid', 'client_x');
    expect(aiRoutingPolicy.getMode()).toBe('free-smart');
    aiRoutingPolicy.setMode('auto', true);
    expect(aiRoutingPolicy.getMode()).toBe('auto');
  });
});
