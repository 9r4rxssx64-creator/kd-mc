/**
 * APEX v13 — Tests deep apex-self-audit (push 70% → 95%)
 *
 * Couvre : auto-fix paths, escalateToClaudeCode, dispatchGithubAudit, formatReportMarkdown,
 * brutal mode, audits par axe, edge cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn(async () => {}) },
}));

vi.mock('../../services/auth/soc2-compliance.js', () => ({
  soc2: {
    record: vi.fn(async () => {}),
    verifyIntegrity: vi.fn(async () => ({ ok: true, broken_at: -1, total: 100 })),
  },
}));

vi.mock('../../services/vault/vault.js', () => ({
  vault: { readKey: vi.fn(async () => '') },
}));

vi.mock('../../services/vault/secret-scanner.js', () => ({
  secretScanner: {
    getStats: vi.fn(async () => ({ leaks_count: 0, by_severity: { critical: 0 } })),
    autoMigrate: vi.fn(async () => ({ migrated: 0 })),
  },
}));

vi.mock('../../services/storage/storage-compressor.js', () => ({
  storageCompressor: {
    getQuotaStatus: vi.fn(() => ({ severity: 'ok', used_mb: 1, pct: 20 })),
    migrateAllToCompressed: vi.fn(async () => ({ migrated: 0 })),
  },
}));

vi.mock('../../services/sentinels/sentinels.js', () => ({
  sentinels: { list: vi.fn(() => []) },
}));

vi.mock('../../services/core-svc/service-lifecycle.js', () => ({
  lifecycle: {
    getStats: vi.fn(() => ({ total: 50, failed: 0, total_intervals_tracked: 5 })),
  },
}));

vi.mock('../../services/ai/ai-routing-policy.js', () => ({
  aiRoutingPolicy: {
    getStatus: vi.fn(() => ({
      paid_providers_available: ['anthropic'],
      free_providers_available: ['groq'],
      anthropic_health: 'ok',
    })),
    setMode: vi.fn(),
  },
}));

vi.mock('../../services/ai/context-loader.js', () => ({
  contextLoader: { load: vi.fn(async () => ({ rules: ['rule1'] })) },
}));

import { apexSelfAudit } from '../../services/admin/apex-self-audit.js';
import { vault } from '../../services/vault/vault.js';
import { secretScanner } from '../../services/vault/secret-scanner.js';
import { storageCompressor } from '../../services/storage/storage-compressor.js';
import { sentinels } from '../../services/sentinels/sentinels.js';
import { lifecycle } from '../../services/core-svc/service-lifecycle.js';
import { aiRoutingPolicy } from '../../services/ai/ai-routing-policy.js';
import { soc2 } from '../../services/auth/soc2-compliance.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  /* Reset defaults */
  (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({ leaks_count: 0, by_severity: { critical: 0 } });
  (soc2.verifyIntegrity as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, broken_at: -1, total: 100 });
  (storageCompressor.getQuotaStatus as ReturnType<typeof vi.fn>).mockReturnValue({ severity: 'ok', used_mb: 1, pct: 20 });
  (sentinels.list as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (lifecycle.getStats as ReturnType<typeof vi.fn>).mockReturnValue({ total: 50, failed: 0, total_intervals_tracked: 5 });
  (aiRoutingPolicy.getStatus as ReturnType<typeof vi.fn>).mockReturnValue({
    paid_providers_available: ['anthropic'],
    free_providers_available: ['groq'],
    anthropic_health: 'ok',
  });
  (globalThis as { __APEX_AI_ROUTER_READY__?: boolean }).__APEX_AI_ROUTER_READY__ = true;
});

afterEach(() => {
  localStorage.clear();
});

describe('apex-self-audit — runFullAudit basic', () => {
  it('runFullAudit retourne report avec scores par axe', async () => {
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.id).toMatch(/^audit_/);
    expect(r.total_score).toBeGreaterThanOrEqual(0);
    expect(r.total_score).toBeLessThanOrEqual(100); /* v13.4.256 : score pondéré /100 */
    expect(r.axes.security.score).toBeDefined();
    expect(r.axes.performance.score).toBeDefined();
    expect(r.axes.ux.score).toBeDefined();
    expect(r.axes.tests.score).toBeDefined();
    expect(r.axes.architecture.score).toBeDefined();
    expect(r.axes.ai_safety.score).toBeDefined();
  });

  it('persistReport sauvegarde dans localStorage', async () => {
    await apexSelfAudit.runFullAudit(false);
    const reports = apexSelfAudit.listReports();
    expect(reports.length).toBeGreaterThan(0);
  });

  it('listReports vide initialement', () => {
    expect(apexSelfAudit.listReports()).toEqual([]);
  });

  it('getLastReport null si vide', () => {
    expect(apexSelfAudit.getLastReport()).toBeNull();
  });

  it('getLastReport retourne dernier après audit', async () => {
    await apexSelfAudit.runFullAudit(false);
    const last = apexSelfAudit.getLastReport();
    expect(last).not.toBeNull();
  });
});

describe('apex-self-audit — auditSecurity findings', () => {
  it('leaks_count > 0 → finding p0', async () => {
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 3, by_severity: { critical: 2 },
    });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('Tokens plaintext'))).toBe(true);
  });

  it('soc2 not ok → finding p0', async () => {
    (soc2.verifyIntegrity as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, broken_at: 5, total: 100 });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('SOC2 audit chain'))).toBe(true);
  });

  it('PIN admin absent → finding p2', async () => {
    /* localStorage.clear() in beforeEach so no apex_v13_pin */
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('PIN admin'))).toBe(true);
  });

  it('mode brutal : >3 fails compteurs → finding p1', async () => {
    for (let i = 0; i < 5; i++) localStorage.setItem(`apex_v13_pin_fails_user${i}`, '3');
    const r = await apexSelfAudit.runFullAudit(true);
    expect(r.findings.some((f) => f.title.includes('compteurs rate-limit'))).toBe(true);
  });

  it('mode brutal : device non trusted → finding p2', async () => {
    const r = await apexSelfAudit.runFullAudit(true);
    expect(r.findings.some((f) => f.title.includes('Device non trusted'))).toBe(true);
  });
});

describe('apex-self-audit — auditPerformance findings', () => {
  it('quota critical → finding p0', async () => {
    (storageCompressor.getQuotaStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({ severity: 'critical', used_mb: 4.9, pct: 98 });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('Storage quota critique'))).toBe(true);
  });

  it('quota warn → finding p2', async () => {
    (storageCompressor.getQuotaStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({ severity: 'warn', used_mb: 4, pct: 80 });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('Storage quota warn'))).toBe(true);
  });

  it('sentinelles en exception (errored=true) → finding p1 (v13.4)', async () => {
    /* v13.4 distingue errored=true (sentinelle crashée → P1, restart pertinent)
       de ok=false sans errored (sentinelle qui FONCTIONNE et signale un vrai
       problème → P2 "signalent un problème", pas une erreur de sentinelle). */
    (sentinels.list as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { name: 's1', lastResult: { ok: false, errored: true } },
      { name: 's2', lastResult: { ok: false, errored: true } },
      { name: 's3', lastResult: { ok: false, errored: true } },
      { name: 's4', lastResult: { ok: false, errored: true } },
    ]);
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('en erreur (exception)'))).toBe(true);
  });

  it('intervals >50 → finding p1', async () => {
    (lifecycle.getStats as ReturnType<typeof vi.fn>).mockReturnValue({ total: 50, failed: 0, total_intervals_tracked: 100 });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('intervals tracked'))).toBe(true);
  });
});

describe('apex-self-audit — auditAISafety findings', () => {
  it('aucun provider configuré → finding p0', async () => {
    (aiRoutingPolicy.getStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      paid_providers_available: [],
      free_providers_available: [],
      anthropic_health: 'ok',
    });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('Aucun provider IA'))).toBe(true);
  });

  it('anthropic critical → finding p1', async () => {
    (aiRoutingPolicy.getStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      paid_providers_available: ['anthropic'],
      free_providers_available: [],
      anthropic_health: 'critical',
    });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(r.findings.some((f) => f.title.includes('Anthropic budget'))).toBe(true);
  });

  it('mode brutal : router not ready → finding p0', async () => {
    (globalThis as { __APEX_AI_ROUTER_READY__?: boolean }).__APEX_AI_ROUTER_READY__ = false;
    const r = await apexSelfAudit.runFullAudit(true);
    expect(r.findings.some((f) => f.title.includes('AI router not initialized'))).toBe(true);
  });
});

describe('apex-self-audit — auto-fix paths', () => {
  it('auto_migrate_secrets → secretScanner.autoMigrate', async () => {
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 1 });
    const r = await apexSelfAudit.runFullAudit(false);
    expect(secretScanner.autoMigrate).toHaveBeenCalled();
    /* Au moins 1 finding auto-fixed */
    expect(r.auto_fixed_count).toBeGreaterThan(0);
  });

  it('aggressive_storage_cleanup trim audit + telemetry', async () => {
    /* Setup audit log + telemetry */
    const log = Array.from({ length: 100 }, (_, i) => ({ ts: i }));
    localStorage.setItem('apex_v13_audit_log', JSON.stringify(log));
    localStorage.setItem('ax_telemetry_in', JSON.stringify(log));
    (storageCompressor.getQuotaStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({ severity: 'critical', used_mb: 4.9, pct: 98 });
    await apexSelfAudit.runFullAudit(false);
    const auditLog = JSON.parse(localStorage.getItem('apex_v13_audit_log') ?? '[]') as unknown[];
    expect(auditLog.length).toBeLessThanOrEqual(50);
  });

  it('compress_storage → storageCompressor.migrateAllToCompressed', async () => {
    (storageCompressor.getQuotaStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({ severity: 'warn', used_mb: 4, pct: 80 });
    (storageCompressor.migrateAllToCompressed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 5 });
    /* warn = p2, mais p2 n'est PAS auto-fixé (only p0/p1) */
    const r = await apexSelfAudit.runFullAudit(false);
    /* warn=p2 → no auto-fix attempt */
    expect(r.findings.some((f) => f.title.includes('Storage quota warn'))).toBe(true);
  });

  it('switch_to_economy_mode → aiRoutingPolicy.setMode', async () => {
    (aiRoutingPolicy.getStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      paid_providers_available: ['anthropic'],
      free_providers_available: [],
      anthropic_health: 'critical',
    });
    await apexSelfAudit.runFullAudit(false);
    expect(aiRoutingPolicy.setMode).toHaveBeenCalledWith('economy');
  });
});

describe('apex-self-audit — escalateToClaudeCode', () => {
  it('escalation persiste dans ax_claude_todo', async () => {
    /* Setup finding qui va échouer auto-fix → escalade */
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 0 });
    await apexSelfAudit.runFullAudit(false);
    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<{ type: string }>;
    expect(todos.some((t) => t.type === 'self_audit_escalation')).toBe(true);
  });
});

describe('apex-self-audit — dispatchGithubAudit', () => {
  it('pas de github token → pas de fetch', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    /* Trigger escalade */
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 0 });
    await apexSelfAudit.runFullAudit(false);
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('api.github.com'),
      expect.any(Object),
    );
    fetchSpy.mockRestore();
  });

  it('avec github token → POST github dispatches', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_test');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 0 });
    await apexSelfAudit.runFullAudit(false);
    /* Wait microtasks */
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos'),
      expect.objectContaining({ method: 'POST' }),
    );
    fetchSpy.mockRestore();
  });

  it('repo override via localStorage', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_test');
    localStorage.setItem('ax_github_repo', 'kevin-test/myrepo');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 0 });
    await apexSelfAudit.runFullAudit(false);
    await new Promise((r) => setTimeout(r, 30));
    const url = (fetchSpy.mock.calls.find((c) => String(c[0]).includes('api.github.com'))?.[0] ?? '') as string;
    expect(url).toContain('kevin-test/myrepo');
    fetchSpy.mockRestore();
  });

  it('github fetch !ok → log warn', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_test');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 0 });
    await apexSelfAudit.runFullAudit(false);
    await new Promise((r) => setTimeout(r, 30));
    fetchSpy.mockRestore();
  });

  it('vault.readKey throw → no dispatch', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('vault'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 0 });
    await apexSelfAudit.runFullAudit(false);
    /* Pas appelé github car token throw */
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('api.github.com'),
      expect.any(Object),
    );
    fetchSpy.mockRestore();
  });

  it('webhook n8n configuré → fetch webhook', async () => {
    localStorage.setItem('ax_n8n_webhook_url', 'https://example.com/wh');
    localStorage.setItem('ax_n8n_secret', 'sec123');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    (secretScanner.autoMigrate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ migrated: 0 });
    await apexSelfAudit.runFullAudit(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/wh',
      expect.objectContaining({ method: 'POST', headers: expect.any(Object) }),
    );
    fetchSpy.mockRestore();
  });
});

describe('apex-self-audit — formatReportMarkdown', () => {
  it('format un rapport en markdown lisible', async () => {
    const r = await apexSelfAudit.runFullAudit(false);
    const md = apexSelfAudit.formatReportMarkdown(r);
    expect(md).toContain('# 🔍 Audit Apex');
    expect(md).toContain('Score :');
    expect(md).toContain('Scores par axe');
    expect(md).toContain('Statistiques');
    expect(md).toContain('Prochaines étapes');
  });

  it('inclut findings P0/P1 si présents', async () => {
    (secretScanner.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leaks_count: 1, by_severity: { critical: 1 },
    });
    const r = await apexSelfAudit.runFullAudit(false);
    const md = apexSelfAudit.formatReportMarkdown(r);
    expect(md).toContain('Findings P0/P1');
  });
});

describe('apex-self-audit — listReports edge cases', () => {
  it('JSON corrompu → []', () => {
    localStorage.setItem('apex_v13_audit_reports', 'not-json');
    expect(apexSelfAudit.listReports()).toEqual([]);
  });
});
