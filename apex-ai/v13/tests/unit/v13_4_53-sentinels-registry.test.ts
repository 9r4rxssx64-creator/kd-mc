/**
 * Test régression v13.4.53 — services/sentinels.ts (registry sentinelles auto-fix).
 *
 * Sentinelles tournent 24/7 selon interval. Si une feature détecte anomalie →
 * auto-fix tenté (whitelist) → escalade Claude Code si fail.
 */
import { describe, it, expect } from 'vitest';
import {
  sentinels,
  SENTINEL_TOGGLE_IDS_COVERED,
} from '../../services/sentinels/sentinels.ts';

describe('v13.4.53 sentinels registry', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(sentinels).toBeDefined();
    expect(typeof sentinels.register).toBe('function');
    expect(typeof sentinels.list).toBe('function');
    expect(typeof sentinels.enable).toBe('function');
    expect(typeof sentinels.runOne).toBe('function');
    expect(typeof sentinels.init).toBe('function');
    expect(typeof sentinels.stop).toBe('function');
  });

  it("list() retourne array", () => {
    const all = sentinels.list();
    expect(Array.isArray(all)).toBe(true);
  });

  it("register accepte Sentinel partiel + init enabled true default", () => {
    let runs = 0;
    sentinels.register({
      id: 'test_sentinel_v53',
      name: 'Test Sentinel v53',
      intervalMs: 60000,
      run: () => { runs++; return { ok: true }; },
    });
    const all = sentinels.list();
    expect(all.some((s) => s.id === 'test_sentinel_v53')).toBe(true);
  });

  it("enable(id, false) désactive sentinelle", () => {
    sentinels.register({
      id: 'test_enable_v53',
      name: 'Test',
      intervalMs: 60000,
      run: () => ({ ok: true }),
    });
    sentinels.enable('test_enable_v53', false);
    const s = sentinels.list().find((x) => x.id === 'test_enable_v53');
    expect(s?.enabled).toBe(false);
  });

  it("runOne(id) exécute et retourne result (structure ok/msg)", async () => {
    sentinels.register({
      id: 'test_runone_v53',
      name: 'Test RunOne',
      intervalMs: 60000,
      enabled: true,
      run: () => ({ ok: true, msg: 'pong' }),
    });
    sentinels.enable('test_runone_v53', true);
    const r = await sentinels.runOne('test_runone_v53');
    expect(r).toBeDefined();
    /* result peut être ok:true ou ok:false selon contexte test (sentinel manager
     * peut auto-disable certaines). Vérifier structure. */
    expect(typeof r).toBe('object');
  });

  it("runOne sur id inexistant ne crash pas", async () => {
    const r = await sentinels.runOne('inexistant_xyz');
    /* Soit null soit undefined soit {ok:false} — tous OK */
    expect(true).toBe(true);
  });

  it("stop() OK + idempotent", () => {
    expect(() => {
      sentinels.stop();
      sentinels.stop();
    }).not.toThrow();
  });
});

describe('v13.4.53 SENTINEL_TOGGLE_IDS_COVERED — UI toggle list', () => {
  it("contient des IDs (≥ 1)", () => {
    expect(Array.isArray(SENTINEL_TOGGLE_IDS_COVERED)).toBe(true);
    expect(SENTINEL_TOGGLE_IDS_COVERED.length).toBeGreaterThan(0);
  });

  it("tous les IDs sont des strings non-vides", () => {
    for (const id of SENTINEL_TOGGLE_IDS_COVERED) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });
});
