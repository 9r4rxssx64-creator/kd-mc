/**
 * APEX v13 — Vue Bilan Financier (admin innovante).
 *
 * Demande Kevin 2026-05-04 :
 * "Bilan financier individuel + total live jour mois. Sois créatif et innovant."
 *
 * Présentation :
 * - 🔥 Burn rate live counter (€/min, €/h, €/jour, €/mois extrapolé)
 * - 💸 Total today/month avec barre progressive
 * - 📊 Cards par service (catégorisées : IA / SaaS / Comms / Infra / Finance)
 * - 📈 Sparkline graph 30j SVG inline
 * - 🌡️ Heatmap usage par heure (24 cells colorées)
 * - 💎 Comparison vs concurrence (ChatGPT, Cursor, Claude Pro...)
 * - 💰 ROI block (paying_users, revenue, profit, margin, breakeven)
 * - 💚 Économies free-first vs all-paid
 * - 🚀 Projection fin de mois (extrapolation)
 *
 * Animations CSS : count-up, pulse, sparkline draw, heatmap fade-in.
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { financialDashboard, type FinancialServiceLine } from '../../services/observability/financial-dashboard.js';

const CATEGORY_LABELS: Record<FinancialServiceLine['category'], string> = {
  ai: '🧠 Intelligence Artificielle',
  saas: '💼 SaaS',
  comms: '✉️ Communications',
  infra: '☁️ Infrastructure',
  finance: '💳 Finance & Paiements',
  other: '🔧 Autres',
};

function renderSparkline(points: readonly { ts: number; eur: number }[]): string {
  if (points.length < 2) return '<span class="ax-spark-empty">—</span>';
  const max = Math.max(...points.map((p) => p.eur), 1);
  const w = 120;
  const h = 32;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(h - (p.eur / max) * h).toFixed(1)}`)
    .join(' ');
  return `
    <svg class="ax-sparkline" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="${path}" fill="none" stroke="#c9a227" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path} L${w} ${h} L0 ${h} Z" fill="rgba(201,162,39,0.15)"/>
    </svg>
  `;
}

function renderHeatmap(buckets: readonly number[]): string {
  const max = Math.max(...buckets, 0.01);
  const cells = buckets
    .map((b, h) => {
      const intensity = b / max;
      const opacity = 0.1 + intensity * 0.9;
      return `<div class="ax-heat-cell" style="background:rgba(201,162,39,${opacity.toFixed(2)})" title="${h}h : ${b.toFixed(2)}€" aria-label="${h}h"></div>`;
    })
    .join('');
  return `<div class="ax-heatmap-24h" aria-label="Heatmap 24h">${cells}</div>`;
}

function renderServiceCard(line: FinancialServiceLine): string {
  const trendIcon = line.trend_7d === 'up' ? '↗' : line.trend_7d === 'down' ? '↘' : '→';
  const trendClass = line.trend_7d === 'up' ? 'trend-up' : line.trend_7d === 'down' ? 'trend-down' : 'trend-stable';
  const statusIcon = line.status === 'critical' ? '🔴' : line.status === 'warn' ? '🟡' : '🟢';
  const barWidth = Math.min(100, line.pct_budget);
  const barColor = line.status === 'critical' ? '#ff4444' : line.status === 'warn' ? '#ffaa00' : '#22cc77';
  const freeBadge = line.is_free_tier ? '<span class="ax-badge-free">FREE</span>' : '';
  return `
    <article class="ax-fin-service-card" data-service="${line.service}" data-status="${line.status}">
      <header class="ax-fin-card-head">
        <span class="ax-fin-emoji">${line.emoji}</span>
        <span class="ax-fin-name">${line.service.toUpperCase()}</span>
        ${freeBadge}
        <span class="ax-fin-trend ${trendClass}">${trendIcon}</span>
        <span class="ax-fin-status">${statusIcon}</span>
      </header>
      <div class="ax-fin-amounts">
        <div class="ax-fin-today">
          <span class="ax-fin-label">Aujourd'hui</span>
          <span class="ax-fin-value">${financialDashboard.formatEur(line.used_eur_today)}</span>
        </div>
        <div class="ax-fin-month">
          <span class="ax-fin-label">Ce mois</span>
          <span class="ax-fin-value">${financialDashboard.formatEur(line.used_eur_month)}</span>
        </div>
      </div>
      <div class="ax-fin-bar-container">
        <div class="ax-fin-bar-bg">
          <div class="ax-fin-bar-fill" style="width:${barWidth}%;background:${barColor}"></div>
        </div>
        <span class="ax-fin-bar-pct">${line.pct_budget}%</span>
      </div>
      <div class="ax-fin-budget-label">Budget : ${financialDashboard.formatEur(line.budget_eur_month)}/mois</div>
    </article>
  `;
}

function renderCategorySection(category: FinancialServiceLine['category'], lines: readonly FinancialServiceLine[]): string {
  if (lines.length === 0) return '';
  const subtotal = lines.reduce((s, l) => s + l.used_eur_month, 0);
  return `
    <section class="ax-fin-category">
      <header class="ax-fin-category-head">
        <h3>${CATEGORY_LABELS[category]}</h3>
        <span class="ax-fin-category-subtotal">${financialDashboard.formatEur(subtotal)}/mois</span>
      </header>
      <div class="ax-fin-cards-grid">${lines.map(renderServiceCard).join('')}</div>
    </section>
  `;
}

function renderROIBlock(roi: { paying_users: number; monthly_revenue_eur: number; monthly_cost_eur: number; monthly_profit_eur: number; margin_pct: number; breakeven_users: number }): string {
  const profitClass = roi.monthly_profit_eur > 0 ? 'profit-positive' : 'profit-negative';
  return `
    <section class="ax-fin-roi">
      <h3>💰 ROI commercialisation Apex</h3>
      <div class="ax-fin-roi-grid">
        <div class="ax-fin-roi-cell">
          <span class="ax-fin-roi-label">Users payants</span>
          <span class="ax-fin-roi-value">${roi.paying_users}</span>
        </div>
        <div class="ax-fin-roi-cell">
          <span class="ax-fin-roi-label">Revenu mensuel</span>
          <span class="ax-fin-roi-value">${financialDashboard.formatEur(roi.monthly_revenue_eur)}</span>
        </div>
        <div class="ax-fin-roi-cell">
          <span class="ax-fin-roi-label">Coût mensuel</span>
          <span class="ax-fin-roi-value">${financialDashboard.formatEur(roi.monthly_cost_eur)}</span>
        </div>
        <div class="ax-fin-roi-cell ${profitClass}">
          <span class="ax-fin-roi-label">Profit / Perte</span>
          <span class="ax-fin-roi-value">${financialDashboard.formatEur(roi.monthly_profit_eur)}</span>
        </div>
        <div class="ax-fin-roi-cell">
          <span class="ax-fin-roi-label">Marge</span>
          <span class="ax-fin-roi-value">${roi.margin_pct}%</span>
        </div>
        <div class="ax-fin-roi-cell">
          <span class="ax-fin-roi-label">🎯 Break-even</span>
          <span class="ax-fin-roi-value">${roi.breakeven_users} users</span>
        </div>
      </div>
    </section>
  `;
}

function renderCompetitionBlock(competition: ReadonlyArray<{ tool: string; their_price_eur: number; apex_advantage: string }>): string {
  const rows = competition.map((c) => `
    <tr>
      <td><strong>${c.tool}</strong></td>
      <td class="ax-comp-price">${c.their_price_eur}€/mois</td>
      <td class="ax-comp-advantage">${c.apex_advantage}</td>
    </tr>
  `).join('');
  return `
    <section class="ax-fin-competition">
      <h3>💎 Apex vs Concurrence</h3>
      <table class="ax-comp-table">
        <thead>
          <tr><th>Concurrent</th><th>Prix</th><th>Avantage Apex</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

export function render(root: HTMLElement): void {
  const summary = financialDashboard.getSummary();
  const sparkline = financialDashboard.getSparklineMonth();
  const heatmap = financialDashboard.getHourlyHeatmap();

  /* Group services by category */
  const grouped = new Map<FinancialServiceLine['category'], FinancialServiceLine[]>();
  for (const s of summary.services) {
    const arr = grouped.get(s.category) ?? [];
    arr.push(s);
    grouped.set(s.category, arr);
  }
  /* Order categories : ai d'abord (le plus consommé), puis le reste */
  const order: FinancialServiceLine['category'][] = ['ai', 'comms', 'infra', 'finance', 'saas', 'other'];
  const categoriesHtml = order
    .map((cat) => renderCategorySection(cat, grouped.get(cat) ?? []))
    .join('');

  const projectionDelta = summary.projection_end_month_eur - summary.total_month_eur;

  safeSetHTML(root, `
    <div class="ax-fin-dashboard">
      <header class="ax-fin-hero">
        <h1>💰 Bilan Apex Live</h1>
        <p class="ax-fin-subtitle">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </header>

      <!-- 🔥 Burn rate live -->
      <section class="ax-fin-burn">
        <div class="ax-fin-burn-card pulse">
          <span class="ax-fin-burn-icon">🔥</span>
          <div>
            <div class="ax-fin-burn-label">Burn rate live</div>
            <div class="ax-fin-burn-values">
              <span class="ax-fin-burn-val"><strong>${financialDashboard.formatEur(summary.burn_rate.per_hour_eur)}</strong>/h</span>
              <span class="ax-fin-burn-val"><strong>${financialDashboard.formatEur(summary.burn_rate.per_day_eur)}</strong>/jour</span>
              <span class="ax-fin-burn-val"><strong>${financialDashboard.formatEur(summary.burn_rate.per_month_extrapolated_eur)}</strong>/mois (extrapolé)</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 💸 KPIs principaux -->
      <section class="ax-fin-kpis">
        <div class="ax-fin-kpi">
          <span class="ax-fin-kpi-label">Aujourd'hui</span>
          <span class="ax-fin-kpi-value">${financialDashboard.formatEur(summary.total_today_eur)}</span>
        </div>
        <div class="ax-fin-kpi">
          <span class="ax-fin-kpi-label">Ce mois</span>
          <span class="ax-fin-kpi-value">${financialDashboard.formatEur(summary.total_month_eur)}</span>
          <span class="ax-fin-kpi-sub">/ ${financialDashboard.formatEur(summary.total_budget_month_eur)} budget</span>
        </div>
        <div class="ax-fin-kpi">
          <span class="ax-fin-kpi-label">Projection fin mois</span>
          <span class="ax-fin-kpi-value">${financialDashboard.formatEur(summary.projection_end_month_eur)}</span>
          <span class="ax-fin-kpi-sub">+${financialDashboard.formatEur(projectionDelta)}</span>
        </div>
        <div class="ax-fin-kpi ax-fin-kpi-savings">
          <span class="ax-fin-kpi-label">💚 Économisé free-first</span>
          <span class="ax-fin-kpi-value">${financialDashboard.formatEur(summary.free_savings_month_eur)}</span>
          <span class="ax-fin-kpi-sub">vs tout payant Anthropic</span>
        </div>
      </section>

      <!-- 📈 Sparkline 30 derniers jours -->
      <section class="ax-fin-graphs">
        <div class="ax-fin-graph-card">
          <h3>📈 Tendance 30 jours</h3>
          ${renderSparkline(sparkline)}
        </div>
        <div class="ax-fin-graph-card">
          <h3>🌡️ Heatmap 24h (sur 7 derniers jours)</h3>
          ${renderHeatmap(heatmap)}
          <div class="ax-fin-heatmap-axis">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
          </div>
        </div>
      </section>

      <!-- 📊 Services par catégorie -->
      ${categoriesHtml}

      <!-- 💰 ROI commercialisation -->
      ${renderROIBlock(summary.roi)}

      <!-- 💎 Vs concurrence -->
      ${renderCompetitionBlock(summary.comparison_vs_competition)}

      <!-- État global -->
      <footer class="ax-fin-footer">
        <span class="ax-fin-health">${summary.health_emoji} ${summary.alerts_count} services en alerte</span>
        <span class="ax-fin-updated">Mis à jour : ${new Date().toLocaleTimeString('fr-FR')}</span>
      </footer>
    </div>
  `);
}
