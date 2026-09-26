/**
 * vault-auto-maintenance — couverture branches complète (campagne 100% réel, 2026-06-02).
 * Mocke les imports dynamiques (multi-key-vault, firebase, vault-firebase-backup, toast)
 * et pilote chaque chemin : throttle, migration, repair, backup, health-check, catch, toast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const migrateLegacyFlatKeys = vi.fn(async () => ({ scanned: 0, migrated: 0 }));
const repairMisnamedServices = vi.fn(async () => ({ renamed: 0, deleted_duplicate: 0 }));
const healthCheckAll = vi.fn(async () => ({ tested: 0, recovered: 0, stillDown: 0 }));
const isConnected = vi.fn(() => true);
const pushAllLocal = vi.fn(async () => ({ pushed: 0, failed: 0, skipped: 0 }));
const toastInfo = vi.fn();

vi.mock('../../services/vault/multi-key-vault.js', () => ({
  multiKeyVault: {
    migrateLegacyFlatKeys: (...a: unknown[]) => migrateLegacyFlatKeys(...a),
    repairMisnamedServices: (...a: unknown[]) => repairMisnamedServices(...a),
    healthCheckAll: (...a: unknown[]) => healthCheckAll(...a),
  },
}));
vi.mock('../../services/storage/firebase.js', () => ({
  firebase: { isConnected: (...a: unknown[]) => isConnected(...a) },
}));
vi.mock('../../services/vault/vault-firebase-backup.js', () => ({
  vaultFirebaseBackup: { pushAllLocal: (...a: unknown[]) => pushAllLocal(...a) },
}));
vi.mock('../../ui/toast.js', () => ({ toast: { info: (...a: unknown[]) => toastInfo(...a) } }));

import { runVaultAutoMaintenance, vaultAutoMaintenance } from '../../services/admin/vault-auto-maintenance.js';
import { logger } from '../../core/logger.js';

const LAST_RUN_KEY = 'apex_v13_vault_auto_maintenance_last_run';
const tick = () => new Promise((r) => setTimeout(r, 8));

beforeEach(() => {
  vi.clearAllMocks();
  isConnected.mockReturnValue(true);
  migrateLegacyFlatKeys.mockResolvedValue({ scanned: 0, migrated: 0 });
  repairMisnamedServices.mockResolvedValue({ renamed: 0, deleted_duplicate: 0 });
  healthCheckAll.mockResolvedValue({ tested: 0, recovered: 0, stillDown: 0 });
  pushAllLocal.mockResolvedValue({ pushed: 0, failed: 0, skipped: 0 });
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('vault-auto-maintenance — throttle', () => {
  it('dernier run récent → throttled, ran=false', async () => {
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
    const r = await runVaultAutoMaintenance();
    expect(r.ran).toBe(false);
    expect(migrateLegacyFlatKeys).not.toHaveBeenCalled();
  });

  it('localStorage.getItem throw → shouldRunNow catch → ran=true', async () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('ls fail'); });
    const r = await runVaultAutoMaintenance();
    expect(r.ran).toBe(true);
    spy.mockRestore();
  });
});

describe('vault-auto-maintenance — actions', () => {
  it('migration + repair + backup avec changements → out rempli + toast', async () => {
    migrateLegacyFlatKeys.mockResolvedValue({ scanned: 5, migrated: 3 });
    repairMisnamedServices.mockResolvedValue({ renamed: 2, deleted_duplicate: 1 });
    pushAllLocal.mockResolvedValue({ pushed: 4, failed: 0, skipped: 1 });
    healthCheckAll.mockResolvedValue({ tested: 2, recovered: 1, stillDown: 0 });
    const r = await runVaultAutoMaintenance();
    await tick();
    expect(r.migration).toEqual({ scanned: 5, migrated: 3 });
    expect(r.repair).toEqual({ renamed: 2, deleted_duplicate: 1 });
    expect(r.backup).toEqual({ pushed: 4, failed: 0, skipped: 1 });
    expect(toastInfo).toHaveBeenCalledOnce();
    expect(healthCheckAll).toHaveBeenCalled();
  });

  it('repair via deleted_duplicate seul (renamed=0) → out.repair posé', async () => {
    repairMisnamedServices.mockResolvedValue({ renamed: 0, deleted_duplicate: 2 });
    const r = await runVaultAutoMaintenance();
    expect(r.repair).toEqual({ renamed: 0, deleted_duplicate: 2 });
  });

  it('aucun changement → pas de toast, out sans migration/repair/backup', async () => {
    const r = await runVaultAutoMaintenance();
    await tick();
    expect(r.ran).toBe(true);
    expect(r.migration).toBeUndefined();
    expect(r.repair).toBeUndefined();
    expect(r.backup).toBeUndefined();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('firebase déconnecté → backup ignoré (pushAllLocal non appelé)', async () => {
    isConnected.mockReturnValue(false);
    await runVaultAutoMaintenance();
    expect(pushAllLocal).not.toHaveBeenCalled();
  });

  it('migration/repair/backup throw → catch interne, ran=true sans crash', async () => {
    migrateLegacyFlatKeys.mockRejectedValue(new Error('mig fail'));
    repairMisnamedServices.mockRejectedValue(new Error('rep fail'));
    pushAllLocal.mockRejectedValue(new Error('push fail'));
    const r = await runVaultAutoMaintenance();
    expect(r.ran).toBe(true);
    expect(r.migration).toBeUndefined();
  });

  it('healthCheckAll rejette → catch background (pas de crash)', async () => {
    healthCheckAll.mockRejectedValue(new Error('hc fail'));
    const r = await runVaultAutoMaintenance();
    await tick();
    expect(r.ran).toBe(true);
  });

  it('toast import throw → catch silencieux (changement présent)', async () => {
    migrateLegacyFlatKeys.mockResolvedValue({ scanned: 1, migrated: 1 });
    toastInfo.mockImplementation(() => { throw new Error('toast fail'); });
    const r = await runVaultAutoMaintenance();
    expect(r.migration?.migrated).toBe(1);
  });

  it('markRun setItem throw → catch (pas de crash)', async () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const r = await runVaultAutoMaintenance();
    expect(r.ran).toBe(true);
    spy.mockRestore();
  });

  it('backup seul change (migration/repair=0) → hasChange via pushed > 0 + toast', async () => {
    pushAllLocal.mockResolvedValue({ pushed: 7, failed: 0, skipped: 0 });
    const r = await runVaultAutoMaintenance();
    expect(r.backup?.pushed).toBe(7);
    expect(toastInfo).toHaveBeenCalledOnce();
  });

  it('healthCheckAll throw SYNCHRONE → catch import health-check', async () => {
    healthCheckAll.mockImplementation(() => { throw new Error('sync hc'); });
    const r = await runVaultAutoMaintenance();
    expect(r.ran).toBe(true);
  });

  it('inner catch logger throw → propage à outer catch (orchestration failed)', async () => {
    /* migrate rejette → inner catch appelle logger.warn ; on fait throw CE
       1er logger.warn → l'exception remonte au OUTER catch (ligne 126), qui
       rappelle logger.warn (2e appel, no-op) → markRun + ran=true. Couvre le
       outer catch SANS vi.resetModules (qui polluait le registre du fork). */
    migrateLegacyFlatKeys.mockRejectedValue(new Error('mig fail'));
    const warnSpy = vi.spyOn(logger, 'warn')
      .mockImplementationOnce(() => { throw new Error('log boom'); })
      .mockImplementation(() => {});
    const r = await runVaultAutoMaintenance();
    expect(r.ran).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(2); // 1 inner (throw) + 1 outer
    warnSpy.mockRestore();
  });

  it('export vaultAutoMaintenance.run = runVaultAutoMaintenance', () => {
    expect(vaultAutoMaintenance.run).toBe(runVaultAutoMaintenance);
  });
});
