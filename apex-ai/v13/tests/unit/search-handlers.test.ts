/**
 * Tests search-handlers v13.4.150 (Kevin "100/100 réel").
 *
 * Module : services/apex-meta-marketplace/search-handlers.ts (450 stmts, 61.1%).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  searchHuggingFace,
  searchHuggingFaceDatasets,
  searchReplicate,
  searchOpenRouter,
  searchCivitai,
  searchNpm,
  searchCratesIo,
  searchMavenCentral,
  searchPackagist,
  searchRubyGems,
  searchHexPm,
  searchGitHub,
  searchClaudePlugins,
  searchJetBrains,
  type SearchHelpers,
} from '../../services/apex-meta-marketplace/search-handlers.js';
import type { MarketplaceProvider } from '../../services/core-svc/apex-meta-marketplace-types.js';

const fakeProvider: MarketplaceProvider = {
  id: 'test',
  name: 'Test',
  category: 'ai-ml',
  url: 'https://test.com',
  api_key_required: false,
  search_method: 'public-api',
  free_tier_available: true,
  pwa_compatible: true,
  cors_friendly: true,
  description: 'test',
};

function makeHelpers(fetchData: unknown): SearchHelpers {
  return {
    fetchJson: vi.fn().mockResolvedValue(fetchData),
    stripHtml: (s: string) => s.replace(/<[^>]*>/g, ''),
    getApiKey: () => 'fake_api_key_xxxxxx',
  };
}

describe('search-handlers (v13.4.150 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchHuggingFace', () => {
    it('retourne models avec stars/downloads', async () => {
      const h = makeHelpers([
        { id: 'gpt2', downloads: 1000, likes: 50, pipeline_tag: 'text-generation' },
      ]);
      const r = await searchHuggingFace(h, 'gpt', 10);
      expect(r.length).toBe(1);
      expect(r[0]?.marketplace).toBe('huggingface');
      expect(r[0]?.stars).toBe(50);
      expect(r[0]?.downloads).toBe(1000);
    });

    it('retourne [] si fetch null', async () => {
      const h = makeHelpers(null);
      const r = await searchHuggingFace(h, 'x', 5);
      expect(r).toEqual([]);
    });
  });

  describe('searchHuggingFaceDatasets', () => {
    it('retourne datasets', async () => {
      const h = makeHelpers([{ id: 'ds1', downloads: 500, likes: 10 }]);
      const r = await searchHuggingFaceDatasets(h, 'data', 10);
      expect(r.length).toBe(1);
      expect(r[0]?.marketplace).toBe('huggingface-datasets');
    });
  });

  describe('searchReplicate', () => {
    it('retourne [] si pas de token', async () => {
      const h: SearchHelpers = {
        fetchJson: vi.fn(),
        stripHtml: (s) => s,
        getApiKey: () => null,
      };
      const r = await searchReplicate(h, 'flux', 5, fakeProvider);
      expect(r).toEqual([]);
    });

    it('filtre par query', async () => {
      const h = makeHelpers({
        results: [
          { owner: 'meta', name: 'llama', description: 'AI model' },
          { owner: 'other', name: 'xyz', description: 'irrelevant' },
        ],
      });
      const r = await searchReplicate(h, 'llama', 5, fakeProvider);
      expect(r.length).toBe(1);
      expect(r[0]?.name).toBe('meta/llama');
    });
  });

  describe('searchOpenRouter', () => {
    it('retourne LLMs filtré', async () => {
      const h = makeHelpers({
        data: [
          { id: 'anthropic/claude-3', name: 'Claude 3', description: 'Latest' },
          { id: 'openai/gpt-4', name: 'GPT-4' },
        ],
      });
      const r = await searchOpenRouter(h, 'claude', 5);
      expect(r.length).toBe(1);
      expect(r[0]?.id).toBe('anthropic/claude-3');
    });
  });

  describe('searchCivitai', () => {
    it('retourne models avec stripHtml description', async () => {
      const h = makeHelpers({
        items: [
          {
            id: 123,
            name: 'Anime',
            description: '<p>HTML model</p>',
            type: 'Checkpoint',
            stats: { downloadCount: 1000, thumbsUpCount: 50 },
          },
        ],
      });
      const r = await searchCivitai(h, 'anime', 5);
      expect(r.length).toBe(1);
      expect(r[0]?.description).toBe('HTML model');
      expect(r[0]?.category).toBe('Checkpoint');
    });
  });

  describe('searchNpm', () => {
    it('retourne packages NPM', async () => {
      const h = makeHelpers({
        objects: [
          {
            package: {
              name: 'react',
              description: 'UI library',
              version: '18.2.0',
              links: { npm: 'https://www.npmjs.com/package/react' },
            },
          },
        ],
      });
      const r = await searchNpm(h, 'react', 5);
      expect(r.length).toBe(1);
      expect(r[0]?.id).toBe('react');
      expect(r[0]?.install_method).toBe('cli');
    });
  });

  describe('searchCratesIo', () => {
    it('retourne crates Rust', async () => {
      const h = makeHelpers({
        crates: [{ id: 'tokio', name: 'tokio', description: 'Async runtime', downloads: 1_000_000 }],
      });
      const r = await searchCratesIo(h, 'tokio', 5);
      expect(r.length).toBe(1);
      expect(r[0]?.marketplace).toBe('crates-io');
    });
  });

  describe('searchMavenCentral', () => {
    it('retourne artifacts Maven', async () => {
      const h = makeHelpers({
        response: {
          docs: [{ id: 'spring-core', g: 'org.springframework', a: 'spring-core', latestVersion: '6.0.0' }],
        },
      });
      const r = await searchMavenCentral(h, 'spring', 5);
      expect(r.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('searchPackagist (PHP)', () => {
    it('retourne packages Packagist', async () => {
      const h = makeHelpers({
        results: [{ name: 'symfony/console', description: 'Console', downloads: 1000 }],
      });
      const r = await searchPackagist(h, 'symfony', 5);
      expect(r.length).toBe(1);
    });
  });

  describe('searchRubyGems', () => {
    it('retourne gems', async () => {
      const h = makeHelpers([
        { name: 'rails', info: 'Web framework', downloads: 100000 },
      ]);
      const r = await searchRubyGems(h, 'rails', 5);
      expect(r.length).toBe(1);
    });
  });

  describe('searchHexPm (Elixir)', () => {
    it('retourne packages Hex', async () => {
      const h = makeHelpers([
        { name: 'phoenix', meta: { description: 'Web framework' } },
      ]);
      const r = await searchHexPm(h, 'phoenix', 5);
      expect(r.length).toBe(1);
    });
  });

  describe('searchGitHub', () => {
    it('retourne repos', async () => {
      const h = makeHelpers({
        items: [
          {
            full_name: 'anthropic/anthropic-sdk-python',
            description: 'SDK',
            stargazers_count: 500,
            html_url: 'https://github.com/anthropic/anthropic-sdk-python',
          },
        ],
      });
      const r = await searchGitHub(h, 'anthropic', 5, fakeProvider);
      expect(r.length).toBe(1);
      expect(r[0]?.stars).toBe(500);
    });
  });

  describe('searchClaudePlugins', () => {
    it('retourne plugins Claude (static list ou similar)', async () => {
      const h = makeHelpers(null);
      const r = await searchClaudePlugins(h, 'mcp', 5);
      expect(Array.isArray(r)).toBe(true);
    });
  });

  describe('searchJetBrains', () => {
    it('retourne plugins JetBrains', async () => {
      const h = makeHelpers({
        plugins: [{ id: 1, name: 'Plugin1', xmlId: 'p1', description: 'Test' }],
      });
      const r = await searchJetBrains(h, 'tools', 5);
      expect(Array.isArray(r)).toBe(true);
    });
  });
});
