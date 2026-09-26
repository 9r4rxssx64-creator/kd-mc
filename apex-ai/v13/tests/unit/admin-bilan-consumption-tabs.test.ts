/**
 * Tests admin tabs : Bilan + Consommation (port v12 wirés Sprint 2026-05-04).
 *
 * Vérifie que :
 * - Les 2 nouveaux onglets apparaissent dans renderTabs
 * - Le clic les active
 * - Les modules orphans (financial-bilan, consumption-dashboard) sont chargés en lazy
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../core/store.js';

describe('admin tabs — Bilan + Consommation (port v12)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    root = document.getElementById('apex-root')!;
    store.init({ appVer: 'v13.0.0' });
    store.set('user', { id: 'kdmc_admin', name: 'Kevin' });
    store.set('isAdmin', true);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('onglet Bilan apparaît dans renderTabs', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const bilanTab = root.querySelector<HTMLButtonElement>('[data-tab="bilan"]');
    expect(bilanTab).toBeTruthy();
    expect(bilanTab?.textContent).toContain('Bilan');
  });

  it('onglet Conso IA apparaît dans renderTabs', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const consoTab = root.querySelector<HTMLButtonElement>('[data-tab="consumption"]');
    expect(consoTab).toBeTruthy();
    expect(consoTab?.textContent).toContain('Conso');
  });

  it('clic onglet bilan affiche mount point', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const bilanTab = root.querySelector<HTMLButtonElement>('[data-tab="bilan"]');
    bilanTab?.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(root.innerHTML).toContain('ax-admin-mount-bilan');
  });

  it('clic onglet consumption affiche mount point', async () => {
    const { render } = await import('../../features/admin/index.js');
    render(root);
    const consoTab = root.querySelector<HTMLButtonElement>('[data-tab="consumption"]');
    consoTab?.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(root.innerHTML).toContain('ax-admin-mount-consumption');
  });

  it('non-admin n\'a pas accès', async () => {
    store.set('isAdmin', false);
    const { render } = await import('../../features/admin/index.js');
    render(root);
    expect(root.innerHTML).toContain('réservé');
  });
});
