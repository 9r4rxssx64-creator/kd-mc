/**
 * Test régression v13.4.72 — services/ai-key-rotation.ts.
 *
 * Failover key/provider auto + classifyError HTTP status.
 * Critique : router IA bascule next key OU provider mort si 401/403/quota.
 */
import { describe, it, expect } from 'vitest';
import {
  aiKeyRotation,
  classifyError,
} from '../../services/ai/ai-key-rotation.js';

describe('v13.4.72 ai-key-rotation — classifyError HTTP', () => {
  it("401 → auth_invalid", () => {
    expect(classifyError({ status: 401 })).toBe('auth_invalid');
  });

  it("403 → auth_invalid", () => {
    expect(classifyError({ status: 403 })).toBe('auth_invalid');
  });

  it("402 → quota_exhausted (balance vide)", () => {
    expect(classifyError({ status: 402 })).toBe('quota_exhausted');
  });

  it("429 → rate_limited", () => {
    expect(classifyError({ status: 429 })).toBe('rate_limited');
  });

  it("500 → server_error", () => {
    expect(classifyError({ status: 500 })).toBe('server_error');
  });

  it("502/503/504 → server_error", () => {
    expect(classifyError({ status: 502 })).toBe('server_error');
    expect(classifyError({ status: 503 })).toBe('server_error');
    expect(classifyError({ status: 504 })).toBe('server_error');
  });

  it("message 'invalid api key' → auth_invalid (sans status)", () => {
    expect(classifyError({ message: 'Invalid API key provided' })).toBe('auth_invalid');
  });

  it("message 'rate limit exceeded' → rate_limited", () => {
    expect(classifyError({ message: 'Rate limit exceeded' })).toBe('rate_limited');
  });

  it("message 'insufficient balance' → quota_exhausted", () => {
    expect(classifyError({ message: 'insufficient balance' })).toBe('quota_exhausted');
  });

  it("message 'timeout' → network", () => {
    expect(classifyError({ message: 'Request timeout' })).toBe('network');
  });

  it("message 'fetch failed' → network", () => {
    expect(classifyError({ message: 'fetch failed' })).toBe('network');
  });

  it("message 'aborted' → network", () => {
    expect(classifyError({ message: 'aborted' })).toBe('network');
  });

  it("400 (sans message) → unknown (4xx générique)", () => {
    expect(classifyError({ status: 400 })).toBe('unknown');
  });

  it("Aucun status ni message → unknown", () => {
    expect(classifyError({})).toBe('unknown');
  });

  it("status + message contradictoires → priorité status", () => {
    /* 401 prioritaire même si message dit 'timeout' */
    expect(classifyError({ status: 401, message: 'timeout' })).toBe('auth_invalid');
  });
});

describe('v13.4.72 ai-key-rotation — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(aiKeyRotation).toBeDefined();
    expect(typeof aiKeyRotation.getCurrentKey).toBe('function');
    expect(typeof aiKeyRotation.handleFailure).toBe('function');
    expect(typeof aiKeyRotation.recordSuccess).toBe('function');
    expect(typeof aiKeyRotation.onPasteDetect).toBe('function');
    expect(typeof aiKeyRotation.getStats).toBe('function');
    expect(typeof aiKeyRotation.getAllStats).toBe('function');
    expect(typeof aiKeyRotation.rankProviders).toBe('function');
    expect(typeof aiKeyRotation.reset).toBe('function');
    expect(typeof aiKeyRotation.resetAll).toBe('function');
    expect(typeof aiKeyRotation.reloadFromStorage).toBe('function');
    expect(typeof aiKeyRotation.isProviderDead).toBe('function');
    expect(typeof aiKeyRotation.getDeadUntil).toBe('function');
  });
});

describe('v13.4.72 ai-key-rotation — stats + dead tracking', () => {
  it("getStats(provider) retourne ProviderStats structuré", () => {
    const s = aiKeyRotation.getStats('anthropic');
    expect(s).toBeDefined();
    expect(s.provider).toBeDefined();
    expect(typeof s.total_calls).toBe('number');
    expect(typeof s.success_count).toBe('number');
    expect(typeof s.fail_count).toBe('number');
    expect(typeof s.avg_latency_ms).toBe('number');
    expect(typeof s.last_success_ts).toBe('number');
    expect(typeof s.last_fail_ts).toBe('number');
    expect(typeof s.dead_until_ts).toBe('number');
  });

  it("getAllStats() retourne array ProviderStats", () => {
    const all = aiKeyRotation.getAllStats();
    expect(Array.isArray(all)).toBe(true);
  });

  it("isProviderDead(service) retourne boolean", () => {
    expect(typeof aiKeyRotation.isProviderDead('anthropic')).toBe('boolean');
  });

  it("getDeadUntil(service) retourne number (0 si pas dead)", () => {
    const ts = aiKeyRotation.getDeadUntil('not_dead_service_xyz');
    expect(typeof ts).toBe('number');
  });

  it("recordSuccess(provider, latency) ne throw pas", () => {
    expect(() => aiKeyRotation.recordSuccess('anthropic', 250)).not.toThrow();
  });

  it("rankProviders() retourne Promise<array>", async () => {
    const r = await aiKeyRotation.rankProviders();
    expect(Array.isArray(r)).toBe(true);
    for (const item of r) {
      expect(typeof item.service).toBe('string');
      expect(typeof item.score).toBe('number');
      expect(typeof item.alive).toBe('boolean');
    }
  });

  it("reset(provider) ne throw pas", () => {
    expect(() => aiKeyRotation.reset('anthropic')).not.toThrow();
  });

  it("resetAll() ne throw pas", () => {
    expect(() => aiKeyRotation.resetAll()).not.toThrow();
  });

  it("reloadFromStorage() ne throw pas", () => {
    expect(() => aiKeyRotation.reloadFromStorage()).not.toThrow();
  });
});
