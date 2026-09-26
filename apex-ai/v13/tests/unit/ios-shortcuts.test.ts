/**
 * APEX v13.3.58 — Tests iOS Shortcuts service (Kevin 2026-05-08).
 *
 * Couvre :
 * - isAvailable() détecte iOS via UA
 * - list / get / byCategory
 * - run() refuse si pas iOS
 * - run() refuse name invalide
 * - run() construit l'URL shortcuts:// correctement
 * - run() awaitResult timeout retourne reason='timeout'
 * - markInstalled / getInstallStatus
 * - getInstallDocs retourne steps
 * - helpers tvOn/tvOff/scanBluetooth/etc.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { iosShortcuts } from '../../services/integrations/ios-shortcuts.js';

const ORIG_UA = navigator.userAgent;

function mockUA(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    writable: true,
    configurable: true,
  });
}

function mockMaxTouchPoints(n: number): void {
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: n,
    writable: true,
    configurable: true,
  });
}

describe('ios-shortcuts — Apple Shortcuts integration', () => {
  beforeEach(() => {
    /* Mock window.location.assign pour intercepter shortcuts:// URL */
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'location', {
        value: {
          assign: vi.fn(),
          hash: '',
          origin: 'https://test.local',
          pathname: '/apex/',
        },
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    mockUA(ORIG_UA);
    mockMaxTouchPoints(0);
    vi.restoreAllMocks();
  });

  describe('isAvailable()', () => {
    it('retourne true sur iPhone Safari', () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      expect(iosShortcuts.isAvailable()).toBe(true);
    });

    it('retourne true sur iPad', () => {
      mockUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
      expect(iosShortcuts.isAvailable()).toBe(true);
    });

    it('retourne true sur iPadOS desktop UA + maxTouchPoints', () => {
      mockUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
      mockMaxTouchPoints(5);
      expect(iosShortcuts.isAvailable()).toBe(true);
    });

    it('retourne false sur Mac Safari (pas touch)', () => {
      mockUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
      mockMaxTouchPoints(0);
      expect(iosShortcuts.isAvailable()).toBe(false);
    });

    it('retourne false sur Chrome Linux', () => {
      mockUA('Mozilla/5.0 (X11; Linux x86_64) Chrome/118');
      mockMaxTouchPoints(0);
      expect(iosShortcuts.isAvailable()).toBe(false);
    });
  });

  describe('list / get / byCategory', () => {
    it('retourne tous les shortcuts pré-définis', () => {
      const all = iosShortcuts.list();
      expect(all.length).toBeGreaterThanOrEqual(8);
      expect(all.find((s) => s.name === 'apex_tv_on')).toBeDefined();
      expect(all.find((s) => s.name === 'apex_bt_scan')).toBeDefined();
    });

    it('get() retourne définition complète', () => {
      const tv = iosShortcuts.get('apex_tv_on');
      expect(tv).toBeDefined();
      expect(tv?.label).toBe('Allumer TV');
      expect(tv?.category).toBe('tv');
    });

    it('get() retourne null pour name inconnu', () => {
      const x = iosShortcuts.get('apex_unknown' as never);
      expect(x).toBeNull();
    });

    it('byCategory() filtre correctement', () => {
      const tv = iosShortcuts.byCategory('tv');
      expect(tv.length).toBeGreaterThan(0);
      for (const s of tv) expect(s.category).toBe('tv');
    });
  });

  describe('run()', () => {
    it('refuse si pas iOS', async () => {
      mockUA('Mozilla/5.0 (X11; Linux x86_64) Chrome/118');
      mockMaxTouchPoints(0);
      const r = await iosShortcuts.run('apex_tv_on');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('not_ios');
    });

    it('refuse name invalide', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      const r = await iosShortcuts.run('apex_xxx' as never);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('invalid_name');
    });

    it('lance URL shortcuts:// avec name + input', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      const assignSpy = vi.spyOn(window.location, 'assign');
      const r = await iosShortcuts.run('apex_lights_on', { input: 'salon' });
      expect(r.ok).toBe(true);
      expect(r.launched).toBe(true);
      expect(assignSpy).toHaveBeenCalled();
      const url = assignSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('shortcuts://run-shortcut');
      expect(url).toContain('name=apex_lights_on');
      expect(url).toContain('input=salon');
    });

    it('awaitResult timeout retourne reason=timeout', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      const r = await iosShortcuts.run('apex_battery', { awaitResult: true, timeoutMs: 100 });
      expect(r.ok).toBe(false);
      expect(r.launched).toBe(true);
      expect(r.reason).toBe('timeout');
    });
  });

  describe('helpers ergonomiques', () => {
    beforeEach(() => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    });

    it('tvOn() lance apex_tv_on', async () => {
      const assignSpy = vi.spyOn(window.location, 'assign');
      await iosShortcuts.tvOn();
      expect(assignSpy).toHaveBeenCalled();
      expect(assignSpy.mock.calls[0]?.[0]).toContain('name=apex_tv_on');
    });

    it('lightsOff(scene) passe scene en input', async () => {
      const assignSpy = vi.spyOn(window.location, 'assign');
      await iosShortcuts.lightsOff('cuisine');
      expect(assignSpy).toHaveBeenCalled();
      const url = assignSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('input=cuisine');
    });

    it('playMusic(query) passe query en input', async () => {
      const assignSpy = vi.spyOn(window.location, 'assign');
      await iosShortcuts.playMusic('Imagine Dragons');
      expect(assignSpy).toHaveBeenCalled();
      const url = assignSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('input=Imagine');
    });

    it('vibrate() lance apex_vibrate sans awaitResult', async () => {
      const assignSpy = vi.spyOn(window.location, 'assign');
      const r = await iosShortcuts.vibrate();
      expect(r.ok).toBe(true);
      expect(assignSpy.mock.calls[0]?.[0]).toContain('apex_vibrate');
    });
  });

  describe('markInstalled / getInstallStatus', () => {
    it('persiste status installé', () => {
      iosShortcuts.markInstalled('apex_tv_on', true);
      const status = iosShortcuts.getInstallStatus();
      expect(status.apex_tv_on).toBe(true);
    });

    it('retourne map complète avec defaults false', () => {
      const status = iosShortcuts.getInstallStatus();
      expect(status.apex_bt_scan).toBe(false);
      expect(status.apex_tv_on).toBe(false);
    });

    it('peut désactiver', () => {
      iosShortcuts.markInstalled('apex_tv_on', true);
      iosShortcuts.markInstalled('apex_tv_on', false);
      const status = iosShortcuts.getInstallStatus();
      expect(status.apex_tv_on).toBe(false);
    });
  });

  describe('getInstallDocs', () => {
    it('retourne instructions step-by-step', () => {
      const docs = iosShortcuts.getInstallDocs('apex_tv_on');
      expect(docs).toBeDefined();
      expect(docs?.title).toContain('Allumer TV');
      expect(docs?.steps.length).toBeGreaterThanOrEqual(5);
      expect(docs?.iosVersion).toContain('iOS');
    });

    it('retourne null pour name invalide', () => {
      const docs = iosShortcuts.getInstallDocs('apex_xxx' as never);
      expect(docs).toBeNull();
    });

    it('docs returnsResult ajoute callback step', () => {
      const docs = iosShortcuts.getInstallDocs('apex_battery');
      expect(docs).toBeDefined();
      const stepsJoined = docs!.steps.join(' ');
      expect(stepsJoined).toContain('apex-ios-callback');
    });
  });
});
