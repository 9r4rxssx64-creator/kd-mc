/**
 * Tests openlegi v13.4.140 (Kevin "100/100 réel").
 *
 * Module : services/connectors/openlegi.ts (179 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openLegiConnector } from '../../services/connectors/openlegi.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('openlegi connector (v13.4.140 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    /* Reset cached PISTE token entre tests (singleton state) */
    (openLegiConnector as unknown as { cachedToken: null }).cachedToken = null;
  });

  afterEach(() => {
    localStorage.clear();
    (openLegiConnector as unknown as { cachedToken: null }).cachedToken = null;
  });

  describe('status', () => {
    it('retourne fallback public si pas de creds', () => {
      const s = openLegiConnector.status();
      expect(s.available).toBe(true);
      expect(s.auth_configured).toBe(false);
      expect(s.mode).toBe('public_html_fallback');
    });

    it('retourne piste_oauth si creds présents', () => {
      localStorage.setItem('ax_legifrance_client_id', 'test_id');
      localStorage.setItem('ax_legifrance_client_secret', 'test_secret');
      const s = openLegiConnector.status();
      expect(s.auth_configured).toBe(true);
      expect(s.mode).toBe('piste_oauth');
    });
  });

  describe('search (no auth → fallback HTML)', () => {
    it('retourne résultat avec source=public_html', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html>fake</html>', { status: 200 }),
      );
      const r = await openLegiConnector.search('Article 1240 Code civil');
      expect(r.source).toBe('public_html');
      expect(r.query).toBe('Article 1240 Code civil');
      expect(Array.isArray(r.articles)).toBe(true);
      expect(Array.isArray(r.jurisprudence)).toBe(true);
    });

    it('gère fetch error gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await openLegiConnector.search('test query');
      expect(r.source).toBe('public_html');
      expect(r.total).toBe(0);
    });

    it('gère HTTP 500 gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 500 }));
      const r = await openLegiConnector.search('test');
      expect(r.source).toBe('public_html');
    });

    it('respecte pagination opts', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
      const r = await openLegiConnector.search('test', { page: 3, pageSize: 20 });
      expect(r.query).toBe('test');
    });
  });

  describe('search (with PISTE auth)', () => {
    beforeEach(() => {
      localStorage.setItem('ax_legifrance_client_id', 'test_id');
      localStorage.setItem('ax_legifrance_client_secret', 'test_secret');
    });

    it('utilise PISTE si auth OK', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'tok_xyz', expires_in: 3600 }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              totalResultNumber: 5,
              results: [
                { id: 'LEGIARTI001', cid: 'C001', num: '1240', texte: 'Article test', etat: 'VIGUEUR' },
              ],
            }),
            { status: 200 },
          ),
        );
      const r = await openLegiConnector.search('test piste');
      expect(r.source).toBe('piste');
      expect(r.total).toBe(5);
      expect(r.articles.length).toBe(1);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('fallback public si OAuth échoue', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('', { status: 401 }))
        .mockResolvedValueOnce(new Response('', { status: 200 }));
      const r = await openLegiConnector.search('test');
      expect(r.source).toBe('public_html');
    });

    it('fallback public si PISTE search échoue', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(new Response('', { status: 200 }));
      const r = await openLegiConnector.search('test');
      expect(r.source).toBe('public_html');
    });
  });

  describe('getArticle', () => {
    it('retourne pointer URL minimal si pas auth', async () => {
      const a = await openLegiConnector.getArticle('LEGIARTI000006406766');
      expect(a).toBeDefined();
      expect(a?.cid).toBe('LEGIARTI000006406766');
      expect(a?.url).toContain('legifrance.gouv.fr');
      expect(a?.source).toBe('public_html');
    });

    it('utilise PISTE si auth + retourne article complet', async () => {
      localStorage.setItem('ax_legifrance_client_id', 'id');
      localStorage.setItem('ax_legifrance_client_secret', 'secret');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'tok2', expires_in: 3600 }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              article: {
                id: 'LEGIARTI001',
                cid: 'LEGIARTI001',
                num: '1240',
                texte: 'Tout fait quelconque...',
                etat: 'VIGUEUR',
                dateDebut: '1804-03-21',
              },
            }),
            { status: 200 },
          ),
        );
      const a = await openLegiConnector.getArticle('LEGIARTI001');
      expect(a).toBeDefined();
      expect(a?.num).toBe('1240');
      expect(a?.source).toBe('piste');
      expect(a?.date_debut).toBe('1804-03-21');
    });

    it('retourne null si PISTE getArticle fail', async () => {
      localStorage.setItem('ax_legifrance_client_id', 'id');
      localStorage.setItem('ax_legifrance_client_secret', 'secret');
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'tok2', expires_in: 3600 }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response('err', { status: 500 }));
      const a = await openLegiConnector.getArticle('LEGIARTI001');
      expect(a).toBeNull();
    });
  });
});
