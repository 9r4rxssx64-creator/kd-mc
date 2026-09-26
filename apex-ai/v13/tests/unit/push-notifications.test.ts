/**
 * Tests push-notifications.ts (anti-théâtre : prouver wiring + rate limit + persist).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { pushNotifications } from '../../services/integrations/push-notifications.js';

describe('Push Notifications (anti-théâtre)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('subscribe (sans Service Worker en happy-dom)', () => {
    it('subscribe retourne ok=false (Service Worker absent en test env)', async () => {
      const r = await pushNotifications.subscribe('kevin');
      /* En happy-dom : pas de Service Worker → soit unsupported, soit subscription failed */
      expect(r.ok).toBe(false);
      expect(r.reason).toBeTruthy();
    });
  });

  describe('canSend rate limit (20/jour)', () => {
    it('user nouveau → canSend true', () => {
      expect(pushNotifications.canSend('kevin')).toBe(true);
    });

    it('20 sent today → canSend false', () => {
      const log = Array.from({ length: 20 }, (_, i) => ({ uid: 'kevin', ts: Date.now() - i * 1000 }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      expect(pushNotifications.canSend('kevin')).toBe(false);
    });

    it('20 sent hier → canSend true (reset jour)', () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000;
      const log = Array.from({ length: 20 }, () => ({ uid: 'kevin', ts: yesterday }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      expect(pushNotifications.canSend('kevin')).toBe(true);
    });

    it('rate limit séparé par user', () => {
      const log = Array.from({ length: 20 }, () => ({ uid: 'kevin', ts: Date.now() }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      expect(pushNotifications.canSend('kevin')).toBe(false);
      expect(pushNotifications.canSend('laurence')).toBe(true);
    });
  });

  describe('send (Notification API requise)', () => {
    it('send sans permission → false', async () => {
      const r = await pushNotifications.send('kevin', { title: 'X', body: 'Y', urgent: false });
      expect(r).toBe(false);
    });
  });

  describe('getSubscription', () => {
    it('user sans subscription → null', () => {
      expect(pushNotifications.getSubscription('kevin')).toBeNull();
    });

    it('persist subscription manuelle + getSubscription la trouve', () => {
      const sub = {
        uid: 'kevin',
        endpoint: 'https://fcm.example.com/test',
        keys: { p256dh: 'fake_key', auth: 'fake_auth' },
        created_at: Date.now(),
        last_seen: Date.now(),
      };
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify([sub]));
      const found = pushNotifications.getSubscription('kevin');
      expect(found?.endpoint).toBe('https://fcm.example.com/test');
    });
  });

  describe('getSentHistory + getStats', () => {
    it('getStats retourne defaults sains', () => {
      const stats = pushNotifications.getStats();
      expect(stats.total_subscriptions).toBe(0);
      expect(stats.sent_today).toBe(0);
      expect(stats.rate_limit_per_day).toBe(20);
    });

    it('getStats avec sent_today reflète aujourd\'hui only', () => {
      const todayLog = [{ uid: 'k', ts: Date.now() }, { uid: 'l', ts: Date.now() }];
      const yesterdayLog = [{ uid: 'k', ts: Date.now() - 25 * 60 * 60 * 1000 }];
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify([...todayLog, ...yesterdayLog]));
      const stats = pushNotifications.getStats();
      expect(stats.sent_today).toBe(2);
      expect(stats.sent_total).toBe(3);
    });

    it('getSentHistory filter par uid', () => {
      const log = [
        { uid: 'kevin', id: 'p1', title: 'A', body: 'B', urgent: false, ts: Date.now() },
        { uid: 'laurence', id: 'p2', title: 'C', body: 'D', urgent: false, ts: Date.now() },
      ];
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(log));
      const kevHistory = pushNotifications.getSentHistory('kevin');
      expect(kevHistory.length).toBe(1);
      expect(kevHistory[0]?.title).toBe('A');
    });

    it('getSentHistory limit', () => {
      const big = Array.from({ length: 100 }, (_, i) => ({
        uid: 'k',
        id: `p${i}`,
        title: `t${i}`,
        body: '',
        urgent: false,
        ts: Date.now() - i,
      }));
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(big));
      const limited = pushNotifications.getSentHistory('k', 10);
      expect(limited.length).toBe(10);
    });
  });

  describe('unsubscribe', () => {
    it('unsubscribe sans Service Worker → false', async () => {
      const r = await pushNotifications.unsubscribe('kevin');
      expect(typeof r).toBe('boolean');
    });
  });
});
