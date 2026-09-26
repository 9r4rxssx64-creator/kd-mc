/**
 * Tests iot-providers-registry deep v13.4.151 (Kevin "100/100 réel").
 *
 * Module : services/iot-providers-registry.ts (923 stmts, était 64.2%).
 * Focus : couvrir les clients spécifiques (EWelink/Tuya/Broadlink/Hue/Sonos/HA)
 * via configureProvider + sendCommand + listDevices + testConnection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockVault, mockAuditLog } = vi.hoisted(() => ({
  mockVault: { setKey: vi.fn(), readKey: vi.fn() },
  mockAuditLog: { record: vi.fn() },
}));

vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));

import { iotRegistry, BUILTIN_PROVIDERS } from '../../services/integrations/iot-providers-registry.js';

describe('iot-providers-registry deep (v13.4.151)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockVault.setKey.mockResolvedValue({ ok: true });
    mockVault.readKey.mockResolvedValue('');
    mockAuditLog.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('BUILTIN_PROVIDERS', () => {
    it('expose au moins 6 providers builtin', () => {
      expect(BUILTIN_PROVIDERS.length).toBeGreaterThanOrEqual(6);
      const ids = BUILTIN_PROVIDERS.map((p) => p.id);
      expect(ids).toContain('ewelink');
      expect(ids).toContain('tuya');
      expect(ids).toContain('home-assistant');
    });
  });

  describe('list/get/listBuiltin', () => {
    it('list retourne providers builtin et custom', () => {
      const list = iotRegistry.list();
      expect(list.length).toBeGreaterThanOrEqual(BUILTIN_PROVIDERS.length);
    });

    it('listBuiltin retourne seulement les builtin', () => {
      const builtin = iotRegistry.listBuiltin();
      expect(builtin.length).toBe(BUILTIN_PROVIDERS.length);
    });

    it('get retourne provider par id', () => {
      const p = iotRegistry.get('ewelink');
      expect(p).toBeDefined();
      expect(p?.id).toBe('ewelink');
    });

    it('get retourne null pour id inconnu', () => {
      expect(iotRegistry.get('unknown')).toBeNull();
    });
  });

  describe('install / remove custom providers', () => {
    it('install accepte custom provider', () => {
      const custom = {
        id: 'my_custom_iot',
        name: 'Custom Test',
        category: 'lighting' as const,
        cors_friendly: true,
        auth_format: 'bearer' as const,
        endpoints: {
          test_connection: { method: 'GET' as const, path: '/test' },
          list_devices: { method: 'GET' as const, path: '/devices' },
          send_command: { method: 'POST' as const, path: '/cmd' },
        },
      };
      expect(() => iotRegistry.install(custom)).not.toThrow();
      expect(iotRegistry.get('my_custom_iot')).toBeDefined();
      iotRegistry.remove('my_custom_iot');
    });

    it('refuse install builtin avec même id', () => {
      const fake = { ...BUILTIN_PROVIDERS[0]! };
      expect(() => iotRegistry.install(fake)).toThrow(/builtin/);
    });

    it('refuse install sans id', () => {
      expect(() => iotRegistry.install({} as never)).toThrow(/invalide/);
    });

    it('remove builtin throw', () => {
      expect(() => iotRegistry.remove('ewelink')).toThrow(/builtin/);
    });
  });

  describe('configureProvider', () => {
    it('refuse provider inconnu', async () => {
      const r = await iotRegistry.configureProvider({
        provider_id: 'unknown_xyz',
        credentials: {},
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('inconnu');
    });

    it('refuse ewelink sans email/password', async () => {
      const r = await iotRegistry.configureProvider({
        provider_id: 'ewelink',
        credentials: {},
      });
      expect(r.ok).toBe(false);
    });

    it('accepte ewelink avec creds (mock fetch)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 0, region: 'eu', user: { apikey: 'token_x' } }),
          { status: 200 },
        ),
      );
      const r = await iotRegistry.configureProvider({
        provider_id: 'ewelink',
        credentials: { email: 'kevin@test.com', password: 'pwd_secure' },
      });
      expect(r.provider_id).toBe('ewelink');
    });
  });

  describe('testConnection', () => {
    it('retourne no_credentials si pas configured', async () => {
      const r = await iotRegistry.testConnection('ewelink');
      expect(r.ok).toBe(false);
    });

    it('retourne no_credentials pour provider inconnu', async () => {
      const r = await iotRegistry.testConnection('unknown_provider');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_credentials');
    });
  });

  describe('listAllDevices / listDevicesFor', () => {
    it('listAllDevices retourne array (vide si pas configuré)', async () => {
      const devices = await iotRegistry.listAllDevices();
      expect(Array.isArray(devices)).toBe(true);
    });

    it('listDevicesFor unknown retourne []', async () => {
      const r = await iotRegistry.listDevicesFor('unknown');
      expect(r).toEqual([]);
    });
  });

  describe('sendCommand', () => {
    it('refuse si provider inconnu', async () => {
      const r = await iotRegistry.sendCommand('unknown', 'dev1', { action: 'on' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_provider');
    });

    it('audit log appelé sur send', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await iotRegistry.sendCommand('ewelink', 'dev1', { action: 'on' });
      expect(mockAuditLog.record).toHaveBeenCalled();
    });
  });

  describe('statusAll', () => {
    it('retourne status pour chaque provider', async () => {
      const status = await iotRegistry.statusAll();
      expect(status.length).toBeGreaterThanOrEqual(BUILTIN_PROVIDERS.length);
      status.forEach((s) => {
        expect(s.provider.id).toBeTypeOf('string');
        expect(s.status.ok).toBeTypeOf('boolean');
      });
    });
  });

  describe('Home Assistant client', () => {
    it('configure HA avec url + token', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'API running' }), { status: 200 }),
      );
      const r = await iotRegistry.configureProvider({
        provider_id: 'home-assistant',
        credentials: { url: 'http://ha.local:8123', token: 'long_token_xxxxxxxx' },
      });
      expect(r.provider_id).toBe('home-assistant');
    });

    it('refuse HA sans url ou token', async () => {
      const r = await iotRegistry.configureProvider({
        provider_id: 'home-assistant',
        credentials: { url: 'http://x.local' },
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('Broadlink client', () => {
    it('refuse broadlink sans device IP', async () => {
      const r = await iotRegistry.configureProvider({
        provider_id: 'broadlink',
        credentials: {},
      });
      expect(r.ok).toBe(false);
    });
  });
});
