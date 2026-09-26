/**
 * Tests apex-e2e-trigger v13.4.140 (Kevin "100/100 réel").
 *
 * Module : services/apex-e2e-trigger.ts (102 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAuth, mockFirebase, mockVault } = vi.hoisted(() => ({
  mockAuth: { isAdminSync: vi.fn() },
  mockFirebase: { write: vi.fn(), read: vi.fn() },
  mockVault: { readKey: vi.fn() },
}));

vi.mock('../../services/auth/auth.js', () => ({ auth: mockAuth }));
vi.mock('../../services/storage/firebase.js', () => ({ firebase: mockFirebase }));
vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));

import {
  triggerE2EWebkit,
  listE2ERequests,
  getLastE2EResult,
  _internals,
} from '../../services/admin/apex-e2e-trigger.js';

describe('apex-e2e-trigger (v13.4.140 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAdminSync.mockReturnValue(true);
    mockVault.readKey.mockResolvedValue('ghp_test_token_long_enough_xxxxxx');
    mockFirebase.write.mockResolvedValue(true);
    mockFirebase.read.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('_internals', () => {
    it('expose REPO et EVENT_TYPE', () => {
      expect(_internals.REPO).toBeTypeOf('string');
      expect(_internals.EVENT_TYPE).toBe('apex_e2e_request');
    });
  });

  describe('triggerE2EWebkit', () => {
    it('refuse si non-admin', async () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('admin_only_e2e_trigger');
    });

    it('refuse si token GitHub manquant', async () => {
      mockVault.readKey.mockResolvedValue('');
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('github_token_missing_in_vault');
    });

    it('refuse si token GitHub trop court', async () => {
      mockVault.readKey.mockResolvedValue('ghp_x');
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('github_token_missing_in_vault');
    });

    it('refuse si vault.readKey throw', async () => {
      mockVault.readKey.mockRejectedValue(new Error('vault locked'));
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('github_token_missing_in_vault');
    });

    it('dispatch OK retourne 204 → ok=true', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 204 }),
      );
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(true);
      expect(r.trace_id).toBeTypeOf('string');
      expect(fetchSpy).toHaveBeenCalled();
      const call = fetchSpy.mock.calls[0];
      expect(call?.[0]).toContain('api.github.com');
      expect(call?.[0]).toContain('dispatches');
      fetchSpy.mockRestore();
    });

    it('utilise project mobile-safari par défaut', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
      const r = await triggerE2EWebkit();
      expect(r.project).toBe('mobile-safari');
    });

    it('respecte project param', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
      const r = await triggerE2EWebkit({ project: 'mobile-chrome' });
      expect(r.project).toBe('mobile-chrome');
    });

    it('retourne ok=false si dispatch HTTP != 204', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(false);
      expect(r.error).toContain('dispatch_failed_http_401');
    });

    it('retourne ok=false si fetch throw', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('network down');
    });

    it('log Firebase si dispatch OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
      await triggerE2EWebkit();
      /* Firebase write appelé en arrière-plan, void Promise */
      expect(mockFirebase.write).toHaveBeenCalled();
    });
  });

  describe('listE2ERequests', () => {
    it('retourne [] si non-admin', async () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = await listE2ERequests();
      expect(r).toEqual([]);
    });

    it('retourne [] si Firebase vide', async () => {
      mockFirebase.read.mockResolvedValue(null);
      const r = await listE2ERequests();
      expect(r).toEqual([]);
    });

    it('retourne valeurs Firebase si présentes', async () => {
      mockFirebase.read.mockResolvedValue({
        e2e_1: { project: 'mobile-safari', ts: 100 },
        e2e_2: { project: 'mobile-chrome', ts: 200 },
      });
      const r = await listE2ERequests();
      expect(r.length).toBe(2);
    });

    it('gère Firebase throw', async () => {
      mockFirebase.read.mockRejectedValue(new Error('FB error'));
      const r = await listE2ERequests();
      expect(r).toEqual([]);
    });
  });

  describe('getLastE2EResult', () => {
    it('retourne found=false si pas de résultats', async () => {
      mockFirebase.read.mockResolvedValue(null);
      const r = await getLastE2EResult();
      expect(r.found).toBe(false);
    });

    it('retourne le plus récent (ts max)', async () => {
      mockFirebase.read.mockResolvedValue({
        r1: { ts: 100, status: 'ok' },
        r2: { ts: 300, status: 'fail' },
        r3: { ts: 200, status: 'ok' },
      });
      const r = await getLastE2EResult();
      expect(r.found).toBe(true);
      expect((r.result as { ts: number })?.ts).toBe(300);
    });

    it('gère Firebase throw', async () => {
      mockFirebase.read.mockRejectedValue(new Error('FB error'));
      const r = await getLastE2EResult();
      expect(r.found).toBe(false);
    });

    it('retourne found=false si array vide', async () => {
      mockFirebase.read.mockResolvedValue({});
      const r = await getLastE2EResult();
      expect(r.found).toBe(false);
    });

    it('entrées sans champ ts → `?? 0` dans le sort (140)', async () => {
      mockFirebase.read.mockResolvedValue({ a: { status: 'ok' }, b: { status: 'fail' } });
      const r = await getLastE2EResult();
      expect(r.found).toBe(true);
    });
  });

  describe('branches restantes (campagne 100%)', () => {
    it('triggerE2EWebkit : fetch throw non-Error (string) → String(err) (109)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue('str-fetch');
      const r = await triggerE2EWebkit();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('str-fetch');
    });
  });
});
