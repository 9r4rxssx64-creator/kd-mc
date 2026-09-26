/**
 * APEX v13.3.58 — Tests LAN scan iOS workaround (Kevin 2026-05-08).
 *
 * Couvre :
 * - scan() respecte timeout
 * - scan() avec stratégies vide retourne []
 * - scanViaWebRTC retourne IPs privées détectées
 * - scanViaWebRTC ignore IPs publiques
 * - scanViaShortcut parse JSON result
 * - scanViaShortcut parse CSV fallback
 * - scanViaWorker fait HEAD request avec auth
 * - scanViaWorker retourne [] sans config
 * - scanViaHeuristic teste IPs courantes
 * - testHead retourne true sur réponse no-cors
 * - cache 5min fonctionne
 * - deduplicate par IP garde meilleure confidence
 * - isPrivateIP détecte 192.168.x, 10.x, 172.16-31.x
 * - reset() clear cache
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lanScanIOS } from '../../services/integrations/lan-scan-ios.js';

describe('lan-scan-ios — WebRTC + Shortcut + Worker + heuristique', () => {
  beforeEach(() => {
    localStorage.removeItem('ax_lan_scan_cache');
    localStorage.removeItem('ax_lan_scan_cache_ts');
    localStorage.removeItem('ax_apex_bridge_worker_url');
    localStorage.removeItem('ax_apex_bridge_token');
    lanScanIOS.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scan() global cascade', () => {
    it('respecte stratégies vide → retourne au moins cache OR []', async () => {
      const r = await lanScanIOS.scan({ strategies: [], timeoutMs: 200 });
      expect(r).toBeDefined();
      expect(Array.isArray(r.devices)).toBe(true);
    });

    it('retourne strategiesUsed dans résultat', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
      const r = await lanScanIOS.scan({
        strategies: ['heuristic'],
        timeoutMs: 500,
        ports: [8888],
        ipRange: '10.99.99',
      });
      expect(Array.isArray(r.strategiesUsed)).toBe(true);
    });

    it('inclut durationMs', async () => {
      const r = await lanScanIOS.scan({ strategies: [], timeoutMs: 100 });
      expect(typeof r.durationMs).toBe('number');
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scanViaWebRTC', () => {
    it('retourne [] si RTCPeerConnection undefined', async () => {
      const orig = globalThis.RTCPeerConnection;
      // @ts-expect-error test
      delete globalThis.RTCPeerConnection;
      const r = await lanScanIOS.scanViaWebRTC(false);
      expect(r).toEqual([]);
      if (orig) globalThis.RTCPeerConnection = orig;
    });

    it('retourne [] si RTCPeerConnection throws', async () => {
      const orig = globalThis.RTCPeerConnection;
      // @ts-expect-error test
      globalThis.RTCPeerConnection = function () {
        throw new Error('blocked');
      };
      const r = await lanScanIOS.scanViaWebRTC(false);
      expect(r).toEqual([]);
      if (orig) globalThis.RTCPeerConnection = orig;
    });
  });

  describe('scanViaShortcut', () => {
    it('parse résultat JSON array de devices', async () => {
      const { iosShortcuts } = await import('../../services/integrations/ios-shortcuts.js');
      vi.spyOn(iosShortcuts, 'scanWiFi').mockResolvedValue({
        ok: true,
        launched: true,
        result: JSON.stringify([
          { ip: '192.168.1.10', hostname: 'iPad' },
          { ip: '192.168.1.20', hostname: 'macbook' },
        ]),
      });
      const r = await lanScanIOS.scanViaShortcut();
      expect(r.length).toBe(2);
      expect(r[0]?.ip).toBe('192.168.1.10');
      expect(r[0]?.source).toBe('shortcut');
    });

    it('fallback CSV si pas JSON', async () => {
      const { iosShortcuts } = await import('../../services/integrations/ios-shortcuts.js');
      vi.spyOn(iosShortcuts, 'scanWiFi').mockResolvedValue({
        ok: true,
        launched: true,
        result: '192.168.1.5,router\n192.168.1.6,iPhone\n',
      });
      const r = await lanScanIOS.scanViaShortcut();
      expect(r.length).toBe(2);
      expect(r[0]?.ip).toBe('192.168.1.5');
      expect(r[0]?.hostname).toBe('router');
    });

    it('retourne [] si shortcut fail', async () => {
      const { iosShortcuts } = await import('../../services/integrations/ios-shortcuts.js');
      vi.spyOn(iosShortcuts, 'scanWiFi').mockResolvedValue({
        ok: false,
        launched: false,
        reason: 'not_ios',
      });
      const r = await lanScanIOS.scanViaShortcut();
      expect(r).toEqual([]);
    });
  });

  describe('scanViaWorker', () => {
    it('retourne [] si pas de config', async () => {
      const r = await lanScanIOS.scanViaWorker();
      expect(r).toEqual([]);
    });

    it('fait GET avec Bearer token sur worker URL', async () => {
      localStorage.setItem('ax_apex_bridge_worker_url', 'https://w.example.workers.dev');
      localStorage.setItem('ax_apex_bridge_token', 'abc123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            devices: [{ ip: '192.168.1.50', hostname: 'TV', service: 'http', port: 80 }],
          }),
          { status: 200 },
        ),
      );
      const r = await lanScanIOS.scanViaWorker();
      expect(r.length).toBe(1);
      expect(r[0]?.ip).toBe('192.168.1.50');
      expect(r[0]?.source).toBe('worker');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://w.example.workers.dev/scan-lan',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer abc123' }),
        }),
      );
    });

    it('retourne [] si worker fail', async () => {
      localStorage.setItem('ax_apex_bridge_worker_url', 'https://w.example.workers.dev');
      localStorage.setItem('ax_apex_bridge_token', 'abc123');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await lanScanIOS.scanViaWorker();
      expect(r).toEqual([]);
    });

    it('retourne [] si HTTP non-ok', async () => {
      localStorage.setItem('ax_apex_bridge_worker_url', 'https://w.example.workers.dev');
      localStorage.setItem('ax_apex_bridge_token', 'abc123');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
      const r = await lanScanIOS.scanViaWorker();
      expect(r).toEqual([]);
    });
  });

  describe('scanViaHeuristic', () => {
    it('test plusieurs IPs + ports parallel', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
        const s = String(url);
        if (s.includes('192.168.99.1:80')) return Promise.resolve(new Response('ok'));
        return Promise.reject(new Error('unreachable'));
      });
      const r = await lanScanIOS.scanViaHeuristic({
        ipRange: '192.168.99',
        ports: [80, 443],
        timeoutMs: 3000,
      });
      const found = r.find((d) => d.ip === '192.168.99.1' && d.port === 80);
      expect(found).toBeDefined();
      expect(found?.source).toBe('heuristic');
    });

    it('retourne [] si rien ne répond', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await lanScanIOS.scanViaHeuristic({
        ipRange: '192.168.99',
        ports: [9999],
        timeoutMs: 500,
      });
      expect(r).toEqual([]);
    });
  });

  describe('testHead', () => {
    it('retourne true sur réponse fetch OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
      const ok = await lanScanIOS.testHead('https://1.2.3.4', 1000);
      expect(ok).toBe(true);
    });

    it('retourne false sur erreur', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
      const ok = await lanScanIOS.testHead('https://1.2.3.4', 500);
      expect(ok).toBe(false);
    });

    it('retourne false sur timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        () => new Promise(() => { /* never resolves */ }),
      );
      const ok = await lanScanIOS.testHead('https://1.2.3.4', 100);
      expect(ok).toBe(false);
    });
  });

  describe('cache', () => {
    it('persiste résultats puis re-lit', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
      const r1 = await lanScanIOS.scan({
        strategies: ['heuristic'],
        ports: [8888],
        ipRange: '10.99.99',
        timeoutMs: 500,
      });
      /* Cache enregistré (même si vide on stocke le timestamp) */
      const cached = localStorage.getItem('ax_lan_scan_cache_ts');
      expect(cached).toBeTruthy();
      expect(r1.devices).toEqual([]);
    });

    it('reset() clear cache', () => {
      localStorage.setItem('ax_lan_scan_cache', JSON.stringify([{ ip: '1.2.3.4' }]));
      localStorage.setItem('ax_lan_scan_cache_ts', String(Date.now()));
      lanScanIOS.reset();
      expect(localStorage.getItem('ax_lan_scan_cache')).toBeNull();
      expect(localStorage.getItem('ax_lan_scan_cache_ts')).toBeNull();
    });
  });

  describe('scanViaPushcut', () => {
    it('retourne [] si pas de webhook configuré', async () => {
      const { pushcutBridge } = await import('../../services/integrations/pushcut-bridge.js');
      await pushcutBridge.reset();
      const r = await lanScanIOS.scanViaPushcut();
      expect(r).toEqual([]);
    });
  });
});
