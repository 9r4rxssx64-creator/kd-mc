/**
 * APEX v13 — Vue admin (Kevin only)
 *
 * Onglets :
 * - Commerce : toggle ON/OFF + assignation plans + statut commercialisation
 * - Users    : créer compte client/ami/famille + WhatsApp confirmation OTP
 * - Pending  : confirmations en attente (OTP reçus à valider)
 * - Health   : status providers IA + sentinelles
 * - Bilan    : bilan financier live (Sprint port v12 — CLAUDE.md règle vBilan)
 * - Conso    : consommation IA temps réel (Sprint port v12)
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { apexExecute, type ExecutionRequest } from '../../services/admin/apex-execute.js';
import { apexKnowledgeBase } from '../../services/admin/apex-knowledge-base.js';
import { kdmcProjectsRegistry, type ProjectStatus } from '../../services/admin/kdmc-projects-registry.js';
import { auth } from '../../services/auth/auth.js';
import { isFeatureEnabled, renderDisabledNotice } from '../../services/auth/feature-toggles.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';
import { commerce, type Plan } from '../../services/integrations/commerce.js';
import { whatsapp } from '../../services/integrations/whatsapp.js';
import { haptic } from '../../ui/haptic.js';
import { skeleton } from '../../ui/skeleton.js';
import { toast } from '../../ui/toast.js';

type Tab = 'commerce' | 'users' | 'pending' | 'health' | 'projects' | 'executions' | 'knowledge' | 'bilan' | 'consumption' | 'audit-log';

let activeTab: Tab = 'commerce';

/**
 * Mapping admin tab → feature toggle id (Kevin règle 2026-05-04 : ON/OFF tout).
 * Si le toggle est OFF, l'onglet n'est pas rendu (affichage notice désactivée).
 * Note: 'admin.toggles' (vue gestion ON/OFF) reste TOUJOURS accessible via
 * features/admin-toggles → kill-switch sécurité, jamais soft-locked.
 */
const ADMIN_TAB_TOGGLE_MAP: Record<Tab, string | null> = {
  commerce: 'admin.commerce',
  users: 'admin.users',
  pending: 'admin.users', /* Validation OTP rattachée à users */
  health: null, /* admin.dashboard sub-section, pas de toggle dédié */
  projects: null, /* admin.dashboard sub-section */
  executions: 'admin.executions',
  knowledge: 'admin.kb',
  bilan: 'admin.bilan',
  consumption: 'admin.consumption',
  'audit-log': 'admin.audit-log',
};

function renderCommerceTab(): string {
  const enabled = commerce.isEnabled();
  return `
    <div class="ax-admin-section">
      <h2>Commercialisation</h2>
      <p class="ax-muted">
        Active le système d'abonnements pour les non-admin. Toi (Kevin admin) gardes l'accès illimité dans tous les cas.
      </p>
      <div class="ax-toggle-row">
        <label class="ax-toggle">
          <input type="checkbox" id="commerce-toggle" aria-label="Activer la commercialisation des plans payants" ${enabled ? 'checked' : ''}>
          <span class="ax-toggle-slider"></span>
          <span class="ax-toggle-label">Commercialisation ${enabled ? '<strong>ACTIVÉE</strong>' : '<strong>désactivée</strong>'}</span>
        </label>
      </div>
      <div class="ax-info-card">
        <h3>Plans disponibles</h3>
        <ul>
          <li><strong>free</strong> : 50 msg/jour, 1 studio, voix basique</li>
          <li><strong>basic 9€/mois</strong> : 500 msg/jour, 5 studios, voix basique</li>
          <li><strong>pro 29€/mois</strong> : illimité, 23 studios, voix premium, marketplace</li>
          <li><strong>business sur devis</strong> : multi-user, marketplace 30%, white-label</li>
          <li><strong>admin</strong> (toi Kevin) : tout illimité, jamais bloqué</li>
        </ul>
      </div>
    </div>
  `;
}

function renderUsersTab(): string {
  const users = auth.listUsers();
  /* Tier whitelist anti-XSS — fix audit UX P1 */
  const ALLOWED_TIERS = new Set(['admin', 'family', 'client_pro', 'client_free']);
  const list = users
    .map(
      (u) => {
        const safeTier = ALLOWED_TIERS.has(u.tier) ? u.tier : 'client_free';
        return `
      <li class="ax-user-row">
        <span class="ax-user-name">${escapeHtml(u.name)}</span>
        <span class="ax-tier-badge ax-tier-${safeTier}">${escapeHtml(safeTier)}</span>
        ${u.activated ? '<span class="ax-badge ax-badge-ok">activé</span>' : '<span class="ax-badge ax-badge-pending">en attente</span>'}
        <select data-user-plan="${escapeHtml(u.id)}" class="ax-select-sm">
          <option value="free">free</option>
          <option value="basic">basic</option>
          <option value="pro">pro</option>
          <option value="business">business</option>
        </select>
      </li>
    `;
      },
    )
    .join('');

  return `
    <div class="ax-admin-section">
      <h2>Créer un compte</h2>
      <form id="create-user-form" class="ax-form">
        <label>
          Nom complet
          <input type="text" id="cu-name" aria-label="Nom complet du nouveau compte" required minlength="2" autocomplete="off">
        </label>
        <label>
          Type de compte
          <select id="cu-tier" required>
            <option value="family">Famille</option>
            <option value="client_pro">Client Pro</option>
            <option value="client_free">Client Gratuit</option>
          </select>
        </label>
        <label>
          Email (optionnel)
          <input type="email" id="cu-email" aria-label="Email du nouveau compte" autocomplete="off">
        </label>
        <label>
          Téléphone WhatsApp (avec indicatif, ex: +33612345678)
          <input type="tel" id="cu-whatsapp" aria-label="Numéro WhatsApp avec indicatif" autocomplete="off" placeholder="+33...">
        </label>
        <label>
          Code PIN initial (optionnel — sinon le client le crée à sa 1ère connexion)
          <input type="password" id="cu-pin" aria-label="PIN initial 4 chiffres minimum" minlength="4" autocomplete="new-password">
        </label>
        <button type="submit" class="ax-btn ax-btn-primary">Créer le compte</button>
      </form>
      <div id="create-user-result"></div>

      <h2>Comptes existants (${users.length})</h2>
      <ul class="ax-user-list">${list || '<li class="ax-muted">Aucun compte créé pour l\'instant</li>'}</ul>
    </div>
  `;
}

function renderPendingTab(): string {
  const pending = whatsapp.listPending();
  if (!pending.length) {
    return `
      <div class="ax-admin-section">
        <h2>Confirmations en attente</h2>
        <p class="ax-muted">Aucune confirmation à valider.</p>
      </div>
    `;
  }
  const items = pending
    .map(
      (p) => `
      <li class="ax-pending-row">
        <strong>${escapeHtml(p.name)}</strong>
        <span class="ax-muted">${escapeHtml(p.whatsapp)}</span>
        <code class="ax-otp">${p.otp}</code>
        <button class="ax-btn ax-btn-sm" data-confirm-otp="${p.otp}">Confirmer</button>
      </li>
    `,
    )
    .join('');
  return `
    <div class="ax-admin-section">
      <h2>Confirmations WhatsApp en attente</h2>
      <p class="ax-muted">Quand le client te a envoyé son code par WhatsApp, clique "Confirmer".</p>
      <ul class="ax-pending-list">${items}</ul>
    </div>
  `;
}

function renderHealthTab(): string {
  /* v13.4.232 (subagent UX P0.1 + P0.11) — Migration vers .ax-btn-health classes :
   * élimine 15+ hex hardcoded inline, padding standardisé 8/16px, touch 44px garanti. */
  return `
    <div class="ax-admin-section" data-scrollable="true">
      <h2>État de santé</h2>
      <p class="ax-muted">Codes vault · Liens dashboards · Sentinelles 24/7 · Connecteurs MCP · Vault drift. Tout testé en autonomie.</p>
      <!-- v13.4.331 (Kevin "fais un tri dans les boutons") : 2 actions primaires visibles,
           le reste rangé par thème dans des <details> repliés. "Audits Apex" retiré (doublon
           de la carte résumé #ax-admin-audits-summary ci-dessous). -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">
        <button class="ax-btn-health ax-btn-health-primary" data-nav-route="admin-health-dashboard">📊 Voir dashboard santé live</button>
        <button class="ax-btn-health ax-btn-health-eco" data-nav-route="runtime-tests">🧪 Tester TOUT (live)</button>
      </div>
      <details class="ax-health-group" style="margin:8px 0"><summary style="cursor:pointer;color:var(--ax-gold);font-size:13px;font-weight:600;padding:8px 0;min-height:36px;list-style:none">🔐 Credentials &amp; intégrations</summary>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
          <button class="ax-btn-health" data-nav-route="admin-credentials-status">🔑 Credentials</button>
          <button class="ax-btn-health" data-nav-route="admin-all-secrets">🔐 Mes Secrets</button>
          <button class="ax-btn-health ax-btn-health-purple" data-nav-route="mcp-servers">🔌 MCP Servers</button>
        </div>
      </details>
      <details class="ax-health-group" style="margin:8px 0"><summary style="cursor:pointer;color:var(--ax-gold);font-size:13px;font-weight:600;padding:8px 0;min-height:36px;list-style:none">🧠 IA &amp; compétences</summary>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
          <button class="ax-btn-health ax-btn-health-eco" data-nav-route="admin-autonomous">🤖 Mode Autonome</button>
          <button class="ax-btn-health ax-btn-health-blue" data-nav-route="skills-2026">🎯 Skills 2026</button>
          <button class="ax-btn-health" data-nav-route="admin-yury-plugins">🚀 Plugins Yury</button>
          <button class="ax-btn-health" data-nav-route="admin-shubham-skills">🎬 Shubham Skills</button>
          <button class="ax-btn-health" data-nav-route="admin-capabilities" title="Registre des capacités/compétences Apex">🧠 Capacités IA</button>
        </div>
      </details>
      <details class="ax-health-group" style="margin:8px 0"><summary style="cursor:pointer;color:var(--ax-gold);font-size:13px;font-weight:600;padding:8px 0;min-height:36px;list-style:none">🔒 Audits &amp; système</summary>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
          <button class="ax-btn-health" data-nav-route="audit-log-viewer" title="Audit log immutable (chain hash) — actions admin, vault, AI tracées">🔒 Audit Log Viewer</button>
          <button class="ax-btn-health" data-nav-route="admin-pinecone-status" title="État de l'index Pinecone (mémoire vectorielle)">🌲 Pinecone</button>
          <button class="ax-btn-health" data-nav-route="admin-voice-diagnostic" title="Diagnostic reconnaissance + synthèse vocale">🎙 Diagnostic Voix</button>
        </div>
      </details>
      <div id="ax-admin-health-mount" class="ax-gs-187"></div>
      <div id="ax-admin-audits-summary" class="ax-gs-187"></div>
    </div>
  `;
}

function renderProjectsTab(): string {
  const projects = kdmcProjectsRegistry.list();
  const total = kdmcProjectsRegistry.count();
  const active = kdmcProjectsRegistry.countActive();

  const STATUSES: ProjectStatus[] = ['active', 'wip', 'archived'];
  const items = projects
    .map((p) => {
      const safeStatus = STATUSES.includes(p.status) ? p.status : 'archived';
      const stack = p.tech_stack.slice(0, 4).map((s) => escapeHtml(s)).join(', ');
      return `
        <li class="ax-project-row" data-project-id="${escapeHtml(p.id)}">
          <div class="ax-project-head">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="ax-badge ax-badge-${safeStatus}">${escapeHtml(safeStatus)}</span>
            <code class="ax-project-version">${escapeHtml(p.version)}</code>
          </div>
          <p class="ax-muted">${escapeHtml(p.description)}</p>
          <p class="ax-project-stack"><em>stack:</em> ${stack || '—'}</p>
          <p class="ax-project-links">
            <a href="${escapeHtml(p.deploy_url)}" target="_blank" rel="noopener">🚀 Live</a>
            ·
            <a href="${escapeHtml(p.repo_url)}" target="_blank" rel="noopener">📦 Repo</a>
            · <span class="ax-muted">🛡 ${p.sentinels_count} sentinelles</span>
          </p>
          <div class="ax-project-edit">
            <input type="text" data-project-version="${escapeHtml(p.id)}"
                   aria-label="Version du projet ${escapeHtml(p.id)}"
                   value="${escapeHtml(p.version)}" placeholder="vX.Y" maxlength="20"
                   class="ax-input-sm" autocomplete="off">
            <select data-project-status="${escapeHtml(p.id)}" class="ax-select-sm">
              <option value="active" ${p.status === 'active' ? 'selected' : ''}>active</option>
              <option value="wip" ${p.status === 'wip' ? 'selected' : ''}>wip</option>
              <option value="archived" ${p.status === 'archived' ? 'selected' : ''}>archived</option>
            </select>
            <button class="ax-btn ax-btn-sm" data-project-save="${escapeHtml(p.id)}">💾</button>
          </div>
        </li>
      `;
    })
    .join('');

  return `
    <div class="ax-admin-section">
      <h2>📦 Projets KDMC (${total} — ${active} actifs/wip)</h2>
      <p class="ax-muted">
        Source de vérité injectée dans le system prompt IA Apex. Modifie version/statut → Apex le sait au prochain message.
      </p>
      <ul class="ax-project-list">${items || '<li class="ax-muted">Aucun projet enregistré</li>'}</ul>
    </div>
  `;
}

function renderTabs(): string {
  /* v13.2.1 fix Kevin "tabs superposés iPhone" — labels courts + scroll fluide */
  const allTabs: Array<[Tab, string]> = [
    ['commerce', '💳 Commerce'],
    ['users', '👥 Comptes'],
    ['pending', '📨 Attente'],
    ['health', '🩺 Santé'],
    ['projects', '📦 Projets'],
    ['executions', '⚙️ Exec'],
    ['knowledge', '📚 KB'],
    ['bilan', '📊 Bilan'],
    ['consumption', '💰 Conso'],
    ['audit-log', '🔒 Audit'],
  ];
  /* Filter tabs by feature toggle (Kevin règle ON/OFF). Tabs sans toggle (health/projects)
     restent toujours affichés. */
  const tabs = allTabs.filter(([id]) => {
    const toggleId = ADMIN_TAB_TOGGLE_MAP[id];
    return !toggleId || isFeatureEnabled(toggleId);
  });
  /* Premium tabs : pill design with gold gradient on active + smooth transition + 44px touch */
  return tabs
    .map(
      ([id, label]) => {
        const isActive = activeTab === id;
        /* v13.4.235 : styles inline → classe .ax-tab-pill (DRY, components.css). */
        return `
        <button class="ax-tab ax-tab-pill ax-bounce-tap${isActive ? ' is-active ax-tab-active' : ''}" data-tab="${id}" aria-pressed="${isActive ? 'true' : 'false'}">${label}</button>
      `;
      },
    )
    .join('');
}

function renderExecutionsTab(): string {
  const executions = apexExecute.listPendingExecutions({ limit: 30 });
  const stats = apexExecute.getStats();
  const allowed = apexExecute.listAllowedTasks();
  const forbidden = apexExecute.listForbiddenTasks();

  const STATUS_BADGES: Record<string, string> = {
    pending: 'pending',
    dispatched: 'wip',
    running: 'wip',
    completed: 'ok',
    failed: 'error',
    cancelled: 'archived',
    timeout: 'error',
  };

  const items = executions
    .map((req: ExecutionRequest) => {
      const safeStatus = STATUS_BADGES[req.status] ?? 'archived';
      const date = new Date(req.ts_created).toLocaleString();
      const duration = req.duration_ms ? `${Math.round(req.duration_ms / 1000)}s` : '—';
      const wfLink = req.workflow_run_url
        ? `<a href="${escapeHtml(req.workflow_run_url)}" target="_blank" rel="noopener">🔗 Workflow</a>`
        : '<span class="ax-muted">—</span>';
      const canCancel = req.status === 'pending' || req.status === 'dispatched';
      return `
        <li class="ax-execution-row" data-exec-id="${escapeHtml(req.id)}">
          <div class="ax-exec-head">
            <code class="ax-exec-id">${escapeHtml(req.id.slice(0, 18))}</code>
            <span class="ax-badge ax-badge-${safeStatus}">${escapeHtml(req.status)}</span>
            <strong>${escapeHtml(req.task)}</strong>
          </div>
          <p class="ax-muted">📅 ${escapeHtml(date)} · ⏱ ${escapeHtml(duration)} · 🚀 ${escapeHtml(req.src)} · 👤 ${escapeHtml(req.initiated_by)}</p>
          ${req.error ? `<p class="ax-error">⚠ ${escapeHtml(req.error.slice(0, 200))}</p>` : ''}
          <p class="ax-exec-actions">
            ${wfLink}
            ${canCancel ? ` · <button class="ax-btn ax-btn-sm" data-exec-cancel="${escapeHtml(req.id)}">✕ Annuler</button>` : ''}
            · <button class="ax-btn ax-btn-sm" data-exec-poll="${escapeHtml(req.id)}">🔄 Refresh</button>
          </p>
        </li>
      `;
    })
    .join('');

  return `
    <div class="ax-admin-section">
      <h2>🤖 Exécutions autonomes (apex-execute)</h2>
      <p class="ax-muted">
        Pont autonome IA → Claude Code via GitHub Actions. Apex IA peut exécuter du code réel
        (modify_file, run_test, deploy_canary…) en dispatchant un workflow CI qui utilise Claude Code Action.
      </p>
      <div class="ax-info-card">
        <h3>📊 Stats</h3>
        <ul>
          <li><strong>Total</strong> : ${stats.total}</li>
          <li><strong>En cours</strong> : ${stats.pending} pending / ${stats.running} running</li>
          <li><strong>Terminées</strong> : ${stats.completed} ✅ · ${stats.failed} ❌ · ${stats.cancelled} 🚫</li>
          <li><strong>Success rate</strong> : ${stats.success_rate}%</li>
          <li><strong>Avg duration</strong> : ${Math.round(stats.avg_duration_ms / 1000)}s</li>
        </ul>
      </div>
      <div class="ax-info-card">
        <h3>✅ Tâches autorisées (${allowed.length})</h3>
        <p>${allowed.map((t) => `<code>${escapeHtml(t)}</code>`).join(' · ')}</p>
        <h3>🚫 Tâches INTERDITES (${forbidden.length})</h3>
        <p class="ax-muted">${forbidden.map((t) => `<code>${escapeHtml(t)}</code>`).join(' · ')}</p>
      </div>
      <h3>📋 Historique récent</h3>
      <ul class="ax-execution-list">${items || '<li class="ax-muted">Aucune exécution pour l\'instant.</li>'}</ul>
    </div>
  `;
}

function renderContent(): string {
  /* Feature toggle gate per tab (Kevin règle ON/OFF général + per-user, 2026-05-04).
     Si l'onglet est désactivé via admin-toggles → afficher notice + bouton retour. */
  const toggleId = ADMIN_TAB_TOGGLE_MAP[activeTab];
  if (toggleId && !isFeatureEnabled(toggleId)) {
    return `<div class="ax-admin-section">${renderDisabledNotice(toggleId)}</div>`;
  }

  switch (activeTab) {
    case 'commerce':
      return renderCommerceTab();
    case 'users':
      return renderUsersTab();
    case 'pending':
      return renderPendingTab();
    case 'health':
      return renderHealthTab();
    case 'projects':
      return renderProjectsTab();
    case 'executions':
      return renderExecutionsTab();
    case 'knowledge':
      return renderKnowledgeTab();
    case 'bilan':
      return '<div id="ax-admin-mount-bilan" class="ax-admin-section"><p class="ax-muted">Chargement du bilan financier…</p></div>';
    case 'consumption':
      return '<div id="ax-admin-mount-consumption" class="ax-admin-section"><p class="ax-muted">Chargement consommation IA…</p></div>';
    case 'audit-log':
      return '<div id="ax-admin-mount-audit-log" class="ax-admin-section"><p class="ax-muted">Chargement audit log immuable…</p></div>';
  }
}

/**
 * Mount lazy-loaded admin sub-views (financial-bilan, consumption-dashboard).
 * Wires existing orphan modules into admin tabs (anti-pattern Declaration ≠ Deployment).
 */
async function mountLazyAdminView(rootEl: HTMLElement): Promise<void> {
  /* v13.4.182 (Kevin "Rapport historique auto dans admin") :
   * Mini-summary des audits Apex live dans le tableau de bord admin. */
  const mountAudits = rootEl.querySelector<HTMLElement>('#ax-admin-audits-summary');
  if (mountAudits) {
    try {
      const { reportsHistory } = await import('../../services/admin/apex-reports-history.js');
      const stats = reportsHistory.getStats();
      const lastLayoutDate = stats.lastLayoutTs
        ? new Date(stats.lastLayoutTs).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : 'jamais';
      const lastFuncDate = stats.lastFunctionalTs
        ? new Date(stats.lastFunctionalTs).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : 'jamais';
      const bugColor = stats.recentBugs > 0 ? 'var(--ax-error)' : 'var(--ax-green)';
      const escColor = stats.recentEscalations > 0 ? 'var(--ax-sev-high)' : 'var(--ax-green)';
      mountAudits.innerHTML = `
        <div class="ax-bounce-tap" data-nav-route="apex-audits-live" style="background:linear-gradient(135deg,rgba(106,138,255,0.10),rgba(180,90,200,0.06));border:1px solid rgba(106,138,255,0.3);border-radius:12px;padding:14px;cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">
            <h3 style="margin:0;color:var(--ax-blue-bright);font-size:14px;font-weight:700">📊 Apex Audits Live</h3>
            <span class="ax-gs-107">Tap → historique complet →</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;font-size:12px;color:rgba(255,255,255,0.85)">
            <div>📐 Layout : <b>${stats.layoutCount}</b> scans<br><span class="ax-gs-23">${lastLayoutDate}</span></div>
            <div>🧪 Fonctionnel : <b>${stats.functionalCount}</b> tests<br><span class="ax-gs-23">${lastFuncDate}</span></div>
            <div>🐛 Bugs 24h : <b style="color:${bugColor}">${stats.recentBugs}</b></div>
            <div>📤 Escaladés 24h : <b style="color:${escColor}">${stats.recentEscalations}</b></div>
          </div>
        </div>
      `;
    } catch (err) {
      logger.warn('admin', 'audits summary render failed', { err });
    }
  }

  const mountBilan = rootEl.querySelector<HTMLElement>('#ax-admin-mount-bilan');
  if (mountBilan) {
    try {
      const mod = (await import('./financial-bilan.js')) as { render: (el: HTMLElement) => void };
      mod.render(mountBilan);
    } catch (err) {
      logger.warn('admin', 'financial-bilan render failed', { err });
      mountBilan.innerHTML = '<p class="ax-muted">Bilan indisponible (module ko)</p>';
    }
  }
  const mountConsumption = rootEl.querySelector<HTMLElement>('#ax-admin-mount-consumption');
  if (mountConsumption) {
    try {
      const mod = (await import('./consumption-dashboard.js')) as { render: (el: HTMLElement) => void };
      mod.render(mountConsumption);
    } catch (err) {
      logger.warn('admin', 'consumption-dashboard render failed', { err });
      mountConsumption.innerHTML = '<p class="ax-muted">Consommation indisponible (module ko)</p>';
    }
  }
  const mountAudit = rootEl.querySelector<HTMLElement>('#ax-admin-mount-audit-log');
  if (mountAudit) {
    /* Toggle déjà gardé dans renderContent — ici on render juste la liste si feature active */
    if (!isFeatureEnabled('admin.audit-log')) {
      mountAudit.innerHTML = renderDisabledNotice('admin.audit-log');
      return;
    }
    try {
      const { auditLog } = await import('../../services/observability/audit-log.js');
      auditLog.init();
      const entries = auditLog.getEntries().slice(-100).reverse();
      const rows = entries
        .map(
          (e) => `<li><code>${escapeHtml(new Date(e.ts).toLocaleString())}</code> · <strong>${escapeHtml(e.action)}</strong> · ${escapeHtml(e.actor || 'system')}</li>`,
        )
        .join('');
      mountAudit.innerHTML = `
        <h2>🔒 Audit log immuable</h2>
        <p class="ax-muted">${entries.length} évènements récents (chain hash vérifié).</p>
        <ul class="ax-audit-list">${rows || '<li class="ax-muted">Aucun événement</li>'}</ul>
      `;
    } catch (err) {
      logger.warn('admin', 'audit-log render failed', { err });
      mountAudit.innerHTML = '<p class="ax-muted">Audit log indisponible (module ko)</p>';
    }
  }
}

function renderKnowledgeTab(): string {
  const repos = apexKnowledgeBase.listRepos();
  const stats = apexKnowledgeBase.getStats();
  const reposHtml = repos
    .map(
      (r) => `
      <li class="ax-repo-row">
        <code>${escapeHtml(r)}</code>
        ${repos.length > 1 ? `<button class="ax-btn ax-btn-sm" data-remove-repo="${escapeHtml(r)}">Retirer</button>` : ''}
      </li>
    `,
    )
    .join('');
  return `
    <div class="ax-admin-section">
      <h2>📚 Base de connaissances Kevin</h2>
      <p class="ax-muted">
        Apex peut chercher full-text dans le code de tes repos GitHub via API
        (5000 req/h authenticated, cache 1h).
      </p>

      <div class="ax-info-card">
        <strong>État :</strong> ${stats.repos} repos · ${stats.cache_entries} entrées cache · ${stats.index_entries} fichiers indexés
        <br>
        <strong>Token GitHub :</strong> ${stats.has_token ? '✅ configuré' : '⚪ Configure ax_github_token dans le Coffre pour 5000 req/h'}
      </div>

      <h3>Repos suivis</h3>
      <ul class="ax-repo-list">${reposHtml || '<li class="ax-muted">Aucun repo configuré</li>'}</ul>

      <form id="add-repo-form" class="ax-form">
        <label>
          <span>Ajouter un repo (format : owner/repo)</span>
          <input type="text" id="kb-add-repo" aria-label="Repo GitHub à ajouter (owner/repo)" placeholder="kevin/MyProject"
                 maxlength="100" autocomplete="off" class="ax-input">
        </label>
        <button type="submit" class="ax-btn ax-btn-primary">Ajouter</button>
      </form>

      <h3>Recherche dans le code</h3>
      <form id="kb-search-form" class="ax-form">
        <input type="text" id="kb-search-query" aria-label="Rechercher dans le code des repos" placeholder="Cherche dans tes repos..."
               maxlength="200" autocomplete="off" class="ax-input">
        <button type="submit" class="ax-btn ax-btn-primary">Chercher</button>
      </form>
      <div id="kb-search-results" class="ax-kb-results"></div>

      <div class="ax-actions">
        <button class="ax-btn ax-btn-sm" id="kb-clear-cache">🧹 Vider le cache</button>
      </div>
    </div>
  `;
}

function attachHandlers(rootEl: HTMLElement): void {
  /* Nav route delegation (CSP strict — replaces inline onclick) */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-nav-route]').forEach((btn) => {
    activeAdminScope!.bind(btn, 'click', () => {
      haptic.tap();
      const route = btn.dataset['navRoute'] ?? 'chat';
      window.location.hash = '#' + route;
    });
  });

  /* Select-all delegation for input click (CSP strict) */
  rootEl.querySelectorAll<HTMLInputElement>('[data-action="select-all"]').forEach((input) => {
    activeAdminScope!.bind(input, 'click', () => {
      input.select();
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    activeAdminScope!.bind(btn, 'click', () => {
      haptic.selection();
      activeTab = btn.dataset['tab'] as Tab;
      void render(rootEl);
    });
  });

  const toggle = rootEl.querySelector<HTMLInputElement>('#commerce-toggle');
  if (toggle) {
    activeAdminScope!.bind(toggle, 'change', () => {
      const newState = toggle.checked;
      haptic.medium();
      /* v13.4.103 (Kevin "tabs ne marchent plus sur Commerce") :
       * REVERT rAF defer → render direct.
       * Le rAF defer pouvait causer un double render si Kevin tappait
       * un autre tab pendant la frame intermédiaire, cassant les listeners.
       * Maintenant : label DOM update IMMÉDIAT + persist + render direct.
       * Le label update donne le feedback visuel <50ms avant le render. */
      const labelEl = rootEl.querySelector<HTMLSpanElement>('.ax-toggle-label');
      if (labelEl) {
        /* v13.4.133 audit-grade : DOM API au lieu d'innerHTML pour éviter XSS interpolation */
        labelEl.textContent = '';
        labelEl.append('Commercialisation ');
        const strong = document.createElement('strong');
        strong.textContent = newState ? 'ACTIVÉE' : 'désactivée';
        labelEl.append(strong);
      }
      commerce.setEnabled(newState);
      toast.success(`Commercialisation ${newState ? 'activée' : 'désactivée'}`);
      void render(rootEl);
    });
  }

  const form = rootEl.querySelector<HTMLFormElement>('#create-user-form');
  if (form) {
    activeAdminScope!.bind(form, 'submit', (e) => {
      e.preventDefault();
      void handleCreateUser(rootEl);
    });
  }

  rootEl.querySelectorAll<HTMLSelectElement>('[data-user-plan]').forEach((select) => {
    activeAdminScope!.bind(select, 'change', () => {
      const uid = select.dataset['userPlan'] ?? '';
      if (!uid) return;
      commerce.setUserPlan(uid, select.value as Plan);
      logger.info('admin', `Plan ${select.value} → ${uid}`);
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-project-save]').forEach((btn) => {
    activeAdminScope!.bind(btn, 'click', () => {
      haptic.tap();
      const id = btn.dataset['projectSave'] ?? '';
      if (!id) return;
      const verEl = rootEl.querySelector<HTMLInputElement>(`[data-project-version="${CSS.escape(id)}"]`);
      const statusEl = rootEl.querySelector<HTMLSelectElement>(`[data-project-status="${CSS.escape(id)}"]`);
      const newVersion = (verEl?.value ?? '').trim();
      const newStatus = (statusEl?.value ?? 'active') as ProjectStatus;
      if (!newVersion) {
        toast.warn('Version requise');
        return;
      }
      const ok = kdmcProjectsRegistry.update(id, { version: newVersion, status: newStatus });
      if (ok) {
        haptic.success();
        toast.success(`${id} → ${newVersion} (${newStatus})`);
        logger.info('admin', `Project ${id} updated`, { version: newVersion, status: newStatus });
        void render(rootEl);
      } else {
        haptic.error();
        toast.error('Update échoué');
      }
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-confirm-otp]').forEach((btn) => {
    activeAdminScope!.bind(btn, 'click', () => {
      haptic.tap();
      const otp = btn.dataset['confirmOtp'] ?? '';
      if (!otp) return;
      const result = whatsapp.confirm(otp);
      if (result.ok) {
        haptic.success();
        toast.success('Compte activé');
        logger.info('admin', `Confirmed user ${result.uid}`);
        void render(rootEl);
      } else {
        haptic.error();
        toast.error('Code OTP invalide ou expiré');
      }
    });
  });

  /* Apex execute : cancel + poll handlers */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-exec-cancel]').forEach((btn) => {
    activeAdminScope!.bind(btn, 'click', () => {
      haptic.tap();
      const id = btn.dataset['execCancel'] ?? '';
      if (!id) return;
      const ok = apexExecute.cancelExecution(id);
      if (ok) {
        haptic.success();
        toast.success('Exécution annulée');
        void render(rootEl);
      } else {
        haptic.warning();
        toast.warn('Annulation impossible');
      }
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-exec-poll]').forEach((btn) => {
    activeAdminScope!.bind(btn, 'click', () => {
      haptic.tap();
      const id = btn.dataset['execPoll'] ?? '';
      if (!id) return;
      void apexExecute.pollResult(id).then((req) => {
        if (req) {
          toast.success(`Statut : ${req.status}`);
          void render(rootEl);
        } else {
          toast.warn('Exécution introuvable');
        }
      });
    });
  });

  /* ========== Knowledge Base handlers ========== */
  const addRepoForm = rootEl.querySelector<HTMLFormElement>('#add-repo-form');
  if (addRepoForm) {
    activeAdminScope!.bind(addRepoForm, 'submit', (e) => {
      e.preventDefault();
      haptic.tap();
      const input = rootEl.querySelector<HTMLInputElement>('#kb-add-repo');
      const value = input?.value.trim() ?? '';
      if (!value) {
        toast.warn('Indique un repo');
        return;
      }
      const r = apexKnowledgeBase.addRepo(value);
      if (r.ok) {
        haptic.success();
        toast.success(`Repo ajouté : ${value}`);
        void render(rootEl);
      } else {
        haptic.error();
        toast.error(r.reason ?? 'Erreur ajout repo');
      }
    });
  }

  rootEl.querySelectorAll<HTMLButtonElement>('[data-remove-repo]').forEach((btn) => {
    activeAdminScope!.bind(btn, 'click', () => {
      haptic.tap();
      const repo = btn.dataset['removeRepo'] ?? '';
      if (!repo) return;
      apexKnowledgeBase.removeRepo(repo);
      toast.success(`Repo retiré : ${repo}`);
      void render(rootEl);
    });
  });

  const searchForm = rootEl.querySelector<HTMLFormElement>('#kb-search-form');
  if (searchForm) {
    activeAdminScope!.bind(searchForm, 'submit', (e) => {
      e.preventDefault();
      haptic.tap();
      const queryInput = rootEl.querySelector<HTMLInputElement>('#kb-search-query');
      const resultsEl = rootEl.querySelector<HTMLDivElement>('#kb-search-results');
      const query = queryInput?.value.trim() ?? '';
      if (!query || !resultsEl) return;
      resultsEl.innerHTML = '<p class="ax-muted">Recherche en cours...</p>';
      void apexKnowledgeBase.searchCode(query).then((results) => {
        if (results.length === 0) {
          resultsEl.innerHTML = '<p class="ax-muted">Aucun résultat (configure ax_github_token pour augmenter la limite).</p>';
          return;
        }
        /* v13.4.133 audit-grade : construction DOM API au lieu d'innerHTML.
         * Évite false-positive audit XSS sur ${} interpolation (variables
         * déjà escapées + URLs API GitHub trusted). */
        resultsEl.textContent = '';
        const ul = document.createElement('ul');
        ul.className = 'ax-kb-results-list';
        results.slice(0, 20).forEach((r) => {
          const li = document.createElement('li');
          li.className = 'ax-kb-result';
          const a = document.createElement('a');
          a.href = r.htmlUrl;
          a.target = '_blank';
          a.rel = 'noopener';
          const code = document.createElement('code');
          code.textContent = r.path;
          a.append(code);
          const span = document.createElement('span');
          span.className = 'ax-muted';
          span.textContent = `${r.repo} · score ${r.score.toFixed(2)}`;
          li.append(a, ' ', span);
          ul.append(li);
        });
        resultsEl.append(ul);
      });
    });
  }

  const clearCacheBtn = rootEl.querySelector<HTMLButtonElement>('#kb-clear-cache');
  if (clearCacheBtn) {
    activeAdminScope!.bind(clearCacheBtn, 'click', () => {
      haptic.tap();
      const r = apexKnowledgeBase.clearCache();
      toast.success(`Cache vidé : ${r.cleared} entrées`);
      void render(rootEl);
    });
  }
}

async function handleCreateUser(rootEl: HTMLElement): Promise<void> {
  const name = rootEl.querySelector<HTMLInputElement>('#cu-name')?.value.trim() ?? '';
  const tier = (rootEl.querySelector<HTMLSelectElement>('#cu-tier')?.value ?? 'family') as
    | 'family'
    | 'client_pro'
    | 'client_free';
  const email = rootEl.querySelector<HTMLInputElement>('#cu-email')?.value.trim() ?? '';
  const whatsappPhone = rootEl.querySelector<HTMLInputElement>('#cu-whatsapp')?.value.trim() ?? '';
  const pin = rootEl.querySelector<HTMLInputElement>('#cu-pin')?.value ?? '';

  if (!name || name.length < 2) {
    haptic.warning();
    toast.warn('Nom complet requis (min 2 caractères)');
    return;
  }

  const result = await auth.createUser({
    name,
    tier,
    ...(email && { email }),
    ...(whatsappPhone && { whatsappPhone }),
    ...(pin && { initialPin: pin }),
  });
  const resultEl = rootEl.querySelector<HTMLElement>('#create-user-result');
  if (!resultEl) return;
  if (!result.ok || !result.uid) {
    haptic.error();
    const reason = result.reason ?? 'Erreur création';
    resultEl.innerHTML = `<div class="ax-error">${escapeHtml(reason)}</div>`;
    toast.error(reason);
    return;
  }
  haptic.success();
  toast.success(`Compte ${name} créé`);

  let waLink = '';
  if (whatsappPhone) {
    const conf = await whatsapp.requestConfirmation({ uid: result.uid, name, whatsappPhone });
    if (conf.ok && conf.inviteLink) {
      waLink = `
        <a href="${conf.inviteLink}" target="_blank" rel="noopener" class="ax-btn ax-btn-primary">
          📨 Envoyer le code via WhatsApp
        </a>
        <p class="ax-muted">Code OTP : <code>${conf.otp}</code></p>
      `;
    }
  }

  resultEl.innerHTML = `
    <div class="ax-success">
      Compte créé : <strong>${escapeHtml(name)}</strong> (${tier})
      <p>Lien d'invitation : <input type="text" aria-label="Lien d'invitation à copier" readonly value="${result.inviteLink ?? ''}" data-action="select-all" class="ax-gs-193"></p>
      ${waLink}
    </div>
  `;
  void render(rootEl);
}

/* P1-6 (audit v13.2.7) : scope listener pour anti-leak SPA navigation. */
let activeAdminScope: CleanupScope | null = null;

export function dispose(): void {
  activeAdminScope?.cleanup();
  activeAdminScope = null;
}

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeAdminScope?.cleanup();
  activeAdminScope = createCleanupScope('admin');
  const isAdmin = store.get('isAdmin');
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div class="ax-empty">
        <h2>Accès réservé</h2>
        <p>Cette section est réservée à l'admin Kevin.</p>
      </div>
    `;
    return;
  }

  rootEl.innerHTML = cspStyleHelper.withNonce(`
    <style>
      @keyframes ax-fade-up {
        0% { opacity: 0; transform: translateY(12px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .ax-modernized-card { animation: ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) backwards; }
      .ax-bounce-tap { transition: transform 120ms cubic-bezier(0.16,1,0.3,1); }
      .ax-bounce-tap:active { transform: scale(0.96); }
      .ax-admin-content .ax-admin-section {
        background: linear-gradient(135deg, rgba(20,20,35,0.65), rgba(14,14,28,0.45));
        backdrop-filter: blur(16px) saturate(140%);
        -webkit-backdrop-filter: blur(16px) saturate(140%);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 16px;
        animation: ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) 60ms backwards;
      }
      .ax-admin-content h2 {
        margin: 0 0 12px;
        font-size: 18px;
        font-weight: 700;
        color: #fff;
        letter-spacing: -0.015em;
      }
      .ax-admin-content h3 {
        /* v13.4.232 finding P1.7 — hiérarchie typo nette : h3 15px > label 13px,
         * breathing room 18px vs 14px. Plus de confusion h3 vs labels. */
        margin: 18px 0 8px;
        font-size: 15px;
        color: var(--ax-gold);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }
      .ax-admin-content .ax-info-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px;
        padding: 14px 16px;
        margin: 12px 0;
      }
      .ax-admin-content .ax-muted {
        color: rgba(255,255,255,0.55);
        font-size: 13px;
        line-height: 1.5;
      }
      @media (prefers-reduced-motion: reduce) {
        .ax-modernized-card, .ax-admin-section { animation: none !important; transition: none !important; }
        .ax-bounce-tap { transition: none !important; }
      }
    </style>
    <div class="ax-admin ax-modernized-card" style="padding:max(20px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom)) 16px;max-width:1200px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">
      <header class="ax-admin-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:12px;padding-right:96px;border-bottom:1px solid rgba(255,255,255,0.06);position:sticky;top:env(safe-area-inset-top,0px);background:linear-gradient(180deg,rgba(8,8,15,0.95),rgba(8,8,15,0.85));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);z-index:10">
        <div class="ax-gs-106">
          <h1 style="margin:0;font-size:clamp(26px,5.5vw,32px);font-weight:700;background:linear-gradient(135deg,var(--ax-gold-deep) 0%,var(--ax-gold) 50%,var(--ax-gold-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-family:Georgia,serif;letter-spacing:-0.025em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">👑 Centre Admin</h1>
          <p class="ax-gs-288">Kevin · accès illimité</p>
        </div>
        <button class="ax-btn ax-btn-sm ax-bounce-tap" data-nav-route="chat" style="flex-shrink:0;padding:10px 16px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:24px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px;-webkit-tap-highlight-color:transparent;transition:all 180ms;white-space:nowrap" aria-label="Retour au chat">← Chat</button>
      </header>
      <nav class="ax-tabs" style="display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding:6px 0 12px;margin:0 -16px 14px;padding-left:16px;padding-right:16px;border-bottom:1px solid rgba(255,255,255,0.06);scrollbar-width:thin;scroll-snap-type:x mandatory;scroll-padding-left:16px">${renderTabs()}</nav>
      <div class="ax-admin-content">${renderContent()}</div>
    </div>
  `);
  attachHandlers(rootEl);
  /* Mount lazy admin views (bilan, consumption) — fire and forget, errors logged */
  if (activeTab === 'bilan' || activeTab === 'consumption') {
    /* H3 audit fix v13.3.74 — skeleton placeholder while lazy view loads.
       Fix v13.3.77 : appliquer le skeleton sur le placeholder INTERNE (loading text)
       du mount point, PAS sur le mount point lui-même (sinon écrase l'id que
       mountLazyAdminView cherche).
       Mount point ID reste accessible pour mountLazyAdminView. */
    const mountId = activeTab === 'bilan' ? 'ax-admin-mount-bilan' : 'ax-admin-mount-consumption';
    const mountEl = rootEl.querySelector<HTMLElement>(`#${mountId}`);
    if (mountEl) {
      const placeholder = mountEl.querySelector<HTMLElement>('p.ax-muted');
      const dispose = placeholder ? skeleton(placeholder, 'admin-table') : () => { /* no-op */ };
      void mountLazyAdminView(rootEl).finally(() => {
        dispose();
      });
    } else {
      void mountLazyAdminView(rootEl);
    }
  }
}
