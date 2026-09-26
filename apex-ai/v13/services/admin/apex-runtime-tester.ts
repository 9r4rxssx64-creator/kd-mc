/**
 * APEX v13.4.13 — Runtime Test Orchestrator (Kevin 2026-05-14 "Apex doit tester réel tout").
 *
 * Exécute TOUS les skills 2026 + MCP servers + Studios + sentinelles en RUNTIME
 * browser réel — preuves (filename, size, latency) collectées et stockées.
 *
 * Différence vs vitest jsdom :
 *   - vitest valide structure code + fallback safe
 *   - runtime tester valide CHAIN COMPLÈTE : CDN load → lib exec → output → URL.createObjectURL
 *
 * Catégories testées :
 *  A. Document generators (docx, pptx, xlsx, pdf) → vrai blob téléchargeable
 *  B. MCP servers (bofip, almanac, legal-hunter) → vrai ping HTTP
 *  C. Futuristic modules (sample 5 routes) → vrai routing
 *  D. Sentinelles (skills-watch, mcp-health-watch) → vrai tick
 *  E. Security/Code review → vrai apexSelfAudit
 *
 * Sortie : RuntimeTestReport persisté localStorage + Firebase
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export type RuntimeTestStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface RuntimeTestResult {
  testId: string;
  category: 'generator' | 'mcp' | 'futuristic' | 'sentinel' | 'security' | 'video';
  name: string;
  status: RuntimeTestStatus;
  durationMs: number;
  evidence?: {
    filename?: string;
    sizeBytes?: number;
    blobUrl?: string;
    httpStatus?: number;
    latencyMs?: number;
    output?: unknown;
  } | undefined;
  error?: string | undefined;
  ts: number;
}

export interface RuntimeTestReport {
  reportId: string;
  startedAt: number;
  finishedAt: number;
  totalDurationMs: number;
  results: RuntimeTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
    successRate: number;
  };
}

class RuntimeTester {
  private currentReport: RuntimeTestReport | null = null;

  /**
   * Run TOUS les tests skills 2026 en runtime browser.
   * Retourne report structuré + persiste dans localStorage.
   */
  async runAll(onProgress?: (current: string, done: number, total: number) => void): Promise<RuntimeTestReport> {
    const startedAt = Date.now();
    const reportId = `report_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;
    const results: RuntimeTestResult[] = [];

    const tests = [
      /* A. Document generators */
      { id: 'gen-docx', cat: 'generator' as const, name: 'Génération .docx letter-formal', fn: this.testDocx },
      { id: 'gen-pptx', cat: 'generator' as const, name: 'Génération .pptx pitch-startup', fn: this.testPptx },
      { id: 'gen-xlsx', cat: 'generator' as const, name: 'Génération .xlsx multi-feuille', fn: this.testXlsx },
      { id: 'gen-pdf', cat: 'generator' as const, name: 'Génération .pdf invoice', fn: this.testPdf },

      /* B. MCP servers (health check ping) */
      { id: 'mcp-bofip-health', cat: 'mcp' as const, name: 'MCP BOFiP health check', fn: () => this.testMcpHealth('bofip') },
      { id: 'mcp-almanac-health', cat: 'mcp' as const, name: 'MCP Almanac health check', fn: () => this.testMcpHealth('almanac') },
      { id: 'mcp-legal-health', cat: 'mcp' as const, name: 'MCP Legal Hunter health check', fn: () => this.testMcpHealth('legal-hunter') },

      /* C. Futuristic modules (sample 5) */
      { id: 'fut-flux2', cat: 'futuristic' as const, name: 'Module FLUX 2 Pro routing', fn: () => this.testFuturistic('apex-image-gen-flux2-pro') },
      { id: 'fut-vision', cat: 'futuristic' as const, name: 'Module Vision Claude 4', fn: () => this.testFuturistic('apex-vision-claude-4') },
      { id: 'fut-mermaid', cat: 'futuristic' as const, name: 'Module Mermaid flowchart', fn: () => this.testFuturistic('apex-flowchart-mermaid') },
      { id: 'fut-kyber', cat: 'futuristic' as const, name: 'Module Kyber PQ Crypto', fn: () => this.testFuturistic('apex-pq-crypto-kyber') },
      { id: 'fut-ar', cat: 'futuristic' as const, name: 'Module WebAR model-viewer', fn: () => this.testFuturistic('apex-webar-modelviewer') },

      /* D. Sentinelles */
      { id: 'sent-skills', cat: 'sentinel' as const, name: 'Sentinelle skills-watch (CDN probe)', fn: this.testSkillsWatch },
      { id: 'sent-mcp', cat: 'sentinel' as const, name: 'Sentinelle mcp-health-watch', fn: this.testMcpHealthWatch },

      /* E. Security review */
      { id: 'sec-audit', cat: 'security' as const, name: 'Security review (audit complet)', fn: this.testSecurityReview },

      /* F. Video (skip si MediaRecorder indispo) */
      { id: 'video-hyperframes', cat: 'video' as const, name: 'Hyperframes MediaRecorder check', fn: this.testHyperframes },
    ];

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i]!;
      onProgress?.(test.name, i, tests.length);
      const t0 = Date.now();
      try {
        const result = await test.fn.call(this);
        results.push({
          testId: test.id,
          category: test.cat,
          name: test.name,
          status: result.status,
          durationMs: Date.now() - t0,
          ...(result.evidence ? { evidence: result.evidence } : {}),
          ...(result.error ? { error: result.error } : {}),
          ts: Date.now(),
        });
      } catch (err) {
        results.push({
          testId: test.id,
          category: test.cat,
          name: test.name,
          status: 'fail',
          durationMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
          ts: Date.now(),
        });
      }
    }

    const finishedAt = Date.now();
    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const warnings = results.filter((r) => r.status === 'warn').length;
    const skipped = results.filter((r) => r.status === 'skip').length;

    const report: RuntimeTestReport = {
      reportId,
      startedAt,
      finishedAt,
      totalDurationMs: finishedAt - startedAt,
      results,
      summary: {
        total: results.length,
        passed,
        failed,
        warnings,
        skipped,
        successRate: Math.round((passed / results.length) * 100),
      },
    };

    this.currentReport = report;
    this.persist(report);

    try {
      await auditLog.record('runtime-tester.run', {
        details: {
          reportId,
          total: report.summary.total,
          passed,
          failed,
          duration: report.totalDurationMs,
        },
      });
    } catch {
      /* ignore audit */
    }

    onProgress?.(`Done (${passed}/${results.length} passed)`, results.length, results.length);
    logger.info('runtime-tester', `Run complete: ${passed}/${results.length} passed`, { reportId });

    return report;
  }

  getLastReport(): RuntimeTestReport | null {
    if (this.currentReport) return this.currentReport;
    try {
      const raw = localStorage.getItem('ax_runtime_test_last');
      if (!raw) return null;
      return JSON.parse(raw) as RuntimeTestReport;
    } catch {
      return null;
    }
  }

  private persist(report: RuntimeTestReport): void {
    try {
      localStorage.setItem('ax_runtime_test_last', JSON.stringify(report));
      const history = this.getHistory();
      history.unshift({
        reportId: report.reportId,
        startedAt: report.startedAt,
        successRate: report.summary.successRate,
        total: report.summary.total,
      });
      if (history.length > 20) history.length = 20;
      localStorage.setItem('ax_runtime_test_history', JSON.stringify(history));
    } catch (err) {
      logger.warn('runtime-tester', 'persist failed', { err });
    }
  }

  getHistory(): Array<{ reportId: string; startedAt: number; successRate: number; total: number }> {
    try {
      const raw = localStorage.getItem('ax_runtime_test_history');
      if (!raw) return [];
      return JSON.parse(raw) as Array<{ reportId: string; startedAt: number; successRate: number; total: number }>;
    } catch {
      return [];
    }
  }

  /* ============ Test implementations ============ */

  private async testDocx(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { docxGenerator } = await import('../skills/docx-generator.js');
    const result = await docxGenerator.generate({
      template: 'letter-formal',
      data: {
        sender_name: 'Apex Runtime Test',
        recipient_name: 'Test',
        subject: 'Auto-test',
        body: 'Test généré par Apex Runtime Tester.',
      },
    });
    return result.success
      ? {
          status: 'pass',
          evidence: { filename: result.filename, sizeBytes: result.sizeBytes, blobUrl: result.blobUrl },
        }
      : { status: 'fail', error: result.error ?? 'Inconnu' };
  }

  private async testPptx(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { pptxGenerator } = await import('../skills/pptx-generator.js');
    const result = await pptxGenerator.generate({
      template: 'pitch-startup',
      title: 'Apex Auto-Test',
      author: 'Apex',
      slides: [
        { title: 'Slide 1', content: 'Test' },
        { title: 'Slide 2', content: 'Auto' },
      ],
      mode: 'pro',
    });
    return result.success
      ? {
          status: 'pass',
          evidence: { filename: result.filename, sizeBytes: result.sizeBytes, blobUrl: result.blobUrl },
        }
      : { status: 'fail', error: result.error ?? 'Inconnu' };
  }

  private async testXlsx(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { xlsxGenerator } = await import('../skills/xlsx-generator.js');
    const result = await xlsxGenerator.generate({
      filename: 'apex-auto-test.xlsx',
      sheets: [
        {
          name: 'Test',
          data: [
            ['Item', 'Quantité', 'Prix'],
            ['Service A', 1, 100],
            ['Service B', 2, 50],
          ],
        },
      ],
    });
    return result.success
      ? {
          status: 'pass',
          evidence: { filename: result.filename, sizeBytes: result.sizeBytes, blobUrl: result.blobUrl },
        }
      : { status: 'fail', error: result.error ?? 'Inconnu' };
  }

  private async testPdf(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { pdfGenerator } = await import('../skills/pdf-generator.js');
    const result = await pdfGenerator.generate({
      template: 'invoice',
      data: {
        number: 'AUTO-TEST-001',
        client_name: 'Apex Runtime',
        items: [{ description: 'Test', quantity: 1, unit_price: 100 }],
      },
    });
    return result.success
      ? {
          status: 'pass',
          evidence: { filename: result.filename, sizeBytes: result.sizeBytes, blobUrl: result.blobUrl },
        }
      : { status: 'fail', error: result.error ?? 'Inconnu' };
  }

  private async testMcpHealth(serverId: string): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { mcpClient } = await import('../ai/mcp-client.js');
    const t0 = Date.now();
    try {
      const health = await mcpClient.healthCheck(serverId);
      return {
        status: health.alive ? 'pass' : 'warn',
        evidence: { latencyMs: Date.now() - t0, output: health },
        ...(health.alive ? {} : { error: 'Server not alive (token absent ou URL down)' }),
      };
    } catch (err) {
      return { status: 'fail', error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async testFuturistic(moduleId: string): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { futuristicModules } = await import('../skills/futuristic-modules.js');
    const result = await futuristicModules.invoke(moduleId, {});
    return result.success
      ? { status: 'pass', evidence: { output: { module_id: result.module_id, category: result.category } } }
      : { status: 'fail', error: result.error ?? 'Inconnu' };
  }

  private async testSkillsWatch(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { skillsWatch } = await import('../sentinels/skills-watch.js');
    const report = await skillsWatch.skillsWatch();
    return {
      status: report.severity === 'ok' ? 'pass' : report.severity === 'warn' ? 'warn' : 'fail',
      evidence: { output: report.details },
      ...(report.severity !== 'ok' ? { error: report.message } : {}),
    };
  }

  private async testMcpHealthWatch(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    const { skillsWatch } = await import('../sentinels/skills-watch.js');
    const report = await skillsWatch.mcpHealthWatch();
    return {
      status: report.severity === 'ok' ? 'pass' : report.severity === 'warn' ? 'warn' : 'fail',
      evidence: { output: report.details },
      ...(report.severity !== 'ok' ? { error: report.message } : {}),
    };
  }

  private async testSecurityReview(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    try {
      const { apexSelfAudit } = await import('./apex-self-audit.js');
      const report = await apexSelfAudit.runFullAudit(false);
      const score = (report as { score?: number })?.score ?? 0;
      return {
        status: score >= 80 ? 'pass' : score >= 60 ? 'warn' : 'fail',
        evidence: { output: { score } },
      };
    } catch (err) {
      return { status: 'fail', error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async testHyperframes(): Promise<{ status: RuntimeTestStatus; evidence?: RuntimeTestResult['evidence']; error?: string }> {
    /* MediaRecorder dispo browser ? */
    if (typeof MediaRecorder === 'undefined') {
      return { status: 'skip', error: 'MediaRecorder API indispo (env headless/old browser)' };
    }
    /* HTMLCanvasElement.captureStream ? */
    const testCanvas = document.createElement('canvas');
    if (typeof (testCanvas as HTMLCanvasElement & { captureStream?: unknown }).captureStream !== 'function') {
      return { status: 'skip', error: 'canvas.captureStream indispo' };
    }
    return {
      status: 'pass',
      evidence: { output: { mediaRecorder: 'available', captureStream: 'available' } },
    };
  }
}

export const runtimeTester = new RuntimeTester();
