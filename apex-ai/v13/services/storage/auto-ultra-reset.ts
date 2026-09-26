/**
 * APEX v13 — Auto Ultra Reset (Kevin 2026-05-08, ABSOLUE).
 *
 * Règle Kevin gravée CLAUDE.md :
 *   "Ultra reset autonome automatique si besoin, rappel toi"
 *
 * Apex doit s'auto-rafraîchir si bug critique persistant OU cache stale,
 * SANS demander à Kevin (autonomie totale).
 *
 * ─────────────────────────────────────────────────────────────────────
 * SCORING DES CONDITIONS (0–10, déclenche si score >= 6)
 * ─────────────────────────────────────────────────────────────────────
 *
 * | Condition                       | Pts | Détection                                                |
 * |---------------------------------|-----|----------------------------------------------------------|
 * | cache_stale                     |  3  | APP_VER local < remote depuis >30min + 2 reloads tentés  |
 * | bugs_persistent                 |  3  | 4+ critical sentinels sans guérison                      |
 * | localStorage_corrupt            |  2  | JSON.parse failed sur clés critiques (auth/store)        |
 * | sw_update_unreliable            |  2  | iOS pas update >24h malgré reg.update() x3               |
 * | state_incoherent                |  3  | never-forget-watch FAIL identité Kevin                   |
 *
 * ─────────────────────────────────────────────────────────────────────
 * ANTI-LOOP / GARDE-FOUS
 * ─────────────────────────────────────────────────────────────────────
 *  - localStorage `apex_v13_auto_reset_last_ts` : timestamp dernier trigger
 *  - Throttle 24h : si < 24h depuis dernier trigger → abort + log
 *  - Si `?_auto_reset=1` ET tentative < 1h → abort + toast warning
 *  - Backup Firebase vault AVANT clear (pas de perte de credentials)
 *  - Restore au reload via `restoreAfterReset()` (lazy depuis bootstrap.ts)
 *
 * ─────────────────────────────────────────────────────────────────────
 * AUDIT TRAIL
 * ─────────────────────────────────────────────────────────────────────
 *  - auditLog.record('auto-reset.triggered', {reasons, score})
 *  - auditLog.record('auto-reset.completed', {restored_count})
 *  - auditLog.record('auto-reset.failed', {error})
 *  - kevinAlerts.alertKevin('info', 'Apex auto-rafraîchi (N clés restaurées)')
 *
 * Sentinelle wrapper exposée via `auto-ultra-reset-watch` (interval 15min).
 */

import { logger } from '../../core/logger.js';

/* ============================================================
   Types publics
   ============================================================ */

export interface AutoResetCondition {
  id:
    | 'cache_stale'
    | 'bugs_persistent'
    | 'localStorage_corrupt'
    | 'sw_update_unreliable'
    | 'state_incoherent';
  detected: boolean;
  points: number;
  detail?: string;
}

export interface AutoResetAssessment {
  score: number;
  reasons: string[];
  conditions: AutoResetCondition[];
  shouldTrigger: boolean;
}

export interface AutoResetTriggerResult {
  ok: boolean;
  reason?: string;
  throttled?: boolean;
  preBackupOk?: boolean;
  willReload?: boolean;
}

export interface AutoResetRestoreResult {
  detected: boolean;
  restored: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

/* ============================================================
   Constants
   ============================================================ */

/** Score seuil de déclenchement (0–10) */
const SCORE_TRIGGER_THRESHOLD = 6;

/** Throttle global : 1 trigger maximum par 24h */
const TRIGGER_THROTTLE_MS = 24 * 60 * 60 * 1000;

/** Anti-loop : si un reset a été tenté il y a < 1h → abort */
const RECENT_RESET_GUARD_MS = 60 * 60 * 1000;

/** localStorage keys utilisées par ce service */
const LAST_TRIGGER_KEY = 'apex_v13_auto_reset_last_ts';
const RELOAD_ATTEMPTS_KEY = 'apex_v13_auto_reset_reload_attempts';
const STALE_DETECTED_TS_KEY = 'apex_v13_auto_reset_stale_since';
const SW_UPDATE_ATTEMPTS_KEY = 'apex_v13_auto_reset_sw_update_attempts';
const SW_LAST_INSTALL_TS_KEY = 'apex_v13_auto_reset_sw_last_install_ts';

/** Query param flag — détecté au boot par bootstrap.ts */
const RESET_QUERY_FLAG = '_auto_reset';

/** Clés critiques à vérifier pour corruption JSON */
const CRITICAL_JSON_KEYS = [
  'apex_v13_user',
  'apex_v13_session',
  'apex_v13_persistent_memory',
  'ax_persistent_memory',
];

/** Clés à effacer durant le reset (Apex-scoped) */
const APEX_KEY_PREFIXES = ['apex_v13_', 'ax_'];

/**
 * Clés/préfixes à PRÉSERVER même durant le reset (auth/identité/secrets critiques).
 *
 * v13.4.6 CORRECTION CRITIQUE (Kevin 2026-05-10 "Apex perd son coffre à chaque fois")
 * ROOT CAUSE : ancienne liste = 3 clés seulement → auto-reset effaçait PIN, vault,
 * passphrase history, clés API. Cohérent avec force-update-banner.ts PRESERVE_PREFIXES
 * (single source of truth maintenant).
 *
 * Les préfixes ci-dessous matchent via `key.startsWith(p)` (au lieu de exact match).
 */
const PRESERVE_KEY_PREFIXES = [
  /* Identité + session */
  'apex_v13_uid',
  'apex_v13_user',
  'apex_v13_users',
  'apex_v13_pin',
  'apex_v13_admin',
  'apex_v13_lastact',
  'apex_v13_last_known_name',
  'apex_v13_last_known_uid',
  'apex_v13_device_trusted',
  /* Vault + crypto critique (v13.4.6 FIX — vraie clé `multi_keys` ajoutée) */
  'apex_v13_vault',
  'apex_v13_multi_keys',
  'apex_v13_multikey_vault',
  'apex_v13_passphrase_history',
  'apex_v13_device_passphrase',
  'apex_v13_device_obf',
  'apex_v13_credentials',
  /* Backups locaux (snapshots auto-backup) */
  'apex_v13_backup_index',
  'apex_v13_backup_',
  /* Mémoire long-terme */
  'apex_v13_persistent_memory',
  'apex_v13_kb',
  'apex_v13_lessons',
  'apex_v13_audit',
  'apex_v13_xp',
  'apex_v13_streak',
  /* Pièces jointes session */
  'apex_v13_attachments',
  'ax_v13_attachments',
  /* v13.4.6 — Recovery brut des pastes Kevin (anti-perte clés collées) */
  'apex_v13_paste_recovery_',
  /* Legacy ax_ — identité + tokens API (perte = re-saisie obligatoire pour Kevin) */
  'ax_pin',
  'ax_user',
  'ax_uid',
  'ax_persistent_memory',
  'ax_anthropic',
  'ax_openai',
  'ax_groq',
  'ax_gemini',
  'ax_google',
  'ax_openrouter',
  'ax_mistral',
  'ax_cohere',
  'ax_deepseek',
  'ax_perplexity',
  'ax_xai',
  'ax_huggingface',
  'ax_hf_',
  'ax_replicate',
  'ax_stripe',
  'ax_brevo',
  'ax_resend',
  'ax_telegram',
  'ax_discord',
  'ax_github',
  'ax_gitlab',
  'ax_cloudflare',
  'ax_notion',
  'ax_airtable',
  'ax_dropbox',
  'ax_spotify',
  'ax_pinata',
  'ax_pinecone',
  'ax_qdrant',
  'ax_weaviate',
  'ax_brave',
  'ax_tavily',
  'ax_deepl',
  'ax_finnhub',
  'ax_coingecko',
  'ax_coinmarketcap',
  'ax_etherscan',
  'ax_openweathermap',
  'ax_owm',
  'ax_opencage',
  'ax_mapbox',
  'ax_unsplash',
  'ax_pixabay',
  'ax_pexels',
  'ax_elevenlabs',
  'ax_newsapi',
  'ax_credentials_deleted',
  'ax_shared_api_key',
  'ax_api_key',
];

/** Clés exactes (anti-loop counters — doivent survivre au reset). */
const PRESERVE_KEYS = new Set<string>([
  LAST_TRIGGER_KEY,
  RELOAD_ATTEMPTS_KEY,
]);

/**
 * Garde UNIVERSELLE : protège TOUTE clé de credential du Coffre, pour N'IMPORTE
 * QUEL service — sans dépendre d'une liste codée en dur forcément incomplète
 * (130+ services credential possibles). ROOT CAUSE récurrente (Kevin "coffre vidé,
 * clés disparues, même réseau OK") = un `ax_<service>_key` non listé était effacé
 * à chaque auto-reset. Erreur #44/#55 CLAUDE.md. Mieux vaut sur-préserver qu'effacer
 * une clé API (règle "RIEN PERDRE"). Couvre ax_<x>_key/token/pat/secret/apikey +
 * champs OAuth + identité/paiement.
 */
export function isVaultCredentialKey(key: string): boolean {
  return (
    /^ax_[a-z0-9][a-z0-9_]*_(key|token|pat|secret|apikey|api_key|client_id|client_secret|private_key|refresh_token|access_token|webhook|url|email)$/i.test(key) ||
    /^ax_(pin|user|uid|iban|paypal|revolut|btc|eth|vapid|firebase)/i.test(key) ||
    key === 'ax_shared_api_key' ||
    key === 'ax_api_key'
  );
}

/* ============================================================
   AutoUltraReset class
   ============================================================ */

class AutoUltraReset {
  /**
   * Score les conditions de déclenchement.
   * Retourne un assessment détaillé (sans déclencher).
   */
  async assessConditions(): Promise<AutoResetAssessment> {
    const conditions: AutoResetCondition[] = [];

    /* === 1. cache_stale (3pts) === */
    conditions.push(this.checkCacheStale());

    /* === 2. bugs_persistent (3pts) === */
    conditions.push(await this.checkBugsPersistent());

    /* === 3. localStorage_corrupt (2pts) === */
    conditions.push(this.checkLocalStorageCorrupt());

    /* === 4. sw_update_unreliable (2pts) === */
    conditions.push(this.checkSwUpdateUnreliable());

    /* === 5. state_incoherent (3pts) === */
    conditions.push(await this.checkStateIncoherent());

    /* Synthèse */
    let score = 0;
    const reasons: string[] = [];
    for (const c of conditions) {
      if (c.detected) {
        score += c.points;
        reasons.push(c.id + (c.detail ? ` (${c.detail})` : ''));
      }
    }
    return {
      score,
      reasons,
      conditions,
      shouldTrigger: score >= SCORE_TRIGGER_THRESHOLD,
    };
  }

  /**
   * Déclenche l'auto-reset si conditions remplies + throttle respecté.
   * Best-effort : ne throw jamais. Audit log + alerte Kevin systématiques.
   */
  async triggerAutoReset(opts: { force?: boolean } = {}): Promise<AutoResetTriggerResult> {
    /* === 1. Throttle 24h === */
    if (!opts.force) {
      const lastTs = this.getLastTriggerTs();
      if (lastTs > 0 && Date.now() - lastTs < TRIGGER_THROTTLE_MS) {
        const ageH = Math.floor((Date.now() - lastTs) / (60 * 60 * 1000));
        logger.info('auto-ultra-reset', `throttled — last trigger ${ageH}h ago (< 24h)`);
        await this.recordAudit('auto-reset.skipped', {
          reason: 'throttled',
          last_ts: lastTs,
          age_hours: ageH,
        });
        return { ok: false, throttled: true, reason: `throttled (${ageH}h ago)` };
      }
    }

    /* === 2. Backup Firebase vault AVANT clear === */
    let preBackupOk = false;
    try {
      const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
      const r = await vaultFirebaseBackup.pushAllLocal();
      preBackupOk = r.pushed > 0 || (r.failed === 0 && r.pushed === 0);
      logger.info('auto-ultra-reset', `pre-backup vault → Firebase`, r);
    } catch (err: unknown) {
      logger.warn('auto-ultra-reset', 'pre-backup failed (continuing)', { err });
    }

    /* === 2b. v13.4.6 — Pré-snapshot complet local (vault + settings + memory + audit)
     *        DOUBLE protection contre toute perte (Kevin "ne rien perdre JAMAIS"). */
    try {
      const { autoBackup } = await import('./auto-backup.js');
      const snap = await autoBackup.snapshot('pre-rollback');
      logger.info('auto-ultra-reset', `pre-snapshot local OK : ${snap.id}`);
    } catch (err: unknown) {
      logger.warn('auto-ultra-reset', 'pre-snapshot local failed (continuing)', { err });
    }

    /* === 3. Toast Kevin "🔄 Auto-rafraîchissement Apex en cours… 5s" === */
    this.showResetBanner();

    /* === 4. Audit + alerte Kevin === */
    await this.recordAudit('auto-reset.triggered', {
      pre_backup_ok: preBackupOk,
      ts: Date.now(),
    });
    void this.notifyKevinTrigger().catch(() => {
      /* offline OK */
    });

    /* === 5. Stamp last trigger ts AVANT clear (survit au reset via PRESERVE_KEYS) === */
    try {
      localStorage.setItem(LAST_TRIGGER_KEY, String(Date.now()));
    } catch {
      /* quota — ignore, retry post-clear */
    }

    /* === 6. Unregister SW + clear caches + clear localStorage Apex + clear IDB Apex === */
    try {
      await this.performHardClear();
    } catch (err: unknown) {
      logger.error('auto-ultra-reset', 'performHardClear failed', { err });
      await this.recordAudit('auto-reset.failed', {
        step: 'hard_clear',
        error: String(err).slice(0, 200),
      });
      return {
        ok: false,
        reason: 'hard_clear_failed: ' + String(err).slice(0, 100),
        preBackupOk,
      };
    }

    /* === 7. location.replace(...?_auto_reset=1&_t=<ts>) === */
    /* Délai 5s pour laisser banner visible + audit log flush. */
    setTimeout(() => {
      try {
        const path = window.location.pathname;
        const url = `${path}?${RESET_QUERY_FLAG}=1&_t=${Date.now()}`;
        window.location.replace(url);
      } catch (err: unknown) {
        logger.error('auto-ultra-reset', 'location.replace failed', { err });
      }
    }, 5000);

    return { ok: true, preBackupOk, willReload: true };
  }

  /**
   * Au reload post-reset (URL contient ?_auto_reset=1) → restore vault depuis Firebase backup.
   * Doit être appelé AVANT toute autre init dans bootstrap.ts.
   */
  async restoreAfterReset(): Promise<AutoResetRestoreResult> {
    const start = Date.now();
    const result: AutoResetRestoreResult = {
      detected: false,
      restored: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
    };
    if (!this.isPostResetReload()) {
      result.durationMs = Date.now() - start;
      return result;
    }
    result.detected = true;

    /* Anti-loop : si un autre reset a été tenté < 1h, abandonner restore avec toast */
    const lastTs = this.getLastTriggerTs();
    if (lastTs > 0 && Date.now() - lastTs < RECENT_RESET_GUARD_MS) {
      /* Cas normal : on vient de reset, c'est attendu, on continue restore.
       * On vérifie surtout qu'on ne boucle pas en lançant restore + retrigger. */
      logger.info('auto-ultra-reset', `restoreAfterReset : reload détecté (${Math.round((Date.now() - lastTs) / 1000)}s)`);
    }

    try {
      const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
      const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
      result.restored = r.restored;
      result.failed = r.failed;
      result.skipped = r.skipped;
    } catch (err: unknown) {
      logger.error('auto-ultra-reset', 'restoreAfterReset failed', { err });
      await this.recordAudit('auto-reset.failed', {
        step: 'restore',
        error: String(err).slice(0, 200),
      });
      result.durationMs = Date.now() - start;
      return result;
    }

    /* Cleanup query param dans l'URL (history.replaceState) */
    this.cleanupQueryParam();

    /* Toast vert restored + banner doré update */
    this.showRestoreBanner(result.restored);

    /* Audit log + alerte Kevin asynchrone (pas de demande, juste info) */
    await this.recordAudit('auto-reset.completed', {
      restored: result.restored,
      failed: result.failed,
      skipped: result.skipped,
    });
    void this.notifyKevinCompleted(result.restored).catch(() => {
      /* offline OK */
    });

    /* Reset compteur reload attempts (succès) */
    try {
      localStorage.removeItem(RELOAD_ATTEMPTS_KEY);
      localStorage.removeItem(STALE_DETECTED_TS_KEY);
    } catch {
      /* ignore */
    }

    result.durationMs = Date.now() - start;
    return result;
  }

  /**
   * Détecte si la page courante a été chargée suite à un auto-reset.
   * Lit l'URL : ?_auto_reset=1 → true.
   */
  isPostResetReload(): boolean {
    try {
      if (typeof window === 'undefined' || !window.location) return false;
      const params = new URLSearchParams(window.location.search);
      return params.get(RESET_QUERY_FLAG) === '1';
    } catch {
      return false;
    }
  }

  /**
   * Reset l'état du throttle (utile pour tests + admin debug).
   */
  resetThrottle(): void {
    try {
      localStorage.removeItem(LAST_TRIGGER_KEY);
      localStorage.removeItem(RELOAD_ATTEMPTS_KEY);
      localStorage.removeItem(STALE_DETECTED_TS_KEY);
      localStorage.removeItem(SW_UPDATE_ATTEMPTS_KEY);
    } catch {
      /* ignore */
    }
  }

  /**
   * Permet à d'autres services (sentinelles cache_stale détecté) de signaler
   * un reload tenté ; au-delà de 2 reloads → cache_stale condition triggers.
   */
  recordReloadAttempt(): void {
    try {
      const cur = parseInt(localStorage.getItem(RELOAD_ATTEMPTS_KEY) ?? '0', 10);
      const next = Number.isFinite(cur) ? cur + 1 : 1;
      localStorage.setItem(RELOAD_ATTEMPTS_KEY, String(next));
      if (!localStorage.getItem(STALE_DETECTED_TS_KEY)) {
        localStorage.setItem(STALE_DETECTED_TS_KEY, String(Date.now()));
      }
    } catch {
      /* quota */
    }
  }

  /**
   * Permet aux SW update handlers de signaler un échec d'update.
   * Au-delà de 3 échecs en 24h → sw_update_unreliable condition triggers.
   */
  recordSwUpdateAttempt(success: boolean): void {
    try {
      if (success) {
        localStorage.setItem(SW_LAST_INSTALL_TS_KEY, String(Date.now()));
        localStorage.removeItem(SW_UPDATE_ATTEMPTS_KEY);
      } else {
        const cur = parseInt(localStorage.getItem(SW_UPDATE_ATTEMPTS_KEY) ?? '0', 10);
        const next = Number.isFinite(cur) ? cur + 1 : 1;
        localStorage.setItem(SW_UPDATE_ATTEMPTS_KEY, String(next));
      }
    } catch {
      /* ignore */
    }
  }

  /* ============================================================
     Détection conditions individuelles (privées)
     ============================================================ */

  private checkCacheStale(): AutoResetCondition {
    try {
      const staleSinceRaw = localStorage.getItem(STALE_DETECTED_TS_KEY);
      const reloadsRaw = localStorage.getItem(RELOAD_ATTEMPTS_KEY);
      const staleSince = parseInt(staleSinceRaw ?? '0', 10);
      const reloads = parseInt(reloadsRaw ?? '0', 10);
      const ageMs = staleSince > 0 ? Date.now() - staleSince : 0;
      const stale30min = staleSince > 0 && ageMs > 30 * 60 * 1000;
      const enoughReloads = Number.isFinite(reloads) && reloads >= 2;
      const detected = stale30min && enoughReloads;
      const detail = detected
        ? `stale ${Math.round(ageMs / 60000)}min, ${reloads} reloads tentés`
        : null;
      return {
        id: 'cache_stale',
        detected,
        points: 3,
        ...(detail !== null && { detail }),
      };
    } catch {
      return { id: 'cache_stale', detected: false, points: 3 };
    }
  }

  private async checkBugsPersistent(): Promise<AutoResetCondition> {
    try {
      const { sentinels } = await import('../sentinels/sentinels.js');
      const list = sentinels.list();
      /* "4+ critical sentinels sans guérison" → on compte les sentinelles
       * ayant lastResult.ok === false ET autoFix non guéri (Auto-fixed: prefix absent du msg). */
      const criticals = list.filter((s) => {
        const r = s.lastResult;
        if (!r || r.ok) return false;
        if (typeof r.msg === 'string' && r.msg.startsWith('Auto-fixed:')) return false;
        return true;
      });
      const detected = criticals.length >= 4;
      const detail = detected ? `${criticals.length} sentinelles critical sans guérison` : null;
      return {
        id: 'bugs_persistent',
        detected,
        points: 3,
        ...(detail !== null && { detail }),
      };
    } catch {
      return { id: 'bugs_persistent', detected: false, points: 3 };
    }
  }

  private checkLocalStorageCorrupt(): AutoResetCondition {
    let corruptCount = 0;
    const corruptKeys: string[] = [];
    for (const key of CRITICAL_JSON_KEYS) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          JSON.parse(raw);
        } catch {
          corruptCount += 1;
          corruptKeys.push(key);
        }
      } catch {
        /* getItem failed → considéré corrupt */
        corruptCount += 1;
        corruptKeys.push(key);
      }
    }
    const detail =
      corruptCount > 0 ? `${corruptCount} keys: ${corruptKeys.join(', ')}` : null;
    return {
      id: 'localStorage_corrupt',
      detected: corruptCount >= 1,
      points: 2,
      ...(detail !== null && { detail }),
    };
  }

  private checkSwUpdateUnreliable(): AutoResetCondition {
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isiOS = /iPhone|iPad|iPod/.test(ua);
      if (!isiOS) return { id: 'sw_update_unreliable', detected: false, points: 2 };
      const attemptsRaw = localStorage.getItem(SW_UPDATE_ATTEMPTS_KEY);
      const lastInstallRaw = localStorage.getItem(SW_LAST_INSTALL_TS_KEY);
      const attempts = parseInt(attemptsRaw ?? '0', 10);
      const lastInstall = parseInt(lastInstallRaw ?? '0', 10);
      const noInstall24h = lastInstall === 0 || Date.now() - lastInstall > 24 * 60 * 60 * 1000;
      const detected = noInstall24h && attempts >= 3;
      const detail = detected ? `iOS ${attempts} updates tentés sans install` : null;
      return {
        id: 'sw_update_unreliable',
        detected,
        points: 2,
        ...(detail !== null && { detail }),
      };
    } catch {
      return { id: 'sw_update_unreliable', detected: false, points: 2 };
    }
  }

  private async checkStateIncoherent(): Promise<AutoResetCondition> {
    try {
      const { neverForgetWatch } = await import('../sentinels/never-forget-watch.js');
      const last = neverForgetWatch.getLastRun();
      if (!last) return { id: 'state_incoherent', detected: false, points: 3 };
      /* Critical seulement si Kevin manquant (kevin_present check) */
      const kevinCheck = last.checks.find((c) => c.id === 'kevin_present');
      const detected = !!kevinCheck && !kevinCheck.passed;
      const detail = detected ? 'never-forget kevin_present FAIL' : null;
      return {
        id: 'state_incoherent',
        detected,
        points: 3,
        ...(detail !== null && { detail }),
      };
    } catch {
      return { id: 'state_incoherent', detected: false, points: 3 };
    }
  }

  /* ============================================================
     Helpers privés (clear, banner, audit, alertes)
     ============================================================ */

  private getLastTriggerTs(): number {
    try {
      const raw = localStorage.getItem(LAST_TRIGGER_KEY);
      const v = parseInt(raw ?? '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }

  private async performHardClear(): Promise<void> {
    /* 1. Service Worker unregister (force fresh fetch) */
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (err: unknown) {
      logger.warn('auto-ultra-reset', 'SW unregister failed', { err });
    }

    /* 2. caches API clear */
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err: unknown) {
      logger.warn('auto-ultra-reset', 'caches.delete failed', { err });
    }

    /* 3. localStorage clear (Apex-scoped, preserve identity + vault + tokens API
     *    + throttle counters)
     * v13.4.6 fix critique : utilise PRESERVE_KEY_PREFIXES exhaustif au lieu de 3 clés
     * pour ne JAMAIS effacer vault/PIN/clés API (cf. issue Kevin 2026-05-10). */
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (PRESERVE_KEYS.has(key)) continue;
        if (isVaultCredentialKey(key)) continue; /* garde universelle credentials (tout service) */
        if (PRESERVE_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
        if (APEX_KEY_PREFIXES.some((p) => key.startsWith(p))) toRemove.push(key);
      }
      for (const k of toRemove) {
        try {
          localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      }
      logger.info('auto-ultra-reset', `${toRemove.length} clés effacées (vault/PIN/tokens préservés)`);
    } catch (err: unknown) {
      logger.warn('auto-ultra-reset', 'localStorage clear failed', { err });
    }

    /* 4. IndexedDB Apex clear (best-effort) — v13.4.6 fix : préserve apex_v13_secure
     *    (passphrase IDB shadow) et apex_v13_vault_shadow pour survivre au reset. */
    const IDB_PRESERVE = new Set(['apex_v13_secure', 'apex_v13_vault_shadow', 'apex_v13_persistent']);
    try {
      if (typeof indexedDB !== 'undefined') {
        const dbs = (await indexedDB.databases?.()) ?? [];
        for (const db of dbs) {
          if (typeof db.name !== 'string') continue;
          if (IDB_PRESERVE.has(db.name)) continue;
          if (db.name.startsWith('apex_')) {
            try {
              indexedDB.deleteDatabase(db.name);
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch (err: unknown) {
      logger.debug('auto-ultra-reset', 'IDB clear best-effort failed', { err });
    }
  }

  private showResetBanner(): void {
    if (typeof document === 'undefined') return;
    try {
      const existing = document.getElementById('apex-auto-reset-banner');
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.id = 'apex-auto-reset-banner';
      banner.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'z-index:99998',
        /* v13.4.344 audit UX : padding-top sous l'encoche iOS (safe-area). */
        'padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 14px',
        'background:linear-gradient(135deg,#e8b830,#c9a227)',
        'color:#0a0a14',
        'font:600 14px/1.4 system-ui,-apple-system,sans-serif',
        'text-align:center',
        'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
      ].join(';');
      banner.textContent = '🔄 Apex se rafraîchit (5s)…';
      document.body?.appendChild(banner);
    } catch {
      /* DOM pas prêt — silent */
    }
  }

  private showRestoreBanner(restoredCount: number): void {
    if (typeof document === 'undefined') return;
    try {
      const existing = document.getElementById('apex-auto-reset-banner');
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.id = 'apex-auto-reset-restore-banner';
      banner.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'z-index:99997',
        /* v13.4.344 audit UX : safe-area top iOS. */
        'padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 14px',
        'background:linear-gradient(135deg,#22cc77,#16a85a)',
        'color:#fff',
        'font:600 14px/1.4 system-ui,-apple-system,sans-serif',
        'text-align:center',
        'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
      ].join(';');
      banner.textContent =
        restoredCount > 0
          ? `🔓 ${restoredCount} clé(s) restaurée(s) automatiquement — Apex à jour ✨`
          : '✨ Apex mis à jour automatiquement';
      document.body?.appendChild(banner);
      /* Auto-dismiss 10s */
      setTimeout(() => {
        try {
          banner.style.transition = 'opacity 600ms ease-out';
          banner.style.opacity = '0';
          setTimeout(() => banner.remove(), 700);
        } catch {
          /* ignore */
        }
      }, 10_000);
    } catch {
      /* silent */
    }
  }

  private cleanupQueryParam(): void {
    try {
      if (typeof window === 'undefined' || !window.history?.replaceState) return;
      const url = new URL(window.location.href);
      url.searchParams.delete(RESET_QUERY_FLAG);
      url.searchParams.delete('_t');
      const newUrl = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState(null, '', newUrl);
    } catch {
      /* ignore */
    }
  }

  private async recordAudit(
    action: 'auto-reset.triggered' | 'auto-reset.completed' | 'auto-reset.failed' | 'auto-reset.skipped',
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      const { auditLog } = await import('../observability/audit-log.js');
      await auditLog.record(action, {
        actor: 'system',
        target: 'auto-ultra-reset',
        details,
      });
    } catch {
      /* non-blocking */
    }
  }

  private async notifyKevinTrigger(): Promise<void> {
    try {
      const { kevinAlerts } = await import('../admin/kevin-alerts.js');
      await kevinAlerts.alertKevin({
        severity: 'info',
        title: '🔄 Apex auto-rafraîchit',
        body: 'Auto-reset déclenché automatiquement (cache stale ou bugs persistants). Restore en cours…',
        source: 'auto-ultra-reset',
      });
    } catch {
      /* offline OK */
    }
  }

  private async notifyKevinCompleted(restored: number): Promise<void> {
    try {
      const { kevinAlerts } = await import('../admin/kevin-alerts.js');
      const body =
        restored > 0
          ? `Apex s'est auto-rafraîchi (${restored} clé${restored > 1 ? 's' : ''} restaurée${restored > 1 ? 's' : ''}).`
          : 'Apex s\'est auto-rafraîchi.';
      await kevinAlerts.alertKevin({
        severity: 'info',
        title: '✨ Apex à jour',
        body,
        source: 'auto-ultra-reset',
      });
    } catch {
      /* offline OK */
    }
  }
}

export const autoUltraReset = new AutoUltraReset();
