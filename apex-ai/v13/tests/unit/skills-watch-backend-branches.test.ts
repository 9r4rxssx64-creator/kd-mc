/**
 * skills-watch.getLastReport + backend !res.ok — couverture branches (campagne 100%, 2026-06-02).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { skillsWatch } from '../../services/sentinels/skills-watch.js';
import { backend } from '../../services/integrations/backend.js';

const sw = skillsWatch as unknown as { reports: unknown[] };
let snap: unknown[];

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); snap = [...sw.reports]; });
afterEach(() => { vi.restoreAllMocks(); sw.reports = [...snap]; });

describe('skills-watch — getLastReport', () => {
  it('aucun report pour ce watchId → null', () => {
    sw.reports = [];
    expect(skillsWatch.getLastReport('skills-watch')).toBeNull();
  });

  it('report présent → dernier report du watchId', () => {
    sw.reports = [
      { watch_id: 'skills-watch', severity: 'ok', message: 'a', ts: 1 },
      { watch_id: 'mcp-health-watch', severity: 'ok', message: 'm', ts: 2 },
      { watch_id: 'skills-watch', severity: 'warn', message: 'b', ts: 3 },
    ];
    const r = skillsWatch.getLastReport('skills-watch');
    expect(r?.message).toBe('b');
    expect(skillsWatch.getLastReport('mcp-health-watch')?.message).toBe('m');
  });
});

describe('backend — call !res.ok', () => {
  it('HTTP non-ok → fallback:true', async () => {
    localStorage.setItem('apex_v13_backend_url', 'https://test.workers.dev');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('err', { status: 500 }),
    );
    const r = await backend.checkIdempotency('hash123');
    expect(r.fallback).toBe(true);
    spy.mockRestore();
  });

  it('non configuré (pas d\'URL) → fallback:true sans fetch', async () => {
    localStorage.removeItem('apex_v13_backend_url');
    expect(backend.isConfigured()).toBe(false);
    const r = await backend.checkIdempotency('h');
    expect(r.fallback).toBe(true);
  });
});
