/**
 * Tests FaceID/TouchID au login (règle ABSOLUE Kevin 2026-05-22 :
 * "1ère connexion PIN, ensuite reconnu auto / FaceID, PIN reste fallback").
 * Couvre offerBiometricEnroll + tryBiometricUnlock + le bouton landing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { store } from '../../core/store.js';
import { auth } from '../../services/auth/auth.js';
import { webauthn } from '../../services/auth/webauthn.js';

describe('Landing — FaceID / TouchID (Kevin règle absolue)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    /* DOM API plutôt que innerHTML (règle frontend.md + évite faux positif SAST sur fixture) */
    document.body.replaceChildren();
    root = document.createElement('div');
    root.id = 'apex-root';
    document.body.appendChild(root);
    store.init({ appVer: 'v13.0.0' });
    store.set('user', null);
    location.hash = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('offerBiometricEnroll', () => {
    it('ne propose rien si déjà enrôlé', async () => {
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(true);
      const availSpy = vi.spyOn(webauthn, 'isAvailable');
      const { offerBiometricEnroll } = await import('../../features/landing/index.js');
      const r = await offerBiometricEnroll('kdmc_admin', 'Kevin');
      expect(r).toBe(false);
      expect(availSpy).not.toHaveBeenCalled();
    });

    it('ne propose rien si biométrie plateforme indisponible', async () => {
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(false);
      vi.spyOn(webauthn, 'isAvailable').mockResolvedValue({ supported: false, platform: null });
      const regSpy = vi.spyOn(webauthn, 'register');
      const { offerBiometricEnroll } = await import('../../features/landing/index.js');
      const r = await offerBiometricEnroll('u1', 'User');
      expect(r).toBe(false);
      expect(regSpy).not.toHaveBeenCalled();
    });

    it('enrôle si user accepte (confirm=true) + platform dispo', async () => {
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(false);
      vi.spyOn(webauthn, 'isAvailable').mockResolvedValue({ supported: true, platform: 'platform' });
      const regSpy = vi.spyOn(webauthn, 'register').mockResolvedValue({ ok: true, credentialId: 'cred1' });
      vi.stubGlobal('confirm', () => true);
      const { offerBiometricEnroll } = await import('../../features/landing/index.js');
      const r = await offerBiometricEnroll('u1', 'User One');
      expect(r).toBe(true);
      expect(regSpy).toHaveBeenCalledWith({ username: 'u1', displayName: 'User One' });
      vi.unstubAllGlobals();
    });

    it('mémorise le refus (confirm=false) → ne re-propose plus', async () => {
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(false);
      vi.spyOn(webauthn, 'isAvailable').mockResolvedValue({ supported: true, platform: 'platform' });
      const regSpy = vi.spyOn(webauthn, 'register');
      vi.stubGlobal('confirm', () => false);
      const { offerBiometricEnroll } = await import('../../features/landing/index.js');
      const r1 = await offerBiometricEnroll('u2', 'User Two');
      expect(r1).toBe(true);
      expect(regSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('apex_v13_biometric_declined_u2')).toBe('1');
      /* 2e appel : refus mémorisé → false, isAvailable plus appelé */
      const availSpy = vi.spyOn(webauthn, 'isAvailable');
      const r2 = await offerBiometricEnroll('u2', 'User Two');
      expect(r2).toBe(false);
      expect(availSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('fail-safe : ne throw jamais (register rejette)', async () => {
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(false);
      vi.spyOn(webauthn, 'isAvailable').mockResolvedValue({ supported: true, platform: 'platform' });
      vi.spyOn(webauthn, 'register').mockRejectedValue(new Error('boom'));
      vi.stubGlobal('confirm', () => true);
      const { offerBiometricEnroll } = await import('../../features/landing/index.js');
      /* register rejette → catch englobant → false (fail-safe), surtout PAS de throw. */
      await expect(offerBiometricEnroll('u3', 'U3')).resolves.toBe(false);
      vi.unstubAllGlobals();
    });
  });

  describe('tryBiometricUnlock', () => {
    it('false si pas de last_known_uid', async () => {
      const { tryBiometricUnlock } = await import('../../features/landing/index.js');
      expect(await tryBiometricUnlock()).toBe(false);
    });

    it('false si user non enrôlé', async () => {
      localStorage.setItem('apex_v13_last_known_uid', 'u1');
      localStorage.setItem('apex_v13_last_known_name', 'User');
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(false);
      const { tryBiometricUnlock } = await import('../../features/landing/index.js');
      expect(await tryBiometricUnlock()).toBe(false);
    });

    it('déverrouille + loginTrusted si authenticate OK', async () => {
      localStorage.setItem('apex_v13_last_known_uid', 'u1');
      localStorage.setItem('apex_v13_last_known_name', 'User One');
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(true);
      vi.spyOn(webauthn, 'authenticate').mockResolvedValue({ ok: true });
      const trustedSpy = vi.spyOn(auth, 'loginTrusted').mockResolvedValue({ ok: true });
      const { tryBiometricUnlock } = await import('../../features/landing/index.js');
      const r = await tryBiometricUnlock();
      expect(r).toBe(true);
      expect(trustedSpy).toHaveBeenCalledWith('u1', 'User One');
    });

    it('false si authenticate échoue (fallback PIN, pas de loginTrusted)', async () => {
      localStorage.setItem('apex_v13_last_known_uid', 'u1');
      localStorage.setItem('apex_v13_last_known_name', 'User One');
      vi.spyOn(webauthn, 'hasEnrollment').mockReturnValue(true);
      vi.spyOn(webauthn, 'authenticate').mockResolvedValue({ ok: false, reason: 'NotAllowedError' });
      const trustedSpy = vi.spyOn(auth, 'loginTrusted');
      const { tryBiometricUnlock } = await import('../../features/landing/index.js');
      expect(await tryBiometricUnlock()).toBe(false);
      expect(trustedSpy).not.toHaveBeenCalled();
    });
  });

  describe('bouton landing #login-biometric', () => {
    it('présent dans le DOM mais masqué par défaut (pas enrôlé)', async () => {
      const { render } = await import('../../features/landing/index.js');
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('#login-biometric');
      expect(btn).toBeTruthy();
      expect(btn?.style.display).toBe('none');
    });

    it('le PIN reste TOUJOURS disponible (form + reset PIN présents)', async () => {
      const { render } = await import('../../features/landing/index.js');
      render(root);
      expect(root.querySelector('#login-pin')).toBeTruthy();
      expect(root.querySelector('#login-form')).toBeTruthy();
      expect(root.querySelector('#login-reset-pin')).toBeTruthy();
    });
  });
});
