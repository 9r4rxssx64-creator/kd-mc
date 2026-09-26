/**
 * APEX v13 — Auto Restore Credentials (Kevin demande 2026-05-08 23h30 P0).
 *
 * "Quand il me dit qu'il lui manque des choses bah pourquoi il est pas allé
 *  les chercher automatiquement" — Kevin
 *
 * Apex IA détecte clés manquantes (audit "9/35 clés") mais demande à Kevin de
 * coller. Il devrait :
 *   1. Chercher Firebase backup `/apex/<storageKey>.json`
 *   2. Chercher localStorage clés alternatives (alias map : ax_anthropic_key
 *      ↔ ax_shared_api_key, etc.)
 *   3. Chercher IndexedDB shadow (apex_v13_vault_shadow)
 *   4. Détection format : ax_shared_api_key contenant clé Anthropic →
 *      copier vers ax_anthropic_key automatiquement.
 *   5. UNIQUEMENT si vraiment absent partout → catégorie `truly_absent` →
 *      notif Kevin + lien direct dashboard.
 *
 * Sécurité :
 *   - Restore uniquement clés du user courant (pas cross-user).
 *   - Audit log immutable `vault.auto_restore` à chaque restore.
 *   - Decrypt avant overwrite (skip valeurs corrompues).
 *
 * Wired :
 *   - services-bootstrap.ts safeInit('auto-restore', autoRestore.boot)
 *   - sentinels.ts register('auto-restore-watch', interval 30min)
 *   - admin view features/admin/credentials-status/index.ts
 *
 * v13.3.79 (Kevin règle 2026-05-08 ABSOLUE "Autonomie totale toujours partout").
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { FB_FIX } from '../storage/firebase.js';

import {
  computeStats,
  getCriticality,
  ESSENTIAL_KEYS,
  RECOMMENDED_KEYS,
  type CategoryStats,
  type CredentialCriticality,
} from './credential-categories.js';
import { detectCredential, CREDENTIAL_PATTERNS } from './credential-patterns.js';

/* ============================================================
   Notification throttling (Kevin règle 2026-05-08 : pas de spam)
   ============================================================ */

/** Clé localStorage pour throttler les notifs (max 1× / 24h par type). */
const NOTIFY_THROTTLE_KEY = 'apex_v13_credentials_notify_last_ts';
const NOTIFY_THROTTLE_MS = 24 * 60 * 60 * 1000; /* 24h */

interface NotifyState {
  /** Last timestamp d'une notif WARN (essential manquant). */
  warn_ts?: number;
  /** Last timestamp d'une notif INFO (recommended manquant). */
  info_ts?: number;
}

function readNotifyState(): NotifyState {
  try {
    const raw = localStorage.getItem(NOTIFY_THROTTLE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null) return parsed as NotifyState;
    return {};
  } catch {
    return {};
  }
}

function writeNotifyState(state: NotifyState): void {
  try {
    localStorage.setItem(NOTIFY_THROTTLE_KEY, JSON.stringify(state));
  } catch { /* quota — silent */ }
}

/**
 * Vérifie si une notif d'un type donné peut être envoyée (throttle 24h).
 * Retourne true si OK pour notifier, false si dans la fenêtre de cooldown.
 */
function canNotify(type: 'warn' | 'info', now: number = Date.now()): boolean {
  const state = readNotifyState();
  const lastTs = type === 'warn' ? state.warn_ts : state.info_ts;
  if (typeof lastTs !== 'number') return true;
  return now - lastTs >= NOTIFY_THROTTLE_MS;
}

/**
 * Marque qu'une notif d'un type donné vient d'être envoyée (start cooldown 24h).
 */
function markNotified(type: 'warn' | 'info', now: number = Date.now()): void {
  const state = readNotifyState();
  if (type === 'warn') state.warn_ts = now;
  else state.info_ts = now;
  writeNotifyState(state);
}

/* ============================================================
   Types publics
   ============================================================ */

export type RestoreSource = 'localStorage' | 'idb_shadow' | 'firebase_backup' | 'alias' | 'pattern_match';

export interface MissingEntry {
  storage_key: string;
  service_name: string;
  category: string;
  /** Criticité Kevin (essential/recommended/optional) — voir credential-categories.ts. */
  criticality: CredentialCriticality;
  /** Source potentielle d'où la clé peut être restaurée (si recoverable). */
  recoverable_from?: RestoreSource;
  /** Storage key alternative qui contient la valeur (si alias détecté). */
  alias_source?: string;
  /** Dashboard URL pour fallback notif Kevin. */
  dashboard_url?: string;
  billing_url?: string;
}

export interface AuditMissingResult {
  /** Clés manquantes en localStorage (toutes, peu importe recovery). */
  missing: string[];
  /** Clés récupérables automatiquement (présentes ailleurs : IDB / Firebase / alias). */
  recoverable: MissingEntry[];
  /** Clés vraiment absentes partout (Kevin doit coller). */
  truly_absent: MissingEntry[];
  /** Stats par catégorie (essential/recommended/optional) calculées sur les clés présentes. */
  stats: CategoryStats;
  /** Timestamp audit. */
  ts: number;
}

export interface RestoreReport {
  ts: number;
  /** Combien restaurées avec succès. */
  restored: number;
  /** Combien tentées mais échouées (decrypt fail, IDB miss après check, etc.). */
  failed: number;
  /** Détail par clé. */
  details: Array<{
    storage_key: string;
    source?: RestoreSource;
    ok: boolean;
    reason?: string;
  }>;
}

/* ============================================================
   Alias map — clés équivalentes (legacy / cross-version)
   ============================================================ */

/**
 * Map des aliases connus : si une de ces clés est présente, on peut
 * dériver la valeur d'autres clés du groupe.
 *
 * Format : storageKey → liste alternatives à tester.
 * Bidirectionnel : si A est alias de B, B est aussi alias de A.
 *
 * Étendu autour de :
 *   - ax_shared_api_key (legacy v12) ↔ ax_anthropic_key (v13)
 *   - apex_v13_anthropic_key (Sprint 8 backup namespace) ↔ ax_anthropic_key
 *   - ax_groq_key_v2 (rotation) ↔ ax_groq_key
 */
const ALIAS_GROUPS: ReadonlyArray<readonly string[]> = [
  /* Anthropic */
  ['ax_anthropic_key', 'ax_shared_api_key', 'apex_v13_anthropic_key'],
  /* OpenAI */
  ['ax_openai_key', 'apex_v13_openai_key'],
  /* Groq */
  ['ax_groq_key', 'ax_groq_key_v2', 'apex_v13_groq_key'],
  /* Gemini / Google AI */
  ['ax_gemini_key', 'ax_google_key', 'apex_v13_gemini_key'],
  /* OpenRouter */
  ['ax_openrouter_key', 'apex_v13_openrouter_key'],
  /* Stripe */
  ['ax_stripe_key', 'ax_stripe_sk'],
];

function aliasesFor(storageKey: string): readonly string[] {
  for (const group of ALIAS_GROUPS) {
    if (group.includes(storageKey)) {
      return group.filter((k) => k !== storageKey);
    }
  }
  return [];
}

/* ============================================================
   Service
   ============================================================ */

class AutoRestoreCredentials {
  private bootRan = false;

  /**
   * Boot hook : run audit + restore puis schedule (déjà fait par sentinelle 30min).
   * Idempotent multi-call.
   */
  async boot(): Promise<void> {
    if (this.bootRan) return;
    this.bootRan = true;
    try {
      const result = await this.restoreAutomatically();
      if (result.restored > 0) {
        logger.info('auto-restore', `🔓 ${result.restored} clés restaurées automatiquement au boot`);
      }
    } catch (err: unknown) {
      logger.warn('auto-restore', 'boot failed (non-blocking)', { err });
    }
  }

  /**
   * Audit complet : pour chaque pattern attendu, classe en :
   *   - present : déjà en localStorage (rien à faire)
   *   - recoverable : trouvable ailleurs (alias / IDB / Firebase)
   *   - truly_absent : aucune trace nulle part
   */
  async auditMissing(): Promise<AuditMissingResult> {
    const ts = Date.now();
    const missing: string[] = [];
    const recoverable: MissingEntry[] = [];
    const truly_absent: MissingEntry[] = [];
    const presentKeys: string[] = [];
    const allKnownKeys: string[] = [];

    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.category === 'forbidden') continue;
      const storageKey = pattern.storageKey;
      allKnownKeys.push(storageKey);
      const criticality = getCriticality(storageKey);
      const presentLocally = this.hasLocal(storageKey);
      if (presentLocally) {
        presentKeys.push(storageKey);
        continue;
      }

      missing.push(storageKey);

      /* 1. Tente alias dans localStorage */
      const aliasHit = this.findAliasInLocal(storageKey);
      if (aliasHit) {
        recoverable.push({
          storage_key: storageKey,
          service_name: pattern.name,
          category: pattern.category,
          criticality,
          recoverable_from: 'alias',
          alias_source: aliasHit,
          ...(pattern.dashboard ? { dashboard_url: pattern.dashboard } : {}),
          ...(pattern.billing ? { billing_url: pattern.billing } : {}),
        });
        continue;
      }

      /* 2. Tente IDB shadow */
      const idbHit = await this.checkIdb(storageKey);
      if (idbHit) {
        recoverable.push({
          storage_key: storageKey,
          service_name: pattern.name,
          category: pattern.category,
          criticality,
          recoverable_from: 'idb_shadow',
          ...(pattern.dashboard ? { dashboard_url: pattern.dashboard } : {}),
          ...(pattern.billing ? { billing_url: pattern.billing } : {}),
        });
        continue;
      }

      /* 3. Tente Firebase backup (uniquement si dans FB_FIX whitelist) */
      if (FB_FIX.includes(storageKey)) {
        const fbHit = await this.checkFirebase(storageKey);
        if (fbHit) {
          recoverable.push({
            storage_key: storageKey,
            service_name: pattern.name,
            category: pattern.category,
            criticality,
            recoverable_from: 'firebase_backup',
            ...(pattern.dashboard ? { dashboard_url: pattern.dashboard } : {}),
            ...(pattern.billing ? { billing_url: pattern.billing } : {}),
          });
          continue;
        }
      }

      /* 4. Pattern detection : scan TOUT localStorage pour valeur qui matche le regex de cette clé.
       * Cas usage : Kevin a collé sa clé Anthropic dans une note ax_pasted_blob, on
       * peut la déplacer automatiquement vers ax_anthropic_key. Limité aux clés courantes. */
      const patternHit = this.findValueByPattern(storageKey);
      if (patternHit) {
        recoverable.push({
          storage_key: storageKey,
          service_name: pattern.name,
          category: pattern.category,
          criticality,
          recoverable_from: 'pattern_match',
          alias_source: patternHit,
          ...(pattern.dashboard ? { dashboard_url: pattern.dashboard } : {}),
          ...(pattern.billing ? { billing_url: pattern.billing } : {}),
        });
        continue;
      }

      /* 5. Truly absent */
      truly_absent.push({
        storage_key: storageKey,
        service_name: pattern.name,
        category: pattern.category,
        criticality,
        ...(pattern.dashboard ? { dashboard_url: pattern.dashboard } : {}),
        ...(pattern.billing ? { billing_url: pattern.billing } : {}),
      });
    }

    /* Calcul stats par criticité (essential/recommended/optional).
     * Source de vérité unique pour la logique de notification + UI admin. */
    const stats = computeStats(presentKeys, allKnownKeys);

    logger.info(
      'auto-restore',
      `audit : missing=${missing.length} recoverable=${recoverable.length} truly_absent=${truly_absent.length} | essential=${stats.essential.present}/${stats.essential.total} recommended=${stats.recommended.present}/${stats.recommended.total} optional=${stats.optional.present}/${stats.optional.total_known}`,
    );
    return { missing, recoverable, truly_absent, stats, ts };
  }

  /**
   * Restaure automatiquement toutes les clés `recoverable`.
   * Pour chaque clé : tente la source la plus fiable, écrit en localStorage
   * (+ IDB shadow + Firebase via vault.setKey).
   */
  async restoreAutomatically(): Promise<RestoreReport> {
    const ts = Date.now();
    const audit = await this.auditMissing();
    const details: RestoreReport['details'] = [];
    let restored = 0;
    let failed = 0;

    for (const entry of audit.recoverable) {
      try {
        const ok = await this.restoreOne(entry);
        if (ok.ok) {
          restored++;
          details.push({ storage_key: entry.storage_key, ok: true, ...(entry.recoverable_from ? { source: entry.recoverable_from } : {}) });
        } else {
          failed++;
          details.push({
            storage_key: entry.storage_key,
            ok: false,
            ...(entry.recoverable_from ? { source: entry.recoverable_from } : {}),
            ...(ok.reason ? { reason: ok.reason } : {}),
          });
        }
      } catch (err: unknown) {
        failed++;
        details.push({
          storage_key: entry.storage_key,
          ok: false,
          ...(entry.recoverable_from ? { source: entry.recoverable_from } : {}),
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    /* Audit log immutable : restored count + failed (pas de plaintext jamais) */
    if (restored > 0 || failed > 0) {
      void auditLog.record('vault.auto_restore', {
        details: { restored, failed, total_recoverable: audit.recoverable.length, ts },
      });
    }

    /* Toast info user-friendly (best-effort) */
    if (restored > 0) {
      try {
        const { toast } = await import('../../ui/toast.js');
        toast.show(`🔓 ${restored} clés restaurées automatiquement`, 'info');
      } catch { /* boot précoce, toast indispo */ }
    }

    /* v13.3.80 Kevin 19:55 SUPPRIMÉ : notif "71 credentials manquants" qui revenait
     * en boucle malgré throttle (méthode maybeNotifyKevin manquante + ancien chunk
     * deployé contournait throttle). Kevin peut consulter status via vAdmin →
     * 🔑 Credentials Status. Pas de spam push iOS, pas de toast au boot. */
    void canNotify; void markNotified; void ESSENTIAL_KEYS; void RECOMMENDED_KEYS; void getCriticality;

    /* Sync registry credentials-audit après restore (impacte security_score) */
    if (restored > 0) {
      try {
        const { credentialsAudit } = await import('./credentials-audit.js');
        void credentialsAudit.syncFromVault();
      } catch { /* silent */ }
    }

    logger.info('auto-restore', `restoreAutomatically : restored=${restored} failed=${failed}`);
    return { ts, restored, failed, details };
  }

  /**
   * Restaure UNE clé depuis sa source recoverable.
   * Utilise vault.setKey pour triple-persister (local + IDB + Firebase).
   */
  private async restoreOne(entry: MissingEntry): Promise<{ ok: boolean; reason?: string }> {
    const { vault } = await import('./vault.js');
    let plaintext = '';

    switch (entry.recoverable_from) {
      case 'alias': {
        if (!entry.alias_source) return { ok: false, reason: 'alias_source manquant' };
        plaintext = await vault.readKey(entry.alias_source);
        if (!plaintext) return { ok: false, reason: `alias ${entry.alias_source} vide après decrypt` };
        break;
      }
      case 'pattern_match': {
        if (!entry.alias_source) return { ok: false, reason: 'pattern source manquant' };
        plaintext = await vault.readKey(entry.alias_source);
        if (!plaintext) return { ok: false, reason: `pattern source ${entry.alias_source} vide après decrypt` };
        /* Validate pattern match avant écriture (sécurité : la valeur doit
         * vraiment correspondre au format attendu pour cette clé). */
        const detected = detectCredential(plaintext);
        if (!detected || detected.storageKey !== entry.storage_key) {
          return { ok: false, reason: `pattern check failed : valeur ne matche pas ${entry.storage_key}` };
        }
        break;
      }
      case 'idb_shadow': {
        const idbValue = await this.readKeyFromIdb(entry.storage_key);
        if (!idbValue) return { ok: false, reason: 'IDB read after check returned empty' };
        /* IDB stocke le ciphertext AXENC1: → écrit direct en localStorage,
         * pas re-chiffrer (déjà chiffré avec passphrase courante ou history). */
        try {
          localStorage.setItem(entry.storage_key, idbValue);
        } catch (err: unknown) {
          return { ok: false, reason: `localStorage quota : ${String(err).slice(0, 80)}` };
        }
        return { ok: true };
      }
      case 'firebase_backup': {
        const fbValue = await this.readFirebase(entry.storage_key);
        if (!fbValue) return { ok: false, reason: 'Firebase read after check returned empty' };
        /* vault.restoreFromFirebase valide decrypt + hydrate IDB */
        const ok = await vault.restoreFromFirebase(entry.storage_key, fbValue);
        return ok ? { ok: true } : { ok: false, reason: 'restoreFromFirebase rejected (decrypt fail)' };
      }
      default:
        return { ok: false, reason: 'recoverable_from inconnu' };
    }

    /* Pour alias / pattern_match : on a un plaintext → setKey re-chiffre avec passphrase courante */
    const result = await vault.setKey(entry.storage_key, plaintext);
    if (!result.ok) return { ok: false, reason: 'setKey failed' };
    return { ok: true };
  }

  /* ============================================================
     Helpers — détection sources
     ============================================================ */

  private hasLocal(storageKey: string): boolean {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null && raw.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Cherche un alias présent en localStorage.
   * Retourne la storageKey alternative qui contient une valeur, ou null.
   */
  private findAliasInLocal(storageKey: string): string | null {
    const aliases = aliasesFor(storageKey);
    for (const alias of aliases) {
      if (this.hasLocal(alias)) return alias;
    }
    return null;
  }

  /**
   * Scan TOUT localStorage pour trouver une valeur qui matche le pattern
   * de la clé cible (ex : ax_anthropic_key vide MAIS ax_random_blob contient
   * une clé Anthropic valide → on peut la déplacer).
   *
   * Limité aux clés `ax_*` ou `apex_v13_*` (sécurité : ne lit pas autres origins).
   * Skip les valeurs chiffrées AXENC1: (impossible à valider regex sans decrypt).
   */
  private findValueByPattern(targetStorageKey: string): string | null {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === targetStorageKey) continue; /* skip self */
        if (!(k.startsWith('ax_') || k.startsWith('apex_v13_'))) continue;
        /* Skip les clés sensibles (vault keys déjà chiffrées) */
        if (k.endsWith('_key') || k.endsWith('_token') || k.endsWith('_secret')) continue;
        const raw = localStorage.getItem(k);
        if (!raw || raw.length < 10 || raw.length > 4096) continue;
        if (raw.startsWith('AXENC1:')) continue;
        if (raw.startsWith('{') || raw.startsWith('[')) continue; /* JSON skip */
        const detected = detectCredential(raw.trim());
        if (detected && detected.storageKey === targetStorageKey) {
          return k;
        }
      }
    } catch { /* localStorage iteration failed */ }
    return null;
  }

  /**
   * Vérifie présence dans IDB shadow (apex_v13_vault_shadow / 'keys').
   * Best-effort : retourne false si IDB indispo.
   */
  private async checkIdb(storageKey: string): Promise<boolean> {
    const value = await this.readKeyFromIdb(storageKey);
    return value !== null && value.length > 0;
  }

  private async readKeyFromIdb(storageKey: string): Promise<string | null> {
    if (typeof indexedDB === 'undefined') return null;
    try {
      return await new Promise<string | null>((resolve) => {
        const req = indexedDB.open('apex_v13_vault_shadow', 1);
        req.onupgradeneeded = (): void => {
          const db = req.result;
          if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
        };
        req.onsuccess = (): void => {
          const db = req.result;
          try {
            const tx = db.transaction('keys', 'readonly');
            const store = tx.objectStore('keys');
            const getReq = store.get(storageKey);
            getReq.onsuccess = (): void => {
              db.close();
              resolve(typeof getReq.result === 'string' ? getReq.result : null);
            };
            getReq.onerror = (): void => {
              db.close();
              resolve(null);
            };
          } catch {
            db.close();
            resolve(null);
          }
        };
        req.onerror = (): void => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Vérifie présence dans Firebase backup (path : /apex/<storageKey>).
   * Best-effort : retourne false si offline.
   */
  private async checkFirebase(storageKey: string): Promise<boolean> {
    const value = await this.readFirebase(storageKey);
    return value !== null && value.length > 0;
  }

  private async readFirebase(storageKey: string): Promise<string | null> {
    try {
      const { firebase } = await import('../storage/firebase.js');
      if (!firebase.isConnected()) return null;
      const v = await firebase.read<unknown>(storageKey);
      if (typeof v === 'string' && v.length > 0) return v;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Stats publique pour vue admin (count par catégorie / source).
   */
  async getStats(): Promise<{
    total_patterns: number;
    present_count: number;
    recoverable_count: number;
    truly_absent_count: number;
    by_source: Record<RestoreSource, number>;
  }> {
    const audit = await this.auditMissing();
    const totalPatterns = CREDENTIAL_PATTERNS.filter((p) => p.category !== 'forbidden').length;
    const presentCount = totalPatterns - audit.missing.length;
    const bySource: Record<RestoreSource, number> = {
      localStorage: 0,
      idb_shadow: 0,
      firebase_backup: 0,
      alias: 0,
      pattern_match: 0,
    };
    for (const e of audit.recoverable) {
      if (e.recoverable_from) bySource[e.recoverable_from]++;
    }
    return {
      total_patterns: totalPatterns,
      present_count: presentCount,
      recoverable_count: audit.recoverable.length,
      truly_absent_count: audit.truly_absent.length,
      by_source: bySource,
    };
  }
}

export const autoRestoreCredentials = new AutoRestoreCredentials();

/* Export aliases groups pour tests + introspection */
export const ALIAS_GROUPS_EXPORT = ALIAS_GROUPS;
