/**
 * APEX v13.4.13 — Vue admin "🧪 Runtime Tests" (Kevin "Apex doit tester réel tout").
 *
 * Run TOUS les skills 2026 en runtime browser et affiche preuves.
 * Différence vs vitest jsdom :
 *   - vitest = structure code valid (fallback safe)
 *   - runtime tests = chain complète CDN → lib → output téléchargeable
 */

import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { runtimeTester, type RuntimeTestReport, type RuntimeTestResult } from '../../../services/admin/apex-runtime-tester.js';
import { toast } from '../../../ui/toast.js';

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = { pass: '✅', fail: '❌', warn: '⚠️', skip: '⏭' };
  return map[status] ?? '❓';
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pass: '#10b981',
    fail: '#ef4444',
    warn: '#f59e0b',
    skip: '#94a3b8',
  };
  return map[status] ?? '#cbd5e1';
}

export function render(rootEl: HTMLElement): void {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `<div class="ax-gs-37">🔒 Réservé admin Kevin</div>`;
    return;
  }

  const lastReport = runtimeTester.getLastReport();
  const history = runtimeTester.getHistory();

  function renderReport(report: RuntimeTestReport): string {
    return `
      <div class="ax-gs-113">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="color:#f1f5f9;font-size:16px">${report.summary.passed}/${report.summary.total} passed</strong>
            <span style="color:${statusColor(report.summary.successRate === 100 ? 'pass' : report.summary.successRate >= 70 ? 'warn' : 'fail')};font-weight:600;margin-left:8px">${report.summary.successRate}%</span>
          </div>
          <div style="font-size:12px;color:#94a3b8">
            ${escapeHtml(new Date(report.startedAt).toLocaleString('fr-FR'))} • ${(report.totalDurationMs / 1000).toFixed(1)}s
          </div>
        </div>
        <div style="display:flex;gap:12px;font-size:12px;color:#cbd5e1;margin-bottom:12px;flex-wrap:wrap">
          <span>✅ ${report.summary.passed}</span>
          <span>❌ ${report.summary.failed}</span>
          <span>⚠️ ${report.summary.warnings}</span>
          <span>⏭ ${report.summary.skipped}</span>
        </div>
        <details class="ax-gs-186">
          <summary style="cursor:pointer;color:#cbd5e1;font-size:13px;padding:6px 0">📋 Voir détails (${report.results.length} tests)</summary>
          <div class="ax-gs-114">
            ${report.results.map((r: RuntimeTestResult) => `
              <div style="background:#1e293b;padding:10px;border-radius:6px;margin-bottom:6px;border-left:3px solid ${statusColor(r.status)}">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <div class="ax-gs-6">
                    <div style="color:#f1f5f9;font-size:13px;font-weight:600">${statusEmoji(r.status)} ${escapeHtml(r.name)}</div>
                    <div style="color:#94a3b8;font-size:11px;margin-top:2px">${escapeHtml(r.category)} • ${r.durationMs}ms</div>
                    ${r.error ? `<div style="color:#ef4444;font-size:11px;margin-top:4px">❌ ${escapeHtml(r.error)}</div>` : ''}
                    ${r.evidence?.filename ? `<div style="color:#10b981;font-size:11px;margin-top:4px">📄 ${escapeHtml(r.evidence.filename)} (${(r.evidence.sizeBytes ?? 0) / 1024} Ko) ${r.evidence.blobUrl ? `<a href="${r.evidence.blobUrl}" download="${escapeHtml(r.evidence.filename)}" style="color:#3b82f6;margin-left:8px">⬇️ DL</a>` : ''}</div>` : ''}
                    ${r.evidence?.latencyMs ? `<div style="color:#94a3b8;font-size:11px;margin-top:4px">⏱ ${r.evidence.latencyMs}ms</div>` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    `;
  }

  rootEl.innerHTML = `
    <div class="ax-gs-115">
      <h1 class="ax-gs-289">🧪 Runtime Tests — Apex teste TOUT</h1>
      <p class="ax-gs-199">
        Exécute tous les skills 2026 + MCP + sentinelles en runtime browser <strong>RÉEL</strong>
        (CDN load → lib exec → blob téléchargeable).
      </p>

      <button id="run-all-tests" style="width:100%;padding:14px;background:#3b82f6;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;min-height:48px;margin-bottom:20px">
        🧪 Lancer TOUS les tests réels (env 30s)
      </button>

      <div id="test-progress" style="display:none;background:#0f172a;border:1px solid #3b82f6;border-radius:8px;padding:12px;margin-bottom:16px">
        <div id="progress-text" style="color:#f1f5f9;font-size:13px;margin-bottom:6px">Initialisation...</div>
        <div style="background:#1e293b;border-radius:4px;height:6px;overflow:hidden">
          <div id="progress-bar" style="background:#3b82f6;height:100%;width:0%;transition:width 0.3s"></div>
        </div>
      </div>

      <div id="test-results">
        ${lastReport ? `<h3 class="ax-gs-294">Dernier rapport</h3>${renderReport(lastReport)}` : '<p style="color:#94a3b8;text-align:center;padding:30px;background:#0f172a;border-radius:12px">Aucun test runtime exécuté. Clique sur le bouton ci-dessus pour démarrer.</p>'}
      </div>

      ${history.length > 1 ? `
        <h3 style="font-size:16px;color:#f1f5f9;margin:24px 0 12px">📊 Historique (${history.length} runs)</h3>
        <div style="background:#0f172a;border-radius:8px;padding:12px">
          ${history.slice(0, 10).map((h) => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b;font-size:12px">
              <span style="color:#cbd5e1">${escapeHtml(new Date(h.startedAt).toLocaleString('fr-FR'))}</span>
              <span style="color:${statusColor(h.successRate === 100 ? 'pass' : h.successRate >= 70 ? 'warn' : 'fail')};font-weight:600">${h.successRate}% (${h.total} tests)</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="ax-gs-116">
        💡 <strong>Note Kevin :</strong> Ces tests sont <strong>RÉELS</strong> (CDN chargés, libs exécutées,
        blobs créés). Le bouton ⬇️ DL télécharge le fichier produit pendant le test pour vérification visuelle.
        Voir aussi <a href="?view=skills-2026" class="ax-gs-200">🎯 Skills 2026</a> et
        <a href="?view=mcp-servers" class="ax-gs-200">🔌 MCP Servers</a>.
      </div>
    </div>
  `;

  rootEl.querySelector('#run-all-tests')?.addEventListener('click', async () => {
    const btn = rootEl.querySelector('#run-all-tests') as HTMLButtonElement;
    const progressEl = rootEl.querySelector('#test-progress') as HTMLElement;
    const progressText = rootEl.querySelector('#progress-text') as HTMLElement;
    const progressBar = rootEl.querySelector('#progress-bar') as HTMLElement;

    btn.disabled = true;
    btn.textContent = '🧪 Tests en cours...';
    progressEl.style.display = 'block';

    try {
      toast.info('🧪 Tests runtime lancés...');
      await runtimeTester.runAll((current, done, total) => {
        progressText.textContent = `${current} (${done}/${total})`;
        progressBar.style.width = `${Math.round((done / total) * 100)}%`;
      });
      toast.success('✅ Tests runtime terminés');
      render(rootEl);
    } catch (err) {
      logger.warn('runtime-tests', 'failed', { err });
      toast.error(`❌ ${err instanceof Error ? err.message : 'Erreur'}`);
      btn.disabled = false;
      btn.textContent = '🧪 Lancer TOUS les tests réels (env 30s)';
    }
  });
}
