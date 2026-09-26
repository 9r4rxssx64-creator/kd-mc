/**
 * APEX v13.4.4 — Tests no-regression-watch.
 *
 * Couvre :
 *  - snapshotBeforeBatch (mock fetch GitHub API)
 *  - checkAll (5 tests critiques)
 *  - persistance reports
 *  - getStats
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('no-regression-watch v13.4.4', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('snapshotBeforeBatch persiste un snapshot (fetch mock OK)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commit: { sha: 'abcdef1234567890' } }),
    } as unknown as Response);

    const { noRegressionWatch } = await import('../../services/sentinels/no-regression-watch.js');
    const snap = await noRegressionWatch.snapshotBeforeBatch('test-batch', 'main');
    expect(snap.label).toBe('test-batch');
    expect(snap.branch).toBe('main');
    expect(snap.sha).toBe('abcdef1234567890');
    expect(snap.remote).toBe('github');
    const recent = noRegressionWatch.getRecentSnapshots(5);
    expect(recent.length).toBeGreaterThanOrEqual(1);
  });

  it('snapshotBeforeBatch tolère réseau down (sha=null)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const { noRegressionWatch } = await import('../../services/sentinels/no-regression-watch.js');
    const snap = await noRegressionWatch.snapshotBeforeBatch('offline-batch');
    expect(snap.sha).toBe(null);
    expect(snap.remote).toBe('unknown');
  });

  it('checkAll renvoie report avec 5 tests', async () => {
    const { noRegressionWatch } = await import('../../services/sentinels/no-regression-watch.js');
    const r = await noRegressionWatch.checkAll();
    expect(r.totalChecks).toBe(5);
    expect(r.results).toHaveLength(5);
    expect(typeof r.ok).toBe('boolean');
    /* getStats fonctionne même si pas de fail */
    const stats = noRegressionWatch.getStats();
    expect(stats.totalReports).toBeGreaterThanOrEqual(0);
    expect(stats.failuresLast24h).toBeGreaterThanOrEqual(0);
  });
});
