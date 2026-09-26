/**
 * Tests services/cloudflare-status (Kevin v13.4.198 "100/100 réel partout").
 *
 * Couvre 3 méthodes publiques + flow showBanner/hideBanner/isRecentlyDown :
 * - recordHttp503 : store ts + show banner
 * - recordHttpOk : remove ts + hide banner
 * - init : restore banner si ts récent (< 5 min)
 * - banner DOM + a11y (role=status, aria-live=polite)
 * - banner click → open status page (mocked)
 * - banner button × → hide
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cloudflareStatus, recordHttp503, recordHttpOk, init } from '../../services/observability/cloudflare-status.js';

const BANNER_ID = 'apex-cloudflare-infra-banner';
const KEY = 'apex_v13_last_cloudflare_503_ts';

describe('services/cloudflare-status', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset module state (singleton _banner ref) avant chaque test */
    recordHttpOk();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    recordHttpOk();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  describe('recordHttp503', () => {
    it('stocke timestamp dans localStorage', () => {
      const before = Date.now();
      recordHttp503();
      const stored = parseInt(localStorage.getItem(KEY) ?? '0', 10);
      expect(stored).toBeGreaterThanOrEqual(before);
    });

    it('show banner avec attributs a11y', () => {
      recordHttp503();
      const banner = document.getElementById(BANNER_ID);
      expect(banner).not.toBeNull();
      expect(banner?.getAttribute('role')).toBe('status');
      expect(banner?.getAttribute('aria-live')).toBe('polite');
    });

    it('banner contient le message Cloudflare', () => {
      recordHttp503();
      const banner = document.getElementById(BANNER_ID);
      expect(banner?.innerHTML).toContain('Cloudflare ralenti');
      expect(banner?.innerHTML).toContain('pas ta clé');
    });

    it('idempotent : 2 appels = 1 seul banner DOM', () => {
      recordHttp503();
      recordHttp503();
      expect(document.querySelectorAll(`#${BANNER_ID}`)).toHaveLength(1);
    });
  });

  describe('recordHttpOk', () => {
    it('supprime timestamp localStorage', () => {
      recordHttp503();
      expect(localStorage.getItem(KEY)).not.toBeNull();
      recordHttpOk();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('cache le banner', () => {
      recordHttp503();
      expect(document.getElementById(BANNER_ID)).not.toBeNull();
      recordHttpOk();
      expect(document.getElementById(BANNER_ID)).toBeNull();
    });

    it('no-op si banner déjà caché (pas de throw)', () => {
      expect(() => recordHttpOk()).not.toThrow();
    });
  });

  describe('init', () => {
    it('show banner si ts récent (< 5 min)', () => {
      localStorage.setItem(KEY, String(Date.now() - 60_000)); /* 1 min ago */
      init();
      expect(document.getElementById(BANNER_ID)).not.toBeNull();
    });

    it('ne show PAS si ts ancien (> 5 min)', () => {
      localStorage.setItem(KEY, String(Date.now() - 10 * 60_000)); /* 10 min ago */
      init();
      expect(document.getElementById(BANNER_ID)).toBeNull();
    });

    it('ne show PAS si pas de ts', () => {
      init();
      expect(document.getElementById(BANNER_ID)).toBeNull();
    });

    it('ne show PAS si ts = 0', () => {
      localStorage.setItem(KEY, '0');
      init();
      expect(document.getElementById(BANNER_ID)).toBeNull();
    });

    it('résilient à localStorage parse error', () => {
      localStorage.setItem(KEY, 'invalid-number');
      expect(() => init()).not.toThrow();
      expect(document.getElementById(BANNER_ID)).toBeNull();
    });
  });

  describe('banner interactions', () => {
    it('click sur button × → hide banner', () => {
      recordHttp503();
      const banner = document.getElementById(BANNER_ID);
      const closeBtn = banner?.querySelector<HTMLButtonElement>('button');
      expect(closeBtn).not.toBeNull();
      closeBtn?.click();
      expect(document.getElementById(BANNER_ID)).toBeNull();
    });

    it('click sur backdrop → open status page', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      recordHttp503();
      const banner = document.getElementById(BANNER_ID);
      /* Click sur backdrop direct (pas le button) */
      banner?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(openSpy).toHaveBeenCalledWith(
        'https://www.cloudflarestatus.com/',
        '_blank',
        'noopener',
      );
      openSpy.mockRestore();
    });
  });

  describe('cloudflareStatus namespace', () => {
    it('expose les 3 méthodes', () => {
      expect(cloudflareStatus.recordHttp503).toBeDefined();
      expect(cloudflareStatus.recordHttpOk).toBeDefined();
      expect(cloudflareStatus.init).toBeDefined();
    });
  });

  describe('branches restantes (campagne 100%)', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('recordHttp503 : setItem throw → catch quota (41)', () => {
      vi.stubGlobal('localStorage', {
        setItem: () => { throw new Error('quota'); }, getItem: () => null, removeItem: () => {}, clear: () => {},
      });
      expect(() => recordHttp503()).not.toThrow();
    });

    it('recordHttpOk : removeItem throw → catch (48)', () => {
      vi.stubGlobal('localStorage', {
        removeItem: () => { throw new Error('quota'); }, getItem: () => null, setItem: () => {}, clear: () => {},
      });
      expect(() => recordHttpOk()).not.toThrow();
    });

    it('init : isRecentlyDown getItem throw → catch false (56)', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => { throw new Error('ls'); }, setItem: () => {}, removeItem: () => {}, clear: () => {},
      });
      expect(() => init()).not.toThrow();
    });

    it('init : valeur stockée récente → isRecentlyDown true + getItem non-null (`?? "0"` côté gauche)', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => String(Date.now()), setItem: () => {}, removeItem: () => {}, clear: () => {},
      });
      expect(() => init()).not.toThrow();
    });

    it('startReprobe : setInterval undefined → guard return (73)', () => {
      /* recordHttp503 → showBanner → startReprobe ; setInterval absent → garde d\'environnement */
      vi.stubGlobal('setInterval', undefined);
      expect(() => recordHttp503()).not.toThrow();
    });
  });
});
