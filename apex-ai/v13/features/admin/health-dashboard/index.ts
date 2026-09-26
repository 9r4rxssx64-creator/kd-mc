/**
 * APEX v13.4.0 — Vue admin "Dashboard santé live exhaustif".
 *
 * Kevin 2026-05-09 P0 :
 *   "Apex teste TOUT en autonomie : liens, codes, fonctions, MCP/connecteurs.
 *    Tant que ça ne fonctionne pas → retry / chercher bon endroit / bon lien /
 *    accès MCP. Visuel CLAIR 'tout fonctionne correctement' (dashboard live)."
 *
 * Sections :
 *   1. Score global (🟢/🟡/🔴 + % opérationnel + bouton "Tout tester")
 *   2. Codes (vault) — par service (🟢/🟡/🔴 + bouton 🔄 par clé)
 *   3. Liens (dashboards/billing/docs) — par service + bouton re-vérifier
 *   4. Fonctions (sentinelles) — par sentinelle + filtre catégorie
 *   5. MCP / Connecteurs — par connecteur configuré
 *   6. Alternatives proposées — si dashboards morts
 *
 * Sécurité : admin-only via store.get('isAdmin').
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import {
  autoTestEverything,
  type FullHealthReport,
  type ProgressUpdate,
} from '../../../services/admin/auto-test-everything.js';
import { rulesEngine, type ApexRule } from '../../../services/core-svc/rules-engine.js';
import { linksRegistry } from '../../../services/integrations/links-registry.js';
import { noRegressionWatch } from '../../../services/sentinels/no-regression-watch.js';
import { rulesInjectionWatch } from '../../../services/sentinels/rules-injection-watch.js';
import { sentinelsRegistry } from '../../../services/sentinels/sentinels-registry.js';
import { multiKeyVault } from '../../../services/vault/multi-key-vault.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;
let currentReport: FullHealthReport | null = null;
let activeFilter: 'all' | 'codes' | 'links' | 'sentinels' | 'connectors' | 'vault' | 'errors' = 'all';

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
  currentReport = null;
  activeFilter = 'all';
}

function renderGlobalHeader(report: FullHealthReport | null): string {
  if (!report) {
    return `
      <div class="ax-health-header" style="background:linear-gradient(135deg,#1a1a2e,#0f0f1a);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:24px;text-align:center;margin-bottom:16px">
        <div style="font-size:48px;margin-bottom:8px">⏳</div>
        <h2 style="margin:0;font-size:22px;color:#fff;font-weight:700">Pas encore testé</h2>
        <p style="color:rgba(255,255,255,0.55);font-size:14px;margin:6px 0 16px">Lance un test exhaustif pour voir l'état complet</p>
        <button id="btn-run-full-test" class="ax-btn ax-btn-primary" style="background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;padding:12px 24px;border-radius:24px;font-weight:700;cursor:pointer;font-size:15px;min-height:44px">
          🔄 Tout tester maintenant
        </button>
      </div>
    `;
  }

  const isGreen = report.globalStatus === 'green';
  const isYellow = report.globalStatus === 'yellow';
  const headerColor = isGreen ? '#22cc77' : isYellow ? '#e8b830' : '#ff5566';
  const bgGradient = isGreen
    ? 'linear-gradient(135deg,rgba(34,204,119,0.15),rgba(34,204,119,0.04))'
    : isYellow
      ? 'linear-gradient(135deg,rgba(232,184,48,0.15),rgba(232,184,48,0.04))'
      : 'linear-gradient(135deg,rgba(255,85,102,0.15),rgba(255,85,102,0.04))';
  const headerEmoji = isGreen ? '🟢' : isYellow ? '🟡' : '🔴';
  const headerLabel = isGreen
    ? 'TOUT FONCTIONNE'
    : isYellow
      ? `${report.failedItems.length} avertissement${report.failedItems.length > 1 ? 's' : ''}`
      : `${report.failedItems.length} échec${report.failedItems.length > 1 ? 's' : ''} critique${report.failedItems.length > 1 ? 's' : ''}`;

  return `
    <div class="ax-health-header" style="background:${bgGradient};border:1px solid ${headerColor}33;border-radius:14px;padding:20px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div class="ax-gs-192">${headerEmoji}</div>
        <div class="ax-gs-11">
          <h2 style="margin:0;font-size:18px;color:${headerColor};font-weight:800;letter-spacing:-0.01em">${escapeHtml(headerLabel)}</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px">
            <strong>${report.globalScorePct}%</strong> opérationnel ·
            ${report.totals.ok}/${report.totals.total} OK ·
            ${report.totals.warn} ⚠ ·
            ${report.totals.error} ❌
          </p>
          <p style="margin:2px 0 0;color:rgba(255,255,255,0.4);font-size:11px">
            Testé il y a ${Math.max(1, Math.round((Date.now() - report.ts) / 1000))}s · Durée ${Math.round(report.durationMs / 1000)}s
          </p>
        </div>
        <div class="ax-gs-20">
          <button id="btn-run-full-test" class="ax-btn ax-btn-primary" style="background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;padding:10px 16px;border-radius:22px;font-weight:700;cursor:pointer;font-size:13px;min-height:40px;-webkit-tap-highlight-color:transparent">
            🔄 Re-tester
          </button>
          ${report.failedItems.length > 0
      ? `<button id="btn-retry-failed" class="ax-btn" style="background:rgba(255,85,102,0.15);color:#ff5566;border:1px solid rgba(255,85,102,0.3);padding:10px 16px;border-radius:22px;font-weight:600;cursor:pointer;font-size:13px;min-height:40px;-webkit-tap-highlight-color:transparent">
            🔁 Retry x3 (${report.failedItems.length})
          </button>`
      : ''
    }
        </div>
      </div>
    </div>
  `;
}

function renderCategoryStats(report: FullHealthReport): string {
  const c = report.byCategory;
  const card = (icon: string, label: string, value: string, color: string): string => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;flex:1;min-width:140px">
      <div style="font-size:12px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${icon} ${escapeHtml(label)}</div>
      <div style="font-size:15px;color:#fff;font-weight:700;margin-top:4px">${escapeHtml(value)}</div>
    </div>
  `;
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${card('🔑', 'Codes', `${c.codes.tested - c.codes.stillDown}/${c.codes.tested} OK`, '#c9a227')}
      ${card('🔗', 'Liens', `${c.links.alive}/${c.links.tested} alive`, '#4d9eff')}
      ${card('🛡️', 'Sentinelles', `${c.sentinels.ok}/${c.sentinels.total} OK`, '#22cc77')}
      ${card('🔌', 'Connecteurs', `${c.connectors.tested}/${c.connectors.configured} testés`, '#a47ce0')}
      ${card('💾', 'Vault', `${c.vault.restored} restored`, '#ff9d3f')}
    </div>
  `;
}

function renderFilterChips(report: FullHealthReport): string {
  const filters: Array<[typeof activeFilter, string, number]> = [
    ['all', '📊 Tout', report.totals.total],
    ['errors', '❌ Erreurs', report.totals.error],
    ['codes', '🔑 Codes', report.items.filter((i) => i.category === 'codes').length],
    ['links', '🔗 Liens', report.items.filter((i) => i.category === 'links').length],
    ['sentinels', '🛡️ Sentinelles', report.items.filter((i) => i.category === 'sentinels').length],
    ['connectors', '🔌 MCP', report.items.filter((i) => i.category === 'connectors').length],
    ['vault', '💾 Vault', report.items.filter((i) => i.category === 'vault').length],
  ];
  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px">
      ${filters
      .map(([id, label, count]) => {
        const isActive = activeFilter === id;
        return `
          <button data-filter="${id}" class="ax-chip" style="flex:0 0 auto;padding:6px 12px;font-size:12px;border-radius:16px;cursor:pointer;border:1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.1)'};background:${isActive ? 'linear-gradient(135deg,#c9a227,#e8b830)' : 'rgba(255,255,255,0.04)'};color:${isActive ? '#000' : 'rgba(255,255,255,0.7)'};font-weight:${isActive ? 700 : 500};white-space:nowrap;-webkit-tap-highlight-color:transparent;min-height:32px">
              ${escapeHtml(label)} <span style="opacity:0.65">${count}</span>
            </button>
          `;
      })
      .join('')}
    </div>
  `;
}

function renderItemsList(report: FullHealthReport): string {
  let filtered = report.items;
  if (activeFilter === 'errors') {
    filtered = report.items.filter((i) => i.status === 'error');
  } else if (activeFilter !== 'all') {
    filtered = report.items.filter((i) => i.category === activeFilter);
  }
  if (filtered.length === 0) {
    return `
      <div style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);font-size:14px">
        Aucun item dans cette catégorie ${activeFilter === 'errors' ? '✅ Tout va bien !' : ''}
      </div>
    `;
  }
  const STATUS_STYLE: Record<string, { emoji: string; color: string }> = {
    ok: { emoji: '🟢', color: '#22cc77' },
    warn: { emoji: '🟡', color: '#e8b830' },
    error: { emoji: '🔴', color: '#ff5566' },
    pending: { emoji: '⚪', color: '#999' },
  };

  const rows = filtered
    .slice(0, 200)
    .map((item) => {
      const s = STATUS_STYLE[item.status] ?? STATUS_STYLE['pending']!;
      const safeId = escapeHtml(item.id);
      const dur = item.durationMs ? ` · ${item.durationMs}ms` : '';
      const retry = item.retryCount ? ` · retry ${item.retryCount}` : '';
      return `
        <li class="ax-health-item" data-item-id="${safeId}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);background:rgba(255,255,255,0.01);border-radius:6px;margin-bottom:4px">
          <span style="font-size:16px;flex-shrink:0">${s.emoji}</span>
          <div class="ax-gs-6">
            <div style="font-size:13px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.label)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.message ?? '—')}${escapeHtml(dur)}${escapeHtml(retry)}</div>
          </div>
          <button class="ax-btn-mini" data-test-item="${safeId}" aria-label="Re-tester" style="padding:6px 10px;font-size:11px;border-radius:14px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.08);cursor:pointer;-webkit-tap-highlight-color:transparent;min-height:30px;flex-shrink:0">🔄</button>
        </li>
      `;
    })
    .join('');

  const truncated = filtered.length > 200 ? `<p style="color:rgba(255,255,255,0.4);font-size:11px;text-align:center;padding:8px">… ${filtered.length - 200} items supplémentaires (filtre pour voir)</p>` : '';

  return `
    <ul class="ax-gs-286">${rows}</ul>
    ${truncated}
  `;
}

function renderAlternatives(report: FullHealthReport): string {
  if (report.alternativesProposed.length === 0) return '';
  const rows = report.alternativesProposed
    .map(
      (a) => `
        <li style="padding:10px;background:rgba(232,184,48,0.05);border:1px solid rgba(232,184,48,0.2);border-radius:8px;margin-bottom:6px">
          <div class="ax-gs-102">${escapeHtml(a.service)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);text-decoration:line-through">${escapeHtml(a.original)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.85)">→ ${escapeHtml(a.alternative)} <span class="ax-gs-91">(${escapeHtml(a.reason)})</span></div>
        </li>
      `,
    )
    .join('');
  return `
    <div style="background:rgba(232,184,48,0.06);border:1px solid rgba(232,184,48,0.15);border-radius:12px;padding:14px;margin-top:12px">
      <h3 style="margin:0 0 10px;color:#e8b830;font-size:13px;text-transform:uppercase;letter-spacing:0.08em">💡 Alternatives proposées</h3>
      <ul class="ax-gs-286">${rows}</ul>
    </div>
  `;
}

function renderProgress(progress: ProgressUpdate): string {
  const pct = Math.round((progress.current / progress.total) * 100);
  return `
    <div id="ax-health-progress" class="ax-gs-287">
      <div class="ax-gs-103">
        <span class="ax-gs-17">⏳</span>
        <div class="ax-gs-26">
          <div class="ax-gs-102">${escapeHtml(progress.message)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.55)">Phase ${progress.current}/${progress.total} (${pct}%)</div>
        </div>
      </div>
      <div style="margin-top:8px;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#c9a227,#e8b830);transition:width 200ms ease"></div>
      </div>
    </div>
  `;
}

async function refreshTestSingleItem(itemId: string, rootEl: HTMLElement): Promise<void> {
  const item = currentReport?.items.find((i) => i.id === itemId);
  if (!item) {
    toast.warn('Item introuvable');
    return;
  }
  haptic.tap();
  toast.success(`Test ${item.label}…`);
  try {
    if (item.category === 'codes') {
      await multiKeyVault.healthCheckAll();
    } else if (item.category === 'links') {
      await linksRegistry.testAlive(item.label);
    } else if (item.category === 'sentinels') {
      const id = item.id.replace(/^sentinel:/, '');
      await sentinelsRegistry.runOne(id);
    }
    /* Soft refresh : re-run full test in background pour avoir un état cohérent */
    await runFullTest(rootEl);
  } catch (err) {
    logger.warn('health-dashboard', 'refreshTestSingleItem failed', { itemId, err });
    toast.error('Test échoué');
  }
}

async function runFullTest(rootEl: HTMLElement): Promise<void> {
  if (autoTestEverything.isRunning()) {
    toast.warn('Un test est déjà en cours');
    return;
  }
  haptic.medium();
  const mountProgress = rootEl.querySelector<HTMLElement>('#ax-health-progress-mount');
  const progressCb = (u: ProgressUpdate): void => {
    if (mountProgress) mountProgress.innerHTML = renderProgress(u);
  };
  try {
    if (mountProgress) mountProgress.innerHTML = renderProgress({ phase: 'codes', current: 0, total: 5, message: 'Démarrage…' });
    const report = await autoTestEverything.runFullHealthCheck(progressCb);
    currentReport = report;
    if (mountProgress) mountProgress.innerHTML = '';
    if (report.globalStatus === 'green') toast.success(`✅ Tout fonctionne (${report.globalScorePct}%)`);
    else if (report.globalStatus === 'yellow') toast.warn(`⚠️ ${report.failedItems.length} problèmes`);
    else toast.error(`🔴 ${report.failedItems.length} échecs`);
    rerender(rootEl);
  } catch (err) {
    logger.error('health-dashboard', 'runFullTest failed', { err });
    toast.error('Test échoué : ' + (err instanceof Error ? err.message : String(err)));
    if (mountProgress) mountProgress.innerHTML = '';
  }
}

async function retryFailed(rootEl: HTMLElement): Promise<void> {
  if (!currentReport || currentReport.failedItems.length === 0) return;
  haptic.medium();
  toast.success(`Retry ${currentReport.failedItems.length} items…`);
  try {
    const updated = await autoTestEverything.retryFailedItems(currentReport, 3);
    currentReport = updated;
    if (updated.failedItems.length === 0) toast.success(`✅ Tout récupéré ! ${updated.globalScorePct}%`);
    else toast.warn(`${updated.failedItems.length} encore en échec, escaladé`);
    rerender(rootEl);
  } catch (err) {
    logger.warn('health-dashboard', 'retryFailed failed', { err });
    toast.error('Retry échoué');
  }
}

function rerender(rootEl: HTMLElement): void {
  const inner = rootEl.querySelector<HTMLElement>('#ax-health-inner');
  if (!inner) return;
  inner.innerHTML = renderInner(currentReport);
  attachHandlers(rootEl);
}

function renderConformityCard(): string {
  const counts = rulesEngine.getInjectedCount();
  const injStats = rulesInjectionWatch.getStats();
  const regStats = noRegressionWatch.getStats();
  const passPct = Math.round(injStats.passRate * 100);
  const passColor = passPct >= 90 ? '#22cc77' : passPct >= 60 ? '#e8b830' : '#ff5566';
  return `
    <div style="background:linear-gradient(135deg,rgba(201,162,39,0.08),rgba(201,162,39,0.02));border:1px solid rgba(201,162,39,0.2);border-radius:14px;padding:14px;margin-bottom:12px">
      <h3 style="margin:0 0 10px;color:#e8b830;font-size:13px;text-transform:uppercase;letter-spacing:0.05em">📚 Conformité CLAUDE.md</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px">
        <div class="ax-gs-39">
          <div class="ax-gs-40">Règles injectées</div>
          <div class="ax-gs-104">${counts.rules}/50</div>
        </div>
        <div class="ax-gs-39">
          <div class="ax-gs-40">Erreurs appliquées</div>
          <div class="ax-gs-104">${counts.errorsApplied}/${counts.errorsTotal}</div>
        </div>
        <div class="ax-gs-39">
          <div class="ax-gs-40">Audits 24h</div>
          <div style="font-size:18px;color:${passColor};font-weight:700;margin-top:2px">${passPct}% OK</div>
        </div>
        <div class="ax-gs-39">
          <div class="ax-gs-40">Régressions 24h</div>
          <div style="font-size:18px;color:${regStats.failuresLast24h === 0 ? '#22cc77' : '#ff5566'};font-weight:700;margin-top:2px">${regStats.failuresLast24h}</div>
        </div>
      </div>
      <div class="ax-gs-20">
        <button id="btn-test-noregression" style="padding:8px 12px;background:rgba(34,204,119,0.12);color:#22cc77;border:1px solid rgba(34,204,119,0.3);border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px;-webkit-tap-highlight-color:transparent">🧪 Re-tester non-régression</button>
        <button id="btn-show-rules" style="padding:8px 12px;background:rgba(201,162,39,0.12);color:#e8b830;border:1px solid rgba(201,162,39,0.3);border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px;-webkit-tap-highlight-color:transparent">📚 Voir toutes règles</button>
        <button id="btn-audit-injection" style="padding:8px 12px;background:rgba(77,158,255,0.12);color:#4d9eff;border:1px solid rgba(77,158,255,0.3);border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px;-webkit-tap-highlight-color:transparent">🔍 Auditer injection</button>
      </div>
    </div>
  `;
}

function renderInner(report: FullHealthReport | null): string {
  if (!report) {
    return `
      ${renderGlobalHeader(null)}
      ${renderConformityCard()}
      <div id="ax-health-progress-mount"></div>
    `;
  }
  return `
    ${renderGlobalHeader(report)}
    ${renderConformityCard()}
    <div id="ax-health-progress-mount"></div>
    ${renderCategoryStats(report)}
    ${renderAlternatives(report)}
    ${renderFilterChips(report)}
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:8px;max-height:60vh;overflow-y:auto;-webkit-overflow-scrolling:touch">
      ${renderItemsList(report)}
    </div>
  `;
}

async function runNoRegressionTest(rootEl: HTMLElement): Promise<void> {
  haptic.medium();
  toast.success('Tests non-régression…');
  try {
    const r = await noRegressionWatch.checkAll();
    if (r.ok) {
      toast.success(`✅ Non-régression OK (${r.passed}/${r.totalChecks})`);
    } else {
      toast.warn(`⚠️ ${r.failed} régression(s) détectée(s)`);
    }
    rerender(rootEl);
  } catch (err) {
    logger.warn('health-dashboard', 'runNoRegressionTest failed', { err });
    toast.error('Test échoué');
  }
}

async function runInjectionAudit(rootEl: HTMLElement): Promise<void> {
  haptic.tap();
  toast.success('Audit injection…');
  try {
    const r = await rulesInjectionWatch.audit();
    if (r.ok) {
      toast.success(`✅ Injection OK (${r.promptSize} chars)`);
    } else {
      toast.warn(`⚠️ Sections manquantes : ${r.missing.join(', ')}`);
    }
    rerender(rootEl);
  } catch (err) {
    logger.warn('health-dashboard', 'runInjectionAudit failed', { err });
    toast.error('Audit échoué');
  }
}

function showAllRulesModal(rootEl: HTMLElement): void {
  haptic.tap();
  const rules: ApexRule[] = rulesEngine.getTopRules(50);
  const errors = rulesEngine.getTopErrors(55);
  /* Modal léger custom (z-index élevé) */
  const existing = rootEl.querySelector('#ax-rules-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'ax-rules-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:max(20px,env(safe-area-inset-top)) 12px max(20px,env(safe-area-inset-bottom));overflow-y:auto;-webkit-overflow-scrolling:touch';
  modal.innerHTML = `
    <div style="background:#11131e;border-radius:16px;border:1px solid rgba(255,255,255,0.08);max-width:720px;width:100%;padding:18px;color:#fff">
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2 style="margin:0;color:#e8b830;font-size:18px">📚 Règles + erreurs CLAUDE.md</h2>
        <button id="ax-rules-close" aria-label="Fermer" style="background:rgba(255,255,255,0.06);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px">✕</button>
      </header>
      <input id="ax-rules-search" type="text" placeholder="Recherche…" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;margin-bottom:12px" />
      <div class="ax-gs-105">Règles (${rules.length})</div>
      <ul id="ax-rules-list" style="list-style:none;padding:0;margin:0 0 16px">
        ${rules
          .map((r, i) => {
            const sev = r.severity === 'critical' ? '🔴' : r.severity === 'high' ? '🟡' : '🟢';
            const safeTitle = r.title.replace(/[<>]/g, '');
            const safeQuote = (r.quote || '').replace(/[<>]/g, '').slice(0, 160);
            return `<li class="ax-rule-row" data-keyword="${safeTitle.toLowerCase()} ${safeQuote.toLowerCase()}" style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px">${sev} <strong>${i + 1}. ${safeTitle.slice(0, 100)}</strong>${safeQuote ? `<div class="ax-gs-55">« ${safeQuote} »</div>` : ''}</li>`;
          })
          .join('')}
      </ul>
      <div class="ax-gs-105">Erreurs documentées (${errors.length})</div>
      <ul id="ax-errors-list" class="ax-gs-286">
        ${errors
          .map((e) => {
            const tag = e.applied ? '✅' : '⚠️';
            const safeTitle = e.title.replace(/[<>]/g, '').slice(0, 100);
            const safeLesson = (e.lesson || '').replace(/[<>]/g, '').slice(0, 200);
            return `<li class="ax-err-row" data-keyword="${safeTitle.toLowerCase()} ${safeLesson.toLowerCase()}" style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">${tag} <strong>#${e.num} ${safeTitle}</strong>${safeLesson ? `<div class="ax-gs-55">${safeLesson}</div>` : ''}</li>`;
          })
          .join('')}
      </ul>
    </div>
  `;
  document.body.appendChild(modal);
  const close = (): void => modal.remove();
  modal.querySelector('#ax-rules-close')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  const search = modal.querySelector<HTMLInputElement>('#ax-rules-search');
  search?.addEventListener('input', () => {
    const k = (search.value || '').toLowerCase().trim();
    modal.querySelectorAll<HTMLElement>('.ax-rule-row, .ax-err-row').forEach((row) => {
      const m = (row.dataset['keyword'] || '').includes(k);
      row.style.display = !k || m ? '' : 'none';
    });
  });
}

function attachHandlers(rootEl: HTMLElement): void {
  const scope = activeScope!;
  const btnRunFull = rootEl.querySelector<HTMLButtonElement>('#btn-run-full-test');
  if (btnRunFull) {
    scope.bind(btnRunFull, 'click', () => {
      void runFullTest(rootEl);
    });
  }
  const btnRetry = rootEl.querySelector<HTMLButtonElement>('#btn-retry-failed');
  if (btnRetry) {
    scope.bind(btnRetry, 'click', () => {
      void retryFailed(rootEl);
    });
  }
  rootEl.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
    scope.bind(btn, 'click', () => {
      haptic.selection();
      const f = btn.dataset['filter'] as typeof activeFilter;
      activeFilter = f;
      rerender(rootEl);
    });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('[data-test-item]').forEach((btn) => {
    scope.bind(btn, 'click', () => {
      const id = btn.dataset['testItem'] ?? '';
      if (id) void refreshTestSingleItem(id, rootEl);
    });
  });
  /* v13.4.4 — Conformity card buttons */
  const btnNoReg = rootEl.querySelector<HTMLButtonElement>('#btn-test-noregression');
  if (btnNoReg) {
    scope.bind(btnNoReg, 'click', () => {
      void runNoRegressionTest(rootEl);
    });
  }
  const btnRules = rootEl.querySelector<HTMLButtonElement>('#btn-show-rules');
  if (btnRules) {
    scope.bind(btnRules, 'click', () => {
      showAllRulesModal(rootEl);
    });
  }
  const btnInj = rootEl.querySelector<HTMLButtonElement>('#btn-audit-injection');
  if (btnInj) {
    scope.bind(btnInj, 'click', () => {
      void runInjectionAudit(rootEl);
    });
  }
  /* Back to admin */
  const btnBack = rootEl.querySelector<HTMLButtonElement>('#btn-back-admin');
  if (btnBack) {
    scope.bind(btnBack, 'click', () => {
      haptic.tap();
      window.location.hash = '#admin';
    });
  }
}

export async function render(rootEl: HTMLElement): Promise<void> {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div style="padding:40px;text-align:center;color:rgba(255,255,255,0.5)">
        <h2 class="ax-gs-266">Accès admin uniquement</h2>
        <p>Cette section est réservée à Kevin.</p>
      </div>
    `;
    return;
  }
  activeScope?.cleanup();
  activeScope = createCleanupScope('health-dashboard');

  /* Récupère le dernier rapport (s'il existe) — sinon prompt user à lancer */
  currentReport = autoTestEverything.getLastReport();

  rootEl.innerHTML = `
    <div style="padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom)) 16px;max-width:1200px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">
      <header style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div class="ax-gs-106">
          <h1 style="margin:0;font-size:clamp(20px,5vw,26px);font-weight:700;background:linear-gradient(135deg,#c9a227,#e8b830);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-family:Georgia,serif;letter-spacing:-0.02em">📊 Santé Live</h1>
          <p class="ax-gs-288">Codes · Liens · Sentinelles · MCP · Vault — auto-test exhaustif</p>
        </div>
        <button id="btn-back-admin" style="flex-shrink:0;padding:8px 14px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:22px;font-size:13px;font-weight:600;cursor:pointer;min-height:38px;-webkit-tap-highlight-color:transparent">← Admin</button>
      </header>
      <div id="ax-health-inner">${renderInner(currentReport)}</div>
    </div>
  `;
  attachHandlers(rootEl);
}
