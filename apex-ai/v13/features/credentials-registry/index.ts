/**
 * APEX v13 — Vue admin Credentials Registry (Kevin demande 2026-05-04 P0).
 *
 * "Vérifie que toutes les clés/codes sont sécurisés, mémorisés, sauvegardés."
 *
 * Vue admin-only qui affiche dashboard live de tous les credentials :
 *  - Score sécurité 0-100 (encrypted/configured + Firebase backup)
 *  - Liste 88+ patterns avec status (ok/missing/corrupted)
 *  - Bouton "Tester" par credential (ping API live)
 *  - Bouton "Recharger" → ouvre dashboard URL externe
 *  - Recommandations actionables (clés manquantes, alertes channels, etc.)
 *  - Filtres par catégorie (ai/banking/payment/...)
 *
 * Sécurité :
 *  - Admin only (store.get('isAdmin') strict)
 *  - JAMAIS de valeur en clair affichée — preview masquée seulement
 *  - listener-cleanup scope (anti-leak SPA)
 */

import { escapeHtml } from '../../core/html-safe.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { credentialsAudit, type CredentialAuditEntry, type CredentialsAuditReport } from '../../services/vault/credentials-audit.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

let activeRegistryScope: CleanupScope | null = null;
let currentReport: CredentialsAuditReport | null = null;
let currentCategoryFilter: string = 'all';

export function dispose(): void {
  activeRegistryScope?.cleanup();
  activeRegistryScope = null;
}

const STATUS_COLORS = {
  ok: { color: '#22cc77', icon: '🟢', label: 'OK' },
  missing: { color: '#888', icon: '⚪', label: 'Non config' },
  corrupted: { color: '#ff6b6b', icon: '🔴', label: 'Corrompu' },
  expired: { color: '#ffaa00', icon: '🟠', label: 'Expiré' },
  unknown: { color: '#aaa', icon: '❓', label: 'Inconnu' },
  /* v13.3.21 (Kevin "decrypt failed" 2026-05-07) : nouveau status recoverable
   * → bouton 🔓 Récupérer en UI au lieu de toast rouge silencieux. */
  decrypt_failed: { color: '#ff6b6b', icon: '🔒', label: 'Illisible' },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Tous',
  ai: '🤖 IA',
  banking: '🏦 Banque',
  payment: '💳 Paiement',
  social: '📱 Social',
  email: '📧 Email',
  crypto: '₿ Crypto',
  hosting: '☁️ Hosting',
  productivity: '📋 Productivité',
  forbidden: '⚠️ Forbidden',
};

export async function render(rootEl: HTMLElement): Promise<void> {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div class="ax-gs-21">
        <h2 class="ax-gs-266">Accès admin uniquement</h2>
        <p>Cette section est réservée à Kevin.</p>
      </div>
    `;
    return;
  }

  /* Cleanup ancien scope */
  activeRegistryScope?.cleanup();
  activeRegistryScope = createCleanupScope('credentials-registry');

  /* Loading state */
  rootEl.innerHTML = `
    <div class="ax-gs-57">
      <p>🔍 Audit credentials en cours...</p>
    </div>
  `;

  /* Run audit (async, peut prendre 1-2s) */
  try {
    currentReport = await credentialsAudit.runFullAudit();
  } catch (err: unknown) {
    logger.error('credentials-registry', 'audit failed', { err });
    rootEl.innerHTML = `<div style="padding:40px;color:#ff6b6b">Erreur audit : ${escapeHtml(String(err))}</div>`;
    return;
  }

  renderReport(rootEl, currentReport);
}

function renderReport(rootEl: HTMLElement, report: CredentialsAuditReport): void {
  const score = report.security_score;
  const scoreColor = score >= 80 ? '#22cc77' : score >= 60 ? '#ffaa00' : '#ff6b6b';

  /* Filtre catégorie */
  const filtered = currentCategoryFilter === 'all'
    ? report.entries
    : report.entries.filter((e) => e.category === currentCategoryFilter);

  /* Tri : configurés d'abord, puis par catégorie */
  const sorted = [...filtered].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1;
    return a.service_name.localeCompare(b.service_name);
  });

  /* Catégories disponibles avec compteurs */
  const catCounts = new Map<string, number>();
  catCounts.set('all', report.entries.length);
  for (const e of report.entries) {
    catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
  }

  const categoryChips = [...catCounts.entries()]
    .filter(([cat]) => cat === 'all' || (CATEGORY_LABELS[cat] && (catCounts.get(cat) ?? 0) > 0))
    .map(([cat, count]) => {
      const isActive = currentCategoryFilter === cat;
      const label = CATEGORY_LABELS[cat] ?? cat;
      return `<button data-cat="${escapeHtml(cat)}" class="ax-cat-chip" style="
        padding:8px 14px;border-radius:20px;border:1px solid ${isActive ? '#c9a227' : 'rgba(255,255,255,0.15)'};
        background:${isActive ? 'rgba(201,162,39,0.15)' : 'rgba(255,255,255,0.03)'};
        color:${isActive ? '#c9a227' : 'var(--ax-text-dim)'};
        cursor:pointer;font-size:13px;margin:4px;font-weight:${isActive ? '600' : '400'}
      ">${escapeHtml(label)} (${count})</button>`;
    }).join('');

  const recommendations = report.recommendations.length === 0
    ? '<p style="color:#22cc77;margin:0">✅ Aucune recommandation — config saine</p>'
    : report.recommendations.map((r) => `<li style="margin:8px 0;color:#ffaa00">${escapeHtml(r)}</li>`).join('');

  const credentialsList = sorted.length === 0
    ? '<p class="ax-gs-213">Aucun credential dans cette catégorie</p>'
    : sorted.map((e) => renderEntry(e)).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-364">
      <header class="ax-gs-180">
        <h1 class="ax-gs-365">🔐 Coffre — Audit credentials</h1>
        <p style="color:var(--ax-text-dim);margin:0;font-size:13px">
          ${report.total_patterns} patterns reconnus · ${report.configured_count} configurés ·
          ${report.encrypted_count} chiffrés AES-GCM-256 · ${report.firebase_backup_count} backup Firebase
        </p>
      </header>

      <!-- Security Score Card -->
      <div style="background:linear-gradient(135deg,rgba(201,162,39,0.1),rgba(201,162,39,0.02));
                  border:1px solid rgba(201,162,39,0.3);border-radius:14px;padding:20px;margin-bottom:20px">
        <div class="ax-gs-112">
          <div>
            <div class="ax-gs-128">Score sécurité credentials</div>
            <div style="font-size:42px;font-weight:700;color:${scoreColor};line-height:1">
              ${score.toFixed(0)}<span style="font-size:20px;color:var(--ax-text-dim)">/100</span>
            </div>
          </div>
          <div class="ax-gs-7">
            <button id="ax-cred-refresh" class="ax-btn ax-btn-outline ax-gs-366">🔄 Refresh audit</button>
            <button id="ax-cred-test-channels" class="ax-btn ax-btn-outline ax-gs-366">📡 Test alertes</button>
          </div>
        </div>
      </div>

      <!-- Recommandations -->
      <div style="background:rgba(255,170,0,0.05);border:1px solid rgba(255,170,0,0.2);
                  border-radius:12px;padding:16px;margin-bottom:20px">
        <h3 style="margin:0 0 12px;color:#ffaa00;font-size:15px">💡 Recommandations</h3>
        <ul class="ax-gs-362">${recommendations}</ul>
      </div>

      <!-- Filtres catégorie -->
      <div class="ax-gs-181">
        <h3 style="margin:0 0 8px;color:var(--ax-text-dim);font-size:13px;text-transform:uppercase;letter-spacing:0.5px">
          Filtrer par catégorie
        </h3>
        <div style="display:flex;flex-wrap:wrap">${categoryChips}</div>
      </div>

      <!-- Liste credentials -->
      <div id="ax-cred-list">${credentialsList}</div>

      <p class="ax-gs-265">
        🔒 Coffre Apex v13 · AES-GCM-256 + PBKDF2 200k · Triple persistence (local+IDB+Firebase)
      </p>
    </div>
  `;

  attachHandlers(rootEl);
  logger.info('credentials-registry', `rendered : ${report.configured_count}/${report.total_patterns} configured, score=${score}`);
}

function renderEntry(e: CredentialAuditEntry): string {
  const status = STATUS_COLORS[e.status];
  const persistedIcons = [
    e.persisted.local ? '<span title="localStorage" class="ax-gs-205">💾</span>' : '<span title="pas en local" class="ax-gs-224">·</span>',
    e.persisted.idb ? '<span title="IndexedDB shadow" class="ax-gs-205">🗄️</span>' : '<span title="pas en IDB" class="ax-gs-224">·</span>',
    e.persisted.firebase ? '<span title="Firebase backup" class="ax-gs-205">☁️</span>' : '<span title="pas en Firebase" class="ax-gs-224">·</span>',
  ].join(' ');

  return `
    <article data-cred-detail="${escapeHtml(e.storage_key)}" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);
                    border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div class="ax-gs-11">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <strong class="ax-gs-266">${escapeHtml(e.service_name)}</strong>
            <span style="font-size:11px;padding:2px 6px;border-radius:8px;background:rgba(255,255,255,0.05);color:var(--ax-text-dim)">
              ${escapeHtml(e.category)}
            </span>
          </div>
          <code class="ax-gs-190">${escapeHtml(e.storage_key)}</code>
        </div>
        <div class="ax-gs-83">
          <span style="color:${status.color};font-size:13px">${status.icon} ${status.label}</span>
          ${e.encrypted ? '<span style="color:#22cc77;font-size:11px" title="AES-GCM-256">🔒</span>' : ''}
          <span class="ax-gs-225">${persistedIcons}</span>
          <code style="font-family:monospace;font-size:11px;color:var(--ax-text-dim);background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px">${escapeHtml(e.preview)}</code>
        </div>
      </div>
      ${e.status_detail ? `<p style="margin:6px 0 0;color:#ff6b6b;font-size:11px">⚠️ ${escapeHtml(e.status_detail)}</p>` : ''}
      <div class="ax-gs-129">
        ${e.status === 'decrypt_failed' ? `<button class="ax-btn ax-btn-sm" data-recover="${escapeHtml(e.storage_key)}" data-service="${escapeHtml(e.service_name)}" style="font-size:11px;padding:4px 10px;background:rgba(255,170,0,0.2);color:#ffaa00;border:1px solid rgba(255,170,0,0.4);font-weight:600">🔓 Récupérer cette clé</button>` : ''}
        ${e.configured ? `<button class="ax-btn ax-btn-sm" data-test="${escapeHtml(e.storage_key)}" style="font-size:11px;padding:4px 10px">🧪 Tester</button>` : ''}
        ${e.dashboard_url ? `<a href="${escapeHtml(e.dashboard_url)}" target="_blank" rel="noopener" class="ax-btn ax-btn-sm ax-gs-280">🔗 Dashboard</a>` : ''}
        ${e.billing_url ? `<a href="${escapeHtml(e.billing_url)}" target="_blank" rel="noopener" class="ax-btn ax-btn-sm ax-gs-280">💰 Recharger</a>` : ''}
      </div>
    </article>
  `;
}

/**
 * v13.3.21 (Kevin "Récupérer cette clé" 2026-05-07) :
 * Modal recolle clé pour re-chiffrement avec passphrase courante.
 */
function openRecoverModal(rootEl: HTMLElement, storageKey: string, serviceName: string): void {
  /* Crée modal inline (anti-CSP injection) */
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', `Récupérer ${serviceName}`);
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  modal.innerHTML = `
    <div style="background:#1a1a2e;border:1px solid rgba(201,162,39,0.4);border-radius:14px;padding:24px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
      <h3 class="ax-gs-365">🔓 Récupérer ${escapeHtml(serviceName)}</h3>
      <p style="color:var(--ax-text-dim);font-size:13px;margin:0 0 16px">
        Clé chiffrée présente mais illisible (passphrase a changé). Recolle ta clé pour qu'Apex la re-chiffre avec la passphrase courante.
      </p>
      <input type="password" id="ax-recover-input" aria-label="Coller la clé ${escapeHtml(serviceName)} à récupérer" autocomplete="off" placeholder="Recolle ta clé ${escapeHtml(serviceName)}…"
        style="width:100%;padding:12px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-family:monospace;font-size:13px;box-sizing:border-box">
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
        <button id="ax-recover-cancel" style="padding:8px 16px;background:rgba(255,255,255,0.05);color:var(--ax-text-dim);border:1px solid rgba(255,255,255,0.15);border-radius:8px;cursor:pointer;font-size:13px">Annuler</button>
        <button id="ax-recover-confirm" style="padding:8px 16px;background:rgba(34,204,119,0.2);color:#22cc77;border:1px solid rgba(34,204,119,0.4);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">✅ Récupérer</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const input = modal.querySelector<HTMLInputElement>('#ax-recover-input');
  const cancelBtn = modal.querySelector<HTMLButtonElement>('#ax-recover-cancel');
  const confirmBtn = modal.querySelector<HTMLButtonElement>('#ax-recover-confirm');
  setTimeout(() => input?.focus(), 50);
  const close = (): void => { modal.remove(); };
  cancelBtn?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  confirmBtn?.addEventListener('click', () => {
    void (async () => {
      const value = input?.value.trim() ?? '';
      if (!value) {
        toast.warn('Recolle ta clé pour récupérer');
        return;
      }
      try {
        const { vault } = await import('../../services/vault/vault.js');
        const r = await vault.recover(storageKey, value);
        if (r.ok) {
          haptic.success();
          toast.success(`✅ ${serviceName} récupérée + re-chiffrée`);
          close();
          /* Refresh vue */
          void render(rootEl);
        } else {
          haptic.error();
          toast.error(`❌ ${r.reason ?? 'recover failed'}`);
        }
      } catch (err: unknown) {
        console.error("credentials action:", err); toast.error("Action impossible pour le moment — réessaie");
      }
    })();
  });
}

function attachHandlers(rootEl: HTMLElement): void {
  if (!activeRegistryScope) return;

  /* Refresh */
  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-cred-refresh');
  if (refreshBtn) {
    activeRegistryScope.bind(refreshBtn, 'click', () => {
      haptic.tap();
      void render(rootEl);
    });
  }

  /* Test channels */
  const testChannelsBtn = rootEl.querySelector<HTMLButtonElement>('#ax-cred-test-channels');
  if (testChannelsBtn) {
    activeRegistryScope.bind(testChannelsBtn, 'click', () => {
      haptic.tap();
      void (async () => {
        toast.info('📡 Test alertes en cours...');
        const { kevinAlerts } = await import('../../services/admin/kevin-alerts.js');
        const r = await kevinAlerts.testAllChannels();
        const ok = Object.entries(r).filter(([, v]) => v).map(([k]) => k);
        if (ok.length === 0) {
          toast.warn('Aucun channel d\'alerte configuré');
        } else {
          toast.success(`✅ Channels OK : ${ok.join(', ')}`);
        }
      })();
    });
  }

  /* Catégorie filter chips */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((btn) => {
    activeRegistryScope!.bind(btn, 'click', () => {
      currentCategoryFilter = btn.dataset['cat'] ?? 'all';
      haptic.selection();
      if (currentReport) renderReport(rootEl, currentReport);
    });
  });

  /* v13.3.21 (Kevin) — Bouton "🔓 Récupérer cette clé" pour decrypt_failed */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-recover]').forEach((btn) => {
    activeRegistryScope!.bind(btn, 'click', () => {
      const storageKey = btn.dataset['recover'] ?? '';
      const service = btn.dataset['service'] ?? storageKey;
      if (!storageKey) return;
      haptic.tap();
      openRecoverModal(rootEl, storageKey, service);
    });
  });

  /* Test credential individuel */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-test]').forEach((btn) => {
    activeRegistryScope!.bind(btn, 'click', (e) => {
      e.stopPropagation(); /* don't bubble to article click */
      const key = btn.dataset['test'];
      if (!key) return;
      haptic.tap();
      void (async () => {
        const original = btn.textContent;
        btn.textContent = '⏳ Test...';
        btn.disabled = true;
        try {
          const r = await credentialsAudit.testCredential(key);
          if (r.valid === true) toast.success(`✅ ${key} : valide (${r.latency_ms}ms)`);
          else if (r.valid === false) toast.warn(`❌ ${key} : invalide`);
          else toast.info(`❓ ${key} : ${r.error ?? 'test impossible'}`);
        } catch (err: unknown) {
          console.error("credentials test:", err); toast.error("Test de la clé impossible — réessaie");
        } finally {
          btn.textContent = original ?? '🧪 Tester';
          btn.disabled = false;
        }
      })();
    });
  });

  /* v13.3.57 PUSH-100 : drilldown récursif sur clic article credential.
   * Click article → modal détail credential (storage_key, encrypted, last test, recommendations) */
  rootEl.querySelectorAll<HTMLElement>('[data-cred-detail]').forEach((article) => {
    activeRegistryScope!.bind(article, 'click', (ev) => {
      /* Si clic sur bouton interne (test/recover/dashboard/billing) → ne pas drilldown */
      const target = ev.target as HTMLElement;
      if (target.closest('button, a')) return;
      void (async () => {
        const storageKey = article.dataset['credDetail'];
        if (!storageKey || !currentReport) return;
        const entry = currentReport.entries.find((c) => c.storage_key === storageKey);
        if (!entry) return;
        const { drillDown } = await import('../../ui/drilldown.js');
        const mountId = 'ax-drilldown-mount-credentials';
        let mount = document.getElementById(mountId);
        if (!mount) {
          mount = document.createElement('div');
          mount.id = mountId;
          document.body.appendChild(mount);
        }
        drillDown.open({
          id: `cred-${storageKey}`,
          title: `🔑 ${entry.service_name}`,
          content: () => {
            const status = STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.unknown;
            return `
              <div class="ax-gs-27">
                <table class="ax-gs-291">
                  <tr><td class="ax-gs-367">Service</td><td>${escapeHtml(entry.service_name)}</td></tr>
                  <tr><td class="ax-gs-367">Storage key</td><td><code>${escapeHtml(entry.storage_key)}</code></td></tr>
                  <tr><td class="ax-gs-367">Catégorie</td><td>${escapeHtml(entry.category)}</td></tr>
                  <tr><td class="ax-gs-367">Statut</td><td style="color:${status.color}">${status.icon} ${status.label}</td></tr>
                  <tr><td class="ax-gs-367">Chiffré</td><td>${entry.encrypted ? '🔒 AES-GCM-256' : '⚠️ Non chiffré'}</td></tr>
                  <tr><td class="ax-gs-367">Configuré</td><td>${entry.configured ? '✅ Oui' : '⚪ Non'}</td></tr>
                  <tr><td class="ax-gs-367">Aperçu</td><td><code>${escapeHtml(entry.preview)}</code></td></tr>
                  ${entry.dashboard_url ? `<tr><td class="ax-gs-367">Dashboard</td><td><a href="${escapeHtml(entry.dashboard_url)}" target="_blank" rel="noopener" class="ax-gs-198">${escapeHtml(entry.dashboard_url)}</a></td></tr>` : ''}
                  ${entry.billing_url ? `<tr><td class="ax-gs-367">Billing</td><td><a href="${escapeHtml(entry.billing_url)}" target="_blank" rel="noopener" class="ax-gs-198">${escapeHtml(entry.billing_url)}</a></td></tr>` : ''}
                </table>
                ${entry.status_detail ? `<p style="margin:12px 0 0;color:#ff6b6b;font-size:12px">⚠️ ${escapeHtml(entry.status_detail)}</p>` : ''}
              </div>
            `;
          },
          data: { storageKey },
        }, mount);
      })();
    });
  });
}
