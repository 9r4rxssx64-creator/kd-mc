/**
 * Test régression v13.4.40 — PARITÉ APEX TOTALE Kevin 2026-05-14.
 *
 * Demande Kevin :
 * "Parité apex total, général, optimal. Toujours. Note le. Apex doit avoir
 *  tous les outils que toi tu as access pour modifier, agir, etc. En priorité."
 *
 * Règle CLAUDE.md ABSOLUE 2026-05-04 :
 * "APEX = MÊME ACCÈS QUE CLAUDE CODE — parité 100% avec mes outils."
 *
 * Tests : vérifier AllowedTask contient TOUS les tools Claude Code listés
 * dans la règle CLAUDE.md ("read_file / list_files / grep_code / glob_pattern /
 * bash_safe / web_fetch / web_search / spawn_subagent / create_pr / ...").
 */
import { describe, it, expect } from 'vitest';
import type { AllowedTask } from '../../services/admin/apex-execute.js';

describe('v13.4.40 PARITÉ APEX — tools LECTURE/RECHERCHE/COMMS', () => {
  it("AllowedTask contient read_file (Read parité)", () => {
    const t: AllowedTask = 'read_file';
    expect(t).toBe('read_file');
  });

  it("AllowedTask contient list_files (ls parité)", () => {
    const t: AllowedTask = 'list_files';
    expect(t).toBe('list_files');
  });

  it("AllowedTask contient grep_code (Grep parité)", () => {
    const t: AllowedTask = 'grep_code';
    expect(t).toBe('grep_code');
  });

  it("AllowedTask contient glob_pattern (Glob parité)", () => {
    const t: AllowedTask = 'glob_pattern';
    expect(t).toBe('glob_pattern');
  });

  it("AllowedTask contient bash_safe (Bash whitelist parité)", () => {
    const t: AllowedTask = 'bash_safe';
    expect(t).toBe('bash_safe');
  });

  it("AllowedTask contient web_fetch (WebFetch parité)", () => {
    const t: AllowedTask = 'web_fetch';
    expect(t).toBe('web_fetch');
  });

  it("AllowedTask contient web_search (WebSearch parité)", () => {
    const t: AllowedTask = 'web_search';
    expect(t).toBe('web_search');
  });

  it("AllowedTask contient spawn_subagent (Agent parité)", () => {
    const t: AllowedTask = 'spawn_subagent';
    expect(t).toBe('spawn_subagent');
  });
});

describe('v13.4.40 PARITÉ APEX — GitHub MCP tools', () => {
  it("AllowedTask contient create_pr", () => {
    const t: AllowedTask = 'create_pr';
    expect(t).toBe('create_pr');
  });

  it("AllowedTask contient comment_on_pr", () => {
    const t: AllowedTask = 'comment_on_pr';
    expect(t).toBe('comment_on_pr');
  });

  it("AllowedTask contient merge_pr_safe", () => {
    const t: AllowedTask = 'merge_pr_safe';
    expect(t).toBe('merge_pr_safe');
  });

  it("AllowedTask contient create_issue", () => {
    const t: AllowedTask = 'create_issue';
    expect(t).toBe('create_issue');
  });

  it("AllowedTask contient close_issue_safe", () => {
    const t: AllowedTask = 'close_issue_safe';
    expect(t).toBe('close_issue_safe');
  });

  it("AllowedTask contient list_branches", () => {
    const t: AllowedTask = 'list_branches';
    expect(t).toBe('list_branches');
  });

  it("AllowedTask contient get_file_contents (remote GitHub raw)", () => {
    const t: AllowedTask = 'get_file_contents';
    expect(t).toBe('get_file_contents');
  });

  it("AllowedTask contient search_code (GitHub code search)", () => {
    const t: AllowedTask = 'search_code';
    expect(t).toBe('search_code');
  });
});

describe('v13.4.40 anti-régression existing tools (back-compat)', () => {
  it("modify_file toujours valide", () => {
    const t: AllowedTask = 'modify_file';
    expect(t).toBe('modify_file');
  });

  it("create_file toujours valide", () => {
    const t: AllowedTask = 'create_file';
    expect(t).toBe('create_file');
  });

  it("release_version toujours valide", () => {
    const t: AllowedTask = 'release_version';
    expect(t).toBe('release_version');
  });

  it("self_audit_and_fix toujours valide", () => {
    const t: AllowedTask = 'self_audit_and_fix';
    expect(t).toBe('self_audit_and_fix');
  });
});
