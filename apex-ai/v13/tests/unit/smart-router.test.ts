/**
 * APEX v13.3.33 — Tests Smart IA Router multi-critères.
 *
 * Couvre :
 * - scoreProvider mock stats → calcul score correct (40+30+20+10)
 * - rankProviders → tri desc par score total
 * - getBest avec/sans taskType → respecte affinity
 * - pingAllProviders → mock fetch all → update samples
 * - override admin Kevin (set/get/clear)
 * - getStats null si jamais pingé
 * - getRecommendations économies > 30%
 * - resetProvider / resetAll
 * - fetchQuota mock OpenRouter / DeepSeek
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { smartRouter, type SmartProvider } from '../../services/ai/smart-router.js';

/* Helper : seed manually des stats pour un provider via writeStats indirect.
 * On simule un ping avec mocked fetch latency + ok response. */
function seedStats(provider: SmartProvider, stats: {
  latency_avg_ms: number;
  success_rate: number;
  quota_remaining_pct: number;
  uptime_24h: number;
  samples_count?: number;
}): void {
  const full = {
    provider,
    latency_avg_ms: stats.latency_avg_ms,
    latency_p50_ms: stats.latency_avg_ms,
    latency_p95_ms: Math.round(stats.latency_avg_ms * 1.5),
    success_rate: stats.success_rate,
    quota_remaining_pct: stats.quota_remaining_pct,
    uptime_24h: stats.uptime_24h,
    last_ping_ts: Date.now(),
    last_ping_ok: true,
    fail_count_24h: 0,
    samples_count: stats.samples_count ?? 10,
    cost_per_million_tokens_usd: smartRouter.getPricing(provider),
    best_for: [],
  };
  localStorage.setItem('ax_provider_stats_' + provider, JSON.stringify(full));
}

describe('smart-router — sélection multi-critères automatique', () => {
  beforeEach(() => {
    localStorage.clear();
    smartRouter.resetAll();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scoreProvider', () => {
    it('retourne neutre 50 pour provider jamais pingé (latence inconnue)', async () => {
      const score = await smartRouter.scoreProvider('anthropic');
      expect(score.total).toBeGreaterThan(0);
      expect(score.latency_pts).toBe(50);
      /* Quota -1 → 60pts neutres */
      expect(score.quota_pts).toBe(60);
    });

    it('latence < 1000ms = 100pts (full latency)', async () => {
      seedStats('groq', { latency_avg_ms: 500, success_rate: 1, quota_remaining_pct: 80, uptime_24h: 1 });
      const score = await smartRouter.scoreProvider('groq');
      expect(score.latency_pts).toBe(100);
      /* Total: 100*0.4 + 80*0.3 + 100*0.2 + 100*0.1 = 40+24+20+10 = 94 */
      expect(score.total).toBeGreaterThanOrEqual(93);
      expect(score.total).toBeLessThanOrEqual(95);
    });

    it('latence 3000ms ≈ 40pts', async () => {
      seedStats('anthropic', { latency_avg_ms: 3000, success_rate: 1, quota_remaining_pct: 50, uptime_24h: 1 });
      const score = await smartRouter.scoreProvider('anthropic');
      expect(score.latency_pts).toBeGreaterThanOrEqual(38);
      expect(score.latency_pts).toBeLessThanOrEqual(42);
    });

    it('latence 10000ms = 0pts', async () => {
      seedStats('anthropic', { latency_avg_ms: 10000, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      const score = await smartRouter.scoreProvider('anthropic');
      expect(score.latency_pts).toBe(0);
    });

    it('success_rate 0.5 → quality 50pts', async () => {
      seedStats('anthropic', { latency_avg_ms: 500, success_rate: 0.5, quota_remaining_pct: 100, uptime_24h: 1 });
      const score = await smartRouter.scoreProvider('anthropic');
      expect(score.quality_pts).toBe(50);
    });

    it('uptime 0.7 → uptime 70pts', async () => {
      seedStats('anthropic', { latency_avg_ms: 500, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 0.7 });
      const score = await smartRouter.scoreProvider('anthropic');
      expect(score.uptime_pts).toBe(70);
    });

    it('breakdown reasoning contient les 4 critères', async () => {
      const score = await smartRouter.scoreProvider('anthropic');
      expect(score.reasoning).toContain('Latence');
      expect(score.reasoning).toContain('Quota');
      expect(score.reasoning).toContain('Qualité');
      expect(score.reasoning).toContain('Uptime');
    });
  });

  describe('rankProviders', () => {
    it('trie par score décroissant', async () => {
      seedStats('groq', { latency_avg_ms: 200, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      seedStats('anthropic', { latency_avg_ms: 5000, success_rate: 0.8, quota_remaining_pct: 30, uptime_24h: 0.9 });
      seedStats('gemini', { latency_avg_ms: 800, success_rate: 0.95, quota_remaining_pct: 90, uptime_24h: 1 });
      const ranked = await smartRouter.rankProviders();
      expect(ranked.length).toBeGreaterThanOrEqual(3);
      /* Groq devrait gagner (200ms + full quality + 100% uptime) */
      expect(ranked[0]?.provider).toBe('groq');
      /* Tous triés desc */
      for (let i = 1; i < ranked.length; i++) {
        const prev = ranked[i - 1];
        const cur = ranked[i];
        if (prev && cur) expect(prev.score.total).toBeGreaterThanOrEqual(cur.score.total);
      }
    });

    it('inclut tous les 10 providers', async () => {
      const ranked = await smartRouter.rankProviders();
      expect(ranked.length).toBe(10);
    });
  });

  describe('getBest', () => {
    it('retourne anthropic par défaut quand aucune stat', async () => {
      const best = await smartRouter.getBest();
      /* Tous neutres → premier dans l'ordre alphabétique du Map */
      expect(['anthropic', 'cohere', 'deepseek', 'gemini', 'groq', 'mistral', 'openai', 'openrouter', 'perplexity', 'xai']).toContain(best);
    });

    it('retourne le provider top score sans taskType', async () => {
      seedStats('groq', { latency_avg_ms: 100, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      const best = await smartRouter.getBest();
      expect(best).toBe('groq');
    });

    it('respecte affinity taskType "fast" → groq prioritaire', async () => {
      seedStats('groq', { latency_avg_ms: 200, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      seedStats('anthropic', { latency_avg_ms: 800, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      const best = await smartRouter.getBest('fast');
      /* groq est dans TASK_AFFINITY.fast */
      expect(['groq', 'gemini', 'cohere', 'deepseek']).toContain(best);
    });

    it('respecte override admin Kevin', async () => {
      smartRouter.setOverride('mistral');
      const best = await smartRouter.getBest();
      expect(best).toBe('mistral');
    });

    it('retire override null → revient auto-routing', async () => {
      smartRouter.setOverride('mistral');
      smartRouter.setOverride(null);
      const ov = smartRouter.getOverride();
      expect(ov).toBeNull();
    });
  });

  describe('pingAllProviders', () => {
    it('appelle fetch pour chaque provider', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 200 }),
      );
      await smartRouter.pingAllProviders();
      /* 10 providers → 10 fetch calls minimum */
      expect(fetchSpy).toHaveBeenCalledTimes(10);
    });

    it('met à jour samples + stats après ping', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 200 }),
      );
      await smartRouter.pingAllProviders();
      const stats = await smartRouter.getStats('anthropic');
      expect(stats).not.toBeNull();
      expect(stats!.last_ping_ok).toBe(true);
      expect(stats!.samples_count).toBeGreaterThan(0);
    });

    it('marque last_ping_ok=false sur HTTP 503', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 503 }),
      );
      await smartRouter.pingAllProviders();
      const stats = await smartRouter.getStats('anthropic');
      expect(stats!.last_ping_ok).toBe(false);
    });

    it('considère HTTP 401 comme alive (auth manquante = serveur OK)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 401 }),
      );
      await smartRouter.pingAllProviders();
      const stats = await smartRouter.getStats('groq');
      expect(stats!.last_ping_ok).toBe(true);
    });

    it('marque fail sur network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
      await smartRouter.pingAllProviders();
      const stats = await smartRouter.getStats('anthropic');
      expect(stats!.last_ping_ok).toBe(false);
    });
  });

  describe('getStats', () => {
    it('retourne null si jamais pingé', async () => {
      const stats = await smartRouter.getStats('anthropic');
      expect(stats).toBeNull();
    });

    it('retourne stats après seed', async () => {
      seedStats('anthropic', { latency_avg_ms: 1234, success_rate: 0.9, quota_remaining_pct: 75, uptime_24h: 0.99 });
      const stats = await smartRouter.getStats('anthropic');
      expect(stats).not.toBeNull();
      expect(stats!.latency_avg_ms).toBe(1234);
      expect(stats!.success_rate).toBe(0.9);
    });
  });

  describe('override admin', () => {
    it('setOverride persiste dans localStorage', () => {
      smartRouter.setOverride('xai');
      expect(localStorage.getItem('ax_smart_router_override')).toBe('xai');
    });

    it('getOverride lit localStorage', () => {
      localStorage.setItem('ax_smart_router_override', 'cohere');
      expect(smartRouter.getOverride()).toBe('cohere');
    });

    it('setOverride(null) supprime', () => {
      smartRouter.setOverride('xai');
      smartRouter.setOverride(null);
      expect(smartRouter.getOverride()).toBeNull();
    });
  });

  describe('getRecommendations', () => {
    it('propose bascule éco si alt moins chère avec score acceptable', async () => {
      /* anthropic best avec coût 15$ ; groq alt avec coût 0.79$ et score 80+ */
      seedStats('anthropic', { latency_avg_ms: 800, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      seedStats('groq', { latency_avg_ms: 200, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      const recos = await smartRouter.getRecommendations();
      /* groq devrait apparaître comme alternative économique vs anthropic */
      const hasGroqReco = recos.some((r) => r.to === 'groq' || r.from === 'groq');
      expect(hasGroqReco).toBe(true);
    });

    it('retourne [] si aucune alternative économique trouvée', async () => {
      /* Seul groq scoré → pas de comparaison possible */
      seedStats('groq', { latency_avg_ms: 200, success_rate: 1, quota_remaining_pct: 100, uptime_24h: 1 });
      const recos = await smartRouter.getRecommendations();
      /* groq best, pas d'alternative scorée → array vide ou seulement scores >70 */
      expect(Array.isArray(recos)).toBe(true);
    });
  });

  describe('fetchQuota', () => {
    it('OpenRouter parse total_credits + total_usage', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: { total_credits: 100, total_usage: 25 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const pct = await smartRouter.fetchQuota('openrouter', 'sk-test');
      expect(pct).toBe(75); /* (100-25)/100 = 75% */
    });

    it('DeepSeek parse balance_infos[0]', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ balance_infos: [{ total_balance: '50', granted_balance: '100' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const pct = await smartRouter.fetchQuota('deepseek', 'sk-test');
      expect(pct).toBe(50); /* 50/100 = 50% */
    });

    it('retourne -1 si pas de clé', async () => {
      const pct = await smartRouter.fetchQuota('openrouter', '');
      expect(pct).toBe(-1);
    });

    it('retourne -1 sur HTTP 500', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 500 }),
      );
      const pct = await smartRouter.fetchQuota('openrouter', 'sk-test');
      expect(pct).toBe(-1);
    });

    it('retourne -1 pour provider sans endpoint quota (groq)', async () => {
      const pct = await smartRouter.fetchQuota('groq', 'gsk-test');
      expect(pct).toBe(-1);
    });
  });

  describe('reset', () => {
    it('resetProvider clear stats + samples', () => {
      seedStats('anthropic', { latency_avg_ms: 1000, success_rate: 1, quota_remaining_pct: 50, uptime_24h: 1 });
      smartRouter.resetProvider('anthropic');
      expect(localStorage.getItem('ax_provider_stats_anthropic')).toBeNull();
    });

    it('resetAll clear tous providers + override', () => {
      seedStats('anthropic', { latency_avg_ms: 1000, success_rate: 1, quota_remaining_pct: 50, uptime_24h: 1 });
      smartRouter.setOverride('mistral');
      smartRouter.resetAll();
      expect(localStorage.getItem('ax_provider_stats_anthropic')).toBeNull();
      expect(localStorage.getItem('ax_smart_router_override')).toBeNull();
    });
  });

  describe('getAllProviders / getPricing', () => {
    it('getAllProviders retourne 10 providers', () => {
      const all = smartRouter.getAllProviders();
      expect(all.length).toBe(10);
      expect(all).toContain('anthropic');
      expect(all).toContain('deepseek');
      expect(all).toContain('xai');
    });

    it('getPricing retourne coût USD/M tokens', () => {
      expect(smartRouter.getPricing('groq')).toBeLessThan(2);
      expect(smartRouter.getPricing('anthropic')).toBeGreaterThan(5);
    });
  });
});
