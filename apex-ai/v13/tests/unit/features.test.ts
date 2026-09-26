/**
 * Tests features UI minimaux (Jet 7.5 — features 0% coverage).
 * Tests "smoke" : render produit du HTML attendu, handlers attachent.
 * E2E complet via Playwright boot.spec.ts (CI).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '../../core/store.js';

describe('features/landing', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    store.init({ appVer: 'v13.0.0' });
    store.set('user', null);
  });

  it('render affiche logo APEX + form login', async () => {
    const { render } = await import('../../features/landing/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('APEX');
    expect(root.querySelector('#login-form')).not.toBeNull();
    expect(root.querySelector('#login-name')).not.toBeNull();
    expect(root.querySelector('#login-pin')).not.toBeNull();
  });

  it('render avec invite token affiche message info', async () => {
    /* Invite token format : btoa(uid:ts:hash) */
    const token = btoa('u_invited:1234567890:abcdef1234567890');
    location.hash = '#invite=' + token;
    const { render } = await import('../../features/landing/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('Invitation');
    location.hash = '';
  });
});

describe('features/admin', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    store.init({ appVer: 'v13.0.0' });
  });

  it('render refuse non-admin', async () => {
    store.set('user', { id: 'random_user', name: 'Pas Admin' });
    store.set('isAdmin', false);
    const { render } = await import('../../features/admin/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('réservé');
  });

  it('render admin Kevin affiche tabs', async () => {
    store.set('user', { id: 'kdmc_admin', name: 'Kevin' });
    store.set('isAdmin', true);
    const { render } = await import('../../features/admin/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('Centre Admin');
    /* 4 tabs : Commerce / Comptes / Pending / Santé */
    expect(root.querySelectorAll('.ax-tab').length).toBeGreaterThanOrEqual(4);
  });

  it('admin commerce tab affiche toggle', async () => {
    store.set('user', { id: 'kdmc_admin', name: 'Kevin' });
    store.set('isAdmin', true);
    const { render } = await import('../../features/admin/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.querySelector('#commerce-toggle')).not.toBeNull();
  });
});

describe('features/chat', () => {
  beforeEach(async () => {
    /* v13.4.122 fix : resetModules pour forcer re-évaluation propre du module chat
     * (sinon TDZ Cannot access 'conversation' before initialization en happy-dom
     * quand admin/landing tests ont précédemment importé des services qui partagent
     * des modules avec chat). */
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    /* Re-import store après resetModules pour avoir l'instance fraîche */
    const { store: freshStore } = await import('../../core/store.js');
    freshStore.init({ appVer: 'v13.0.0' });
    freshStore.set('user', { id: 'kdmc_admin', name: 'Kevin (DK)' });
    freshStore.set('isAdmin', true);
  });

  it('render affiche header APEX AI', async () => {
    const { render } = await import('../../features/chat/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('APEX');
    expect(root.querySelector('#ax-chat-form')).not.toBeNull();
    expect(root.querySelector('#ax-chat-text')).not.toBeNull();
  });

  it('render greeting personnalisé Kevin', async () => {
    const { render } = await import('../../features/chat/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('Kevin');
  });

  it('render footer signature DK', async () => {
    const { render } = await import('../../features/chat/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('DK');
  });

  it('affiche card "Aucune clé API" si pas configurée', async () => {
    const { render } = await import('../../features/chat/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('clé API');
  });

  it('cache card si clé Anthropic configurée', async () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-test');
    const { render } = await import('../../features/chat/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    /* Pas de card "Coller une clé" si déjà configurée */
    expect(root.querySelector('#ax-paste-key')).toBeNull();
  });

  it('nav bar visible avec Admin si admin', async () => {
    const { render } = await import('../../features/chat/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    expect(root.innerHTML).toContain('Admin');
  });

  it('input message accepte typing', async () => {
    const { render } = await import('../../features/chat/index.js');
    const root = document.getElementById('apex-root')!;
    render(root);
    const textarea = root.querySelector<HTMLTextAreaElement>('#ax-chat-text')!;
    textarea.value = 'Test message';
    textarea.dispatchEvent(new Event('input'));
    expect(textarea.value).toBe('Test message');
  });
});
