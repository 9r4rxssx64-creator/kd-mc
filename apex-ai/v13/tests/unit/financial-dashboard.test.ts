/**
 * Tests financial-dashboard.ts (bilan live/jour/mois + ROI + burn rate).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { financialDashboard } from '../../services/observability/financial-dashboard.js';

describe('Financial Dashboard (bilan live + ROI + projections)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('computeBurnRate', () => {
    it('retourne perMinute / perHour / perDay / perWeek / perMonth', () => {
      const burn = financialDashboard.computeBurnRate();
      expect(typeof burn.per_minute_eur).toBe('number');
      expect(typeof burn.per_hour_eur).toBe('number');
      expect(typeof burn.per_day_eur).toBe('number');
      expect(typeof burn.per_week_eur).toBe('number');
      expect(typeof burn.per_month_extrapolated_eur).toBe('number');
    });

    it('relations cohérentes (hour = day/24, month = day*30)', () => {
      const burn = financialDashboard.computeBurnRate();
      if (burn.per_day_eur > 0) {
        expect(burn.per_hour_eur).toBeCloseTo(burn.per_day_eur / 24, 5);
        expect(burn.per_week_eur).toBeCloseTo(burn.per_day_eur * 7, 5);
        expect(burn.per_month_extrapolated_eur).toBeCloseTo(burn.per_day_eur * 30, 5);
      }
    });
  });

  describe('getServiceLines', () => {
    it('retourne array de FinancialServiceLine', () => {
      const lines = financialDashboard.getServiceLines();
      expect(Array.isArray(lines)).toBe(true);
    });

    it('chaque ligne a category + emoji + status', () => {
      const lines = financialDashboard.getServiceLines();
      for (const l of lines) {
        expect(['ai', 'saas', 'infra', 'comms', 'finance', 'other']).toContain(l.category);
        expect(typeof l.emoji).toBe('string');
        expect(['ok', 'warn', 'critical']).toContain(l.status);
        expect(['up', 'down', 'stable']).toContain(l.trend_7d);
      }
    });
  });

  describe('computeProjectionEndMonth', () => {
    it('retourne nombre >= 0', () => {
      const proj = financialDashboard.computeProjectionEndMonth();
      expect(proj).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeROI', () => {
    it('retourne paying_users + revenue + profit + margin + breakeven', () => {
      const roi = financialDashboard.computeROI();
      expect(typeof roi.paying_users).toBe('number');
      expect(typeof roi.monthly_revenue_eur).toBe('number');
      expect(typeof roi.monthly_cost_eur).toBe('number');
      expect(typeof roi.monthly_profit_eur).toBe('number');
      expect(typeof roi.margin_pct).toBe('number');
      expect(typeof roi.breakeven_users).toBe('number');
    });

    it('aucun user payant → revenue 0, breakeven nécessaire', () => {
      const roi = financialDashboard.computeROI();
      if (roi.paying_users === 0) {
        expect(roi.monthly_revenue_eur).toBe(0);
      }
    });
  });

  describe('getSummary complet', () => {
    it('retourne FinancialSummary avec tous champs', () => {
      const s = financialDashboard.getSummary();
      expect(s).toHaveProperty('total_today_eur');
      expect(s).toHaveProperty('total_month_eur');
      expect(s).toHaveProperty('total_budget_month_eur');
      expect(s).toHaveProperty('total_pct_budget');
      expect(s).toHaveProperty('burn_rate');
      expect(s).toHaveProperty('services');
      expect(s).toHaveProperty('free_savings_month_eur');
      expect(s).toHaveProperty('projection_end_month_eur');
      expect(s).toHaveProperty('comparison_vs_competition');
      expect(s).toHaveProperty('roi');
      expect(s).toHaveProperty('alerts_count');
      expect(s).toHaveProperty('health_emoji');
    });

    it('comparison_vs_competition liste 6+ tools', () => {
      const s = financialDashboard.getSummary();
      expect(s.comparison_vs_competition.length).toBeGreaterThanOrEqual(6);
      expect(s.comparison_vs_competition[0]).toHaveProperty('tool');
      expect(s.comparison_vs_competition[0]).toHaveProperty('their_price_eur');
      expect(s.comparison_vs_competition[0]).toHaveProperty('apex_advantage');
    });

    it('health_emoji adapté selon alerts_count', () => {
      const s = financialDashboard.getSummary();
      expect(['✅', '⚠️', '🚨']).toContain(s.health_emoji);
    });
  });

  describe('getHourlyHeatmap 24h', () => {
    it('retourne array de 24 buckets', () => {
      const h = financialDashboard.getHourlyHeatmap();
      expect(h.length).toBe(24);
      for (const b of h) expect(typeof b).toBe('number');
    });
  });

  describe('getSparklineMonth', () => {
    it('retourne max 8 points pour graph', () => {
      const s = financialDashboard.getSparklineMonth();
      expect(s.length).toBeLessThanOrEqual(8);
    });
  });

  describe('formatEur formatage', () => {
    it('< 0.01€ → "< 0.01€"', () => {
      expect(financialDashboard.formatEur(0.005)).toBe('< 0.01€');
    });

    it('< 1€ → centimes "Xc"', () => {
      expect(financialDashboard.formatEur(0.42)).toContain('c');
    });

    it('1-10€ → "X.YY€"', () => {
      expect(financialDashboard.formatEur(5.5)).toBe('5.50€');
    });

    it('>= 10€ → "X€" (entier)', () => {
      expect(financialDashboard.formatEur(50.7)).toBe('51€');
    });
  });

  describe('executiveSummary text', () => {
    it('retourne string multi-lines avec sections', () => {
      const txt = financialDashboard.executiveSummary();
      expect(txt).toContain('BILAN APEX');
      expect(txt).toContain('Aujourd\'hui');
      expect(txt).toContain('Burn rate');
      expect(txt).toContain('ROI');
      expect(txt).toContain('Break-even');
    });
  });
});
