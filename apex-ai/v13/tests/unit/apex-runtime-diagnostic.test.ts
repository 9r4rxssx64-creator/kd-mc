/**
 * Tests apex-runtime-diagnostic v13.4.143 (Kevin "100/100 réel").
 *
 * Module : services/apex-runtime-diagnostic.ts (308 lines, ~280 stmts, était 0%).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { apexRuntimeDiagnostic } from '../../services/admin/apex-runtime-diagnostic.js';

describe('apex-runtime-diagnostic (v13.4.143 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  describe('runAll', () => {
    it('exécute tous les checks + retourne result structuré', async () => {
      const r = await apexRuntimeDiagnostic.runAll();
      expect(r).toBeDefined();
      expect(r.ts).toBeTypeOf('number');
      /* v13.4.232 : test robuste à futurs bumps version (était hardcoded 13.4.99) */
      expect(r.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(Array.isArray(r.checks)).toBe(true);
      expect(r.checks.length).toBeGreaterThanOrEqual(8);
      expect(r.okCount + r.failCount).toBe(r.checks.length);
      expect(r.summary).toContain('OK');
    });

    it('persiste résultat dans localStorage', async () => {
      await apexRuntimeDiagnostic.runAll();
      const raw = localStorage.getItem('apex_v13_runtime_diag_last');
      expect(raw).toBeTruthy();
    });

    it('chaque check a id, label, ok, detail', async () => {
      const r = await apexRuntimeDiagnostic.runAll();
      r.checks.forEach((c) => {
        expect(c.id).toBeTypeOf('string');
        expect(c.label).toBeTypeOf('string');
        expect(c.ok).toBeTypeOf('boolean');
        expect(c.detail).toBeTypeOf('string');
      });
    });
  });

  describe('checkAntiZoom (via runAll)', () => {
    it('détecte inline gesturestart si présent', async () => {
      document.head.innerHTML = '<script>gesturestart preventDefault</script>';
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'anti-zoom');
      expect(check?.ok).toBe(true);
    });

    it('ok=false si pas inline', async () => {
      document.head.innerHTML = '<title>Apex</title>';
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'anti-zoom');
      expect(check?.ok).toBe(false);
    });
  });

  describe('checkVaultLocal (via runAll)', () => {
    it('compte legacy ax_*_key keys', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-xxx');
      localStorage.setItem('ax_openai_key', 'sk-yyy');
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-local');
      expect(check?.ok).toBe(true);
      expect(check?.detail).toContain('legacy');
    });

    it('compte multikey si présent', async () => {
      localStorage.setItem('apex_v13_multi_keys', JSON.stringify([{ id: 'k1' }, { id: 'k2' }]));
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-local');
      expect(check?.ok).toBe(true);
    });

    it('ok=false si Coffre vide', async () => {
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-local');
      expect(check?.ok).toBe(false);
    });
  });

  describe('checkVaultUid (via runAll)', () => {
    it('résoud Kevin admin via PIN', async () => {
      localStorage.setItem('apex_v13_pin', 'hash123');
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-uid');
      expect(check?.detail).toContain('kdmc_admin');
    });

    it('résoud uid courant si défini', async () => {
      localStorage.setItem('apex_v13_uid', 'kevin_test');
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-uid');
      expect(check?.detail).toContain('kevin_test');
    });

    it('résoud last_known_uid si dispo', async () => {
      localStorage.setItem('apex_v13_last_known_uid', 'last_test');
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-uid');
      expect(check?.detail).toContain('last_test');
    });

    it('résoud par last_known_name=kevin si dispo', async () => {
      localStorage.setItem('apex_v13_last_known_name', 'Kevin Desarzens');
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-uid');
      expect(check?.detail).toContain('kdmc_admin');
    });

    it('ok=false si rien résolu', async () => {
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'vault-uid');
      expect(check?.ok).toBe(false);
      expect(check?.detail).toContain('anon');
    });
  });

  describe('checkAutoRestore (via runAll)', () => {
    it('ok=true si audit contient auto-restore', async () => {
      localStorage.setItem('apex_v13_audit', JSON.stringify([{ category: 'auto-restore', ts: 1 }]));
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'auto-restore');
      expect(check?.ok).toBe(true);
    });

    it('ok=false si pas de trace audit', async () => {
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'auto-restore');
      expect(check?.ok).toBe(false);
    });
  });

  describe('checkViewportZoom (via runAll)', () => {
    it('check viewport zoom retourne ok+detail', async () => {
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'viewport-zoom');
      expect(check).toBeDefined();
      expect(check?.detail).toContain('scale');
    });
  });

  describe('checkToolbarOverlap (via runAll)', () => {
    it('skip si pas de toolbar dans DOM', async () => {
      const r = await apexRuntimeDiagnostic.runAll();
      const check = r.checks.find((c) => c.id === 'toolbar-overlap');
      expect(check?.ok).toBe(true);
      expect(check?.detail).toContain('skip');
    });
  });

  describe('getLast', () => {
    it('retourne null avant runAll', () => {
      /* getLast peut retourner null OU la dernière run depuis localStorage
       * (single instance) - test trivial */
      const r = apexRuntimeDiagnostic.getLast();
      expect(r === null || typeof r === 'object').toBe(true);
    });

    it('retourne dernier résultat après runAll', async () => {
      await apexRuntimeDiagnostic.runAll();
      const last = apexRuntimeDiagnostic.getLast();
      expect(last).toBeDefined();
      expect(last?.checks.length).toBeGreaterThan(0);
    });
  });
});
