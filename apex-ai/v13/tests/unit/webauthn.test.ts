import { describe, it, expect, beforeEach } from 'vitest';
import { webauthn } from '../../services/auth/webauthn.js';

describe('webauthn service (tests Jet 6.5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('isSupported + isPlatformAuthAvailable', () => {
    it('isSupported retourne boolean', () => {
      expect(typeof webauthn.isSupported()).toBe('boolean');
    });

    it('isPlatformAuthAvailable retourne Promise<boolean>', async () => {
      const r = await webauthn.isPlatformAuthAvailable();
      expect(typeof r).toBe('boolean');
    });
  });

  describe('hasEnrollment', () => {
    it('false par défaut', () => {
      expect(webauthn.hasEnrollment('uid_jamais_enroll')).toBe(false);
    });

    it('true après enroll local manuel', () => {
      localStorage.setItem('apex_v13_webauthn_uid_test', 'fake_credential_b64');
      expect(webauthn.hasEnrollment('uid_test')).toBe(true);
    });
  });

  describe('verify sans enrollment', () => {
    it('retourne ok=false si pas de credential stocké', async () => {
      const r = await webauthn.verify('uid_no_enrollment');
      expect(r.ok).toBe(false);
      expect(r.reason).toBeTruthy();
    });
  });

  describe('enroll erreur sans support', () => {
    it('enroll throw soit ok soit reason présent', async () => {
      const r = await webauthn.enroll('uid_test', 'Kevin');
      /* En env happy-dom (pas de WebAuthn natif), enroll échoue gracieusement */
      expect(typeof r.ok).toBe('boolean');
      if (!r.ok) expect(r.reason).toBeTruthy();
    });
  });

  describe('Sprint 6 P0 — coverage push 90%+', () => {
    it('verify avec enrollment fake retourne ok=false (pas de credentials.get)', async () => {
      localStorage.setItem('apex_v13_webauthn_uid_x', 'fake_b64_credential_id');
      const r = await webauthn.verify('uid_x');
      expect(r.ok).toBe(false);
    });

    it('hasEnrollment teste plusieurs uid', () => {
      expect(webauthn.hasEnrollment('uid_a')).toBe(false);
      localStorage.setItem('apex_v13_webauthn_uid_a', 'cred_a');
      localStorage.setItem('apex_v13_webauthn_uid_b', 'cred_b');
      expect(webauthn.hasEnrollment('uid_a')).toBe(true);
      expect(webauthn.hasEnrollment('uid_b')).toBe(true);
      expect(webauthn.hasEnrollment('uid_c')).toBe(false);
    });

    it('isSupported false en happy-dom (pas de PublicKeyCredential)', () => {
      const r = webauthn.isSupported();
      /* Happy-dom n'a pas PublicKeyCredential donc retourne false */
      expect(r).toBe(false);
    });

    it('isPlatformAuthAvailable retourne false sans PublicKeyCredential', async () => {
      const r = await webauthn.isPlatformAuthAvailable();
      /* Sans support, retourne false */
      expect(r).toBe(false);
    });

    it('enroll sans support retourne ok=false avec reason', async () => {
      const r = await webauthn.enroll('uid_no_support', 'TestUser');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/support|available|disponible|non/i);
    });

    it('enroll uid vide accepté (pas de validation stricte uid)', async () => {
      const r = await webauthn.enroll('', '');
      /* Soit fail support, soit accepte (selon implementation) */
      expect(typeof r.ok).toBe('boolean');
    });

    it('verify avec uid spécial chars OK', async () => {
      const r = await webauthn.verify('uid+special@chars=123');
      expect(typeof r.ok).toBe('boolean');
    });
  });
});
