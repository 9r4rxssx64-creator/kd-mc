/**
 * APEX v13 — Vue Apex Toolbox
 *
 * Port v12 vApexToolbox : registre des tools IA Apex + capabilities device.
 *
 * - Liste 100+ tools IA registry (apex-tools)
 * - Pour chaque : nom, description, paramètres input_schema, statut, permissions tier
 * - Filter par catégorie + tier
 * - Search bar
 * - Bouton "Tester ce tool" → modal avec params + résultat
 * - Section "Capabilities" : matrice device (camera, micro, GPS, BLE, NFC...)
 * - Stats : tools les plus utilisés / temps moyen
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Lazy-load apex-tools service (gros)
 */

/* eslint-disable import/order -- type imports mixed with value imports détectés à tort comme groupes différents */
import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import type { ApexTool } from '../../services/core-svc/apex-tools.js';
/* eslint-enable import/order */

/* Re-export escapeHtml for backward compatibility (tests import from this module). */
export { escapeHtml };

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeToolboxScope: CleanupScope | null = null;

export function dispose(): void {
  activeToolboxScope?.cleanup();
  activeToolboxScope = null;
}
import { capabilities, type Capability } from '../../services/core-svc/capabilities.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

export type ToolboxFilter = {
  query?: string;
  tier?: ApexTool['minTier'] | 'all';
  impactLevel?: ApexTool['impactLevel'] | 'all';
};

/**
 * Filtre les tools selon query/tier/impact.
 */
export function filterTools(tools: ReadonlyArray<ApexTool>, filter: ToolboxFilter): ApexTool[] {
  return tools.filter((t) => {
    if (filter.query) {
      const q = filter.query.toLowerCase();
      const matches = t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (filter.tier && filter.tier !== 'all' && t.minTier !== filter.tier) return false;
    if (filter.impactLevel && filter.impactLevel !== 'all' && t.impactLevel !== filter.impactLevel) return false;
    return true;
  });
}

/**
 * Stats sur l'usage des tools (depuis localStorage usage log).
 */
export interface ToolboxStats {
  total: number;
  by_tier: Record<string, number>;
  by_impact: Record<string, number>;
}

export function computeStats(tools: ReadonlyArray<ApexTool>): ToolboxStats {
  const stats: ToolboxStats = { total: tools.length, by_tier: {}, by_impact: {} };
  for (const t of tools) {
    stats.by_tier[t.minTier] = (stats.by_tier[t.minTier] ?? 0) + 1;
    stats.by_impact[t.impactLevel] = (stats.by_impact[t.impactLevel] ?? 0) + 1;
  }
  return stats;
}

const TIER_META: Record<ApexTool['minTier'], { color: string; label: string }> = {
  admin: { color: '#c9a227', label: 'Admin' },
  laurence: { color: '#ff6b9d', label: 'Laurence' },
  family: { color: '#a878ff', label: 'Famille' },
  client_pro: { color: '#5aa8ff', label: 'Pro' },
  client_free: { color: '#22cc77', label: 'Free' },
};

const IMPACT_META: Record<ApexTool['impactLevel'], { color: string; label: string; icon: string }> = {
  A: { color: '#22cc77', label: 'Auto', icon: '✅' },
  B: { color: '#ffaa00', label: 'Notify', icon: '⚠️' },
  C: { color: '#ff5858', label: 'Validate', icon: '🚨' },
};

let activeFilter: ToolboxFilter = { tier: 'all', impactLevel: 'all' };
let activeTab: 'tools' | 'capabilities' = 'tools';

function renderToolRow(t: ApexTool): string {
  const tier = TIER_META[t.minTier];
  const impact = IMPACT_META[t.impactLevel];
  const schemaProps = (t.inputSchema['properties'] as Record<string, unknown> | undefined) ?? {};
  const paramCount = Object.keys(schemaProps).length;
  return `
    <li class="ax-tool-row" data-tool-name="${escapeHtml(t.name)}"
      style="background:rgba(20,20,35,0.5);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px;margin-bottom:8px;border-left:3px solid ${escapeHtml(tier.color)}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div class="ax-gs-11">
          <div class="ax-gs-122">
            <code style="color:#fff;font-weight:700;font-size:13px;background:rgba(0,0,0,.3);padding:2px 8px;border-radius:4px">${escapeHtml(t.name)}</code>
            <span style="background:rgba(${t.minTier === 'admin' ? '201,162,39' : t.minTier === 'family' ? '168,120,255' : '90,168,255'},.15);color:${escapeHtml(tier.color)};font-size:10px;padding:2px 6px;border-radius:4px">${escapeHtml(tier.label)}</span>
            <span style="background:rgba(${t.impactLevel === 'A' ? '34,204,119' : t.impactLevel === 'B' ? '255,170,0' : '255,88,88'},.15);color:${escapeHtml(impact.color)};font-size:10px;padding:2px 6px;border-radius:4px">${impact.icon} ${escapeHtml(impact.label)}</span>
            <span style="color:#888;font-size:10px">${paramCount} param${paramCount > 1 ? 's' : ''}</span>
          </div>
          <p style="margin:0;color:#a0a4c0;font-size:12px;line-height:1.4">${escapeHtml(t.description)}</p>
        </div>
        <button class="ax-btn ax-btn-sm" data-tool-test="${escapeHtml(t.name)}" style="font-size:11px">🧪 Tester</button>
      </div>
    </li>`;
}

function renderCapabilityRow(c: Capability): string {
  const color = c.enabled ? '#22cc77' : '#666';
  const icon = c.enabled ? '✅' : '⚪';
  const status = c.enabled ? 'enabled' : 'disabled';
  const examplesHtml = c.examples.length > 0
    ? `<div style="margin-top:4px;color:#888;font-size:10px;font-style:italic">${escapeHtml(c.examples[0] ?? '')}</div>`
    : '';
  return `
    <li style="background:rgba(20,20,35,0.5);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px;margin-bottom:6px;border-left:3px solid ${color}">
      <div class="ax-gs-204">
        <div class="ax-gs-6">
          <strong style="color:#fff;font-size:13px">${icon} ${escapeHtml(c.emoji)} ${escapeHtml(c.label)}</strong>
          <p style="margin:2px 0 0;color:#a0a4c0;font-size:11px">${escapeHtml(c.description)}</p>
          ${examplesHtml}
        </div>
        <span style="background:rgba(255,255,255,.05);color:${color};font-size:10px;padding:3px 8px;border-radius:4px;text-transform:uppercase">${status}</span>
      </div>
    </li>`;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeToolboxScope?.cleanup();
  activeToolboxScope = createCleanupScope('apex-toolbox');
  const user = store.get('user') as { tier?: ApexTool['minTier'] } | null;
  const userTier = user?.tier ?? 'admin';

  /* Lazy-load apex-tools (lourd) */
  let allTools: ReadonlyArray<ApexTool> = [];
  try {
    const { apexTools } = await import('../../services/core-svc/apex-tools.js');
    allTools = apexTools.list();
  } catch (err: unknown) {
    logger.warn('feature-apex-toolbox', 'apex-tools load failed', { err });
  }

  const filtered = filterTools(allTools, activeFilter);
  const stats = computeStats(allTools);

  const allCaps = capabilities.list();

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-268">
      <header class="ax-gs-181">
        <h1 class="ax-gs-324">🧰 Apex Toolbox</h1>
        <p class="ax-gs-325">
          ${stats.total} tools IA disponibles · ${allCaps.length} capabilities device · Tier user : <strong style="color:${escapeHtml(TIER_META[userTier].color)}">${escapeHtml(TIER_META[userTier].label)}</strong>
        </p>
      </header>

      <nav style="margin-bottom:16px;display:flex;gap:8px">
        <button class="ax-tab ${activeTab === 'tools' ? 'ax-tab-active' : ''}" data-tb-tab="tools"
          style="background:${activeTab === 'tools' ? 'rgba(201,162,39,.15)' : 'transparent'};color:${activeTab === 'tools' ? '#c9a227' : '#a0a4c0'};border:1px solid rgba(201,162,39,.3);padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer">
          🛠 Tools (${stats.total})
        </button>
        <button class="ax-tab ${activeTab === 'capabilities' ? 'ax-tab-active' : ''}" data-tb-tab="capabilities"
          style="background:${activeTab === 'capabilities' ? 'rgba(201,162,39,.15)' : 'transparent'};color:${activeTab === 'capabilities' ? '#c9a227' : '#a0a4c0'};border:1px solid rgba(201,162,39,.3);padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer">
          📱 Capabilities (${allCaps.length})
        </button>
      </nav>

      ${activeTab === 'tools' ? `
        <section style="margin-bottom:16px;background:rgba(20,20,35,0.6);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:14px">
          <h3 class="ax-gs-326">📊 Stats</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;font-size:12px">
            <div><strong class="ax-gs-327">Total</strong> : ${stats.total}</div>
            <div><strong class="ax-gs-266">Admin</strong> : ${stats.by_tier['admin'] ?? 0}</div>
            <div><strong style="color:#5aa8ff">Pro</strong> : ${stats.by_tier['client_pro'] ?? 0}</div>
            <div><strong class="ax-gs-279">Auto (A)</strong> : ${stats.by_impact['A'] ?? 0}</div>
            <div><strong class="ax-gs-328">Notify (B)</strong> : ${stats.by_impact['B'] ?? 0}</div>
            <div><strong class="ax-gs-329">Validate (C)</strong> : ${stats.by_impact['C'] ?? 0}</div>
          </div>
        </section>

        <section style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="ax-tb-search" type="text" aria-label="Rechercher un outil" placeholder="🔍 Rechercher tool..." value="${escapeHtml(activeFilter.query ?? '')}"
            style="flex:1;min-width:200px;background:rgba(0,0,0,.3);color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 12px;font-size:13px">
          <select id="ax-tb-tier" class="ax-gs-330">
            <option value="all" ${activeFilter.tier === 'all' ? 'selected' : ''}>Tous tiers</option>
            <option value="admin" ${activeFilter.tier === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="laurence" ${activeFilter.tier === 'laurence' ? 'selected' : ''}>Laurence</option>
            <option value="family" ${activeFilter.tier === 'family' ? 'selected' : ''}>Famille</option>
            <option value="client_pro" ${activeFilter.tier === 'client_pro' ? 'selected' : ''}>Pro</option>
            <option value="client_free" ${activeFilter.tier === 'client_free' ? 'selected' : ''}>Free</option>
          </select>
          <select id="ax-tb-impact" class="ax-gs-330">
            <option value="all" ${activeFilter.impactLevel === 'all' ? 'selected' : ''}>Tous impacts</option>
            <option value="A" ${activeFilter.impactLevel === 'A' ? 'selected' : ''}>A (auto)</option>
            <option value="B" ${activeFilter.impactLevel === 'B' ? 'selected' : ''}>B (notify)</option>
            <option value="C" ${activeFilter.impactLevel === 'C' ? 'selected' : ''}>C (validate)</option>
          </select>
        </section>

        <section class="ax-gs-180">
          <ul class="ax-gs-286">
            ${filtered.length > 0 ? filtered.map(renderToolRow).join('') : '<li class="ax-gs-209">Aucun tool pour ces filtres.</li>'}
          </ul>
        </section>
      ` : `
        <section class="ax-gs-180">
          <h3 class="ax-gs-326">📱 Capabilities device</h3>
          <p style="color:#a0a4c0;font-size:12px;margin:0 0 12px">Matrice des capacités matérielles + permissions accordées par l'utilisateur.</p>
          <ul class="ax-gs-286">
            ${allCaps.length > 0 ? allCaps.map(renderCapabilityRow).join('') : '<li class="ax-gs-209">Aucune capability détectée.</li>'}
          </ul>
        </section>
      `}

      <p class="ax-gs-331">🧰 Toolbox v13 · ${stats.total} tools registered</p>
    </div>
  `;

  attachToolboxHandlers(rootEl);
  logger.info('feature-apex-toolbox', `rendered (tab=${activeTab}, ${filtered.length}/${stats.total} tools, ${allCaps.length} caps)`);
}

function attachToolboxHandlers(rootEl: HTMLElement): void {
  rootEl.querySelectorAll<HTMLButtonElement>('[data-tb-tab]').forEach((btn) => {
    activeToolboxScope!.bind(btn, 'click', () => {
      haptic.selection();
      activeTab = (btn.dataset['tbTab'] ?? 'tools') as 'tools' | 'capabilities';
      void render(rootEl);
    });
  });

  const searchEl = rootEl.querySelector<HTMLInputElement>('#ax-tb-search');
  if (searchEl) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    activeToolboxScope!.bind(searchEl, 'input', () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        activeFilter = { ...activeFilter, query: searchEl.value };
        void render(rootEl);
      }, 250);
    });
  }

  const tierSel = rootEl.querySelector<HTMLSelectElement>('#ax-tb-tier');
  if (tierSel && activeToolboxScope) activeToolboxScope.bind(tierSel, 'change', (e) => {
    const target = e.target as HTMLSelectElement;
    const tier = target.value as Exclude<ToolboxFilter['tier'], undefined>;
    activeFilter = { ...activeFilter, tier };
    void render(rootEl);
  });

  const impactSel = rootEl.querySelector<HTMLSelectElement>('#ax-tb-impact');
  if (impactSel && activeToolboxScope) activeToolboxScope.bind(impactSel, 'change', (e) => {
    const target = e.target as HTMLSelectElement;
    const impactLevel = target.value as Exclude<ToolboxFilter['impactLevel'], undefined>;
    activeFilter = { ...activeFilter, impactLevel };
    void render(rootEl);
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-tool-test]').forEach((btn) => {
    activeToolboxScope!.bind(btn, 'click', () => {
      haptic.tap();
      const name = btn.dataset['toolTest'] ?? '';
      toast.info(`Tester ${name} : modal à implémenter (Jet 5)`);
    });
  });
}
