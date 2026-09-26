/**
 * APEX v13.4.5 — Telegram notifier léger.
 *
 * Bridge pour pousser des notifications critiques à Kevin (quota épuisé, sentinelle critical, etc.).
 *
 * Stratégie en cascade :
 *   1. Push browser via push-notifications (si dispo + sub active) — instantané user device
 *   2. Bot Telegram via Cloudflare worker proxy (apex_v13_telegram_worker_url)
 *      ou direct API Telegram si bot_token configuré localement.
 *   3. Fallback : log dans `apex_v13_kevin_notifications_log` (max 50) pour consultation vue admin.
 *
 * Configuration localStorage (config admin) :
 *   - apex_v13_telegram_bot_token   (optionnel, sinon worker)
 *   - apex_v13_telegram_chat_id     (chat Kevin)
 *   - apex_v13_telegram_worker_url  (proxy CF — recommandé)
 *
 * Anti-spam : dedup par hash(title) 6h.
 */

import { logger } from '../../core/logger.js';

export type NotifPriority = 'low' | 'normal' | 'high' | 'critical';

export interface TelegramNotif {
  title: string;
  body: string;
  ctaUrl?: string;
  priority?: NotifPriority;
}

interface NotifLogEntry {
  ts: number;
  title: string;
  body: string;
  priority: NotifPriority;
  delivered: { browser: boolean; telegram: boolean; logged: boolean };
}

const LOG_KEY = 'apex_v13_kevin_notifications_log';
const DEDUP_KEY = 'apex_v13_kevin_notifications_dedup';
const LOG_CAP = 50;
const DEDUP_TTL_MS = 6 * 60 * 60 * 1000; /* 6h */

class TelegramNotifier {
  async notify(notif: TelegramNotif): Promise<NotifLogEntry> {
    const priority: NotifPriority = notif.priority ?? 'normal';
    const title = notif.title.slice(0, 200);
    const body = notif.body.slice(0, 2000);

    /* Dedup low/normal seulement — critical passe toujours */
    if (priority !== 'critical' && this.isDuplicate(title)) {
      logger.info('telegram-notifier', `dedup skip : ${title.slice(0, 60)}`);
      return {
        ts: Date.now(),
        title,
        body,
        priority,
        delivered: { browser: false, telegram: false, logged: false },
      };
    }

    const result: NotifLogEntry = {
      ts: Date.now(),
      title,
      body,
      priority,
      delivered: { browser: false, telegram: false, logged: false },
    };

    /* 1. Browser push (non-bloquant) */
    try {
      const { pushNotifications } = await import('./push-notifications.js');
      const uid = localStorage.getItem('apex_v13_uid') ?? 'anon';
      const ok = await pushNotifications.send(uid, {
        title,
        body,
        url: notif.ctaUrl,
        tag: priority,
      } as unknown as Parameters<typeof pushNotifications.send>[1]);
      result.delivered.browser = ok;
    } catch (err: unknown) {
      logger.debug('telegram-notifier', 'browser push fail', { err });
    }

    /* 2. Telegram (via worker ou direct) */
    try {
      const sent = await this.sendTelegram(title, body, notif.ctaUrl);
      result.delivered.telegram = sent;
    } catch (err: unknown) {
      logger.debug('telegram-notifier', 'telegram send fail', { err });
    }

    /* 3. Fallback log local toujours */
    this.persistLog(result);
    result.delivered.logged = true;
    this.markSent(title);
    return result;
  }

  /** Liste log local consultable par vue admin */
  getRecent(limit = 20): NotifLogEntry[] {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as NotifLogEntry[];
      return Array.isArray(arr) ? arr.slice(-limit).reverse() : [];
    } catch {
      return [];
    }
  }

  /** Tester config : envoie message test */
  async testConfig(): Promise<{ ok: boolean; msg: string }> {
    try {
      const r = await this.notify({
        title: 'Apex test notif',
        body: `Test envoi : ${new Date().toLocaleString('fr-FR')}`,
        priority: 'normal',
      });
      const channels: string[] = [];
      if (r.delivered.browser) channels.push('browser');
      if (r.delivered.telegram) channels.push('telegram');
      if (channels.length === 0) {
        return { ok: false, msg: 'Aucun canal n\'a délivré (logged seulement)' };
      }
      return { ok: true, msg: `Délivré via : ${channels.join(', ')}` };
    } catch (err: unknown) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  }

  /* ============ Privates ============ */

  private async sendTelegram(title: string, body: string, ctaUrl?: string): Promise<boolean> {
    const workerUrl = localStorage.getItem('apex_v13_telegram_worker_url') ?? '';
    const botToken = localStorage.getItem('apex_v13_telegram_bot_token') ?? '';
    const chatId = localStorage.getItem('apex_v13_telegram_chat_id') ?? '';
    if (!workerUrl && (!botToken || !chatId)) return false;
    const text = `*${this.escapeMd(title)}*\n${this.escapeMd(body)}` + (ctaUrl ? `\n[Ouvrir](${ctaUrl})` : '');

    /* Priorité worker (CORS-friendly + Kevin contrôle proxy) */
    if (workerUrl) {
      try {
        const resp = await fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, parse_mode: 'Markdown' }),
        });
        return resp.ok;
      } catch {
        /* fallback direct */
      }
    }
    if (botToken && chatId) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
        });
        return resp.ok;
      } catch {
        return false;
      }
    }
    return false;
  }

  private isDuplicate(title: string): boolean {
    try {
      const raw = localStorage.getItem(DEDUP_KEY);
      if (!raw) return false;
      const dedup = JSON.parse(raw) as Record<string, number>;
      const last = dedup[this.hash(title)];
      if (!last) return false;
      return Date.now() - last < DEDUP_TTL_MS;
    } catch {
      return false;
    }
  }

  private markSent(title: string): void {
    try {
      const raw = localStorage.getItem(DEDUP_KEY);
      const dedup: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      dedup[this.hash(title)] = Date.now();
      /* Purge entries expirées */
      const cutoff = Date.now() - DEDUP_TTL_MS;
      for (const k of Object.keys(dedup)) {
        if ((dedup[k] ?? 0) < cutoff) delete dedup[k];
      }
      localStorage.setItem(DEDUP_KEY, JSON.stringify(dedup));
    } catch {
      /* ignore quota */
    }
  }

  private persistLog(entry: NotifLogEntry): void {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      const arr: NotifLogEntry[] = raw ? (JSON.parse(raw) as NotifLogEntry[]) : [];
      arr.push(entry);
      const trimmed = arr.slice(-LOG_CAP);
      localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
    } catch {
      /* ignore quota */
    }
  }

  private hash(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  private escapeMd(s: string): string {
    return s.replace(/([*_`[\]()])/g, '\\$1');
  }
}

export const telegramNotifier = new TelegramNotifier();
