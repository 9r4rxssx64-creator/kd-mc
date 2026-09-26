/**
 * APEX v13 — Vault (coffre clés API)
 *
 * AES-GCM 256 + PBKDF2 200k iterations via WebCrypto natif.
 * 130+ patterns auto-detect (cf. AX_CREDENTIAL_PATTERNS CLAUDE.md).
 *
 * Anti-pattern évité v12.784 :
 * - decrypt() retourne null sur fail JAMAIS le payload chiffré
 *
 * Anti-pattern évité v12.783 :
 * - "plain wins over encrypted" guard côté firebase.ts SSE
 */

import { logger } from '../../core/logger.js';

import { detectCredential, detectAllCredentials, type CredentialPattern } from './credential-patterns.js';

interface EncryptedPayload {
  v: 1;
  iv: string; /* base64 */
  ct: string; /* base64 */
  salt: string;
}

const PREFIX = 'AXENC1:';

/**
 * v13.3.21 (Kevin 2026-05-07 fix "decrypt failed") :
 * Résultat détaillé du decrypt. Permet aux call sites de distinguer
 *   - succès : { ok: true, plaintext, attemptedPassphrases }
 *   - decrypt fail : { ok: false, reason: 'decrypt_failed', encryptedValue, attemptedPassphrases }
 *   - format invalide : { ok: false, reason: 'bad_format' }
 *   - missing passphrase : { ok: false, reason: 'no_passphrase' }
 *
 * Avant : `decryptAuto` retournait null silencieusement → UI affichait toast rouge "decrypt failed"
 * sans action concrète → Kevin bloqué.
 *
 * Après : UI peut proposer "Recolle ta clé Anthropic UNE FOIS, je la re-chiffre" via vault.recover().
 */
export interface DecryptResult {
  ok: boolean;
  plaintext?: string;
  reason?: 'decrypt_failed' | 'bad_format' | 'no_passphrase';
  encryptedValue?: string;
  attemptedPassphrases?: number;
  triedDeviceBound?: boolean;
  triedHistory?: boolean;
}

/* v13.3.21 (Kevin) — Historique des passphrases device-bound récentes.
 * Permet retry si Kevin a changé de PIN ou si la device-bound a drift entre devices.
 * Cap : 3 dernières.  Stocké en localStorage (clair OK : sans crypto matériel utilisable
 * sans la passphrase principale, c'est juste une liste de strings dérivées). */
const PASSPHRASE_HISTORY_KEY = 'apex_v13_passphrase_history';
const PASSPHRASE_HISTORY_MAX = 3;

/* Backward-compat alias — sous-ensemble CURATÉ minimal (≥15 patterns), importé
 * UNIQUEMENT par des tests (vault-final-coverage / vault-critical / ultrareview-fixes) ;
 * AUCUN code feature/service ne l'importe (tous passent par credential-patterns.ts,
 * la liste canonique de 109 patterns). Ce n'est donc PAS un doublon de prod à risque
 * de dérive (leçon #108) mais une fixture de test stable : on la garde volontairement
 * réduite car la liste canonique contient un fourre-tout `[A-Za-z0-9_-]{40,128}` qui
 * casserait l'assertion « sk-ant-* ne matche QUE Anthropic » du fix C7.
 * v13.4.8 fix C7 : OpenAI regex négative lookahead `(?!ant-)` (ne matche pas Anthropic). */
export const CREDENTIAL_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp; key: string }> = [
  { name: 'Anthropic', regex: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/, key: 'ax_anthropic_key' },
  { name: 'OpenAI', regex: /^sk-(?!ant-)[A-Za-z0-9_-]{40,}/, key: 'ax_openai_key' },
  /* v13.4.49 align renames v13.4.42 : Google AI Gemini + ax_gemini_key + ax_github_pat_* distincts */
  { name: 'Google AI Gemini', regex: /^AIza[A-Za-z0-9_-]{33}$/, key: 'ax_gemini_key' },
  { name: 'GitHub PAT classic', regex: /^ghp_[A-Za-z0-9]{36}$/, key: 'ax_github_pat_classic' },
  { name: 'GitHub Fine-grained', regex: /^github_pat_[A-Za-z0-9_]{82,}$/, key: 'ax_github_pat_finegrained' },
  { name: 'Stripe SK', regex: /^sk_(live|test)_[A-Za-z0-9]{24,}/, key: 'ax_stripe_sk' },
  { name: 'Stripe PK', regex: /^pk_(live|test)_[A-Za-z0-9]{24,}/, key: 'ax_stripe_pk' },
  { name: 'Brevo', regex: /^xkeysib-[a-f0-9]+-[A-Za-z0-9]+$/, key: 'ax_brevo_key' },
  { name: 'Resend', regex: /^re_[A-Za-z0-9_]+$/, key: 'ax_resend_key' },
  { name: 'Groq', regex: /^gsk_[A-Za-z0-9]+$/, key: 'ax_groq_key' },
  { name: 'Perplexity', regex: /^pplx-[A-Za-z0-9]+$/, key: 'ax_perplexity_key' },
  { name: 'DeepL', regex: /^[a-f0-9-]+:fx$/, key: 'ax_deepl_key' },
  { name: 'Notion', regex: /^secret_[A-Za-z0-9]+$/, key: 'ax_notion_key' },
  { name: 'Replicate', regex: /^r8_[A-Za-z0-9]+$/, key: 'ax_replicate_key' },
  { name: 'Telegram bot', regex: /^\d{8,}:[A-Za-z0-9_-]{35}$/, key: 'ax_telegram_token' },
];

class Vault {
  private passphrase: string | null = null;
  private watchStarted = false;
  /* v13.4.246 — handle du poll 30s stocké pour être clearable (audit perf : timer zombie). */
  private credWatchInterval: ReturnType<typeof setInterval> | null = null;

  setPassphrase(passphrase: string): void {
    /* v13.3.21 : si une passphrase user était déjà set ET différente,
     * push l'ancienne dans history pour permettre decrypt retry des clés
     * chiffrées avec l'ancienne (sinon Kevin perd toutes ses clés au changement). */
    if (this.passphrase && this.passphrase !== passphrase) {
      this.savePassphraseToHistory(this.passphrase);
      logger.info('vault', '📜 user passphrase rotated → ancienne sauvegardée en history');
    }
    this.passphrase = passphrase;
  }

  /**
   * v13.3.20 FIX KEVIN "Apex oublie ses codes sans cesse" (2026-05-07) :
   * Sentinelle credentials-watch :
   * 1. Storage event listener — détecte effacement externe (autre tab, devtools).
   * 2. Polling 30s — auto-restore depuis IDB shadow si localStorage vidée.
   * 3. Alerte Kevin si effacement détecté (kevin-alerts).
   *
   * Idempotent : multi-call OK (watchStarted guard).
   */
  startCredentialsWatch(): void {
    if (this.watchStarted) return;
    if (typeof window === 'undefined') return;
    this.watchStarted = true;
    /* 1. Storage event listener (cross-tab + devtools manual remove) */
    window.addEventListener('storage', (e) => {
      const key = e.key;
      if (!key) return;
      if (!(key.endsWith('_key') || key.endsWith('_token'))) return;
      if (e.newValue !== null && e.newValue !== '') return; /* Pas un effacement */
      if (!e.oldValue) return; /* Pas de valeur perdue */
      logger.error('vault-watch', `🚨 KEY ERASED via storage event : ${key}`, {
        oldLen: e.oldValue.length,
      });
      /* Auto-restore depuis IDB shadow si possible */
      void this.readKeyFromIdb(key).then((idbValue) => {
        if (idbValue) {
          try {
            localStorage.setItem(key, idbValue);
            logger.info('vault-watch', `✅ ${key} auto-restored from IDB shadow after external erase`);
          } catch (err: unknown) {
            logger.error('vault-watch', `Auto-restore failed for ${key}`, { err });
          }
        }
      }).catch(() => { /* IDB miss — alerte Kevin ci-dessous */ });
      /* Alerte Kevin (best-effort) */
      void import('../admin/kevin-alerts.js').then(({ kevinAlerts }) => {
        const svc = key.replace('ax_', '').replace('_key', '').replace('_token', '');
        void kevinAlerts.alertKevin({
          severity: 'warn',
          title: `🚨 Code ${svc} effacé`,
          body: 'Autre onglet ou devtools. Auto-restore tenté depuis IDB.',
        }).catch(() => { /* ignore */ });
      }).catch(() => { /* ignore */ });
    });
    /* 2. Polling 30s — vérifie credentials critiques toujours présentes
     * v13.4.9 : mise à jour avec les nouvelles storageKeys (rename ax_google_key → ax_gemini_key,
     * ax_github_token → ax_github_pat_classic + apex_v13_multi_keys coffre principal). */
    const VAULT_KEYS_CRITICAL = [
      'apex_v13_multi_keys', /* LE COFFRE central — surveillé en priorité */
      'apex_v13_pin', /* PIN admin Kevin */
      'ax_anthropic_key', 'ax_openai_key', 'ax_groq_key', 'ax_gemini_key',
      'ax_openrouter_key', 'ax_telegram_token',
      'ax_github_pat_classic', 'ax_github_pat_finegrained', 'ax_github_oauth',
      'ax_stripe_sk', 'ax_resend_key', 'ax_brevo_key', 'ax_perplexity_key',
      'ax_xai_key', 'ax_mistral_key', 'ax_cohere_key', 'ax_deepseek_key',
      'ax_pinecone_key', 'ax_replicate_key', 'ax_elevenlabs_key',
      'ax_cloudflare_token', 'ax_openlegi_mcp_token',
    ];
    /* v13.3.51 fix Kevin "j'ai déjà fait poubelle plusieurs fois mais il se remet" :
     * Whitelist deleted volontairement → ne pas restaurer depuis IDB shadow.
     * Stocké dans `ax_credentials_deleted` (array de keys volontairement supprimées). */
    const isDeleted = (key: string): boolean => {
      try {
        const deleted = JSON.parse(localStorage.getItem('ax_credentials_deleted') ?? '[]') as string[];
        return Array.isArray(deleted) && deleted.includes(key);
      } catch { return false; }
    };
    /* v13.4.8 fix C6 — batch les 8 lectures dans UNE seule transaction IDB
     * (au lieu de 8 opens séparés). Réduit la fréquence d'open de 960/h → 120/h.
     * v13.4.246 : handle stocké → clearable via stopCredentialsWatch(). */
    this.credWatchInterval = setInterval(() => {
      void (async () => {
        try {
          const keysToCheck: string[] = [];
          for (const key of VAULT_KEYS_CRITICAL) {
            if (isDeleted(key)) continue;
            if (localStorage.getItem(key)) continue; /* déjà OK */
            keysToCheck.push(key);
          }
          if (keysToCheck.length === 0) return;
          const idbResults = await this.readManyKeysFromIdb(keysToCheck);
          for (const [key, idb] of idbResults) {
            if (!idb) continue;
            try {
              localStorage.setItem(key, idb);
              logger.info('vault-watch', `🔄 ${key} restored from IDB shadow (poll 30s)`);
            } catch { /* quota */ }
          }
        } catch { /* skip */ }
      })();
    }, 30_000);
    /* 3. Pre-flight au boot : batch read aussi.
     * (triple persistence règle Kevin v9.519). */
    void (async () => {
      try {
        const keysToCheck: string[] = [];
        for (const key of VAULT_KEYS_CRITICAL) {
          if (isDeleted(key)) continue;
          if (localStorage.getItem(key)) continue;
          keysToCheck.push(key);
        }
        if (keysToCheck.length === 0) return;
        const idbResults = await this.readManyKeysFromIdb(keysToCheck);
        for (const [key, idb] of idbResults) {
          if (!idb) continue;
          try {
            localStorage.setItem(key, idb);
            logger.info('vault-watch', `🔄 boot pre-flight : ${key} restored from IDB shadow`);
          } catch { /* quota */ }
        }
      } catch { /* skip */ }
      /* v13.4.x — APRÈS la liste critique : restauration UNIVERSELLE de TOUTES les
       * clés du shadow (tout service, pas seulement VAULT_KEYS_CRITICAL). C'est le
       * filet qui récupère un coffre vidé par un reset/clear (Kevin "clés disparues"). */
      try { await this.restoreAllShadowKeys(); } catch { /* skip */ }
    })();
    logger.info('vault-watch', '✅ Credentials watch started (storage event + poll 30s + boot restore)');
  }

  /**
   * v13.4.246 — arrête le poll 30s du credentials-watch (cleanup / teardown / HMR).
   * Idempotent. Permet de relancer proprement via startCredentialsWatch().
   */
  stopCredentialsWatch(): void {
    if (this.credWatchInterval !== null) {
      clearInterval(this.credWatchInterval);
      this.credWatchInterval = null;
    }
    this.watchStarted = false;
  }

  async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: 200_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Génère une passphrase device-bound stable (fallback si user n'a pas set la sienne).
   * NB : moins sécurisé qu'une passphrase user explicite, mais > plaintext.
   * À upgrader vers vraie passphrase user dès que possible (modal Vault).
   */
  private async getDeviceBoundPassphrase(): Promise<string> {
    const KEY = 'apex_v13_device_passphrase_v1';
    /* Sprint 9 v13.0.72 FIX ROOT BUG (Kevin "il a encore oublié ma clé") :
       Au lieu de random device-bound (perdu si clear cache iOS), dérive de PIN admin déterministe.
       PIN admin = stable cross-device (Kevin se souvient toujours).
       Décrypt Firebase backup MARCHE même après clear cache total iPhone. */
    try {
      const adminPinHash = localStorage.getItem('apex_v13_pin');
      if (adminPinHash) {
        /* PBKDF2 derive depuis PIN hash (déterministe, identique sur tous devices) */
        const enc = new TextEncoder();
        const baseKey = await crypto.subtle.importKey(
          'raw', enc.encode(adminPinHash + '_apex_vault_salt_v1'),
          { name: 'PBKDF2' }, false, ['deriveBits'],
        );
        const derived = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode('apex_v13_kdmc_admin'), iterations: 100_000, hash: 'SHA-256' },
          baseKey, 256,
        );
        const derivedB64 = btoa(String.fromCharCode(...new Uint8Array(derived)));
        /* v13.3.21 : si l'ancienne valeur cache était différente, push en history
         * pour permettre decrypt retry des anciennes clés chiffrées avec ancien PIN */
        const previousCached = localStorage.getItem(KEY);
        if (previousCached && previousCached !== derivedB64) {
          this.savePassphraseToHistory(previousCached);
          logger.info('vault', '📜 PIN-derived passphrase rotated → ancienne sauvegardée en history');
        }
        /* Persist localStorage + IDB pour cache (re-derive sur boot suivant) */
        try { localStorage.setItem(KEY, derivedB64); } catch { /* quota */ }
        void this.backupPassphraseToIdb(derivedB64);
        return derivedB64;
      }
    } catch { /* fallback random ci-dessous */ }
    const cached = localStorage.getItem(KEY);
    if (cached) {
      /* Backup en IDB pour résilience clear Safari */
      void this.backupPassphraseToIdb(cached);
      return cached;
    }
    /* Tente restore depuis IDB (survit clear localStorage Safari) */
    try {
      const fromIdb = await this.restorePassphraseFromIdb();
      if (fromIdb) {
        try {
          localStorage.setItem(KEY, fromIdb);
        } catch { /* quota */ }
        return fromIdb;
      }
    } catch { /* ignore */ }
    /* Génère + persiste device-bound (256 bits aléatoires base64) — fallback si pas PIN */
    const random = crypto.getRandomValues(new Uint8Array(32));
    const pass = btoa(String.fromCharCode(...random));
    /* v13.3.21 : si une passphrase cached existait (mais a disparu de localStorage avant
     * d'arriver ici), push en history pour retry decrypt (cas Safari clear cache). */
    try {
      const previousIdb = await this.restorePassphraseFromIdb();
      if (previousIdb && previousIdb !== pass) {
        this.savePassphraseToHistory(previousIdb);
      }
    } catch { /* ignore */ }
    try {
      localStorage.setItem(KEY, pass);
    } catch {
      /* Quota plein, fallback en mémoire seulement */
    }
    /* Backup IDB pour survivre clear Safari */
    void this.backupPassphraseToIdb(pass);
    return pass;
  }

  private async backupPassphraseToIdb(pass: string): Promise<void> {
    try {
      if (!('indexedDB' in globalThis)) return;
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('apex_v13_secure', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('passphrase')) db.createObjectStore('passphrase');
        };
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('passphrase', 'readwrite');
            const store = tx.objectStore('passphrase');
            store.put(pass, 'device_v1');
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          } catch (e) { db.close(); reject(e); }
        };
        req.onerror = () => reject(req.error);
      });
    } catch { /* ignore */ }
  }

  private async restorePassphraseFromIdb(): Promise<string | null> {
    try {
      if (!('indexedDB' in globalThis)) return null;
      return await new Promise<string | null>((resolve) => {
        const req = indexedDB.open('apex_v13_secure', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('passphrase')) db.createObjectStore('passphrase');
        };
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('passphrase', 'readonly');
            const store = tx.objectStore('passphrase');
            const getReq = store.get('device_v1');
            getReq.onsuccess = () => {
              db.close();
              resolve(typeof getReq.result === 'string' ? getReq.result : null);
            };
            getReq.onerror = () => { db.close(); resolve(null); };
          } catch { db.close(); resolve(null); }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Encrypt avec fallback auto device-bound passphrase si user n'a pas set la sienne.
   * Garantit chiffrement TOUJOURS (vs encrypt() qui throw sans passphrase).
   */
  async encryptAuto(plaintext: string): Promise<string> {
    const pass = this.passphrase ?? (await this.getDeviceBoundPassphrase());
    return this.encrypt(plaintext, pass);
  }

  /**
   * Decrypt avec fallback device-bound (essaie passphrase user puis device-bound).
   *
   * v13.3.21 (Kevin "decrypt failed" 2026-05-07) :
   * BACKWARD-COMPAT signature `string | null` préservée pour tous les call sites existants
   * (ai-router, badge-cloner, auto-backup, multi-key-vault) qui font `if (plain === null)`.
   *
   * NOUVEAU : appelle `decryptDetailed()` interne qui retry passphrase historique +
   * device-bound. Si TOUTES tentatives échouent → log warn + retourne null.
   * Pour récupérer le détail (pour UI "Récupérer cette clé") → utiliser decryptDetailed().
   */
  async decryptAuto(encrypted: string): Promise<string | null> {
    const r = await this.decryptDetailed(encrypted);
    return r.ok && r.plaintext !== undefined ? r.plaintext : null;
  }

  /**
   * v13.3.21 (Kevin 2026-05-07 fix "decrypt failed") :
   * Decrypt détaillé avec retry multi-passphrase :
   *   1. Passphrase courante (`getPassphrase()`)
   *   2. Device-bound passphrase (PIN-derivée si admin PIN dispo, sinon random cached)
   *   3. Historique des 3 dernières passphrases device-bound (cas : PIN admin a changé,
   *      ou random device-bound régénérée après clear cache)
   *
   * Retourne objet riche permettant aux call sites de :
   *   - Distinguer "decrypt failed" (recoverable via UI Recolle) vs "bad format" (corruption)
   *   - Afficher action concrète à Kevin au lieu de toast rouge silencieux
   *   - Logger nombre de tentatives pour debug
   */
  async decryptDetailed(encrypted: string): Promise<DecryptResult> {
    /* Format invalide → reason explicite (pas decrypt_failed) */
    if (!encrypted || typeof encrypted !== 'string') {
      return { ok: false, reason: 'bad_format' };
    }
    if (!encrypted.startsWith(PREFIX)) {
      return { ok: false, reason: 'bad_format', encryptedValue: encrypted };
    }
    let attempts = 0;
    let triedDeviceBound = false;
    let triedHistory = false;
    /* 1. Passphrase user explicite (set via Vault modal) */
    if (this.passphrase) {
      attempts += 1;
      const r = await this.decrypt(encrypted, this.passphrase);
      if (r !== null) {
        return { ok: true, plaintext: r, attemptedPassphrases: attempts };
      }
    }
    /* 2. Device-bound (PIN-derived ou random cached) */
    try {
      const devicePass = await this.getDeviceBoundPassphrase();
      attempts += 1;
      triedDeviceBound = true;
      const r = await this.decrypt(encrypted, devicePass);
      if (r !== null) {
        return { ok: true, plaintext: r, attemptedPassphrases: attempts, triedDeviceBound: true };
      }
    } catch { /* device-bound derivation failed → continue history */ }
    /* 3. Historique passphrases device-bound (retry après changement PIN admin / clear cache) */
    try {
      const history = this.loadPassphraseHistory();
      for (const oldPass of history) {
        if (!oldPass) continue;
        attempts += 1;
        triedHistory = true;
        const r = await this.decrypt(encrypted, oldPass);
        if (r !== null) {
          /* RECOVERED via historique : la clé est récupérable avec ancienne passphrase.
           * v13.4.8 fix M7 (Ultra Review) — auto-re-encrypt avec passphrase courante
           * pour aligner la donnée (sinon dépend du history cap=3 qui peut évincer
           * l'ancienne passphrase et rendre la clé permanently undecipherable).
           *
           * Conditions safe :
           *  - user-explicit passphrase (this.passphrase) OU PIN admin hash dispo
           *    → re-encrypt avec une passphrase stable
           *  - sinon on garde l'ancien chiffré (mieux que risquer pire) */
          logger.info('vault', '🔓 decrypt RECOVERED via passphrase history', { attempts });
          /* Re-encrypt best-effort, non bloquant. La caller obtient le plaintext OK
           * indépendamment du résultat du re-encrypt. */
          void this.maybeReencryptAfterHistoryRecovery(encrypted, r).catch((err: unknown) => {
            logger.debug('vault', 'auto re-encrypt after history recovery skipped', { err });
          });
          return { ok: true, plaintext: r, attemptedPassphrases: attempts, triedDeviceBound, triedHistory: true };
        }
      }
    } catch { /* history corrupted → ignore */ }
    /* Toutes tentatives échouées → reason explicite + encryptedValue préservé pour UI recovery */
    logger.warn('vault', 'decryptDetailed FAILED after all retries', {
      attempts,
      triedDeviceBound,
      triedHistory,
    });
    return {
      ok: false,
      reason: attempts === 0 ? 'no_passphrase' : 'decrypt_failed',
      encryptedValue: encrypted,
      attemptedPassphrases: attempts,
      triedDeviceBound,
      triedHistory,
    };
  }

  /**
   * v13.4.8 fix M7 (Ultra Review) — re-encrypt best-effort après recovery via history.
   *
   * Cherche dans localStorage la storageKey qui contient ce blob `encrypted`,
   * puis re-écrit la valeur en re-chiffrant avec la passphrase courante (stable).
   * Best-effort : si on ne trouve pas la clé localStorage (ex: décrypt depuis IDB
   * shadow), on skip. La caller obtient le plaintext OK dans tous les cas.
   */
  private async maybeReencryptAfterHistoryRecovery(encryptedBlob: string, plaintext: string): Promise<void> {
    /* On a besoin d'une passphrase stable pour re-encrypt — sinon on risquerait
     * d'écrire avec une device-bound qui peut elle-même tourner. */
    const hasStablePassphrase = this.passphrase || (() => {
      try { return !!localStorage.getItem('apex_v13_pin'); } catch { return false; }
    })();
    if (!hasStablePassphrase) return;
    /* Cherche la storageKey correspondant à ce blob chiffré */
    let foundKey: string | null = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!(k.startsWith('ax_') || k.startsWith('apex_v13_'))) continue;
        const v = localStorage.getItem(k);
        if (v === encryptedBlob) {
          foundKey = k;
          break;
        }
      }
    } catch { return; }
    if (!foundKey) return;
    /* Re-encrypt + write triple persistence via setKey (qui réencrypte avec
     * encryptAuto = passphrase user OR device-bound courante = stable now). */
    try {
      await this.setKey(foundKey, plaintext);
      logger.info('vault', `🔄 auto re-encrypted ${foundKey} with current passphrase (history recovery flow)`);
      this.audit('reencrypt_after_recovery', { target: foundKey });
    } catch (err: unknown) {
      logger.debug('vault', 'maybeReencryptAfterHistoryRecovery setKey failed', { err });
    }
  }

  /**
   * v13.3.21 (Kevin) — Historique passphrase device-bound.
   * Appelé à chaque rotation de la device-bound (PIN change, clear cache, etc.)
   * pour permettre retry decrypt sur les anciennes valeurs chiffrées.
   *
   * v13.3.88 REVERT P0.4 (Kevin 22:50 "Vault: 11/11 decrypt fail") :
   * v13.3.86 avait introduit XOR-obfuscation `OBF1:` avec device key persistée.
   * Bug : si `apex_v13_device_obf` localStorage effacé (force-update clear),
   * la nouvelle clé générée diffère → xorDeobf retourne garbage → history vide
   * → 11/11 decrypt fail (passphrases inaccessibles).
   * Fix : retour stockage plaintext (sécurité < fonctionnalité). Migration auto
   * lit l'ancien format OBF1: en le tentant best-effort, fallback plaintext.
   */
  private loadPassphraseHistory(): string[] {
    try {
      const raw = localStorage.getItem(PASSPHRASE_HISTORY_KEY);
      if (!raw) return [];
      let payload: string = raw;
      /* v13.3.88 : best-effort lecture OBF1 legacy v13.3.86-87 (peut échouer
       * si device_obf perdu — auto-fallback plaintext si JSON.parse fail). */
      if (raw.startsWith('OBF1:')) {
        const obfKey = localStorage.getItem('apex_v13_device_obf') ?? '';
        if (obfKey) {
          try {
            const decoded = atob(raw.slice(5));
            let out = '';
            for (let i = 0; i < decoded.length; i++) {
              out += String.fromCharCode(decoded.charCodeAt(i) ^ obfKey.charCodeAt(i % obfKey.length));
            }
            payload = out;
          } catch { payload = '[]'; /* corruption → reset */ }
        } else {
          payload = '[]'; /* device_obf perdu → history irrécupérable */
        }
      }
      const parsed = JSON.parse(payload) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x): x is string => typeof x === 'string').slice(0, PASSPHRASE_HISTORY_MAX);
    } catch {
      return [];
    }
  }

  private savePassphraseToHistory(pass: string): void {
    if (!pass) return;
    try {
      const history = this.loadPassphraseHistory();
      const filtered = history.filter((p) => p !== pass);
      filtered.unshift(pass);
      const capped = filtered.slice(0, PASSPHRASE_HISTORY_MAX);
      /* v13.3.88 REVERT P0.4 : retour plaintext JSON pour fiabilité.
       * Le risque XSS est mitigé par CSP nonce + DOMPurify partout. */
      localStorage.setItem(PASSPHRASE_HISTORY_KEY, JSON.stringify(capped));
    } catch { /* quota → ignore */ }
  }

  /**
   * v13.3.21 (Kevin "Récupérer cette clé" UI) :
   * Re-chiffre une clé avec la passphrase courante après que Kevin l'ait recollée.
   * Appelé depuis UI credentials-registry bouton "🔓 Récupérer".
   *
   * Side-effects :
   *   - setKey (triple persistence : localStorage + IDB + Firebase)
   *   - audit log RGPD trail
   *   - alerte Kevin succès
   */
  async recover(storageKey: string, plaintext: string): Promise<{ ok: boolean; reason?: string }> {
    if (!plaintext || !plaintext.trim()) {
      return { ok: false, reason: 'Valeur vide' };
    }
    try {
      const setResult = await this.setKey(storageKey, plaintext.trim());
      if (!setResult.ok) {
        return { ok: false, reason: 'setKey échoué' };
      }
      this.audit('recover', { target: storageKey, details: { persisted: setResult.persisted } });
      logger.info('vault', `✅ recover OK ${storageKey}`, setResult.persisted);
      return { ok: true };
    } catch (err: unknown) {
      logger.error('vault', 'recover failed', { err, storageKey });
      return { ok: false, reason: String(err).slice(0, 200) };
    }
  }

  /**
   * v13.3.21 (Kevin) — Audit decrypt status pour TOUS les credentials AXENC1:.
   * Utilisé par sentinelle decrypt-watch + UI credentials-registry.
   * Retourne : { total, ok, failed, failedKeys[] }
   */
  async auditDecryptHealth(): Promise<{
    total: number;
    ok: number;
    failed: number;
    failedKeys: string[];
  }> {
    const failedKeys: string[] = [];
    let total = 0;
    let ok = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!(k.startsWith('ax_') || k.startsWith('apex_v13_'))) continue;
        if (!(k.endsWith('_key') || k.endsWith('_token') || k.endsWith('_secret'))) continue;
        const raw = localStorage.getItem(k);
        if (!raw || !raw.startsWith(PREFIX)) continue;
        total += 1;
        const r = await this.decryptDetailed(raw);
        if (r.ok) {
          ok += 1;
        } else {
          failedKeys.push(k);
        }
      }
    } catch (err: unknown) {
      logger.warn('vault', 'auditDecryptHealth iteration failed', { err });
    }
    return { total, ok, failed: failedKeys.length, failedKeys };
  }

  /**
   * UNIVERSAL READER : lit localStorage + déchiffre AXENC1: si présent.
   * SOURCE UNIQUE pour tout call site qui veut lire une clé API.
   * Anti-pattern v13.0.12 : call sites lisaient raw → recevaient AXENC1: chiffré.
   * Fix v13.0.16 : tous les services migrent vers vault.readKey().
   * Fix v13.0.20+ Kevin "clés API pas en mémoire" : fallback IDB si localStorage vide.
   */
  async readKey(storageKey: string): Promise<string> {
    try {
      let raw = localStorage.getItem(storageKey);
      /* Fallback IDB shadow (résiste clear localStorage Safari) */
      if (!raw) {
        const fromIdb = await this.readKeyFromIdb(storageKey);
        if (fromIdb) {
          raw = fromIdb;
          /* Re-hydrate localStorage pour accès rapide ultérieur */
          try { localStorage.setItem(storageKey, fromIdb); } catch { /* quota */ }
        }
      }
      if (!raw) return '';
      if (raw.startsWith(PREFIX)) {
        const decrypted = await this.decryptAuto(raw);
        this.audit('read', { target: storageKey, details: { encrypted: true, ok: decrypted !== null } });
        return decrypted ?? '';
      }
      this.audit('read', { target: storageKey, details: { encrypted: false } });
      return raw;
    } catch (err: unknown) {
      this.audit('read_error', { target: storageKey, details: { err: String(err).slice(0, 200) } });
      return '';
    }
  }

  /**
   * SET KEY : persiste en triple redondance (localStorage + IDB shadow + Firebase backup chiffré).
   * Fix v13.0.20+ Kevin "Apex oublie les clés entre sessions".
   * Garantit que la clé survit à : clear cache, réinstallation PWA, switch device.
   */
  async setKey(storageKey: string, plaintext: string): Promise<{ ok: boolean; persisted: { local: boolean; idb: boolean; firebase: boolean } }> {
    const persisted = { local: false, idb: false, firebase: false };
    if (!plaintext) {
      try {
        localStorage.removeItem(storageKey);
        persisted.local = true;
      } catch { /* ignore */ }
      this.audit('delete', { target: storageKey });
      return { ok: true, persisted };
    }
    let encrypted: string;
    try {
      encrypted = await this.encryptAuto(plaintext);
    } catch (err: unknown) {
      logger.error('vault', 'setKey encrypt failed → emergency LOCAL stash (jamais Firebase en clair)', { err, storageKey });
      /* v13.4.x SÉCU (audit externe P0) : si le chiffrement échoue, on NE POUSSE JAMAIS
       * la clé EN CLAIR vers Firebase (base ouverte = fuite). Stash LOCAL uniquement
       * (même niveau de risque que l'historique de passphrase local, jamais synchronisé) ;
       * ré-essai chiffré au prochain boot. On préserve « ne jamais perdre une clé ». */
      try {
        localStorage.setItem(`apex_v13_vault_emergency_${storageKey}`, JSON.stringify({
          plaintext,
          ts: Date.now(),
          reason: 'encrypt_failed',
        }));
        return { ok: true, persisted: { local: true, idb: false, firebase: false } };
      } catch (lsErr: unknown) {
        logger.error('vault', 'setKey emergency LOCAL stash ALSO failed', { lsErr, storageKey });
      }
      return { ok: false, persisted };
    }
    /* 1. localStorage (immédiat) — avec retry sur quota */
    let lsAttempts = 0;
    while (!persisted.local && lsAttempts < 3) {
      try {
        localStorage.setItem(storageKey, encrypted);
        persisted.local = true;
      } catch (err: unknown) {
        lsAttempts++;
        const isQuota = err instanceof Error && /quota|exceeded/i.test(err.message);
        if (isQuota && lsAttempts < 3) {
          /* v13.4.6 : nettoyage agressif avant retry */
          logger.warn('vault', `setKey quota exceeded attempt ${lsAttempts} → aggressive cleanup`, { storageKey });
          try {
            /* Vider les caches non-critiques */
            const trash = ['ax_audit_log', 'ax_silent_log', 'ax_telemetry_in', 'apex_v13_audit', 'apex_v13_logs'];
            for (const k of trash) {
              const v = localStorage.getItem(k);
              if (v && v.length > 5000) localStorage.setItem(k, v.slice(-1000));
            }
          } catch { /* ignore */ }
        } else {
          logger.warn('vault', 'setKey localStorage failed (final)', { err, storageKey });
          break;
        }
      }
    }
    /* 2. IDB shadow (résiste clear cache Safari) */
    if ('indexedDB' in globalThis) {
      try {
        await this.writeKeyToIdb(storageKey, encrypted);
        persisted.idb = true;
      } catch (err: unknown) {
        logger.warn('vault', 'setKey IDB failed', { err, storageKey });
      }
    }
    /* 3. Firebase backup chiffré (survit réinstallation PWA + cross-device) */
    try {
      const { firebase, FB_FIX } = await import('../storage/firebase.js');
      if (FB_FIX.includes(storageKey)) {
        await firebase.write(storageKey, encrypted);
        persisted.firebase = true;
      }
    } catch (err: unknown) {
      logger.warn('vault', 'setKey Firebase failed (offline OK)', { err, storageKey });
    }
    /* 4. v13.4.95 (Kevin "Coffre ne garde toujours pas mémoire") :
     * Vault Firebase backup AWAITED avec timeout 3s (au lieu de void async non-bloquant).
     * Avant : si Kevin fermait l'app avant que la promise async résolve, push perdu.
     * Maintenant : on attend OU on timeout 3s (au lieu de attendre indéfiniment).
     * Garantie que Firebase a au moins TENTÉ le push avant que setKey return. */
    try {
      const fbBackupPromise = import('./vault-firebase-backup.js')
        .then(({ vaultFirebaseBackup }) => vaultFirebaseBackup.push(storageKey, encrypted));
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 3000));
      await Promise.race([fbBackupPromise, timeoutPromise]);
    } catch (err: unknown) {
      logger.debug('vault', 'setKey vault-fb-backup race finished', { err, storageKey });
    }
    /* 5. v13.4.124 (Kevin "passe en native iOS") :
     * Couche Keychain App Group iOS (via Capacitor Preferences plugin) SI mode natif.
     * Garantit survie reinstall app (Keychain persiste cross-install iOS contrairement
     * à localStorage). Mode PWA Safari : skip silencieux, fallback existant suffit.
     * Non-bloquant : fire-and-forget pour ne pas ralentir setKey. */
    try {
      const { apexIosNative } = await import('../integrations/apex-ios-native.js');
      if (apexIosNative.isNative()) {
        /* Stocke valeur CHIFFRÉE dans Keychain — décryptable seulement avec PIN admin */
        void apexIosNative.secureStore(storageKey, encrypted).then((r) => {
          if (r.ok && r.native) {
            logger.debug('vault', `setKey ${storageKey} → Keychain App Group iOS OK`);
          }
        }).catch((err: unknown) => {
          logger.debug('vault', 'Keychain push skipped', { err });
        });
      }
    } catch { /* mode PWA ou plugin absent : silent skip */ }
    /* 6. v13.4.6 (Kevin "ne JAMAIS perdre une clé") : si AUCUNE couche n'a réussi,
     * push emergency path Firebase (encrypté) en dernier recours pour ne jamais perdre. */
    if (!persisted.local && !persisted.idb && !persisted.firebase) {
      try {
        const { firebase } = await import('../storage/firebase.js');
        await firebase.write(`vault_emergency/${storageKey}`, {
          encrypted, /* déjà chiffré */
          ts: Date.now(),
          reason: 'all_layers_failed',
        });
        persisted.firebase = true;
        logger.warn('vault', `setKey EMERGENCY Firebase backup OK (toutes les couches locales ont échoué) : ${storageKey}`);
      } catch (err: unknown) {
        logger.error('vault', `setKey EMERGENCY Firebase ALSO failed for ${storageKey} — POTENTIAL LOSS`, { err });
      }
    }
    logger.info('vault', `setKey ${storageKey} persisted`, persisted);
    this.audit('set', { target: storageKey, details: persisted });
    /* Sync registry après chaque setKey */
    try {
      const { credentialsAudit } = await import('./credentials-audit.js');
      void credentialsAudit.syncFromVault();
    } catch { /* silent */ }
    /* Refresh memory vault audit cache */
    try {
      const { memory } = await import('../../core/memory.js');
      void memory.refreshVaultAudit();
    } catch { /* silent */ }
    /* v13.4.102 (Kevin "Coffre tjs perd memoire") :
     * Émet event 'vault:key-stored' avec statut Firebase pour feedback UI.
     * Kevin sait IMMÉDIATEMENT si la clé est juste locale (perdable au reinstall)
     * ou bien backuppée Firebase (récupérable). */
    try {
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('apex:vault-key-stored', {
          detail: {
            storageKey,
            firebase_ok: persisted.firebase,
            local_ok: persisted.local,
            idb_ok: persisted.idb,
            ts: Date.now(),
          },
        }));
      }
    } catch { /* silent */ }

    /* v13.4.104 (Kevin "GitHub plus secu, autonome") :
     * Push backup GitHub Gist automatique en arrière-plan. Throttle 30s.
     * Garantie : à chaque ajout de clé, le Gist est mis à jour avec vault complet.
     * Au prochain reinstall, Apex retrouve toutes les clés. */
    const isGithubKey = storageKey === 'ax_github_token'
      || storageKey === 'ax_github_pat_classic'
      || storageKey === 'ax_github_pat_finegrained';
    if (!isGithubKey || persisted.local) {
      /* Skip push si on est en train de stocker le PAT GitHub lui-même
       * (sinon recursion), sauf si PAT vient d'être stocké → on peut maintenant pusher */
      void (async () => {
        try {
          const { apexGithubGistBackup } = await import('./apex-github-gist-backup.js');
          await apexGithubGistBackup.pushBackup();
        } catch (err: unknown) {
          logger.debug('vault', 'gist push setKey background failed (throttle?)', { err });
        }
      })();
    }

    /* v13.4.105/106 (Kevin "zero manip autonome") :
     * Si on vient de stocker un PAT GitHub (3 variants storageKey) →
     * save dans iCloud Keychain Apple via navigator.credentials.store.
     * iOS Safari proposera "Sauvegarder dans Trousseau iCloud ?" — Kevin valide
     * UNE FOIS, et au prochain reinstall PWA Apex restaurera silencieusement
     * le PAT au boot. */
    const isGithubPatKey = storageKey === 'ax_github_token'
      || storageKey === 'ax_github_pat_classic'
      || storageKey === 'ax_github_pat_finegrained';
    if (isGithubPatKey && plaintext && persisted.local) {
      void (async () => {
        try {
          const { apexIcloudKeychain } = await import('./apex-icloud-keychain.js');
          if (apexIcloudKeychain.isSupported()) {
            const r = await apexIcloudKeychain.saveGithubPat(plaintext);
            if (r.ok) {
              logger.info('vault', '🔐 PAT GitHub aussi sauvegardé iCloud Keychain Apple');
            }
          }
        } catch (err: unknown) {
          logger.debug('vault', 'icloud-keychain save failed (non-bloquant)', { err });
        }
      })();
      /* v13.4.114 (Kevin "Que je puisse télécharger le qr code") :
       * Auto-trigger modal QR code backup pour PAT GitHub.
       * Kevin peut télécharger PNG ou partager dans Photos iCloud (Web Share API).
       * Photos iCloud survit reinstall PWA + sync cross-device. */
      void (async () => {
        try {
          await new Promise((r) => setTimeout(r, 1500)); /* Laisse le toast "PAT stocké" s'afficher d'abord */
          const { apexQrBackup } = await import('./apex-qr-backup.js');
          await apexQrBackup.showQrBackupModal({
            text: plaintext,
            title: '🔐 Sauvegarde PAT GitHub dans Photos iCloud',
            description: 'Apex génère un QR code de ton PAT GitHub. Sauvegarde-le dans Photos iCloud — au prochain reinstall PWA, Apex pourra le scanner pour tout restaurer en 1 clic. Photos iCloud survit reinstall + sync cross-device Apple ID.',
            filename: 'apex-pat-github.png',
          });
        } catch (err: unknown) {
          logger.debug('vault', 'QR backup modal failed (non-bloquant)', { err });
        }
      })();
    }
    return { ok: persisted.local || persisted.idb || persisted.firebase, persisted };
  }

  /**
   * Restore explicite depuis Firebase (appelé par firebase.init au boot).
   * Si localStorage vide ET Firebase a la clé → restore + decrypt + re-hydrate IDB.
   */
  async restoreFromFirebase(storageKey: string, encryptedFromFb: string): Promise<boolean> {
    if (!encryptedFromFb || typeof encryptedFromFb !== 'string') return false;
    try {
      /* Vérifier que ça déchiffre bien (sinon on n'écrit pas une corruption) */
      let plaintext: string | null = null;
      if (encryptedFromFb.startsWith(PREFIX)) {
        plaintext = await this.decryptAuto(encryptedFromFb);
      } else {
        plaintext = encryptedFromFb; /* legacy plaintext */
      }
      if (plaintext === null) {
        logger.warn('vault', 'restoreFromFirebase decrypt failed', { storageKey });
        return false;
      }
      try { localStorage.setItem(storageKey, encryptedFromFb); } catch { /* quota */ }
      try { await this.writeKeyToIdb(storageKey, encryptedFromFb); } catch { /* idb fail */ }
      logger.info('vault', `restoreFromFirebase OK ${storageKey}`);
      return true;
    } catch (err: unknown) {
      logger.warn('vault', 'restoreFromFirebase failed', { err, storageKey });
      return false;
    }
  }

  /**
   * v13.4.8 fix C6 (Ultra Review) — open IDB per call, mais expose
   * readManyKeysFromIdb() pour batch les lectures (sentinelle 30s × 8 keys
   * = 1 open au lieu de 8). Évite test isolation issues d'un singleton cache.
   */
  private async writeKeyToIdb(storageKey: string, value: string): Promise<void> {
    if (!('indexedDB' in globalThis)) return;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('apex_v13_vault_shadow', 1);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
      };
      req.onsuccess = (): void => {
        const db = req.result;
        try {
          const tx = db.transaction('keys', 'readwrite');
          const store = tx.objectStore('keys');
          store.put(value, storageKey);
          tx.oncomplete = (): void => { db.close(); resolve(); };
          tx.onerror = (): void => {
            db.close();
            reject(tx.error ?? new Error('idb tx failed'));
          };
        } catch (e: unknown) {
          db.close();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };
      req.onerror = (): void => reject(req.error ?? new Error('idb open failed'));
    });
  }

  private async readKeyFromIdb(storageKey: string): Promise<string | null> {
    if (!('indexedDB' in globalThis)) return null;
    return new Promise<string | null>((resolve) => {
      try {
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
            getReq.onerror = (): void => { db.close(); resolve(null); };
          } catch { db.close(); resolve(null); }
        };
        req.onerror = (): void => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * v13.4.8 fix C6 — batch read multiple keys dans UNE seule connexion IDB.
   * Évite 8 opens par cycle sentinelle (toutes les 30s).
   * Retourne Map<storageKey, value|null>.
   */
  private async readManyKeysFromIdb(storageKeys: ReadonlyArray<string>): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (!('indexedDB' in globalThis) || storageKeys.length === 0) return result;
    return new Promise<Map<string, string | null>>((resolve) => {
      try {
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
            let remaining = storageKeys.length;
            for (const key of storageKeys) {
              const getReq = store.get(key);
              getReq.onsuccess = (): void => {
                result.set(key, typeof getReq.result === 'string' ? getReq.result : null);
                if (--remaining === 0) { db.close(); resolve(result); }
              };
              getReq.onerror = (): void => {
                result.set(key, null);
                if (--remaining === 0) { db.close(); resolve(result); }
              };
            }
          } catch {
            db.close();
            for (const key of storageKeys) result.set(key, null);
            resolve(result);
          }
        };
        req.onerror = (): void => {
          for (const key of storageKeys) result.set(key, null);
          resolve(result);
        };
      } catch {
        for (const key of storageKeys) result.set(key, null);
        resolve(result);
      }
    });
  }

  /**
   * v13.4.x FIX KEVIN "coffre vide / clés disparues, récurrent même réseau OK" :
   * énumère TOUTES les clés présentes dans le shadow IDB (pas une liste codée en
   * dur). Cause racine #2 : `VAULT_KEYS_CRITICAL` (~22 clés) ratait les 130+ autres
   * services possibles → jamais restaurés même si présents dans le shadow survivant.
   * getAllKeys()/getAll() retournent dans le MÊME ordre (clé asc) → indices alignés.
   */
  private async readAllShadowKeysFromIdb(): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!('indexedDB' in globalThis)) return result;
    return new Promise<Map<string, string>>((resolve) => {
      try {
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
            const keysReq = store.getAllKeys();
            const valsReq = store.getAll();
            tx.oncomplete = (): void => {
              const ks = (keysReq.result ?? []) as IDBValidKey[];
              const vs = (valsReq.result ?? []) as unknown[];
              for (let i = 0; i < ks.length; i++) {
                const k = ks[i];
                const v = vs[i];
                if (typeof k === 'string' && typeof v === 'string') result.set(k, v);
              }
              db.close();
              resolve(result);
            };
            tx.onerror = (): void => { db.close(); resolve(result); };
          } catch { db.close(); resolve(result); }
        };
        req.onerror = (): void => resolve(result);
      } catch {
        resolve(result);
      }
    });
  }

  /**
   * v13.4.x — Restauration UNIVERSELLE du Coffre depuis le shadow IDB.
   * Recopie dans localStorage TOUTE clé credential présente dans le shadow mais
   * absente/vide localement, pour N'IMPORTE QUEL service — SAUF celles volontairement
   * supprimées (`ax_credentials_deleted`). N'écrase JAMAIS une valeur existante
   * (idempotent + safe). Retourne le nombre de clés restaurées. C'est le filet qui
   * récupère le coffre vidé par un reset/clear, sans dépendre d'une liste à maintenir.
   */
  async restoreAllShadowKeys(): Promise<number> {
    if (typeof localStorage === 'undefined') return 0;
    let deleted: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem('ax_credentials_deleted') ?? '[]') as unknown;
      if (Array.isArray(raw)) deleted = raw.filter((x): x is string => typeof x === 'string');
    } catch { /* ignore */ }
    const isCredKey = (k: string): boolean =>
      k === 'apex_v13_multi_keys' ||
      ((k.startsWith('ax_')) && (
        k.endsWith('_key') || k.endsWith('_token') || k.endsWith('_pat') ||
        k.endsWith('_secret') || k.endsWith('_sk') || k === 'ax_shared_api_key' || k === 'ax_api_key'
      ));
    const shadow = await this.readAllShadowKeysFromIdb();
    let restored = 0;
    for (const [key, value] of shadow) {
      if (!isCredKey(key)) continue;
      if (deleted.includes(key)) continue;
      const cur = localStorage.getItem(key);
      if (cur && cur !== '') continue; /* déjà présent — ne jamais écraser */
      if (!value) continue;
      try {
        localStorage.setItem(key, value);
        restored++;
        logger.info('vault-watch', `🔄 restore universel depuis shadow IDB : ${key}`);
      } catch { /* quota */ }
    }
    if (restored > 0) {
      logger.info('vault-watch', `✅ ${restored} clé(s) Coffre restaurée(s) depuis le shadow IDB (universel)`);
    }
    return restored;
  }

  /**
   * Masque une clé pour affichage UI (préserve début + fin pour identification).
   * Toujours appliqué APRÈS readKey() — jamais sur AXENC1: brut.
   * Exemple : "sk-ant-api03-AbCd...x9z2" → "sk-an***...x9z2"
   */
  maskKey(plaintext: string): string {
    if (!plaintext) return '';
    if (plaintext.length <= 8) return '***';
    return plaintext.slice(0, 5) + '***' + plaintext.slice(-4);
  }

  /**
   * Lit + masque en une opération (helper UI).
   */
  async readMasked(storageKey: string): Promise<string> {
    const plain = await this.readKey(storageKey);
    return this.maskKey(plain);
  }

  /**
   * Status brut sans déchiffrement (sync, rapide pour UI status).
   * Retourne 'configured' / 'empty' / 'encrypted' / 'plaintext_legacy'
   */
  getKeyStatus(storageKey: string): 'configured' | 'empty' | 'encrypted' | 'plaintext_legacy' {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return 'empty';
      if (raw.startsWith(PREFIX)) return 'encrypted';
      return 'plaintext_legacy'; /* À migrer vers chiffré */
    } catch {
      return 'empty';
    }
  }

  async encrypt(plaintext: string, passphrase?: string): Promise<string> {
    const pass = passphrase ?? this.passphrase;
    if (!pass) throw new Error('Vault passphrase not set');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(pass, salt);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    );
    const payload: EncryptedPayload = {
      v: 1,
      iv: this.b64(iv),
      ct: this.b64(new Uint8Array(ct)),
      salt: this.b64(salt),
    };
    return PREFIX + JSON.stringify(payload);
  }

  /**
   * CRITIQUE v12.784 : retourne null sur fail JAMAIS le payload chiffré.
   * Sinon SSE écraserait localStorage avec encrypted brut.
   */
  async decrypt(encrypted: string, passphrase?: string): Promise<string | null> {
    const pass = passphrase ?? this.passphrase;
    if (!pass) return null;
    if (!encrypted.startsWith(PREFIX)) return null;
    try {
      const payload = JSON.parse(encrypted.slice(PREFIX.length)) as EncryptedPayload;
      if (payload.v !== 1) return null;
      const salt = this.b64decode(payload.salt);
      const iv = this.b64decode(payload.iv);
      const ct = this.b64decode(payload.ct);
      const key = await this.deriveKey(pass, salt);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        ct as BufferSource,
      );
      return new TextDecoder().decode(plain);
    } catch (err: unknown) {
      logger.warn('vault', 'decrypt failed (returning null)', { err });
      return null;
    }
  }

  /* Détection complète via 130+ patterns + warning si forbidden */
  detectFull(value: string): CredentialPattern | null {
    return detectCredential(value);
  }

  /* Backward-compat 15 patterns simples */
  detectPattern(value: string): { name: string; key: string } | null {
    const detected = detectCredential(value);
    if (!detected || detected.category === 'forbidden') return null;
    return { name: detected.name, key: detected.storageKey };
  }

  /**
   * Auto-store credential détecté + auto-test si endpoint dispo + auto-link dashboard.
   * Retourne le résultat structuré pour UI feedback.
   */
  async autoStore(value: string): Promise<{
    ok: boolean;
    pattern?: CredentialPattern;
    valid?: boolean;
    forbidden?: boolean;
    reason?: string;
  }> {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, reason: 'Valeur vide' };
    let detected = detectCredential(trimmed);
    /* Si format inconnu : tente résolution autonome via heuristiques + web search (Kevin règle "tout autonome") */
    if (!detected) {
      try {
        const { unknownCredentialResolver } = await import('./unknown-credential-resolver.js');
        const resolved = await unknownCredentialResolver.tryIdentify(trimmed);
        if (resolved) {
          /* Crée pattern synthétique pour traiter comme credential standard */
          detected = {
            name: resolved.service,
            regex: new RegExp(resolved.pattern_learned ?? '.+'),
            storageKey: resolved.storage_key,
            category: 'ai',
            dashboard: resolved.dashboard_url,
            ...(resolved.billing_url && { billing: resolved.billing_url }),
          } as CredentialPattern;
          /* Apprentissage : ajoute pattern + escalade Claude Code */
          await unknownCredentialResolver.learn(trimmed, resolved);
          logger.info('vault', `autoStore : format inconnu résolu autonome → ${resolved.service} (${resolved.confidence})`);
        }
      } catch (err: unknown) {
        logger.warn('vault', 'unknown-resolver failed', { err });
      }
    }
    if (!detected) return { ok: false, reason: 'Format inconnu — pattern non reconnu' };
    if (detected.category === 'forbidden') {
      logger.warn('vault', `Forbidden credential detected: ${detected.name} — REFUSED`);
      return { ok: false, forbidden: true, pattern: detected, reason: detected.name + ' — JAMAIS stocké' };
    }
    /* Sprint 9 v13.1.x (Kevin règle 2026-05-07 multi-key) :
       Détecte si une clé existe déjà pour ce service → ajoute en parallèle dans
       multi-key-vault au lieu d'écraser. Single-key reste pour back-compat
       (legacy reads via getApiKey/readKey). */
    void this.maybeAddToMultiKeyVault(detected, trimmed);
    /* v13.3.20 FIX KEVIN "Apex oublie ses codes sans cesse" (2026-05-07) :
     * AVANT : autoStore faisait localStorage.setItem direct + Firebase write,
     *         SANS IDB shadow + SANS verify post-write + SANS retry.
     *         Si quota exceeded ou Safari iOS edge case → clé perdue silencieusement.
     * APRÈS : délègue à setKey() qui fait :
     *   1. encryptAuto (avec fallback device-bound)
     *   2. localStorage.setItem (immédiat)
     *   3. IDB shadow (writeKeyToIdb — résiste clear cache Safari)
     *   4. Firebase backup (cross-device + survive réinstall PWA)
     * + VERIFY post-write avec retry x3 (Kevin règle triple persistence v9.519). */
    const setResult = await this.setKey(detected.storageKey, trimmed);
    if (!setResult.ok) {
      logger.error('vault', 'autoStore setKey returned ok:false', { storageKey: detected.storageKey, persisted: setResult.persisted });
      return { ok: false, reason: 'Chiffrement ou stockage échoué (triple persistence failed)' };
    }
    /* VERIFY : lecture immédiate doit retourner le plaintext original.
     * Si fail (corruption, race, quota silent), retry 3x avec backoff. */
    let verified = false;
    for (let attempt = 0; attempt < 3 && !verified; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * attempt));
      try {
        const readback = await this.readKey(detected.storageKey);
        if (readback === trimmed) {
          verified = true;
          break;
        }
        logger.warn('vault', `autoStore VERIFY mismatch attempt ${attempt + 1}/3`, {
          storageKey: detected.storageKey,
          readbackLen: readback.length,
          expectedLen: trimmed.length,
        });
        /* Re-essai setKey */
        await this.setKey(detected.storageKey, trimmed);
      } catch (err: unknown) {
        logger.warn('vault', `autoStore VERIFY error attempt ${attempt + 1}/3`, { err });
      }
    }
    if (!verified) {
      logger.error('vault', `🚨 autoStore VERIFY FAILED after 3 retries — credential possibly lost`, {
        storageKey: detected.storageKey,
        persisted: setResult.persisted,
      });
      /* Alerte Kevin si possible (best-effort) */
      void import('../admin/kevin-alerts.js').then(({ kevinAlerts }) => {
        void kevinAlerts.alertKevin({
          severity: 'critical',
          title: `🚨 Code ${detected.name} non persisté`,
          body: 'Verify post-write échoué. Recolle la clé.',
        }).catch(() => { /* ignore */ });
      }).catch(() => { /* ignore */ });
      return { ok: false, reason: 'Verify post-write échoué — recolle la clé' };
    }
    logger.info('vault', `✅ autoStore VERIFIED ${detected.storageKey}`, setResult.persisted);
    /* Auto-link legacy : enrichit ax_links_registry old format */
    this.autoLink(detected);
    /* WIRE links-registry : autoCreate avec HEAD verification + sentinelle re-test
     * (règle CLAUDE.md absolue Kevin 2026-05-01 : axLinksAutoCreate). */
    void this.autoCreateLink(detected);
    /* Auto-test si endpoint dispo (best-effort, non bloquant) */
    let valid: boolean | undefined;
    if (detected.testEndpoint) {
      valid = await this.autoTest(detected, trimmed).catch(() => undefined);
    }
    logger.info('vault', `Stored ${detected.name} → ${detected.storageKey}`, { valid });
    /* v13.0.79 (Kevin "qu'il les garde en mémoire aussi") : ajoute à ax_persistent_memory
     * pour que Apex IA SACHE quelles clés Kevin a configurées (sans exposer valeur).
     * Persiste cross-session, sync Firebase, injecté system prompt. */
    void this.rememberCredentialConfigured(detected, valid);
    return { ok: true, pattern: detected, ...(valid !== undefined && { valid }) };
  }

  /**
   * Sprint 9 v13.1.x (Kevin règle multi-key 2026-05-07) :
   * Si Kevin colle 2ème clé pour le même service → ajoute dans multi-key-vault
   * pour failover key-level (au lieu d'écraser silencieusement la précédente).
   *
   * Service name dérivé depuis storageKey (ex: ax_anthropic_key → "anthropic").
   * Best-effort non bloquant — toute erreur ignorée silencieusement.
   */
  private async maybeAddToMultiKeyVault(pattern: CredentialPattern, plaintext: string): Promise<void> {
    try {
      /* Service name = catégorie principale du service (Anthropic/OpenAI/Gemini/Groq...) */
      const serviceName = this.deriveServiceName(pattern);
      if (!serviceName) return;
      const { multiKeyVault } = await import('./multi-key-vault.js');
      /* Toast informatif si 2ème+ clé pour ce service (visible UI feedback) */
      const existingCount = multiKeyVault.listKeys(serviceName).length;
      await multiKeyVault.addKey(serviceName, plaintext, {
        alias: existingCount > 0 ? `${pattern.name} #${existingCount + 1}` : pattern.name,
      });
      if (existingCount > 0) {
        logger.info(
          'vault',
          `🔑 ${pattern.name} : ${existingCount + 1}ème clé ajoutée — failover automatique activé`,
        );
      }
    } catch (err: unknown) {
      logger.debug('vault', 'maybeAddToMultiKeyVault skipped', { err });
    }
  }

  /**
   * Dérive le service name normalisé pour multi-key-vault depuis le pattern.
   * - ax_anthropic_key → 'anthropic'
   * - ax_openai_key → 'openai'
   * - ax_groq_key → 'groq'
   * - ax_google_key, ax_gemini_key → 'google'
   * - ax_openrouter_key → 'openrouter'
   * Retourne null si non-AI (pas pertinent pour multi-key failover).
   */
  private deriveServiceName(pattern: CredentialPattern): string | null {
    if (pattern.category !== 'ai') return null;
    const k = pattern.storageKey;
    if (k === 'ax_anthropic_key') return 'anthropic';
    if (k === 'ax_openai_key') return 'openai';
    if (k === 'ax_groq_key') return 'groq';
    if (k === 'ax_google_key' || k === 'ax_gemini_key') return 'google';
    if (k === 'ax_openrouter_key') return 'openrouter';
    if (k === 'ax_perplexity_key') return 'perplexity';
    if (k === 'ax_mistral_key') return 'mistral';
    if (k === 'ax_cohere_key') return 'cohere';
    if (k === 'ax_deepseek_key') return 'deepseek';
    /* Pattern générique : supprime préfixe ax_ et suffixe _key */
    const m = /^ax_([a-z0-9]+)_key$/.exec(k);
    return m && m[1] ? m[1] : null;
  }

  /**
   * Persiste fact "Kevin a configuré [Service]" dans ax_persistent_memory.
   * Apex IA système prompt lit ces facts → sait ses outils dispo.
   */
  private async rememberCredentialConfigured(pattern: CredentialPattern, valid: boolean | undefined): Promise<void> {
    try {
      const validTag = valid === true ? '✅ validée' : valid === false ? '⚠️ ping échec' : '❓ non testée';
      const fact = {
        category: 'credentials',
        text: `Kevin a configuré ${pattern.name} (clé chiffrée AES-GCM-256, ${validTag}). Dashboard: ${pattern.dashboard ?? 'n/a'}. Storage: ${pattern.storageKey}.`,
        importance: 90,
        ts: Date.now(),
      };
      const KEY = 'apex_v13_persistent_memory';
      const raw = localStorage.getItem(KEY);
      const entries = raw ? (JSON.parse(raw) as Array<{ category: string; text: string; importance: number; ts: number }>) : [];
      /* Dédupe par storageKey : retire ancienne entrée pour ce service avant d'ajouter nouvelle */
      const filtered = entries.filter((e) => !e.text.includes(pattern.storageKey));
      filtered.push(fact);
      /* Cap 5000 entrées (FIFO) */
      const capped = filtered.length > 5000 ? filtered.slice(-5000) : filtered;
      localStorage.setItem(KEY, JSON.stringify(capped));
      /* Sync Firebase si dispo (best-effort) */
      void import('../storage/firebase.js').then(async ({ firebase }) => {
        await firebase.write('apex_v13_persistent_memory', capped).catch(() => { /* offline OK */ });
      }).catch(() => { /* skip */ });
    } catch (err: unknown) {
      logger.warn('vault', 'rememberCredentialConfigured failed', { err });
    }
  }

  /**
   * BULK auto-store : Kevin colle multiple clés (.env, JSON, multi-line texte).
   * v13.0.78 fix : "il s'affole pas reconnu" — scan tous les tokens, store chacun.
   */
  async autoStoreBulk(value: string): Promise<{
    stored: Array<{ pattern: CredentialPattern; valid?: boolean }>;
    forbidden: Array<{ pattern: CredentialPattern }>;
    failed: number;
    total: number;
  }> {
    const detected = detectAllCredentials(value);
    if (detected.length === 0) {
      /* Fallback : essaie autoStore simple sur le texte trimmed (rétrocompat) */
      const single = await this.autoStore(value);
      if (single.ok && single.pattern) {
        return {
          stored: [{ pattern: single.pattern, ...(single.valid !== undefined && { valid: single.valid }) }],
          forbidden: [],
          failed: 0,
          total: 1,
        };
      }
      if (single.forbidden && single.pattern) {
        return { stored: [], forbidden: [{ pattern: single.pattern }], failed: 0, total: 1 };
      }
      return { stored: [], forbidden: [], failed: 1, total: 1 };
    }
    const stored: Array<{ pattern: CredentialPattern; valid?: boolean }> = [];
    const forbidden: Array<{ pattern: CredentialPattern }> = [];
    let failed = 0;
    for (const { pattern, value: rawValue } of detected) {
      const result = await this.autoStore(rawValue);
      if (result.ok && result.pattern) {
        stored.push({ pattern: result.pattern, ...(result.valid !== undefined && { valid: result.valid }) });
      } else if (result.forbidden && result.pattern) {
        forbidden.push({ pattern: result.pattern });
      } else {
        failed++;
        logger.warn('vault', `autoStoreBulk : pattern ${pattern.name} échec`, { reason: result.reason });
      }
    }
    logger.info('vault', `autoStoreBulk : ${stored.length}/${detected.length} clés stockées`, {
      stored: stored.map((s) => s.pattern.name),
      forbidden: forbidden.map((f) => f.pattern.name),
      failed,
    });
    return { stored, forbidden, failed, total: detected.length };
  }

  /**
   * Wire links-registry pour auto-création + auto-vérification HEAD
   * (extraction service name depuis pattern.name).
   *
   * v13.1.x (Kevin règle 2026-05-07 auto-discover) :
   * Après autoCreate, déclenche autoDiscoverLinks.discover() pour enrichir
   * avec login/dashboard/billing/api_keys/usage/docs/etc. en autonomie totale
   * (cascade pre_configured → pattern_discovery → web_search).
   */
  private async autoCreateLink(pattern: CredentialPattern): Promise<void> {
    try {
      /* Service name depuis pattern.name : "Anthropic API" → "anthropic" */
      const serviceName = pattern.name.toLowerCase().split(' ')[0] ?? '';
      if (!serviceName) return;
      const { linksRegistry } = await import('../integrations/links-registry.js');
      await linksRegistry.autoCreate(serviceName);
      /* AUTO-DISCOVER : trouve login/dashboard/billing/api_keys/usage/etc.
         non-bloquant — best-effort, ne casse pas autoStore si offline. */
      try {
        const { autoDiscoverLinks } = await import('../integrations/auto-discover-links.js');
        const discovered = await autoDiscoverLinks.discover(serviceName);
        if (discovered.alive) {
          const found: string[] = [];
          if (discovered.login) found.push('login');
          if (discovered.dashboard) found.push('dashboard');
          if (discovered.billing) found.push('billing');
          if (discovered.api_keys) found.push('api_keys');
          if (discovered.usage) found.push('usage');
          if (discovered.docs) found.push('docs');
          logger.info(
            'vault',
            `🔗 ${found.length} liens trouvés pour ${pattern.name} : ${found.join(', ')}`,
          );
        }
      } catch (err: unknown) {
        logger.debug('vault', 'autoDiscoverLinks skipped', { err });
      }
    } catch (err: unknown) {
      logger.warn('vault', 'autoCreateLink failed', { err });
    }
  }

  private autoLink(pattern: CredentialPattern): void {
    /* v13.0.20+ : ax_links_registry reste en Record format (back-compat).
       linksRegistry.persist écrit en parallèle dans ax_links_registry_v2 (Array)
       et ne touche pas ax_links_registry si déjà en Record (collision évitée). */
    try {
      const raw = localStorage.getItem('ax_links_registry');
      let registry: Record<string, Record<string, unknown>> = {};
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            registry = parsed as Record<string, Record<string, unknown>>;
          }
        } catch {
          /* corrupt → restart */
        }
      }
      registry[pattern.storageKey] = {
        service: pattern.name,
        category: pattern.category,
        ...(pattern.dashboard && { dashboard: pattern.dashboard }),
        ...(pattern.billing && { billing: pattern.billing }),
        ...(pattern.docs && { docs: pattern.docs }),
        ...(pattern.support && { support: pattern.support }),
        last_added: Date.now(),
        alive: true,
      };
      localStorage.setItem('ax_links_registry', JSON.stringify(registry));
    } catch (err: unknown) {
      logger.warn('vault', 'autoLink failed', { err });
    }
  }

  private async autoTest(pattern: CredentialPattern, value: string): Promise<boolean> {
    if (!pattern.testEndpoint) return false;
    try {
      const url = pattern.testEndpoint.replace('PLACEHOLDER', value);
      const headers: Record<string, string> = {};
      if (pattern.name.startsWith('Anthropic')) {
        headers['x-api-key'] = value;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
        headers['content-type'] = 'application/json';
      } else if (pattern.name === 'Google AI') {
        headers['x-goog-api-key'] = value;
      } else if (pattern.name.startsWith('Telegram')) {
        /* Token déjà dans URL via PLACEHOLDER */
      } else {
        headers['authorization'] = `Bearer ${value}`;
      }
      /* Anthropic /v1/messages POST exige body minimal pour valider la clé */
      let body: string | undefined;
      if (pattern.name.startsWith('Anthropic') && pattern.testMethod === 'POST') {
        body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        });
      }
      const fetchOpts: RequestInit = {
        method: pattern.testMethod ?? 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      };
      if (body) fetchOpts.body = body;
      const res = await fetch(url, fetchOpts);
      /* 200 = OK, 400 = malformed body OK (clé valide), 401 = clé invalide, 4xx autre = OK clé répond */
      if (res.status === 401 || res.status === 403) return false;
      return res.status < 500;
    } catch {
      return false;
    }
  }

  private b64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  private b64decode(s: string): Uint8Array {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * Wire RGPD Art. 32 — auditLog forensic trail des opérations vault sensibles.
   * Lazy import (évite circular dep) + non-blocking (audit-log KO ne casse rien).
   */
  private audit(action: string, opts: { target?: string; details?: Record<string, unknown> } = {}): void {
    void import('../observability/audit-log.js')
      .then(({ auditLog }) => auditLog.record(`vault.${action}`, opts))
      .catch(() => { /* non-blocking */ });
  }
}

export const vault = new Vault();
