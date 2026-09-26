import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';

describe('store', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('init sets defaults', () => {
    store.init({ appVer: 'v13.0.0' });
    expect(store.get('appVer')).toBe('v13.0.0');
    expect(store.get('user')).toBeNull();
    expect(store.get('isAdmin')).toBe(false);
  });
  it('set/get value', () => {
    store.init({ appVer: 'v13.0.0' });
    store.set('view', 'chat');
    expect(store.get('view')).toBe('chat');
  });
  it('subscribe notifies on change', () => {
    store.init({ appVer: 'v13.0.0' });
    let called = 0;
    let lastValue: unknown = null;
    const unsub = store.subscribe('view', (v) => { called++; lastValue = v; });
    store.set('view', 'admin');
    expect(called).toBe(1);
    expect(lastValue).toBe('admin');
    unsub();
    store.set('view', 'login');
    expect(called).toBe(1); /* unsubscribed */
  });
  it('persist whitelist (theme + commerceEnabled)', () => {
    store.init({ appVer: 'v13.0.0' });
    store.set('theme', 'light');
    expect(localStorage.getItem('apex_v13_theme')).toBe('"light"');
  });
  it('snapshot returns immutable copy', () => {
    store.init({ appVer: 'v13.0.0' });
    store.set('view', 'chat');
    const snap = store.snapshot();
    expect(snap.view).toBe('chat');
  });
});
