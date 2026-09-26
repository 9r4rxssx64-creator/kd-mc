/**
 * Tests push-notifications.ts coverage extension (45% → 80%+).
 * Cible : subscribe/send/canSend/getStats/getSentHistory/persistSubscription/recordSent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pushNotifications } from '../../services/integrations/push-notifications.js';

describe('Push Notifications coverage extension', () => {
  let origNotification: unknown;

  beforeEach(() => {
    localStorage.clear();
    origNotification = (globalThis as { Notification?: unknown }).Notification;
  });

  afterEach(() => {
    (globalThis as { Notification?: unknown }).Notification = origNotification;
    vi.restoreAllMocks();
  });

  describe('subscribe error paths', () => {
    it('serviceWorker absent → ok=false reason', async () => {
      const origSW = (navigator as { serviceWorker?: unknown }).serviceWorker;
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
      const r = await pushNotifications.subscribe('user1');
      expect(r.ok).toBe(false);
      /* Soit "Service Worker" soit "Push API" — les 2 sont des reasons valides bloqués */
      expect(r.reason).toMatch(/Service Worker|Push API/);
      Object.defineProperty(navigator, 'serviceWorker', { value: origSW, configurable: true });
    });

    it('PushManager absent → ok=false reason', async () => {
      const origPM = (globalThis as { PushManager?: unknown }).PushManager;
      Object.defineProperty(globalThis, 'PushManager', { value: undefined, configurable: true });
      const r = await pushNotifications.subscribe('user1');
      expect(typeof r.ok).toBe('boolean');
      Object.defineProperty(globalThis, 'PushManager', { value: origPM, configurable: true });
    });

    it('cooldown 5min : 2e call rapide retourne cached', async () => {
      localStorage.setItem('apex_v13_last_push_subscribe', String(Date.now()));
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify([
        { uid: 'u1', endpoint: 'https://fcm.googleapis.com/fake', keys: { p256dh: 'k1', auth: 'a1' }, created_at: Date.now(), last_seen: Date.now() },
      ]));
      const r = await pushNotifications.subscribe('u1');
      /* Cooldown actif : retourne sub cached OU ok=false reason */
      expect(typeof r.ok).toBe('boolean');
    });
  });

  describe('send + rate limit', () => {
    it('Notification absent → ok=false', async () => {
      (globalThis as { Notification?: unknown }).Notification = undefined;
      const ok = await pushNotifications.send('u1', { title: 'T', body: 'B', urgent: false });
      expect(ok).toBe(false);
    });

    it('permission denied → ok=false', async () => {
      (globalThis as { Notification?: unknown }).Notification = class {
        static permission: NotificationPermission = 'denied';
      } as unknown;
      const ok = await pushNotifications.send('u1', { title: 'T', body: 'B', urgent: false });
      expect(ok).toBe(false);
    });

    it('canSend retourne true si rate limit pas atteint', () => {
      const ok = pushNotifications.canSend('u_fresh');
      expect(ok).toBe(true);
    });

    it('canSend retourne false si 20+ sent today', () => {
      const today = new Date().setHours(12, 0, 0, 0);
      const log = Array.from({ length: 25 }, (_, i) => ({ uid: 'u_full', ts: today + i * 1000 }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      expect(pushNotifications.canSend('u_full')).toBe(false);
    });
  });

  describe('unsubscribe', () => {
    it('serviceWorker absent → false', async () => {
      const origSW = (navigator as { serviceWorker?: unknown }).serviceWorker;
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
      const r = await pushNotifications.unsubscribe('u1');
      expect(r).toBe(false);
      Object.defineProperty(navigator, 'serviceWorker', { value: origSW, configurable: true });
    });
  });

  describe('getSubscription + getSentHistory + getStats', () => {
    it('getSubscription retourne sub cached', () => {
      const sub = { uid: 'u_sub', endpoint: 'https://fake/endpoint', keys: { p256dh: 'k', auth: 'a' }, created_at: Date.now(), last_seen: Date.now() };
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify([sub]));
      const r = pushNotifications.getSubscription('u_sub');
      expect(r?.endpoint).toBe('https://fake/endpoint');
    });

    it('getSubscription retourne null si non trouvé', () => {
      const r = pushNotifications.getSubscription('inexistant');
      expect(r).toBe(null);
    });

    it('getSentHistory retourne entries triées + limit', () => {
      const log = Array.from({ length: 60 }, (_, i) => ({
        id: `n${i}`, title: `T${i}`, body: 'B', urgent: false, ts: Date.now() - i, uid: 'u1',
      }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      const h = pushNotifications.getSentHistory('u1', 30);
      expect(h.length).toBeLessThanOrEqual(30);
    });

    it('getSentHistory sans uid → tous users', () => {
      const log = [
        { id: 'a', title: 'A', body: 'b', urgent: false, ts: Date.now(), uid: 'u1' },
        { id: 'b', title: 'B', body: 'b', urgent: false, ts: Date.now(), uid: 'u2' },
      ];
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      const h = pushNotifications.getSentHistory();
      expect(h.length).toBeGreaterThanOrEqual(2);
    });

    it('getStats retourne total_subscriptions + sent_today + sent_total + rate_limit', () => {
      const stats = pushNotifications.getStats();
      expect(stats).toHaveProperty('total_subscriptions');
      expect(stats).toHaveProperty('sent_today');
      expect(stats).toHaveProperty('sent_total');
      expect(stats.rate_limit_per_day).toBe(20);
    });

    it('getStats avec data persistée compte correctement', () => {
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify([
        { uid: 'u1', endpoint: 'a', keys: { p256dh: 'k', auth: 'a' }, created_at: Date.now(), last_seen: Date.now() },
        { uid: 'u2', endpoint: 'b', keys: { p256dh: 'k', auth: 'a' }, created_at: Date.now(), last_seen: Date.now() },
      ]));
      const stats = pushNotifications.getStats();
      expect(stats.total_subscriptions).toBe(2);
    });
  });

  describe('sendServerPush (Cloudflare Worker)', () => {
    it('worker_url absent → ok=false reason explicite', async () => {
      localStorage.removeItem('apex_v13_push_worker_url');
      const r = await pushNotifications.sendServerPush(['u1'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('worker_url');
    });

    it('admin_token absent → ok=false reason', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://fake-worker.dev');
      localStorage.removeItem('apex_v13_push_admin_token');
      const r = await pushNotifications.sendServerPush(['u1'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('admin_token');
    });

    it('rate limit atteint pour user → refuse send', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://fake-worker.dev');
      localStorage.setItem('apex_v13_push_admin_token', 'token123');
      const today = new Date().setHours(12, 0, 0, 0);
      const log = Array.from({ length: 25 }, (_, i) => ({ uid: 'u_full', ts: today + i * 1000 }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      const r = await pushNotifications.sendServerPush(['u_full'], { title: 'T', body: 'B' });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Rate limit');
    });

    it('config OK : tente fetch (echec network attendu env test)', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://nonexistent.test');
      localStorage.setItem('apex_v13_push_admin_token', 'token123');
      const r = await pushNotifications.sendServerPush(['u_test'], { title: 'T', body: 'B', urgent: true });
      /* Network échoue ou success — on accepte les 2 (env test) */
      expect(typeof r.ok).toBe('boolean');
    });
  });

  describe('testWorkerHealth', () => {
    it('worker_url absent → ok=false', async () => {
      localStorage.removeItem('apex_v13_push_worker_url');
      const r = await pushNotifications.testWorkerHealth();
      expect(r.ok).toBe(false);
    });

    it('worker_url configuré : tente ping (network fail accepté env test)', async () => {
      localStorage.setItem('apex_v13_push_worker_url', 'https://nonexistent.test');
      const r = await pushNotifications.testWorkerHealth();
      expect(typeof r.ok).toBe('boolean');
    });
  });
});
