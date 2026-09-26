/**
 * Tests apex-tools-dispatch.ts avec MOCKS FETCH complets.
 * Cible coverage : 64% → 90%+ branches, fetch helpers (weather, news, market, scrape, web_search, web_fetch, translate).
 *
 * Stratégie : vi.spyOn(globalThis, 'fetch') pour simuler chaque API externe :
 * - Open-Meteo (geocoding + forecast)
 * - NewsAPI
 * - CoinGecko + Finnhub
 * - GitHub raw
 * - Brave Search + Tavily
 * - DeepL + Gemini + Claude
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';
import { store } from '../../core/store.js';

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }): void {
  vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => response as Response);
}

function mockFetchAlways(handler: (url: string | URL | Request) => Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => handler(input as string) as Response);
}

describe('apex-tools-dispatch — fetch mocks (success + failure paths)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* v13.4.246 a durci execute() : userTier 'admin' est re-vérifié via
       auth.isAdminSync() (fail-closed). En test il faut donc une vraie session
       admin en store, sinon les tools 'admin' sont rétrogradés client_free
       → "Tier insuffisant". On exerce le vrai guard plutôt que de le mocker. */
    store.set('user', { id: 'kdmc_admin', name: 'K' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    store.set('user', null);
  });

  describe('weather tool', () => {
    it('weather success — geocoding + forecast', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [{ latitude: 43.7384, longitude: 7.4246, name: 'Monaco' }],
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            daily: {
              time: ['2026-05-04', '2026-05-05'],
              temperature_2m_max: [22, 24],
              temperature_2m_min: [16, 18],
            },
          }),
        } as Response;
      });
      const r = await apexToolsDispatch.execute('weather', { location: 'Monaco', days: 2 }, 'admin');
      expect(r.ok).toBe(true);
      const data = r.result as { location: string; days: number };
      expect(data.location).toBe('Monaco');
      expect(data.days).toBe(2);
    });

    it('weather geocoding lieu introuvable', async () => {
      mockFetchOnce({ ok: true, status: 200, json: async () => ({ results: [] }) });
      const r = await apexToolsDispatch.execute('weather', { location: 'Inexistant XYZ' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { error?: string };
      expect(d.error).toBe('Lieu introuvable');
    });

    it('weather geocoding HTTP error', async () => {
      mockFetchOnce({ ok: false, status: 500 });
      const r = await apexToolsDispatch.execute('weather', { location: 'X' }, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('500');
    });

    it('weather forecast HTTP error', async () => {
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) {
          return { ok: true, status: 200, json: async () => ({ results: [{ latitude: 1, longitude: 2, name: 'X' }] }) } as Response;
        }
        return { ok: false, status: 503 } as Response;
      });
      const r = await apexToolsDispatch.execute('weather', { location: 'X' }, 'admin');
      expect(r.ok).toBe(false);
    });

    it('weather missing location', async () => {
      const r = await apexToolsDispatch.execute('weather', {}, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('required');
    });

    it('weather days clamped 1-7', async () => {
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) return { ok: true, status: 200, json: async () => ({ results: [{ latitude: 1, longitude: 2, name: 'X' }] }) } as Response;
        return { ok: true, status: 200, json: async () => ({ daily: {} }) } as Response;
      });
      const r = await apexToolsDispatch.execute('weather', { location: 'X', days: 99 }, 'admin');
      expect(r.ok).toBe(true);
      expect((r.result as { days: number }).days).toBe(7);
    });
  });

  describe('news_headlines tool', () => {
    it('news fallback (no key) → message', async () => {
      const r = await apexToolsDispatch.execute('news_headlines', { category: 'tech' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('fallback');
    });

    it('news avec key OK', async () => {
      localStorage.setItem('ax_newsapi_key', 'fake-news-key-1234567890');
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ articles: [{ title: 'Article 1' }, { title: 'Article 2' }] }),
      });
      const r = await apexToolsDispatch.execute('news_headlines', {}, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string; articles?: unknown[] };
      expect(d.provider).toBe('newsapi');
      expect(d.articles?.length).toBe(2);
    });

    it('news avec key mais HTTP error → fallback', async () => {
      localStorage.setItem('ax_newsapi_key', 'fake-key-bad-12345');
      mockFetchOnce({ ok: false, status: 401 });
      const r = await apexToolsDispatch.execute('news_headlines', {}, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('fallback');
    });

    it('news avec key mais fetch throws → fallback', async () => {
      localStorage.setItem('ax_newsapi_key', 'fake-key-12345');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => { throw new Error('Network'); });
      const r = await apexToolsDispatch.execute('news_headlines', { country: 'us' }, 'admin');
      expect(r.ok).toBe(true);
    });
  });

  describe('market_data tool', () => {
    it('crypto OK via CoinGecko', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ bitcoin: { usd: 60000, eur: 55000, usd_24h_change: 2.5 } }),
      });
      const r = await apexToolsDispatch.execute('market_data', { type: 'crypto', symbol: 'bitcoin' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { type: string };
      expect(d.type).toBe('crypto');
    });

    it('crypto symbol unknown → null price', async () => {
      mockFetchOnce({ ok: true, status: 200, json: async () => ({}) });
      const r = await apexToolsDispatch.execute('market_data', { type: 'crypto', symbol: 'XYZ' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('crypto HTTP error', async () => {
      mockFetchOnce({ ok: false, status: 429 });
      const r = await apexToolsDispatch.execute('market_data', { type: 'crypto', symbol: 'btc' }, 'admin');
      expect(r.ok).toBe(false);
    });

    it('stock sans key Finnhub → message config', async () => {
      const r = await apexToolsDispatch.execute('market_data', { type: 'stock', symbol: 'AAPL' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { message?: string };
      expect(d.message).toContain('finnhub');
    });

    it('stock avec Finnhub key OK', async () => {
      localStorage.setItem('ax_finnhub_key', 'fake-finnhub-12345');
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ c: 150.5, h: 152, l: 149, o: 150 }),
      });
      const r = await apexToolsDispatch.execute('market_data', { type: 'stock', symbol: 'AAPL' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('stock avec Finnhub HTTP error', async () => {
      localStorage.setItem('ax_finnhub_key', 'fake-finnhub-12345');
      mockFetchOnce({ ok: false, status: 500 });
      const r = await apexToolsDispatch.execute('market_data', { type: 'stock', symbol: 'AAPL' }, 'admin');
      expect(r.ok).toBe(false);
    });

    it('forex with finnhub key OK', async () => {
      localStorage.setItem('ax_finnhub_key', 'fake-key-12345');
      mockFetchOnce({ ok: true, status: 200, json: async () => ({ c: 1.08 }) });
      const r = await apexToolsDispatch.execute('market_data', { type: 'forex', symbol: 'EURUSD' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('market type inconnu → throw', async () => {
      const r = await apexToolsDispatch.execute('market_data', { type: 'invalid', symbol: 'X' }, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('inconnu');
    });

    it('market sans symbol → throw', async () => {
      const r = await apexToolsDispatch.execute('market_data', { type: 'crypto', symbol: '' }, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('required');
    });
  });

  describe('scrape_url tool', () => {
    it('scrape OK extraction title + desc + text', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        text: async () => '<html><head><title>Test Page</title><meta name="description" content="Page description"/></head><body><script>x</script><style>y</style><h1>Title</h1><p>Hello world content here</p></body></html>',
      });
      const r = await apexToolsDispatch.execute('scrape_url', { url: 'https://example.com' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { title: string; description: string; word_count: number };
      expect(d.title).toBe('Test Page');
      expect(d.description).toBe('Page description');
      expect(d.word_count).toBeGreaterThan(0);
    });

    it('scrape sans title/desc tags', async () => {
      mockFetchOnce({ ok: true, status: 200, text: async () => '<html><body>Plain content</body></html>' });
      const r = await apexToolsDispatch.execute('scrape_url', { url: 'https://example.com' }, 'admin');
      expect(r.ok).toBe(true);
      expect((r.result as { title: string }).title).toBe('');
    });

    it('scrape URL invalide', async () => {
      const r = await apexToolsDispatch.execute('scrape_url', { url: 'not-a-url' }, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('invalide');
    });
  });

  describe('web_fetch tool', () => {
    it('web_fetch OK strips scripts + styles', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        text: async () => '<html><script>js</script><style>css</style><div>Content here</div></html>',
      });
      const r = await apexToolsDispatch.execute('web_fetch', { url: 'https://api.test.com/data' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { content: string; status: number };
      expect(d.status).toBe(200);
      expect(d.content).not.toContain('<script>');
    });

    it('web_fetch URL invalide', async () => {
      const r = await apexToolsDispatch.execute('web_fetch', { url: 'ftp://x' }, 'admin');
      expect(r.ok).toBe(false);
    });

    it('web_fetch HTTP non-OK still returns', async () => {
      mockFetchOnce({ ok: false, status: 404, text: async () => '<html>not found</html>' });
      const r = await apexToolsDispatch.execute('web_fetch', { url: 'https://x.com' }, 'admin');
      expect(r.ok).toBe(true);
      expect((r.result as { status: number }).status).toBe(404);
    });
  });

  describe('web_search tool', () => {
    it('Brave search OK avec key', async () => {
      localStorage.setItem('ax_brave_key', 'brv-fake-1234567890');
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ web: { results: [{ title: 'R1', url: 'https://x.com' }] } }),
      });
      const r = await apexToolsDispatch.execute('web_search', { query: 'test' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string; results: unknown[] };
      expect(d.provider).toBe('brave');
      expect(d.results.length).toBeGreaterThan(0);
    });

    it('Brave HTTP error → Tavily fallback', async () => {
      localStorage.setItem('ax_brave_key', 'brv-fake-12345');
      localStorage.setItem('ax_tavily_key', 'tvly-fake-1234');
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) return { ok: false, status: 401 } as Response;
        return { ok: true, status: 200, json: async () => ({ results: [{ title: 'tav' }] }) } as Response;
      });
      const r = await apexToolsDispatch.execute('web_search', { query: 'x' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('tavily');
    });

    it('Brave throws → Tavily fallback', async () => {
      localStorage.setItem('ax_brave_key', 'brv-fake-12345');
      localStorage.setItem('ax_tavily_key', 'tvly-fake-12345');
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) throw new Error('Network');
        return { ok: true, status: 200, json: async () => ({ results: [] }) } as Response;
      });
      const r = await apexToolsDispatch.execute('web_search', { query: 'x' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('No key → fallback message', async () => {
      const r = await apexToolsDispatch.execute('web_search', { query: 'test' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('none');
    });

    it('Tavily-only OK', async () => {
      localStorage.setItem('ax_tavily_key', 'tvly-fake-12345');
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ title: 'tav-r' }] }),
      });
      const r = await apexToolsDispatch.execute('web_search', { query: 'q', max_results: 3 }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('tavily');
    });

    it('Tavily HTTP error → fallback note', async () => {
      localStorage.setItem('ax_tavily_key', 'tvly-fake-12345');
      mockFetchOnce({ ok: false, status: 503 });
      const r = await apexToolsDispatch.execute('web_search', { query: 'q' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('none');
    });

    it('Tavily throws → fallback note', async () => {
      localStorage.setItem('ax_tavily_key', 'tvly-fake-12345');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => { throw new Error('Network'); });
      const r = await apexToolsDispatch.execute('web_search', { query: 'q' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('Empty query → throw', async () => {
      const r = await apexToolsDispatch.execute('web_search', { query: '' }, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('required');
    });
  });

  describe('translate tool', () => {
    it('DeepL OK', async () => {
      localStorage.setItem('ax_deepl_key', 'deepl-fake-1234567890');
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ translations: [{ text: 'Bonjour' }] }),
      });
      const r = await apexToolsDispatch.execute('translate', { text: 'Hello', target_lang: 'FR' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { translated: string; provider: string };
      expect(d.translated).toBe('Bonjour');
      expect(d.provider).toBe('deepl');
    });

    it('DeepL HTTP error → Gemini fallback', async () => {
      localStorage.setItem('ax_deepl_key', 'deepl-fake-12345');
      localStorage.setItem('ax_google_key', 'gem-fake-12345');
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) return { ok: false, status: 401 } as Response;
        return {
          ok: true,
          status: 200,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'Hola' }] } }] }),
        } as Response;
      });
      const r = await apexToolsDispatch.execute('translate', { text: 'Hello', target_lang: 'ES' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('gemini-flash-2.0');
    });

    it('DeepL throws → Gemini fallback', async () => {
      localStorage.setItem('ax_deepl_key', 'deepl-fake-12345');
      localStorage.setItem('ax_google_key', 'gem-fake-12345');
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) throw new Error('Net');
        return {
          ok: true,
          status: 200,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'Hi' }] } }] }),
        } as Response;
      });
      const r = await apexToolsDispatch.execute('translate', { text: 'A', target_lang: 'EN' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('Gemini-only OK', async () => {
      localStorage.setItem('ax_google_key', 'gem-fake-12345');
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Übersetzt' }] } }] }),
      });
      const r = await apexToolsDispatch.execute('translate', { text: 'Hello', target_lang: 'DE' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('Gemini HTTP error → Claude fallback', async () => {
      localStorage.setItem('ax_google_key', 'gem-fake-12345');
      localStorage.setItem('ax_anthropic_key', 'ant-fake-12345');
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) return { ok: false, status: 500 } as Response;
        return {
          ok: true,
          status: 200,
          json: async () => ({ content: [{ text: 'Hej' }] }),
        } as Response;
      });
      const r = await apexToolsDispatch.execute('translate', { text: 'Hi', target_lang: 'SV' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('claude-haiku');
    });

    it('Gemini throws → Claude fallback', async () => {
      localStorage.setItem('ax_google_key', 'gem-fake-12345');
      localStorage.setItem('ax_anthropic_key', 'ant-fake-12345');
      let n = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        n++;
        if (n === 1) throw new Error('Bad');
        return { ok: true, status: 200, json: async () => ({ content: [{ text: 'OK' }] }) } as Response;
      });
      const r = await apexToolsDispatch.execute('translate', { text: 'A', target_lang: 'EN' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('Claude HTTP error → fallback identity', async () => {
      localStorage.setItem('ax_anthropic_key', 'ant-fake-12345');
      mockFetchOnce({ ok: false, status: 500 });
      const r = await apexToolsDispatch.execute('translate', { text: 'X', target_lang: 'EN' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string };
      expect(d.provider).toBe('fallback_no_provider');
    });

    it('Claude throws → fallback identity', async () => {
      localStorage.setItem('ax_anthropic_key', 'ant-fake-12345');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => { throw new Error('No'); });
      const r = await apexToolsDispatch.execute('translate', { text: 'X', target_lang: 'EN' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('No keys → identity', async () => {
      const r = await apexToolsDispatch.execute('translate', { text: 'X', target_lang: 'EN' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { provider: string; translated: string };
      expect(d.provider).toBe('fallback_no_provider');
      expect(d.translated).toBe('X');
    });
  });

  describe('read_file tool', () => {
    it('read_file OK', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        text: async () => 'file content here',
      });
      const r = await apexToolsDispatch.execute('read_file', { path: 'README.md' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { content: string; size: number };
      expect(d.content).toBe('file content here');
      expect(d.size).toBe(17);
    });

    it('read_file path absolu refusé', async () => {
      const r = await apexToolsDispatch.execute('read_file', { path: '/etc/passwd' }, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('invalide');
    });

    it('read_file path traversal refusé', async () => {
      const r = await apexToolsDispatch.execute('read_file', { path: '../secret.txt' }, 'admin');
      expect(r.ok).toBe(false);
    });

    it('read_file HTTP 404', async () => {
      mockFetchOnce({ ok: false, status: 404 });
      const r = await apexToolsDispatch.execute('read_file', { path: 'noexist.md' }, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('404');
    });

    it('read_file branch param custom', async () => {
      mockFetchOnce({ ok: true, status: 200, text: async () => 'dev branch' });
      const r = await apexToolsDispatch.execute('read_file', { path: 'README.md', branch: 'dev' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('read_file path vide', async () => {
      const r = await apexToolsDispatch.execute('read_file', { path: '' }, 'admin');
      expect(r.ok).toBe(false);
    });
  });

  describe('detect_intent tool', () => {
    const cases = [
      { text: 'ouvre google', expected: 'open_browser' },
      { text: 'va sur https://example.com', expected: 'open_url' },
      { text: 'va sur example.com', expected: 'open_url' },
      { text: 'traduis en anglais', expected: 'translate' },
      { text: 'météo Paris', expected: 'weather' },
      { text: 'news tech', expected: 'news' },
      { text: 'cours bitcoin', expected: 'crypto_price' },
      { text: 'cours action AAPL', expected: 'stock_price' },
      { text: 'cherche python', expected: 'web_search' },
      { text: 'scanne ce code', expected: 'ocr' },
      { text: 'génère un qr', expected: 'qr_generate' },
      { text: 'invoice pour client', expected: 'studio_facture' },
      { text: 'mon CV', expected: 'studio_cv' },
      { text: 'mix musique', expected: 'studio_music' },
      { text: 'montage video', expected: 'studio_video' },
      { text: 'plan maison', expected: 'studio_archi' },
      { text: 'article du code civil', expected: 'legal_kb' },
      { text: 'calcul impôt', expected: 'finance_calc' },
      { text: 'mon iban', expected: 'finance_iban' },
      { text: 'mon agenda', expected: 'calendar' },
      { text: 'envoie email', expected: 'send_email' },
      { text: 'fais un audit', expected: 'audit_self' },
      { text: 'rappelle-toi de', expected: 'memory_recall' },
      { text: 'logout', expected: 'logout' },
      { text: 'bonjour', expected: 'greeting' },
      { text: 'aide', expected: 'help' },
      { text: 'zorg flubber', expected: 'unknown' },
    ];
    cases.forEach(({ text, expected }) => {
      it(`"${text}" → ${expected}`, async () => {
        const r = await apexToolsDispatch.execute('detect_intent', { text }, 'admin');
        expect(r.ok).toBe(true);
        const d = r.result as { intent: string };
        expect(d.intent).toBe(expected);
      });
    });

    it('detect_intent text vide → unknown 0', async () => {
      const r = await apexToolsDispatch.execute('detect_intent', { text: '' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { intent: string; confidence: number };
      expect(d.intent).toBe('unknown');
      expect(d.confidence).toBe(0);
    });
  });

  describe('finance_calculate tool', () => {
    it('iban_check valide FR', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'iban_check', params: { iban: 'FR1420041010050500013M02606' } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { valid: boolean; country: string };
      expect(d.country).toBe('FR');
    });

    it('iban_check trop court', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'iban_check', params: { iban: 'FR12' } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { valid: boolean };
      expect(d.valid).toBe(false);
    });

    it('iban_check trop long', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'iban_check', params: { iban: 'F'.repeat(40) } }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('iban_check invalide MOD97', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'iban_check', params: { iban: 'FR0000000000000000000000000' } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { valid: boolean };
      expect(d.valid).toBe(false);
    });

    it('ir tranche minimale', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'ir', params: { revenu: 10000, parts: 1 } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { ir_total: number };
      expect(d.ir_total).toBe(0);
    });

    it('ir tranche moyenne', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'ir', params: { revenu: 50000, parts: 1 } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { ir_total: number };
      expect(d.ir_total).toBeGreaterThan(0);
    });

    it('ir tranche haute', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'ir', params: { revenu: 250000, parts: 1 } }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('ir tranche très haute', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'ir', params: { revenu: 200000, parts: 1 } }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('credit avec taux 0', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'credit', params: { capital: 1200, taux: 0, duree_mois: 12 } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { mensualite: number };
      expect(d.mensualite).toBe(100);
    });

    it('credit avec taux normal', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'credit', params: { capital: 100000, taux: 3.5, duree_mois: 240 } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { mensualite: number; total: number };
      expect(d.mensualite).toBeGreaterThan(500);
      expect(d.total).toBeGreaterThan(d.mensualite);
    });

    it('plus_value <6 ans', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'plus_value', params: { annees: 3, gain: 100000 } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { abattement_pct: number };
      expect(d.abattement_pct).toBe(0);
    });

    it('plus_value entre 6 et 21 ans', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'plus_value', params: { annees: 10, gain: 100000 } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { abattement_pct: number };
      expect(d.abattement_pct).toBe(30);
    });

    it('plus_value >=22 ans (exonération)', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'plus_value', params: { annees: 25, gain: 100000 } }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { abattement_pct: number };
      expect(d.abattement_pct).toBe(100);
    });

    it('finance_calculate type inconnu', async () => {
      const r = await apexToolsDispatch.execute('finance_calculate', { type: 'unknown', params: {} }, 'admin');
      expect(r.ok).toBe(false);
    });
  });

  describe('vault_action tool', () => {
    it('list returns count + keys', async () => {
      localStorage.setItem('ax_anthropic_key', 'fake');
      localStorage.setItem('ax_openai_key', 'fake');
      const r = await apexToolsDispatch.execute('vault_action', { action: 'list' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { count: number; keys: string[] };
      expect(d.count).toBe(2);
    });

    it('get exists masked', async () => {
      localStorage.setItem('ax_anthropic_key', 'fake-secret');
      const r = await apexToolsDispatch.execute('vault_action', { action: 'get', key: 'ax_anthropic_key' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { found: boolean; masked: string | null };
      expect(d.found).toBe(true);
      expect(d.masked).toBe('***');
    });

    it('get not found masked null', async () => {
      const r = await apexToolsDispatch.execute('vault_action', { action: 'get', key: 'nonexistent' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { found: boolean; masked: string | null };
      expect(d.found).toBe(false);
      expect(d.masked).toBeNull();
    });

    it('get sans key → throw', async () => {
      const r = await apexToolsDispatch.execute('vault_action', { action: 'get' }, 'admin');
      expect(r.ok).toBe(false);
    });

    it('revoke removes key', async () => {
      localStorage.setItem('ax_test_key', 'value');
      const r = await apexToolsDispatch.execute('vault_action', { action: 'revoke', key: 'ax_test_key' }, 'admin');
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_test_key')).toBeNull();
    });

    it('revoke sans key → throw', async () => {
      const r = await apexToolsDispatch.execute('vault_action', { action: 'revoke' }, 'admin');
      expect(r.ok).toBe(false);
    });

    it('action inconnue', async () => {
      const r = await apexToolsDispatch.execute('vault_action', { action: 'invalid' }, 'admin');
      expect(r.ok).toBe(false);
    });
  });

  describe('read_logs tool', () => {
    it('scope=audit', async () => {
      localStorage.setItem('apex_v13_audit_log', JSON.stringify([{ id: 1 }, { id: 2 }]));
      const r = await apexToolsDispatch.execute('read_logs', { scope: 'audit', limit: 10 }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { audit: unknown[] };
      expect(d.audit?.length).toBe(2);
    });

    it('scope=errors', async () => {
      localStorage.setItem('apex_v13_observability_buffer', JSON.stringify([{ level: 'error' }, { level: 'info' }]));
      const r = await apexToolsDispatch.execute('read_logs', { scope: 'errors' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { errors: unknown[] };
      expect(d.errors?.length).toBe(1);
    });

    it('scope=sentinels', async () => {
      localStorage.setItem('apex_v13_sentinels', JSON.stringify({ s1: { name: 'x' } }));
      const r = await apexToolsDispatch.execute('read_logs', { scope: 'sentinels' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('scope=all retourne tout', async () => {
      const r = await apexToolsDispatch.execute('read_logs', { scope: 'all' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as Record<string, unknown[]>;
      expect(d.audit).toBeDefined();
      expect(d.errors).toBeDefined();
      expect(d.sentinels).toBeDefined();
    });

    it('audit corrupt JSON → []', async () => {
      localStorage.setItem('apex_v13_audit_log', 'not-json');
      const r = await apexToolsDispatch.execute('read_logs', { scope: 'audit' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { audit: unknown[] };
      expect(d.audit?.length).toBe(0);
    });
  });

  describe('memory tools', () => {
    it('memory_add OK', async () => {
      const r = await apexToolsDispatch.execute('memory_add', { category: 'test', fact: 'X est Y' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { ok: boolean; total: number };
      expect(d.ok).toBe(true);
    });

    it('memory_recall scope=all sans data', async () => {
      const r = await apexToolsDispatch.execute('memory_recall', { keyword: 'random' }, 'admin');
      expect(r.ok).toBe(true);
    });

    it('lesson_record OK', async () => {
      const r = await apexToolsDispatch.execute('lesson_record', { title: 'L1', text: 'Pattern X', severity: 'critical', category: 'security' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { ok: boolean; total: number };
      expect(d.ok).toBe(true);
    });
  });

  describe('escalate_human tool', () => {
    it('OK push to ax_claude_todo', async () => {
      const r = await apexToolsDispatch.execute('escalate_human', { action: 'fix bug', urgency: 'high', context: 'context' }, 'admin');
      expect(r.ok).toBe(true);
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as unknown[];
      expect(todos.length).toBeGreaterThan(0);
    });

    it('escalate sans context', async () => {
      const r = await apexToolsDispatch.execute('escalate_human', { action: 'fix', urgency: 'low' }, 'admin');
      expect(r.ok).toBe(true);
    });
  });

  describe('placeholder tools', () => {
    it('voice_command → placeholder', async () => {
      const r = await apexToolsDispatch.execute('voice_command', {}, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { placeholder: boolean };
      expect(d.placeholder).toBe(true);
    });

    it('screen_share → placeholder', async () => {
      const r = await apexToolsDispatch.execute('screen_share', {}, 'admin');
      expect(r.ok).toBe(true);
    });

    it('multi_llm_consensus → placeholder', async () => {
      const r = await apexToolsDispatch.execute('multi_llm_consensus', {}, 'admin');
      expect(r.ok).toBe(true);
    });

    it('edit_file → placeholder Jet 9', async () => {
      const r = await apexToolsDispatch.execute('edit_file', {}, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { placeholder: boolean };
      expect(d.placeholder).toBe(true);
    });

    it('send_email → placeholder', async () => {
      const r = await apexToolsDispatch.execute('send_email', {}, 'admin');
      expect(r.ok).toBe(true);
    });

    it('ocr_scan → placeholder', async () => {
      const r = await apexToolsDispatch.execute('ocr_scan', {}, 'admin');
      expect(r.ok).toBe(true);
    });
  });

  describe('qr_generate tool', () => {
    it('plain format', async () => {
      const r = await apexToolsDispatch.execute('qr_generate', { data: 'test' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { format: string };
      expect(d.format).toBe('plain');
    });

    it('wifi format', async () => {
      const r = await apexToolsDispatch.execute('qr_generate', { data: 'WIFI:T:WPA;', format: 'wifi' }, 'admin');
      expect(r.ok).toBe(true);
      const d = r.result as { format: string };
      expect(d.format).toBe('wifi');
    });
  });

  describe('Tool inconnu / dispatch error', () => {
    it('Tool inconnu → throw', async () => {
      const r = await apexToolsDispatch.execute('nonexistent_tool_xyz', {}, 'admin');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('inconnu');
    });
  });
});
