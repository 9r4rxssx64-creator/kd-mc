/**
 * Tests apex-secrets-proxy-client v13.4.129 (Kevin "intègre secrets GitHub à Apex").
 *
 * Vérifie :
 *  - URL worker par défaut = 9r4rxssx64
 *  - proxyFetch construit bonne URL (anthropic/v1/messages, etc.)
 *  - PIN admin hashé envoyé en header x-apex-pin
 *  - checkHealth parse réponse correcte
 *  - setWorkerUrl override storage
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apexSecretsProxy } from '../../services/integrations/apex-secrets-proxy-client.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/vault/vault.js', () => ({
  vault: {
    readKey: vi.fn(async (key: string) => {
      if (key === 'ax_pin_kdmc_admin') return '200807';
      if (key === 'ax_pin') return '200807';
      return null;
    }),
  },
}));

describe('apex-secrets-proxy-client (v13.4.129 Kevin)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getWorkerUrl', () => {
    it('retourne URL par défaut 9r4rxssx64 si pas override', () => {
      expect(apexSecretsProxy.getWorkerUrl()).toBe(
        'https://apex-secrets-proxy.9r4rxssx64.workers.dev',
      );
    });

    it('utilise override si setWorkerUrl appelé', () => {
      apexSecretsProxy.setWorkerUrl('https://custom-domain.example.com/');
      expect(apexSecretsProxy.getWorkerUrl()).toBe('https://custom-domain.example.com');
    });

    it('strip trailing slash', () => {
      apexSecretsProxy.setWorkerUrl('https://example.com/api/');
      expect(apexSecretsProxy.getWorkerUrl()).toBe('https://example.com/api');
    });
  });

  describe('checkHealth', () => {
    it('retourne data si HTTP 200 + JSON valide', async () => {
      const mockBody = {
        ok: true,
        proxy: 'apex-secrets-proxy',
        available_providers: ['anthropic', 'groq', 'gemini'],
        total: 15,
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockBody), { status: 200 }),
      );
      const r = await apexSecretsProxy.checkHealth();
      expect(r.ok).toBe(true);
      expect(r.data?.available_providers).toContain('anthropic');
      expect(r.data?.total).toBe(15);
    });

    it('retourne ok=false si HTTP 503', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 503 }));
      const r = await apexSecretsProxy.checkHealth();
      expect(r.ok).toBe(false);
      expect(r.error).toContain('503');
    });

    it('retourne ok=false si fetch throw', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network down'));
      const r = await apexSecretsProxy.checkHealth();
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Network down');
    });
  });

  describe('proxyFetch', () => {
    it('construit URL correctement avec provider + path', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200 }),
      );
      await apexSecretsProxy.proxyFetch('anthropic', '/v1/messages', { method: 'POST' });
      expect(fetchSpy).toHaveBeenCalledOnce();
      const callArg = fetchSpy.mock.calls[0]?.[0];
      const url = typeof callArg === 'string' ? callArg : (callArg as Request).url;
      expect(url).toContain('apex-secrets-proxy.9r4rxssx64.workers.dev/anthropic/v1/messages');
    });

    it('injecte header x-apex-pin avec PIN hashé SHA-256', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200 }),
      );
      await apexSecretsProxy.proxyFetch('groq', '/v1/chat', { method: 'POST', body: '{}' });
      const optsArg = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const headers = optsArg.headers as Headers;
      const pinHeader = headers.get('x-apex-pin');
      expect(pinHeader).toBeTruthy();
      /* SHA-256 hex = 64 chars */
      expect(pinHeader?.length).toBe(64);
      /* PIN "200807" SHA-256 = cbb070... */
      expect(pinHeader).toBe('cbb070543b39ffeb3e41ed8a61c8fedcce493b93c0b071f7976207634954e373');
    });

    it('throw si PIN admin absent du vault', async () => {
      const { vault } = await import('../../services/vault/vault.js');
      vi.mocked(vault.readKey).mockResolvedValue(null);
      await expect(
        apexSecretsProxy.proxyFetch('anthropic', '/v1/messages'),
      ).rejects.toThrow(/PIN admin requis/);
    });

    it('default method GET si non spécifié', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{}', { status: 200 }),
      );
      await apexSecretsProxy.proxyFetch('tavily', '/search');
      const opts = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(opts.method).toBe('GET');
    });

    it('inject content-type json si body sans header', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{}', { status: 200 }),
      );
      await apexSecretsProxy.proxyFetch('anthropic', '/v1/messages', {
        method: 'POST',
        body: '{"test":true}',
      });
      const opts = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const headers = opts.headers as Headers;
      expect(headers.get('content-type')).toBe('application/json');
    });
  });

  describe('isProxyAvailable', () => {
    it('true si checkHealth OK + providers présents', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, proxy: 'apex', available_providers: ['anthropic'], total: 1 }),
          { status: 200 },
        ),
      );
      expect(await apexSecretsProxy.isProxyAvailable()).toBe(true);
    });

    it('false si proxy down', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Down'));
      expect(await apexSecretsProxy.isProxyAvailable()).toBe(false);
    });

    it('false si 0 providers configurés', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, proxy: 'apex', available_providers: [], total: 0 }),
          { status: 200 },
        ),
      );
      expect(await apexSecretsProxy.isProxyAvailable()).toBe(false);
    });
  });

  describe('PROXY_PROVIDERS constant', () => {
    it('liste tous les providers supportés', () => {
      const expected = [
        'anthropic', 'openai', 'groq', 'gemini', 'deepseek',
        'perplexity', 'tavily', 'pinecone', 'telegram', 'railway',
        'cloudflare', 'vonage', 'opn-lego', 'jwt', 'emailjs',
        // v13.4.278 (Kevin "Apex doit avoir accès à tous mes secrets GitHub")
        'xai', 'mistral', 'cohere', 'together', 'finnhub', 'pexels', 'replicate',
      ];
      expected.forEach((p) => {
        expect(apexSecretsProxy.PROXY_PROVIDERS).toContain(p);
      });
    });

    it('24 providers total (15 base + 7 v13.4.278 + cerebras v13.4.345 + qwen v13.4.366) — aligné sur la source', () => {
      /* Leçon #83 : préférer toContain à un comptage sec — le compte reste pour
         détecter une SUPPRESSION accidentelle, le toContain nomme le dernier ajout. */
      expect(apexSecretsProxy.PROXY_PROVIDERS).toContain('cerebras');
      expect(apexSecretsProxy.PROXY_PROVIDERS).toContain('qwen');
      expect(apexSecretsProxy.PROXY_PROVIDERS.length).toBe(24);
    });
  });
});
