/**
 * Tests apex-credential-tester branches v13.4.146 (Kevin "100/100 réel").
 *
 * Module : services/apex-credential-tester.ts (278 stmts, était 59%).
 * Focus: tester TOUS les chemins HTTP status branches pour +coverage branches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockVault } = vi.hoisted(() => ({
  mockVault: { readKey: vi.fn() },
}));

vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));

import {
  testRuntime,
  testAllConfigured,
  isServiceSupported,
  listSupportedServices,
} from '../../services/vault/apex-credential-tester.js';

describe('apex-credential-tester branches (v13.4.146)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVault.readKey.mockResolvedValue('valid_token_xxxxxxxx');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('testRuntime — chemins error', () => {
    it('retourne untested si service inconnu', async () => {
      const r = await testRuntime('unknownservice');
      expect(r.status).toBe('untested');
      expect(r.detail).toContain('no test config');
    });

    it('retourne network_error si vault.readKey throw', async () => {
      mockVault.readKey.mockRejectedValue(new Error('vault locked'));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('network_error');
      expect(r.detail).toContain('vault read failed');
    });

    it('retourne invalid si token vide', async () => {
      mockVault.readKey.mockResolvedValue('');
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('invalid');
      expect(r.detail).toContain('token missing');
    });

    it('retourne invalid si token trop court', async () => {
      mockVault.readKey.mockResolvedValue('short');
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('invalid');
    });
  });

  describe('testRuntime — HTTP status branches', () => {
    it('retourne ok si HTTP 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('ok');
      expect(r.http_status).toBe(200);
    });

    it('retourne ok si HTTP 204', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 204 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('ok');
    });

    it('retourne invalid si HTTP 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('invalid');
      expect(r.detail).toContain('auth failed');
    });

    it('retourne invalid si HTTP 403', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Forbidden', { status: 403 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('invalid');
    });

    it('retourne rate_limited si HTTP 429', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Too Many', { status: 429 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('rate_limited');
    });

    it('retourne quota_exceeded si HTTP 402', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Payment Required', { status: 402 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('quota_exceeded');
    });

    it('retourne network_error si HTTP 500', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Server Error', { status: 500 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('network_error');
    });

    it('retourne network_error si HTTP 502', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad Gateway', { status: 502 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('network_error');
    });

    it('retourne invalid si HTTP 400 inattendu', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad Request', { status: 400 }));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('invalid');
      expect(r.detail).toContain('unexpected');
    });
  });

  describe('testRuntime — rate limit + timeout', () => {
    it('parse x-ratelimit-remaining header', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'x-ratelimit-remaining': '100' },
        }),
      );
      const r = await testRuntime('anthropic');
      expect(r.rate_limit_remaining).toBe(100);
    });

    it('détecte abort/timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('network_error');
      expect(r.detail).toBe('timeout 8s');
    });

    it('détecte error network générique', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
      const r = await testRuntime('anthropic');
      expect(r.status).toBe('network_error');
      expect(r.detail).toContain('network down');
    });
  });

  describe('testAllConfigured', () => {
    it('teste tous les services en parallèle', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const results = await testAllConfigured();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.service).toBeTypeOf('string');
        expect(r.status).toBeTypeOf('string');
        expect(r.ts).toBeTypeOf('number');
      });
    });

    it('gère échecs Promise.allSettled', async () => {
      mockVault.readKey.mockRejectedValue(new Error('vault offline'));
      const results = await testAllConfigured();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('isServiceSupported / listSupportedServices', () => {
    it('isServiceSupported case-insensitive', () => {
      expect(isServiceSupported('ANTHROPIC')).toBe(true);
      expect(isServiceSupported('anthropic')).toBe(true);
    });

    it('isServiceSupported false pour service inconnu', () => {
      expect(isServiceSupported('xyz_unknown_svc')).toBe(false);
    });

    it('listSupportedServices retourne tableau', () => {
      const list = listSupportedServices();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(5);
      expect(list).toContain('anthropic');
    });
  });
});
