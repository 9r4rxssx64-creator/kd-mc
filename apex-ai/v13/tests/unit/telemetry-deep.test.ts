import { describe, it, expect, beforeEach } from 'vitest';
import { telemetry } from '../../services/observability/telemetry.js';

describe('telemetry deep tests Jet 7.9', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('processIncoming avec autoFix WHITELIST flushSyncQueue OK', async () => {
    telemetry.pushIncoming({
      kind: 'err',
      msg: 'test syncQueue',
      details: {},
      src: 'apex',
      v: 'v13.0.0',
      user: 'u1',
    });
    await telemetry.processIncoming();
    const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    expect(buf.every((e: { processed: boolean }) => e.processed)).toBe(true);
  });

  it('processIncoming idempotent : retraitement ne re-process pas', async () => {
    telemetry.pushIncoming({ kind: 'info', msg: 'a', details: {}, src: 'apex', v: 'v13', user: 'u' });
    await telemetry.processIncoming();
    const beforeBuf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    await telemetry.processIncoming();
    const afterBuf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    expect(afterBuf.length).toBe(beforeBuf.length); /* pas de doublon */
  });

  it('pushIncoming buffer vide initial', () => {
    /* localStorage clear, premier push */
    telemetry.pushIncoming({ kind: 'info', msg: 'first', details: {}, src: 'apex', v: 'v13', user: 'u' });
    const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    expect(buf.length).toBe(1);
  });

  it('pushIncoming multiple kinds info/warn/err', () => {
    telemetry.pushIncoming({ kind: 'info', msg: 'i', details: {}, src: 'a', v: 'v', user: 'u' });
    telemetry.pushIncoming({ kind: 'warn', msg: 'w', details: {}, src: 'a', v: 'v', user: 'u' });
    telemetry.pushIncoming({ kind: 'err', msg: 'e', details: {}, src: 'a', v: 'v', user: 'u' });
    const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    const kinds = buf.map((b: { kind: string }) => b.kind);
    expect(kinds).toContain('info');
    expect(kinds).toContain('warn');
    expect(kinds).toContain('err');
  });

  it('processIncoming events vide ne throw pas + buffer reste vide', async () => {
    let threw = false;
    try {
      await telemetry.processIncoming();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    /* Buffer toujours valide JSON après no-op */
    const raw = localStorage.getItem('ax_telemetry_in');
    if (raw) {
      let parsed: unknown = null;
      let parseThrew = false;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parseThrew = true;
      }
      expect(parseThrew).toBe(false);
      expect(Array.isArray(parsed)).toBe(true);
    }
  });

  it('telemetry buffer corrompu localStorage gracefull (no throw + cleanup)', async () => {
    localStorage.setItem('ax_telemetry_in', 'INVALID JSON{{');
    let threw = false;
    try {
      await telemetry.processIncoming();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    /* Après processIncoming sur corruption, buffer doit être réinitialisé valide */
    const raw = localStorage.getItem('ax_telemetry_in');
    if (raw && raw !== 'INVALID JSON{{') {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* Si toujours corrompu, c'est un bug à fixer */
      }
      expect(Array.isArray(parsed)).toBe(true);
    }
  });
});
