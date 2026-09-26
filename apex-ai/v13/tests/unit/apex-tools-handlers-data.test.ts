/**
 * Tests services/apex-tools-handlers/data (Kevin v13.4.203 "100/100 réel partout").
 *
 * Couvre handlers Notion / Airtable / Shopify : auth header, task dispatching,
 * params validation, HTTP error throw, task inconnue throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleAirtableTask,
  handleNotionTask,
  handleShopifyTask,
} from '../../services/apex-tools-handlers/data.js';

/* Mock vault — handlers font `await import('../../services/vault/vault.js')`.
 * Le path est ../vault.js relatif au handler. */
vi.mock('../../services/vault/vault.js', () => ({
  vault: {
    readKey: vi.fn(),
  },
}));

import { vault } from '../../services/vault/vault.js';

const mockedReadKey = vi.mocked(vault.readKey);

describe('services/apex-tools-handlers/data', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedReadKey.mockReset();
    /* Mock global fetch */
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, mocked: true }), {
        status: 200, statusText: 'OK',
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /* ====== NOTION ====== */
  describe('handleNotionTask', () => {
    it('throw si ax_notion_key non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleNotionTask('search', {})).rejects.toThrow(/ax_notion_key non configuré/);
    });

    it('task "create_page" → POST /v1/pages avec headers + database_id', async () => {
      mockedReadKey.mockResolvedValue('secret_token_notion');
      const result = await handleNotionTask('create_page', {
        database_id: 'db-123',
        properties: { Name: { title: [{ text: { content: 'Hello' } }] } },
      });
      expect(result).toEqual({ ok: true, mocked: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer secret_token_notion',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('alias "add_page" équivalent à "create_page"', async () => {
      mockedReadKey.mockResolvedValue('secret_token_notion');
      await handleNotionTask('add_page', { database_id: 'db-1' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('task "search" → POST /v1/search avec query', async () => {
      mockedReadKey.mockResolvedValue('secret_token_notion');
      await handleNotionTask('search', { query: 'Apex docs' });
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe('https://api.notion.com/v1/search');
      const init = callArgs[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.query).toBe('Apex docs');
    });

    it('throw si HTTP error (status != 2xx)', async () => {
      mockedReadKey.mockResolvedValue('secret_token_notion');
      fetchSpy.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
      await expect(handleNotionTask('search', { query: 'x' })).rejects.toThrow(/Notion HTTP 500/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('secret_token_notion');
      await expect(handleNotionTask('delete_database', {})).rejects.toThrow(/Task Notion inconnue/);
    });
  });

  /* ====== AIRTABLE ====== */
  describe('handleAirtableTask', () => {
    it('throw si ax_airtable_pat non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleAirtableTask('list', { base_id: 'b1', table: 't1' })).rejects.toThrow(/ax_airtable_pat non configuré/);
    });

    it('throw si base_id manquant', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      await expect(handleAirtableTask('list', { table: 't1' })).rejects.toThrow(/base_id \+ table required/);
    });

    it('throw si table manquante', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      await expect(handleAirtableTask('list', { base_id: 'b1' })).rejects.toThrow(/base_id \+ table required/);
    });

    it('task "list_records" → GET avec encodeURIComponent table', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      await handleAirtableTask('list_records', { base_id: 'appXYZ', table: 'My Table' });
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('https://api.airtable.com/v0/appXYZ/My%20Table');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBeUndefined(); /* GET par défaut */
    });

    it('alias "list" équivalent à "list_records"', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      await handleAirtableTask('list', { base_id: 'appA', table: 'T' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('task "create_record" → POST avec records body', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      await handleAirtableTask('create_record', {
        base_id: 'b1',
        table: 'Tasks',
        fields: { Name: 'Test', Done: false },
      });
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.records).toEqual([{ fields: { Name: 'Test', Done: false } }]);
      expect(init.method).toBe('POST');
    });

    it('alias "create" équivalent', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      await handleAirtableTask('create', { base_id: 'b1', table: 'T' });
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe('POST');
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 422 }));
      await expect(handleAirtableTask('list', { base_id: 'b', table: 'T' })).rejects.toThrow(/Airtable HTTP 422/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('pat-abc');
      await expect(handleAirtableTask('delete', { base_id: 'b', table: 'T' })).rejects.toThrow(/Task Airtable inconnue/);
    });
  });

  /* ====== SHOPIFY ====== */
  describe('handleShopifyTask', () => {
    it('throw si ax_shopify_token non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleShopifyTask('list_products', { shop: 'foo.myshopify.com' })).rejects.toThrow(/ax_shopify_token non configuré/);
    });

    it('throw si shop manquant', async () => {
      mockedReadKey.mockResolvedValue('shpat_abc');
      await expect(handleShopifyTask('list_products', {})).rejects.toThrow(/shop \(myshopify domain\) required/);
    });

    it('task "list_products" → GET admin/api avec X-Shopify-Access-Token', async () => {
      mockedReadKey.mockResolvedValue('shpat_secret');
      await handleShopifyTask('list_products', { shop: 'apex-store.myshopify.com' });
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe('https://apex-store.myshopify.com/admin/api/2024-01/products.json?limit=20');
      const init = callArgs[1] as RequestInit;
      expect((init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('shpat_secret');
    });

    it('alias "products" équivalent à "list_products"', async () => {
      mockedReadKey.mockResolvedValue('shpat_secret');
      await handleShopifyTask('products', { shop: 'x.myshopify.com' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('task "list_orders" → GET orders.json', async () => {
      mockedReadKey.mockResolvedValue('shpat_secret');
      await handleShopifyTask('list_orders', { shop: 'x.myshopify.com' });
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('https://x.myshopify.com/admin/api/2024-01/orders.json?limit=20');
    });

    it('alias "orders" équivalent', async () => {
      mockedReadKey.mockResolvedValue('shpat_secret');
      await handleShopifyTask('orders', { shop: 'x.myshopify.com' });
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('orders.json');
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('shpat_secret');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 401 }));
      await expect(handleShopifyTask('list_products', { shop: 's.myshopify.com' })).rejects.toThrow(/Shopify HTTP 401/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('shpat_secret');
      await expect(handleShopifyTask('delete_shop', { shop: 's.myshopify.com' })).rejects.toThrow(/Task Shopify inconnue/);
    });
  });
});
