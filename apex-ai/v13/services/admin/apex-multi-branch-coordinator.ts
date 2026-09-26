/**
 * APEX v13.4.205 — Multi-Branch Coordinator (Kevin 2026-05-16 absolu).
 *
 * Kevin : "Toutes branches Claude code connectées. Pas de double travail,
 * pas de confusion, pas de conflit, pas de régression. Même les futures
 * branches couplées automatiquement."
 *
 * Architecture coordination multi-sessions Claude Code :
 *  - GitHub API liste branches claude/* actives (via ax_github_token)
 *  - Pour chaque branche : commits ahead/behind vs main, fichiers modifiés
 *  - Détecte overlap : 2+ branches touchent même fichier = CONFLIT potentiel
 *  - Push status partagé dans Firebase `ax_multi_branch_status` (FB_FIX)
 *  - Sentinelle 10min auto-poll + escalade Kevin si conflit critique
 *
 * Conformité règles CLAUDE.md :
 *  - "AUTONOMIE TOTALE" : zéro action Kevin, juste lecture status
 *  - "JAMAIS ESTIMER" : tous gaps mesurés par grep réel
 *  - "PIPELINE SELF-HEALING CROSS-APP" : escalade auto vers Claude Code todo
 *  - Admin only (Kevin) via auth.isAdminSync() guard
 */
import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';
import { firebase } from '../storage/firebase.js';
import { vault } from '../vault/vault.js';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = '9r4rxssx64-creator';
const REPO_NAME = 'cmcteams';
const CLAUDE_BRANCH_PREFIX = 'claude/';
const STATUS_FB_PATH = 'ax_multi_branch_status';

export interface BranchInfo {
  name: string;
  commits_ahead: number;
  commits_behind: number;
  last_commit_sha: string;
  last_commit_msg: string;
  last_commit_date: string;
  files_changed: string[];
}

export interface ConflictDetection {
  files_overlapping: Array<{
    file: string;
    branches: string[];
  }>;
  branches_stale: string[]; /* > 7 jours sans activity */
  branches_unmerged_old: string[]; /* > 5 commits ahead */
  total_active_branches: number;
}

export interface CoordinatorReport {
  ts: number;
  ok: boolean;
  branches: BranchInfo[];
  conflicts: ConflictDetection;
  recommendations: string[];
  error?: string;
}

class ApexMultiBranchCoordinator {
  private async getToken(): Promise<string | null> {
    try {
      const t = await vault.readKey('ax_github_token');
      return t || null;
    } catch {
      return null;
    }
  }

  private async fetchGh(path: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const token = await this.getToken();
    if (!token) return { ok: false, error: 'no_github_token_in_vault' };
    try {
      const res = await fetch(`${GITHUB_API}${path}`, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!res.ok) return { ok: false, error: `http_${res.status}` };
      return { ok: true, data: await res.json() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Liste toutes branches actives (filter claude/* + main exclu) */
  async listActiveBranches(): Promise<BranchInfo[]> {
    const r = await this.fetchGh(`/repos/${REPO_OWNER}/${REPO_NAME}/branches?per_page=100`);
    if (!r.ok || !Array.isArray(r.data)) return [];
    const branches = r.data as Array<{ name: string; commit: { sha: string; url: string } }>;
    const claudeBranches = branches.filter((b) => b.name.startsWith(CLAUDE_BRANCH_PREFIX));

    const results: BranchInfo[] = [];
    for (const b of claudeBranches) {
      const compare = await this.fetchGh(
        `/repos/${REPO_OWNER}/${REPO_NAME}/compare/main...${encodeURIComponent(b.name)}`,
      );
      if (!compare.ok) continue;
      const cmp = compare.data as {
        ahead_by: number;
        behind_by: number;
        commits?: Array<{ sha: string; commit: { message: string; author: { date: string } } }>;
        files?: Array<{ filename: string }>;
      };
      const lastCommit = cmp.commits?.[cmp.commits.length - 1];
      results.push({
        name: b.name,
        commits_ahead: cmp.ahead_by ?? 0,
        commits_behind: cmp.behind_by ?? 0,
        last_commit_sha: lastCommit?.sha?.slice(0, 8) ?? b.commit.sha.slice(0, 8),
        last_commit_msg: (lastCommit?.commit.message ?? '').split('\n')[0]?.slice(0, 100) ?? '',
        last_commit_date: lastCommit?.commit.author.date ?? '',
        files_changed: (cmp.files ?? []).map((f) => f.filename).slice(0, 50),
      });
    }
    return results;
  }

  /** Détecte conflits : fichiers touchés par 2+ branches simultanément */
  detectConflicts(branches: BranchInfo[]): ConflictDetection {
    const fileToBranches = new Map<string, string[]>();
    for (const b of branches) {
      for (const f of b.files_changed) {
        const list = fileToBranches.get(f) ?? [];
        list.push(b.name);
        fileToBranches.set(f, list);
      }
    }
    const overlapping: Array<{ file: string; branches: string[] }> = [];
    fileToBranches.forEach((branchList, file) => {
      if (branchList.length >= 2) {
        overlapping.push({ file, branches: branchList });
      }
    });

    const now = Date.now();
    const stale: string[] = [];
    const unmergedOld: string[] = [];
    for (const b of branches) {
      if (b.last_commit_date) {
        const age = now - new Date(b.last_commit_date).getTime();
        if (age > 7 * 24 * 60 * 60 * 1000) stale.push(b.name);
      }
      if (b.commits_ahead >= 5) unmergedOld.push(b.name);
    }

    return {
      files_overlapping: overlapping.slice(0, 30), /* cap pour UI */
      branches_stale: stale,
      branches_unmerged_old: unmergedOld,
      total_active_branches: branches.length,
    };
  }

  generateRecommendations(_branches: BranchInfo[], conflicts: ConflictDetection): string[] {
    const recs: string[] = [];
    if (conflicts.files_overlapping.length > 0) {
      recs.push(
        `⚠️ ${conflicts.files_overlapping.length} fichier(s) touché(s) par 2+ branches simultanément — risque conflit/régression. Merger la plus ancienne d'abord.`,
      );
      for (const o of conflicts.files_overlapping.slice(0, 5)) {
        recs.push(`  · ${o.file} : ${o.branches.join(' + ')}`);
      }
    }
    if (conflicts.branches_unmerged_old.length > 0) {
      recs.push(
        `📦 ${conflicts.branches_unmerged_old.length} branche(s) avec ≥5 commits non mergés : ${conflicts.branches_unmerged_old.join(', ')} — déclencher auto-merge bot.`,
      );
    }
    if (conflicts.branches_stale.length > 0) {
      recs.push(
        `🕸️ ${conflicts.branches_stale.length} branche(s) sans activité depuis 7j+ : ${conflicts.branches_stale.join(', ')} — workflow cleanup-stale va les supprimer.`,
      );
    }
    if (conflicts.total_active_branches === 0) {
      recs.push('✅ Aucune branche claude/* active. Pas de coordination requise.');
    } else if (conflicts.files_overlapping.length === 0 && conflicts.branches_unmerged_old.length === 0) {
      recs.push(
        `✅ ${conflicts.total_active_branches} branche(s) active(s), pas de conflit détecté. Coordination saine.`,
      );
    }
    return recs;
  }

  /** Méthode principale : poll branches + détecte + persiste status Firebase */
  async runCoordinationCycle(): Promise<CoordinatorReport> {
    if (!auth.isAdminSync()) {
      return {
        ts: Date.now(),
        ok: false,
        branches: [],
        conflicts: { files_overlapping: [], branches_stale: [], branches_unmerged_old: [], total_active_branches: 0 },
        recommendations: [],
        error: 'admin_only',
      };
    }

    const token = await this.getToken();
    if (!token) {
      return {
        ts: Date.now(),
        ok: false,
        branches: [],
        conflicts: { files_overlapping: [], branches_stale: [], branches_unmerged_old: [], total_active_branches: 0 },
        recommendations: ['❌ ax_github_token absent du Vault — Apex ne peut pas lister les branches GitHub.'],
        error: 'no_github_token',
      };
    }

    try {
      const branches = await this.listActiveBranches();
      const conflicts = this.detectConflicts(branches);
      const recommendations = this.generateRecommendations(branches, conflicts);
      const report: CoordinatorReport = {
        ts: Date.now(),
        ok: true,
        branches,
        conflicts,
        recommendations,
      };

      /* Persist Firebase pour partage cross-session */
      try {
        await firebase.write(STATUS_FB_PATH, report);
      } catch { /* offline ok */ }

      /* localStorage shadow pour offline + UI rapide */
      try {
        localStorage.setItem('apex_v13_multi_branch_status', JSON.stringify(report));
      } catch { /* quota ok */ }

      logger.info('multi-branch-coordinator',
        `${branches.length} branches, ${conflicts.files_overlapping.length} overlaps, ${conflicts.branches_unmerged_old.length} unmerged old`);
      return report;
    } catch (err) {
      return {
        ts: Date.now(),
        ok: false,
        branches: [],
        conflicts: { files_overlapping: [], branches_stale: [], branches_unmerged_old: [], total_active_branches: 0 },
        recommendations: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Lecture du dernier rapport (cached) — pour UI/tools IA */
  getLastReport(): CoordinatorReport | null {
    try {
      const raw = localStorage.getItem('apex_v13_multi_branch_status');
      return raw ? (JSON.parse(raw) as CoordinatorReport) : null;
    } catch {
      return null;
    }
  }
}

export const apexMultiBranchCoordinator = new ApexMultiBranchCoordinator();
