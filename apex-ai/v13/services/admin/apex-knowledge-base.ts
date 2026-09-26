/**
 * APEX v13 — Knowledge Base (RAG-like via GitHub API)
 *
 * Demande Kevin (2026-05-04) :
 * "Apex doit tout connaître pour tout faire"
 *
 * Solution : RAG-like via GitHub API search → Apex peut chercher dans ses propres
 * fichiers + projets Kevin. Token GitHub via vault.readKey('ax_github_token').
 *
 * Endpoints utilisés (GitHub REST v3) :
 * - GET /search/code               → full-text recherche dans repo
 * - GET /repos/{o}/{r}/contents    → lit fichier complet
 * - GET /repos/{o}/{r}/commits     → derniers commits
 * - GET /repos/{o}/{r}/issues      → issues ouvertes
 * - GET /repos/{o}/{r}/pulls       → PRs
 * - GET /repos/{o}/{r}/readme      → README
 *
 * Anti-pattern Kevin :
 * - Cache 1h pour éviter rate limit (5000/h authenticated, 60/h anonymous)
 * - Index local des fichiers fréquemment consultés
 * - Pas de stockage du token (passe par vault.readKey à chaque call)
 * - Aucune erreur technique brute exposée user
 *
 * Wired via :
 * - services-bootstrap.ts (init)
 * - apex-tools.ts (5 tools IA)
 * - apex-tools-dispatch.ts (dispatch)
 * - memory.ts buildSystemPromptContext (top facts injection)
 * - features/admin/index.ts (UI section "📚 Base de connaissances Kevin")
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

const DEFAULT_REPO = '9r4rxssx64-creator/CMCteams';
const REPOS_CONFIG_KEY = 'ax_kdmc_repos';
const CACHE_TTL_MS = 60 * 60 * 1000; /* 1h */
const INDEX_KEY = 'ax_knowledge_base_index_v1';
const MAX_INDEX_ENTRIES = 500;
const GITHUB_API = 'https://api.github.com';

export interface CodeSearchResult {
  path: string;
  repo: string;
  url: string;
  htmlUrl: string;
  matchedSnippet?: string;
  score: number;
}

export interface FileContent {
  path: string;
  repo: string;
  content: string;
  size: number;
  sha: string;
  encoding: string;
}

export interface RepoFileEntry {
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: number;
  url: string;
  additions?: number;
  deletions?: number;
}

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  author: string;
  labels: readonly string[];
  url: string;
  createdAt: number;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  branch: string;
  url: string;
  createdAt: number;
}

export interface RepoMetadata {
  name: string;
  fullName: string;
  description: string;
  language: string | null;
  stars: number;
  size: number;
  updatedAt: number;
}

interface CacheEntry<T> {
  data: T;
  ts: number;
}

interface IndexEntry {
  path: string;
  repo: string;
  hits: number;
  lastAccess: number;
}

class ApexKnowledgeBase {
  private cache = new Map<string, CacheEntry<unknown>>();
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('apex-knowledge-base', 'init OK');
  }

  /**
   * Liste les repos configurés (default + ajouts user via UI).
   */
  listRepos(): readonly string[] {
    try {
      const raw = localStorage.getItem(REPOS_CONFIG_KEY);
      if (!raw) return [DEFAULT_REPO];
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed.length > 0 ? parsed : [DEFAULT_REPO];
      }
      return [DEFAULT_REPO];
    } catch {
      return [DEFAULT_REPO];
    }
  }

  /**
   * Ajoute un repo à la liste (admin only via UI).
   */
  addRepo(fullName: string): { ok: boolean; reason?: string } {
    const trimmed = fullName.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
      return { ok: false, reason: 'Format invalide (attendu: owner/repo)' };
    }
    const current = [...this.listRepos()];
    if (current.includes(trimmed)) return { ok: true };
    current.push(trimmed);
    try {
      localStorage.setItem(REPOS_CONFIG_KEY, JSON.stringify(current));
      return { ok: true };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'quota plein';
      return { ok: false, reason };
    }
  }

  /**
   * Retire un repo de la liste.
   */
  removeRepo(fullName: string): { ok: boolean } {
    const current = this.listRepos().filter((r) => r !== fullName);
    try {
      localStorage.setItem(REPOS_CONFIG_KEY, JSON.stringify(current));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Cherche du code full-text dans un repo via GitHub Code Search API.
   * Cache 1h par requête.
   */
  async searchCode(query: string, repo: string = DEFAULT_REPO): Promise<readonly CodeSearchResult[]> {
    const cacheKey = `search:${repo}:${query}`;
    const cached = this.getFromCache<readonly CodeSearchResult[]>(cacheKey);
    if (cached) return cached;

    const encoded = encodeURIComponent(`${query} repo:${repo}`);
    const url = `${GITHUB_API}/search/code?q=${encoded}&per_page=20`;
    const json = await this.fetchGithub(url);
    if (!json || typeof json !== 'object' || !('items' in json)) {
      return [];
    }
    const items = (json as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];

    const results: CodeSearchResult[] = items.map((it: unknown) => {
      const item = it as Record<string, unknown>;
      const repoObj = (item['repository'] as Record<string, unknown> | undefined) ?? {};
      return {
        path: typeof item['path'] === 'string' ? item['path'] : '',
        repo: typeof repoObj['full_name'] === 'string' ? repoObj['full_name'] : repo,
        url: typeof item['url'] === 'string' ? item['url'] : '',
        htmlUrl: typeof item['html_url'] === 'string' ? item['html_url'] : '',
        score: typeof item['score'] === 'number' ? item['score'] : 0,
      };
    });

    /* Update index local pour chaque file consulté */
    results.forEach((r) => this.bumpIndex(r.path, r.repo));

    this.putInCache(cacheKey, results);
    void auditLog.record('knowledge.search', { details: { query, repo, results: results.length } });
    return results;
  }

  /**
   * Lit le contenu complet d'un fichier via GitHub contents API.
   * Décode base64 → UTF-8 string.
   */
  async getFile(path: string, repo: string = DEFAULT_REPO): Promise<FileContent | null> {
    const cacheKey = `file:${repo}:${path}`;
    const cached = this.getFromCache<FileContent>(cacheKey);
    if (cached) return cached;

    const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURI(path)}`;
    const json = await this.fetchGithub(url);
    if (!json || typeof json !== 'object') return null;
    const obj = json as Record<string, unknown>;
    if (obj['type'] !== 'file' || typeof obj['content'] !== 'string') return null;

    let decoded = '';
    try {
      const rawB64 = obj['content'].replace(/\n/g, '');
      decoded = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(rawB64)))
        : Buffer.from(rawB64, 'base64').toString('utf-8');
    } catch {
      decoded = '';
    }

    const result: FileContent = {
      path,
      repo,
      content: decoded,
      size: typeof obj['size'] === 'number' ? obj['size'] : decoded.length,
      sha: typeof obj['sha'] === 'string' ? obj['sha'] : '',
      encoding: typeof obj['encoding'] === 'string' ? obj['encoding'] : 'base64',
    };

    this.bumpIndex(path, repo);
    this.putInCache(cacheKey, result);
    void auditLog.record('knowledge.read_file', { details: { path, repo, size: result.size } });
    return result;
  }

  /**
   * Liste les fichiers d'un répertoire (1 niveau).
   */
  async listFiles(directory: string = '', repo: string = DEFAULT_REPO): Promise<readonly RepoFileEntry[]> {
    const cacheKey = `list:${repo}:${directory}`;
    const cached = this.getFromCache<readonly RepoFileEntry[]>(cacheKey);
    if (cached) return cached;

    const cleanedPath = directory.replace(/^\/+|\/+$/g, '');
    const url = cleanedPath
      ? `${GITHUB_API}/repos/${repo}/contents/${encodeURI(cleanedPath)}`
      : `${GITHUB_API}/repos/${repo}/contents`;
    const json = await this.fetchGithub(url);
    if (!Array.isArray(json)) return [];

    const entries: RepoFileEntry[] = json.map((it: unknown) => {
      const item = it as Record<string, unknown>;
      const t = item['type'];
      return {
        path: typeof item['path'] === 'string' ? item['path'] : '',
        type: t === 'dir' ? 'dir' : 'file',
        size: typeof item['size'] === 'number' ? item['size'] : 0,
        sha: typeof item['sha'] === 'string' ? item['sha'] : '',
      };
    });

    this.putInCache(cacheKey, entries);
    return entries;
  }

  /**
   * Récupère les N derniers commits.
   */
  async getRecentCommits(limit: number = 10, repo: string = DEFAULT_REPO): Promise<readonly CommitInfo[]> {
    const safeLimit = Math.max(1, Math.min(100, limit));
    const cacheKey = `commits:${repo}:${safeLimit}`;
    const cached = this.getFromCache<readonly CommitInfo[]>(cacheKey);
    if (cached) return cached;

    const url = `${GITHUB_API}/repos/${repo}/commits?per_page=${safeLimit}`;
    const json = await this.fetchGithub(url);
    if (!Array.isArray(json)) return [];

    const commits: CommitInfo[] = json.map((it: unknown) => {
      const c = it as Record<string, unknown>;
      const commitObj = (c['commit'] as Record<string, unknown> | undefined) ?? {};
      const authorObj = (commitObj['author'] as Record<string, unknown> | undefined) ?? {};
      const dateStr = typeof authorObj['date'] === 'string' ? authorObj['date'] : '';
      return {
        sha: typeof c['sha'] === 'string' ? c['sha'] : '',
        message: typeof commitObj['message'] === 'string' ? commitObj['message'] : '',
        author: typeof authorObj['name'] === 'string' ? authorObj['name'] : 'unknown',
        date: dateStr ? new Date(dateStr).getTime() : 0,
        url: typeof c['html_url'] === 'string' ? c['html_url'] : '',
      };
    });

    this.putInCache(cacheKey, commits);
    return commits;
  }

  /**
   * Récupère les issues ouvertes du repo.
   */
  async getOpenIssues(repo: string = DEFAULT_REPO): Promise<readonly IssueInfo[]> {
    const cacheKey = `issues:${repo}`;
    const cached = this.getFromCache<readonly IssueInfo[]>(cacheKey);
    if (cached) return cached;

    const url = `${GITHUB_API}/repos/${repo}/issues?state=open&per_page=30`;
    const json = await this.fetchGithub(url);
    if (!Array.isArray(json)) return [];

    /* GitHub mélange issues et PRs dans /issues — filter out PRs */
    const issues: IssueInfo[] = json
      .filter((it: unknown) => {
        const i = it as Record<string, unknown>;
        return !('pull_request' in i);
      })
      .map((it: unknown) => {
        const i = it as Record<string, unknown>;
        const userObj = (i['user'] as Record<string, unknown> | undefined) ?? {};
        const labelsArr = Array.isArray(i['labels']) ? i['labels'] : [];
        const labels = labelsArr.map((lb: unknown) => {
          const l = lb as Record<string, unknown>;
          return typeof l['name'] === 'string' ? l['name'] : '';
        }).filter(Boolean);
        const createdStr = typeof i['created_at'] === 'string' ? i['created_at'] : '';
        return {
          number: typeof i['number'] === 'number' ? i['number'] : 0,
          title: typeof i['title'] === 'string' ? i['title'] : '',
          body: typeof i['body'] === 'string' ? i['body'] : '',
          state: i['state'] === 'closed' ? 'closed' as const : 'open' as const,
          author: typeof userObj['login'] === 'string' ? userObj['login'] : 'unknown',
          labels,
          url: typeof i['html_url'] === 'string' ? i['html_url'] : '',
          createdAt: createdStr ? new Date(createdStr).getTime() : 0,
        };
      });

    this.putInCache(cacheKey, issues);
    return issues;
  }

  /**
   * Cherche les pull requests d'un repo (state: open / closed / all).
   */
  async searchPullRequests(
    state: 'open' | 'closed' | 'all' = 'open',
    repo: string = DEFAULT_REPO,
  ): Promise<readonly PullRequestInfo[]> {
    const cacheKey = `prs:${repo}:${state}`;
    const cached = this.getFromCache<readonly PullRequestInfo[]>(cacheKey);
    if (cached) return cached;

    const url = `${GITHUB_API}/repos/${repo}/pulls?state=${state}&per_page=30`;
    const json = await this.fetchGithub(url);
    if (!Array.isArray(json)) return [];

    const prs: PullRequestInfo[] = json.map((it: unknown) => {
      const p = it as Record<string, unknown>;
      const userObj = (p['user'] as Record<string, unknown> | undefined) ?? {};
      const headObj = (p['head'] as Record<string, unknown> | undefined) ?? {};
      const merged = p['merged_at'] !== null && p['merged_at'] !== undefined;
      const stateRaw = p['state'];
      const finalState: 'open' | 'closed' | 'merged' = merged
        ? 'merged'
        : stateRaw === 'closed' ? 'closed' : 'open';
      const createdStr = typeof p['created_at'] === 'string' ? p['created_at'] : '';
      return {
        number: typeof p['number'] === 'number' ? p['number'] : 0,
        title: typeof p['title'] === 'string' ? p['title'] : '',
        state: finalState,
        author: typeof userObj['login'] === 'string' ? userObj['login'] : 'unknown',
        branch: typeof headObj['ref'] === 'string' ? headObj['ref'] : '',
        url: typeof p['html_url'] === 'string' ? p['html_url'] : '',
        createdAt: createdStr ? new Date(createdStr).getTime() : 0,
      };
    });

    this.putInCache(cacheKey, prs);
    return prs;
  }

  /**
   * Récupère le README d'un repo.
   */
  async getReadme(repo: string = DEFAULT_REPO): Promise<string | null> {
    const cacheKey = `readme:${repo}`;
    const cached = this.getFromCache<string>(cacheKey);
    if (cached !== null) return cached;

    const url = `${GITHUB_API}/repos/${repo}/readme`;
    const json = await this.fetchGithub(url);
    if (!json || typeof json !== 'object') return null;
    const obj = json as Record<string, unknown>;
    if (typeof obj['content'] !== 'string') return null;

    let decoded = '';
    try {
      const rawB64 = obj['content'].replace(/\n/g, '');
      decoded = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(rawB64)))
        : Buffer.from(rawB64, 'base64').toString('utf-8');
    } catch {
      decoded = '';
    }

    this.putInCache(cacheKey, decoded);
    return decoded;
  }

  /**
   * Récupère metadata d'un repo (name, description, language, stars, size).
   */
  async getProjectMetadata(repo: string = DEFAULT_REPO): Promise<RepoMetadata | null> {
    const cacheKey = `meta:${repo}`;
    const cached = this.getFromCache<RepoMetadata>(cacheKey);
    if (cached) return cached;

    const url = `${GITHUB_API}/repos/${repo}`;
    const json = await this.fetchGithub(url);
    if (!json || typeof json !== 'object') return null;
    const obj = json as Record<string, unknown>;
    const updatedStr = typeof obj['updated_at'] === 'string' ? obj['updated_at'] : '';
    const meta: RepoMetadata = {
      name: typeof obj['name'] === 'string' ? obj['name'] : '',
      fullName: typeof obj['full_name'] === 'string' ? obj['full_name'] : repo,
      description: typeof obj['description'] === 'string' ? obj['description'] : '',
      language: typeof obj['language'] === 'string' ? obj['language'] : null,
      stars: typeof obj['stargazers_count'] === 'number' ? obj['stargazers_count'] : 0,
      size: typeof obj['size'] === 'number' ? obj['size'] : 0,
      updatedAt: updatedStr ? new Date(updatedStr).getTime() : 0,
    };

    this.putInCache(cacheKey, meta);
    return meta;
  }

  /**
   * Top 10 facts les plus utiles pour injection IA system prompt.
   * Mix : repos configurés + index local des fichiers les plus consultés.
   */
  formatForSystemPrompt(): string {
    const lines: string[] = [];
    const repos = this.listRepos();
    lines.push(`📚 Base de connaissances Kevin (GitHub API):`);
    lines.push(`- ${repos.length} repos configurés: ${repos.slice(0, 5).join(', ')}${repos.length > 5 ? `, +${repos.length - 5}` : ''}`);

    const index = this.loadIndex();
    if (index.length > 0) {
      const top = [...index]
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 10);
      lines.push(`- Top 10 fichiers consultés (Apex peut les lire à tout moment):`);
      top.forEach((entry) => {
        lines.push(`  · ${entry.path} (${entry.repo}, ${entry.hits} accès)`);
      });
    }
    lines.push(`- Outils : search_repo_code, read_repo_file, list_repo_files, get_recent_commits, get_repo_readme`);
    lines.push(`- Cache local 1h pour anti rate-limit GitHub (5000 req/h authenticated).`);
    return lines.join('\n');
  }

  /**
   * Vide le cache (admin only via UI).
   */
  clearCache(): { cleared: number } {
    const n = this.cache.size;
    this.cache.clear();
    return { cleared: n };
  }

  /**
   * Stats internes (debug + UI admin).
   */
  getStats(): {
    repos: number;
    cache_entries: number;
    index_entries: number;
    has_token: boolean;
    } {
    let hasToken = false;
    try {
      const raw = localStorage.getItem('ax_github_token');
      hasToken = !!raw && raw.length > 5;
    } catch { /* ignore */ }
    return {
      repos: this.listRepos().length,
      cache_entries: this.cache.size,
      index_entries: this.loadIndex().length,
      has_token: hasToken,
    };
  }

  /* ===================== Internals ===================== */

  private async fetchGithub(url: string): Promise<unknown> {
    let token = '';
    try {
      token = await vault.readKey('ax_github_token');
    } catch {
      token = '';
    }
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const resp = await fetch(url, { headers, method: 'GET' });
      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 429) {
          logger.warn('apex-knowledge-base', `Rate limit GitHub ${resp.status} (configure ax_github_token pour 5000 req/h)`);
        } else if (resp.status === 404) {
          logger.warn('apex-knowledge-base', `Resource not found: ${url}`);
        } else {
          logger.warn('apex-knowledge-base', `GitHub API ${resp.status}`);
        }
        return null;
      }
      return await resp.json() as unknown;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('apex-knowledge-base', 'fetch failed', { reason });
      return null;
    }
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private putInCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, ts: Date.now() });
    /* Cap memory : 200 entries max */
    if (this.cache.size > 200) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  private loadIndex(): readonly IndexEntry[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e): e is IndexEntry =>
        e !== null && typeof e === 'object'
        && typeof (e as IndexEntry).path === 'string'
        && typeof (e as IndexEntry).repo === 'string'
        && typeof (e as IndexEntry).hits === 'number',
      );
    } catch {
      return [];
    }
  }

  private bumpIndex(path: string, repo: string): void {
    if (!path) return;
    try {
      const list = [...this.loadIndex()];
      const existing = list.find((e) => e.path === path && e.repo === repo);
      if (existing) {
        existing.hits += 1;
        existing.lastAccess = Date.now();
      } else {
        list.push({ path, repo, hits: 1, lastAccess: Date.now() });
      }
      /* Trim FIFO si trop d'entries */
      const sorted = list.sort((a, b) => b.lastAccess - a.lastAccess).slice(0, MAX_INDEX_ENTRIES);
      localStorage.setItem(INDEX_KEY, JSON.stringify(sorted));
    } catch {
      /* quota plein → skip */
    }
  }
}

export const apexKnowledgeBase = new ApexKnowledgeBase();
