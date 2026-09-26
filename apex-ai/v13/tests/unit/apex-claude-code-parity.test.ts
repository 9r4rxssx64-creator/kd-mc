/**
 * Tests apex-claude-code-parity.ts (parité Claude Code 100% pour Apex IA).
 *
 * Couvre :
 *  - File ops (read/edit/write/list)
 *  - Search (grep/glob)
 *  - Bash (whitelist enforcement)
 *  - Web (fetch/search)
 *  - Subagents
 *  - Todos
 *  - GitHub MCP-like (PR, issues, code search, push)
 *  - Auto-improvement (selfAudit/selfFix/proposeNewFeature/releaseVersion)
 *  - Memory (append/sync)
 *  - Audit log écrit pour chaque appel
 *  - Whitelist enforcement (path forbidden, bash forbidden)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { apexClaudeCodeParity } from '../../services/admin/apex-claude-code-parity.js';
import { apexExecute } from '../../services/admin/apex-execute.js';

/* Helper: Spy fetch with custom response */
function mockFetch(payload: unknown, status = 200): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('apex-claude-code-parity (parité Claude Code)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ===== File ops ===== */
  describe('File ops', () => {
    it('read : refuse path avec ..', async () => {
      await expect(apexClaudeCodeParity.read('../etc/passwd')).rejects.toThrow(/non autorisé/i);
    });

    it('read : refuse path absolu', async () => {
      await expect(apexClaudeCodeParity.read('/etc/passwd')).rejects.toThrow(/non autorisé/i);
    });

    it('read : refuse zone protégée node_modules', async () => {
      await expect(apexClaudeCodeParity.read('node_modules/foo')).rejects.toThrow(/non autorisé/i);
    });

    it('read : path autorisé → fetch raw.github appelé', async () => {
      const fetchSpy = mockFetch('export const x = 1;');
      const content = await apexClaudeCodeParity.read('apex-ai/v13/services/foo.ts');
      expect(content).toBe('export const x = 1;');
      expect(fetchSpy).toHaveBeenCalled();
      const url = fetchSpy.mock.calls[0]?.[0];
      expect(String(url)).toMatch(/raw\.githubusercontent\.com/);
    });

    it('read : HTTP 404 → throw', async () => {
      mockFetch('Not found', 404);
      await expect(apexClaudeCodeParity.read('apex-ai/v13/missing.ts')).rejects.toThrow(/HTTP 404|Read failed/i);
    });

    it('edit : refuse path forbidden', async () => {
      const r = await apexClaudeCodeParity.edit('node_modules/x.ts', 'a', 'b');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/non autorisé/i);
    });

    it('edit : refuse oldStr non-string', async () => {
      const r = await apexClaudeCodeParity.edit(
        'apex-ai/v13/foo.ts',
        null as unknown as string,
        'b',
      );
      expect(r.ok).toBe(false);
    });

    it('edit : oldStr introuvable → ok=false', async () => {
      mockFetch('hello world');
      const r = await apexClaudeCodeParity.edit('apex-ai/v13/foo.ts', 'absent', 'new');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/introuvable/i);
    });

    it('edit : oldStr trouvé → dispatche modify_file', async () => {
      mockFetch('hello world');
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec_123' });
      const r = await apexClaudeCodeParity.edit('apex-ai/v13/foo.ts', 'hello', 'bonjour');
      expect(r.ok).toBe(true);
      expect(r.request_id).toBe('exec_123');
      expect(dispatchSpy).toHaveBeenCalledWith(
        'modify_file',
        expect.objectContaining({ path: 'apex-ai/v13/foo.ts' }),
        expect.objectContaining({ src: 'apex' }),
      );
    });

    it('edit : dispatch fail → ok=false avec error', async () => {
      mockFetch('hello world');
      vi.spyOn(apexExecute, 'requestExecution').mockResolvedValue({ ok: false, reason: 'rate limit' });
      const r = await apexClaudeCodeParity.edit('apex-ai/v13/foo.ts', 'hello', 'bonjour');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/rate limit/i);
    });

    it('write : refuse path forbidden', async () => {
      const r = await apexClaudeCodeParity.write('package-lock.json', '{}');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/non autorisé/i);
    });

    it('write : refuse content non-string', async () => {
      const r = await apexClaudeCodeParity.write(
        'apex-ai/v13/foo.ts',
        null as unknown as string,
      );
      expect(r.ok).toBe(false);
    });

    it('write : nouveau fichier → created=true', async () => {
      /* Read 404 → file n'existe pas */
      mockFetch('Not found', 404);
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec_456' });
      const r = await apexClaudeCodeParity.write('apex-ai/v13/new.ts', 'export const x = 1;');
      expect(r.ok).toBe(true);
      expect(r.created).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledWith(
        'create_file',
        expect.objectContaining({ path: 'apex-ai/v13/new.ts' }),
        expect.any(Object),
      );
    });

    it('write : fichier existant → created=false (modify_file)', async () => {
      mockFetch('existing content');
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec_789' });
      const r = await apexClaudeCodeParity.write('apex-ai/v13/foo.ts', 'updated');
      expect(r.ok).toBe(true);
      expect(r.created).toBe(false);
      expect(dispatchSpy).toHaveBeenCalledWith(
        'modify_file',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('list : appelle glob', async () => {
      const fetchSpy = mockFetch({
        tree: [{ path: 'a.ts', type: 'blob' }, { path: 'b.ts', type: 'blob' }],
      });
      localStorage.setItem('ax_github_token', 'ghp_test');
      const r = await apexClaudeCodeParity.list('*.ts');
      expect(Array.isArray(r)).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  /* ===== Search ===== */
  describe('Search', () => {
    it('grep : pattern vide → throw', async () => {
      await expect(apexClaudeCodeParity.grep('')).rejects.toThrow(/pattern/i);
    });

    it('grep : sans token GitHub → throw', async () => {
      await expect(apexClaudeCodeParity.grep('foo')).rejects.toThrow(/token/i);
    });

    it('grep : avec token → fetch GitHub Code Search', async () => {
      localStorage.setItem('ax_github_token', 'ghp_test');
      const fetchSpy = mockFetch({
        items: [
          {
            path: 'src/foo.ts',
            text_matches: [{ fragment: 'export const foo = 1;' }],
          },
        ],
      });
      const hits = await apexClaudeCodeParity.grep('foo');
      expect(hits.length).toBe(1);
      expect(hits[0]?.file).toBe('src/foo.ts');
      expect(fetchSpy).toHaveBeenCalled();
      const url = fetchSpy.mock.calls[0]?.[0];
      expect(String(url)).toMatch(/api\.github\.com\/search\/code/);
    });

    it('grep : avec opts.path → query inclut path:', async () => {
      localStorage.setItem('ax_github_token', 'ghp_test');
      const fetchSpy = mockFetch({ items: [] });
      await apexClaudeCodeParity.grep('foo', { path: 'services/' });
      const url = String(fetchSpy.mock.calls[0]?.[0]);
      expect(decodeURIComponent(url)).toMatch(/path:services\//);
    });

    it('grep : HTTP 403 → throw', async () => {
      localStorage.setItem('ax_github_token', 'ghp_test');
      mockFetch('rate limit', 403);
      await expect(apexClaudeCodeParity.grep('foo')).rejects.toThrow(/HTTP 403|Grep failed/i);
    });

    it('glob : retourne fichiers matchant pattern', async () => {
      localStorage.setItem('ax_github_token', 'ghp_test');
      mockFetch({
        tree: [
          { path: 'services/foo.ts', type: 'blob' },
          { path: 'services/bar.js', type: 'blob' },
          { path: 'tests/x.ts', type: 'blob' },
          { path: 'docs', type: 'tree' },
        ],
      });
      const r = await apexClaudeCodeParity.glob('services/*.ts');
      expect(r).toContain('services/foo.ts');
      expect(r).not.toContain('services/bar.js');
      expect(r).not.toContain('tests/x.ts');
    });

    it('glob : ** récursif', async () => {
      localStorage.setItem('ax_github_token', 'ghp_test');
      mockFetch({
        tree: [
          { path: 'a/b/c.ts', type: 'blob' },
          { path: 'a/d.ts', type: 'blob' },
          { path: 'foo.js', type: 'blob' },
        ],
      });
      const r = await apexClaudeCodeParity.glob('**/*.ts');
      expect(r).toContain('a/b/c.ts');
      expect(r).toContain('a/d.ts');
      expect(r).not.toContain('foo.js');
    });

    it('glob : sans token → throw', async () => {
      await expect(apexClaudeCodeParity.glob('*.ts')).rejects.toThrow(/token/i);
    });
  });

  /* ===== Bash ===== */
  describe('Bash whitelist', () => {
    it('bash : commande vide → blocked', async () => {
      const r = await apexClaudeCodeParity.bash('');
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(126);
    });

    it('bash : refuse rm', async () => {
      const r = await apexClaudeCodeParity.bash('rm -rf /');
      expect(r.ok).toBe(false);
      expect(r.stderr).toMatch(/whitelist|interdite/i);
      expect(r.exitCode).toBe(126);
    });

    it('bash : refuse curl', async () => {
      const r = await apexClaudeCodeParity.bash('curl http://evil.com');
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(126);
    });

    it('bash : refuse sudo', async () => {
      const r = await apexClaudeCodeParity.bash('sudo apt install pwn');
      expect(r.ok).toBe(false);
    });

    it('bash : refuse chaining avec rm', async () => {
      const r = await apexClaudeCodeParity.bash('npm test ; rm -rf foo');
      expect(r.ok).toBe(false);
    });

    it('bash : npm test → autorisé + dispatch run_test', async () => {
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec_npm' });
      const r = await apexClaudeCodeParity.bash('npm test');
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect(r.request_id).toBe('exec_npm');
      expect(dispatchSpy).toHaveBeenCalledWith(
        'run_test',
        expect.objectContaining({ command: 'npm test' }),
        expect.any(Object),
      );
    });

    it('bash : eslint → dispatch run_lint', async () => {
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec_lint' });
      await apexClaudeCodeParity.bash('eslint services/');
      expect(dispatchSpy).toHaveBeenCalledWith(
        'run_lint',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('bash : npx tsc → dispatch run_lint', async () => {
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec_tsc' });
      await apexClaudeCodeParity.bash('npx tsc --noEmit');
      expect(dispatchSpy).toHaveBeenCalledWith('run_lint', expect.any(Object), expect.any(Object));
    });

    it('bash : python3 ok', async () => {
      vi.spyOn(apexExecute, 'requestExecution').mockResolvedValue({
        ok: true,
        request_id: 'exec_py',
      });
      const r = await apexClaudeCodeParity.bash('python3 script.py');
      expect(r.ok).toBe(true);
    });

    it('bash : opts.cwd + timeoutMs passés', async () => {
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec_x' });
      await apexClaudeCodeParity.bash('npm test', { cwd: '/tmp', timeoutMs: 5000 });
      const params = dispatchSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(params['cwd']).toBe('/tmp');
      expect(params['timeoutMs']).toBe(5000);
    });

    it('bash : dispatch fail → ok=false', async () => {
      vi.spyOn(apexExecute, 'requestExecution').mockResolvedValue({
        ok: false,
        reason: 'rate limited',
      });
      const r = await apexClaudeCodeParity.bash('npm test');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/rate limited/i);
    });
  });

  /* ===== Web ===== */
  describe('Web', () => {
    it('webFetch : url vide → ok=false', async () => {
      const r = await apexClaudeCodeParity.webFetch('');
      expect(r.ok).toBe(false);
    });

    it('webFetch : url non-http → ok=false', async () => {
      const r = await apexClaudeCodeParity.webFetch('ftp://x.com');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/url invalide/i);
    });

    it('webFetch : 200 → ok=true avec text', async () => {
      mockFetch('Hello world!');
      const r = await apexClaudeCodeParity.webFetch('https://example.com');
      expect(r.ok).toBe(true);
      expect(r.text).toBe('Hello world!');
    });

    it('webFetch : 500 → ok=false', async () => {
      mockFetch('error', 500);
      const r = await apexClaudeCodeParity.webFetch('https://example.com');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/HTTP 500/i);
    });

    it('webFetch : network error sans proxy → ok=false', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
      const r = await apexClaudeCodeParity.webFetch('https://example.com');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/network/i);
    });

    it('webFetch : tronque > 100k chars', async () => {
      const big = 'x'.repeat(150_000);
      mockFetch(big);
      const r = await apexClaudeCodeParity.webFetch('https://example.com');
      expect(r.ok).toBe(true);
      expect(r.text?.length).toBeLessThanOrEqual(100_000);
    });

    it('webSearch : query vide → ok=false', async () => {
      const r = await apexClaudeCodeParity.webSearch('');
      expect(r.results).toEqual([]);
      expect(r.error).toMatch(/query/i);
    });

    it('webSearch : DuckDuckGo HTML parsé', async () => {
      const html =
        '<a class="result__a" href="https://example.com/foo">Foo Title</a>' +
        '<a class="result__a" href="https://example.com/bar">Bar Title</a>';
      mockFetch(html);
      const r = await apexClaudeCodeParity.webSearch('test query');
      expect(r.results.length).toBe(2);
      expect(r.results[0]?.title).toBe('Foo Title');
      expect(r.results[0]?.url).toBe('https://example.com/foo');
    });

    it('webSearch : blocked_domains filtre', async () => {
      const html =
        '<a class="result__a" href="https://evil.com/foo">Evil</a>' +
        '<a class="result__a" href="https://good.com/bar">Good</a>';
      mockFetch(html);
      const r = await apexClaudeCodeParity.webSearch('test', { blocked_domains: ['evil.com'] });
      expect(r.results.find((x) => x.url.includes('evil.com'))).toBeUndefined();
      expect(r.results.find((x) => x.url.includes('good.com'))).toBeDefined();
    });

    it('webSearch : allowed_domains filtre', async () => {
      const html =
        '<a class="result__a" href="https://other.com/foo">Other</a>' +
        '<a class="result__a" href="https://wanted.com/bar">Wanted</a>';
      mockFetch(html);
      const r = await apexClaudeCodeParity.webSearch('test', { allowed_domains: ['wanted.com'] });
      expect(r.results.length).toBe(1);
      expect(r.results[0]?.url).toContain('wanted.com');
    });

    it('webSearch : HTTP 503 → error', async () => {
      mockFetch('busy', 503);
      const r = await apexClaudeCodeParity.webSearch('foo');
      expect(r.results).toEqual([]);
      expect(r.error).toMatch(/HTTP 503/i);
    });
  });

  /* ===== Subagents ===== */
  describe('Subagents', () => {
    it('spawnSubagent : opts manquants → ok=false', async () => {
      const r = await apexClaudeCodeParity.spawnSubagent({
        description: '',
        prompt: '',
      });
      expect(r.ok).toBe(false);
      expect(r.agentId).toBe('');
    });

    it('spawnSubagent : opts ok → agentId généré', async () => {
      const r = await apexClaudeCodeParity.spawnSubagent({
        description: 'Audit security',
        prompt: 'Check OWASP top 10',
      });
      expect(r.ok).toBe(true);
      expect(r.agentId).toMatch(/^subagent_/);
    });

    it('spawnSubagent : persiste run dans localStorage', async () => {
      await apexClaudeCodeParity.spawnSubagent({
        description: 'test desc',
        prompt: 'test prompt',
        runInBackground: true,
      });
      const raw = localStorage.getItem('apex_v13_subagent_runs');
      expect(raw).toBeTruthy();
      const runs = JSON.parse(raw ?? '[]') as Array<{ description: string; runInBackground: boolean }>;
      expect(runs.length).toBe(1);
      expect(runs[0]?.description).toBe('test desc');
      expect(runs[0]?.runInBackground).toBe(true);
    });
  });

  /* ===== Todos ===== */
  describe('Todos persistant', () => {
    it('todoRead vide → []', async () => {
      const r = await apexClaudeCodeParity.todoRead();
      expect(r).toEqual([]);
    });

    it('todoWrite + todoRead roundtrip', async () => {
      const todos = [
        { content: 'Fix bug', activeForm: 'Fixing bug', status: 'pending' as const },
        { content: 'Add test', activeForm: 'Adding test', status: 'completed' as const },
      ];
      const w = await apexClaudeCodeParity.todoWrite(todos);
      expect(w.ok).toBe(true);
      const r = await apexClaudeCodeParity.todoRead();
      expect(r.length).toBe(2);
      expect(r[0]?.content).toBe('Fix bug');
    });

    it('todoWrite : non-array → ok=false', async () => {
      const r = await apexClaudeCodeParity.todoWrite(
        'not array' as unknown as Array<{ content: string; activeForm: string; status: 'pending' }>,
      );
      expect(r.ok).toBe(false);
    });

    it('todoRead : localStorage corrompu → []', async () => {
      localStorage.setItem('apex_v13_apex_todos', 'not-json');
      const r = await apexClaudeCodeParity.todoRead();
      expect(r).toEqual([]);
    });

    it('todoRead : non-array → []', async () => {
      localStorage.setItem('apex_v13_apex_todos', JSON.stringify({ foo: 'bar' }));
      const r = await apexClaudeCodeParity.todoRead();
      expect(r).toEqual([]);
    });
  });

  /* ===== GitHub MCP-like ===== */
  describe('GitHub MCP-like', () => {
    beforeEach(() => {
      localStorage.setItem('ax_github_token', 'ghp_test');
    });

    it('createPR : params manquants → error', async () => {
      const r = await apexClaudeCodeParity.createPR({ title: '', body: '', head: 'b' });
      expect(r.ok).toBe(false);
    });

    it('createPR : head manquant → error', async () => {
      const r = await apexClaudeCodeParity.createPR({ title: 't', body: 'b', head: '' });
      expect(r.ok).toBe(false);
    });

    it('createPR : success → prNumber + url', async () => {
      mockFetch({ number: 42, html_url: 'https://github.com/foo/bar/pull/42' });
      const r = await apexClaudeCodeParity.createPR({
        title: 'Test PR',
        body: 'body',
        head: 'feature/x',
      });
      expect(r.ok).toBe(true);
      expect(r.prNumber).toBe(42);
      expect(r.url).toBe('https://github.com/foo/bar/pull/42');
    });

    it('createPR : sans token → error', async () => {
      localStorage.removeItem('ax_github_token');
      const r = await apexClaudeCodeParity.createPR({
        title: 't',
        body: 'b',
        head: 'feature/x',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/token/i);
    });

    it('createPR : HTTP 422 → error avec status', async () => {
      mockFetch('Validation failed', 422);
      const r = await apexClaudeCodeParity.createPR({
        title: 't',
        body: 'b',
        head: 'feature/x',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/422/);
    });

    it('commentOnPR : params manquants → error', async () => {
      const r = await apexClaudeCodeParity.commentOnPR(0, '');
      expect(r.ok).toBe(false);
    });

    it('commentOnPR : success', async () => {
      mockFetch({ id: 1 });
      const r = await apexClaudeCodeParity.commentOnPR(42, 'Looks good!');
      expect(r.ok).toBe(true);
    });

    it('mergePR : prNumber 0 → error', async () => {
      const r = await apexClaudeCodeParity.mergePR(0);
      expect(r.ok).toBe(false);
    });

    it('mergePR : success squash', async () => {
      const fetchSpy = mockFetch({ merged: true });
      const r = await apexClaudeCodeParity.mergePR(42, { squash: true });
      expect(r.ok).toBe(true);
      const body = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const parsed = JSON.parse(String(body.body)) as { merge_method: string };
      expect(parsed.merge_method).toBe('squash');
    });

    it('createIssue : success', async () => {
      mockFetch({ number: 100, html_url: 'https://x/issue/100' });
      const r = await apexClaudeCodeParity.createIssue({
        title: 'Bug',
        body: 'desc',
        labels: ['bug'],
      });
      expect(r.ok).toBe(true);
      expect(r.issueNumber).toBe(100);
    });

    it('createIssue : params manquants → error', async () => {
      const r = await apexClaudeCodeParity.createIssue({ title: '', body: '' });
      expect(r.ok).toBe(false);
    });

    it('closeIssue : issueNumber 0 → error', async () => {
      const r = await apexClaudeCodeParity.closeIssue(0);
      expect(r.ok).toBe(false);
    });

    it('closeIssue : success sans comment', async () => {
      mockFetch({ state: 'closed' });
      const r = await apexClaudeCodeParity.closeIssue(42);
      expect(r.ok).toBe(true);
    });

    it('closeIssue : success avec comment', async () => {
      mockFetch({ state: 'closed' });
      const r = await apexClaudeCodeParity.closeIssue(42, 'Fixed!');
      expect(r.ok).toBe(true);
    });

    it('searchCode : query vide → throw', async () => {
      await expect(apexClaudeCodeParity.searchCode('')).rejects.toThrow(/query/i);
    });

    it('searchCode : sans token → throw', async () => {
      localStorage.removeItem('ax_github_token');
      await expect(apexClaudeCodeParity.searchCode('foo')).rejects.toThrow(/token/i);
    });

    it('searchCode : success retourne hits', async () => {
      mockFetch({
        items: [
          {
            path: 'a.ts',
            text_matches: [{ fragment: 'export const a = 1;' }],
          },
        ],
      });
      const hits = await apexClaudeCodeParity.searchCode('export', { repo: 'owner/repo' });
      expect(hits.length).toBe(1);
      expect(hits[0]?.file).toBe('a.ts');
    });

    it('getFileContents : repo+path requis', async () => {
      await expect(apexClaudeCodeParity.getFileContents('', '')).rejects.toThrow(/requis/i);
    });

    it('getFileContents : success', async () => {
      mockFetch('export const x = 1;');
      const content = await apexClaudeCodeParity.getFileContents('owner/repo', 'src/x.ts');
      expect(content).toBe('export const x = 1;');
    });

    it('getFileContents : 404 → throw', async () => {
      mockFetch('Not found', 404);
      await expect(apexClaudeCodeParity.getFileContents('owner/repo', 'missing.ts')).rejects.toThrow(/404|failed/i);
    });

    it('pushFiles : params vides → error', async () => {
      const r = await apexClaudeCodeParity.pushFiles({ branch: '', message: '', files: [] });
      expect(r.ok).toBe(false);
    });

    it('pushFiles : files vide → error', async () => {
      const r = await apexClaudeCodeParity.pushFiles({
        branch: 'feat/x',
        message: 'msg',
        files: [],
      });
      expect(r.ok).toBe(false);
    });

    it('pushFiles : path forbidden → error', async () => {
      const r = await apexClaudeCodeParity.pushFiles({
        branch: 'feat/x',
        message: 'msg',
        files: [{ path: 'package-lock.json', content: '{}' }],
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/non autorisé/i);
    });

    it('pushFiles : success → tous dispatchés', async () => {
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'exec' });
      const r = await apexClaudeCodeParity.pushFiles({
        branch: 'feat/x',
        message: 'add files',
        files: [
          { path: 'apex-ai/v13/a.ts', content: 'a' },
          { path: 'apex-ai/v13/b.ts', content: 'b' },
        ],
      });
      expect(r.ok).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledTimes(2);
    });

    it('pushFiles : un dispatch fail → ok=false', async () => {
      let count = 0;
      vi.spyOn(apexExecute, 'requestExecution').mockImplementation(async () => {
        count++;
        return count === 1 ? { ok: true, request_id: 'e1' } : { ok: false, reason: 'limit' };
      });
      const r = await apexClaudeCodeParity.pushFiles({
        branch: 'feat/x',
        message: 'add files',
        files: [
          { path: 'apex-ai/v13/a.ts', content: 'a' },
          { path: 'apex-ai/v13/b.ts', content: 'b' },
        ],
      });
      expect(r.ok).toBe(false);
    });
  });

  /* ===== Auto-improvement ===== */
  describe('Auto-improvement', () => {
    it('selfAudit : retourne score + findings', async () => {
      const r = await apexClaudeCodeParity.selfAudit();
      expect(typeof r.score).toBe('number');
      expect(Array.isArray(r.findings)).toBe(true);
    });

    it('selfFix : finding vide → error', async () => {
      const r = await apexClaudeCodeParity.selfFix('');
      expect(r.ok).toBe(false);
    });

    it('selfFix : finding ok → ok=true avec applied', async () => {
      const r = await apexClaudeCodeParity.selfFix('Score audit < 80');
      expect(r.ok).toBe(true);
      expect(r.applied).toContain('claude-bridge.pushTodo');
    });

    it('proposeNewFeature : description vide → error', async () => {
      const r = await apexClaudeCodeParity.proposeNewFeature('');
      expect(r.ok).toBe(false);
    });

    it('proposeNewFeature : description ok → ok=true', async () => {
      const r = await apexClaudeCodeParity.proposeNewFeature('Add dark mode toggle');
      expect(r.ok).toBe(true);
    });

    it('releaseVersion : runTests=false → skip tests + dispatch', async () => {
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'rel' });
      const r = await apexClaudeCodeParity.releaseVersion({ runTests: false, bumpType: 'minor' });
      expect(r.ok).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledWith(
        'deploy_canary',
        expect.objectContaining({ env: 'canary', bumpType: 'minor' }),
        expect.any(Object),
      );
    });

    it('releaseVersion : tests fail → ok=false', async () => {
      vi.spyOn(apexExecute, 'requestExecution').mockResolvedValue({
        ok: false,
        reason: 'test failure',
      });
      const r = await apexClaudeCodeParity.releaseVersion({ runTests: true });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/test/i);
    });

    it('releaseVersion : dispatch fail → ok=false', async () => {
      let calls = 0;
      vi.spyOn(apexExecute, 'requestExecution').mockImplementation(async () => {
        calls++;
        if (calls === 1) return { ok: true, request_id: 't1' };
        return { ok: false, reason: 'no permission' };
      });
      const r = await apexClaudeCodeParity.releaseVersion({ runTests: true });
      expect(r.ok).toBe(false);
    });
  });

  /* ===== Memory ===== */
  describe('Memory', () => {
    it('appendToMemory : memoryFile invalide → error', async () => {
      const r = await apexClaudeCodeParity.appendToMemory(
        'OTHER.md' as 'CLAUDE.md',
        's',
        'c',
      );
      expect(r.ok).toBe(false);
    });

    it('appendToMemory : section/content vide → error', async () => {
      const r = await apexClaudeCodeParity.appendToMemory('CLAUDE.md', '', '');
      expect(r.ok).toBe(false);
    });

    it('appendToMemory : success → dispatch modify_file', async () => {
      mockFetch('# CLAUDE.md\n\nExisting content');
      const dispatchSpy = vi
        .spyOn(apexExecute, 'requestExecution')
        .mockResolvedValue({ ok: true, request_id: 'mem_1' });
      const r = await apexClaudeCodeParity.appendToMemory(
        'CLAUDE.md',
        'New section',
        'New rule from Apex',
      );
      expect(r.ok).toBe(true);
      expect(r.request_id).toBe('mem_1');
      expect(dispatchSpy).toHaveBeenCalledWith(
        'modify_file',
        expect.objectContaining({ path: 'CLAUDE.md' }),
        expect.any(Object),
      );
      const params = dispatchSpy.mock.calls[0]?.[1] as { content: string };
      expect(params.content).toContain('New rule from Apex');
      expect(params.content).toContain('## New section');
    });

    it('appendToMemory : NOTES_USER.md ok', async () => {
      mockFetch('existing');
      vi.spyOn(apexExecute, 'requestExecution').mockResolvedValue({
        ok: true,
        request_id: 'mem_n',
      });
      const r = await apexClaudeCodeParity.appendToMemory('NOTES_USER.md', 'Sec', 'Content');
      expect(r.ok).toBe(true);
    });

    it('appendToMemory : MEMO_RESUME.md ok', async () => {
      mockFetch('existing');
      vi.spyOn(apexExecute, 'requestExecution').mockResolvedValue({
        ok: true,
        request_id: 'mem_m',
      });
      const r = await apexClaudeCodeParity.appendToMemory('MEMO_RESUME.md', 'Sec', 'Content');
      expect(r.ok).toBe(true);
    });

    it('appendToMemory : dispatch fail → error', async () => {
      mockFetch('existing');
      vi.spyOn(apexExecute, 'requestExecution').mockResolvedValue({
        ok: false,
        reason: 'rate limit',
      });
      const r = await apexClaudeCodeParity.appendToMemory('CLAUDE.md', 'Sec', 'Content');
      expect(r.ok).toBe(false);
    });

    it('syncMemoryBridge : retourne ok + backends', async () => {
      const r = await apexClaudeCodeParity.syncMemoryBridge();
      expect(r).toHaveProperty('ok');
      expect(Array.isArray(r.backends)).toBe(true);
    });
  });

  /* ===== Audit log écrit pour chaque appel ===== */
  describe('Audit log enforcement', () => {
    it('write blocked path → audit log entry', async () => {
      const auditModule = await import('../../services/observability/audit-log.js');
      const recordSpy = vi.spyOn(auditModule.auditLog, 'record');
      await apexClaudeCodeParity.write('node_modules/x.ts', 'pwn');
      expect(recordSpy).toHaveBeenCalledWith(
        'parity.write.blocked',
        expect.any(Object),
      );
    });

    it('bash blocked → audit log entry', async () => {
      const auditModule = await import('../../services/observability/audit-log.js');
      const recordSpy = vi.spyOn(auditModule.auditLog, 'record');
      await apexClaudeCodeParity.bash('rm -rf /');
      expect(recordSpy).toHaveBeenCalledWith(
        'parity.bash.blocked',
        expect.any(Object),
      );
    });

    it('grep autorisé → audit log entry parity.grep', async () => {
      localStorage.setItem('ax_github_token', 'ghp_test');
      mockFetch({ items: [] });
      const auditModule = await import('../../services/observability/audit-log.js');
      const recordSpy = vi.spyOn(auditModule.auditLog, 'record');
      await apexClaudeCodeParity.grep('foo');
      expect(recordSpy).toHaveBeenCalledWith('parity.grep', expect.any(Object));
    });

    it('createPR autorisé → audit log entry parity.createPR', async () => {
      localStorage.setItem('ax_github_token', 'ghp_test');
      mockFetch({ number: 1, html_url: 'http://x' });
      const auditModule = await import('../../services/observability/audit-log.js');
      const recordSpy = vi.spyOn(auditModule.auditLog, 'record');
      await apexClaudeCodeParity.createPR({ title: 't', body: 'b', head: 'h' });
      expect(recordSpy).toHaveBeenCalledWith('parity.createPR', expect.any(Object));
    });
  });
});
