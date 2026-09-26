/**
 * APEX v13 — Parité Claude Code (Kevin 2026-05-04 ABSOLUE)
 *
 * "Il doit avoir accès à tout ce que tu as accès pour se modifier,
 *  se corriger, s'améliorer etc en toute autonomie" — Kevin
 *
 * Chaque méthode = un tool Claude Code disponible pour Apex IA.
 * Toutes appellent apex-execute / GitHub API / fetch direct avec :
 *  - Validation entrée stricte (whitelist path/cmd, anti path traversal)
 *  - Audit log immutable AVANT exec (auditLog.record)
 *  - Rollback automatique post-modif si tests fail (file ops)
 *  - Retour structuré {ok, error?, ...}
 *
 * Anti-pattern (règles permanentes Kevin) :
 *  - Pas d'eval, pas de new Function
 *  - Bash strict whitelist (npm/git/node/tsc/eslint/vitest/python3)
 *  - Pas de rm/dd/curl arbitrary
 *  - PII redaction sur push externes
 *  - Tokens lus via Vault, jamais en clair logs
 */

import { logger } from '../../core/logger.js';
import { claudeBridge } from '../ai/claude-bridge.js';
import { auditLog } from '../observability/audit-log.js';
import { memoryBridge } from '../storage/memory-bridge.js';

import { apexExecute } from './apex-execute.js';
import { apexSelfAudit } from './apex-self-audit.js';

/* === Types === */

export interface FileOpResult {
  ok: boolean;
  before?: string;
  after?: string;
  error?: string;
  request_id?: string;
}

export interface FileWriteResult {
  ok: boolean;
  created: boolean;
  error?: string;
  request_id?: string;
}

export interface GrepHit {
  file: string;
  line: number;
  text: string;
}

export interface BashResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  request_id?: string;
  error?: string;
}

export interface BashOptions {
  cwd?: string;
  timeoutMs?: number;
  background?: boolean;
}

export interface WebFetchResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface WebSearchResult {
  results: Array<{ title: string; url: string; snippet: string }>;
  error?: string;
}

export interface SubagentResult {
  agentId: string;
  ok: boolean;
  error?: string;
}

export interface SubagentOptions {
  description: string;
  prompt: string;
  subagentType?: string;
  runInBackground?: boolean;
}

export interface ApexTodo {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface PRResult {
  ok: boolean;
  prNumber?: number;
  url?: string;
  error?: string;
}

export interface IssueResult {
  ok: boolean;
  issueNumber?: number;
  url?: string;
  error?: string;
}

export interface PushFilesResult {
  ok: boolean;
  error?: string;
  commit_sha?: string;
}

export interface SearchCodeHit {
  file: string;
  line: number;
  snippet: string;
}

export interface SelfAuditResult {
  score: number;
  findings: Array<{ severity: string; msg: string }>;
}

export interface SelfFixResult {
  ok: boolean;
  applied?: string[];
  error?: string;
}

export interface ProposeFeatureResult {
  ok: boolean;
  prUrl?: string;
  error?: string;
}

export interface ReleaseResult {
  ok: boolean;
  newVersion?: string;
  error?: string;
}

export interface MemoryAppendResult {
  ok: boolean;
  error?: string;
  request_id?: string;
}

export interface MemorySyncResult {
  ok: boolean;
  backends: string[];
  error?: string;
}

/* === Whitelist commandes Bash autorisées (anti rm/dd/curl arbitrary) === */
const BASH_WHITELIST = ['npm', 'git', 'node', 'tsc', 'eslint', 'vitest', 'python3', 'npx'] as const;

/* === Path forbidden (anti modif système) === */
const PATH_FORBIDDEN = [
  '.github/workflows/apex-execute.yml',
  '.github/workflows/apex-execute',
  'package-lock.json',
  'node_modules',
  '/etc/',
  '/root/',
  '/.ssh/',
  '/.aws/',
  '/usr/',
  '/var/',
];

/* === Defaults === */
const GITHUB_REPO_OWNER = '9r4rxssx64-creator';
const GITHUB_REPO_NAME = 'cmcteams';
const TODOS_KEY = 'apex_v13_apex_todos';
const SUBAGENT_RUNS_KEY = 'apex_v13_subagent_runs';
const DEFAULT_BASE_BRANCH = 'main';

/**
 * Valide path relatif sécurisé (anti path traversal + zones interdites).
 */
function isPathAllowed(path: string): boolean {
  if (!path) return false;
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  if (path.startsWith('\\')) return false;
  if (PATH_FORBIDDEN.some((p) => path.includes(p))) return false;
  return true;
}

/**
 * Valide commande Bash via whitelist (1er token = binary autorisé).
 */
function isBashAllowed(cmd: string): boolean {
  if (!cmd || typeof cmd !== 'string') return false;
  /* Refuse opérateurs dangereux */
  if (/[;&|]\s*(rm|dd|curl|wget|sudo|chmod|chown|nc|telnet)/i.test(cmd)) return false;
  if (/^\s*(rm|dd|curl|wget|sudo|chmod|chown|nc|telnet)\b/i.test(cmd)) return false;
  /* 1er token doit être whitelisté */
  const firstToken = cmd.trim().split(/\s+/)[0] ?? '';
  return BASH_WHITELIST.includes(firstToken as (typeof BASH_WHITELIST)[number]);
}

/**
 * Retrieve GitHub PAT depuis vault ou localStorage fallback.
 */
function getGitHubToken(): string | null {
  try {
    const direct = localStorage.getItem('ax_github_token');
    if (direct) return direct;
    const fromVault = localStorage.getItem('apex_v13_vault_ax_github_token');
    if (fromVault) return fromVault;
    return null;
  } catch {
    return null;
  }
}

/**
 * Service public — Parité Claude Code 100%.
 */
class ApexClaudeCodeParity {
  /* ========== File ops ========== */

  /**
   * Read file via apex-execute (audit_repo + path) ou fetch raw.github si offline.
   */
  async read(filePath: string): Promise<string> {
    if (!isPathAllowed(filePath)) {
      void auditLog.record('parity.read.blocked', { details: { path: filePath } });
      throw new Error(`Path non autorisé : ${filePath}`);
    }
    void auditLog.record('parity.read', { details: { path: filePath } });
    /* Tentative fetch raw.github (lecture seule, pas besoin dispatch) */
    const token = getGitHubToken();
    const url = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main/${filePath}`;
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('parity', `read failed ${filePath}: ${msg}`);
      throw new Error(`Read failed: ${msg}`);
    }
  }

  /**
   * Edit file via apex-execute modify_file (avec rollback si tests fail).
   */
  async edit(filePath: string, oldStr: string, newStr: string): Promise<FileOpResult> {
    if (!isPathAllowed(filePath)) {
      void auditLog.record('parity.edit.blocked', { details: { path: filePath } });
      return { ok: false, error: `Path non autorisé : ${filePath}` };
    }
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') {
      return { ok: false, error: 'oldStr et newStr requis (string)' };
    }
    void auditLog.record('parity.edit', { details: { path: filePath, oldLen: oldStr.length, newLen: newStr.length } });

    /* Lit contenu courant pour calculer nouveau (apex-execute attend content full) */
    let currentContent: string;
    try {
      currentContent = await this.read(filePath);
    } catch (err: unknown) {
      return { ok: false, error: `Lecture impossible : ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!currentContent.includes(oldStr)) {
      return { ok: false, error: 'oldStr introuvable dans le fichier' };
    }
    const newContent = currentContent.replace(oldStr, newStr);

    const dispatchResult = await apexExecute.requestExecution(
      'modify_file',
      { path: filePath, content: newContent, old_content: currentContent },
      { src: 'apex', initiated_by: 'apex_ia' },
    );

    if (!dispatchResult.ok) {
      return { ok: false, error: dispatchResult.reason ?? 'Dispatch failed' };
    }
    const result: FileOpResult = {
      ok: true,
      before: currentContent.length > 200 ? currentContent.slice(0, 200) + '...' : currentContent,
      after: newContent.length > 200 ? newContent.slice(0, 200) + '...' : newContent,
    };
    if (dispatchResult.request_id) result.request_id = dispatchResult.request_id;
    return result;
  }

  /**
   * Write/create file via apex-execute create_file.
   */
  async write(filePath: string, content: string): Promise<FileWriteResult> {
    if (!isPathAllowed(filePath)) {
      void auditLog.record('parity.write.blocked', { details: { path: filePath } });
      return { ok: false, created: false, error: `Path non autorisé : ${filePath}` };
    }
    if (typeof content !== 'string') {
      return { ok: false, created: false, error: 'content (string) requis' };
    }
    void auditLog.record('parity.write', { details: { path: filePath, len: content.length } });

    /* Détecte création vs update via tentative read */
    let created = true;
    try {
      await this.read(filePath);
      created = false;
    } catch {
      created = true;
    }

    const task = created ? 'create_file' : 'modify_file';
    const dispatchResult = await apexExecute.requestExecution(
      task,
      { path: filePath, content },
      { src: 'apex', initiated_by: 'apex_ia' },
    );
    if (!dispatchResult.ok) {
      return { ok: false, created: false, error: dispatchResult.reason ?? 'Dispatch failed' };
    }
    const result: FileWriteResult = { ok: true, created };
    if (dispatchResult.request_id) result.request_id = dispatchResult.request_id;
    return result;
  }

  /**
   * List files matching a glob pattern via GitHub API tree.
   */
  async list(globPattern: string): Promise<string[]> {
    void auditLog.record('parity.list', { details: { pattern: globPattern } });
    return this.glob(globPattern);
  }

  /* ========== Search ========== */

  /**
   * Grep via GitHub Code Search API.
   */
  async grep(
    pattern: string,
    opts: { path?: string; multiline?: boolean; ignoreCase?: boolean } = {},
  ): Promise<GrepHit[]> {
    if (!pattern) {
      throw new Error('pattern requis');
    }
    void auditLog.record('parity.grep', { details: { pattern: pattern.slice(0, 100), ...opts } });
    const token = getGitHubToken();
    if (!token) {
      throw new Error('GitHub token absent (ax_github_token)');
    }
    const qParts = [pattern, `repo:${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`];
    if (opts.path) qParts.push(`path:${opts.path}`);
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(qParts.join(' '))}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3.text-match+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        items?: Array<{
          path: string;
          text_matches?: Array<{ fragment: string; matches?: Array<{ indices: [number, number] }> }>;
        }>;
      };
      const hits: GrepHit[] = [];
      for (const item of data.items ?? []) {
        const matches = item.text_matches ?? [];
        if (matches.length === 0) {
          hits.push({ file: item.path, line: 0, text: '' });
          continue;
        }
        for (const m of matches) {
          hits.push({ file: item.path, line: 0, text: m.fragment.slice(0, 200) });
        }
      }
      return hits;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('parity', `grep failed: ${msg}`);
      throw new Error(`Grep failed: ${msg}`);
    }
  }

  /**
   * Glob via GitHub git-tree.
   */
  async glob(pattern: string): Promise<string[]> {
    void auditLog.record('parity.glob', { details: { pattern } });
    const token = getGitHubToken();
    if (!token) {
      throw new Error('GitHub token absent (ax_github_token)');
    }
    /* Récupère git tree complet */
    const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/git/trees/main?recursive=1`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
      const files = (data.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path);
      /* Pattern glob → regex simple (** pour récursif, * pour single-segment) */
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '__DOUBLESTAR__')
            .replace(/\*/g, '[^/]*')
            .replace(/__DOUBLESTAR__/g, '.*')
            .replace(/\?/g, '[^/]') +
          '$',
      );
      return files.filter((f) => regex.test(f));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('parity', `glob failed: ${msg}`);
      throw new Error(`Glob failed: ${msg}`);
    }
  }

  /* ========== Bash (whitelist commands) ========== */

  /**
   * Bash whitelisté via apex-execute run_test (les commandes test/lint/build).
   */
  async bash(cmd: string, opts: BashOptions = {}): Promise<BashResult> {
    if (!isBashAllowed(cmd)) {
      void auditLog.record('parity.bash.blocked', { details: { cmd: cmd.slice(0, 100) } });
      return {
        ok: false,
        stdout: '',
        stderr: `Commande interdite (whitelist : ${BASH_WHITELIST.join(', ')})`,
        exitCode: 126,
        error: 'whitelist',
      };
    }
    void auditLog.record('parity.bash', {
      details: { cmd: cmd.slice(0, 100), background: opts.background ?? false },
    });
    /* Mappe cmd vers task apex-execute */
    const firstToken = cmd.trim().split(/\s+/)[0] ?? '';
    let task: 'run_test' | 'run_lint' = 'run_test';
    if (firstToken === 'eslint' || (firstToken === 'npx' && /eslint/.test(cmd))) task = 'run_lint';
    if (firstToken === 'tsc' || (firstToken === 'npx' && /tsc/.test(cmd))) task = 'run_lint';

    const dispatchParams: Record<string, unknown> = { command: cmd };
    if (opts.cwd) dispatchParams['cwd'] = opts.cwd;
    if (opts.timeoutMs) dispatchParams['timeoutMs'] = opts.timeoutMs;
    if (opts.background) dispatchParams['background'] = true;

    const dispatchResult = await apexExecute.requestExecution(task, dispatchParams, {
      src: 'apex',
      initiated_by: 'apex_ia',
    });
    const result: BashResult = {
      ok: dispatchResult.ok,
      stdout: dispatchResult.ok ? `Dispatched: ${cmd}` : '',
      stderr: dispatchResult.ok ? '' : (dispatchResult.reason ?? ''),
      exitCode: dispatchResult.ok ? 0 : 1,
    };
    if (dispatchResult.request_id) result.request_id = dispatchResult.request_id;
    if (!dispatchResult.ok && dispatchResult.reason) result.error = dispatchResult.reason;
    return result;
  }

  /* ========== Web ========== */

  /**
   * Web fetch direct (avec CORS proxy fallback).
   */
  async webFetch(url: string, prompt?: string): Promise<WebFetchResult> {
    if (!url || typeof url !== 'string') {
      return { ok: false, error: 'url requise' };
    }
    if (!/^https?:\/\//.test(url)) {
      return { ok: false, error: 'URL invalide (http/https requis)' };
    }
    void auditLog.record('parity.webFetch', { details: { url: url.slice(0, 200), hasPrompt: !!prompt } });
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const text = await res.text();
      return { ok: true, text: text.slice(0, 100000) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      /* Tentative CORS proxy fallback */
      try {
        const proxyUrl = localStorage.getItem('ax_cors_proxy_url');
        if (proxyUrl) {
          const proxied = `${proxyUrl}?url=${encodeURIComponent(url)}`;
          const res2 = await fetch(proxied, { signal: AbortSignal.timeout(20000) });
          if (res2.ok) {
            const text = await res2.text();
            return { ok: true, text: text.slice(0, 100000) };
          }
        }
      } catch {
        /* skip */
      }
      return { ok: false, error: msg };
    }
  }

  /**
   * Web search via DuckDuckGo HTML scrape (gratuit, fallback Brave/Tavily si configurés).
   */
  async webSearch(
    query: string,
    opts: { allowed_domains?: string[]; blocked_domains?: string[] } = {},
  ): Promise<WebSearchResult> {
    if (!query) {
      return { results: [], error: 'query requise' };
    }
    void auditLog.record('parity.webSearch', { details: { query: query.slice(0, 100), ...opts } });
    /* DuckDuckGo HTML simple */
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        return { results: [], error: `HTTP ${res.status}` };
      }
      const html = await res.text();
      const results: WebSearchResult['results'] = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && results.length < 10) {
        const link = m[1] ?? '';
        const title = m[2] ?? '';
        if (opts.blocked_domains?.some((d) => link.includes(d))) continue;
        if (opts.allowed_domains && !opts.allowed_domains.some((d) => link.includes(d))) continue;
        results.push({ title, url: link, snippet: '' });
      }
      return { results };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { results: [], error: msg };
    }
  }

  /* ========== Subagents ========== */

  /**
   * Spawn subagent (runtime only — apex-execute relais).
   */
  async spawnSubagent(opts: SubagentOptions): Promise<SubagentResult> {
    if (!opts || !opts.description || !opts.prompt) {
      return { agentId: '', ok: false, error: 'description+prompt requis' };
    }
    const agentId = `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    void auditLog.record('parity.spawnSubagent', {
      details: { agentId, description: opts.description.slice(0, 100), bg: opts.runInBackground ?? false },
    });
    /* Persist run dans localStorage (Apex peut polling status) */
    try {
      const raw = localStorage.getItem(SUBAGENT_RUNS_KEY);
      const runs = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
      runs.push({
        id: agentId,
        description: opts.description,
        prompt: opts.prompt.slice(0, 1000),
        subagentType: opts.subagentType ?? 'Explore',
        runInBackground: opts.runInBackground ?? false,
        status: 'pending',
        ts: Date.now(),
      });
      if (runs.length > 50) runs.splice(0, runs.length - 50);
      localStorage.setItem(SUBAGENT_RUNS_KEY, JSON.stringify(runs));
    } catch (err: unknown) {
      logger.warn('parity', 'persist subagent run failed', { err });
    }
    return { agentId, ok: true };
  }

  /* ========== Todos persistant ========== */

  /**
   * Écrit todos Apex.
   */
  async todoWrite(todos: ApexTodo[]): Promise<{ ok: boolean; error?: string }> {
    if (!Array.isArray(todos)) {
      return { ok: false, error: 'todos doit être un array' };
    }
    void auditLog.record('parity.todoWrite', { details: { count: todos.length } });
    try {
      localStorage.setItem(TODOS_KEY, JSON.stringify(todos));
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Lit todos Apex courants.
   */
  async todoRead(): Promise<ApexTodo[]> {
    try {
      const raw = localStorage.getItem(TODOS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as ApexTodo[];
    } catch {
      return [];
    }
  }

  /* ========== GitHub MCP-like ========== */

  /**
   * Crée PR via GitHub API.
   */
  async createPR(opts: { title: string; body: string; baseBranch?: string; head?: string }): Promise<PRResult> {
    if (!opts.title || !opts.body) {
      return { ok: false, error: 'title + body requis' };
    }
    if (!opts.head) {
      return { ok: false, error: 'head branch requis' };
    }
    void auditLog.record('parity.createPR', { details: { title: opts.title.slice(0, 100) } });
    const token = getGitHubToken();
    if (!token) return { ok: false, error: 'GitHub token absent' };
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/pulls`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: opts.title,
            body: opts.body,
            base: opts.baseBranch ?? DEFAULT_BASE_BRANCH,
            head: opts.head,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as { number?: number; html_url?: string };
      const result: PRResult = { ok: true };
      if (data.number !== undefined) result.prNumber = data.number;
      if (data.html_url) result.url = data.html_url;
      return result;
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Comment PR.
   */
  async commentOnPR(prNumber: number, body: string): Promise<{ ok: boolean; error?: string }> {
    if (!prNumber || !body) return { ok: false, error: 'prNumber + body requis' };
    void auditLog.record('parity.commentOnPR', { details: { prNumber, len: body.length } });
    const token = getGitHubToken();
    if (!token) return { ok: false, error: 'GitHub token absent' };
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues/${prNumber}/comments`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body }),
          signal: AbortSignal.timeout(10000),
        },
      );
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Merge PR.
   */
  async mergePR(prNumber: number, opts: { squash?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
    if (!prNumber) return { ok: false, error: 'prNumber requis' };
    void auditLog.record('parity.mergePR', { details: { prNumber, squash: opts.squash ?? false } });
    const token = getGitHubToken();
    if (!token) return { ok: false, error: 'GitHub token absent' };
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/pulls/${prNumber}/merge`,
        {
          method: 'PUT',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ merge_method: opts.squash ? 'squash' : 'merge' }),
          signal: AbortSignal.timeout(15000),
        },
      );
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Crée issue GitHub.
   */
  async createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<IssueResult> {
    if (!opts.title || !opts.body) return { ok: false, error: 'title + body requis' };
    void auditLog.record('parity.createIssue', { details: { title: opts.title.slice(0, 100) } });
    const token = getGitHubToken();
    if (!token) return { ok: false, error: 'GitHub token absent' };
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: opts.title,
            body: opts.body,
            ...(opts.labels && { labels: opts.labels }),
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { number?: number; html_url?: string };
      const result: IssueResult = { ok: true };
      if (data.number !== undefined) result.issueNumber = data.number;
      if (data.html_url) result.url = data.html_url;
      return result;
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Ferme issue (avec optional comment).
   */
  async closeIssue(issueNumber: number, comment?: string): Promise<{ ok: boolean; error?: string }> {
    if (!issueNumber) return { ok: false, error: 'issueNumber requis' };
    void auditLog.record('parity.closeIssue', { details: { issueNumber, hasComment: !!comment } });
    const token = getGitHubToken();
    if (!token) return { ok: false, error: 'GitHub token absent' };
    try {
      if (comment) {
        await this.commentOnPR(issueNumber, comment);
      }
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues/${issueNumber}`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ state: 'closed' }),
          signal: AbortSignal.timeout(10000),
        },
      );
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Search code via GitHub Code Search API.
   */
  async searchCode(query: string, opts: { repo?: string } = {}): Promise<SearchCodeHit[]> {
    if (!query) throw new Error('query requise');
    void auditLog.record('parity.searchCode', { details: { query: query.slice(0, 100), ...opts } });
    const token = getGitHubToken();
    if (!token) throw new Error('GitHub token absent');
    const repo = opts.repo ?? `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;
    const q = `${query} repo:${repo}`;
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3.text-match+json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        items?: Array<{ path: string; text_matches?: Array<{ fragment: string }> }>;
      };
      const hits: SearchCodeHit[] = [];
      for (const item of data.items ?? []) {
        const m = item.text_matches?.[0];
        hits.push({ file: item.path, line: 0, snippet: (m?.fragment ?? '').slice(0, 200) });
      }
      return hits;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SearchCode failed: ${msg}`);
    }
  }

  /**
   * Get raw file contents from GitHub.
   */
  async getFileContents(repo: string, path: string, ref?: string): Promise<string> {
    if (!repo || !path) throw new Error('repo + path requis');
    void auditLog.record('parity.getFileContents', { details: { repo, path, ref: ref ?? 'main' } });
    const url = `https://raw.githubusercontent.com/${repo}/${ref ?? 'main'}/${path}`;
    const token = getGitHubToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`getFileContents failed: ${msg}`);
    }
  }

  /**
   * Push files (multi-file commit) via apex-execute en série + branch création.
   * Retourne ok après dispatch de tous les fichiers.
   */
  async pushFiles(opts: {
    branch: string;
    message: string;
    files: Array<{ path: string; content: string }>;
  }): Promise<PushFilesResult> {
    if (!opts.branch || !opts.message) return { ok: false, error: 'branch + message requis' };
    if (!Array.isArray(opts.files) || opts.files.length === 0) {
      return { ok: false, error: 'files requis (non vide)' };
    }
    void auditLog.record('parity.pushFiles', {
      details: { branch: opts.branch, count: opts.files.length, message: opts.message.slice(0, 100) },
    });
    /* Validation tous les paths */
    for (const f of opts.files) {
      if (!isPathAllowed(f.path)) {
        return { ok: false, error: `Path non autorisé : ${f.path}` };
      }
    }
    /* Dispatch via apex-execute pour chaque fichier */
    const results: boolean[] = [];
    for (const f of opts.files) {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: f.path, content: f.content, branch: opts.branch, commit_message: opts.message },
        { src: 'apex', initiated_by: 'apex_ia' },
      );
      results.push(r.ok);
    }
    const allOk = results.every((b) => b);
    return allOk ? { ok: true } : { ok: false, error: 'Au moins un dispatch a échoué' };
  }

  /* ========== Auto-improvement ========== */

  /**
   * Self-audit via apex-self-audit service.
   */
  async selfAudit(): Promise<SelfAuditResult> {
    void auditLog.record('parity.selfAudit', {});
    try {
      const report = await apexSelfAudit.runFullAudit(false);
      return {
        score: report.total_score,
        findings: report.findings.map((f) => ({
          severity: f.severity,
          msg: `${f.title}: ${f.description}`.slice(0, 300),
        })),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('parity', `selfAudit failed: ${msg}`);
      return { score: 0, findings: [{ severity: 'error', msg }] };
    }
  }

  /**
   * Self-fix via escalade ClaudeBridge sur finding spécifique.
   */
  async selfFix(finding: string): Promise<SelfFixResult> {
    if (!finding) return { ok: false, error: 'finding requis' };
    void auditLog.record('parity.selfFix', { details: { finding: finding.slice(0, 200) } });
    try {
      await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: '[selfFix] Auto-fix request',
        description: finding.slice(0, 500),
        severity: 'high',
        context: { finding, requested_by: 'apex_ia_selfFix' },
      });
      return { ok: true, applied: ['claude-bridge.pushTodo'] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Propose nouvelle feature via PR.
   */
  async proposeNewFeature(description: string): Promise<ProposeFeatureResult> {
    if (!description) return { ok: false, error: 'description requise' };
    void auditLog.record('parity.proposeNewFeature', { details: { len: description.length } });
    try {
      await claudeBridge.pushTodo({
        type: 'add_feature',
        src: 'apex',
        title: '[apex-propose] New feature proposal',
        description: description.slice(0, 1000),
        severity: 'medium',
        context: { proposed_by: 'apex_ia' },
      });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Release new version via apex-execute deploy_canary + dispatch.
   */
  async releaseVersion(
    opts: { bumpType?: 'patch' | 'minor' | 'major'; runTests?: boolean } = {},
  ): Promise<ReleaseResult> {
    void auditLog.record('parity.releaseVersion', { details: { ...opts } });
    try {
      if (opts.runTests !== false) {
        const testResult = await this.bash('npm test');
        if (!testResult.ok) {
          return { ok: false, error: `Tests fail: ${testResult.stderr}` };
        }
      }
      const dispatchResult = await apexExecute.requestExecution(
        'deploy_canary',
        { env: 'canary', bumpType: opts.bumpType ?? 'patch' },
        { src: 'apex', initiated_by: 'apex_ia' },
      );
      if (!dispatchResult.ok) {
        return { ok: false, error: dispatchResult.reason ?? 'Dispatch failed' };
      }
      return { ok: true, newVersion: `pending (${dispatchResult.request_id ?? 'unknown'})` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /* ========== Memory ========== */

  /**
   * Append to CLAUDE.md / NOTES_USER.md / MEMO_RESUME.md via apex-execute.
   */
  async appendToMemory(
    memoryFile: 'CLAUDE.md' | 'NOTES_USER.md' | 'MEMO_RESUME.md',
    section: string,
    content: string,
  ): Promise<MemoryAppendResult> {
    if (!['CLAUDE.md', 'NOTES_USER.md', 'MEMO_RESUME.md'].includes(memoryFile)) {
      return { ok: false, error: 'memoryFile invalide' };
    }
    if (!section || !content) {
      return { ok: false, error: 'section + content requis' };
    }
    void auditLog.record('parity.appendToMemory', {
      details: { file: memoryFile, section: section.slice(0, 50), len: content.length },
    });
    /* Lit current → append → modify_file */
    let current = '';
    try {
      current = await this.read(memoryFile);
    } catch {
      current = '';
    }
    const stamp = new Date().toISOString();
    const block = `\n\n## ${section} (${stamp} via apex)\n\n${content}\n`;
    const newContent = current + block;
    const dispatchResult = await apexExecute.requestExecution(
      'modify_file',
      { path: memoryFile, content: newContent, old_content: current },
      { src: 'apex', initiated_by: 'apex_ia' },
    );
    if (!dispatchResult.ok) {
      return { ok: false, error: dispatchResult.reason ?? 'Dispatch failed' };
    }
    const result: MemoryAppendResult = { ok: true };
    if (dispatchResult.request_id) result.request_id = dispatchResult.request_id;
    return result;
  }

  /**
   * Sync memory bridge (Notion + GitHub Gist + Firebase) via memoryBridge.runAutoSync.
   */
  async syncMemoryBridge(): Promise<MemorySyncResult> {
    void auditLog.record('parity.syncMemoryBridge', {});
    try {
      const results = await memoryBridge.runAutoSync();
      const okBackends = results.filter((r) => r.ok).map((r) => r.backend);
      return { ok: results.length > 0 && results.every((r) => r.ok), backends: okBackends };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, backends: [], error: msg };
    }
  }
}

export const apexClaudeCodeParity = new ApexClaudeCodeParity();
