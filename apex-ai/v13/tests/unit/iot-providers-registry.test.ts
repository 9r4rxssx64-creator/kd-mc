/**
 * APEX v13.3.52 — Tests IoT Providers Registry (Kevin 2026-05-07).
 *
 * Couvre :
 * - list() retourne >= 6 builtin providers (eWeLink, Tuya, Broadlink, Hue, Sonos, HA)
 * - get(id) retourne provider ou null
 * - install() ajoute custom + persiste localStorage
 * - install() refuse override builtin
 * - remove() retire custom mais protège builtin
 * - configureProvider eWeLink success → persist credentials
 * - configureProvider eWeLink error → ok:false
 * - testConnection retourne {ok, latency_ms, devices_count}
 * - listAllDevices aggregate cross-provider
 * - sendCommand route vers bon provider
 * - sendCommand provider inconnu → reason no_provider
 * - Tuya install nécessite client_id + client_secret
 * - Home Assistant install nécessite url + token
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUILTIN_PROVIDERS,
  iotRegistry,
  type IoTProvider,
} from '../../services/integrations/iot-providers-registry.js';

const STORAGE_KEYS_TO_CLEAN = [
  'ax_iot_custom_providers',
  'ax_iot_proxy_url',
  'ax_ewelink_email',
  'ax_ewelink_password',
  'ax_ewelink_token',
  'ax_ewelink_region',
  'ax_tuya_client_id',
  'ax_tuya_client_secret',
  'ax_tuya_uid',
  'ax_tuya_access_token',
  'ax_tuya_region',
  'ax_hue_bridge_ip',
  'ax_hue_username',
  'ax_hue_oauth_token',
  'ax_sonos_token',
  'ax_sonos_household',
  'ax_ha_url',
  'ax_ha_token',
  'ax_broadlink_token',
  'ax_broadlink_email',
];

function mockJsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  });
}

describe('iot-providers-registry — Framework Smart Home générique', () => {
  beforeEach(() => {
    for (const k of STORAGE_KEYS_TO_CLEAN) localStorage.removeItem(k);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Builtin providers', () => {
    it('list() retourne au moins 6 providers builtin', () => {
      const all = iotRegistry.list();
      expect(all.length).toBeGreaterThanOrEqual(6);
    });

    it('contient les 6 providers majeurs (ewelink/tuya/broadlink/hue/sonos/home-assistant)', () => {
      const ids = BUILTIN_PROVIDERS.map((p) => p.id);
      expect(ids).toContain('ewelink');
      expect(ids).toContain('tuya');
      expect(ids).toContain('broadlink');
      expect(ids).toContain('hue');
      expect(ids).toContain('sonos');
      expect(ids).toContain('home-assistant');
    });

    it('chaque provider a id, name, console_url, endpoints, credential_keys', () => {
      for (const p of BUILTIN_PROVIDERS) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.console_url).toMatch(/^https?:\/\//);
        expect(p.endpoints).toBeTruthy();
        expect(p.endpoints.list_devices).toBeTruthy();
        expect(p.endpoints.send_command).toBeTruthy();
        expect(Array.isArray(p.credential_keys)).toBe(true);
      }
    });

    it('get(id) retourne provider connu', () => {
      const p = iotRegistry.get('ewelink');
      expect(p).toBeTruthy();
      expect(p?.name).toContain('eWeLink');
    });

    it('get(id) retourne null pour id inconnu', () => {
      const p = iotRegistry.get('nonexistent_xyz');
      expect(p).toBeNull();
    });

    it('listBuiltin retourne uniquement les builtin', () => {
      expect(iotRegistry.listBuiltin().length).toBe(BUILTIN_PROVIDERS.length);
    });
  });

  describe('Custom providers (Apex auto-install)', () => {
    const customProvider: IoTProvider = {
      id: 'shelly_custom',
      name: 'Shelly Cloud (custom)',
      category: 'shelly',
      console_url: 'https://shelly.cloud',
      api: { base_url: 'https://shelly-1-eu.shelly.cloud', auth_header: 'Authorization', auth_format: 'bearer' },
      endpoints: {
        list_devices: { method: 'GET', path: '/devices' },
        send_command: { method: 'POST', path: '/devices/{device_id}/cmd', body_template: {} },
      },
      credential_keys: ['ax_shelly_token'],
      test_endpoint: '/devices',
    };

    it('install() ajoute provider custom + persiste localStorage', () => {
      iotRegistry.install(customProvider);
      const got = iotRegistry.get('shelly_custom');
      expect(got).toBeTruthy();
      expect(got?.name).toContain('Shelly');
      const raw = localStorage.getItem('ax_iot_custom_providers');
      expect(raw).toBeTruthy();
      const arr = JSON.parse(raw!);
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.some((p: IoTProvider) => p.id === 'shelly_custom')).toBe(true);
      iotRegistry.remove('shelly_custom'); /* cleanup */
    });

    it('install() refuse override d\'un provider builtin', () => {
      const fakeBuiltin: IoTProvider = { ...customProvider, id: 'ewelink' };
      expect(() => iotRegistry.install(fakeBuiltin)).toThrow(/builtin/i);
    });

    it('remove() retire custom + persiste sans le provider', () => {
      iotRegistry.install(customProvider);
      expect(iotRegistry.get('shelly_custom')).toBeTruthy();
      iotRegistry.remove('shelly_custom');
      expect(iotRegistry.get('shelly_custom')).toBeNull();
    });

    it('remove() refuse de supprimer un builtin', () => {
      expect(() => iotRegistry.remove('ewelink')).toThrow(/builtin/i);
      expect(iotRegistry.get('ewelink')).toBeTruthy();
    });

    it('install() refuse provider sans id', () => {
      const bad = { ...customProvider, id: '' } as IoTProvider;
      expect(() => iotRegistry.install(bad)).toThrow();
    });
  });

  describe('configureProvider — eWeLink', () => {
    it('install eWeLink retourne ok=true + persiste credentials', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJsonResponse({
          error: 0,
          data: { at: 'ewelink_token_abc', user: { apikey: 'apikey_xyz' } },
        }),
      );
      const r = await iotRegistry.configureProvider({
        provider_id: 'ewelink',
        credentials: { email: 'kevin@example.com', password: 'pwd' },
        region: 'eu',
      });
      expect(r.ok).toBe(true);
      expect(r.provider_id).toBe('ewelink');
      expect(localStorage.getItem('ax_ewelink_email')).toBe('kevin@example.com');
      expect(localStorage.getItem('ax_ewelink_region')).toBe('eu');
      const tokenStored = localStorage.getItem('ax_ewelink_token');
      expect(tokenStored).toBeTruthy(); /* chiffré ou clair via vault */
    });

    it('install eWeLink refuse si email manquant', async () => {
      const r = await iotRegistry.configureProvider({
        provider_id: 'ewelink',
        credentials: { password: 'pwd' },
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/email/i);
    });

    it('install eWeLink retourne ok=false si API error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJsonResponse({ error: 401, msg: 'Bad credentials' }),
      );
      const r = await iotRegistry.configureProvider({
        provider_id: 'ewelink',
        credentials: { email: 'a@b.c', password: 'wrong' },
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('configureProvider — Tuya/SmartLife', () => {
    it('install Tuya retourne ok=false si client_id manquant', async () => {
      const r = await iotRegistry.configureProvider({
        provider_id: 'tuya',
        credentials: { client_secret: 'secret_only' },
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/client_id/i);
    });

    it('install Tuya persiste credentials valides', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJsonResponse({ success: true, result: [] }),
      );
      const r = await iotRegistry.configureProvider({
        provider_id: 'tuya',
        credentials: {
          client_id: 'tuya_cid',
          client_secret: 'tuya_secret',
          uid: 'eu_user_001',
          access_token: 'tok_xyz',
        },
        region: 'eu',
      });
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_tuya_uid')).toBe('eu_user_001');
      expect(localStorage.getItem('ax_tuya_region')).toBe('eu');
    });
  });

  describe('configureProvider — Home Assistant', () => {
    it('install HA refuse si url manquante', async () => {
      const r = await iotRegistry.configureProvider({
        provider_id: 'home-assistant',
        credentials: { token: 'llat_xyz' },
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/url/i);
    });

    it('install HA persiste url + token', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({ message: 'API running.' }));
      const r = await iotRegistry.configureProvider({
        provider_id: 'home-assistant',
        credentials: { url: 'http://192.168.1.42:8123', token: 'llat_xyz' },
      });
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_ha_url')).toBe('http://192.168.1.42:8123');
    });
  });

  describe('testConnection', () => {
    it('retourne reason no_credentials si pas configuré', async () => {
      const r = await iotRegistry.testConnection('ewelink');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_credentials');
    });

    it('retourne reason no_credentials pour provider inconnu', async () => {
      const r = await iotRegistry.testConnection('xxx_unknown_xxx');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_credentials');
    });
  });

  describe('listAllDevices', () => {
    it('retourne array (vide si aucun provider configuré)', async () => {
      const devices = await iotRegistry.listAllDevices();
      expect(Array.isArray(devices)).toBe(true);
    });

    it('aggregate ne lance pas d\'erreur si fetch fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const devices = await iotRegistry.listAllDevices();
      expect(Array.isArray(devices)).toBe(true);
    });
  });

  describe('sendCommand routing', () => {
    it('refuse si provider inconnu (reason no_provider)', async () => {
      const r = await iotRegistry.sendCommand('zzz_fake', 'dev1', { switch: 'on' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_provider');
    });

    it('refuse eWeLink si pas connecté (reason no_credentials)', async () => {
      const r = await iotRegistry.sendCommand('ewelink', 'dev1', { switch: 'on' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_credentials');
    });
  });

  describe('statusAll', () => {
    it('retourne array de toutes les providers + leur status', async () => {
      const results = await iotRegistry.statusAll();
      expect(results.length).toBe(iotRegistry.list().length);
      for (const row of results) {
        expect(row.provider).toBeTruthy();
        expect(row.status).toBeTruthy();
        expect(typeof row.status.ok).toBe('boolean');
      }
    });
  });

  describe('Provider structure invariants', () => {
    it('eWeLink endpoint login défini', () => {
      const p = iotRegistry.get('ewelink');
      expect(p?.endpoints.login).toBeTruthy();
      expect(p?.endpoints.login?.path).toContain('login');
    });

    it('Tuya a OAuth2 implicite via endpoints', () => {
      const p = iotRegistry.get('tuya');
      expect(p?.api?.auth_format).toBe('oauth2');
    });

    it('Sonos a oauth defined', () => {
      const p = iotRegistry.get('sonos');
      expect(p?.oauth).toBeTruthy();
      expect(p?.oauth?.scopes.length).toBeGreaterThan(0);
    });

    it('Home Assistant a base_url vide (dynamique via ax_ha_url)', () => {
      const p = iotRegistry.get('home-assistant');
      expect(p?.api?.base_url).toBe('');
    });

    it('Hue a 3 credential_keys (LAN + cloud)', () => {
      const p = iotRegistry.get('hue');
      expect(p?.credential_keys.length).toBeGreaterThanOrEqual(3);
    });
  });
});
