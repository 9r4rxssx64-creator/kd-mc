/**
 * Tests search service v13.4.145 (Kevin "100/100 réel").
 *
 * Module : services/search.ts (276 lines, ~270 stmts, était 19.6% coverage).
 *
 * Stratégie : force fallback main-thread (jsdom n'a pas Worker fonctionnel
 * pour modules), tester Fuse.js direct.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { search } from '../../services/integrations/search.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('search service (v13.4.145 coverage)', () => {
  beforeEach(() => {
    /* Force fallback main-thread (jsdom Worker module imports fail) */
    search.cleanup();
    (search as unknown as { useFallback: boolean }).useFallback = true;
  });

  afterEach(() => {
    search.cleanup();
  });

  describe('index + search (fallback)', () => {
    it('indexe + retrouve docs simples', async () => {
      await search.index('docs', [
        { id: '1', text: 'Apex AI', tag: 'ai' },
        { id: '2', text: 'CMCteams', tag: 'casino' },
        { id: '3', text: 'Apex sentinels', tag: 'ai' },
      ]);
      const hits = await search.search('docs', 'apex');
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.some((h) => h.item.id === '1')).toBe(true);
    });

    it('retourne [] sur query vide', async () => {
      await search.index('docs', [{ id: '1', text: 'X' }]);
      const hits = await search.search('docs', '');
      expect(hits).toEqual([]);
    });

    it('retourne [] sur collection inexistante', async () => {
      const hits = await search.search('inconnue', 'query');
      expect(hits).toEqual([]);
    });

    it('respecte limit', async () => {
      const docs = Array.from({ length: 50 }, (_, i) => ({
        id: `d${i}`,
        text: `item ${i} apex`,
      }));
      await search.index('large', docs);
      const hits = await search.search('large', 'apex', 5);
      expect(hits.length).toBeLessThanOrEqual(5);
    });
  });

  describe('add (incremental)', () => {
    it('ajoute doc à collection existante', async () => {
      await search.index('items', [{ id: '1', text: 'first' }]);
      await search.add('items', { id: '2', text: 'second' });
      const hits = await search.search('items', 'second');
      expect(hits.some((h) => h.item.id === '2')).toBe(true);
    });

    it('met à jour doc si même id', async () => {
      await search.index('items', [{ id: '1', text: 'original' }]);
      await search.add('items', { id: '1', text: 'updated' });
      const hits = await search.search('items', 'updated');
      expect(hits.length).toBeGreaterThan(0);
    });

    it('crée collection si absent', async () => {
      await search.add('newcoll', { id: '1', text: 'first item' });
      const hits = await search.search('newcoll', 'first');
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  describe('remove', () => {
    it('retire un doc par id', async () => {
      await search.index('items', [
        { id: '1', text: 'apex' },
        { id: '2', text: 'cmc' },
      ]);
      const r = await search.remove('items', '1');
      expect(r.removed).toBe(true);
      expect(r.count).toBe(1);
    });

    it('retourne removed=false si doc absent', async () => {
      await search.index('items', [{ id: '1', text: 'apex' }]);
      const r = await search.remove('items', 'unknown');
      expect(r.removed).toBe(false);
    });

    it('retourne count=0 si collection inexistante', async () => {
      const r = await search.remove('absent', 'x');
      expect(r.count).toBe(0);
      expect(r.removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('vide collection existante', async () => {
      await search.index('items', [{ id: '1', text: 'x' }]);
      const r = await search.clear('items');
      expect(r.cleared).toBe(true);
      const hits = await search.search('items', 'x');
      expect(hits).toEqual([]);
    });

    it('retourne cleared=false si collection inexistante', async () => {
      const r = await search.clear('inexistante');
      expect(r.cleared).toBe(false);
    });
  });

  describe('isWorkerActive', () => {
    it('retourne false en fallback', () => {
      expect(search.isWorkerActive()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('cleanup vide tout sans throw', () => {
      expect(() => search.cleanup()).not.toThrow();
    });

    it('cleanup multiple fois ne crash pas', () => {
      search.cleanup();
      search.cleanup();
      expect(search.isWorkerActive()).toBe(false);
    });
  });

  describe('inferKeys (via index sans keys spécifiés)', () => {
    it('infère keys auto depuis premier doc', async () => {
      await search.index('auto', [
        { id: 'a', title: 'Mon titre', body: 'Mon contenu apex' },
      ]);
      const hits = await search.search('auto', 'titre');
      expect(hits.length).toBeGreaterThan(0);
    });

    it('ignore id field', async () => {
      await search.index('skip-id', [{ id: 'special_id_apex', text: 'content' }]);
      const hits = await search.search('skip-id', 'special_id');
      /* La recherche sur 'special_id' ne doit pas matcher (id ignoré) */
      expect(hits.length).toBe(0);
    });
  });
});
