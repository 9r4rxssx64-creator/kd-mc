/**
 * P0 PARITÉ CLAUDE CODE (Kevin screenshots 2026-05-07) :
 * Apex IA disait "Tools GitHub | Non exécutés — affichage seulement".
 * v13.3.1 ajoute create_or_update_file + delete_repo_file via GitHub Contents API.
 *
 * Tests qu'Apex peut désormais ÉCRIRE des fichiers réellement (pas juste afficher).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from '../../core/store.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';

describe('Apex GitHub write tools (P0 parité Claude Code)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    /* v13.4.246 : execute('admin') re-vérifie auth.isAdminSync() (fail-closed).
       Session admin réelle requise sinon tools rétrogradés → "Tier insuffisant". */
    store.set('user', { id: 'kdmc_admin', name: 'K' });
  });

  afterEach(() => {
    store.set('user', null);
  });

  describe('create_or_update_file', () => {
    it('refuse si ax_github_token non configuré', async () => {
      const r = await apexToolsDispatch.execute('create_or_update_file', {
        path: 'test/file.ts',
        content: 'export const x = 1;',
      }, 'admin');
      /* dispatch wraps executeTaskOnService → r.ok=true même si task fail.
       * Le vrai status est dans r.result.ok */
      const inner = r.result as { ok?: boolean; error?: string };
      expect(inner.ok).toBe(false);
      expect(inner.error).toMatch(/ax_github_token|configur/i);
    });

    it('refuse content vide (anti-écrasement accidentel)', async () => {
      /* Mock token via setKey direct */
      const { vault } = await import('../../services/vault/vault.js');
      await vault.setKey('ax_github_token', 'ghp_fake_token_for_test');
      const r = await apexToolsDispatch.execute('create_or_update_file', {
        path: 'test/empty.ts',
        content: '',
      }, 'admin');
      const inner = r.result as { ok?: boolean; error?: string };
      expect(inner.ok).toBe(false);
      expect(inner.error).toMatch(/content vide|delete_file/i);
    });

    it('refuse si path manquant', async () => {
      const { vault } = await import('../../services/vault/vault.js');
      await vault.setKey('ax_github_token', 'ghp_fake_token');
      const r = await apexToolsDispatch.execute('create_or_update_file', {
        content: 'export const x = 1;',
      }, 'admin');
      const inner = r.result as { ok?: boolean; error?: string };
      expect(inner.ok).toBe(false);
      expect(inner.error).toMatch(/path required/i);
    });

    it('crée fichier nouveau via fetch mock 201 Created', async () => {
      const { vault } = await import('../../services/vault/vault.js');
      await vault.setKey('ax_github_token', 'ghp_fake_token');
      /* Mock keyé par URL+méthode (déterministe) : vault.setKey peut déclencher
         un fetch backup Firebase concurrent qui, avec mockResolvedValueOnce,
         consommait une des réponses GitHub → flake non-déterministe. */
      let putCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('api.github.com')) {
          if (method === 'PUT') {
            putCount++;
            return new Response(JSON.stringify({
              commit: { sha: 'abc123', html_url: 'https://github.com/x/y/commit/abc123' },
              content: { html_url: 'https://github.com/x/y/blob/main/test/new.ts' },
            }), { status: 201 });
          }
          return new Response('Not Found', { status: 404 }); /* GET check existing */
        }
        return new Response('{}', { status: 200 }); /* fetches non-GitHub (backup, etc.) */
      });

      const r = await apexToolsDispatch.execute('create_or_update_file', {
        path: 'test/new.ts',
        content: 'export const x = 1;',
        message: 'Apex IA: test create',
      }, 'admin');
      expect(r.ok).toBe(true);
      const outer = r.result as { ok?: boolean; result?: { action?: string; commit_sha?: string } };
      expect(outer.ok).toBe(true);
      expect(outer.result?.action).toBe('created');
      expect(outer.result?.commit_sha).toBe('abc123');
      expect(fetchSpy).toHaveBeenCalled();
      expect(putCount).toBe(1); /* un seul PUT de création, peu importe le nb de GET de vérif */
    });

    it('update fichier existant via SHA récupéré', async () => {
      const { vault } = await import('../../services/vault/vault.js');
      await vault.setKey('ax_github_token', 'ghp_fake_token');
      /* Mock keyé par URL+méthode (déterministe, cf. test create ci-dessus). */
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('api.github.com')) {
          if (method === 'PUT') {
            return new Response(JSON.stringify({
              commit: { sha: 'new_sha_def', html_url: 'https://github.com/x/y/commit/new_sha_def' },
            }), { status: 200 });
          }
          return new Response(JSON.stringify({ sha: 'old_sha_xyz' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      const r = await apexToolsDispatch.execute('create_or_update_file', {
        path: 'test/existing.ts',
        content: 'export const updated = 2;',
      }, 'admin');
      expect(r.ok).toBe(true);
      const outer = r.result as { ok?: boolean; result?: { action?: string } };
      expect(outer.result?.action).toBe('updated');
    });
  });

  describe('delete_repo_file', () => {
    it('refuse sans confirm:true', async () => {
      const { vault } = await import('../../services/vault/vault.js');
      await vault.setKey('ax_github_token', 'ghp_fake_token');
      const r = await apexToolsDispatch.execute('delete_repo_file', {
        path: 'test/file.ts',
      }, 'admin');
      const inner = r.result as { ok?: boolean; error?: string };
      expect(inner.ok).toBe(false);
      expect(inner.error).toMatch(/confirm/i);
    });

    it('supprime avec confirm:true + fetch 200', async () => {
      const { vault } = await import('../../services/vault/vault.js');
      await vault.setKey('ax_github_token', 'ghp_fake_token');
      /* Mock keyé par URL+méthode (déterministe). DELETE GitHub → 200. */
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('api.github.com')) {
          if (method === 'DELETE') return new Response('{}', { status: 200 });
          return new Response(JSON.stringify({ sha: 'sha_to_delete' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      const r = await apexToolsDispatch.execute('delete_repo_file', {
        path: 'test/old.ts',
        confirm: true,
      }, 'admin');
      expect(r.ok).toBe(true);
      const outer = r.result as { ok?: boolean; result?: { action?: string } };
      expect(outer.result?.action).toBe('deleted');
    });
  });

  describe('via execute_task_on_service direct (fallback)', () => {
    it('execute_task_on_service { service:github, task:create_or_update_file } fonctionne', async () => {
      const { vault } = await import('../../services/vault/vault.js');
      await vault.setKey('ax_github_token', 'ghp_fake_token');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          commit: { sha: 'task_sha', html_url: 'https://github.com/x/y/commit/task_sha' },
        }), { status: 201 }));

      const r = await apexToolsDispatch.execute('execute_task_on_service', {
        service: 'github',
        task: 'create_or_update_file',
        params: { path: 'test/via-task.ts', content: 'export const x = 1;' },
      }, 'admin');
      expect(r.ok).toBe(true);
    });
  });
});
