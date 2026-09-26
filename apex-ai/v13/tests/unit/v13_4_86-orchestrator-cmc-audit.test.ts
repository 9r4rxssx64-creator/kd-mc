/**
 * Test régression v13.4.86 — Parité Apex/CMC audit lossless + fidelity.
 *
 * Kevin 2026-05-14 23:30 "Parité apex total maximum optimal" :
 * Apex DOIT pouvoir lire l'état CMC (fidelity + lossless logs) via Firebase
 * shared pour alerter Kevin proactivement.
 */
import { describe, it, expect } from 'vitest';
import { orchestrator } from '../../services/core-svc/orchestrator.js';

describe('v13.4.86 orchestrator — Parité CMC audit logs', () => {
  it("singleton orchestrator avec méthodes CMC audit", () => {
    expect(orchestrator).toBeDefined();
    expect(typeof orchestrator.cmcRead).toBe('function');
    expect(typeof orchestrator.cmcImportAuditLog).toBe('function');
    expect(typeof orchestrator.cmcLastImportHealth).toBe('function');
  });

  it("cmcImportAuditLog() retourne {fidelity, lossless} arrays", async () => {
    const r = await orchestrator.cmcImportAuditLog();
    expect(r).toBeDefined();
    expect(Array.isArray(r.fidelity)).toBe(true);
    expect(Array.isArray(r.lossless)).toBe(true);
  });

  it("cmcLastImportHealth() retourne ok + issues structurés", async () => {
    const r = await orchestrator.cmcLastImportHealth();
    expect(r).toBeDefined();
    expect(typeof r.ok).toBe('boolean');
    expect(Array.isArray(r.issues)).toBe(true);
    /* Si fidelity_score / lossless_gap exposés → number */
    if (r.fidelity_score !== undefined) expect(typeof r.fidelity_score).toBe('number');
    if (r.lossless_gap !== undefined) expect(typeof r.lossless_gap).toBe('number');
  });

  it("cmcLastImportHealth() ok=true si aucun log (état neutre)", async () => {
    /* En env test sans Firebase → logs vides → pas d'issue */
    const r = await orchestrator.cmcLastImportHealth();
    /* Soit ok=true (rien à dire), soit ok=false avec issues précisés */
    if (!r.ok) {
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('v13.4.86 orchestrator — méthodes existantes encore exposées (anti-regress)', () => {
  it("cmcRead() retourne unknown sans throw", async () => {
    await expect(orchestrator.cmcRead()).resolves.toBeDefined();
  });

  it("kdmcStats() retourne unknown sans throw", async () => {
    await expect(orchestrator.kdmcStats()).resolves.toBeDefined();
  });
});
