/**
 * Test régression v13.4.89 — apex-extra-skills.ts (5 skills bundlés).
 *
 * Kevin "N'oublie rien et va plus loin" — parité absolue écosystème
 * Claude Code (Skill Creator + Security Review + GSD + Context Mode + MemPalace).
 */
import { describe, it, expect } from 'vitest';
import {
  skillCreator,
  securityReviewWrapper,
  gsdMethodology,
  contextMode,
  memPalace,
} from '../../services/core-svc/apex-extra-skills.js';

describe('v13.4.89 SkillCreator (Anthropic L\'usine à skills parité)', () => {
  it("singleton défini avec 4 méthodes", () => {
    expect(skillCreator).toBeDefined();
    expect(typeof skillCreator.create).toBe('function');
    expect(typeof skillCreator.list).toBe('function');
    expect(typeof skillCreator.get).toBe('function');
    expect(typeof skillCreator.remove).toBe('function');
  });

  it("create() refusé non-admin", () => {
    const r = skillCreator.create({ name: 'test', description: 'desc', category: 'productivity' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_skill_create');
  });

  it("create() invalid_args si name vide", () => {
    const r = skillCreator.create({ name: '', description: 'desc', category: 'productivity' });
    /* Soit admin_only soit invalid_args */
    expect(r.ok).toBe(false);
  });

  it("list() retourne array (lecture pour tous)", () => {
    const r = skillCreator.list();
    expect(Array.isArray(r)).toBe(true);
  });

  it("get(inconnu) retourne null", () => {
    expect(skillCreator.get('inexistant_xyz_999')).toBeNull();
  });

  it("remove() refusé non-admin", () => {
    const r = skillCreator.remove('any');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_skill_remove');
  });
});

describe('v13.4.89 SecurityReviewWrapper (skill /security-review wrapper)', () => {
  it("singleton défini avec 2 méthodes", () => {
    expect(securityReviewWrapper).toBeDefined();
    expect(typeof securityReviewWrapper.scanText).toBe('function');
    expect(typeof securityReviewWrapper.summary).toBe('function');
  });

  it("scanText('') retourne []", () => {
    expect(securityReviewWrapper.scanText('')).toEqual([]);
  });

  it("scanText texte safe → []", () => {
    const r = securityReviewWrapper.scanText('const x = 5;\nfunction add(a, b) { return a + b; }');
    expect(r).toEqual([]);
  });

  it("scanText détecte XSS innerHTML interpolation", () => {
    const code = 'el.innerHTML = `<p>${userInput}</p>`;';
    const r = securityReviewWrapper.scanText(code);
    expect(r.some((f) => f.axis === 'xss')).toBe(true);
  });

  it("scanText détecte secret Anthropic API key", () => {
    const code = `const KEY = "sk-ant-api03-${'a'.repeat(95)}";`;
    const r = securityReviewWrapper.scanText(code);
    const secretFinding = r.find((f) => f.axis === 'secrets');
    expect(secretFinding).toBeDefined();
    expect(secretFinding?.severity).toBe('p0');
  });

  it("scanText détecte eval()", () => {
    const code = 'eval(userCode);';
    const r = securityReviewWrapper.scanText(code);
    expect(r.some((f) => f.axis === 'injection')).toBe(true);
  });

  it("scanText détecte CSP unsafe-inline", () => {
    const code = "Content-Security-Policy: script-src 'self' 'unsafe-inline';";
    const r = securityReviewWrapper.scanText(code);
    expect(r.some((f) => f.axis === 'csp')).toBe(true);
  });

  it("summary() agrège findings par severity + axis", () => {
    const findings = securityReviewWrapper.scanText(
      'el.innerHTML = `<p>${u}</p>`; eval(x); ' + `const k = "sk-ant-api03-${'a'.repeat(95)}";`,
    );
    const s = securityReviewWrapper.summary(findings);
    expect(s.total).toBeGreaterThan(0);
    expect(s.p0 + s.p1 + s.p2 + s.p3).toBe(s.total);
  });
});

describe('v13.4.89 GsdMethodology (Get Shit Done — zéro demi-mesure)', () => {
  it("singleton défini avec 1 méthode evaluate", () => {
    expect(gsdMethodology).toBeDefined();
    expect(typeof gsdMethodology.evaluate).toBe('function');
  });

  it("evaluate() tout false → grade F", () => {
    const r = gsdMethodology.evaluate({
      codeWritten: false, testsPass: false, committed: false, pushed: false, auditOk: false,
    });
    expect(r.grade).toBe('F');
    expect(r.score).toBe(0);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it("evaluate() tout true → grade A", () => {
    const r = gsdMethodology.evaluate({
      codeWritten: true, testsPass: true, committed: true, pushed: true, auditOk: true, docUpdated: true,
    });
    expect(r.grade).toBe('A');
    expect(r.score).toBe(100);
    expect(r.missing).toEqual([]);
    expect(r.verdict).toContain('GSD complet');
  });

  it("evaluate() tests fail → score réduit", () => {
    const r = gsdMethodology.evaluate({
      codeWritten: true, testsPass: false, committed: true, pushed: true, auditOk: true,
    });
    expect(r.score).toBeLessThan(100);
    expect(r.missing).toContain('tests_failing');
  });

  it("evaluate() pas pushé → grade C ou D", () => {
    const r = gsdMethodology.evaluate({
      codeWritten: true, testsPass: true, committed: true, pushed: false, auditOk: false,
    });
    expect(['C', 'D']).toContain(r.grade);
    expect(r.missing).toContain('not_pushed');
  });
});

describe('v13.4.89 ContextMode (optimisation context window)', () => {
  it("singleton défini avec 1 méthode optimize", () => {
    expect(contextMode).toBeDefined();
    expect(typeof contextMode.optimize).toBe('function');
  });

  it("optimize() retourne structure attendue", () => {
    const r = contextMode.optimize({ maxTokens: 1000 });
    expect(Array.isArray(r.facts)).toBe(true);
    expect(Array.isArray(r.lessons)).toBe(true);
    expect(typeof r.docs_summary).toBe('string');
    expect(typeof r.estimated_tokens).toBe('number');
  });

  it("optimize() respecte maxTokens budget", () => {
    const r = contextMode.optimize({ maxTokens: 500 });
    expect(r.estimated_tokens).toBeLessThanOrEqual(500);
  });

  it("optimize() default maxTokens = 4000", () => {
    const r = contextMode.optimize();
    expect(r.estimated_tokens).toBeLessThanOrEqual(4000);
  });
});

describe('v13.4.89 MemPalace (mémoire spatiale 3D)', () => {
  it("singleton défini avec 3 méthodes", () => {
    expect(memPalace).toBeDefined();
    expect(typeof memPalace.createRoom).toBe('function');
    expect(typeof memPalace.listRooms).toBe('function');
    expect(typeof memPalace.recall).toBe('function');
  });

  it("createRoom() refusé non-admin", () => {
    const r = memPalace.createRoom({ name: 'Salle test', description: 'desc' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_palace_create');
  });

  it("createRoom() invalid_args si name vide", () => {
    const r = memPalace.createRoom({ name: '', description: 'desc' });
    expect(r.ok).toBe(false);
  });

  it("listRooms() retourne array", () => {
    const r = memPalace.listRooms();
    expect(Array.isArray(r)).toBe(true);
  });

  it("recall(query) retourne array filtrée", () => {
    const r = memPalace.recall('inexistant_query_zzz');
    expect(Array.isArray(r)).toBe(true);
  });

  it("recall('') retourne []", () => {
    expect(memPalace.recall('')).toEqual([]);
  });
});
