/**
 * APEX v13.3.53 — Vue admin Multi-Source History
 *
 * Liste des 50 dernières sources analysées (image / texte / URL / note) avec :
 *  - preview source (masquée pour les valeurs sensibles)
 *  - nb items extraits / configurés / testés OK
 *  - statut test par item (latence + erreur si fail)
 *  - bouton "Re-analyser" si erreur
 *  - stats globales (sources totaux, items extraits, % auto-configurés)
 *
 * Admin only (sources peuvent contenir credentials sensibles).
 */

import { escapeHtml } from '../../core/html-safe.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import {
  multiSourceAnalyze,
  type MultiSourceResult,
  type ExtractedItem,
} from '../../services/ai/multi-source-analyze.js';
import { studyService } from '../../services/integrations/study-service.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div class="ax-gs-21">
        <h2 class="ax-gs-266">Accès admin uniquement</h2>
        <p>Multi-Source History — Kevin admin.</p>
      </div>
    `;
    return;
  }

  activeScope?.cleanup();
  activeScope = createCleanupScope('multi-source-history');

  const history = multiSourceAnalyze.getHistory();
  const stats = multiSourceAnalyze.getStats();
  const known = studyService.listKnown();

  rootEl.innerHTML = renderHTML(history, stats, known.length);
  wireHandlers(rootEl, history);
  logger.info('multi-source-history', `Render ${history.length} sources, ${stats.items_total} items`);
}

function renderHTML(
  history: MultiSourceResult[],
  stats: { sources_total: number; items_total: number; items_configured: number; items_tested_ok: number },
  knownServices: number,
): string {
  const cfgRate = stats.items_total > 0 ? Math.round((stats.items_configured / stats.items_total) * 100) : 0;
  const testRate = stats.items_configured > 0 ? Math.round((stats.items_tested_ok / stats.items_configured) * 100) : 0;

  return `
    <div style="padding:20px;max-width:1100px;margin:0 auto;color:var(--ax-text,#eee)">
      <h2 style="color:#c9a227;margin-bottom:8px">🔍 Multi-Source Extraction History</h2>
      <p style="color:#999;font-size:13px;margin-bottom:24px">
        Analyse exhaustive des sources collées (image / texte / URL).
        1 source = N éléments (credentials + URLs + IPs + MACs + device IDs).
        Étude approfondie + test live + installation auto.
      </p>

      <!-- Stats cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">
        ${statCard('📥 Sources', String(stats.sources_total), '#c9a227')}
        ${statCard('🎯 Éléments', String(stats.items_total), '#5c9eff')}
        ${statCard('✅ Configurés', `${stats.items_configured} (${cfgRate}%)`, '#22cc77')}
        ${statCard('🟢 Testés OK', `${stats.items_tested_ok} (${testRate}%)`, '#aaff77')}
        ${statCard('📚 Services étudiés', String(knownServices), '#ff8855')}
      </div>

      <!-- Refresh / clear actions -->
      <div class="ax-gs-65">
        <button id="ax-msh-refresh" class="ax-btn ax-btn-sm ax-gs-366">🔄 Refresh</button>
        <button id="ax-msh-refresh-services" class="ax-btn ax-btn-sm ax-gs-366">📚 Re-étudier services</button>
        <button id="ax-msh-clear" class="ax-btn ax-btn-sm" style="padding:8px 14px;background:rgba(255,107,107,0.2);color:#ff6b6b">🗑️ Vider historique</button>
      </div>

      <!-- History list -->
      <div id="ax-msh-list">
        ${history.length === 0
          ? `<div style="padding:40px;text-align:center;color:#999;border:1px dashed #444;border-radius:8px">
               <p>Aucune source analysée pour le moment.</p>
               <p class="ax-gs-397">Colle une image / un texte avec credentials dans le chat → analyse multi-source automatique.</p>
             </div>`
          : history.map((r, idx) => renderResult(r, idx)).join('')}
      </div>
    </div>
  `;
}

function statCard(label: string, value: string, color: string): string {
  return `
    <div style="background:rgba(255,255,255,0.04);border:1px solid ${color}33;border-radius:10px;padding:14px">
      <div style="font-size:12px;color:#999;margin-bottom:4px">${escapeHtml(label)}</div>
      <div style="font-size:22px;font-weight:700;color:${color}">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderResult(r: MultiSourceResult, idx: number): string {
  const date = new Date(r.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const typeIcon = { image: '🖼️', text: '📝', pdf: '📄', url: '🔗', note: '📌' }[r.source_type] ?? '❔';
  return `
    <details style="background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:8px;margin-bottom:10px;padding:12px">
      <summary style="cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="ax-gs-17">${typeIcon}</span>
        <span style="color:#c9a227;font-weight:600">${escapeHtml(r.source_type.toUpperCase())}</span>
        <span style="color:#666;font-size:12px">${escapeHtml(date)}</span>
        <span style="margin-left:auto;font-size:13px;color:#aaa">
          ${r.extracted_count} extraits ·
          <span style="color:${r.configured_count === r.extracted_count ? '#22cc77' : '#ffaa00'}">
            ${r.configured_count} configurés
          </span> ·
          <span style="color:${r.tested_ok_count > 0 ? '#22cc77' : '#888'}">
            ${r.tested_ok_count}/${r.tested_count} testés OK
          </span>
        </span>
      </summary>
      <div style="margin-top:12px;padding-left:8px">
        <div style="font-size:12px;color:#666;margin-bottom:8px">
          <strong>Aperçu source:</strong> <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px">${escapeHtml(r.source_preview.slice(0, 200))}</code>
        </div>
        ${r.errors.length > 0 ? `
          <div style="background:rgba(255,107,107,0.1);border-left:3px solid #ff6b6b;padding:8px;margin-bottom:10px;font-size:12px">
            ⚠️ ${r.errors.length} erreur(s):<br>${r.errors.map(escapeHtml).join('<br>')}
          </div>
        ` : ''}
        <table class="ax-gs-392">
          <thead>
            <tr style="background:rgba(0,0,0,0.3);text-align:left">
              <th class="ax-gs-267">Type</th>
              <th class="ax-gs-267">Service</th>
              <th class="ax-gs-267">Valeur (masquée)</th>
              <th class="ax-gs-267">Confiance</th>
              <th class="ax-gs-267">Test</th>
            </tr>
          </thead>
          <tbody>
            ${r.items.map((it) => renderItem(it)).join('')}
          </tbody>
        </table>
        <div style="margin-top:10px;text-align:right">
          <button class="ax-btn ax-btn-sm ax-msh-reanalyze" data-idx="${idx}" style="padding:6px 12px;font-size:12px">🔄 Re-analyser</button>
        </div>
      </div>
    </details>
  `;
}

function renderItem(it: ExtractedItem): string {
  const typeColor = {
    credential: '#c9a227',
    site: '#5c9eff',
    identifier: '#aaff77',
    address: '#ff8855',
    device_id: '#ff66cc',
    metadata: '#888',
  }[it.type];

  const testCell = it.test_result
    ? it.test_result.ok
      ? `<span class="ax-gs-14">🟢 OK${it.test_result.latency_ms ? ` (${it.test_result.latency_ms}ms)` : ''}</span>`
      : `<span class="ax-gs-236">🔴 ${escapeHtml(it.test_result.error ?? 'fail')}</span>`
    : '<span class="ax-gs-64">—</span>';

  const forbiddenBadge = it.forbidden
    ? '<span style="color:#ff6b6b;font-size:10px;margin-left:4px;background:rgba(255,107,107,0.1);padding:2px 4px;border-radius:3px">🚫 FORBIDDEN</span>'
    : '';

  return `
    <tr class="ax-gs-232">
      <td style="padding:6px 8px;color:${typeColor};font-weight:600">${escapeHtml(it.type)}</td>
      <td class="ax-gs-267">${escapeHtml(it.service ?? '—')}${forbiddenBadge}</td>
      <td style="padding:6px 8px;font-family:monospace;color:#aaa">${escapeHtml(it.value.slice(0, 32))}${it.value.length > 32 ? '…' : ''}</td>
      <td class="ax-gs-267">${Math.round(it.confidence * 100)}%</td>
      <td class="ax-gs-267">${testCell}</td>
    </tr>
  `;
}

function wireHandlers(rootEl: HTMLElement, history: MultiSourceResult[]): void {
  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-msh-refresh');
  refreshBtn?.addEventListener('click', () => {
    haptic.tap();
    void render(rootEl);
  });

  const refreshSvcBtn = rootEl.querySelector<HTMLButtonElement>('#ax-msh-refresh-services');
  refreshSvcBtn?.addEventListener('click', () => {
    haptic.tap();
    void (async () => {
      toast.info('🔄 Refresh services en cours...', { duration: 3000 });
      try {
        const r = await studyService.refreshAll();
        toast.success(`✅ ${r.refreshed} services rafraîchis`, { duration: 5000 });
        if (r.errors.length > 0) {
          toast.warn(`⚠️ ${r.errors.length} erreur(s)`, { duration: 5000 });
        }
        void render(rootEl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Refresh fail : ${msg}`, { duration: 5000 });
      }
    })();
  });

  const clearBtn = rootEl.querySelector<HTMLButtonElement>('#ax-msh-clear');
  clearBtn?.addEventListener('click', () => {
    haptic.warning();
    if (!confirm('Vider tout l\'historique multi-source ? (irréversible)')) return;
    try {
      localStorage.removeItem('ax_multi_source_history');
      toast.success('🗑️ Historique vidé', { duration: 3000 });
      void render(rootEl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Clear fail : ${msg}`);
    }
  });

  /* Re-analyser bouton — actuellement re-render (placeholder, vraie ré-analyse demande source brute) */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-msh-reanalyze').forEach((btn) => {
    btn.addEventListener('click', () => {
      haptic.tap();
      const idx = parseInt(btn.dataset['idx'] ?? '-1', 10);
      const target = history[idx];
      if (!target) {
        toast.warn('Source non trouvée');
        return;
      }
      toast.info(`Re-analyse demandée pour source #${idx} (${target.source_type})`, { duration: 4000 });
      /* La source brute n'est pas conservée (sécu) — on ré-installe les éléments encore valides */
      void multiSourceAnalyze.installAll(target, { test: true }).then((r) => {
        toast.success(`✅ ${r.installed} installés · ${r.tested_ok} testés OK`, { duration: 5000 });
        void render(rootEl);
      });
    });
  });
}
