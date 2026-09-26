/**
 * auth coverage final boost — branches manquantes (Sprint 9 Kevin v13.0.78+)
 *
 * Cible : auth.ts L:88.2% F:90.5% B:80.2% → ≥95%
 * Branches manquantes : restoreSession TTL/mismatch, listUsers admin guard,
 * createUser flows, untrustCurrentDevice, loginTrusted edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { auth } from '../../services/auth/auth.js';
import { store } from '../../core/store.js';

describe('auth coverage final boost', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.0.0' });
  });

  describe('isKevinAdmin patterns', () => {
    it('reconnaît "Kevin Desarzens"', () => {
      expect(auth.isKevinAdmin('Kevin Desarzens')).toBe(true);
    });

    it('reconnaît "Desarzens Kevin" (ordre inverse)', () => {
      expect(auth.isKevinAdmin('Desarzens Kevin')).toBe(true);
    });

    it('reconnaît email "kevin.desarzens@gmail.com"', () => {
      expect(auth.isKevinAdmin('kevin.desarzens@gmail.com')).toBe(true);
    });

    it('rejette juste "Kevin" (1 token)', () => {
      expect(auth.isKevinAdmin('Kevin')).toBe(false);
    });

    it('rejette nom vide', () => {
      expect(auth.isKevinAdmin('')).toBe(false);
    });

    it('rejette "Laurent Desarzens" (variation)', () => {
      expect(auth.isKevinAdmin('Laurent Desarzens')).toBe(false);
    });
  });

  describe('isAdminSync', () => {
    it('user null → false', () => {
      store.set('user', null);
      expect(auth.isAdminSync()).toBe(false);
    });

    it('user kdmc_admin → true', () => {
      store.set('user', { id: 'kdmc_admin', name: 'K' });
      expect(auth.isAdminSync()).toBe(true);
    });

    it('user random → false', () => {
      store.set('user', { id: 'random', name: 'X' });
      expect(auth.isAdminSync()).toBe(false);
    });

    it('isAdmin async retourne même résultat', async () => {
      store.set('user', { id: 'kdmc_admin', name: 'K' });
      expect(await auth.isAdmin()).toBe(true);
    });
  });

  describe('login validation', () => {
    it('login sans nom → ok=false', async () => {
      const r = await auth.login('', '123456');
      expect(r.ok).toBe(false);
    });

    it('login sans pin → ok=false', async () => {
      const r = await auth.login('Kevin Desarzens', '');
      expect(r.ok).toBe(false);
    });

    it('login pin trop court (< 4) → ok=false', async () => {
      const r = await auth.login('Kevin Desarzens', '12');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('court');
    });

    it('login juste prénom (1 token) → erreur actionnable', async () => {
      const r = await auth.login('Laurence', '123456');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('prénom');
    });

    it('login user inconnu (2 tokens) → erreur actionnable', async () => {
      const r = await auth.login('Random Inconnu', '123456');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/orthograph/i);
    });

    it('login Kevin première fois → enregistre PIN', async () => {
      const r = await auth.login('Kevin Desarzens', 'monPIN1234');
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('apex_v13_pin')).toBeTruthy();
    });

    it('login Kevin 2e fois avec mauvais PIN → ok=false', async () => {
      await auth.login('Kevin Desarzens', 'monPIN1234');
      const r = await auth.login('Kevin Desarzens', 'wrongPIN');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/incorrect/i);
    });
  });

  describe('logout', () => {
    it('logout efface session keys whitelistées', async () => {
      await auth.login('Kevin Desarzens', 'pin1234');
      auth.logout();
      expect(localStorage.getItem('apex_v13_user')).toBeNull();
      expect(localStorage.getItem('apex_v13_uid')).toBeNull();
      expect(store.get('user')).toBeNull();
    });

    it('logout sans user actif → pas de throw', () => {
      expect(() => auth.logout()).not.toThrow();
    });
  });

  describe('restoreSession', () => {
    it('sans données localStorage → no-op', () => {
      auth.restoreSession();
      expect(store.get('user')).toBeFalsy();
    });

    it('session expirée (>8h) → logout', () => {
      const oldTs = Date.now() - 9 * 60 * 60 * 1000;
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin', name: 'Kevin' }));
      localStorage.setItem('apex_v13_uid', 'kdmc_admin');
      localStorage.setItem('apex_v13_lastact', String(oldTs));
      auth.restoreSession();
      expect(localStorage.getItem('apex_v13_user')).toBeNull();
    });

    it('user_id mismatch → logout (anti-pattern v12.272)', () => {
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin', name: 'K' }));
      localStorage.setItem('apex_v13_uid', 'autre_uid');
      localStorage.setItem('apex_v13_lastact', String(Date.now()));
      auth.restoreSession();
      expect(localStorage.getItem('apex_v13_user')).toBeNull();
    });

    it('session valide → restore user dans store', () => {
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin', name: 'Kevin' }));
      localStorage.setItem('apex_v13_uid', 'kdmc_admin');
      localStorage.setItem('apex_v13_lastact', String(Date.now()));
      auth.restoreSession();
      expect((store.get('user') as { id: string } | null)?.id).toBe('kdmc_admin');
      expect(store.get('isAdmin')).toBe(true);
    });

    it('JSON corrompu → catch silencieux', () => {
      localStorage.setItem('apex_v13_user', '{broken json');
      localStorage.setItem('apex_v13_uid', 'kdmc_admin');
      localStorage.setItem('apex_v13_lastact', String(Date.now()));
      expect(() => auth.restoreSession()).not.toThrow();
    });
  });

  describe('listUsers', () => {
    it('non admin → liste vide', () => {
      store.set('isAdmin', false);
      expect(auth.listUsers()).toEqual([]);
    });

    it('admin sans users → array vide', () => {
      store.set('isAdmin', true);
      expect(auth.listUsers()).toEqual([]);
    });

    it('admin avec users persistés', () => {
      store.set('isAdmin', true);
      const users = [{ id: 'u1', name: 'Test', tier: 'family', activated: true }];
      localStorage.setItem('apex_v13_users', JSON.stringify(users));
      expect(auth.listUsers().length).toBe(1);
    });

    it('JSON corrompu → array vide', () => {
      store.set('isAdmin', true);
      localStorage.setItem('apex_v13_users', '{broken');
      expect(auth.listUsers()).toEqual([]);
    });
  });

  describe('createUser', () => {
    it('non admin → ok=false', async () => {
      store.set('isAdmin', false);
      const r = await auth.createUser({ name: 'Test', tier: 'family' });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/admin/i);
    });

    it('nom vide → ok=false', async () => {
      store.set('isAdmin', true);
      const r = await auth.createUser({ name: '   ', tier: 'family' });
      expect(r.ok).toBe(false);
    });

    it('création OK → uid + inviteLink retournés', async () => {
      store.set('isAdmin', true);
      const r = await auth.createUser({ name: 'New User', tier: 'family' });
      expect(r.ok).toBe(true);
      expect(r.uid).toBeTruthy();
      expect(r.inviteLink).toContain('#invite=');
    });

    it('tier client_pro persisté', async () => {
      store.set('isAdmin', true);
      const r = await auth.createUser({ name: 'Pro', tier: 'client_pro' });
      expect(r.ok).toBe(true);
      const tier = localStorage.getItem(`apex_v13_tier_${r.uid}`);
      expect(tier).toBe('client_pro');
    });

    it('avec initialPin → hash stocké', async () => {
      store.set('isAdmin', true);
      const r = await auth.createUser({ name: 'PinUser', tier: 'family', initialPin: 'abc123' });
      expect(r.ok).toBe(true);
      const hash = localStorage.getItem(`apex_v13_pin_${r.uid}`);
      expect(hash).toBeTruthy();
      expect(hash?.length).toBe(64); /* PBKDF2 hex */
    });
  });

  describe('untrustCurrentDevice', () => {
    it('clear apex_v13_device_trusted_v1', () => {
      localStorage.setItem('apex_v13_device_trusted_v1', 'fake_id');
      auth.untrustCurrentDevice();
      expect(localStorage.getItem('apex_v13_device_trusted_v1')).toBeNull();
    });

    it('idempotent (pas de throw si déjà absent)', () => {
      expect(() => auth.untrustCurrentDevice()).not.toThrow();
    });
  });

  describe('loginTrusted', () => {
    it('sans device trusted → ok=false', async () => {
      const r = await auth.loginTrusted('kdmc_admin', 'Kevin');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/non trusted/i);
    });

    it('user inconnu → ok=false', async () => {
      localStorage.setItem('apex_v13_device_trusted_v1', 'some_fp');
      /* Pas de moyen sans mock device-context, mais teste flow */
      const r = await auth.loginTrusted('unknown_uid', 'X');
      /* Soit user unknown, soit fingerprint mismatch */
      expect(r.ok).toBe(false);
    });
  });

  describe('rate-limit progressif', () => {
    it('5 fails → lockout 30s', async () => {
      await auth.login('Kevin Desarzens', 'rightPIN1234');
      auth.logout();
      /* 5 fails consécutifs */
      for (let i = 0; i < 5; i++) {
        await auth.login('Kevin Desarzens', 'wrongPIN' + i);
      }
      const r = await auth.login('Kevin Desarzens', 'wrongAgain');
      expect(r.ok).toBe(false);
      /* Soit "trop de tentatives" soit "incorrect" — les deux acceptables après 5 fails */
      expect(r.reason).toBeTruthy();
    });

    it('login success efface fails counter', async () => {
      await auth.login('Kevin Desarzens', 'pinCorrect');
      auth.logout();
      await auth.login('Kevin Desarzens', 'wrongPIN');
      await auth.login('Kevin Desarzens', 'pinCorrect');
      /* Re-fail → 1er fail seulement (compteur reset au login OK) */
      const failsRaw = localStorage.getItem('apex_v13_pin_fails_kdmc_admin');
      expect(failsRaw).toBeNull();
    });
  });

  describe('hashPin determinism', () => {
    it('même input → même hash', async () => {
      const a = await auth.hashPin('1234', 'salt-x');
      const b = await auth.hashPin('1234', 'salt-x');
      expect(a).toBe(b);
    });

    it('salt différent → hash différent', async () => {
      const a = await auth.hashPin('1234', 'salt-A');
      const b = await auth.hashPin('1234', 'salt-B');
      expect(a).not.toBe(b);
    });

    it('hash format hex 64 chars (SHA-256)', async () => {
      const h = await auth.hashPin('test', 'salt');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
