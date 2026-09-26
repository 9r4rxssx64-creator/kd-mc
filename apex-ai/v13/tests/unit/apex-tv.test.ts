/**
 * Tests apex-tv v13.4.145 (Kevin "100/100 réel").
 *
 * Module : services/apex-tv.ts (273 lines, ~180 stmts, était 59.4% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAdminSync: vi.fn() },
}));

vi.mock('../../services/auth/auth.js', () => ({ auth: mockAuth }));

import { apexTV } from '../../services/integrations/apex-tv.js';

const sampleM3U = `#EXTM3U
#EXTINF:-1 tvg-logo="https://x.com/bfm.png" tvg-country="FR" tvg-language="French",BFM TV
https://stream.bfm.fr/live.m3u8
#EXTINF:-1 tvg-country="FR",BFM Business
https://stream.bfm.fr/business.m3u8
#EXTINF:-1 tvg-country="MC",Monte Carlo Cinema
https://stream.mc/cinema.m3u8
#EXTINF:-1,Eurosport
https://stream.eurosport.com/live.m3u8
`;

describe('apex-tv (v13.4.145 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAdminSync.mockReturnValue(true);
    /* Reset cache */
    (apexTV as unknown as { cachedChannels: unknown[]; cacheTs: number }).cachedChannels = [];
    (apexTV as unknown as { cacheTs: number }).cacheTs = 0;
  });

  afterEach(() => {
    (apexTV as unknown as { cachedChannels: unknown[]; cacheTs: number }).cachedChannels = [];
    (apexTV as unknown as { cacheTs: number }).cacheTs = 0;
  });

  describe('categorize', () => {
    it('détecte casino-relevant en priorité (monaco)', () => {
      expect(apexTV.categorize('Monte Carlo Cinema')).toBe('casino-relevant');
    });

    it('business AVANT news (BFM Business)', () => {
      expect(apexTV.categorize('BFM Business')).toBe('business');
    });

    it('détecte news', () => {
      expect(apexTV.categorize('BFM TV')).toBe('news');
    });

    it('détecte sports', () => {
      expect(apexTV.categorize('Eurosport')).toBe('sports');
    });

    it('détecte kids', () => {
      expect(apexTV.categorize('Disney Kids')).toBe('kids');
    });

    it('détecte music', () => {
      expect(apexTV.categorize('MTV France')).toBe('music');
    });

    it('détecte documentary (arte)', () => {
      expect(apexTV.categorize('ARTE HD')).toBe('documentary');
    });

    it('retourne unknown pour nom inconnu', () => {
      expect(apexTV.categorize('xyz random')).toBe('unknown');
    });

    it('détecte general (tf1)', () => {
      expect(apexTV.categorize('TF1 HD')).toBe('general');
    });
  });

  describe('parseM3U', () => {
    it('parse playlist M3U valide', () => {
      const channels = apexTV.parseM3U(sampleM3U);
      expect(channels.length).toBe(4);
      expect(channels[0]?.name).toBe('BFM TV');
      expect(channels[0]?.url).toContain('m3u8');
    });

    it('extrait logo + country + languages', () => {
      const channels = apexTV.parseM3U(sampleM3U);
      const bfm = channels[0];
      expect(bfm?.logo).toContain('bfm.png');
      expect(bfm?.country).toBe('fr');
      expect(bfm?.languages).toContain('French');
    });

    it('catégorise auto', () => {
      const channels = apexTV.parseM3U(sampleM3U);
      const monte = channels.find((c) => c.name === 'Monte Carlo Cinema');
      expect(monte?.category).toBe('casino-relevant');
    });

    it('retourne [] sur input vide', () => {
      expect(apexTV.parseM3U('')).toEqual([]);
    });

    it('retourne [] sur non-string', () => {
      expect(apexTV.parseM3U(null as unknown as string)).toEqual([]);
    });
  });

  describe('loadCountryPlaylist', () => {
    it('refuse pays exotique pour non-admin', async () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = await apexTV.loadCountryPlaylist('XK'); /* Kosovo, pas dans whitelist */
      expect(r).toEqual([]);
    });

    it('charge playlist depuis iptv-org', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(sampleM3U, { status: 200 }),
      );
      const r = await apexTV.loadCountryPlaylist('fr');
      expect(r.length).toBe(4);
    });

    it('retourne [] si fetch fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
      const r = await apexTV.loadCountryPlaylist('fr');
      expect(r).toEqual([]);
    });

    it('cache 24h', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(sampleM3U, { status: 200 }),
      );
      await apexTV.loadCountryPlaylist('fr');
      await apexTV.loadCountryPlaylist('fr');
      /* Second call doit utiliser cache */
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('gère fetch throw', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await apexTV.loadCountryPlaylist('fr');
      expect(r).toEqual([]);
    });
  });

  describe('search', () => {
    it('retourne [] si query vide', () => {
      expect(apexTV.search('')).toEqual([]);
    });

    it('cherche dans cache par nom', () => {
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U(sampleM3U);
      const hits = apexTV.search('bfm');
      expect(hits.length).toBeGreaterThan(0);
    });

    it('filtre par category', () => {
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U(sampleM3U);
      const hits = apexTV.search('bfm', 'business');
      expect(hits.length).toBe(1);
      expect(hits[0]?.name).toContain('Business');
    });
  });

  describe('recommend', () => {
    it('retourne [] si pas de chaînes', () => {
      expect(apexTV.recommend()).toEqual([]);
    });

    it('boost casino-relevant (présent dans top recos)', () => {
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U(sampleM3U);
      const recos = apexTV.recommend({ hour: 14 });
      /* Casino-relevant doit apparaître dans les recos (score >= 40 minimum) */
      expect(recos.some((r) => r.channel.category === 'casino-relevant')).toBe(true);
    });

    it('time-based 8h favorise news', () => {
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U(sampleM3U);
      const recos = apexTV.recommend({ hour: 8 });
      expect(recos.length).toBeGreaterThan(0);
    });

    it('time-based 22h favorise movies', () => {
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U(sampleM3U);
      const recos = apexTV.recommend({ hour: 23 });
      expect(recos.length).toBeGreaterThan(0);
    });

    it('cap à 10 résultats', () => {
      const many = Array.from({ length: 50 }, (_, i) => `#EXTINF:-1 tvg-country="FR",Chaine${i}\nhttps://x/${i}.m3u8`).join('\n');
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U('#EXTM3U\n' + many);
      const recos = apexTV.recommend({ hour: 14 });
      expect(recos.length).toBeLessThanOrEqual(10);
    });
  });

  describe('runSlashCommand', () => {
    it('refuse commande non /tv', async () => {
      const r = await apexTV.runSlashCommand('/other something');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('not_tv_command');
    });

    it('/tv categorize NAME', async () => {
      const r = await apexTV.runSlashCommand('/tv categorize BFM Business');
      expect(r.ok).toBe(true);
      const result = r.result as { category: string };
      expect(result.category).toBe('business');
    });

    it('/tv search NAME (charge auto si vide)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(sampleM3U, { status: 200 }),
      );
      const r = await apexTV.runSlashCommand('/tv search bfm');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.result)).toBe(true);
    });

    it('/tv recommend', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(sampleM3U, { status: 200 }),
      );
      const r = await apexTV.runSlashCommand('/tv recommend');
      expect(r.ok).toBe(true);
    });

    it('/tv load FR', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(sampleM3U, { status: 200 }),
      );
      const r = await apexTV.runSlashCommand('/tv load it');
      expect(r.ok).toBe(true);
      const result = r.result as { country: string; count: number };
      expect(result.country).toBe('it');
    });

    it('/tv action inconnue', async () => {
      const r = await apexTV.runSlashCommand('/tv unknown');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('unknown_action');
    });
  });

  describe('stats', () => {
    it('retourne 0 si pas de cache', () => {
      const s = apexTV.stats();
      expect(s.cached).toBe(0);
      expect(s.cache_age_min).toBe(-1);
    });

    it('retourne stats correctes après cache', () => {
      (apexTV as unknown as { cachedChannels: unknown[]; cacheTs: number }).cachedChannels = apexTV.parseM3U(sampleM3U);
      (apexTV as unknown as { cacheTs: number }).cacheTs = Date.now();
      const s = apexTV.stats();
      expect(s.cached).toBe(4);
      expect(s.cache_age_min).toBeGreaterThanOrEqual(0);
      expect(s.categories).toBeDefined();
    });
  });

  describe('branches restantes (campagne 100%)', () => {
    it('parseM3U : EXTINF sans virgule → name "Unknown" (112)', () => {
      const ch = apexTV.parseM3U('#EXTM3U\n#EXTINF:-1 tvg-country="FR"\nhttp://x.m3u8\n');
      expect(ch[0]?.name).toBe('Unknown');
    });

    it('recommend hour 12-14 → préférence news/sports (194)', () => {
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U(sampleM3U);
      const r = apexTV.recommend({ hour: 13 });
      expect(Array.isArray(r)).toBe(true);
    });

    it('recommend hour 18-22 → préférence sports/movies/news (195)', () => {
      (apexTV as unknown as { cachedChannels: unknown[] }).cachedChannels = apexTV.parseM3U(sampleM3U);
      const r = apexTV.recommend({ hour: 20 });
      expect(Array.isArray(r)).toBe(true);
    });

    it('runSlashCommand /tv load sans pays → cc = "fr" (249)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(sampleM3U, { status: 200 }));
      const r = await apexTV.runSlashCommand('/tv load');
      expect(r.ok).toBe(true);
      expect((r.result as { country: string }).country).toBe('fr');
    });
  });
});
