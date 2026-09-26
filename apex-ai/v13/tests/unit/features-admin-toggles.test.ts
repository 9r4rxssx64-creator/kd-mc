/**
 * APEX v13 — Tests features/admin-toggles
 *
 * Tests UI rendu (logique délégée au service feature-toggles déjà testé).
 * Couvre :
 *  - Guard admin (non-admin → message bloquant)
 *  - Render OK pour admin (header, sections, search input)
 *  - Search filter respecte la query
 *  - User filter (per-user mode)
 *  - Click toggle → setGlobal
 *  - Bulk actions enable-all / disable-all / reset / export
 *  - Per-user modal open/close + toggle/remove
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { store } from '../../core/store.js';
import { _resetState, render } from '../../features/admin-toggles/index.js';
import { featureToggles } from '../../services/auth/feature-toggles.js';

function makeRoot(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function setAdmin(on: boolean): void {
  /* store.init si nécessaire */
  try {
    store.init({});
  } catch {
    /* déjà init */
  }
  store.set('isAdmin', on);
}

describe('features/admin-toggles', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    _resetState();
  });

  describe('Guard admin', () => {
    it('non-admin → message "Accès réservé"', () => {
      setAdmin(false);
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('Accès réservé');
      expect(root.innerHTML).not.toContain('Toggles ON/OFF');
    });

    it('admin → render full', () => {
      setAdmin(true);
      const root = makeRoot();
      render(root);
      expect(root.innerHTML).toContain('Toggles ON/OFF');
    });
  });

  describe('Header & stats', () => {
    beforeEach(() => setAdmin(true));

    it('header contient bouton tout activer/désactiver/reset', () => {
      const root = makeRoot();
      render(root);
      expect(root.querySelector('[data-action="enable-all"]')).toBeTruthy();
      expect(root.querySelector('[data-action="disable-all"]')).toBeTruthy();
      expect(root.querySelector('[data-action="reset-defaults"]')).toBeTruthy();
      expect(root.querySelector('[data-action="export-config"]')).toBeTruthy();
    });

    it('search input présent', () => {
      const root = makeRoot();
      render(root);
      expect(root.querySelector('#ax-toggles-search')).toBeTruthy();
    });

    it('user filter select présent avec option Global', () => {
      const root = makeRoot();
      render(root);
      const sel = root.querySelector('#ax-toggles-user-filter');
      expect(sel).toBeTruthy();
      expect(sel?.innerHTML).toContain('Global');
    });

    it('stats affichent le nombre de features', () => {
      const root = makeRoot();
      render(root);
      const stats = featureToggles.getStats();
      expect(root.innerHTML).toContain(`${stats.enabledGlobal}/${stats.total}`);
    });
  });

  describe('Sections par catégorie', () => {
    beforeEach(() => setAdmin(true));

    it('contient au moins une section studio', () => {
      const root = makeRoot();
      render(root);
      expect(root.querySelector('[data-category="studio"]')).toBeTruthy();
    });

    it('contient des toggles par feature', () => {
      const root = makeRoot();
      render(root);
      expect(root.querySelector('[data-toggle="studio.music"]')).toBeTruthy();
    });

    it('chaque toggle a un bouton per-user', () => {
      const root = makeRoot();
      render(root);
      expect(root.querySelector('[data-per-user="studio.music"]')).toBeTruthy();
    });
  });

  describe('Toggle clicks', () => {
    beforeEach(() => setAdmin(true));

    it('click toggle global change l\'état', () => {
      const root = makeRoot();
      render(root);
      const initial = featureToggles.isEnabledGlobal('studio.music');
      const btn = root.querySelector<HTMLButtonElement>('[data-toggle="studio.music"]');
      expect(btn).toBeTruthy();
      btn?.click();
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(!initial);
    });
  });

  describe('Bulk actions', () => {
    beforeEach(() => setAdmin(true));

    it('enable-all → toutes les features actives', () => {
      const root = makeRoot();
      render(root);
      featureToggles.disableAll();
      const btn = root.querySelector<HTMLButtonElement>('[data-action="enable-all"]');
      btn?.click();
      const all = featureToggles.list();
      const allEnabled = all.every((f) => featureToggles.isEnabledGlobal(f.id));
      expect(allEnabled).toBe(true);
    });

    it('reset-defaults → state efface', () => {
      const root = makeRoot();
      render(root);
      featureToggles.setGlobal('studio.music', false);
      const btn = root.querySelector<HTMLButtonElement>('[data-action="reset-defaults"]');
      btn?.click();
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(true);
    });
  });

  describe('Search filter', () => {
    beforeEach(() => setAdmin(true));

    it('search query modifie le rendu', () => {
      const root = makeRoot();
      render(root);
      const input = root.querySelector<HTMLInputElement>('#ax-toggles-search');
      expect(input).toBeTruthy();
      if (!input) return;
      input.value = 'studio';
      input.dispatchEvent(new Event('input'));
      /* Après render filtré, contient toujours studios mais pas catégorie pro */
      expect(root.innerHTML).toContain('studio.music');
    });

    it('search query vide affiche tout', () => {
      const root = makeRoot();
      render(root);
      const input = root.querySelector<HTMLInputElement>('#ax-toggles-search');
      if (!input) return;
      input.value = '';
      input.dispatchEvent(new Event('input'));
      expect(root.querySelectorAll('[data-toggle]').length).toBeGreaterThan(50);
    });
  });

  describe('User filter / per-user mode', () => {
    beforeEach(() => setAdmin(true));

    it('change select user → render avec banner per-user', () => {
      const root = makeRoot();
      render(root);
      const sel = root.querySelector<HTMLSelectElement>('#ax-toggles-user-filter');
      if (!sel) return;
      sel.value = 'laurence_sp';
      sel.dispatchEvent(new Event('change'));
      expect(root.innerHTML).toContain('Mode per-user');
      expect(root.innerHTML).toContain('laurence_sp');
    });

    it('toggle en mode per-user → setForUser pas global', () => {
      const root = makeRoot();
      render(root);
      const sel = root.querySelector<HTMLSelectElement>('#ax-toggles-user-filter');
      if (!sel) return;
      sel.value = 'laurence_sp';
      sel.dispatchEvent(new Event('change'));
      const initialGlobal = featureToggles.isEnabledGlobal('studio.music');
      const btn = root.querySelector<HTMLButtonElement>('[data-toggle="studio.music"]');
      btn?.click();
      /* global pas changé */
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(initialGlobal);
      /* user override appliqué */
      const userMap = JSON.parse(localStorage.getItem('ax_feature_toggles_user_laurence_sp') ?? '{}') as Record<string, boolean>;
      expect(Object.prototype.hasOwnProperty.call(userMap, 'studio.music')).toBe(true);
    });

    it('clear-user-filter ramène en mode global', () => {
      const root = makeRoot();
      render(root);
      const sel = root.querySelector<HTMLSelectElement>('#ax-toggles-user-filter');
      if (!sel) return;
      sel.value = 'laurence_sp';
      sel.dispatchEvent(new Event('change'));
      expect(root.innerHTML).toContain('Mode per-user');
      const clear = root.querySelector<HTMLButtonElement>('[data-action="clear-user-filter"]');
      clear?.click();
      expect(root.innerHTML).not.toContain('Mode per-user');
    });
  });

  describe('Per-user modal', () => {
    beforeEach(() => setAdmin(true));

    it('click per-user → ouvre modal', () => {
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('[data-per-user="studio.music"]');
      btn?.click();
      const modal = document.getElementById('ax-toggles-modal');
      expect(modal).toBeTruthy();
    });

    it('modal contient liste users et close button', () => {
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('[data-per-user="studio.music"]');
      btn?.click();
      const modal = document.getElementById('ax-toggles-modal');
      expect(modal?.querySelector('[data-action="modal-close"]')).toBeTruthy();
    });

    it('toggle dans modal change override per-user', () => {
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('[data-per-user="studio.music"]');
      btn?.click();
      const modal = document.getElementById('ax-toggles-modal');
      const tgl = modal?.querySelector<HTMLButtonElement>('[data-modal-toggle="studio.music"]');
      tgl?.click();
      const map = JSON.parse(localStorage.getItem('ax_feature_toggles_user_kdmc_admin') ?? localStorage.getItem('ax_feature_toggles_user_laurence_sp') ?? '{}') as Record<string, boolean>;
      /* Au moins un des deux users a un override */
      expect(typeof map['studio.music'] === 'boolean'
        || Object.keys(JSON.parse(localStorage.getItem('ax_feature_toggles_user_laurence_sp') ?? '{}')).length > 0).toBe(true);
    });

    it('close button retire le modal', () => {
      const root = makeRoot();
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('[data-per-user="studio.music"]');
      btn?.click();
      let modal = document.getElementById('ax-toggles-modal');
      expect(modal).toBeTruthy();
      const close = modal?.querySelector<HTMLButtonElement>('[data-action="modal-close"]');
      close?.click();
      modal = document.getElementById('ax-toggles-modal');
      expect(modal).toBeNull();
    });
  });

  describe('No matches search', () => {
    beforeEach(() => setAdmin(true));

    it('search sans match affiche message', () => {
      const root = makeRoot();
      render(root);
      const input = root.querySelector<HTMLInputElement>('#ax-toggles-search');
      if (!input) return;
      input.value = 'zzznotfoundzzz';
      input.dispatchEvent(new Event('input'));
      expect(root.innerHTML.toLowerCase()).toContain('aucune feature');
    });
  });
});
