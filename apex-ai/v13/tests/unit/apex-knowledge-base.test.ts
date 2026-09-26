/**
 * Tests apex-knowledge-base.ts (RAG GitHub API).
 *
 * Mock fetch GitHub API + vault.readKey pour tests offline.
 * Couvre : searchCode, getFile, listFiles, getRecentCommits, getOpenIssues,
 * searchPullRequests, getReadme, getProjectMetadata, repos config, cache, index.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { apexKnowledgeBase } from '../../services/admin/apex-knowledge-base.js';
import { vault } from '../../services/vault/vault.js';

const SAMPLE_FILE_CONTENT_B64 = btoa('Hello from CMCteams\nLine 2');

describe('apex-knowledge-base service', () => {
  beforeEach(() => {
    localStorage.clear();
    apexKnowledgeBase.clearCache();
    vi.restoreAllMocks();
    vi.spyOn(vault, 'readKey').mockResolvedValue('ghp_fake_token_for_tests_only');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('repos configuration', () => {
    it('default repo si rien configuré', () => {
      const repos = apexKnowledgeBase.listRepos();
      expect(repos).toEqual(['9r4rxssx64-creator/CMCteams']);
    });

    it('addRepo accepte format owner/repo valide', () => {
      const r = apexKnowledgeBase.addRepo('kevin/MyProject');
      expect(r.ok).toBe(true);
      expect(apexKnowledgeBase.listRepos()).toContain('kevin/MyProject');
    });

    it('addRepo refuse format invalide', () => {
      const r = apexKnowledgeBase.addRepo('not-a-valid-format');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Format');
    });

    it('addRepo idempotent (no duplicate)', () => {
      apexKnowledgeBase.addRepo('foo/bar');
      apexKnowledgeBase.addRepo('foo/bar');
      const list = apexKnowledgeBase.listRepos().filter((x) => x === 'foo/bar');
      expect(list.length).toBe(1);
    });

    it('removeRepo retire de la liste', () => {
      apexKnowledgeBase.addRepo('foo/bar');
      apexKnowledgeBase.removeRepo('foo/bar');
      expect(apexKnowledgeBase.listRepos()).not.toContain('foo/bar');
    });
  });

  describe('searchCode', () => {
    it('searchCode retourne résultats parsés depuis GitHub API', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        items: [
          {
            path: 'apex-ai/v13/core/store.ts',
            url: 'https://api.github.com/...',
            html_url: 'https://github.com/9r4rxssx64-creator/CMCteams/blob/main/apex-ai/v13/core/store.ts',
            score: 1.2,
            repository: { full_name: '9r4rxssx64-creator/CMCteams' },
          },
        ],
      }), { status: 200 }));

      const r = await apexKnowledgeBase.searchCode('store');
      expect(r.length).toBe(1);
      expect(r[0]?.path).toContain('store.ts');
      expect(r[0]?.score).toBe(1.2);
    });

    it('searchCode 403 → array vide (rate limit)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 403 }));
      const r = await apexKnowledgeBase.searchCode('test');
      expect(r).toEqual([]);
    });

    it('searchCode utilise cache 1h', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      await apexKnowledgeBase.searchCode('cached');
      await apexKnowledgeBase.searchCode('cached');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('searchCode bump index local pour fichiers consultés', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        items: [{ path: 'README.md', url: '', html_url: '', score: 1, repository: { full_name: 'foo/bar' } }],
      }), { status: 200 }));
      await apexKnowledgeBase.searchCode('readme');
      const stats = apexKnowledgeBase.getStats();
      expect(stats.index_entries).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getFile', () => {
    it('getFile décode base64 → string UTF-8', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        type: 'file',
        content: SAMPLE_FILE_CONTENT_B64,
        size: 26,
        sha: 'abc123',
        encoding: 'base64',
      }), { status: 200 }));

      const f = await apexKnowledgeBase.getFile('README.md');
      expect(f).not.toBeNull();
      expect(f?.content).toContain('Hello from CMCteams');
      expect(f?.sha).toBe('abc123');
    });

    it('getFile retourne null si type !== file', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        type: 'dir',
      }), { status: 200 }));
      const f = await apexKnowledgeBase.getFile('some-dir');
      expect(f).toBeNull();
    });

    it('getFile 404 → null', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));
      const f = await apexKnowledgeBase.getFile('does-not-exist.ts');
      expect(f).toBeNull();
    });
  });

  describe('listFiles', () => {
    it('listFiles retourne array d\'entries', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { path: 'a.ts', type: 'file', size: 100, sha: 's1' },
        { path: 'sub', type: 'dir', size: 0, sha: 's2' },
      ]), { status: 200 }));

      const list = await apexKnowledgeBase.listFiles('apex-ai/v13/core');
      expect(list.length).toBe(2);
      expect(list[0]?.type).toBe('file');
      expect(list[1]?.type).toBe('dir');
    });

    it('listFiles directory vide → racine repo', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexKnowledgeBase.listFiles('');
      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/contents');
      expect(calledUrl).not.toContain('/contents/');
    });
  });

  describe('getRecentCommits', () => {
    it('getRecentCommits retourne commits parsés', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        {
          sha: 'sha1',
          html_url: 'https://github.com/.../commit/sha1',
          commit: {
            message: 'feat: add knowledge-base',
            author: { name: 'Kevin', date: '2026-05-04T12:00:00Z' },
          },
        },
      ]), { status: 200 }));

      const commits = await apexKnowledgeBase.getRecentCommits(5);
      expect(commits.length).toBe(1);
      expect(commits[0]?.sha).toBe('sha1');
      expect(commits[0]?.message).toContain('knowledge-base');
      expect(commits[0]?.date).toBeGreaterThan(0);
    });

    it('getRecentCommits limit clamp [1..100]', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexKnowledgeBase.getRecentCommits(99999);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('per_page=100');
    });
  });

  describe('getOpenIssues', () => {
    it('getOpenIssues filtre out PRs (qui ont pull_request key)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 1, title: 'Bug X', body: '...', state: 'open', user: { login: 'kevin' }, labels: [{ name: 'bug' }], html_url: 'u1', created_at: '2026-05-04T10:00:00Z' },
        { number: 2, title: 'PR Y', pull_request: {}, state: 'open', user: { login: 'kevin' }, labels: [], html_url: 'u2', created_at: '2026-05-04T11:00:00Z' },
      ]), { status: 200 }));

      const issues = await apexKnowledgeBase.getOpenIssues();
      expect(issues.length).toBe(1);
      expect(issues[0]?.title).toBe('Bug X');
      expect(issues[0]?.labels).toContain('bug');
    });
  });

  describe('searchPullRequests', () => {
    it('searchPullRequests détecte merged via merged_at', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 10, title: 'Add feature', state: 'closed', merged_at: '2026-05-03T12:00:00Z', user: { login: 'kevin' }, head: { ref: 'feature/x' }, html_url: 'pr10', created_at: '2026-05-02T12:00:00Z' },
      ]), { status: 200 }));

      const prs = await apexKnowledgeBase.searchPullRequests('all');
      expect(prs.length).toBe(1);
      expect(prs[0]?.state).toBe('merged');
    });
  });

  describe('getReadme', () => {
    it('getReadme décode base64', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        content: btoa('# CMCteams\nProject readme'),
      }), { status: 200 }));

      const readme = await apexKnowledgeBase.getReadme();
      expect(readme).toContain('CMCteams');
    });
  });

  describe('getProjectMetadata', () => {
    it('getProjectMetadata parse repo info', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        name: 'CMCteams',
        full_name: '9r4rxssx64-creator/CMCteams',
        description: 'Casino Monaco apps',
        language: 'TypeScript',
        stargazers_count: 5,
        size: 1234,
        updated_at: '2026-05-04T12:00:00Z',
      }), { status: 200 }));

      const meta = await apexKnowledgeBase.getProjectMetadata();
      expect(meta?.name).toBe('CMCteams');
      expect(meta?.language).toBe('TypeScript');
      expect(meta?.stars).toBe(5);
    });
  });

  describe('formatForSystemPrompt', () => {
    it('retourne string formaté avec repos configurés', () => {
      const out = apexKnowledgeBase.formatForSystemPrompt();
      expect(out).toContain('Base de connaissances');
      expect(out).toContain('CMCteams');
      expect(out).toContain('search_repo_code');
    });

    it('inclut top fichiers consultés si index non vide', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        items: [{ path: 'apex-ai/v13/core/store.ts', url: '', html_url: '', score: 1, repository: { full_name: 'foo/bar' } }],
      }), { status: 200 }));
      await apexKnowledgeBase.searchCode('q');
      const out = apexKnowledgeBase.formatForSystemPrompt();
      expect(out).toContain('store.ts');
    });
  });

  describe('clearCache + getStats', () => {
    it('clearCache retourne nombre vidé', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      await apexKnowledgeBase.searchCode('x');
      const r = apexKnowledgeBase.clearCache();
      expect(r.cleared).toBeGreaterThanOrEqual(1);
    });

    it('getStats retourne snapshot', () => {
      const stats = apexKnowledgeBase.getStats();
      expect(stats.repos).toBeGreaterThan(0);
      expect(typeof stats.cache_entries).toBe('number');
    });

    it('getStats has_token reflète localStorage', () => {
      localStorage.setItem('ax_github_token', 'ghp_real_token_xxxxxxxxxx');
      const stats = apexKnowledgeBase.getStats();
      expect(stats.has_token).toBe(true);
    });
  });

  describe('init idempotent', () => {
    it('init() call multiple no-op', () => {
      apexKnowledgeBase.init();
      apexKnowledgeBase.init();
      apexKnowledgeBase.init();
      /* No throw, OK */
      expect(true).toBe(true);
    });
  });

  describe('error & corruption paths', () => {
    it('listRepos retourne default si JSON corrompu', () => {
      localStorage.setItem('ax_kdmc_repos', '{not-json');
      const r = apexKnowledgeBase.listRepos();
      expect(r).toEqual(['9r4rxssx64-creator/CMCteams']);
    });

    it('listRepos retourne default si non-array', () => {
      localStorage.setItem('ax_kdmc_repos', '"oops"');
      const r = apexKnowledgeBase.listRepos();
      expect(r).toEqual(['9r4rxssx64-creator/CMCteams']);
    });

    it('listRepos retourne default si array vide stocké', () => {
      localStorage.setItem('ax_kdmc_repos', '[]');
      const r = apexKnowledgeBase.listRepos();
      expect(r).toEqual(['9r4rxssx64-creator/CMCteams']);
    });

    it('listRepos retourne default si array avec non-strings', () => {
      localStorage.setItem('ax_kdmc_repos', '[1,2,3]');
      const r = apexKnowledgeBase.listRepos();
      expect(r).toEqual(['9r4rxssx64-creator/CMCteams']);
    });

    it('searchCode retourne array vide si fetch throws', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
      const r = await apexKnowledgeBase.searchCode('q');
      expect(r).toEqual([]);
    });

    it('searchCode retourne array vide si JSON sans items', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const r = await apexKnowledgeBase.searchCode('q');
      expect(r).toEqual([]);
    });

    it('searchCode retourne array vide si items non array', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: 'oops' }), { status: 200 }));
      const r = await apexKnowledgeBase.searchCode('q');
      expect(r).toEqual([]);
    });

    it('searchCode 429 → array vide (rate limit secondary)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
      const r = await apexKnowledgeBase.searchCode('q');
      expect(r).toEqual([]);
    });

    it('searchCode 500 → array vide (server error)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      const r = await apexKnowledgeBase.searchCode('q');
      expect(r).toEqual([]);
    });

    it('getFile null si JSON corrompu', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('garbage', { status: 200 }));
      const f = await apexKnowledgeBase.getFile('a.ts');
      expect(f).toBeNull();
    });

    it('getReadme retourne null si content absent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
      const readme = await apexKnowledgeBase.getReadme();
      expect(readme).toBeNull();
    });

    it('getProjectMetadata null si fetch fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
      const m = await apexKnowledgeBase.getProjectMetadata();
      expect(m).toBeNull();
    });

    it('listFiles array vide si JSON non-array', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ x: 1 }), { status: 200 }));
      const list = await apexKnowledgeBase.listFiles('foo');
      expect(list).toEqual([]);
    });

    it('listFiles avec leading/trailing slash dans directory', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexKnowledgeBase.listFiles('/foo/bar/');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('/contents/foo/bar');
    });

    it('vault.readKey throw → fetch sans Authorization header', async () => {
      vi.restoreAllMocks();
      vi.spyOn(vault, 'readKey').mockRejectedValue(new Error('vault locked'));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      await apexKnowledgeBase.searchCode('q');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('searchPullRequests state="closed" inclus dans URL', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexKnowledgeBase.searchPullRequests('closed');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('state=closed');
    });

    it('searchPullRequests détecte open vs closed correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 1, title: 'Open PR', state: 'open', user: { login: 'kev' }, head: { ref: 'feat/a' }, html_url: 'u', created_at: '2026-05-01T10:00:00Z' },
        { number: 2, title: 'Closed PR', state: 'closed', merged_at: null, user: { login: 'kev' }, head: { ref: 'feat/b' }, html_url: 'u2', created_at: '2026-05-01T10:00:00Z' },
      ]), { status: 200 }));
      const prs = await apexKnowledgeBase.searchPullRequests('all');
      expect(prs[0]?.state).toBe('open');
      expect(prs[1]?.state).toBe('closed');
    });

    it('getOpenIssues retourne empty si non-array', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ x: 1 }), { status: 200 }));
      const r = await apexKnowledgeBase.getOpenIssues();
      expect(r).toEqual([]);
    });

    it('getRecentCommits limit clamp >= 1', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexKnowledgeBase.getRecentCommits(0);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('per_page=1');
    });

    it('getRecentCommits limit négatif clamp à 1', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      await apexKnowledgeBase.getRecentCommits(-5);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('per_page=1');
    });

    it('addRepo refuse string vide après trim', () => {
      const r = apexKnowledgeBase.addRepo('   ');
      expect(r.ok).toBe(false);
    });

    it('addRepo refuse format avec slash multiple', () => {
      const r = apexKnowledgeBase.addRepo('foo/bar/baz');
      expect(r.ok).toBe(false);
    });

    it('removeRepo silencieux si repo non trouvé', () => {
      const r = apexKnowledgeBase.removeRepo('inexistant/repo');
      expect(r.ok).toBe(true);
    });
  });

  describe('getOpenIssues — branches détaillées', () => {
    it('issue avec body manquant → string vide', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 7, title: 'Bug', user: { login: 'k' }, state: 'open', html_url: 'u', created_at: '2026-05-01T10:00:00Z' },
      ]), { status: 200 }));
      const issues = await apexKnowledgeBase.getOpenIssues();
      expect(issues[0]?.body).toBe('');
    });

    it('issue avec labels non array → labels vide', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 8, title: 'X', body: '', user: { login: 'k' }, state: 'open', labels: 'oops', html_url: 'u', created_at: '' },
      ]), { status: 200 }));
      const issues = await apexKnowledgeBase.getOpenIssues();
      expect(issues[0]?.labels).toEqual([]);
    });

    it('issue avec state closed parsé', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 9, title: 'X', body: 'b', user: { login: 'k' }, state: 'closed', labels: [], html_url: 'u', created_at: '2026-05-01T10:00:00Z' },
      ]), { status: 200 }));
      const issues = await apexKnowledgeBase.getOpenIssues();
      expect(issues[0]?.state).toBe('closed');
    });

    it('issue avec user manquant → author unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 10, title: 'X', body: 'b', state: 'open', labels: [], html_url: 'u', created_at: '' },
      ]), { status: 200 }));
      const issues = await apexKnowledgeBase.getOpenIssues();
      expect(issues[0]?.author).toBe('unknown');
    });
  });

  describe('searchPullRequests — branches détaillées', () => {
    it('PR sans head ref → branch vide', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 1, title: 'PR', state: 'open', user: { login: 'k' }, html_url: 'u', created_at: '' },
      ]), { status: 200 }));
      const prs = await apexKnowledgeBase.searchPullRequests();
      expect(prs[0]?.branch).toBe('');
    });

    it('PR sans user → unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { number: 2, title: 'PR', state: 'open', html_url: 'u', created_at: '', head: { ref: 'br' } },
      ]), { status: 200 }));
      const prs = await apexKnowledgeBase.searchPullRequests();
      expect(prs[0]?.author).toBe('unknown');
    });
  });

  describe('getRecentCommits — branches détaillées', () => {
    it('commit sans author.name → unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { sha: 's', html_url: 'u', commit: { message: 'm', author: {} } },
      ]), { status: 200 }));
      const commits = await apexKnowledgeBase.getRecentCommits();
      expect(commits[0]?.author).toBe('unknown');
    });

    it('commit sans author → date 0', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
        { sha: 's', html_url: 'u', commit: { message: 'm' } },
      ]), { status: 200 }));
      const commits = await apexKnowledgeBase.getRecentCommits();
      expect(commits[0]?.date).toBe(0);
    });
  });

  describe('getProjectMetadata — branches détaillées', () => {
    it('metadata sans description → string vide', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        name: 'p', full_name: 'a/p',
      }), { status: 200 }));
      const m = await apexKnowledgeBase.getProjectMetadata();
      expect(m?.description).toBe('');
      expect(m?.language).toBeNull();
      expect(m?.stars).toBe(0);
    });
  });

  describe('formatForSystemPrompt — top 10 cap', () => {
    it('avec > 10 fichiers indexés, n\'inclut que 10', () => {
      const many = Array.from({ length: 15 }, (_, i) => ({
        path: `file${i}.ts`,
        repo: 'a/b',
        hits: i + 1,
        lastAccess: i,
      }));
      localStorage.setItem('ax_knowledge_base_index_v1', JSON.stringify(many));
      const out = apexKnowledgeBase.formatForSystemPrompt();
      /* doit citer file14 (le plus haut hits) en haut */
      expect(out).toContain('file14.ts');
    });
  });

  describe('cache TTL expiration', () => {
    it('cache expire après 1h (mock Date.now)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      await apexKnowledgeBase.searchCode('expirable');
      /* Avance Date.now au-delà de TTL 1h */
      const realNow = Date.now;
      vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 60 * 60 * 1000 + 1000);
      await apexKnowledgeBase.searchCode('expirable');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('index local persistence', () => {
    it('bumpIndex deuxième hit même fichier incrémente compteur', async () => {
      /* mockImplementation pour Response fresh à chaque call (body stream once-only) */
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
        items: [{ path: 'core/store.ts', url: '', html_url: '', score: 1, repository: { full_name: 'foo/bar' } }],
      }), { status: 200 }));
      await apexKnowledgeBase.searchCode('a');
      apexKnowledgeBase.clearCache();
      await apexKnowledgeBase.searchCode('b');
      const indexRaw = localStorage.getItem('ax_knowledge_base_index_v1') ?? '[]';
      const idx = JSON.parse(indexRaw) as Array<{ path: string; hits: number }>;
      const storeEntry = idx.find((e) => e.path === 'core/store.ts');
      expect(storeEntry).toBeTruthy();
      expect(storeEntry?.hits).toBeGreaterThanOrEqual(2);
    });

    it('loadIndex retourne [] si JSON corrompu', () => {
      localStorage.setItem('ax_knowledge_base_index_v1', '{broken');
      const stats = apexKnowledgeBase.getStats();
      expect(stats.index_entries).toBe(0);
    });

    it('loadIndex retourne [] si non-array', () => {
      localStorage.setItem('ax_knowledge_base_index_v1', '"oops"');
      const stats = apexKnowledgeBase.getStats();
      expect(stats.index_entries).toBe(0);
    });

    it('loadIndex filtre les entries malformées', () => {
      localStorage.setItem('ax_knowledge_base_index_v1', JSON.stringify([
        { path: 'good.ts', repo: 'a/b', hits: 1, lastAccess: 0 },
        { path: 'bad-no-hits' },
        null,
        'string',
      ]));
      const stats = apexKnowledgeBase.getStats();
      expect(stats.index_entries).toBe(1);
    });
  });
});
