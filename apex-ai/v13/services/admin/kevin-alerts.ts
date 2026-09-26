/**
 * APEX v13 — Kevin Alert Channel (Audit autonomie 2026-05-04 P1).
 *
 * Apex IA a noté : "Alert channel réel — si sentinelle détecte anomalie, m'alerte comment ?"
 * Helper centralisé qui essaie en cascade :
 *   1. Telegram Bot (si ax_telegram_token + ax_telegram_chat_id configurés)
 *   2. Discord webhook (si ax_discord_webhook_url configuré)
 *   3. Push notification PWA (fallback navigateur)
 *   4. Console log + audit log (toujours actif, dernier recours)
 *
 * Utilisation :
 *   await alertKevin({ severity: 'critical', title: 'Provider down', body: '...' });
 *
 * Aucun blocage si tous les channels échouent — best-effort non-bloquant.
 */

import { logger } from '../../core/logger.js';

export type AlertSeverity = 'info' | 'warn' | 'critical';

export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  body: string;
  /** ID feature/sentinelle source (ex: "uptime-monitor", "token-watch"). */
  source?: string;
  /** Détails additionnels (sanitizés audit). */
  details?: Record<string, unknown>;
  /**
   * URL/route à ouvrir au clic notification (Kevin 2026-05-08 : "ne se passe rien au clic").
   * - URL absolue (https://...) → openWindow nouveau tab via SW
   * - Hash route (#admin-credentials-status, ou 'admin-credentials-status') → router.navigate
   * - Si absent : fallback automatique depuis `source` via notification-actions mapping.
   */
  cta_url?: string;
}

interface AlertResult {
  ok: boolean;
  channels_tried: string[];
  channels_ok: string[];
  channels_failed: Array<{ name: string; reason: string }>;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  critical: '🚨',
};

class KevinAlerts {
  /**
   * Envoie l'alerte à Kevin via tous les canaux configurés.
   * Best-effort, ne throw jamais. Retourne report par canal.
   */
  async alertKevin(payload: AlertPayload): Promise<AlertResult> {
    const result: AlertResult = {
      ok: false,
      channels_tried: [],
      channels_ok: [],
      channels_failed: [],
    };

    const emoji = SEVERITY_EMOJI[payload.severity];
    const formatted = `${emoji} *${payload.title}*\n\n${payload.body}` +
      (payload.source ? `\n\n_source: ${payload.source}_` : '');

    /* 1. Telegram Bot (priorité haute — push instantané sur iPhone Kevin) */
    result.channels_tried.push('telegram');
    try {
      const ok = await this.tryTelegram(formatted);
      if (ok) result.channels_ok.push('telegram');
      else result.channels_failed.push({ name: 'telegram', reason: 'send failed' });
    } catch (err: unknown) {
      result.channels_failed.push({ name: 'telegram', reason: String(err).slice(0, 100) });
    }

    /* 2. Discord webhook (fallback si Telegram down OU pas configuré) */
    if (result.channels_ok.length === 0) {
      result.channels_tried.push('discord');
      try {
        const ok = await this.tryDiscord(formatted, payload.severity);
        if (ok) result.channels_ok.push('discord');
        else result.channels_failed.push({ name: 'discord', reason: 'webhook failed' });
      } catch (err: unknown) {
        result.channels_failed.push({ name: 'discord', reason: String(err).slice(0, 100) });
      }
    }

    /* 3. Browser Push Notification (si l'app est ouverte sur iPhone PWA) */
    if (result.channels_ok.length === 0) {
      result.channels_tried.push('browser-push');
      try {
        const ok = await this.tryBrowserPush(payload);
        if (ok) result.channels_ok.push('browser-push');
        else result.channels_failed.push({ name: 'browser-push', reason: 'no permission' });
      } catch (err: unknown) {
        result.channels_failed.push({ name: 'browser-push', reason: String(err).slice(0, 100) });
      }
    }

    /* 4. Toujours : audit log + console (dernier recours, prouve que l'alerte a été émise) */
    result.channels_tried.push('audit-log');
    void this.logAuditAlert(payload);
    result.channels_ok.push('audit-log');

    result.ok = result.channels_ok.length > 0;
    logger.info('alerts', `alertKevin (${payload.severity}) → ${result.channels_ok.join(', ')}`);
    return result;
  }

  private async tryTelegram(message: string): Promise<boolean> {
    const { vault } = await import('../vault/vault.js');
    const token = await vault.readKey('ax_telegram_token');
    const chatId = await vault.readKey('ax_telegram_chat_id');
    if (!token || !chatId) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_notification: false,
        }),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async tryDiscord(message: string, severity: AlertSeverity): Promise<boolean> {
    const { vault } = await import('../vault/vault.js');
    const url = await vault.readKey('ax_discord_webhook_url');
    if (!url || !url.startsWith('https://discord.com/api/webhooks/')) return false;
    const color = severity === 'critical' ? 0xff0000 : severity === 'warn' ? 0xffaa00 : 0x22cc77;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: 'Apex IA',
            description: message.slice(0, 4000),
            color,
            timestamp: new Date().toISOString(),
          }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async tryBrowserPush(payload: AlertPayload): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission !== 'granted') return false;
    try {
      /* Kevin 2026-05-08 : notif click DOIT déclencher action.
       * Si cta_url absent, dérive depuis `source` via mapping. */
      const ctaUrl = payload.cta_url ?? this.deriveCtaUrl(payload.source);
      const tag = payload.source ?? 'apex-alert';

      /* Préférence : showNotification via SW pour récupérer le notificationclick
       * (la notif `new Notification()` brut n'envoie PAS au SW sur tous browsers). */
      const reg = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration()
        : null;
      const opts: NotificationOptions & { data?: Record<string, unknown> } = {
        body: payload.body.slice(0, 200),
        icon: '/apex-ai-v13/assets/icons/apex-logo-192.png',
        tag,
        requireInteraction: payload.severity === 'critical',
        data: {
          cta_url: ctaUrl,
          source: payload.source,
          tag,
          severity: payload.severity,
        },
      };

      if (reg) {
        await reg.showNotification(payload.title, opts);
      } else {
        /* Fallback `new Notification()` + onclick handler direct (browser only) */
        const n = new Notification(payload.title, opts);
        n.onclick = (): void => {
          n.close();
          void import('../integrations/notification-actions.js')
            .then(({ notificationActions }) => {
              notificationActions.handleClick({ url: ctaUrl, tag, source: payload.source });
            })
            .catch(() => {
              /* fallback minimum : focus window + go to chat */
              if (typeof window !== 'undefined') {
                window.focus?.();
                location.hash = ctaUrl ? (ctaUrl.startsWith('#') ? ctaUrl : '#' + ctaUrl) : '#chat';
              }
            });
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mapping `source` (sentinel id, feature) → route hash.
   * Lazy fallback si cta_url absent.
   */
  private deriveCtaUrl(source: string | undefined): string | undefined {
    if (!source) return undefined;
    const map: Record<string, string> = {
      'token-watch': '#admin-credentials-status',
      'auto-restore-watch': '#admin-credentials-status',
      'apex-credentials': '#admin-credentials-status',
      'credentials-missing': '#admin-credentials-status',
      'auto-ultra-reset': '#self-diag',
      'uptime-monitor': '#self-diag',
      'memory-watch': '#knowledge',
      'storage-watch': '#self-diag',
      'backup-watch': '#admin-backup',
      'vault-firebase-backup': '#vault',
      'vault-watch': '#vault',
      'ai-providers-health': '#smart-router',
      'smart-router-watch': '#smart-router',
      'claude-todo': '#admin',
      'iot-providers': '#iot-providers',
      broadlink: '#broadlink-setup',
    };
    return map[source];
  }

  private async logAuditAlert(payload: AlertPayload): Promise<void> {
    try {
      const { auditLog } = await import('../observability/audit-log.js');
      await auditLog.record(`alert.${payload.severity}`, {
        target: payload.source ?? 'apex',
        details: { title: payload.title, body: payload.body.slice(0, 500), ...(payload.details ?? {}) },
      });
    } catch {
      /* non-blocking */
    }
  }

  /**
   * Test channels : appelé par admin pour valider que les credentials marchent.
   */
  async testAllChannels(): Promise<{
    telegram: boolean;
    discord: boolean;
    browser_push: boolean;
  }> {
    const r = await this.alertKevin({
      severity: 'info',
      title: '🧪 Test channels Apex',
      body: 'Test alertes Kevin (depuis testAllChannels).',
      source: 'test',
    });
    return {
      telegram: r.channels_ok.includes('telegram'),
      discord: r.channels_ok.includes('discord'),
      browser_push: r.channels_ok.includes('browser-push'),
    };
  }
}

export const kevinAlerts = new KevinAlerts();
