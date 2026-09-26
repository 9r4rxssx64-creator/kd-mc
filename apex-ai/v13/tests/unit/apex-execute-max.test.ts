/**
 * Tests apex-execute.ts — extensions niveau MAX autonomie 2026-05-04.
 *
 * Couvre :
 * - 14 nouvelles tâches whitelist (create_skill, modify_skill, create_hook,
 *   modify_hook, modify_workflow, register_sentinel, unregister_sentinel,
 *   modify_script, create_script, append_to_memory, append_to_top_rules,
 *   self_audit_and_fix, rotate_credentials, sync_memory_bridge, release_version)
 * - 8 nouveaux forbidden tasks
 * - Validation paths spécifiques (skills, hooks, workflows, scripts, memory)
 * - Confirmation Kevin requise (release_version, modify_workflow, rotate_credentials)
 * - Audit log enrichi avec hashes before/after
 * - Snapshot git auto pour modifs sensibles
 * - Capabilities + listCriticalSentinels
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { apexExecute } from '../../services/admin/apex-execute.js';

describe('apex-execute MAX (niveau autonomie totale 2026-05-04)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Whitelist étendue (22 tâches autorisées)', () => {
    it('listAllowedTasks() retourne ≥23 tâches (baseline+MAX+PARITÉ Claude Code+iOS)', () => {
      const list = apexExecute.listAllowedTasks();
      /* v13.4.122 : flexible — était 23 v13.4.30 puis 40 après v13.4.40/90 extensions */
      expect(list.length).toBeGreaterThanOrEqual(23);
      expect(list.length).toBeLessThanOrEqual(50);
      /* baseline */
      expect(list).toContain('modify_file');
      expect(list).toContain('create_file');
      /* extensions niveau MAX */
      expect(list).toContain('create_skill');
      expect(list).toContain('modify_skill');
      expect(list).toContain('create_hook');
      expect(list).toContain('modify_hook');
      expect(list).toContain('modify_workflow');
      expect(list).toContain('register_sentinel');
      expect(list).toContain('unregister_sentinel');
      expect(list).toContain('modify_script');
      expect(list).toContain('create_script');
      expect(list).toContain('append_to_memory');
      expect(list).toContain('append_to_top_rules');
      expect(list).toContain('self_audit_and_fix');
      expect(list).toContain('rotate_credentials');
      expect(list).toContain('sync_memory_bridge');
      expect(list).toContain('release_version');
    });

    it('listForbiddenTasks() retourne 12 tâches (4 baseline + 8 nouvelles)', () => {
      const list = apexExecute.listForbiddenTasks();
      expect(list.length).toBe(12);
      /* baseline */
      expect(list).toContain('delete_file');
      expect(list).toContain('force_push');
      /* nouvelles */
      expect(list).toContain('delete_skill');
      expect(list).toContain('delete_workflow');
      expect(list).toContain('delete_sentinel_critical');
      expect(list).toContain('modify_admin_kevin');
      expect(list).toContain('modify_top_rules_replace');
      expect(list).toContain('execute_shell_arbitrary');
      expect(list).toContain('modify_csp_meta');
      expect(list).toContain('disable_sentinel_security');
    });

    it('getCapabilities() expose métadonnées MAX', () => {
      const cap = apexExecute.getCapabilities();
      /* v13.4.122 : flexible — était 23/12 v13.4.30, étendu v13.4.40/90 */
      expect(cap.allowed).toBeGreaterThanOrEqual(23);
      expect(cap.forbidden).toBeGreaterThanOrEqual(12);
      expect(cap.critical_sentinels).toBeGreaterThanOrEqual(5);
      expect(cap.max_autonomy).toBe(true);
    });

    it('listCriticalSentinels() expose les sentinelles protégées', () => {
      const list = apexExecute.listCriticalSentinels();
      expect(list).toContain('security-watch');
      expect(list).toContain('token-watch');
      expect(list).toContain('sentinel-meta');
    });
  });

  describe('Forbidden tasks niveau MAX', () => {
    it('refuse delete_skill', async () => {
      const r = await apexExecute.requestExecution(
        'delete_skill' as 'modify_file',
        { path: '.claude/skills/x.md' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/interdite|delete_skill/i);
    });

    it('refuse delete_workflow', async () => {
      const r = await apexExecute.requestExecution(
        'delete_workflow' as 'modify_file',
        {},
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse delete_sentinel_critical', async () => {
      const r = await apexExecute.requestExecution(
        'delete_sentinel_critical' as 'modify_file',
        { sentinel_id: 'security-watch' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse modify_admin_kevin', async () => {
      const r = await apexExecute.requestExecution(
        'modify_admin_kevin' as 'modify_file',
        {},
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse modify_top_rules_replace', async () => {
      const r = await apexExecute.requestExecution(
        'modify_top_rules_replace' as 'modify_file',
        {},
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse execute_shell_arbitrary', async () => {
      const r = await apexExecute.requestExecution(
        'execute_shell_arbitrary' as 'modify_file',
        { command: 'rm -rf /' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse modify_csp_meta', async () => {
      const r = await apexExecute.requestExecution(
        'modify_csp_meta' as 'modify_file',
        {},
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse disable_sentinel_security', async () => {
      const r = await apexExecute.requestExecution(
        'disable_sentinel_security' as 'modify_file',
        {},
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });
  });

  describe('create_skill / modify_skill', () => {
    it('create_skill OK avec path .claude/skills/test.md', async () => {
      const r = await apexExecute.requestExecution(
        'create_skill',
        { path: '.claude/skills/audit.md', content: '# Audit skill\n\nFait audit.' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
      expect(r.request_id).toMatch(/^exec_/);
    });

    it('create_skill refuse path hors .claude/skills/', async () => {
      const r = await apexExecute.requestExecution(
        'create_skill',
        { path: 'apex-ai/v13/skill.md', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/\.claude\/skills/);
    });

    it('create_skill refuse path non .md', async () => {
      const r = await apexExecute.requestExecution(
        'create_skill',
        { path: '.claude/skills/audit.json', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/\.md/);
    });

    it('create_skill refuse content > 256 KB', async () => {
      const big = 'x'.repeat(256 * 1024 + 100);
      const r = await apexExecute.requestExecution(
        'create_skill',
        { path: '.claude/skills/big.md', content: big },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/256 KB|content/);
    });

    it('modify_skill OK avec frontmatter YAML', async () => {
      const md = '---\nname: audit\ndescription: Run audit\n---\n# Body\n';
      const r = await apexExecute.requestExecution(
        'modify_skill',
        { path: '.claude/skills/audit.md', content: md },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });
  });

  describe('create_hook / modify_hook', () => {
    it('create_hook OK avec path .claude/hooks/pre-commit', async () => {
      const r = await apexExecute.requestExecution(
        'create_hook',
        { path: '.claude/hooks/pre-commit.sh', content: '#!/bin/bash\nnode --check\n' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('create_hook refuse path hors .claude/hooks/', async () => {
      const r = await apexExecute.requestExecution(
        'create_hook',
        { path: 'tools/hook.sh', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/\.claude\/hooks/);
    });

    it('modify_hook OK', async () => {
      const r = await apexExecute.requestExecution(
        'modify_hook',
        { path: '.claude/hooks/post-test.sh', content: '#!/bin/bash\necho ok\n' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });
  });

  describe('modify_workflow', () => {
    it('modify_workflow OK avec path .yml', async () => {
      const r = await apexExecute.requestExecution(
        'modify_workflow',
        {
          path: '.github/workflows/deploy-pages.yml',
          content: 'name: deploy\non: push\njobs: {}',
          confirmed_by_kevin: true,
        },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('modify_workflow refuse path hors .github/workflows/', async () => {
      const r = await apexExecute.requestExecution(
        'modify_workflow',
        { path: 'tools/workflow.yml', content: 'x', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/\.github\/workflows/);
    });

    it('modify_workflow refuse extension non yml/yaml', async () => {
      const r = await apexExecute.requestExecution(
        'modify_workflow',
        { path: '.github/workflows/deploy.txt', content: 'x', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/yml|yaml/);
    });

    it('modify_workflow refuse apex-execute.yml protégé', async () => {
      const r = await apexExecute.requestExecution(
        'modify_workflow',
        { path: '.github/workflows/apex-execute.yml', content: 'x', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/apex-execute|protégé|protege/i);
    });

    it('modify_workflow exige confirmation Kevin', async () => {
      const r = await apexExecute.requestExecution(
        'modify_workflow',
        { path: '.github/workflows/deploy.yml', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/confirmation Kevin|confirmed_by_kevin/i);
    });
  });

  describe('register_sentinel / unregister_sentinel', () => {
    it('register_sentinel OK avec params complets', async () => {
      const r = await apexExecute.requestExecution(
        'register_sentinel',
        {
          sentinel_id: 'my-watch',
          sentinel_name: 'My Watch',
          sentinel_description: 'Surveille X',
          sentinel_interval_ms: 60000,
        },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('register_sentinel refuse interval < 60s', async () => {
      const r = await apexExecute.requestExecution(
        'register_sentinel',
        {
          sentinel_id: 'fast',
          sentinel_name: 'Fast',
          sentinel_description: 'Too fast',
          sentinel_interval_ms: 1000,
        },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/interval/i);
    });

    it('register_sentinel refuse id mal formé', async () => {
      const r = await apexExecute.requestExecution(
        'register_sentinel',
        {
          sentinel_id: 'bad id with spaces!',
          sentinel_name: 'Bad',
          sentinel_description: 'X',
          sentinel_interval_ms: 60000,
        },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/sentinel_id|alphanumeric/i);
    });

    it('unregister_sentinel OK pour sentinelle non critique', async () => {
      const r = await apexExecute.requestExecution(
        'unregister_sentinel',
        { sentinel_id: 'custom-watch' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('unregister_sentinel refuse sentinelle critique security-watch', async () => {
      const r = await apexExecute.requestExecution(
        'unregister_sentinel',
        { sentinel_id: 'security-watch' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/critique|security-watch/i);
    });

    it('unregister_sentinel refuse token-watch critique', async () => {
      const r = await apexExecute.requestExecution(
        'unregister_sentinel',
        { sentinel_id: 'token-watch' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });
  });

  describe('modify_script / create_script', () => {
    it('create_script OK dans tools/', async () => {
      const r = await apexExecute.requestExecution(
        'create_script',
        { path: 'tools/audit.js', content: 'console.log("hi")' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('create_script OK dans scripts/ avec .py', async () => {
      const r = await apexExecute.requestExecution(
        'create_script',
        { path: 'scripts/migrate.py', content: 'print("ok")' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('create_script refuse path hors tools/scripts/', async () => {
      const r = await apexExecute.requestExecution(
        'create_script',
        { path: 'apex-ai/v13/foo.js', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/tools\/|scripts\//);
    });

    it('create_script refuse extension non supportée', async () => {
      const r = await apexExecute.requestExecution(
        'create_script',
        { path: 'tools/foo.txt', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/script doit/i);
    });

    it('modify_script OK avec .sh', async () => {
      const r = await apexExecute.requestExecution(
        'modify_script',
        { path: 'tools/deploy.sh', content: '#!/bin/sh\necho deploy\n' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });
  });

  describe('append_to_memory', () => {
    it('OK avec CLAUDE.md', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_memory',
        { path: 'CLAUDE.md', append_text: '## Nouvelle règle\n\nKevin a dit X.' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('OK avec NOTES_USER.md', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_memory',
        { path: 'NOTES_USER.md', append_text: 'Info métier nouvelle' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('OK avec MEMO_RESUME.md', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_memory',
        { path: 'MEMO_RESUME.md', append_text: 'Session 2026-05-04: …' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('refuse autre path', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_memory',
        { path: 'README.md', append_text: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/CLAUDE\.md|NOTES_USER|MEMO_RESUME/);
    });

    it('refuse append_text vide', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_memory',
        { path: 'CLAUDE.md', append_text: '   ' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/append_text/i);
    });

    it('refuse append_text > 10000 chars', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_memory',
        { path: 'CLAUDE.md', append_text: 'x'.repeat(10001) },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/10000/);
    });
  });

  describe('append_to_top_rules', () => {
    it('OK avec règle valide', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_top_rules',
        { append_text: 'Nouvelle règle Kevin : toujours X' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('refuse vide', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_top_rules',
        { append_text: '' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse > 500 chars', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_top_rules',
        { append_text: 'x'.repeat(501) },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/500/);
    });
  });

  describe('self_audit_and_fix', () => {
    it('OK sans param (default)', async () => {
      const r = await apexExecute.requestExecution('self_audit_and_fix', {}, { skipDispatch: true });
      expect(r.ok).toBe(true);
    });

    it('OK avec confidence 0.95', async () => {
      const r = await apexExecute.requestExecution(
        'self_audit_and_fix',
        { min_confidence: 0.95 },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('refuse confidence > 1', async () => {
      const r = await apexExecute.requestExecution(
        'self_audit_and_fix',
        { min_confidence: 1.5 },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse confidence trop bas (<0.5)', async () => {
      const r = await apexExecute.requestExecution(
        'self_audit_and_fix',
        { min_confidence: 0.3 },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/confidence|0\.95/i);
    });
  });

  describe('rotate_credentials', () => {
    it('OK avec ax_anthropic_key + confirmation', async () => {
      const r = await apexExecute.requestExecution(
        'rotate_credentials',
        { credential_name: 'ax_anthropic_key', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('refuse sans confirmation Kevin', async () => {
      const r = await apexExecute.requestExecution(
        'rotate_credentials',
        { credential_name: 'ax_anthropic_key' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/confirmation Kevin/i);
    });

    it('refuse name hors pattern ax_*', async () => {
      const r = await apexExecute.requestExecution(
        'rotate_credentials',
        { credential_name: 'random_secret', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/ax_/);
    });

    it('refuse credential_name vide', async () => {
      const r = await apexExecute.requestExecution(
        'rotate_credentials',
        { credential_name: '', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });
  });

  describe('sync_memory_bridge', () => {
    it('OK avec backends [notion, gist, firebase]', async () => {
      const r = await apexExecute.requestExecution(
        'sync_memory_bridge',
        { backends: ['notion', 'gist', 'firebase'] },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('OK avec backend partiel', async () => {
      const r = await apexExecute.requestExecution(
        'sync_memory_bridge',
        { backends: ['firebase'] },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('refuse backends vide', async () => {
      const r = await apexExecute.requestExecution(
        'sync_memory_bridge',
        { backends: [] },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse backend invalide', async () => {
      const r = await apexExecute.requestExecution(
        'sync_memory_bridge',
        { backends: ['s3'] as Array<'notion' | 'gist' | 'firebase'> },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/backend invalide/i);
    });
  });

  describe('release_version', () => {
    it('OK avec version vX.Y.Z + confirmation', async () => {
      const r = await apexExecute.requestExecution(
        'release_version',
        { new_version: 'v13.0.21', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('refuse sans confirmation Kevin', async () => {
      const r = await apexExecute.requestExecution(
        'release_version',
        { new_version: 'v13.0.21' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/confirmation Kevin/i);
    });

    it('refuse format version invalide', async () => {
      const r = await apexExecute.requestExecution(
        'release_version',
        { new_version: '13.0.21', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/vX\.Y\.Z/);
    });

    it('refuse version vide', async () => {
      const r = await apexExecute.requestExecution(
        'release_version',
        { new_version: '', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });
  });

  describe('Path validation universelle', () => {
    it('refuse node_modules/', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: 'node_modules/foo.js', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/banni|node_modules/i);
    });

    it('refuse .git/', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: '.git/config', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse _archive_v12/', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: '_archive_v12/old.ts', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse .env', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: '.env.local', content: 'API=x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse path Windows absolu C:\\', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: 'C:\\Windows\\foo.txt', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });
  });

  describe('Audit log enrichi (apex_v13_execute_audit)', () => {
    it('audit log entries après exécution', async () => {
      await apexExecute.requestExecution(
        'create_skill',
        { path: '.claude/skills/x.md', content: '# x' },
        { skipDispatch: true },
      );
      const log = apexExecute.getAuditLog();
      expect(log.length).toBeGreaterThanOrEqual(1);
      const entry = log[log.length - 1] as Record<string, unknown>;
      expect(entry['task']).toBe('create_skill');
      expect(entry['path']).toBe('.claude/skills/x.md');
      expect(entry['status']).toBe('requested');
    });

    it('after_hash présent pour create_skill', async () => {
      const r = await apexExecute.requestExecution(
        'create_skill',
        { path: '.claude/skills/x.md', content: '# Hello world' },
        { skipDispatch: true },
      );
      expect(r.after_hash).toBeTruthy();
      expect(typeof r.after_hash).toBe('string');
    });

    it('before_hash + after_hash présents pour modify avec old_content', async () => {
      const r = await apexExecute.requestExecution(
        'modify_skill',
        {
          path: '.claude/skills/x.md',
          content: '# new',
          old_content: '# old',
        },
        { skipDispatch: true },
      );
      expect(r.before_hash).toBeTruthy();
      expect(r.after_hash).toBeTruthy();
      expect(r.before_hash).not.toBe(r.after_hash);
    });

    it('audit log après markCompleted', async () => {
      const r = await apexExecute.requestExecution(
        'create_script',
        { path: 'tools/x.js', content: 'x' },
        { skipDispatch: true },
      );
      apexExecute.markCompleted(r.request_id ?? '', { ok: 1 });
      const log = apexExecute.getAuditLog();
      const completed = log.find((e) => (e as Record<string, unknown>)['status'] === 'completed');
      expect(completed).toBeTruthy();
    });

    it('audit log limit', async () => {
      const log = apexExecute.getAuditLog(10);
      expect(log.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Snapshot git pour modifs sensibles', () => {
    it('git_snapshot_ref défini pour modify_file', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: 'apex-ai/v13/services/x.ts', content: 'x' },
        { skipDispatch: true },
      );
      const list = apexExecute.listPendingExecutions();
      const req = list.find((rr) => rr.id === r.request_id);
      expect(req?.git_snapshot_ref).toMatch(/^apex-snapshot-exec_/);
    });

    it('git_snapshot_ref absent pour run_test', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const list = apexExecute.listPendingExecutions();
      const req = list.find((rr) => rr.id === r.request_id);
      expect(req?.git_snapshot_ref).toBeUndefined();
    });

    it('git_snapshot_ref absent si options.skipSnapshot', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: 'apex-ai/v13/x.ts', content: 'x' },
        { skipDispatch: true, skipSnapshot: true },
      );
      const list = apexExecute.listPendingExecutions();
      const req = list.find((rr) => rr.id === r.request_id);
      expect(req?.git_snapshot_ref).toBeUndefined();
    });

    it('git_snapshot_ref défini pour append_to_memory', async () => {
      const r = await apexExecute.requestExecution(
        'append_to_memory',
        { path: 'CLAUDE.md', append_text: 'x' },
        { skipDispatch: true },
      );
      const list = apexExecute.listPendingExecutions();
      const req = list.find((rr) => rr.id === r.request_id);
      expect(req?.git_snapshot_ref).toBeTruthy();
    });

    it('git_snapshot_ref défini pour release_version', async () => {
      const r = await apexExecute.requestExecution(
        'release_version',
        { new_version: 'v13.0.99', confirmed_by_kevin: true },
        { skipDispatch: true },
      );
      const list = apexExecute.listPendingExecutions();
      const req = list.find((rr) => rr.id === r.request_id);
      expect(req?.git_snapshot_ref).toBeTruthy();
    });
  });

  describe('Rate limit 50/h enforcé sur extensions MAX', () => {
    it('51e exécution mixte refusée', async () => {
      for (let i = 0; i < 50; i++) {
        await apexExecute.requestExecution(
          'create_skill',
          { path: `.claude/skills/s${i}.md`, content: '# x' },
          { skipDispatch: true },
        );
      }
      const r = await apexExecute.requestExecution(
        'create_hook',
        { path: '.claude/hooks/h.sh', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/rate limit/i);
    });
  });
});
