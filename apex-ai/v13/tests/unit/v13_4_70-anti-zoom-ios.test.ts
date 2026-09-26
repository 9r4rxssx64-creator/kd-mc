/**
 * Test régression v13.4.70 — services/anti-zoom-ios.ts.
 *
 * Triple protection anti-zoom iPhone PWA (Kevin "Toujours en zoom" v13.4.46).
 * Critique UX iOS Safari : gesturestart bloqué, multi-touch bloqué, double-tap bloqué.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { antiZoomIOS } from '../../services/core-svc/anti-zoom-ios.js';

describe('v13.4.70 anti-zoom-ios — checkAndResetZoom (campagne 100%)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.querySelector('meta[name="viewport"]')?.remove(); });

  it('zoom détecté (scale>1.01) + meta sans content → reset (branches 69 & 78 ??)', () => {
    vi.stubGlobal('visualViewport', { scale: 1.5 });
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport'); // PAS de content → getAttribute(content) ?? ''
    document.head.appendChild(meta);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    (antiZoomIOS as unknown as { checkAndResetZoom(): void }).checkAndResetZoom();
    expect(meta.getAttribute('content')).toContain('maximum-scale=1');
  });

  it('scale présent mais ≤ 1.01 → pas de reset (branche `> 1.01` false 69:39)', () => {
    vi.stubGlobal('visualViewport', { scale: 1.0 });
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', 'origform');
    document.head.appendChild(meta);
    (antiZoomIOS as unknown as { checkAndResetZoom(): void }).checkAndResetZoom();
    expect(meta.getAttribute('content')).toBe('origform'); // inchangé (pas de zoom)
  });

  it('vv.scale falsy (0) → court-circuit `vv.scale &&` (branche 69:39)', () => {
    vi.stubGlobal('visualViewport', { scale: 0 });
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport'); meta.setAttribute('content', 'keepme');
    document.head.appendChild(meta);
    (antiZoomIOS as unknown as { checkAndResetZoom(): void }).checkAndResetZoom();
    expect(meta.getAttribute('content')).toBe('keepme');
  });
});

describe('v13.4.70 anti-zoom-ios — API publique', () => {
  afterEach(() => {
    antiZoomIOS.uninstall();
  });

  it("singleton défini avec méthodes attendues", () => {
    expect(antiZoomIOS).toBeDefined();
    expect(typeof antiZoomIOS.install).toBe('function');
    expect(typeof antiZoomIOS.uninstall).toBe('function');
  });

  it("install() idempotent (multi-call sans throw)", () => {
    expect(() => {
      antiZoomIOS.install();
      antiZoomIOS.install();
      antiZoomIOS.install();
    }).not.toThrow();
  });

  it("uninstall() idempotent (multi-call sans throw)", () => {
    expect(() => {
      antiZoomIOS.uninstall();
      antiZoomIOS.uninstall();
    }).not.toThrow();
  });

  it("install() + uninstall() ne throw pas", () => {
    expect(() => {
      antiZoomIOS.install();
      antiZoomIOS.uninstall();
    }).not.toThrow();
  });
});

describe('v13.4.70 anti-zoom-ios — listeners installés', () => {
  beforeEach(() => {
    antiZoomIOS.uninstall();
    antiZoomIOS.install();
  });

  afterEach(() => {
    antiZoomIOS.uninstall();
  });

  it("gesturestart dispatch → event.defaultPrevented=true", () => {
    const ev = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("gesturechange dispatch → event.defaultPrevented=true", () => {
    const ev = new Event('gesturechange', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("gestureend dispatch → event.defaultPrevented=true", () => {
    const ev = new Event('gestureend', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("touchstart single-touch → pas preventDefault (UX normale OK)", () => {
    /* Single touch = scroll/tap normal, ne PAS bloquer */
    const ev = new Event('touchstart', { cancelable: true });
    Object.defineProperty(ev, 'touches', { value: [{}] }); /* 1 touch */
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("touchstart multi-touch (pinch) → preventDefault", () => {
    const ev = new Event('touchstart', { cancelable: true });
    Object.defineProperty(ev, 'touches', { value: [{}, {}] }); /* 2 touches = pinch */
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("touchend single (espacé > 350ms) → pas preventDefault", () => {
    /* Premier touchend pose lastTouchEnd, second très tardif ne déclenche pas double-tap */
    const ev1 = new Event('touchend', { cancelable: true });
    document.dispatchEvent(ev1);
    /* Pas de wait simulé, on teste juste qu'un seul touchend ne preventDefault pas */
    expect(ev1.defaultPrevented).toBe(false);
  });

  it("touchend rapide consécutif < 350ms (double-tap) → preventDefault sur le 2e", () => {
    const ev1 = new Event('touchend', { cancelable: true });
    document.dispatchEvent(ev1);
    /* 2e touchend immédiat = double-tap-zoom iOS */
    const ev2 = new Event('touchend', { cancelable: true });
    document.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);
  });
});
