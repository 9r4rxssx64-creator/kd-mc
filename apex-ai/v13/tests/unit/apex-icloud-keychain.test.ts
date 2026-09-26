/**
 * Tests apex-icloud-keychain v13.4.141 (Kevin "100/100 réel").
 *
 * Module : services/apex-icloud-keychain.ts (~140 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apexIcloudKeychain } from '../../services/vault/apex-icloud-keychain.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

function setCredentials(value: unknown): void {
  Object.defineProperty(navigator, 'credentials', {
    value,
    configurable: true,
    writable: true,
  });
}

function clearCredentials(): void {
  try {
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  } catch { /* ignore */ }
}

describe('apex-icloud-keychain (v13.4.141 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as unknown as { PasswordCredential?: unknown }).PasswordCredential;
    clearCredentials();
  });

  afterEach(() => {
    localStorage.clear();
    delete (window as unknown as { PasswordCredential?: unknown }).PasswordCredential;
    clearCredentials();
  });

  describe('isSupported', () => {
    it('retourne false si PasswordCredential absent', () => {
      expect(apexIcloudKeychain.isSupported()).toBe(false);
    });

    it('retourne true si API présente', () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ store: vi.fn(), get: vi.fn() });
      expect(apexIcloudKeychain.isSupported()).toBe(true);
    });
  });

  describe('saveGithubPat', () => {
    it('retourne erreur si API non supportée', async () => {
      const r = await apexIcloudKeychain.saveGithubPat('ghp_validpat_longenough');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('credentials_api_unsupported');
    });

    it('retourne erreur si PAT trop court', async () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ store: vi.fn().mockResolvedValue(undefined) });
      const r = await apexIcloudKeychain.saveGithubPat('short');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('pat_too_short');
    });

    it('retourne ok=true si store réussit', async () => {
      const storeSpy = vi.fn().mockResolvedValue(undefined);
      (window as unknown as { PasswordCredential: new (init: object) => object }).PasswordCredential = class {
        constructor(public init: object) {}
      };
      setCredentials({ store: storeSpy });
      const r = await apexIcloudKeychain.saveGithubPat('ghp_validpat_longenough_xyz');
      expect(r.ok).toBe(true);
      expect(storeSpy).toHaveBeenCalled();
    });

    it('retourne erreur si store throw', async () => {
      (window as unknown as { PasswordCredential: new (init: object) => object }).PasswordCredential = class {
        constructor(public init: object) {}
      };
      setCredentials({ store: vi.fn().mockRejectedValue(new Error('user_cancel')) });
      const r = await apexIcloudKeychain.saveGithubPat('ghp_validpat_longenough');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('user_cancel');
    });
  });

  describe('loadGithubPat', () => {
    it('retourne erreur si API non supportée', async () => {
      const r = await apexIcloudKeychain.loadGithubPat();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('credentials_api_unsupported');
    });

    it('retourne erreur si get retourne null', async () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ get: vi.fn().mockResolvedValue(null) });
      const r = await apexIcloudKeychain.loadGithubPat();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('no_credential_returned');
    });

    it('retourne erreur si credential sans password', async () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ get: vi.fn().mockResolvedValue({ id: 'apex-vault-backup-github-pat' }) });
      const r = await apexIcloudKeychain.loadGithubPat();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('credential_no_password');
    });

    it('retourne erreur si id mismatch', async () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ get: vi.fn().mockResolvedValue({ id: 'wrong-id', password: 'xxx' }) });
      const r = await apexIcloudKeychain.loadGithubPat();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('credential_id_mismatch');
    });

    it('retourne ok+pat si tout OK', async () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({
        get: vi.fn().mockResolvedValue({
          id: 'apex-vault-backup-github-pat',
          password: 'ghp_restored_pat_xyz',
        }),
      });
      const r = await apexIcloudKeychain.loadGithubPat();
      expect(r.ok).toBe(true);
      expect(r.pat).toBe('ghp_restored_pat_xyz');
    });

    it('respecte mediation param', async () => {
      const getSpy = vi.fn().mockResolvedValue(null);
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ get: getSpy });
      await apexIcloudKeychain.loadGithubPat({ mediation: 'required' });
      expect(getSpy).toHaveBeenCalledWith(expect.objectContaining({ mediation: 'required' }));
    });

    it('gère get throw gracefully', async () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ get: vi.fn().mockRejectedValue(new Error('user_cancelled')) });
      const r = await apexIcloudKeychain.loadGithubPat();
      expect(r.ok).toBe(false);
      expect(r.error).toContain('user_cancelled');
    });
  });

  describe('bootRestore', () => {
    it('retourne pat_restored=false si API non supportée', async () => {
      const r = await apexIcloudKeychain.bootRestore();
      expect(r.pat_restored).toBe(false);
    });

    it('skip si PAT déjà présent dans localStorage', async () => {
      localStorage.setItem('ax_github_token', 'ghp_already_present_xxxx');
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ get: vi.fn().mockResolvedValue(null) });
      const r = await apexIcloudKeychain.bootRestore();
      expect(r.pat_restored).toBe(false);
    });

    it('retourne pat_restored=false si load fail', async () => {
      (window as unknown as { PasswordCredential: unknown }).PasswordCredential = class {};
      setCredentials({ get: vi.fn().mockResolvedValue(null) });
      const r = await apexIcloudKeychain.bootRestore();
      expect(r.pat_restored).toBe(false);
    });
  });
});
