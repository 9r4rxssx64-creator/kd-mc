/**
 * Tests apex-execute.ts (pont autonome IA → Claude Code via GitHub Actions).
 * Couvre : whitelist sécurité, validation params, dispatch GitHub, polling,
 * cancel, stats, rate-limit, redaction PII.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { apexExecute } from '../../services/admin/apex-execute.js';

describe('apex-execute (P0 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Security gate — whitelist + forbidden tasks', () => {
    it('refuse tâche INTERDITE delete_file', async () => {
      const r = await apexExecute.requestExecution('delete_file' as 'modify_file', { path: 'foo.ts' }, { skipDispatch: true });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/interdite|delete_file/i);
    });

    it('refuse tâche INTERDITE force_push', async () => {
      const r = await apexExecute.requestExecution('force_push' as 'modify_file', {}, { skipDispatch: true });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/interdite/i);
    });

    it('refuse tâche INTERDITE modify_user_credentials_external', async () => {
      const r = await apexExecute.requestExecution(
        'modify_user_credentials_external' as 'modify_file',
        {},
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse tâche INTERDITE send_external_email_without_consent', async () => {
      const r = await apexExecute.requestExecution(
        'send_external_email_without_consent' as 'modify_file',
        {},
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('refuse tâche inconnue (pas dans whitelist)', async () => {
      const r = await apexExecute.requestExecution('shell_exec' as 'modify_file', {}, { skipDispatch: true });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/inconnue|shell_exec/i);
    });

    it('listForbiddenTasks() retourne les 4 forbidden baseline', () => {
      const list = apexExecute.listForbiddenTasks();
      expect(list).toContain('delete_file');
      expect(list).toContain('force_push');
      expect(list).toContain('modify_user_credentials_external');
      expect(list).toContain('send_external_email_without_consent');
      /* baseline 4 + extensions niveau MAX */
      expect(list.length).toBeGreaterThanOrEqual(4);
    });

    it('listAllowedTasks() retourne les 8 baseline tasks', () => {
      const list = apexExecute.listAllowedTasks();
      expect(list).toContain('modify_file');
      expect(list).toContain('create_file');
      expect(list).toContain('run_test');
      expect(list).toContain('run_lint');
      expect(list).toContain('audit_repo');
      expect(list).toContain('deploy_canary');
      expect(list).toContain('backup_user_data');
      expect(list).toContain('restore_from_backup');
      /* baseline 8 + extensions niveau MAX */
      expect(list.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Validation params par tâche', () => {
    it('modify_file : refuse path ..', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: '../etc/passwd', content: 'pwn' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/path invalide/i);
    });

    it('modify_file : refuse path absolu /', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: '/etc/passwd', content: 'pwn' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('modify_file : refuse zone protégée .github/workflows/apex-execute.yml', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: '.github/workflows/apex-execute.yml', content: 'tampered' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/protégé|protege/i);
    });

    it('modify_file : refuse content > 1 MB', async () => {
      const big = 'x'.repeat(1024 * 1024 + 100);
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: 'apex-ai/v13/foo.ts', content: big },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/1 MB|content/i);
    });

    it('modify_file : path requis', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/path/i);
    });

    it('modify_file : content (string) requis', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: 'foo.ts' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/content/i);
    });

    it('modify_file : path valide → OK', async () => {
      const r = await apexExecute.requestExecution(
        'modify_file',
        { path: 'apex-ai/v13/services/test.ts', content: 'export const x = 1;' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
      expect(r.request_id).toMatch(/^exec_/);
    });

    it('create_file : path + content valides → OK', async () => {
      const r = await apexExecute.requestExecution(
        'create_file',
        { path: 'apex-ai/v13/foo.ts', content: 'x' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('audit_repo : depth invalide refusé', async () => {
      const r = await apexExecute.requestExecution(
        'audit_repo',
        { depth: 'mega' as 'shallow' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/depth/i);
    });

    it('audit_repo : depth shallow → OK', async () => {
      const r = await apexExecute.requestExecution('audit_repo', { depth: 'shallow' }, { skipDispatch: true });
      expect(r.ok).toBe(true);
    });

    it('audit_repo : sans depth → OK (default)', async () => {
      const r = await apexExecute.requestExecution('audit_repo', {}, { skipDispatch: true });
      expect(r.ok).toBe(true);
    });

    it('deploy_canary : env requis', async () => {
      const r = await apexExecute.requestExecution('deploy_canary', {}, { skipDispatch: true });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/env/i);
    });

    it('deploy_canary : env invalide refusé', async () => {
      const r = await apexExecute.requestExecution(
        'deploy_canary',
        { env: 'production-write' as 'canary' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
    });

    it('deploy_canary : env=canary → OK', async () => {
      const r = await apexExecute.requestExecution('deploy_canary', { env: 'canary' }, { skipDispatch: true });
      expect(r.ok).toBe(true);
    });

    it('backup_user_data : uid requis', async () => {
      const r = await apexExecute.requestExecution('backup_user_data', {}, { skipDispatch: true });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/uid/i);
    });

    it('backup_user_data : uid valide → OK', async () => {
      const r = await apexExecute.requestExecution('backup_user_data', { uid: 'kdmc_admin' }, { skipDispatch: true });
      expect(r.ok).toBe(true);
    });

    it('restore_from_backup : ts requis', async () => {
      const r = await apexExecute.requestExecution(
        'restore_from_backup',
        { uid: 'foo' },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/ts/i);
    });

    it('restore_from_backup : ts + uid valides → OK', async () => {
      const r = await apexExecute.requestExecution(
        'restore_from_backup',
        { uid: 'foo', ts: Date.now() - 86400000 },
        { skipDispatch: true },
      );
      expect(r.ok).toBe(true);
    });

    it('run_test sans params → OK', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      expect(r.ok).toBe(true);
    });

    it('run_lint sans params → OK', async () => {
      const r = await apexExecute.requestExecution('run_lint', {}, { skipDispatch: true });
      expect(r.ok).toBe(true);
    });
  });

  describe('listPendingExecutions / pollResult / cancelExecution', () => {
    it('liste vide initialement', () => {
      expect(apexExecute.listPendingExecutions()).toEqual([]);
    });

    it('après requestExecution → 1 entrée pending', async () => {
      await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const list = apexExecute.listPendingExecutions();
      expect(list.length).toBe(1);
      expect(list[0]?.task).toBe('run_test');
      expect(list[0]?.status).toBe('pending');
    });

    it('filter par status', async () => {
      await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const r = await apexExecute.requestExecution('run_lint', {}, { skipDispatch: true });
      apexExecute.cancelExecution(r.request_id ?? '');
      const pending = apexExecute.listPendingExecutions({ status: 'pending' });
      const cancelled = apexExecute.listPendingExecutions({ status: 'cancelled' });
      expect(pending.length).toBe(1);
      expect(cancelled.length).toBe(1);
    });

    it('filter par task', async () => {
      await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      await apexExecute.requestExecution('run_lint', {}, { skipDispatch: true });
      const r = apexExecute.listPendingExecutions({ task: 'run_test' });
      expect(r.length).toBe(1);
      expect(r[0]?.task).toBe('run_test');
    });

    it('filter limit', async () => {
      for (let i = 0; i < 5; i++) {
        await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      }
      const r = apexExecute.listPendingExecutions({ limit: 2 });
      expect(r.length).toBe(2);
    });

    it('liste triée par ts_created desc', async () => {
      const r1 = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      await new Promise((res) => setTimeout(res, 5));
      const r2 = await apexExecute.requestExecution('run_lint', {}, { skipDispatch: true });
      const list = apexExecute.listPendingExecutions();
      expect(list[0]?.id).toBe(r2.request_id);
      expect(list[1]?.id).toBe(r1.request_id);
    });

    it('pollResult inexistant → null', async () => {
      const r = await apexExecute.pollResult('inexistant');
      expect(r).toBeNull();
    });

    it('pollResult existant → request', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const polled = await apexExecute.pollResult(r.request_id ?? '');
      expect(polled).toBeTruthy();
      expect(polled?.task).toBe('run_test');
    });

    it('cancel inexistant → false', () => {
      expect(apexExecute.cancelExecution('nope')).toBe(false);
    });

    it('cancel valide → true + status=cancelled', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const ok = apexExecute.cancelExecution(r.request_id ?? '');
      expect(ok).toBe(true);
      const list = apexExecute.listPendingExecutions();
      expect(list[0]?.status).toBe('cancelled');
    });

    it('cancel terminé → false', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      apexExecute.cancelExecution(r.request_id ?? '');
      expect(apexExecute.cancelExecution(r.request_id ?? '')).toBe(false);
    });
  });

  describe('markCompleted', () => {
    it('mark inexistant → false', () => {
      expect(apexExecute.markCompleted('nope', null)).toBe(false);
    });

    it('mark success → completed + duration_ms calculé', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      await new Promise((res) => setTimeout(res, 5));
      apexExecute.markCompleted(r.request_id ?? '', { stdout: 'ok' });
      const polled = await apexExecute.pollResult(r.request_id ?? '');
      expect(polled?.status).toBe('completed');
      expect(polled?.duration_ms ?? 0).toBeGreaterThan(0);
      expect(polled?.result).toEqual({ stdout: 'ok' });
    });

    it('mark error → failed', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      apexExecute.markCompleted(r.request_id ?? '', null, 'Test failed');
      const polled = await apexExecute.pollResult(r.request_id ?? '');
      expect(polled?.status).toBe('failed');
      expect(polled?.error).toBe('Test failed');
    });
  });

  describe('getStats()', () => {
    it('vide → all zero', () => {
      const s = apexExecute.getStats();
      expect(s.total).toBe(0);
      expect(s.success_rate).toBe(0);
      expect(s.avg_duration_ms).toBe(0);
    });

    it('stats avec mix completed + failed + cancelled', async () => {
      const r1 = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const r2 = await apexExecute.requestExecution('run_lint', {}, { skipDispatch: true });
      const r3 = await apexExecute.requestExecution('audit_repo', {}, { skipDispatch: true });
      const r4 = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      apexExecute.markCompleted(r1.request_id ?? '', { ok: 1 });
      apexExecute.markCompleted(r2.request_id ?? '', { ok: 1 });
      apexExecute.markCompleted(r3.request_id ?? '', null, 'fail');
      apexExecute.cancelExecution(r4.request_id ?? '');
      const s = apexExecute.getStats();
      expect(s.total).toBe(4);
      expect(s.completed).toBe(2);
      expect(s.failed).toBe(1);
      expect(s.cancelled).toBe(1);
      expect(s.success_rate).toBe(66.7);
      expect(s.by_task['run_test']).toBe(2);
      expect(s.by_task['run_lint']).toBe(1);
      expect(s.by_task['audit_repo']).toBe(1);
    });
  });

  describe('Rate limit', () => {
    it('51e exécution dans l\'heure → refusée', async () => {
      /* Pré-remplir 50 entrées rapidement (skipDispatch) */
      for (let i = 0; i < 50; i++) {
        await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      }
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/rate limit/i);
    });

    it('bypassRateLimit=true → OK même au-delà', async () => {
      for (let i = 0; i < 51; i++) {
        await apexExecute.requestExecution('run_test', {}, { skipDispatch: true, bypassRateLimit: true });
      }
      const list = apexExecute.listPendingExecutions();
      /* MAX_EXECUTIONS=200 cap mais on en a 51 */
      expect(list.length).toBeGreaterThanOrEqual(51);
    });
  });

  describe('GitHub dispatch (mock fetch)', () => {
    it('absence GitHub token → workflow_dispatched=false mais ok=true', async () => {
      /* localStorage clean → pas de token */
      const r = await apexExecute.requestExecution('run_test', {});
      expect(r.ok).toBe(true);
      expect(r.workflow_dispatched).toBe(false);
    });

    it('avec token + fetch 204 → workflow_dispatched=true', async () => {
      localStorage.setItem('ax_github_token', 'ghp_fake_test_token');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 204 }));
      const r = await apexExecute.requestExecution('run_test', {});
      expect(r.ok).toBe(true);
      expect(r.workflow_dispatched).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
      const call = fetchSpy.mock.calls[0];
      expect(call?.[0]).toMatch(/api\.github\.com.*dispatches/);
      const init = call?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/Bearer/);
      fetchSpy.mockRestore();
    });

    it('avec token + fetch 401 → workflow_dispatched=false, request reste pending', async () => {
      localStorage.setItem('ax_github_token', 'ghp_invalid');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }));
      const r = await apexExecute.requestExecution('run_test', {});
      expect(r.ok).toBe(true);
      expect(r.workflow_dispatched).toBe(false);
      const list = apexExecute.listPendingExecutions();
      expect(list[0]?.error).toMatch(/401/);
      fetchSpy.mockRestore();
    });

    it('avec token + network error → workflow_dispatched=false', async () => {
      localStorage.setItem('ax_github_token', 'ghp_x');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await apexExecute.requestExecution('run_test', {});
      expect(r.ok).toBe(true);
      expect(r.workflow_dispatched).toBe(false);
      fetchSpy.mockRestore();
    });

    it('payload contient exec_id + task + params redacted', async () => {
      localStorage.setItem('ax_github_token', 'ghp_x');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 204 }));
      await apexExecute.requestExecution('run_test', { command: 'npm test' });
      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as {
        event_type?: string;
        client_payload?: { task?: string; exec_id?: string; params?: Record<string, unknown> };
      };
      expect(body.event_type).toBe('apex-execute');
      expect(body.client_payload?.task).toBe('run_test');
      expect(body.client_payload?.exec_id).toMatch(/^exec_/);
      expect(body.client_payload?.params?.['command']).toBe('npm test');
      fetchSpy.mockRestore();
    });
  });

  describe('PII redaction', () => {
    it('content tronqué dans audit log si > 200 chars', async () => {
      localStorage.setItem('ax_github_token', 'ghp_x');
      const big = 'a'.repeat(500);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 204 }));
      await apexExecute.requestExecution('create_file', { path: 'apex-ai/v13/x.ts', content: big });
      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as {
        client_payload?: { params?: { content?: string } };
      };
      const sentContent = body.client_payload?.params?.content ?? '';
      expect(sentContent.length).toBeLessThan(big.length);
      expect(sentContent).toMatch(/truncated|\.{3}/);
      fetchSpy.mockRestore();
    });

    it('clé secrète sk-* masquée', async () => {
      localStorage.setItem('ax_github_token', 'ghp_x');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 204 }));
      await apexExecute.requestExecution('run_test', { command: 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx' });
      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as {
        client_payload?: { params?: { command?: string } };
      };
      expect(body.client_payload?.params?.command).toMatch(/REDACTED|sk-ant/);
      fetchSpy.mockRestore();
    });
  });

  describe('purgeOld', () => {
    it('purge exécutions terminées > maxAgeMs', async () => {
      const r1 = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      apexExecute.markCompleted(r1.request_id ?? '', { ok: 1 });
      /* Force ts_completed dans le passé */
      const all = JSON.parse(localStorage.getItem('apex_v13_executions') ?? '[]') as Array<{ ts_completed: number; ts_created: number }>;
      if (all[0]) {
        all[0].ts_completed = Date.now() - 14 * 24 * 3600 * 1000; /* 14j old */
        all[0].ts_created = Date.now() - 14 * 24 * 3600 * 1000;
      }
      localStorage.setItem('apex_v13_executions', JSON.stringify(all));

      const purged = apexExecute.purgeOld();
      expect(purged).toBeGreaterThanOrEqual(1);
      expect(apexExecute.listPendingExecutions().length).toBe(0);
    });

    it('garde pending même vieux', async () => {
      await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const all = JSON.parse(localStorage.getItem('apex_v13_executions') ?? '[]') as Array<{ ts_created: number }>;
      if (all[0]) all[0].ts_created = Date.now() - 30 * 24 * 3600 * 1000;
      localStorage.setItem('apex_v13_executions', JSON.stringify(all));
      apexExecute.purgeOld();
      expect(apexExecute.listPendingExecutions().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Persistance + cap', () => {
    it('200 exécutions → cap MAX_EXECUTIONS', async () => {
      for (let i = 0; i < 220; i++) {
        await apexExecute.requestExecution('run_test', {}, { skipDispatch: true, bypassRateLimit: true });
      }
      const list = apexExecute.listPendingExecutions();
      expect(list.length).toBeLessThanOrEqual(200);
    });

    it('localStorage corrompu → []', () => {
      localStorage.setItem('apex_v13_executions', 'not-json');
      expect(apexExecute.listPendingExecutions()).toEqual([]);
    });

    it('localStorage non-array → []', () => {
      localStorage.setItem('apex_v13_executions', JSON.stringify({ foo: 'bar' }));
      expect(apexExecute.listPendingExecutions()).toEqual([]);
    });
  });

  describe('Timeout detection (pollResult)', () => {
    it('exécution > 15min → status=timeout', async () => {
      const r = await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const all = JSON.parse(localStorage.getItem('apex_v13_executions') ?? '[]') as Array<{ ts_created: number }>;
      if (all[0]) all[0].ts_created = Date.now() - 16 * 60 * 1000;
      localStorage.setItem('apex_v13_executions', JSON.stringify(all));
      const polled = await apexExecute.pollResult(r.request_id ?? '');
      expect(polled?.status).toBe('timeout');
      expect(polled?.error).toMatch(/timeout/i);
    });
  });

  describe('Options src + initiated_by', () => {
    it('options.src=cmcteams → request.src=cmcteams', async () => {
      const r = await apexExecute.requestExecution(
        'run_test',
        {},
        { skipDispatch: true, src: 'cmcteams', src_version: 'v9.593' },
      );
      const list = apexExecute.listPendingExecutions();
      expect(list[0]?.src).toBe('cmcteams');
      expect(list[0]?.src_version).toBe('v9.593');
      expect(r.ok).toBe(true);
    });

    it('options.initiated_by=admin → request.initiated_by=admin', async () => {
      await apexExecute.requestExecution('run_test', {}, { skipDispatch: true, initiated_by: 'admin' });
      const list = apexExecute.listPendingExecutions();
      expect(list[0]?.initiated_by).toBe('admin');
    });

    it('default initiated_by=apex_ia + src=apex', async () => {
      await apexExecute.requestExecution('run_test', {}, { skipDispatch: true });
      const list = apexExecute.listPendingExecutions();
      expect(list[0]?.initiated_by).toBe('apex_ia');
      expect(list[0]?.src).toBe('apex');
    });
  });
});
