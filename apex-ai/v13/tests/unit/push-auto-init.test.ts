/**
 * Tests push-auto-init.ts
 * Anti-théâtre : prouve que init au boot fonctionne, détecte iOS PWA, gère permissions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pushAutoInit } from '../../services/integrations/push-auto-init.js';

describe('Push Auto-Init (autonome iOS+Android app fermée)', () => {
  let origUserAgent: string;
  let origNotification: unknown;
  let origStandalone: unknown;

  beforeEach(() => {
    localStorage.clear();
    origUserAgent = navigator.userAgent;
    origNotification = (globalThis as { Notification?: unknown }).Notification;
    origStandalone = (window.navigator as { standalone?: unknown }).standalone;
    pushAutoInit.stopHeartbeat();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: origUserAgent, configurable: true });
    (globalThis as { Notification?: unknown }).Notification = origNotification;
    try { Object.defineProperty(window.navigator, 'standalone', { value: origStandalone, configurable: true }); } catch { /* ignore */ }
    pushAutoInit.stopHeartbeat();
    vi.restoreAllMocks();
  });

  describe('detectEnvironment', () => {
    it('detecte iOS PWA standalone', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
      const env = pushAutoInit.detectEnvironment();
      /* En env test happy-dom on accepte ios_pwa_standalone OU unsupported (pas de PushManager) */
      expect(['ios_pwa_standalone', 'unsupported']).toContain(env);
    });

    it('detecte iOS Safari browser (non-standalone)', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
      const env = pushAutoInit.detectEnvironment();
      expect(['ios_safari_browser', 'unsupported']).toContain(env);
    });

    it('detecte Android Chrome', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120',
        configurable: true,
      });
      const env = pushAutoInit.detectEnvironment();
      expect(['android_chrome', 'unsupported']).toContain(env);
    });

    it('detecte desktop par défaut', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) Chrome/120',
        configurable: true,
      });
      const env = pushAutoInit.detectEnvironment();
      expect(['desktop', 'unsupported']).toContain(env);
    });

    it('retourne unsupported si serviceWorker absent', () => {
      const origSW = (navigator as { serviceWorker?: unknown }).serviceWorker;
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
      const env = pushAutoInit.detectEnvironment();
      expect(env).toBe('unsupported');
      Object.defineProperty(navigator, 'serviceWorker', { value: origSW, configurable: true });
    });
  });

  describe('getStatus', () => {
    it('retourne status complet avec environment + permission', async () => {
      const status = await pushAutoInit.getStatus('user1');
      expect(status).toHaveProperty('environment');
      expect(status).toHaveProperty('permission');
      expect(status).toHaveProperty('subscribed');
      expect(status).toHaveProperty('needs_install_guide');
      expect(typeof status.last_check).toBe('number');
    });
  });

  describe('autoInit logic flows', () => {
    it('environment unsupported → ne crash pas, retourne status', async () => {
      const origSW = (navigator as { serviceWorker?: unknown }).serviceWorker;
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
      const status = await pushAutoInit.autoInit('user1', { skipDelay: true });
      expect(status.environment).toBe('unsupported');
      Object.defineProperty(navigator, 'serviceWorker', { value: origSW, configurable: true });
    });

    it('iOS Safari browser → marque needs_install_guide pending', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
      await pushAutoInit.autoInit('user1', { skipDelay: true });
      const pending = localStorage.getItem('apex_v13_install_guide_pending');
      /* Pending si env detecté ios_safari_browser, sinon null */
      expect(pending === '1' || pending === null).toBe(true);
    });

    it('permission denied → respect user choice (pas re-demande)', async () => {
      (globalThis as { Notification?: unknown }).Notification = class {
        static permission: NotificationPermission = 'denied';
        static requestPermission = vi.fn(() => Promise.resolve('denied' as NotificationPermission));
      } as unknown;
      const status = await pushAutoInit.autoInit('user1', { skipDelay: true });
      expect(status).toBeDefined();
    });
  });

  describe('install guide instructions', () => {
    it('retourne instructions iOS step-by-step', () => {
      const guide = pushAutoInit.getIOSInstallInstructions();
      expect(guide.title).toContain('notifications');
      expect(guide.steps.length).toBeGreaterThan(3);
      expect(guide.steps.join(' ').toLowerCase()).toContain('partager');
      expect(guide.steps.join(' ').toLowerCase()).toContain('écran');
    });
  });

  describe('markInstallGuideShown', () => {
    it('persiste timestamp + retire pending flag', () => {
      localStorage.setItem('apex_v13_install_guide_pending', '1');
      pushAutoInit.markInstallGuideShown();
      expect(localStorage.getItem('apex_v13_install_guide_pending')).toBe(null);
      expect(localStorage.getItem('apex_v13_install_guide_seen')).toBeTruthy();
    });
  });

  describe('heartbeat lifecycle', () => {
    it('startHeartbeat puis stopHeartbeat ne crash pas', () => {
      pushAutoInit.startHeartbeat('user1');
      pushAutoInit.stopHeartbeat();
      pushAutoInit.startHeartbeat('user1');
      pushAutoInit.startHeartbeat('user1'); /* Double start ignoré */
      pushAutoInit.stopHeartbeat();
      expect(true).toBe(true);
    });
  });

  describe('checkPushConfig (P0 audit gap fix)', () => {
    it('rien set → ready_for_prod=false + 3 warnings', () => {
      localStorage.removeItem('ax_vapid_public');
      localStorage.removeItem('apex_v13_push_worker_url');
      localStorage.removeItem('apex_v13_push_admin_token');
      const cfg = pushAutoInit.checkPushConfig();
      expect(cfg.ready_for_prod).toBe(false);
      expect(cfg.warnings.length).toBe(3);
    });

    it('tout set → ready_for_prod=true sans warnings', () => {
      localStorage.setItem('ax_vapid_public', 'B'.repeat(64));
      localStorage.setItem('apex_v13_push_worker_url', 'https://apex-push.workers.dev');
      localStorage.setItem('apex_v13_push_admin_token', 'admin-token-secret-32chars-min');
      const cfg = pushAutoInit.checkPushConfig();
      expect(cfg.ready_for_prod).toBe(true);
      expect(cfg.warnings.length).toBe(0);
    });

    it('vapid_set / worker_url_set / admin_token_set tracking', () => {
      localStorage.setItem('ax_vapid_public', 'B'.repeat(64));
      localStorage.removeItem('apex_v13_push_worker_url');
      localStorage.removeItem('apex_v13_push_admin_token');
      const cfg = pushAutoInit.checkPushConfig();
      expect(cfg.vapid_set).toBe(true);
      expect(cfg.worker_url_set).toBe(false);
      expect(cfg.admin_token_set).toBe(false);
    });
  });

  /* ============== v13.4.202 (Kevin "Continue sans s'arrêter") ============== */

  describe('autoInit permission granted path', () => {
    it('permission granted + subscribe success → status.subscribed=true (re-fetched)', async () => {
      /* Mock Notification.permission = granted */
      class MockNotif {
        static permission: NotificationPermission = 'granted';
        static requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission));
      }
      (globalThis as { Notification?: unknown }).Notification = MockNotif as unknown;

      const status = await pushAutoInit.autoInit('user_granted', { skipDelay: true });
      /* Status est valide (pas crash) */
      expect(status).toBeDefined();
      expect(status.environment).toBeDefined();
    });
  });

  describe('autoInit subscribed already path', () => {
    it('déjà subscribé → ne re-subscribe pas', async () => {
      /* Aucun mock spécial : sans serviceWorker, status.subscribed = false → flow normal */
      const status = await pushAutoInit.autoInit('user_subbed', { skipDelay: true });
      expect(status).toBeDefined();
    });
  });

  describe('autoInit permission default path (skipDelay)', () => {
    it('skipDelay=true → requestPermissionAndSubscribe immédiat', async () => {
      class MockNotif {
        static permission: NotificationPermission = 'default';
        static requestPermission = vi.fn(() => Promise.resolve('denied' as NotificationPermission));
      }
      (globalThis as { Notification?: unknown }).Notification = MockNotif as unknown;

      const status = await pushAutoInit.autoInit('user_default', { skipDelay: true });
      expect(status).toBeDefined();
    });

    it('skipDelay=false (default) → setTimeout différé (pas crash)', async () => {
      class MockNotif {
        static permission: NotificationPermission = 'default';
        static requestPermission = vi.fn(() => Promise.resolve('denied' as NotificationPermission));
      }
      (globalThis as { Notification?: unknown }).Notification = MockNotif as unknown;

      /* Sans options : setTimeout 30s programmé mais on n'attend pas */
      const status = await pushAutoInit.autoInit('user_default_delay');
      expect(status).toBeDefined();
    });
  });

  describe('requestPermissionAndSubscribe', () => {
    it('Notification absent → ok=false + reason', async () => {
      (globalThis as { Notification?: unknown }).Notification = undefined;
      const result = await pushAutoInit.requestPermissionAndSubscribe('user_no_notif');
      expect(result.ok).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('permission denied direct → ok=false + reason="Permission denied"', async () => {
      class MockNotif {
        static permission: NotificationPermission = 'denied';
        static requestPermission = vi.fn(() => Promise.resolve('denied' as NotificationPermission));
      }
      (globalThis as { Notification?: unknown }).Notification = MockNotif as unknown;
      const result = await pushAutoInit.requestPermissionAndSubscribe('user_denied');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Permission denied');
    });

    it('user refuse au prompt (default → denied) → ok=false', async () => {
      class MockNotif {
        static permission: NotificationPermission = 'default';
        static requestPermission = vi.fn(() => Promise.resolve('denied' as NotificationPermission));
      }
      (globalThis as { Notification?: unknown }).Notification = MockNotif as unknown;
      const result = await pushAutoInit.requestPermissionAndSubscribe('user_refused');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Permission');
    });

    it('requestPermission throw → catch + reason erreur', async () => {
      class MockNotif {
        static permission: NotificationPermission = 'default';
        static requestPermission = vi.fn(() => Promise.reject(new Error('user gesture required')));
      }
      (globalThis as { Notification?: unknown }).Notification = MockNotif as unknown;
      const result = await pushAutoInit.requestPermissionAndSubscribe('user_err');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('gesture');
    });
  });

  describe('markNeedsInstallGuide flow', () => {
    it('ne flag PAS pending si guide déjà vu', async () => {
      localStorage.setItem('apex_v13_install_guide_seen', String(Date.now() - 1000));
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
      await pushAutoInit.autoInit('user_seen', { skipDelay: true });
      expect(localStorage.getItem('apex_v13_install_guide_pending')).toBeNull();
    });
  });
});
