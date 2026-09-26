/**
 * Tests tokens-dashboard.ts (path 100/100 — visuel conso tokens demandé Kevin).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tokensDashboard } from '../../services/observability/tokens-dashboard.js';

describe('Tokens Dashboard (visuel conso API Kevin)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('record + getStats', () => {
    it('record() ajoute usage par provider + cumule', () => {
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_sonnet');
      tokensDashboard.record('anthropic', 2000, 1000, 'anthropic_sonnet');
      const stats = tokensDashboard.getStats('anthropic');
      expect(stats.length).toBe(1);
      expect(stats[0]?.input_tokens).toBe(3000);
      expect(stats[0]?.output_tokens).toBe(1500);
      expect(stats[0]?.requests).toBe(2);
      /* Cost ~ 3000/1000 * 0.003 + 1500/1000 * 0.015 = 0.009 + 0.0225 = 0.0315 */
      expect(stats[0]?.cost_usd).toBeCloseTo(0.0315, 3);
    });

    it('record() multi-providers séparés', () => {
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_sonnet');
      tokensDashboard.record('openai', 1000, 500, 'openai_gpt4o');
      tokensDashboard.record('groq', 5000, 2000, 'groq_llama');
      const all = tokensDashboard.getStats();
      expect(all.length).toBe(3);
    });

    it('getStats trie par cost desc', () => {
      /* Groq Llama cheap : 150k tokens × ($0.59 + $0.79)/1k = $0.20 */
      tokensDashboard.record('groq', 100000, 50000, 'groq_llama');
      /* Anthropic Opus expensive : 1.5k tokens × ($15 + $75)/1k = $0.0525 */
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_opus');
      const all = tokensDashboard.getStats();
      /* Tri par cost desc : groq cumulé (gros volume) > anthropic opus (petit volume) */
      expect(all[0]?.cost_usd).toBeGreaterThanOrEqual(all[1]?.cost_usd ?? 0);
    });
  });

  describe('getTotal', () => {
    it('cumule total tous providers', () => {
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_sonnet');
      tokensDashboard.record('openai', 2000, 1000, 'openai_gpt4o');
      const total = tokensDashboard.getTotal();
      expect(total.input_tokens).toBe(3000);
      expect(total.output_tokens).toBe(1500);
      expect(total.requests).toBe(2);
      expect(total.cost_usd).toBeGreaterThan(0);
    });

    it('total vide retourne 0/0/0', () => {
      const total = tokensDashboard.getTotal();
      expect(total.cost_usd).toBe(0);
      expect(total.requests).toBe(0);
    });
  });

  describe('formatForUI', () => {
    it('format EUR + tokens + by_provider avec pct', () => {
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_sonnet');
      tokensDashboard.record('openai', 100, 50, 'openai_gpt4o_mini');
      const fmt = tokensDashboard.formatForUI();
      expect(fmt.total_eur).toMatch(/€$/);
      expect(fmt.total_tokens).toMatch(/[\d , ]+/); /* nombre formaté FR */
      expect(fmt.by_provider.length).toBe(2);
      expect(fmt.by_provider[0]?.pct).toBeGreaterThanOrEqual(0);
      expect(fmt.by_provider[0]?.pct).toBeLessThanOrEqual(100);
    });
  });

  describe('checkAlert seuil', () => {
    it('triggered=false si total < threshold', () => {
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_sonnet');
      const a = tokensDashboard.checkAlert(10);
      expect(a.triggered).toBe(false);
      expect(a.threshold).toBe(10);
    });

    it('triggered=true si total >= threshold', () => {
      /* Force gros usage pour dépasser */
      tokensDashboard.record('anthropic', 100000, 50000, 'anthropic_opus');
      const a = tokensDashboard.checkAlert(0.5);
      expect(a.triggered).toBe(true);
      expect(a.total_usd).toBeGreaterThan(0.5);
    });
  });

  describe('reset', () => {
    it('reset(provider) → seul ce provider effacé', () => {
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_sonnet');
      tokensDashboard.record('openai', 1000, 500, 'openai_gpt4o');
      tokensDashboard.reset('anthropic');
      const all = tokensDashboard.getStats();
      expect(all.length).toBe(1);
      expect(all[0]?.provider).toBe('openai');
    });

    it('reset() sans param → tout effacé', () => {
      tokensDashboard.record('anthropic', 1000, 500, 'anthropic_sonnet');
      tokensDashboard.record('openai', 1000, 500, 'openai_gpt4o');
      tokensDashboard.reset();
      expect(tokensDashboard.getStats().length).toBe(0);
    });
  });

  describe('getPricing public', () => {
    it('retourne pricing tiers pour modal admin', () => {
      const pricing = tokensDashboard.getPricing();
      expect(pricing.anthropic_sonnet).toBeDefined();
      expect(pricing.anthropic_sonnet?.input_per_1k).toBe(0.003);
      expect(pricing.openai_gpt4o_mini?.input_per_1k).toBe(0.00015);
    });
  });
});
