/**
 * Test régression v13.4.69 — services/audit-log.ts.
 *
 * Audit chain hash-chained (SHA-256 chain + tamper detect + rebuild snapshots).
 * Critique sécurité commercialisable : audit log immutable, intégrité prouvable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { auditLog } from '../../services/observability/audit-log.js';

describe('v13.4.69 audit-log — API publique', () => {
  beforeEach(() => {
    localStorage.removeItem('ax_audit_log_v13');
    auditLog.reload();
  });

  it("singleton défini avec méthodes attendues", () => {
    expect(auditLog).toBeDefined();
    expect(typeof auditLog.init).toBe('function');
    expect(typeof auditLog.reload).toBe('function');
    expect(typeof auditLog.record).toBe('function');
    expect(typeof auditLog.verifyChainIntegrity).toBe('function');
    expect(typeof auditLog.getEntries).toBe('function');
    expect(typeof auditLog.findBrokenIndex).toBe('function');
    expect(typeof auditLog.autoRepair).toBe('function');
    expect(typeof auditLog.listRebuildSnapshots).toBe('function');
  });

  it("init() idempotent (multi-call)", () => {
    expect(() => {
      auditLog.init();
      auditLog.init();
      auditLog.init();
    }).not.toThrow();
  });
});

describe('v13.4.69 audit-log — record + getEntries', () => {
  beforeEach(() => {
    localStorage.removeItem('ax_audit_log_v13');
    auditLog.reload();
  });

  it("record(action) ajoute entrée + getEntries() la liste", async () => {
    const before = auditLog.getEntries().length;
    await auditLog.record('test_action_69');
    const after = auditLog.getEntries();
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]?.action).toBe('test_action_69');
  });

  it("record() set ts numérique + actor par défaut='system'", async () => {
    await auditLog.record('test_actor');
    const last = auditLog.getEntries().at(-1);
    expect(last).toBeDefined();
    expect(typeof last?.ts).toBe('number');
    expect(last?.actor).toBe('system');
  });

  it("record(action, {actor, target, details}) → propage opts", async () => {
    await auditLog.record('admin_action', {
      actor: 'kdmc_admin',
      target: 'vault.api_key',
      details: { changed: true },
    });
    const last = auditLog.getEntries().at(-1);
    expect(last?.actor).toBe('kdmc_admin');
    expect(last?.target).toBe('vault.api_key');
    expect(last?.details).toEqual({ changed: true });
  });

  it("record() chaîne hash : prevHash = hash(precedent)", async () => {
    await auditLog.record('a1');
    await auditLog.record('a2');
    const entries = auditLog.getEntries();
    expect(entries.length).toBe(2);
    expect(entries[1]?.prevHash).toBe(entries[0]?.hash);
  });

  it("Première entry : prevHash='0' (genesis)", async () => {
    await auditLog.record('first');
    const first = auditLog.getEntries()[0];
    expect(first?.prevHash).toBe('0');
  });

  it("getEntries({actor: 'X'}) filtre par actor", async () => {
    await auditLog.record('a', { actor: 'alice' });
    await auditLog.record('b', { actor: 'bob' });
    await auditLog.record('c', { actor: 'alice' });
    const alices = auditLog.getEntries({ actor: 'alice' });
    expect(alices.length).toBe(2);
  });

  it("getEntries({action: 'admin_'}) filtre par prefix action", async () => {
    await auditLog.record('admin_reset');
    await auditLog.record('user_login');
    await auditLog.record('admin_grant');
    const admins = auditLog.getEntries({ action: 'admin_' });
    expect(admins.length).toBe(2);
  });
});

describe('v13.4.69 audit-log — verifyChainIntegrity + autoRepair', () => {
  beforeEach(() => {
    localStorage.removeItem('ax_audit_log_v13');
    auditLog.reload();
  });

  it("Chain vide → valid=true, brokenAt=-1, totalEntries=0", async () => {
    const r = await auditLog.verifyChainIntegrity();
    expect(r.valid).toBe(true);
    expect(r.brokenAt).toBe(-1);
    expect(r.totalEntries).toBe(0);
  });

  it("Chain 3 entries valide → valid=true, totalEntries=3", async () => {
    await auditLog.record('e1');
    await auditLog.record('e2');
    await auditLog.record('e3');
    const r = await auditLog.verifyChainIntegrity();
    expect(r.valid).toBe(true);
    expect(r.totalEntries).toBe(3);
    expect(r.brokenAt).toBe(-1);
  });

  it("findBrokenIndex() vide → -1", async () => {
    expect(await auditLog.findBrokenIndex()).toBe(-1);
  });

  it("findBrokenIndex() chain valide → -1", async () => {
    await auditLog.record('e1');
    await auditLog.record('e2');
    expect(await auditLog.findBrokenIndex()).toBe(-1);
  });

  it("autoRepair() chain valide → ok:true + rebuilt=0", async () => {
    await auditLog.record('e1');
    const r = await auditLog.autoRepair();
    expect(r.ok).toBe(true);
    expect(r.rebuilt).toBe(0);
  });
});

describe('v13.4.69 audit-log — listRebuildSnapshots', () => {
  it("listRebuildSnapshots() retourne array", () => {
    const snapshots = auditLog.listRebuildSnapshots();
    expect(Array.isArray(snapshots)).toBe(true);
  });

  it("Chaque snapshot a {key, ts, brokenAtIndex, entriesCount}", () => {
    const snapshots = auditLog.listRebuildSnapshots();
    for (const s of snapshots) {
      expect(typeof s.key).toBe('string');
      expect(typeof s.ts).toBe('number');
      expect(typeof s.brokenAtIndex).toBe('number');
      expect(typeof s.entriesCount).toBe('number');
    }
  });
});
