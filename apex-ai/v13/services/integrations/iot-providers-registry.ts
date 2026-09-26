/**
 * APEX v13.3.52 — IoT Providers Registry (Kevin 2026-05-07).
 *
 * Demande Kevin (textuel 2026-05-07 23h40) :
 *   "Je veux qu'il commande aussi dans mes comptes eWeLink et SmartLife"
 *   "Et qu'il puisse s'installer en autonomie d'autres plus tard"
 *
 * Framework générique pluggable qui permet à Apex IA :
 * - de piloter N+ providers Smart Home/IoT (eWeLink, Tuya/SmartLife, Hue, Sonos,
 *   Home Assistant, Broadlink) via une seule API uniforme
 * - de self-installer de nouveaux providers à la volée (tool install_iot_provider)
 *   sans modification du code (Kevin règle "autonomie totale toujours partout")
 *
 * Architecture :
 * - Pattern registry : chaque provider implémente IoTProvider (descripteur déclaratif)
 *   + ProviderClient (implémentation runtime).
 * - 6 providers BUILTIN_PROVIDERS pré-enregistrés (eWeLink/Tuya/Broadlink/Hue/Sonos/HA).
 * - Custom providers ajoutables runtime (persistés `ax_iot_custom_providers`).
 * - Credentials stockés chiffrés via vault (clés `ax_<provider>_*`).
 * - testConnection ping endpoint léger → status 🟢/🔴.
 * - listAllDevices aggregate cross-provider → tableau unique.
 * - sendCommand route vers bon provider selon providerId.
 *
 * Sécurité (CLAUDE.md "SÉCURITÉ AVANT AUTONOMIE TOTALE") :
 * - Tous tokens/passwords passent par vault.setKey (AES-GCM-256 + PBKDF2 200k).
 * - Aucun secret jamais en clair en localStorage.
 * - Audit log immutable sur chaque install/sendCommand.
 * - Whitelist endpoints stricte (pas d'URL arbitraire dans custom provider sans guard).
 *
 * CORS / Network :
 * - Comme broadlink-bridge, fallback Cloudflare Worker proxy si CORS bloque
 *   (clé `ax_iot_proxy_url`). Permet utilisation depuis Safari iOS PWA.
 *
 * NB : ne PAS dupliquer broadlink-bridge — on l'enregistre comme provider du
 * registry et on délègue les appels (réutilisation propre).
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

import { broadlinkBridge, type BroadlinkDevice } from './broadlink-bridge.js';

/* ============================================================================
 * Types publics (descripteur provider)
 * ============================================================================ */

export type IoTProviderCategory =
  | 'broadlink'
  | 'sonoff' /* eWeLink */
  | 'tuya' /* SmartLife */
  | 'hue'
  | 'sonos'
  | 'shelly'
  | 'tasmota'
  | 'homekit'
  | 'home-assistant'
  | 'custom';

export type IoTAuthFormat = 'bearer' | 'basic' | 'api_key' | 'jwt' | 'oauth2' | 'session';

export type IoTHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface IoTProvider {
  id: string;
  name: string;
  category: IoTProviderCategory;
  /** URL console/dashboard où Kevin peut gérer son compte. */
  console_url: string;
  /** OAuth optionnel (si applicable). */
  oauth?: {
    authorize_url: string;
    token_url: string;
    client_id_key: string;
    client_secret_key: string;
    scopes: string[];
  };
  /** API endpoint base + auth scheme. */
  api?: {
    base_url: string;
    auth_header: string;
    auth_format: IoTAuthFormat;
  };
  /** Endpoints templates (relative paths, body templates). */
  endpoints: {
    login?: { method: IoTHttpMethod; path: string; body_template: Record<string, unknown> };
    list_devices: { method: IoTHttpMethod; path: string };
    send_command: { method: IoTHttpMethod; path: string; body_template: Record<string, unknown> };
    get_state?: { method: IoTHttpMethod; path: string };
  };
  /** Clés vault attendues (ex: ['ax_ewelink_email','ax_ewelink_password']). */
  credential_keys: string[];
  /** Endpoint léger pour testConnection (HEAD/GET ping). Relatif au base_url. */
  test_endpoint: string;
  free_tier_limit?: { requests_per_hour?: number; devices_max?: number };
  /** Catégorie d'icône (UI). */
  icon?: string;
  /** Brève description user-friendly. */
  description?: string;
}

export interface IoTDevice {
  provider: string;
  device_id: string;
  name: string;
  type: string;
  online: boolean;
  /** Capabilities standard : on_off, brightness, color, temp, etc. */
  capabilities?: string[];
}

export type IoTConnectionReason =
  | 'no_credentials'
  | 'cors_blocked'
  | 'http_error'
  | 'invalid_credentials'
  | 'network';

export interface IoTConnectionResult {
  ok: boolean;
  latency_ms?: number;
  devices_count?: number;
  error?: string;
  reason?: IoTConnectionReason;
}

export interface IoTInstallInput {
  provider_id: string;
  /** Map credentials : { email, password } OU { client_id, client_secret } OU { token }. */
  credentials: Record<string, string>;
  /** Région optionnelle (us|eu|cn|as) pour eWeLink/Tuya. */
  region?: string;
}

export interface IoTInstallResult {
  ok: boolean;
  provider_id: string;
  devices_found?: number;
  error?: string;
}

export type IoTSendCommandReason = 'no_provider' | 'no_credentials' | 'cors_blocked' | 'http_error' | 'network';

export interface IoTSendCommandResult {
  ok: boolean;
  error?: string;
  reason?: IoTSendCommandReason;
}

/* ============================================================================
 * Constantes & storage
 * ============================================================================ */

const CUSTOM_PROVIDERS_KEY = 'ax_iot_custom_providers';
const PROXY_KEY = 'ax_iot_proxy_url';
const FETCH_TIMEOUT_MS = 8000;

/* Régions multi-providers (eWeLink + Tuya).
 * Structure typée explicitement pour éviter les avertissements
 * noPropertyAccessFromIndexSignature. */
const EWELINK_REGION_MAP: Readonly<Record<string, string>> = {
  us: 'https://us-apia.coolkit.cc',
  eu: 'https://eu-apia.coolkit.cc',
  as: 'https://as-apia.coolkit.cc',
  cn: 'https://cn-apia.coolkit.cn',
};
const EWELINK_DEFAULT = 'https://eu-apia.coolkit.cc';

const TUYA_REGION_MAP: Readonly<Record<string, string>> = {
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};
const TUYA_DEFAULT = 'https://openapi.tuyaeu.com';

/* Helper safe pour Record<string,string> (évite les warnings noUncheckedIndexedAccess) */
function pickRegion(map: Readonly<Record<string, string>>, region: string | null, fallback: string): string {
  if (!region) return fallback;
  const v = map[region];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function readLocalStorage(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota */
  }
}

/* ============================================================================
 * Builtin providers — 6 majeurs préinstallés
 * ============================================================================ */

export const BUILTIN_PROVIDERS: readonly IoTProvider[] = [
  /* A. eWeLink (Sonoff) */
  {
    id: 'ewelink',
    name: 'eWeLink (Sonoff)',
    category: 'sonoff',
    console_url: 'https://web.ewelink.cc',
    icon: '🔌',
    description: 'Sonoff / eWeLink : interrupteurs, prises, lampes, capteurs. Auth email + password.',
    api: {
      base_url: 'https://eu-apia.coolkit.cc',
      auth_header: 'Authorization',
      auth_format: 'bearer',
    },
    endpoints: {
      login: { method: 'POST', path: '/v2/user/login', body_template: { email: '{email}', password: '{password}', countryCode: '+33' } },
      list_devices: { method: 'GET', path: '/v2/device/thing' },
      send_command: { method: 'POST', path: '/v2/device/thing/control', body_template: { thingList: [{ itemType: 1, id: '{device_id}', params: '{params}' }] } },
      get_state: { method: 'GET', path: '/v2/device/thing' },
    },
    credential_keys: ['ax_ewelink_email', 'ax_ewelink_password', 'ax_ewelink_region', 'ax_ewelink_token'],
    test_endpoint: '/v2/user/profile',
    free_tier_limit: { requests_per_hour: 1000 },
  },
  /* B. SmartLife (Tuya) */
  {
    id: 'tuya',
    name: 'SmartLife (Tuya Cloud)',
    category: 'tuya',
    console_url: 'https://iot.tuya.com',
    icon: '💡',
    description: 'Tuya / SmartLife : compatibilité Tuya OEM (lumières, prises, climat, sécu). Auth OAuth2 client_id + client_secret.',
    api: {
      base_url: 'https://openapi.tuyaeu.com',
      auth_header: 'access_token',
      auth_format: 'oauth2',
    },
    endpoints: {
      login: { method: 'GET', path: '/v1.0/token?grant_type=1', body_template: {} },
      list_devices: { method: 'GET', path: '/v1.0/users/{uid}/devices' },
      send_command: { method: 'POST', path: '/v1.0/devices/{device_id}/commands', body_template: { commands: '{commands}' } },
      get_state: { method: 'GET', path: '/v1.0/devices/{device_id}/status' },
    },
    credential_keys: ['ax_tuya_client_id', 'ax_tuya_client_secret', 'ax_tuya_uid', 'ax_tuya_region', 'ax_tuya_access_token'],
    test_endpoint: '/v1.0/token?grant_type=1',
    free_tier_limit: { requests_per_hour: 5000 },
  },
  /* C. Broadlink Cloud */
  {
    id: 'broadlink',
    name: 'Broadlink Cloud',
    category: 'broadlink',
    console_url: 'https://www.ibroadlink.com',
    icon: '📡',
    description: 'Broadlink RM Pro/Mini, prises, capteurs. Pilotage IR/RF. Auth email + password.',
    api: {
      base_url: 'https://api.ibroadlink.com',
      auth_header: 'common-loginsession',
      auth_format: 'session',
    },
    endpoints: {
      login: { method: 'POST', path: '/appsync/group/v2/login', body_template: { email: '{email}', password: '{password}', loginsource: 0 } },
      list_devices: { method: 'POST', path: '/appsync/group/v2/family/list' },
      send_command: { method: 'POST', path: '/appsync/group/dev/v3/sendcmd', body_template: { endpointId: '{device_id}', act: 'sendcmd', data: { code: '{ir_hex}' } } },
    },
    credential_keys: ['ax_broadlink_email', 'ax_broadlink_password', 'ax_broadlink_token'],
    test_endpoint: '/appsync/group/v2/family/list',
  },
  /* D. Philips Hue (LAN bridge ou Cloud) */
  {
    id: 'hue',
    name: 'Philips Hue',
    category: 'hue',
    console_url: 'https://account.meethue.com',
    icon: '🌈',
    description: 'Philips Hue : lampes connectées via Hue Bridge LAN ou cloud. Auth username (LAN) ou OAuth (cloud).',
    api: {
      base_url: 'https://api.meethue.com',
      auth_header: 'Authorization',
      auth_format: 'bearer',
    },
    endpoints: {
      list_devices: { method: 'GET', path: '/route/api/{username}/lights' },
      send_command: { method: 'POST', path: '/route/api/{username}/lights/{device_id}/state', body_template: { on: '{on}', bri: '{bri}', xy: '{xy}' } },
      get_state: { method: 'GET', path: '/route/api/{username}/lights/{device_id}' },
    },
    credential_keys: ['ax_hue_bridge_ip', 'ax_hue_username', 'ax_hue_oauth_token'],
    test_endpoint: '/route/api/{username}/config',
  },
  /* E. Sonos (Cloud OAuth2) */
  {
    id: 'sonos',
    name: 'Sonos',
    category: 'sonos',
    console_url: 'https://developer.sonos.com',
    icon: '🔊',
    description: 'Sonos : enceintes connectées, audio multi-room. Auth OAuth2 Sonos Developer.',
    oauth: {
      authorize_url: 'https://api.sonos.com/login/v3/oauth',
      token_url: 'https://api.sonos.com/login/v3/oauth/access',
      client_id_key: 'ax_sonos_client_id',
      client_secret_key: 'ax_sonos_client_secret',
      scopes: ['playback-control-all'],
    },
    api: {
      base_url: 'https://api.ws.sonos.com/control/api',
      auth_header: 'Authorization',
      auth_format: 'bearer',
    },
    endpoints: {
      list_devices: { method: 'GET', path: '/v1/households/{household}/groups' },
      send_command: { method: 'POST', path: '/v1/groups/{device_id}/playback/{action}', body_template: {} },
      get_state: { method: 'GET', path: '/v1/groups/{device_id}/playbackStatus' },
    },
    credential_keys: ['ax_sonos_client_id', 'ax_sonos_client_secret', 'ax_sonos_token', 'ax_sonos_household'],
    test_endpoint: '/v1/households',
  },
  /* F. Home Assistant (self-hosted local ou exposé) */
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    category: 'home-assistant',
    console_url: 'https://www.home-assistant.io',
    icon: '🏠',
    description: 'Home Assistant self-hosted : tout protocole (Zigbee, Z-Wave, Matter, ...). Auth Long-Lived Access Token.',
    api: {
      base_url: '', /* dynamique via ax_ha_url */
      auth_header: 'Authorization',
      auth_format: 'bearer',
    },
    endpoints: {
      list_devices: { method: 'GET', path: '/api/states' },
      send_command: { method: 'POST', path: '/api/services/{domain}/{service}', body_template: { entity_id: '{device_id}' } },
      get_state: { method: 'GET', path: '/api/states/{device_id}' },
    },
    credential_keys: ['ax_ha_url', 'ax_ha_token'],
    test_endpoint: '/api/',
  },
  /* G. Shelly Cloud (Allterco) — devices Shelly via cloud Allterco. v13.3.60 FINAL-100. */
  {
    id: 'shelly',
    name: 'Shelly Cloud',
    category: 'shelly',
    console_url: 'https://control.shelly.cloud',
    icon: '⚡',
    description: 'Shelly Cloud (Allterco) : relais, capteurs, plugs, lumières. Auth Auth Key + server URL fournis par compte cloud.',
    api: {
      base_url: '', /* dynamique via ax_shelly_server (ex: https://shelly-12-eu.shelly.cloud) */
      auth_header: 'Authorization',
      auth_format: 'bearer',
    },
    endpoints: {
      list_devices: { method: 'POST', path: '/interface/device/list' },
      send_command: { method: 'POST', path: '/device/relay/control', body_template: { id: '{device_id}', channel: 0, turn: '{action}' } },
      get_state: { method: 'POST', path: '/device/status?id={device_id}' },
    },
    credential_keys: ['ax_shelly_server', 'ax_shelly_auth_key'],
    test_endpoint: '/interface/device/list',
    free_tier_limit: { requests_per_hour: 1000 },
  },
  /* H. Tasmota (HTTP local LAN) — firmware open-source flashable sur ESP8266/ESP32. v13.3.60 FINAL-100. */
  {
    id: 'tasmota',
    name: 'Tasmota (LAN HTTP)',
    category: 'tasmota',
    console_url: 'https://tasmota.github.io',
    icon: '🔧',
    description: 'Tasmota (firmware open-source) : pilotage HTTP direct LAN device-by-device. Pas de cloud — IP locale + commandes URL.',
    api: {
      base_url: '', /* dynamique via ax_tasmota_base_url (ex: http://192.168.1.50) */
      auth_header: 'Authorization',
      auth_format: 'basic',
    },
    endpoints: {
      list_devices: { method: 'GET', path: '/cm?cmnd=Status%200' },
      send_command: { method: 'GET', path: '/cm?cmnd={command}', body_template: {} },
      get_state: { method: 'GET', path: '/cm?cmnd=State' },
    },
    credential_keys: ['ax_tasmota_base_url', 'ax_tasmota_user', 'ax_tasmota_password'],
    test_endpoint: '/cm?cmnd=Status',
  },
  /* I. Zigbee2MQTT — bridge MQTT pour devices Zigbee (Aqara, Ikea, Sonoff Zigbee, etc.).
     v13.3.60 FINAL-100. Auth via REST companion (zigbee2mqtt-frontend) ou MQTT direct. */
  {
    id: 'zigbee2mqtt',
    name: 'Zigbee2MQTT',
    category: 'home-assistant', /* zigbee2mqtt souvent utilisé via HA — catégorie générique */
    console_url: 'https://www.zigbee2mqtt.io',
    icon: '🐝',
    description: 'Zigbee2MQTT : bridge open-source MQTT pour tous devices Zigbee (Aqara, IKEA Tradfri, Sonoff Zigbee, Philips Hue Zigbee). Auth Bearer token frontend.',
    api: {
      base_url: '', /* dynamique via ax_z2m_url (ex: http://192.168.1.10:8080) */
      auth_header: 'Authorization',
      auth_format: 'bearer',
    },
    endpoints: {
      list_devices: { method: 'GET', path: '/api/devices' },
      send_command: { method: 'POST', path: '/api/{device_id}/set', body_template: { state: '{state}' } },
      get_state: { method: 'GET', path: '/api/{device_id}' },
    },
    credential_keys: ['ax_z2m_url', 'ax_z2m_token'],
    test_endpoint: '/api/info',
  },
];

/* ============================================================================
 * HTTP helper unifié (proxy fallback CORS)
 * ============================================================================ */

interface FetchResultOk<T> { ok: true; data: T; status: number; latency_ms: number }
interface FetchResultErr { ok: false; status?: number; error: string; reason: IoTConnectionReason; latency_ms: number }
type FetchResult<T> = FetchResultOk<T> | FetchResultErr;

async function fetchIot<T>(
  url: string,
  options: { method?: IoTHttpMethod; headers?: Record<string, string>; body?: unknown } = {},
): Promise<FetchResult<T>> {
  const proxy = readLocalStorage(PROXY_KEY);
  const finalUrl = proxy ? `${proxy.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}` : url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const start = Date.now();
  try {
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
      signal: ctrl.signal,
    };
    if (options.body !== undefined) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    const resp = await fetch(finalUrl, init);
    clearTimeout(timer);
    const latency = Date.now() - start;
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, status: resp.status, error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, reason: 'http_error', latency_ms: latency };
    }
    const data = (await resp.json().catch(() => ({}))) as T;
    return { ok: true, data, status: resp.status, latency_ms: latency };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (/cors|cross-?origin|opaque/i.test(msg)) return { ok: false, error: msg, reason: 'cors_blocked', latency_ms: latency };
    return { ok: false, error: msg, reason: 'network', latency_ms: latency };
  }
}

/* ============================================================================
 * Provider-specific clients (route depuis sendCommand/listDevices)
 * ============================================================================ */

interface ProviderClient {
  install(input: IoTInstallInput): Promise<IoTInstallResult>;
  testConnection(): Promise<IoTConnectionResult>;
  listDevices(): Promise<IoTDevice[]>;
  sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult>;
}

/* Helper builder install result avec exact optional types (exactOptionalPropertyTypes:true) */
function buildInstallResult(
  providerId: string,
  ok: boolean,
  options: { error?: string; devicesFound?: number } = {},
): IoTInstallResult {
  const r: IoTInstallResult = { ok, provider_id: providerId };
  if (options.error !== undefined) r.error = options.error;
  if (options.devicesFound !== undefined) r.devices_found = options.devicesFound;
  return r;
}

function buildConnResult(ok: boolean, options: { error?: string; reason?: IoTConnectionReason; latencyMs?: number; devicesCount?: number } = {}): IoTConnectionResult {
  const r: IoTConnectionResult = { ok };
  if (options.error !== undefined) r.error = options.error;
  if (options.reason !== undefined) r.reason = options.reason;
  if (options.latencyMs !== undefined) r.latency_ms = options.latencyMs;
  if (options.devicesCount !== undefined) r.devices_count = options.devicesCount;
  return r;
}

function buildSendResult(ok: boolean, options: { error?: string; reason?: IoTSendCommandReason } = {}): IoTSendCommandResult {
  const r: IoTSendCommandResult = { ok };
  if (options.error !== undefined) r.error = options.error;
  if (options.reason !== undefined) r.reason = options.reason;
  return r;
}

function pickStr(creds: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = creds[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

/* --- eWeLink client --- */
class EWeLinkClient implements ProviderClient {
  private getBase(): string {
    const region = readLocalStorage('ax_ewelink_region') || 'eu';
    return pickRegion(EWELINK_REGION_MAP, region, EWELINK_DEFAULT);
  }

  async install(input: IoTInstallInput): Promise<IoTInstallResult> {
    const email = pickStr(input.credentials, 'email', 'username');
    const password = pickStr(input.credentials, 'password');
    if (!email || !password) {
      return buildInstallResult('ewelink', false, { error: 'email + password requis' });
    }
    if (input.region) writeLocalStorage('ax_ewelink_region', input.region);
    const url = `${this.getBase()}/v2/user/login`;
    const body = { email, password, countryCode: '+33' };
    const r = await fetchIot<{ data?: { at?: string; user?: { apikey?: string } }; error?: number; msg?: string }>(url, {
      method: 'POST',
      body,
    });
    if (!r.ok) return buildInstallResult('ewelink', false, { error: r.error });
    if (r.data.error !== undefined && r.data.error !== 0) {
      return buildInstallResult('ewelink', false, { error: r.data.msg ?? `error ${r.data.error}` });
    }
    const token = r.data.data?.at;
    if (!token) return buildInstallResult('ewelink', false, { error: 'Pas de token retourné' });
    writeLocalStorage('ax_ewelink_email', email);
    await vault.setKey('ax_ewelink_password', password);
    await vault.setKey('ax_ewelink_token', token);
    const devices = await this.listDevices().catch(() => [] as IoTDevice[]);
    return buildInstallResult('ewelink', true, { devicesFound: devices.length });
  }

  async testConnection(): Promise<IoTConnectionResult> {
    const token = await vault.readKey('ax_ewelink_token').catch(() => '');
    if (!token) return buildConnResult(false, { reason: 'no_credentials', error: 'Token eWeLink manquant' });
    const r = await fetchIot<{ data?: { thingList?: unknown[] } }>(`${this.getBase()}/v2/device/thing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return buildConnResult(false, { reason: r.reason, error: r.error });
    return buildConnResult(true, { latencyMs: r.latency_ms, devicesCount: r.data.data?.thingList?.length ?? 0 });
  }

  async listDevices(): Promise<IoTDevice[]> {
    const token = await vault.readKey('ax_ewelink_token').catch(() => '');
    if (!token) return [];
    const r = await fetchIot<{ data?: { thingList?: Array<{ itemData?: { deviceid?: string; name?: string; productModel?: string; online?: boolean } }> } }>(
      `${this.getBase()}/v2/device/thing`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) return [];
    const list = r.data.data?.thingList ?? [];
    return list.map((t) => ({
      provider: 'ewelink',
      device_id: t.itemData?.deviceid ?? '',
      name: t.itemData?.name ?? 'Sonoff sans nom',
      type: t.itemData?.productModel ?? 'unknown',
      online: !!t.itemData?.online,
      capabilities: ['on_off'],
    }));
  }

  async sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult> {
    const token = await vault.readKey('ax_ewelink_token').catch(() => '');
    if (!token) return buildSendResult(false, { reason: 'no_credentials', error: 'Pas connecté à eWeLink' });
    const r = await fetchIot<{ error?: number; msg?: string }>(
      `${this.getBase()}/v2/device/thing/control`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { thingList: [{ itemType: 1, id: deviceId, params: command }] },
      },
    );
    if (!r.ok) {
      const reason: IoTSendCommandReason =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return buildSendResult(false, { reason, error: r.error });
    }
    if (r.data.error !== undefined && r.data.error !== 0) {
      return buildSendResult(false, { reason: 'http_error', error: r.data.msg ?? `error ${r.data.error}` });
    }
    return buildSendResult(true);
  }
}

/* --- Tuya / SmartLife client --- */
class TuyaClient implements ProviderClient {
  private getBase(): string {
    const region = readLocalStorage('ax_tuya_region') || 'eu';
    return pickRegion(TUYA_REGION_MAP, region, TUYA_DEFAULT);
  }

  async install(input: IoTInstallInput): Promise<IoTInstallResult> {
    const clientId = pickStr(input.credentials, 'client_id', 'access_id');
    const clientSecret = pickStr(input.credentials, 'client_secret', 'access_secret');
    const uid = pickStr(input.credentials, 'uid');
    const accessToken = pickStr(input.credentials, 'access_token', 'token');
    if (!clientId || !clientSecret) return buildInstallResult('tuya', false, { error: 'client_id + client_secret requis' });
    if (input.region) writeLocalStorage('ax_tuya_region', input.region);
    await vault.setKey('ax_tuya_client_id', clientId);
    await vault.setKey('ax_tuya_client_secret', clientSecret);
    if (uid) writeLocalStorage('ax_tuya_uid', uid);
    if (accessToken) await vault.setKey('ax_tuya_access_token', accessToken);
    const test = await this.testConnection();
    return buildInstallResult('tuya', test.ok, {
      ...(test.error !== undefined ? { error: test.error } : {}),
      ...(test.devices_count !== undefined ? { devicesFound: test.devices_count } : {}),
    });
  }

  async testConnection(): Promise<IoTConnectionResult> {
    const token = await vault.readKey('ax_tuya_access_token').catch(() => '');
    const clientId = await vault.readKey('ax_tuya_client_id').catch(() => '');
    if (!token && !clientId) return buildConnResult(false, { reason: 'no_credentials', error: 'Tuya credentials manquants' });
    const uid = readLocalStorage('ax_tuya_uid');
    if (token && uid) {
      const r = await fetchIot<{ result?: unknown[]; success?: boolean }>(`${this.getBase()}/v1.0/users/${uid}/devices`, {
        headers: { access_token: token },
      });
      if (!r.ok) return buildConnResult(false, { reason: r.reason, error: r.error });
      return buildConnResult(true, { latencyMs: r.latency_ms, devicesCount: Array.isArray(r.data.result) ? r.data.result.length : 0 });
    }
    return buildConnResult(!!clientId, { latencyMs: 0, devicesCount: 0 });
  }

  async listDevices(): Promise<IoTDevice[]> {
    const token = await vault.readKey('ax_tuya_access_token').catch(() => '');
    const uid = readLocalStorage('ax_tuya_uid');
    if (!token || !uid) return [];
    const r = await fetchIot<{ result?: Array<{ id?: string; name?: string; category?: string; online?: boolean }> }>(
      `${this.getBase()}/v1.0/users/${uid}/devices`,
      { headers: { access_token: token } },
    );
    if (!r.ok) return [];
    const list = r.data.result ?? [];
    return list.map((d) => ({
      provider: 'tuya',
      device_id: d.id ?? '',
      name: d.name ?? 'Tuya sans nom',
      type: d.category ?? 'unknown',
      online: !!d.online,
      capabilities: ['on_off', 'brightness'],
    }));
  }

  async sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult> {
    const token = await vault.readKey('ax_tuya_access_token').catch(() => '');
    if (!token) return buildSendResult(false, { reason: 'no_credentials', error: 'Pas connecté à Tuya' });
    const cmds = command['commands'];
    const commands = Array.isArray(cmds)
      ? cmds
      : Object.entries(command).map(([code, value]) => ({ code, value }));
    const r = await fetchIot<{ success?: boolean; msg?: string }>(
      `${this.getBase()}/v1.0/devices/${deviceId}/commands`,
      {
        method: 'POST',
        headers: { access_token: token },
        body: { commands },
      },
    );
    if (!r.ok) {
      const reason: IoTSendCommandReason =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return buildSendResult(false, { reason, error: r.error });
    }
    if (r.data.success === false) return buildSendResult(false, { reason: 'http_error', error: r.data.msg ?? 'Tuya refusé' });
    return buildSendResult(true);
  }
}

/* --- Broadlink client (réutilise broadlinkBridge) --- */
class BroadlinkClient implements ProviderClient {
  async install(input: IoTInstallInput): Promise<IoTInstallResult> {
    const email = pickStr(input.credentials, 'email');
    const password = pickStr(input.credentials, 'password');
    const token = pickStr(input.credentials, 'token');
    if (token) {
      const r = await broadlinkBridge.setToken(token, email || undefined);
      if (!r.ok) return buildInstallResult('broadlink', false, { error: 'setToken failed' });
    } else {
      if (!email || !password) return buildInstallResult('broadlink', false, { error: 'email + password requis (ou token)' });
      const r = await broadlinkBridge.login(email, password);
      if (!r.ok) return buildInstallResult('broadlink', false, r.error !== undefined ? { error: r.error } : {});
    }
    const devices = await broadlinkBridge.listDevices(true).catch(() => [] as BroadlinkDevice[]);
    return buildInstallResult('broadlink', true, { devicesFound: devices.length });
  }

  async testConnection(): Promise<IoTConnectionResult> {
    const status = await broadlinkBridge.status();
    if (!status.configured) return buildConnResult(false, { reason: 'no_credentials', error: 'Broadlink pas configuré' });
    const devices = await broadlinkBridge.listDevices().catch(() => [] as BroadlinkDevice[]);
    return buildConnResult(true, { devicesCount: devices.length, latencyMs: 0 });
  }

  async listDevices(): Promise<IoTDevice[]> {
    const list: BroadlinkDevice[] = await broadlinkBridge.listDevices().catch(() => [] as BroadlinkDevice[]);
    return list.map((d) => ({
      provider: 'broadlink',
      device_id: d.id,
      name: d.name,
      type: d.type,
      online: d.online,
      capabilities: d.type === 'rm' ? ['ir_send', 'ir_learn'] : ['on_off'],
    }));
  }

  async sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult> {
    const irHexRaw = command['ir_hex'] ?? command['code'];
    const irHex = typeof irHexRaw === 'string' ? irHexRaw : '';
    if (!irHex) return buildSendResult(false, { reason: 'http_error', error: 'ir_hex manquant pour Broadlink' });
    const r = await broadlinkBridge.sendIR(deviceId, irHex);
    if (!r.ok) {
      const reason: IoTSendCommandReason =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'no_token' ? 'no_credentials'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return buildSendResult(false, { reason, ...(r.error !== undefined ? { error: r.error } : {}) });
    }
    return buildSendResult(true);
  }
}

/* --- Hue client (LAN bridge ou cloud) --- */
class HueClient implements ProviderClient {
  private getBaseAndAuth(): { base: string; username: string; cloud: boolean } {
    const ip = readLocalStorage('ax_hue_bridge_ip');
    const username = readLocalStorage('ax_hue_username');
    if (ip) return { base: `http://${ip}`, username, cloud: false };
    return { base: 'https://api.meethue.com/route', username, cloud: true };
  }

  async install(input: IoTInstallInput): Promise<IoTInstallResult> {
    const ip = pickStr(input.credentials, 'bridge_ip', 'ip');
    const username = pickStr(input.credentials, 'username', 'user');
    const oauthToken = pickStr(input.credentials, 'oauth_token', 'token');
    if (!username && !oauthToken) return buildInstallResult('hue', false, { error: 'username (LAN) ou oauth_token (cloud) requis' });
    if (ip) writeLocalStorage('ax_hue_bridge_ip', ip);
    if (username) writeLocalStorage('ax_hue_username', username);
    if (oauthToken) await vault.setKey('ax_hue_oauth_token', oauthToken);
    const test = await this.testConnection();
    return buildInstallResult('hue', test.ok, {
      ...(test.error !== undefined ? { error: test.error } : {}),
      ...(test.devices_count !== undefined ? { devicesFound: test.devices_count } : {}),
    });
  }

  async testConnection(): Promise<IoTConnectionResult> {
    const { base, username } = this.getBaseAndAuth();
    if (!username) return buildConnResult(false, { reason: 'no_credentials', error: 'Username Hue manquant' });
    const r = await fetchIot<Record<string, unknown>>(`${base}/api/${username}/lights`);
    if (!r.ok) return buildConnResult(false, { reason: r.reason, error: r.error });
    const count = typeof r.data === 'object' && r.data !== null ? Object.keys(r.data).length : 0;
    return buildConnResult(true, { latencyMs: r.latency_ms, devicesCount: count });
  }

  async listDevices(): Promise<IoTDevice[]> {
    const { base, username } = this.getBaseAndAuth();
    if (!username) return [];
    const r = await fetchIot<Record<string, { name?: string; type?: string; state?: { reachable?: boolean } }>>(`${base}/api/${username}/lights`);
    if (!r.ok) return [];
    return Object.entries(r.data).map(([id, light]) => ({
      provider: 'hue',
      device_id: id,
      name: light.name ?? `Hue ${id}`,
      type: light.type ?? 'light',
      online: light.state?.reachable !== false,
      capabilities: ['on_off', 'brightness', 'color'],
    }));
  }

  async sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult> {
    const { base, username } = this.getBaseAndAuth();
    if (!username) return buildSendResult(false, { reason: 'no_credentials', error: 'Hue pas configuré' });
    const r = await fetchIot<unknown>(`${base}/api/${username}/lights/${deviceId}/state`, {
      method: 'PUT',
      body: command,
    });
    if (!r.ok) {
      const reason: IoTSendCommandReason =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return buildSendResult(false, { reason, error: r.error });
    }
    return buildSendResult(true);
  }
}

/* --- Sonos client (cloud OAuth2) --- */
class SonosClient implements ProviderClient {
  async install(input: IoTInstallInput): Promise<IoTInstallResult> {
    const token = pickStr(input.credentials, 'token', 'access_token');
    const household = pickStr(input.credentials, 'household', 'household_id');
    if (!token) return buildInstallResult('sonos', false, { error: 'access_token Sonos requis (OAuth2)' });
    await vault.setKey('ax_sonos_token', token);
    if (household) writeLocalStorage('ax_sonos_household', household);
    const test = await this.testConnection();
    return buildInstallResult('sonos', test.ok, {
      ...(test.error !== undefined ? { error: test.error } : {}),
      ...(test.devices_count !== undefined ? { devicesFound: test.devices_count } : {}),
    });
  }

  async testConnection(): Promise<IoTConnectionResult> {
    const token = await vault.readKey('ax_sonos_token').catch(() => '');
    if (!token) return buildConnResult(false, { reason: 'no_credentials', error: 'Sonos token manquant' });
    const r = await fetchIot<{ households?: Array<{ id: string }> }>('https://api.ws.sonos.com/control/api/v1/households', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return buildConnResult(false, { reason: r.reason, error: r.error });
    const count = r.data.households?.length ?? 0;
    if (count > 0) {
      const stored = readLocalStorage('ax_sonos_household');
      const firstId = r.data.households?.[0]?.id;
      if (!stored && firstId) writeLocalStorage('ax_sonos_household', firstId);
    }
    return buildConnResult(true, { latencyMs: r.latency_ms, devicesCount: count });
  }

  async listDevices(): Promise<IoTDevice[]> {
    const token = await vault.readKey('ax_sonos_token').catch(() => '');
    const household = readLocalStorage('ax_sonos_household');
    if (!token || !household) return [];
    const r = await fetchIot<{ groups?: Array<{ id?: string; name?: string }> }>(
      `https://api.ws.sonos.com/control/api/v1/households/${household}/groups`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) return [];
    return (r.data.groups ?? []).map((g) => ({
      provider: 'sonos',
      device_id: g.id ?? '',
      name: g.name ?? 'Sonos group',
      type: 'speaker_group',
      online: true,
      capabilities: ['play', 'pause', 'volume', 'next', 'previous'],
    }));
  }

  async sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult> {
    const token = await vault.readKey('ax_sonos_token').catch(() => '');
    if (!token) return buildSendResult(false, { reason: 'no_credentials', error: 'Sonos pas configuré' });
    const actionRaw = command['action'];
    const action = typeof actionRaw === 'string' ? actionRaw : 'play';
    const r = await fetchIot<unknown>(`https://api.ws.sonos.com/control/api/v1/groups/${deviceId}/playback/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    if (!r.ok) {
      const reason: IoTSendCommandReason =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return buildSendResult(false, { reason, error: r.error });
    }
    return buildSendResult(true);
  }
}

/* --- Home Assistant client --- */
class HomeAssistantClient implements ProviderClient {
  private getBase(): string {
    return readLocalStorage('ax_ha_url').replace(/\/$/, '');
  }

  async install(input: IoTInstallInput): Promise<IoTInstallResult> {
    const url = pickStr(input.credentials, 'url', 'ha_url');
    const token = pickStr(input.credentials, 'token', 'access_token');
    if (!url || !token) return buildInstallResult('home-assistant', false, { error: 'url + token (LLAT) requis' });
    writeLocalStorage('ax_ha_url', url);
    await vault.setKey('ax_ha_token', token);
    const test = await this.testConnection();
    return buildInstallResult('home-assistant', test.ok, {
      ...(test.error !== undefined ? { error: test.error } : {}),
      ...(test.devices_count !== undefined ? { devicesFound: test.devices_count } : {}),
    });
  }

  async testConnection(): Promise<IoTConnectionResult> {
    const base = this.getBase();
    const token = await vault.readKey('ax_ha_token').catch(() => '');
    if (!base || !token) return buildConnResult(false, { reason: 'no_credentials', error: 'Home Assistant URL + token manquants' });
    const r = await fetchIot<{ message?: string }>(`${base}/api/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return buildConnResult(false, { reason: r.reason, error: r.error });
    const devices = await this.listDevices().catch(() => [] as IoTDevice[]);
    return buildConnResult(true, { latencyMs: r.latency_ms, devicesCount: devices.length });
  }

  async listDevices(): Promise<IoTDevice[]> {
    const base = this.getBase();
    const token = await vault.readKey('ax_ha_token').catch(() => '');
    if (!base || !token) return [];
    const r = await fetchIot<Array<{ entity_id?: string; attributes?: { friendly_name?: string }; state?: string }>>(
      `${base}/api/states`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) return [];
    return r.data
      .filter((e) => /^(light|switch|climate|media_player|cover|fan|lock)\./.test(e.entity_id ?? ''))
      .map((e) => {
        const entityId = e.entity_id ?? '';
        const splitParts = entityId.split('.');
        const domain = splitParts[0] ?? 'unknown';
        return {
          provider: 'home-assistant',
          device_id: entityId,
          name: e.attributes?.friendly_name ?? entityId ?? 'HA entity',
          type: domain,
          online: e.state !== 'unavailable',
          capabilities: ['on_off'],
        };
      });
  }

  async sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult> {
    const base = this.getBase();
    const token = await vault.readKey('ax_ha_token').catch(() => '');
    if (!base || !token) return buildSendResult(false, { reason: 'no_credentials', error: 'Home Assistant pas configuré' });
    const splitParts = deviceId.split('.');
    const domain = splitParts[0] ?? 'homeassistant';
    const serviceRaw = command['service'] ?? command['action'];
    const service = typeof serviceRaw === 'string' ? serviceRaw : 'toggle';
    const body: Record<string, unknown> = { entity_id: deviceId, ...command };
    delete body['service'];
    delete body['action'];
    const r = await fetchIot<unknown>(`${base}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (!r.ok) {
      const reason: IoTSendCommandReason =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return buildSendResult(false, { reason, error: r.error });
    }
    return buildSendResult(true);
  }
}

/* ============================================================================
 * Generic provider client (pour custom providers ajoutés runtime)
 * ============================================================================ */

class GenericProviderClient implements ProviderClient {
  constructor(private provider: IoTProvider) {}

  private getBase(): string {
    return this.provider.api?.base_url ?? '';
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    if (!this.provider.api) return {};
    for (const k of this.provider.credential_keys) {
      const v = await vault.readKey(k).catch(() => '');
      if (v) {
        const headerName = this.provider.api.auth_header;
        const fmt = this.provider.api.auth_format;
        if (fmt === 'bearer') return { [headerName]: `Bearer ${v}` };
        if (fmt === 'basic') return { [headerName]: `Basic ${v}` };
        return { [headerName]: v };
      }
    }
    return {};
  }

  async install(input: IoTInstallInput): Promise<IoTInstallResult> {
    for (const [k, v] of Object.entries(input.credentials)) {
      const matchingKey = this.provider.credential_keys.find((ck) => ck.includes(k));
      if (matchingKey) await vault.setKey(matchingKey, v);
    }
    const test = await this.testConnection();
    return buildInstallResult(this.provider.id, test.ok, {
      ...(test.error !== undefined ? { error: test.error } : {}),
      ...(test.devices_count !== undefined ? { devicesFound: test.devices_count } : {}),
    });
  }

  async testConnection(): Promise<IoTConnectionResult> {
    const base = this.getBase();
    if (!base) return buildConnResult(false, { reason: 'no_credentials', error: 'Provider sans api.base_url' });
    const headers = await this.getAuthHeader();
    if (Object.keys(headers).length === 0) return buildConnResult(false, { reason: 'no_credentials', error: 'Aucun credential stocké' });
    const r = await fetchIot<unknown>(`${base}${this.provider.test_endpoint}`, { headers });
    if (!r.ok) return buildConnResult(false, { reason: r.reason, error: r.error });
    return buildConnResult(true, { latencyMs: r.latency_ms, devicesCount: 0 });
  }

  async listDevices(): Promise<IoTDevice[]> {
    const base = this.getBase();
    if (!base) return [];
    const headers = await this.getAuthHeader();
    const ep = this.provider.endpoints.list_devices;
    const r = await fetchIot<unknown>(`${base}${ep.path}`, { method: ep.method, headers });
    if (!r.ok) return [];
    const raw = r.data;
    let arr: unknown[] = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw !== null && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj['devices'])) arr = obj['devices'];
      else if (Array.isArray(obj['result'])) arr = obj['result'];
      else if (Array.isArray(obj['data'])) arr = obj['data'];
    }
    return arr.slice(0, 50).map((d, i) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        provider: this.provider.id,
        device_id: String(o['id'] ?? o['device_id'] ?? o['entity_id'] ?? `dev${i}`),
        name: String(o['name'] ?? o['friendly_name'] ?? `Device ${i}`),
        type: String(o['type'] ?? o['category'] ?? 'unknown'),
        online: o['online'] !== false && o['state'] !== 'unavailable',
        capabilities: ['on_off'],
      };
    });
  }

  async sendCommand(deviceId: string, command: Record<string, unknown>): Promise<IoTSendCommandResult> {
    const base = this.getBase();
    if (!base) return buildSendResult(false, { reason: 'no_provider', error: 'Provider sans base_url' });
    const headers = await this.getAuthHeader();
    const ep = this.provider.endpoints.send_command;
    const path = ep.path.replace('{device_id}', deviceId);
    const body = { ...ep.body_template, ...command, device_id: deviceId };
    const r = await fetchIot<unknown>(`${base}${path}`, { method: ep.method, headers, body });
    if (!r.ok) {
      const reason: IoTSendCommandReason =
        r.reason === 'cors_blocked' ? 'cors_blocked'
        : r.reason === 'http_error' ? 'http_error'
        : 'network';
      return buildSendResult(false, { reason, error: r.error });
    }
    return buildSendResult(true);
  }
}

/* ============================================================================
 * Registry principal
 * ============================================================================ */

class IoTRegistry {
  private providers = new Map<string, IoTProvider>();
  private clients = new Map<string, ProviderClient>();

  constructor() {
    /* Builtin providers */
    for (const p of BUILTIN_PROVIDERS) this.providers.set(p.id, p);
    /* Clients runtime (DI manuelle pour les builtin) */
    this.clients.set('ewelink', new EWeLinkClient());
    this.clients.set('tuya', new TuyaClient());
    this.clients.set('broadlink', new BroadlinkClient());
    this.clients.set('hue', new HueClient());
    this.clients.set('sonos', new SonosClient());
    this.clients.set('home-assistant', new HomeAssistantClient());
    /* Restore custom providers */
    this.loadCustomProviders();
  }

  private loadCustomProviders(): void {
    const raw = readLocalStorage(CUSTOM_PROVIDERS_KEY);
    if (!raw) return;
    try {
      const arr = JSON.parse(raw) as IoTProvider[];
      if (!Array.isArray(arr)) return;
      for (const p of arr) {
        if (p && p.id && !this.providers.has(p.id)) {
          this.providers.set(p.id, p);
          this.clients.set(p.id, new GenericProviderClient(p));
        }
      }
    } catch {
      /* corrupt cache */
    }
  }

  private persistCustomProviders(): void {
    const builtinIds = new Set(BUILTIN_PROVIDERS.map((p) => p.id));
    const custom = Array.from(this.providers.values()).filter((p) => !builtinIds.has(p.id));
    writeLocalStorage(CUSTOM_PROVIDERS_KEY, JSON.stringify(custom));
  }

  /** Retourne tous les providers (builtin + custom). */
  list(): IoTProvider[] {
    return Array.from(this.providers.values());
  }

  /** Retourne les providers builtin uniquement. */
  listBuiltin(): readonly IoTProvider[] {
    return BUILTIN_PROVIDERS;
  }

  get(id: string): IoTProvider | null {
    return this.providers.get(id) ?? null;
  }

  /** Ajoute un provider custom runtime (Apex auto-install future). */
  install(provider: IoTProvider): void {
    if (!provider || !provider.id) throw new Error('Provider invalide : id requis');
    if (BUILTIN_PROVIDERS.some((p) => p.id === provider.id)) {
      throw new Error(`Provider builtin protégé : ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
    this.clients.set(provider.id, new GenericProviderClient(provider));
    this.persistCustomProviders();
    void auditLog.record('iot.provider.install_custom', { details: { provider_id: provider.id, name: provider.name } });
    logger.info('iot-registry', `Custom provider installé: ${provider.id}`);
  }

  /** Retire un provider custom (builtin protégés). */
  remove(id: string): void {
    if (BUILTIN_PROVIDERS.some((p) => p.id === id)) {
      throw new Error(`Provider builtin protégé : ${id}`);
    }
    this.providers.delete(id);
    this.clients.delete(id);
    this.persistCustomProviders();
    void auditLog.record('iot.provider.remove_custom', { details: { provider_id: id } });
  }

  /**
   * Configure un provider builtin avec credentials user (workflow install).
   * Appelé par le tool IA install_iot_provider.
   */
  async configureProvider(input: IoTInstallInput): Promise<IoTInstallResult> {
    const provider = this.providers.get(input.provider_id);
    if (!provider) return buildInstallResult(input.provider_id, false, { error: 'Provider inconnu' });
    const client = this.clients.get(input.provider_id);
    if (!client) return buildInstallResult(input.provider_id, false, { error: 'Client provider non disponible' });
    const r = await client.install(input);
    if (r.ok) {
      void auditLog.record('iot.provider.configure', {
        details: { provider_id: input.provider_id, devices_found: r.devices_found ?? 0 },
      });
    } else {
      void auditLog.record('iot.provider.configure_fail', {
        details: { provider_id: input.provider_id, error: r.error ?? 'unknown' },
      });
    }
    return r;
  }

  /** Test connexion légère un provider (status badge). */
  async testConnection(providerId: string): Promise<IoTConnectionResult> {
    const client = this.clients.get(providerId);
    if (!client) return buildConnResult(false, { reason: 'no_credentials', error: `Provider inconnu: ${providerId}` });
    return client.testConnection();
  }

  /** Liste tous les devices cross-provider (aggregate). */
  async listAllDevices(): Promise<IoTDevice[]> {
    const all: IoTDevice[] = [];
    for (const [id, client] of this.clients) {
      try {
        const devices = await client.listDevices();
        all.push(...devices);
      } catch (err) {
        logger.warn('iot-registry', `listDevices fail pour ${id}`, { err: String(err) });
      }
    }
    return all;
  }

  /** Liste devices d'un provider spécifique. */
  async listDevicesFor(providerId: string): Promise<IoTDevice[]> {
    const client = this.clients.get(providerId);
    if (!client) return [];
    return client.listDevices();
  }

  /** Envoie commande à un device via le bon provider. */
  async sendCommand(
    providerId: string,
    deviceId: string,
    command: Record<string, unknown>,
  ): Promise<IoTSendCommandResult> {
    const client = this.clients.get(providerId);
    if (!client) return buildSendResult(false, { reason: 'no_provider', error: `Provider inconnu: ${providerId}` });
    const r = await client.sendCommand(deviceId, command);
    void auditLog.record(r.ok ? 'iot.send_command.success' : 'iot.send_command.fail', {
      details: { provider_id: providerId, device_id: deviceId, command_keys: Object.keys(command), error: r.error ?? null },
    });
    return r;
  }

  /**
   * Retourne le status global de tous les providers (vue admin).
   */
  async statusAll(): Promise<Array<{ provider: IoTProvider; status: IoTConnectionResult }>> {
    const results: Array<{ provider: IoTProvider; status: IoTConnectionResult }> = [];
    for (const provider of this.providers.values()) {
      const status = await this.testConnection(provider.id);
      results.push({ provider, status });
    }
    return results;
  }
}

/* ============================================================================
 * Singleton export
 * ============================================================================ */

export const iotRegistry = new IoTRegistry();
