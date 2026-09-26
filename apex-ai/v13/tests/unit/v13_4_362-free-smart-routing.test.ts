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

  it('question COMPLEXE (code) → Anthropic (qualité)', () => {
    const d = aiRoutingPolicy.decide('code');
    expect(d.primary).toBe('anthropic');
    /* mais le gratuit reste en fallback → 0 blocage */
    expect(d.fallback_chain.some((p) => ['qwen', 'gemini', 'groq', 'openrouter'].includes(p))).toBe(true);
  });

  it('reasoning / admin / creative = complexes → Anthropic', () => {
    for (const dom of ['reasoning', 'admin', 'creative'] as const) {
      expect(aiRoutingPolicy.decide(dom).primary).toBe('anthropic');
    }
  });

  it('detectDomain classe correctement simple vs complexe', () => {
    expect(aiRoutingPolicy.decide(aiRoutingPolicy.detectDomain('traduis ceci en anglais')).primary)
      .not.toBe('anthropic'); /* traduction → gratuit */
    expect(aiRoutingPolicy.decide(aiRoutingPolicy.detectDomain('debug ce code typescript')).primary)
      .toBe('anthropic'); /* code → Anthropic */
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

  it('mode auto (client non-admin) inchangé', () => {
    localStorage.setItem('apex_v13_uid', 'client_x');
    expect(aiRoutingPolicy.getMode()).toBe('auto');
  });
});
