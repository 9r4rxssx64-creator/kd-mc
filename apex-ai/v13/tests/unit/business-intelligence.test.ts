/**
 * Tests business-intelligence.ts (rapports auto + KPIs + insights).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { businessIntelligence } from '../../services/observability/business-intelligence.js';

describe('Business Intelligence (rapports auto)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('snapshot KPIs', () => {
    it('retourne snapshot avec defaults pour state vide', () => {
      const snap = businessIntelligence.snapshot('daily');
      expect(snap.period).toBe('daily');
      expect(snap.active_users).toBe(0);
      expect(snap.total_messages).toBe(0);
      expect(snap.errors_count).toBe(0);
      expect(snap.uptime_pct).toBe(100); /* 0 messages, 0 errors → 100% */
    });

    it('compte messages depuis chat-messages localStorage', () => {
      const messages = [
        { ts: Date.now() - 1000, content: 'a' },
        { ts: Date.now() - 2000, content: 'b' },
        { ts: Date.now() - 3 * 24 * 60 * 60 * 1000, content: 'old' },
      ];
      localStorage.setItem('apex_v13_chat_messages', JSON.stringify(messages));
      const snap = businessIntelligence.snapshot('daily');
      /* daily = derniers 24h → 2 messages */
      expect(snap.total_messages).toBe(2);
    });

    it('compte erreurs depuis observability buffer', () => {
      const errs = [
        { ts: Date.now(), level: 'error' },
        { ts: Date.now(), level: 'warning' },
        { ts: Date.now(), level: 'error' },
      ];
      localStorage.setItem('apex_v13_observability_buffer', JSON.stringify(errs));
      const snap = businessIntelligence.snapshot('daily');
      expect(snap.errors_count).toBe(2);
    });

    it('compte paying users (tier != free)', () => {
      localStorage.setItem('apex_v13_tier_user1', 'pro');
      localStorage.setItem('apex_v13_tier_user2', 'business');
      localStorage.setItem('apex_v13_tier_user3', 'free');
      const snap = businessIntelligence.snapshot('daily');
      expect(snap.paying_users).toBe(2);
    });

    it('estimated_cost_eur calculé depuis tokens', () => {
      const usage = [
        { ts: Date.now(), tokens: 1000000 },
        { ts: Date.now(), tokens: 500000 },
      ];
      localStorage.setItem('apex_v13_token_usage_history', JSON.stringify(usage));
      const snap = businessIntelligence.snapshot('daily');
      expect(snap.total_tokens_used).toBe(1500000);
      expect(snap.estimated_cost_eur).toBeGreaterThan(0);
    });
  });

  describe('detectTrends', () => {
    it('aucune data → trends array vide ou stable', () => {
      const trends = businessIntelligence.detectTrends('daily');
      expect(Array.isArray(trends)).toBe(true);
    });

    it('trends sur metrics messages/tokens/errors', () => {
      const messages = Array.from({ length: 10 }, (_, i) => ({
        ts: Date.now() - (i * 60 * 1000),
        content: 'test',
      }));
      localStorage.setItem('apex_v13_chat_messages', JSON.stringify(messages));
      const trends = businessIntelligence.detectTrends('daily');
      expect(trends.every((t) => ['up', 'down', 'stable'].includes(t.direction))).toBe(true);
    });

    it('detect direction "up" quand current > previous', () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      /* 2 messages dans la période précédente, 20 dans la période courante */
      const previous = Array.from({ length: 2 }, (_, i) => ({ ts: now - dayMs - i * 1000, content: 'old' }));
      const current = Array.from({ length: 20 }, (_, i) => ({ ts: now - i * 60 * 1000, content: 'new' }));
      localStorage.setItem('apex_v13_chat_messages', JSON.stringify([...previous, ...current]));
      const trends = businessIntelligence.detectTrends('daily');
      const msgTrend = trends.find((t) => t.metric === 'messages');
      expect(msgTrend?.direction).toBe('up');
      expect(msgTrend?.pct_change).toBeGreaterThan(0);
    });

    it('detect direction "down" quand current < previous', () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      /* 30 erreurs dans la période précédente, 3 dans la période courante */
      const previous = Array.from({ length: 30 }, (_, i) => ({ ts: now - dayMs - i * 1000, level: 'error' }));
      const current = Array.from({ length: 3 }, (_, i) => ({ ts: now - i * 60 * 1000, level: 'error' }));
      localStorage.setItem('apex_v13_observability_buffer', JSON.stringify([...previous, ...current]));
      const trends = businessIntelligence.detectTrends('daily');
      const errTrend = trends.find((t) => t.metric === 'errors');
      expect(errTrend?.direction).toBe('down');
      expect(errTrend?.pct_change).toBeLessThan(0);
    });

    it('detect direction "stable" quand variation < 5%', () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      /* 100 tokens previous, 102 tokens current (variation 2%) */
      const usage = [
        { ts: now - dayMs - 1000, tokens: 100 },
        { ts: now - 1000, tokens: 102 },
      ];
      localStorage.setItem('apex_v13_token_usage_history', JSON.stringify(usage));
      const trends = businessIntelligence.detectTrends('daily');
      const tokTrend = trends.find((t) => t.metric === 'tokens');
      expect(tokTrend?.direction).toBe('stable');
    });
  });

  describe('detectAnomalies', () => {
    it('aucune anomalie en état normal', () => {
      const anomalies = businessIntelligence.detectAnomalies();
      expect(Array.isArray(anomalies)).toBe(true);
    });

    it('error spike > 3× baseline → critical', () => {
      const errs = Array.from({ length: 200 }, () => ({ ts: Date.now(), level: 'error' }));
      localStorage.setItem('apex_v13_observability_buffer', JSON.stringify(errs));
      const anomalies = businessIntelligence.detectAnomalies();
      const spike = anomalies.find((a) => a.type === 'error_spike');
      expect(spike?.severity).toBe('critical');
    });

    it('error spike > 1.5× baseline → medium', () => {
      const errs = Array.from({ length: 80 }, () => ({ ts: Date.now(), level: 'error' }));
      localStorage.setItem('apex_v13_observability_buffer', JSON.stringify(errs));
      const anomalies = businessIntelligence.detectAnomalies();
      const spike = anomalies.find((a) => a.type === 'error_spike');
      expect(spike?.severity).toBe('medium');
    });

    it('cost overrun détecté > 10€', () => {
      const usage = [{ ts: Date.now(), tokens: 50_000_000 }]; /* énorme */
      localStorage.setItem('apex_v13_token_usage_history', JSON.stringify(usage));
      const anomalies = businessIntelligence.detectAnomalies();
      const cost = anomalies.find((a) => a.type === 'cost_overrun');
      expect(cost).toBeDefined();
    });

    it('sentinels critical détecté', () => {
      const reports = [
        { ts: Date.now(), severity: 'critical' },
        { ts: Date.now(), severity: 'critical' },
      ];
      localStorage.setItem('apex_v13_agent_reports', JSON.stringify(reports));
      const anomalies = businessIntelligence.detectAnomalies();
      const sec = anomalies.find((a) => a.type === 'security_alert');
      expect(sec).toBeDefined();
    });
  });

  describe('generateRecommendations actionables', () => {
    it('cost > 5€ → recommandation mode économique', () => {
      const kpis = businessIntelligence.snapshot('daily');
      const recos = businessIntelligence.generateRecommendations(
        { ...kpis, estimated_cost_eur: 8 },
        [],
        [],
      );
      expect(recos.some((r) => r.includes('Conso API') || r.includes('economic'))).toBe(true);
    });

    it('aucune action urgente → recommandation positive', () => {
      const kpis = businessIntelligence.snapshot('daily');
      const recos = businessIntelligence.generateRecommendations(
        { ...kpis, estimated_cost_eur: 0, errors_count: 0, conversion_rate_pct: 50, retention_7d_pct: 80 },
        [],
        [],
      );
      expect(recos.some((r) => r.includes('contrôle') || r.includes('rien'))).toBe(true);
    });

    it('errors > 100 → recommandation audit_self', () => {
      const kpis = businessIntelligence.snapshot('daily');
      const recos = businessIntelligence.generateRecommendations(
        { ...kpis, errors_count: 150 },
        [],
        [],
      );
      expect(recos.some((r) => r.includes('audit') || r.includes('erreurs'))).toBe(true);
    });
  });

  describe('generateReport complet', () => {
    it('génère report avec id + period + kpis + trends + anomalies + recommendations', () => {
      const report = businessIntelligence.generateReport('daily');
      expect(report.id).toMatch(/^report_daily_/);
      expect(report.period).toBe('daily');
      expect(report.kpis).toBeDefined();
      expect(Array.isArray(report.trends)).toBe(true);
      expect(Array.isArray(report.anomalies)).toBe(true);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('persist report dans apex_v13_bi_reports', () => {
      businessIntelligence.generateReport('weekly');
      const stored = JSON.parse(localStorage.getItem('apex_v13_bi_reports') ?? '[]') as unknown[];
      expect(stored.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('listReports + filter', () => {
    it('listReports filter par period', () => {
      businessIntelligence.generateReport('daily');
      businessIntelligence.generateReport('weekly');
      businessIntelligence.generateReport('monthly');
      const daily = businessIntelligence.listReports('daily');
      expect(daily.every((r) => r.period === 'daily')).toBe(true);
    });

    it('listReports limit', () => {
      for (let i = 0; i < 5; i++) businessIntelligence.generateReport('daily');
      const limited = businessIntelligence.listReports('daily', 3);
      expect(limited.length).toBeLessThanOrEqual(3);
    });
  });

  describe('exportMarkdown', () => {
    it('formate report en Markdown lisible', () => {
      const report = businessIntelligence.generateReport('daily');
      const md = businessIntelligence.exportMarkdown(report);
      expect(md).toContain('# Rapport Apex DAILY');
      expect(md).toContain('## 📊 KPIs');
      expect(md).toContain('## 💡 Recommandations');
    });

    it('inclut tendances si présentes', () => {
      const messages = [{ ts: Date.now(), content: 'x' }];
      localStorage.setItem('apex_v13_chat_messages', JSON.stringify(messages));
      const report = businessIntelligence.generateReport('daily');
      const md = businessIntelligence.exportMarkdown(report);
      if (report.trends.length > 0) expect(md).toContain('## 📈 Tendances');
    });

    it('inclut anomalies si présentes', () => {
      const errs = Array.from({ length: 200 }, () => ({ ts: Date.now(), level: 'error' }));
      localStorage.setItem('apex_v13_observability_buffer', JSON.stringify(errs));
      const report = businessIntelligence.generateReport('daily');
      const md = businessIntelligence.exportMarkdown(report);
      expect(md).toContain('## 🚨 Anomalies');
    });
  });
});
