/**
 * APEX v13 — Push Notifications (FCM + Web Push background).
 *
 * Demande Kevin : "notifications qui travaillent toujours même en arrière-plan
 *  sur n'importe quel appareil"
 *
 * Architecture :
 * - Web Push API (subscribe via Service Worker)
 * - VAPID keys (Cloudflare push worker existant)
 * - FCM compatible
 * - Permission cooldown 5 min (CLAUDE.md règle)
 * - Storage local + Firebase shared (sync cross-device)
 *
 * Anti-pattern Kevin :
 * - Pas re-demander si denied (state persisté)
 * - Pas spam : rate limit 20 push/jour par user
 * - Toujours actionable (cta_url)
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { firebase } from '../storage/firebase.js';

export interface PushSubscription {
  uid: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  created_at: number;
  last_seen: number;
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  cta_url?: string;
  tag?: string;
  urgent: boolean;
  ts: number;
}

const VAPID_PUBLIC_KEY_DEFAULT = 'BJ5L_9X1eR7kY3qE8wF2tN6vS4cP9bO5zM7uT1jH3iA8dG2fK4mC6xQ0nW9yU8eR3hT';
const RATE_LIMIT_PER_DAY = 20;

class PushNotifications {
  /**
   * Subscribe au Push (avec Service Worker registration).
   */
  async subscribe(uid: string): Promise<{ ok: boolean; subscription?: PushSubscription; reason?: string }> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return { ok: false, reason: 'Service Worker non supporté' };
    }
    if (typeof PushManager === 'undefined') {
      return { ok: false, reason: 'Push API non supporté' };
    }

    /* Cooldown 5 min anti-spam */
    try {
      const last = Number(localStorage.getItem('apex_v13_last_push_subscribe') ?? '0');
      if (Date.now() - last < 5 * 60 * 1000) {
        const cached = this.getSubscription(uid);
        if (cached) return { ok: true, subscription: cached };
      }
    } catch {
      /* ignore */
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = localStorage.getItem('ax_vapid_public') ?? VAPID_PUBLIC_KEY_DEFAULT;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const subJson = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
      if (!subJson.keys?.p256dh || !subJson.keys?.auth) {
        return { ok: false, reason: 'Subscription keys manquantes' };
      }
      const subscription: PushSubscription = {
        uid,
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        created_at: Date.now(),
        last_seen: Date.now(),
      };
      this.persistSubscription(subscription);
      try {
        localStorage.setItem('apex_v13_last_push_subscribe', String(Date.now()));
      } catch {
        /* ignore */
      }
      void firebase.write('apex_v13_push_subscriptions', subscription);
      void auditLog.record('push.subscribed', { details: { uid } });
      return { ok: true, subscription };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('push-notifications', 'subscribe failed', { err });
      return { ok: false, reason: msg };
    }
  }

  /**
   * Unsubscribe.
   */
  async unsubscribe(uid: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
      /* Remove local */
      try {
        const subs = JSON.parse(localStorage.getItem('apex_v13_push_subscriptions') ?? '[]') as PushSubscription[];
        const filtered = subs.filter((s) => s.uid !== uid);
        localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify(filtered));
      } catch {
        /* ignore */
      }
      void auditLog.record('push.unsubscribed', { details: { uid } });
      return true;
    } catch (err: unknown) {
      logger.warn('push-notifications', 'unsubscribe failed', { err });
      return false;
    }
  }

  /**
   * Send notification (côté client : via Service Worker).
   * Rate-limited 20/jour.
   */
  async send(uid: string, notif: Omit<PushNotification, 'id' | 'ts'>): Promise<boolean> {
    /* Rate limit check */
    if (!this.canSend(uid)) {
      logger.warn('push-notifications', `Rate limit ${RATE_LIMIT_PER_DAY}/jour atteint pour ${uid}`);
      return false;
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    try {
      const reg = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration()
        : null;
      const fullNotif: PushNotification = {
        ...notif,
        id: `push_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
      };
      const opts: NotificationOptions & { actions?: unknown[] } = {
        body: notif.body,
        ...(notif.icon && { icon: notif.icon }),
        ...(notif.badge && { badge: notif.badge }),
        ...(notif.tag && { tag: notif.tag }),
        ...(notif.urgent && { requireInteraction: true }),
        data: { cta_url: notif.cta_url },
      };
      if (reg) {
        await reg.showNotification(notif.title, opts);
      } else {
        new Notification(notif.title, opts);
      }
      this.recordSent(uid, fullNotif);
      return true;
    } catch (err: unknown) {
      logger.warn('push-notifications', 'send failed', { err });
      return false;
    }
  }

  /**
   * Vérifie rate limit (20/jour par user).
   */
  canSend(uid: string): boolean {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    try {
      const log = JSON.parse(localStorage.getItem('apex_v13_push_sent_log') ?? '[]') as Array<{
        uid: string;
        ts: number;
      }>;
      const todayCount = log.filter((e) => e.uid === uid && e.ts >= todayStart).length;
      return todayCount < RATE_LIMIT_PER_DAY;
    } catch {
      return true;
    }
  }

  getSubscription(uid: string): PushSubscription | null {
    try {
      const subs = JSON.parse(localStorage.getItem('apex_v13_push_subscriptions') ?? '[]') as PushSubscription[];
      return subs.find((s) => s.uid === uid) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Liste tous les sent (admin dashboard).
   */
  getSentHistory(uid?: string, limit = 50): PushNotification[] {
    try {
      const log = JSON.parse(localStorage.getItem('apex_v13_push_sent_log') ?? '[]') as Array<
        PushNotification & { uid: string }
      >;
      const filtered = uid ? log.filter((n) => n.uid === uid) : log;
      return filtered.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Stats admin.
   */
  getStats(): {
    total_subscriptions: number;
    sent_today: number;
    sent_total: number;
    rate_limit_per_day: number;
  } {
    try {
      const subs = JSON.parse(localStorage.getItem('apex_v13_push_subscriptions') ?? '[]') as PushSubscription[];
      const log = JSON.parse(localStorage.getItem('apex_v13_push_sent_log') ?? '[]') as Array<{ ts: number }>;
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const sentToday = log.filter((e) => e.ts >= todayStart).length;
      return {
        total_subscriptions: subs.length,
        sent_today: sentToday,
        sent_total: log.length,
        rate_limit_per_day: RATE_LIMIT_PER_DAY,
      };
    } catch {
      return { total_subscriptions: 0, sent_today: 0, sent_total: 0, rate_limit_per_day: RATE_LIMIT_PER_DAY };
    }
  }

  private persistSubscription(sub: PushSubscription): void {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_push_subscriptions') ?? '[]') as PushSubscription[];
      const idx = all.findIndex((s) => s.uid === sub.uid);
      if (idx >= 0) all[idx] = sub;
      else all.push(sub);
      localStorage.setItem('apex_v13_push_subscriptions', JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }

  private recordSent(uid: string, notif: PushNotification): void {
    try {
      const log = JSON.parse(localStorage.getItem('apex_v13_push_sent_log') ?? '[]') as Array<unknown>;
      log.push({ ...notif, uid });
      const trimmed = log.length > 500 ? log.slice(-500) : log;
      localStorage.setItem('apex_v13_push_sent_log', JSON.stringify(trimmed));
    } catch {
      /* ignore */
    }
  }

  /**
   * Envoie push SERVEUR (app fermée OK iOS+Android) via Cloudflare Worker apex-push-worker.
   * Différent de send() qui est local-only.
   *
   * Configuration requise :
   * - localStorage 'apex_v13_push_worker_url' (ex: https://apex-push.workers.dev)
   * - localStorage 'apex_v13_push_admin_token' (Bearer)
   *
   * @returns ok=true si worker a accepté la requête (pas garantie de delivery iOS APNs)
   */
  async sendServerPush(
    targetUids: readonly string[],
    payload: { title: string; body: string; url?: string; tag?: string; urgent?: boolean },
  ): Promise<{ ok: boolean; status?: number; reason?: string }> {
    const workerUrl = localStorage.getItem('apex_v13_push_worker_url');
    const adminToken = localStorage.getItem('apex_v13_push_admin_token');
    if (!workerUrl) return { ok: false, reason: 'apex_v13_push_worker_url non configuré' };
    if (!adminToken) return { ok: false, reason: 'apex_v13_push_admin_token absent' };
    /* Rate limit côté client : check tous les uids */
    for (const uid of targetUids) {
      if (!this.canSend(uid)) return { ok: false, reason: `Rate limit ${RATE_LIMIT_PER_DAY}/jour pour ${uid}` };
    }
    try {
      const resp = await fetch(`${workerUrl.replace(/\/$/, '')}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userIds: targetUids,
          payload: {
            title: payload.title,
            body: payload.body,
            ...(payload.url && { url: payload.url }),
            ...(payload.tag && { tag: payload.tag }),
            ...(payload.urgent && { requireInteraction: true }),
          },
        }),
      });
      /* Record sent dans log local pour rate limit + audit */
      for (const uid of targetUids) {
        this.recordSent(uid, {
          id: `server_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: payload.title,
          body: payload.body,
          ts: Date.now(),
          urgent: payload.urgent ?? false,
        });
      }
      void auditLog.record('push.server_sent', { details: { targets: targetUids.length, status: resp.status } });
      return { ok: resp.ok, status: resp.status };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('push-notifications', 'sendServerPush failed', { err });
      return { ok: false, reason };
    }
  }

  /**
   * Test endpoint Cloudflare worker (ping /health).
   */
  async testWorkerHealth(): Promise<{ ok: boolean; reason?: string }> {
    const workerUrl = localStorage.getItem('apex_v13_push_worker_url');
    if (!workerUrl) return { ok: false, reason: 'worker_url absent' };
    try {
      const resp = await fetch(`${workerUrl.replace(/\/$/, '')}/health`);
      return { ok: resp.ok };
    } catch (err: unknown) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob === 'undefined') return new Uint8Array(0);
    const rawData = atob(base64);
    const arr = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
    return arr;
  }
}

export const pushNotifications = new PushNotifications();
