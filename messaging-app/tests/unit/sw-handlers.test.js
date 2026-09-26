/**
 * Tests sw-handlers.js — Service Worker logic (3-cache + push + sync)
 * 100% coverage via mocks Cache, Clients, Registration, fetch, URL.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as sw from '../../lib/sw-handlers.js';

// ----------------------------------------------------------------------------
// Helpers : mock CacheStorage
// ----------------------------------------------------------------------------
function makeMockCaches() {
  const stores = new Map();
  return {
    stores,
    open: vi.fn(async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        addAll: vi.fn(async (urls) => {
          for (const u of urls) store.set(u, new MockResponse('cached:' + u));
        }),
        put: vi.fn(async (req, resp) => store.set(typeof req === 'string' ? req : req.url, resp)),
        match: vi.fn(async (req) => store.get(typeof req === 'string' ? req : req.url) || undefined),
      };
    }),
    keys: vi.fn(async () => Array.from(stores.keys())),
    delete: vi.fn(async (k) => stores.delete(k)),
    match: vi.fn(async (req) => {
      for (const store of stores.values()) {
        const v = store.get(typeof req === 'string' ? req : req.url);
        if (v) return v;
      }
      return undefined;
    }),
  };
}

class MockResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = init.headers || {};
    this.ok = this.status >= 200 && this.status < 300;
  }
  clone() {
    return new MockResponse(this.body, { status: this.status, headers: this.headers });
  }
}

class MockRequest {
  constructor(url, mode = 'cors') {
    this.url = url;
    this.mode = mode;
  }
}

// ----------------------------------------------------------------------------
// constants
// ----------------------------------------------------------------------------
describe('sw-handlers — constants', () => {
  it('CACHE_VERSION format apex-chat-vX.Y.Z', () => {
    expect(sw.CACHE_VERSION).toMatch(/^apex-chat-v\d+\.\d+\.\d+$/);
  });
  it('STATIC/RUNTIME/OFFLINE caches préfixés CACHE_VERSION', () => {
    expect(sw.STATIC_CACHE.startsWith(sw.CACHE_VERSION)).toBe(true);
    expect(sw.RUNTIME_CACHE.startsWith(sw.CACHE_VERSION)).toBe(true);
    expect(sw.OFFLINE_CACHE.startsWith(sw.CACHE_VERSION)).toBe(true);
  });
  it('STATIC_ASSETS contient ./ et ./index.html', () => {
    expect(sw.STATIC_ASSETS).toContain('./');
    expect(sw.STATIC_ASSETS).toContain('./index.html');
  });
  it('API_HOSTS contient hosts critiques', () => {
    expect(sw.API_HOSTS).toContain('api.anthropic.com');
    expect(sw.API_HOSTS).toContain('workers.dev');
  });
  it('OFFLINE_HTML contient le marqueur HORS LIGNE', () => {
    expect(sw.OFFLINE_HTML).toContain('HORS LIGNE');
  });
});

// ----------------------------------------------------------------------------
// isApiHost / isStaticAsset
// ----------------------------------------------------------------------------
describe('sw-handlers — URL classification', () => {
  it('isApiHost true pour api.anthropic.com', () => {
    expect(sw.isApiHost(new URL('https://api.anthropic.com/v1/messages'))).toBe(true);
  });
  it('isApiHost false pour example.com', () => {
    expect(sw.isApiHost(new URL('https://example.com/foo'))).toBe(false);
  });
  it('isStaticAsset true pour /index.html', () => {
    expect(sw.isStaticAsset(new URL('https://x.com/index.html'))).toBe(true);
  });
  it('isStaticAsset true pour /manifest.json', () => {
    expect(sw.isStaticAsset(new URL('https://x.com/manifest.json'))).toBe(true);
  });
  it('isStaticAsset false pour /api/foo', () => {
    expect(sw.isStaticAsset(new URL('https://x.com/api/foo'))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// handleInstall
// ----------------------------------------------------------------------------
describe('sw-handlers — handleInstall', () => {
  it('pré-cache STATIC_ASSETS + offline HTML', async () => {
    const caches = makeMockCaches();
    await sw.handleInstall({ caches, response: MockResponse });
    expect(caches.open).toHaveBeenCalledWith(sw.STATIC_CACHE);
    expect(caches.open).toHaveBeenCalledWith(sw.OFFLINE_CACHE);
    const offline = caches.stores.get(sw.OFFLINE_CACHE);
    expect(offline.get('/offline')).toBeDefined();
  });
});

// ----------------------------------------------------------------------------
// handleActivate
// ----------------------------------------------------------------------------
describe('sw-handlers — handleActivate', () => {
  it('purge anciens caches et garde version courante', async () => {
    const caches = makeMockCaches();
    caches.stores.set('apex-chat-v1.0.0-static', new Map());
    caches.stores.set('apex-chat-v1.0.0-runtime', new Map());
    caches.stores.set(`${sw.CACHE_VERSION}-static`, new Map());
    const clients = {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => [{ postMessage: vi.fn() }, { postMessage: vi.fn() }]),
    };
    const result = await sw.handleActivate({ caches, clients });
    expect(result.purged).toContain('apex-chat-v1.0.0-static');
    expect(result.purged).toContain('apex-chat-v1.0.0-runtime');
    expect(result.purged).not.toContain(`${sw.CACHE_VERSION}-static`);
    expect(clients.claim).toHaveBeenCalled();
    expect(clients.matchAll).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// handleFetch — chaque branche
// ----------------------------------------------------------------------------
describe('sw-handlers — handleFetch routing', () => {
  let deps;
  beforeEach(() => {
    deps = {
      URL,
      response: MockResponse,
      fetch: vi.fn(async (req) => new MockResponse('ok:' + req.url)),
      caches: makeMockCaches(),
    };
  });

  it('API host → network-first OK', async () => {
    const event = { request: new MockRequest('https://api.anthropic.com/v1/x') };
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('ok:https://api.anthropic.com/v1/x');
  });

  it('requête non-GET (POST) → fetch direct sans cache', async () => {
    const event = { request: { method: 'POST', url: 'https://x.com/api/send' } };
    await sw.handleFetch(event, deps);
    expect(deps.fetch).toHaveBeenCalled();
  });

  // Couverture branche L149 : req.url falsy → urlStr = '' (fallback || '')
  it('GET sans url → urlStr vide → routage normal sans crash', async () => {
    deps.URL = function () { return { hostname: 'api.anthropic.com', pathname: '/v1/x' }; };
    const event = { request: { method: 'GET' } }; // url undefined
    const r = await sw.handleFetch(event, deps);
    expect(deps.fetch).toHaveBeenCalled();
    expect(r).toBeTruthy();
  });

  // v1.1.35 — règle Kevin "MAJ auto forcée" : version-check URLs DOIVENT bypass SW cache
  it('version-check URL avec ?_v= → skip SW cache, fetch direct', async () => {
    deps.fetch = vi.fn(async (req) => new MockResponse('fresh-from-network', { status: 200 }));
    const event = { request: new MockRequest('https://x.com/index.html?_v=1234567890') };
    const r = await sw.handleFetch(event, deps);
    expect(deps.fetch).toHaveBeenCalled();
    expect(r.body).toBe('fresh-from-network');
    // PAS de mise en cache (sinon next request retournerait du stale)
    const swrCache = deps.caches.stores.get(sw.RUNTIME_CACHE);
    expect(swrCache?.get?.('https://x.com/index.html?_v=1234567890')).toBeUndefined();
  });

  it('version-check URL avec ?_forceupd= → skip SW cache, fetch direct', async () => {
    deps.fetch = vi.fn(async () => new MockResponse('fresh-forced', { status: 200 }));
    const event = { request: new MockRequest('https://x.com/index.html?_forceupd=99') };
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('fresh-forced');
  });

  it('version-check URL avec &_v= (param secondaire) → skip aussi', async () => {
    deps.fetch = vi.fn(async () => new MockResponse('skip-secondary', { status: 200 }));
    const event = { request: new MockRequest('https://x.com/index.html?lang=fr&_v=ts') };
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('skip-secondary');
  });

  it('non-GET (POST) → fetch direct sans cache', async () => {
    deps.fetch = vi.fn(async () => new MockResponse('post-result', { status: 200 }));
    const event = {
      request: {
        url: 'https://x.com/api/post',
        method: 'POST',
        mode: 'cors',
      },
    };
    const r = await sw.handleFetch(event, deps);
    expect(deps.fetch).toHaveBeenCalled();
    expect(r.body).toBe('post-result');
  });

  it('API host fail → 503 offline JSON', async () => {
    deps.fetch = vi.fn(async () => { throw new Error('netfail'); });
    const event = { request: new MockRequest('https://api.anthropic.com/v1/x') };
    const r = await sw.handleFetch(event, deps);
    expect(r.status).toBe(503);
    expect(r.body).toContain('offline');
  });

  it('navigation HTML → network-first + cache put', async () => {
    const event = { request: new MockRequest('https://x.com/page', 'navigate') };
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('ok:https://x.com/page');
    const cache = deps.caches.stores.get(sw.RUNTIME_CACHE);
    expect(cache.get('https://x.com/page')).toBeDefined();
  });

  it('navigation HTML fail → cached fallback', async () => {
    const event = { request: new MockRequest('https://x.com/page', 'navigate') };
    // Pre-populate runtime cache
    const cache = await deps.caches.open(sw.RUNTIME_CACHE);
    cache.put(event.request, new MockResponse('cached-page'));
    deps.fetch = vi.fn(async () => { throw new Error('netfail'); });
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('cached-page');
  });

  it('navigation HTML fail + no cache → offline HTML', async () => {
    const event = { request: new MockRequest('https://x.com/never-cached', 'navigate') };
    const offlineCache = await deps.caches.open(sw.OFFLINE_CACHE);
    offlineCache.put('/offline', new MockResponse(sw.OFFLINE_HTML));
    deps.fetch = vi.fn(async () => { throw new Error('netfail'); });
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe(sw.OFFLINE_HTML);
  });

  it('static asset → cache-first, miss → fetch + cache', async () => {
    const event = { request: new MockRequest('https://x.com/index.html') };
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('ok:https://x.com/index.html');
  });

  it('static asset → cached hit', async () => {
    const event = { request: new MockRequest('https://x.com/index.html') };
    const cache = await deps.caches.open(sw.STATIC_CACHE);
    cache.put(event.request, new MockResponse('cached-static'));
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('cached-static');
  });

  it('static asset miss + fetch fail → 504', async () => {
    deps.fetch = vi.fn(async () => { throw new Error('netfail'); });
    const event = { request: new MockRequest('https://x.com/index.html') };
    const r = await sw.handleFetch(event, deps);
    expect(r.status).toBe(504);
  });

  it('autre ressource → stale-while-revalidate cached hit', async () => {
    const event = { request: new MockRequest('https://x.com/some-asset.png') };
    const cache = await deps.caches.open(sw.RUNTIME_CACHE);
    cache.put(event.request, new MockResponse('cached-swr'));
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('cached-swr');
  });

  it('autre ressource → SWR miss + fetch ok', async () => {
    const event = { request: new MockRequest('https://x.com/some-asset.png') };
    const r = await sw.handleFetch(event, deps);
    expect(r.body).toBe('ok:https://x.com/some-asset.png');
  });

  it('autre ressource → SWR miss + fetch fail → 504', async () => {
    deps.fetch = vi.fn(async () => { throw new Error('netfail'); });
    const event = { request: new MockRequest('https://x.com/some-asset.png') };
    const r = await sw.handleFetch(event, deps);
    expect(r.status).toBe(504);
  });

  it('autre ressource → SWR miss + fetch resp NOT ok → not cached but returned', async () => {
    deps.fetch = vi.fn(async () => new MockResponse('500-body', { status: 500 }));
    const event = { request: new MockRequest('https://x.com/api-down') };
    const r = await sw.handleFetch(event, deps);
    expect(r.status).toBe(500);
  });
});

// ----------------------------------------------------------------------------
// handlePush
// ----------------------------------------------------------------------------
describe('sw-handlers — handlePush', () => {
  it('utilise data event JSON valide', async () => {
    const registration = {
      showNotification: vi.fn(async () => {}),
    };
    const event = { data: { json: () => ({ title: 'Test', body: 'Coucou', tag: 'x', urgent: true }) } };
    await sw.handlePush(event, { registration });
    expect(registration.showNotification).toHaveBeenCalledWith('Test', expect.objectContaining({
      body: 'Coucou', tag: 'x', requireInteraction: true,
    }));
  });

  it('fallback default si event.data manquant', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    await sw.handlePush({ data: null }, { registration });
    expect(registration.showNotification).toHaveBeenCalledWith('Apex Chat', expect.any(Object));
  });

  it('fallback si JSON invalide', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const event = { data: { json: () => { throw new Error('bad json'); } } };
    await sw.handlePush(event, { registration });
    expect(registration.showNotification).toHaveBeenCalledWith('Apex Chat', expect.any(Object));
  });

  it('v1.1.245 : caches présent → enregistre la réception du push (apex-push-debug)', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const put = vi.fn(async () => {});
    const caches = { open: vi.fn(async () => ({ put })) };
    const event = { data: { json: () => ({ title: 'M', body: 'B', payload: { convId: 'c1' } }) } };
    await sw.handlePush(event, { registration, caches });
    expect(caches.open).toHaveBeenCalledWith('apex-push-debug');
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe('/last');
    expect(registration.showNotification).toHaveBeenCalled();
  });

  it('v1.1.245 : caches.open throw → best-effort, notif quand même affichée', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const caches = { open: vi.fn(async () => { throw new Error('cache down'); }) };
    const event = { data: { json: () => ({ title: 'M', body: 'B' }) } };
    await sw.handlePush(event, { registration, caches });
    expect(registration.showNotification).toHaveBeenCalled();
  });

  it('v1.1.244 : icon absent du payload → PAS d\'icon/badge (iOS utilise l\'icône app)', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const event = { data: { json: () => ({ title: 'X', body: 'Y', icon: null, badge: undefined }) } };
    await sw.handlePush(event, { registration });
    const opts = registration.showNotification.mock.calls[0][1];
    expect('icon' in opts).toBe(false);
    expect('badge' in opts).toBe(false);
  });

  it('v1.1.244 : icon/badge fournis → utilisés tels quels', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const event = { data: { json: () => ({ title: 'X', body: 'Y', icon: 'https://x/i.png', badge: 'https://x/b.png' }) } };
    await sw.handlePush(event, { registration });
    expect(registration.showNotification).toHaveBeenCalledWith(
      'X',
      expect.objectContaining({ icon: 'https://x/i.png', badge: 'https://x/b.png' }),
    );
  });

  it('push d\'appel (payload.type=call) → callActions + vibrate appel + requireInteraction', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const event = { data: { json: () => ({ title: '📞', body: 'appel', payload: { type: 'call', convId: 'c1' } }) } };
    await sw.handlePush(event, { registration });
    const opts = registration.showNotification.mock.calls[0][1];
    expect(opts.actions).toEqual([
      { action: 'answer_call', title: '✅ Répondre' },
      { action: 'reject_call', title: '❌ Refuser' },
    ]);
    expect(opts.vibrate).toEqual([200, 100, 200, 100, 200]);
    expect(opts.requireInteraction).toBe(true);
  });

  it('push message avec convId → defaultActions reply/vu', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const event = { data: { json: () => ({ title: 'M', body: 'msg', payload: { convId: 'c2' } }) } };
    await sw.handlePush(event, { registration });
    const opts = registration.showNotification.mock.calls[0][1];
    expect(opts.actions).toEqual([
      { action: 'reply', title: '💬 Répondre' },
      { action: 'mark_read', title: '✅ Vu' },
    ]);
    expect(opts.vibrate).toEqual([100, 50, 100]);
  });

  it('push avec actions explicites + renotify=true → utilise les actions fournies', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const custom = [{ action: 'x', title: 'X' }];
    const event = { data: { json: () => ({ title: 'A', body: 'b', renotify: true, actions: custom }) } };
    await sw.handlePush(event, { registration });
    const opts = registration.showNotification.mock.calls[0][1];
    expect(opts.actions).toBe(custom);
    expect(opts.renotify).toBe(true);
  });

  // v1.1.242 : appel + app au premier plan → ouvre la conv dans le client focusé
  it('push appel + client focusé → postMessage open-conv (sonnerie in-app)', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const focused = { focused: true, postMessage: vi.fn() };
    const other = { focused: false, visibilityState: 'hidden', postMessage: vi.fn() };
    const clients = { matchAll: vi.fn(async () => [other, focused]) };
    const event = { data: { json: () => ({ title: '📞', body: 'appel', payload: { type: 'call', convId: 'c9' } }) } };
    await sw.handlePush(event, { registration, clients });
    expect(focused.postMessage).toHaveBeenCalledWith({ type: 'open-conv', convId: 'c9' });
    expect(other.postMessage).not.toHaveBeenCalled();
  });

  it('push appel + aucun client focusé → pas de postMessage', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const hidden = { focused: false, visibilityState: 'hidden', postMessage: vi.fn() };
    const clients = { matchAll: vi.fn(async () => [hidden]) };
    const event = { data: { json: () => ({ title: '📞', body: 'appel', payload: { type: 'call', convId: 'c9' } }) } };
    await sw.handlePush(event, { registration, clients });
    expect(hidden.postMessage).not.toHaveBeenCalled();
  });

  it('push appel + matchAll throw → best-effort (pas d\'erreur)', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const clients = { matchAll: vi.fn(async () => { throw new Error('boom'); }) };
    const event = { data: { json: () => ({ title: '📞', body: 'appel', payload: { type: 'call', convId: 'c9' } }) } };
    await sw.handlePush(event, { registration, clients }); // ne doit pas throw
    expect(registration.showNotification).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// handleNotificationClick
// ----------------------------------------------------------------------------
describe('sw-handlers — handleNotificationClick', () => {
  it('action=dismiss → ne fait rien après close', async () => {
    const event = {
      action: 'dismiss',
      notification: { close: vi.fn(), data: {} },
    };
    const r = await sw.handleNotificationClick(event, { clients: {} });
    expect(r).toBeNull();
    expect(event.notification.close).toHaveBeenCalled();
  });

  it('focus client existant /messaging-app/', async () => {
    const focus = vi.fn();
    const postMessage = vi.fn();
    const clients = {
      matchAll: vi.fn(async () => [
        { url: 'https://x.com/messaging-app/', focus, postMessage },
      ]),
      openWindow: vi.fn(),
    };
    const event = {
      action: 'open',
      notification: { close: vi.fn(), data: { convId: 'conv-1' } },
    };
    await sw.handleNotificationClick(event, { clients });
    expect(focus).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'open-conv', convId: 'conv-1' });
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  // ── grant_premium / premium_request (couverture 214-229) ──────────────────
  it('grant_premium : client matching → grant-premium postMessage + return client', async () => {
    const focus = vi.fn();
    const postMessage = vi.fn();
    const client = { url: 'https://x.com/messaging-app/', focus, postMessage };
    const clients = { matchAll: vi.fn(async () => [client]), openWindow: vi.fn() };
    const event = {
      action: 'grant_premium',
      notification: { close: vi.fn(), data: { user_id: 'u9', plan: 'yearly' } },
    };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(focus).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'grant-premium', userId: 'u9', plan: 'yearly' });
    expect(r).toBe(client);
  });

  it('premium_request (type) sans plan + pas de client → openWindow ?grant_premium plan=monthly', async () => {
    const clients = { matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => ({ id: 'w' })) };
    const event = {
      action: 'open',
      notification: { close: vi.fn(), data: { type: 'premium_request', user_id: 'u5' } },
    };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(clients.openWindow).toHaveBeenCalledWith('./?grant_premium=u5&plan=monthly');
    expect(r.id).toBe('w');
  });

  it('grant_premium sans user_id → return null', async () => {
    const clients = { matchAll: vi.fn(async () => []), openWindow: vi.fn() };
    const event = { action: 'grant_premium', notification: { close: vi.fn(), data: { plan: 'monthly' } } };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(r).toBeNull();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('grant_premium : pas de client + pas d\'openWindow → return null', async () => {
    const clients = { matchAll: vi.fn(async () => []) }; // openWindow absent
    const event = { action: 'grant_premium', notification: { close: vi.fn(), data: { user_id: 'u1' } } };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(r).toBeNull();
  });

  it('focus client + pas de convId → pas de postMessage', async () => {
    const focus = vi.fn();
    const postMessage = vi.fn();
    const clients = {
      matchAll: vi.fn(async () => [
        { url: 'https://x.com/messaging-app/', focus, postMessage },
      ]),
      openWindow: vi.fn(),
    };
    const event = { action: 'open', notification: { close: vi.fn(), data: {} } };
    await sw.handleNotificationClick(event, { clients });
    expect(focus).toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('aucun client matching → openWindow targetUrl', async () => {
    const clients = {
      matchAll: vi.fn(async () => [{ url: 'https://other.com/', focus: vi.fn(), postMessage: vi.fn() }]),
      openWindow: vi.fn(async () => ({ id: 'new-tab' })),
    };
    const event = {
      action: 'open',
      notification: { close: vi.fn(), data: { url: 'https://x.com/target' } },
    };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(clients.openWindow).toHaveBeenCalledWith('https://x.com/target');
    expect(r.id).toBe('new-tab');
  });

  it('aucun client + pas de url data → fallback ./', async () => {
    const clients = {
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(async () => ({ id: 'home' })),
    };
    const event = { action: 'open', notification: { close: vi.fn(), data: {} } };
    await sw.handleNotificationClick(event, { clients });
    expect(clients.openWindow).toHaveBeenCalledWith('./');
  });

  it('action=reject_call → postMessage call-reject au client messaging-app', async () => {
    const postMessage = vi.fn();
    const clients = {
      matchAll: vi.fn(async () => [{ url: 'https://x.com/messaging-app/', postMessage }]),
    };
    const event = {
      action: 'reject_call',
      notification: { close: vi.fn(), data: { convId: 'conv-9' } },
    };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(postMessage).toHaveBeenCalledWith({ type: 'call-reject', convId: 'conv-9' });
    expect(r).toBeTruthy();
  });

  it('action=reject_call sans client matching → null', async () => {
    const clients = { matchAll: vi.fn(async () => [{ url: 'https://other.com/', postMessage: vi.fn() }]) };
    const event = { action: 'reject_call', notification: { close: vi.fn(), data: { convId: 'conv-9' } } };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(r).toBeNull();
  });

  it('action=answer_call → focus + postMessage call-answer', async () => {
    const focus = vi.fn();
    const postMessage = vi.fn();
    const clients = {
      matchAll: vi.fn(async () => [{ url: 'https://x.com/messaging-app/', focus, postMessage }]),
      openWindow: vi.fn(),
    };
    const event = {
      action: 'answer_call',
      notification: { close: vi.fn(), data: { convId: 'conv-7', callType: 'video', callerName: 'Kev' } },
    };
    await sw.handleNotificationClick(event, { clients });
    expect(focus).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'call-answer', convId: 'conv-7', callType: 'video', callerName: 'Kev' });
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('action=answer_call sans client matching → openWindow ./?call=', async () => {
    const clients = {
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(async () => ({ id: 'call-tab' })),
    };
    const event = { action: 'answer_call', notification: { close: vi.fn(), data: { convId: 'conv-7' } } };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(clients.openWindow).toHaveBeenCalledWith('./?call=conv-7');
    expect(r.id).toBe('call-tab');
  });

  it('action=mark_read → postMessage mark-conv-read au client', async () => {
    const postMessage = vi.fn();
    const clients = { matchAll: vi.fn(async () => [{ url: 'https://x.com/messaging-app/', postMessage }]) };
    const event = { action: 'mark_read', notification: { close: vi.fn(), data: { convId: 'c-3' } } };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(postMessage).toHaveBeenCalledWith({ type: 'mark-conv-read', convId: 'c-3' });
    expect(r).toBeTruthy();
  });

  it('action=mark_read client matching mais sans convId → null (boucle sans match)', async () => {
    const clients = { matchAll: vi.fn(async () => [{ url: 'https://x.com/messaging-app/', postMessage: vi.fn() }]) };
    const event = { action: 'mark_read', notification: { close: vi.fn(), data: {} } };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(r).toBeNull();
  });

  it('action=answer_call sans client ET sans openWindow → null', async () => {
    const clients = { matchAll: vi.fn(async () => []) }; // pas d'openWindow dispo
    const event = { action: 'answer_call', notification: { close: vi.fn(), data: { convId: 'c-7' } } };
    const r = await sw.handleNotificationClick(event, { clients });
    expect(r).toBeNull();
  });

  it('answer_call client matching SANS callType/callerName → fallbacks audio/""', async () => {
    const focus = vi.fn();
    const postMessage = vi.fn();
    const clients = { matchAll: vi.fn(async () => [{ url: 'https://x.com/messaging-app/', focus, postMessage }]) };
    const event = { action: 'answer_call', notification: { close: vi.fn(), data: { convId: 'c-7' } } };
    await sw.handleNotificationClick(event, { clients });
    expect(postMessage).toHaveBeenCalledWith({ type: 'call-answer', convId: 'c-7', callType: 'audio', callerName: '' });
  });

  it('action=reply → postMessage reply-to-conv', async () => {
    const focus = vi.fn();
    const postMessage = vi.fn();
    const clients = { matchAll: vi.fn(async () => [{ url: 'https://x.com/messaging-app/', focus, postMessage }]), openWindow: vi.fn() };
    const event = { action: 'reply', notification: { close: vi.fn(), data: { convId: 'c-5' } } };
    await sw.handleNotificationClick(event, { clients });
    expect(postMessage).toHaveBeenCalledWith({ type: 'reply-to-conv', convId: 'c-5' });
  });

  it('isCall=true (data.type=call) sans action → traité comme answer_call', async () => {
    const focus = vi.fn();
    const postMessage = vi.fn();
    const clients = { matchAll: vi.fn(async () => [{ url: 'https://x.com/messaging-app/', focus, postMessage }]) };
    const event = { action: '', notification: { close: vi.fn(), data: { type: 'call', convId: 'c-2' } } };
    await sw.handleNotificationClick(event, { clients });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'call-answer', convId: 'c-2' }));
  });
});

// ----------------------------------------------------------------------------
// handleMessage
// ----------------------------------------------------------------------------
describe('sw-handlers — handleMessage', () => {
  it('SKIP_WAITING → appelle skipWaiting', () => {
    const skipWaiting = vi.fn();
    const r = sw.handleMessage({ data: { type: 'SKIP_WAITING' } }, { skipWaiting });
    expect(skipWaiting).toHaveBeenCalled();
    expect(r).toEqual({ type: 'skip-waiting' });
  });
  it('GET_VERSION → postMessage version sur port', () => {
    const port = { postMessage: vi.fn() };
    const event = { data: { type: 'GET_VERSION' }, ports: [port] };
    const r = sw.handleMessage(event, { skipWaiting: vi.fn() });
    expect(port.postMessage).toHaveBeenCalledWith({ version: sw.CACHE_VERSION });
    expect(r.version).toBe(sw.CACHE_VERSION);
  });
  it('GET_VERSION sans port → ne crash pas', () => {
    const event = { data: { type: 'GET_VERSION' }, ports: [] };
    const r = sw.handleMessage(event, { skipWaiting: vi.fn() });
    expect(r.type).toBe('version');
  });
  it('autre type → null', () => {
    expect(sw.handleMessage({ data: { type: 'OTHER' } }, { skipWaiting: vi.fn() })).toBeNull();
  });
  it('event.data null → null', () => {
    expect(sw.handleMessage({ data: null }, { skipWaiting: vi.fn() })).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// handlePeriodicSync
// ----------------------------------------------------------------------------
describe('sw-handlers — handlePeriodicSync', () => {
  it('tag !=apex-chat-heartbeat → no-op', async () => {
    const r = await sw.handlePeriodicSync({ tag: 'autre' }, { clients: {} });
    expect(r).toEqual([]);
  });
  it('tag=apex-chat-heartbeat → postMessage à tous clients', async () => {
    const c1 = { postMessage: vi.fn() };
    const c2 = { postMessage: vi.fn() };
    const clients = { matchAll: vi.fn(async () => [c1, c2]) };
    const r = await sw.handlePeriodicSync({ tag: 'apex-chat-heartbeat' }, { clients });
    expect(c1.postMessage).toHaveBeenCalledWith({ type: 'PERIODIC_HEARTBEAT' });
    expect(c2.postMessage).toHaveBeenCalledWith({ type: 'PERIODIC_HEARTBEAT' });
    expect(r).toHaveLength(2);
  });
});
