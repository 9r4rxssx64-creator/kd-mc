/**
 * Tests apex-tools-dispatch.ts cases knowledge base (RAG GitHub API).
 *
 * Couvre les 5 dispatch cases :
 * - search_repo_code, read_repo_file, list_repo_files,
 *   get_recent_commits, get_repo_readme
 *
 * Mock fetch global + vault.readKey.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { store } from '../../core/store.js';
import { apexKnowledgeBase } from '../../services/admin/apex-knowledge-base.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';
import { vault } from '../../services/vault/vault.js';

describe('apex-tools-dispatch — knowledge base cases', () => {
  beforeEach(() => {
    localStorage.clear();
    apexKnowledgeBase.clearCache();
    vi.restoreAllMocks();
    vi.spyOn(vault, 'readKey').mockResolvedValue('ghp_fake_for_tests');
    /* v13.4.246 : execute('admin') re-vérifie auth.isAdminSync() (fail-closed).
       Session admin réelle requise sinon tools rétrogradés → "Tier insuffisant". */
    store.set('user', { id: 'kdmc_admin', name: 'K' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    store.set('user', null);
  });

  describe('search_repo_code', () => {
    it('exécute avec query → results', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        items: [{ path: 'a.ts', url: '', html_url: '', score: 1, repository: { full_name: 'a/b' } }],
      }), { status: 200 }));
      const r = await apexToolsDispatch.execute('search_repo_code', { query: 'foo' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { total: number; results: unknown[] };
      expect(result.total).toBe(1);
    });

    it('throw si query manquante', async () => {
      const r = await apexToolsDispatch.execute('search_repo_code', {}, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('query');
    });

    it('utilise repo custom si fourni', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      await apexToolsDispatch.execute('search_repo_code', { query: 'x', repo: 'kevin/MyProject' }, 'admin');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('repo%3Akevin%2FMyProject');
    });

    it('tier laurence accès OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      const r = await apexToolsDispatch.execute('search_repo_code', { query: 'x' }, 'laurence');
      expect(r.ok).toBe(true);
    });

    it('tier client_free refuse (minTier laurence)', async () => {
      const r = await apexToolsDispatch.execute('search_repo_code', { query: 'x' }, 'client_free');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Tier');
    });
  });

  describe('read_repo_file', () => {
    it('exécute lecture fichier', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        type: 'file',
        content: btoa('hello'),
        size: 5,
        sha: 'abc',
        encoding: 'base64',
      }), { status: 200 }));
      const r = await apexToolsDispatch.execute('read_repo_file', { path: 'README.md' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { found: boolean; content: string };
      expect(result.found).toBe(true);
      expect(result.content).toContain('hello');
    });

    it('found=false si fichier 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
      const r = await apexToolsDispatch.execute('read_repo_file', { path: 'no.ts' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { found: boolean };
      expect(result.found).toBe(false);
    });

    it('throw si path manquant', async () => {
      const r = await apexToolsDispatch.execute('read_repo_file', {}, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('path');
    });

    it('utilise repo custom si fourni', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
      await apexToolsDispatch.execute('read_repo_file', { path: 'a.ts', repo: 'foo/bar' }, 'admin');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('foo/bar');
    });
  });

  describe('list_repo_files', () => {
    it('liste fichiers du root', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { path: 'a.ts', type: 'file', size: 100, sha: 's' },
      ]), { status: 200 }));
      const r = await apexToolsDispatch.execute('list_repo_files', {}, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { total: number };
      expect(result.total).toBe(1);
    });

    it('utilise directory custom', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexToolsDispatch.execute('list_repo_files', { directory: 'apex-ai/v13/core' }, 'admin');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('apex-ai/v13/core');
    });

    it('utilise repo custom', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexToolsDispatch.execute('list_repo_files', { repo: 'foo/bar' }, 'admin');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('foo/bar');
    });
  });

  describe('get_recent_commits', () => {
    it('exécute avec limit default', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { sha: 'a', html_url: '', commit: { message: 'm', author: { name: 'k', date: '2026-05-01T10:00:00Z' } } },
      ]), { status: 200 }));
      const r = await apexToolsDispatch.execute('get_recent_commits', {}, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { total: number };
      expect(result.total).toBe(1);
    });

    it('exécute avec limit custom', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexToolsDispatch.execute('get_recent_commits', { limit: 50 }, 'admin');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('per_page=50');
    });

    it('utilise repo custom', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexToolsDispatch.execute('get_recent_commits', { repo: 'foo/bar' }, 'admin');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('foo/bar');
    });
  });

  describe('detectIntent — branches', () => {
    it('detect "ouvre google.com" → open_url', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: 'ouvre google.com' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string };
      expect(result.intent).toMatch(/open_url|open_browser/);
    });

    it('detect "traduis en anglais" → translate', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: 'traduis en anglais salut' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string };
      expect(result.intent).toBe('translate');
    });

    it('detect "meteo paris" → weather', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: 'meteo paris' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string };
      expect(result.intent).toBe('weather');
    });

    it('detect "cherche sur google" → web_search', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: 'cherche dragon ball' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string };
      expect(result.intent).toBe('web_search');
    });

    it('detect "musique" → studio_music', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: 'lance musique' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string };
      expect(result.intent).toBe('studio_music');
    });

    it('detect "bonjour" → greeting', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: 'bonjour' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string };
      expect(result.intent).toBe('greeting');
    });

    it('detect texte vide → unknown', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: '' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string };
      expect(result.intent).toBe('unknown');
    });

    it('detect texte hors patterns → unknown', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: 'xyzzy plover' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { intent: string; confidence: number };
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('integration scenarios', () => {
    it('search → read pattern : flow complet', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes('/search/code')) {
          return new Response(JSON.stringify({
            items: [{ path: 'a.ts', url: '', html_url: '', score: 1, repository: { full_name: 'a/b' } }],
          }), { status: 200 });
        }
        if (u.includes('/contents/a.ts')) {
          return new Response(JSON.stringify({
            type: 'file', content: btoa('export const x = 1'), size: 19, sha: 'sha', encoding: 'base64',
          }), { status: 200 });
        }
        return new Response('', { status: 404 });
      });
      const search = await apexToolsDispatch.execute('search_repo_code', { query: 'x' }, 'admin');
      expect(search.ok).toBe(true);
      const read = await apexToolsDispatch.execute('read_repo_file', { path: 'a.ts' }, 'admin');
      expect(read.ok).toBe(true);
      const result = read.result as { found: boolean };
      expect(result.found).toBe(true);
    });

    it('audit log enregistre exécution tool', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
      const r = await apexToolsDispatch.execute('search_repo_code', { query: 'x' }, 'admin');
      expect(r.ok).toBe(true);
      /* Audit log (immutable chain) doit avoir au moins 1 entry */
      const raw = localStorage.getItem('ax_audit_log_v13') ?? '[]';
      const chain = JSON.parse(raw) as Array<{ action: string }>;
      const tools = chain.filter((e) => e.action === 'tool.execution');
      expect(tools.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('get_repo_readme', () => {
    it('retourne content décodé', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        content: btoa('# Hello'),
      }), { status: 200 }));
      const r = await apexToolsDispatch.execute('get_repo_readme', {}, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { found: boolean; content: string };
      expect(result.found).toBe(true);
      expect(result.content).toContain('Hello');
    });

    it('found=false si readme inexistant', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
      const r = await apexToolsDispatch.execute('get_repo_readme', {}, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { found: boolean };
      expect(result.found).toBe(false);
    });

    it('utilise repo custom', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
      await apexToolsDispatch.execute('get_repo_readme', { repo: 'foo/bar' }, 'admin');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('foo/bar');
    });
  });
});
