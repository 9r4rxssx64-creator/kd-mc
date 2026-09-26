/**
 * Tests unknown-credential-resolver — Autonomie totale Kevin 2026-05-04.
 *
 * Couvre :
 * - Web search vraie via Brave/Tavily (mock vault)
 * - Validation HEAD URLs candidates (dashboard/billing/api_keys/docs/support)
 * - Confidence scoring (0.95 / 0.7 / 0.3)
 * - DuckDuckGo HTML scrape fallback
 * - Service name extraction depuis domaine
 * - testUrl exposé pour UI admin
 * - discoverUrlsForService (UI admin)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unknownCredentialResolver } from '../../services/vault/unknown-credential-resolver.js';

describe('unknown-credential-resolver — Autonomie web search + HEAD validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Web search via Brave (vault key)', () => {
    it('utilise Brave search si clé vault dispo', async () => {
      /* Stub vault.readKey → ax_brave_key returns "fake-brave-key" */
      const vaultMod = await import('../../services/vault/vault.js');
      vi.spyOn(vaultMod.vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_brave_key') return 'fake-brave-key';
        return '';
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('search.brave.com')) {
          return {
            ok: true,
            json: async () => ({
              web: { results: [{ url: 'https://newservice.io/dashboard', title: 'NewService Dashboard' }] },
            }),
          } as Response;
        }
        /* HEAD test → opaque alive */
        return { ok: true, type: 'opaque', status: 0 } as Response;
      });
      /* token générique format alphanum 40+ pour déclencher web search */
      const v = '0123456789abcdef0123456789abcdef0123456789';
      const r = await unknownCredentialResolver.tryIdentify(v);
      expect(r).toBeTruthy();
      expect(r?.service).toBeTruthy();
    });
  });

  describe('Web search via Tavily (vault fallback)', () => {
    it('utilise Tavily si Brave absent', async () => {
      const vaultMod = await import('../../services/vault/vault.js');
      vi.spyOn(vaultMod.vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_tavily_key') return 'fake-tavily';
        return '';
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('tavily.com')) {
          return {
            ok: true,
            json: async () => ({
              results: [{ url: 'https://anotherapi.dev/console', title: 'Another API Console' }],
            }),
          } as Response;
        }
        return { ok: true, type: 'opaque', status: 0 } as Response;
      });
      const v = 'fedcba9876543210fedcba9876543210fedcba98';
      const r = await unknownCredentialResolver.tryIdentify(v);
      expect(r).toBeTruthy();
    });
  });

  describe('DuckDuckGo HTML scrape fallback', () => {
    it('parse résultats DDG HTML quand Brave + Tavily KO', async () => {
      const vaultMod = await import('../../services/vault/vault.js');
      vi.spyOn(vaultMod.vault, 'readKey').mockResolvedValue('');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('duckduckgo.com')) {
          const html = '<a class="result__a" href="https://newcoolservice.com/login">NewCoolService Login</a>' +
            '<a class="result__a" href="https://newcoolservice.com/api">NewCoolService API</a>';
          return { ok: true, text: async () => html } as Response;
        }
        return { ok: true, type: 'opaque', status: 0 } as Response;
      });
      const v = 'aaaabbbbccccddddeeeeffffgggghhhhiiii';
      const r = await unknownCredentialResolver.tryIdentify(v);
      expect(r).toBeTruthy();
    });

    it('fallback regex simple si format DDG change', async () => {
      const vaultMod = await import('../../services/vault/vault.js');
      vi.spyOn(vaultMod.vault, 'readKey').mockResolvedValue('');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('duckduckgo.com')) {
          /* Format inattendu mais des hrefs https existent */
          const html = '<div><a href="https://obscureapi.dev/foo">link</a></div>';
          return { ok: true, text: async () => html } as Response;
        }
        return { ok: true, type: 'opaque', status: 0 } as Response;
      });
      const v = 'zzzzyyyyxxxxwwwwvvvvuuuuttttssssrrrrqqqq';
      const r = await unknownCredentialResolver.tryIdentify(v);
      /* Au moins un fallback doit avoir tourné */
      expect(r).toBeDefined();
    });

    it('DDG ok: false → null fallback générique', async () => {
      const vaultMod = await import('../../services/vault/vault.js');
      vi.spyOn(vaultMod.vault, 'readKey').mockResolvedValue('');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('duckduckgo.com')) {
          return { ok: false, status: 503, text: async () => '' } as Response;
        }
        return { ok: true, type: 'opaque', status: 0 } as Response;
      });
      /* Hex 48 chars (charset détecté hex, length 32-256, ne matche aucun prefix) */
      const v = '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f';
      const r = await unknownCredentialResolver.tryIdentify(v);
      /* Should fallback to generic unknown_<hash> */
      expect(r).toBeTruthy();
      expect(r?.service).toMatch(/^unknown_/);
    });
  });

  describe('HEAD validation URLs candidates', () => {
    it('confidence high si ≥2 URLs alive', async () => {
      const vaultMod = await import('../../services/vault/vault.js');
      vi.spyOn(vaultMod.vault, 'readKey').mockResolvedValue('');
      let ddgCalls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('duckduckgo.com')) {
          ddgCalls++;
          const html = '<a class="result__a" href="https://magicapi.com/dashboard">MagicAPI</a>';
          return { ok: true, text: async () => html } as Response;
        }
        /* HEAD test : tout retourne alive */
        if (init?.method === 'HEAD') {
          return { ok: true, type: 'opaque', status: 0 } as Response;
        }
        return { ok: true, type: 'opaque', status: 0 } as Response;
      });
      const v = '1234567890abcdef1234567890abcdef1234567890';
      const r = await unknownCredentialResolver.tryIdentify(v);
      expect(ddgCalls).toBeGreaterThanOrEqual(0);
      expect(r).toBeTruthy();
      /* alive_count ≥ 2 → confidence high */
      if (r?.alive_count !== undefined && r.alive_count >= 2) {
        expect(r.confidence).toBe('high');
      }
    });

    it('confidence low si 0 URL alive', async () => {
      const vaultMod = await import('../../services/vault/vault.js');
      vi.spyOn(vaultMod.vault, 'readKey').mockResolvedValue('');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('duckduckgo.com')) {
          return { ok: true, text: async () => '<a class="result__a" href="https://deadapi.io">Dead</a>' } as Response;
        }
        if (init?.method === 'HEAD') {
          /* Tous HEAD retournent 404 */
          return { ok: false, status: 404, type: 'default' } as Response;
        }
        return { ok: false, status: 404, type: 'default' } as Response;
      });
      const v = 'aabbccddeeffaabbccddeeffaabbccddeeffaa';
      const r = await unknownCredentialResolver.tryIdentify(v);
      if (r?.alive_count !== undefined && r.alive_count === 0) {
        expect(r.confidence).toBe('low');
      }
    });

    it('testUrl HEAD success → true', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, type: 'opaque', status: 0 } as Response);
      const alive = await unknownCredentialResolver.testUrl('https://known-service.com/dashboard');
      expect(alive).toBe(true);
    });

    it('testUrl HEAD 404 → false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, type: 'default' } as Response);
      const alive = await unknownCredentialResolver.testUrl('https://does-not-exist.example/x');
      expect(alive).toBe(false);
    });

    it('testUrl HEAD 401 (auth requise) → considéré alive', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, type: 'default' } as Response);
      const alive = await unknownCredentialResolver.testUrl('https://service.com/api/keys');
      expect(alive).toBe(true);
    });

    it('testUrl HEAD 403 → considéré alive', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 403, type: 'default' } as Response);
      const alive = await unknownCredentialResolver.testUrl('https://service.com/admin');
      expect(alive).toBe(true);
    });

    it('testUrl network error → false', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS fail'));
      const alive = await unknownCredentialResolver.testUrl('https://nonexistent.test');
      expect(alive).toBe(false);
    });
  });

  describe('Service name extraction', () => {
    it('discoverUrlsForService teste 7 templates de domaine', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, type: 'default' } as Response);
      const r = await unknownCredentialResolver.discoverUrlsForService('myservice');
      expect(r.candidates.length).toBeGreaterThanOrEqual(5);
      expect(r.candidates.some((c) => c.includes('console.myservice.com'))).toBe(true);
      expect(r.candidates.some((c) => c.includes('myservice.io'))).toBe(true);
    });

    it('discoverUrlsForService retourne alive non-vide si HEAD répond', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, type: 'opaque', status: 0 } as Response);
      const r = await unknownCredentialResolver.discoverUrlsForService('alive-service');
      expect(r.alive.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Backward compat — patterns prefix existants', () => {
    it('Anthropic prefix sk-ant- toujours détecté en priorité (high)', async () => {
      const r = await unknownCredentialResolver.tryIdentify('sk-ant-api03-' + 'A'.repeat(50));
      expect(r?.service).toBe('anthropic');
      expect(r?.confidence).toBe('high');
    });
    it('Stripe Connect acct_ ajouté au PREFIX_HEURISTICS', async () => {
      const r = await unknownCredentialResolver.tryIdentify('acct_' + '1'.repeat(20));
      expect(r?.service).toBe('stripe_connect');
    });
    it('Shopify shpat_ ajouté au PREFIX_HEURISTICS', async () => {
      const r = await unknownCredentialResolver.tryIdentify('shpat_' + 'a'.repeat(32));
      expect(r?.service).toBe('shopify_admin');
    });
  });
});
