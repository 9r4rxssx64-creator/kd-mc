/**
 * futuristic-modules — branches restantes (campagne 100% réel, 2026-06-03).
 * Cibles : replicate (no token / no model / callReplicate ok|!ok|throw), cdn-lib sans cdnUrl,
 * cases mcp + default (via dispatchRoute), catch invoke (dispatchRoute throw),
 * getReplicateToken (raw absent / JSON value / parse-catch / outer-catch).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { futuristicModules } from '../../services/skills/futuristic-modules.js';

const VAULT_KEY = 'apex_v13_vault_ax_replicate_key';

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('futuristic-modules — replicate', () => {
  it('replicate sans token + sans replicateModel → fallback `?? TBD`', async () => {
    const r = await futuristicModules.invoke('apex-music-udio-2', {}); // replicate, pas de replicateModel
    expect(r.success).toBe(false);
    expect(r.error).toContain('Token Replicate manquant');
    expect(r.fallback).toContain('TBD');
  });

  it('replicate avec token mais sans replicateModel → early return', async () => {
    localStorage.setItem(VAULT_KEY, JSON.stringify({ value: 'r8_tok' }));
    const r = await futuristicModules.invoke('apex-music-udio-2', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('replicateModel non configuré');
  });

  it('replicate avec token + model → callReplicate OK (result.ok true)', async () => {
    localStorage.setItem(VAULT_KEY, 'r8_raw_token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'pred1' }), { status: 200 }),
    );
    const r = await futuristicModules.invoke('apex-image-gen-flux2-pro', { prompt: 'x' });
    expect(r.success).toBe(true);
    expect(r.result).toEqual({ id: 'pred1' });
  });

  it('replicate callReplicate HTTP !ok → result.ok false (branche error)', async () => {
    localStorage.setItem(VAULT_KEY, 'r8_raw_token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 422 }));
    const r = await futuristicModules.invoke('apex-image-gen-flux2-pro', { prompt: 'x' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Replicate HTTP 422');
  });
});

describe('futuristic-modules — callReplicate direct', () => {
  it('fetch throw Error → err.message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net down'));
    const r = await futuristicModules.callReplicate('m', {}, 'tok');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('net down');
  });

  it('fetch throw non-Error (string) → String(err)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue('str-net');
    const r = await futuristicModules.callReplicate('m', {}, 'tok');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('str-net');
  });
});

describe('futuristic-modules — getReplicateToken', () => {
  it('pas de clé → null', () => {
    expect(futuristicModules.getReplicateToken()).toBeNull();
  });
  it('JSON {value} → value', () => {
    localStorage.setItem(VAULT_KEY, JSON.stringify({ value: 'tok-json' }));
    expect(futuristicModules.getReplicateToken()).toBe('tok-json');
  });
  it('JSON sans value → `?? raw`', () => {
    localStorage.setItem(VAULT_KEY, JSON.stringify({ other: 1 }));
    expect(futuristicModules.getReplicateToken()).toBe('{"other":1}');
  });
  it('non-JSON → catch → raw', () => {
    localStorage.setItem(VAULT_KEY, 'plain-token');
    expect(futuristicModules.getReplicateToken()).toBe('plain-token');
  });
  it('getItem throw → outer catch → null', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('ls err'); } });
    expect(futuristicModules.getReplicateToken()).toBeNull();
  });
});

describe('futuristic-modules — cdn-lib / native', () => {
  it('cdn-lib sans cdnUrl → `?? TBD` + instructions else', async () => {
    const r = await futuristicModules.invoke('apex-pq-crypto-dilithium', {}); // cdn-lib sans cdnUrl
    expect(r.success).toBe(true);
    const res = r.result as { cdn_url: string; instructions: string };
    expect(res.cdn_url).toBe('TBD');
    expect(res.instructions).toContain('à configurer');
  });

  it('native → success', async () => {
    const r = await futuristicModules.invoke('apex-vision-claude-4', { a: 1 });
    expect(r.success).toBe(true);
  });

  it('module inconnu → error', async () => {
    const r = await futuristicModules.invoke('inexistant', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('Module inconnu');
  });
});

describe('futuristic-modules — dispatchRoute mcp/default + invoke catch', () => {
  it('case mcp (route synthétique)', async () => {
    const r = await futuristicModules.dispatchRoute(
      'x', { category: 'pro', delegate: 'mcp', description: 'd' }, {},
    );
    expect(r.success).toBe(true);
    expect((r.result as { note: string }).note).toContain('MCP');
  });

  it('default (delegate undefined) → Délégation non configurée', async () => {
    const r = await futuristicModules.dispatchRoute(
      'x', { category: 'pro', description: 'd' }, {},
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe('Délégation non configurée');
  });

  it('invoke catch : dispatchRoute throw Error → err.message', async () => {
    vi.spyOn(futuristicModules, 'dispatchRoute').mockRejectedValue(new Error('boom-err'));
    const r = await futuristicModules.invoke('apex-vision-claude-4', {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom-err');
  });

  it('invoke catch : dispatchRoute throw non-Error (string) → String(err)', async () => {
    vi.spyOn(futuristicModules, 'dispatchRoute').mockRejectedValue('boom-dispatch');
    const r = await futuristicModules.invoke('apex-vision-claude-4', {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom-dispatch');
  });
});
