/**
 * APEX v13 — Dashboard consommation tokens IA (visuel admin Kevin).
 *
 * Demande Kevin (2026-05-03) :
 * "Visuel pour ma consommation de token, des API, la gestion des mots de passe,
 * d'aller chercher liens qui manquent, la reconnaissance, toutes ces choses."
 *
 * Track tokens utilisés par provider + estimation coût + alerte si > seuil.
 * Données stockées localStorage cumulatives (ax_token_usage_<provider>).
 *
 * Pricing officiel (1000 tokens) :
 * - Anthropic Sonnet 4.6 : $3 input / $15 output
 * - Anthropic Opus 4.7   : $15 input / $75 output
 * - Anthropic Haiku 4.5  : $0.80 input / $4 output
 * - OpenAI GPT-4o        : $2.50 input / $10 output
 * - OpenAI GPT-4o-mini   : $0.15 input / $0.60 output
 * - Groq Llama 3.3 70B   : $0.59 input / $0.79 output (très cheap)
 * - Gemini 2.5 Pro       : $1.25 input / $10 output (à 200k contexte)
 * - DeepSeek v3          : $0.14 input / $0.28 output
 *
 * Anti-pattern Kevin : pas de "fake" estimation — uniquement données réelles via response headers.
 */

export interface TokenUsage {
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  requests: number;
  last_request_ts: number;
}

interface PricingTier {
  input_per_1k: number;
  output_per_1k: number;
}

const PRICING: Record<string, PricingTier> = {
  anthropic_sonnet: { input_per_1k: 0.003, output_per_1k: 0.015 },
  anthropic_opus: { input_per_1k: 0.015, output_per_1k: 0.075 },
  anthropic_haiku: { input_per_1k: 0.0008, output_per_1k: 0.004 },
  openai_gpt4o: { input_per_1k: 0.0025, output_per_1k: 0.01 },
  openai_gpt4o_mini: { input_per_1k: 0.00015, output_per_1k: 0.0006 },
  groq_llama: { input_per_1k: 0.00059, output_per_1k: 0.00079 },
  gemini_pro: { input_per_1k: 0.00125, output_per_1k: 0.01 },
  openrouter_default: { input_per_1k: 0.001, output_per_1k: 0.003 },
  /* v13.4.366 : Qwen via Cloudflare Workers AI — palier gratuit (10k neurons/jour), 0 € pour Kevin. */
  qwen_cf: { input_per_1k: 0, output_per_1k: 0 },
};

class TokensDashboard {
  /**
   * Enregistre une utilisation de tokens (appelé par ai-router après chaque stream).
   */
  record(provider: string, inputTokens: number, outputTokens: number, model = 'anthropic_sonnet'): void {
    const pricing = PRICING[model] ?? PRICING['openrouter_default'] ?? { input_per_1k: 0, output_per_1k: 0 };
    const cost = (inputTokens / 1000) * pricing.input_per_1k + (outputTokens / 1000) * pricing.output_per_1k;
    const key = `ax_token_usage_${provider}`;
    try {
      const raw = localStorage.getItem(key);
      const current: TokenUsage = raw
        ? (JSON.parse(raw) as TokenUsage)
        : {
            provider,
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: 0,
            requests: 0,
            last_request_ts: 0,
          };
      current.input_tokens += inputTokens;
      current.output_tokens += outputTokens;
      current.cost_usd += cost;
      current.requests += 1;
      current.last_request_ts = Date.now();
      localStorage.setItem(key, JSON.stringify(current));
    } catch {
      /* ignore quota */
    }
  }

  /**
   * Récupère statistiques par provider (admin dashboard).
   */
  getStats(provider?: string): TokenUsage[] {
    const stats: TokenUsage[] = [];
    if (provider) {
      try {
        const raw = localStorage.getItem(`ax_token_usage_${provider}`);
        if (raw) stats.push(JSON.parse(raw) as TokenUsage);
      } catch {
        /* ignore */
      }
      return stats;
    }
    /* Tous providers */
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('ax_token_usage_')) continue;
      try {
        const v = localStorage.getItem(k);
        if (v) stats.push(JSON.parse(v) as TokenUsage);
      } catch {
        /* ignore */
      }
    }
    return stats.sort((a, b) => b.cost_usd - a.cost_usd);
  }

  /**
   * Total cumulé (toutes providers).
   */
  getTotal(): { cost_usd: number; input_tokens: number; output_tokens: number; requests: number } {
    const stats = this.getStats();
    return stats.reduce(
      (acc, s) => ({
        cost_usd: acc.cost_usd + s.cost_usd,
        input_tokens: acc.input_tokens + s.input_tokens,
        output_tokens: acc.output_tokens + s.output_tokens,
        requests: acc.requests + s.requests,
      }),
      { cost_usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 },
    );
  }

  /**
   * Reset compteurs (admin only — typiquement début de mois).
   */
  reset(provider?: string): void {
    if (provider) {
      try {
        localStorage.removeItem(`ax_token_usage_${provider}`);
      } catch {
        /* ignore */
      }
      return;
    }
    /* Reset all */
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('ax_token_usage_')) keysToRemove.push(k);
    }
    for (const k of keysToRemove) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Alerte si conso > seuil (pour push notif Kevin).
   */
  checkAlert(thresholdUsd = 50): { triggered: boolean; total_usd: number; threshold: number } {
    const total = this.getTotal();
    return {
      triggered: total.cost_usd >= thresholdUsd,
      total_usd: total.cost_usd,
      threshold: thresholdUsd,
    };
  }

  /**
   * Format pour affichage UI (€ approximé, EUR ≈ USD * 0.92).
   */
  formatForUI(): {
    total_eur: string;
    total_tokens: string;
    by_provider: Array<{ provider: string; eur: string; requests: number; pct: number }>;
  } {
    const total = this.getTotal();
    const stats = this.getStats();
    const totalEur = total.cost_usd * 0.92;
    const totalTokens = total.input_tokens + total.output_tokens;
    return {
      total_eur: `${totalEur.toFixed(2)}€`,
      total_tokens: totalTokens.toLocaleString('fr-FR'),
      by_provider: stats.map((s) => ({
        provider: s.provider,
        eur: `${(s.cost_usd * 0.92).toFixed(2)}€`,
        requests: s.requests,
        pct: total.cost_usd > 0 ? Math.round((s.cost_usd / total.cost_usd) * 100) : 0,
      })),
    };
  }

  /**
   * Pricing publique (pour modal admin).
   */
  getPricing(): typeof PRICING {
    return PRICING;
  }
}

export const tokensDashboard = new TokensDashboard();
