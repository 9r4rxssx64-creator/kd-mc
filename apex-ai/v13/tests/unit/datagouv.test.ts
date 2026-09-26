/**
 * Tests datagouv connector v13.4.141 (Kevin "100/100 réel").
 *
 * Module : services/connectors/datagouv.ts (110 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataGouvConnector } from '../../services/connectors/datagouv.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const fakeDataset = {
  id: 'ds_1',
  title: 'Élections présidentielles 2024',
  slug: 'elections-2024',
  description: 'Résultats officiels',
  organization: { id: 'org_1', name: 'Intérieur', slug: 'interieur' },
  page: 'https://data.gouv.fr/datasets/elections-2024',
  uri: 'https://data.gouv.fr/api/datasets/ds_1',
  resources: [
    { id: 'r1', title: 'CSV', url: 'https://example.com/r1.csv', format: 'csv' },
  ],
  tags: ['elections'],
  created_at: '2024-01-01',
  last_modified: '2024-04-01',
};

describe('datagouv connector (v13.4.141 coverage)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchDatasets', () => {
    it('retourne résultats normalisés', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ total: 5, page: 1, page_size: 20, data: [fakeDataset] }),
          { status: 200 },
        ),
      );
      const r = await dataGouvConnector.searchDatasets('élections');
      expect(r.total).toBe(5);
      expect(r.datasets.length).toBe(1);
      expect(r.datasets[0]?.title).toBe('Élections présidentielles 2024');
    });

    it('respecte page + pageSize opts', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ total: 0, page: 3, page_size: 50, data: [] }), { status: 200 }),
      );
      await dataGouvConnector.searchDatasets('test', { page: 3, pageSize: 50 });
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('page=3');
      expect(url).toContain('page_size=50');
    });

    it('inclut tag dans query si fourni', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ total: 0, page: 1, page_size: 20, data: [] }), { status: 200 }),
      );
      await dataGouvConnector.searchDatasets('q', { tag: 'covid' });
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('tag=covid');
    });

    it('throw si HTTP erreur', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      await expect(dataGouvConnector.searchDatasets('test')).rejects.toThrow();
    });

    it('throw si fetch network fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      await expect(dataGouvConnector.searchDatasets('test')).rejects.toThrow();
    });
  });

  describe('getDataset', () => {
    it('retourne dataset par slug', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(fakeDataset), { status: 200 }),
      );
      const ds = await dataGouvConnector.getDataset('elections-2024');
      expect(ds.slug).toBe('elections-2024');
      expect(ds.title).toBe('Élections présidentielles 2024');
    });

    it('throw si dataset 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
      await expect(dataGouvConnector.getDataset('unknown')).rejects.toThrow();
    });
  });

  describe('searchOrganizations', () => {
    it('retourne liste organisations', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            total: 2,
            data: [
              { id: 'o1', name: 'Org1', slug: 'org1', description: 'd1', page: 'p1' },
              { id: 'o2', name: 'Org2', slug: 'org2', description: 'd2', page: 'p2' },
            ],
          }),
          { status: 200 },
        ),
      );
      const r = await dataGouvConnector.searchOrganizations('test');
      expect(r.total).toBe(2);
      expect(r.organizations.length).toBe(2);
    });

    it('throw si HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      await expect(dataGouvConnector.searchOrganizations('test')).rejects.toThrow();
    });
  });

  describe('getReuses', () => {
    it('retourne liste réutilisations', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: 'reuse1', title: 'App météo', url: 'https://x.fr', description: 'desc' }],
          }),
          { status: 200 },
        ),
      );
      const r = await dataGouvConnector.getReuses('ds_1');
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBe(1);
      expect(r[0]?.id).toBe('reuse1');
    });

    it('throw si HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      await expect(dataGouvConnector.getReuses('ds_x')).rejects.toThrow();
    });
  });

  describe('normalizeDataset (via searchDatasets)', () => {
    it('cap description à 2000 chars', async () => {
      const longDataset = { ...fakeDataset, description: 'x'.repeat(5000) };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ total: 1, page: 1, page_size: 20, data: [longDataset] }), { status: 200 }),
      );
      const r = await dataGouvConnector.searchDatasets('test');
      expect(r.datasets[0]?.description.length).toBe(2000);
    });

    it('cap resources à 10 max', async () => {
      const manyResources = {
        ...fakeDataset,
        resources: Array.from({ length: 20 }, (_, i) => ({
          id: `r${i}`,
          title: `Res${i}`,
          url: `https://x.fr/${i}`,
          format: 'csv',
        })),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ total: 1, page: 1, page_size: 20, data: [manyResources] }),
          { status: 200 },
        ),
      );
      const r = await dataGouvConnector.searchDatasets('test');
      expect(r.datasets[0]?.resources.length).toBe(10);
    });

    it('gère organization null', async () => {
      const noOrgDataset = { ...fakeDataset, organization: null };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ total: 1, page: 1, page_size: 20, data: [noOrgDataset] }), { status: 200 }),
      );
      const r = await dataGouvConnector.searchDatasets('test');
      expect(r.datasets[0]?.organization).toBeNull();
    });
  });
});
