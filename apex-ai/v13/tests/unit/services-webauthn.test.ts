/**
 * Tests services/webauthn.ts — nouvelles méthodes Kevin v13.1.0.
 *
 * Couvre :
 * - isAvailable() : { supported, platform } selon env
 * - register({ username, displayName }) : fail sans support, validation params
 * - authenticate() : fail sans credential
 * - listCredentials(userId) : retourne records persistés
 * - revoke(credentialId) : retourne true si suppression, false sinon
 *
 * Note : tests des credentials réels (FaceID natif) délégués à Playwright E2E iPhone.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { webauthn } from '../../services/auth/webauthn.js';

const CRED_LIST_KEY = 'apex_v13_webauthn_credentials';

describe('webauthn service v13.1.0 (Kevin brief)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('isAvailable', () => {
    it('retourne shape { supported, platform }', async () => {
      const r = await webauthn.isAvailable();
      expect(r).toHaveProperty('supported');
      expect(r).toHaveProperty('platform');
    });

    it('en happy-dom : supported=false + platform=null', async () => {
      const r = await webauthn.isAvailable();
      expect(r.supported).toBe(false);
      expect(r.platform).toBeNull();
    });
  });

  describe('register', () => {
    it('fail sans username', async () => {
      const r = await webauthn.register({ username: '', displayName: 'Kevin' });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/username/i);
    });

    it('fail sans support WebAuthn (happy-dom)', async () => {
      const r = await webauthn.register({ username: 'kevin', displayName: 'Kevin DESARZENS' });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/non support|WebAuthn/i);
    });

    it('accepte options.userId override', async () => {
      const r = await webauthn.register({
        username: 'kevin',
        displayName: 'Kevin',
        userId: 'kdmc_admin',
      });
      /* En happy-dom : fail support, mais valide signature options */
      expect(typeof r.ok).toBe('boolean');
    });
  });

  describe('authenticate', () => {
    it('fail sans support', async () => {
      const r = await webauthn.authenticate();
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/non support|WebAuthn/i);
    });

    it('fail si userId fourni mais pas de credential stocké', async () => {
      const r = await webauthn.authenticate('kdmc_admin');
      expect(r.ok).toBe(false);
      /* En happy-dom : soit "Pas de credential" soit "non supporté" — les deux sont OK */
      expect(r.reason).toBeTruthy();
    });

    it('userId optionnel', async () => {
      /* Sans userId → tente discoverable credential, fail support */
      const r = await webauthn.authenticate();
      expect(typeof r.ok).toBe('boolean');
    });
  });

  describe('listCredentials', () => {
    it('vide par défaut', () => {
      const list = webauthn.listCredentials('kdmc_admin');
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(0);
    });

    it('retourne records pour userId donné', () => {
      const records = [
        { id: 'cred_a', userId: 'kdmc_admin', deviceName: 'iPhone', createdAt: 100 },
        { id: 'cred_b', userId: 'laurence', deviceName: 'Mac', createdAt: 200 },
        { id: 'cred_c', userId: 'kdmc_admin', deviceName: 'iPad', createdAt: 300 },
      ];
      localStorage.setItem(CRED_LIST_KEY, JSON.stringify(records));
      const adminCreds = webauthn.listCredentials('kdmc_admin');
      expect(adminCreds.length).toBe(2);
      expect(adminCreds.every((r) => r.userId === 'kdmc_admin')).toBe(true);
    });

    it('safe avec localStorage corrompu', () => {
      localStorage.setItem(CRED_LIST_KEY, 'not valid json');
      const list = webauthn.listCredentials('kdmc_admin');
      expect(list).toEqual([]);
    });

    it('filtre records malformés', () => {
      const records = [
        { id: 'cred_ok', userId: 'kdmc_admin', deviceName: 'X', createdAt: 1 },
        { id: 123, userId: 'kdmc_admin' }, /* malformé */
        null,
        { userId: 'kdmc_admin' }, /* sans id */
      ];
      localStorage.setItem(CRED_LIST_KEY, JSON.stringify(records));
      const list = webauthn.listCredentials('kdmc_admin');
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('cred_ok');
    });
  });

  describe('revoke', () => {
    it('false si credentialId vide', () => {
      expect(webauthn.revoke('')).toBe(false);
    });

    it('false si credential non trouvé', () => {
      expect(webauthn.revoke('inexistant')).toBe(false);
    });

    it('true si suppression effective + records mis à jour', () => {
      const records = [
        { id: 'cred_a', userId: 'kdmc_admin', deviceName: 'iPhone', createdAt: 100 },
        { id: 'cred_b', userId: 'kdmc_admin', deviceName: 'Mac', createdAt: 200 },
      ];
      localStorage.setItem(CRED_LIST_KEY, JSON.stringify(records));
      expect(webauthn.revoke('cred_a')).toBe(true);
      const remaining = webauthn.listCredentials('kdmc_admin');
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.id).toBe('cred_b');
    });

    it('efface aussi clé per-user si c\'était le credential principal', () => {
      const records = [{ id: 'cred_main', userId: 'kdmc_admin', deviceName: 'X', createdAt: 1 }];
      localStorage.setItem(CRED_LIST_KEY, JSON.stringify(records));
      localStorage.setItem('apex_v13_webauthn_kdmc_admin', 'cred_main');
      expect(webauthn.revoke('cred_main')).toBe(true);
      expect(localStorage.getItem('apex_v13_webauthn_kdmc_admin')).toBeNull();
    });

    it('garde clé per-user si credential révoqué ne match pas', () => {
      const records = [{ id: 'cred_other', userId: 'kdmc_admin', deviceName: 'X', createdAt: 1 }];
      localStorage.setItem(CRED_LIST_KEY, JSON.stringify(records));
      localStorage.setItem('apex_v13_webauthn_kdmc_admin', 'cred_main');
      webauthn.revoke('cred_other');
      expect(localStorage.getItem('apex_v13_webauthn_kdmc_admin')).toBe('cred_main');
    });

    it('idempotent : second appel retourne false', () => {
      const records = [{ id: 'cred_x', userId: 'u1', deviceName: 'D', createdAt: 1 }];
      localStorage.setItem(CRED_LIST_KEY, JSON.stringify(records));
      expect(webauthn.revoke('cred_x')).toBe(true);
      expect(webauthn.revoke('cred_x')).toBe(false);
    });
  });

  describe('rétro-compat enroll/verify (existing API)', () => {
    it('enroll fail sans support', async () => {
      const r = await webauthn.enroll('kdmc_admin', 'Kevin');
      expect(r.ok).toBe(false);
      expect(r.reason).toBeTruthy();
    });

    it('verify fail sans enrollment', async () => {
      const r = await webauthn.verify('kdmc_admin');
      expect(r.ok).toBe(false);
    });

    it('hasEnrollment false par défaut', () => {
      expect(webauthn.hasEnrollment('inexistant')).toBe(false);
    });

    it('hasEnrollment true après set localStorage', () => {
      localStorage.setItem('apex_v13_webauthn_kevin', 'fake_b64');
      expect(webauthn.hasEnrollment('kevin')).toBe(true);
    });
  });
});
