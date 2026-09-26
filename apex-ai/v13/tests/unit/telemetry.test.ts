import { describe, it, expect, beforeEach } from 'vitest';
import { telemetry } from '../../services/observability/telemetry.js';

describe('telemetry service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('pushIncoming persiste dans ax_telemetry_in', () => {
    telemetry.pushIncoming({
      kind: 'err',
      msg: 'test error',
      details: {},
      src: 'apex',
      v: 'v13.0.0',
      user: 'u1',
    });
    const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    expect(buf.length).toBeGreaterThanOrEqual(1);
    expect(buf[0].msg).toBe('test error');
  });

  it('pushIncoming cap 200 entries', () => {
    for (let i = 0; i < 250; i++) {
      telemetry.pushIncoming({
        kind: 'info', msg: `m${i}`, details: {}, src: 'apex', v: 'v13.0.0', user: 'u',
      });
    }
    const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    expect(buf.length).toBeLessThanOrEqual(200);
  });

  it('processIncoming traite events et marque processed', async () => {
    telemetry.pushIncoming({
      kind: 'err', msg: 'process me', details: {}, src: 'cmcteams', v: 'v9.500', user: 'u',
    });
    await telemetry.processIncoming();
    const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    expect(buf.every((e: { processed: boolean }) => e.processed)).toBe(true);
  });
});
