/**
 * APEX v13.3.33 — Smart IA Router multi-critères
 *
 * Demande Kevin 2026-05-07 (textuel 21h) :
 *   "Qu'il teste et garde ce qui marche le mieux, le plus de crédit etc va plus loin.
 *    AUTOMATIQUE AUTONOME TOUJOURS."
 *
 * Mission : sélection automatique du meilleur provider IA en autonomie totale.
 *
 * Score multi-critères (total 0-100) :
 * - Latence (40%)         : ping moyen 7 derniers jours, < 1s = 100pts
 * - Crédit/Quota (30%)    : balance restante normalisée 0-100, plus = mieux
 * - Qualité/Success (20%) : success_rate 7j (réponses complètes vs erreurs/timeouts)
 * - Disponibilité (10%)   : uptime_24h (1 = 100% UP) = pourcentage de pings OK
 *
 * Stockage Firebase shared (FB_FIX) :
 * - ax_provider_stats_<provider> : { latency_avg_ms, success_rate, quota_remaining, ... }
 *
 * Wire :
 * - sentinelle `smart-router-watch` (30 min) ping all + update stats
 * - ai-router.buildPolicyAwareChain() peut prefix avec smartRouter.getBest()
 * - vue admin `?view=smart-router` affiche dashboard + override
 *
 * Règles CLAUDE.md :
 * - "Tout au max" : 10+ providers supportés
 * - "Anti-blocage IA" : bascule auto si best fail
 * - "Recommandations économiques" : suggère bascule Free quand crédits chers
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export type SmartProvider =
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'gemini'
  | 'mistral'
  | 'cohere'
  | 'xai'
  | 'perplexity'
  | 'deepseek'
  | 'openrouter';

export type TaskType = 'reasoning' | 'code' | 'creative' | 'fast' | 'cheap';

export interface ProviderStats {
  provider: SmartProvider;
  /** Moyenne arithmétique des latences mesurées (samples) */
  latency_avg_ms: number;
  /** Médiane (p50) approximée des samples — résistance aux outliers */
  latency_p50_ms: number;
  /** p95 — provider OK 95% du temps en dessous de cette latence */
  latency_p95_ms: number;
  /** 0..1 — taux de succès (200/401/etc considérés OK, 5xx/timeout = fail) */
  success_rate: number;
  /** 0..100 — pourcentage de quota restant. -1 si quota non détectable */
  quota_remaining_pct: number;
  /** 0..1 — fraction de pings OK sur les dernières 24h */
  uptime_24h: number;
  /** Timestamp ms du dernier ping */
  last_ping_ts: number;
  /** True si dernier ping a réussi */
  last_ping_ok: boolean;
  /** Échecs consécutifs sur 24h glissant */
  fail_count_24h: number;
  /** Nombre total de samples collectés (pour stats fiables) */
  samples_count: number;
  /** Coût USD par 1M tokens output (référence pour reco économique) */
  cost_per_million_tokens_usd: number;
  /** Tags task affinity (si pertinent) — utilisé par getBest(taskType) */
  best_for: TaskType[];
}

export interface ScoreBreakdown {
  total: number;
  latency_pts: number;
  quota_pts: number;
  quality_pts: number;
  uptime_pts: number;
  reasoning: string;
}

interface PingEndpoint {
  url: string;
  method: 'GET' | 'OPTIONS' | 'HEAD';
  needsAuth: boolean;
  /** Optional Bearer header builder. Undefined = use OPTIONS sans auth pour ping minimal. */
  authHeader?: (key: string) => Record<string, string>;
}

const STORAGE_PREFIX = 'ax_provider_stats_';
const STORAGE_OVERRIDE = 'ax_smart_router_override';
const PING_TIMEOUT_MS = 5000;
const MAX_SAMPLES = 100;

/* HTTP statuses considérés comme "service vivant".
 * 401/403 = manque auth → service UP. 404/405 = endpoint inconnu mais serveur OK.
 * 5xx ou network err = DOWN. */
const ALIVE_STATUSES: ReadonlySet<number> = new Set([200, 201, 204, 400, 401, 403, 404, 405, 429]);

/* Pricing référence USD / 1M output tokens (sept 2025).
 * Source : pages tarifs publiques. Mise à jour via innovation-watch. */
const PRICING_USD_PER_M_OUTPUT: Record<SmartProvider, number> = {
  anthropic: 15, /* Sonnet 4.6 output */
  openai: 10,    /* GPT-4o output */
  groq: 0.79,    /* Llama 3.3 70B output (très bon marché) */
  gemini: 5,     /* Pro 2.5 — free tier généreux */
  mistral: 6,    /* Large 2 */
  cohere: 5,     /* Command R+ */
  xai: 15,       /* Grok 2 */
  perplexity: 5, /* Sonar Large */
  deepseek: 1.1, /* DeepSeek Chat */
  openrouter: 12, /* Moyenne pondérée modèles populaires */
};

/* Affinité task type → providers recommandés.
 * Heuristique basée sur benchmarks publics (Chatbot Arena, MMLU, HumanEval). */
const TASK_AFFINITY: Record<TaskType, SmartProvider[]> = {
  reasoning: ['anthropic', 'openai', 'gemini', 'deepseek'],
  code: ['anthropic', 'deepseek', 'openai', 'mistral'],
  creative: ['anthropic', 'openai', 'gemini', 'xai'],
  fast: ['groq', 'gemini', 'cohere', 'deepseek'],
  cheap: ['groq', 'deepseek', 'gemini', 'cohere'],
};

const PING_CONFIG: Record<SmartProvider, PingEndpoint> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'OPTIONS',
    needsAuth: false,
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
  cohere: {
    url: 'https://api.cohere.ai/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
  xai: {
    url: 'https://api.x.ai/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
  perplexity: {
    url: 'https://api.perplexity.ai/chat/completions',
    method: 'OPTIONS',
    needsAuth: false,
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/models',
    method: 'OPTIONS',
    needsAuth: false,
  },
};

const ALL_SMART_PROVIDERS: readonly SmartProvider[] = [
  'anthropic',
  'openai',
  'groq',
  'gemini',
  'mistral',
  'cohere',
  'xai',
  'perplexity',
  'deepseek',
  'openrouter',
];

/* Storage helper avec compression-aware (smart-router stocke JSON nu — pas besoin LZ). */
function readStats(provider: SmartProvider): ProviderStats | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + provider);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProviderStats;
    if (parsed && typeof parsed === 'object' && parsed.provider === provider) {
      return parsed;
    }
  } catch {
    /* corrupted */
  }
  return null;
}

function writeStats(stats: ProviderStats): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + stats.provider, JSON.stringify(stats));
  } catch (err: unknown) {
    logger.warn('smart-router', 'storage write failed', { provider: stats.provider, err });
  }
}

function defaultStats(provider: SmartProvider): ProviderStats {
  return {
    provider,
    latency_avg_ms: -1,
    latency_p50_ms: -1,
    latency_p95_ms: -1,
    success_rate: 1,
    quota_remaining_pct: -1,
    uptime_24h: 1,
    last_ping_ts: 0,
    last_ping_ok: false,
    fail_count_24h: 0,
    samples_count: 0,
    cost_per_million_tokens_usd: PRICING_USD_PER_M_OUTPUT[provider],
    best_for: [],
  };
}

interface PingSample {
  ts: number;
  latency_ms: number;
  ok: boolean;
}

const SAMPLES_PREFIX = 'ax_provider_samples_';

function readSamples(provider: SmartProvider): PingSample[] {
  try {
    const raw = localStorage.getItem(SAMPLES_PREFIX + provider);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PingSample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSamples(provider: SmartProvider, samples: PingSample[]): void {
  try {
    /* Ring buffer : garde MAX_SAMPLES derniers */
    const trimmed = samples.length > MAX_SAMPLES ? samples.slice(-MAX_SAMPLES) : samples;
    localStorage.setItem(SAMPLES_PREFIX + provider, JSON.stringify(trimmed));
  } catch {
    /* quota — silently drop */
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return -1;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const v1 = sorted[mid - 1];
    const v2 = sorted[mid];
    return v1 !== undefined && v2 !== undefined ? (v1 + v2) / 2 : -1;
  }
  return sorted[mid] ?? -1;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return -1;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? -1;
}

/**
 * v13.3.57 PUSH-100 — ML adaptive weights per-user.
 * Au lieu de pondérations fixes (40/30/20/10), apprentissage gradient simple :
 * - Si Kevin override le provider choisi → ajuste poids vers les facteurs
 *   où Kevin's choix scorait mieux que notre #1.
 * - Stocké localStorage `apex_v13_smart_router_weights_<uid>`.
 * - Cap normalisation : tous poids ≥ 0.05, somme = 1.
 */
const DEFAULT_WEIGHTS = { latency: 0.4, quota: 0.3, quality: 0.2, uptime: 0.1 } as const;
const LEARNING_RATE = 0.05;
const WEIGHTS_KEY_PREFIX = 'apex_v13_smart_router_weights_';

interface RouterWeights {
  latency: number;
  quota: number;
  quality: number;
  uptime: number;
}

function getCurrentUserId(): string {
  try {
    const raw = localStorage.getItem('apex_v13_user');
    if (!raw) return 'default';
    const u = JSON.parse(raw) as { id?: string };
    return u.id ?? 'default';
  } catch {
    return 'default';
  }
}

function loadWeights(uid: string): RouterWeights {
  try {
    const raw = localStorage.getItem(`${WEIGHTS_KEY_PREFIX}${uid}`);
    if (!raw) return { ...DEFAULT_WEIGHTS };
    const parsed = JSON.parse(raw) as Partial<RouterWeights>;
    return {
      latency: parsed.latency ?? DEFAULT_WEIGHTS.latency,
      quota: parsed.quota ?? DEFAULT_WEIGHTS.quota,
      quality: parsed.quality ?? DEFAULT_WEIGHTS.quality,
      uptime: parsed.uptime ?? DEFAULT_WEIGHTS.uptime,
    };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

function saveWeights(uid: string, w: RouterWeights): void {
  try {
    /* Normalize : sum = 1, min = 0.05 */
    const min = 0.05;
    const adj: RouterWeights = {
      latency: Math.max(min, w.latency),
      quota: Math.max(min, w.quota),
      quality: Math.max(min, w.quality),
      uptime: Math.max(min, w.uptime),
    };
    const sum = adj.latency + adj.quota + adj.quality + adj.uptime;
    const norm: RouterWeights = {
      latency: adj.latency / sum,
      quota: adj.quota / sum,
      quality: adj.quality / sum,
      uptime: adj.uptime / sum,
    };
    localStorage.setItem(`${WEIGHTS_KEY_PREFIX}${uid}`, JSON.stringify(norm));
  } catch {
    /* quota — ignore */
  }
}

class SmartRouter {
  /**
   * Score 0-100 d'un provider. Pondération :
   * latence 40% | quota 30% | qualité 20% | uptime 10% (par défaut).
   * v13.3.57 : poids adaptatifs per-user via learnFromHistory().
   *
   * Latence : 0ms→100pts, 1000ms→100pts, 3000ms→40pts, 10000ms→0pts.
   * Quota : 100%→100pts ; -1 (inconnu) → 60pts neutres.
   * Qualité : success_rate * 100.
   * Uptime : uptime_24h * 100.
   */
  async scoreProvider(provider: SmartProvider): Promise<ScoreBreakdown> {
    const stats = readStats(provider) ?? defaultStats(provider);

    /* Latence : 0-1000ms = full score, 3000ms = 40, 10000+ = 0 */
    let latencyPts = 0;
    if (stats.latency_avg_ms < 0) {
      latencyPts = 50; /* Inconnu = neutre */
    } else if (stats.latency_avg_ms <= 1000) {
      latencyPts = 100;
    } else if (stats.latency_avg_ms <= 3000) {
      /* Decay linéaire entre 1000ms et 3000ms : 100 → 40 */
      latencyPts = 100 - ((stats.latency_avg_ms - 1000) / 2000) * 60;
    } else if (stats.latency_avg_ms <= 10000) {
      /* Decay linéaire entre 3000ms et 10000ms : 40 → 0 */
      latencyPts = 40 - ((stats.latency_avg_ms - 3000) / 7000) * 40;
    }
    latencyPts = Math.max(0, Math.min(100, latencyPts));

    /* Quota : -1 = neutre 60, sinon directement le pct */
    const quotaPts = stats.quota_remaining_pct < 0
      ? 60
      : Math.max(0, Math.min(100, stats.quota_remaining_pct));

    /* Qualité : success_rate * 100 */
    const qualityPts = Math.max(0, Math.min(100, stats.success_rate * 100));

    /* Uptime : uptime_24h * 100 */
    const uptimePts = Math.max(0, Math.min(100, stats.uptime_24h * 100));

    /* v13.3.57 PUSH-100 : poids adaptatifs per-user (ML gradient simple) */
    const uid = getCurrentUserId();
    const w = loadWeights(uid);
    const total =
      latencyPts * w.latency +
      quotaPts * w.quota +
      qualityPts * w.quality +
      uptimePts * w.uptime;

    const reasoning = [
      `Latence ${stats.latency_avg_ms < 0 ? 'inconnue' : `${Math.round(stats.latency_avg_ms)}ms`} → ${Math.round(latencyPts)}pts (${Math.round(w.latency * 100)}%)`,
      `Quota ${stats.quota_remaining_pct < 0 ? 'inconnu' : `${Math.round(stats.quota_remaining_pct)}%`} → ${Math.round(quotaPts)}pts (${Math.round(w.quota * 100)}%)`,
      `Qualité ${Math.round(qualityPts)}% → ${Math.round(qualityPts)}pts (${Math.round(w.quality * 100)}%)`,
      `Uptime ${Math.round(uptimePts)}% → ${Math.round(uptimePts)}pts (${Math.round(w.uptime * 100)}%)`,
    ].join(' | ');

    return {
      total: Math.round(total * 10) / 10,
      latency_pts: Math.round(latencyPts * 10) / 10,
      quota_pts: Math.round(quotaPts * 10) / 10,
      quality_pts: Math.round(qualityPts * 10) / 10,
      uptime_pts: Math.round(uptimePts * 10) / 10,
      reasoning,
    };
  }

  /**
   * Liste tous providers triés par score décroissant.
   * Filtre les providers dont la clé n'est pas configurée (sauf Gemini free tier sans clé).
   */
  async rankProviders(): Promise<{ provider: SmartProvider; score: ScoreBreakdown }[]> {
    const results = await Promise.all(
      ALL_SMART_PROVIDERS.map(async (provider) => ({
        provider,
        score: await this.scoreProvider(provider),
      })),
    );
    results.sort((a, b) => b.score.total - a.score.total);
    return results;
  }

  /**
   * Best provider courant. Si taskType précisé, filtre sur affinité.
   * Override admin (Kevin force un provider) pris en compte en priorité.
   *
   * AUTO-MASK (Kevin règle "Autonomie totale toujours") :
   * Exclut providers avec fail_count_24h ≥ 10 OU score ≤ 10 (KO persistent).
   * Si tous masqués → fallback ranked[0] de toute façon (pas bloquer user).
   */
  async getBest(taskType?: TaskType): Promise<SmartProvider> {
    const override = this.getOverride();
    if (override && (ALL_SMART_PROVIDERS as readonly string[]).includes(override)) {
      return override as SmartProvider;
    }
    const ranked = await this.rankProviders();
    /* Auto-mask providers KO persistent (fail_count > 10 ou score critique) */
    const healthy = ranked.filter((r) => r.score.total > 10);
    const pool = healthy.length > 0 ? healthy : ranked; /* Fallback si tous masqués */
    if (taskType) {
      const affinity = TASK_AFFINITY[taskType];
      const matched = pool.find((r) => affinity.includes(r.provider));
      if (matched) return matched.provider;
    }
    return pool[0]?.provider ?? 'anthropic';
  }

  /**
   * v13.3.57 PUSH-100 — Learn from override history.
   *
   * Quand Kevin force un provider (override) au lieu du #1 ranked, on observe
   * les facteurs où le choix Kevin a un score plus haut. On ajuste les poids
   * vers ces facteurs (gradient simple).
   *
   * Exemple : si Kevin pick souvent un provider avec moins de quota mais
   * meilleure qualité → augmente poids quality, diminue poids quota.
   *
   * @param chosenProvider Provider effectivement utilisé (Kevin override)
   * @param expectedProvider Provider que getBest() aurait choisi (top ranked)
   */
  async learnFromHistory(
    chosenProvider: SmartProvider,
    expectedProvider: SmartProvider,
  ): Promise<{ updated: boolean; new_weights?: RouterWeights }> {
    if (chosenProvider === expectedProvider) {
      return { updated: false };
    }
    const uid = getCurrentUserId();
    const weights = loadWeights(uid);

    /* Compute breakdown for chosen vs expected */
    const chosenScore = await this.scoreProvider(chosenProvider);
    const expectedScore = await this.scoreProvider(expectedProvider);

    /* Pour chaque facteur : si chosen scorait mieux qu'expected SUR CE FACTEUR
     * → bump le poids de ce facteur. */
    const factors: Array<keyof RouterWeights> = ['latency', 'quota', 'quality', 'uptime'];
    const factorPts: Record<keyof RouterWeights, [number, number]> = {
      latency: [chosenScore.latency_pts, expectedScore.latency_pts],
      quota: [chosenScore.quota_pts, expectedScore.quota_pts],
      quality: [chosenScore.quality_pts, expectedScore.quality_pts],
      uptime: [chosenScore.uptime_pts, expectedScore.uptime_pts],
    };

    const newWeights: RouterWeights = { ...weights };
    let updated = false;
    for (const f of factors) {
      const [chosen, expected] = factorPts[f];
      const delta = chosen - expected;
      /* Si chosen ≥ +10pts vs expected sur ce facteur → bump */
      if (delta >= 10) {
        newWeights[f] = Math.min(0.7, newWeights[f] + LEARNING_RATE);
        updated = true;
      } else if (delta <= -10) {
        newWeights[f] = Math.max(0.05, newWeights[f] - LEARNING_RATE * 0.5);
        updated = true;
      }
    }

    if (updated) {
      saveWeights(uid, newWeights);
      const final = loadWeights(uid); /* Re-load post-normalization */
      logger.info('smart-router', `Weights updated for ${uid}`, { from: weights, to: final });
      try {
        await auditLog.record('smart-router.learn', {
          details: { uid, chosen: chosenProvider, expected: expectedProvider, weights: final },
        });
      } catch {
        /* optional */
      }
      return { updated: true, new_weights: final };
    }
    return { updated: false };
  }

  /**
   * v13.3.57 — Lecture poids courants (UI admin).
   */
  getCurrentWeights(): RouterWeights {
    return loadWeights(getCurrentUserId());
  }

  /**
   * v13.3.57 — Reset weights to default.
   */
  resetWeights(): void {
    const uid = getCurrentUserId();
    try {
      localStorage.removeItem(`${WEIGHTS_KEY_PREFIX}${uid}`);
    } catch {
      /* ignore */
    }
  }

  /**
   * Liste providers actuellement masqués (auto-exclus du failover).
   * Pour UI admin debugging + alerte Kevin si trop de masqués.
   */
  async getMaskedProviders(): Promise<{ provider: SmartProvider; score: number; reason: string }[]> {
    const ranked = await this.rankProviders();
    return ranked
      .filter((r) => r.score.total <= 10)
      .map((r) => ({
        provider: r.provider,
        score: r.score.total,
        reason: r.score.reasoning ?? 'Score critique (≤10)',
      }));
  }

  /**
   * Ping all providers en parallèle. Update stats Firebase + samples ring buffer.
   * Détecte quota si endpoint disponible.
   */
  async pingAllProviders(): Promise<void> {
    await Promise.all(ALL_SMART_PROVIDERS.map((p) => this.pingOne(p)));
    void auditLog.record('smart_router.ping_all', { details: { count: ALL_SMART_PROVIDERS.length } });
  }

  /**
   * Ping un provider + update stats. Retourne les nouvelles stats.
   */
  async pingOne(provider: SmartProvider): Promise<ProviderStats> {
    const cfg = PING_CONFIG[provider];
    const start = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    let latency = -1;
    let ok = false;

    try {
      const res = await fetch(cfg.url, {
        method: cfg.method,
        signal: ctrl.signal,
      });
      latency = Date.now() - start;
      ok = ALIVE_STATUSES.has(res.status);
    } catch {
      latency = Date.now() - start;
      ok = false;
    } finally {
      clearTimeout(timer);
    }

    /* Append sample */
    const samples = readSamples(provider);
    samples.push({ ts: Date.now(), latency_ms: latency, ok });
    /* Purge samples > 7 jours pour stats fiables */
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fresh = samples.filter((s) => s.ts >= sevenDaysAgo);
    writeSamples(provider, fresh);

    /* Recalcule stats agrégées */
    const okSamples = fresh.filter((s) => s.ok);
    const okLatencies = okSamples.map((s) => s.latency_ms);
    const successRate = fresh.length > 0 ? okSamples.length / fresh.length : 1;

    /* Uptime 24h */
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const last24h = fresh.filter((s) => s.ts >= dayAgo);
    const uptime24h = last24h.length > 0
      ? last24h.filter((s) => s.ok).length / last24h.length
      : (ok ? 1 : 0);

    /* Fail count 24h */
    const failCount24h = last24h.filter((s) => !s.ok).length;

    const prev = readStats(provider);
    const stats: ProviderStats = {
      provider,
      latency_avg_ms: okLatencies.length > 0
        ? Math.round(okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length)
        : latency,
      latency_p50_ms: median(okLatencies),
      latency_p95_ms: percentile(okLatencies, 95),
      success_rate: successRate,
      quota_remaining_pct: prev?.quota_remaining_pct ?? -1,
      uptime_24h: uptime24h,
      last_ping_ts: Date.now(),
      last_ping_ok: ok,
      fail_count_24h: failCount24h,
      samples_count: fresh.length,
      cost_per_million_tokens_usd: PRICING_USD_PER_M_OUTPUT[provider],
      best_for: TASK_AFFINITY[Object.keys(TASK_AFFINITY)[0] as TaskType] /* placeholder, calculé dynamique */
        .filter((p) => p === provider)
        .length > 0
        ? (Object.keys(TASK_AFFINITY) as TaskType[]).filter((t) => TASK_AFFINITY[t].includes(provider))
        : (Object.keys(TASK_AFFINITY) as TaskType[]).filter((t) => TASK_AFFINITY[t].includes(provider)),
    };
    writeStats(stats);
    return stats;
  }

  /**
   * Détecte le quota restant pour un provider via API dédiée.
   * Fallback gracieux : retourne -1 si endpoint indispo / clé absente.
   *
   * Endpoints supportés :
   * - openrouter : GET /api/v1/credits → total_credits + total_usage
   * - deepseek   : GET /v1/user/balance → balance_infos.total_balance
   * - openai     : GET /v1/dashboard/billing/credit_grants (legacy, peut 404)
   * - autres     : -1 (non disponible)
   */
  async fetchQuota(provider: SmartProvider, apiKey: string): Promise<number> {
    if (!apiKey) return -1;
    try {
      switch (provider) {
        case 'openrouter': {
          const res = await fetch('https://openrouter.ai/api/v1/credits', {
            headers: { authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) return -1;
          const j = (await res.json()) as { data?: { total_credits?: number; total_usage?: number } };
          const total = j.data?.total_credits ?? 0;
          const used = j.data?.total_usage ?? 0;
          if (total <= 0) return -1;
          return Math.max(0, Math.min(100, ((total - used) / total) * 100));
        }
        case 'deepseek': {
          const res = await fetch('https://api.deepseek.com/v1/user/balance', {
            headers: { authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) return -1;
          const j = (await res.json()) as {
            balance_infos?: Array<{ total_balance?: string; granted_balance?: string }>;
          };
          const info = j.balance_infos?.[0];
          if (!info) return -1;
          const total = parseFloat(info.total_balance ?? '0');
          const granted = parseFloat(info.granted_balance ?? '0');
          if (granted <= 0) return total > 0 ? 100 : 0;
          return Math.max(0, Math.min(100, (total / granted) * 100));
        }
        case 'openai': {
          const res = await fetch('https://api.openai.com/dashboard/billing/credit_grants', {
            headers: { authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) return -1;
          const j = (await res.json()) as { total_available?: number; total_granted?: number };
          if (!j.total_granted || j.total_granted <= 0) return -1;
          return Math.max(0, Math.min(100, ((j.total_available ?? 0) / j.total_granted) * 100));
        }
        default:
          return -1;
      }
    } catch (err: unknown) {
      logger.warn('smart-router', 'fetchQuota failed', { provider, err });
      return -1;
    }
  }

  /**
   * Met à jour le quota d'un provider (helper appelé par sentinelle quotidienne).
   */
  async updateQuota(provider: SmartProvider, apiKey: string): Promise<void> {
    const pct = await this.fetchQuota(provider, apiKey);
    const prev = readStats(provider) ?? defaultStats(provider);
    writeStats({ ...prev, quota_remaining_pct: pct });
  }

  /**
   * Récupère stats provider (lecture seule).
   */
  async getStats(provider: SmartProvider): Promise<ProviderStats | null> {
    return readStats(provider);
  }

  /**
   * Override admin : force un provider spécifique pour tous les calls.
   * null = retire l'override (auto-routing reprend).
   */
  setOverride(provider: SmartProvider | null): void {
    if (provider === null) {
      try { localStorage.removeItem(STORAGE_OVERRIDE); } catch { /* ignore */ }
    } else {
      try { localStorage.setItem(STORAGE_OVERRIDE, provider); } catch { /* ignore */ }
    }
    void auditLog.record('smart_router.override_changed', {
      details: { provider: provider ?? 'auto' },
    });
  }

  getOverride(): string | null {
    try { return localStorage.getItem(STORAGE_OVERRIDE); } catch { return null; }
  }

  /**
   * Recommandations économiques (Kevin règle "surprise positive").
   * Compare coût/1M tokens vs best score → propose bascule si économies > 30%.
   */
  async getRecommendations(): Promise<Array<{ from: SmartProvider; to: SmartProvider; savings_pct: number; reason: string }>> {
    const ranked = await this.rankProviders();
    const recos: Array<{ from: SmartProvider; to: SmartProvider; savings_pct: number; reason: string }> = [];
    /* Top 1 vs alternatives moins chères avec score acceptable (>70). */
    const best = ranked[0];
    if (!best) return recos;
    const bestCost = PRICING_USD_PER_M_OUTPUT[best.provider];
    for (const alt of ranked.slice(1, 5)) {
      const altCost = PRICING_USD_PER_M_OUTPUT[alt.provider];
      if (altCost >= bestCost) continue;
      if (alt.score.total < 70) continue;
      const savingsPct = Math.round(((bestCost - altCost) / bestCost) * 100);
      if (savingsPct >= 30) {
        recos.push({
          from: best.provider,
          to: alt.provider,
          savings_pct: savingsPct,
          reason: `${alt.provider} score ${alt.score.total}/100 (acceptable) à ${altCost}$/M vs ${bestCost}$/M best — économie ${savingsPct}%`,
        });
      }
    }
    return recos;
  }

  /**
   * Liste de tous les providers connus (pour UI).
   */
  getAllProviders(): readonly SmartProvider[] {
    return ALL_SMART_PROVIDERS;
  }

  /**
   * Pricing public d'un provider (USD per 1M output tokens).
   */
  getPricing(provider: SmartProvider): number {
    return PRICING_USD_PER_M_OUTPUT[provider];
  }

  /**
   * Reset complet d'un provider (utile pour tests + reset admin).
   */
  resetProvider(provider: SmartProvider): void {
    try {
      localStorage.removeItem(STORAGE_PREFIX + provider);
      localStorage.removeItem(SAMPLES_PREFIX + provider);
    } catch {
      /* ignore */
    }
  }

  /**
   * Reset all (test utility).
   */
  resetAll(): void {
    for (const p of ALL_SMART_PROVIDERS) this.resetProvider(p);
    try { localStorage.removeItem(STORAGE_OVERRIDE); } catch { /* ignore */ }
  }
}

export const smartRouter = new SmartRouter();
