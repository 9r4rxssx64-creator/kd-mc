/**
 * Tests P0 audit Cure53/NCC : event delegation singleton dans apex-tools-dispatch.
 *
 * Vérifie :
 *   1. registerToolAction installe la délégation lazily (1 seul listener doc.body)
 *   2. Un seul listener même après N registerToolAction
 *   3. unregister retire l'action (no leak handler)
 *   4. destroy() abort la délégation
 *   5. destroy() est idempotent
 *   6. clic data-tool-action match → handler appelé
 *   7. clic sans data-tool-action → handler pas appelé
 *   8. 1000 cycles register/unregister → counter stable
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';

/* Helpers privés exposés pour tests via cast unknown.
   On ne change pas le contrat public — on teste l'effet observable. */
interface DispatcherInternals {
  registerToolAction: (action: string, handler: (el: Element, ev: Event) => void) => () => void;
  installDelegation: () => void;
}

function asInternals(): DispatcherInternals {
  return apexToolsDispatch as unknown as DispatcherInternals;
}

describe('apex-tools-dispatch event delegation (P0 audit Cure53/NCC)', () => {
  beforeEach(() => {
    /* Reset état du singleton pour tests isolés */
    apexToolsDispatch.destroy();
  });

  afterEach(() => {
    apexToolsDispatch.destroy();
  });

  describe('isDelegationInstalled() / getActiveDelegationActionCount()', () => {
    it('par défaut, délégation pas installée', () => {
      expect(apexToolsDispatch.isDelegationInstalled()).toBe(false);
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(0);
    });

    it('registerToolAction installe la délégation lazily', () => {
      asInternals().registerToolAction('test1', () => { /* noop */ });
      expect(apexToolsDispatch.isDelegationInstalled()).toBe(true);
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(1);
    });

    it('multiple registerToolAction → 1 seule délégation, plusieurs handlers', () => {
      asInternals().registerToolAction('a', () => { /* noop */ });
      asInternals().registerToolAction('b', () => { /* noop */ });
      asInternals().registerToolAction('c', () => { /* noop */ });
      expect(apexToolsDispatch.isDelegationInstalled()).toBe(true);
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(3);
    });
  });

  describe('destroy()', () => {
    it('abort la délégation', () => {
      asInternals().registerToolAction('foo', () => { /* noop */ });
      apexToolsDispatch.destroy();
      expect(apexToolsDispatch.isDelegationInstalled()).toBe(false);
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(0);
    });

    it('idempotent — multiple appels ne throw pas', () => {
      expect(() => {
        apexToolsDispatch.destroy();
        apexToolsDispatch.destroy();
        apexToolsDispatch.destroy();
      }).not.toThrow();
    });

    it("appelable sans délégation installée", () => {
      expect(() => apexToolsDispatch.destroy()).not.toThrow();
    });
  });

  describe('unregister handler', () => {
    it('unregister enlève le handler de la map', () => {
      const unreg = asInternals().registerToolAction('test', () => { /* noop */ });
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(1);
      unreg();
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(0);
    });

    it('unregister appelé 2x ne crash pas', () => {
      const unreg = asInternals().registerToolAction('test', () => { /* noop */ });
      unreg();
      expect(() => unreg()).not.toThrow();
    });

    it("unregister ne supprime que SON handler (pas les autres)", () => {
      const unregA = asInternals().registerToolAction('a', () => { /* noop */ });
      asInternals().registerToolAction('b', () => { /* noop */ });
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(2);
      unregA();
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(1);
    });
  });

  describe('event flow — clic data-tool-action', () => {
    it("clic sur élément data-tool-action déclenche son handler", () => {
      let called = 0;
      asInternals().registerToolAction('myaction', () => { called++; });

      const btn = document.createElement('button');
      btn.dataset['toolAction'] = 'myaction';
      document.body.appendChild(btn);
      try {
        btn.click();
        expect(called).toBe(1);
      } finally {
        document.body.removeChild(btn);
      }
    });

    it("clic sur élément SANS data-tool-action n'appelle aucun handler", () => {
      let called = 0;
      asInternals().registerToolAction('foo', () => { called++; });

      const btn = document.createElement('button');
      document.body.appendChild(btn);
      try {
        btn.click();
        expect(called).toBe(0);
      } finally {
        document.body.removeChild(btn);
      }
    });

    it("après destroy(), le clic n'appelle plus le handler", () => {
      let called = 0;
      asInternals().registerToolAction('bar', () => { called++; });

      const btn = document.createElement('button');
      btn.dataset['toolAction'] = 'bar';
      document.body.appendChild(btn);
      try {
        btn.click();
        expect(called).toBe(1);
        apexToolsDispatch.destroy();
        btn.click();
        /* Toujours 1 — destroy a abort la délégation */
        expect(called).toBe(1);
      } finally {
        document.body.removeChild(btn);
      }
    });

    it("clic sur enfant d'un bouton data-tool-action propage via .closest()", () => {
      let called = 0;
      asInternals().registerToolAction('parent-action', () => { called++; });

      const btn = document.createElement('button');
      btn.dataset['toolAction'] = 'parent-action';
      const inner = document.createElement('span');
      inner.textContent = 'click me';
      btn.appendChild(inner);
      document.body.appendChild(btn);
      try {
        inner.click();
        /* L'event remonte → closest('[data-tool-action]') trouve le bouton parent */
        expect(called).toBe(1);
      } finally {
        document.body.removeChild(btn);
      }
    });
  });

  describe('Memory leak test — répétition', () => {
    it("1000 cycles register/unregister — counter reste cohérent", () => {
      for (let i = 0; i < 1000; i++) {
        const unreg = asInternals().registerToolAction(`action-${i}`, () => { /* noop */ });
        unreg();
      }
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(0);
      /* Délégation reste installée (pas de leak car 1 seul listener doc.body) */
      expect(apexToolsDispatch.isDelegationInstalled()).toBe(true);
    });

    it("100 register sans unregister puis destroy() → 0 actions", () => {
      for (let i = 0; i < 100; i++) {
        asInternals().registerToolAction(`a-${i}`, () => { /* noop */ });
      }
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(100);
      apexToolsDispatch.destroy();
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(0);
    });

    it("registerToolAction overwrite ne duplique pas le handler", () => {
      asInternals().registerToolAction('same', () => { /* h1 */ });
      asInternals().registerToolAction('same', () => { /* h2 */ });
      asInternals().registerToolAction('same', () => { /* h3 */ });
      /* Map = même clé → 1 seule entrée */
      expect(apexToolsDispatch.getActiveDelegationActionCount()).toBe(1);
    });
  });
});
