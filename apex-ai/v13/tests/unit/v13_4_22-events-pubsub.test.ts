/**
 * Test régression v13.4.22 — core/events.ts (Pub/Sub event bus typé).
 *
 * Bus simple utilisé pour découpler bootstrap → router → features.
 * Si crash : tous les flows event-driven cassent (auth, chat, firebase sync).
 *
 * Existant : 54.83% statements / 80% branches / 60% functions.
 * Tests : on/off/emit/once + crash isolation + typage strict.
 */
import { describe, it, expect, vi } from 'vitest';
import { events } from '../../core/events.js';

describe('v13.4.22 events.on/emit — pub/sub base', () => {
  it("on subscribe + emit déclenche handler", () => {
    const fn = vi.fn();
    const off = events.on('chat:message:user', fn);
    events.emit('chat:message:user', { uid: 'u1', text: 'hello', ts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ uid: 'u1', text: 'hello', ts: 1 });
    off();
  });

  it("emit sans subscriber NE crash PAS", () => {
    expect(() => {
      events.emit('chat:message:assistant', { uid: 'u', text: 't', ts: 1 });
    }).not.toThrow();
  });

  it("plusieurs handlers même event tous déclenchés", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();
    const o1 = events.on('auth:logout', fn1);
    const o2 = events.on('auth:logout', fn2);
    const o3 = events.on('auth:logout', fn3);
    events.emit('auth:logout', {});
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);
    o1(); o2(); o3();
  });

  it("off retire handler", () => {
    const fn = vi.fn();
    const off = events.on('network:online', fn);
    off();
    events.emit('network:online', {});
    expect(fn).not.toHaveBeenCalled();
  });

  it("on retourne fonction qui agit comme off", () => {
    const fn = vi.fn();
    const dispose = events.on('network:offline', fn);
    events.emit('network:offline', {});
    expect(fn).toHaveBeenCalledTimes(1);
    dispose(); /* off via return fn */
    events.emit('network:offline', {});
    expect(fn).toHaveBeenCalledTimes(1); /* Pas re-appelé */
  });

  it("handlers de events DIFFÉRENTS isolés", () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    const oA = events.on('boot:complete', fnA);
    const oB = events.on('boot:routerReady', fnB);
    events.emit('boot:complete', { ctx: null, bootMs: 100 });
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).not.toHaveBeenCalled();
    oA(); oB();
  });
});

describe('v13.4.22 events.once — auto-unsubscribe après 1 trigger', () => {
  it("once handler appelé UNE seule fois", () => {
    const fn = vi.fn();
    events.once('commerce:toggle', fn);
    events.emit('commerce:toggle', { enabled: true });
    events.emit('commerce:toggle', { enabled: false });
    events.emit('commerce:toggle', { enabled: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("once auto-unsub avant le 2ème emit", () => {
    const fn = vi.fn();
    events.once('push:status', fn);
    events.emit('push:status', { environment: 'browser', subscribed: true, needs_install_guide: false });
    /* Handler retiré. Compteur internal doit être 0. */
    events.emit('push:status', { environment: 'pwa', subscribed: false, needs_install_guide: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('v13.4.22 events crash isolation', () => {
  it("handler qui throw NE casse PAS les autres handlers", () => {
    const evil = () => { throw new Error('crash evil'); };
    const good = vi.fn();
    events.on('firebase:remote_change', evil);
    events.on('firebase:remote_change', good);
    expect(() => {
      events.emit('firebase:remote_change', { key: 'k', data: 'v' });
    }).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it("ordre handlers garanti (Set itération en ordre insertion)", () => {
    const order: string[] = [];
    const oA = events.on('route:change', () => order.push('A'));
    const oB = events.on('route:change', () => order.push('B'));
    const oC = events.on('route:change', () => order.push('C'));
    events.emit('route:change', { from: 'old', to: 'new' });
    expect(order).toEqual(['A', 'B', 'C']);
    oA(); oB(); oC();
  });
});

describe('v13.4.22 events custom (string template) avec préfixe custom:', () => {
  it("supporte custom:foo type via EventMap template literal", () => {
    const fn = vi.fn();
     
    const off = (events.on as any)('custom:my_feature', fn);
    (events.emit as any)('custom:my_feature', { foo: 'bar' });
    expect(fn).toHaveBeenCalledWith({ foo: 'bar' });
    off();
  });
});
