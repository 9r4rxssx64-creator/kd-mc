/**
 * APEX v13 — Vue admin "Toggles ON/OFF" (général + per-user).
 *
 * Règle absolue Kevin 2026-05-04 :
 *   "Boutons admin onoff pour tout et tout le monde. Général et individuel"
 *
 * Centralise la gestion des 100+ feature toggles dans une UI :
 *  - Recherche full-text
 *  - Groupement par catégorie (studio / pro / voice / sentinel / tool / ...)
 *  - Switch ON/OFF par feature avec persistence
 *  - Bouton per-user ouvre un modal pour appliquer override par utilisateur
 *  - Actions bulk : tout activer / tout désactiver / reset défauts / export config
 *  - Stats globales en header
 *
 * UI HTML statique testée E2E (Playwright) — la logique est dans le service.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import {
  featureToggles,
  type FeatureCategory,
  type FeatureToggle,
} from '../../services/auth/feature-toggles.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

/* ============================================================
   Helpers
   ============================================================ */

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  studio: '🎨 Studios',
  pro: '💼 Modules Pro',
  voice: '🎙 Voix',
  browser: '🌐 Browser',
  sentinel: '🛡 Sentinelles',
  tool: '🛠 Outils IA',
  auth: '🔐 Authentification',
  admin: '👑 Admin',
  module: '📦 Modules',
};

let currentSearchQuery = '';
let currentUserFilter: string | null = null; /* uid si on édite per-user, null = global */

/** Reset module state — utile pour tests d'isolation */
/* P1-6 : appelé par router lors du teardown view → retire tous les listeners. */
export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

export function _resetState(): void {
  currentSearchQuery = '';
  currentUserFilter = null;
}

/* ============================================================
   List users known
   ============================================================ */

interface KnownUser {
  id: string;
  name: string;
}

function listKnownUsers(): readonly KnownUser[] {
  /* On lit la même liste que le service auth (anti-DRY) si dispo, sinon fallback. */
  try {
    const raw = localStorage.getItem('ax_users_v13');
    if (raw) {
      const parsed = JSON.parse(raw) as Array<{ id?: unknown; name?: unknown }>;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((u) => typeof u?.id === 'string' && typeof u?.name === 'string')
          .map((u) => ({ id: u.id as string, name: u.name as string }));
      }
    }
  } catch {
    /* ignore */
  }
  /* Fallback minimal — toujours afficher Kevin + Laurence */
  return [
    { id: 'kdmc_admin', name: 'Kevin DESARZENS (admin)' },
    { id: 'laurence_sp', name: 'Laurence SAINT-POLIT' },
  ];
}

/* ============================================================
   Filters
   ============================================================ */

function filterFeatures(query: string): readonly FeatureToggle[] {
  const all = featureToggles.list();
  if (!query.trim()) return all;
  const q = query.toLowerCase().trim();
  return all.filter(
    (f) =>
      f.id.toLowerCase().includes(q)
      || f.description.toLowerCase().includes(q)
      || f.category.toLowerCase().includes(q),
  );
}

function groupByCategory(features: readonly FeatureToggle[]): Map<FeatureCategory, FeatureToggle[]> {
  const map = new Map<FeatureCategory, FeatureToggle[]>();
  for (const f of features) {
    const arr = map.get(f.category) ?? [];
    arr.push(f);
    map.set(f.category, arr);
  }
  return map;
}

/* ============================================================
   Render
   ============================================================ */

function renderToggleRow(f: FeatureToggle): string {
  const enabled = currentUserFilter
    ? featureToggles.isEnabledForUser(f.id, currentUserFilter)
    : featureToggles.isEnabledGlobal(f.id);
  const safeId = escapeHtml(f.id);
  const safeDesc = escapeHtml(f.description);
  const stateClass = enabled ? 'ax-toggle-on' : 'ax-toggle-off';
  return `
    <div class="ax-toggle-row" data-feature="${safeId}" style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(201,162,39,0.1)">
      <div class="ax-gs-6">
        <div style="color:#fff;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeDesc}</div>
        <code class="ax-gs-208">${safeId}</code>
      </div>
      <button class="${stateClass}" data-toggle="${safeId}"
        style="min-width:64px;min-height:32px;padding:4px 12px;border:1px solid ${enabled ? '#c9a227' : 'rgba(255,255,255,0.2)'};background:${enabled ? '#c9a227' : 'transparent'};color:${enabled ? '#000' : '#999'};border-radius:16px;cursor:pointer;font-weight:600;font-size:12px"
        aria-label="${enabled ? 'Désactiver' : 'Activer'} ${safeDesc}"
        aria-pressed="${enabled}">
        ${enabled ? 'ON' : 'OFF'}
      </button>
      <button data-per-user="${safeId}"
        style="min-width:36px;min-height:32px;padding:4px 8px;border:1px solid rgba(201,162,39,0.3);background:transparent;color:#c9a227;border-radius:6px;cursor:pointer;font-size:11px"
        title="Configurer per-user">
        👤
      </button>
    </div>
  `;
}

function renderCategorySection(cat: FeatureCategory, list: readonly FeatureToggle[]): string {
  const label = CATEGORY_LABELS[cat] ?? cat;
  const enabledCount = list.filter((f) =>
    currentUserFilter
      ? featureToggles.isEnabledForUser(f.id, currentUserFilter)
      : featureToggles.isEnabledGlobal(f.id),
  ).length;
  return `
    <section data-category="${escapeHtml(cat)}" style="background:rgba(20,20,35,0.5);border:1px solid rgba(201,162,39,0.2);border-radius:12px;margin-bottom:14px;overflow:hidden">
      <header style="padding:10px 14px;background:rgba(201,162,39,0.08);border-bottom:1px solid rgba(201,162,39,0.2);display:flex;align-items:center;justify-content:space-between">
        <h2 style="margin:0;color:#c9a227;font-size:14px">${label}</h2>
        <span class="ax-gs-208">${enabledCount}/${list.length} actifs</span>
      </header>
      <div>${list.map(renderToggleRow).join('')}</div>
    </section>
  `;
}

function renderUserPicker(): string {
  const users = listKnownUsers();
  const opts = users
    .map(
      (u) =>
        `<option value="${escapeHtml(u.id)}" ${currentUserFilter === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`,
    )
    .join('');
  return `
    <select id="ax-toggles-user-filter" class="ax-select-sm"
      style="padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(201,162,39,0.3);color:#fff;border-radius:6px;font-size:13px">
      <option value="">Global (général)</option>
      ${opts}
    </select>
  `;
}

function renderHeader(): string {
  const stats = featureToggles.getStats();
  return `
    <header class="ax-gs-313">
      <h1 class="ax-gs-314">🔘 Toggles ON/OFF</h1>
      <span class="ax-gs-121">${stats.enabledGlobal}/${stats.total} actifs · ${stats.users} users</span>
      <input type="search" id="ax-toggles-search" aria-label="Rechercher une feature dans les toggles" placeholder="Rechercher feature..." value="${escapeHtml(currentSearchQuery)}"
        style="padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(201,162,39,0.3);color:#fff;border-radius:6px;font-size:13px;min-width:160px">
      ${renderUserPicker()}
      <button class="ax-btn" data-action="enable-all" style="padding:6px 12px;background:rgba(201,162,39,0.15);border:1px solid #c9a227;color:#c9a227;border-radius:6px;cursor:pointer;font-size:12px">Tout activer</button>
      <button class="ax-btn" data-action="disable-all" style="padding:6px 12px;background:rgba(255,100,100,0.1);border:1px solid #ff6666;color:#ff6666;border-radius:6px;cursor:pointer;font-size:12px">Tout désactiver</button>
      <button class="ax-btn ax-gs-323" data-action="reset-defaults">Reset défauts</button>
      <button class="ax-btn ax-gs-323" data-action="export-config">📤 Export</button>
    </header>
  `;
}

function renderPerUserModal(featureId: string): string {
  const feature = featureToggles.get(featureId);
  if (!feature) return '';
  const users = listKnownUsers();
  const rows = users
    .map((u) => {
      const map = readUserMapForRender(u.id);
      const hasOverride = Object.prototype.hasOwnProperty.call(map, featureId);
      const enabled = featureToggles.isEnabledForUser(featureId, u.id);
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid rgba(201,162,39,0.1)">
          <div style="flex:1;color:#fff;font-size:13px">${escapeHtml(u.name)}</div>
          <span style="color:${hasOverride ? '#c9a227' : '#888'};font-size:11px">${hasOverride ? 'override' : 'global'}</span>
          <button data-modal-toggle="${escapeHtml(featureId)}" data-modal-uid="${escapeHtml(u.id)}"
            style="min-width:54px;min-height:30px;padding:4px 10px;border:1px solid ${enabled ? '#c9a227' : 'rgba(255,255,255,0.2)'};background:${enabled ? '#c9a227' : 'transparent'};color:${enabled ? '#000' : '#999'};border-radius:14px;cursor:pointer;font-weight:600;font-size:11px">
            ${enabled ? 'ON' : 'OFF'}
          </button>
          ${hasOverride ? `<button data-modal-remove="${escapeHtml(featureId)}" data-modal-uid="${escapeHtml(u.id)}" style="padding:4px 8px;background:transparent;border:1px solid rgba(255,100,100,0.3);color:#ff6666;border-radius:4px;cursor:pointer;font-size:10px">Reset</button>` : ''}
        </div>
      `;
    })
    .join('');
  return `
    <div id="ax-toggles-modal" role="dialog" aria-modal="true" aria-labelledby="ax-toggles-modal-title"
      style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px">
      <div style="max-width:480px;width:100%;background:#0a0a14;border:1px solid rgba(201,162,39,0.4);border-radius:14px;overflow:hidden">
        <header class="ax-gs-206">
          <h3 id="ax-toggles-modal-title" class="ax-gs-319">👤 Per-user : ${escapeHtml(feature.description)}</h3>
          <button data-action="modal-close" class="ax-gs-320">✕</button>
        </header>
        <div style="max-height:60vh;overflow-y:auto">${rows || '<p style="padding:20px;color:#888;text-align:center">Aucun utilisateur connu.</p>'}</div>
        <footer class="ax-gs-321">
          Per-user override > Global > Default
        </footer>
      </div>
    </div>
  `;
}

function readUserMapForRender(userId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('ax_feature_toggles_user_' + userId);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/* ============================================================
   Public render
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  const isAdmin = store.get('isAdmin');
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div class="ax-empty ax-gs-207">
        <h2 class="ax-gs-266">Accès réservé</h2>
        <p>Cette section est réservée à l'admin Kevin.</p>
      </div>
    `;
    return;
  }
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout).
     NOTE: admin.toggles est un kill-switch — si OFF, plus moyen de rallumer via UI.
     Volontairement non-gardé ici (anti-soft-lock). Audit-only via toggle history. */

  const filtered = filterFeatures(currentSearchQuery);
  const groups = groupByCategory(filtered);
  const sectionsHtml = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cat, list]) => renderCategorySection(cat, list))
    .join('');

  const filterBanner = currentUserFilter
    ? `<div style="padding:10px 14px;background:rgba(201,162,39,0.1);border-bottom:1px solid rgba(201,162,39,0.2);color:#c9a227;font-size:12px">📌 Mode per-user : <strong>${escapeHtml(currentUserFilter)}</strong> — les changements n'affectent que cet utilisateur. <button data-action="clear-user-filter" style="margin-left:8px;padding:2px 8px;background:transparent;border:1px solid rgba(201,162,39,0.4);color:#c9a227;border-radius:4px;cursor:pointer;font-size:11px">Repasser global</button></div>`
    : '';

  rootEl.innerHTML = `
    <div class="ax-admin-toggles ax-gs-322">
      ${renderHeader()}
      ${filterBanner}
      <main style="padding:14px;max-width:900px;margin:0 auto">
        ${sectionsHtml || '<p style="text-align:center;color:#888;padding:40px">Aucune feature trouvée pour "<strong>' + escapeHtml(currentSearchQuery) + '</strong>".</p>'}
      </main>
    </div>
  `;
  attachHandlers(rootEl);
}

/* ============================================================
   Event handlers
   ============================================================ */

/* P1-6 (audit v13.2.5) : scope listener pour anti-leak SPA navigation.
 * Tous les listeners attachés via attachHandlers() sont retirés au dispose(). */
let activeScope: CleanupScope | null = null;

function attachHandlers(rootEl: HTMLElement): void {
  /* Re-render → cleanup ancien scope d'abord */
  activeScope?.cleanup();
  const scope = createCleanupScope('admin-toggles');
  activeScope = scope;

  /* Search live */
  const searchInput = rootEl.querySelector<HTMLInputElement>('#ax-toggles-search');
  if (searchInput) {
    scope.bind(searchInput, 'input', () => {
      currentSearchQuery = searchInput.value;
      render(rootEl);
      /* Restore focus + caret */
      const newInput = rootEl.querySelector<HTMLInputElement>('#ax-toggles-search');
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(currentSearchQuery.length, currentSearchQuery.length);
      }
    });
  }

  /* User filter */
  const userFilter = rootEl.querySelector<HTMLSelectElement>('#ax-toggles-user-filter');
  if (userFilter) {
    scope.bind(userFilter, 'change', () => {
      currentUserFilter = userFilter.value || null;
      haptic.selection();
      render(rootEl);
    });
  }

  /* Toggle ON/OFF feature individuel */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((btn) => {
    scope.bind(btn, 'click', () => {
      const id = btn.dataset['toggle'];
      if (!id) return;
      haptic.tap();
      if (currentUserFilter) {
        const cur = featureToggles.isEnabledForUser(id, currentUserFilter);
        featureToggles.setForUser(id, currentUserFilter, !cur);
        toast.success(`${id} ${!cur ? 'activé' : 'désactivé'} pour ${currentUserFilter}`);
      } else {
        const cur = featureToggles.isEnabledGlobal(id);
        featureToggles.setGlobal(id, !cur);
        toast.success(`${id} ${!cur ? 'activé' : 'désactivé'}`);
      }
      render(rootEl);
    });
  });

  /* Per-user modal */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-per-user]').forEach((btn) => {
    scope.bind(btn, 'click', () => {
      const id = btn.dataset['perUser'];
      if (!id) return;
      haptic.tap();
      openPerUserModal(rootEl, id);
    });
  });

  /* Bulk actions */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    scope.bind(btn, 'click', () => {
      const action = btn.dataset['action'];
      switch (action) {
        case 'enable-all':
          haptic.medium();
          featureToggles.enableAll();
          toast.success('Toutes les features activées');
          render(rootEl);
          break;
        case 'disable-all':
          if (!confirm('Désactiver TOUTES les features globalement ? Confirmer')) return;
          haptic.warning();
          featureToggles.disableAll();
          toast.warn('Toutes les features désactivées');
          render(rootEl);
          break;
        case 'reset-defaults':
          haptic.medium();
          featureToggles.resetDefaults();
          toast.info('Reset aux valeurs par défaut');
          render(rootEl);
          break;
        case 'export-config': {
          haptic.tap();
          const json = featureToggles.exportConfig();
          /* On copie dans le clipboard + log dans la console pour usage simple */
          if (navigator.clipboard) {
            navigator.clipboard
              .writeText(json)
              .then(() => toast.success('Config copiée dans le presse-papier'))
              .catch(() => {
                logger.info('admin-toggles', 'export config (no clipboard)', { json });
                toast.info('Config exportée (voir console)');
              });
          } else {
            logger.info('admin-toggles', 'export config', { json });
            toast.info('Config exportée (voir console)');
          }
          break;
        }
        case 'clear-user-filter':
          currentUserFilter = null;
          haptic.selection();
          render(rootEl);
          break;
        case 'modal-close':
          closePerUserModal();
          break;
        default:
          break;
      }
    });
  });
}

/* ============================================================
   Per-user modal
   ============================================================ */

function openPerUserModal(rootEl: HTMLElement, featureId: string): void {
  closePerUserModal();
  const div = document.createElement('div');
  div.innerHTML = renderPerUserModal(featureId);
  const modal = div.firstElementChild as HTMLElement | null;
  if (!modal) return;
  document.body.appendChild(modal);

  /* P1-6 : modal click delegate via scope (auto-cleanup quand modal détruit) */
  const modalScope = activeScope ?? createCleanupScope('admin-toggles-modal');
  modalScope.bind(modal, 'click', (e) => {
    const target = e.target as HTMLElement;
    if (target === modal) {
      closePerUserModal();
      return;
    }
    const closeBtn = target.closest<HTMLElement>('[data-action="modal-close"]');
    if (closeBtn) {
      closePerUserModal();
      return;
    }
    const tgl = target.closest<HTMLElement>('[data-modal-toggle]');
    if (tgl) {
      const fid = tgl.dataset['modalToggle'];
      const uid = tgl.dataset['modalUid'];
      if (!fid || !uid) return;
      const cur = featureToggles.isEnabledForUser(fid, uid);
      featureToggles.setForUser(fid, uid, !cur);
      haptic.tap();
      toast.success(`${fid} ${!cur ? 'activé' : 'désactivé'} pour ${uid}`);
      /* Refresh modal + main view */
      openPerUserModal(rootEl, fid);
      render(rootEl);
      return;
    }
    const rm = target.closest<HTMLElement>('[data-modal-remove]');
    if (rm) {
      const fid = rm.dataset['modalRemove'];
      const uid = rm.dataset['modalUid'];
      if (!fid || !uid) return;
      featureToggles.removeUserOverride(fid, uid);
      haptic.tap();
      toast.info(`Override retiré pour ${uid}`);
      openPerUserModal(rootEl, fid);
      render(rootEl);
    }
  });
}

function closePerUserModal(): void {
  const existing = document.getElementById('ax-toggles-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}
