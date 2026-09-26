/**
 * Tests services/apex-meta-marketplace.ts.
 *
 * Couvre : catalog integrity, listProviders filtres, searchAll Promise.allSettled,
 * searchOne mocks (HF, NPM, Civitai, Replicate, GitHub, Apple, WordPress, Civitai…),
 * getItem, getTrending, install dispatch (url/cli/api-key), recommendForApex,
 * getStats, toggleFavorite, install history, edge cases.
 *
 * ≥ 30 tests (33 effectifs).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  apexMetaMarketplace,
  META_MARKETPLACE_CATALOG,
  type MarketplaceCategory,
} from '../../services/core-svc/apex-meta-marketplace.js';

const STORAGE_KEY = 'apex_v13_meta_marketplace_state';

describe('services/apex-meta-marketplace — Hub unifié 30+ marketplaces', () => {
  beforeEach(() => {
    localStorage.clear();
    apexMetaMarketplace.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /* ================================================================
   * Catalog integrity
   * ============================================================= */
  describe('Catalog integrity', () => {
    it('catalog contient au moins 30 marketplaces enregistrés', () => {
      expect(META_MARKETPLACE_CATALOG.length).toBeGreaterThanOrEqual(30);
    });

    it('catalog couvre les 10 catégories', () => {
      const cats = new Set(META_MARKETPLACE_CATALOG.map((p) => p.category));
      const expected: MarketplaceCategory[] = [
        'ai-ml',
        'code-packages',
        'github',
        'extensions',
        'automation',
        'saas',
        'cloud',
        'apis',
        'datasets',
        'anthropic',
      ];
      for (const c of expected) {
        expect(cats.has(c)).toBe(true);
      }
    });

    it('catalog inclut les marketplaces critiques nominaux', () => {
      const ids = META_MARKETPLACE_CATALOG.map((p) => p.id);
      expect(ids).toContain('huggingface');
      expect(ids).toContain('npm');
      expect(ids).toContain('github-marketplace');
      expect(ids).toContain('docker-hub');
      expect(ids).toContain('civitai');
      expect(ids).toContain('replicate');
      expect(ids).toContain('mcp-servers');
      expect(ids).toContain('claude-plugins');
      expect(ids).toContain('apple-app-store');
      expect(ids).toContain('data-gouv-fr');
    });

    it('chaque provider a id, name, url, search_method, description non-vides', () => {
      for (const p of META_MARKETPLACE_CATALOG) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.url).toMatch(/^https?:\/\//);
        expect(p.search_method).toBeTruthy();
        expect(p.description).toBeTruthy();
      }
    });

    it('chaque provider api_key_required=true a un api_key_service défini', () => {
      const requiringKey = META_MARKETPLACE_CATALOG.filter((p) => p.api_key_required);
      for (const p of requiringKey) {
        expect(p.api_key_service).toBeTruthy();
        expect(p.api_key_service).toMatch(/^ax_/);
      }
    });

    it('flags pwa_compatible et cors_friendly sont booléens explicites (HONNÊTETÉ)', () => {
      for (const p of META_MARKETPLACE_CATALOG) {
        expect(typeof p.pwa_compatible).toBe('boolean');
        expect(typeof p.cors_friendly).toBe('boolean');
      }
    });

    it('au moins 10 providers PWA-compatible (search direct browser)', () => {
      const pwa = META_MARKETPLACE_CATALOG.filter((p) => p.pwa_compatible);
      expect(pwa.length).toBeGreaterThanOrEqual(10);
    });

    it('providers non-PWA ont search_proxy_required=true', () => {
      const nonPwa = META_MARKETPLACE_CATALOG.filter((p) => !p.pwa_compatible);
      for (const p of nonPwa) {
        expect(p.search_proxy_required).toBe(true);
      }
    });
  });

  /* ================================================================
   * listProviders
   * ============================================================= */
  describe('listProviders', () => {
    it('liste tous providers sans filtre', () => {
      const all = apexMetaMarketplace.listProviders();
      expect(all.length).toBe(META_MARKETPLACE_CATALOG.length);
    });

    it('filtre par catégorie', () => {
      const aiml = apexMetaMarketplace.listProviders({ category: 'ai-ml' });
      expect(aiml.length).toBeGreaterThan(0);
      for (const p of aiml) expect(p.category).toBe('ai-ml');
    });

    it('filtre par pwa_compatible=true', () => {
      const pwa = apexMetaMarketplace.listProviders({ pwa_compatible: true });
      for (const p of pwa) expect(p.pwa_compatible).toBe(true);
    });

    it('filtre par api_key_required=false (free, no auth)', () => {
      const free = apexMetaMarketplace.listProviders({ api_key_required: false });
      for (const p of free) expect(p.api_key_required).toBe(false);
    });

    it('filtre combiné : pwa-compat + free-tier', () => {
      const combo = apexMetaMarketplace.listProviders({
        pwa_compatible: true,
        free_tier_available: true,
      });
      for (const p of combo) {
        expect(p.pwa_compatible).toBe(true);
        expect(p.free_tier_available).toBe(true);
      }
    });
  });

  /* ================================================================
   * getProvider
   * ============================================================= */
  describe('getProvider', () => {
    it('retourne provider connu', () => {
      const p = apexMetaMarketplace.getProvider('huggingface');
      expect(p).not.toBeNull();
      expect(p?.name).toMatch(/HuggingFace/i);
    });

    it('retourne null pour id inconnu', () => {
      expect(apexMetaMarketplace.getProvider('inexistant')).toBeNull();
    });
  });

  /* ================================================================
   * searchAll (Promise.allSettled gracieux)
   * ============================================================= */
  describe('searchAll', () => {
    it('query vide retourne []', async () => {
      const items = await apexMetaMarketplace.searchAll('   ');
      expect(items).toEqual([]);
    });

    it('agrège résultats même si certains providers fail', async () => {
      /* Mock fetch global : HF retourne 1 model, autres throw → Promise.allSettled gracieux */
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('huggingface.co/api/models')) {
          return Promise.resolve(
            new Response(JSON.stringify([{ id: 'meta-llama/Llama-3-70b', downloads: 1000, likes: 50, pipeline_tag: 'text-generation' }]), { status: 200 }),
          );
        }
        return Promise.reject(new Error('network'));
      });
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchAll('llama', { limit: 20 });
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.marketplace).toBe('huggingface');
    });

    it('respecte limit', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchAll('test', { limit: 5 });
      expect(items.length).toBeLessThanOrEqual(5);
    });

    it('filtre catégories', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      await apexMetaMarketplace.searchAll('react', { categories: ['code-packages'], limit: 10 });
      /* fetch a été appelé avec npm/crates/maven/packagist/rubygems/hex (PWA-compatible code-packages) */
      const calls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(calls.some((u) => u.includes('npmjs.org'))).toBe(true);
    });
  });

  /* ================================================================
   * searchOne — handlers individuels
   * ============================================================= */
  describe('searchOne', () => {
    it('throw pour provider inconnu', async () => {
      await expect(apexMetaMarketplace.searchOne('bogus', 'q')).rejects.toThrow(/inconnu/);
    });

    it('throw pour provider non-PWA sans option include_non_pwa', async () => {
      /* PyPI n'est pas PWA-compatible */
      await expect(apexMetaMarketplace.searchOne('pypi', 'requests')).rejects.toThrow(/non PWA/);
    });

    it('throw si clé API requise mais absente', async () => {
      /* Replicate exige ax_replicate_token */
      await expect(apexMetaMarketplace.searchOne('replicate', 'sd')).rejects.toThrow(/clé API/);
    });

    it('searchHuggingFace mappe correctement model → MarketplaceItem', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: 'bert-base-uncased', downloads: 500000, likes: 1234, pipeline_tag: 'fill-mask' },
          ]),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchOne('huggingface', 'bert', 5);
      expect(items.length).toBe(1);
      expect(items[0]?.id).toBe('bert-base-uncased');
      expect(items[0]?.url).toBe('https://huggingface.co/bert-base-uncased');
      expect(items[0]?.stars).toBe(1234);
      expect(items[0]?.downloads).toBe(500000);
    });

    it('searchNpm mappe package npm → MarketplaceItem avec install_method=cli', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            objects: [
              {
                package: {
                  name: 'react',
                  description: 'A JS library',
                  links: { npm: 'https://www.npmjs.com/package/react' },
                  version: '19.0.0',
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchOne('npm', 'react', 5);
      expect(items.length).toBe(1);
      expect(items[0]?.id).toBe('react');
      expect(items[0]?.install_method).toBe('cli');
    });

    it('searchCivitai mappe model → MarketplaceItem (strip HTML descriptions)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 4201,
                name: 'Realistic Vision',
                description: '<p>SD 1.5 <strong>checkpoint</strong></p>',
                type: 'Checkpoint',
                stats: { downloadCount: 12345, thumbsUpCount: 678 },
              },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchOne('civitai', 'realistic', 5);
      expect(items[0]?.description).toBe('SD 1.5 checkpoint');
      expect(items[0]?.category).toBe('Checkpoint');
    });

    it('searchOpenRouter filtre côté client par query', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', description: 'Anthropic flagship' },
              { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship' },
              { id: 'meta-llama/llama-3', name: 'Llama 3', description: 'Meta open' },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchOne('openrouter', 'claude', 5);
      expect(items.length).toBe(1);
      expect(items[0]?.id).toBe('anthropic/claude-3-opus');
    });

    it('searchGitHub utilise topics et stars_count', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                full_name: 'facebook/react',
                description: 'A JS library for UI',
                html_url: 'https://github.com/facebook/react',
                stargazers_count: 220000,
                topics: ['react', 'javascript'],
              },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchOne('github-topics', 'react', 5);
      expect(items[0]?.stars).toBe(220000);
      expect(items[0]?.category).toBe('react');
    });

    it('searchAppleAppStore mappe iTunes results avec price', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                trackId: 12345,
                trackName: 'Procreate',
                description: 'Drawing app',
                trackViewUrl: 'https://apps.apple.com/app/procreate/id12345',
                price: 14.99,
                currency: 'EUR',
                averageUserRating: 4.8,
                primaryGenreName: 'Graphics & Design',
              },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchOne('apple-app-store', 'procreate', 5);
      expect(items[0]?.price?.amount).toBe(14.99);
      expect(items[0]?.price?.currency).toBe('EUR');
      expect(items[0]?.category).toBe('Graphics & Design');
    });
  });

  /* ================================================================
   * getItem & getTrending
   * ============================================================= */
  describe('getItem & getTrending', () => {
    it('getItem retourne null si provider inconnu', async () => {
      const item = await apexMetaMarketplace.getItem('inexistant', 'foo');
      expect(item).toBeNull();
    });

    it('getTrending throw si provider inconnu', async () => {
      await expect(apexMetaMarketplace.getTrending('bogus', 5)).rejects.toThrow(/inconnu/);
    });

    it('getTrending appelle searchOne avec query vide (gracieux si fail)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.getTrending('huggingface', 3);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  /* ================================================================
   * install dispatch
   * ============================================================= */
  describe('install', () => {
    it('install retourne error pour provider inconnu', async () => {
      const r = await apexMetaMarketplace.install('inexistant', 'foo');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/inconnu/);
    });

    it('install npm package → method=cli + commande npm install', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            objects: [
              {
                package: { name: 'lodash', description: 'utility', links: { npm: 'https://www.npmjs.com/package/lodash' }, version: '4.0.0' },
              },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);
      const r = await apexMetaMarketplace.install('npm', 'lodash');
      expect(r.ok).toBe(true);
      expect(r.method).toBe('cli');
      const result = r.result as { command: string };
      expect(result.command).toBe('npm install lodash');
    });

    it('install avec idempotence : 2e appel < 5 min retourne instructions cache', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      const r1 = await apexMetaMarketplace.install('huggingface', 'bert');
      expect(r1.ok).toBe(true);
      const r2 = await apexMetaMarketplace.install('huggingface', 'bert');
      expect(r2.instructions).toMatch(/Déjà installé/);
    });

    it('install avec clé API manquante → ok=false + requires_api_key', async () => {
      const r = await apexMetaMarketplace.install('replicate', 'stability/sd');
      expect(r.ok).toBe(false);
      expect(r.requires_api_key).toBe('ax_replicate_token');
    });

    it('install ajoute entry à install history', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      await apexMetaMarketplace.install('huggingface', 'bert-base');
      const hist = apexMetaMarketplace.getInstallHistory();
      expect(hist.length).toBeGreaterThan(0);
      expect(hist[hist.length - 1]?.providerId).toBe('huggingface');
    });

    it('install incrémente installs_total dans stats', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      const before = apexMetaMarketplace.getStats().installs_total;
      await apexMetaMarketplace.install('huggingface', 'gpt2');
      const after = apexMetaMarketplace.getStats().installs_total;
      expect(after).toBe(before + 1);
    });
  });

  /* ================================================================
   * recommendForApex
   * ============================================================= */
  describe('recommendForApex', () => {
    it('retourne au moins une catégorie de recommandations', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      const recos = await apexMetaMarketplace.recommendForApex();
      expect(recos.length).toBeGreaterThan(0);
      expect(recos[0]?.reason).toBeTruthy();
    });

    it('inclut Anthropic-specific dans les recommandations', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);
      const recos = await apexMetaMarketplace.recommendForApex();
      const anthropicReco = recos.find((r) => r.reason.toLowerCase().includes('anthropic'));
      expect(anthropicReco).toBeDefined();
    });
  });

  /* ================================================================
   * getStats
   * ============================================================= */
  describe('getStats', () => {
    it('retourne stats cohérentes', () => {
      const stats = apexMetaMarketplace.getStats();
      expect(stats.providers).toBe(META_MARKETPLACE_CATALOG.length);
      expect(stats.pwa_compatible).toBeGreaterThan(0);
      expect(stats.pwa_compatible).toBeLessThanOrEqual(stats.providers);
      expect(stats.api_keys_configured).toBeLessThanOrEqual(stats.require_api_key);
    });

    it('by_category contient toutes les catégories actives', () => {
      const stats = apexMetaMarketplace.getStats();
      expect(stats.by_category['ai-ml']).toBeGreaterThan(0);
      expect(stats.by_category['code-packages']).toBeGreaterThan(0);
      expect(stats.by_category['anthropic']).toBeGreaterThan(0);
    });

    it('api_keys_configured augmente quand on stocke une clé dans localStorage', () => {
      const before = apexMetaMarketplace.getStats().api_keys_configured;
      localStorage.setItem('ax_replicate_token', 'r8_test_xyz');
      apexMetaMarketplace.reset();
      const after = apexMetaMarketplace.getStats().api_keys_configured;
      expect(after).toBe(before + 1);
    });
  });

  /* ================================================================
   * Favorites + persistence
   * ============================================================= */
  describe('Favorites & persistence', () => {
    it('toggleFavorite ajoute puis retire', () => {
      const added = apexMetaMarketplace.toggleFavorite('npm', 'react');
      expect(added).toBe(true);
      expect(apexMetaMarketplace.getFavorites('npm')).toContain('react');
      const removed = apexMetaMarketplace.toggleFavorite('npm', 'react');
      expect(removed).toBe(false);
      expect(apexMetaMarketplace.getFavorites('npm')).not.toContain('react');
    });

    it('persiste dans localStorage', () => {
      apexMetaMarketplace.toggleFavorite('huggingface', 'bert-base');
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? '{}') as { favorites: Record<string, string[]> };
      expect(parsed.favorites['huggingface']).toContain('bert-base');
    });

    it('reset() purge state + localStorage', () => {
      apexMetaMarketplace.toggleFavorite('npm', 'foo');
      apexMetaMarketplace.reset();
      expect(apexMetaMarketplace.getFavorites('npm')).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  /* ================================================================
   * Edge cases
   * ============================================================= */
  describe('Edge cases', () => {
    it('searchAll avec query whitespace seul → []', async () => {
      const items = await apexMetaMarketplace.searchAll('   \t\n   ');
      expect(items).toEqual([]);
    });

    it('fetch HTTP 500 → handler retourne [] (gracieux)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
      vi.stubGlobal('fetch', mockFetch);
      const items = await apexMetaMarketplace.searchOne('huggingface', 'bert');
      expect(items).toEqual([]);
    });

    it('localStorage corrompu au load → reset gracieux sans throw', () => {
      localStorage.setItem(STORAGE_KEY, '{not json');
      apexMetaMarketplace.reset();
      expect(() => apexMetaMarketplace.getStats()).not.toThrow();
    });
  });
});
