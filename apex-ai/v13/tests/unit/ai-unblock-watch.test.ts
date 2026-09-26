/**
 * APEX v13 — Tests AI Unblock Watch (Sprint 13.3.71 anti-blocage IA).
 *
 * Couvre :
 * - Classification HTTP status (auth_fail / quota / rate_limit / server_error / network / ok)
 * - Probe provider success vs error
 * - Failover triggered après 2 fails consécutifs
 * - Recovery reset failures
 * - Health log persistence (cap 200)
 * - Reset state
 * - Pick fallback provider
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiUnblockWatch, type UnblockProviderId } from '../../services/sentinels/ai-unblock-watch.js';

function mockResponse(status: number): Response {
  return new Response(null, { status });
}

describe('ai-unblock-watch — anti-blocage IA + auto-failover', () => {
  beforeEach(() => {
    localStorage.clear();
    aiUnblockWatch.reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('classifyHttpStatus', () => {
    it('classifie 401 → auth_fail', () => {
      expect(aiUnblockWatch.classifyHttpStatus(401)).toBe('auth_fail');
    });
    it('classifie 402 → quota', () => {
      expect(aiUnblockWatch.classifyHttpStatus(402)).toBe('quota');
    });
    it('classifie 429 → rate_limit', () => {
      expect(aiUnblockWatch.classifyHttpStatus(429)).toBe('rate_limit');
    });
    it('classifie 500/503 → server_error', () => {
      expect(aiUnblockWatch.classifyHttpStatus(500)).toBe('server_error');
      expect(aiUnblockWatch.classifyHttpStatus(503)).toBe('server_error');
    });
    it('classifie 0 → network', () => {
      expect(aiUnblockWatch.classifyHttpStatus(0)).toBe('network');
    });
    it('classifie 200/204/400 → ok (service vivant)', () => {
      expect(aiUnblockWatch.classifyHttpStatus(200)).toBe('ok');
      expect(aiUnblockWatch.classifyHttpStatus(204)).toBe('ok');
      expect(aiUnblockWatch.classifyHttpStatus(400)).toBe('ok');
    });
  });

  describe('probeProvider', () => {
    it('probe success rapide → ok=true, reason=ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      const result = await aiUnblockWatch.probeProvider('anthropic');
      expect(result.ok).toBe(true);
      expect(result.reason).toBe('ok');
      expect(result.status).toBe(200);
    });

    it('probe 401 → ok=false, reason=auth_fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(401));
      const result = await aiUnblockWatch.probeProvider('anthropic');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('auth_fail');
    });

    it('probe network error → ok=false, reason=network, error capturé', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS lookup failed'));
      const result = await aiUnblockWatch.probeProvider('groq');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('network');
      expect(result.error).toBe('DNS lookup failed');
    });
  });

  describe('runOnce — failover & recovery', () => {
    it('1 fail isolé → pas de failover triggered', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockResolvedValue(mockResponse(200));
      /* 1 fail uniquement sur anthropic */
      fetchSpy.mockResolvedValueOnce(mockResponse(401)); /* anthropic */
      const result = await aiUnblockWatch.runOnce();
      expect(result.failoverTriggered.length).toBe(0);
    });

    it('2 fails consécutifs → failover triggered + entry health log', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      /* Mock anthropic toujours fail (toutes calls), autres OK */
      fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (u.includes('anthropic.com')) return mockResponse(401);
        return mockResponse(200);
      });

      await aiUnblockWatch.runOnce(); /* fail #1 */
      const result2 = await aiUnblockWatch.runOnce(); /* fail #2 → trigger */
      expect(result2.failoverTriggered).toContain('anthropic');
      const log = aiUnblockWatch.getHealthLog();
      expect(log.length).toBeGreaterThan(0);
      const failover = log.find((e) => e.failover_triggered === true);
      expect(failover).toBeDefined();
      expect(failover?.provider).toBe('anthropic');
    });

    it('Recovery après failover → reset consecutive_failures', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      /* fail x 2 puis OK */
      let calls = 0;
      fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (u.includes('groq')) {
          calls += 1;
          if (calls <= 2) return mockResponse(500);
          return mockResponse(200);
        }
        return mockResponse(200);
      });

      await aiUnblockWatch.runOnce();
      await aiUnblockWatch.runOnce();
      const result3 = await aiUnblockWatch.runOnce();
      const groqState = result3.healthyProviders.includes('groq');
      expect(groqState).toBe(true);
      const state = aiUnblockWatch.getState().find((s) => s.provider === 'groq');
      expect(state?.consecutive_failures).toBe(0);
      expect(state?.failover_active).toBe(false);
    });
  });

  describe('pickFallbackProvider', () => {
    it('retourne autre provider sain quand un est marqué failover', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (u.includes('anthropic.com')) return mockResponse(401);
        return mockResponse(200);
      });
      await aiUnblockWatch.runOnce();
      await aiUnblockWatch.runOnce(); /* anthropic = failover */
      const fallback = aiUnblockWatch.pickFallbackProvider('anthropic');
      const validFallbacks: UnblockProviderId[] = ['openrouter', 'groq', 'gemini'];
      expect(fallback).not.toBeNull();
      if (fallback) expect(validFallbacks).toContain(fallback);
    });
  });

  describe('reset', () => {
    it('reset clear state + log localStorage', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(401));
      await aiUnblockWatch.runOnce();
      await aiUnblockWatch.runOnce();
      expect(aiUnblockWatch.getHealthLog().length).toBeGreaterThan(0);
      aiUnblockWatch.reset();
      expect(aiUnblockWatch.getHealthLog().length).toBe(0);
      const state = aiUnblockWatch.getState();
      for (const s of state) {
        expect(s.consecutive_failures).toBe(0);
        expect(s.failover_active).toBe(false);
      }
    });
  });
});
