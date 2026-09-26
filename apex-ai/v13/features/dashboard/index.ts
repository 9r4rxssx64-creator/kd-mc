/**
 * APEX v13 — Vue Dashboard (admin + user landing)
 *
 * Port v12 vDashboard : KPI cards, raccourcis, alerts, todos, stats live.
 *
 * Sections :
 * 1. Header greeting personnalisé "Bonjour [nom]"
 * 2. Cards KPI cliquables (msgs 24h, tokens, projets, sentinelles, todos)
 * 3. Section Alertes (credentials expirés, quotas faibles, sentinelles down)
 * 4. Section Todos (CLAUDE_HANDOFF + ax_claude_todo)
 * 5. Section Raccourcis (8 cards vers chat, vault, browser, etc.)
 * 6. Section Stats live (provider santé, latence, tokens 7j)
 *
 * Anti-patterns :
 * - escapeHtml() systématique sur toute donnée user
 * - Lazy-load services lourds (apex-tools, sentinels, audit-log)
 * - Pas d'inline onclick (data-attributes + addEventListener)
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';
import { haptic } from '../../ui/haptic.js';
import { renderRechargeAction } from '../../ui/recharge-action.js';

/* Re-export escapeHtml for backward compatibility (tests import from this module). */
export { escapeHtml };

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeDashboardScope: CleanupScope | null = null;

export function dispose(): void {
  activeDashboardScope?.cleanup();
  activeDashboardScope = null;
}

export interface DashboardKpi {
  id: string;
  icon: string;
  label: string;
  value: string | number;
  color: string;
  route: string;
}

export interface DashboardAlert {
  id: string;
  level: 'info' | 'warn' | 'error';
  title: string;
  description: string;
  ts: number;
  action_route?: string;
}

export interface DashboardTodo {
  id: string;
  source: 'handoff' | 'apex_todo' | 'sentinel';
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ts_created: number;
}

export interface DashboardShortcut {
  id: string;
  icon: string;
  label: string;
  description: string;
  route: string;
  color: string;
}

/**
 * Sprint 9 Kevin règle 2026-05-07 : statut multi-clés API par service.
 * Couleur lumière : green = au moins 1 clé active < 24h, yellow = partial (1+ failing
 * mais autre OK), red = service entièrement down, gray = pas de clé.
 */
export interface ServiceHealthLight {
  service: string;
  light: 'green' | 'yellow' | 'red' | 'gray';
  totalKeys: number;
  activeKeys: number;
  failingKeys: number;
  invalidKeys: number;
  lastSuccess: number;
}

const SHORTCUTS: ReadonlyArray<DashboardShortcut> = [
  { id: 'chat', icon: '💬', label: 'Chat', description: 'Conversation IA', route: 'chat', color: 'var(--ax-blue-bright)' },
  { id: 'vault', icon: '🔐', label: 'Coffre', description: 'Clés API & secrets', route: 'vault', color: 'var(--ax-gold-deep)' },
  { id: 'browser', icon: '🌐', label: 'Browser', description: 'Naviguer & embed', route: 'browser', color: 'var(--ax-green)' },
  { id: 'studios', icon: '🎨', label: 'Studios', description: 'Créatif (musique/vidéo)', route: 'studios', color: 'var(--ax-purple)' },
  { id: 'pro', icon: '🎓', label: 'Pro', description: 'Modules expert', route: 'pro', color: 'var(--ax-pink)' },
  { id: 'self-diag', icon: '🩺', label: 'Audit', description: 'Auto-diagnostic', route: 'self-diag', color: 'var(--ax-cyan)' },
  { id: 'settings', icon: '⚙️', label: 'Réglages', description: 'Configurer Apex', route: 'settings', color: 'var(--ax-text-dim)' },
  { id: 'rgpd', icon: '🛡', label: 'RGPD', description: 'Mes données', route: 'admin-rgpd', color: 'var(--ax-gold)' },
];

/**
 * Calcule les KPI live depuis les services injectés.
 * Pure function — testable indépendamment du DOM.
 */
export async function computeKpis(): Promise<DashboardKpi[]> {
  let messagesCount = 0;
  let tokensConsumed = 0;
  let projectsActive = 0;
  let sentinelsOk = 0;
  let sentinelsTotal = 0;
  let todosPending = 0;

  try {
    const raw = localStorage.getItem('apex_v13_messages_24h') ?? '0';
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) messagesCount = n;
  } catch { /* skip */ }

  try {
    const raw = localStorage.getItem('apex_v13_tokens_24h') ?? '0';
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) tokensConsumed = n;
  } catch { /* skip */ }

  try {
    const { kdmcProjectsRegistry } = await import('../../services/admin/kdmc-projects-registry.js');
    projectsActive = kdmcProjectsRegistry.countActive();
  } catch { /* skip */ }

  try {
    const { sentinels } = await import('../../services/sentinels/sentinels.js');
    const list = sentinels.list();
    sentinelsTotal = list.length;
    sentinelsOk = list.filter((s) => s.lastResult?.ok).length;
  } catch { /* skip */ }

  try {
    const raw = localStorage.getItem('ax_claude_todo') ?? '[]';
    const arr = JSON.parse(raw) as Array<{ status?: string }>;
    if (Array.isArray(arr)) {
      todosPending = arr.filter((t) => t.status === 'pending').length;
    }
  } catch { /* skip */ }

  return [
    { id: 'messages', icon: '💬', label: 'Messages 24h', value: messagesCount, color: 'var(--ax-blue-bright)', route: 'chat' },
    { id: 'tokens', icon: '🔢', label: 'Tokens 24h', value: tokensConsumed.toLocaleString('fr-FR'), color: 'var(--ax-gold-deep)', route: 'self-diag' },
    { id: 'projects', icon: '📦', label: 'Projets actifs', value: projectsActive, color: 'var(--ax-green)', route: 'admin' },
    { id: 'sentinels', icon: '🛡', label: 'Sentinelles OK', value: `${sentinelsOk}/${sentinelsTotal}`, color: sentinelsOk === sentinelsTotal ? 'var(--ax-green)' : 'var(--ax-warning)', route: 'sentinels' },
    { id: 'todos', icon: '📋', label: 'Todos en attente', value: todosPending, color: todosPending > 0 ? 'var(--ax-error)' : 'var(--ax-green)', route: 'self-diag' },
  ];
}

/**
 * Récupère les alertes critiques actuelles (credentials expirés, quotas faibles).
 */
export async function loadAlerts(): Promise<DashboardAlert[]> {
  const alerts: DashboardAlert[] = [];

  try {
    const { sentinels } = await import('../../services/sentinels/sentinels.js');
    const list = sentinels.list();
    const failing = list.filter((s) => s.lastResult && !s.lastResult.ok);
    for (const s of failing.slice(0, 3)) {
      alerts.push({
        id: `sentinel_${s.id}`,
        level: 'warn',
        title: `Sentinelle ${s.name}`,
        description: s.lastResult?.msg ?? 'KO',
        ts: s.lastResult?.ts ?? Date.now(),
        action_route: 'sentinels',
      });
    }
  } catch { /* skip */ }

  /* Credentials expiry watch */
  try {
    const expiring = JSON.parse(localStorage.getItem('apex_v13_credentials_expiring') ?? '[]') as Array<{
      service: string;
      days_left: number;
    }>;
    if (Array.isArray(expiring)) {
      for (const c of expiring.slice(0, 3)) {
        if (c.days_left < 30) {
          alerts.push({
            id: `cred_${c.service}`,
            level: c.days_left < 7 ? 'error' : 'warn',
            title: `Credential ${c.service}`,
            description: `Expire dans ${c.days_left} jours`,
            ts: Date.now(),
            action_route: 'vault',
          });
        }
      }
    }
  } catch { /* skip */ }

  return alerts;
}

/**
 * Sprint 9 (Kevin règle 2026-05-07) : charge le statut multi-clés API.
 * Pour chaque service connu (avec ≥ 1 clé), retourne lumière + stats.
 */
export async function loadServiceHealth(): Promise<ServiceHealthLight[]> {
  try {
    const { multiKeyVault } = await import('../../services/vault/multi-key-vault.js');
    const services = multiKeyVault.getKnownServices();
    const out: ServiceHealthLight[] = [];
    for (const service of services) {
      const stats = multiKeyVault.getStats(service);
      const light = multiKeyVault.getServiceLight(service);
      out.push({
        service,
        light,
        totalKeys: stats.total,
        activeKeys: stats.active,
        failingKeys: stats.failing,
        invalidKeys: stats.invalid,
        lastSuccess: stats.lastSuccess,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Charge les todos depuis ax_claude_todo + handoff.
 */
export function loadTodos(): DashboardTodo[] {
  const todos: DashboardTodo[] = [];

  try {
    const raw = localStorage.getItem('ax_claude_todo') ?? '[]';
    const arr = JSON.parse(raw) as Array<{
      id?: string;
      reason?: string;
      severity?: string;
      ts?: number;
      status?: string;
    }>;
    if (Array.isArray(arr)) {
      for (const t of arr.filter((t) => t.status === 'pending').slice(0, 5)) {
        todos.push({
          id: t.id ?? `todo_${Date.now()}`,
          source: 'apex_todo',
          title: t.reason ?? 'Todo sans description',
          severity: (t.severity as DashboardTodo['severity']) ?? 'medium',
          ts_created: t.ts ?? Date.now(),
        });
      }
    }
  } catch { /* skip */ }

  return todos;
}

function renderKpiCard(kpi: DashboardKpi, idx = 0): string {
  /* Premium KPI card: glassmorphism + hover lift + stagger animation + gold accent on hover */
  return `
    <button class="ax-kpi-card ax-modernized-card ax-bounce-tap" data-route="${escapeHtml(kpi.route)}"
      style="position:relative;background:linear-gradient(135deg,rgba(20,20,35,0.85),rgba(14,14,28,0.75));backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px 16px;cursor:pointer;text-align:center;transition:all 280ms cubic-bezier(0.34,1.56,0.64,1);overflow:hidden;min-height:120px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;animation:ax-fade-up 320ms cubic-bezier(0.34,1.56,0.64,1) ${30 + idx * 20}ms backwards;-webkit-tap-highlight-color:transparent">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${escapeHtml(kpi.color)},transparent);border-radius:16px 16px 0 0;opacity:0.85"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(circle at top right,${escapeHtml(kpi.color)}11,transparent 60%);pointer-events:none"></div>
      <div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 8px ${escapeHtml(kpi.color)}40)">${escapeHtml(kpi.icon)}</div>
      <div style="font-size:26px;font-weight:800;color:${escapeHtml(kpi.color)};line-height:1;letter-spacing:-0.02em;font-feature-settings:'tnum'">${escapeHtml(String(kpi.value))}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em;font-weight:600">${escapeHtml(kpi.label)}</div>
    </button>`;
}

function renderShortcutCard(s: DashboardShortcut, idx = 0): string {
  /* Premium shortcut card: glass + lift hover + gold border accent + stagger */
  return `
    <button class="ax-shortcut-card ax-modernized-card ax-bounce-tap" data-route="${escapeHtml(s.route)}"
      style="position:relative;background:linear-gradient(135deg,rgba(20,20,35,0.7),rgba(14,14,28,0.55));backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;cursor:pointer;text-align:left;transition:all 240ms cubic-bezier(0.16,1,0.3,1);display:flex;align-items:center;gap:14px;min-height:72px;overflow:hidden;animation:ax-fade-up 320ms cubic-bezier(0.34,1.56,0.64,1) ${30 + idx * 20}ms backwards;-webkit-tap-highlight-color:transparent">
      <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,${escapeHtml(s.color)},${escapeHtml(s.color)}88);border-radius:14px 0 0 14px"></div>
      <span style="font-size:30px;flex-shrink:0;filter:drop-shadow(0 4px 12px ${escapeHtml(s.color)}40);transition:transform 240ms cubic-bezier(0.34,1.56,0.64,1)" class="ax-shortcut-icon">${escapeHtml(s.icon)}</span>
      <div class="ax-gs-6">
        <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.01em;line-height:1.3">${escapeHtml(s.label)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.4;margin-top:2px">${escapeHtml(s.description)}</div>
      </div>
      <span style="color:${escapeHtml(s.color)};font-size:20px;flex-shrink:0;transition:transform 240ms cubic-bezier(0.34,1.56,0.64,1)" class="ax-shortcut-arrow">→</span>
    </button>`;
}

function renderAlerts(alerts: ReadonlyArray<DashboardAlert>): string {
  if (alerts.length === 0) {
    return `
      <div class="ax-gs-132">
        <span class="ax-gs-133">✅</span>
        <span class="ax-gs-134">Aucune alerte. Tout fonctionne.</span>
      </div>`;
  }
  return alerts
    .map((a, idx) => {
      /* v13.4.233 finding POST-FIX P0.9 — severity mapping HIG cohérent
       * critical=red, high=orange, medium=yellow, low=blue (parité settings) */
      const color = a.level === 'error' ? 'var(--ax-sev-critical)'
        : a.level === 'warn' ? 'var(--ax-sev-high)' : 'var(--ax-sev-low)';
      const rgbBase = a.level === 'error' ? '255,91,91' : a.level === 'warn' ? '255,153,68' : '106,138,255';
      const icon = a.level === 'error' ? '🚨' : a.level === 'warn' ? '⚠️' : 'ℹ️';
      /* v13.4.233 finding POST-FIX P1 — aria-role + tabindex pour WCAG accessibility */
      const route = a.action_route ? `data-route="${escapeHtml(a.action_route)}" role="button" tabindex="0" aria-label="${escapeHtml(a.title)} — ouvrir"` : '';
      return `
        <div class="ax-alert-row ax-modernized-card ax-bounce-tap" ${route}
          style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:linear-gradient(135deg,rgba(${rgbBase},.10),rgba(${rgbBase},.04));border:1px solid rgba(${rgbBase},.18);border-left:3px solid ${color};border-radius:12px;margin-bottom:8px;cursor:${a.action_route ? 'pointer' : 'default'};transition:all 200ms cubic-bezier(0.16,1,0.3,1);animation:ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) ${60 + idx * 50}ms backwards">
          <span style="font-size:20px;flex-shrink:0;filter:drop-shadow(0 2px 6px ${color}55)">${icon}</span>
          <div class="ax-gs-6">
            <div style="font-size:14px;font-weight:600;color:${color};letter-spacing:-0.01em">${escapeHtml(a.title)}</div>
            <div class="ax-gs-119">${escapeHtml(a.description)}</div>
          </div>
          ${a.action_route ? `<span style="color:${color};font-size:18px;opacity:0.7">→</span>` : ''}
        </div>`;
    })
    .join('');
}

function renderTodos(todos: ReadonlyArray<DashboardTodo>): string {
  if (todos.length === 0) {
    return `
      <div class="ax-gs-132">
        <span class="ax-gs-133">🎉</span>
        <span class="ax-gs-134">Aucun todo en attente.</span>
      </div>`;
  }
  return todos
    .map((t, idx) => {
      /* v13.4.233 finding POST-FIX P0.9 — severity mapping HIG */
      const color = t.severity === 'critical' ? 'var(--ax-sev-critical)'
        : t.severity === 'high' ? 'var(--ax-sev-high)'
        : t.severity === 'medium' ? 'var(--ax-sev-medium)' : 'var(--ax-sev-low)';
      const date = new Date(t.ts_created).toLocaleString('fr-FR');
      return `
        <div class="ax-modernized-card" style="padding:12px 14px;background:linear-gradient(135deg,rgba(20,20,35,0.6),rgba(14,14,28,0.4));backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-left:3px solid ${color};border-radius:10px;margin-bottom:8px;animation:ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) ${60 + idx * 50}ms backwards">
          <div style="font-size:13px;font-weight:600;color:#fff;line-height:1.4">${escapeHtml(t.title)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:4px;display:flex;gap:8px;align-items:center">
            <span style="display:inline-block;padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(t.source)}</span>
            <span>${escapeHtml(date)}</span>
          </div>
        </div>`;
    })
    .join('');
}

/**
 * Sprint 9 Kevin règle 2026-05-07 : rend la card "🚥 Statut services IA"
 * avec lumières par service + lien click → modal détail clés.
 *
 * v13.0.20+ Kevin règle 2026-05-07 : ajout boutons recharge/usage directs
 * pour qu'un clic atterrisse sur la bonne page billing du provider (pas dashboard
 * racine). Les URLs viennent de linksRegistry.getRechargeLink() / getUsageLink().
 */
export function renderServiceHealthCard(
  items: ReadonlyArray<ServiceHealthLight>,
  rechargeLinks: Readonly<Record<string, { recharge: string | null; usage: string | null; apiKeys: string | null }>> = {},
): string {
  if (items.length === 0) {
    return `
      <div class="ax-modernized-card" style="padding:14px 16px;background:linear-gradient(135deg,rgba(20,20,35,0.6),rgba(14,14,28,0.4));backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
        <div class="ax-gs-227">Aucune clé API encore configurée. Va dans le <strong class="ax-gs-372">Coffre</strong> pour ajouter tes premières clés.</div>
      </div>`;
  }
  const lightColor: Record<ServiceHealthLight['light'], string> = {
    green: 'var(--ax-green)',
    yellow: 'var(--ax-warning)',
    red: 'var(--ax-error)',
    gray: 'var(--ax-text-muted)',
  };
  const lightLabel: Record<ServiceHealthLight['light'], string> = {
    green: 'OK',
    yellow: 'Partiel',
    red: 'Panne',
    gray: 'Non testé',
  };
  return items
    .map((s, idx) => {
      const color = lightColor[s.light];
      const label = lightLabel[s.light];
      const stats = `${s.activeKeys}/${s.totalKeys} active${s.failingKeys > 0 ? ` · ${s.failingKeys} failing` : ''}${s.invalidKeys > 0 ? ` · ${s.invalidKeys} invalid` : ''}`;
      const links = rechargeLinks[s.service] ?? { recharge: null, usage: null, apiKeys: null };
      /* Bouton "Recharge directe" visible si yellow/red OU si recharge URL connue. */
      const showRecharge = links.recharge && (s.light === 'yellow' || s.light === 'red' || s.light === 'gray');
      /* v13.4.233 finding POST-FIX P0 — composant partagé renderRechargeAction
       * remplace duplication inline (cohérence avec settings/conso-scan). */
      const actionsHtml = renderRechargeAction({
        rechargeUrl: showRecharge ? (links.recharge ?? undefined) : undefined,
        rotateUrl: links.usage ?? undefined,
        variant: 'button',
        label: 'Recharge',
      });
      return `
        <div class="ax-service-health-row ax-modernized-card"
          style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,rgba(20,20,35,0.6),rgba(14,14,28,0.4));backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-left:3px solid ${color};border-radius:10px;margin-bottom:8px;width:100%;text-align:left;transition:all 200ms cubic-bezier(0.16,1,0.3,1);animation:ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) ${60 + idx * 50}ms backwards;flex-wrap:wrap">
          <button class="ax-service-health-main ax-bounce-tap" data-route="vault" data-service="${escapeHtml(s.service)}"
            style="display:flex;align-items:center;gap:12px;background:transparent;border:0;color:inherit;flex:1;min-width:200px;cursor:pointer;text-align:left;padding:0;-webkit-tap-highlight-color:transparent">
            <span aria-hidden="true" style="display:inline-block;width:12px;height:12px;background:${color};border-radius:50%;box-shadow:0 0 12px ${color};flex-shrink:0"></span>
            <div class="ax-gs-6">
              <div style="font-size:14px;font-weight:600;color:#fff;text-transform:capitalize">${escapeHtml(s.service)}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px">${escapeHtml(stats)}</div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;flex-shrink:0">${escapeHtml(label)}</span>
          </button>
          ${actionsHtml}
        </div>`;
    })
    .join('');
}

/**
 * Charge les URLs directes (recharge/usage/api_keys) pour chaque service connu.
 * Utilisé par renderServiceHealthCard pour afficher boutons "Recharge"/"Usage"
 * qui pointent SUR LA BONNE PAGE billing — pas dashboard racine (Kevin v13.0.20+).
 */
export async function loadRechargeLinks(
  services: ReadonlyArray<string>,
): Promise<Record<string, { recharge: string | null; usage: string | null; apiKeys: string | null }>> {
  const out: Record<string, { recharge: string | null; usage: string | null; apiKeys: string | null }> = {};
  if (services.length === 0) return out;
  try {
    const { linksRegistry } = await import('../../services/integrations/links-registry.js');
    for (const service of services) {
      out[service] = {
        recharge: linksRegistry.getRechargeLink(service),
        usage: linksRegistry.getUsageLink(service),
        apiKeys: linksRegistry.getApiKeysLink(service),
      };
    }
  } catch {
    /* fallback: keep empty record */
  }
  return out;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeDashboardScope?.cleanup();
  activeDashboardScope = createCleanupScope('dashboard');
  const user = store.get('user') as { name?: string; id?: string } | null;
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('admin.dashboard', rootEl, user?.id)) return;
  const greeting = user?.name ? `Bonjour ${user.name}` : 'Bonjour';

  const [kpis, alerts, serviceHealth] = await Promise.all([
    computeKpis(),
    loadAlerts(),
    loadServiceHealth(),
  ]);
  /* v13.0.20+ Kevin : charge les liens recharge directs pour chaque service détecté
     (pas page racine — bouton "Recharge" atterrit sur billing exact du provider). */
  const rechargeLinks = await loadRechargeLinks(serviceHealth.map((s) => s.service));
  const todos = loadTodos();

  rootEl.innerHTML = cspStyleHelper.withNonce(`
    <style>
      @keyframes ax-fade-up {
        0% { opacity: 0; transform: translateY(12px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .ax-modernized-card:hover {
        transform: translateY(-2px);
        border-color: rgba(232, 184, 48, 0.25) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35), 0 2px 6px rgba(232,184,48,0.08);
      }
      .ax-shortcut-card:hover .ax-shortcut-icon { transform: scale(1.1) rotate(-3deg); }
      .ax-shortcut-card:hover .ax-shortcut-arrow { transform: translateX(4px); }
      @media (prefers-reduced-motion: reduce) {
        .ax-modernized-card { animation: none !important; transition: none !important; }
        .ax-modernized-card:hover { transform: none !important; }
      }
    </style>
    <div class="ax-page" style="padding:24px 16px max(24px, env(safe-area-inset-bottom)) 16px;max-width:1140px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">
      <header style="margin-bottom:32px;animation:ax-fade-up 400ms cubic-bezier(0.16,1,0.3,1) backwards">
        <h1 style="margin:0 0 6px;font-size:clamp(26px,5.5vw,32px);font-weight:700;background:linear-gradient(135deg,var(--ax-gold-deep) 0%,var(--ax-gold) 50%,var(--ax-gold-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-family:Georgia,serif;letter-spacing:-0.025em;line-height:1.1">${escapeHtml(greeting)}</h1>
        <p style="color:rgba(255,255,255,0.55);margin:0;font-size:15px;font-weight:400;letter-spacing:-0.005em">Voici ton dashboard Apex.</p>
      </header>

      <section class="ax-gs-228">
        <h2 class="ax-gs-373">
          <span class="ax-gs-19">📊</span> Indicateurs clés
        </h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
          ${kpis.map((k, i) => renderKpiCard(k, i)).join('')}
        </div>
      </section>

      <section class="ax-gs-228">
        <h2 class="ax-gs-374">
          <span class="ax-gs-19">🔔</span> Alertes ${alerts.length > 0 ? `<span style="display:inline-block;padding:2px 10px;background:rgba(255,91,91,0.15);color:var(--ax-error);border-radius:24px;font-size:11px;font-weight:700">${alerts.length}</span>` : ''}
        </h2>
        ${renderAlerts(alerts)}
      </section>

      <section class="ax-gs-228">
        <h2 class="ax-gs-374">
          <span class="ax-gs-19">🚥</span> Statut services IA ${serviceHealth.length > 0 ? `<span style="display:inline-block;padding:2px 10px;background:rgba(106,138,255,0.15);color:var(--ax-blue);border-radius:24px;font-size:11px;font-weight:700">${serviceHealth.length}</span>` : ''}
        </h2>
        ${renderServiceHealthCard(serviceHealth, rechargeLinks)}
      </section>

      <section class="ax-gs-228">
        <h2 class="ax-gs-374">
          <span class="ax-gs-19">📋</span> Todos ${todos.length > 0 ? `<span style="display:inline-block;padding:2px 10px;background:rgba(255,170,0,0.15);color:var(--ax-warning);border-radius:24px;font-size:11px;font-weight:700">${todos.length}</span>` : ''}
        </h2>
        ${renderTodos(todos)}
      </section>

      <section class="ax-gs-228">
        <h2 class="ax-gs-373">
          <span class="ax-gs-19">🚀</span> Raccourcis
        </h2>
        <div class="ax-gs-89">
          ${SHORTCUTS.map((s, i) => renderShortcutCard(s, i)).join('')}
        </div>
      </section>

      <section class="ax-gs-228">
        <h2 class="ax-gs-373">
          <span class="ax-gs-19">📈</span> Stats live
        </h2>
        <div class="ax-modernized-card" style="background:linear-gradient(135deg,rgba(20,20,35,0.7),rgba(14,14,28,0.5));backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;animation:ax-fade-up 360ms cubic-bezier(0.16,1,0.3,1) 200ms backwards">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px">
            <div class="ax-gs-29">
              <div class="ax-gs-63">Provider santé</div>
              <div style="font-size:18px;font-weight:700;color:var(--ax-green);display:flex;align-items:center;gap:8px;letter-spacing:-0.01em">
                <span style="display:inline-block;width:8px;height:8px;background:var(--ax-green);border-radius:50%;box-shadow:0 0 12px var(--ax-green)"></span>
                Anthropic OK
              </div>
            </div>
            <div class="ax-gs-29">
              <div class="ax-gs-63">Latence dernière req</div>
              <div style="font-size:18px;font-weight:700;color:var(--ax-blue);letter-spacing:-0.01em;font-feature-settings:'tnum'">~ 1.2s</div>
            </div>
            <div class="ax-gs-29">
              <div class="ax-gs-63">Tokens 7j (estimé)</div>
              <div style="font-size:18px;font-weight:700;color:var(--ax-gold);letter-spacing:-0.01em;font-feature-settings:'tnum'">${escapeHtml(((kpis.find((k) => k.id === 'tokens')?.value ?? 0).toString()))}</div>
            </div>
          </div>
        </div>
      </section>

      <p style="text-align:center;color:rgba(255,255,255,0.3);font-size:11px;letter-spacing:0.05em;margin-top:24px">APEX v13 · Dashboard</p>
    </div>
  `);

  /* Wire navigation buttons (CSP strict) */
  rootEl.querySelectorAll<HTMLElement>('[data-route]').forEach((el) => {
    activeDashboardScope!.bind(el, 'click', () => {
      haptic.tap();
      const route = el.dataset['route'];
      if (route) window.location.hash = '#' + route;
    });
  });

  logger.info('feature-dashboard', `rendered (${kpis.length} kpis, ${alerts.length} alerts, ${todos.length} todos)`);
}
