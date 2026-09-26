/**
 * v13.4.211 — Vue admin "🔒 Audit Log Viewer".
 *
 * Kevin "100/100 réel" — gap audit subagent : audit-log.ts existait depuis
 * v13.4.x avec 1000 entries max + chain hash tamper detection MAIS aucune
 * UI pour consulter les entries.
 *
 * Cette vue admin affiche :
 *  - Stats globales (total entries, top 5 actions, top 5 actors)
 *  - Liste 100 dernières entries avec filtres (action, actor)
 *  - Recherche full-text (target + details)
 *  - Export JSON pour analyse externe
 *
 * Admin only via guard auth.isAdminSync() dans bootstrap.ts router.
 */
import { escapeHtml } from '../../../core/escape-html.js';
import { auditLog, type AuditEntry } from '../../../services/observability/audit-log.js';
import { toast } from '../../../ui/toast.js';

interface Filters {
  action: string;
  actor: string;
  search: string;
}

const state: Filters = { action: '', actor: '', search: '' };

function computeStats(entries: readonly AuditEntry[]): {
  total: number;
  topActions: Array<{ action: string; count: number }>;
  topActors: Array<{ actor: string; count: number }>;
  oldest_ts: number | null;
  newest_ts: number | null;
} {
  const actionCount = new Map<string, number>();
  const actorCount = new Map<string, number>();
  let oldest = Infinity;
  let newest = 0;
  for (const e of entries) {
    actionCount.set(e.action, (actionCount.get(e.action) ?? 0) + 1);
    actorCount.set(e.actor, (actorCount.get(e.actor) ?? 0) + 1);
    if (e.ts < oldest) oldest = e.ts;
    if (e.ts > newest) newest = e.ts;
  }
  const topActions = [...actionCount.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topActors = [...actorCount.entries()]
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return {
    total: entries.length,
    topActions,
    topActors,
    oldest_ts: oldest === Infinity ? null : oldest,
    newest_ts: newest === 0 ? null : newest,
  };
}

function applyFilters(entries: readonly AuditEntry[], f: Filters): AuditEntry[] {
  return entries.filter((e) => {
    if (f.action && !e.action.toLowerCase().includes(f.action.toLowerCase())) return false;
    if (f.actor && !e.actor.toLowerCase().includes(f.actor.toLowerCase())) return false;
    if (f.search) {
      const haystack = [e.target ?? '', JSON.stringify(e.details ?? {})].join(' ').toLowerCase();
      if (!haystack.includes(f.search.toLowerCase())) return false;
    }
    return true;
  });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

function renderEntry(e: AuditEntry): string {
  const target = e.target ? escapeHtml(e.target) : '<em style="opacity:0.5">—</em>';
  const detailsCount = e.details ? Object.keys(e.details).length : 0;
  const detailsBtn = detailsCount > 0
    ? `<button class="ax-btn-glass" data-audit-details='${escapeHtml(JSON.stringify(e.details ?? {}))}' style="font-size:10px;padding:2px 6px">${detailsCount} fields</button>`
    : '';
  return `
    <tr class="ax-gs-184">
      <td style="padding:6px 8px;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.6)">${escapeHtml(fmtDate(e.ts))}</td>
      <td style="padding:6px 8px;font-weight:600;color:#e8b830">${escapeHtml(e.action)}</td>
      <td style="padding:6px 8px;color:rgba(255,255,255,0.85)">${escapeHtml(e.actor)}</td>
      <td style="padding:6px 8px;font-size:12px">${target}</td>
      <td class="ax-gs-267">${detailsBtn}</td>
    </tr>
  `;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  auditLog.init();
  const allEntries = auditLog.getEntries();
  const filtered = applyFilters(allEntries, state);
  const stats = computeStats(allEntries);

  const html = `
    <div class="ax-gs-268">
      <h2 style="margin:0 0 16px;color:#e8b830;font-size:20px">🔒 Audit Log Viewer</h2>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 16px">
        Toutes les actions sensibles (admin, vault, AI, settings) sont loggées avec chain hash tamper detection.
        ${stats.total} entries total, ${filtered.length} affichées après filtres.
      </p>

      <div class="ax-card-elevated ax-gs-185">
        <h3 class="ax-gs-269">📊 Stats</h3>
        <div class="ax-gs-89">
          <div>
            <div class="ax-gs-56">Top actions</div>
            ${stats.topActions.map((a) => `<div class="ax-gs-24"><b>${escapeHtml(a.action)}</b>: ${a.count}</div>`).join('') || '<em>—</em>'}
          </div>
          <div>
            <div class="ax-gs-56">Top actors</div>
            ${stats.topActors.map((a) => `<div class="ax-gs-24"><b>${escapeHtml(a.actor)}</b>: ${a.count}</div>`).join('') || '<em>—</em>'}
          </div>
          <div>
            <div class="ax-gs-56">Période</div>
            <div class="ax-gs-24">Plus ancien : ${stats.oldest_ts ? escapeHtml(fmtDate(stats.oldest_ts)) : '—'}</div>
            <div class="ax-gs-24">Plus récent : ${stats.newest_ts ? escapeHtml(fmtDate(stats.newest_ts)) : '—'}</div>
          </div>
        </div>
      </div>

      <div class="ax-card-elevated ax-gs-185">
        <h3 class="ax-gs-269">🔍 Filtres</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">
          <input class="ax-input ax-gs-270" id="audit-filter-action" placeholder="Filtrer action…" value="${escapeHtml(state.action)}">
          <input class="ax-input ax-gs-270" id="audit-filter-actor" placeholder="Filtrer actor…" value="${escapeHtml(state.actor)}">
          <input class="ax-input ax-gs-270" id="audit-filter-search" placeholder="Recherche target/details…" value="${escapeHtml(state.search)}">
          <button class="ax-btn-glass-gold" id="audit-filter-reset">Reset</button>
        </div>
      </div>

      <div class="ax-card-elevated" style="padding:0;overflow-x:auto">
        <table class="ax-gs-271">
          <thead>
            <tr style="background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.1)">
              <th class="ax-gs-272">Date</th>
              <th class="ax-gs-272">Action</th>
              <th class="ax-gs-272">Actor</th>
              <th class="ax-gs-272">Target</th>
              <th class="ax-gs-272">Details</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? '<tr><td colspan="5" style="padding:24px;text-align:center;color:rgba(255,255,255,0.5)">Aucune entrée matchant les filtres</td></tr>'
              : filtered.slice(-100).reverse().map(renderEntry).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="ax-btn-glass-gold" id="audit-export-json">📥 Export JSON</button>
      </div>
    </div>
  `;
  rootEl.innerHTML = html;

  /* Wire filtres */
  const fAction = rootEl.querySelector<HTMLInputElement>('#audit-filter-action');
  const fActor = rootEl.querySelector<HTMLInputElement>('#audit-filter-actor');
  const fSearch = rootEl.querySelector<HTMLInputElement>('#audit-filter-search');
  const reset = rootEl.querySelector<HTMLButtonElement>('#audit-filter-reset');
  const debounceMs = 200;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const wireDebounced = (input: HTMLInputElement | null, key: keyof Filters): void => {
    if (!input) return;
    input.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state[key] = input.value;
        void render(rootEl);
      }, debounceMs);
    });
  };
  wireDebounced(fAction, 'action');
  wireDebounced(fActor, 'actor');
  wireDebounced(fSearch, 'search');
  reset?.addEventListener('click', () => {
    state.action = '';
    state.actor = '';
    state.search = '';
    void render(rootEl);
  });

  /* Wire export JSON */
  const exportBtn = rootEl.querySelector<HTMLButtonElement>('#audit-export-json');
  exportBtn?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(allEntries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`📥 Export OK : ${allEntries.length} entries → JSON téléchargé`, { duration: 4000 });
  });

  /* Wire details modal */
  rootEl.querySelectorAll('[data-audit-details]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-audit-details') ?? '{}';
      try {
        const parsed = JSON.parse(raw);
        alert('Details :\n' + JSON.stringify(parsed, null, 2));
      } catch {
        alert('Details : ' + raw);
      }
    });
  });
}
