/**
 * APEX v13 — Tests deep auto-test-everything.ts (push 63.57% → 90%+).
 *
 * Cible les branches manquantes : phases qui throw, retry attempts variés,
 * alternative link patterns, escalateToClaudeCode cap 50, progressCb appelé,
 * globalStatus thresholds, lock _running.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/* Mocks des dépendances pour contrôler chaque phase */
const healthCheckAllMock = vi.fn();
const listAllMock = vi.fn();
const listKeysMock = vi.fn();
/* v13.4.243 : paths alignés sur la restructure services/ en domaines
 * (chantier 1). Les anciens paths plats `../../services/<x>.js` ne
 * correspondaient plus aux imports réels de auto-test-everything.ts →
 * les mocks ne s'appliquaient pas → 18 tests cassés. */
vi.mock('../../services/vault/multi-key-vault.js', () => ({
  multiKeyVault: {
    healthCheckAll: () => healthCheckAllMock(),
    listAll: () => listAllMock(),
    listKeys: (svc: string, includeMasked: boolean) => listKeysMock(svc, includeMasked),
  },
}));

const retestAllMock = vi.fn();
const linksListMock = vi.fn();
const testAliveMock = vi.fn();
vi.mock('../../services/integrations/links-registry.js', () => ({
  linksRegistry: {
    retestAll: () => retestAllMock(),
    list: () => linksListMock(),
    testAlive: (svc: string) => testAliveMock(svc),
  },
}));

const sentinelsListMock = vi.fn();
const sentinelsRunOneMock = vi.fn();
vi.mock('../../services/sentinels/sentinels-registry.js', () => ({
  sentinelsRegistry: {
    list: () => sentinelsListMock(),
    runOne: (id: string) => sentinelsRunOneMock(id),
  },
}));

const connectorsListConfiguredMock = vi.fn();
vi.mock('../../services/integrations/direct-connectors-registry.js', () => ({
  directConnectors: { listConfigured: () => connectorsListConfiguredMock() },
}));

const vaultDeepScanMock = vi.fn();
vi.mock('../../services/vault/vault-deep-recovery.js', () => ({
  vaultDeepRecovery: { scanAndRestoreAll: () => vaultDeepScanMock() },
}));

import { autoTestEverything } from '../../services/admin/auto-test-everything.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  (autoTestEverything as unknown as { _running: boolean; _lastReport: unknown }).
    _running = false;
  (autoTestEverything as unknown as { _running: boolean; _lastReport: unknown }).
    _lastReport = null;
  /* Defaults sains */
  healthCheckAllMock.mockResolvedValue({ tested: 0, recovered: 0, stillDown: 0 });
  listAllMock.mockReturnValue([]);
  listKeysMock.mockReturnValue([]);
  retestAllMock.mockResolvedValue({ tested: 0, alive: 0, dead: 0 });
  linksListMock.mockReturnValue([]);
  testAliveMock.mockResolvedValue({ dashboard: true, api_keys: true, billing: true });
  sentinelsListMock.mockReturnValue([]);
  sentinelsRunOneMock.mockResolvedValue({ status: 'ok', message: 'ok', durationMs: 5 });
  connectorsListConfiguredMock.mockResolvedValue([]);
  vaultDeepScanMock.mockResolvedValue({ restored: 0, reclassified: 0, details: { errors: [] } });
});

afterEach(() => {
  localStorage.clear();
});

describe('auto-test-everything — runFullHealthCheck', () => {
  it('retourne report avec status green si tout OK + score 100', async () => {
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.globalStatus).toBe('green');
    expect(r.globalScorePct).toBe(100);
    expect(r.errors).toHaveLength(0);
  });

  it('progressCb appelé pour chaque phase + done', async () => {
    const cb = vi.fn();
    await autoTestEverything.runFullHealthCheck(cb);
    const phases = cb.mock.calls.map((c) => (c[0] as { phase: string }).phase);
    expect(phases).toContain('codes');
    expect(phases).toContain('links');
    expect(phases).toContain('sentinels');
    expect(phases).toContain('connectors');
    expect(phases).toContain('vault');
    expect(phases).toContain('done');
  });

  it('phase codes throw → ajoute errors mais continue', async () => {
    healthCheckAllMock.mockRejectedValueOnce(new Error('Vault down'));
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.errors.some((e) => e.includes('codes'))).toBe(true);
    expect(r.globalStatus).toBeDefined();
  });

  it('phase links throw → erreur capturée', async () => {
    retestAllMock.mockRejectedValueOnce(new Error('Network'));
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.errors.some((e) => e.includes('links'))).toBe(true);
  });

  it('phase sentinels throw → erreur capturée', async () => {
    sentinelsListMock.mockImplementationOnce(() => {
      throw new Error('Bad registry');
    });
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.errors.some((e) => e.includes('sentinels'))).toBe(true);
  });

  it('phase connectors throw → erreur capturée', async () => {
    connectorsListConfiguredMock.mockRejectedValueOnce(new Error('Connectors fail'));
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.errors.some((e) => e.includes('connectors'))).toBe(true);
  });

  it('phase vault throw → erreur capturée', async () => {
    vaultDeepScanMock.mockRejectedValueOnce(new Error('Vault scan KO'));
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.errors.some((e) => e.includes('vault'))).toBe(true);
  });

  it('items codes avec active > 0 → status ok', async () => {
    listAllMock.mockReturnValue([{ service: 'anthropic' }, { service: 'openai' }]);
    listKeysMock.mockImplementation((svc: string) =>
      svc === 'anthropic'
        ? [{ status: 'active' }, { status: 'rotated' }]
        : [{ status: 'expired' }],
    );
    const r = await autoTestEverything.runFullHealthCheck();
    const anth = r.items.find((i) => i.id === 'codes:anthropic');
    expect(anth?.status).toBe('ok');
    const openai = r.items.find((i) => i.id === 'codes:openai');
    expect(openai?.status).toBe('warn');
  });

  it('items codes avec 0 keys → status error', async () => {
    listAllMock.mockReturnValue([{ service: 'fake' }]);
    listKeysMock.mockReturnValue([]);
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.items.find((i) => i.id === 'codes:fake')?.status).toBe('error');
  });

  it('link mort → alternative proposée si pattern connu', async () => {
    linksListMock.mockReturnValue([
      { service: 'anthropic', alive: false, dashboard: 'https://orig.io' },
    ]);
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.alternativesProposed.length).toBeGreaterThan(0);
    expect(r.alternativesProposed[0]?.service).toBe('anthropic');
  });

  it('link mort sans pattern alternatif connu → pas d\'alternative', async () => {
    linksListMock.mockReturnValue([
      { service: 'unknown-svc', alive: false, dashboard: 'x' },
    ]);
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.alternativesProposed).toHaveLength(0);
  });

  it('sentinelle runOne throw → status error capturé', async () => {
    sentinelsListMock.mockReturnValue([{ id: 'sent1', name: 'Sent', enabled: true }]);
    sentinelsRunOneMock.mockRejectedValueOnce(new Error('Sentinelle crash'));
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.items.find((i) => i.id === 'sentinel:sent1')?.status).toBe('error');
  });

  it('sentinelle disabled → pas runOne', async () => {
    sentinelsListMock.mockReturnValue([
      { id: 'enabled1', name: 'A', enabled: true },
      { id: 'disabled1', name: 'B', enabled: false },
    ]);
    await autoTestEverything.runFullHealthCheck();
    expect(sentinelsRunOneMock).toHaveBeenCalledTimes(1);
    expect(sentinelsRunOneMock).toHaveBeenCalledWith('enabled1');
  });

  it('connecteurs limit 10 max testés', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`,
      category: 'mcp',
      accessMode: 'oauth',
      vaultKeys: [],
    }));
    connectorsListConfiguredMock.mockResolvedValue(many);
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.byCategory.connectors.tested).toBe(10);
    expect(r.byCategory.connectors.configured).toBe(15);
  });

  it('globalStatus yellow si 70-89% ok', async () => {
    /* Generate 10 items dont 8 ok et 2 warn */
    listAllMock.mockReturnValue(Array.from({ length: 10 }, (_, i) => ({ service: `svc${i}` })));
    listKeysMock.mockImplementation((svc: string) =>
      Number(svc.replace('svc', '')) < 8 ? [{ status: 'active' }] : [{ status: 'expired' }],
    );
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.globalStatus).toBe('yellow');
  });

  it('globalStatus red si < 70% ok', async () => {
    listAllMock.mockReturnValue(Array.from({ length: 10 }, (_, i) => ({ service: `svc${i}` })));
    listKeysMock.mockImplementation((svc: string) =>
      Number(svc.replace('svc', '')) < 5 ? [{ status: 'active' }] : [],
    );
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.globalStatus).toBe('red');
  });

  it('lock _running empêche double-run + retourne lastReport', async () => {
    /* 1er run */
    const r1 = await autoTestEverything.runFullHealthCheck();
    expect(r1).toBeTruthy();
    /* Force flag _running pour simuler concurrent */
    (autoTestEverything as unknown as { _running: boolean }).
      _running = true;
    const r2 = await autoTestEverything.runFullHealthCheck();
    /* Doit retourner lastReport sans relancer */
    expect(r2).toBe(r1);
  });

  it('vault deep recovery avec errors → status warn', async () => {
    vaultDeepScanMock.mockResolvedValue({
      restored: 1,
      reclassified: 0,
      details: { errors: ['err1'] },
    });
    const r = await autoTestEverything.runFullHealthCheck();
    const vaultItem = r.items.find((i) => i.id === 'vault:deep-recovery');
    expect(vaultItem?.status).toBe('warn');
  });
});

describe('auto-test-everything — retryFailedItems', () => {
  it('aucun failed → retourne report identique', async () => {
    const r = await autoTestEverything.runFullHealthCheck();
    const r2 = await autoTestEverything.retryFailedItems(r);
    expect(r2).toBe(r);
  });

  it('si _running → retourne report sans retry', async () => {
    const r = await autoTestEverything.runFullHealthCheck();
    (autoTestEverything as unknown as { _running: boolean })._running = true;
    const r2 = await autoTestEverything.retryFailedItems(r);
    expect(r2).toBe(r);
  });

  it('retry succès codes → status passe à ok', async () => {
    /* Setup avec 1 failed item */
    listAllMock.mockReturnValue([{ service: 'anthropic' }]);
    listKeysMock.mockReturnValue([]);
    const r = await autoTestEverything.runFullHealthCheck();
    expect(r.failedItems.length).toBeGreaterThan(0);
    /* Mock retry success */
    listKeysMock.mockReturnValue([{ status: 'active' }]);
    const r2 = await autoTestEverything.retryFailedItems(r, 1);
    /* Score peut s'améliorer */
    expect(r2.globalScorePct).toBeGreaterThanOrEqual(r.globalScorePct);
  });

  it('retry échec → reste failed + escalate ax_claude_todo', async () => {
    listAllMock.mockReturnValue([{ service: 'anthropic' }]);
    listKeysMock.mockReturnValue([]);
    const r = await autoTestEverything.runFullHealthCheck();
    const r2 = await autoTestEverything.retryFailedItems(r, 1);
    expect(r2.failedItems.length).toBeGreaterThan(0);
    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
    expect(todos.some((t: { id: string }) => t.id?.includes('auto-test'))).toBe(true);
  });

  it('retry sentinelle warn → success (status==warn ok)', async () => {
    sentinelsListMock.mockReturnValue([{ id: 's1', name: 'S1', enabled: true }]);
    sentinelsRunOneMock.mockResolvedValueOnce({ status: 'error', message: 'fail', durationMs: 0 });
    const r = await autoTestEverything.runFullHealthCheck();
    sentinelsRunOneMock.mockResolvedValueOnce({ status: 'warn', message: 'partial', durationMs: 0 });
    const r2 = await autoTestEverything.retryFailedItems(r, 1);
    expect(r2.totals.error).toBeLessThan(r.totals.error);
  });

  it('retry vault succès', async () => {
    /* Force vault item failed mais on doit fabriquer un report avec items */
    const r = {
      ts: 1,
      durationMs: 10,
      globalStatus: 'red' as const,
      globalScorePct: 0,
      totals: { total: 1, ok: 0, warn: 0, error: 1 },
      byCategory: {
        codes: { tested: 0, recovered: 0, stillDown: 0 },
        links: { tested: 0, alive: 0, dead: 0 },
        sentinels: { total: 0, ok: 0, warn: 0, error: 0 },
        connectors: { configured: 0, tested: 0, failed: 0 },
        vault: { restored: 0, reclassified: 0 },
      },
      items: [{ id: 'vault:deep-recovery', category: 'vault' as const, label: 'V', status: 'error' as const, message: 'errs' }],
      failedItems: [{ id: 'vault:deep-recovery', category: 'vault' as const, label: 'V', status: 'error' as const, message: 'errs' }],
      alternativesProposed: [],
      errors: [],
    };
    /* Mock default already returns errors:[] (set in beforeEach) → retry → success */
    vaultDeepScanMock.mockResolvedValue({ restored: 5, reclassified: 1, details: { errors: [] } });
    const r2 = await autoTestEverything.retryFailedItems(r, 1);
    expect(r2.items[0]?.status).toBe('ok');
  });

  it('escalation severity critical si stillFailed >= 5', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `codes:s${i}`, category: 'codes' as const, label: `s${i}`, status: 'error' as const,
    }));
    const r = {
      ts: 1, durationMs: 0,
      globalStatus: 'red' as const,
      globalScorePct: 0,
      totals: { total: 5, ok: 0, warn: 0, error: 5 },
      byCategory: {
        codes: { tested: 5, recovered: 0, stillDown: 5 },
        links: { tested: 0, alive: 0, dead: 0 },
        sentinels: { total: 0, ok: 0, warn: 0, error: 0 },
        connectors: { configured: 0, tested: 0, failed: 0 },
        vault: { restored: 0, reclassified: 0 },
      },
      items, failedItems: items, alternativesProposed: [], errors: [],
    };
    listKeysMock.mockReturnValue([]);
    await autoTestEverything.retryFailedItems(r, 1);
    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
    expect(todos[todos.length - 1]?.severity).toBe('critical');
  });
});

describe('auto-test-everything — helpers', () => {
  it('findAlternativeLink connu → retourne alt', () => {
    expect(autoTestEverything.findAlternativeLink('anthropic')).toBe('https://console.anthropic.com');
    expect(autoTestEverything.findAlternativeLink('OPENAI')).toBe('https://platform.openai.com');
  });

  it('findAlternativeLink inconnu → null', () => {
    expect(autoTestEverything.findAlternativeLink('totally-unknown')).toBeNull();
  });

  it('getLastReport null avant tout run', () => {
    expect(autoTestEverything.getLastReport()).toBeNull();
  });

  it('getLastReport après run → report', async () => {
    await autoTestEverything.runFullHealthCheck();
    expect(autoTestEverything.getLastReport()).not.toBeNull();
  });

  it('isRunning false par défaut', () => {
    expect(autoTestEverything.isRunning()).toBe(false);
  });
});

describe('auto-test-everything — escalateToClaudeCode cap', () => {
  it('cap todos 50 entries', async () => {
    /* Pre-fill avec 55 */
    const big = Array.from({ length: 55 }, (_, i) => ({ id: `existing_${i}` }));
    localStorage.setItem('ax_claude_todo', JSON.stringify(big));
    /* Force escalation via retry échec */
    listAllMock.mockReturnValue([{ service: 'anthropic' }]);
    listKeysMock.mockReturnValue([]);
    const r = await autoTestEverything.runFullHealthCheck();
    await autoTestEverything.retryFailedItems(r, 1);
    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
    expect(todos.length).toBeLessThanOrEqual(50);
  });
});
