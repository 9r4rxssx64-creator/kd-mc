/**
 * APEX v13.4.5 — Vue admin "🤖 Mode Autonome" (Kevin 2026-05-10).
 *
 * Monitor session Apex autonome en cours :
 *   - Card session active (objective, durée, iterations, tokens, queue)
 *   - Kill switch "🛑 Stop"
 *   - Pause / Resume
 *   - Live log (10 dernières actions)
 *   - History des sessions précédentes (collapsable)
 *   - Stats sentinelle autonomous-watch (tick count, dernier tick)
 *
 * Sécurité : admin-only via store.get('isAdmin').
 * UX iPhone 375px : cards empilées, touch targets ≥44px.
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import {
  apexAutonomousMode,
  type AutonomousSession,
  type AutonomousStatus,
} from '../../../services/admin/apex-autonomous-mode.js';
import { autonomousWatch } from '../../../services/sentinels/autonomous-watch.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

export function dispose(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  activeScope?.cleanup();
  activeScope = null;
}

function statusBadge(status: AutonomousStatus): string {
  const palette: Record<AutonomousStatus, { color: string; bg: string; emoji: string }> = {
    running: { color: '#0a0', bg: 'rgba(60,200,80,0.18)', emoji: '🟢' },
    paused: { color: '#cc9000', bg: 'rgba(255,200,60,0.15)', emoji: '⏸' },
    stopped: { color: '#aaa', bg: 'rgba(255,255,255,0.08)', emoji: '🛑' },
    quota_exhausted: { color: '#c50', bg: 'rgba(220,90,30,0.15)', emoji: '🪫' },
    completed: { color: '#08c', bg: 'rgba(70,140,210,0.15)', emoji: '🏁' },
    failed: { color: '#c33', bg: 'rgba(220,60,60,0.15)', emoji: '❌' },
  };
  const p = palette[status];
  return `<span class="ax-badge" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:14px;background:${p.bg};color:${p.color};font-weight:600;font-size:12px">${p.emoji} ${status}</span>`;
}

function renderActiveSession(s: AutonomousSession | null): string {
  if (!s) {
    return `
      <div class="ax-card" style="padding:18px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);text-align:center">
        <p style="font-size:48px;margin:0 0 8px">💤</p>
        <h3 style="margin:0 0 6px;color:rgba(255,255,255,0.85)">Aucune session active</h3>
        <p class="ax-muted" style="font-size:13px;color:rgba(255,255,255,0.55)">Lance le mode autonome dans le chat avec <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:6px">/autonomous &lt;objectif&gt;</code></p>
      </div>
    `;
  }
  const done = s.tasksCompleted.filter((t) => t.status === 'done').length;
  const fail = s.tasksCompleted.filter((t) => t.status === 'failed').length;
  const ageMin = Math.round((Date.now() - s.startedAt) / 60000);
  const maxIter =
    (s as AutonomousSession & { maxIterations?: number }).maxIterations ?? 50;
  const quotaLim =
    (s as AutonomousSession & { quotaLimit?: number }).quotaLimit ?? 50000;
  const tokensPct = Math.min(100, Math.round((s.tokensConsumed / quotaLim) * 100));
  const iterPct = Math.min(100, Math.round((s.iterations / maxIter) * 100));

  return `
    <div class="ax-card" data-session-id="${escapeHtml(s.id)}" style="padding:18px;border-radius:16px;background:linear-gradient(135deg,rgba(232,184,48,0.08),rgba(60,200,80,0.04));border:1px solid rgba(232,184,48,0.18)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <h3 style="margin:0;font-size:15px;color:rgba(255,255,255,0.9)">🤖 Session active</h3>
        ${statusBadge(s.status)}
      </div>
      <p style="margin:0 0 12px;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.5">${escapeHtml(s.initialObjective.slice(0, 400))}</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px">
        <div class="ax-gs-38">
          <p class="ax-gs-273">Durée</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#e8b830">${ageMin} min</p>
        </div>
        <div class="ax-gs-38">
          <p class="ax-gs-273">Itérations</p>
          <p class="ax-gs-274">${s.iterations}/${maxIter}</p>
          <div class="ax-gs-90"><div style="width:${iterPct}%;background:#e8b830;height:100%"></div></div>
        </div>
        <div class="ax-gs-38">
          <p class="ax-gs-273">Tokens</p>
          <p class="ax-gs-274">${s.tokensConsumed}</p>
          <div class="ax-gs-90"><div style="width:${tokensPct}%;background:${tokensPct > 80 ? '#c50' : '#3cc'};height:100%"></div></div>
        </div>
        <div class="ax-gs-38">
          <p class="ax-gs-273">Tâches</p>
          <p class="ax-gs-274">✅ ${done} <span style="font-size:13px;color:#c33">❌ ${fail}</span></p>
          <p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,0.55)">📋 ${s.taskQueue.length} en queue</p>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${
          s.status === 'running'
            ? `<button class="ax-btn" data-action="pause" style="min-height:44px;padding:10px 18px;border-radius:22px;background:rgba(255,200,60,0.18);color:#e8b830;border:1px solid rgba(232,184,48,0.3);font-weight:600;cursor:pointer">⏸ Pauser</button>`
            : s.status === 'paused'
              ? `<button class="ax-btn" data-action="resume" style="min-height:44px;padding:10px 18px;border-radius:22px;background:rgba(60,200,80,0.18);color:#3c8;border:1px solid rgba(60,200,80,0.3);font-weight:600;cursor:pointer">▶️ Reprendre</button>`
              : ''
        }
        <button class="ax-btn" data-action="stop" style="min-height:44px;padding:10px 18px;border-radius:22px;background:rgba(220,60,60,0.18);color:#c33;border:1px solid rgba(220,60,60,0.3);font-weight:600;cursor:pointer">🛑 Stop</button>
        <button class="ax-btn" data-action="force-tick" style="min-height:44px;padding:10px 18px;border-radius:22px;background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.1);font-weight:600;cursor:pointer">⚡ Forcer tick</button>
      </div>

      <details class="ax-gs-186">
        <summary class="ax-gs-275">📜 Logs récents (${s.logs.length})</summary>
        <div style="max-height:260px;overflow-y:auto;background:rgba(0,0,0,0.35);border-radius:10px;padding:10px;margin-top:6px;font-family:ui-monospace,monospace;font-size:11.5px;line-height:1.5">
          ${s.logs
            .slice(-15)
            .reverse()
            .map((l) => {
              const t = new Date(l.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const color = l.level === 'error' ? '#f66' : l.level === 'warn' ? '#fc6' : 'rgba(200,220,200,0.85)';
              return `<div style="color:${color};margin-bottom:2px"><span class="ax-gs-91">${t}</span> ${escapeHtml(l.msg)}</div>`;
            })
            .join('') || '<em style="color:rgba(255,255,255,0.5)">aucun log</em>'}
        </div>
      </details>

      <details class="ax-gs-186">
        <summary class="ax-gs-275">📋 Queue (${s.taskQueue.length}) + Faites (${s.tasksCompleted.length})</summary>
        <div style="background:rgba(0,0,0,0.35);border-radius:10px;padding:10px;margin-top:6px">
          <h4 style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.7)">À faire</h4>
          ${
            s.taskQueue.length === 0
              ? '<em class="ax-gs-183">queue vide</em>'
              : s.taskQueue
                  .map(
                    (t) =>
                      `<div style="padding:6px 8px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px;font-size:12px;color:rgba(255,255,255,0.85)">⏳ ${escapeHtml(t.description.slice(0, 180))}</div>`,
                  )
                  .join('')
          }
          <h4 style="margin:10px 0 6px;font-size:12px;color:rgba(255,255,255,0.7)">Faites (${s.tasksCompleted.length})</h4>
          ${s.tasksCompleted
            .slice(-8)
            .reverse()
            .map((t) => {
              const icon = t.status === 'done' ? '✅' : '❌';
              const color = t.status === 'done' ? 'rgba(200,255,200,0.85)' : '#f66';
              return `<div style="padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:6px;margin-bottom:4px;font-size:12px;color:${color}">${icon} ${escapeHtml(t.description.slice(0, 180))}</div>`;
            })
            .join('') || '<em class="ax-gs-183">aucune</em>'}
        </div>
      </details>
    </div>
  `;
}

function renderHistory(): string {
  const hist = apexAutonomousMode.getHistory(10);
  if (hist.length === 0) {
    return '';
  }
  const rows = hist
    .map((h) => {
      const ageHrs = Math.round((Date.now() - h.startedAt) / 3600000);
      const dur = h.endedAt ? Math.round((h.endedAt - h.startedAt) / 60000) : null;
      const doneN = h.tasksCompleted.filter((t) => t.status === 'done').length;
      return `<tr>
        <td class="ax-gs-276">${statusBadge(h.status)}</td>
        <td style="padding:8px 6px;font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(h.initialObjective.slice(0, 120))}</td>
        <td style="padding:8px 6px;font-size:11px;color:rgba(255,255,255,0.6)">il y a ${ageHrs}h</td>
        <td class="ax-gs-277">${doneN}/${h.iterations}</td>
        <td class="ax-gs-277">${h.tokensConsumed}</td>
        <td class="ax-gs-277">${dur ?? '–'} min</td>
      </tr>`;
    })
    .join('');
  return `
    <details class="ax-gs-187" open>
      <summary style="cursor:pointer;font-weight:600;color:rgba(255,255,255,0.85);padding:10px 0;font-size:14px">📚 Historique (${hist.length})</summary>
      <div style="overflow-x:auto;background:rgba(0,0,0,0.25);border-radius:12px;margin-top:6px">
        <table style="width:100%;border-collapse:collapse;font-size:12px;color:rgba(255,255,255,0.85)">
          <thead>
            <tr style="text-align:left;background:rgba(255,255,255,0.04)">
              <th class="ax-gs-276">Statut</th>
              <th class="ax-gs-276">Objectif</th>
              <th class="ax-gs-276">Quand</th>
              <th class="ax-gs-278">Fait</th>
              <th class="ax-gs-278">Tokens</th>
              <th class="ax-gs-278">Durée</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  `;
}

function renderWatchStats(): string {
  const stats = autonomousWatch.getStats();
  const lastTickAgo = stats.lastTickAt
    ? Math.round((Date.now() - stats.lastTickAt) / 1000) + 's'
    : '–';
  return `
    <div class="ax-card" style="padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:rgba(255,255,255,0.7)">
      <span><strong style="color:${stats.active ? '#3c8' : '#c33'}">Sentinelle</strong> : ${stats.active ? '🟢 active' : '🔴 stop'}</span>
      <span><strong>Ticks</strong> : ${stats.tickCount}</span>
      <span><strong>Dernier tick</strong> : ${lastTickAgo}</span>
    </div>
  `;
}

function renderPage(): string {
  const s = apexAutonomousMode.getActiveSession();
  return `
    <div style="padding:14px;max-width:920px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <button class="ax-btn" data-action="back" style="min-height:44px;min-width:44px;padding:8px 14px;border-radius:22px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.1);font-weight:600;cursor:pointer">← Admin</button>
        <h2 style="margin:0;font-size:20px;color:rgba(255,255,255,0.95);flex:1">🤖 Mode Autonome Apex</h2>
        <button class="ax-btn" data-action="refresh" aria-label="Rafraîchir" style="min-height:44px;min-width:44px;padding:8px 12px;border-radius:22px;background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.08);font-weight:600;cursor:pointer" title="Rafraîchir">🔄</button>
      </div>
      <p class="ax-muted" style="color:rgba(255,255,255,0.55);font-size:13px;margin:0 0 14px">Apex bosse seul jusqu'à fin objectif ou épuisement forfait Anthropic.</p>

      ${renderActiveSession(s)}
      ${renderWatchStats()}
      ${renderHistory()}
    </div>
  `;
}

function attachHandlers(rootEl: HTMLElement): void {
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    activeScope!.bind(btn, 'click', async () => {
      haptic.tap();
      const action = btn.dataset['action'] ?? '';
      try {
        if (action === 'back') {
          window.location.hash = '#admin';
        } else if (action === 'refresh') {
          render(rootEl);
          toast.info('Rafraîchi');
        } else if (action === 'stop') {
          if (!confirm('Arrêter le mode autonome ?')) return;
          apexAutonomousMode.stop(undefined, 'admin-ui-stop');
          toast.success('🛑 Session arrêtée');
          render(rootEl);
        } else if (action === 'pause') {
          apexAutonomousMode.pause();
          toast.info('⏸ Session pausée');
          render(rootEl);
        } else if (action === 'resume') {
          apexAutonomousMode.resume();
          toast.success('▶️ Session reprise');
          render(rootEl);
        } else if (action === 'force-tick') {
          toast.info('⚡ Tick forcé…');
          await autonomousWatch.forceTick();
          render(rootEl);
        }
      } catch (err: unknown) {
        logger.warn('admin-autonomous', `action ${action} failed`, { err });
        toast.error(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });
}

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('admin-autonomous');

  const isAdmin = store.get('isAdmin');
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div class="ax-empty ax-gs-188">
        <h2>Accès réservé</h2>
        <p>Cette section est réservée à l'admin Kevin.</p>
      </div>
    `;
    return;
  }
  rootEl.innerHTML = renderPage();
  attachHandlers(rootEl);

  /* Auto-refresh toutes les 5s si session active (live monitoring) */
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  const session = apexAutonomousMode.getActiveSession();
  if (session && (session.status === 'running' || session.status === 'paused')) {
    refreshTimer = setInterval(() => {
      try {
        rootEl.innerHTML = renderPage();
        attachHandlers(rootEl);
      } catch (err: unknown) {
        logger.warn('admin-autonomous', 'auto-refresh failed', { err });
      }
    }, 5000);
  }
}
