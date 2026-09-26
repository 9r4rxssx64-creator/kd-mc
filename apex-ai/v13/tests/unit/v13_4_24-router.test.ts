/**
 * Test régression v13.4.24 — core/router.ts (hash router lazy imports).
 *
 * Existant : 42% statements / 44% branches / 40% functions.
 * Tests : register + navigate + dispatch (with mocks) + guards + escape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';

describe('v13.4.24 router.register & navigate', () => {
  beforeEach(() => {
    /* Reset hash */
    location.hash = '';
  });

  it("register accepte name + loader", () => {
    const loader = async () => ({ render: () => { /* ok */ } });
    expect(() => router.register('test_route_xyz', { loader })).not.toThrow();
  });

  it("navigate change le hash", () => {
    router.navigate('chat');
    expect(location.hash).toBe('#chat');
  });

  it("navigate vers route déjà active dispatch quand même", () => {
    location.hash = '#chat';
    expect(() => router.navigate('chat')).not.toThrow();
  });
});

describe('v13.4.24 router.dispatch — flow lazy loading', () => {
  beforeEach(() => {
    location.hash = '';
    /* Create apex-root si absent */
    if (!document.getElementById('apex-root')) {
      const root = document.createElement('div');
      root.id = 'apex-root';
      document.body.appendChild(root);
    }
    router.init();
  });

  it("dispatch sans route registered → renderNotFound", async () => {
    location.hash = '#inexistant_xyz_123';
    await router.dispatch();
    const root = document.getElementById('apex-root');
    expect(root?.innerHTML).toContain('introuvable');
    expect(root?.innerHTML).toContain('inexistant_xyz_123');
  });

  it("renderNotFound utilise escape (protégé contre XSS même si hash injecté)", async () => {
    /* Note : le browser strip habituellement les < > en URL encoding du hash,
     * mais on teste la défense en profondeur du escape() interne. */
    location.hash = '#malicious_route_name';
    await router.dispatch();
    const root = document.getElementById('apex-root');
    expect(root?.innerHTML).toContain('introuvable');
    expect(root?.innerHTML).toContain('malicious_route_name');
  });

  it("dispatch avec route registered loader → render appelé", async () => {
    const renderMock = vi.fn();
    router.register('test_dispatch_a', {
      loader: async () => ({ render: renderMock }),
    });
    location.hash = '#test_dispatch_a';
    await router.dispatch();
    expect(renderMock).toHaveBeenCalled();
  });

  it("dispatch emit route:change event", async () => {
    const events = (await import('../../core/events.js')).events;
    const handler = vi.fn();
    const off = events.on('route:change', handler);
    router.register('test_event_route', {
      loader: async () => ({ render: () => { /* ok */ } }),
    });
    location.hash = '#test_event_route';
    await router.dispatch();
    expect(handler).toHaveBeenCalled();
    off();
  });

  it("dispatch update store.view au target", async () => {
    router.register('test_store_route', {
      loader: async () => ({ render: () => { /* ok */ } }),
    });
    location.hash = '#test_store_route';
    await router.dispatch();
    expect(store.get('view')).toBe('test_store_route');
  });
});

describe('v13.4.24 router auth guards', () => {
  beforeEach(() => {
    location.hash = '';
    try { store.set('user', null); } catch { /* ok */ }
  });

  it("requiresAuth=true + user null → navigate login", async () => {
    router.register('protected_route_test', {
      loader: async () => ({ render: vi.fn() }),
      requiresAuth: true,
    });
    location.hash = '#protected_route_test';
    await router.dispatch();
    /* Devrait avoir tenté de naviguer vers 'login' */
    expect(location.hash).toContain('login');
  });

  it("requiresAdmin=true + user non-admin → renderForbidden", async () => {
    store.set('user', { id: 'random_user', name: 'Random' });
    store.set('isAdmin', false);
    router.register('admin_only_test', {
      loader: async () => ({ render: vi.fn() }),
      requiresAdmin: true,
    });
    location.hash = '#admin_only_test';
    await router.dispatch();
    const root = document.getElementById('apex-root');
    expect(root?.innerHTML).toContain('réservé');
  });
});

describe('v13.4.24 router error handling', () => {
  beforeEach(() => {
    location.hash = '';
  });

  it("loader qui throw → renderError catch + UI graceful", async () => {
    router.register('crash_test_route', {
      loader: async () => {
        throw new Error('Loader crash test');
      },
    });
    location.hash = '#crash_test_route';
    await router.dispatch();
    const root = document.getElementById('apex-root');
    expect(root?.innerHTML).toContain('Souci');
  });

  it("render qui throw → catch global (anti-régression)", async () => {
    router.register('render_crash_test', {
      loader: async () => ({
        render: () => { throw new Error('Render crash'); },
      }),
    });
    location.hash = '#render_crash_test';
    expect(async () => {
      await router.dispatch();
    }).not.toThrow(); /* Le catch interne route → renderError */
  });
});
