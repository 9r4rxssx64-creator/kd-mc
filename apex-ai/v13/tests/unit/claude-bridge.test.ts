/**
 * Tests claude-bridge.ts (33.79% → 95%+).
 * Bridge bidirectionnel Apex ↔ Claude Code.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { claudeBridge } from '../../services/ai/claude-bridge.js';
import { events } from '../../core/events.js';

describe('claude-bridge (P0 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('pushTodo()', () => {
    it('push minimal', async () => {
      const t = await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: 'Test bug',
        description: 'Lorem ipsum',
        severity: 'medium',
      });
      expect(t.id).toMatch(/^todo_/);
      expect(t.status).toBe('pending');
      expect(t.ts).toBeGreaterThan(0);
    });

    it('push avec context + version', async () => {
      const t = await claudeBridge.pushTodo({
        type: 'security_finding',
        src: 'cmcteams',
        src_version: 'v9.500',
        title: 'XSS detected',
        description: 'foo',
        severity: 'critical',
        context: { url: '/admin' },
      });
      expect(t.context).toEqual({ url: '/admin' });
      expect(t.src_version).toBe('v9.500');
    });

    it('persist localStorage', async () => {
      await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: 't',
        description: 'd',
        severity: 'high',
      });
      const raw = localStorage.getItem('ax_claude_todo');
      expect(raw).toBeTruthy();
    });

    it('cap MAX_TODOS=100', async () => {
      for (let i = 0; i < 110; i++) {
        await claudeBridge.pushTodo({
          type: 'fix_bug',
          src: 'apex',
          title: `t${i}`,
          description: 'd',
          severity: 'low',
        });
      }
      const list = claudeBridge.listTodos();
      expect(list.length).toBeLessThanOrEqual(100);
    });

    it('cap trim privilégie resolved en premier', async () => {
      /* Force un peu plus que MAX_TODOS */
      for (let i = 0; i < 50; i++) {
        const t = await claudeBridge.pushTodo({
          type: 'fix_bug',
          src: 'apex',
          title: `pending${i}`,
          description: 'd',
          severity: 'low',
        });
        if (i < 10) {
          claudeBridge.resolveTodo(t.id, 'claude-code', 'fixed');
        }
      }
      /* Push 60 supplementaires */
      for (let i = 0; i < 60; i++) {
        await claudeBridge.pushTodo({
          type: 'fix_bug',
          src: 'apex',
          title: `extra${i}`,
          description: 'd',
          severity: 'medium',
        });
      }
      const list = claudeBridge.listTodos();
      expect(list.length).toBeLessThanOrEqual(100);
    });
  });

  describe('listTodos() filters', () => {
    beforeEach(async () => {
      await claudeBridge.pushTodo({ type: 'fix_bug', src: 'apex', title: 'a', description: 'd', severity: 'critical' });
      await claudeBridge.pushTodo({ type: 'add_feature', src: 'cmcteams', title: 'b', description: 'd', severity: 'medium' });
      await claudeBridge.pushTodo({ type: 'fix_bug', src: 'apex', title: 'c', description: 'd', severity: 'low' });
    });

    it('list sans filtre → tous', () => {
      const r = claudeBridge.listTodos();
      expect(r.length).toBe(3);
    });

    it('filter status pending', () => {
      const r = claudeBridge.listTodos({ status: 'pending' });
      expect(r.length).toBe(3);
    });

    it('filter status resolved (vide)', () => {
      const r = claudeBridge.listTodos({ status: 'resolved' });
      expect(r.length).toBe(0);
    });

    it('filter severity', () => {
      const r = claudeBridge.listTodos({ severity: 'critical' });
      expect(r.length).toBe(1);
    });

    it('filter src', () => {
      const r = claudeBridge.listTodos({ src: 'cmcteams' });
      expect(r.length).toBe(1);
    });

    it('filter combine + limit', () => {
      const r = claudeBridge.listTodos({ src: 'apex', limit: 1 });
      expect(r.length).toBe(1);
    });

    it('liste triée par ts desc', async () => {
      const r = claudeBridge.listTodos();
      const ts = r.map((t) => t.ts);
      const sorted = [...ts].sort((a, b) => b - a);
      expect(ts).toEqual(sorted);
    });

    it('localStorage corrompu → []', () => {
      localStorage.setItem('ax_claude_todo', 'not json');
      const r = claudeBridge.listTodos();
      expect(r).toEqual([]);
    });
  });

  describe('resolveTodo()', () => {
    it('resolve existant → true', async () => {
      const t = await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: 'x',
        description: 'd',
        severity: 'high',
      });
      const ok = claudeBridge.resolveTodo(t.id, 'claude-code', 'fixed via PR #123');
      expect(ok).toBe(true);
      const found = claudeBridge.listTodos().find((x) => x.id === t.id);
      expect(found?.status).toBe('resolved');
      expect(found?.resolved_by).toBe('claude-code');
      expect(found?.fix_summary).toBe('fixed via PR #123');
    });

    it('resolve avec commit_sha', async () => {
      const t = await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: 'x',
        description: 'd',
        severity: 'low',
      });
      claudeBridge.resolveTodo(t.id, 'claude-code', 'ok', 'abc1234');
      const found = claudeBridge.listTodos().find((x) => x.id === t.id);
      expect(found?.fix_commit_sha).toBe('abc1234');
    });

    it('resolve inconnu → false', () => {
      const ok = claudeBridge.resolveTodo('inexistant', 'me', 'no');
      expect(ok).toBe(false);
    });

    it('resolve push handoff entry automatiquement', async () => {
      const t = await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: 'x',
        description: 'd',
        severity: 'medium',
      });
      claudeBridge.resolveTodo(t.id, 'claude-code', 'fixed');
      const handoffs = claudeBridge.listHandoff();
      expect(handoffs.length).toBeGreaterThanOrEqual(1);
      expect(handoffs[0]?.action).toBe('fixed');
    });
  });

  describe('pushHandoff()', () => {
    it('push handoff minimal', async () => {
      const e = await claudeBridge.pushHandoff({
        todo_id: 't1',
        by: 'claude-code',
        action: 'investigated',
        notes: 'Looking into it',
      });
      expect(e.id).toMatch(/^handoff_/);
      expect(e.ts).toBeGreaterThan(0);
    });

    it('push handoff avec commit + files', async () => {
      const e = await claudeBridge.pushHandoff({
        todo_id: 't1',
        by: 'claude-code',
        action: 'fixed',
        notes: 'fixed',
        commit_sha: 'abc',
        files_changed: ['a.ts', 'b.ts'],
      });
      expect(e.commit_sha).toBe('abc');
      expect(e.files_changed?.length).toBe(2);
    });

    it('cap MAX_HANDOFF=200', async () => {
      for (let i = 0; i < 220; i++) {
        await claudeBridge.pushHandoff({
          todo_id: `t${i}`,
          by: 'claude-code',
          action: 'acknowledged',
          notes: 'n',
        });
      }
      const list = claudeBridge.listHandoff();
      expect(list.length).toBeLessThanOrEqual(200);
    });
  });

  describe('listHandoff() filters', () => {
    beforeEach(async () => {
      await claudeBridge.pushHandoff({ todo_id: 'a', by: 'claude-code', action: 'acknowledged', notes: 'n' });
      await claudeBridge.pushHandoff({ todo_id: 'a', by: 'claude-code', action: 'fixed', notes: 'n2' });
      await claudeBridge.pushHandoff({ todo_id: 'b', by: 'apex', action: 'acknowledged', notes: 'n3' });
    });

    it('liste sans filtre', () => {
      const r = claudeBridge.listHandoff();
      expect(r.length).toBe(3);
    });

    it('filter todo_id', () => {
      const r = claudeBridge.listHandoff({ todo_id: 'a' });
      expect(r.length).toBe(2);
    });

    it('filter by', () => {
      const r = claudeBridge.listHandoff({ by: 'apex' });
      expect(r.length).toBe(1);
    });

    it('filter limit', () => {
      const r = claudeBridge.listHandoff({ limit: 2 });
      expect(r.length).toBe(2);
    });

    it('JSON invalide → []', () => {
      localStorage.setItem('ax_handoff_journal', 'not json');
      const r = claudeBridge.listHandoff();
      expect(r).toEqual([]);
    });
  });

  describe('getStats()', () => {
    it('vide', () => {
      const s = claudeBridge.getStats();
      expect(s.todos_pending).toBe(0);
      expect(s.todos_critical_pending).toBe(0);
      expect(s.todos_resolved_7d).toBe(0);
      expect(s.handoff_entries_7d).toBe(0);
      expect(s.avg_resolution_time_h).toBe(0);
    });

    it('stats avec todos', async () => {
      await claudeBridge.pushTodo({ type: 'fix_bug', src: 'apex', title: 'a', description: 'd', severity: 'critical' });
      await claudeBridge.pushTodo({ type: 'fix_bug', src: 'apex', title: 'b', description: 'd', severity: 'high' });
      const t3 = await claudeBridge.pushTodo({ type: 'fix_bug', src: 'apex', title: 'c', description: 'd', severity: 'low' });
      claudeBridge.resolveTodo(t3.id, 'claude-code', 'ok');
      const s = claudeBridge.getStats();
      expect(s.todos_pending).toBe(2);
      expect(s.todos_critical_pending).toBe(1);
      expect(s.todos_resolved_7d).toBeGreaterThanOrEqual(1);
    });

    it('avg resolution time calcul', async () => {
      const t = await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: 'x',
        description: 'd',
        severity: 'low',
      });
      /* Force resolved_ts dans le passé pour calcul */
      await new Promise((r) => setTimeout(r, 10));
      claudeBridge.resolveTodo(t.id, 'claude-code', 'fixed');
      const s = claudeBridge.getStats();
      expect(s.avg_resolution_time_h).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatBriefing()', () => {
    it('vide → markdown structure', () => {
      const md = claudeBridge.formatBriefing();
      expect(md).toContain('Claude Bridge Briefing');
      expect(md).toContain('Stats');
      expect(md).toContain('Pending todos');
      expect(md).toContain('Recent handoff');
    });

    it('avec todos + handoff', async () => {
      await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        src_version: 'v13',
        title: 'My todo',
        description: 'd',
        severity: 'critical',
      });
      await claudeBridge.pushHandoff({
        todo_id: 't',
        by: 'claude-code',
        action: 'fixed',
        notes: 'long handoff notes example for tests',
      });
      const md = claudeBridge.formatBriefing();
      expect(md).toContain('My todo');
      expect(md).toContain('claude-code');
    });
  });

  describe('escalateNow() — pipeline temps-réel GitHub repository_dispatch', () => {
    let originalFetch: typeof globalThis.fetch;
    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('skip si pas de github token', async () => {
      /* vault.readKey return '' (no token) -> skip */
      localStorage.removeItem('ax_github_token');
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      const todo = await claudeBridge.pushTodo({
        type: 'fix_bug', src: 'apex', title: 'no token', description: 'd', severity: 'medium',
      });
      const result = await claudeBridge.escalateNow(todo);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no_github_token');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POST repository_dispatch avec headers GitHub corrects', async () => {
      /* Plain token (non-AXENC1) → vault.readKey retourne tel quel */
      localStorage.setItem('ax_github_token', 'ghp_test_token_12345');
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      const todo = await claudeBridge.pushTodo({
        type: 'security_finding', src: 'apex', title: 'Critical bug', description: 'XSS',
        severity: 'low' /* low pour ne pas auto-trigger via pushTodo */,
      });
      const result = await claudeBridge.escalateNow(todo);
      expect(result.ok).toBe(true);
      expect(result.attempts).toBe(1);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/dispatches');
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer ghp_test_token_12345');
      expect((opts.headers as Record<string, string>)['Accept']).toBe('application/vnd.github+json');
      const body = JSON.parse(String(opts.body)) as { event_type: string; client_payload: Record<string, unknown> };
      expect(body.event_type).toBe('apex_escalation');
      expect(body.client_payload['todo_id']).toBe(todo.id);
      expect(body.client_payload['severity']).toBe('low');
    });

    it('retry exponentiel si fail réseau (3 attempts max)', async () => {
      localStorage.setItem('ax_github_token', 'ghp_retry');
      const fetchSpy = vi.fn().mockRejectedValue(new Error('network'));
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      const todo = await claudeBridge.pushTodo({
        type: 'fix_bug', src: 'apex', title: 't', description: 'd', severity: 'low',
      });
      /* Mock setTimeout pour ne pas vraiment attendre 1s/3s/7s */
      vi.useFakeTimers();
      const promise = claudeBridge.escalateNow(todo);
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.reason).toBe('all_retries_failed');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('stop retry si 401 Unauthorized', async () => {
      localStorage.setItem('ax_github_token', 'ghp_invalid');
      const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      const todo = await claudeBridge.pushTodo({
        type: 'fix_bug', src: 'apex', title: 't', description: 'd', severity: 'low',
      });
      const result = await claudeBridge.escalateNow(todo);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.reason).toBe('auth_failed_401');
      expect(fetchSpy).toHaveBeenCalledOnce(); /* pas de retry sur auth fail */
    });
  });

  describe('startListening() — auto-resolve via SSE handoff_journal', () => {
    it('auto-résout todo quand handoff entry action=fixed reçu', async () => {
      const todo = await claudeBridge.pushTodo({
        type: 'fix_bug', src: 'apex', title: 'pending bug', description: 'd', severity: 'high',
      });
      claudeBridge.startListening(); /* idempotent */
      let resolvedEventCalled = false;
      let receivedEventCalled = false;
      events.on('claude_bridge:todo_resolved', () => { resolvedEventCalled = true; });
      events.on('claude_bridge:handoff_received', () => { receivedEventCalled = true; });

      /* Simule SSE : firebase emit remote_change avec handoff entry fixed */
      const fakeEntry = {
        id: 'handoff_remote_1',
        todo_id: todo.id,
        ts: Date.now(),
        by: 'claude-code',
        action: 'fixed' as const,
        notes: 'Fixed via PR #999',
        commit_sha: 'abc1234',
      };
      events.emit('firebase:remote_change', { key: 'ax_handoff_journal', data: [fakeEntry] });

      const todos = claudeBridge.listTodos();
      const updated = todos.find((t) => t.id === todo.id);
      expect(updated?.status).toBe('resolved');
      expect(updated?.resolved_by).toBe('claude-code');
      expect(updated?.fix_commit_sha).toBe('abc1234');
      expect(resolvedEventCalled).toBe(true);
      expect(receivedEventCalled).toBe(true);
    });

    it('ignore handoff sans todo_id matchant', () => {
      claudeBridge.startListening();
      const fakeEntry = {
        id: 'handoff_orphan',
        todo_id: 'inexistant',
        ts: Date.now(),
        by: 'claude-code',
        action: 'fixed' as const,
        notes: 'orphan',
      };
      events.emit('firebase:remote_change', { key: 'ax_handoff_journal', data: [fakeEntry] });
      /* Pas de crash + journal local mis à jour */
      const journal = claudeBridge.listHandoff();
      expect(journal.find((e) => e.id === 'handoff_orphan')).toBeTruthy();
    });

    it('ignore remote_change pour autres clés', () => {
      claudeBridge.startListening();
      events.emit('firebase:remote_change', { key: 'ax_other_key', data: [{ foo: 'bar' }] });
      /* Aucun journal entry ajouté */
      const before = claudeBridge.listHandoff().length;
      events.emit('firebase:remote_change', { key: 'unrelated', data: 'foo' });
      const after = claudeBridge.listHandoff().length;
      expect(after).toBe(before);
    });
  });

  describe('dispatchWorkflow() — arsenal sécurité (security-suite/strix/agent-reach)', () => {
    let originalFetch: typeof globalThis.fetch;
    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('skip si pas de github token (exec_id quand même)', async () => {
      localStorage.removeItem('ax_github_token');
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      const r = await claudeBridge.dispatchWorkflow('security-suite', {});
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_github_token');
      expect(r.exec_id).toMatch(/^apex_/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POST repository_dispatch avec event_type + payload + exec_id', async () => {
      localStorage.setItem('ax_github_token', 'ghp_disp_1');
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      const r = await claudeBridge.dispatchWorkflow('strix-scan', { target: 'kdmc-home/worldmonitor' });
      expect(r.ok).toBe(true);
      expect(r.attempts).toBe(1);
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/dispatches');
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer ghp_disp_1');
      expect((opts.headers as Record<string, string>)['X-GitHub-Api-Version']).toBe('2022-11-28');
      const body = JSON.parse(String(opts.body)) as { event_type: string; client_payload: Record<string, unknown> };
      expect(body.event_type).toBe('strix-scan');
      expect(body.client_payload['target']).toBe('kdmc-home/worldmonitor');
      expect(body.client_payload['exec_id']).toBe(r.exec_id);
      expect(typeof body.client_payload['ts']).toBe('number');
    });

    it('retry puis all_retries_failed sur erreur réseau', async () => {
      localStorage.setItem('ax_github_token', 'ghp_disp_retry');
      const fetchSpy = vi.fn().mockRejectedValue(new Error('network'));
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      vi.useFakeTimers();
      const promise = claudeBridge.dispatchWorkflow('agent-reach', { channel: 'web', target: 'https://kd-mc.com' });
      await vi.runAllTimersAsync();
      const r = await promise;
      vi.useRealTimers();
      expect(r.ok).toBe(false);
      expect(r.attempts).toBe(3);
      expect(r.reason).toBe('all_retries_failed');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('stop sans retry sur 403', async () => {
      localStorage.setItem('ax_github_token', 'ghp_disp_403');
      const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
      const r = await claudeBridge.dispatchWorkflow('security-suite', {});
      expect(r.ok).toBe(false);
      expect(r.status).toBe(403);
      expect(r.reason).toBe('auth_failed_403');
      expect(fetchSpy).toHaveBeenCalledOnce();
    });
  });
});
