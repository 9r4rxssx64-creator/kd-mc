/**
 * Tests services/apex-tools-handlers/cloud (Kevin v13.4.204 "100/100 réel partout").
 *
 * Couvre handlers Vercel + Cloudflare : auth, task dispatching, params,
 * HTTP error throw, task inconnue throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleCloudflareTask,
  handleVercelTask,
} from '../../services/apex-tools-handlers/cloud.js';

vi.mock('../../services/vault/vault.js', () => ({
  vault: { readKey: vi.fn() },
}));

import { vault } from '../../services/vault/vault.js';

const mockedReadKey = vi.mocked(vault.readKey);

describe('services/apex-tools-handlers/cloud', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedReadKey.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, mocked: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /* ====== VERCEL ====== */
  describe('handleVercelTask', () => {
    it('throw si ax_vercel_token non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleVercelTask('projects', {})).rejects.toThrow(/ax_vercel_token non configuré/);
    });

    it('task "list_projects" → GET /v9/projects avec Bearer token', async () => {
      mockedReadKey.mockResolvedValue('vercel_secret');
      const result = await handleVercelTask('list_projects', {});
      expect(result).toEqual({ ok: true, mocked: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.vercel.com/v9/projects',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer vercel_secret' }),
        }),
      );
    });

    it('alias "projects" équivalent à "list_projects"', async () => {
      mockedReadKey.mockResolvedValue('vercel_secret');
      await handleVercelTask('projects', {});
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.vercel.com/v9/projects');
    });

    it('task "list_deployments" avec project_id → URL params', async () => {
      mockedReadKey.mockResolvedValue('vercel_secret');
      await handleVercelTask('list_deployments', { project_id: 'prj_abc123' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.vercel.com/v6/deployments?projectId=prj_abc123');
    });

    it('task "list_deployments" sans project_id → URL global', async () => {
      mockedReadKey.mockResolvedValue('vercel_secret');
      await handleVercelTask('list_deployments', {});
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.vercel.com/v6/deployments');
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('vercel_secret');
      fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
      await expect(handleVercelTask('list_projects', {})).rejects.toThrow(/Vercel HTTP 401/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('vercel_secret');
      await expect(handleVercelTask('delete_team', {})).rejects.toThrow(/Task Vercel inconnue/);
    });
  });

  /* ====== CLOUDFLARE ====== */
  describe('handleCloudflareTask', () => {
    it('throw si ax_cloudflare_token non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleCloudflareTask('verify', {})).rejects.toThrow(/ax_cloudflare_token non configuré/);
    });

    it('task "verify_token" → GET /user/tokens/verify', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      const result = await handleCloudflareTask('verify_token', {});
      expect(result).toEqual({ ok: true, mocked: true });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.cloudflare.com/client/v4/user/tokens/verify');
    });

    it('alias "verify" équivalent à "verify_token"', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      await handleCloudflareTask('verify', {});
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.cloudflare.com/client/v4/user/tokens/verify');
    });

    it('task "list_zones" → GET /zones', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      await handleCloudflareTask('list_zones', {});
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.cloudflare.com/client/v4/zones');
    });

    it('task "purge_cache" → POST avec purge_everything', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      await handleCloudflareTask('purge_cache', { zone_id: 'zone_xyz' });
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe('https://api.cloudflare.com/client/v4/zones/zone_xyz/purge_cache');
      const init = callArgs[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ purge_everything: true });
    });

    it('throw "zone_id required" si purge_cache sans zone_id', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      await expect(handleCloudflareTask('purge_cache', {})).rejects.toThrow(/zone_id required/);
    });

    it('throw si HTTP error sur verify', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 401 }));
      await expect(handleCloudflareTask('verify', {})).rejects.toThrow(/Cloudflare HTTP 401/);
    });

    it('throw si HTTP error sur purge_cache', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 403 }));
      await expect(handleCloudflareTask('purge_cache', { zone_id: 'z1' })).rejects.toThrow(/Cloudflare HTTP 403/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      await expect(handleCloudflareTask('delete_account', {})).rejects.toThrow(/Task Cloudflare inconnue/);
    });

    it('list_zones HTTP !ok → throw (branche !res.ok)', async () => {
      mockedReadKey.mockResolvedValue('cf_secret');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }));
      await expect(handleCloudflareTask('list_zones', {})).rejects.toThrow(/Cloudflare HTTP 500/);
    });
  });

  describe('campagne 100% — branches !res.ok restantes', () => {
    it('Vercel list_deployments HTTP !ok → throw (branche !res.ok)', async () => {
      mockedReadKey.mockResolvedValue('vercel_secret');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 502 }));
      await expect(handleVercelTask('list_deployments', {})).rejects.toThrow(/Vercel HTTP 502/);
    });
  });
});
