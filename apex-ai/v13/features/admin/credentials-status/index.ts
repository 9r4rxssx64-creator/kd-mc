/**
 * APEX v13 — Vue admin "Credentials Status".
 *
 * Demande Kevin 2026-05-08 23h30 ABSOLUE :
 * "Quand il me dit qu'il lui manque des choses bah pourquoi il est pas allé
 *  les chercher automatiquement"
 *
 * Vue admin qui montre l'état complet des credentials :
 *  - Présent localement (rien à faire)
 *  - Recoverable (alias / IDB / Firebase / pattern_match) → bouton 1-clic restore tout
 *  - Truly absent (Kevin doit coller) → lien direct dashboard service
 *
 * UI :
 *  - Header : stats globales (présent / restorable / absent)
 *  - Section "Recoverable" : tableau + bouton "Restaurer toutes" 1-clic
 *  - Section "Truly absent" : tableau avec liens dashboard ouverts en nouvel onglet
 *  - Refresh manuel + auto post-restore
 *
 * Sécurité : admin-only.
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import {
  autoRestoreCredentials,
  type AuditMissingResult,
  type MissingEntry,
  type RestoreSource,
} from '../../../services/vault/auto-restore-credentials.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;
let currentAudit: AuditMissingResult | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
  currentAudit = null;
}

const SOURCE_LABELS: Record<RestoreSource, { icon: string; label: string; color: string }> = {
  localStorage: { icon: '💾', label: 'Local', color: '#22cc77' },
  idb_shadow: { icon: '🗄️', label: 'IDB shadow', color: '#22cc77' },
  firebase_backup: { icon: '☁️', label: 'Firebase backup', color: '#4d9eff' },
  alias: { icon: '🔗', label: 'Alias localStorage', color: '#c9a227' },
  pattern_match: { icon: '🔍', label: 'Pattern match', color: '#ff9d3f' },
};

function renderRecoverableRow(e: MissingEntry): string {
  const src = e.recoverable_from ? SOURCE_LABELS[e.recoverable_from] : { icon: '❓', label: '—', color: '#aaa' };
  return `
    <article style="background:rgba(255,255,255,0.02);border:1px solid rgba(34,204,119,0.2);border-radius:10px;padding:12px;margin-bottom:6px">
      <div class="ax-gs-93">
        <div class="ax-gs-11">
          <strong class="ax-gs-279">${escapeHtml(e.service_name)}</strong>
          <span class="ax-gs-94">${escapeHtml(e.category)}</span>
          <br>
          <code class="ax-gs-190">${escapeHtml(e.storage_key)}</code>
        </div>
        <div style="font-size:12px;color:${src.color}">
          ${src.icon} ${escapeHtml(src.label)}${e.alias_source ? ` <code style="font-size:10px;background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">${escapeHtml(e.alias_source)}</code>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderAbsentRow(e: MissingEntry): string {
  return `
    <article style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,107,107,0.2);border-radius:10px;padding:12px;margin-bottom:6px">
      <div class="ax-gs-93">
        <div class="ax-gs-11">
          <strong style="color:#ff6b6b">${escapeHtml(e.service_name)}</strong>
          <span class="ax-gs-94">${escapeHtml(e.category)}</span>
          <br>
          <code class="ax-gs-190">${escapeHtml(e.storage_key)}</code>
        </div>
        <div class="ax-gs-20">
          ${e.dashboard_url ? `<a href="${escapeHtml(e.dashboard_url)}" target="_blank" rel="noopener" class="ax-btn ax-btn-sm ax-gs-280">🔗 Dashboard</a>` : ''}
          ${e.billing_url ? `<a href="${escapeHtml(e.billing_url)}" target="_blank" rel="noopener" class="ax-btn ax-btn-sm ax-gs-280">💰 Recharger</a>` : ''}
        </div>
      </div>
    </article>
  `;
}

async function refresh(rootEl: HTMLElement): Promise<void> {
  rootEl.innerHTML = `
    <div class="ax-gs-57">
      <p>🔍 Audit credentials en cours…</p>
    </div>
  `;
  try {
    const audit = await autoRestoreCredentials.auditMissing();
    currentAudit = audit;
    const stats = await autoRestoreCredentials.getStats();

    const recoverableHtml = audit.recoverable.length > 0
      ? audit.recoverable.map(renderRecoverableRow).join('')
      : `<p class="ax-gs-191">✅ Aucune clé restorable (toutes les clés présentes ou réellement absentes)</p>`;

    const absentHtml = audit.truly_absent.length > 0
      ? audit.truly_absent.map(renderAbsentRow).join('')
      : `<p class="ax-gs-191">🎉 Aucune clé absente — tu as tout configuré</p>`;

    const presentPct = stats.total_patterns > 0
      ? Math.round((stats.present_count / stats.total_patterns) * 100)
      : 0;

    rootEl.innerHTML = `
      <div class="ax-gs-95">
        <header class="ax-gs-180">
          <h1 class="ax-gs-281">🔐 Credentials Status</h1>
          <p class="ax-gs-282">
            Apex restaure automatiquement les clés depuis IDB / Firebase / alias avant de te demander.
          </p>
        </header>

        <div class="ax-gs-96">
          <div style="background:rgba(34,204,119,0.1);border:1px solid rgba(34,204,119,0.3);border-radius:10px;padding:14px">
            <div style="font-size:24px;color:#22cc77;font-weight:600">${stats.present_count}/${stats.total_patterns}</div>
            <div class="ax-gs-5">Présentes localement (${presentPct}%)</div>
          </div>
          <div class="ax-gs-97">
            <div class="ax-gs-98">${stats.recoverable_count}</div>
            <div class="ax-gs-5">Restorables auto</div>
          </div>
          <div class="ax-gs-99">
            <div class="ax-gs-58">${stats.truly_absent_count}</div>
            <div class="ax-gs-5">À coller manuellement</div>
          </div>
        </div>

        <div class="ax-gs-100">
          <button id="ax-cs-refresh" class="ax-btn ax-gs-283">🔄 Re-scanner</button>
          <button id="ax-cs-restore-all" class="ax-btn" style="padding:8px 14px;font-size:13px;background:rgba(34,204,119,0.15);color:#22cc77;border:1px solid rgba(34,204,119,0.4);font-weight:600"${audit.recoverable.length === 0 ? ' disabled' : ''}>
            🔓 Restaurer toutes (${audit.recoverable.length})
          </button>
        </div>

        <section class="ax-gs-180">
          <h2 style="font-size:16px;color:#22cc77;margin:0 0 10px">🔓 Restorables (${audit.recoverable.length})</h2>
          <p class="ax-gs-284">
            Clés trouvables ailleurs (alias localStorage, IDB shadow, Firebase backup, pattern detection). Apex peut les restaurer SANS te demander.
          </p>
          <div id="ax-cs-recoverable">${recoverableHtml}</div>
        </section>

        <section>
          <h2 class="ax-gs-285">⚠️ Truly absent (${audit.truly_absent.length})</h2>
          <p class="ax-gs-284">
            Aucune trace dans aucune source. Tu dois recoller la clé une fois — ouvre le dashboard et copie ta clé.
          </p>
          <div id="ax-cs-absent">${absentHtml}</div>
        </section>

        <p class="ax-gs-265">
          🔒 Audit ${new Date(audit.ts).toLocaleString('fr-FR')} · Sentinelle auto-restore-watch tourne toutes les 30 min
        </p>
      </div>
    `;

    attachHandlers(rootEl);
  } catch (err: unknown) {
    logger.error('credentials-status', 'refresh failed', { err });
    rootEl.innerHTML = `
      <div class="ax-gs-101">
        <p>❌ Audit échoué : ${escapeHtml(String(err).slice(0, 200))}</p>
      </div>
    `;
  }
}

function attachHandlers(rootEl: HTMLElement): void {
  if (!activeScope) return;
  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-cs-refresh');
  const restoreAllBtn = rootEl.querySelector<HTMLButtonElement>('#ax-cs-restore-all');

  if (refreshBtn) {
    activeScope.bind(refreshBtn, 'click', () => {
      void refresh(rootEl);
    });
  }

  if (restoreAllBtn) {
    activeScope.bind(restoreAllBtn, 'click', () => {
      void (async () => {
        if (!currentAudit || currentAudit.recoverable.length === 0) {
          toast.show('Aucune clé restorable', 'warn');
          return;
        }
        restoreAllBtn.disabled = true;
        restoreAllBtn.textContent = '⏳ Restauration en cours…';
        try {
          const r = await autoRestoreCredentials.restoreAutomatically();
          haptic.success();
          if (r.restored > 0) {
            toast.show(`✅ ${r.restored} clé(s) restaurée(s) (échec: ${r.failed})`, 'success');
          } else {
            toast.show(`Aucune clé n'a pu être restaurée (échec: ${r.failed})`, 'warn');
          }
          /* Re-render avec nouveau audit */
          await refresh(rootEl);
        } catch (err: unknown) {
          logger.error('credentials-status', 'restoreAll failed', { err });
          toast.show(`Erreur restore : ${String(err).slice(0, 100)}`, 'error');
          restoreAllBtn.disabled = false;
        }
      })();
    });
  }
}

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

  /* Cleanup scope précédent */
  activeScope?.cleanup();
  activeScope = createCleanupScope('credentials-status');

  await refresh(rootEl);
}
