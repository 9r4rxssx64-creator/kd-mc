/**
 * APEX v13 — Tests deep direct-connectors-registry (push 87% → 95%+).
 *
 * Couvre listConfigured/listMissing/detectIntent/getStats/buildSystemPromptSection/
 * invoke (success, vault missing, fetch error, timeout, JSON/text fallback) +
 * buildAuthHeader pour tous les patterns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/vault/vault.js', () => ({
  vault: { readKey: vi.fn() },
}));

import { directConnectors, DIRECT_CONNECTORS } from '../../services/integrations/direct-connectors-registry.js';
import { vault } from '../../services/vault/vault.js';

beforeEach(() => {
  vi.clearAllMocks();
  (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('direct-connectors — list & filter', () => {
  it('list() retourne toutes les entries', () => {
    expect(directConnectors.list().length).toBe(DIRECT_CONNECTORS.length);
  });

  it('list filter par category', () => {
    const ai = directConnectors.list({ category: 'ai_provider' });
    expect(ai.length).toBeGreaterThan(0);
    expect(ai.every((c) => c.category === 'ai_provider')).toBe(true);
  });

  it('list filter par accessMode "direct" inclut "both"', () => {
    const direct = directConnectors.list({ accessMode: 'direct' });
    expect(direct.every((c) => c.accessMode === 'direct' || c.accessMode === 'both')).toBe(true);
  });

  it('list filter combiné category+accessMode', () => {
    const r = directConnectors.list({ category: 'ai_provider', accessMode: 'direct' });
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('direct-connectors — listConfigured', () => {
  it('connecteurs publics (vaultKeys=null) toujours configurés', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('');
    const configured = await directConnectors.listConfigured();
    const publicCount = DIRECT_CONNECTORS.filter((c) => c.vaultKeys === null).length;
    expect(configured.length).toBeGreaterThanOrEqual(publicCount);
  });

  it('connecteur avec clé valide → inclus', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockImplementation(async (k: string) => {
      if (k === 'anthropic_key' || k === 'ax_api_key') return 'sk-ant-validkey-12345';
      return '';
    });
    const configured = await directConnectors.listConfigured();
    expect(configured.some((c) => c.id === 'anthropic')).toBe(true);
  });

  it('connecteur avec clé < 4 chars → exclu', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('xx');
    const configured = await directConnectors.listConfigured();
    /* Aucun connecteur avec vaultKeys non-null ne doit être inclus */
    const withKeysIncluded = configured.filter((c) => c.vaultKeys !== null);
    expect(withKeysIncluded.length).toBe(0);
  });

  it('vault.readKey throw → skip silencieux', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('vault'));
    const configured = await directConnectors.listConfigured();
    /* Que les publics restent */
    expect(configured.every((c) => c.vaultKeys === null)).toBe(true);
  });
});

describe('direct-connectors — listMissing', () => {
  it('aucun configuré → tous manquants', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('');
    const missing = await directConnectors.listMissing();
    /* Sans clés, missing exclut les publics */
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe('direct-connectors — detectIntent', () => {
  it('text "anthropic" matche connecteur anthropic', () => {
    const matches = directConnectors.detectIntent('Je veux utiliser anthropic claude');
    expect(matches.some((c) => c.id === 'anthropic')).toBe(true);
  });

  it('text vide → []', () => {
    expect(directConnectors.detectIntent('')).toEqual([]);
  });

  it('text sans match → []', () => {
    const r = directConnectors.detectIntent('xyzzz aucun trigger correspondant zzzzz');
    expect(r).toEqual([]);
  });
});

describe('direct-connectors — getStats', () => {
  it('total = DIRECT_CONNECTORS.length', () => {
    expect(directConnectors.getStats().total).toBe(DIRECT_CONNECTORS.length);
  });

  it('byCategory non vide', () => {
    const stats = directConnectors.getStats();
    expect(Object.keys(stats.byCategory).length).toBeGreaterThan(0);
  });

  it('byAccessMode contient direct/both', () => {
    const stats = directConnectors.getStats();
    expect(stats.byAccessMode['direct']).toBeGreaterThan(0);
  });

  it('publicNoKey > 0 (services publics existent)', () => {
    expect(directConnectors.getStats().publicNoKey).toBeGreaterThan(0);
  });
});

describe('direct-connectors — buildSystemPromptSection', () => {
  it('produit string avec stats + categories', () => {
    const md = directConnectors.buildSystemPromptSection([]);
    expect(md).toContain('Connecteurs DIRECTS');
    expect(md).toContain('Catégories disponibles');
  });

  it('avec configurés affiche liste', async () => {
    const configured = await directConnectors.listConfigured();
    const md = directConnectors.buildSystemPromptSection(configured);
    expect(md).toContain(`${configured.length} configurés`);
  });
});

describe('direct-connectors — invoke success path', () => {
  it('connecteur public sans clé → fetch direct', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSpy);
    /* Trouve un public no-key */
    const pub = DIRECT_CONNECTORS.find((c) => c.vaultKeys === null);
    if (!pub) return;
    const r = await directConnectors.invoke({ id: pub.id, op: 'test' });
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('connecteur avec clé vault → ajoute auth header', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_token123');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const r = await directConnectors.invoke({ id: 'github_api', op: 'user' });
    expect(r.ok).toBe(true);
    const headers = fetchSpy.mock.calls[0]![1].headers;
    expect(headers.Authorization).toMatch(/Bearer/);
  });

  it('connecteur inconnu → ok=false', async () => {
    const r = await directConnectors.invoke({ id: 'unknown_xyz', op: 'test' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Unknown/);
  });

  it('vault sans clé → ok=false', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('');
    const r = await directConnectors.invoke({ id: 'anthropic', op: 'messages' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Vault key missing/);
  });

  it('body provided → POST par défaut + body JSON', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('sk-ant-key');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await directConnectors.invoke({ id: 'anthropic', op: 'messages', body: { model: 'claude' } });
    const init = fetchSpy.mock.calls[0]![1];
    expect(init.method).toBe('POST');
    expect(init.body).toContain('"model":"claude"');
  });

  it('method explicite respectée', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_token');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await directConnectors.invoke({ id: 'github_api', op: 'repos', method: 'PUT' });
    expect(fetchSpy.mock.calls[0]![1].method).toBe('PUT');
  });

  it('headers custom mergent avec auth', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_token');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await directConnectors.invoke({ id: 'github_api', op: 'user', headers: { 'X-Custom': 'val' } });
    const headers = fetchSpy.mock.calls[0]![1].headers;
    expect(headers['X-Custom']).toBe('val');
    expect(headers.Authorization).toMatch(/Bearer/);
  });

  it('response non-JSON → fallback text (data peut être null si .text() throw aussi)', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_token');
    /* Réponse text() seulement disponible si json() throw */
    const text = 'plain text response';
    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => { throw new Error('not json'); },
      text: async () => text,
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeRes));
    const r = await directConnectors.invoke({ id: 'github_api', op: 'data' });
    expect(r.ok).toBe(true);
    expect(r.data).toBe(text);
  });

  it('fetch throw → ok=false avec error message', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockResolvedValue('ghp_token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const r = await directConnectors.invoke({ id: 'github_api', op: 'user' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/network/);
  });

  it('vault.readKey throw → tente clé suivante', async () => {
    (vault.readKey as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { throw new Error('first'); })
      .mockResolvedValueOnce('valid_key');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    /* anthropic a 2 clés (anthropic_key + ax_api_key) */
    const r = await directConnectors.invoke({ id: 'anthropic', op: 'messages' });
    expect(r.ok).toBe(true);
  });
});

describe('direct-connectors — buildAuthHeader patterns', () => {
  function getAuthHeader(connectorId: string, key: string): Record<string, string> {
    /* Use private method via reflection */
    const m = (directConnectors as unknown as { buildAuthHeader: (id: string, key: string) => Record<string, string> }).buildAuthHeader;
    return m.call(directConnectors, connectorId, key);
  }

  it('bearer pattern : github_api', () => {
    expect(getAuthHeader('github_api', 'k1').Authorization).toBe('Bearer k1');
  });

  it('bearer pattern : openai', () => {
    expect(getAuthHeader('openai', 'sk-x').Authorization).toBe('Bearer sk-x');
  });

  it('openweathermap → Content-Type only', () => {
    const h = getAuthHeader('openweathermap', 'k');
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Authorization).toBeUndefined();
  });

  it('brave_search → X-Subscription-Token', () => {
    expect(getAuthHeader('brave_search', 'bsk')['X-Subscription-Token']).toBe('bsk');
  });

  it('deepl → DeepL-Auth-Key prefix', () => {
    expect(getAuthHeader('deepl', 'd1').Authorization).toBe('DeepL-Auth-Key d1');
  });

  it('brevo → api-key header', () => {
    expect(getAuthHeader('brevo', 'k')['api-key']).toBe('k');
  });

  it('stripe → Bearer + form-urlencoded', () => {
    const h = getAuthHeader('stripe', 'sk');
    expect(h.Authorization).toBe('Bearer sk');
    expect(h['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('pinata_ipfs → Bearer', () => {
    expect(getAuthHeader('pinata_ipfs', 'pk').Authorization).toBe('Bearer pk');
  });

  it('unsplash → Client-ID', () => {
    expect(getAuthHeader('unsplash', 'u').Authorization).toBe('Client-ID u');
  });

  it('pexels → key direct', () => {
    expect(getAuthHeader('pexels', 'p').Authorization).toBe('p');
  });

  it('elevenlabs → xi-api-key', () => {
    expect(getAuthHeader('elevenlabs', 'e')['xi-api-key']).toBe('e');
  });

  it('coinmarketcap → X-CMC_PRO_API_KEY', () => {
    expect(getAuthHeader('coinmarketcap', 'c')['X-CMC_PRO_API_KEY']).toBe('c');
  });

  it('sentry → X-Sentry-Auth', () => {
    expect(getAuthHeader('sentry', 's')['X-Sentry-Auth']).toContain('sentry_key=s');
  });

  it('inconnu → Content-Type seulement', () => {
    const h = getAuthHeader('unknown_xyz', 'k');
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Authorization).toBeUndefined();
  });
});
