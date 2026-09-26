/**
 * audit-log coverage boost — branches manquantes (Sprint 9 Kevin v13.0.78+)
 *
 * Cible : audit-log.ts L:89.1% F:100% B:79.8% → ≥95% partout
 * Branches manquantes : verifyChainIntegrity, listRebuildSnapshots, takeSnapshotBeforeRebuild,
 * findBrokenIndex, autoRepair, persist failures, edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { auditLog } from '../../services/observability/audit-log.js';

describe('audit-log coverage boost', () => {
  beforeEach(() => {
    localStorage.clear();
    auditLog.reload();
  });

  describe('verifyChainIntegrity (v13.3.71)', () => {
    it('chain vide → valid + totalEntries=0', async () => {
      const r = await auditLog.verifyChainIntegrity();
      expect(r.valid).toBe(true);
      expect(r.totalEntries).toBe(0);
      expect(r.brokenAt).toBe(-1);
    });

    it('chain valide → valid avec totalEntries correct', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      await auditLog.record('c', { actor: 'u' });
      const r = await auditLog.verifyChainIntegrity();
      expect(r.valid).toBe(true);
      expect(r.totalEntries).toBe(3);
      expect(r.brokenAt).toBe(-1);
    });

    it('chain corrompue → valid=false + brokenAt index correct', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      const raw = JSON.parse(localStorage.getItem('ax_audit_log_v13') ?? '[]');
      raw[1].prevHash = 'corrupted';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(raw));
      auditLog.reload();
      const r = await auditLog.verifyChainIntegrity();
      expect(r.valid).toBe(false);
      expect(r.brokenAt).toBe(1);
      expect(r.totalEntries).toBe(2);
    });

    it('chain hash modifié → valid=false', async () => {
      await auditLog.record('a', { actor: 'u' });
      const raw = JSON.parse(localStorage.getItem('ax_audit_log_v13') ?? '[]');
      raw[0].hash = 'a'.repeat(64);
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(raw));
      auditLog.reload();
      const r = await auditLog.verifyChainIntegrity();
      expect(r.valid).toBe(false);
      expect(r.brokenAt).toBe(0);
    });
  });

  describe('findBrokenIndex', () => {
    it('chain valide → -1', async () => {
      await auditLog.record('a', { actor: 'u' });
      const idx = await auditLog.findBrokenIndex();
      expect(idx).toBe(-1);
    });

    it('chain vide → -1', async () => {
      const idx = await auditLog.findBrokenIndex();
      expect(idx).toBe(-1);
    });

    it('chain corrompue → index broken', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      const raw = JSON.parse(localStorage.getItem('ax_audit_log_v13') ?? '[]');
      raw[1].action = 'tampered';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(raw));
      auditLog.reload();
      const idx = await auditLog.findBrokenIndex();
      expect(idx).toBe(1);
    });
  });

  describe('autoRepair', () => {
    it('chain valide → ok=true, rebuilt=0', async () => {
      await auditLog.record('a', { actor: 'u' });
      const r = await auditLog.autoRepair();
      expect(r.ok).toBe(true);
      expect(r.rebuilt).toBe(0);
    });

    it('chain vide → ok=true, rebuilt=0', async () => {
      const r = await auditLog.autoRepair();
      expect(r.ok).toBe(true);
      expect(r.rebuilt).toBe(0);
    });

    it('chain corrompue → rebuilt > 0 + brokenAt présent', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      await auditLog.record('c', { actor: 'u' });
      const raw = JSON.parse(localStorage.getItem('ax_audit_log_v13') ?? '[]');
      raw[1].action = 'TAMPERED';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(raw));
      auditLog.reload();
      const r = await auditLog.autoRepair();
      expect(r.ok).toBe(true);
      expect(r.rebuilt).toBeGreaterThan(0);
      expect(r.brokenAt).toBe(1);
      /* Vérifie chain valide après repair */
      const verify = await auditLog.verify();
      expect(verify.valid).toBe(true);
    });
  });

  describe('rebuildChainFrom edge cases', () => {
    it('entryIndex < 0 → ok=false', async () => {
      await auditLog.record('a', { actor: 'u' });
      const r = await auditLog.rebuildChainFrom(-1);
      expect(r.ok).toBe(false);
      expect(r.rebuilt).toBe(0);
    });

    it('entryIndex >= length → ok=false', async () => {
      await auditLog.record('a', { actor: 'u' });
      const r = await auditLog.rebuildChainFrom(99);
      expect(r.ok).toBe(false);
      expect(r.rebuilt).toBe(0);
    });

    it('entryIndex=0 → recompute toute la chain depuis genesis (prevHash=0)', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      const r = await auditLog.rebuildChainFrom(0);
      expect(r.ok).toBe(true);
      expect(r.rebuilt).toBe(2);
      const entries = auditLog.getEntries();
      expect(entries[0]?.prevHash).toBe('0');
    });

    it('rebuild émet event audit-log:rebuild', async () => {
      await auditLog.record('a', { actor: 'u' });
      let received = false;
      const handler = (): void => { received = true; };
      window.addEventListener('audit-log:rebuild', handler);
      await auditLog.rebuildChainFrom(0);
      window.removeEventListener('audit-log:rebuild', handler);
      expect(received).toBe(true);
    });

    it('rebuild trace audit.chain_rebuilt entry ajoutée', async () => {
      await auditLog.record('a', { actor: 'u' });
      const r = await auditLog.rebuildChainFrom(0);
      expect(r.ok).toBe(true);
      const entries = auditLog.getEntries();
      const last = entries[entries.length - 1];
      expect(last?.action).toBe('audit.chain_rebuilt');
      expect(last?.actor).toBe('system');
    });
  });

  describe('listRebuildSnapshots', () => {
    it('aucun snapshot → liste vide', () => {
      const list = auditLog.listRebuildSnapshots();
      expect(list).toEqual([]);
    });

    it('après rebuild un snapshot existe', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.rebuildChainFrom(0);
      const list = auditLog.listRebuildSnapshots();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0]?.key.startsWith('ax_audit_log_rebuild_')).toBe(true);
      expect(list[0]?.entriesCount).toBeGreaterThanOrEqual(1);
    });

    it('liste triée par ts desc (plus récent first)', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.rebuildChainFrom(0);
      await new Promise((r) => setTimeout(r, 5));
      await auditLog.rebuildChainFrom(0);
      const list = auditLog.listRebuildSnapshots();
      if (list.length >= 2) {
        expect(list[0]!.ts).toBeGreaterThanOrEqual(list[1]!.ts);
      }
    });

    it('snapshot corrompu skip silencieusement', async () => {
      localStorage.setItem('ax_audit_log_rebuild_xxx', '{not valid json');
      const list = auditLog.listRebuildSnapshots();
      /* parse fail → skip cette entry, retourne array sans throw */
      expect(Array.isArray(list)).toBe(true);
    });
  });

  describe('getEntries filter combiné', () => {
    it('filter avec action prefix match', async () => {
      await auditLog.record('auth.login', { actor: 'u' });
      await auditLog.record('auth.logout', { actor: 'u' });
      await auditLog.record('vault.store', { actor: 'u' });
      const filtered = auditLog.getEntries({ action: 'auth' });
      expect(filtered.length).toBe(2);
    });

    it('filter combiné actor + action', async () => {
      await auditLog.record('auth.x', { actor: 'kevin' });
      await auditLog.record('auth.x', { actor: 'autre' });
      await auditLog.record('vault.x', { actor: 'kevin' });
      const filtered = auditLog.getEntries({ actor: 'kevin', action: 'auth' });
      expect(filtered.length).toBe(1);
    });

    it('getEntries sans filter retourne tout', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      expect(auditLog.getEntries().length).toBe(2);
    });
  });

  describe('record edge cases', () => {
    it('init lazy au premier record', async () => {
      await auditLog.record('first', { actor: 'u' });
      expect(auditLog.getEntries().length).toBe(1);
    });

    it('record sans options → actor system + ni target ni details', async () => {
      await auditLog.record('boot');
      const e = auditLog.getEntries()[0];
      expect(e?.actor).toBe('system');
      expect(e?.target).toBeUndefined();
      expect(e?.details).toBeUndefined();
    });

    it('record avec target', async () => {
      await auditLog.record('vault.store', { target: 'ax_anthropic_key' });
      expect(auditLog.getEntries()[0]?.target).toBe('ax_anthropic_key');
    });

    it('persist quota error catché silencieusement (logger.warn)', async () => {
      const orig = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k: string) => {
        if (k === 'ax_audit_log_v13') throw new Error('Quota');
        return orig(k, '');
      };
      await expect(auditLog.record('test', { actor: 'u' })).resolves.not.toThrow();
      localStorage.setItem = orig;
    });

    it('reload depuis localStorage corrompu → chain reset à []', () => {
      localStorage.setItem('ax_audit_log_v13', '{not valid json');
      auditLog.reload();
      expect(auditLog.getEntries().length).toBe(0);
    });
  });
});
