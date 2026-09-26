/**
 * APEX v13.3.51 — Tests Broadlink Bridge (Kevin 2026-05-07).
 *
 * Couvre :
 * - login → success retourne token, persist storage
 * - login → status non-zero retourne error
 * - login → fetch fail (network) retourne reason 'network'
 * - listDevices → cache 5min
 * - listDevices → no token retourne []
 * - sendIR → no token retourne reason 'no_token'
 * - sendIR → success
 * - setToken → persist + retourne ok
 * - reset → clear storage
 * - status → snapshot configured/email/count
 * - getCommonTVCodeNames → liste keys
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { broadlinkBridge } from '../../services/integrations/broadlink-bridge.js';

const STORAGE_KEYS = [
  'ax_broadlink_token',
  'ax_broadlink_email',
  'ax_broadlink_userid',
  'ax_smart_devices',
  'ax_broadlink_proxy_url',
];

function mockJsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  });
}

describe('broadlink-bridge — Cloud API + IR control', () => {
  beforeEach(() => {
    for (const k of STORAGE_KEYS) localStorage.removeItem(k);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login()', () => {
    it('retourne ok=true + persiste token sur success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJsonResponse({
          status: 0,
          data: { loginsession: 'tok_abc123', userid: 'u_001' },
        }),
      );
      const r = await broadlinkBridge.login('kevin@example.com', 'pwd');
      expect(r.ok).toBe(true);
      expect(r.token).toBe('tok_abc123');
      expect(r.userId).toBe('u_001');
      expect(localStorage.getItem('ax_broadlink_email')).toBe('kevin@example.com');
      expect(localStorage.getItem('ax_broadlink_userid')).toBe('u_001');
      /* Token persisté (chiffré ou clair via vault.setKey) */
      const stored = localStorage.getItem('ax_broadlink_token');
      expect(stored).toBeTruthy();
    });

    it('retourne error sur status non-zero', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJsonResponse({ status: 1, msg: 'Bad credentials' }),
      );
      const r = await broadlinkBridge.login('a@b.c', 'wrong');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Bad credentials');
    });

    it('retourne error sur fetch fail (network)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
      const r = await broadlinkBridge.login('a@b.c', 'x');
      expect(r.ok).toBe(false);
    });

    it('rejette si email ou password vide', async () => {
      const r1 = await broadlinkBridge.login('', 'x');
      expect(r1.ok).toBe(false);
      const r2 = await broadlinkBridge.login('a@b', '');
      expect(r2.ok).toBe(false);
    });
  });

  describe('setToken()', () => {
    it('persiste token sans login + retourne ok', async () => {
      const r = await broadlinkBridge.setToken('tok_direct', 'kevin@x.com');
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_broadlink_email')).toBe('kevin@x.com');
      expect(localStorage.getItem('ax_broadlink_token')).toBeTruthy();
    });

    it('rejette si token vide', async () => {
      const r = await broadlinkBridge.setToken('');
      expect(r.ok).toBe(false);
    });
  });

  describe('listDevices()', () => {
    it('retourne [] si pas de token', async () => {
      const list = await broadlinkBridge.listDevices(true);
      expect(list).toEqual([]);
    });

    it('retourne devices depuis API + cache', async () => {
      await broadlinkBridge.setToken('tok_test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJsonResponse({
          status: 0,
          data: {
            endpoints: [
              { endpointId: 'd1', friendlyname: 'Salon RM Pro', productname: 'rm_pro', mac: 'AA:BB:CC', online: true },
              { endpointId: 'd2', friendlyname: 'Lampe SP', productname: 'sp2', mac: 'DD:EE:FF', online: false },
            ],
          },
        }),
      );
      const list = await broadlinkBridge.listDevices(true);
      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe('d1');
      expect(list[0]?.type).toBe('rm');
      expect(list[1]?.type).toBe('sp');
      expect(list[0]?.online).toBe(true);
      expect(list[1]?.online).toBe(false);
    });

    it('utilise cache si force_refresh=false (cache <5min)', async () => {
      await broadlinkBridge.setToken('tok_cache');
      const cachedDevices = [
        { id: 'cached_1', name: 'Cached', mac: '00', type: 'rm' as const, online: true },
      ];
      localStorage.setItem(
        'ax_smart_devices',
        JSON.stringify({ devices: cachedDevices, ts: Date.now() }),
      );
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const list = await broadlinkBridge.listDevices(false);
      expect(list).toEqual(cachedDevices);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendIR()', () => {
    it('retourne reason=no_token si pas de token', async () => {
      const r = await broadlinkBridge.sendIR('d1', 'aabb');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_token');
    });

    it('retourne reason=invalid_device si deviceId ou irHex vide', async () => {
      await broadlinkBridge.setToken('tok');
      const r1 = await broadlinkBridge.sendIR('', 'aa');
      expect(r1.ok).toBe(false);
      expect(r1.reason).toBe('invalid_device');
      const r2 = await broadlinkBridge.sendIR('d1', '');
      expect(r2.ok).toBe(false);
      expect(r2.reason).toBe('invalid_device');
    });

    it('retourne ok=true sur API success', async () => {
      await broadlinkBridge.setToken('tok_send');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({ status: 0 }));
      const r = await broadlinkBridge.sendIR('d1', '26008c00');
      expect(r.ok).toBe(true);
    });

    it('retourne error sur status non-zero', async () => {
      await broadlinkBridge.setToken('tok_send');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({ status: 5, msg: 'IR failed' }));
      const r = await broadlinkBridge.sendIR('d1', '26008c00');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('IR failed');
    });
  });

  describe('learned codes cache', () => {
    it('saveLearnedCode + getLearnedCodes round-trip', async () => {
      broadlinkBridge.saveLearnedCode('d1', 'tv_power', 'aabbcc');
      broadlinkBridge.saveLearnedCode('d1', 'tv_volup', 'ddeeff');
      const codes = await broadlinkBridge.getLearnedCodes('d1');
      expect(codes).toHaveLength(2);
      expect(codes.find((c) => c.name === 'tv_power')?.ir_hex).toBe('aabbcc');
      expect(codes.find((c) => c.name === 'tv_volup')?.ir_hex).toBe('ddeeff');
    });

    it('saveLearnedCode replace si même name', () => {
      broadlinkBridge.saveLearnedCode('d2', 'power', 'old');
      broadlinkBridge.saveLearnedCode('d2', 'power', 'new');
      const raw = localStorage.getItem('ax_broadlink_ir_d2') ?? '[]';
      const arr = JSON.parse(raw) as Array<{ name: string; ir_hex: string }>;
      expect(arr).toHaveLength(1);
      expect(arr[0]?.ir_hex).toBe('new');
    });

    it('getLearnedCodes [] si device inconnu', async () => {
      const codes = await broadlinkBridge.getLearnedCodes('inexistant');
      expect(codes).toEqual([]);
    });
  });

  describe('status() + reset()', () => {
    it('status reflète configuration vide initialement', async () => {
      const s = await broadlinkBridge.status();
      expect(s.configured).toBe(false);
      expect(s.deviceCount).toBe(0);
    });

    it('status reflète configuré après setToken', async () => {
      await broadlinkBridge.setToken('tok_status', 'me@x.com');
      const s = await broadlinkBridge.status();
      expect(s.configured).toBe(true);
      expect(s.email).toBe('me@x.com');
    });

    it('reset clear storage', async () => {
      await broadlinkBridge.setToken('tok', 'a@b.c');
      localStorage.setItem('ax_broadlink_userid', 'u1');
      localStorage.setItem('ax_smart_devices', JSON.stringify({ devices: [], ts: 0 }));
      await broadlinkBridge.reset();
      const s = await broadlinkBridge.status();
      expect(s.configured).toBe(false);
      expect(localStorage.getItem('ax_broadlink_email')).toBeNull();
      expect(localStorage.getItem('ax_broadlink_userid')).toBeNull();
      expect(localStorage.getItem('ax_smart_devices')).toBeNull();
    });
  });

  describe('getCommonTVCodeNames()', () => {
    it('retourne liste de codes TV génériques', () => {
      const names = broadlinkBridge.getCommonTVCodeNames();
      expect(names).toContain('power');
      expect(names).toContain('vol_up');
      expect(names.length).toBeGreaterThanOrEqual(5);
    });
  });
});
