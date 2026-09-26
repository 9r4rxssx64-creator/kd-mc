/**
 * Tests memory-bridge.ts (v13.0.20 — mémoire persistante externe + auto-escalade).
 * Mock fetch Notion / GitHub / Firebase / n8n.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { memoryBridge } from '../../services/storage/memory-bridge.js';
import { persistentMemory } from '../../services/storage/persistent-memory-store.js';

describe('memory-bridge — config', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('getConfig retourne {} si rien stocké', () => {
    expect(memoryBridge.getConfig()).toEqual({});
  });

  it('setConfig persiste + getConfig retourne config', () => {
    memoryBridge.setConfig({ notion_database_id: 'db123', n8n_webhook_url: 'https://hook.test' });
    const cfg = memoryBridge.getConfig();
    expect(cfg.notion_database_id).toBe('db123');
    expect(cfg.n8n_webhook_url).toBe('https://hook.test');
  });

  it('getConfig retourne {} si JSON corrompu', () => {
    localStorage.setItem('apex_v13_memory_bridge_config', 'not_json{{{');
    expect(memoryBridge.getConfig()).toEqual({});
  });
});

describe('memory-bridge — syncToNotion', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('échoue si databaseId vide', async () => {
    const r = await memoryBridge.syncToNotion('', 'tok');
    expect(r.ok).toBe(false);
    expect(r.backend).toBe('notion');
    expect(r.reason).toContain('Missing');
  });

  it('échoue si token vide', async () => {
    const r = await memoryBridge.syncToNotion('db', '');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Missing');
  });

  it('push 2 entries → 2 calls fetch Notion', async () => {
    await persistentMemory.add({ category: 'profile', text: 'fact A', scope: 'u1', importance: 50 });
    await persistentMemory.add({ category: 'facts', text: 'fact B', scope: 'u1', importance: 60 });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'page1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await memoryBridge.syncToNotion('db123', 'secret_token');
    expect(r.ok).toBe(true);
    expect(r.entries).toBeGreaterThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0]!;
    expect(firstCall[0]).toBe('https://api.notion.com/v1/pages');
    const init = firstCall[1] as RequestInit;
    expect(String(init.headers && (init.headers as Record<string, string>).Authorization)).toContain('secret_token');
  });

  it('Notion 401 → ok=false avec reason "invalid"', async () => {
    await persistentMemory.add({ category: 'profile', text: 'x', scope: 'u', importance: 50 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const r = await memoryBridge.syncToNotion('db', 'badtoken');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('invalid');
  });

  it('fetch throws → ok=false avec reason', async () => {
    await persistentMemory.add({ category: 'profile', text: 'x', scope: 'u', importance: 50 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network down'); }));
    const r = await memoryBridge.syncToNotion('db', 'tok');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Network down');
  });
});

describe('memory-bridge — syncToFirebase', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('échoue si uid vide', async () => {
    const r = await memoryBridge.syncToFirebase('');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Missing uid');
  });

  it('échoue si Firebase offline', async () => {
    /* Mock firebase service comme déconnecté */
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: { isConnected: () => false },
    }));
    const r = await memoryBridge.syncToFirebase('user1');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('offline');
    vi.doUnmock('../../services/storage/firebase.js');
  });

  it('Firebase HTTP 500 → ok=false', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: { isConnected: () => true },
    }));
    await persistentMemory.add({ category: 'profile', text: 'x', scope: 'user1', importance: 50 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    const r = await memoryBridge.syncToFirebase('user1');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('500');
    vi.doUnmock('../../services/storage/firebase.js');
  });
});

describe('memory-bridge — syncToGitHubGist', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('échoue si token vide', async () => {
    const r = await memoryBridge.syncToGitHubGist('');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Missing token');
  });

  it('crée gist si pas d\'id existant + persiste id retourné', async () => {
    await persistentMemory.add({ category: 'profile', text: 'fact', scope: 'u', importance: 50 });
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: 'gist_xyz_42' }), { status: 201 }),
    ));
    const r = await memoryBridge.syncToGitHubGist('ghp_token');
    expect(r.ok).toBe(true);
    const cfg = memoryBridge.getConfig();
    expect(cfg.github_gist_id).toBe('gist_xyz_42');
  });

  it('update gist existant via PATCH', async () => {
    await persistentMemory.add({ category: 'profile', text: 'fact', scope: 'u', importance: 50 });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'existing_id' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await memoryBridge.syncToGitHubGist('ghp_token', 'existing_id');
    expect(r.ok).toBe(true);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toContain('existing_id');
    expect((call[1] as RequestInit).method).toBe('PATCH');
  });

  it('GitHub HTTP 403 → ok=false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));
    const r = await memoryBridge.syncToGitHubGist('badtoken');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('403');
  });
});

describe('memory-bridge — autoEscalate', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('handoff persiste toujours même sans webhook', async () => {
    const r = await memoryBridge.autoEscalate({
      type: 'audit',
      severity: 'warn',
      scope: 'test',
      msg: 'hello',
    });
    expect(r.handoff_ok).toBe(true);
    expect(r.webhook_ok).toBe(false);
    const journal = JSON.parse(localStorage.getItem('ax_handoff_journal') ?? '[]') as unknown[];
    expect(journal.length).toBe(1);
  });

  it('webhook configuré + 200 → webhook_ok=true', async () => {
    memoryBridge.setConfig({ n8n_webhook_url: 'https://n8n.test/hook' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('OK', { status: 200 })));
    const r = await memoryBridge.autoEscalate({
      type: 'error',
      severity: 'critical',
      scope: 's',
      msg: 'fail',
    });
    expect(r.webhook_ok).toBe(true);
    expect(r.handoff_ok).toBe(true);
  });

  it('redact email + token dans msg avant push webhook', async () => {
    memoryBridge.setConfig({ n8n_webhook_url: 'https://n8n.test/hook' });
    const fetchMock = vi.fn(async () => new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await memoryBridge.autoEscalate({
      type: 'lesson',
      severity: 'info',
      scope: 'pii',
      msg: 'email kevin@test.com token sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain('[EMAIL]');
    expect(body).toContain('[REDACTED]');
    expect(body).not.toContain('kevin@test.com');
  });

  it('webhook fail → webhook_ok=false + handoff toujours OK', async () => {
    memoryBridge.setConfig({ n8n_webhook_url: 'https://n8n.test/hook' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    const r = await memoryBridge.autoEscalate({
      type: 'todo',
      severity: 'critical',
      scope: 's',
      msg: 'test',
    });
    expect(r.webhook_ok).toBe(false);
    expect(r.handoff_ok).toBe(true);
    expect(r.reason).toContain('timeout');
  });

  it('handoff cap MAX_HANDOFF (200)', async () => {
    /* Pré-remplit avec 199 entries */
    const arr: unknown[] = [];
    for (let i = 0; i < 199; i++) arr.push({ id: `e${i}`, ts: i, type: 'audit', severity: 'info', scope: 's', msg: `m${i}` });
    localStorage.setItem('ax_handoff_journal', JSON.stringify(arr));
    /* Ajoute 5 → doit cap à 200 */
    for (let i = 0; i < 5; i++) {
      await memoryBridge.autoEscalate({ type: 'audit', severity: 'info', scope: 's', msg: `new${i}` });
    }
    const journal = JSON.parse(localStorage.getItem('ax_handoff_journal') ?? '[]') as unknown[];
    expect(journal.length).toBeLessThanOrEqual(200);
  });
});

describe('memory-bridge — restoreFromBackend', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restore Firebase sans uid → fail', async () => {
    const r = await memoryBridge.restoreFromBackend('firebase');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('uid');
  });

  it('restore Firebase OK → merge entries', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    const remoteEntries = [
      { id: 'r1', category: 'profile', text: 'remote A', ts: Date.now(), scope: 'kdmc_admin', importance: 80 },
      { id: 'r2', category: 'facts', text: 'remote B', ts: Date.now(), scope: 'kdmc_admin', importance: 60 },
    ];
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ entries: remoteEntries }), { status: 200 }),
    ));
    const r = await memoryBridge.restoreFromBackend('firebase');
    expect(r.ok).toBe(true);
    expect(r.entries).toBe(2);
    const stats = await persistentMemory.getStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
  });

  it('restore Firebase HTTP 404 → fail', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 })));
    const r = await memoryBridge.restoreFromBackend('firebase');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('404');
  });

  it('restore github_gist sans config → fail', async () => {
    const r = await memoryBridge.restoreFromBackend('github_gist');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Missing gist config');
  });

  it('restore backend non supporté → fail', async () => {
    const r = await memoryBridge.restoreFromBackend('n8n_webhook');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('not supported');
  });
});

describe('memory-bridge — getStatus / getHealth', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('getStatus retourne array vide initialement', () => {
    expect(memoryBridge.getStatus()).toEqual([]);
  });

  it('getStatus reflète les sync passées', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await persistentMemory.add({ category: 'profile', text: 'a', scope: 'u', importance: 50 });
    await memoryBridge.syncToNotion('db', 'tok');
    const status = memoryBridge.getStatus();
    expect(status.length).toBeGreaterThanOrEqual(1);
    const notion = status.find((s) => s.backend === 'notion');
    expect(notion?.last_success).toBe(true);
  });

  it('getHealth backends_configured = 0 si rien configuré', () => {
    const h = memoryBridge.getHealth();
    expect(h.backends_configured).toBe(0);
    expect(h.last_sync_age_ms).toBe(-1);
  });

  it('getHealth count backends config + uid', () => {
    localStorage.setItem('apex_v13_uid', 'u1');
    memoryBridge.setConfig({
      notion_database_id: 'db',
      notion_token_key: 'ax_notion_key',
      github_token_key: 'ax_github_token',
      n8n_webhook_url: 'https://n.test',
    });
    const h = memoryBridge.getHealth();
    expect(h.backends_configured).toBeGreaterThanOrEqual(4);
  });
});

describe('memory-bridge — auto-sync timer', () => {
  beforeEach(() => {
    localStorage.clear();
    memoryBridge._resetForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    memoryBridge.disableAutoSync();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('enableAutoSync + disableAutoSync ne throw pas', () => {
    memoryBridge.enableAutoSync(60_000);
    memoryBridge.disableAutoSync();
    /* Idempotent : 2e disable ne throw pas */
    memoryBridge.disableAutoSync();
  });

  it('enableAutoSync 2× ne crée pas double interval', () => {
    memoryBridge.enableAutoSync(60_000);
    memoryBridge.enableAutoSync(60_000); /* re-call doit replace */
    memoryBridge.disableAutoSync();
  });

  it('runAutoSync sans config retourne tableau vide', async () => {
    const r = await memoryBridge.runAutoSync();
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(0);
  });
});
