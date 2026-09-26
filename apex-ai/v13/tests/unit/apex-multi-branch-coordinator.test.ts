/**
 * v13.4.206 — Tests régression apex-multi-branch-coordinator.
 *
 * Garantit :
 *  - Service exporté correctement
 *  - detectConflicts retourne structure ConflictDetection cohérente
 *  - generateRecommendations couvre les 3 niveaux (overlap / unmerged / stale)
 *  - getLastReport gère null (jamais run) sans crash
 */
import { describe, expect, it } from 'vitest';

import {
  apexMultiBranchCoordinator,
  type BranchInfo,
} from '../../services/admin/apex-multi-branch-coordinator.js';

describe('apex-multi-branch-coordinator (v13.4.205)', () => {
  it('exports singleton', () => {
    expect(apexMultiBranchCoordinator).toBeDefined();
    expect(typeof apexMultiBranchCoordinator.runCoordinationCycle).toBe('function');
    expect(typeof apexMultiBranchCoordinator.detectConflicts).toBe('function');
    expect(typeof apexMultiBranchCoordinator.generateRecommendations).toBe('function');
    expect(typeof apexMultiBranchCoordinator.getLastReport).toBe('function');
  });

  it('detectConflicts retourne structure cohérente pour input vide', () => {
    const r = apexMultiBranchCoordinator.detectConflicts([]);
    expect(r.files_overlapping).toEqual([]);
    expect(r.branches_stale).toEqual([]);
    expect(r.branches_unmerged_old).toEqual([]);
    expect(r.total_active_branches).toBe(0);
  });

  it('detectConflicts détecte overlap fichier touché par 2 branches', () => {
    const branches: BranchInfo[] = [
      {
        name: 'claude/test-A',
        commits_ahead: 2,
        commits_behind: 0,
        last_commit_sha: 'aaa11111',
        last_commit_msg: 'fix A',
        last_commit_date: new Date().toISOString(),
        files_changed: ['shared.ts', 'a-only.ts'],
      },
      {
        name: 'claude/test-B',
        commits_ahead: 3,
        commits_behind: 0,
        last_commit_sha: 'bbb22222',
        last_commit_msg: 'fix B',
        last_commit_date: new Date().toISOString(),
        files_changed: ['shared.ts', 'b-only.ts'],
      },
    ];
    const r = apexMultiBranchCoordinator.detectConflicts(branches);
    expect(r.total_active_branches).toBe(2);
    expect(r.files_overlapping).toHaveLength(1);
    expect(r.files_overlapping[0]?.file).toBe('shared.ts');
    expect(r.files_overlapping[0]?.branches).toEqual(['claude/test-A', 'claude/test-B']);
  });

  it('detectConflicts détecte unmerged old (≥5 commits ahead)', () => {
    const branches: BranchInfo[] = [
      {
        name: 'claude/test-old',
        commits_ahead: 7,
        commits_behind: 0,
        last_commit_sha: 'ccc33333',
        last_commit_msg: 'old',
        last_commit_date: new Date().toISOString(),
        files_changed: ['x.ts'],
      },
    ];
    const r = apexMultiBranchCoordinator.detectConflicts(branches);
    expect(r.branches_unmerged_old).toEqual(['claude/test-old']);
  });

  it('detectConflicts détecte stale (>7 jours sans commit)', () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const branches: BranchInfo[] = [
      {
        name: 'claude/test-stale',
        commits_ahead: 1,
        commits_behind: 0,
        last_commit_sha: 'ddd44444',
        last_commit_msg: 'old commit',
        last_commit_date: oldDate,
        files_changed: ['y.ts'],
      },
    ];
    const r = apexMultiBranchCoordinator.detectConflicts(branches);
    expect(r.branches_stale).toEqual(['claude/test-stale']);
  });

  it('generateRecommendations couvre les 3 niveaux', () => {
    const conflicts = {
      files_overlapping: [{ file: 'a.ts', branches: ['c/1', 'c/2'] }],
      branches_unmerged_old: ['c/3'],
      branches_stale: ['c/4'],
      total_active_branches: 4,
    };
    const recs = apexMultiBranchCoordinator.generateRecommendations([], conflicts);
    const joined = recs.join(' ');
    expect(joined).toMatch(/⚠️.*fichier\(s\) touché\(s\)/);
    expect(joined).toMatch(/📦.*non mergés/);
    expect(joined).toMatch(/🕸️.*sans activité/);
  });

  it('generateRecommendations dit "saine" si zero conflit', () => {
    const conflicts = {
      files_overlapping: [],
      branches_unmerged_old: [],
      branches_stale: [],
      total_active_branches: 2,
    };
    const recs = apexMultiBranchCoordinator.generateRecommendations([], conflicts);
    expect(recs.some((r) => r.includes('Coordination saine'))).toBe(true);
  });

  it('getLastReport retourne null si aucun rapport stocké', () => {
    /* Nettoyer localStorage avant test */
    try { localStorage.removeItem('apex_v13_multi_branch_status'); } catch { /* ignore */ }
    const r = apexMultiBranchCoordinator.getLastReport();
    expect(r).toBeNull();
  });
});
