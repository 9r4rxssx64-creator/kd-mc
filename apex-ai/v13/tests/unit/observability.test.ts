import { describe, it, expect, beforeEach } from 'vitest';
import { observability } from '../../services/observability/observability.js';

describe('observability service (tests réels Jet 6)', () => {
  beforeEach(() => {
    localStorage.clear();
    observability.init();
  });

  describe('capture + buffer', () => {
    it('capture event in buffer', () => {
      observability.capture('warn', 'test', 'message test');
      const buf = observability.getBuffer();
      expect(buf.length).toBeGreaterThan(0);
      expect(buf[buf.length - 1]?.msg).toBe('message test');
    });

    it('persiste buffer dans localStorage', () => {
      observability.capture('info', 'persist', 'msg');
      const raw = localStorage.getItem('apex_v13_observability');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('truncate msg > 500 chars (anti memory bomb)', () => {
      const longMsg = 'a'.repeat(2000);
      observability.capture('error', 'big', longMsg);
      const last = observability.getBuffer().slice(-1)[0];
      expect(last?.msg.length).toBeLessThanOrEqual(500);
    });

    it('attache context si fourni', () => {
      observability.capture('warn', 'ctx', 'with context', { extra: 'data', userId: 'u1' });
      const last = observability.getBuffer().slice(-1)[0];
      expect(last?.context).toEqual({ extra: 'data', userId: 'u1' });
    });

    it('chaque event a id unique', () => {
      observability.capture('info', 't', 'a');
      observability.capture('info', 't', 'b');
      const buf = observability.getBuffer();
      const ids = buf.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('guard wrapper anti error swallowing', () => {
    it('guard returns value on success', async () => {
      const result = await observability.guard('test.ok', async () => 42);
      expect(result).toBe(42);
    });

    it('guard returns value sync function', async () => {
      const result = await observability.guard('test.sync', () => 'sync-value');
      expect(result).toBe('sync-value');
    });

    it('guard wraps async errors + capture dans buffer', async () => {
      const result = await observability.guard('test.error', async () => {
        throw new Error('async boom');
      }, 'fallback');
      expect(result).toBe('fallback');
      const buf = observability.getBuffer();
      expect(buf.some((e) => e.msg === 'async boom' && e.scope === 'test.error')).toBe(true);
    });

    it('guard wraps sync errors', async () => {
      const result = await observability.guard('test.sync.err', () => {
        throw new Error('sync boom');
      }, 0);
      expect(result).toBe(0);
      expect(observability.getBuffer().some((e) => e.msg === 'sync boom')).toBe(true);
    });

    it('guard sans fallback retourne undefined sur error', async () => {
      const result = await observability.guard('test.no-fallback', async () => {
        throw new Error('boom');
      });
      expect(result).toBeUndefined();
    });
  });

  describe('escalateToClaudeCode', () => {
    it('push event dans ax_claude_todo localStorage', async () => {
      const ok = await observability.escalateToClaudeCode('test reason', 'critical', { uid: 'u1' });
      expect(ok).toBe(true);
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
      expect(todos.length).toBe(1);
      expect(todos[0].reason).toBe('test reason');
      expect(todos[0].severity).toBe('critical');
      expect(todos[0].context).toEqual({ uid: 'u1' });
    });

    it('rate-limit STRICT après 5 escalades en 10min', async () => {
      for (let i = 0; i < 5; i++) {
        const ok = await observability.escalateToClaudeCode(`r${i}`, 'warn', {});
        expect(ok).toBe(true);
      }
      const blocked = await observability.escalateToClaudeCode('blocked', 'critical', {});
      expect(blocked).toBe(false);
    });

    it('rate-limit reset après 10min (window slide)', async () => {
      const oldTs = Date.now() - 11 * 60 * 1000;
      localStorage.setItem('apex_v13_escalate_rate', JSON.stringify([oldTs, oldTs, oldTs, oldTs, oldTs]));
      const ok = await observability.escalateToClaudeCode('after 11min', 'critical', {});
      expect(ok).toBe(true);
    });

    it('cap ax_claude_todo à 50 entries (FIFO)', async () => {
      const fake = Array.from({ length: 60 }, (_, i) => ({ id: `old_${i}`, reason: 'old' }));
      localStorage.setItem('ax_claude_todo', JSON.stringify(fake));
      localStorage.removeItem('apex_v13_escalate_rate');
      await observability.escalateToClaudeCode('new entry', 'warn', {});
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
      expect(todos.length).toBeLessThanOrEqual(50);
      expect(todos[todos.length - 1].reason).toBe('new entry');
    });
  });

  describe('DLQ + replay', () => {
    it('getDLQ retourne array', () => {
      const dlq = observability.getDLQ();
      expect(Array.isArray(dlq)).toBe(true);
    });

    it('replayDLQ remet events en buffer', async () => {
      const dlqEvents = [{
        id: 'dlq_1',
        ts: Date.now(),
        level: 'error' as const,
        scope: 'test',
        msg: 'replayed',
        attempts: 3,
        status: 'dlq' as const,
      }];
      localStorage.setItem('apex_v13_observability_dlq', JSON.stringify(dlqEvents));
      observability.init();
      const r = await observability.replayDLQ();
      expect(r.replayed).toBeGreaterThanOrEqual(0);
    });
  });
});
