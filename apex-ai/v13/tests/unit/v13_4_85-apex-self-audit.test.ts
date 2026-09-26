/**
 * Test régression v13.4.85 — services/apex-self-audit.ts.
 *
 * Audit complet Apex 6 axes (security/performance/ux/tests/architecture/
 * ai_safety) avec scoring, findings, auto-fix, escalade Claude Code.
 *
 * Critique règle Kevin "100/100 RÉEL chaque axe" (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { apexSelfAudit } from '../../services/admin/apex-self-audit.js';

describe('v13.4.85 apex-self-audit — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(apexSelfAudit).toBeDefined();
    expect(typeof apexSelfAudit.runFullAudit).toBe('function');
    expect(typeof apexSelfAudit.listReports).toBe('function');
    expect(typeof apexSelfAudit.getLastReport).toBe('function');
    expect(typeof apexSelfAudit.formatReportMarkdown).toBe('function');
  });
});

describe('v13.4.85 apex-self-audit — listReports', () => {
  it("listReports() retourne array", () => {
    const r = apexSelfAudit.listReports();
    expect(Array.isArray(r)).toBe(true);
  });

  it("Chaque report a structure AuditReport", () => {
    const reports = apexSelfAudit.listReports();
    for (const r of reports) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.ts).toBe('number');
      expect(typeof r.duration_ms).toBe('number');
      expect(r.axes).toBeDefined();
      expect(typeof r.total_score).toBe('number');
      expect(typeof r.total_findings).toBe('number');
      expect(typeof r.auto_fixed_count).toBe('number');
      expect(typeof r.escalated_count).toBe('number');
      expect(Array.isArray(r.findings)).toBe(true);
      expect(Array.isArray(r.next_steps)).toBe(true);
    }
  });
});

describe('v13.4.85 apex-self-audit — getLastReport', () => {
  it("getLastReport() retourne AuditReport ou null", () => {
    const r = apexSelfAudit.getLastReport();
    if (r !== null) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.total_score).toBe('number');
    }
  });
});

describe('v13.4.85 apex-self-audit — formatReportMarkdown', () => {
  it("formatReportMarkdown(fake_report) retourne string Markdown", () => {
    const fakeReport = {
      id: 'audit_test_85',
      ts: Date.now(),
      duration_ms: 1234,
      axes: {
        security: { score: 95, findings_count: 2 },
        performance: { score: 88, findings_count: 3 },
        ux: { score: 92, findings_count: 1 },
        tests: { score: 90, findings_count: 0 },
        architecture: { score: 87, findings_count: 2 },
        ai_safety: { score: 96, findings_count: 1 },
      },
      total_score: 91,
      total_findings: 9,
      auto_fixed_count: 5,
      escalated_count: 1,
      findings: [],
      next_steps: ['Test step'],
    };
    const md = apexSelfAudit.formatReportMarkdown(fakeReport);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });
});

describe('v13.4.85 apex-self-audit — runFullAudit (smoke test)', () => {
  it("runFullAudit() retourne AuditReport structuré (smoke)", async () => {
    /* Smoke test : on lance un vrai audit complet, on vérifie structure.
     * Ne PAS valider scores (env de test = pas vraiment d'erreurs réelles). */
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r).toBeDefined();
    expect(typeof r.id).toBe('string');
    expect(typeof r.ts).toBe('number');
    expect(typeof r.duration_ms).toBe('number');
    expect(r.duration_ms).toBeGreaterThan(0);
    expect(r.axes).toBeDefined();
    /* 6 axes attendus */
    expect(r.axes.security).toBeDefined();
    expect(r.axes.performance).toBeDefined();
    expect(r.axes.ux).toBeDefined();
    expect(r.axes.tests).toBeDefined();
    expect(r.axes.architecture).toBeDefined();
    expect(r.axes.ai_safety).toBeDefined();
    /* Score total ∈ [0, 100] */
    expect(r.total_score).toBeGreaterThanOrEqual(0);
    expect(r.total_score).toBeLessThanOrEqual(100);
  }, 30_000);

  it("Mode brutal=true ne throw pas", async () => {
    await expect(apexSelfAudit.runFullAudit(true)).resolves.toBeDefined();
  }, 30_000);
});
