/**
 * APEX v13 — Feature Sentinels (admin only).
 * Liste sentinelles 24/7 actives + status + last result + auto-run buttons.
 * Boost MAX (2026-05-04) : utilise sentinels-registry typé + métriques perf affichées.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';

/* P1-6 (audit v13.2.7) : scope listener pour anti-leak SPA navigation. */
let activeSentinelsScope: CleanupScope | null = null;

export function dispose(): void {
  activeSentinelsScope?.cleanup();
  activeSentinelsScope = null;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  /* P1-6 : cleanup ancien scope avant re-render (anti listener leak) */
  activeSentinelsScope?.cleanup();
  activeSentinelsScope = createCleanupScope('sentinels');
  const { sentinels } = await import('../../services/sentinels/sentinels.js');
  const { sentinelsRegistry, bootstrapSentinelsRegistry } = await import('../../services/sentinels/sentinels-registry.js');
  /* Idempotent — booste vers 18+ sentinelles si pas déjà fait */
  bootstrapSentinelsRegistry();
  const list = sentinels.list();
  const status = sentinelsRegistry.getStatus();
  const metrics = sentinelsRegistry.getMetrics();
  const okCount = list.filter((s) => s.lastResult?.ok).length;
  const warnCount = list.filter((s) => s.lastResult && !s.lastResult.ok).length;
  const pendingCount = list.filter((s) => !s.lastResult).length;

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-376">
      <h1 class="ax-gs-365">🛡 Sentinelles 24/7</h1>
      <p class="ax-gs-385">
        ${list.length} watchers (${status.running} active) ·
        <span class="ax-gs-14">✅ ${okCount} OK</span> ·
        <span class="ax-gs-61">⚠️ ${warnCount} WARN</span> ·
        <span class="ax-gs-25">⏳ ${pendingCount} PENDING</span>
      </p>
      <p style="color:var(--ax-text-dim);margin:0 0 12px;font-size:12px">
        📊 Métriques : ${metrics.totalRuns} runs · avg ${metrics.avgDurationMs}ms · auto-fix ${metrics.totalAutoFixSuccess}✅ / ${metrics.totalAutoFixFailures}❌
      </p>

      <div class="ax-gs-65">
        <button class="ax-btn ax-btn-primary ax-btn-sm" id="ax-sent-run-all">▶️ Run all maintenant</button>
        <button class="ax-btn ax-btn-secondary ax-btn-sm" id="ax-sent-refresh">🔄 Rafraîchir</button>
      </div>

      <table class="ax-gs-434">
        <thead>
          <tr class="ax-gs-387">
            <th class="ax-gs-435">Sentinel</th>
            <th class="ax-gs-435">Interval</th>
            <th class="ax-gs-435">Last result</th>
            <th style="padding:10px;text-align:right;font-size:12px;color:#c9a227;border-bottom:1px solid rgba(201,162,39,0.3)">Action</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((s) => {
            const intervalLabel = s.intervalMs >= 3600000 ? `${Math.round(s.intervalMs / 3600000)}h`
              : s.intervalMs >= 60000 ? `${Math.round(s.intervalMs / 60000)}min`
              : `${Math.round(s.intervalMs / 1000)}s`;
            const status = s.lastResult ? (s.lastResult.ok ? '✅' : '⚠️') : '⏳';
            const msg = s.lastResult?.msg ?? 'Pas encore exécuté';
            const ageMin = s.lastResult ? Math.round((Date.now() - s.lastResult.ts) / 60000) : null;
            return `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer" class="ax-sent-row" data-sent-id="${s.id}">
                <td class="ax-gs-436">
                  <strong>${escapeHtml(s.name)}</strong>
                  <div class="ax-gs-2">${escapeHtml(s.desc)}</div>
                </td>
                <td style="padding:10px;font-size:12px;color:var(--ax-text-dim)">${intervalLabel}</td>
                <td style="padding:10px;font-size:12px">
                  ${status} <span style="color:${s.lastResult?.ok ? '#22cc77' : s.lastResult ? '#ffaa00' : '#888'}">${escapeHtml(msg.slice(0, 60))}</span>
                  ${ageMin !== null ? `<div style="font-size:10px;color:#888">il y a ${ageMin}min</div>` : ''}
                </td>
                <td class="ax-gs-317">
                  <button class="ax-btn ax-btn-sm ax-sent-run" data-sent-id="${s.id}" style="padding:4px 10px;font-size:11px" aria-label="Exécuter sentinelle">▶️</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;

  /* Wire run all (scope listener cleanup) */
  const runAllBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sent-run-all');
  if (runAllBtn) {
    activeSentinelsScope.bind(runAllBtn, 'click', () => {
      void (async () => {
        const { toast } = await import('../../ui/toast.js');
        toast.info(`Exécution de ${list.length} sentinelles...`);
        await Promise.all(list.map((s) => sentinels.runOne(s.id)));
        toast.success('✅ Tous les sentinelles re-exécutés');
        await render(rootEl); /* Refresh */
      })();
    });
  }

  /* Wire refresh */
  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sent-refresh');
  if (refreshBtn) {
    activeSentinelsScope.bind(refreshBtn, 'click', () => {
      void render(rootEl);
    });
  }

  /* Wire run individual */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-sent-run').forEach((btn) => {
    activeSentinelsScope!.bind(btn, 'click', (e) => {
      e.stopPropagation(); /* don't bubble to row click */
      void (async () => {
        const id = btn.dataset['sentId'];
        if (!id) return;
        const { toast } = await import('../../ui/toast.js');
        const r = await sentinels.runOne(id);
        toast[r?.ok ? 'success' : 'warn'](`${id}: ${r?.msg ?? 'KO'}`);
        await render(rootEl);
      })();
    });
  });

  /* v13.3.57 PUSH-100 : drilldown récursif sur clic row sentinelle.
   * Click row → modal détail avec config + last result + run history. */
  rootEl.querySelectorAll<HTMLTableRowElement>('.ax-sent-row').forEach((row) => {
    activeSentinelsScope!.bind(row, 'click', () => {
      void (async () => {
        const id = row.dataset['sentId'];
        if (!id) return;
        const sent = list.find((s) => s.id === id);
        if (!sent) return;
        const { drillDown } = await import('../../ui/drilldown.js');
        const mountId = 'ax-drilldown-mount-sentinels';
        let mount = document.getElementById(mountId);
        if (!mount) {
          mount = document.createElement('div');
          mount.id = mountId;
          document.body.appendChild(mount);
        }
        drillDown.open({
          id: `sent-${id}`,
          title: `🛡 ${sent.name}`,
          content: () => {
            const lastOk = sent.lastResult?.ok;
            const lastMsg = sent.lastResult?.msg ?? '—';
            const lastTs = sent.lastResult ? new Date(sent.lastResult.ts).toLocaleString('fr-FR') : '—';
            return `
              <div class="ax-gs-27">
                <p class="ax-gs-363">${escapeHtml(sent.desc)}</p>
                <table class="ax-gs-291">
                  <tr><td class="ax-gs-367">ID</td><td><code>${escapeHtml(sent.id)}</code></td></tr>
                  <tr><td class="ax-gs-367">Interval</td><td>${Math.round(sent.intervalMs / 1000)}s</td></tr>
                  <tr><td class="ax-gs-367">Dernier statut</td><td>${lastOk === undefined ? '⏳ Pending' : lastOk ? '✅ OK' : '⚠️ WARN'}</td></tr>
                  <tr><td class="ax-gs-367">Dernier message</td><td>${escapeHtml(lastMsg)}</td></tr>
                  <tr><td class="ax-gs-367">Dernière exec</td><td>${escapeHtml(lastTs)}</td></tr>
                </table>
              </div>
            `;
          },
          data: { sentinelId: id },
        }, mount);
      })();
    });
  });

  logger.info('feature-sentinels', `rendered ${list.length} sentinels (${okCount}OK / ${warnCount}WARN)`);
}

