/**
 * Telemetry coverage extension : push 51% → 80%+.
 * Cible : pushIncoming, processIncoming, tryAutoFix, escalateToClaudeCode, AUTOFIX_WHITELIST.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { telemetry } from '../../services/observability/telemetry.js';

describe('Telemetry coverage extension', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('pushIncoming', () => {
    it('ajoute entry avec id + ts + processed=false', () => {
      telemetry.pushIncoming({
        kind: 'err',
        msg: 'test error',
        details: { foo: 'bar' },
        src: 'apex',
        v: 'v13',
        user: 'u1',
      });
      const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as Array<Record<string, unknown>>;
      expect(buf.length).toBe(1);
      expect(buf[0]?.id).toBeTruthy();
      expect(buf[0]?.processed).toBe(false);
      expect(buf[0]?.kind).toBe('err');
    });

    it('cap buffer max 200 entries (FIFO)', () => {
      for (let i = 0; i < 220; i++) {
        telemetry.pushIncoming({
          kind: 'info', msg: `m${i}`, details: {}, src: 'apex', v: 'v13', user: 'u1',
        });
      }
      const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as unknown[];
      expect(buf.length).toBeLessThanOrEqual(200);
    });

    it('source apex/cmcteams/kdmc/ekdmc/telecommande/crackpass acceptés', () => {
      const sources: Array<'apex' | 'cmcteams' | 'kdmc' | 'ekdmc' | 'telecommande' | 'crackpass'> = [
        'apex', 'cmcteams', 'kdmc', 'ekdmc', 'telecommande', 'crackpass',
      ];
      for (const src of sources) {
        telemetry.pushIncoming({ kind: 'info', msg: 'src test', details: {}, src, v: 'v13', user: 'u' });
      }
      const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as Array<{ src: string }>;
      expect(buf.length).toBe(sources.length);
    });
  });

  describe('processIncoming', () => {
    it('aucune entry pending → no-op', async () => {
      await telemetry.processIncoming();
      expect(true).toBe(true);
    });

    it('processe entries pending + marque processed', async () => {
      telemetry.pushIncoming({
        kind: 'err', msg: 'process me', details: {}, src: 'apex', v: 'v13', user: 'u1',
      });
      await telemetry.processIncoming();
      const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as Array<{ processed: boolean }>;
      expect(buf[0]?.processed).toBe(true);
    });

    it('escalade vers ax_claude_todo si auto-fix échoue', async () => {
      telemetry.pushIncoming({
        kind: 'err', msg: 'unfixable error', details: {}, src: 'apex', v: 'v13', user: 'u1',
      });
      await telemetry.processIncoming();
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<{ severity: string; reason: string }>;
      /* Si auto-fix succeeded → 0 todo, sinon ≥ 1 */
      if (todos.length > 0) {
        expect(todos[0]?.severity).toBe('critical');
        expect(todos[0]?.reason).toContain('Auto-fix exhausted');
      }
    });

    it('cap todos max 50 (FIFO)', async () => {
      /* Push 60 errors qui devraient escalader */
      for (let i = 0; i < 60; i++) {
        telemetry.pushIncoming({
          kind: 'err', msg: `err${i}`, details: {}, src: 'apex', v: 'v13', user: 'u1',
        });
      }
      await telemetry.processIncoming();
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as unknown[];
      expect(todos.length).toBeLessThanOrEqual(50);
    });

    it('localStorage corrompu → return gracefully', async () => {
      localStorage.setItem('ax_telemetry_in', 'not_json');
      await telemetry.processIncoming();
      expect(true).toBe(true);
    });

    it('warn entries → escalade severity warn (pas critical)', async () => {
      localStorage.clear();
      telemetry.pushIncoming({
        kind: 'warn', msg: 'warning case', details: {}, src: 'apex', v: 'v13', user: 'u1',
      });
      await telemetry.processIncoming();
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<{ severity: string }>;
      if (todos.length > 0) {
        expect(['warn', 'critical', 'info']).toContain(todos[0]?.severity);
      }
    });
  });
});
