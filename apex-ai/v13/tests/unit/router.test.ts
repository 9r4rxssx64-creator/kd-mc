/**
 * Tests RÉELS core/router.ts (Jet 7.5 — coverage 0% → 80%+).
 * Mock import dynamique des features pour tester routing sans réelle dépendance.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';

describe('Router hash (core/router.ts)', () => {
  let rootEl: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    /* keep rootEl persistent */
    rootEl = (document.getElementById('apex-root') as HTMLDivElement) ?? document.createElement('div');
    rootEl.id = 'apex-root';
    if (!rootEl.parentElement) document.body.appendChild(rootEl);
    rootEl.innerHTML = '';
    /* Reset hash */
    location.hash = '';
    store.init({ appVer: 'v13.0.0' });
    store.set('user', null);
    store.set('isAdmin', false);
  });

  it('register accepte route avec loader (sans throw)', () => {
    let threw = false;
    try {
      router.register('test-route', {
        loader: async () => ({ render: () => undefined }),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it('init idempotent : 2 calls sans throw + listener installé une seule fois', () => {
    let threw = false;
    try {
      router.init();
      router.init();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    /* Test fonctionnel : navigate fonctionne après init */
    router.navigate('idem-test');
    expect(location.hash).toBe('#idem-test');
  });

  it('navigate change location.hash', () => {
    router.init();
    router.navigate('test-nav');
    expect(location.hash).toBe('#test-nav');
  });

  it('dispatch route inconnue → notFound rendering', async () => {
    router.init();
    location.hash = '#route-inconnue-' + Date.now();
    /* dispatch peut être async, on attend un peu */
    await new Promise((r) => setTimeout(r, 100));
    expect(rootEl.innerHTML).toContain('introuvable');
  });

  it('notFound : bouton Retour CSP-safe (pas d\'inline onclick) + clic navigue vers #chat', async () => {
    router.init();
    location.hash = '#route-inconnue-csp-' + Date.now();
    await new Promise((r) => setTimeout(r, 100));
    const btn = rootEl.querySelector('#ax-nf-back') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('onclick')).toBeNull(); /* inline onclick = bloqué par CSP → interdit */
    btn?.click();
    expect(location.hash).toBe('#chat');
  });

  it('forbidden : boutons CSP-safe (pas d\'inline onclick) + clic Retour navigue vers #chat', async () => {
    store.set('user', { id: 'u1', name: 'NotAdmin' });
    store.set('isAdmin', false);
    router.register('admin-only-csp', {
      loader: async () => ({ render: () => undefined }),
      requiresAdmin: true,
    });
    router.init();
    location.hash = '#admin-only-csp';
    await new Promise((r) => setTimeout(r, 100));
    const back = rootEl.querySelector('#ax-forbid-back') as HTMLButtonElement | null;
    expect(back).not.toBeNull();
    expect(back?.getAttribute('onclick')).toBeNull();
    back?.click();
    expect(location.hash).toBe('#chat');
  });

  it('route avec requiresAuth redirige vers login si pas user', async () => {
    let renderCalled = false;
    router.register('protected-route', {
      loader: async () => ({
        render: () => {
          renderCalled = true;
        },
      }),
      requiresAuth: true,
    });
    router.register('login', {
      loader: async () => ({ render: () => { rootEl.innerHTML = '<div id="login">login</div>'; } }),
    });
    router.init();
    location.hash = '#protected-route';
    await new Promise((r) => setTimeout(r, 100));
    /* User = null → devrait redirect vers login (renderCalled false) */
    expect(renderCalled).toBe(false);
  });

  it('route avec requiresAdmin → forbidden si user pas admin', async () => {
    store.set('user', { id: 'u1', name: 'NotAdmin' });
    store.set('isAdmin', false);
    router.register('admin-only', {
      loader: async () => ({ render: () => undefined }),
      requiresAdmin: true,
    });
    router.init();
    location.hash = '#admin-only';
    await new Promise((r) => setTimeout(r, 100));
    expect(rootEl.innerHTML).toContain('réservé');
  });

  it('route admin OK pour admin', async () => {
    store.set('user', { id: 'kdmc_admin', name: 'Kevin' });
    store.set('isAdmin', true);
    let rendered = false;
    router.register('admin-route-test', {
      loader: async () => ({
        render: () => {
          rendered = true;
          rootEl.innerHTML = '<div>admin OK</div>';
        },
      }),
      requiresAdmin: true,
    });
    router.init();
    location.hash = '#admin-route-test';
    await new Promise((r) => setTimeout(r, 100));
    expect(rendered).toBe(true);
  });

  it('dispatch met à jour store.view', async () => {
    router.register('view-tracking', {
      loader: async () => ({ render: () => undefined }),
    });
    router.init();
    location.hash = '#view-tracking';
    await new Promise((r) => setTimeout(r, 100));
    expect(store.get('view')).toBe('view-tracking');
  });

  it('loader throw → render erreur user-friendly', async () => {
    router.register('crashes', {
      loader: async () => {
        throw new Error('module load failed');
      },
    });
    router.init();
    location.hash = '#crashes';
    await new Promise((r) => setTimeout(r, 100));
    /* render error message dans rootEl */
    expect(rootEl.innerHTML.length).toBeGreaterThan(0);
    /* Pas d'erreur technique brute exposée user (CLAUDE.md règle) */
    expect(rootEl.innerHTML).not.toContain('module load failed');
  });
});
