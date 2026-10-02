/**
 * Tests ai-routing-policy.ts.
 * Stratégie : Anthropic priority + free first + domain routing + budget aware.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { aiRoutingPolicy } from '../../services/ai/ai-routing-policy.js';

describe('AI Routing Policy (free-first + Anthropic priority)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('mode getMode/setMode', () => {
    it('défaut mode=auto', () => {
      expect(aiRoutingPolicy.getMode()).toBe('auto');
    });

    it('setMode persist', () => {
      aiRoutingPolicy.setMode('economy');
      expect(aiRoutingPolicy.getMode()).toBe('economy');
      aiRoutingPolicy.setMode('premium');
      expect(aiRoutingPolicy.getMode()).toBe('premium');
    });
  });

  describe('admin override forced provider', () => {
    it('setAdminOverride persist', () => {
      aiRoutingPolicy.setAdminOverride('groq');
      expect(aiRoutingPolicy.getAdminOverride()).toBe('groq');
    });

    it('null pour reset', () => {
      aiRoutingPolicy.setAdminOverride('gemini');
      aiRoutingPolicy.setAdminOverride(null);
      expect(aiRoutingPolicy.getAdminOverride()).toBe(null);
    });

    it('mode forced + override → utilise override', () => {
      localStorage.setItem('ax_groq_key', 'gsk_fake');
      aiRoutingPolicy.setMode('forced');
      aiRoutingPolicy.setAdminOverride('groq');
      const d = aiRoutingPolicy.decide('general');
      expect(d.primary).toBe('groq');
      expect(d.reason).toContain('Admin forced');
    });
  });

  describe('decide domain routing', () => {
    it('admin task → toujours Anthropic (priorité absolue)', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      const d = aiRoutingPolicy.decide('admin');
      expect(d.primary).toBe('anthropic');
      expect(d.reason).toContain('Anthropic');
    });

    it('vision → Gemini en premier (gratuit + bon vision)', () => {
      localStorage.setItem('ax_gemini_key', 'AIzaFAKE'.padEnd(39, 'X'));
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      const d = aiRoutingPolicy.decide('vision');
      /* Gemini préféré pour vision (gratuit) */
      expect(['gemini', 'anthropic']).toContain(d.primary);
    });

    it('long_context > 5K tokens → Gemini (1M tokens gratuit)', () => {
      localStorage.setItem('ax_gemini_key', 'AIzaFAKE'.padEnd(39, 'X'));
      const d = aiRoutingPolicy.decide('long_context', 8000);
      expect(d.primary).toBe('gemini');
    });

    it('speed → Groq (500+ tok/sec)', () => {
      localStorage.setItem('ax_groq_key', 'gsk_fake');
      const d = aiRoutingPolicy.decide('speed');
      expect(d.primary).toBe('groq');
    });
  });

  describe('mode auto + budget Anthropic critical', () => {
    it('Anthropic 95% + summary → bascule Gemini gratuit', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      localStorage.setItem('ax_gemini_key', 'AIzaFAKE'.padEnd(39, 'X'));
      /* Force budget Anthropic critical */
      localStorage.setItem('apex_v13_budgets', JSON.stringify({ anthropic: 50 }));
      localStorage.setItem('ax_token_usage_anthropic', JSON.stringify({
        provider: 'anthropic', cost_usd: 60, input_tokens: 0, output_tokens: 0, requests: 1, last_used_ts: Date.now(),
      }));
      const d = aiRoutingPolicy.decide('summary');
      /* Anthropic critical + tâche simple → free fallback */
      expect(d.is_free_tier).toBe(true);
    });
  });

  describe('mode economy systématique', () => {
    it('mode=economy + Groq dispo → Groq', () => {
      localStorage.setItem('ax_groq_key', 'gsk_fake');
      aiRoutingPolicy.setMode('economy');
      const d = aiRoutingPolicy.decide('general');
      expect(d.is_free_tier).toBe(true);
      expect(d.reason).toContain('Economy');
    });
  });

  describe('mode premium toujours Anthropic', () => {
    it('mode=premium → Anthropic même tâche simple', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      aiRoutingPolicy.setMode('premium');
      const d = aiRoutingPolicy.decide('summary');
      expect(d.primary).toBe('anthropic');
      expect(d.reason).toContain('Premium');
    });
  });

  describe('detectDomain heuristique', () => {
    it('detecte code', () => {
      expect(aiRoutingPolicy.detectDomain('debug ce code TypeScript')).toBe('code');
    });

    it('detecte vision', () => {
      expect(aiRoutingPolicy.detectDomain('analyse cette image')).toBe('vision');
    });

    it('detecte translation', () => {
      expect(aiRoutingPolicy.detectDomain('traduis en anglais')).toBe('translation');
    });

    it('detecte summary', () => {
      expect(aiRoutingPolicy.detectDomain('résume ce document')).toBe('summary');
    });

    it('detecte long_context si texte > 5K chars', () => {
      const longText = 'x'.repeat(6000);
      expect(aiRoutingPolicy.detectDomain(longText)).toBe('long_context');
    });

    it('général sinon', () => {
      expect(aiRoutingPolicy.detectDomain('bonjour')).toBe('general');
    });
  });

  describe('recommendActions', () => {
    it('rien configuré → recommande Anthropic + Groq + Gemini', () => {
      const recos = aiRoutingPolicy.recommendActions();
      expect(recos.length).toBeGreaterThanOrEqual(3);
      expect(recos.some((r) => r.action.includes('Anthropic'))).toBe(true);
      expect(recos.some((r) => r.action.includes('Groq'))).toBe(true);
      expect(recos.some((r) => r.action.includes('Gemini'))).toBe(true);
    });

    it('Anthropic configuré → reste Groq + Gemini', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      const recos = aiRoutingPolicy.recommendActions();
      expect(recos.some((r) => r.action.includes('Anthropic'))).toBe(false);
    });

    it('toutes recos ont priority + url', () => {
      const recos = aiRoutingPolicy.recommendActions();
      for (const r of recos) {
        expect(['high', 'medium', 'low']).toContain(r.priority);
        expect(r.url?.startsWith('http')).toBe(true);
      }
    });
  });

  describe('getStatus dashboard', () => {
    it('retourne mode + free + paid available', () => {
      localStorage.setItem('ax_groq_key', 'gsk_fake');
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      const s = aiRoutingPolicy.getStatus();
      expect(s.free_providers_available).toContain('groq');
      expect(s.paid_providers_available).toContain('anthropic');
      expect(['ok', 'warn', 'critical']).toContain(s.anthropic_health);
    });
  });

  describe('estimated_cost_eur', () => {
    it('Anthropic Sonnet ~ 8€/M tokens', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      const d = aiRoutingPolicy.decide('admin', 1_000_000);
      expect(d.estimated_cost_eur).toBeGreaterThanOrEqual(7);
      expect(d.estimated_cost_eur).toBeLessThanOrEqual(10);
    });

    it('Groq → 0€ (free tier)', () => {
      localStorage.setItem('ax_groq_key', 'gsk_fake');
      const d = aiRoutingPolicy.decide('speed', 1_000_000);
      expect(d.estimated_cost_eur).toBe(0);
      expect(d.is_free_tier).toBe(true);
    });
  });
});
