/**
 * APEX v13 — Vue admin "Backups Auto 24/7"
 *
 * Règle absolue Kevin 2026-05-04 : "Sauvegarde auto aussi en place ?
 * Partout ? Toujours ? Ne jamais rien perdre !"
 *
 * UI :
 *  - Stats header : count, taille totale, dernière backup, intégrité
 *  - Boutons : "💾 Snapshot maintenant" / "📤 Exporter Coffre" / "📥 Importer Coffre"
 *  - Liste 30 derniers backups : date, type, taille, hash, actions
 *    Actions par ligne : 🔍 Voir contenu / ↩ Restaurer / 🗑 Supprimer
 *  - Indicateur quota localStorage (warning si > 4MB)
 *  - Confirm modal pour restore destructif
 *
 * UI HTML statique testée E2E (Playwright) — la logique est dans services/auto-backup.ts.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { autoBackup, type Backup, type BackupStats } from '../../services/storage/auto-backup.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeBackupScope: CleanupScope | null = null;

export function dispose(): void {
  activeBackupScope?.cleanup();
  activeBackupScope = null;
}

/* ============================================================
   Helpers
   ============================================================ */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TYPE_LABELS: Record<string, string> = {
  manual: '💾 Manuel',
  daily: '📅 Quotidien',
  weekly: '🌐 Hebdo',
  'pre-rollback': '↩ Pre-rollback',
};

function renderTypeBadge(type: string): string {
  const label = TYPE_LABELS[type] ?? type;
  return `<span style="padding:2px 6px;border-radius:4px;background:rgba(201,162,39,0.15);color:#c9a227;font-size:11px;font-weight:600">${escapeHtml(label)}</span>`;
}

/** Reset module state — utile pour tests d'isolation */
export function _resetState(): void {
  /* No internal state to reset (UI is stateless apart from DOM) */
}

/* ============================================================
   Render
   ============================================================ */

function renderStats(stats: BackupStats): string {
  const lastAge =
    stats.last_backup_age_h < 0
      ? 'Jamais'
      : stats.last_backup_age_h === 0
        ? "< 1h"
        : `${stats.last_backup_age_h}h`;
  const lastAgeColor =
    stats.last_backup_age_h < 0 || stats.last_backup_age_h > 48
      ? '#ff6666'
      : stats.last_backup_age_h > 26
        ? '#ffa500'
        : '#22c55e';
  const integrityColor = stats.integrity_ok ? '#22c55e' : '#ff6666';
  const integrityLabel = stats.integrity_ok ? '✓ OK' : '⚠ Cassée';
  const quotaWarning = autoBackup.isQuotaCritical()
    ? '<span style="margin-left:10px;padding:3px 8px;background:rgba(255,165,0,0.15);color:#ffa500;border-radius:4px;font-size:11px">⚠ Quota localStorage > 4 MB</span>'
    : '';

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;padding:14px;background:rgba(20,20,35,0.5);border:1px solid rgba(201,162,39,0.2);border-radius:12px;margin-bottom:14px">
      <div>
        <div class="ax-gs-41">Backups</div>
        <div style="color:#c9a227;font-size:24px;font-weight:700">${stats.total_backups}</div>
      </div>
      <div>
        <div class="ax-gs-41">Taille totale</div>
        <div style="color:#fff;font-size:18px;font-weight:600">${formatBytes(stats.total_size_bytes)}</div>
      </div>
      <div>
        <div class="ax-gs-41">Dernière backup</div>
        <div style="color:${lastAgeColor};font-size:18px;font-weight:600">${lastAge}</div>
      </div>
      <div>
        <div class="ax-gs-41">Intégrité</div>
        <div style="color:${integrityColor};font-size:18px;font-weight:600">${integrityLabel}</div>
      </div>
    </div>
    ${quotaWarning ? '<div style="padding:8px 14px;background:rgba(255,165,0,0.1);border:1px solid rgba(255,165,0,0.3);border-radius:8px;margin-bottom:10px">' + quotaWarning + '</div>' : ''}
  `;
}

function renderHeader(): string {
  return `
    <header class="ax-gs-313">
      <h1 class="ax-gs-314">💾 Backups Auto 24/7</h1>
      <button class="ax-btn" data-action="snapshot-now"
        style="padding:8px 14px;background:#c9a227;color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;min-height:40px">
        💾 Snapshot maintenant
      </button>
      <button class="ax-btn ax-gs-315" data-action="export-config"
       >
        📤 Exporter Coffre
      </button>
      <button class="ax-btn ax-gs-315" data-action="import-config"
       >
        📥 Importer Coffre
      </button>
      <button class="ax-btn" data-action="cleanup-now"
        style="padding:8px 14px;background:transparent;border:1px solid rgba(255,100,100,0.3);color:#ff6666;border-radius:6px;cursor:pointer;font-size:12px;min-height:40px">
        🧹 Cleanup
      </button>
    </header>
  `;
}

function renderBackupRow(b: Backup): string {
  const safeId = escapeHtml(b.id);
  const safeType = escapeHtml(b.type);
  const date = formatDate(b.ts);
  const size = formatBytes(b.size_bytes);
  const hashShort = b.hash.slice(0, 12);
  return `
    <tr data-backup-id="${safeId}" style="border-bottom:1px solid rgba(201,162,39,0.1)">
      <td style="padding:10px;color:#fff;font-size:13px">${escapeHtml(date)}</td>
      <td class="ax-gs-316">${renderTypeBadge(safeType)}</td>
      <td style="padding:10px;color:#999;font-size:12px">${escapeHtml(size)}</td>
      <td style="padding:10px;color:#666;font-size:11px;font-family:monospace">${escapeHtml(hashShort)}…</td>
      <td class="ax-gs-317">
        <button data-view="${safeId}"
          style="padding:6px 10px;background:transparent;border:1px solid rgba(201,162,39,0.3);color:#c9a227;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px"
          title="Voir contenu">🔍</button>
        <button data-restore="${safeId}"
          style="padding:6px 10px;background:rgba(201,162,39,0.15);border:1px solid #c9a227;color:#c9a227;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px"
          title="Restaurer">↩</button>
        <button data-delete="${safeId}"
          style="padding:6px 10px;background:transparent;border:1px solid rgba(255,100,100,0.3);color:#ff6666;border-radius:4px;cursor:pointer;font-size:11px"
          title="Supprimer">🗑</button>
      </td>
    </tr>
  `;
}

function renderBackupList(backups: readonly Backup[]): string {
  if (backups.length === 0) {
    return `
      <div style="padding:40px;text-align:center;color:#888;background:rgba(20,20,35,0.5);border:1px solid rgba(201,162,39,0.2);border-radius:12px">
        <p style="margin:0 0 14px;font-size:14px">Aucun backup pour l'instant.</p>
        <p style="margin:0;font-size:12px;color:#666">Clique sur "💾 Snapshot maintenant" pour créer ton premier backup,<br>ou attends 3h UTC pour le snapshot quotidien automatique.</p>
      </div>
    `;
  }
  return `
    <div style="background:rgba(20,20,35,0.5);border:1px solid rgba(201,162,39,0.2);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:rgba(201,162,39,0.08);border-bottom:1px solid rgba(201,162,39,0.3)">
            <th class="ax-gs-318">Date</th>
            <th class="ax-gs-318">Type</th>
            <th class="ax-gs-318">Taille</th>
            <th class="ax-gs-318">Hash</th>
            <th style="padding:10px;text-align:right;color:#c9a227;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Actions</th>
          </tr>
        </thead>
        <tbody>${backups.map(renderBackupRow).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderViewModal(backup: Backup): string {
  const dataKeys = Object.keys(backup.data.vault).length
    + Object.keys(backup.data.settings).length
    + (backup.data.audit_log as unknown[]).length
    + (backup.data.persistent_memory as unknown[]).length;
  const summary = {
    id: backup.id,
    type: backup.type,
    ts: formatDate(backup.ts),
    size: formatBytes(backup.size_bytes),
    hash: backup.hash,
    encrypted: backup.encrypted,
    vault_keys: Object.keys(backup.data.vault).length,
    settings_keys: Object.keys(backup.data.settings).length,
    audit_log_count: (backup.data.audit_log as unknown[]).length,
    persistent_memory_count: (backup.data.persistent_memory as unknown[]).length,
    feature_toggles_count: Object.keys(backup.data.feature_toggles).length,
    user_profile_count: Object.keys(backup.data.user_profile).length,
    voice_prints_count: Object.keys(backup.data.voice_prints).length,
    total_keys_in_data: dataKeys,
  };
  const summaryJson = JSON.stringify(summary, null, 2);
  return `
    <div id="ax-backup-modal" role="dialog" aria-modal="true"
      style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px">
      <div style="max-width:600px;width:100%;background:#0a0a14;border:1px solid rgba(201,162,39,0.4);border-radius:14px;overflow:hidden">
        <header class="ax-gs-206">
          <h3 class="ax-gs-319">🔍 ${escapeHtml(backup.id)}</h3>
          <button data-action="modal-close"
            class="ax-gs-320">✕</button>
        </header>
        <div style="max-height:60vh;overflow-y:auto;padding:14px">
          <pre style="margin:0;color:#a0a4c0;font-size:12px;white-space:pre-wrap;font-family:monospace">${escapeHtml(summaryJson)}</pre>
          <p style="margin-top:14px;color:#666;font-size:11px">Le contenu chiffré n'est jamais affiché en clair pour ta sécurité.</p>
        </div>
        <footer class="ax-gs-321">
          Hash SHA-256 : ${escapeHtml(backup.hash)}
        </footer>
      </div>
    </div>
  `;
}

function renderImportModal(): string {
  return `
    <div id="ax-backup-modal" role="dialog" aria-modal="true"
      style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px">
      <div style="max-width:520px;width:100%;background:#0a0a14;border:1px solid rgba(201,162,39,0.4);border-radius:14px;overflow:hidden">
        <header class="ax-gs-206">
          <h3 class="ax-gs-319">📥 Importer un Coffre</h3>
          <button data-action="modal-close"
            class="ax-gs-320">✕</button>
        </header>
        <div style="padding:14px">
          <p style="color:#a0a4c0;font-size:13px;margin-top:0">Colle le contenu du fichier coffre exporté précédemment :</p>
          <textarea id="ax-backup-import-data" rows="8" placeholder="Coffre encodé base64..."
            style="width:100%;padding:10px;background:rgba(20,20,35,0.8);border:1px solid rgba(201,162,39,0.3);color:#fff;border-radius:6px;font-family:monospace;font-size:11px;resize:vertical"></textarea>
          <p style="color:#888;font-size:11px;margin-top:10px">⚠ L'import écrase l'état actuel. Un backup pre-rollback automatique est créé avant.</p>
        </div>
        <footer style="padding:10px 14px;background:rgba(201,162,39,0.05);display:flex;justify-content:flex-end;gap:8px">
          <button data-action="modal-close"
            style="padding:8px 14px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#999;border-radius:6px;cursor:pointer;font-size:12px">Annuler</button>
          <button data-action="import-confirm"
            style="padding:8px 14px;background:#c9a227;border:none;color:#000;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px">Importer</button>
        </footer>
      </div>
    </div>
  `;
}

/* ============================================================
   Public render
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeBackupScope?.cleanup();
  activeBackupScope = createCleanupScope('admin-backup');
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
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('sentinel.backup-watch', rootEl, uid)) return;

  /* Init service (idempotent) */
  void autoBackup.init();

  const stats = autoBackup.getStats();
  const backups = autoBackup.list();

  rootEl.innerHTML = `
    <div class="ax-admin-backup ax-gs-322">
      ${renderHeader()}
      <main style="padding:14px;max-width:1000px;margin:0 auto">
        ${renderStats(stats)}
        ${renderBackupList(backups)}
        <p style="margin-top:14px;color:#666;font-size:11px;text-align:center">
          Backups stockés en triple : localStorage + IndexedDB + Firebase chiffré (weekly).<br>
          Cycle : quotidien 3h UTC + hebdo dimanche 4h UTC + manuel admin · Rolling FIFO 30 jours.
        </p>
      </main>
    </div>
  `;
  attachHandlers(rootEl);
}

/* ============================================================
   Event handlers
   ============================================================ */

function attachHandlers(rootEl: HTMLElement): void {
  /* Snapshot now */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="snapshot-now"]').forEach((btn) => {
    activeBackupScope!.bind(btn, 'click', () => {
      void (async (): Promise<void> => {
        haptic.tap();
        try {
          const backup = await autoBackup.snapshot('manual');
          toast.success(`Backup ${backup.id} créé (${(backup.size_bytes / 1024).toFixed(1)} KB)`);
          render(rootEl);
        } catch (err: unknown) {
          logger.warn('admin-backup', 'snapshot failed', { err });
          toast.error('Erreur backup : ' + (err instanceof Error ? err.message : 'fail'));
        }
      })();
    });
  });

  /* Export */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="export-config"]').forEach((btn) => {
    activeBackupScope!.bind(btn, 'click', () => {
      void (async (): Promise<void> => {
        haptic.tap();
        try {
          const b64 = await autoBackup.export();
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(b64);
            toast.success('Coffre copié dans le presse-papier');
          } else {
            logger.info('admin-backup', 'export config (no clipboard)', { length: b64.length });
            toast.info('Coffre exporté (voir console)');
          }
        } catch (err: unknown) {
          toast.error('Erreur export : ' + (err instanceof Error ? err.message : 'fail'));
        }
      })();
    });
  });

  /* Import */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="import-config"]').forEach((btn) => {
    activeBackupScope!.bind(btn, 'click', () => {
      haptic.tap();
      openImportModal(rootEl);
    });
  });

  /* Cleanup now */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="cleanup-now"]').forEach((btn) => {
    activeBackupScope!.bind(btn, 'click', () => {
      void (async (): Promise<void> => {
        haptic.tap();
        try {
          const r = await autoBackup.cleanup();
          if (r.deleted > 0) {
            toast.info(`${r.deleted} anciens backups supprimés`);
          } else {
            toast.info('Rien à nettoyer');
          }
          render(rootEl);
        } catch (err: unknown) {
          toast.error('Erreur cleanup : ' + (err instanceof Error ? err.message : 'fail'));
        }
      })();
    });
  });

  /* View row actions */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    activeBackupScope!.bind(btn, 'click', () => {
      const id = btn.dataset['view'];
      if (!id) return;
      haptic.tap();
      const b = autoBackup.get(id);
      if (!b) {
        toast.error('Backup introuvable');
        return;
      }
      openViewModal(rootEl, b);
    });
  });

  /* Restore */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((btn) => {
    activeBackupScope!.bind(btn, 'click', () => {
      const id = btn.dataset['restore'];
      if (!id) return;
      const ok = confirm(`Restaurer le backup ${id} ? Cette action écrase l'état actuel.\n\nUn backup pre-rollback automatique sera créé avant.`);
      if (!ok) return;
      void (async (): Promise<void> => {
        haptic.warning();
        try {
          const r = await autoBackup.restore(id);
          if (r.ok) {
            toast.success(`Restauration OK — ${r.restored.length} clés restaurées`);
          } else {
            toast.warn(`Restauration partielle — ${r.restored.length} OK, ${r.errors?.length ?? 0} erreurs`);
          }
          render(rootEl);
        } catch (err: unknown) {
          toast.error('Erreur restore : ' + (err instanceof Error ? err.message : 'fail'));
        }
      })();
    });
  });

  /* Delete */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((btn) => {
    activeBackupScope!.bind(btn, 'click', () => {
      const id = btn.dataset['delete'];
      if (!id) return;
      const ok = confirm(`Supprimer définitivement le backup ${id} ?`);
      if (!ok) return;
      haptic.warning();
      const r = autoBackup.delete(id);
      if (r) {
        toast.info('Backup supprimé');
        render(rootEl);
      } else {
        toast.error('Erreur suppression');
      }
    });
  });
}

/* ============================================================
   Modal handlers
   ============================================================ */

function openViewModal(_rootEl: HTMLElement, backup: Backup): void {
  closeModal();
  const div = document.createElement('div');
  div.innerHTML = renderViewModal(backup);
  const modal = div.firstElementChild as HTMLElement | null;
  if (!modal) return;
  document.body.appendChild(modal);
  activeBackupScope!.bind(modal, 'click', (e) => {
    const target = e.target as HTMLElement;
    if (target === modal) {
      closeModal();
      return;
    }
    const closeBtn = target.closest<HTMLElement>('[data-action="modal-close"]');
    if (closeBtn) {
      closeModal();
    }
  });
}

function openImportModal(rootEl: HTMLElement): void {
  closeModal();
  const div = document.createElement('div');
  div.innerHTML = renderImportModal();
  const modal = div.firstElementChild as HTMLElement | null;
  if (!modal) return;
  document.body.appendChild(modal);
  activeBackupScope!.bind(modal, 'click', (e) => {
    const target = e.target as HTMLElement;
    if (target === modal) {
      closeModal();
      return;
    }
    const closeBtn = target.closest<HTMLElement>('[data-action="modal-close"]');
    if (closeBtn) {
      closeModal();
      return;
    }
    const confirmBtn = target.closest<HTMLElement>('[data-action="import-confirm"]');
    if (confirmBtn) {
      const ta = modal.querySelector<HTMLTextAreaElement>('#ax-backup-import-data');
      const data = ta?.value.trim() ?? '';
      if (!data) {
        toast.warn('Coffre vide');
        return;
      }
      void (async (): Promise<void> => {
        haptic.warning();
        try {
          const r = await autoBackup.import(data);
          if (r.ok) {
            toast.success(`Import OK — ${r.restored.length} clés restaurées`);
          } else {
            toast.warn(`Import partiel — ${r.errors?.[0] ?? 'fail'}`);
          }
          closeModal();
          render(rootEl);
        } catch (err: unknown) {
          toast.error('Erreur import : ' + (err instanceof Error ? err.message : 'fail'));
        }
      })();
    }
  });
}

function closeModal(): void {
  const existing = document.getElementById('ax-backup-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}
