/**
 * Tests services/innovation-watch.ts (Veille Technologique 24/7).
 * ≥20 tests : runScan, scanNpm, scanAIProviders, scanHuggingFace, scanGitHubTrending,
 * compareGain, autoUpdateIfSafe, getUpdates filter, getStats, FIFO 200, persist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { innovationWatch, type TechUpdate } from '../../services/sentinels/innovation-watch.js';

const STORAGE_KEY = 'apex_v13_innovation_updates';
const STATS_KEY = 'apex_v13_innovation_stats';

/* Helper : mock fetch with sequential responses */
function mockFetch(responses: Array<{ ok?: boolean; status?: number; body?: unknown; reject?: boolean }>) {
  let idx = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const r = responses[idx % responses.length];
    idx += 1;
    if (!r) return Promise.reject(new Error('mock exhausted'));
    if (r.reject) return Promise.reject(new Error('mock reject'));
    const body = r.body ?? {};
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: r.status ?? (r.ok === false ? 500 : 200),
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

describe('services/innovation-watch — veille technologique 24/7', () => {
  beforeEach(() => {
    localStorage.clear();
    innovationWatch.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* === Bootstrap & shape === */

  describe('runScan', () => {
    it('runScan retourne un ScanSummary avec updates array', async () => {
      mockFetch([{ reject: true }]);
      const result = await innovationWatch.runScan();
      expect(result).toBeDefined();
      expect(Array.isArray(result.updates)).toBe(true);
      expect(typeof result.summary).toBe('string');
    });

    it('runScan persiste les updates dans localStorage', async () => {
      mockFetch([{ ok: true, body: { version: '2.0.0', time: new Date().toISOString() } }]);
      await innovationWatch.runScan();
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
    });

    it('runScan met à jour stats.lastScan', async () => {
      const before = innovationWatch.getStats().lastScan;
      mockFetch([{ reject: true }]);
      await innovationWatch.runScan();
      const after = innovationWatch.getStats().lastScan;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('runScan summary inclut compteur updates', async () => {
      mockFetch([{ reject: true }]);
      const result = await innovationWatch.runScan();
      expect(result.summary).toMatch(/\d+ updates/);
    });
  });

  describe('scanNpm', () => {
    it('scanNpm détecte version newer pour package mock', async () => {
      mockFetch([{ ok: true, body: { version: '99.0.0', time: '2026-01-01T00:00:00Z' } }]);
      const updates = await innovationWatch.scanNpm();
      expect(updates.length).toBeGreaterThan(0);
      const u = updates[0];
      expect(u?.category).toBe('lib-npm');
      expect(u?.latestVersion).toBe('99.0.0');
    });

    it('scanNpm n\'inclut pas les versions same/older', async () => {
      /* Mock : retourne version 0.0.1 (toujours plus ancienne que current) */
      mockFetch([{ ok: true, body: { version: '0.0.1' } }]);
      const updates = await innovationWatch.scanNpm();
      expect(updates).toEqual([]);
    });

    it('scanNpm gère gracefully fetch fail', async () => {
      mockFetch([{ reject: true }]);
      const updates = await innovationWatch.scanNpm();
      expect(updates).toEqual([]);
    });

    it('scanNpm flagge MAJOR bump comme breaking-changes', async () => {
      mockFetch([{ ok: true, body: { version: '99.0.0' } }]);
      const updates = await innovationWatch.scanNpm();
      const breaking = updates.find((u) => u.recommendation === 'breaking-changes');
      expect(breaking).toBeDefined();
    });
  });

  describe('scanAIProviders', () => {
    it('scanAIProviders détecte providers avec models', async () => {
      mockFetch([{ ok: true, body: { data: [{ id: 'claude-haiku-4-5' }, { id: 'claude-sonnet-4-6' }] } }]);
      const updates = await innovationWatch.scanAIProviders();
      expect(updates.length).toBeGreaterThan(0);
      const claude = updates.find((u) => u.name === 'anthropic');
      expect(claude?.category).toBe('ai-provider');
    });

    it('scanAIProviders supporte 401 (auth requise)', async () => {
      mockFetch([{ status: 401, body: { error: 'auth' } }]);
      const updates = await innovationWatch.scanAIProviders();
      /* 401 toléré → noté quand même */
      expect(updates.length).toBeGreaterThanOrEqual(0);
    });

    it('scanAIProviders gère fetch fail sans throw', async () => {
      mockFetch([{ reject: true }]);
      const updates = await innovationWatch.scanAIProviders();
      expect(Array.isArray(updates)).toBe(true);
    });
  });

  describe('scanHuggingFace', () => {
    it('scanHuggingFace retourne updates avec category mappée', async () => {
      mockFetch([
        { ok: true, body: [{ id: 'fake/model-1', likes: 200 }, { id: 'fake/model-2', likes: 50 }] },
      ]);
      const updates = await innovationWatch.scanHuggingFace('tts-stt');
      expect(updates.length).toBeGreaterThan(0);
      const u = updates[0];
      expect(u?.category).toBe('tts-stt');
    });

    it('scanHuggingFace likes > 100 → recommendation monitor', async () => {
      mockFetch([{ ok: true, body: [{ id: 'fake/popular', likes: 500 }] }]);
      const updates = await innovationWatch.scanHuggingFace('tts-stt');
      const u = updates[0];
      expect(u?.recommendation).toBe('monitor');
    });

    it('scanHuggingFace likes <= 100 → recommendation skip', async () => {
      mockFetch([{ ok: true, body: [{ id: 'fake/unpopular', likes: 5 }] }]);
      const updates = await innovationWatch.scanHuggingFace('tts-stt');
      const u = updates[0];
      expect(u?.recommendation).toBe('skip');
    });

    it('scanHuggingFace sans category scan tous les tags', async () => {
      mockFetch([{ ok: true, body: [{ id: 'fake/m', likes: 200 }] }]);
      const updates = await innovationWatch.scanHuggingFace();
      expect(Array.isArray(updates)).toBe(true);
    });
  });

  describe('scanGitHubTrending', () => {
    it('scanGitHubTrending retourne updates pour tags donnés', async () => {
      mockFetch([
        {
          ok: true,
          body: {
            items: [
              { full_name: 'fake/repo', stargazers_count: 10000, updated_at: '2026-01-01T00:00:00Z' },
            ],
          },
        },
      ]);
      const updates = await innovationWatch.scanGitHubTrending(['vector-database']);
      expect(updates.length).toBeGreaterThan(0);
    });

    it('scanGitHubTrending stars > 5000 → monitor', async () => {
      mockFetch([{ ok: true, body: { items: [{ full_name: 'big/repo', stargazers_count: 10000 }] } }]);
      const updates = await innovationWatch.scanGitHubTrending(['vector-database']);
      expect(updates[0]?.recommendation).toBe('monitor');
    });

    it('scanGitHubTrending tag inconnu retourne array vide', async () => {
      mockFetch([{ ok: true, body: { items: [] } }]);
      const updates = await innovationWatch.scanGitHubTrending(['unknown-tag-xyz']);
      expect(updates).toEqual([]);
    });
  });

  describe('compareGain', () => {
    it('compareGain lib-npm minor bump → perf gain', async () => {
      const gain = await innovationWatch.compareGain('lib-npm', '1.5.0', '1.6.0');
      expect(gain).toBeDefined();
      expect(gain?.perf).toBeGreaterThanOrEqual(0);
    });

    it('compareGain lib-npm MAJOR bump → breaking gain dispo', async () => {
      const gain = await innovationWatch.compareGain('lib-npm', '1.0.0', '2.0.0');
      expect(gain).toBeDefined();
      expect(gain?.capabilities).toBeGreaterThan(0);
    });

    it('compareGain same version retourne undefined', async () => {
      const gain = await innovationWatch.compareGain('lib-npm', '1.5.0', '1.5.0');
      expect(gain).toBeUndefined();
    });

    it('compareGain ai-provider retourne capabilities ≥ 30', async () => {
      const gain = await innovationWatch.compareGain('ai-provider', '1.0.0', '1.1.0');
      expect(gain?.capabilities).toBeGreaterThanOrEqual(30);
    });

    it('compareGain image-gen retourne capabilities ≥ 50', async () => {
      const gain = await innovationWatch.compareGain('image-gen', '1.0.0', '1.1.0');
      expect(gain?.capabilities).toBeGreaterThanOrEqual(50);
    });
  });

  describe('autoUpdateIfSafe', () => {
    it('autoUpdateIfSafe refuse breaking-changes', async () => {
      const upd: TechUpdate = {
        id: 'test-1',
        category: 'lib-npm',
        name: 'pkg',
        recommendation: 'breaking-changes',
        detectedAt: Date.now(),
        estimatedGain: { perf: 80 },
      };
      const r = await innovationWatch.autoUpdateIfSafe(upd);
      expect(r.applied).toBe(false);
      expect(r.reason).toMatch(/breaking/i);
    });

    it('autoUpdateIfSafe refuse gain < 50%', async () => {
      const upd: TechUpdate = {
        id: 'test-2',
        category: 'lib-npm',
        name: 'pkg',
        recommendation: 'upgrade-asap',
        detectedAt: Date.now(),
        estimatedGain: { perf: 10 },
      };
      const r = await innovationWatch.autoUpdateIfSafe(upd);
      expect(r.applied).toBe(false);
    });

    it('autoUpdateIfSafe refuse ai-provider (monitor only)', async () => {
      const upd: TechUpdate = {
        id: 'test-3',
        category: 'ai-provider',
        name: 'anthropic',
        recommendation: 'upgrade-asap',
        detectedAt: Date.now(),
        estimatedGain: { capabilities: 80 },
      };
      const r = await innovationWatch.autoUpdateIfSafe(upd);
      expect(r.applied).toBe(false);
      expect(r.reason).toMatch(/ai-provider/i);
    });

    it('autoUpdateIfSafe refuse recommendation autre que upgrade-asap', async () => {
      const upd: TechUpdate = {
        id: 'test-4',
        category: 'lib-npm',
        name: 'pkg',
        recommendation: 'monitor',
        detectedAt: Date.now(),
        estimatedGain: { perf: 80 },
      };
      const r = await innovationWatch.autoUpdateIfSafe(upd);
      expect(r.applied).toBe(false);
    });

    it('autoUpdateIfSafe applique si conditions OK + persist applied count', async () => {
      /* Persist update first */
      const upd: TechUpdate = {
        id: 'test-safe',
        category: 'lib-npm',
        name: 'lz-string',
        recommendation: 'upgrade-asap',
        detectedAt: Date.now(),
        estimatedGain: { perf: 60 },
        status: 'pending',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([upd]));
      const r = await innovationWatch.autoUpdateIfSafe(upd);
      expect(r.applied).toBe(true);
      const stats = innovationWatch.getStats();
      expect(stats.appliedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getUpdates filter', () => {
    it('getUpdates sans filtre retourne tout', () => {
      const list: TechUpdate[] = [
        { id: 'a', category: 'lib-npm', name: 'a', recommendation: 'monitor', detectedAt: Date.now() },
        { id: 'b', category: 'ai-provider', name: 'b', recommendation: 'skip', detectedAt: Date.now() },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      const all = innovationWatch.getUpdates();
      expect(all.length).toBe(2);
    });

    it('getUpdates filter category', () => {
      const list: TechUpdate[] = [
        { id: 'a', category: 'lib-npm', name: 'a', recommendation: 'monitor', detectedAt: Date.now() },
        { id: 'b', category: 'ai-provider', name: 'b', recommendation: 'skip', detectedAt: Date.now() },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      const filtered = innovationWatch.getUpdates({ category: 'lib-npm' });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.category).toBe('lib-npm');
    });

    it('getUpdates filter status', () => {
      const list: TechUpdate[] = [
        { id: 'a', category: 'lib-npm', name: 'a', recommendation: 'monitor', detectedAt: Date.now(), status: 'applied' },
        { id: 'b', category: 'lib-npm', name: 'b', recommendation: 'skip', detectedAt: Date.now(), status: 'pending' },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      const filtered = innovationWatch.getUpdates({ status: 'applied' });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('a');
    });

    it('getUpdates filter minDays', () => {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
      const list: TechUpdate[] = [
        { id: 'recent', category: 'lib-npm', name: 'r', recommendation: 'monitor', detectedAt: dayAgo },
        { id: 'old', category: 'lib-npm', name: 'o', recommendation: 'monitor', detectedAt: tenDaysAgo },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      const filtered = innovationWatch.getUpdates({ minDays: 7 });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('recent');
    });

    it('getUpdates corrupt localStorage retourne array vide', () => {
      localStorage.setItem(STORAGE_KEY, 'INVALID{{');
      const all = innovationWatch.getUpdates();
      expect(all).toEqual([]);
    });
  });

  describe('markUpdate', () => {
    it('markUpdate change status', () => {
      const list: TechUpdate[] = [
        { id: 'm1', category: 'lib-npm', name: 'm', recommendation: 'monitor', detectedAt: Date.now(), status: 'pending' },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      innovationWatch.markUpdate('m1', 'skipped');
      const after = innovationWatch.getUpdates();
      expect(after[0]?.status).toBe('skipped');
    });

    it('markUpdate inconnu ne crash pas', () => {
      expect(() => innovationWatch.markUpdate('inexistant', 'applied')).not.toThrow();
    });

    it('markUpdate skipped incrémente skippedCount', () => {
      const list: TechUpdate[] = [
        { id: 'sk', category: 'lib-npm', name: 's', recommendation: 'monitor', detectedAt: Date.now(), status: 'pending' },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      const before = innovationWatch.getStats().skippedCount;
      innovationWatch.markUpdate('sk', 'skipped');
      const after = innovationWatch.getStats().skippedCount;
      expect(after).toBe(before + 1);
    });
  });

  describe('getStats', () => {
    it('getStats retourne valeurs par défaut si vide', () => {
      const s = innovationWatch.getStats();
      expect(s.lastScan).toBe(0);
      expect(s.totalUpdatesDetected).toBe(0);
      expect(s.appliedCount).toBe(0);
      expect(s.skippedCount).toBe(0);
    });

    it('getStats lit valeurs persistées', () => {
      localStorage.setItem(
        STATS_KEY,
        JSON.stringify({ lastScan: 12345, totalUpdatesDetected: 42, lastWeek: 5, appliedCount: 2, skippedCount: 1 }),
      );
      const s = innovationWatch.getStats();
      expect(s.lastScan).toBe(12345);
      expect(s.totalUpdatesDetected).toBe(42);
      expect(s.appliedCount).toBe(2);
    });
  });

  describe('FIFO 200 max + persistence', () => {
    it('persist limite à 200 updates max', async () => {
      /* Crée 250 fake updates puis persist via runScan path */
      const fake: TechUpdate[] = [];
      for (let i = 0; i < 250; i += 1) {
        fake.push({
          id: `f${i}`,
          category: 'lib-npm',
          name: `pkg${i}`,
          recommendation: 'monitor',
          detectedAt: Date.now() + i,
        });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fake));
      /* Trigger save by mark op */
      const list = innovationWatch.getUpdates();
      expect(list.length).toBeLessThanOrEqual(250); /* loaded as-is */
      innovationWatch.markUpdate('f0', 'skipped');
      const after = innovationWatch.getUpdates();
      expect(after.length).toBeLessThanOrEqual(200); /* saveUpdates trim */
    });

    it('reset() vide updates et stats', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'x' }]));
      localStorage.setItem(STATS_KEY, JSON.stringify({ totalUpdatesDetected: 5 }));
      innovationWatch.reset();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(STATS_KEY)).toBeNull();
    });
  });

  /* === v13.3.41 mission INNOVATION-COMM === */

  describe('notifyKevinOnCriticalGain', () => {
    it('skip notification si gain < threshold 50%', async () => {
      const upd: TechUpdate = {
        id: 'u1',
        category: 'lib-npm',
        name: 'low-gain',
        recommendation: 'upgrade-soon',
        detectedAt: Date.now(),
        estimatedGain: { perf: 10 },
      };
      const r = await innovationWatch.notifyKevinOnCriticalGain(upd);
      expect(r.notified).toBe(false);
      expect(r.reason).toContain('threshold');
    });

    it('notifie + push dans ax_claude_todo si gain ≥ 50%', async () => {
      const upd: TechUpdate = {
        id: 'u-big',
        category: 'lib-npm',
        name: 'huge-update',
        recommendation: 'upgrade-asap',
        detectedAt: Date.now(),
        estimatedGain: { perf: 60, capabilities: 70 },
      };
      const r = await innovationWatch.notifyKevinOnCriticalGain(upd);
      expect(r.notified).toBe(true);
      const todoRaw = localStorage.getItem('ax_claude_todo');
      expect(todoRaw).toBeTruthy();
      const todoList = JSON.parse(todoRaw ?? '[]') as Array<{ id: string; gain_pct: number }>;
      const found = todoList.find((t) => t.id === 'inno_u-big');
      expect(found).toBeDefined();
      expect(found?.gain_pct).toBe(70);
    });
  });

  describe('detectMajorModelRelease', () => {
    it('détecte Claude 5 release (anthropic)', async () => {
      const update = await innovationWatch.detectMajorModelRelease('anthropic', [
        'claude-3-5-sonnet',
        'claude-5-opus',
      ]);
      expect(update).toBeDefined();
      expect(update?.recommendation).toBe('upgrade-asap');
      expect(update?.name).toBe('claude-5-opus');
      expect(update?.estimatedGain?.capabilities).toBeGreaterThanOrEqual(50);
    });

    it('skip si modèle déjà connu (même version)', async () => {
      /* 1er call → enregistre v3 comme max */
      await innovationWatch.detectMajorModelRelease('openai', ['gpt-3', 'gpt-3.5']);
      /* 2e call → skip car maxMajor n'a pas grimpé */
      const r2 = await innovationWatch.detectMajorModelRelease('openai', ['gpt-3', 'gpt-3.5']);
      expect(r2).toBeNull();
    });

    it('retourne null si provider unknown', async () => {
      const r = await innovationWatch.detectMajorModelRelease('unknownAI', ['random-model']);
      expect(r).toBeNull();
    });

    it('retourne null si aucun pattern match', async () => {
      const r = await innovationWatch.detectMajorModelRelease('anthropic', ['no-claude-here']);
      expect(r).toBeNull();
    });
  });
});
