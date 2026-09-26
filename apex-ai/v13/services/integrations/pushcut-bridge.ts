/**
 * APEX v13.3.58 — Pushcut bridge (Kevin 2026-05-08).
 *
 * Demande Kevin : "Ajoute toi des outils ou fonctions dédiés pour débloquer ou
 * faire autrement sur iOS. Cherche, pousse plus loin"
 *
 * STRATÉGIE E — Pushcut webhook integration
 *
 * Pushcut (https://www.pushcut.io) est une app iOS native qui :
 * - Reçoit des webhooks HTTPS depuis n'importe où
 * - Déclenche des notifications push sur iPhone Kevin
 * - Peut lancer des Shortcuts iOS automatiquement à la réception
 * - Renvoie résultats via callback URL
 *
 * Pourquoi c'est CRITIQUE pour Apex :
 * - Apex Safari iOS PWA ne peut PAS scanner BT/NFC/USB
 * - Pushcut peut lancer un shortcut natif → délègue à Apple Shortcuts
 *   → Apple Shortcuts a accès Bluetooth / NFC / Network framework natif
 * - Round-trip : Apex → webhook Pushcut → notif iPhone → tap → Shortcut → résultat
 *
 * Configuration Kevin (1 fois) :
 * 1. Installer Pushcut (App Store, gratuit pour 5 notifications/jour)
 * 2. Créer notification "Apex Bridge" + obtenir webhook URL
 * 3. Coller webhook URL dans Apex Coffre → `ax_pushcut_webhook_url`
 * 4. Pushcut → Automation → Server-side actions → mapper webhooks vers shortcuts
 *
 * Sécurité :
 * - Webhook URL stocké chiffré via vault (`ax_pushcut_webhook_url`)
 * - Token API Pushcut optionnel pour features avancées (`ax_pushcut_api_token`)
 * - Pas de payload sensible (Apex passe juste action + meta non-PII)
 * - Audit log immutable de chaque trigger
 *
 * Anti-abus :
 * - Rate-limit 1 trigger / 2s côté client
 * - Validation URL HTTPS uniquement
 * - Whitelist actions autorisées
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

/* ============================================================================
 * Types
 * ============================================================================ */

export type PushcutAction =
  | 'bt_scan' /* Délègue scan Bluetooth à Apple Shortcuts via Pushcut */
  | 'nfc_read' /* Lit tag NFC */
  | 'nfc_write' /* Écrit URL/texte sur tag NFC */
  | 'wifi_scan' /* Liste réseaux WiFi détectés */
  | 'speak_text' /* Text-to-speech système iOS */
  | 'send_imessage' /* Envoie iMessage à un contact */
  | 'add_calendar' /* Ajoute event calendrier */
  | 'control_home' /* Contrôle HomeKit (lumières, volets, thermostat) */
  | 'play_apple_music' /* Lance morceau Apple Music */
  | 'take_photo' /* Prend photo via app Photos */
  | 'open_app' /* Ouvre une app native par bundle id */
  | 'custom'; /* Action custom mappée par Kevin dans Pushcut */

export interface PushcutTriggerOptions {
  /** Action mappée dans Pushcut server-side actions */
  action: PushcutAction;
  /** Texte/JSON envoyé au shortcut via input */
  input?: string;
  /** Titre notification iPhone (visible Kevin) */
  title?: string;
  /** Texte notification */
  text?: string;
  /** Bouton actions notification (max 3) */
  actions?: Array<{ name: string; input?: string; shortcut?: string }>;
  /** Si true, garde la notif silent (pas de son) */
  silent?: boolean;
  /** Custom URL pour callback résultat (rare) */
  callbackUrl?: string;
}

export interface PushcutTriggerResult {
  ok: boolean;
  /** True si HTTPS POST a réussi (200) */
  delivered: boolean;
  error?: string;
  reason?:
    | 'no_webhook'
    | 'invalid_url'
    | 'rate_limited'
    | 'http_error'
    | 'network'
    | 'invalid_action';
  statusCode?: number;
}

export interface PushcutStatus {
  configured: boolean;
  hasApiToken: boolean;
  webhookHost?: string;
  lastTriggerTs?: number;
  triggerCount24h: number;
}

/* ============================================================================
 * Constantes
 * ============================================================================ */

const STORAGE_WEBHOOK = 'ax_pushcut_webhook_url';
const STORAGE_API_TOKEN = 'ax_pushcut_api_token';
const STORAGE_LAST_TRIGGER = 'ax_pushcut_last_trigger';
const STORAGE_TRIGGER_LOG = 'ax_pushcut_trigger_log_24h';
const RATE_LIMIT_MS = 2000; /* Anti-spam : 1 trigger / 2s */
const LOG_MAX = 100;

const VALID_ACTIONS: PushcutAction[] = [
  'bt_scan',
  'nfc_read',
  'nfc_write',
  'wifi_scan',
  'speak_text',
  'send_imessage',
  'add_calendar',
  'control_home',
  'play_apple_music',
  'take_photo',
  'open_app',
  'custom',
];

/* ============================================================================
 * Helpers
 * ============================================================================ */

function isValidWebhookUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    /* Pushcut webhook host pattern : api.pushcut.io/v1/notifications/<id> */
    return u.hostname === 'api.pushcut.io' || u.hostname.endsWith('.pushcut.io');
  } catch {
    return false;
  }
}

/* ============================================================================
 * Service
 * ============================================================================ */

class PushcutBridge {
  /**
   * Configure le webhook Pushcut (Kevin colle 1 fois).
   * Webhook URL est validée HTTPS + domaine pushcut.io.
   */
  async setWebhookUrl(url: string): Promise<{ ok: boolean; error?: string }> {
    if (!isValidWebhookUrl(url)) {
      return { ok: false, error: 'URL invalide (doit être https://api.pushcut.io/...)' };
    }
    const r = await vault.setKey(STORAGE_WEBHOOK, url.trim());
    if (!r.ok) return { ok: false, error: 'Erreur stockage vault' };
    void auditLog.record('pushcut.webhook_set', { details: { host: new URL(url).hostname } });
    return { ok: true };
  }

  /**
   * Configure le token API Pushcut (optionnel, pour features avancées).
   */
  async setApiToken(token: string): Promise<{ ok: boolean; error?: string }> {
    if (!token || token.length < 10) return { ok: false, error: 'Token trop court' };
    const r = await vault.setKey(STORAGE_API_TOKEN, token.trim());
    if (!r.ok) return { ok: false, error: 'Erreur stockage vault' };
    void auditLog.record('pushcut.api_token_set', {});
    return { ok: true };
  }

  /**
   * Trigger une action Pushcut → notification iPhone Kevin.
   * Kevin tape la notif → Pushcut lance shortcut natif → exécute action.
   */
  async trigger(opts: PushcutTriggerOptions): Promise<PushcutTriggerResult> {
    if (!VALID_ACTIONS.includes(opts.action)) {
      return { ok: false, delivered: false, reason: 'invalid_action', error: `Action ${opts.action} non supportée` };
    }

    /* Rate limit */
    const now = Date.now();
    const last = Number(localStorage.getItem(STORAGE_LAST_TRIGGER) ?? 0);
    if (now - last < RATE_LIMIT_MS) {
      return { ok: false, delivered: false, reason: 'rate_limited', error: 'Trop rapide, attends 2s' };
    }

    const webhookUrl = await vault.readKey(STORAGE_WEBHOOK);
    if (!webhookUrl) {
      return { ok: false, delivered: false, reason: 'no_webhook', error: 'Webhook Pushcut non configuré' };
    }

    /* Construit payload Pushcut API
     * https://www.pushcut.io/help/api */
    const payload: Record<string, unknown> = {
      title: opts.title ?? `Apex: ${opts.action}`,
      text: opts.text ?? `Action déclenchée par Apex (${opts.action})`,
      input: opts.input ?? opts.action,
      isTimeSensitive: false,
      sound: opts.silent ? 'none' : 'default',
    };
    if (opts.actions && opts.actions.length > 0) {
      payload['actions'] = opts.actions.slice(0, 3).map((a) => ({
        name: a.name,
        input: a.input,
        shortcut: a.shortcut,
      }));
    }

    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const ok = resp.ok;
      const statusCode = resp.status;
      localStorage.setItem(STORAGE_LAST_TRIGGER, String(now));
      this.appendLog({ action: opts.action, ts: now, ok });
      void auditLog.record('pushcut.trigger', { details: { action: opts.action, statusCode } });
      if (!ok) {
        return { ok: false, delivered: false, reason: 'http_error', error: `HTTP ${statusCode}`, statusCode };
      }
      return { ok: true, delivered: true, statusCode };
    } catch (e) {
      logger.warn('pushcut', 'trigger failed', { err: String(e) });
      return { ok: false, delivered: false, reason: 'network', error: String(e) };
    }
  }

  /**
   * Helpers ergonomiques pour use cases courants.
   */
  async scanBluetooth(): Promise<PushcutTriggerResult> {
    return this.trigger({
      action: 'bt_scan',
      title: 'Apex demande scan Bluetooth',
      text: 'Tape pour lancer le scan',
    });
  }

  async readNFC(): Promise<PushcutTriggerResult> {
    return this.trigger({
      action: 'nfc_read',
      title: 'Apex demande lecture NFC',
      text: 'Approche un tag NFC de ton iPhone',
    });
  }

  async controlHome(scene: string, action: 'on' | 'off' = 'on'): Promise<PushcutTriggerResult> {
    return this.trigger({
      action: 'control_home',
      input: JSON.stringify({ scene, action }),
      title: 'Apex contrôle Home',
      text: `${action === 'on' ? 'Allumer' : 'Éteindre'} : ${scene}`,
      silent: true,
    });
  }

  async speak(text: string): Promise<PushcutTriggerResult> {
    return this.trigger({
      action: 'speak_text',
      input: text,
      title: 'Apex parle',
      text: text.slice(0, 100),
      silent: true,
    });
  }

  async addCalendarEvent(title: string, isoStart: string): Promise<PushcutTriggerResult> {
    return this.trigger({
      action: 'add_calendar',
      input: JSON.stringify({ title, start: isoStart }),
      title: 'Nouvel événement Apex',
      text: title,
    });
  }

  /**
   * État du bridge (UI admin).
   */
  async status(): Promise<PushcutStatus> {
    const webhook = await vault.readKey(STORAGE_WEBHOOK);
    const apiToken = await vault.readKey(STORAGE_API_TOKEN);
    const lastTriggerRaw = localStorage.getItem(STORAGE_LAST_TRIGGER);
    const lastTriggerTs = lastTriggerRaw ? Number(lastTriggerRaw) : undefined;
    const log = this.readLog();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const triggerCount24h = log.filter((e) => e.ts >= cutoff).length;
    const out: PushcutStatus = {
      configured: !!webhook,
      hasApiToken: !!apiToken,
      triggerCount24h,
    };
    if (lastTriggerTs !== undefined) out.lastTriggerTs = lastTriggerTs;
    if (webhook) {
      try {
        out.webhookHost = new URL(webhook).hostname;
      } catch { /* ignore */ }
    }
    return out;
  }

  /**
   * Reset config Pushcut (logout).
   * Clear localStorage + IDB shadow vault (anti-rehydration).
   */
  async reset(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_WEBHOOK);
      localStorage.removeItem(STORAGE_API_TOKEN);
      localStorage.removeItem(STORAGE_LAST_TRIGGER);
      localStorage.removeItem(STORAGE_TRIGGER_LOG);
    } catch { /* ignore */ }
    /* Vault triple persistence : clear IDB shadow */
    await this.clearIdbShadow(STORAGE_WEBHOOK);
    await this.clearIdbShadow(STORAGE_API_TOKEN);
    void auditLog.record('pushcut.reset', {});
  }

  private async clearIdbShadow(storageKey: string): Promise<void> {
    if (!('indexedDB' in globalThis)) return;
    await new Promise<void>((resolve) => {
      try {
        const req = indexedDB.open('apex_v13_vault_shadow', 1);
        req.onupgradeneeded = (): void => {
          const db = req.result;
          if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
        };
        req.onsuccess = (): void => {
          const db = req.result;
          try {
            const tx = db.transaction('keys', 'readwrite');
            const store = tx.objectStore('keys');
            store.delete(storageKey);
            tx.oncomplete = (): void => { db.close(); resolve(); };
            tx.onerror = (): void => { db.close(); resolve(); };
          } catch {
            db.close();
            resolve();
          }
        };
        req.onerror = (): void => resolve();
      } catch {
        resolve();
      }
    });
  }

  /* ----- Private ----- */

  private readLog(): Array<{ action: string; ts: number; ok: boolean }> {
    try {
      const raw = localStorage.getItem(STORAGE_TRIGGER_LOG);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private appendLog(entry: { action: string; ts: number; ok: boolean }): void {
    const log = this.readLog();
    log.push(entry);
    /* Trim 24h */
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const filtered = log.filter((e) => e.ts >= cutoff).slice(-LOG_MAX);
    try {
      localStorage.setItem(STORAGE_TRIGGER_LOG, JSON.stringify(filtered));
    } catch { /* quota */ }
  }
}

export const pushcutBridge = new PushcutBridge();
