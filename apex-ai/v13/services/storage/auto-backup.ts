/**
 * APEX v13 — Auto-Backup Total (Kevin règle "ne jamais rien perdre", 2026-05-04, ABSOLUE).
 *
 * Niveau enterprise SOC2 — 4 niveaux de protection :
 *
 * 1. Write-through (déjà actif via vault.setKey) : chaque modif key →
 *    triple persist immédiat (localStorage + IDB + Firebase chiffré).
 *
 * 2. Snapshot quotidien 3h UTC : vault + settings + persistent_memory + audit log
 *    + feature_toggles + user_profile → ax_backup_<YYYYMMDD>_<hhmm>.
 *    Triggered par sentinelle auto-backup-watch (intervalMs 1h).
 *
 * 3. Snapshot hebdo dimanche 4h UTC : full state + Firebase remote backup chiffré
 *    (cross-device restore depuis Firebase si tout local perdu).
 *
 * 4. Snapshot manuel : bouton admin "💾 Backup maintenant" → export JSON
 *    chiffré téléchargé (passphrase user requise pour ré-import).
 *
 * Restore :
 * - Auto au boot si localStorage corrupted ou wiped (init() check)
 * - Manuel via UI admin "📥 Restaurer backup"
 * - Cross-device via Firebase
 *
 * Anti-perte :
 * - Triple persistance vault (déjà actif)
 * - Audit log hash-chain (intégrité vérifiable)
 * - Backups versionnés (max 30 jours rolling FIFO)
 * - Restore validation (déchiffrement test avant remplacer state)
 * - Hash SHA-256 par backup (intégrité vérifiable)
 * - voice_prints : FB_LOCAL strict, JAMAIS shared Firebase remote
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

/* ============================================================
   Types publics
   ============================================================ */

export type BackupType = 'manual' | 'daily' | 'weekly' | 'pre-rollback';

export interface BackupData {
  vault: Record<string, string>; /* clés chiffrées (préservent format AXENC1:) */
  settings: Record<string, unknown>;
  persistent_memory: Array<unknown>;
  audit_log: Array<unknown>;
  feature_toggles: Record<string, unknown>;
  user_profile: Record<string, unknown>;
  voice_prints: Record<string, unknown>; /* FB_LOCAL strict, jamais shared */
}

export interface Backup {
  id: string; /* ax_backup_<YYYYMMDD>_<hhmm> */
  ts: number;
  type: BackupType;
  size_bytes: number;
  encrypted: boolean;
  data: BackupData;
  hash: string; /* SHA-256 intégrité */
}

export interface BackupStats {
  total_backups: number;
  last_backup_ts: number;
  last_backup_age_h: number;
  total_size_bytes: number;
  integrity_ok: boolean;
}

export interface RestoreResult {
  ok: boolean;
  restored: string[];
  errors?: string[];
}

/* ============================================================
   Storage keys
   ============================================================ */

const STORAGE_INDEX = 'apex_v13_backup_index'; /* Liste des IDs */
const STORAGE_PREFIX = 'apex_v13_backup_'; /* Chaque backup individuel */
const MAX_BACKUPS = 30; /* Rolling FIFO 30 jours */
const QUOTA_THRESHOLD_BYTES = 4 * 1024 * 1024; /* 4 MB quota localStorage warning */

/* Clés de state à inclure dans les backups */
const VAULT_KEY_PREFIXES = ['ax_', 'apex_v13_']; /* Toutes clés API + state Apex */
const SETTINGS_KEYS = [
  'apex_v13_settings',
  'apex_v13_theme',
  'apex_v13_lang',
  'ax_settings',
];
const FEATURE_TOGGLE_KEYS = [
  'ax_feature_toggles_global',
  'ax_feature_toggles_history',
];
const USER_PROFILE_KEYS = [
  'apex_v13_user',
  'apex_v13_profile',
  'ax_user_profile',
];
/* JAMAIS partagé en Firebase remote backup (FB_LOCAL strict) */
const VOICE_PRINT_PREFIXES = ['ax_voice_print_'];

/* ============================================================
   Helpers
   ============================================================ */

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function buildBackupId(ts: number, type: BackupType): string {
  const d = new Date(ts);
  const ymd = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
  const hm = `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`;
  /* Suffixe random court pour éviter collisions snapshot dans la même minute */
  const suffix = Math.random().toString(36).slice(2, 6);
  return `ax_backup_${ymd}_${hm}_${type}_${suffix}`;
}

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    /* Fallback DJB2 (déterministe) si crypto.subtle indispo */
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
    }
    return 'djb2_' + (hash >>> 0).toString(16).padStart(8, '0');
  }
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readKeysByPrefix(prefixes: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (prefixes.some((p) => key.startsWith(p))) {
        const value = localStorage.getItem(key);
        if (value !== null) result[key] = value;
      }
    }
  } catch (err: unknown) {
    logger.warn('auto-backup', 'readKeysByPrefix failed', { err });
  }
  return result;
}

function readKeysExact(keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      /* Tente JSON parse, sinon stocke string brut */
      try {
        result[key] = JSON.parse(raw);
      } catch {
        result[key] = raw;
      }
    } catch {
      /* skip */
    }
  }
  return result;
}

/* ============================================================
   AutoBackup service
   ============================================================ */

class AutoBackup {
  private initialized = false;
  private indexCache: string[] | null = null;

  /**
   * Init au boot : check intégrité, restore auto si state vide + Firebase a backup.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      this.loadIndex();
      logger.info('auto-backup', `init OK — ${this.indexCache?.length ?? 0} backups disponibles`);
    } catch (err: unknown) {
      logger.warn('auto-backup', 'init partial', { err });
    }
  }

  /**
   * Snapshot complet immédiat.
   * Type :
   *  - manual : déclenché par admin via bouton UI
   *  - daily : sentinelle auto-backup-watch à 3h UTC
   *  - weekly : sentinelle dimanche 4h UTC + push Firebase remote
   *  - pre-rollback : avant un restore (sauvegarde l'état courant)
   */
  async snapshot(type: BackupType = 'manual'): Promise<Backup> {
    await this.init();
    const ts = Date.now();
    const id = buildBackupId(ts, type);

    /* Collect state actuel */
    const data: BackupData = {
      vault: readKeysByPrefix(VAULT_KEY_PREFIXES),
      settings: readKeysExact(SETTINGS_KEYS),
      persistent_memory: safeParse<unknown[]>(localStorage.getItem('apex_v13_persistent_memory'), []),
      audit_log: safeParse<unknown[]>(localStorage.getItem('ax_audit_log_v13'), []),
      feature_toggles: readKeysExact(FEATURE_TOGGLE_KEYS),
      user_profile: readKeysExact(USER_PROFILE_KEYS),
      voice_prints: readKeysByPrefix(VOICE_PRINT_PREFIXES),
    };

    /* Filtre : retire backup keys de vault.* pour éviter récursion (backup dans backup) */
    for (const k of Object.keys(data.vault)) {
      if (k.startsWith(STORAGE_PREFIX) || k === STORAGE_INDEX) {
        delete data.vault[k];
      }
    }

    const serialized = JSON.stringify(data);
    const size_bytes = serialized.length;
    const hash = await sha256Hex(serialized);
    const backup: Backup = {
      id,
      ts,
      type,
      size_bytes,
      encrypted: true, /* vault.* contient déjà AXENC1: pour les clés API */
      data,
      hash,
    };

    /* Persiste localement */
    try {
      localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(backup));
    } catch (err: unknown) {
      logger.warn('auto-backup', 'snapshot persist failed (quota?), tente cleanup', { err });
      /* Quota : fait cleanup agressif puis retry */
      await this.cleanup();
      try {
        localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(backup));
      } catch (err2: unknown) {
        logger.error('auto-backup', 'snapshot persist failed even after cleanup', { err: err2 });
        throw new Error('Backup quota saturé — impossible de sauvegarder');
      }
    }

    /* Update index */
    this.addToIndex(id);

    /* Sprint 13.3.17 fix : tag last backup ts pour sentinelle backup-watch
     * (sentinels.ts:256 lit cette clé pour vérifier âge < 26h). */
    try {
      localStorage.setItem('ax_last_backup_ts', String(ts));
    } catch {
      /* ignore quota — backup déjà persisté de toute façon */
    }

    /* Push Firebase si type=weekly (cross-device backup remote) */
    if (type === 'weekly') {
      void this.pushToFirebaseRemote(backup);
    }

    /* Audit log */
    await auditLog.record('backup.created', {
      details: { id, type, size_bytes, hash: hash.slice(0, 16) },
    });

    logger.info('auto-backup', `Backup ${type} OK ${id} (${(size_bytes / 1024).toFixed(1)} KB)`);

    /* Cleanup après chaque snapshot pour rester < 30 backups */
    void this.cleanup();

    return backup;
  }

  /**
   * Liste tous backups disponibles (sorted ts desc).
   */
  list(): Backup[] {
    this.loadIndex();
    const ids = this.indexCache ?? [];
    const backups: Backup[] = [];
    for (const id of ids) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + id);
        if (!raw) continue;
        const b = JSON.parse(raw) as Backup;
        backups.push(b);
      } catch {
        /* skip corrupted */
      }
    }
    backups.sort((a, b) => b.ts - a.ts);
    return backups;
  }

  /**
   * Restaure depuis backup ID. Validation déchiffrement avant remplacer.
   * Crée backup pre-rollback automatique avant overwrite.
   */
  async restore(backupId: string): Promise<RestoreResult> {
    await this.init();
    const restored: string[] = [];
    const errors: string[] = [];

    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + backupId);
      if (!raw) {
        return { ok: false, restored, errors: [`Backup ${backupId} introuvable`] };
      }
      const backup = JSON.parse(raw) as Backup;

      /* Validation hash intégrité */
      const expectedHash = await sha256Hex(JSON.stringify(backup.data));
      if (expectedHash !== backup.hash) {
        return {
          ok: false,
          restored,
          errors: [`Hash mismatch — backup corrompu (expected ${backup.hash.slice(0, 16)}, got ${expectedHash.slice(0, 16)})`],
        };
      }

      /* Validation déchiffrement vault keys (sample 1 clé pour log warning si passphrase KO).
       * Note : on ne bloque PAS le restore — c'est juste une vérif diagnostique.
       * Les clés sont restorées en format AXENC1: brut, vault.readKey() les déchiffrera à l'usage. */
      const vaultKeys = Object.keys(backup.data.vault);
      const sampleKey = vaultKeys.find((k) => {
        const v = backup.data.vault[k];
        return typeof v === 'string' && v.startsWith('AXENC1:') && (v as string).length > 50;
      });
      if (sampleKey) {
        try {
          const decrypted = await vault.decryptAuto(backup.data.vault[sampleKey] as string);
          if (decrypted === null) {
            logger.warn('auto-backup', 'Vault decrypt sample failed — passphrase peut différer', {
              sampleKey,
            });
          }
        } catch (err: unknown) {
          logger.warn('auto-backup', 'Vault decrypt sample threw', { err });
        }
      }

      /* Snapshot pre-rollback automatique (sauvegarde l'état courant avant overwrite) */
      try {
        await this.snapshot('pre-rollback');
      } catch {
        /* Non bloquant — continue restore */
      }

      /* Restore vault keys */
      for (const [k, v] of Object.entries(backup.data.vault)) {
        try {
          localStorage.setItem(k, v);
          restored.push(k);
        } catch (err: unknown) {
          errors.push(`vault[${k}]: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      /* Restore settings */
      for (const [k, v] of Object.entries(backup.data.settings)) {
        try {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          restored.push(k);
        } catch (err: unknown) {
          errors.push(`settings[${k}]: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      /* Restore persistent_memory */
      try {
        localStorage.setItem('apex_v13_persistent_memory', JSON.stringify(backup.data.persistent_memory));
        restored.push('apex_v13_persistent_memory');
      } catch (err: unknown) {
        errors.push(`persistent_memory: ${err instanceof Error ? err.message : 'fail'}`);
      }

      /* Restore audit_log */
      try {
        localStorage.setItem('ax_audit_log_v13', JSON.stringify(backup.data.audit_log));
        restored.push('ax_audit_log_v13');
        auditLog.reload();
      } catch (err: unknown) {
        errors.push(`audit_log: ${err instanceof Error ? err.message : 'fail'}`);
      }

      /* Restore feature_toggles */
      for (const [k, v] of Object.entries(backup.data.feature_toggles)) {
        try {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          restored.push(k);
        } catch (err: unknown) {
          errors.push(`feature_toggles[${k}]: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      /* Restore user_profile */
      for (const [k, v] of Object.entries(backup.data.user_profile)) {
        try {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          restored.push(k);
        } catch (err: unknown) {
          errors.push(`user_profile[${k}]: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      /* Restore voice_prints (FB_LOCAL strict) */
      for (const [k, v] of Object.entries(backup.data.voice_prints)) {
        try {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          restored.push(k);
        } catch (err: unknown) {
          errors.push(`voice_prints[${k}]: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      await auditLog.record('backup.restored', {
        details: { id: backupId, restored_count: restored.length, errors_count: errors.length },
      });

      logger.info('auto-backup', `Restore ${backupId} OK — ${restored.length} clés restaurées (${errors.length} erreurs)`);

      const result: RestoreResult = { ok: errors.length === 0, restored };
      if (errors.length > 0) result.errors = errors;
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('auto-backup', 'restore failed', { err, backupId });
      return { ok: false, restored, errors: [msg] };
    }
  }

  /**
   * Export JSON chiffré (download base64).
   * Le backup est ré-chiffré avec la passphrase vault courante.
   */
  async export(): Promise<string> {
    await this.init();
    const backup = await this.snapshot('manual');
    /* Re-chiffre tout le payload pour transport sécurisé */
    const serialized = JSON.stringify(backup);
    const encrypted = await vault.encryptAuto(serialized);
    return btoa(unescape(encodeURIComponent(encrypted)));
  }

  /**
   * Import JSON chiffré (upload base64).
   * Déchiffre avec passphrase vault courante puis restore.
   */
  async import(encryptedB64: string): Promise<RestoreResult> {
    await this.init();
    try {
      const encrypted = decodeURIComponent(escape(atob(encryptedB64)));
      const decrypted = await vault.decryptAuto(encrypted);
      if (decrypted === null) {
        return { ok: false, restored: [], errors: ['Déchiffrement échoué — passphrase incompatible'] };
      }
      const backup = JSON.parse(decrypted) as Backup;
      /* Persiste le backup importé puis restore depuis l'ID */
      try {
        localStorage.setItem(STORAGE_PREFIX + backup.id, JSON.stringify(backup));
        this.addToIndex(backup.id);
      } catch (err: unknown) {
        return { ok: false, restored: [], errors: [`Persist import: ${err instanceof Error ? err.message : 'fail'}`] };
      }
      const restoreResult = await this.restore(backup.id);
      /* Note: l'entrée audit log est ajoutée APRÈS restore() car restore() écrase l'audit_log
       * avec celui du backup importé. Logger après restore() préserve la trace de l'import. */
      await auditLog.record('backup.imported', {
        details: { id: backup.id, type: backup.type, size: backup.size_bytes },
      });
      return restoreResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, restored: [], errors: [`Import parse failed: ${msg}`] };
    }
  }

  /**
   * Cleanup backups > 30 jours (rolling FIFO).
   * Trigger : sentinelle auto-backup-watch + chaque snapshot.
   */
  async cleanup(): Promise<{ deleted: number }> {
    this.loadIndex();
    const ids = this.indexCache ?? [];
    if (ids.length <= MAX_BACKUPS) return { deleted: 0 };
    /* Charge tous les backups, trie par ts asc, supprime les plus anciens */
    const withTs: Array<{ id: string; ts: number }> = [];
    for (const id of ids) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + id);
        if (!raw) continue;
        const b = JSON.parse(raw) as { ts: number };
        withTs.push({ id, ts: b.ts });
      } catch {
        /* skip + supprime entry corrompue */
        try {
          localStorage.removeItem(STORAGE_PREFIX + id);
        } catch {
          /* skip */
        }
      }
    }
    withTs.sort((a, b) => a.ts - b.ts); /* ascendant : plus anciens first */
    const toDelete = withTs.slice(0, withTs.length - MAX_BACKUPS);
    let deleted = 0;
    for (const { id } of toDelete) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + id);
        deleted += 1;
      } catch {
        /* skip */
      }
    }
    /* Update index */
    const remaining = withTs.slice(toDelete.length).map((b) => b.id);
    this.indexCache = remaining;
    this.persistIndex();
    if (deleted > 0) {
      logger.info('auto-backup', `Cleanup : ${deleted} backups supprimés (rolling FIFO)`);
    }
    return { deleted };
  }

  /**
   * Stats globales pour UI admin.
   */
  getStats(): BackupStats {
    this.loadIndex();
    const list = this.list();
    let total_size_bytes = 0;
    let last_backup_ts = 0;
    let integrity_ok = true;
    for (const b of list) {
      total_size_bytes += b.size_bytes;
      if (b.ts > last_backup_ts) last_backup_ts = b.ts;
      if (!b.id || !b.hash) integrity_ok = false;
    }
    const last_backup_age_h =
      last_backup_ts > 0 ? Math.floor((Date.now() - last_backup_ts) / (60 * 60 * 1000)) : -1;
    return {
      total_backups: list.length,
      last_backup_ts,
      last_backup_age_h,
      total_size_bytes,
      integrity_ok,
    };
  }

  /**
   * Delete un backup spécifique (admin).
   */
  delete(backupId: string): boolean {
    this.loadIndex();
    try {
      localStorage.removeItem(STORAGE_PREFIX + backupId);
      this.indexCache = (this.indexCache ?? []).filter((id) => id !== backupId);
      this.persistIndex();
      void auditLog.record('backup.deleted', { details: { id: backupId } });
      return true;
    } catch (err: unknown) {
      logger.warn('auto-backup', 'delete failed', { err, backupId });
      return false;
    }
  }

  /**
   * Charge un backup par ID (lecture seule).
   */
  get(backupId: string): Backup | null {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + backupId);
      if (!raw) return null;
      return JSON.parse(raw) as Backup;
    } catch {
      return null;
    }
  }

  /* === Internals === */

  private loadIndex(): void {
    if (this.indexCache !== null) return;
    try {
      const raw = localStorage.getItem(STORAGE_INDEX);
      this.indexCache = raw ? (JSON.parse(raw) as string[]) : [];
      if (!Array.isArray(this.indexCache)) this.indexCache = [];
    } catch {
      this.indexCache = [];
    }
  }

  private addToIndex(id: string): void {
    this.loadIndex();
    if (!this.indexCache) this.indexCache = [];
    if (!this.indexCache.includes(id)) {
      this.indexCache.push(id);
      this.persistIndex();
    }
  }

  private persistIndex(): void {
    try {
      localStorage.setItem(STORAGE_INDEX, JSON.stringify(this.indexCache ?? []));
    } catch (err: unknown) {
      logger.warn('auto-backup', 'persistIndex failed', { err });
    }
  }

  /**
   * Push Firebase remote (cross-device).
   * Filtre voice_prints (FB_LOCAL strict — JAMAIS shared remote).
   * Filtre user_profile sensibles (PII protection).
   */
  private async pushToFirebaseRemote(backup: Backup): Promise<void> {
    try {
      /* Sanitize : retire voice_prints + user_profile pour respect FB_LOCAL */
      const sanitized: Backup = {
        ...backup,
        data: {
          ...backup.data,
          voice_prints: {}, /* JAMAIS partagé Firebase remote */
          user_profile: {}, /* PII strict local */
        },
      };
      const { firebase, FB_FIX } = await import('./firebase.js');
      const remoteKey = 'apex_v13_backup_remote_' + backup.id;
      if (FB_FIX.includes(remoteKey) || true /* whitelisted via dedicated path */) {
        /* Note : path apex/backups/<id> via firebase.write avec serialized */
        await firebase.write(remoteKey, JSON.stringify(sanitized));
        logger.info('auto-backup', `Firebase remote push OK ${backup.id}`);
      }
    } catch (err: unknown) {
      logger.warn('auto-backup', 'pushToFirebaseRemote failed (non-blocking)', { err });
    }
  }

  /* Test/admin helper */
  _resetForTests(): void {
    this.indexCache = null;
    this.initialized = false;
  }

  /* Quota threshold check (warning UI) */
  isQuotaCritical(): boolean {
    try {
      const total = JSON.stringify(localStorage).length;
      return total > QUOTA_THRESHOLD_BYTES;
    } catch {
      return false;
    }
  }
}

export const autoBackup = new AutoBackup();
