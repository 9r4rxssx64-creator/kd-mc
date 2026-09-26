/**
 * Test régression v13.4.36 — services/economy-mode.ts (Kevin 2026-05-14 feature).
 *
 * Demande Kevin :
 * "Bouton économique, Token suivant le travail demandé. Si mode économie,
 *  Apex me demande si je désactive pour ce travail. Ensuite remet automatiquement."
 *
 * Tests : toggle + isActive + bypass auto-restore + resolveModel/MaxTokens.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { economyMode, type ExpensiveTaskType } from '../../services/core-svc/economy-mode.js';

describe('v13.4.36 economyMode.setActive + toggle', () => {
  beforeEach(() => {
    localStorage.removeItem('apex_v13_economy_mode');
    economyMode.setActive(false); /* Reset state */
  });

  it("default state : inactif", () => {
    expect(economyMode.isActive()).toBe(false);
  });

  it("setActive(true) → isActive true", () => {
    economyMode.setActive(true);
    expect(economyMode.isActive()).toBe(true);
  });

  it("setActive(false) → isActive false", () => {
    economyMode.setActive(true);
    economyMode.setActive(false);
    expect(economyMode.isActive()).toBe(false);
  });

  it("toggle alterne état", () => {
    expect(economyMode.isActive()).toBe(false);
    const r1 = economyMode.toggle();
    expect(r1).toBe(true);
    expect(economyMode.isActive()).toBe(true);
    const r2 = economyMode.toggle();
    expect(r2).toBe(false);
    expect(economyMode.isActive()).toBe(false);
  });

  it("setActive(true) persiste dans localStorage", () => {
    economyMode.setActive(true);
    const raw = localStorage.getItem('apex_v13_economy_mode');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { active: boolean };
    expect(parsed.active).toBe(true);
  });
});

describe('v13.4.36 economyMode.bypassFor — auto-restore', () => {
  beforeEach(() => {
    economyMode.setActive(false);
    economyMode.setActive(true); /* Activé pour tests bypass */
  });

  it("bypassFor désactive temporairement", () => {
    expect(economyMode.isActive()).toBe(true);
    const r = economyMode.bypassFor('long_form_writing');
    expect(r.bypassed).toBe(true);
    expect(economyMode.isActive()).toBe(false); /* Bypass actif → "inactif" pour calls */
  });

  it("bypassFor retourne label user-friendly", () => {
    const r = economyMode.bypassFor('image_gen');
    expect(r.label).toContain('image');
  });

  it("bypassFor restoreAt timestamp futur", () => {
    const before = Date.now();
    const r = economyMode.bypassFor('video_gen');
    expect(r.restoreAt).toBeGreaterThan(before);
  });

  it("restoreNow force restore (sans attendre timer)", () => {
    economyMode.bypassFor('long_form_writing');
    expect(economyMode.isActive()).toBe(false);
    economyMode.restoreNow();
    expect(economyMode.isActive()).toBe(true); /* Restauré */
  });

  it("bypass auto-expire après duration → isActive recalcule", () => {
    /* Force restoreAt dans le passé pour tester auto-expiry */
    economyMode.bypassFor('multi_step_agent', 1); /* 1ms */
    setTimeout(() => {
      /* Après expiry, isActive doit re-armer le mode économie */
      expect(economyMode.isActive()).toBe(true);
    }, 50);
  });

  it("durations customisée respectée", () => {
    const customMs = 10 * 60 * 1000; /* 10 min */
    const before = Date.now();
    const r = economyMode.bypassFor('deep_research', customMs);
    expect(r.restoreAt - before).toBeGreaterThanOrEqual(customMs - 100);
    expect(r.restoreAt - before).toBeLessThanOrEqual(customMs + 100);
  });
});

describe('v13.4.36 economyMode.resolveModel/MaxTokens/MaxIterations', () => {
  beforeEach(() => {
    economyMode.setActive(false);
  });

  it("mode inactif → defaults respectés (pas d'override)", () => {
    expect(economyMode.resolveModel('claude-opus-4-7')).toBe('claude-opus-4-7');
    expect(economyMode.resolveMaxTokens(8192)).toBe(8192);
    expect(economyMode.resolveMaxIterations(20)).toBe(20);
  });

  it("mode actif → modèle override haiku économique", () => {
    economyMode.setActive(true);
    const m = economyMode.resolveModel('claude-opus-4-7');
    expect(m).toContain('haiku');
  });

  it("mode actif → max_tokens divisé (factor 0.5)", () => {
    economyMode.setActive(true);
    expect(economyMode.resolveMaxTokens(8192)).toBe(4096);
    expect(economyMode.resolveMaxTokens(1000)).toBe(500);
  });

  it("mode actif → max_iterations divisé", () => {
    economyMode.setActive(true);
    expect(economyMode.resolveMaxIterations(20)).toBe(10);
    expect(economyMode.resolveMaxIterations(10)).toBe(5);
  });

  it("max_tokens jamais en dessous de 256 (floor)", () => {
    economyMode.setActive(true);
    expect(economyMode.resolveMaxTokens(100)).toBeGreaterThanOrEqual(256);
  });

  it("max_iterations jamais en dessous de 1", () => {
    economyMode.setActive(true);
    expect(economyMode.resolveMaxIterations(1)).toBeGreaterThanOrEqual(1);
  });

  it("bypass temporaire restaure les defaults", () => {
    economyMode.setActive(true);
    expect(economyMode.resolveMaxTokens(8192)).toBe(4096); /* Économie */
    economyMode.bypassFor('long_form_writing');
    expect(economyMode.resolveMaxTokens(8192)).toBe(8192); /* Bypass → normal */
    economyMode.restoreNow();
    expect(economyMode.resolveMaxTokens(8192)).toBe(4096); /* Re-économie */
  });
});

describe('v13.4.36 economyMode.needsConfirmation', () => {
  it("mode inactif → needsConfirmation false (pas de prompt)", () => {
    economyMode.setActive(false);
    expect(economyMode.needsConfirmation('long_form_writing')).toBe(false);
    expect(economyMode.needsConfirmation('image_gen')).toBe(false);
  });

  it("mode actif → needsConfirmation true pour tous types expensive", () => {
    economyMode.setActive(true);
    const types: ExpensiveTaskType[] = ['long_form_writing', 'image_gen', 'video_gen', 'multi_step_agent', 'deep_research', 'audio_transcription_long'];
    for (const t of types) {
      expect(economyMode.needsConfirmation(t)).toBe(true);
    }
  });

  it("mode actif + bypass → needsConfirmation false (déjà bypassed)", () => {
    economyMode.setActive(true);
    economyMode.bypassFor('image_gen');
    expect(economyMode.needsConfirmation('image_gen')).toBe(false);
  });
});

describe('v13.4.36 economyMode.buildConfirmationMessage', () => {
  it("retourne message contient task label + options OUI/NON", () => {
    economyMode.setActive(true);
    const msg = economyMode.buildConfirmationMessage('image_gen');
    expect(msg).toContain('image');
    expect(msg).toContain('OUI');
    expect(msg).toContain('NON');
  });

  it("message mentionne auto-restore 5 min", () => {
    economyMode.setActive(true);
    const msg = economyMode.buildConfirmationMessage('long_form_writing');
    expect(msg).toContain('5 min');
  });
});

describe('v13.4.36 economyMode.getState snapshot', () => {
  it("retourne state object readonly", () => {
    economyMode.setActive(true);
    const s = economyMode.getState();
    expect(s.active).toBe(true);
    expect(typeof s.tempDisabled).toBe('boolean');
    expect(typeof s.maxTokensFactor).toBe('number');
  });

  it("snapshot non mutable (clone)", () => {
    /* Reset propre : restoreNow puis setActive(true) */
    economyMode.setActive(false);
    economyMode.setActive(true);
    expect(economyMode.isActive()).toBe(true); /* Sanity check setup OK */
    const s = economyMode.getState() as { active: boolean };
    /* Tenter de muter le snapshot — ne doit PAS affecter le real state */
    s.active = false;
    expect(economyMode.isActive()).toBe(true); /* Real state intact */
  });
});

describe('v13.4.36 economyMode.getTaskLabel', () => {
  it("retourne label français pour chaque type", () => {
    expect(economyMode.getTaskLabel('long_form_writing')).toContain('Rédaction');
    expect(economyMode.getTaskLabel('image_gen')).toContain('image');
    expect(economyMode.getTaskLabel('video_gen')).toContain('vidéo');
    expect(economyMode.getTaskLabel('multi_step_agent')).toContain('étapes');
    expect(economyMode.getTaskLabel('deep_research')).toContain('Recherche');
    expect(economyMode.getTaskLabel('audio_transcription_long')).toContain('audio');
  });
});
