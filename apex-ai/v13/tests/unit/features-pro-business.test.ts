/**
 * Tests features/pro/modules/business.
 */
import { describe, expect, it } from 'vitest';

import {
  BUSINESS_PLAN_SECTIONS,
  KPIS,
  PRICING_STRATEGIES,
  calcArpu,
  calcBep,
  calcCac,
  calcCashRunway,
  calcChurn,
  calcLtv,
  calcLtvCacRatio,
  calcMargeBrute,
  calcMrrToArr,
  calcRoi,
  calcVan,
  classifyBcg,
  emptySwot,
  escapeHtml,
  findKpi,
  findPlanSection,
  findPricingStrategy,
  generateCashFlowForecast,
  kpisByCategory,
} from '../../features/pro/modules/business/index.js';

describe('features/pro/business — escapeHtml', () => {
  it('échappe', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});

describe('features/pro/business — KPIS catalog', () => {
  it('contient 30+ KPIs', () => {
    expect(KPIS.length).toBeGreaterThanOrEqual(28);
  });
  it('contient MRR, ARR, CAC, LTV, NPS', () => {
    const ids = KPIS.map((k) => k.id);
    expect(ids).toContain('mrr');
    expect(ids).toContain('arr');
    expect(ids).toContain('cac');
    expect(ids).toContain('ltv');
    expect(ids).toContain('nps');
  });
  it('chaque KPI a une formule', () => {
    KPIS.forEach((k) => expect(k.formula).toBeTruthy());
  });
  it('ids uniques', () => {
    const ids = KPIS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('features/pro/business — Plan sections', () => {
  it('contient 25+ sections', () => {
    expect(BUSINESS_PLAN_SECTIONS.length).toBeGreaterThanOrEqual(25);
  });
  it('executive_summary required', () => {
    expect(findPlanSection('executive_summary')?.required).toBe(true);
  });
});

describe('features/pro/business — Pricing strategies', () => {
  it('contient 8+ stratégies', () => {
    expect(PRICING_STRATEGIES.length).toBeGreaterThanOrEqual(8);
  });
  it('value_based existe', () => {
    expect(findPricingStrategy('value_based')).toBeDefined();
  });
});

describe('features/pro/business — find helpers', () => {
  it('findKpi trouve mrr', () => {
    expect(findKpi('mrr')?.label).toBe('MRR');
  });
  it('kpisByCategory finance', () => {
    expect(kpisByCategory('finance').length).toBeGreaterThan(5);
  });
  it('kpisByCategory marketing', () => {
    expect(kpisByCategory('marketing').length).toBeGreaterThan(5);
  });
});

describe('features/pro/business — Calculs', () => {
  it('calcRoi correct', () => {
    expect(calcRoi(150, 100)).toBe(50);
  });
  it('calcRoi 0 si cost=0', () => {
    expect(calcRoi(100, 0)).toBe(0);
  });
  it('calcBep', () => {
    /* CF=10000, PV=50, CV=30 → margin 20 → 500 unités */
    expect(calcBep(10000, 50, 30)).toBe(500);
  });
  it('calcBep Infinity si margin <= 0', () => {
    expect(calcBep(10000, 30, 50)).toBe(Infinity);
  });
  it('calcLtv', () => {
    /* arpu=100, churn=0.05 (5%) → 100/0.05=2000 × 0.8 = 1600 */
    expect(calcLtv(100, 0.05, 0.8)).toBe(1600);
  });
  it('calcLtvCacRatio', () => {
    expect(calcLtvCacRatio(900, 300)).toBe(3);
  });
  it('calcCashRunway', () => {
    expect(calcCashRunway(120000, 10000)).toBe(12);
  });
  it('calcVan basique', () => {
    /* 100 invest, 60+60 cash flows à 10% → 60/1.1 + 60/1.21 - 100 = ~4.13 */
    const v = calcVan([60, 60], 0.1, 100);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(20);
  });
  it('calcMargeBrute', () => {
    expect(calcMargeBrute(1000, 600)).toBe(40);
  });
  it('calcCac', () => {
    expect(calcCac(10000, 50)).toBe(200);
  });
  it('calcChurn', () => {
    expect(calcChurn(5, 100)).toBe(5);
  });
  it('calcArpu', () => {
    expect(calcArpu(10000, 100)).toBe(100);
  });
  it('calcMrrToArr', () => {
    expect(calcMrrToArr(1000)).toBe(12000);
  });
});

describe('features/pro/business — Cash flow forecast', () => {
  it('génère N mois', () => {
    const f = generateCashFlowForecast(10000, 5000, 4000, 0.05, 6);
    expect(f.length).toBe(6);
    expect(f[0]!.month).toBe(1);
    expect(f[0]!.cumulative).toBeGreaterThan(0);
  });
  it('croissance composée appliquée', () => {
    const f = generateCashFlowForecast(0, 1000, 0, 0.1, 3);
    expect(f[1]!.revenue).toBeGreaterThan(f[0]!.revenue);
  });
});

describe('features/pro/business — SWOT/BCG', () => {
  it('emptySwot vide', () => {
    const s = emptySwot();
    expect(s.strengths.length).toBe(0);
  });
  it('classifyBcg star', () => {
    expect(classifyBcg({ name: 'X', marketShare: 20, marketGrowth: 20 })).toBe('star');
  });
  it('classifyBcg cash_cow', () => {
    expect(classifyBcg({ name: 'X', marketShare: 20, marketGrowth: 5 })).toBe('cash_cow');
  });
  it('classifyBcg dog', () => {
    expect(classifyBcg({ name: 'X', marketShare: 5, marketGrowth: 5 })).toBe('dog');
  });
  it('classifyBcg question_mark', () => {
    expect(classifyBcg({ name: 'X', marketShare: 5, marketGrowth: 20 })).toBe('question_mark');
  });
});
