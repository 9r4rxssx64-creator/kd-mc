/**
 * Test régression v13.4.77 — services/auto-improvement.ts.
 *
 * Apex scanne le catalog extended pour détecter nouveaux outils,
 * évalue gain estimé, auto-installe si confidence ≥ 0.95.
 * Règle Kevin "Innovation-watch hebdo" + autonomie.
 */
import { describe, it, expect } from 'vitest';
import {
  autoImprovement,
  AUTO_INSTALL_CONFIDENCE,
  AUTO_INSTALL_GAIN_THRESHOLD,
} from '../../services/sentinels/auto-improvement.js';

describe('v13.4.77 auto-improvement — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(autoImprovement).toBeDefined();
    expect(typeof autoImprovement.scanNew).toBe('function');
    expect(typeof autoImprovement.evaluateForApex).toBe('function');
    expect(typeof autoImprovement.autoInstallSafe).toBe('function');
    expect(typeof autoImprovement.selfCorrect).toBe('function');
    expect(typeof autoImprovement.selfManage).toBe('function');
    expect(typeof autoImprovement.getState).toBe('function');
    expect(typeof autoImprovement.reset).toBe('function');
  });

  it("Constantes exposées : AUTO_INSTALL_CONFIDENCE = 0.95", () => {
    expect(AUTO_INSTALL_CONFIDENCE).toBe(0.95);
  });

  it("AUTO_INSTALL_GAIN_THRESHOLD défini (% minimum)", () => {
    expect(typeof AUTO_INSTALL_GAIN_THRESHOLD).toBe('number');
    expect(AUTO_INSTALL_GAIN_THRESHOLD).toBeGreaterThan(0);
    expect(AUTO_INSTALL_GAIN_THRESHOLD).toBeLessThanOrEqual(100);
  });
});

describe('v13.4.77 auto-improvement — getState + reset', () => {
  it("getState() retourne AutoImprovementState structuré", () => {
    const s = autoImprovement.getState();
    expect(s).toBeDefined();
    expect(typeof s.lastScan).toBe('number');
    expect(Array.isArray(s.installed)).toBe(true);
    expect(Array.isArray(s.skipped)).toBe(true);
    expect(typeof s.cooldowns).toBe('object');
  });

  it("reset() ne throw pas et remet l'état neutre", () => {
    expect(() => autoImprovement.reset()).not.toThrow();
    const s = autoImprovement.getState();
    expect(s.installed.length).toBe(0);
    expect(s.skipped.length).toBe(0);
  });
});

describe('v13.4.77 auto-improvement — scanNew', () => {
  it("scanNew() retourne ScanNewResult structuré", async () => {
    const r = await autoImprovement.scanNew();
    expect(r).toBeDefined();
    expect(typeof r.new).toBe('number');
    expect(typeof r.recommended).toBe('number');
    expect(Array.isArray(r.newIds)).toBe(true);
    expect(typeof r.scannedAt).toBe('number');
  });

  it("scanNew() après reset → new ≥ 0 (catalog scan)", async () => {
    autoImprovement.reset();
    const r = await autoImprovement.scanNew();
    expect(r.new).toBeGreaterThanOrEqual(0);
  });
});

describe('v13.4.77 auto-improvement — evaluateForApex', () => {
  it("evaluateForApex(tool_inconnu) retourne EvaluationResult sans throw", async () => {
    const r = await autoImprovement.evaluateForApex('tool_inexistant_zzz_999');
    expect(r).toBeDefined();
    expect(typeof r.install).toBe('boolean');
    expect(typeof r.gain).toBe('number');
    expect(typeof r.reason).toBe('string');
    expect(r.breakdown).toBeDefined();
    expect(typeof r.breakdown.pwa_compat_bonus).toBe('number');
    expect(typeof r.breakdown.value_score).toBe('number');
    expect(typeof r.breakdown.coverage_match).toBe('number');
    expect(typeof r.breakdown.deps_overlap_penalty).toBe('number');
  });
});

describe('v13.4.77 auto-improvement — autoInstallSafe', () => {
  it("autoInstallSafe(tool_inconnu) retourne AutoInstallResult structuré", async () => {
    const r = await autoImprovement.autoInstallSafe('tool_inexistant_zzz_999');
    expect(r).toBeDefined();
    expect(typeof r.ok).toBe('boolean');
    expect(typeof r.toolId).toBe('string');
    expect(typeof r.message).toBe('string');
    expect(typeof r.installedAt).toBe('number');
  });
});

describe('v13.4.77 auto-improvement — selfCorrect + selfManage', () => {
  it("selfCorrect() retourne SelfCorrectResult", async () => {
    const r = await autoImprovement.selfCorrect();
    expect(r).toBeDefined();
    expect(typeof r.fixes_applied).toBe('number');
    expect(Array.isArray(r.fixes)).toBe(true);
    for (const f of r.fixes) {
      expect(typeof f.action).toBe('string');
      expect(typeof f.target).toBe('string');
      expect(typeof f.ok).toBe('boolean');
    }
  });

  it("selfManage() retourne SelfManageResult", async () => {
    const r = await autoImprovement.selfManage();
    expect(r).toBeDefined();
    expect(Array.isArray(r.actions)).toBe(true);
    expect(typeof r.bytes_freed).toBe('number');
    expect(r.bytes_freed).toBeGreaterThanOrEqual(0);
  });
});
