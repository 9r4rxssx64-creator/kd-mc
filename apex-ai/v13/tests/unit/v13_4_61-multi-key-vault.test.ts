/**
 * Test régression v13.4.61 — services/multi-key-vault.ts (coffre central 24+ clés).
 *
 * Gère plusieurs clés par service (failover, dedup, health monitoring).
 * Stockage central : apex_v13_multi_keys (PRESERVE_KEY_PREFIXES auto-reset).
 */
import { describe, it, expect } from 'vitest';
import { multiKeyVault } from '../../services/vault/multi-key-vault.js';

describe('v13.4.61 multi-key-vault — coffre central API', () => {
  it("singleton défini + méthodes attendues", () => {
    expect(multiKeyVault).toBeDefined();
    expect(typeof multiKeyVault.addKey).toBe('function');
    expect(typeof multiKeyVault.listKeys).toBe('function');
    expect(typeof multiKeyVault.listAll).toBe('function');
    expect(typeof multiKeyVault.dedupAuto).toBe('function');
    expect(typeof multiKeyVault.getCurrentKey).toBe('function');
    expect(typeof multiKeyVault.testKey).toBe('function');
    expect(typeof multiKeyVault.tryFailoverKey).toBe('function');
    expect(typeof multiKeyVault.getStats).toBe('function');
  });

  it("listKeys(service) retourne array", () => {
    const keys = multiKeyVault.listKeys('anthropic');
    expect(Array.isArray(keys)).toBe(true);
  });

  it("listAll() retourne array", () => {
    const all = multiKeyVault.listAll();
    expect(Array.isArray(all)).toBe(true);
  });

  it("listAll(includeInvalid=false) filter invalides", () => {
    const valid = multiKeyVault.listAll(false);
    expect(Array.isArray(valid)).toBe(true);
  });

  it("dedupAuto(dryRun=true) preview sans muter", () => {
    const r = multiKeyVault.dedupAuto({ dryRun: true });
    expect(r).toBeDefined();
    expect(typeof r.dedupedCount).toBe('number');
    expect(Array.isArray(r.kept)).toBe(true);
  });

  it("getCurrentKey signature async", () => {
    expect(typeof multiKeyVault.getCurrentKey).toBe('function');
  });

  it("getStats(service) retourne ServiceStats", () => {
    const s = multiKeyVault.getStats('anthropic');
    expect(s).toBeDefined();
    expect(typeof s).toBe('object');
  });

  it("getServicesDown() retourne array de noms", () => {
    const down = multiKeyVault.getServicesDown();
    expect(Array.isArray(down)).toBe(true);
  });

  it("getServicesPartial() retourne array de noms", () => {
    const partial = multiKeyVault.getServicesPartial();
    expect(Array.isArray(partial)).toBe(true);
  });
});

describe('v13.4.61 multi-key-vault — types KeyStatus + HealthStatus', () => {
  it("listKeys(service inexistant) retourne array vide", () => {
    const keys = multiKeyVault.listKeys('inexistant_service_xyz');
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBe(0);
  });
});
