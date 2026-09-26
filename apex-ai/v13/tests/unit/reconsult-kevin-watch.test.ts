/**
 * APEX v13 — Tests Reconsult Kevin Watch (Sprint 13.3.71 reconsultation auto docs).
 *
 * Couvre :
 * - Hash content stable
 * - Fetch + cache initial (status 'new')
 * - Re-run sans changement → status 'unchanged'
 * - Re-run avec changement (mock fetch return new content) → status 'updated' + lesson appended
 * - Fetch fail → status 'fetch_failed'
 * - Log persistance + cap
 * - Reset
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reconsultKevinWatch } from '../../services/sentinels/reconsult-kevin-watch.js';

function mockTextResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

/**
 * Mock fetch retournant un nouveau Response à chaque appel (Response body
 * consumable une seule fois → mockResolvedValue qui retourne la même instance
 * casse au 2e read). Cette factory crée une instance fraîche par invocation.
 */
function mockFetchAlways(text: string, status = 200): () => Promise<Response> {
  return async () => mockTextResponse(text, status);
}

describe('reconsult-kevin-watch — refetch CLAUDE.md & co', () => {
  beforeEach(() => {
    localStorage.clear();
    reconsultKevinWatch.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hashContent', () => {
    it('hash identique pour même contenu', async () => {
      const h1 = await reconsultKevinWatch.hashContent('hello world');
      const h2 = await reconsultKevinWatch.hashContent('hello world');
      expect(h1).toBe(h2);
      expect(h1.length).toBeGreaterThan(8);
    });

    it('hash différent pour contenus différents', async () => {
      const h1 = await reconsultKevinWatch.hashContent('hello world');
      const h2 = await reconsultKevinWatch.hashContent('hello world!');
      expect(h1).not.toBe(h2);
    });
  });

  describe('runOnce — initial fetch', () => {
    it('1er run = tous docs marqués "new", cache populé', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('# CLAUDE.md\nrègle test'));
      const result = await reconsultKevinWatch.runOnce();
      expect(result.updated_count).toBeGreaterThan(0);
      expect(result.changes.every((c) => c.status === 'new' || c.status === 'fetch_failed')).toBe(true);
      const newDocs = result.changes.filter((c) => c.status === 'new');
      expect(newDocs.length).toBeGreaterThan(0);
    });

    it('1er run écrit cache localStorage (apex_v13_docs_cache)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('contenu test'));
      await reconsultKevinWatch.runOnce();
      const raw = localStorage.getItem('apex_v13_docs_cache');
      expect(raw).not.toBeNull();
      const cache = JSON.parse(raw!) as Record<string, { content: string; hash?: string }>;
      const docNames = Object.keys(cache);
      expect(docNames.length).toBeGreaterThan(0);
      expect(cache[docNames[0]!]?.hash).toBeDefined();
    });
  });

  describe('runOnce — diff detection', () => {
    it('2 runs identiques → 2e marque tous "unchanged"', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('contenu identique'));
      await reconsultKevinWatch.runOnce();
      const result2 = await reconsultKevinWatch.runOnce();
      const unchanged = result2.changes.filter((c) => c.status === 'unchanged').length;
      expect(unchanged).toBeGreaterThan(0);
      expect(result2.updated_count).toBe(0);
    });

    it('Contenu changé entre 2 runs → status "updated" + excerpt + lesson appended', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('# CLAUDE.md\nv1'));
      await reconsultKevinWatch.runOnce();
      vi.restoreAllMocks();

      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('# CLAUDE.md\nv2 nouvelle règle'));
      const result = await reconsultKevinWatch.runOnce();
      const updated = result.changes.filter((c) => c.status === 'updated');
      expect(updated.length).toBeGreaterThan(0);
      /* Lesson appended */
      const lessonsRaw = localStorage.getItem('ax_lessons_learned_struct');
      expect(lessonsRaw).not.toBeNull();
      const lessons = JSON.parse(lessonsRaw!) as Array<{ category: string }>;
      const reconsultLessons = lessons.filter((l) => l.category === 'docs-update');
      expect(reconsultLessons.length).toBeGreaterThan(0);
    });

    it('Fetch fail (network err) → status "fetch_failed"', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
      const result = await reconsultKevinWatch.runOnce();
      expect(result.failed_count).toBeGreaterThan(0);
      expect(result.changes.every((c) => c.status === 'fetch_failed')).toBe(true);
    });
  });

  describe('log persistence', () => {
    it('Chaque runOnce ajoute entry dans ax_reconsult_log', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('test'));
      await reconsultKevinWatch.runOnce();
      await reconsultKevinWatch.runOnce();
      const log = reconsultKevinWatch.getLog();
      expect(log.length).toBe(2);
    });

    it('getLastRun retourne snapshot dernier run', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('test'));
      await reconsultKevinWatch.runOnce();
      const last = reconsultKevinWatch.getLastRun();
      expect(last).not.toBeNull();
      expect(last?.changes.length).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('reset clear lastRun + log', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchAlways('test'));
      await reconsultKevinWatch.runOnce();
      reconsultKevinWatch.reset();
      expect(reconsultKevinWatch.getLastRun()).toBeNull();
      expect(reconsultKevinWatch.getLog().length).toBe(0);
    });
  });
});
