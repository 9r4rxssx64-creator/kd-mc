/**
 * Test régression v13.4.84 — services/apex-self-correct.ts.
 *
 * Cascade auto-correction Apex : détection panne → restore credentials →
 * reset dead providers → rank providers → ultra-reset → escalate Claude.
 *
 * Critique autonomie Kevin "auto-fix sans demander". Erreur #45 anti-pattern
 * "PR jamais merge = déploiement fantôme" → escalade via _cmcEscalate.
 */
import { describe, it, expect } from 'vitest';
import {
  apexSelfCorrect,
  DEFAULT_DETECTION_WINDOW,
} from '../../services/admin/apex-self-correct.js';

describe('v13.4.84 apex-self-correct — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(apexSelfCorrect).toBeDefined();
    expect(typeof apexSelfCorrect.configure).toBe('function');
    expect(typeof apexSelfCorrect.setBypassThrottle).toBe('function');
    expect(typeof apexSelfCorrect.detectFault).toBe('function');
    expect(typeof apexSelfCorrect.runCycle).toBe('function');
    expect(typeof apexSelfCorrect.runCascade).toBe('function');
    expect(typeof apexSelfCorrect.getHistory).toBe('function');
    expect(typeof apexSelfCorrect.resetAll).toBe('function');
  });

  it("DEFAULT_DETECTION_WINDOW exposé avec 4 champs", () => {
    expect(DEFAULT_DETECTION_WINDOW).toBeDefined();
    expect(typeof DEFAULT_DETECTION_WINDOW.fallback_window_ms).toBe('number');
    expect(typeof DEFAULT_DETECTION_WINDOW.fallback_threshold).toBe('number');
    expect(typeof DEFAULT_DETECTION_WINDOW.no_response_window_ms).toBe('number');
    expect(typeof DEFAULT_DETECTION_WINDOW.throttle_ms).toBe('number');
  });

  it("Valeurs DEFAULT cohérentes : fallback < no_response < throttle", () => {
    /* Fallback 5min < no_response 10min < throttle 30min (sanity check) */
    expect(DEFAULT_DETECTION_WINDOW.fallback_window_ms).toBeLessThan(DEFAULT_DETECTION_WINDOW.no_response_window_ms);
    expect(DEFAULT_DETECTION_WINDOW.no_response_window_ms).toBeLessThan(DEFAULT_DETECTION_WINDOW.throttle_ms);
  });

  it("fallback_threshold ≥ 1 (au moins 1 fallback pour trigger)", () => {
    expect(DEFAULT_DETECTION_WINDOW.fallback_threshold).toBeGreaterThanOrEqual(1);
  });
});

describe('v13.4.84 apex-self-correct — configure', () => {
  it("configure() accepte tous les champs DetectionWindow partiels sans throw", () => {
    expect(() => {
      apexSelfCorrect.configure({ fallback_window_ms: 60000 });
      apexSelfCorrect.configure({ fallback_threshold: 5 });
      apexSelfCorrect.configure({ no_response_window_ms: 600000 });
      apexSelfCorrect.configure({ throttle_ms: 900000 });
      apexSelfCorrect.configure({}); /* no-op */
    }).not.toThrow();
  });

  it("setBypassThrottle(true/false) ne throw pas", () => {
    expect(() => {
      apexSelfCorrect.setBypassThrottle(true);
      apexSelfCorrect.setBypassThrottle(false);
    }).not.toThrow();
  });
});

describe('v13.4.84 apex-self-correct — detectFault', () => {
  it("detectFault() retourne FaultDetection structuré 8 champs", async () => {
    const r = await apexSelfCorrect.detectFault();
    expect(r).toBeDefined();
    expect(typeof r.needs_correction).toBe('boolean');
    expect(typeof r.fallback_ratio).toBe('number');
    expect(typeof r.recent_fallbacks).toBe('number');
    expect(typeof r.recent_attempts).toBe('number');
    expect(typeof r.ms_since_last_success).toBe('number');
    expect(typeof r.all_providers_dead).toBe('boolean');
    expect(typeof r.ts).toBe('number');
    expect(Array.isArray(r.reasons)).toBe(true);
  });

  it("detectFault(custom_now) accepte timestamp custom", async () => {
    const customNow = 1700000000000;
    const r = await apexSelfCorrect.detectFault(customNow);
    expect(r.ts).toBe(customNow);
  });

  it("fallback_ratio ∈ [0, 1]", async () => {
    const r = await apexSelfCorrect.detectFault();
    expect(r.fallback_ratio).toBeGreaterThanOrEqual(0);
    expect(r.fallback_ratio).toBeLessThanOrEqual(1);
  });

  it("recent_fallbacks et recent_attempts ≥ 0", async () => {
    const r = await apexSelfCorrect.detectFault();
    expect(r.recent_fallbacks).toBeGreaterThanOrEqual(0);
    expect(r.recent_attempts).toBeGreaterThanOrEqual(0);
  });
});

describe('v13.4.84 apex-self-correct — runCycle + runCascade', () => {
  it("runCycle() retourne SelfCorrectResult structuré", async () => {
    const r = await apexSelfCorrect.runCycle();
    expect(r).toBeDefined();
    expect(typeof r.ts).toBe('number');
    expect(typeof r.triggered).toBe('boolean');
    expect(Array.isArray(r.steps)).toBe(true);
    expect(typeof r.resolved).toBe('boolean');
    expect(typeof r.escalated).toBe('boolean');
  });

  it("runCycle() non-triggered → skipped_reason exposé", async () => {
    /* En env de test sans faille → skipped 'no_fault' */
    const r = await apexSelfCorrect.runCycle();
    if (!r.triggered) {
      expect(['throttled', 'no_fault', 'disabled']).toContain(r.skipped_reason);
    }
  });

  it("runCascade() avec detection synthétique → retourne result structuré", async () => {
    const fakeDetection = {
      needs_correction: true,
      fallback_ratio: 0.5,
      recent_fallbacks: 5,
      recent_attempts: 10,
      ms_since_last_success: 600000,
      all_providers_dead: false,
      ts: Date.now(),
      reasons: ['test_synthetic'],
    };
    const r = await apexSelfCorrect.runCascade(fakeDetection);
    expect(r).toBeDefined();
    expect(typeof r.triggered).toBe('boolean');
    expect(Array.isArray(r.steps)).toBe(true);
    for (const step of r.steps) {
      expect(['restore_credentials', 'reset_dead_providers', 'rank_providers', 'ultra_reset', 'escalate_claude'])
        .toContain(step.step);
      expect(typeof step.ok).toBe('boolean');
    }
  });
});

describe('v13.4.84 apex-self-correct — history', () => {
  it("getHistory() retourne array", () => {
    const h = apexSelfCorrect.getHistory();
    expect(Array.isArray(h)).toBe(true);
  });

  it("Chaque entrée history a structure SelfCorrectResult", () => {
    const h = apexSelfCorrect.getHistory();
    for (const e of h) {
      expect(typeof e.ts).toBe('number');
      expect(typeof e.triggered).toBe('boolean');
      expect(Array.isArray(e.steps)).toBe(true);
    }
  });

  it("resetAll() ne throw pas + clear history", () => {
    expect(() => apexSelfCorrect.resetAll()).not.toThrow();
    /* Après reset, history vide */
    const h = apexSelfCorrect.getHistory();
    expect(h.length).toBe(0);
  });
});
