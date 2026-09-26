/**
 * APEX v13 — Vault Firebase Backup (Kevin 2026-05-08, ABSOLUE).
 *
 * Mission Kevin v13.3.51+ : "J'ai collé mes codes plusieurs fois ils les ont en mémoire
 * quelque part. Il doit plus avoir de problème ou il s'emmêle ou je n'ai plus de réponse"
 *
 * ARCHITECTURE TRIPLE-PERSISTENCE BÉTON :
 *
 *   Couche 1 — localStorage (rapide, primary)         → vault.setKey existant
 *   Couche 2 — IndexedDB shadow (résiste cache clear) → vault.setKey existant
 *   Couche 3 — Firebase /apex/vault_backup_<uid>/<keyId>/ ← CE SERVICE
 *
 * Différences avec Firebase write standard (firebase.ts FB_FIX) :
 * - Path dédié `vault_backup` (pas `apex/<key>`) — survit même si la clé du registre
 *   FB_FIX est nettoyée.
 * - Re-chiffrement avec passphrase vault Kevin (déjà fait par vault.encrypt) →
 *   JAMAIS en clair Firebase.
 * - Throttle 1 push / 5min par clé (anti-spam Firebase, économise quota).
 * - Wrapper d'enveloppe avec metadata (ts, version, hash) pour audit + intégrité.
 *
 * Auto-restore au boot : voir `restoreAllFromFirebaseBackup()`.
 *
 * Sentinelle `vault-resilience-watch` (5 min) : audit cohérence 3 sources,
 * sync si drift détecté.
 */

import { logger } from '../../core/logger.js';
import { firebase } from '../storage/firebase.js';

/* ============================================================
   Types publics
   ============================================================ */

export interface VaultBackupEnvelope {
  /** Format version (futur-proof, peut évoluer) */
  v: 1;
  /** Timestamp de création de l'enveloppe (ms) */
  ts: number;
  /** Storage key d'origine (ex: ax_anthropic_key) */
  k: string;
  /** Valeur chiffrée AXENC1: (préserve format vault.encrypt) */
  enc: string;
  /** Hash SHA-256 short pour vérif intégrité */
  hash?: string;
}

export interface BackupResult {
  ok: boolean;
  reason?: string;
  throttled?: boolean;
  ts?: number;
  queued?: boolean;
}

export interface RestoreResult {
  total: number;
  restored: number;
  skipped: number;
  failed: number;
  details: Array<{ key: string; status: 'restored' | 'skipped' | 'failed'; reason?: string }>;
}

export interface BackupStats {
  total_keys_backed_up: number;
  last_push_ts_per_key: Record<string, number>;
  oldest_backup_ts: number;
  newest_backup_ts: number;
}

/* ============================================================
   Constants
   ============================================================ */

/** Throttle : ne pas pusher la même clé plus d'1 fois par 5 min */
const THROTTLE_MS = 5 * 60 * 1000;

/** Firebase path racine pour les backups vault (séparé de /apex/<key>) */
const FB_BACKUP_PATH = 'vault_backup';

/** Storage key local pour tracker les derniers push timestamps (anti-spam) */
const LAST_PUSH_KEY = 'apex_v13_vault_fb_backup_last_push';

/** Préfix vault chiffré (mirror de PREFIX dans vault.ts) */
const ENC_PREFIX = 'AXENC1:';

/* ============================================================
   Helpers
   ============================================================ */

async function sha256Short(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(buf)]
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}

/**
 * Normalise une clé en path Firebase safe.
 * - Supprime caractères interdits Firebase (`. # $ [ ]`).
 * - Préserve underscore + alphanum.
 */
function fbSafeKeyId(storageKey: string): string {
  return storageKey.replace(/[.#$[\]/]/g, '_');
}

/**
 * Récupère l'uid utilisateur courant pour scoper les backups.
 * Fallback 'anon' si pas de session active (cas premier paste avant auth).
 * Backup quand même → permet re-binding à l'uid réel après login.
 */
/* v13.4.98 (Kevin "Coffre tjs perd memoire apres reinstall PWA") :
 * Si force-update OU reinstall PWA, localStorage 'apex_v13_uid' est wipe → 'anon'.
 * Fix : si admin Kevin reconnu (par dernier nom connu Firebase ou pin admin OK),
 * retourner ADMIN_KEVIN_UID hardcode pour que Firebase backup soit toujours
 * lisible/écrivable au même path. Pour les autres users, fallback 'anon'.
 *
 * Le path kdmc_admin EST le path stable de Kevin DESARZENS depuis v13.0.
 */
const ADMIN_KEVIN_UID = 'kdmc_admin';

function getUid(): string {
  try {
    const stored = localStorage.getItem('apex_v13_uid');
    if (stored && stored !== 'anon') return stored;
    /* Fallback : last_known_uid (preserve survit force-update banner) */
    const lastKnown = localStorage.getItem('apex_v13_last_known_uid');
    if (lastKnown && lastKnown !== 'anon') return lastKnown;
    /* Fallback admin : si pin admin a déjà été setup OU last_known_name = Kevin */
    const lastKnownName = (localStorage.getItem('apex_v13_last_known_name') ?? '').toLowerCase();
    if (lastKnownName.includes('kevin') || lastKnownName.includes('desarzens')) {
      return ADMIN_KEVIN_UID;
    }
    /* Fallback ultime : si pin admin global existe, c'est probablement Kevin */
    if (localStorage.getItem('apex_v13_pin')) {
      return ADMIN_KEVIN_UID;
    }
    return 'anon';
  } catch {
    return 'anon';
  }
}

/** v13.4.98 — getAllKnownUids : pour restore exhaustif (scan tous paths). */
function getAllKnownUids(): string[] {
  const set = new Set<string>();
  try {
    const cur = localStorage.getItem('apex_v13_uid');
    if (cur && cur !== 'anon') set.add(cur);
    const lk = localStorage.getItem('apex_v13_last_known_uid');
    if (lk && lk !== 'anon') set.add(lk);
    if (localStorage.getItem('apex_v13_pin')) set.add(ADMIN_KEVIN_UID);
  } catch { /* ignore */ }
  /* Toujours tenter kdmc_admin (path stable Kevin) */
  set.add(ADMIN_KEVIN_UID);
  return Array.from(set);
}

/* ============================================================
   VaultFirebaseBackup class
   ============================================================ */

class VaultFirebaseBackup {
  private lastPushCache: Record<string, number> | null = null;

  /**
   * Push une clé chiffrée vers Firebase backup avec throttle 5min.
   *
   * Idempotent + throttled : si la même clé a été pushée < 5min,
   * skip et retourne `throttled:true`.
   *
   * @param storageKey - clé localStorage (ex: ax_anthropic_key)
   * @param encryptedValue - valeur AXENC1: déjà chiffrée par vault.encrypt
   * @param opts.force - bypass throttle (utilisé par UltraReset pre-backup)
   */
  async push(
    storageKey: string,
    encryptedValue: string,
    opts: { force?: boolean } = {},
  ): Promise<BackupResult> {
    if (!storageKey || !encryptedValue) {
      return { ok: false, reason: 'missing_args' };
    }
    /* SECURITY : refuse de pusher si valeur n'est pas chiffrée AXENC1: (jamais en clair Firebase) */
    if (!encryptedValue.startsWith(ENC_PREFIX)) {
      logger.error('vault-fb-backup', `🚨 REFUSED push : ${storageKey} not encrypted (no AXENC1: prefix)`);
      return { ok: false, reason: 'plaintext_refused' };
    }
    /* Throttle */
    if (!opts.force) {
      const lastPush = this.getLastPush(storageKey);
      const now = Date.now();
      if (lastPush > 0 && now - lastPush < THROTTLE_MS) {
        logger.debug('vault-fb-backup', `throttled push ${storageKey} (last: ${now - lastPush}ms ago)`);
        return { ok: false, throttled: true, reason: 'throttled', ts: lastPush };
      }
    }
    /* v13.4.257 (FIX "Firebase backup KO 0/20" — Kevin "tjs pas de coffre
     * en mémoire") : on N'ABANDONNE PLUS le push quand !isConnected().
     * firebase.write() met en file d'attente offline (firebase-queue) et
     * flush automatiquement à la reconnexion. L'ancien `return offline`
     * pré-court-circuitait write() → le backup vault ne touchait JAMAIS
     * la file → 0 sauvegarde dès que la connexion flanchait (cas iOS
     * Safari background très fréquent) et ne se rattrapait jamais. */
    const online = firebase.isConnected();
    const uid = getUid();
    const safeKey = fbSafeKeyId(storageKey);
    const ts = Date.now();
    const envelope: VaultBackupEnvelope = {
      v: 1,
      ts,
      k: storageKey,
      enc: encryptedValue,
      hash: await sha256Short(encryptedValue),
    };
    const path = `${FB_BACKUP_PATH}/${uid}/${safeKey}`;
    try {
      /* Use firebase.write avec idempotency key pour éviter spam si même valeur.
       * Offline → write() met en file d'attente (flush auto à la reconnexion). */
      await firebase.write(path, envelope, { idempotencyKey: `vfb_${safeKey}_${envelope.hash}` });
      this.recordPush(storageKey, ts);
      if (online) {
        logger.info('vault-fb-backup', `✅ pushed ${storageKey} → ${path}`, { hash: envelope.hash });
      } else {
        logger.info('vault-fb-backup', `📥 queued ${storageKey} (offline — flush auto à la reconnexion)`);
      }
      return { ok: true, ts, ...(online ? {} : { queued: true }) };
    } catch (err: unknown) {
      logger.warn('vault-fb-backup', `push failed ${storageKey}`, { err });
      return { ok: false, reason: String(err).slice(0, 100) };
    }
  }

  /**
   * Récupère une clé chiffrée depuis Firebase backup.
   * Retourne `null` si absent / corrompu / hash mismatch.
   */
  async fetch(storageKey: string): Promise<string | null> {
    if (!storageKey) return null;
    if (!firebase.isConnected()) return null;
    /* v13.4.98 : scan TOUS les uids connus (current + last_known + admin_kevin)
     * pour retrouver la clé même après reinstall PWA (uid='anon'). Premier hit. */
    const safeKey = fbSafeKeyId(storageKey);
    const allUids = getAllKnownUids();
    for (const uid of allUids) {
      const path = `${FB_BACKUP_PATH}/${uid}/${safeKey}`;
      try {
        const env = await firebase.read<VaultBackupEnvelope>(path);
        if (!env || typeof env !== 'object') continue;
        if (env.v !== 1 || typeof env.enc !== 'string') continue;
        if (!env.enc.startsWith(ENC_PREFIX)) continue;
        /* Vérif hash si présent */
        if (env.hash) {
          const expected = await sha256Short(env.enc);
          if (expected && expected !== env.hash) {
            logger.warn('vault-fb-backup', `hash mismatch ${storageKey} uid=${uid} — skip`);
            continue;
          }
        }
        logger.debug('vault-fb-backup', `fetched ${storageKey} from uid=${uid}`, { ts: env.ts });
        return env.enc;
      } catch (err: unknown) {
        logger.debug('vault-fb-backup', `fetch ${storageKey} uid=${uid} failed (try next)`, { err });
      }
    }
    return null;
  }

  /**
   * Liste tous les backups disponibles pour l'uid courant.
   * Utilisé par auto-restore au boot + UI admin.
   */
  async listAll(): Promise<Array<{ key: string; ts: number; hash?: string }>> {
    if (!firebase.isConnected()) return [];
    /* v13.4.98 (Kevin "Coffre tjs perd memoire") :
     * Scan TOUS les uids connus (current + last_known + admin_kevin) au lieu
     * d'un seul uid. Si Kevin réinstall PWA → apex_v13_uid='anon', mais
     * kdmc_admin path Firebase a toujours ses clés.
     * Dedupe par key (priorité au plus récent ts). */
    const allUids = getAllKnownUids();
    const seenByKey = new Map<string, { key: string; ts: number; hash?: string }>();
    for (const uid of allUids) {
      try {
        const fbData = await firebase.read<Record<string, VaultBackupEnvelope>>(
          `${FB_BACKUP_PATH}/${uid}`,
        );
        if (!fbData || typeof fbData !== 'object') continue;
        for (const env of Object.values(fbData)) {
          if (env && env.v === 1 && typeof env.k === 'string') {
            const existing = seenByKey.get(env.k);
            if (!existing || env.ts > existing.ts) {
              const entry: { key: string; ts: number; hash?: string } = { key: env.k, ts: env.ts };
              if (env.hash) entry.hash = env.hash;
              seenByKey.set(env.k, entry);
            }
          }
        }
      } catch (err: unknown) {
        logger.debug('vault-fb-backup', `listAll uid=${uid} failed (skipping)`, { err });
      }
    }
    return Array.from(seenByKey.values()).sort((a, b) => b.ts - a.ts);
  }

  /**
   * AUTO-RESTORE AU BOOT — appelé par firebase.init après ping success.
   *
   * Pour chaque backup Firebase, si localStorage vide ET backup déchiffrable →
   * restore localStorage + IDB shadow.
   *
   * Toast info "🔓 N clés restaurées depuis Firebase backup".
   */
  async restoreAllFromFirebaseBackup(): Promise<RestoreResult> {
    const result: RestoreResult = {
      total: 0,
      restored: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };
    if (!firebase.isConnected()) {
      logger.debug('vault-fb-backup', 'restoreAll skipped (offline)');
      return result;
    }
    const all = await this.listAll();
    result.total = all.length;
    if (all.length === 0) {
      logger.info('vault-fb-backup', 'restoreAll : no backups found for uid');
      return result;
    }
    /* Lazy import vault pour éviter circular dep */
    let vaultMod: typeof import('./vault.js') | null = null;
    try {
      vaultMod = await import('./vault.js');
    } catch (err: unknown) {
      logger.error('vault-fb-backup', 'vault import failed', { err });
      result.failed = all.length;
      return result;
    }
    for (const item of all) {
      try {
        /* Skip si déjà présent en localStorage (write-through assumed) */
        const existingLocal = (() => {
          try {
            return localStorage.getItem(item.key);
          } catch {
            return null;
          }
        })();
        if (existingLocal) {
          result.skipped += 1;
          result.details.push({ key: item.key, status: 'skipped', reason: 'already_local' });
          continue;
        }
        /* Skip si Kevin a explicitement supprimé cette clé */
        if (this.isExplicitlyDeleted(item.key)) {
          result.skipped += 1;
          result.details.push({ key: item.key, status: 'skipped', reason: 'user_deleted' });
          continue;
        }
        const encrypted = await this.fetch(item.key);
        if (!encrypted) {
          result.failed += 1;
          result.details.push({ key: item.key, status: 'failed', reason: 'fetch_failed' });
          continue;
        }
        /* Délègue à vault.restoreFromFirebase qui valide decrypt avant overwrite */
        const ok = await vaultMod.vault.restoreFromFirebase(item.key, encrypted);
        if (ok) {
          result.restored += 1;
          result.details.push({ key: item.key, status: 'restored' });
        } else {
          result.failed += 1;
          result.details.push({ key: item.key, status: 'failed', reason: 'decrypt_failed' });
        }
      } catch (err: unknown) {
        result.failed += 1;
        result.details.push({
          key: item.key,
          status: 'failed',
          reason: String(err).slice(0, 80),
        });
      }
    }
    if (result.restored > 0) {
      logger.info(
        'vault-fb-backup',
        `🔓 ${result.restored} clés restaurées depuis Firebase backup ` +
          `(skipped ${result.skipped}, failed ${result.failed})`,
      );
      /* Best-effort toast Kevin */
      void import('../admin/kevin-alerts.js')
        .then(({ kevinAlerts }) =>
          kevinAlerts.alertKevin({
            severity: 'info',
            title: `🔓 ${result.restored} clés restaurées`,
            body: 'Auto-restore depuis Firebase backup chiffré (cross-device).',
          }),
        )
        .catch(() => {
          /* ignore */
        });
    }
    return result;
  }

  /**
   * Stats pour vue admin / sentinelle.
   */
  async getStats(): Promise<BackupStats> {
    const all = await this.listAll();
    const lastPushPerKey: Record<string, number> = {};
    let oldest = 0;
    let newest = 0;
    for (const item of all) {
      lastPushPerKey[item.key] = item.ts;
      if (oldest === 0 || item.ts < oldest) oldest = item.ts;
      if (item.ts > newest) newest = item.ts;
    }
    return {
      total_keys_backed_up: all.length,
      last_push_ts_per_key: lastPushPerKey,
      oldest_backup_ts: oldest,
      newest_backup_ts: newest,
    };
  }

  /**
   * Force-push toutes les clés vault locales vers Firebase (utilisé par UltraReset
   * AVANT clear, ou par sentinelle vault-resilience-watch si drift détecté).
   */
  async pushAllLocal(): Promise<{ pushed: number; failed: number; skipped: number }> {
    let pushed = 0;
    let failed = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (!(key.startsWith('ax_') || key.startsWith('apex_v13_'))) continue;
        if (!(key.endsWith('_key') || key.endsWith('_token') || key.endsWith('_secret'))) continue;
        const value = localStorage.getItem(key);
        if (!value) continue;
        if (!value.startsWith(ENC_PREFIX)) {
          /* Refuse plaintext push */
          skipped += 1;
          continue;
        }
        const r = await this.push(key, value, { force: true });
        if (r.ok) pushed += 1;
        else if (r.throttled) skipped += 1;
        else failed += 1;
      }
    } catch (err: unknown) {
      logger.warn('vault-fb-backup', 'pushAllLocal iteration failed', { err });
    }
    logger.info('vault-fb-backup', `pushAllLocal complete`, { pushed, failed, skipped });
    return { pushed, failed, skipped };
  }

  /**
   * Audit cohérence 3 sources (localStorage / IDB shadow / Firebase backup).
   * Détecte drift : si IDB ou Firebase a des clés que localStorage n'a pas, ou inversement.
   * Utilisé par sentinelle vault-resilience-watch.
   */
  async auditCoherence(): Promise<{
    local_count: number;
    fb_count: number;
    drift_detected: boolean;
    in_local_not_fb: string[];
    in_fb_not_local: string[];
  }> {
    const localKeys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!(k.startsWith('ax_') || k.startsWith('apex_v13_'))) continue;
        if (!(k.endsWith('_key') || k.endsWith('_token'))) continue;
        const v = localStorage.getItem(k);
        if (v && v.startsWith(ENC_PREFIX)) localKeys.push(k);
      }
    } catch {
      /* ignore */
    }
    const fbBackups = await this.listAll();
    const fbKeys = fbBackups.map((b) => b.key);
    const localSet = new Set(localKeys);
    const fbSet = new Set(fbKeys);
    const inLocalNotFb: string[] = [];
    const inFbNotLocal: string[] = [];
    for (const k of localKeys) if (!fbSet.has(k)) inLocalNotFb.push(k);
    for (const k of fbKeys) {
      if (!localSet.has(k) && !this.isExplicitlyDeleted(k)) inFbNotLocal.push(k);
    }
    return {
      local_count: localKeys.length,
      fb_count: fbKeys.length,
      drift_detected: inLocalNotFb.length > 0 || inFbNotLocal.length > 0,
      in_local_not_fb: inLocalNotFb,
      in_fb_not_local: inFbNotLocal,
    };
  }

  /**
   * Auto-fix drift : push manquants vers Firebase + restore manquants depuis Firebase.
   */
  async syncDrift(): Promise<{ pushed: number; restored: number }> {
    const audit = await this.auditCoherence();
    let pushed = 0;
    let restored = 0;
    /* 1. Push local → Firebase pour les clés manquantes côté FB */
    for (const k of audit.in_local_not_fb) {
      const v = localStorage.getItem(k);
      if (!v) continue;
      const r = await this.push(k, v, { force: true });
      if (r.ok) pushed += 1;
    }
    /* 2. Restore Firebase → local pour les clés manquantes côté local */
    if (audit.in_fb_not_local.length > 0) {
      let vaultMod: typeof import('./vault.js') | null = null;
      try {
        vaultMod = await import('./vault.js');
      } catch {
        /* ignore */
      }
      if (vaultMod) {
        for (const k of audit.in_fb_not_local) {
          const enc = await this.fetch(k);
          if (!enc) continue;
          const ok = await vaultMod.vault.restoreFromFirebase(k, enc);
          if (ok) restored += 1;
        }
      }
    }
    logger.info('vault-fb-backup', `syncDrift complete`, { pushed, restored });
    return { pushed, restored };
  }

  /* ============================================================
     Throttle helpers (last push tracking)
     ============================================================ */

  private loadLastPushCache(): Record<string, number> {
    if (this.lastPushCache !== null) return this.lastPushCache;
    try {
      const raw = localStorage.getItem(LAST_PUSH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.lastPushCache = parsed as Record<string, number>;
          return this.lastPushCache;
        }
      }
    } catch {
      /* corrupt → restart */
    }
    this.lastPushCache = {};
    return this.lastPushCache;
  }

  private getLastPush(storageKey: string): number {
    return this.loadLastPushCache()[storageKey] ?? 0;
  }

  private recordPush(storageKey: string, ts: number): void {
    const cache = this.loadLastPushCache();
    cache[storageKey] = ts;
    try {
      localStorage.setItem(LAST_PUSH_KEY, JSON.stringify(cache));
    } catch {
      /* quota → ignore */
    }
  }

  /**
   * Vérifie si Kevin a explicitement supprimé cette clé via UI Vault
   * (registre `ax_credentials_deleted` cf. vault.ts startCredentialsWatch).
   * Si oui → ne PAS auto-restore depuis Firebase (respect choix user).
   */
  private isExplicitlyDeleted(storageKey: string): boolean {
    try {
      const deleted = JSON.parse(localStorage.getItem('ax_credentials_deleted') ?? '[]') as string[];
      return Array.isArray(deleted) && deleted.includes(storageKey);
    } catch {
      return false;
    }
  }

  /**
   * Reset throttle cache (utile pour tests + admin debug).
   */
  resetThrottle(): void {
    this.lastPushCache = {};
    try {
      localStorage.removeItem(LAST_PUSH_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const vaultFirebaseBackup = new VaultFirebaseBackup();
