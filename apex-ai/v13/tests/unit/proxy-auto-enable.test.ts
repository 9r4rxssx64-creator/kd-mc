/**
 * Tests proxy-auto-enable v13.4.159 (Kevin "100/100 réel").
 *
 * Module : services/proxy-auto-enable.ts (77 stmts, était 11.7%).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockStore, mockApexSecretsProxy } = vi.hoisted(() => ({
  mockStore: { get: vi.fn() },
  mockApexSecretsProxy: { checkHealth: vi.fn() },
}));

vi.mock('../../core/store.js', () => ({ store: mockStore }));
vi.mock('../../services/integrations/apex-secrets-proxy-client.js', () => ({
  apexSecretsProxy: mockApexSecretsProxy,
}));

import { proxyAutoEnable } from '../../services/integrations/proxy-auto-enable.js';

describe('proxy-auto-enable (v13.4.159 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockStore.get.mockReturnValue({ id: 'kdmc_admin' });
    mockApexSecretsProxy.checkHealth.mockResolvedValue({
      ok: true,
      data: { available_providers: ['anthropic', 'openai'] },
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('autoEnableIfReady', () => {
    it('respecte opt_out user (flag=false)', async () => {
      localStorage.setItem('apex_v13_use_secrets_proxy', 'false');
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe('opt_out_user');
    });

    it('respecte opt_out user (flag=0)', async () => {
      localStorage.setItem('apex_v13_use_secrets_proxy', '0');
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe('opt_out_user');
    });

    it('déjà enabled si flag=true', async () => {
      localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(true);
      expect(r.reason).toBe('already_enabled');
    });

    it('refuse si pas admin Kevin', async () => {
      mockStore.get.mockReturnValue({ id: 'other_user' });
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe('not_admin_kevin');
    });

    it('refuse si user null', async () => {
      mockStore.get.mockReturnValue(null);
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe('not_admin_kevin');
    });

    it('refuse si proxy unhealthy', async () => {
      mockApexSecretsProxy.checkHealth.mockResolvedValue({ ok: false });
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe('proxy_not_healthy');
    });

    it('refuse si aucun provider', async () => {
      mockApexSecretsProxy.checkHealth.mockResolvedValue({
        ok: true,
        data: { available_providers: [] },
      });
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe('proxy_not_healthy');
    });

    it('refuse si checkHealth throw', async () => {
      mockApexSecretsProxy.checkHealth.mockRejectedValue(new Error('network'));
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe('proxy_not_healthy');
    });

    it('active si tout OK', async () => {
      const r = await proxyAutoEnable.autoEnableIfReady();
      expect(r.enabled).toBe(true);
      expect(r.reason).toBe('auto_enabled');
      expect(localStorage.getItem('apex_v13_use_secrets_proxy')).toBe('true');
    });
  });

  describe('enable / disable / getStatus', () => {
    it('enable set flag=true', () => {
      proxyAutoEnable.enable();
      expect(localStorage.getItem('apex_v13_use_secrets_proxy')).toBe('true');
    });

    it('disable set flag=false', () => {
      proxyAutoEnable.disable();
      expect(localStorage.getItem('apex_v13_use_secrets_proxy')).toBe('false');
    });

    it('getStatus retourne enabled si true', () => {
      localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
      expect(proxyAutoEnable.getStatus()).toBe('enabled');
    });

    it('getStatus retourne disabled si false', () => {
      localStorage.setItem('apex_v13_use_secrets_proxy', 'false');
      expect(proxyAutoEnable.getStatus()).toBe('disabled');
    });

    it('getStatus retourne pending si pas défini', () => {
      expect(proxyAutoEnable.getStatus()).toBe('pending');
    });

    it('getStatus retourne enabled si "1"', () => {
      localStorage.setItem('apex_v13_use_secrets_proxy', '1');
      expect(proxyAutoEnable.getStatus()).toBe('enabled');
    });

    it('getStatus retourne disabled si "0"', () => {
      localStorage.setItem('apex_v13_use_secrets_proxy', '0');
      expect(proxyAutoEnable.getStatus()).toBe('disabled');
    });
  });
});
