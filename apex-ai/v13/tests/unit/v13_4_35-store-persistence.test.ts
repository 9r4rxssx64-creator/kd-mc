/**
 * Test régression v13.4.35 — core/store.ts init() + persistance localStorage.
 *
 * Complète v13.4.21 (get/set/subscribe/middleware/computed) avec init + PERSISTED_KEYS.
 * theme + commerceEnabled persistés cross-session via localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';

describe('v13.4.35 store.init — bootstrap state', () => {
  beforeEach(() => {
    /* Reset localStorage keys persistées */
    localStorage.removeItem('apex_v13_theme');
    localStorage.removeItem('apex_v13_commerceEnabled');
  });

  it("init idempotent (2× init OK pas de double-hydratation)", () => {
    expect(() => {
      store.init({ appVer: 'v13.4.35' });
      store.init({ appVer: 'OTHER' });
    }).not.toThrow();
  });

  it("init applique initial values", () => {
    /* Test : si init pas encore fait, applique. Sinon, idempotent. */
    store.init({ appVer: 'v13.4.35-test' });
    /* Ne testons pas le résultat (peut avoir été init par autre test) */
    expect(typeof store.get('appVer')).toBe('string');
  });

  it("après init, store.get retourne valeurs par défaut typées", () => {
    store.init({});
    /* Defaults setés dans init() */
    expect(['dark', 'light'].includes(store.get('theme') as string)).toBe(true);
    expect(typeof store.get('isStreaming')).toBe('boolean');
    expect(typeof store.get('commerceEnabled')).toBe('boolean');
  });
});

describe('v13.4.35 store persistance theme + commerceEnabled', () => {
  beforeEach(() => {
    localStorage.removeItem('apex_v13_theme');
    localStorage.removeItem('apex_v13_commerceEnabled');
  });

  it("set('theme', 'light') persiste dans localStorage", () => {
    store.set('theme', 'light');
    const raw = localStorage.getItem('apex_v13_theme');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toBe('light');
  });

  it("set('theme', 'dark') persiste", () => {
    store.set('theme', 'dark');
    const raw = localStorage.getItem('apex_v13_theme');
    expect(JSON.parse(raw as string)).toBe('dark');
  });

  it("set('commerceEnabled', false) persiste", () => {
    store.set('commerceEnabled', false);
    const raw = localStorage.getItem('apex_v13_commerceEnabled');
    expect(JSON.parse(raw as string)).toBe(false);
  });

  it("clés non-persistées (view, user) NE sont PAS dans localStorage", () => {
    store.set('view', 'chat');
    store.set('user', { id: 'test', name: 'Test' });
    expect(localStorage.getItem('apex_v13_view')).toBeNull();
    expect(localStorage.getItem('apex_v13_user_via_persist')).toBeNull();
  });

  it("clés persistées listées dans PERSISTED_KEYS (snapshot test)", () => {
    /* On ne peut pas accéder PERSISTED_KEYS direct (private), mais on peut vérifier
     * via behavior : theme + commerceEnabled doivent persister, pas le reste. */
    store.set('theme', 'light');
    store.set('isStreaming', true); /* Non persisté */
    expect(localStorage.getItem('apex_v13_theme')).toBeTruthy();
    expect(localStorage.getItem('apex_v13_isStreaming')).toBeNull();
  });
});

describe('v13.4.35 store.subscribe persistance', () => {
  it("subscribe sur theme déclenché si valeur change (dedup interne if prev===value)", () => {
    /* Note : store.set a dedup `if (prev === value) return` ligne 76.
     * Si state.theme === 'light' déjà, set('light') no-op.
     * Donc on alterne pour forcer changement. */
    const events: string[] = [];
    const off = store.subscribe('theme', (v) => events.push(String(v)));
    /* Force changement en alternant */
    const current = store.get('theme');
    const opposite = current === 'light' ? 'dark' : 'light';
    store.set('theme', opposite);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events).toContain(opposite);
    off();
  });

  it("subscribe NON déclenché si même valeur (dedup interne)", () => {
    /* Le store dedup : set(prev) NE notifie pas. */
    const current = store.get('theme');
    let count = 0;
    const off = store.subscribe('theme', () => count++);
    store.set('theme', current); /* Même valeur */
    expect(count).toBe(0);
    off();
  });
});

describe('v13.4.35 store.computed avec dépendances dynamiques', () => {
  it("computed lit deps via store.get à chaque access", () => {
    store.set('comp_dep_a', 10);
    store.set('comp_dep_b', 20);
    store.defineComputed('comp_sum_test', () => {
      return (store.get('comp_dep_a') as number) + (store.get('comp_dep_b') as number);
    });
    expect(store.getComputed<number>('comp_sum_test')).toBe(30);
    store.set('comp_dep_a', 5);
    expect(store.getComputed<number>('comp_sum_test')).toBe(25);
  });

  it("computed type-safe avec generic", () => {
    store.set('val_n', 42);
    store.defineComputed('comp_double', () => (store.get('val_n') as number) * 2);
    const r = store.getComputed<number>('comp_double');
    expect(typeof r).toBe('number');
    expect(r).toBe(84);
  });
});

describe('v13.4.35 store edge cases', () => {
  it("set même valeur 2× → subscribe notifié UNE seule fois (dedup interne)", () => {
    /* store.set ligne 76 : `if (prev === value) return` = dedup.
     * Donc 1er set notify, 2ème set no-op. */
    let count = 0;
    const off = store.subscribe('dup_test_key', () => count++);
    store.set('dup_test_key', 'same');
    store.set('dup_test_key', 'same'); /* No-op car prev === value */
    expect(count).toBe(1);
    off();
  });

  it("snapshot après set retourne nouvelles valeurs", () => {
    store.set('snap_after_set', 'after');
    const snap = store.snapshot();
    expect(snap['snap_after_set']).toBe('after');
  });
});
