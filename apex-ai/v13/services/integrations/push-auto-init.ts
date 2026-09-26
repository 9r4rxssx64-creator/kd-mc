/**
 * APEX v13 — Push Auto-Init (autonome, sans intervention Kevin).
 *
 * Demande Kevin 2026-05-03 :
 * "Notifications doivent fonctionner même app fermée. Android et iPhone.
 *  Maj en temps réel. Toujours pour tout partout automatique autonome."
 *
 * Architecture :
 * - Au boot : detect environnement (iOS PWA standalone / Android Chrome / Desktop)
 * - Si supporté + permission granted ou pas demandée → auto-subscribe Web Push
 * - Si iOS Safari NON-standalone → guide install (banner discret 1 fois)
 * - Resubscribe automatique si endpoint expiré (pushsubscriptionchange)
 * - Heartbeat 6h pour vérifier sub toujours valide (auto-resub si KO)
 * - Server-side : Cloudflare Worker push (apex_v13_push_worker_url) écoute
 *   Firebase Realtime Database et envoie Web Push → réveille SW même app fermée
 *
 * Compat :
 * - iOS 16.4+ Safari PWA standalone : Web Push OK (display-mode: standalone)
 * - Android Chrome 50+ : Web Push OK natif
 * - Desktop Chrome/Firefox/Edge : OK
 * - iOS Safari non-PWA : non supporté → guide install
 *
 * Anti-pattern Kevin :
 * - Pas de modal blocking au 1er boot (attendre 30s + interaction user)
 * - Pas re-demander si denied (state persisté)
 * - Cooldown 5 min entre tentatives (CLAUDE.md règle 13)
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { pushNotifications } from './push-notifications.js';

export type PushEnvironment =
  | 'ios_pwa_standalone'
  | 'ios_safari_browser'
  | 'android_chrome'
  | 'desktop'
  | 'unsupported';

export interface PushInitStatus {
  environment: PushEnvironment;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  endpoint: string | null;
  needs_install_guide: boolean;
  last_check: number;
}

const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000; /* 6h */
const FIRST_BOOT_DELAY_MS = 30_000; /* 30s : laisse user explorer avant prompt */

class PushAutoInit {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Vérifie config VAPID public key + worker URL (P0 audit gap).
   * Retourne diagnostic admin pour UI alert.
   */
  checkPushConfig(): {
    vapid_set: boolean;
    worker_url_set: boolean;
    admin_token_set: boolean;
    ready_for_prod: boolean;
    warnings: readonly string[];
  } {
    const warnings: string[] = [];
    const vapidKey = localStorage.getItem('ax_vapid_public') ?? '';
    const workerUrl = localStorage.getItem('apex_v13_push_worker_url') ?? '';
    const adminToken = localStorage.getItem('apex_v13_push_admin_token') ?? '';
    const vapidSet = vapidKey.length > 30;
    const workerUrlSet = workerUrl.startsWith('http');
    const adminTokenSet = adminToken.length > 10;
    if (!vapidSet) warnings.push('ax_vapid_public manquant (utilise default placeholder = push réelle KO)');
    if (!workerUrlSet) warnings.push('apex_v13_push_worker_url manquant (sendServerPush KO)');
    if (!adminTokenSet) warnings.push('apex_v13_push_admin_token manquant (sendServerPush KO)');
    const readyForProd = vapidSet && workerUrlSet && adminTokenSet;
    return {
      vapid_set: vapidSet,
      worker_url_set: workerUrlSet,
      admin_token_set: adminTokenSet,
      ready_for_prod: readyForProd,
      warnings,
    };
  }

  /**
   * Détecte l'environnement précis (iOS PWA vs browser, Android, desktop).
   */
  detectEnvironment(): PushEnvironment {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unsupported';
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    /* Vérifier APIs disponibles */
    const hasPush = 'serviceWorker' in navigator && typeof PushManager !== 'undefined';
    if (!hasPush) return 'unsupported';

    if (isIOS) {
      return isStandalone ? 'ios_pwa_standalone' : 'ios_safari_browser';
    }
    if (isAndroid) return 'android_chrome';
    return 'desktop';
  }

  /**
   * Statut complet (admin dashboard + auto-init logic).
   */
  async getStatus(uid: string): Promise<PushInitStatus> {
    const env = this.detectEnvironment();
    const permission: NotificationPermission | 'unsupported' =
      typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

    let endpoint: string | null = null;
    let subscribed = false;
    if ('serviceWorker' in (typeof navigator !== 'undefined' ? navigator : {})) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          endpoint = sub.endpoint;
          subscribed = true;
        }
      } catch {
        /* ignore */
      }
    }

    const cached = pushNotifications.getSubscription(uid);
    if (!subscribed && cached) {
      endpoint = cached.endpoint;
      subscribed = true;
    }

    return {
      environment: env,
      permission,
      subscribed,
      endpoint,
      needs_install_guide: env === 'ios_safari_browser',
      last_check: Date.now(),
    };
  }

  /**
   * Auto-init au boot — non-blocking, autonome.
   *
   * Logique :
   * 1. Si déjà subscribed → juste démarrer heartbeat
   * 2. Si environnement non supporté → log + skip (pas spam)
   * 3. Si iOS Safari browser → flag needs_install_guide, ne demande pas
   * 4. Si permission default → attendre 30s + 1ère interaction user
   * 5. Si permission granted → subscribe direct
   * 6. Si permission denied → respecte (CLAUDE.md règle anti-spam)
   */
  async autoInit(uid: string, opts: { skipDelay?: boolean } = {}): Promise<PushInitStatus> {
    const status = await this.getStatus(uid);

    /* Démarre heartbeat dans tous les cas où c'est pertinent */
    if (status.environment !== 'unsupported' && status.environment !== 'ios_safari_browser') {
      this.startHeartbeat(uid);
    }

    /* Cas non actionnable */
    if (status.environment === 'unsupported') {
      logger.info('push-auto-init', 'Environment unsupported — skip');
      return status;
    }
    if (status.environment === 'ios_safari_browser') {
      logger.info('push-auto-init', 'iOS Safari non-standalone — needs install guide');
      this.markNeedsInstallGuide();
      return status;
    }
    if (status.subscribed) {
      logger.info('push-auto-init', 'Already subscribed', { endpoint: status.endpoint?.slice(0, 60) });
      return status;
    }
    if (status.permission === 'denied') {
      logger.info('push-auto-init', 'Permission denied — respect user choice');
      return status;
    }

    /* Permission granted → subscribe direct */
    if (status.permission === 'granted') {
      const result = await pushNotifications.subscribe(uid);
      if (result.ok) {
        void auditLog.record('push.auto_init_subscribed', { details: { uid, env: status.environment } });
        return await this.getStatus(uid);
      }
      logger.warn('push-auto-init', 'subscribe failed', { reason: result.reason });
      return status;
    }

    /* Permission default → attendre 30s pour ne pas spammer au boot brutal */
    if (!opts.skipDelay) {
      setTimeout(() => {
        void this.requestPermissionAndSubscribe(uid);
      }, FIRST_BOOT_DELAY_MS);
      logger.info('push-auto-init', `Will request permission in ${FIRST_BOOT_DELAY_MS / 1000}s`);
    } else {
      void this.requestPermissionAndSubscribe(uid);
    }

    return status;
  }

  /**
   * Demande permission + subscribe (appelé après délai ou interaction user).
   */
  async requestPermissionAndSubscribe(uid: string): Promise<{ ok: boolean; reason?: string }> {
    /* v13.4.124 (Kevin "passe en native iOS") :
     * Si Apex tourne dans wrapper Capacitor iOS natif → APNs natif (plus fiable
     * que Web Push iOS 16.4+ limité). Mode PWA Safari : fallback Notification API. */
    try {
      const { apexIosNative } = await import('./apex-ios-native.js');
      if (apexIosNative.isNative()) {
        const r = await apexIosNative.requestPushPermission();
        if (r.granted && r.native) {
          void auditLog.record('push.apns_native_granted', { details: { uid, platform: 'ios' } });
          return { ok: true };
        }
        if (!r.granted && r.native) {
          return { ok: false, reason: 'APNs permission denied (Réglages iOS)' };
        }
        /* Si fallback nécessaire, continue plus bas avec Web Push */
      }
    } catch { /* plugin absent : fallback Web Push */ }
    if (typeof Notification === 'undefined') return { ok: false, reason: 'Notification API absent' };
    if (Notification.permission === 'denied') return { ok: false, reason: 'Permission denied' };
    try {
      const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (perm !== 'granted') {
        void auditLog.record('push.permission_refused', { details: { uid, perm } });
        return { ok: false, reason: `Permission ${perm}` };
      }
      const result = await pushNotifications.subscribe(uid);
      if (result.ok) {
        void auditLog.record('push.auto_init_subscribed', { details: { uid } });
      }
      return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'subscribe failed' };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason };
    }
  }

  /**
   * Heartbeat : vérifie sub toujours valide toutes les 6h.
   * Si endpoint changé → resubscribe auto.
   */
  startHeartbeat(uid: string): void {
    if (this.heartbeatTimer !== null) return; /* Déjà démarré */
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatCheck(uid);
    }, HEARTBEAT_INTERVAL_MS);
    /* Sprint 3 P0 : track interval pour cleanup possible */
    void import('../core-svc/service-lifecycle.js').then(({ lifecycle }) => {
      if (this.heartbeatTimer !== null) lifecycle.trackInterval('push-auto-init', this.heartbeatTimer);
    }).catch(() => { /* skip */ });
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async heartbeatCheck(uid: string): Promise<void> {
    if (!('serviceWorker' in (typeof navigator !== 'undefined' ? navigator : {}))) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      const cached = pushNotifications.getSubscription(uid);
      if (!sub && cached) {
        /* Subscription perdue côté browser → re-subscribe */
        logger.warn('push-auto-init', 'Subscription lost — auto-resubscribing');
        await pushNotifications.subscribe(uid);
        void auditLog.record('push.heartbeat_resubscribed', { details: { uid } });
      } else if (sub && cached && sub.endpoint !== cached.endpoint) {
        /* Endpoint changé (FCM/APNs renew) → update */
        logger.info('push-auto-init', 'Endpoint rotated — updating');
        await pushNotifications.subscribe(uid);
      }
    } catch (err: unknown) {
      logger.warn('push-auto-init', 'heartbeat failed', { err });
    }
  }

  private markNeedsInstallGuide(): void {
    try {
      const seen = localStorage.getItem('apex_v13_install_guide_seen');
      if (!seen) {
        localStorage.setItem('apex_v13_install_guide_pending', '1');
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Marque guide install vue (UI doit appeler après affichage).
   */
  markInstallGuideShown(): void {
    try {
      localStorage.setItem('apex_v13_install_guide_seen', String(Date.now()));
      localStorage.removeItem('apex_v13_install_guide_pending');
    } catch {
      /* ignore */
    }
  }

  /**
   * Pour iOS Safari browser : retourne instructions précises.
   */
  getIOSInstallInstructions(): { title: string; steps: readonly string[] } {
    return {
      title: 'Active les notifications sur iPhone',
      steps: [
        'Touche le bouton Partager (carré + flèche en bas de Safari)',
        '"Sur l\'écran d\'accueil"',
        'Touche "Ajouter"',
        'Ouvre APEX depuis ton écran d\'accueil (icône or)',
        'Les notifications fonctionneront même app fermée',
      ],
    };
  }
}

export const pushAutoInit = new PushAutoInit();
