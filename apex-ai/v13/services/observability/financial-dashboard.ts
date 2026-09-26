/**
 * APEX v13 — Financial Dashboard live (Kevin "bilan financier individuel + total
 * live jour mois va plus loin créatif").
 *
 * Calculs :
 * - Burn rate temps réel (€/heure, €/jour, €/mois extrapolé)
 * - Coût individuel par service (IA + SaaS + abos)
 * - Total cumulé période courante
 * - Projections fin de mois basées sur trend 7j
 * - Comparaison vs concurrence (ChatGPT $20, Cursor $20, etc.)
 * - ROI si Apex commercialisé (revenu/coût)
 * - Économies réalisées via routing free-first vs all-paid
 * - Heatmap consommation par heure/jour
 * - Coût par utilisateur projeté
 *
 * Sortie présentable UI dashboard innovante.
 */

import { commerce } from '../integrations/commerce.js';

import { consumptionMonitor } from './consumption-monitor.js';
import { tokensDashboard } from './tokens-dashboard.js';

export interface FinancialServiceLine {
  service: string;
  category: 'ai' | 'saas' | 'infra' | 'comms' | 'finance' | 'other';
  used_eur_today: number;
  used_eur_month: number;
  used_eur_total: number;
  budget_eur_month: number;
  pct_budget: number;
  is_free_tier: boolean;
  status: 'ok' | 'warn' | 'critical';
  trend_7d: 'up' | 'down' | 'stable';
  emoji: string;
}

export interface BurnRate {
  per_minute_eur: number;
  per_hour_eur: number;
  per_day_eur: number;
  per_week_eur: number;
  per_month_extrapolated_eur: number;
}

export interface FinancialSummary {
  total_today_eur: number;
  total_month_eur: number;
  total_budget_month_eur: number;
  total_pct_budget: number;
  burn_rate: BurnRate;
  services: readonly FinancialServiceLine[];
  free_savings_month_eur: number; /* Économies vs si tout payant */
  projection_end_month_eur: number;
  comparison_vs_competition: ReadonlyArray<{ tool: string; their_price_eur: number; apex_advantage: string }>;
  roi: {
    paying_users: number;
    monthly_revenue_eur: number;
    monthly_cost_eur: number;
    monthly_profit_eur: number;
    margin_pct: number;
    breakeven_users: number;
  };
  alerts_count: number;
  health_emoji: string;
}

const COMPETITION_BENCHMARKS = [
  { tool: 'ChatGPT Plus', their_price_eur: 20, apex_advantage: 'Multi-IA + studios + 100% own data' },
  { tool: 'Cursor Pro', their_price_eur: 20, apex_advantage: 'Multi-domain + français + voice' },
  { tool: 'Claude Pro', their_price_eur: 20, apex_advantage: 'Failover 5 providers + offline' },
  { tool: 'Notion AI', their_price_eur: 10, apex_advantage: 'Mémoire augmentée parité Claude Code' },
  { tool: 'Perplexity Pro', their_price_eur: 20, apex_advantage: 'Search + chat + studios + admin' },
  { tool: 'GitHub Copilot', their_price_eur: 19, apex_advantage: 'Code + tout le reste' },
] as const;

const SERVICE_CATEGORIES: Record<string, FinancialServiceLine['category']> = {
  anthropic: 'ai', openai: 'ai', groq: 'ai', gemini: 'ai', openrouter: 'ai',
  cohere: 'ai', mistral: 'ai', deepseek: 'ai', perplexity: 'ai', elevenlabs: 'ai',
  replicate: 'ai',
  stripe: 'finance', finnhub: 'finance',
  brevo: 'comms', resend: 'comms', sendgrid: 'comms', twilio: 'comms', telegram: 'comms',
  github: 'infra', cloudflare: 'infra', vercel: 'infra', netlify: 'infra', railway: 'infra',
  deepl: 'ai',
};

const SERVICE_EMOJIS: Record<string, string> = {
  anthropic: '🟧', openai: '🟦', groq: '🟪', gemini: '🟨', openrouter: '🟫',
  cohere: '🟩', mistral: '🟥', deepseek: '🟦', perplexity: '🔍',
  stripe: '💳', brevo: '✉️', resend: '📧', cloudflare: '☁️', github: '🐙',
  twilio: '📱', telegram: '✈️', elevenlabs: '🎙️', replicate: '🎨', deepl: '🌐',
  finnhub: '📈',
};

class FinancialDashboard {
  /**
   * Calcule burn rate temps réel basé sur usage des dernières 24h.
   */
  computeBurnRate(): BurnRate {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    let totalEur = 0;
    /* Aggregate tokens-dashboard usage history */
    try {
      const providers = ['anthropic', 'openai', 'groq', 'gemini', 'openrouter', 'cohere', 'mistral', 'deepseek', 'perplexity'];
      for (const p of providers) {
        const stats = tokensDashboard.getStats(p);
        for (const s of stats) {
          if (s.last_request_ts >= last24h) {
            totalEur += s.cost_usd * 0.92;
          }
        }
      }
    } catch {
      /* ignore */
    }
    const perDay = totalEur;
    const perHour = perDay / 24;
    const perMinute = perHour / 60;
    const perWeek = perDay * 7;
    /* Extrapolation mois calendaire (30j) */
    const perMonth = perDay * 30;
    return {
      per_minute_eur: perMinute,
      per_hour_eur: perHour,
      per_day_eur: perDay,
      per_week_eur: perWeek,
      per_month_extrapolated_eur: perMonth,
    };
  }

  /**
   * Aggregate services pour ligne par ligne.
   */
  getServiceLines(): readonly FinancialServiceLine[] {
    const all = consumptionMonitor.getAllStatuses();
    const now = Date.now();
    const dayAgo = now - 86400000;
    const lines: FinancialServiceLine[] = [];
    for (const s of all) {
      const stats = tokensDashboard.getStats(s.service);
      const total = stats.reduce((sum, x) => sum + x.cost_usd * 0.92, 0);
      const today = stats
        .filter((x) => x.last_request_ts >= dayAgo)
        .reduce((sum, x) => sum + x.cost_usd * 0.92, 0);
      /* Trend 7j basique : compare 1ère moitié vs 2e moitié */
      const history = consumptionMonitor.getHistory(s.service, 7);
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (history.length >= 4) {
        const half = Math.floor(history.length / 2);
        const firstHalfSum = history.slice(0, half).reduce((sum, h) => sum + h.used_eur, 0);
        const secondHalfSum = history.slice(half).reduce((sum, h) => sum + h.used_eur, 0);
        if (secondHalfSum > firstHalfSum * 1.2) trend = 'up';
        else if (secondHalfSum < firstHalfSum * 0.8) trend = 'down';
      }
      lines.push({
        service: s.service,
        category: SERVICE_CATEGORIES[s.service] ?? 'other',
        used_eur_today: today,
        used_eur_month: s.used_eur_current_period,
        used_eur_total: total,
        budget_eur_month: s.budget_eur_month,
        pct_budget: s.pct_used,
        is_free_tier: s.budget_eur_month === 0 && s.used_eur_current_period === 0,
        status: s.severity,
        trend_7d: trend,
        emoji: SERVICE_EMOJIS[s.service] ?? '⚙️',
      });
    }
    return lines;
  }

  /**
   * Économies via routing free-first (estimation).
   * Si tout passait par Anthropic au lieu free providers → coût supplémentaire.
   */
  computeFreeSavings(): number {
    const lines = this.getServiceLines();
    let saved = 0;
    /* Pour chaque service free utilisé : estime ce que ça aurait coûté si Anthropic */
    for (const l of lines) {
      if (['groq', 'gemini', 'openrouter', 'deepseek'].includes(l.service)) {
        /* Tokens utilisés × prix Anthropic 8€/M */
        const stats = tokensDashboard.getStats(l.service);
        const totalTokens = stats.reduce((s, x) => s + x.input_tokens + x.output_tokens, 0);
        saved += (totalTokens / 1_000_000) * 8;
      }
    }
    return saved;
  }

  /**
   * Projection fin de mois basée sur burn rate actuel.
   */
  computeProjectionEndMonth(): number {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysRemaining = Math.max(0, (endOfMonth.getTime() - now.getTime()) / 86400000);
    const burn = this.computeBurnRate();
    const lines = this.getServiceLines();
    const currentMonth = lines.reduce((s, l) => s + l.used_eur_month, 0);
    return currentMonth + (burn.per_day_eur * daysRemaining);
  }

  /**
   * ROI si Apex commercialisé (revenu - coût).
   */
  computeROI(): FinancialSummary['roi'] {
    /* Compte paying users via commerce service */
    let payingUsers = 0;
    try {
      const usersRaw = localStorage.getItem('apex_v13_users');
      const users = JSON.parse(usersRaw ?? '[]') as Array<{ id?: string; tier?: string }>;
      for (const u of users) {
        if (u.id && u.tier && u.tier !== 'free') {
          const plan = commerce.getEffectivePlan(u.id);
          if (plan !== 'free') payingUsers++;
        }
      }
    } catch {
      /* ignore */
    }
    /* Avg revenue per paying user 19€/mois (basic) */
    const avgRevenuePerUser = 19;
    const monthlyRevenue = payingUsers * avgRevenuePerUser;
    const lines = this.getServiceLines();
    const monthlyCost = lines.reduce((s, l) => s + l.used_eur_month, 0);
    const monthlyProfit = monthlyRevenue - monthlyCost;
    const marginPct = monthlyRevenue > 0 ? Math.round((monthlyProfit / monthlyRevenue) * 100) : 0;
    /* Break-even : combien de users payants pour couvrir coût ? */
    const breakevenUsers = avgRevenuePerUser > 0 ? Math.ceil(monthlyCost / avgRevenuePerUser) : 0;
    return {
      paying_users: payingUsers,
      monthly_revenue_eur: monthlyRevenue,
      monthly_cost_eur: monthlyCost,
      monthly_profit_eur: monthlyProfit,
      margin_pct: marginPct,
      breakeven_users: breakevenUsers,
    };
  }

  /**
   * Sortie complète FinancialSummary.
   */
  getSummary(): FinancialSummary {
    const lines = this.getServiceLines();
    const burn = this.computeBurnRate();
    const totalToday = lines.reduce((s, l) => s + l.used_eur_today, 0);
    const totalMonth = lines.reduce((s, l) => s + l.used_eur_month, 0);
    const totalBudget = lines.reduce((s, l) => s + l.budget_eur_month, 0);
    const pctBudget = totalBudget > 0 ? Math.round((totalMonth / totalBudget) * 100) : 0;
    const alertsCount = lines.filter((l) => l.status !== 'ok' && l.budget_eur_month > 0).length;
    const healthEmoji = alertsCount === 0 ? '✅' : alertsCount <= 2 ? '⚠️' : '🚨';
    return {
      total_today_eur: totalToday,
      total_month_eur: totalMonth,
      total_budget_month_eur: totalBudget,
      total_pct_budget: pctBudget,
      burn_rate: burn,
      services: lines,
      free_savings_month_eur: this.computeFreeSavings(),
      projection_end_month_eur: this.computeProjectionEndMonth(),
      comparison_vs_competition: COMPETITION_BENCHMARKS,
      roi: this.computeROI(),
      alerts_count: alertsCount,
      health_emoji: healthEmoji,
    };
  }

  /**
   * Heatmap usage par heure (24 cells) sur les 7 derniers jours.
   * Pour graph dashboard.
   */
  getHourlyHeatmap(): number[] {
    const buckets = Array.from({ length: 24 }, () => 0);
    try {
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const providers = ['anthropic', 'openai', 'groq', 'gemini'];
      for (const p of providers) {
        const stats = tokensDashboard.getStats(p);
        for (const s of stats) {
          if (s.last_request_ts >= sevenDaysAgo) {
            const hour = new Date(s.last_request_ts).getHours();
            const bucket = buckets[hour];
            if (typeof bucket === 'number') {
              buckets[hour] = bucket + s.cost_usd * 0.92;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    return buckets;
  }

  /**
   * Sparkline data (8 points) pour graph dashboard.
   */
  getSparklineMonth(): readonly { ts: number; eur: number }[] {
    const history = consumptionMonitor.getHistory(undefined, 30);
    /* Garde 8 points équi-répartis */
    if (history.length === 0) return [];
    const step = Math.max(1, Math.floor(history.length / 8));
    const sparks: Array<{ ts: number; eur: number }> = [];
    for (let i = 0; i < history.length; i += step) {
      const h = history[i];
      if (h) sparks.push({ ts: h.ts, eur: h.used_eur });
    }
    return sparks.slice(0, 8);
  }

  /**
   * Format human-readable pour affichage UI.
   */
  formatEur(eur: number): string {
    if (eur < 0.01) return '< 0.01€';
    if (eur < 1) return `${(eur * 100).toFixed(1)}c`;
    if (eur < 10) return `${eur.toFixed(2)}€`;
    return `${eur.toFixed(0)}€`;
  }

  /**
   * Bilan exécutif texte (pour notif Kevin email/Telegram).
   */
  executiveSummary(): string {
    const s = this.getSummary();
    const lines: string[] = [
      `💰 BILAN APEX ${new Date().toLocaleDateString('fr-FR')}`,
      '',
      `Aujourd'hui : ${this.formatEur(s.total_today_eur)}`,
      `Ce mois : ${this.formatEur(s.total_month_eur)} / ${this.formatEur(s.total_budget_month_eur)} budget (${s.total_pct_budget}%)`,
      `Projection fin mois : ${this.formatEur(s.projection_end_month_eur)}`,
      '',
      `🔥 Burn rate : ${this.formatEur(s.burn_rate.per_hour_eur)}/h, ${this.formatEur(s.burn_rate.per_day_eur)}/jour`,
      `💸 Économisé via free-first : ${this.formatEur(s.free_savings_month_eur)}`,
      '',
      `📊 ROI : ${s.roi.paying_users} users payants, ${this.formatEur(s.roi.monthly_revenue_eur)} revenu, ${this.formatEur(s.roi.monthly_profit_eur)} profit (${s.roi.margin_pct}%)`,
      `🎯 Break-even : ${s.roi.breakeven_users} users payants pour couvrir`,
      '',
      `${s.health_emoji} ${s.alerts_count} services en alerte`,
    ];
    return lines.join('\n');
  }
}

export const financialDashboard = new FinancialDashboard();
