/**
 * APEX v13 — WebAuthn FaceID / TouchID (Kevin v13.1.0 audit P0).
 *
 * Login biométrique iPhone PWA = niveau Apple/Google standard.
 * - Premier login admin : enregistrer credential WebAuthn (FaceID iPhone, Windows Hello, etc.)
 * - Actions sensibles : prompt re-auth WebAuthn (geste biométrique seul)
 * - Fallback : PIN admin si WebAuthn indisponible (compat dégradée)
 *
 * Conformité brief Kevin v13.1.0 :
 * - isAvailable(): support + platform/cross-platform
 * - register({ username, displayName }): enrôle credential
 * - authenticate(): authentifie biométrie
 * - listCredentials(userId): liste devices enrôlés
 * - revoke(credentialId): retire credential
 *
 * API existantes préservées (rétro-compat) :
 * - isSupported() / isPlatformAuthAvailable()
 * - enroll(userId, userName) / verify(userId)
 * - hasEnrollment(userId)
 *
 * Stockage : credentials dans localStorage FB_LOCAL (jamais shared cross-device).
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

const RP_ID = typeof location !== 'undefined' ? location.hostname : 'localhost';
const RP_NAME = 'APEX AI';
const ENROLL_PREFIX = 'apex_v13_webauthn_';
const CREDENTIALS_LIST_KEY = 'apex_v13_webauthn_credentials';

/* ============================================================================
 * Types publics (Kevin brief)
 * ============================================================================ */

export interface AvailabilityResult {
  supported: boolean;
  platform: 'platform' | 'cross-platform' | null;
}

export interface RegisterOptions {
  username: string;
  displayName: string;
  /** Optionnel : userId métier (sinon username utilisé) */
  userId?: string;
}

export interface RegisterResult {
  ok: boolean;
  credentialId?: string;
  reason?: string;
}

export interface AuthenticateResult {
  ok: boolean;
  userId?: string;
  credentialId?: string;
  reason?: string;
}

export interface CredentialRecord {
  id: string;
  userId: string;
  deviceName: string;
  createdAt: number;
}

/* ============================================================================
 * WebAuthnService
 * ============================================================================ */

class WebAuthnService {
  /* ------------------------------------------------------------------------
   * API existante (rétro-compat — utilisée par admin-action-gate, etc.)
   * ------------------------------------------------------------------------ */

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'PublicKeyCredential' in window && typeof navigator.credentials?.create === 'function';
  }

  async isPlatformAuthAvailable(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Enrôle un nouveau credential WebAuthn pour un user (rétro-compat).
   * Préfère register() pour nouveaux call sites (Kevin brief).
   */
  async enroll(userId: string, userName: string): Promise<{ ok: boolean; credentialId?: string; reason?: string }> {
    if (!this.isSupported()) return { ok: false, reason: 'WebAuthn non supporté sur ce navigateur' };
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBytes = new TextEncoder().encode(userId);
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: challenge as BufferSource,
          rp: { name: RP_NAME, id: RP_ID },
          user: {
            id: userIdBytes as BufferSource,
            name: userName,
            displayName: userName,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   /* ES256 */
            { type: 'public-key', alg: -257 }, /* RS256 */
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform', /* FaceID / TouchID / Windows Hello */
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;
      if (!cred) return { ok: false, reason: 'Enregistrement annulé' };
      const credentialId = this.bufToB64(cred.rawId);
      try {
        localStorage.setItem(`${ENROLL_PREFIX}${userId}`, credentialId);
        this.appendCredentialRecord({
          id: credentialId,
          userId,
          deviceName: this.detectDeviceName(),
          createdAt: Date.now(),
        });
      } catch {
        /* ignore quota */
      }
      void auditLog.record('webauthn.enroll.success', { actor: userId });
      logger.info('webauthn', `Enrolled credential for ${userId}`);
      return { ok: true, credentialId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('webauthn', 'Enroll failed', { err: msg });
      void auditLog.record('webauthn.enroll.fail', { actor: userId, details: { reason: msg } });
      return { ok: false, reason: msg };
    }
  }

  /**
   * Vérifie identité via biométrie pour action sensible (rétro-compat).
   * Préfère authenticate() pour nouveaux call sites (Kevin brief).
   */
  async verify(userId: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isSupported()) return { ok: false, reason: 'WebAuthn non supporté' };
    const stored = localStorage.getItem(`${ENROLL_PREFIX}${userId}`);
    if (!stored) return { ok: false, reason: 'Pas de credential enregistré, fais l\'enrôlement d\'abord' };
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credentialId = this.b64ToBuf(stored);
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: challenge as BufferSource,
          allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
          userVerification: 'required',
          timeout: 30000,
        },
      })) as PublicKeyCredential | null;
      if (!assertion) return { ok: false, reason: 'Vérification annulée' };
      void auditLog.record('webauthn.verify.success', { actor: userId });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void auditLog.record('webauthn.verify.fail', { actor: userId, details: { reason: msg } });
      return { ok: false, reason: msg };
    }
  }

  hasEnrollment(userId: string): boolean {
    return localStorage.getItem(`${ENROLL_PREFIX}${userId}`) !== null;
  }

  /* ------------------------------------------------------------------------
   * Nouvelle API Kevin v13.1.0
   * ------------------------------------------------------------------------ */

  /**
   * Vérifie support WebAuthn + type d'authenticator disponible.
   * - platform : FaceID / TouchID / Windows Hello (intégré device)
   * - cross-platform : YubiKey, Titan Key, etc. (USB/NFC/BT)
   * - null : pas supporté
   */
  async isAvailable(): Promise<AvailabilityResult> {
    if (!this.isSupported()) return { supported: false, platform: null };
    try {
      const platformAvail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (platformAvail) return { supported: true, platform: 'platform' };
      /* Pas de platform auth → tenter cross-platform (clé physique) */
      return { supported: true, platform: 'cross-platform' };
    } catch {
      return { supported: true, platform: null };
    }
  }

  /**
   * Enrôle un nouveau credential (Kevin brief signature).
   * @param opts.username  identifiant unique (utilisé comme userId si pas fourni)
   * @param opts.displayName label visible à l'utilisateur
   * @param opts.userId   override userId (sinon username utilisé)
   */
  async register(opts: RegisterOptions): Promise<RegisterResult> {
    if (!opts || !opts.username) return { ok: false, reason: 'username requis' };
    if (!this.isSupported()) return { ok: false, reason: 'WebAuthn non supporté sur ce navigateur' };
    const userId = opts.userId ?? opts.username;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBytes = new TextEncoder().encode(userId);
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: challenge as BufferSource,
          rp: { name: RP_NAME, id: RP_ID },
          user: {
            id: userIdBytes as BufferSource,
            name: opts.username,
            displayName: opts.displayName || opts.username,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;
      if (!cred) return { ok: false, reason: 'Enregistrement annulé' };
      const credentialId = this.bufToB64(cred.rawId);
      try {
        localStorage.setItem(`${ENROLL_PREFIX}${userId}`, credentialId);
        this.appendCredentialRecord({
          id: credentialId,
          userId,
          deviceName: this.detectDeviceName(),
          createdAt: Date.now(),
        });
      } catch {
        /* ignore quota */
      }
      void auditLog.record('webauthn.register.success', { actor: userId });
      logger.info('webauthn', `Registered credential for ${userId}`);
      return { ok: true, credentialId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('webauthn', 'register failed', { err: msg });
      void auditLog.record('webauthn.register.fail', { actor: userId, details: { reason: msg } });
      return { ok: false, reason: msg };
    }
  }

  /**
   * Authentifie via biométrie. Si userId fourni → cible un credential précis,
   * sinon laisse le user choisir (resident key / discoverable credential).
   */
  async authenticate(userId?: string): Promise<AuthenticateResult> {
    if (!this.isSupported()) return { ok: false, reason: 'WebAuthn non supporté' };
    let allowCredentials: PublicKeyCredentialDescriptor[] | undefined;
    let targetUserId = userId;
    if (userId) {
      const stored = localStorage.getItem(`${ENROLL_PREFIX}${userId}`);
      if (!stored) {
        return { ok: false, reason: 'Pas de credential enregistré pour cet utilisateur' };
      }
      const credentialId = this.b64ToBuf(stored);
      allowCredentials = [{ type: 'public-key', id: credentialId as BufferSource }];
    }
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: challenge as BufferSource,
        userVerification: 'required',
        timeout: 30000,
      };
      if (allowCredentials) publicKey.allowCredentials = allowCredentials;
      const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
      if (!assertion) return { ok: false, reason: 'Authentification annulée' };
      const credentialId = this.bufToB64(assertion.rawId);
      /* Si pas de userId fourni, lookup inverse via liste */
      if (!targetUserId) {
        const records = this.getCredentialRecords();
        const match = records.find((r) => r.id === credentialId);
        if (match) targetUserId = match.userId;
      }
      void auditLog.record('webauthn.authenticate.success', { actor: targetUserId ?? 'unknown' });
      const result: AuthenticateResult = { ok: true, credentialId };
      if (targetUserId) result.userId = targetUserId;
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void auditLog.record('webauthn.authenticate.fail', { actor: targetUserId ?? 'unknown', details: { reason: msg } });
      return { ok: false, reason: msg };
    }
  }

  /**
   * Liste credentials enrôlés pour un user. Utile pour UI gestion devices
   * ("mes devices enrôlés : iPhone 15 (15 oct), MacBook (12 nov), …").
   */
  listCredentials(userId: string): CredentialRecord[] {
    const records = this.getCredentialRecords();
    return records.filter((r) => r.userId === userId);
  }

  /**
   * Révoque un credential (perte/vol device). Idempotent : retourne true si
   * suppression effective, false si déjà absent.
   */
  revoke(credentialId: string): boolean {
    if (!credentialId) return false;
    const records = this.getCredentialRecords();
    const before = records.length;
    const remaining = records.filter((r) => r.id !== credentialId);
    if (remaining.length === before) return false;
    /* Trouve userId pour effacer la clé per-user si c'était le credential principal */
    const removed = records.find((r) => r.id === credentialId);
    try {
      localStorage.setItem(CREDENTIALS_LIST_KEY, JSON.stringify(remaining));
      if (removed) {
        const userKey = `${ENROLL_PREFIX}${removed.userId}`;
        const stored = localStorage.getItem(userKey);
        if (stored === credentialId) localStorage.removeItem(userKey);
      }
    } catch {
      /* ignore */
    }
    void auditLog.record('webauthn.revoke', {
      actor: removed?.userId ?? 'unknown',
      details: { credentialId },
    });
    return true;
  }

  /* ------------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------------ */

  private getCredentialRecords(): CredentialRecord[] {
    try {
      const raw = localStorage.getItem(CREDENTIALS_LIST_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((r): r is CredentialRecord =>
        !!r && typeof (r as CredentialRecord).id === 'string' && typeof (r as CredentialRecord).userId === 'string',
      );
    } catch {
      return [];
    }
  }

  private appendCredentialRecord(record: CredentialRecord): void {
    const records = this.getCredentialRecords();
    /* Dedupe par credentialId (re-enroll même device → garder un seul record) */
    const filtered = records.filter((r) => r.id !== record.id);
    filtered.push(record);
    try {
      localStorage.setItem(CREDENTIALS_LIST_KEY, JSON.stringify(filtered));
    } catch {
      /* ignore quota */
    }
  }

  private detectDeviceName(): string {
    if (typeof navigator === 'undefined') return 'Unknown device';
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown device';
  }

  private bufToB64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  private b64ToBuf(s: string): Uint8Array {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}

export const webauthn = new WebAuthnService();
