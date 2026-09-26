/**
 * APEX v13.3.33 — Feature Smart Router (admin only).
 *
 * Vue admin `?view=smart-router` qui affiche :
 * - Best provider courant + breakdown score (latence/quota/qualité/uptime)
 * - Tableau tous providers triés par score décroissant
 * - Bouton "🔄 Re-tester tous maintenant"
 * - Override admin Kevin (📌 Forcer provider X)
 * - Section "Recommandations" : économies possibles
 *
 * Demande Kevin 2026-05-07 : "teste et garde ce qui marche le mieux, le plus de
 * crédit etc va plus loin. AUTOMATIQUE AUTONOME TOUJOURS."
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import type { SmartProvider, ProviderStats } from '../../services/ai/smart-router.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

const PROVIDER_ICONS: Record<SmartProvider, string> = {
  anthropic: '🧠',
  openai: '🤖',
  groq: '⚡',
  gemini: '✨',
  mistral: '🌊',
  cohere: '🔷',
  xai: '🔥',
  perplexity: '🔍',
  deepseek: '🐋',
  openrouter: '🌐',
};

function fmtLatency(ms: number): string {
  if (ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtQuota(pct: number): string {
  if (pct < 0) return '—';
  return `${Math.round(pct)}%`;
}

function fmtRelativeTime(ts: number): string {
  if (ts === 0) return 'jamais';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l\'instant';
  if (diff < 3_600_000) return `il y a ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.round(diff / 3_600_000)} h`;
  return `il y a ${Math.round(diff / 86_400_000)} j`;
}

function statusDot(stats: ProviderStats | null): string {
  if (!stats || stats.last_ping_ts === 0) return '<span class="ax-gs-64">⚪</span>';
  if (!stats.last_ping_ok) return '<span class="ax-gs-13">🔴</span>';
  if (stats.latency_avg_ms > 3000) return '<span class="ax-gs-44">🟡</span>';
  return '<span class="ax-gs-14">🟢</span>';
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22cc77';
  if (score >= 60) return '#c9a227';
  if (score >= 40) return '#f0c020';
  return '#ff5b5b';
}

export async function render(rootEl: HTMLElement): Promise<void> {
  activeScope?.cleanup();
  activeScope = createCleanupScope('smart-router');

  const { smartRouter } = await import('../../services/ai/smart-router.js');
  const ranked = await smartRouter.rankProviders();
  const recos = await smartRouter.getRecommendations();
  const override = smartRouter.getOverride();
  const best = ranked[0];
  const allProviders = smartRouter.getAllProviders();

  /* Stats détaillées best */
  const bestStats = best ? await smartRouter.getStats(best.provider) : null;

  /* Pre-load stats for all providers to render table */
  const allStats = await Promise.all(
    allProviders.map(async (p) => ({
      provider: p,
      stats: await smartRouter.getStats(p),
      score: await smartRouter.scoreProvider(p),
    })),
  );
  allStats.sort((a, b) => b.score.total - a.score.total);

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-268">
      <h1 class="ax-gs-365">🎯 Smart IA Router</h1>
      <p class="ax-gs-377">
        Sélection automatique du meilleur provider — latence (40%) · quota (30%) · qualité (20%) · uptime (10%).
      </p>

      ${override ? `
        <div style="background:rgba(240,192,32,0.15);border:1px solid #c9a227;padding:10px 14px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>📌 <strong>Override admin actif</strong> : ${escapeHtml(PROVIDER_ICONS[override as SmartProvider] ?? '')} <strong>${escapeHtml(override)}</strong> forcé pour tous les calls IA.</span>
          <button class="ax-btn ax-btn-sm" id="ax-sr-clear-override" style="background:#444;color:#fff">✕ Retirer override</button>
        </div>
      ` : ''}

      <!-- Best provider card -->
      ${best ? `
        <div style="background:linear-gradient(135deg,rgba(34,204,119,0.15),rgba(20,20,35,0.5));padding:18px;border-radius:12px;border:2px solid ${scoreColor(best.score.total)};margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:8px">
            <div>
              <div style="font-size:11px;color:var(--ax-text-dim);text-transform:uppercase;letter-spacing:1px">Best provider courant</div>
              <h2 style="margin:4px 0;color:#fff;font-size:24px">${PROVIDER_ICONS[best.provider]} ${escapeHtml(best.provider)}</h2>
            </div>
            <div style="text-align:right">
              <div style="font-size:36px;font-weight:bold;color:${scoreColor(best.score.total)}">${best.score.total}<span style="font-size:16px;color:var(--ax-text-dim)">/100</span></div>
              <div class="ax-gs-2">${statusDot(bestStats)} ${bestStats ? fmtRelativeTime(bestStats.last_ping_ts) : 'pas de ping'}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:12px">
            <div class="ax-gs-45">
              <div class="ax-gs-8">⚡ Latence (40%)</div>
              <div class="ax-gs-31">${best.score.latency_pts}pts</div>
              <div class="ax-gs-8">${bestStats ? fmtLatency(bestStats.latency_avg_ms) : '—'} avg</div>
            </div>
            <div class="ax-gs-45">
              <div class="ax-gs-8">💰 Quota (30%)</div>
              <div class="ax-gs-31">${best.score.quota_pts}pts</div>
              <div class="ax-gs-8">${bestStats ? fmtQuota(bestStats.quota_remaining_pct) : '—'}</div>
            </div>
            <div class="ax-gs-45">
              <div class="ax-gs-8">✅ Qualité (20%)</div>
              <div class="ax-gs-31">${best.score.quality_pts}pts</div>
              <div class="ax-gs-8">${bestStats ? Math.round(bestStats.success_rate * 100) : 0}% success</div>
            </div>
            <div class="ax-gs-45">
              <div class="ax-gs-8">📡 Uptime (10%)</div>
              <div class="ax-gs-31">${best.score.uptime_pts}pts</div>
              <div class="ax-gs-8">${bestStats ? Math.round(bestStats.uptime_24h * 100) : 0}% / 24h</div>
            </div>
          </div>
        </div>
      ` : '<p>Aucun provider scoré. Lance "Re-tester tous" pour démarrer.</p>'}

      <!-- Action buttons -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
        <button class="ax-btn ax-btn-primary ax-btn-sm" id="ax-sr-retest">🔄 Re-tester tous maintenant</button>
        <button class="ax-btn ax-btn-secondary ax-btn-sm" id="ax-sr-refresh">↻ Rafraîchir vue</button>
        <button class="ax-btn ax-btn-secondary ax-btn-sm" id="ax-sr-reset" style="margin-left:auto;background:#552222;color:#fff">🗑 Reset stats</button>
      </div>

      <!-- Recommandations économiques -->
      ${recos.length > 0 ? `
        <div style="background:rgba(34,204,119,0.1);border:1px solid #22cc77;padding:14px;border-radius:10px;margin-bottom:18px">
          <h3 style="margin:0 0 8px;color:#22cc77;font-size:14px">💡 Recommandations économiques</h3>
          <ul style="margin:0;padding-left:20px;color:#fff;font-size:13px">
            ${recos.map((r) => `
              <li style="margin-bottom:4px">
                Bascule ${PROVIDER_ICONS[r.from]} <strong>${escapeHtml(r.from)}</strong> → ${PROVIDER_ICONS[r.to]} <strong>${escapeHtml(r.to)}</strong>
                <span class="ax-gs-14">économie ${r.savings_pct}%</span>
                <div class="ax-gs-2">${escapeHtml(r.reason)}</div>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Tableau tous providers -->
      <h2 style="margin:18px 0 8px;color:#c9a227;font-size:16px">Tous les providers (${allProviders.length})</h2>
      <div class="ax-gs-78">
        <table class="ax-gs-434">
          <thead>
            <tr class="ax-gs-387">
              <th class="ax-gs-447">Status</th>
              <th class="ax-gs-447">Provider</th>
              <th class="ax-gs-448">Score</th>
              <th class="ax-gs-448">Latence avg</th>
              <th class="ax-gs-448">p95</th>
              <th class="ax-gs-448">Success</th>
              <th class="ax-gs-448">Quota</th>
              <th class="ax-gs-448">Coût/M</th>
              <th class="ax-gs-448">Last ping</th>
              <th style="padding:10px;text-align:center;font-size:11px;color:#c9a227">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${allStats.map(({ provider, stats, score }) => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05)${provider === best?.provider ? ';background:rgba(34,204,119,0.05)' : ''}">
                <td class="ax-gs-316">${statusDot(stats)}</td>
                <td class="ax-gs-436"><strong>${PROVIDER_ICONS[provider]} ${escapeHtml(provider)}</strong></td>
                <td class="ax-gs-317">
                  <span style="color:${scoreColor(score.total)};font-weight:bold;font-size:14px">${score.total}</span>
                  <span style="color:var(--ax-text-dim);font-size:10px">/100</span>
                </td>
                <td class="ax-gs-449">${fmtLatency(stats?.latency_avg_ms ?? -1)}</td>
                <td class="ax-gs-450">${fmtLatency(stats?.latency_p95_ms ?? -1)}</td>
                <td class="ax-gs-449">${stats ? Math.round(stats.success_rate * 100) : 0}%</td>
                <td class="ax-gs-449">${fmtQuota(stats?.quota_remaining_pct ?? -1)}</td>
                <td class="ax-gs-450">$${smartRouter.getPricing(provider)}</td>
                <td class="ax-gs-450">${stats ? fmtRelativeTime(stats.last_ping_ts) : 'jamais'}</td>
                <td style="padding:10px;text-align:center">
                  <button class="ax-btn ax-btn-sm ax-sr-force" data-provider="${escapeHtml(provider)}" style="padding:4px 8px;font-size:10px;background:#c9a227;color:#000" title="Forcer ce provider">📌</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Footer info -->
      <p style="color:var(--ax-text-dim);font-size:11px;margin-top:16px;text-align:center">
        Sentinelle <code>smart-router-watch</code> ping toutes 30 min · Stats persistées localStorage · Override admin instant.
      </p>
    </div>
  `;

  /* Wire re-test all */
  const retestBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sr-retest');
  if (retestBtn && activeScope) {
    activeScope.bind(retestBtn, 'click', () => {
      void (async () => {
        const { toast } = await import('../../ui/toast.js');
        retestBtn.disabled = true;
        retestBtn.textContent = '⏳ Test en cours…';
        toast.info('Ping de 10 providers en parallèle…');
        try {
          await smartRouter.pingAllProviders();
          toast.success('✅ Tous les providers re-testés');
          await render(rootEl);
        } catch (err: unknown) {
          toast.error('Erreur ping: ' + (err instanceof Error ? err.message : String(err)));
          retestBtn.disabled = false;
          retestBtn.textContent = '🔄 Re-tester tous maintenant';
        }
      })();
    });
  }

  /* Wire refresh */
  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sr-refresh');
  if (refreshBtn && activeScope) {
    activeScope.bind(refreshBtn, 'click', () => { void render(rootEl); });
  }

  /* Wire reset */
  const resetBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sr-reset');
  if (resetBtn && activeScope) {
    activeScope.bind(resetBtn, 'click', () => {
      void (async () => {
        const { toast } = await import('../../ui/toast.js');
        if (typeof confirm === 'function' && !confirm('Reset toutes les stats Smart Router ? (samples + scores + override)')) return;
        smartRouter.resetAll();
        toast.success('Stats reset');
        await render(rootEl);
      })();
    });
  }

  /* Wire clear override */
  const clearOvBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sr-clear-override');
  if (clearOvBtn && activeScope) {
    activeScope.bind(clearOvBtn, 'click', () => {
      void (async () => {
        const { toast } = await import('../../ui/toast.js');
        smartRouter.setOverride(null);
        toast.success('Override retiré — auto-routing actif');
        await render(rootEl);
      })();
    });
  }

  /* Wire force-provider buttons */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-sr-force').forEach((btn) => {
    activeScope!.bind(btn, 'click', () => {
      void (async () => {
        const provider = btn.dataset['provider'] as SmartProvider | undefined;
        if (!provider) return;
        const { toast } = await import('../../ui/toast.js');
        smartRouter.setOverride(provider);
        toast.success(`📌 ${provider} forcé pour tous les calls`);
        await render(rootEl);
      })();
    });
  });

  logger.info('feature-smart-router', `rendered ${allProviders.length} providers, best=${best?.provider ?? 'none'}`);
}
