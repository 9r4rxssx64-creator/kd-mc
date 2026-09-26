/**
 * APEX v13 — Secure Storage (P0-1 fix selon audit subagent design)
 *
 * Wrapper localStorage avec chiffrement transparent pour clés sensibles.
 *
 * Décision design (validée subagent audit) :
 * - PBKDF2 + passphrase user AU LIEU de device fingerprint (security theater)
 * - Whitelist clés sensibles chiffrées (secrets API, PIN hashes, sessions)
 * - Clés UI/preferences (theme, view) restent plain (perf + lisibilité)
 * - Honnête : protège accès physique + backups + logs. PAS XSS (inhérent SPA).
 *
 * Flow :
 * 1. Au premier boot admin → modal "Définir passphrase coffre" (16+ chars recommandé)
 * 2. Passphrase dérivée PBKDF2 200k → clé AES-GCM 256 gardée en mémoire session
 * 3. Set/get sur clés sensibles → encrypt/decrypt transparent
 * 4. Logout → clé effacée mémoire (re-prompt au prochain login)
 */

import { logger } from '../../core/logger.js';

const ENC_PREFIX = 'AXSEC1:';

/* Liste blanche : clés sensibles chiffrées au repos */
const SENSITIVE_KEYS = new Set<string>([
  /* Secrets API détectés par credential-patterns.ts → tous chiffrés */
  'ax_anthropic_key',
  'ax_openai_key',
  'ax_google_key',
  'ax_groq_key',
  'ax_perplexity_key',
  'ax_openrouter_key',
  'ax_cohere_key',
  'ax_deepseek_key',
  'ax_mistral_key',
  'ax_xai_key',
  'ax_elevenlabs_key',
  'ax_replicate_key',
  'ax_github_token',
  'ax_gitlab_token',
  'ax_cloudflare_token',
  'ax_vercel_token',
  'ax_netlify_token',
  'ax_railway_token',
  'ax_aws_access_key',
  'ax_heroku_key',
  'ax_sentry_dsn',
  'ax_stripe_sk',
  'ax_stripe_pk',
  'ax_stripe_whsec',
  'ax_paypal_client',
  'ax_brevo_key',
  'ax_resend_key',
  'ax_sendgrid_key',
  'ax_mailchimp_key',
  'ax_twilio_token',
  'ax_telegram_token',
  'ax_slack_bot',
  'ax_slack_user',
  'ax_discord_bot',
  'ax_notion_key',
  'ax_airtable_pat',
  'ax_dropbox_token',
  'ax_deepl_key',
  /* PIN hashes + sessions admin */
  'apex_v13_pin',
  /* IBAN + identité */
  'ax_iban',
  'ax_bic',
]);

class SecureStorage {
  private aesKey: CryptoKey | null = null;
  private salt: Uint8Array | null = null;

  isUnlocked(): boolean {
    return this.aesKey !== null;
  }

  isSensitive(key: string): boolean {
    if (SENSITIVE_KEYS.has(key)) return true;
    /* Pin per-user pattern apex_v13_pin_<uid> */
    if (/^apex_v13_pin_/.test(key)) return true;
    /* Pattern PII per-user */
    if (/^ax_voice_print_/.test(key)) return true;
    return false;
  }

  /**
   * Initialise le coffre avec une passphrase user.
   * Dérive AES-GCM 256 via PBKDF2 200k + salt persisté.
   */
  async unlock(passphrase: string): Promise<{ ok: boolean; firstSetup: boolean; reason?: string }> {
    if (!passphrase || passphrase.length < 8) {
      return { ok: false, firstSetup: false, reason: 'Passphrase ≥ 8 caractères requise' };
    }
    /* Charge salt existant ou génère */
    let saltB64 = localStorage.getItem('apex_v13_secstore_salt');
    let firstSetup = false;
    if (!saltB64) {
      this.salt = crypto.getRandomValues(new Uint8Array(16));
      saltB64 = this.b64(this.salt);
      try {
        localStorage.setItem('apex_v13_secstore_salt', saltB64);
      } catch {
        /* ignore */
      }
      firstSetup = true;
    } else {
      this.salt = this.b64decode(saltB64);
    }

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    this.aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this.salt as BufferSource, iterations: 200_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );

    /* Vérifie que la passphrase est correcte (sinon impossible de décrypter futures keys) */
    if (!firstSetup) {
      const probe = localStorage.getItem('apex_v13_secstore_probe');
      if (probe) {
        try {
          const decoded = await this.decryptRaw(probe);
          if (decoded !== 'APEX_PROBE_OK') {
            this.aesKey = null;
            return { ok: false, firstSetup: false, reason: 'Passphrase incorrecte' };
          }
        } catch {
          this.aesKey = null;
          return { ok: false, firstSetup: false, reason: 'Passphrase incorrecte' };
        }
      }
    } else {
      /* Stocke probe chiffré pour futurs unlock check */
      try {
        const probe = await this.encryptRaw('APEX_PROBE_OK');
        localStorage.setItem('apex_v13_secstore_probe', probe);
      } catch (err: unknown) {
        logger.warn('secure-storage', 'probe persist failed', { err });
      }
    }

    logger.info('secure-storage', `Unlocked (firstSetup=${firstSetup})`);
    return { ok: true, firstSetup };
  }

  lock(): void {
    this.aesKey = null;
    logger.info('secure-storage', 'Locked');
  }

  /**
   * setItem transparent : chiffre auto si clé sensible et coffre déverrouillé.
   * Sinon stocke plain (pour clés UI non sensibles).
   */
  async setItem(key: string, value: string): Promise<void> {
    if (this.isSensitive(key) && this.aesKey) {
      const encrypted = await this.encryptRaw(value);
      localStorage.setItem(key, encrypted);
    } else {
      localStorage.setItem(key, value);
    }
  }

  /**
   * getItem transparent : décrypte auto si AXSEC1 prefix.
   * Retourne null si decrypt fail (anti v12.784 — JAMAIS retourner le payload chiffré).
   */
  async getItem(key: string): Promise<string | null> {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    if (!raw.startsWith(ENC_PREFIX)) return raw;
    if (!this.aesKey) {
      logger.warn('secure-storage', `getItem ${key} encrypted but vault locked`);
      return null;
    }
    try {
      return await this.decryptRaw(raw);
    } catch (err: unknown) {
      logger.warn('secure-storage', `decrypt failed for ${key}`, { err });
      return null;
    }
  }

  /**
   * Migre les clés sensibles plain → encrypted (idempotent, après unlock).
   */
  async migratePlainToEncrypted(): Promise<{ migrated: number; skipped: number }> {
    if (!this.aesKey) return { migrated: 0, skipped: 0 };
    let migrated = 0;
    let skipped = 0;
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (!this.isSensitive(k)) continue;
      const raw = localStorage.getItem(k);
      if (!raw || raw.startsWith(ENC_PREFIX)) {
        skipped++;
        continue;
      }
      try {
        const enc = await this.encryptRaw(raw);
        localStorage.setItem(k, enc);
        migrated++;
      } catch (err: unknown) {
        logger.warn('secure-storage', `migrate ${k} failed`, { err });
      }
    }
    logger.info('secure-storage', `Migration complete: ${migrated} encrypted, ${skipped} skipped`);
    return { migrated, skipped };
  }

  private async encryptRaw(plaintext: string): Promise<string> {
    if (!this.aesKey) throw new Error('Vault locked');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      this.aesKey,
      new TextEncoder().encode(plaintext) as BufferSource,
    );
    return ENC_PREFIX + this.b64(iv) + ':' + this.b64(new Uint8Array(ct));
  }

  private async decryptRaw(encrypted: string): Promise<string> {
    if (!this.aesKey) throw new Error('Vault locked');
    const body = encrypted.slice(ENC_PREFIX.length);
    const [ivB64, ctB64] = body.split(':');
    if (!ivB64 || !ctB64) throw new Error('Invalid format');
    const iv = this.b64decode(ivB64);
    const ct = this.b64decode(ctB64);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      this.aesKey,
      ct as BufferSource,
    );
    return new TextDecoder().decode(plain);
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
}

export const secureStorage = new SecureStorage();
