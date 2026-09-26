/**
 * APEX v13.3.51 — Broadlink Cloud bridge (Kevin 2026-05-07).
 *
 * Demande Kevin : "j'ai donné photo de mon compte broadlink et photo des
 * info réseau de ma smart tv clayton pour qu'elle se connecte et pilote
 * mais Apex n'a rien fait".
 *
 * Pourquoi Cloud (et pas LAN scan direct) :
 * - Safari iOS PWA ne peut PAS scanner LAN (pas de UDP, pas de mDNS, CORS)
 * - Broadlink Cloud (ibroadlink.com) expose une API HTTP REST
 * - Token compte → liste devices → envoi commandes IR depuis n'importe où
 *
 * Flow attendu Kevin :
 * 1. Kevin colle photo compte Broadlink → vision-device-analyze extrait token + devices
 * 2. broadlinkBridge.setupAccount(email, password) ou directement setToken(token)
 * 3. broadlinkBridge.listDevices() → table cliquable (Smart TV Clayton, prises, ...)
 * 4. Kevin dit "Allume la TV" → bridge sendIR(device_id, ir_hex_power_on)
 *
 * Architecture sécurité :
 * - Token Broadlink stocké chiffré via vault (`ax_broadlink_token`)
 * - Email stocké en clair (peu sensible) `ax_broadlink_email`
 * - Liste devices cache localStorage `ax_smart_devices`
 * - Codes IR appris cache localStorage `ax_broadlink_ir_<deviceId>`
 *
 * Endpoints API Broadlink Cloud (référence python-broadlink + ibroadlink.com) :
 * - https://api.ibroadlink.com/appsync/group/v2/login        → token
 * - https://api.ibroadlink.com/appsync/group/v2/family/list  → devices
 * - https://api.ibroadlink.com/appsync/group/dev/v3/sendcmd  → send IR
 *
 * NOTE : si CORS bloque l'API directe (probable Safari iOS), on déploie
 * un Cloudflare Worker proxy `apex-broadlink-proxy` (à faire en suivant).
 * En attendant, on tente fetch direct + fallback graceful avec message clair.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

/* ============================================================================
 * Types
 * ============================================================================ */

export type BroadlinkDeviceType =
  | 'rm' /* IR/RF remote (RM Pro, RM4 Mini) */
  | 'sp' /* Smart Plug (SP1, SP2) */
  | 'mp1' /* Smart Power Strip 4-outlet */
  | 'a1' /* Environment Sensor */
  | 'unknown';

export interface BroadlinkDevice {
  id: string;
  name: string;
  mac: string;
  type: BroadlinkDeviceType;
  online: boolean;
  /** Si type=rm, codes IR appris (cache local) */
  learnedCodes?: Array<{ name: string; ir_hex: string }>;
}

export interface BroadlinkLoginResult {
  ok: boolean;
  token?: string;
  userId?: string;
  error?: string;
}

export interface BroadlinkSendIRResult {
  ok: boolean;
  error?: string;
  /** Estimation : si fail réseau, on a une erreur claire. */
  reason?: 'no_token' | 'cors_blocked' | 'http_error' | 'invalid_device' | 'network';
}

/* ============================================================================
 * Constantes
 * ============================================================================ */

const BROADLINK_API_BASE = 'https://api.ibroadlink.com';
const STORAGE_TOKEN = 'ax_broadlink_token';
const STORAGE_EMAIL = 'ax_broadlink_email';
const STORAGE_USERID = 'ax_broadlink_userid';
const STORAGE_DEVICES = 'ax_smart_devices';
const STORAGE_PROXY = 'ax_broadlink_proxy_url'; /* Cloudflare Worker proxy si CORS */
const STORAGE_LEARNED_PREFIX = 'ax_broadlink_ir_';
const FETCH_TIMEOUT_MS = 8000;

/* Common IR codes pour Smart TV (génériques, à raffiner via vraie capture).
 * Format simple "name → hex" pour bootstrap rapide. Vrais codes apprendrabs. */
const COMMON_IR_CODES_TV: Record<string, string> = {
  power: '26008c0094...', /* placeholder, à apprendre */
  vol_up: '26008c0094...',
  vol_down: '26008c0094...',
  channel_up: '26008c0094...',
  channel_down: '26008c0094...',
  mute: '26008c0094...',
};

/* ============================================================================
 * Helpers HTTP
 * ============================================================================ */

type FetchBroadlinkResult<T> =
  | { ok: true; data: T }
  | { ok: false; status?: number; error: string; reason: 'cors_blocked' | 'http_error' | 'network' | 'timeout' };

async function fetchBroadlink<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown } = {},
): Promise<FetchBroadlinkResult<T>> {
  const proxyUrl = localStorage.getItem(STORAGE_PROXY) ?? '';
  const baseUrl = proxyUrl || BROADLINK_API_BASE;
  const url = `${baseUrl}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      signal: ctrl.signal,
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const resp = await fetch(url, init);
    clearTimeout(timer);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, status: resp.status, error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, reason: 'http_error' };
    }
    const data = (await resp.json()) as T;
    return { ok: true, data };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    /* Détecte CORS vs réseau */
    if (/cors|cross-?origin|opaque/i.test(msg)) {
      return { ok: false, error: msg, reason: 'cors_blocked' };
    }
    if (/abort|timeout/i.test(msg)) {
      return { ok: false, error: msg, reason: 'timeout' };
    }
    return { ok: false, error: msg, reason: 'network' };
  }
}

function normalizeDeviceType(t: string | undefined): BroadlinkDeviceType {
  if (!t) return 'unknown';
  const lower = t.toLowerCase();
  if (lower.includes('rm')) return 'rm';
  if (lower.includes('sp')) return 'sp';
  if (lower.includes('mp1')) return 'mp1';
  if (lower.includes('a1')) return 'a1';
  return 'unknown';
}

/* ============================================================================
 * Service
 * ============================================================================ */

class BroadlinkBridge {
  /**
   * Login Broadlink (email + password) → récupère token + userId.
   * Fallback : si CORS direct bloque, propose proxy Cloudflare Worker.
   */
  async login(email: string, password: string): Promise<BroadlinkLoginResult> {
    if (!email || !password) {
      return { ok: false, error: 'email + password requis' };
    }
    /* Body Broadlink Cloud login (référence python-broadlink) */
    const body = {
      email,
      password,
      loginsource: 0,
      version: 'apex-13',
    };
    const r = await fetchBroadlink<{
      status?: number;
      data?: { loginsession?: string; userid?: string };
      msg?: string;
    }>('/appsync/group/v2/login', { method: 'POST', body });
    if (!r.ok) {
      logger.warn('broadlink-bridge', 'login failed', { reason: r.reason, error: r.error });
      void auditLog.record('broadlink.login.fail', { details: { reason: r.reason, email } });
      return { ok: false, error: r.error };
    }
    const status = r.data.status;
    if (status !== 0) {
      return { ok: false, error: r.data.msg ?? `Status non-zero: ${String(status)}` };
    }
    const token = r.data.data?.loginsession;
    const userId = r.data.data?.userid;
    if (!token) {
      return { ok: false, error: 'Aucun token retourné par Broadlink' };
    }
    /* Persist token chiffré + email + userid */
    await vault.setKey(STORAGE_TOKEN, token);
    try {
      localStorage.setItem(STORAGE_EMAIL, email);
      if (userId) localStorage.setItem(STORAGE_USERID, userId);
    } catch { /* quota */ }
    void auditLog.record('broadlink.login.success', { details: { email } });
    logger.info('broadlink-bridge', 'login success', { email, hasToken: true });
    const out: BroadlinkLoginResult = { ok: true, token };
    if (userId) out.userId = userId;
    return out;
  }

  /**
   * Setup direct via token (cas où vision-device-analyze a déjà extrait le token).
   */
  async setToken(token: string, email?: string): Promise<{ ok: boolean }> {
    if (!token) return { ok: false };
    await vault.setKey(STORAGE_TOKEN, token);
    if (email) {
      try { localStorage.setItem(STORAGE_EMAIL, email); } catch { /* ignore */ }
    }
    void auditLog.record('broadlink.token.set_direct', { details: { hasEmail: !!email } });
    return { ok: true };
  }

  /**
   * Liste les devices liés au compte (cache localStorage 5 min).
   */
  async listDevices(forceRefresh = false): Promise<BroadlinkDevice[]> {
    /* Cache 5min */
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(STORAGE_DEVICES);
        if (raw) {
          const cached = JSON.parse(raw) as { devices: BroadlinkDevice[]; ts: number };
          if (Date.now() - cached.ts < 5 * 60 * 1000) {
            return cached.devices;
          }
        }
      } catch { /* corrupt cache */ }
    }
    const token = await vault.readKey(STORAGE_TOKEN);
    if (!token) {
      logger.warn('broadlink-bridge', 'listDevices: no token');
      return [];
    }
    const r = await fetchBroadlink<{
      status?: number;
      data?: { endpoints?: Array<{ endpointId?: string; friendlyname?: string; productname?: string; mac?: string; online?: boolean }> };
    }>('/appsync/group/v2/family/list', {
      method: 'POST',
      headers: { 'common-loginsession': token },
      body: { method: 'list' },
    });
    if (!r.ok) {
      logger.warn('broadlink-bridge', 'listDevices fail', { reason: r.reason });
      return [];
    }
    const endpoints = r.data.data?.endpoints ?? [];
    const devices: BroadlinkDevice[] = endpoints.map((e) => ({
      id: e.endpointId ?? '',
      name: e.friendlyname ?? 'Device sans nom',
      mac: e.mac ?? '',
      type: normalizeDeviceType(e.productname),
      online: !!e.online,
    }));
    /* Cache */
    try {
      localStorage.setItem(STORAGE_DEVICES, JSON.stringify({ devices, ts: Date.now() }));
    } catch { /* quota */ }
    void auditLog.record('broadlink.list_devices.success', { details: { count: devices.length } });
    return devices;
  }

  /**
   * Envoie une commande IR vers un device Broadlink RM.
   * irHex : code IR hexadécimal (capturé via app Broadlink ou COMMON_IR_CODES_TV).
   */
  async sendIR(deviceId: string, irHex: string): Promise<BroadlinkSendIRResult> {
    if (!deviceId || !irHex) {
      return { ok: false, error: 'deviceId + irHex requis', reason: 'invalid_device' };
    }
    const token = await vault.readKey(STORAGE_TOKEN);
    if (!token) {
      return { ok: false, error: 'Compte Broadlink pas configuré (token manquant)', reason: 'no_token' };
    }
    const r = await fetchBroadlink<{ status?: number; msg?: string }>(
      '/appsync/group/dev/v3/sendcmd',
      {
        method: 'POST',
        headers: { 'common-loginsession': token },
        body: {
          endpointId: deviceId,
          act: 'sendcmd',
          data: { code: irHex },
        },
      },
    );
    if (!r.ok) {
      void auditLog.record('broadlink.send_ir.fail', { details: { deviceId, reason: r.reason } });
      /* Map fetchBroadlink reason to BroadlinkSendIRResult reason
       * (no_token et invalid_device sont traités plus haut, donc ici les mêmes reasons réseau s'appliquent) */
      const reason: BroadlinkSendIRResult['reason'] =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return { ok: false, error: r.error, reason };
    }
    if (r.data.status !== 0) {
      return { ok: false, error: r.data.msg ?? 'Status non-zero', reason: 'http_error' };
    }
    void auditLog.record('broadlink.send_ir.success', { details: { deviceId, codeLen: irHex.length } });
    return { ok: true };
  }

  /**
   * Liste les codes IR appris pour un device (cache local).
   * Note : sur Broadlink Cloud, les codes sont stockés côté app mobile,
   * pas exposés via API publique. On garde cache local rempli manuellement
   * (ou via "Apprendre code" guidé).
   */
  async getLearnedCodes(deviceId: string): Promise<Array<{ name: string; ir_hex: string }>> {
    if (!deviceId) return [];
    try {
      const raw = localStorage.getItem(`${STORAGE_LEARNED_PREFIX}${deviceId}`);
      if (raw) {
        const arr = JSON.parse(raw) as Array<{ name: string; ir_hex: string }>;
        if (Array.isArray(arr)) return arr;
      }
    } catch { /* corrupt */ }
    return [];
  }

  /**
   * Sauvegarde un code IR appris pour un device.
   */
  saveLearnedCode(deviceId: string, name: string, irHex: string): void {
    if (!deviceId || !name || !irHex) return;
    const codes = this.getLearnedCodesSync(deviceId);
    /* Replace si même name */
    const filtered = codes.filter((c) => c.name !== name);
    filtered.push({ name, ir_hex: irHex });
    try {
      localStorage.setItem(`${STORAGE_LEARNED_PREFIX}${deviceId}`, JSON.stringify(filtered));
    } catch { /* quota */ }
    void auditLog.record('broadlink.learn_code', { details: { deviceId, name, codeLen: irHex.length } });
  }

  private getLearnedCodesSync(deviceId: string): Array<{ name: string; ir_hex: string }> {
    try {
      const raw = localStorage.getItem(`${STORAGE_LEARNED_PREFIX}${deviceId}`);
      if (raw) {
        const arr = JSON.parse(raw) as Array<{ name: string; ir_hex: string }>;
        if (Array.isArray(arr)) return arr;
      }
    } catch { /* ignore */ }
    return [];
  }

  /**
   * Etat actuel : token configuré ? device count ?
   */
  async status(): Promise<{ configured: boolean; email?: string; deviceCount: number; proxyUrl?: string }> {
    const token = await vault.readKey(STORAGE_TOKEN);
    const email = localStorage.getItem(STORAGE_EMAIL);
    const proxyUrl = localStorage.getItem(STORAGE_PROXY);
    let deviceCount = 0;
    try {
      const raw = localStorage.getItem(STORAGE_DEVICES);
      if (raw) {
        const cached = JSON.parse(raw) as { devices: BroadlinkDevice[] };
        deviceCount = cached.devices?.length ?? 0;
      }
    } catch { /* ignore */ }
    const out: { configured: boolean; email?: string; deviceCount: number; proxyUrl?: string } = {
      configured: !!token,
      deviceCount,
    };
    if (email) out.email = email;
    if (proxyUrl) out.proxyUrl = proxyUrl;
    return out;
  }

  /**
   * Reset config Broadlink (logout).
   * Clear complet : localStorage + IDB shadow direct (anti-rehydration).
   */
  async reset(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_EMAIL);
      localStorage.removeItem(STORAGE_USERID);
      localStorage.removeItem(STORAGE_DEVICES);
    } catch { /* ignore */ }
    /* Clear IDB shadow vault directement pour empêcher rehydration via readKey */
    await this.clearIdbShadow(STORAGE_TOKEN);
    void auditLog.record('broadlink.reset', {});
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

  /**
   * Helper noms communs IR pour TV (bootstrap UI sans codes appris).
   */
  getCommonTVCodeNames(): string[] {
    return Object.keys(COMMON_IR_CODES_TV);
  }
}

export const broadlinkBridge = new BroadlinkBridge();
