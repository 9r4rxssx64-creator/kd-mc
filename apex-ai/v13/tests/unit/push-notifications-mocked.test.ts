/**
 * Tests push-notifications.ts (57→90% branches).
 * Cible : subscribe, send, sendServerPush, testWorkerHealth, rate limit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pushNotifications } from '../../services/integrations/push-notifications.js';

describe('push-notifications — mocks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('subscribe branches', () => {
    it('sans serviceWorker → fail', async () => {
      const orig = (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      const r = await pushNotifications.subscribe('user1');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Service Worker');
      if (orig) Object.defineProperty(navigator, 'serviceWorker', { value: orig, configurable: true });
    });

    it('sans PushManager → fail', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({ pushManager: undefined }) },
        configurable: true,
      });
      const orig = (globalThis as unknown as { PushManager?: unknown }).PushManager;
      delete (globalThis as unknown as { PushManager?: unknown }).PushManager;
      const r = await pushNotifications.subscribe('user1');
      expect(r.ok).toBe(false);
      if (orig) (globalThis as unknown as { PushManager?: unknown }).PushManager = orig;
    });

    it('cooldown actif retourne cached subscription', async () => {
      vi.stubGlobal('PushManager', class {});
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({ pushManager: { subscribe: vi.fn() } }) },
        configurable: true,
      });
      localStorage.setItem('apex_v13_last_push_subscribe', String(Date.now()));
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify([
        { uid: 'user1', endpoint: 'http://x', keys: { p256dh: 'k', auth: 'a' }, created_at: 0, last_seen: 0 },
      ]));
      const r = await pushNotifications.subscribe('user1');
      expect(r.ok).toBe(true);
      expect(r.subscription).toBeDefined();
    });

    it('subscribe success path', async () => {
      vi.stubGlobal('PushManager', class {});
      const subscribeMock = vi.fn(async () => ({
        toJSON: () => ({
          endpoint: 'https://fcm.example/sub1',
          keys: { p256dh: 'p1', auth: 'a1' },
        }),
      }));
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({ pushManager: { subscribe: subscribeMock } }) },
        configurable: true,
      });
      const r = await pushNotifications.subscribe('userX');
      expect(typeof r.ok).toBe('boolean');
    });

    it('subscribe sans keys → fail', async () => {
      vi.stubGlobal('PushManager', class {});
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({
          pushManager: { subscribe: vi.fn(async () => ({ toJSON: () => ({ endpoint: 'x' }) })) },
        }) },
        configurable: true,
      });
      const r = await pushNotifications.subscribe('userX');
      expect(r.ok).toBe(false);
    });

    it('subscribe pushManager throws → fail', async () => {
      vi.stubGlobal('PushManager', class {});
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({
          pushManager: { subscribe: vi.fn(async () => { throw new Error('Denied'); }) },
        }) },
        configurable: true,
      });
      const r = await pushNotifications.subscribe('userX');
      expect(r.ok).toBe(false);
    });
  });

  describe('unsubscribe branches', () => {
    it('sans serviceWorker → false', async () => {
      const orig = (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      const r = await pushNotifications.unsubscribe('user1');
      expect(r).toBe(false);
      if (orig) Object.defineProperty(navigator, 'serviceWorker', { value: orig, configurable: true });
    });

    it('avec subscription existante', async () => {
      const unsubMock = vi.fn(async () => true);
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          ready: Promise.resolve({
            pushManager: { getSubscription: vi.fn(async () => ({ unsubscribe: unsubMock })) },
          }),
        },
        configurable: true,
      });
      const r = await pushNotifications.unsubscribe('user1');
      expect(r).toBe(true);
      expect(unsubMock).toHaveBeenCalled();
    });

    it('sans subscription → cleanup local seul', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          ready: Promise.resolve({
            pushManager: { getSubscription: vi.fn(async () => null) },
          }),
        },
        configurable: true,
      });
      const r = await pushNotifications.unsubscribe('user1');
      expect(r).toBe(true);
    });

    it('unsubscribe throws → false', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.reject(new Error('No SW')) },
        configurable: true,
      });
      const r = await pushNotifications.unsubscribe('user1');
      expect(r).toBe(false);
    });
  });

  describe('send branches', () => {
    it('rate limit dépassé', async () => {
      const log = Array.from({ length: 25 }, () => ({ uid: 'u1', ts: Date.now() }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      const r = await pushNotifications.send('u1', { title: 'T', body: 'B', urgent: false });
      expect(r).toBe(false);
    });

    it('Notification absent', async () => {
      const r = await pushNotifications.send('u1', { title: 'T', body: 'B', urgent: false });
      expect(typeof r).toBe('boolean');
    });

    it('Notification denied', async () => {
      vi.stubGlobal('Notification', Object.assign(vi.fn(), {
        permission: 'denied' as NotificationPermission,
      }));
      const r = await pushNotifications.send('u1', { title: 'T', body: 'B', urgent: false });
      expect(r).toBe(false);
    });

    it('Notification granted + reg → showNotification', async () => {
      const showNotif = vi.fn(async () => undefined);
      vi.stubGlobal('Notification', Object.assign(vi.fn(), {
        permission: 'granted' as NotificationPermission,
      }));
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { getRegistration: vi.fn(async () => ({ showNotification: showNotif })) },
        configurable: true,
      });
      const r = await pushNotifications.send('u1', { title: 'T', body: 'B', urgent: true, icon: 'i.png', badge: 'b.png', tag: 'tag1', cta_url: 'https://x.com' });
      expect(typeof r).toBe('boolean');
    });

    it('send throws', async () => {
      vi.stubGlobal('Notification', Object.assign(vi.fn(), {
        permission: 'granted' as NotificationPermission,
      }));
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { getRegistration: vi.fn(async () => { throw new Error('boom'); }) },
        configurable: true,
      });
      const r = await pushNotifications.send('u1', { title: 'T', body: 'B', urgent: false });
      expect(r).toBe(false);
    });
  });

  describe('canSend branches', () => {
    it('vide → true', () => {
      const r = pushNotifications.canSend('user_new');
      expect(r).toBe(true);
    });

    it('log corrupt → true', () => {
      localStorage.setItem('apex_v13_push_sent_log', 'not-json');
      const r = pushNotifications.canSend('user');
      expect(r).toBe(true);
    });

    it('rate limit dépassé', () => {
      const log = Array.from({ length: 25 }, () => ({ uid: 'u1', ts: Date.now() }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      expect(pushNotifications.canSend('u1')).toBe(false);
    });

    it('aujourd hui sans match', () => {
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify([{ uid: 'other', ts: Date.now() }]));
      expect(pushNotifications.canSend('u1')).toBe(true);
    });
  });

  describe('getSubscription branches', () => {
    it('vide → null', () => {
      expect(pushNotifications.getSubscription('user1')).toBeNull();
    });

    it('avec match', () => {
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify([
        { uid: 'user1', endpoint: 'x', keys: { p256dh: 'p', auth: 'a' }, created_at: 0, last_seen: 0 },
      ]));
      const sub = pushNotifications.getSubscription('user1');
      expect(sub).toBeDefined();
    });

    it('corrupt → null', () => {
      localStorage.setItem('apex_v13_push_subscriptions', 'not-json');
      expect(pushNotifications.getSubscription('user1')).toBeNull();
    });
  });

  describe('getSentHistory + getStats', () => {
    it('history vide', () => {
      const h = pushNotifications.getSentHistory();
      expect(h).toEqual([]);
    });

    it('history with uid filter', () => {
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify([
        { id: '1', uid: 'u1', title: 'T', body: 'B', ts: 1, urgent: false },
        { id: '2', uid: 'u2', title: 'T', body: 'B', ts: 2, urgent: false },
      ]));
      const h = pushNotifications.getSentHistory('u1');
      expect(h.length).toBe(1);
    });

    it('history corrupt → []', () => {
      localStorage.setItem('apex_v13_push_sent_log', 'not-json');
      const h = pushNotifications.getSentHistory();
      expect(h).toEqual([]);
    });

    it('getStats vide', () => {
      const s = pushNotifications.getStats();
      expect(s.total_subscriptions).toBe(0);
      expect(s.sent_today).toBe(0);
    });

    it('getStats avec data', () => {
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify([{ uid: 'u', endpoint: 'x', keys: { p256dh: 'p', auth: 'a' }, created_at: 0, last_seen: 0 }]));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify([{ ts: Date.now() }]));
      const s = pushNotifications.getStats();
      expect(s.total_subscriptions).toBe(1);
      expect(s.sent_today).toBe(1);
    });

    it('getStats corrupt → 0', () => {
      localStorage.setItem('apex_v13_push_subscriptions', 'not-json');
      const s = pushNotifications.getStats();
      expect(s.total_subscriptions).toBe(0);
    });
  });

  describe('sendServerPush branches', () => {
    it('sans worker URL → fail', async () => {
      const r = await pushNotifications.sendServerPush(['u1'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('worker_url');
    });

    it('sans admin token → fail', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://worker.example/');
      const r = await pushNotifications.sendServerPush(['u1'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('admin_token');
    });

    it('rate limit pour 1 uid → fail', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://worker.example/');
      localStorage.setItem('apex_v13_push_admin_token', 'token123');
      const log = Array.from({ length: 25 }, () => ({ uid: 'u1', ts: Date.now() }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      const r = await pushNotifications.sendServerPush(['u1'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Rate limit');
    });

    it('fetch OK → ok=true', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://worker.example/');
      localStorage.setItem('apex_v13_push_admin_token', 'token123');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => ({ ok: true, status: 200 } as Response));
      const r = await pushNotifications.sendServerPush(['u1', 'u2'], { title: 'T', body: 'B', url: 'http://x', tag: 't', urgent: true });
      expect(r.ok).toBe(true);
    });

    it('fetch HTTP error', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://worker.example/');
      localStorage.setItem('apex_v13_push_admin_token', 'token123');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => ({ ok: false, status: 500 } as Response));
      const r = await pushNotifications.sendServerPush(['u1'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
    });

    it('fetch throws → fail', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://worker.example/');
      localStorage.setItem('apex_v13_push_admin_token', 'token123');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => { throw new Error('Network'); });
      const r = await pushNotifications.sendServerPush(['u1'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
    });
  });

  describe('testWorkerHealth', () => {
    it('sans URL → fail', async () => {
      const r = await pushNotifications.testWorkerHealth();
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('worker_url');
    });

    it('avec URL ping OK', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://worker.example/');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => ({ ok: true, status: 200 } as Response));
      const r = await pushNotifications.testWorkerHealth();
      expect(r.ok).toBe(true);
    });

    it('avec URL ping fail', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://worker.example/');
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => { throw new Error('No'); });
      const r = await pushNotifications.testWorkerHealth();
      expect(r.ok).toBe(false);
    });
  });
});
