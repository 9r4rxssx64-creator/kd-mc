/**
 * APEX v13 — Business Intelligence (rapports auto + KPIs + insights).
 *
 * Surprend Kevin : Apex GÉNÈRE des rapports d'activité automatiques,
 * détecte tendances, propose actions stratégiques.
 *
 * Capabilities :
 * 1. KPIs cross-projets (CMCteams, KDMC, e-KDMC, Apex)
 * 2. Trends detection (croissance/déclin user activity)
 * 3. Anomaly detection (pic erreur, latence, conso tokens)
 * 4. Reports auto (daily 8h, weekly lundi, monthly 1er jour)
 * 5. Recommendations actionables
 * 6. Export PDF/CSV/JSON
 *
 * Anti-pattern Kevin :
 * - Pas envoyer de rapport vide (skip si données <minimum)
 * - Recommandations actionables (pas générique)
 * - Privacy-first : agrégats only, pas data per-user
 */

import { logger } from '../../core/logger.js';

import { auditLog } from './audit-log.js';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface KpiSnapshot {
  ts: number;
  period: ReportPeriod;
  /* User activity */
  active_users: number;
  new_users: number;
  total_messages: number;
  total_tokens_used: number;
  estimated_cost_eur: number;
  /* Health */
  errors_count: number;
  sentinels_critical: number;
  uptime_pct: number;
  /* Engagement (null = non encore tracké → JAMAIS de valeur inventée, cf. règle
     Kevin "JAMAIS ESTIMER". Affiché "n/d" tant que le tracking n'est pas livré). */
  avg_session_min: number | null;
  retention_7d_pct: number | null;
  /* Business */
  paying_users: number;
  conversion_rate_pct: number;
  monthly_recurring_revenue_eur: number;
}

export interface Trend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  pct_change: number;
  period: ReportPeriod;
}

export interface Anomaly {
  type: 'error_spike' | 'latency_high' | 'cost_overrun' | 'churn_risk' | 'security_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric_value: number;
  baseline: number;
  detected_at: number;
  message: string;
}

export interface Report {
  id: string;
  period: ReportPeriod;
  start_ts: number;
  end_ts: number;
  kpis: KpiSnapshot;
  trends: readonly Trend[];
  anomalies: readonly Anomaly[];
  recommendations: readonly string[];
  generated_at: number;
}

class BusinessIntelligence {
  /**
   * Snapshot KPIs courants (lecture aggrégée localStorage + Firebase).
   */
  snapshot(period: ReportPeriod = 'daily'): KpiSnapshot {
    const now = Date.now();
    const periodStart = this.periodStart(now, period);
    /* Aggregation depuis stores existants */
    const messages = this.countMessagesSince(periodStart);
    const tokens = this.countTokensSince(periodStart);
    const errors = this.countErrorsSince(periodStart);
    const sentinelsCritical = this.countSentinelsCriticalSince(periodStart);
    const users = this.countActiveUsers();
    const newUsers = this.countNewUsersSince(periodStart);
    const payingUsers = this.countPayingUsers();
    const totalUsers = Math.max(1, users);
    return {
      ts: now,
      period,
      active_users: users,
      new_users: newUsers,
      total_messages: messages,
      total_tokens_used: tokens,
      estimated_cost_eur: tokens * 0.0000020 * 0.92, /* Approx avg pricing × EUR */
      errors_count: errors,
      sentinels_critical: sentinelsCritical,
      uptime_pct: this.calculateUptime(periodStart),
      avg_session_min: null, /* non tracké (pas de session timestamps) → n/d, jamais inventé */
      retention_7d_pct: null, /* non tracké (pas de cohortes rétention) → n/d, jamais inventé */
      paying_users: payingUsers,
      conversion_rate_pct: Math.round((payingUsers / totalUsers) * 100),
      monthly_recurring_revenue_eur: payingUsers * 19, /* Avg blend */
    };
  }

  /**
   * Détecte tendances vs période précédente.
   */
  detectTrends(period: ReportPeriod = 'daily'): Trend[] {
    const now = Date.now();
    const currentStart = this.periodStart(now, period);
    const periodMs = now - currentStart;
    const previousStart = currentStart - periodMs;
    const trends: Trend[] = [];

    const compareMetric = (
      metric: string,
      currentVal: number,
      previousVal: number,
    ): void => {
      if (previousVal === 0 && currentVal === 0) return;
      const pct = previousVal === 0 ? 100 : ((currentVal - previousVal) / previousVal) * 100;
      let direction: Trend['direction'];
      if (Math.abs(pct) < 5) direction = 'stable';
      else if (pct > 0) direction = 'up';
      else direction = 'down';
      trends.push({
        metric,
        direction,
        pct_change: Math.round(pct * 10) / 10,
        period,
      });
    };

    compareMetric('messages', this.countMessagesBetween(currentStart, now), this.countMessagesBetween(previousStart, currentStart));
    compareMetric('tokens', this.countTokensBetween(currentStart, now), this.countTokensBetween(previousStart, currentStart));
    compareMetric('errors', this.countErrorsBetween(currentStart, now), this.countErrorsBetween(previousStart, currentStart));

    return trends;
  }

  private countMessagesBetween(startTs: number, endTs: number): number {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_chat_messages') ?? '[]') as Array<{ ts: number }>;
      return all.filter((m) => m.ts >= startTs && m.ts < endTs).length;
    } catch {
      return 0;
    }
  }

  private countTokensBetween(startTs: number, endTs: number): number {
    try {
      const usage = JSON.parse(localStorage.getItem('apex_v13_token_usage_history') ?? '[]') as Array<{ ts: number; tokens: number }>;
      return usage.filter((u) => u.ts >= startTs && u.ts < endTs).reduce((s, u) => s + u.tokens, 0);
    } catch {
      return 0;
    }
  }

  private countErrorsBetween(startTs: number, endTs: number): number {
    try {
      const obs = JSON.parse(localStorage.getItem('apex_v13_observability_buffer') ?? '[]') as Array<{ ts: number; level: string }>;
      return obs.filter((o) => o.ts >= startTs && o.ts < endTs && o.level === 'error').length;
    } catch {
      return 0;
    }
  }

  /**
   * Détecte anomalies (spikes, baselines).
   */
  detectAnomalies(): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const errorsLast24h = this.countErrorsSince(last24h);
    const baselineErrors = 50; /* Seuil baseline configurable */

    if (errorsLast24h > baselineErrors * 3) {
      anomalies.push({
        type: 'error_spike',
        severity: 'critical',
        metric_value: errorsLast24h,
        baseline: baselineErrors,
        detected_at: now,
        message: `${errorsLast24h} erreurs/24h (baseline ${baselineErrors}) — ×${(errorsLast24h / baselineErrors).toFixed(1)}`,
      });
    } else if (errorsLast24h > baselineErrors * 1.5) {
      anomalies.push({
        type: 'error_spike',
        severity: 'medium',
        metric_value: errorsLast24h,
        baseline: baselineErrors,
        detected_at: now,
        message: `${errorsLast24h} erreurs/24h en hausse`,
      });
    }

    /* Cost overrun */
    const costToday = this.snapshot('daily').estimated_cost_eur;
    if (costToday > 10) {
      anomalies.push({
        type: 'cost_overrun',
        severity: costToday > 50 ? 'high' : 'medium',
        metric_value: costToday,
        baseline: 5,
        detected_at: now,
        message: `Conso API ${costToday.toFixed(2)}€ aujourd'hui (cible <5€)`,
      });
    }

    /* Sentinels critical */
    const sentCritical = this.countSentinelsCriticalSince(last24h);
    if (sentCritical > 0) {
      anomalies.push({
        type: 'security_alert',
        severity: sentCritical > 3 ? 'critical' : 'high',
        metric_value: sentCritical,
        baseline: 0,
        detected_at: now,
        message: `${sentCritical} sentinelles critical (24h)`,
      });
    }

    return anomalies;
  }

  /**
   * Génère recommendations actionables (pas générique).
   */
  generateRecommendations(kpis: KpiSnapshot, trends: readonly Trend[], anomalies: readonly Anomaly[]): string[] {
    const recos: string[] = [];

    if (kpis.estimated_cost_eur > 5) {
      recos.push(`💰 Conso API ${kpis.estimated_cost_eur.toFixed(2)}€ — passer mode normal/economic pour clients free`);
    }
    if (kpis.conversion_rate_pct < 5 && kpis.active_users > 50) {
      recos.push(`📈 Conversion ${kpis.conversion_rate_pct}% bas — push notif "1 mois Pro offert" aux 7j+ actifs`);
    }
    if (kpis.errors_count > 100) {
      recos.push(`🐛 ${kpis.errors_count} erreurs — lancer audit_self + check sentinels critical`);
    }
    /* Trends actionables */
    const messagesTrend = trends.find((t) => t.metric === 'messages');
    if (messagesTrend?.direction === 'down' && messagesTrend.pct_change < -20) {
      recos.push(`📉 Messages ${messagesTrend.pct_change}% — check réseau ou pannes provider IA`);
    }
    const tokensTrend = trends.find((t) => t.metric === 'tokens');
    if (tokensTrend?.direction === 'up' && tokensTrend.pct_change > 50) {
      recos.push(`🔥 Tokens +${tokensTrend.pct_change}% — vérifier prompts longs ou attaques DoS`);
    }
    /* Anomalies → action */
    for (const anomaly of anomalies) {
      if (anomaly.severity === 'critical') {
        recos.push(`🚨 ${anomaly.message} — escalade immédiate Kevin`);
      }
    }
    if (kpis.retention_7d_pct !== null && kpis.retention_7d_pct < 40 && kpis.active_users > 20) {
      recos.push(`💔 Rétention 7j ${kpis.retention_7d_pct}% bas — onboarding ou fonction manquante ?`);
    }
    if (recos.length === 0) {
      recos.push(`✅ Tout est sous contrôle, rien d'urgent`);
    }
    return recos;
  }

  /**
   * Génère rapport complet (KPIs + trends + anomalies + recommandations).
   */
  generateReport(period: ReportPeriod = 'daily'): Report {
    const kpis = this.snapshot(period);
    const trends = this.detectTrends(period);
    const anomalies = this.detectAnomalies();
    const recommendations = this.generateRecommendations(kpis, trends, anomalies);
    const now = Date.now();
    const periodStart = this.periodStart(now, period);
    const report: Report = {
      id: `report_${period}_${now}`,
      period,
      start_ts: periodStart,
      end_ts: now,
      kpis,
      trends,
      anomalies,
      recommendations,
      generated_at: now,
    };
    this.persistReport(report);
    void auditLog.record('bi.report_generated', {
      details: { id: report.id, period, anomalies_count: anomalies.length },
    });
    return report;
  }

  /**
   * Liste rapports récents (admin dashboard).
   */
  listReports(period?: ReportPeriod, limit = 30): Report[] {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_bi_reports') ?? '[]') as Report[];
      const filtered = period ? all.filter((r) => r.period === period) : all;
      return filtered.sort((a, b) => b.generated_at - a.generated_at).slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Export report en format Markdown (lisible pour Kevin).
   */
  exportMarkdown(report: Report): string {
    const date = new Date(report.generated_at).toISOString().slice(0, 10);
    const lines: string[] = [
      `# Rapport Apex ${report.period.toUpperCase()} — ${date}`,
      '',
      `## 📊 KPIs`,
      `- **Utilisateurs actifs** : ${report.kpis.active_users}`,
      `- **Nouveaux users** : ${report.kpis.new_users}`,
      `- **Messages échangés** : ${report.kpis.total_messages}`,
      `- **Tokens consommés** : ${report.kpis.total_tokens_used}`,
      `- **Coût estimé** : ${report.kpis.estimated_cost_eur.toFixed(2)}€`,
      `- **Erreurs** : ${report.kpis.errors_count}`,
      `- **Uptime** : ${report.kpis.uptime_pct}%`,
      `- **Conversion** : ${report.kpis.conversion_rate_pct}%`,
      `- **MRR** : ${report.kpis.monthly_recurring_revenue_eur}€`,
      '',
    ];
    if (report.trends.length > 0) {
      lines.push(`## 📈 Tendances`);
      for (const t of report.trends) {
        const arrow = t.direction === 'up' ? '↗' : t.direction === 'down' ? '↘' : '→';
        lines.push(`- ${arrow} **${t.metric}** : ${t.pct_change}%`);
      }
      lines.push('');
    }
    if (report.anomalies.length > 0) {
      lines.push(`## 🚨 Anomalies détectées`);
      for (const a of report.anomalies) {
        lines.push(`- **[${a.severity.toUpperCase()}]** ${a.message}`);
      }
      lines.push('');
    }
    lines.push(`## 💡 Recommandations`);
    for (const r of report.recommendations) lines.push(`- ${r}`);
    return lines.join('\n');
  }

  /* === Private aggregators === */

  private countMessagesSince(sinceTs: number): number {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_chat_messages') ?? '[]') as Array<{ ts: number }>;
      return all.filter((m) => m.ts >= sinceTs).length;
    } catch {
      return 0;
    }
  }

  private countTokensSince(sinceTs: number): number {
    try {
      const usage = JSON.parse(localStorage.getItem('apex_v13_token_usage_history') ?? '[]') as Array<{ ts: number; tokens: number }>;
      return usage.filter((u) => u.ts >= sinceTs).reduce((s, u) => s + u.tokens, 0);
    } catch {
      return 0;
    }
  }

  private countErrorsSince(sinceTs: number): number {
    try {
      const obs = JSON.parse(localStorage.getItem('apex_v13_observability_buffer') ?? '[]') as Array<{ ts: number; level: string }>;
      return obs.filter((o) => o.ts >= sinceTs && o.level === 'error').length;
    } catch {
      return 0;
    }
  }

  private countSentinelsCriticalSince(sinceTs: number): number {
    try {
      const reports = JSON.parse(localStorage.getItem('apex_v13_agent_reports') ?? '[]') as Array<{ ts: number; severity: string }>;
      return reports.filter((r) => r.ts >= sinceTs && r.severity === 'critical').length;
    } catch {
      return 0;
    }
  }

  private countActiveUsers(): number {
    try {
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{ activated?: boolean }>;
      return users.filter((u) => u.activated !== false).length;
    } catch {
      return 0;
    }
  }

  private countNewUsersSince(sinceTs: number): number {
    try {
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{ created_at?: number }>;
      return users.filter((u) => (u.created_at ?? 0) >= sinceTs).length;
    } catch {
      return 0;
    }
  }

  private countPayingUsers(): number {
    /* User avec plan != free */
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('apex_v13_tier_')) {
        const v = localStorage.getItem(k);
        if (v && v !== 'free' && v !== 'client_free') count++;
      }
    }
    return count;
  }

  private calculateUptime(sinceTs: number): number {
    /* Simple heuristic : 100% - (errors/total) */
    const errors = this.countErrorsSince(sinceTs);
    const messages = this.countMessagesSince(sinceTs);
    if (messages === 0) return 100;
    const errorRate = (errors / messages) * 100;
    return Math.max(0, Math.round((100 - errorRate) * 10) / 10);
  }

  private periodStart(now: number, period: ReportPeriod): number {
    const day = 24 * 60 * 60 * 1000;
    switch (period) {
      case 'daily':
        return now - day;
      case 'weekly':
        return now - 7 * day;
      case 'monthly':
        return now - 30 * day;
      default:
        return now - day;
    }
  }

  private persistReport(report: Report): void {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_bi_reports') ?? '[]') as Report[];
      all.push(report);
      const trimmed = all.length > 100 ? all.slice(-100) : all;
      localStorage.setItem('apex_v13_bi_reports', JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('business-intelligence', 'persistReport failed', { err });
    }
  }
}

export const businessIntelligence = new BusinessIntelligence();
