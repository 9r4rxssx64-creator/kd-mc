/**
 * v13.4.346 — mémoire RAG Apex (kdmc-rag). Invariants : OFF par défaut (no-op),
 * fail-open total, auth PIN, recall/recallBlock filtrent correctement.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apexMemoryRag } from '../../services/ai/apex-memory-rag.js';

describe('v13.4.346 — apexMemoryRag', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    try { localStorage.clear(); } catch { /* noop */ }
    localStorage.setItem('ax_pin_kdmc_admin', '200807'); /* PIN pour l'auth header */
  });
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  it('DÉSACTIVÉ par défaut → remember=false, recall=[] (0 impact, aucun fetch)', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    expect(apexMemoryRag.isEnabled()).toBe(false);
    expect(await apexMemoryRag.remember('un souvenir')).toBe(false);
    expect(await apexMemoryRag.recall('question')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('activé + worker OK → remember=true et POST /upsert avec header x-apex-pin', async () => {
    apexMemoryRag.enable(true);
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, upserted: 1 }) });
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    expect(await apexMemoryRag.remember('Kevin habite Monaco')).toBe(true);
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/upsert');
    expect((opts.headers as Record<string, string>)['x-apex-pin']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('activé + worker OK → recall renvoie les matches', async () => {
    apexMemoryRag.enable(true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, matches: [{ id: 'a', score: 0.9, text: 'Monaco', meta: {} }] }),
    }) as unknown as typeof globalThis.fetch;
    const m = await apexMemoryRag.recall('où habite Kevin ?');
    expect(m.length).toBe(1);
    expect(m[0].text).toBe('Monaco');
  });

  it('recallBlock ne garde que score >= 0.6', async () => {
    apexMemoryRag.enable(true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, matches: [
        { id: 'a', score: 0.92, text: 'fait pertinent' },
        { id: 'b', score: 0.3, text: 'bruit non pertinent' },
      ] }),
    }) as unknown as typeof globalThis.fetch;
    const block = await apexMemoryRag.recallBlock('question test');
    expect(block).toContain('fait pertinent');
    expect(block).not.toContain('bruit non pertinent');
  });

  it('FAIL-OPEN : erreur réseau → remember=false, recall=[] (jamais throw)', async () => {
    apexMemoryRag.enable(true);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof globalThis.fetch;
    expect(await apexMemoryRag.remember('x')).toBe(false);
    expect(await apexMemoryRag.recall('y')).toEqual([]);
  });

  it('FAIL-OPEN : pas de PIN → no-op (remember=false)', async () => {
    apexMemoryRag.enable(true);
    localStorage.removeItem('ax_pin_kdmc_admin');
    localStorage.removeItem('ax_pin');
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    expect(await apexMemoryRag.remember('x')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  /* === v13.4.350 — AUTO-ON gated /health (audit amélioration Top #1) === */

  it('AUTO-ON : sans choix explicite + health cache frais OK → mémoire ACTIVE', () => {
    localStorage.setItem('apex_v13_rag_health_v1', JSON.stringify({ ok: true, ts: Date.now() }));
    expect(apexMemoryRag.isEnabled()).toBe(true);
  });

  it('AUTO-ON : health cache PÉRIMÉ (>6h) → mémoire OFF (pas de latence à l\'aveugle)', () => {
    localStorage.setItem('apex_v13_rag_health_v1', JSON.stringify({ ok: true, ts: Date.now() - 7 * 60 * 60 * 1000 }));
    expect(apexMemoryRag.isEnabled()).toBe(false);
  });

  it('OPT-OUT explicite ("false") GAGNE sur un health OK', () => {
    localStorage.setItem('apex_v13_rag_health_v1', JSON.stringify({ ok: true, ts: Date.now() }));
    apexMemoryRag.enable(false);
    expect(apexMemoryRag.isEnabled()).toBe(false);
  });

  it('probeHealth : worker répond → cache {ok:true} posé → isEnabled=true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof globalThis.fetch;
    expect(await apexMemoryRag.probeHealth()).toBe(true);
    const cached = JSON.parse(localStorage.getItem('apex_v13_rag_health_v1') ?? '{}') as { ok?: boolean };
    expect(cached.ok).toBe(true);
    expect(apexMemoryRag.isEnabled()).toBe(true);
  });

  it('probeHealth FAIL-OPEN : réseau KO → cache {ok:false}, jamais throw, mémoire OFF', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof globalThis.fetch;
    expect(await apexMemoryRag.probeHealth()).toBe(false);
    expect(apexMemoryRag.isEnabled()).toBe(false);
  });

  it('probeHealth : opt-out explicite → ne sonde même pas (0 fetch)', async () => {
    apexMemoryRag.enable(false);
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    expect(await apexMemoryRag.probeHealth()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
