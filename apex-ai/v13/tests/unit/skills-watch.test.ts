/**
 * APEX v13 — Tests skills-watch.ts (CDN + MCP sentinelles).
 *
 * Couvre skillsWatch() probe CDN, mcpHealthWatch() ping MCP servers,
 * severity calculée, cap reports, start/stop intervals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const auditRecordMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: (...args: unknown[]) => auditRecordMock(...args) },
}));

const mcpListMock = vi.fn();
vi.mock('../../services/ai/mcp-registry.js', () => ({
  mcpRegistry: { list: () => mcpListMock() },
}));

const mcpHealthMock = vi.fn();
vi.mock('../../services/ai/mcp-client.js', () => ({
  mcpClient: { healthCheck: (...args: unknown[]) => mcpHealthMock(...args) },
}));

import { skillsWatch } from '../../services/sentinels/skills-watch.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  skillsWatch.stop();
  /* Reset reports via private field */
  (skillsWatch as unknown as { reports: unknown[] }).reports = [];
});

afterEach(() => {
  skillsWatch.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('skills-watch — skillsWatch() CDN probe', () => {
  it('tous CDN OK → severity ok + message succès', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const report = await skillsWatch.skillsWatch();
    expect(report.severity).toBe('ok');
    expect(report.message).toContain('Tous CDN OK');
    expect((report.details as { alive: string[] }).alive.length).toBeGreaterThan(0);
    expect((report.details as { dead: string[] }).dead.length).toBe(0);
  });

  it('1 CDN down sur 5 → severity warn', async () => {
    let count = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        count += 1;
        return count === 1 ? Promise.resolve({ ok: false }) : Promise.resolve({ ok: true });
      }),
    );
    const report = await skillsWatch.skillsWatch();
    expect(report.severity).toBe('warn');
    expect((report.details as { dead: string[] }).dead.length).toBe(1);
  });

  it('tous CDN down → severity critical', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const report = await skillsWatch.skillsWatch();
    expect(report.severity).toBe('critical');
    expect((report.details as { dead: string[] }).dead.length).toBeGreaterThan(0);
  });

  it('fetch reject (network down) → CDN compté comme dead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network fail')));
    const report = await skillsWatch.skillsWatch();
    expect((report.details as { dead: string[] }).dead.length).toBeGreaterThan(0);
  });

  it('dead > 0 → auditLog.record appelé', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await skillsWatch.skillsWatch();
    expect(auditRecordMock).toHaveBeenCalledWith(
      'skills-watch.cdn-down',
      expect.objectContaining({ details: expect.objectContaining({ dead: expect.any(Array) }) }),
    );
  });

  it('aucun dead → auditLog.record PAS appelé', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await skillsWatch.skillsWatch();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });
});

describe('skills-watch — mcpHealthWatch()', () => {
  it('aucun MCP server → ok + 0/0', async () => {
    mcpListMock.mockReturnValue([]);
    const report = await skillsWatch.mcpHealthWatch();
    expect(report.severity).toBe('ok');
    expect((report.details as { alive: string[] }).alive.length).toBe(0);
  });

  it('tous MCP alive → severity ok', async () => {
    mcpListMock.mockReturnValue([{ id: 's1' }, { id: 's2' }]);
    mcpHealthMock.mockResolvedValue({ alive: true });
    const report = await skillsWatch.mcpHealthWatch();
    expect(report.severity).toBe('ok');
    expect((report.details as { alive: string[] }).alive).toEqual(['s1', 's2']);
  });

  it('1 MCP dead sur 4 → severity warn', async () => {
    mcpListMock.mockReturnValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    let n = 0;
    mcpHealthMock.mockImplementation(() => {
      n += 1;
      return Promise.resolve({ alive: n !== 1 });
    });
    const report = await skillsWatch.mcpHealthWatch();
    expect(report.severity).toBe('warn');
    expect((report.details as { dead: string[] }).dead).toEqual(['a']);
  });

  it('tous MCP dead → critical', async () => {
    mcpListMock.mockReturnValue([{ id: 'a' }, { id: 'b' }]);
    mcpHealthMock.mockResolvedValue({ alive: false });
    const report = await skillsWatch.mcpHealthWatch();
    expect(report.severity).toBe('critical');
  });

  it('healthCheck throw → server compté dead', async () => {
    mcpListMock.mockReturnValue([{ id: 'failing' }]);
    mcpHealthMock.mockRejectedValue(new Error('Timeout'));
    const report = await skillsWatch.mcpHealthWatch();
    expect((report.details as { dead: string[] }).dead).toContain('failing');
  });

  it('mcp dead > 0 → auditLog.record appelé', async () => {
    mcpListMock.mockReturnValue([{ id: 'x' }]);
    mcpHealthMock.mockResolvedValue({ alive: false });
    await skillsWatch.mcpHealthWatch();
    expect(auditRecordMock).toHaveBeenCalledWith(
      'mcp-health-watch.dead',
      expect.any(Object),
    );
  });
});

describe('skills-watch — reports storage', () => {
  it('recordReport accumule + cap 100', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    for (let i = 0; i < 120; i++) {
      await skillsWatch.skillsWatch();
    }
    expect(skillsWatch.getReports().length).toBeLessThanOrEqual(100);
  });

  it('getLastReport renvoie le plus récent par watch_id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    mcpListMock.mockReturnValue([]);
    await skillsWatch.skillsWatch();
    await skillsWatch.mcpHealthWatch();
    expect(skillsWatch.getLastReport('skills-watch')?.watch_id).toBe('skills-watch');
    expect(skillsWatch.getLastReport('mcp-health-watch')?.watch_id).toBe('mcp-health-watch');
  });

  it('getLastReport vide → null', () => {
    expect(skillsWatch.getLastReport('skills-watch')).toBeNull();
  });
});

describe('skills-watch — start/stop', () => {
  it('start lance les sentinelles + premier tick immédiat', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    mcpListMock.mockReturnValue([]);
    const spy = vi.spyOn(window, 'setInterval');
    skillsWatch.start();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('start idempotent (2× ne dédouble pas)', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    mcpListMock.mockReturnValue([]);
    const spy = vi.spyOn(window, 'setInterval');
    skillsWatch.start();
    skillsWatch.start();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('stop clear les intervals', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    mcpListMock.mockReturnValue([]);
    skillsWatch.start();
    const spy = vi.spyOn(window, 'clearInterval');
    skillsWatch.stop();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('stop sans start ne crash pas', () => {
    expect(() => skillsWatch.stop()).not.toThrow();
  });
});
