/**
 * APEX v13 — Vue admin "RGPD Admin".
 *
 * Audit cascade v13.3.82 (Kevin 2026-05-08) — finalisation 200/200.
 *
 * Mission : exposer dans l'UI la logique core `rgpd.liftRestriction()` (existante
 * dans services/rgpd.ts depuis v13.3.81 mais sans surface UI). L'admin Kevin peut
 * désormais voir tous les users avec restrictions actives + lever en 1-clic.
 *
 * UI :
 *  - Header : nombre total de restrictions actives
 *  - Tableau : User UID | Scopes restreints | Date depuis | Bouton "Lever"
 *  - Click "Lever" → confirmation → rgpd.liftRestriction(uid) + audit log + toast + re-render
 *  - Refresh manuel
 *
 * Sécurité : admin-only (gate via store.get('isAdmin')).
 *
 * Pattern repris de features/admin/credentials-status/index.ts (cohérence).
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { rgpd } from '../../../services/auth/rgpd.js';
import { auditLog } from '../../../services/observability/audit-log.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}


function formatDate(ts: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function renderRestrictedRow(entry: { uid: string; scopes: string[]; ts: number }): string {
  const scopesLabel = entry.scopes.includes('*')
    ? '<span style="color:#ff6b6b;font-weight:600">Globale (tous scopes)</span>'
    : entry.scopes.map((s) => `<code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;font-size:11px;margin-right:4px">${escapeHtml(s)}</code>`).join('');

  return `
    <article style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,107,107,0.25);border-radius:10px;padding:14px;margin-bottom:8px">
      <div class="ax-gs-112">
        <div class="ax-gs-11">
          <strong style="color:#ff6b6b;font-size:14px">${escapeHtml(entry.uid)}</strong>
          <div style="margin-top:6px;font-size:12px;color:var(--ax-text-dim)">
            Scopes : ${scopesLabel}
          </div>
          <div style="margin-top:4px;font-size:11px;color:#888">
            Depuis : ${escapeHtml(formatDate(entry.ts))}
          </div>
        </div>
        <button
          class="ax-btn ax-rgpd-lift-btn"
          data-uid="${escapeHtml(entry.uid)}"
          aria-label="Lever la restriction RGPD pour ${escapeHtml(entry.uid)}"
          style="padding:8px 14px;font-size:13px;background:rgba(34,204,119,0.15);color:#22cc77;border:1px solid rgba(34,204,119,0.4);border-radius:8px;cursor:pointer;font-weight:600;min-height:40px"
        >
          🔓 Lever
        </button>
      </div>
    </article>
  `;
}

async function refresh(rootEl: HTMLElement): Promise<void> {
  rootEl.innerHTML = `
    <div class="ax-gs-57">
      <p>🔍 Chargement restrictions RGPD…</p>
    </div>
  `;

  try {
    const restricted = rgpd.listRestrictedUsers();
    const tableHtml = restricted.length > 0
      ? restricted.map(renderRestrictedRow).join('')
      : `<p style="color:var(--ax-text-dim);text-align:center;padding:40px">✅ Aucune restriction RGPD active.<br><span class="ax-gs-24">Tous les users peuvent traiter leurs données librement.</span></p>`;

    rootEl.innerHTML = `
      <div class="ax-gs-95">
        <header class="ax-gs-180">
          <h1 class="ax-gs-281">🛡 RGPD — Restrictions actives</h1>
          <p class="ax-gs-282">
            Art. 18 RGPD — droit de limitation du traitement.
            Les users en restriction ne peuvent plus que lire leurs données (pas de modif/AI/sync).
          </p>
        </header>

        <div class="ax-gs-96">
          <div class="ax-gs-99">
            <div class="ax-gs-58">${restricted.length}</div>
            <div class="ax-gs-5">Restrictions actives</div>
          </div>
          <div style="background:rgba(255,107,107,0.05);border:1px solid rgba(255,107,107,0.15);border-radius:10px;padding:14px">
            <div class="ax-gs-58">${restricted.filter((r) => r.scopes.includes('*')).length}</div>
            <div class="ax-gs-5">Globales (tous scopes)</div>
          </div>
          <div class="ax-gs-97">
            <div class="ax-gs-98">${restricted.filter((r) => !r.scopes.includes('*')).length}</div>
            <div class="ax-gs-5">Granulaires</div>
          </div>
        </div>

        <div class="ax-gs-100">
          <button id="ax-rgpd-refresh" class="ax-btn ax-gs-283" aria-label="Rafraîchir la liste des restrictions">🔄 Rafraîchir</button>
        </div>

        <section>
          <h2 class="ax-gs-285">⛔ Users restreints (${restricted.length})</h2>
          <div id="ax-rgpd-list">${tableHtml}</div>
        </section>

        <p class="ax-gs-265">
          🔒 Lift restriction = audit log immutable (rgpd.restrict.lifted) + reprise normale du traitement
        </p>
      </div>
    `;

    attachHandlers(rootEl);
  } catch (err: unknown) {
    logger.error('rgpd-admin', 'refresh failed', { err });
    rootEl.innerHTML = `
      <div class="ax-gs-101">
        <p>❌ Chargement échoué : ${escapeHtml(String(err).slice(0, 200))}</p>
      </div>
    `;
  }
}

function attachHandlers(rootEl: HTMLElement): void {
  if (!activeScope) return;

  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-rgpd-refresh');
  if (refreshBtn) {
    activeScope.bind(refreshBtn, 'click', () => {
      haptic.tap();
      void refresh(rootEl);
    });
  }

  const liftBtns = rootEl.querySelectorAll<HTMLButtonElement>('.ax-rgpd-lift-btn');
  liftBtns.forEach((btn) => {
    if (!activeScope) return;
    activeScope.bind(btn, 'click', async () => {
      const uid = btn.dataset['uid'];
      if (!uid) return;
      const confirmed = window.confirm(
        `Lever la restriction RGPD pour ${uid} ?\n\nL'utilisateur retrouvera l'accès complet (modif, AI, sync).`,
      );
      if (!confirmed) return;
      try {
        haptic.medium();
        rgpd.liftRestriction(uid);
        await auditLog.record('rgpd.admin.lift', {
          actor: 'admin',
          details: { target_uid: uid, via: 'vRGPDAdmin' },
        });
        toast.success(`✅ Restriction levée pour ${uid}`);
        await refresh(rootEl);
      } catch (err: unknown) {
        logger.error('rgpd-admin', 'liftRestriction failed', { err, uid });
        toast.error(`❌ Échec : ${String(err).slice(0, 100)}`);
      }
    });
  });
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
  activeScope = createCleanupScope('rgpd-admin');

  await refresh(rootEl);
}
