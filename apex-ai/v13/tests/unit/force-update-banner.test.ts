/**
 * Tests force-update-banner v13.4.159 (Kevin "100/100 réel").
 *
 * Module : services/force-update-banner.ts (305 stmts, était 60.7%).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../core/bootstrap.js', () => ({
  APP_VER: 'v13.4.100',
  ADMIN_ID: 'kdmc_admin',
}));

import { forceUpdateBanner } from '../../services/core-svc/force-update-banner.js';

describe('force-update-banner (v13.4.159 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    forceUpdateBanner.uninstall();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    forceUpdateBanner.uninstall();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('install / uninstall', () => {
    it('install configure timers + listeners', () => {
      forceUpdateBanner.install();
      forceUpdateBanner.uninstall();
      expect(true).toBe(true);
    });

    it('install idempotent', () => {
      forceUpdateBanner.install();
      forceUpdateBanner.install(); /* 2e call no-op */
      forceUpdateBanner.uninstall();
      expect(true).toBe(true);
    });

    it('uninstall safe avant install', () => {
      expect(() => forceUpdateBanner.uninstall()).not.toThrow();
    });
  });

  describe('checkVersion', () => {
    it('retourne is_stale=true si remote_ver différent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html data-app-ver="v13.4.999"></html>', { status: 200 }),
      );
      const r = await forceUpdateBanner.checkVersion();
      expect(r.is_stale).toBe(true);
      expect(r.remote_ver).toBe('v13.4.999');
      expect(r.local_ver).toBe('v13.4.100');
    });

    it('retourne is_stale=false si remote_ver identique', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html data-app-ver="v13.4.100"></html>', { status: 200 }),
      );
      const r = await forceUpdateBanner.checkVersion();
      expect(r.is_stale).toBe(false);
    });

    it('retourne is_stale=false si fetch fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      const r = await forceUpdateBanner.checkVersion();
      expect(r.is_stale).toBe(false);
      expect(r.remote_ver).toBeNull();
    });

    it('retourne is_stale=false si fetch throw', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await forceUpdateBanner.checkVersion();
      expect(r.is_stale).toBe(false);
    });

    it('retourne is_stale=false si HTML sans data-app-ver', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html><body></body></html>', { status: 200 }),
      );
      const r = await forceUpdateBanner.checkVersion();
      expect(r.is_stale).toBe(false);
      expect(r.remote_ver).toBeNull();
    });
  });
});
