/**
 * APEX v13 — Feature Innovation Watch (admin only).
 *
 * UI : tab "💡 Innovation" listant tous les TechUpdate par catégorie.
 * Boutons :
 *  - 🔄 Scanner maintenant → innovationWatch.runScan()
 *  - Apply → markUpdate(id, 'applied')
 *  - Skip  → markUpdate(id, 'skipped')
 *
 * Stats affichées : last scan / total detected / lastWeek / appliedCount.
 *
 * Pas de wiring router ici (feature montée par admin tab loader).
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import type { TechUpdate, InnovationCategory } from '../../services/sentinels/innovation-watch.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeInnovationScope: CleanupScope | null = null;

export function dispose(): void {
  activeInnovationScope?.cleanup();
  activeInnovationScope = null;
}

const CATEGORY_LABELS: Record<InnovationCategory, string> = {
  'ai-provider': '🤖 IA Provider',
  'lib-npm': '📦 Lib npm',
  'api-service': '🌐 API Service',
  'browser-api': '🌍 Browser API',
  'tts-stt': '🎙 TTS/STT',
  vision: '👁 Vision',
  'image-gen': '🎨 Image Gen',
  'video-gen': '🎬 Video Gen',
  'vector-db': '🗄 Vector DB',
  auth: '🔐 Auth',
  'mobile-framework': '📱 Mobile',
  bundler: '⚙ Bundler',
};

function formatGain(update: TechUpdate): string {
  const g = update.estimatedGain;
  if (!g) return '—';
  const parts: string[] = [];
  if (g.perf !== undefined) parts.push(`perf +${g.perf}%`);
  if (g.cost !== undefined) parts.push(`cost +${g.cost}%`);
  if (g.capabilities !== undefined) parts.push(`cap +${g.capabilities}%`);
  if (g.bundleSize !== undefined) parts.push(`bundle -${g.bundleSize}%`);
  return parts.join(', ') || '—';
}

function recoBadge(reco: TechUpdate['recommendation']): string {
  const map: Record<TechUpdate['recommendation'], string> = {
    'upgrade-asap': '<span class="ax-gs-14">⚡ ASAP</span>',
    'upgrade-soon': '<span class="ax-gs-44">⏳ SOON</span>',
    monitor: '<span class="ax-gs-25">👀 MONITOR</span>',
    skip: '<span class="ax-gs-64">— SKIP</span>',
    'breaking-changes': '<span class="ax-gs-13">⚠ BREAKING</span>',
  };
  return map[reco];
}

export async function render(rootEl: HTMLElement): Promise<void> {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeInnovationScope?.cleanup();
  activeInnovationScope = createCleanupScope('innovation');
  const { innovationWatch } = await import('../../services/sentinels/innovation-watch.js');
  const stats = innovationWatch.getStats();
  const updates = innovationWatch.getUpdates();
  const pending = updates.filter((u) => (u.status ?? 'pending') === 'pending');
  const lastScanLabel = stats.lastScan === 0 ? 'jamais' : new Date(stats.lastScan).toLocaleString('fr-FR');

  /* Group by category */
  const byCat = new Map<InnovationCategory, TechUpdate[]>();
  for (const u of pending) {
    const arr = byCat.get(u.category) ?? [];
    arr.push(u);
    byCat.set(u.category, arr);
  }

  rootEl.innerHTML = `
    <div class="ax-page" style="padding:16px;max-width:1000px;margin:0 auto">
      <h1 class="ax-gs-365">💡 Innovation Watch</h1>
      <p class="ax-gs-385">
        Veille technologique 24/7 — npm / IA providers / HuggingFace / GitHub.
      </p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:16px">
        <div class="ax-gs-9">
          <div class="ax-gs-2">Dernier scan</div>
          <div class="ax-gs-31">${escapeHtml(lastScanLabel)}</div>
        </div>
        <div class="ax-gs-9">
          <div class="ax-gs-2">Total détecté</div>
          <div style="font-size:18px;color:#c9a227">${stats.totalUpdatesDetected}</div>
        </div>
        <div class="ax-gs-9">
          <div class="ax-gs-2">7 derniers jours</div>
          <div class="ax-gs-137">${stats.lastWeek}</div>
        </div>
        <div class="ax-gs-9">
          <div class="ax-gs-2">Auto-appliqués</div>
          <div class="ax-gs-137">${stats.appliedCount}</div>
        </div>
        <div class="ax-gs-9">
          <div class="ax-gs-2">Skipped</div>
          <div style="font-size:18px;color:#888">${stats.skippedCount}</div>
        </div>
      </div>

      <div class="ax-gs-65">
        <button class="ax-btn ax-btn-primary ax-btn-sm" id="ax-inno-scan">🔄 Scanner maintenant</button>
        <button class="ax-btn ax-btn-secondary ax-btn-sm" id="ax-inno-refresh">↻ Rafraîchir</button>
        <button class="ax-btn ax-btn-secondary ax-btn-sm" id="ax-inno-reset">🗑 Reset historique</button>
      </div>

      ${pending.length === 0
        ? `<p class="ax-gs-231">Aucune update en attente. Lance un scan pour vérifier.</p>`
        : [...byCat.entries()]
            .map(([cat, list]) => `
              <h2 class="ax-gs-386">${CATEGORY_LABELS[cat]} (${list.length})</h2>
              <table style="width:100%;border-collapse:collapse;background:rgba(20,20,35,0.5);border-radius:12px;overflow:hidden;margin-bottom:8px">
                <thead>
                  <tr class="ax-gs-387">
                    <th class="ax-gs-388">Nom</th>
                    <th class="ax-gs-388">Versions</th>
                    <th class="ax-gs-388">Gain</th>
                    <th class="ax-gs-388">Reco</th>
                    <th style="padding:8px;text-align:right;font-size:11px;color:#c9a227">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map((u) => `
                    <tr class="ax-gs-184">
                      <td style="padding:8px;font-size:12px"><strong>${escapeHtml(u.name)}</strong>${u.details ? `<div class="ax-gs-8">${escapeHtml(u.details)}</div>` : ''}</td>
                      <td style="padding:8px;font-size:11px;color:var(--ax-text-dim)">${escapeHtml(u.currentVersion ?? '—')} → ${escapeHtml(u.latestVersion ?? '—')}</td>
                      <td style="padding:8px;font-size:11px;color:#22cc77">${escapeHtml(formatGain(u))}</td>
                      <td style="padding:8px;font-size:11px">${recoBadge(u.recommendation)}</td>
                      <td style="padding:8px;text-align:right">
                        <button class="ax-btn ax-btn-sm ax-inno-apply" data-id="${escapeHtml(u.id)}" style="padding:4px 8px;font-size:11px;background:#22cc77">Apply</button>
                        <button class="ax-btn ax-btn-sm ax-inno-skip ax-gs-389" data-id="${escapeHtml(u.id)}">Skip</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `)
            .join('')
      }
    </div>
  `;

  /* Wire scan now */
  const scanBtn = rootEl.querySelector<HTMLButtonElement>('#ax-inno-scan');
  if (scanBtn && activeInnovationScope) activeInnovationScope.bind(scanBtn, 'click', () => {
    void (async () => {
      const { toast } = await import('../../ui/toast.js');
      toast.info('Scan en cours…');
      try {
        const result = await innovationWatch.runScan();
        toast.success(`✅ ${result.summary}`);
        await render(rootEl);
      } catch (err: unknown) {
        console.error('[innovation] scan', err);
        toast.error('Analyse impossible — réessaie dans un instant');
      }
    })();
  });

  /* Wire refresh */
  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-inno-refresh');
  if (refreshBtn && activeInnovationScope) activeInnovationScope.bind(refreshBtn, 'click', () => {
    void render(rootEl);
  });

  /* Wire reset */
  const resetBtn = rootEl.querySelector<HTMLButtonElement>('#ax-inno-reset');
  if (resetBtn && activeInnovationScope) activeInnovationScope.bind(resetBtn, 'click', () => {
    void (async () => {
      const { toast } = await import('../../ui/toast.js');
      if (typeof confirm === 'function' && !confirm('Reset historique innovation watch ?')) return;
      innovationWatch.reset();
      toast.success('Historique réinitialisé');
      await render(rootEl);
    })();
  });

  /* Wire apply / skip per row */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-inno-apply').forEach((btn) => {
    activeInnovationScope!.bind(btn, 'click', () => {
      void (async () => {
        const id = btn.dataset['id'];
        if (!id) return;
        const { toast } = await import('../../ui/toast.js');
        innovationWatch.markUpdate(id, 'applied');
        toast.success('Marqué comme appliqué');
        await render(rootEl);
      })();
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('.ax-inno-skip').forEach((btn) => {
    activeInnovationScope!.bind(btn, 'click', () => {
      void (async () => {
        const id = btn.dataset['id'];
        if (!id) return;
        const { toast } = await import('../../ui/toast.js');
        innovationWatch.markUpdate(id, 'skipped');
        toast.info('Skippé');
        await render(rootEl);
      })();
    });
  });

  logger.info('feature-innovation', `rendered ${pending.length} pending updates (${stats.totalUpdatesDetected} total)`);
}
