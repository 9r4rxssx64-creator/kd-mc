/**
 * APEX v13 — Tests anti-zoom-ios.ts
 *
 * Triple protection iPhone Safari PWA :
 * - gesture events (gesturestart/change/end)
 * - touchstart multi-doigts
 * - double-tap rapide (<350ms)
 * - reset zoom programmatique via visualViewport.scale
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { antiZoomIOS } from '../../services/core-svc/anti-zoom-ios.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.unstubAllGlobals();
  antiZoomIOS.uninstall();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  antiZoomIOS.uninstall();
  vi.useRealTimers();
});

describe('anti-zoom-ios — install', () => {
  it('install idempotent (2× ne réinstalle pas listeners)', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    antiZoomIOS.install();
    const callsAfterFirst = spy.mock.calls.length;
    antiZoomIOS.install();
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('install enregistre listeners gesture + touch', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    antiZoomIOS.install();
    const events = spy.mock.calls.map((c) => c[0]);
    expect(events).toContain('gesturestart');
    expect(events).toContain('gesturechange');
    expect(events).toContain('gestureend');
    expect(events).toContain('touchstart');
    expect(events).toContain('touchend');
    expect(events).toContain('visibilitychange');
  });

  it('install enregistre focus listener sur window', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    antiZoomIOS.install();
    const events = spy.mock.calls.map((c) => c[0]);
    expect(events).toContain('focus');
  });
});

describe('anti-zoom-ios — gesture blocking', () => {
  it('gesturestart event est cancelé (preventDefault)', () => {
    antiZoomIOS.install();
    const ev = new Event('gesturestart', { cancelable: true });
    const pd = vi.spyOn(ev, 'preventDefault');
    const sp = vi.spyOn(ev, 'stopPropagation');
    document.dispatchEvent(ev);
    expect(pd).toHaveBeenCalled();
    expect(sp).toHaveBeenCalled();
  });

  it('gesturechange également bloqué', () => {
    antiZoomIOS.install();
    const ev = new Event('gesturechange', { cancelable: true });
    const pd = vi.spyOn(ev, 'preventDefault');
    document.dispatchEvent(ev);
    expect(pd).toHaveBeenCalled();
  });

  it('gestureend également bloqué', () => {
    antiZoomIOS.install();
    const ev = new Event('gestureend', { cancelable: true });
    const pd = vi.spyOn(ev, 'preventDefault');
    document.dispatchEvent(ev);
    expect(pd).toHaveBeenCalled();
  });
});

describe('anti-zoom-ios — touch handling', () => {
  it('touchstart 1 doigt → pas de preventDefault', () => {
    antiZoomIOS.install();
    const ev = new Event('touchstart', { cancelable: true });
    Object.defineProperty(ev, 'touches', {
      value: [{ clientX: 0, clientY: 0 }],
      configurable: true,
    });
    const pd = vi.spyOn(ev, 'preventDefault');
    document.dispatchEvent(ev);
    expect(pd).not.toHaveBeenCalled();
  });

  it('touchstart 2 doigts → preventDefault (anti pinch-zoom)', () => {
    antiZoomIOS.install();
    const ev = new Event('touchstart', { cancelable: true });
    Object.defineProperty(ev, 'touches', {
      value: [
        { clientX: 0, clientY: 0 },
        { clientX: 100, clientY: 100 },
      ],
      configurable: true,
    });
    const pd = vi.spyOn(ev, 'preventDefault');
    document.dispatchEvent(ev);
    expect(pd).toHaveBeenCalled();
  });

  it('double-tap < 350ms → preventDefault (anti-zoom)', () => {
    antiZoomIOS.install();
    const ev1 = new Event('touchend', { cancelable: true });
    document.dispatchEvent(ev1);

    /* 2e tap 100ms après → bloqué */
    vi.advanceTimersByTime(100);
    const ev2 = new Event('touchend', { cancelable: true });
    const pd = vi.spyOn(ev2, 'preventDefault');
    document.dispatchEvent(ev2);
    expect(pd).toHaveBeenCalled();
  });

  it('touchend espacés > 350ms → pas de preventDefault', () => {
    antiZoomIOS.install();
    const ev1 = new Event('touchend', { cancelable: true });
    document.dispatchEvent(ev1);

    vi.advanceTimersByTime(400);
    const ev2 = new Event('touchend', { cancelable: true });
    const pd = vi.spyOn(ev2, 'preventDefault');
    document.dispatchEvent(ev2);
    expect(pd).not.toHaveBeenCalled();
  });
});

describe('anti-zoom-ios — reset zoom programmatique', () => {
  it('visualViewport.scale > 1.01 → modifie meta viewport', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', 'width=device-width');
    document.head.appendChild(meta);

    vi.stubGlobal('visualViewport', { scale: 1.5 });

    antiZoomIOS.install();
    /* install() appelle checkAndResetZoom() immédiatement */
    expect(meta.getAttribute('content')).toContain('maximum-scale=1');
  });

  it('visualViewport.scale = 1 → meta viewport inchangé', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    const original = 'width=device-width,initial-scale=1';
    meta.setAttribute('content', original);
    document.head.appendChild(meta);

    vi.stubGlobal('visualViewport', { scale: 1 });

    antiZoomIOS.install();
    expect(meta.getAttribute('content')).toBe(original);
  });

  it('pas de visualViewport → no-op gracieux', () => {
    vi.stubGlobal('visualViewport', undefined);
    expect(() => antiZoomIOS.install()).not.toThrow();
  });

  it('scale > 1.01 + pas de meta viewport → ne throw pas', () => {
    vi.stubGlobal('visualViewport', { scale: 2 });
    expect(() => antiZoomIOS.install()).not.toThrow();
  });

  it('checkInterval périodique 1s', () => {
    vi.stubGlobal('visualViewport', { scale: 1 });
    antiZoomIOS.install();
    /* Avance 2s → tick au moins 1× */
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});

describe('anti-zoom-ios — uninstall', () => {
  it('uninstall reset état installed (peut reinstall)', () => {
    antiZoomIOS.install();
    antiZoomIOS.uninstall();
    /* Si état pas reset, ce 2nd install() serait no-op */
    const spy = vi.spyOn(document, 'addEventListener');
    antiZoomIOS.install();
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });

  it('uninstall sans install préalable ne throw pas', () => {
    expect(() => antiZoomIOS.uninstall()).not.toThrow();
  });
});
