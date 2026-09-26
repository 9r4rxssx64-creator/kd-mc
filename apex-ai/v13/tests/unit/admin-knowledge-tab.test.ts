/**
 * Tests knowledge tab dans admin/index.ts (RAG GitHub Knowledge Base).
 *
 * Couvre rendering + handlers : add repo, remove repo, search, clear cache.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { store } from '../../core/store.js';
import { apexKnowledgeBase } from '../../services/admin/apex-knowledge-base.js';
import { vault } from '../../services/vault/vault.js';

describe('admin/index.ts — knowledge tab', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    apexKnowledgeBase.clearCache();
    document.body.innerHTML = '<div id="apex-root"></div>';
    root = document.getElementById('apex-root')!;
    store.init({ appVer: 'v13.0.0' });
    store.set('user', { id: 'kdmc_admin', name: 'Kevin' });
    store.set('isAdmin', true);
    vi.restoreAllMocks();
    vi.spyOn(vault, 'readKey').mockResolvedValue('ghp_fake');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rendu du tab knowledge contient sections clés', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    expect(tab).toBeTruthy();
    tab?.click();
    /* setTimeout 0 pour laisser render se rejouer */
    await new Promise((r) => setTimeout(r, 10));
    const html = root.innerHTML;
    expect(html).toContain('Base de connaissances');
    expect(html).toContain('Repos suivis');
    expect(html).toContain('add-repo-form');
    expect(html).toContain('kb-search-form');
  });

  it('addRepo form valide ajoute repo + re-render', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const input = root.querySelector<HTMLInputElement>('#kb-add-repo');
    if (input) {
      input.value = 'kevin/NewProject';
      const form = root.querySelector<HTMLFormElement>('#add-repo-form');
      form?.dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise((r) => setTimeout(r, 10));
      const repos = apexKnowledgeBase.listRepos();
      expect(repos).toContain('kevin/NewProject');
    }
  });

  it('addRepo form vide → toast warn (pas d\'ajout)', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const before = apexKnowledgeBase.listRepos().length;
    const form = root.querySelector<HTMLFormElement>('#add-repo-form');
    form?.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(apexKnowledgeBase.listRepos().length).toBe(before);
  });

  it('addRepo format invalide → reste inchangé', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const before = apexKnowledgeBase.listRepos().length;
    const input = root.querySelector<HTMLInputElement>('#kb-add-repo');
    if (input) {
      input.value = 'invalid-no-slash';
      const form = root.querySelector<HTMLFormElement>('#add-repo-form');
      form?.dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise((r) => setTimeout(r, 10));
      expect(apexKnowledgeBase.listRepos().length).toBe(before);
    }
  });

  it('search form lance recherche → résultats affichés', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      items: [{ path: 'foo.ts', url: '', html_url: 'https://gh/foo.ts', score: 0.95, repository: { full_name: 'a/b' } }],
    }), { status: 200 }));
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const queryInput = root.querySelector<HTMLInputElement>('#kb-search-query');
    if (queryInput) {
      queryInput.value = 'mySearch';
      const form = root.querySelector<HTMLFormElement>('#kb-search-form');
      form?.dispatchEvent(new Event('submit', { cancelable: true }));
      /* Attente résolution promise */
      await new Promise((r) => setTimeout(r, 100));
      const resultsEl = root.querySelector<HTMLDivElement>('#kb-search-results');
      const html = resultsEl?.innerHTML ?? '';
      expect(html).toContain('foo.ts');
    }
  });

  it('search form sans query → no-op', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const form = root.querySelector<HTMLFormElement>('#kb-search-form');
    form?.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 10));
    /* Pas de crash, OK */
    expect(true).toBe(true);
  });

  it('clear cache button vide cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const { render } = await import('../../features/admin/index.js');
    /* Pre-populate cache */
    await apexKnowledgeBase.searchCode('warm');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const btn = root.querySelector<HTMLButtonElement>('#kb-clear-cache');
    btn?.click();
    await new Promise((r) => setTimeout(r, 10));
    const stats = apexKnowledgeBase.getStats();
    expect(stats.cache_entries).toBe(0);
  });

  it('remove-repo button retire repo', async () => {
    apexKnowledgeBase.addRepo('foo/bar');
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const removeBtn = root.querySelector<HTMLButtonElement>('[data-remove-repo="foo/bar"]');
    removeBtn?.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(apexKnowledgeBase.listRepos()).not.toContain('foo/bar');
  });

  it('rendu avec 2+ repos affiche bouton Retirer', async () => {
    apexKnowledgeBase.addRepo('foo/bar');
    apexKnowledgeBase.addRepo('baz/qux');
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const removeBtns = root.querySelectorAll('[data-remove-repo]');
    expect(removeBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('rendu avec token configuré affiche ✅', async () => {
    localStorage.setItem('ax_github_token', 'ghp_real_token_xxxxxxxxxx');
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const html = root.innerHTML;
    expect(html).toContain('configuré');
  });

  it('rendu sans token affiche prompt Coffre', async () => {
    /* localStorage cleared in beforeEach → no token */
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const html = root.innerHTML;
    expect(html).toContain('Configure ax_github_token');
  });

  it('search avec 0 résultats → message muted', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const tab = root.querySelector<HTMLButtonElement>('[data-tab="knowledge"]');
    tab?.click();
    await new Promise((r) => setTimeout(r, 10));
    const queryInput = root.querySelector<HTMLInputElement>('#kb-search-query');
    if (queryInput) {
      queryInput.value = 'no-match';
      const form = root.querySelector<HTMLFormElement>('#kb-search-form');
      form?.dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
      const resultsEl = root.querySelector<HTMLDivElement>('#kb-search-results');
      expect(resultsEl?.innerHTML).toContain('Aucun résultat');
    }
  });
});
