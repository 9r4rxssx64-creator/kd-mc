/**
 * APEX v13 — Consumption Dashboard (admin UI live counter + 1-clic recharge).
 *
 * Demande Kevin 2026-05-04 :
 * "Info pour chaque IA conso token live compteur. Notif admin quand bientôt terminé
 *  pour chaque avec lien 1 clic pour chaque pour recharge. Pareil pour tous les abos."
 *
 * Vue admin avec :
 * - Liste services (IA + SaaS) avec live counter pct + emoji status
 * - Boutons "🔋 Recharger" 1-clic ouvre billing direct (window.open)
 * - Plans upgrade suggérés (Cloudflare Free→Paid→Pro etc.)
 * - Recommandation auto si usage > 80% sur 7 jours
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { consumptionMonitor } from '../../services/observability/consumption-monitor.js';

/**
 * Génère HTML carte service consumption (live counter).
 */
function renderServiceCard(service: ReturnType<typeof consumptionMonitor.formatForUI>['services'][number]): string {
  const barColor = service.severity === 'critical' ? '#ff4444' : service.severity === 'warn' ? '#ffaa00' : '#22cc77';
  const barWidth = Math.min(100, service.pct_used);
  return `
    <div class="ax-consumption-card" data-service="${service.service}" data-severity="${service.severity}">
      <header class="ax-consumption-card-head">
        <span class="ax-consumption-emoji">${service.emoji}</span>
        <span class="ax-consumption-name">${service.service.toUpperCase()}</span>
        <span class="ax-consumption-pct">${service.pct_used}%</span>
      </header>
      <div class="ax-consumption-bar-bg">
        <div class="ax-consumption-bar-fill" style="width:${barWidth}%;background:${barColor}"></div>
      </div>
      <div class="ax-consumption-detail">${service.used} / ${service.budget}</div>
      <div class="ax-consumption-actions">
        <a href="${service.billing_url}" target="_blank" rel="noopener" class="ax-btn-primary ax-btn-recharge" data-action="recharge">
          🔋 Recharger
        </a>
        <button type="button" class="ax-btn-ghost" data-action="upgrade-plans" data-target="${service.service}">
          📦 Plans
        </button>
      </div>
    </div>
  `;
}

/**
 * Génère modal plans upgrade pour 1 service.
 */
function renderUpgradePlansModal(service: string): string {
  const plans = consumptionMonitor.getUpgradePlans(service);
  const reco = consumptionMonitor.recommendUpgrade(service);
  const recoBlock = reco.needed ? `
    <div class="ax-reco-banner">
      <strong>💡 Recommandation auto</strong>
      <p>${reco.reason}</p>
      ${reco.suggested ? `<p>Plan suggéré : <strong>${reco.suggested}</strong></p>` : ''}
    </div>
  ` : '';
  const plansHtml = plans.map((p) => `
    <div class="ax-plan-card">
      <header><strong>${p.name}</strong> ${p.price_eur_month > 0 ? `<span class="ax-plan-price">${p.price_eur_month}€/mois</span>` : '<span class="ax-plan-free">Gratuit</span>'}</header>
      <p>${p.description}</p>
      <a href="${p.upgrade_url}" target="_blank" rel="noopener" class="ax-btn-primary">Choisir ce plan</a>
    </div>
  `).join('');
  return `
    <div class="ax-modal-sheet" role="dialog" aria-label="Plans ${service}">
      <header class="ax-modal-head">
        <h2>Plans ${service.toUpperCase()}</h2>
        <button type="button" class="ax-btn-close" data-action="close-modal" aria-label="Fermer">✕</button>
      </header>
      ${recoBlock}
      <div class="ax-plans-list">${plansHtml}</div>
    </div>
  `;
}

/**
 * Render main vue consumption dashboard.
 */
export function render(root: HTMLElement): void {
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('admin.consumption', root, uid)) return;
  const ui = consumptionMonitor.formatForUI();
  const cards = ui.services.map(renderServiceCard).join('');
  const headerAlert = ui.total_alerts > 0
    ? `<div class="ax-banner-alert">⚠️ ${ui.total_alerts} service${ui.total_alerts > 1 ? 's' : ''} en alerte — recharger vite</div>`
    : '<div class="ax-banner-ok">✅ Tous services dans les budgets</div>';
  safeSetHTML(root, `
    <div class="ax-consumption-dashboard">
      <h1>💰 Consommation live</h1>
      <p class="ax-subtitle">Suivi conso temps réel + recharge 1-clic + plans upgrade</p>
      ${headerAlert}
      <div class="ax-consumption-grid">${cards}</div>
      <div id="ax-consumption-modal-mount"></div>
    </div>
  `);
  /* Wire boutons "Plans" (event delegation) */
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest<HTMLElement>('[data-action="upgrade-plans"]')?.dataset['target'];
    if (action) {
      const mount = root.querySelector<HTMLElement>('#ax-consumption-modal-mount');
      if (mount) mount.innerHTML = renderUpgradePlansModal(action);
    }
    if ((target.closest('[data-action="close-modal"]'))) {
      const mount = root.querySelector<HTMLElement>('#ax-consumption-modal-mount');
      if (mount) mount.innerHTML = '';
    }
  });
}
