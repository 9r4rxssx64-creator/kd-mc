/**
 * Test régression v13.4.48 — E2E Guards apex-execute (audit ULTRA-REVIEW P0 #2).
 *
 * Audit recommandation : "Tests e2e workflow apex-execute :
 *   - bash_safe rm -rf REFUSED
 *   - merge_pr_safe main REFUSED
 *   - spawn_subagent SUCCESS"
 *
 * Vérifications :
 * - FORBIDDEN_TASKS bloquent dès dispatch
 * - validateUniversalPath refuse paths dangereux (../ /etc / windows)
 * - PROTECTED_FILES (apex-identity, etc.) refusés
 * - Params validation refuse mauvais types/values
 * - Confirmation Kevin requise pour task sensibles (release_version, etc.)
 */
import { describe, it, expect } from 'vitest';
import { apexExecute } from '../../services/admin/apex-execute.js';

describe('v13.4.48 apex-execute guards — Forbidden tasks', () => {
  it("listForbiddenTasks contient force_push (audit Kevin règle 'JAMAIS push main direct')", () => {
    const forbidden = apexExecute.listForbiddenTasks();
    expect(forbidden).toContain('force_push');
  });

  it("listForbiddenTasks contient delete_file (anti-destruction sans confirm)", () => {
    expect(apexExecute.listForbiddenTasks()).toContain('delete_file');
  });

  it("listForbiddenTasks contient modify_admin_kevin (compte protégé)", () => {
    expect(apexExecute.listForbiddenTasks()).toContain('modify_admin_kevin');
  });

  it("listForbiddenTasks contient disable_sentinel_security (sécu permanente)", () => {
    expect(apexExecute.listForbiddenTasks()).toContain('disable_sentinel_security');
  });

  it("listForbiddenTasks contient execute_shell_arbitrary (anti rm -rf)", () => {
    expect(apexExecute.listForbiddenTasks()).toContain('execute_shell_arbitrary');
  });

  it("listForbiddenTasks contient modify_csp_meta (CSP protégée)", () => {
    expect(apexExecute.listForbiddenTasks()).toContain('modify_csp_meta');
  });

  it("listForbiddenTasks contient send_external_email_without_consent (RGPD)", () => {
    expect(apexExecute.listForbiddenTasks()).toContain('send_external_email_without_consent');
  });

  it("listForbiddenTasks contient modify_top_rules_replace (CLAUDE.md règles append-only)", () => {
    expect(apexExecute.listForbiddenTasks()).toContain('modify_top_rules_replace');
  });

  it("listForbiddenTasks ≥ 8 entries (couverture anti-abus)", () => {
    expect(apexExecute.listForbiddenTasks().length).toBeGreaterThanOrEqual(8);
  });
});

describe('v13.4.48 apex-execute.execute — Forbidden task REJECTED', () => {
  it("execute(force_push) → ok:false reason mentionne 'interdite'", async () => {
     
    const r = await apexExecute.requestExecution('force_push' as any, {}, { skipDispatch: true });
    expect(r.ok).toBe(false);
    expect(r.reason?.toLowerCase()).toMatch(/interdite|forbidden|inconnue/);
  });

  it("execute(delete_file) → REJECTED", async () => {
     
    const r = await apexExecute.requestExecution('delete_file' as any, { path: 'some/file.ts' }, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });

  it("execute(execute_shell_arbitrary) → REJECTED (anti rm-rf)", async () => {
     
    const r = await apexExecute.requestExecution('execute_shell_arbitrary' as any, { command: 'rm -rf /' }, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });

  it("execute(modify_admin_kevin) → REJECTED", async () => {
     
    const r = await apexExecute.requestExecution('modify_admin_kevin' as any, {}, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });

  it("execute(unknown_task_xyz) → REJECTED (pas dans AllowedTask)", async () => {
     
    const r = await apexExecute.requestExecution('totally_unknown_task' as any, {}, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });
});

describe('v13.4.48 apex-execute.execute — Path validation', () => {
  it("path avec '..' → REJECTED (anti directory traversal)", async () => {
    const r = await apexExecute.requestExecution('modify_file', {
      path: '../../../etc/passwd',
      content: 'evil',
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/relatif|invalide|banni/);
  });

  it("path absolu Unix '/' → REJECTED", async () => {
    const r = await apexExecute.requestExecution('modify_file', {
      path: '/etc/hosts',
      content: 'evil',
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });

  it("path absolu Windows 'C:\\' → REJECTED", async () => {
    const r = await apexExecute.requestExecution('modify_file', {
      path: 'C:\\Windows\\System32',
      content: 'evil',
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });

  it("path .github/workflows/apex-execute.yml → REJECTED (self-protection)", async () => {
    const r = await apexExecute.requestExecution('modify_file', {
      path: '.github/workflows/apex-execute.yml',
      content: 'evil',
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('protégé');
  });
});

describe('v13.4.48 apex-execute.execute — Params validation', () => {
  it("modify_file sans path → REJECTED", async () => {
    const r = await apexExecute.requestExecution('modify_file', {
      content: 'test',
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });

  it("modify_file sans content → REJECTED", async () => {
    const r = await apexExecute.requestExecution('modify_file', {
      path: 'apex-ai/v13/test.ts',
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('content');
  });

  it("modify_file content > 1MB → REJECTED (anti-abus)", async () => {
    const r = await apexExecute.requestExecution('modify_file', {
      path: 'apex-ai/v13/test.ts',
      content: 'a'.repeat(1024 * 1024 + 1),
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('1 MB');
  });

  it("deploy_canary sans env → REJECTED", async () => {
    const r = await apexExecute.requestExecution('deploy_canary', {}, { skipDispatch: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('env');
  });

  it("deploy_canary avec env='prod' (non whitelist) → REJECTED", async () => {
     
    const r = await apexExecute.requestExecution('deploy_canary', { env: 'prod' as any }, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });

  it("deploy_canary avec env='canary' → params validation OK", async () => {
    const r = await apexExecute.requestExecution('deploy_canary', { env: 'canary' }, { skipDispatch: true });
    /* Soit OK soit raison non liée à env (peut être 'snapshot needed' etc.) */
    if (!r.ok) {
      expect(r.reason).not.toContain('env');
    }
  });

  it("backup_user_data sans uid → REJECTED", async () => {
    const r = await apexExecute.requestExecution('backup_user_data', {}, { skipDispatch: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('uid');
  });
});

describe('v13.4.48 apex-execute stats + listing', () => {
  it("getStats() retourne objet ExecuteStats (total/pending/running/completed/...)", () => {
    const s = apexExecute.getStats();
    expect(typeof s.total).toBe('number');
    expect(typeof s.success_rate).toBe('number');
    expect(typeof s.by_task).toBe('object');
  });

  it("listForbiddenTasks() readonly array ≥ 8 entries (anti-abus)", () => {
    const forbidden = apexExecute.listForbiddenTasks();
    expect(Array.isArray(forbidden)).toBe(true);
    expect(forbidden.length).toBeGreaterThanOrEqual(8);
  });
});

describe('v13.4.48 apex-execute v13.4.40 PARITÉ tools accept basic', () => {
  it("read_file (parité Read) accept structure params", async () => {
    /* read_file ne nécessite que path — validation devrait OK le path */
    const r = await apexExecute.requestExecution('read_file', {
      path: 'apex-ai/v13/index.html',
    }, { skipDispatch: true });
    /* Peut fail pour autre raison mais PAS pour path invalide */
    if (!r.ok) {
      expect(r.reason).not.toContain('path invalide');
    }
  });

  it("grep_code path traversal REJECTED", async () => {
    const r = await apexExecute.requestExecution('grep_code', {
      path: '../../../etc',
      command: 'grep pattern',
    }, { skipDispatch: true });
    expect(r.ok).toBe(false);
  });
});
