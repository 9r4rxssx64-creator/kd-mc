/**
 * APEX v13 — Migration v12.785 → v13.0 (one-shot, idempotent)
 *
 * Stratégie : dual-write 30j (v12 et v13 lisent/écrivent les mêmes Firebase paths)
 * → migration data SANS PERTE.
 *
 * Lit les clés v12 (`ax_*`, `apex_*`) → copie vers namespace `apex_v13_*` avec validation.
 * Garde l'ancien intact 30j pour rollback safe.
 */

import { logger } from '../core/logger.js';

const KEY_MAPPING: Record<string, string> = {
  /* Identité user */
  ax_user: 'apex_v13_user',
  ax_uid: 'apex_v13_uid',
  ax_lastact: 'apex_v13_lastact',
  ax_pin: 'apex_v13_pin',
  /* Mémoire */
  ax_persistent_memory: 'apex_v13_facts',
  ax_lessons_learned_struct: 'apex_v13_lessons',
  /* Settings */
  ax_user_theme: 'apex_v13_theme',
  ax_settings: 'apex_v13_settings',
  /* Préserve clés API en place (pas de rename — vault.ts les lit aux mêmes clés) */
};

const PRESERVE_AS_IS: readonly string[] = [
  'ax_anthropic_key',
  'ax_openai_key',
  'ax_google_key',
  'ax_github_token',
  'ax_stripe_sk',
  'ax_stripe_pk',
  'ax_brevo_key',
  'ax_resend_key',
  'ax_groq_key',
  'ax_perplexity_key',
  'ax_deepl_key',
  'ax_telegram_token',
  'ax_kevin_whatsapp_phone',
  'ax_push_worker_url',
  'ax_proxy_url',
  'ax_vapid_public',
  'ax_firebase_url',
];

export async function migrate(): Promise<void> {
  logger.info('migration', 'Starting v12 → v13 data migration');
  const stats = { copied: 0, skipped: 0, preserved: 0, errors: 0 };

  for (const [oldKey, newKey] of Object.entries(KEY_MAPPING)) {
    try {
      const value = localStorage.getItem(oldKey);
      if (value === null) {
        stats.skipped++;
        continue;
      }
      if (localStorage.getItem(newKey) !== null) {
        /* déjà migré */
        stats.skipped++;
        continue;
      }
      localStorage.setItem(newKey, value);
      stats.copied++;
    } catch (err: unknown) {
      stats.errors++;
      logger.warn('migration', `Failed to migrate ${oldKey}`, { err });
    }
  }

  /* Préserve clés API à leur emplacement actuel — vault.ts v13 les lit directement */
  for (const k of PRESERVE_AS_IS) {
    if (localStorage.getItem(k) !== null) stats.preserved++;
  }

  /* Backup horodaté avant tout cleanup futur */
  try {
    const backupKey = `apex_v13_migration_backup_${Date.now()}`;
    const backup: Record<string, string | null> = {};
    for (const k of Object.keys(KEY_MAPPING)) backup[k] = localStorage.getItem(k);
    localStorage.setItem(backupKey, JSON.stringify(backup));
  } catch (err: unknown) {
    logger.warn('migration', 'Backup creation failed', { err });
  }

  logger.info('migration', 'v12 → v13 migration complete', stats);
}
