/**
 * Test régression v13.4.51 — core/agent-watches-runner.ts (sentinelle agents).
 *
 * Module 196 lignes 0% coverage. Gère le cycle de vie des agents Apex :
 * runCycle, getAgentHealth, identifyFailing, attemptRestart.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { agentWatchesRunner } from '../../core/agent-watches-runner.js';

describe('v13.4.51 agentWatchesRunner — lifecycle agents Apex', () => {
  beforeEach(() => {
    agentWatchesRunner.reset();
  });

  it("reset() OK + idempotent", () => {
    expect(() => {
      agentWatchesRunner.reset();
      agentWatchesRunner.reset();
    }).not.toThrow();
  });

  it("getStats() retourne objet (total/healthy/warn/error)", () => {
    const s = agentWatchesRunner.getStats();
    expect(s).toBeDefined();
    expect(typeof s).toBe('object');
  });

  it("getAllHealth() retourne array readonly", () => {
    const all = agentWatchesRunner.getAllHealth();
    expect(Array.isArray(all)).toBe(true);
  });

  it("getAgentHealth(unknown) retourne status='unknown'", () => {
    const h = agentWatchesRunner.getAgentHealth('inexistant_agent_xyz');
    expect(h).toBeDefined();
    expect(h.status).toBe('unknown');
  });

  it("identifyFailing() retourne array (vide si pas de fails)", () => {
    const failing = agentWatchesRunner.identifyFailing();
    expect(Array.isArray(failing)).toBe(true);
  });

  it("runCycle() retourne array de reports (async)", async () => {
    const reports = await agentWatchesRunner.runCycle();
    expect(Array.isArray(reports)).toBe(true);
  });

  it("runCycle(uid) avec userId optionnel", async () => {
    const reports = await agentWatchesRunner.runCycle('kdmc_admin');
    expect(Array.isArray(reports)).toBe(true);
  });

  it("attemptRestart est une méthode async (signature présente)", () => {
    /* Note : appel réel peut faire fetch HTTP qui timeout en test env.
     * Test signature seulement. */
    expect(typeof agentWatchesRunner.attemptRestart).toBe('function');
  });
});
