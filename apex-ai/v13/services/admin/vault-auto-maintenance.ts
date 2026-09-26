/**
 * APEX v13.4.268 — Auto-maintenance vault (Kevin "Automatisé tout dans apex").
 *
 * Au boot, après que Firebase est connecté ET que le vault est initialisé :
 *  1. MIGRATION legacy → coffre central (si > 3 clés flat orphelines)
 *  2. REPAIR services mal nommés (si détecte cloudflare_global etc.)
 *  3. PUSH Firebase backup (si local > 0 ET backup_count < local_count)
 *
 * Tout silencieux. Toast info uniquement si une action a effectivement modifié
 * l'état. Throttle 1× / boot pour éviter spam.
 *
 * Remplace les 3 boutons manuels du Coffre (Migrer / Réparer / Push backup) —
 * Kevin "fais le tri dans les boutons inutiles".
 */

import { logger } from '../../core/logger.js';

const LAST_RUN_KEY = 'apex_v13_vault_auto_maintenance_last_run';
const THROTTLE_MS = 60 * 60 * 1000; /* 1× / heure max */

async function shouldRunNow(): Promise<boolean> {
  try {
    const last = parseInt(localStorage.getItem(LAST_RUN_KEY) ?? '0', 10);
    if (last > 0 && Date.now() - last < THROTTLE_MS) {
      logger.debug('vault-auto-maint', 'skipped (throttled)');
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function markRun(): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
  } catch {
    /* quota */
  }
}

export async function runVaultAutoMaintenance(): Promise<{
  migration?: { scanned: number; migrated: number };
  repair?: { renamed: number; deleted_duplicate: number };
  backup?: { pushed: number; failed: number; skipped: number };
  ran: boolean;
}> {
  if (!(await shouldRunNow())) {
    return { ran: false };
  }
  const out: {
    migration?: { scanned: number; migrated: number };
    repair?: { renamed: number; deleted_duplicate: number };
    backup?: { pushed: number; failed: number; skipped: number };
    ran: boolean;
  } = { ran: true };

  try {
    const { multiKeyVault } = await import('../vault/multi-key-vault.js');
    /* 1. MIGRATION — autonome, sans confirmation. */
    try {
      const r = await multiKeyVault.migrateLegacyFlatKeys();
      if (r.migrated > 0) {
        out.migration = { scanned: r.scanned, migrated: r.migrated };
        logger.info(
          'vault-auto-maint',
          `🔁 auto-migration : ${r.migrated} clés legacy → coffre central`,
        );
      }
    } catch (err: unknown) {
      logger.warn('vault-auto-maint', 'migration failed', { err });
    }

    /* 2. REPAIR services mal nommés — pareil. */
    try {
      const r = await multiKeyVault.repairMisnamedServices();
      if (r.renamed > 0 || r.deleted_duplicate > 0) {
        out.repair = { renamed: r.renamed, deleted_duplicate: r.deleted_duplicate };
        logger.info(
          'vault-auto-maint',
          `♻️ auto-repair : ${r.renamed} renommés, ${r.deleted_duplicate} dups marqués invalid`,
        );
      }
    } catch (err: unknown) {
      logger.warn('vault-auto-maint', 'repair failed', { err });
    }

    /* 3. BACKUP Firebase — seulement si Firebase connecté. */
    try {
      const { firebase } = await import('../storage/firebase.js');
      if (firebase.isConnected()) {
        const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
        const r = await vaultFirebaseBackup.pushAllLocal();
        if (r.pushed > 0) {
          out.backup = { pushed: r.pushed, failed: r.failed, skipped: r.skipped };
          logger.info(
            'vault-auto-maint',
            `📤 auto-backup : ${r.pushed} clés poussées vers Firebase`,
          );
        }
      }
    } catch (err: unknown) {
      logger.warn('vault-auto-maint', 'backup failed', { err });
    }

    /* 4. HEALTH-CHECK des clés (v13.4.275 — Kevin "Cloudflare NON TESTÉ,
     * Railway NON TESTÉ, Finnhub PANNE"). Refresh status pour les entries
     * jamais testées OU dont le dernier test date de > 5min (skip auto interne).
     * Background, non-bloquant. Permet aux ajouts récents (Railway v274,
     * Finnhub v274 auth alignée) de remonter un statut réel au lieu de "unknown". */
    try {
      const { multiKeyVault } = await import('../vault/multi-key-vault.js');
      void multiKeyVault.healthCheckAll().then((r) => {
        if (r.tested > 0) {
          logger.info(
            'vault-auto-maint',
            `🩺 health-check : ${r.tested} testées · ${r.recovered} recovered · ${r.stillDown} stillDown`,
          );
        }
      }).catch((err: unknown) => {
        logger.debug('vault-auto-maint', 'healthCheckAll skipped (background)', { err });
      });
    } catch (err: unknown) {
      logger.debug('vault-auto-maint', 'health-check import failed', { err });
    }
  } catch (err: unknown) {
    logger.warn('vault-auto-maint', 'orchestration failed', { err });
  }

  markRun();

  /* Toast info SEULEMENT si une action a effectivement changé l'état */
  const hasChange =
    (out.migration?.migrated ?? 0) > 0 ||
    (out.repair?.renamed ?? 0) > 0 ||
    (out.repair?.deleted_duplicate ?? 0) > 0 ||
    (out.backup?.pushed ?? 0) > 0;
  if (hasChange) {
    try {
      const { toast } = await import('../../ui/toast.js');
      const parts: string[] = [];
      if (out.migration?.migrated) parts.push(`🔁 ${out.migration.migrated} migrées`);
      if (out.repair?.renamed) parts.push(`♻️ ${out.repair.renamed} renommées`);
      if (out.backup?.pushed) parts.push(`📤 ${out.backup.pushed} backupées`);
      toast.info(`Coffre auto-maintenu : ${parts.join(' · ')}`);
    } catch {
      /* toast indispo */
    }
  }

  return out;
}

export const vaultAutoMaintenance = {
  run: runVaultAutoMaintenance,
};
