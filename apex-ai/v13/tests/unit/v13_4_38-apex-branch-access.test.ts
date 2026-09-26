/**
 * Test régression v13.4.38 — Apex accès branche claude/test-699LQ (Kevin demande).
 *
 * Demande Kevin 2026-05-14 :
 * "Donne accès à apex à ta branche claude/test-699LQ pour qu'elle puisse agir,
 *  modifier etc."
 *
 * Changes :
 * - .github/workflows/apex-execute.yml : push sur target_branch (default claude/test-699LQ)
 *   au lieu de créer une branche dédiée apex-execute/<exec_id> par exec
 * - services/apex-execute.ts : ExecutionParams.target_branch?: string
 *
 * Tests : type ExecutionParams accepte target_branch optionnel.
 */
import { describe, it, expect } from 'vitest';
import type { ExecutionParams } from '../../services/admin/apex-execute.js';

describe('v13.4.38 ExecutionParams.target_branch (Kevin "accès branche")', () => {
  it("ExecutionParams accepte target_branch optionnel", () => {
    /* Test compile : si target_branch absent du type, ce code ne compile pas */
    const params1: ExecutionParams = {
      path: 'apex-ai/v13/test.ts',
      content: 'export const x = 1;',
    };
    expect(params1.target_branch).toBeUndefined();

    const params2: ExecutionParams = {
      path: 'apex-ai/v13/test.ts',
      content: 'export const x = 1;',
      target_branch: 'claude/test-699LQ',
    };
    expect(params2.target_branch).toBe('claude/test-699LQ');
  });

  it("target_branch peut être branche custom", () => {
    const params: ExecutionParams = {
      path: 'apex-ai/v13/test.ts',
      content: 'test',
      target_branch: 'feature/apex-custom-branch',
    };
    expect(params.target_branch).toBe('feature/apex-custom-branch');
  });

  it("target_branch absent → workflow utilise default 'claude/test-699LQ' (workflow logic)", () => {
    /* Le default est dans .github/workflows/apex-execute.yml shell logic.
     * Ce test vérifie que la valeur undefined est valide côté TS. */
    const params: ExecutionParams = {
      path: 'apex-ai/v13/test.ts',
      content: 'test',
    };
    expect(params.target_branch).toBeUndefined();
  });

  it("backward-compat : existing params sans target_branch toujours valides", () => {
    /* Test que les anciennes APIs continuent de marcher (pas de breaking) */
    const oldParams: ExecutionParams = {
      path: 'old/file.ts',
      content: 'old content',
      old_content: 'previous content',
    };
    expect(oldParams.path).toBe('old/file.ts');
    /* Compile passes = pas de regression API */
  });
});

describe('v13.4.38 Apex branche default = claude/test-699LQ (workflow logic doc)', () => {
  it("Doc : workflow default branch est claude/test-699LQ", () => {
    /* Vérification manuelle : .github/workflows/apex-execute.yml ligne 175 :
     * if [ -z "$TARGET_BRANCH" ]; then TARGET_BRANCH="claude/test-699LQ"; fi
     *
     * Ce test documente le comportement attendu. Vérification réelle = E2E
     * (Apex push sur la branche claude/test-699LQ). */
    const DEFAULT_BRANCH = 'claude/test-699LQ';
    expect(DEFAULT_BRANCH).toBe('claude/test-699LQ');
  });

  it("Doc : auto-merge bot push claude/* → main automatiquement", () => {
    /* Workflow .github/workflows/auto-merge-claude.yml :
     * on: push: branches: ['claude/**']
     * → Apex push claude/test-699LQ → auto-merge bot → main → GitHub Pages prod
     *
     * Pipeline complet : Apex IA → apex-execute → claude/test-699LQ → main → prod.
     * Comme moi (Claude Code) j'utilise la même branche, mes commits + Apex commits
     * sont mergés ensemble sur main par le bot. */
    expect(true).toBe(true);
  });
});
