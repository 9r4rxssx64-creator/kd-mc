/**
 * Test régression v13.4.90 — iOS Simulator wiring complet (workflow + apex-execute task).
 *
 * Kevin "Apex utilise iOS simulator pour verif réel" + "Intègre à apex et qu'il
 * utilise avec fonction".
 *
 * Vérifie :
 *  1. AllowedTask 'run_ios_e2e' inclus dans ALLOWED_TASKS (sinon validateur reject)
 *  2. Workflow .github/workflows/apex-ios-simulator.yml existe + repository_dispatch
 *  3. Service apex-e2e-trigger expose API attendue
 *  4. Audit v13.4.40 tasks tous présents dans ALLOWED_TASKS (anti-régression)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const APEX_V13 = join(__dirname, '..', '..');

describe('v13.4.90 iOS Simulator workflow', () => {
  const workflowPath = join(REPO_ROOT, '.github', 'workflows', 'apex-ios-simulator.yml');

  it("Workflow apex-ios-simulator.yml existe", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("Workflow trigger inclut repository_dispatch avec event_type 'apex_e2e_request'", () => {
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain('repository_dispatch');
    expect(content).toContain('apex_e2e_request');
  });

  it("Workflow trigger inclut workflow_dispatch (manuel admin)", () => {
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain('workflow_dispatch');
  });

  it("Workflow installe Playwright WebKit (moteur Safari iOS)", () => {
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain('playwright install webkit');
  });

  it("Workflow upload Playwright report artifact", () => {
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain('upload-artifact');
    expect(content).toContain('playwright-report');
  });

  it("Workflow run sur ubuntu-latest (pas macOS coûteux)", () => {
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain('ubuntu-latest');
  });

  it("Workflow project input default = mobile-safari (iPhone 14 Pro)", () => {
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain("default: 'mobile-safari'");
  });
});

describe('v13.4.90 apex-execute ALLOWED_TASKS inclut run_ios_e2e', () => {
  it("apex-execute.ts source contient 'run_ios_e2e' dans ALLOWED_TASKS Set", () => {
    const src = readFileSync(join(APEX_V13, 'services', 'admin', 'apex-execute.ts'), 'utf8');
    /* Vérification : run_ios_e2e doit apparaître DANS le ALLOWED_TASKS new Set([...]) */
    const allowedSetMatch = src.match(/ALLOWED_TASKS[^[]*\[([\s\S]*?)\]/);
    expect(allowedSetMatch).not.toBeNull();
    expect(allowedSetMatch?.[1]).toContain("'run_ios_e2e'");
  });

  it("Tous les v13.4.40 tasks parité Claude Code présents dans ALLOWED_TASKS", () => {
    const src = readFileSync(join(APEX_V13, 'services', 'admin', 'apex-execute.ts'), 'utf8');
    const allowedSetMatch = src.match(/ALLOWED_TASKS[^[]*\[([\s\S]*?)\]/);
    expect(allowedSetMatch).not.toBeNull();
    const setContent = allowedSetMatch?.[1] ?? '';
    const parityTasks = [
      'read_file', 'list_files', 'grep_code', 'glob_pattern',
      'bash_safe', 'web_fetch', 'web_search', 'spawn_subagent',
      'create_pr', 'comment_on_pr', 'merge_pr_safe', 'create_issue',
      'close_issue_safe', 'list_branches', 'get_file_contents', 'search_code',
    ];
    const missing: string[] = [];
    for (const t of parityTasks) {
      if (!setContent.includes(`'${t}'`)) missing.push(t);
    }
    if (missing.length > 0) {
      throw new Error(`PARITÉ v13.4.40 incomplète : ${missing.length} tasks absents de ALLOWED_TASKS : ${missing.join(', ')}`);
    }
    expect(missing).toEqual([]);
  });

  it("AllowedTask type inclut 'run_ios_e2e' dans la signature TS", () => {
    const src = readFileSync(join(APEX_V13, 'services', 'admin', 'apex-execute.ts'), 'utf8');
    expect(src).toContain("| 'run_ios_e2e'");
  });
});

describe('v13.4.90 apex-e2e-trigger service complet', () => {
  it("services/apex-e2e-trigger.ts existe", () => {
    expect(existsSync(join(APEX_V13, 'services', 'admin', 'apex-e2e-trigger.ts'))).toBe(true);
  });

  it("Service expose triggerE2EWebkit + listE2ERequests + getLastE2EResult", () => {
    const src = readFileSync(join(APEX_V13, 'services', 'admin', 'apex-e2e-trigger.ts'), 'utf8');
    expect(src).toContain('export async function triggerE2EWebkit');
    expect(src).toContain('export async function listE2ERequests');
    expect(src).toContain('export async function getLastE2EResult');
  });

  it("Service utilise event_type 'apex_e2e_request' (match workflow)", () => {
    const src = readFileSync(join(APEX_V13, 'services', 'admin', 'apex-e2e-trigger.ts'), 'utf8');
    expect(src).toContain('apex_e2e_request');
  });

  it("Service guard tier admin only (auth.isAdminSync)", () => {
    const src = readFileSync(join(APEX_V13, 'services', 'admin', 'apex-e2e-trigger.ts'), 'utf8');
    expect(src).toContain('auth.isAdminSync()');
    expect(src).toContain('admin_only_e2e_trigger');
  });

  it("Service utilise vault.getKey('github') pour PAT", () => {
    const src = readFileSync(join(APEX_V13, 'services', 'admin', 'apex-e2e-trigger.ts'), 'utf8');
    expect(src).toContain("vault");
    expect(src).toContain('github');
  });
});
