/**
 * Tests apex-github-gist-backup v13.4.141 (Kevin "100/100 réel").
 *
 * Module : services/apex-github-gist-backup.ts (~280 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAuth, mockVault } = vi.hoisted(() => ({
  mockAuth: { isAdminSync: vi.fn() },
  mockVault: {
    encryptAuto: vi.fn(),
    decryptAuto: vi.fn(),
    readKey: vi.fn(),
    setKey: vi.fn(),
  },
}));

vi.mock('../../services/auth/auth.js', () => ({ auth: mockAuth }));
vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));

import { apexGithubGistBackup } from '../../services/vault/apex-github-gist-backup.js';

describe('apex-github-gist-backup (v13.4.141 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    /* default : admin OK */
    mockAuth.isAdminSync.mockReturnValue(true);
    mockVault.readKey.mockResolvedValue('ghp_fake_token_xxxxxxxx');
    mockVault.encryptAuto.mockResolvedValue('AXENC1:encrypted_blob');
    mockVault.decryptAuto.mockResolvedValue(
      JSON.stringify({ count: 2, keys: [
        { storageKey: 'ax_anthropic_key', plaintext: 'sk-ant-xxx' },
        { storageKey: 'ax_openai_key', plaintext: 'sk-oai-yyy' },
      ] }),
    );
    mockVault.setKey.mockResolvedValue({ ok: true });
    /* Reset throttle */
    (apexGithubGistBackup as unknown as { throttleLastPush: number }).throttleLastPush = 0;
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('pushBackup', () => {
    it('refuse si non-admin', async () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = await apexGithubGistBackup.pushBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('admin_only_push');
    });

    it('refuse si token absent', async () => {
      mockVault.readKey.mockResolvedValue('');
      const r = await apexGithubGistBackup.pushBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('github_token_missing');
    });

    it('refuse si vault vide', async () => {
      /* No ax_*_key in localStorage → collectVaultPlaintext retournera count=0 */
      const r = await apexGithubGistBackup.pushBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('vault_empty_skip');
    });

    it('throttle si push récent', async () => {
      (apexGithubGistBackup as unknown as { throttleLastPush: number }).throttleLastPush = Date.now();
      const r = await apexGithubGistBackup.pushBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('throttled');
    });

    it('force bypass throttle', async () => {
      (apexGithubGistBackup as unknown as { throttleLastPush: number }).throttleLastPush = Date.now();
      mockVault.readKey.mockResolvedValue('');
      const r = await apexGithubGistBackup.pushBackup({ force: true });
      /* throttle bypassed mais token vide */
      expect(r.error).toBe('github_token_missing');
    });

    it('push réussit avec gist nouveau', async () => {
      localStorage.setItem('ax_anthropic_key', 'AXENC1:dummy');
      /* readKey appelé 1x pour token + 1x pour chaque key trouvée */
      mockVault.readKey
        .mockResolvedValueOnce('ghp_token')
        .mockResolvedValue('sk-ant-fakeplaintext');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) /* list empty */
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'gist_new_xyz' }), { status: 201 })) /* create */;
      const r = await apexGithubGistBackup.pushBackup();
      expect(r.ok).toBe(true);
      expect(r.gist_id).toBe('gist_new_xyz');
    });

    it('encrypt fail → ok=false', async () => {
      localStorage.setItem('ax_anthropic_key', 'AXENC1:dummy');
      mockVault.readKey
        .mockResolvedValueOnce('ghp_token')
        .mockResolvedValue('sk-ant-plaintext');
      mockVault.encryptAuto.mockRejectedValue(new Error('encrypt boom'));
      const r = await apexGithubGistBackup.pushBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('encrypt_failed');
    });
  });

  describe('pullBackup', () => {
    it('refuse si non-admin', async () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = await apexGithubGistBackup.pullBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('admin_only_pull');
    });

    it('refuse si token absent', async () => {
      mockVault.readKey.mockResolvedValue('');
      const r = await apexGithubGistBackup.pullBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('github_token_missing');
    });

    it('retourne no_gist_found si aucun gist', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 }),
      );
      const r = await apexGithubGistBackup.pullBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('no_gist_found');
    });

    it('restore keys via vault.setKey', async () => {
      const gistContent = JSON.stringify({
        v: 1,
        ts: Date.now(),
        uid: 'kdmc_admin',
        encrypted: 'AXENC1:fake',
        count: 2,
      });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([{ id: 'g_abc', description: 'apex-vault-backup-v1-kdmc_admin', files: {}, updated_at: '2026-01-01' }]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'g_abc',
              description: 'apex-vault-backup-v1-kdmc_admin',
              files: { 'vault.enc': { content: gistContent } },
              updated_at: '2026-01-01',
            }),
            { status: 200 },
          ),
        );
      const r = await apexGithubGistBackup.pullBackup();
      expect(r.ok).toBe(true);
      expect(r.restored).toBe(2);
    });

    it('retourne gist_json_invalid si content malformé', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([{ id: 'g_x', description: 'apex-vault-backup-v1-kdmc_admin', files: {}, updated_at: '2026-01-01' }]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'g_x',
              description: 'apex-vault-backup-v1-kdmc_admin',
              files: { 'vault.enc': { content: '{invalid json' } },
            }),
            { status: 200 },
          ),
        );
      const r = await apexGithubGistBackup.pullBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('gist_json_invalid');
    });

    it('retourne gist_version_mismatch si v != 1', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([{ id: 'g_x', description: 'apex-vault-backup-v1-kdmc_admin', files: {}, updated_at: '2026-01-01' }]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'g_x',
              description: 'apex-vault-backup-v1-kdmc_admin',
              files: { 'vault.enc': { content: JSON.stringify({ v: 99, encrypted: 'x' }) } },
            }),
            { status: 200 },
          ),
        );
      const r = await apexGithubGistBackup.pullBackup();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('gist_version_mismatch');
    });
  });

  describe('hasBackup', () => {
    it('retourne exists=false si pas de token', async () => {
      mockVault.readKey.mockResolvedValue('');
      const r = await apexGithubGistBackup.hasBackup();
      expect(r.exists).toBe(false);
    });

    it('retourne exists=true si gist trouvé', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([{ id: 'gxyz', description: 'apex-vault-backup-v1-kdmc_admin', files: {}, updated_at: '2026-04-01' }]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: 'gxyz', description: 'apex-vault-backup-v1-kdmc_admin', files: {}, updated_at: '2026-04-01' }),
            { status: 200 },
          ),
        );
      const r = await apexGithubGistBackup.hasBackup();
      expect(r.exists).toBe(true);
      expect(r.gist_id).toBe('gxyz');
    });

    it('retourne exists=false si list HTTP fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
      const r = await apexGithubGistBackup.hasBackup();
      expect(r.exists).toBe(false);
    });
  });
});
