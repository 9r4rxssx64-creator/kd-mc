/**
 * APEX v13.3.58 — LAN scan iOS workaround (Kevin 2026-05-08).
 *
 * Demande Kevin : "Ajoute toi des outils ou fonctions dédiés pour débloquer ou
 * faire autrement sur iOS. Cherche, pousse plus loin"
 *
 * STRATÉGIE F — WebRTC ICE workaround pour iOS Safari
 *
 * Problème :
 * - iOS Safari bloque WebRTC ICE local par défaut (privacy)
 * - Donc impossible de scanner IP locale via candidate srflx
 * - Kevin ne peut pas découvrir devices LAN (TV, Hue Bridge, NAS) depuis Apex iOS
 *
 * Stratégies de contournement (cascade) :
 *
 * 1. WebRTC avec geste user (autorisation caméra/micro débloque ICE partiel)
 *    - Si user a déjà autorisé caméra/micro → ICE peut leak local IP
 *    - Demander geste user explicite "Autoriser scan réseau ?"
 *
 * 2. Délégation à Pushcut/Shortcut (apex_wifi_scan)
 *    - Apple Shortcuts a accès Network framework natif
 *    - Liste réseaux WiFi + devices Bonjour/mDNS via shortcut
 *
 * 3. Délégation à Cloudflare Worker bridge (si Kevin a tunnel sur LAN)
 *    - Worker tourne sur réseau Kevin via tunnel Cloudflare
 *    - Expose endpoint /scan-lan qui scan UDP/mDNS server-side
 *
 * 4. Heuristique : test direct IPs courantes (192.168.1.X, 192.168.0.X)
 *    - HEAD HTTPS sur ports communs (80, 443, 8080, 8123 pour HA, etc.)
 *    - Très lent mais fonctionne sur tout navigateur
 *
 * Résultat : array de devices détectés avec confidence score.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { iosShortcuts } from './ios-shortcuts.js';
import { pushcutBridge } from './pushcut-bridge.js';

/* ============================================================================
 * Types
 * ============================================================================ */

export interface LANDevice {
  ip: string;
  hostname?: string;
  port?: number;
  /** Service détecté (http, https, ssh, mdns, hue, hass, etc.) */
  service?: string;
  /** Confiance détection (0-100) */
  confidence: number;
  /** Stratégie qui a détecté ce device */
  source: 'webrtc' | 'shortcut' | 'worker' | 'heuristic' | 'cache';
  /** Réponse HEAD (status code) */
  reachable?: boolean;
  /** Timestamp détection */
  detectedAt: number;
}

export interface LANScanOptions {
  /** Timeout total (ms) */
  timeoutMs?: number;
  /** Stratégies à tenter (default: toutes) */
  strategies?: Array<'webrtc' | 'shortcut' | 'worker' | 'heuristic'>;
  /** Plage IP à tester en heuristique (default: 192.168.1.0/24) */
  ipRange?: string;
  /** Ports à tester en heuristique */
  ports?: number[];
  /** Si true, demande geste user pour WebRTC (sinon skip si pas autorisé) */
  promptUserGesture?: boolean;
}

export interface LANScanResult {
  ok: boolean;
  devices: LANDevice[];
  strategiesUsed: string[];
  durationMs: number;
  error?: string;
}

/* ============================================================================
 * Constantes
 * ============================================================================ */

const STORAGE_CACHE = 'ax_lan_scan_cache';
const STORAGE_CACHE_TTL = 'ax_lan_scan_cache_ts';
const CACHE_TTL_MS = 5 * 60 * 1000; /* 5 min */
const DEFAULT_TIMEOUT = 15_000;
const COMMON_PORTS = [80, 443, 8080, 8123, 1880, 32400, 8443];

/* Patterns de détection services courants */
const SERVICE_SIGNATURES: Record<number, string> = {
  80: 'http',
  443: 'https',
  8080: 'http-alt',
  8123: 'home-assistant',
  1880: 'node-red',
  32400: 'plex',
  8443: 'https-alt',
};

/* ============================================================================
 * Helpers
 * ============================================================================ */

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua);
  const isiPadOS = /Mac/.test(ua) && navigator.maxTouchPoints > 1;
  return isiOS || isiPadOS;
}

/* ============================================================================
 * Service
 * ============================================================================ */

class LANScanIOS {
  /**
   * Scan complet en cascade : essaie les stratégies dans l'ordre.
   * Retourne tous les devices détectés (deduplicated).
   */
  async scan(opts: LANScanOptions = {}): Promise<LANScanResult> {
    const startTs = Date.now();
    const strategies = opts.strategies ?? ['webrtc', 'shortcut', 'worker', 'heuristic'];
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    const used: string[] = [];
    const all: LANDevice[] = [];

    void auditLog.record('lan_scan_ios.start', { details: { strategies } });

    /* 0. Cache check */
    const cached = this.readCache();
    if (cached.length > 0) {
      all.push(...cached);
      used.push('cache');
    }

    /* 1. WebRTC avec geste user */
    if (strategies.includes('webrtc')) {
      try {
        const webrtcDevices = await this.scanViaWebRTC(opts.promptUserGesture ?? false);
        if (webrtcDevices.length > 0) {
          all.push(...webrtcDevices);
          used.push('webrtc');
        }
      } catch (e) {
        logger.warn('lan-scan-ios', 'webrtc failed', { err: String(e) });
      }
    }

    /* 2. Shortcut iOS (apex_wifi_scan) */
    if (strategies.includes('shortcut') && isIOSSafari()) {
      try {
        const sd = await this.scanViaShortcut();
        if (sd.length > 0) {
          all.push(...sd);
          used.push('shortcut');
        }
      } catch (e) {
        logger.warn('lan-scan-ios', 'shortcut failed', { err: String(e) });
      }
    }

    /* 3. Cloudflare Worker bridge (server-side scan) */
    if (strategies.includes('worker')) {
      try {
        const wd = await this.scanViaWorker();
        if (wd.length > 0) {
          all.push(...wd);
          used.push('worker');
        }
      } catch (e) {
        logger.warn('lan-scan-ios', 'worker failed', { err: String(e) });
      }
    }

    /* 4. Heuristique HEAD requests (lent mais marche partout) */
    if (strategies.includes('heuristic')) {
      try {
        const hd = await this.scanViaHeuristic({
          ipRange: opts.ipRange ?? '192.168.1',
          ports: opts.ports ?? COMMON_PORTS,
          timeoutMs: Math.min(timeoutMs - (Date.now() - startTs), 8000),
        });
        if (hd.length > 0) {
          all.push(...hd);
          used.push('heuristic');
        }
      } catch (e) {
        logger.warn('lan-scan-ios', 'heuristic failed', { err: String(e) });
      }
    }

    /* Deduplication par IP */
    const deduped = this.deduplicate(all);
    this.writeCache(deduped);

    const durationMs = Date.now() - startTs;
    void auditLog.record('lan_scan_ios.complete', {
      details: { count: deduped.length, durationMs, strategies: used },
    });

    return {
      ok: deduped.length > 0,
      devices: deduped,
      strategiesUsed: used,
      durationMs,
    };
  }

  /**
   * Stratégie 1 : WebRTC ICE leak local IP.
   * Sur iOS, fonctionne SI user a accordé permission caméra/micro récemment.
   * Sinon retourne [] sans crasher.
   */
  async scanViaWebRTC(promptGesture: boolean): Promise<LANDevice[]> {
    if (typeof RTCPeerConnection === 'undefined') return [];
    return new Promise((resolve) => {
      const devices: LANDevice[] = [];
      const seen = new Set<string>();
      let pc: RTCPeerConnection | null = null;
      const cleanup = (): void => {
        if (pc) {
          try { pc.close(); } catch { /* ignore */ }
          pc = null;
        }
      };
      const timeout = setTimeout(() => {
        cleanup();
        resolve(devices);
      }, 3000);

      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('apex-lan-scan');
        pc.onicecandidate = (e): void => {
          if (!e.candidate) {
            clearTimeout(timeout);
            cleanup();
            resolve(devices);
            return;
          }
          const cand = e.candidate.candidate || '';
          /* Match IPv4 dans candidate string */
          const match = cand.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (match) {
            const ip = match[1];
            if (ip && !seen.has(ip) && this.isPrivateIP(ip)) {
              seen.add(ip);
              devices.push({
                ip,
                confidence: 60,
                source: 'webrtc',
                detectedAt: Date.now(),
              });
            }
          }
        };
        pc.createOffer().then((offer) => pc?.setLocalDescription(offer)).catch(() => {
          clearTimeout(timeout);
          cleanup();
          resolve(devices);
        });
      } catch {
        clearTimeout(timeout);
        cleanup();
        resolve(devices);
      }

      /* Si user gesture promptGesture, on peut essayer permission après navigator.mediaDevices.getUserMedia */
      if (promptGesture && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            for (const t of stream.getTracks()) t.stop();
          })
          .catch(() => { /* user refused */ });
      }
    });
  }

  /**
   * Stratégie 2 : délègue à Apple Shortcuts via apex_wifi_scan.
   */
  async scanViaShortcut(): Promise<LANDevice[]> {
    const r = await iosShortcuts.scanWiFi();
    if (!r.ok || !r.result) return [];
    /* Format attendu : JSON array [{ip, hostname, ssid}] OU CSV */
    try {
      const arr = JSON.parse(r.result);
      if (Array.isArray(arr)) {
        return arr.map((d: { ip?: string; hostname?: string }, i: number): LANDevice => ({
          ip: d.ip || `unknown-${i}`,
          ...(d.hostname && { hostname: d.hostname }),
          confidence: 85,
          source: 'shortcut',
          detectedAt: Date.now(),
        }));
      }
    } catch { /* not JSON */ }
    /* Fallback CSV parsing */
    const lines = r.result.split(/\r?\n/).filter(Boolean);
    const out: LANDevice[] = [];
    for (const line of lines) {
      const [ip, hostname] = line.split(',').map((s) => s.trim());
      if (!ip) continue;
      const dev: LANDevice = {
        ip,
        confidence: 75,
        source: 'shortcut',
        detectedAt: Date.now(),
      };
      if (hostname) dev.hostname = hostname;
      out.push(dev);
    }
    return out;
  }

  /**
   * Stratégie 3 : Cloudflare Worker bridge (si déployé sur LAN Kevin).
   */
  async scanViaWorker(): Promise<LANDevice[]> {
    const workerUrl = localStorage.getItem('ax_apex_bridge_worker_url');
    const token = localStorage.getItem('ax_apex_bridge_token');
    if (!workerUrl || !token) return [];
    try {
      const resp = await fetch(`${workerUrl.replace(/\/$/, '')}/scan-lan`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      if (!Array.isArray(data?.devices)) return [];
      return (data.devices as Array<{ ip?: string; hostname?: string; service?: string; port?: number }>).map(
        (d): LANDevice => ({
          ip: d.ip || 'unknown',
          ...(d.hostname && { hostname: d.hostname }),
          ...(d.service && { service: d.service }),
          ...(d.port !== undefined && { port: d.port }),
          confidence: 90,
          source: 'worker',
          detectedAt: Date.now(),
        }),
      );
    } catch (e) {
      logger.debug('lan-scan-ios', 'worker unreachable', { err: String(e) });
      return [];
    }
  }

  /**
   * Stratégie 4 : heuristique HEAD requests sur ports courants.
   * Lente (~5-10s) mais fonctionne sur tout navigateur sans permission.
   */
  async scanViaHeuristic(opts: { ipRange: string; ports: number[]; timeoutMs: number }): Promise<LANDevice[]> {
    const devices: LANDevice[] = [];
    const startTs = Date.now();
    /* On ne teste qu'un sous-ensemble pour pas spammer (router .1, gateway, .254) */
    const ipsToTest = ['1', '254', '100', '101', '2', '50'];
    const tasks: Promise<void>[] = [];
    for (const lastOctet of ipsToTest) {
      for (const port of opts.ports) {
        if (Date.now() - startTs > opts.timeoutMs) break;
        const ip = `${opts.ipRange}.${lastOctet}`;
        const protocol = port === 443 || port === 8443 ? 'https' : 'http';
        const url = `${protocol}://${ip}:${port}/`;
        tasks.push(
          this.testHead(url, 1500).then((reachable) => {
            if (reachable) {
              devices.push({
                ip,
                port,
                service: SERVICE_SIGNATURES[port] || 'http',
                confidence: 70,
                source: 'heuristic',
                reachable: true,
                detectedAt: Date.now(),
              });
            }
          }),
        );
      }
    }
    await Promise.all(tasks);
    return devices;
  }

  /**
   * Helper : test HEAD request avec timeout court.
   * Sur HTTP sans CORS, on peut quand même savoir si le serveur répond
   * (fetch erreur réseau différente de CORS error).
   */
  async testHead(url: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const ac = new AbortController();
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        ac.abort();
        resolve(false);
      }, timeoutMs);
      fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ac.signal })
        .then(() => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(true);
        })
        .catch(() => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(false);
        });
    });
  }

  /**
   * Lit cache si valide (TTL 5 min).
   */
  private readCache(): LANDevice[] {
    try {
      const ts = Number(localStorage.getItem(STORAGE_CACHE_TTL) ?? 0);
      if (Date.now() - ts > CACHE_TTL_MS) return [];
      const raw = localStorage.getItem(STORAGE_CACHE);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private writeCache(devices: LANDevice[]): void {
    try {
      localStorage.setItem(STORAGE_CACHE, JSON.stringify(devices));
      localStorage.setItem(STORAGE_CACHE_TTL, String(Date.now()));
    } catch { /* quota */ }
  }

  private deduplicate(devices: LANDevice[]): LANDevice[] {
    const map = new Map<string, LANDevice>();
    for (const d of devices) {
      const existing = map.get(d.ip);
      if (!existing || d.confidence > existing.confidence) {
        map.set(d.ip, d);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
  }

  private isPrivateIP(ip: string): boolean {
    /* RFC1918 ranges */
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('172.')) {
      const parts = ip.split('.');
      const second = parts[1];
      const n = second ? Number(second) : NaN;
      return n >= 16 && n <= 31;
    }
    if (ip.startsWith('169.254.')) return true; /* link-local */
    return false;
  }

  /**
   * Tente fallback Pushcut si toutes les stratégies natives échouent.
   * Pushcut peut envoyer notif iPhone → Kevin tape → shortcut Apple → scan WiFi natif → résultat.
   */
  async scanViaPushcut(): Promise<LANDevice[]> {
    const r = await pushcutBridge.trigger({
      action: 'wifi_scan',
      title: 'Apex demande scan WiFi',
      text: 'Tape pour scanner le réseau local',
    });
    if (!r.ok) return [];
    /* Note : retour résultat asynchrone via callback URL nécessite x-callback-url */
    return [];
  }

  /**
   * Reset cache LAN.
   */
  reset(): void {
    try {
      localStorage.removeItem(STORAGE_CACHE);
      localStorage.removeItem(STORAGE_CACHE_TTL);
    } catch { /* ignore */ }
  }
}

export const lanScanIOS = new LANScanIOS();
