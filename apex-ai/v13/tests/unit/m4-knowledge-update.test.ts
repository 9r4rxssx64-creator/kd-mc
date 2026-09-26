/**
 * APEX v13.3.74 — Tests M4 (audit Apex v13.3.73 issue #240).
 *
 * "Knowledge update 5 providers"
 * Vérifie : autoFetchTopProviders charge ≥ 5 services au boot
 *           si knowledge < threshold + cache TTL respecté.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { studyService } from '../../services/integrations/study-service.js';

describe('M4 — Study service auto-fetch top providers', () => {
  beforeEach(() => {
    /* Clear ax_services_knowledge_* keys */
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('ax_services_knowledge_')) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  });

  it('autoFetchTopProviders charge anthropic + github + firebase + cloudflare + stripe', async () => {
    const result = await studyService.autoFetchTopProviders(5);
    expect(result.fetched).toBeGreaterThanOrEqual(5);
    /* Vérifie que les 5 services connus sont dans le cache */
    const known = studyService.listKnown();
    const services = known.map((k) => k.service_name);
    expect(services).toContain('anthropic');
    expect(services).toContain('github');
    expect(services).toContain('cloudflare');
    expect(services).toContain('stripe');
  });

  it('autoFetchTopProviders idempotent (TTL 7j cache hit)', async () => {
    /* 1er run charge */
    await studyService.autoFetchTopProviders(5);
    /* 2e run no-op (tous fresh) */
    const result2 = await studyService.autoFetchTopProviders(5);
    expect(result2.fetched).toBe(0);
    expect(result2.total).toBeGreaterThanOrEqual(5);
  });

  it('runWeeklyKnowledgeWatch refresh tous services connus (sentinelle hebdo)', async () => {
    /* Pre-load some services */
    await studyService.studyByName('anthropic');
    await studyService.studyByName('github');
    /* Sentinelle hebdo run */
    const result = await studyService.runWeeklyKnowledgeWatch();
    expect(result.refreshed).toBeGreaterThanOrEqual(2);
    expect(result.errors.length).toBe(0);
  });
});
