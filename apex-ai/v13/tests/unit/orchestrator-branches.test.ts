/**
 * orchestrator — couverture branches complète (campagne 100% réel, 2026-06-02).
 * Couvre tous les scopes de cmcRead + santé import + openTool, en mockant firebase.read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/storage/firebase.js', () => ({
  firebase: { read: vi.fn(async () => null) },
}));

import { orchestrator } from '../../services/core-svc/orchestrator.js';
import { firebase } from '../../services/storage/firebase.js';

const read = firebase.read as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('orchestrator — cmcRead scopes', () => {
  it("scope 'all' → lit racine cmcteams (+ warn déprécié)", async () => {
    read.mockResolvedValueOnce({ big: true });
    const r = await orchestrator.cmcRead({ scope: 'all' });
    expect(read).toHaveBeenCalledWith('cmcteams');
    expect(r).toEqual({ big: true });
  });

  it("scope 'employees' → cmcteams/cmc_e", async () => {
    await orchestrator.cmcRead({ scope: 'employees' });
    expect(read).toHaveBeenCalledWith('cmcteams/cmc_e');
  });

  it("scope 'teams' → cmcteams/cmc_t", async () => {
    await orchestrator.cmcRead({ scope: 'teams' });
    expect(read).toHaveBeenCalledWith('cmcteams/cmc_t');
  });

  it("scope 'motd' → cmcteams/cmc_motd", async () => {
    await orchestrator.cmcRead({ scope: 'motd' });
    expect(read).toHaveBeenCalledWith('cmcteams/cmc_motd');
  });

  it("scope 'audit' → cmcteams/cmc_audit", async () => {
    await orchestrator.cmcRead({ scope: 'audit' });
    expect(read).toHaveBeenCalledWith('cmcteams/cmc_audit');
  });

  it("scope par défaut (last_import_health) → objet santé", async () => {
    const r = (await orchestrator.cmcRead()) as { ok: boolean };
    expect(typeof r.ok).toBe('boolean');
  });

  it("scope 'overrides' avec year+month → chemin daté", async () => {
    await orchestrator.cmcRead({ scope: 'overrides', year: 2026, month: 6 });
    expect(read).toHaveBeenCalledWith('cmcteams/cmc_ov/2026-6');
  });

  it("scope 'overrides' sans year/month → racine cmc_ov", async () => {
    await orchestrator.cmcRead({ scope: 'overrides' });
    expect(read).toHaveBeenCalledWith('cmcteams/cmc_ov');
  });

  it("scope 'planning_month' avec year+month → chemin daté", async () => {
    await orchestrator.cmcRead({ scope: 'planning_month', year: 2026, month: 5 });
    expect(read).toHaveBeenCalledWith('cmcteams/cmc_ov/2026-5');
  });

  it("scope 'planning_month' SANS year/month → invalid_scope", async () => {
    const r = (await orchestrator.cmcRead({ scope: 'planning_month' })) as { error: string };
    expect(r.error).toBe('invalid_scope_or_missing_params');
  });

  it("scope 'planning_user' → filtre par uid + jour", async () => {
    read.mockResolvedValueOnce({
      kdmc_1: { code: 'A' },
      kdmc_2: { code: 'B' },
      other_3: { code: 'X' },
    });
    const r = (await orchestrator.cmcRead({
      scope: 'planning_user', user_uid: 'kdmc', year: 2026, month: 6, day: 1,
    })) as { days: Record<string, unknown> };
    expect(r.days).toEqual({ '1': { code: 'A' } }); // day=1 filtre, exclut kdmc_2 et other_3
  });

  it("scope 'planning_user' sans filtre jour → tous les jours de l'uid", async () => {
    read.mockResolvedValueOnce({ kdmc_1: { c: 'A' }, kdmc_2: { c: 'B' }, zz_5: { c: 'Z' } });
    const r = (await orchestrator.cmcRead({
      scope: 'planning_user', user_uid: 'kdmc', year: 2026, month: 6,
    })) as { days: Record<string, unknown> };
    expect(Object.keys(r.days).sort()).toEqual(['1', '2']);
  });

  it("scope 'planning_user' monthData null → null", async () => {
    read.mockResolvedValueOnce(null);
    const r = await orchestrator.cmcRead({
      scope: 'planning_user', user_uid: 'kdmc', year: 2026, month: 6,
    });
    expect(r).toBeNull();
  });

  it("scope 'planning_user' monthData non-objet → null", async () => {
    read.mockResolvedValueOnce('pas-un-objet' as unknown as Record<string, unknown>);
    const r = await orchestrator.cmcRead({
      scope: 'planning_user', user_uid: 'kdmc', year: 2026, month: 6,
    });
    expect(r).toBeNull();
  });

  it("scope 'planning_user' sans params requis → invalid_scope", async () => {
    const r = (await orchestrator.cmcRead({ scope: 'planning_user' })) as { error: string };
    expect(r.error).toBe('invalid_scope_or_missing_params');
  });
});

describe('orchestrator — santé import + audit', () => {
  it('cmcImportAuditLog : reads non-array → [] []', async () => {
    read.mockResolvedValue(null);
    const r = await orchestrator.cmcImportAuditLog();
    expect(r.fidelity).toEqual([]);
    expect(r.lossless).toEqual([]);
  });

  it('cmcImportAuditLog : read throw → catch → [] []', async () => {
    read.mockRejectedValue(new Error('fb down'));
    const r = await orchestrator.cmcImportAuditLog();
    expect(r.fidelity).toEqual([]);
    expect(r.lossless).toEqual([]);
  });

  it('cmcLastImportHealth : fidélité < 75 ET gap > 5 → 2 issues + champs', async () => {
    read.mockImplementation(async (path: string) => {
      if (path.includes('fidelity')) return [{ score: 50 }];
      if (path.includes('lossless')) return [{ gap: 10 }];
      return null;
    });
    const r = await orchestrator.cmcLastImportHealth();
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBe(2);
    expect(r.fidelity_score).toBe(50);
    expect(r.lossless_gap).toBe(10);
  });

  it('cmcLastImportHealth : fidélité OK + gap OK → ok=true, 0 issue', async () => {
    read.mockImplementation(async (path: string) => {
      if (path.includes('fidelity')) return [{ score: 99 }];
      if (path.includes('lossless')) return [{ gap: 1 }];
      return null;
    });
    const r = await orchestrator.cmcLastImportHealth();
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.fidelity_score).toBe(99);
  });

  it('cmcLastImportHealth : logs vides → ok=true sans champs score/gap', async () => {
    read.mockResolvedValue([]);
    const r = await orchestrator.cmcLastImportHealth();
    expect(r.ok).toBe(true);
    expect(r.fidelity_score).toBeUndefined();
    expect(r.lossless_gap).toBeUndefined();
  });

  it('kdmcStats → lit ekdmc', async () => {
    read.mockResolvedValueOnce({ orders: 3 });
    expect(await orchestrator.kdmcStats()).toEqual({ orders: 3 });
    expect(read).toHaveBeenCalledWith('ekdmc');
  });
});

describe('orchestrator — listes + openTool', () => {
  it('listProjects + listTools non vides', () => {
    expect(orchestrator.listProjects().length).toBeGreaterThan(0);
    expect(orchestrator.listTools().length).toBeGreaterThan(0);
  });

  it('openTool connu → ok + url', () => {
    const r = orchestrator.openTool('codes_decoder');
    expect(r.ok).toBe(true);
    expect(r.url).toContain('codes-decoder.html');
  });

  it('openTool inconnu → ok=false', () => {
    expect(orchestrator.openTool('inexistant').ok).toBe(false);
  });

  it('getToolDefinitions → 3 tools Anthropic', () => {
    const defs = orchestrator.getToolDefinitions() as Array<{ name: string }>;
    expect(defs.map((d) => d.name)).toContain('cmc_read');
  });
});
