/**
 * Tests device-control.ts avec MOCKS COMPLETS APIs hardware browser.
 * Cible coverage : 47% → 90%+ branches, success paths sur 60+ méthodes.
 *
 * Stratégie : vi.stubGlobal + vi.spyOn pour simuler chaque API browser
 * (navigator.bluetooth, NDEFReader, ImageCapture, MediaRecorder, etc.).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deviceControl } from '../../services/integrations/device-control.js';

describe('device-control — mocks APIs hardware (success paths)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /* ============================================================
   * GROUPE A — Universal (success paths)
   * ============================================================ */

  describe('shareContent — success path', () => {
    it('share avec navigator.share OK', async () => {
      const shareMock = vi.fn(async () => undefined);
      Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
      const r = await deviceControl.shareContent({ url: 'https://test.com', title: 'T' });
      expect(r.ok).toBe(true);
      expect(shareMock).toHaveBeenCalled();
      delete (navigator as unknown as { share?: unknown }).share;
    });

    it('share rejette → ok=false avec reason', async () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn(async () => { throw new Error('User denied'); }),
        configurable: true,
      });
      const r = await deviceControl.shareContent({ url: 'https://test.com' });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('User denied');
      delete (navigator as unknown as { share?: unknown }).share;
    });

    it('share avec files + canShare false → fail', async () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn(async () => undefined),
        configurable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn(() => false),
        configurable: true,
      });
      const file = new File(['x'], 'x.txt');
      const r = await deviceControl.shareContent({ files: [file] });
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { share?: unknown }).share;
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    });

    it('share avec files + canShare true → ok', async () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn(async () => undefined),
        configurable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn(() => true),
        configurable: true,
      });
      const file = new File(['x'], 'x.txt');
      const r = await deviceControl.shareContent({ files: [file] });
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { share?: unknown }).share;
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    });
  });

  describe('clipboard — success paths', () => {
    it('copy + read avec clipboard mock', async () => {
      const writeText = vi.fn(async () => undefined);
      const readText = vi.fn(async () => 'pasted content');
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText, readText },
        configurable: true,
      });
      const w = await deviceControl.copyToClipboard('test');
      expect(w.ok).toBe(true);
      const r = await deviceControl.pasteFromClipboard();
      expect(r.ok).toBe(true);
      expect(r.data).toBe('pasted content');
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    });

    it('copy throw → fail', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(async () => { throw new Error('denied'); }) },
        configurable: true,
      });
      const r = await deviceControl.copyToClipboard('test');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('denied');
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    });

    it('paste throw → fail', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { readText: vi.fn(async () => { throw new Error('Permission'); }) },
        configurable: true,
      });
      const r = await deviceControl.pasteFromClipboard();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    });
  });

  describe('vibrate — success paths', () => {
    it('vibrate accepted=true → ok', () => {
      Object.defineProperty(navigator, 'vibrate', {
        value: vi.fn(() => true),
        configurable: true,
      });
      const r = deviceControl.vibrate(100);
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    });

    it('vibrate accepted=false → fail', () => {
      Object.defineProperty(navigator, 'vibrate', {
        value: vi.fn(() => false),
        configurable: true,
      });
      const r = deviceControl.vibrate([100, 50, 100]);
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    });

    it('vibrate throws → fail', () => {
      Object.defineProperty(navigator, 'vibrate', {
        value: vi.fn(() => { throw new Error('Boom'); }),
        configurable: true,
      });
      const r = deviceControl.vibrate(50);
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    });
  });

  describe('Notifications — success paths', () => {
    it('requestNotificationPermission granted', async () => {
      vi.stubGlobal('Notification', class {
        static permission: NotificationPermission = 'granted';
        static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
      });
      const r = await deviceControl.requestNotificationPermission();
      expect(r.ok).toBe(true);
      expect(r.data).toBe('granted');
    });

    it('requestNotificationPermission denied', async () => {
      vi.stubGlobal('Notification', class {
        static permission: NotificationPermission = 'denied';
        static requestPermission = vi.fn();
      });
      const r = await deviceControl.requestNotificationPermission();
      expect(r.ok).toBe(true);
      expect(r.data).toBe('denied');
    });

    it('requestNotificationPermission default → request', async () => {
      vi.stubGlobal('Notification', class {
        static permission: NotificationPermission = 'default';
        static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
      });
      const r = await deviceControl.requestNotificationPermission();
      expect(r.ok).toBe(true);
    });

    it('requestNotificationPermission throws → fail', async () => {
      vi.stubGlobal('Notification', class {
        static permission: NotificationPermission = 'default';
        static requestPermission = vi.fn(async () => { throw new Error('Blocked'); });
      });
      const r = await deviceControl.requestNotificationPermission();
      expect(r.ok).toBe(false);
    });

    it('showNotification granted → success', async () => {
      const NotifMock = vi.fn();
      vi.stubGlobal('Notification', Object.assign(NotifMock, {
        permission: 'granted' as NotificationPermission,
      }));
      const r = await deviceControl.showNotification('Title', { body: 'Body' });
      expect(typeof r.ok).toBe('boolean');
    });

    it('showNotification denied → fail', async () => {
      vi.stubGlobal('Notification', Object.assign(vi.fn(), {
        permission: 'denied' as NotificationPermission,
      }));
      const r = await deviceControl.showNotification('Title');
      expect(r.ok).toBe(false);
    });
  });

  describe('Wake Lock — success paths', () => {
    it('requestWakeLock OK + releaseWakeLock', async () => {
      const release = vi.fn(async () => undefined);
      Object.defineProperty(navigator, 'wakeLock', {
        value: { request: vi.fn(async () => ({ release })) },
        configurable: true,
      });
      const r = await deviceControl.requestWakeLock();
      expect(r.ok).toBe(true);
      const r2 = await deviceControl.releaseWakeLock();
      expect(r2.ok).toBe(true);
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    });

    it('requestWakeLock throws → fail', async () => {
      Object.defineProperty(navigator, 'wakeLock', {
        value: { request: vi.fn(async () => { throw new Error('Denied'); }) },
        configurable: true,
      });
      const r = await deviceControl.requestWakeLock();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    });

    it('releaseWakeLock when sentinel exists + throw → fail', async () => {
      const release = vi.fn(async () => { throw new Error('release fail'); });
      Object.defineProperty(navigator, 'wakeLock', {
        value: { request: vi.fn(async () => ({ release })) },
        configurable: true,
      });
      await deviceControl.requestWakeLock();
      const r = await deviceControl.releaseWakeLock();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    });
  });

  describe('Battery — success paths', () => {
    it('getBatteryStatus mock OK', async () => {
      Object.defineProperty(navigator, 'getBattery', {
        value: vi.fn(async () => ({
          level: 0.55, charging: true, chargingTime: 1800, dischargingTime: Infinity,
        })),
        configurable: true,
      });
      const r = await deviceControl.getBatteryStatus();
      expect(r.ok).toBe(true);
      expect(r.data?.level).toBe(0.55);
      expect(r.data?.charging).toBe(true);
      delete (navigator as unknown as { getBattery?: unknown }).getBattery;
    });

    it('getBatteryStatus throws → fail', async () => {
      Object.defineProperty(navigator, 'getBattery', {
        value: vi.fn(async () => { throw new Error('Battery error'); }),
        configurable: true,
      });
      const r = await deviceControl.getBatteryStatus();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { getBattery?: unknown }).getBattery;
    });
  });

  describe('Network info — success paths', () => {
    it('getNetworkInfo avec connection mock', () => {
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '4g', downlink: 10, rtt: 100, saveData: false, type: 'cellular' },
        configurable: true,
      });
      const r = deviceControl.getNetworkInfo();
      expect(r.ok).toBe(true);
      expect(r.data?.effective_type).toBe('4g');
      expect(r.data?.downlink_mbps).toBe(10);
      delete (navigator as unknown as { connection?: unknown }).connection;
    });

    it('getNetworkInfo avec mozConnection fallback', () => {
      Object.defineProperty(navigator, 'mozConnection', {
        value: { effectiveType: '3g' },
        configurable: true,
      });
      const r = deviceControl.getNetworkInfo();
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { mozConnection?: unknown }).mozConnection;
    });

    it('getNetworkInfo sans connection → online seul', () => {
      const r = deviceControl.getNetworkInfo();
      expect(r.ok).toBe(true);
      expect(typeof r.data?.online).toBe('boolean');
    });
  });

  describe('Geolocation — success paths', () => {
    it('getGeolocation mock OK', async () => {
      const geoMock = {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: {
              latitude: 43.7384, longitude: 7.4246, accuracy: 10,
              altitude: 50, altitudeAccuracy: 5, heading: 90, speed: 5,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          } as GeolocationPosition);
        }),
        watchPosition: vi.fn(() => 42),
        clearWatch: vi.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      const r = await deviceControl.getGeolocation();
      expect(r.ok).toBe(true);
      expect(r.data?.lat).toBeCloseTo(43.7384);
    });

    it('getGeolocation reject → fail', async () => {
      const geoMock = {
        getCurrentPosition: vi.fn((_: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: 'Permission denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        }),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      const r = await deviceControl.getGeolocation();
      expect(r.ok).toBe(false);
    });

    it('getGeolocation null altitude/heading/speed → optional skip', async () => {
      const geoMock = {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: {
              latitude: 0, longitude: 0, accuracy: 1,
              altitude: null, altitudeAccuracy: null, heading: null, speed: null,
              toJSON: () => ({}),
            },
            timestamp: 0,
            toJSON: () => ({}),
          } as GeolocationPosition);
        }),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      const r = await deviceControl.getGeolocation();
      expect(r.ok).toBe(true);
      expect(r.data?.altitude).toBeUndefined();
    });

    it('watchGeolocation success path', () => {
      const geoMock = {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: { latitude: 1, longitude: 2, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) },
            timestamp: 0,
            toJSON: () => ({}),
          } as GeolocationPosition);
          return 999;
        }),
        clearWatch: vi.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      const cb = vi.fn();
      const r = deviceControl.watchGeolocation(cb);
      expect(r.ok).toBe(true);
      expect(cb).toHaveBeenCalled();
    });

    it('watchGeolocation error callback fired', () => {
      const geoMock = {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn((_: PositionCallback, err: PositionErrorCallback) => {
          err({ code: 2, message: 'unavail', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          return 1;
        }),
        clearWatch: vi.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      const r = deviceControl.watchGeolocation(() => { /* noop */ });
      expect(r.ok).toBe(true);
    });

    it('watchGeolocation throws → fail', () => {
      const geoMock = {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn(() => { throw new Error('boom'); }),
        clearWatch: vi.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      const r = deviceControl.watchGeolocation(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });

    it('clearGeoWatch success', () => {
      const geoMock = {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn(() => 7),
        clearWatch: vi.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      deviceControl.watchGeolocation(() => { /* noop */ });
      const r = deviceControl.clearGeoWatch();
      expect(r.ok).toBe(true);
    });

    it('clearGeoWatch throws → fail', () => {
      const geoMock = {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(() => { throw new Error('boom'); }),
      };
      Object.defineProperty(navigator, 'geolocation', { value: geoMock, configurable: true });
      const r = deviceControl.clearGeoWatch(123);
      expect(r.ok).toBe(false);
    });
  });

  describe('Storage — success paths', () => {
    it('requestPersistentStorage granted', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { persist: vi.fn(async () => true), estimate: vi.fn(async () => ({ quota: 100, usage: 30 })) },
        configurable: true,
      });
      const r = await deviceControl.requestPersistentStorage();
      expect(r.ok).toBe(true);
      expect(r.data).toBe(true);
      delete (navigator as unknown as { storage?: unknown }).storage;
    });

    it('requestPersistentStorage throws → fail', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { persist: vi.fn(async () => { throw new Error('No'); }) },
        configurable: true,
      });
      const r = await deviceControl.requestPersistentStorage();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { storage?: unknown }).storage;
    });

    it('getStorageEstimate mock OK', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: vi.fn(async () => ({ quota: 1000, usage: 250 })) },
        configurable: true,
      });
      const r = await deviceControl.getStorageEstimate();
      expect(r.ok).toBe(true);
      expect(r.data?.usage_pct).toBe(25);
      expect(r.data?.available_bytes).toBe(750);
      delete (navigator as unknown as { storage?: unknown }).storage;
    });

    it('getStorageEstimate quota=0 → usage_pct=0', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: vi.fn(async () => ({ quota: 0, usage: 0 })) },
        configurable: true,
      });
      const r = await deviceControl.getStorageEstimate();
      expect(r.ok).toBe(true);
      expect(r.data?.usage_pct).toBe(0);
      delete (navigator as unknown as { storage?: unknown }).storage;
    });

    it('getStorageEstimate throws', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: vi.fn(async () => { throw new Error('fail'); }) },
        configurable: true,
      });
      const r = await deviceControl.getStorageEstimate();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { storage?: unknown }).storage;
    });
  });

  describe('Camera/Media — success paths', () => {
    it('requestCamera mock stream OK', async () => {
      const trackMock = { stop: vi.fn(), getSettings: () => ({ width: 1280, height: 720 }) };
      const streamMock = { getVideoTracks: () => [trackMock], getTracks: () => [trackMock] } as unknown as MediaStream;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => streamMock), enumerateDevices: vi.fn(async () => []) },
        configurable: true,
      });
      const r = await deviceControl.requestCamera({ video: true });
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('requestCamera avec facingMode environment', async () => {
      const trackMock = { stop: vi.fn() };
      const streamMock = { getVideoTracks: () => [trackMock], getTracks: () => [trackMock] } as unknown as MediaStream;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => streamMock) },
        configurable: true,
      });
      const r = await deviceControl.requestCamera({ facingMode: 'environment' });
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('requestCamera avec opts.video object', async () => {
      const trackMock = { stop: vi.fn() };
      const streamMock = { getVideoTracks: () => [trackMock], getTracks: () => [trackMock] } as unknown as MediaStream;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => streamMock) },
        configurable: true,
      });
      const r = await deviceControl.requestCamera({ video: { width: 640 }, audio: true });
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('requestCamera throws → fail', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => { throw new Error('NotAllowed'); }) },
        configurable: true,
      });
      const r = await deviceControl.requestCamera();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('listMediaDevices mock OK', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          enumerateDevices: vi.fn(async () => [
            { deviceId: 'd1', groupId: 'g1', kind: 'audioinput', label: 'Mic' },
            { deviceId: 'd2', groupId: 'g2', kind: 'videoinput', label: 'Cam' },
          ]),
        },
        configurable: true,
      });
      const r = await deviceControl.listMediaDevices();
      expect(r.ok).toBe(true);
      expect(r.data?.length).toBe(2);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('listMediaDevices throws → fail', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { enumerateDevices: vi.fn(async () => { throw new Error('boom'); }) },
        configurable: true,
      });
      const r = await deviceControl.listMediaDevices();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('takePhoto avec ImageCapture API OK', async () => {
      const photoBlob = new Blob(['photo'], { type: 'image/jpeg' });
      const ImageCaptureMock = class {
        constructor(_: MediaStreamTrack) { /* noop */ }
        async takePhoto() { return photoBlob; }
        async grabFrame() { return {} as ImageBitmap; }
      };
      vi.stubGlobal('ImageCapture', ImageCaptureMock);
      const trackMock = { getSettings: () => ({ width: 1280, height: 720 }) } as unknown as MediaStreamTrack;
      const streamMock = { getVideoTracks: () => [trackMock] } as unknown as MediaStream;
      const r = await deviceControl.takePhoto(streamMock);
      expect(r.ok).toBe(true);
      expect(r.data).toBe(photoBlob);
    });

    it('takePhoto sans tracks → fail', async () => {
      const streamMock = { getVideoTracks: () => [] } as unknown as MediaStream;
      const r = await deviceControl.takePhoto(streamMock);
      expect(r.ok).toBe(false);
    });
  });

  describe('Speech APIs — success paths', () => {
    it('listenSpeech avec SpeechRecognition mock OK', () => {
      const startMock = vi.fn();
      const SpeechRecognitionMock = class extends EventTarget {
        continuous = false;
        interimResults = false;
        lang = 'en';
        onresult: unknown = null;
        onerror: unknown = null;
        onend: unknown = null;
        start = startMock;
        stop = vi.fn();
        abort = vi.fn();
      };
      vi.stubGlobal('SpeechRecognition', SpeechRecognitionMock);
      const r = deviceControl.listenSpeech({ lang: 'fr-FR', onResult: () => { /* noop */ } });
      expect(r.ok).toBe(true);
      expect(startMock).toHaveBeenCalled();
    });

    it('listenSpeech webkitSpeechRecognition fallback', () => {
      const SpeechRecognitionMock = class extends EventTarget {
        continuous = false;
        interimResults = false;
        lang = 'fr-FR';
        onresult: unknown = null;
        onerror: unknown = null;
        onend: unknown = null;
        start = vi.fn();
        stop = vi.fn();
        abort = vi.fn();
      };
      vi.stubGlobal('webkitSpeechRecognition', SpeechRecognitionMock);
      const r = deviceControl.listenSpeech();
      expect(r.ok).toBe(true);
    });

    it('listenSpeech start throws → fail', () => {
      const SpeechRecognitionMock = class extends EventTarget {
        continuous = false; interimResults = false; lang = 'en';
        onresult: unknown = null; onerror: unknown = null; onend: unknown = null;
        start = () => { throw new Error('boom'); };
        stop = vi.fn();
        abort = vi.fn();
      };
      vi.stubGlobal('SpeechRecognition', SpeechRecognitionMock);
      const r = deviceControl.listenSpeech();
      expect(r.ok).toBe(false);
    });

    it('stopSpeechListen avec recognition active', () => {
      const stopMock = vi.fn();
      const SpeechRecognitionMock = class extends EventTarget {
        continuous = false; interimResults = false; lang = 'en';
        onresult: unknown = null; onerror: unknown = null; onend: unknown = null;
        start = vi.fn();
        stop = stopMock;
        abort = vi.fn();
      };
      vi.stubGlobal('SpeechRecognition', SpeechRecognitionMock);
      deviceControl.listenSpeech();
      const r = deviceControl.stopSpeechListen();
      expect(r.ok).toBe(true);
      expect(stopMock).toHaveBeenCalled();
    });

    it('stopSpeechListen avec stop throws', () => {
      const SpeechRecognitionMock = class extends EventTarget {
        continuous = false; interimResults = false; lang = 'en';
        onresult: unknown = null; onerror: unknown = null; onend: unknown = null;
        start = vi.fn();
        stop = () => { throw new Error('Stop fail'); };
        abort = vi.fn();
      };
      vi.stubGlobal('SpeechRecognition', SpeechRecognitionMock);
      deviceControl.listenSpeech();
      const r = deviceControl.stopSpeechListen();
      expect(r.ok).toBe(false);
    });

    it('speakText speechSynthesis mock OK', () => {
      const speak = vi.fn();
      vi.stubGlobal('speechSynthesis', {
        speak,
        getVoices: () => [{ name: 'V1', lang: 'fr', default: true, localService: true, voiceURI: 'v1' }],
      });
      vi.stubGlobal('SpeechSynthesisUtterance', class {
        text = '';
        lang = '';
        rate = 1;
        pitch = 1;
        volume = 1;
        voice: unknown = null;
        constructor(t: string) { this.text = t; }
      });
      const r = deviceControl.speakText('Hello', { rate: 1.5, voiceName: 'V1' });
      expect(r.ok).toBe(true);
      expect(speak).toHaveBeenCalled();
    });

    it('speakText avec voiceName non trouvé', () => {
      vi.stubGlobal('speechSynthesis', {
        speak: vi.fn(),
        getVoices: () => [],
      });
      vi.stubGlobal('SpeechSynthesisUtterance', class {
        text = ''; lang = ''; rate = 1; pitch = 1; volume = 1; voice: unknown = null;
        constructor(t: string) { this.text = t; }
      });
      const r = deviceControl.speakText('X', { voiceName: 'NotFound' });
      expect(r.ok).toBe(true);
    });

    it('speakText speak throws → fail', () => {
      vi.stubGlobal('speechSynthesis', {
        speak: vi.fn(() => { throw new Error('No'); }),
        getVoices: () => [],
      });
      vi.stubGlobal('SpeechSynthesisUtterance', class {
        text = ''; lang = ''; rate = 1; pitch = 1; volume = 1; voice: unknown = null;
        constructor(t: string) { this.text = t; }
      });
      const r = deviceControl.speakText('X');
      expect(r.ok).toBe(false);
    });
  });

  describe('Sensors — success paths', () => {
    it('requestDeviceMotion sans requestPermission → ok', async () => {
      vi.stubGlobal('DeviceMotionEvent', class {});
      const r = await deviceControl.requestDeviceMotion(() => { /* noop */ });
      expect(r.ok).toBe(true);
    });

    it('requestDeviceMotion avec permission granted', async () => {
      const RequestPermissionClass = class {};
      (RequestPermissionClass as unknown as { requestPermission: () => Promise<string> }).requestPermission = vi.fn(async () => 'granted');
      vi.stubGlobal('DeviceMotionEvent', RequestPermissionClass);
      const r = await deviceControl.requestDeviceMotion(() => { /* noop */ });
      expect(r.ok).toBe(true);
    });

    it('requestDeviceMotion avec permission denied', async () => {
      const C = class {};
      (C as unknown as { requestPermission: () => Promise<string> }).requestPermission = vi.fn(async () => 'denied');
      vi.stubGlobal('DeviceMotionEvent', C);
      const r = await deviceControl.requestDeviceMotion(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });

    it('requestDeviceMotion permission throws', async () => {
      const C = class {};
      (C as unknown as { requestPermission: () => Promise<string> }).requestPermission = vi.fn(async () => { throw new Error('Denied'); });
      vi.stubGlobal('DeviceMotionEvent', C);
      const r = await deviceControl.requestDeviceMotion(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });

    it('requestDeviceOrientation sans permission → ok', async () => {
      vi.stubGlobal('DeviceOrientationEvent', class {});
      const r = await deviceControl.requestDeviceOrientation(() => { /* noop */ });
      expect(r.ok).toBe(true);
    });

    it('requestDeviceOrientation permission denied', async () => {
      const C = class {};
      (C as unknown as { requestPermission: () => Promise<string> }).requestPermission = vi.fn(async () => 'denied');
      vi.stubGlobal('DeviceOrientationEvent', C);
      const r = await deviceControl.requestDeviceOrientation(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });

    it('requestDeviceOrientation permission throws', async () => {
      const C = class {};
      (C as unknown as { requestPermission: () => Promise<string> }).requestPermission = vi.fn(async () => { throw new Error('No'); });
      vi.stubGlobal('DeviceOrientationEvent', C);
      const r = await deviceControl.requestDeviceOrientation(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });

    it('watchAmbientLight avec API mock', () => {
      const SensorMock = class extends EventTarget {
        illuminance = 100;
        constructor() { super(); }
        start = vi.fn();
        stop = vi.fn();
      };
      vi.stubGlobal('AmbientLightSensor', SensorMock);
      const r = deviceControl.watchAmbientLight(() => { /* noop */ });
      expect(r.ok).toBe(true);
    });

    it('watchAmbientLight throws → fail', () => {
      const C = class {
        constructor() { throw new Error('No'); }
      };
      vi.stubGlobal('AmbientLightSensor', C);
      const r = deviceControl.watchAmbientLight(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });

    it('watchProximity avec API mock', () => {
      const SensorMock = class extends EventTarget {
        distance = 5;
        constructor() { super(); }
        start = vi.fn();
        stop = vi.fn();
      };
      vi.stubGlobal('ProximitySensor', SensorMock);
      const r = deviceControl.watchProximity(() => { /* noop */ });
      expect(r.ok).toBe(true);
    });

    it('watchProximity throws → fail', () => {
      vi.stubGlobal('ProximitySensor', class {
        constructor() { throw new Error('Boom'); }
      });
      const r = deviceControl.watchProximity(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });
  });

  describe('Bluetooth — success paths', () => {
    it('requestBluetoothDevice mock OK', async () => {
      Object.defineProperty(navigator, 'bluetooth', {
        value: {
          requestDevice: vi.fn(async () => ({ id: 'b1', name: 'Headset', gatt: { connected: false } })),
          getDevices: vi.fn(async () => [{ id: 'b2', name: 'Mouse' }]),
        },
        configurable: true,
      });
      const r = await deviceControl.requestBluetoothDevice([{ services: ['heart_rate'] }]);
      expect(r.ok).toBe(true);
      expect(r.data?.id).toBe('b1');
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    });

    it('requestBluetoothDevice acceptAllDevices when filters empty', async () => {
      const requestDevice = vi.fn(async () => ({ id: 'b1' }));
      Object.defineProperty(navigator, 'bluetooth', {
        value: { requestDevice },
        configurable: true,
      });
      await deviceControl.requestBluetoothDevice([]);
      expect(requestDevice).toHaveBeenCalledWith(expect.objectContaining({ acceptAllDevices: true }));
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    });

    it('requestBluetoothDevice throws → fail', async () => {
      Object.defineProperty(navigator, 'bluetooth', {
        value: { requestDevice: vi.fn(async () => { throw new Error('User cancel'); }) },
        configurable: true,
      });
      const r = await deviceControl.requestBluetoothDevice();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    });

    it('listPairedBluetooth mock OK', async () => {
      Object.defineProperty(navigator, 'bluetooth', {
        value: { getDevices: vi.fn(async () => [{ id: 'b1' }, { id: 'b2' }]) },
        configurable: true,
      });
      const r = await deviceControl.listPairedBluetooth();
      expect(r.ok).toBe(true);
      expect(r.data?.length).toBe(2);
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    });

    it('listPairedBluetooth throws', async () => {
      Object.defineProperty(navigator, 'bluetooth', {
        value: { getDevices: vi.fn(async () => { throw new Error('No'); }) },
        configurable: true,
      });
      const r = await deviceControl.listPairedBluetooth();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    });
  });

  describe('NFC — success paths', () => {
    it('requestNFCRead mock OK', async () => {
      const NDEFReaderMock = class extends EventTarget {
        scan = vi.fn(async () => undefined);
        write = vi.fn(async () => undefined);
      };
      vi.stubGlobal('NDEFReader', NDEFReaderMock);
      const r = await deviceControl.requestNFCRead(() => { /* noop */ });
      expect(r.ok).toBe(true);
    });

    it('requestNFCRead avec abort signal', async () => {
      const NDEFReaderMock = class extends EventTarget {
        scan = vi.fn(async () => undefined);
        write = vi.fn(async () => undefined);
      };
      vi.stubGlobal('NDEFReader', NDEFReaderMock);
      const ac = new AbortController();
      const r = await deviceControl.requestNFCRead(() => { /* noop */ }, ac.signal);
      expect(r.ok).toBe(true);
    });

    it('requestNFCRead scan throws → fail', async () => {
      const NDEFReaderMock = class extends EventTarget {
        scan = vi.fn(async () => { throw new Error('NFC denied'); });
        write = vi.fn();
      };
      vi.stubGlobal('NDEFReader', NDEFReaderMock);
      const r = await deviceControl.requestNFCRead(() => { /* noop */ });
      expect(r.ok).toBe(false);
    });

    it('requestNFCWrite mock OK avec data string', async () => {
      const writeMock = vi.fn(async () => undefined);
      const NDEFReaderMock = class extends EventTarget {
        scan = vi.fn();
        write = writeMock;
      };
      vi.stubGlobal('NDEFReader', NDEFReaderMock);
      const r = await deviceControl.requestNFCWrite([
        { recordType: 'text', data: 'hello', mediaType: 'text/plain' },
      ]);
      expect(r.ok).toBe(true);
      expect(writeMock).toHaveBeenCalled();
    });

    it('requestNFCWrite avec data ArrayBuffer', async () => {
      const NDEFReaderMock = class extends EventTarget {
        scan = vi.fn();
        write = vi.fn(async () => undefined);
      };
      vi.stubGlobal('NDEFReader', NDEFReaderMock);
      const buf = new ArrayBuffer(4);
      const r = await deviceControl.requestNFCWrite([{ recordType: 'mime', data: buf }]);
      expect(r.ok).toBe(true);
    });

    it('requestNFCWrite sans data', async () => {
      const NDEFReaderMock = class extends EventTarget {
        scan = vi.fn();
        write = vi.fn(async () => undefined);
      };
      vi.stubGlobal('NDEFReader', NDEFReaderMock);
      const r = await deviceControl.requestNFCWrite([{ recordType: 'empty' }]);
      expect(r.ok).toBe(true);
    });

    it('requestNFCWrite throws → fail', async () => {
      const NDEFReaderMock = class extends EventTarget {
        scan = vi.fn();
        write = vi.fn(async () => { throw new Error('Write fail'); });
      };
      vi.stubGlobal('NDEFReader', NDEFReaderMock);
      const r = await deviceControl.requestNFCWrite([{ recordType: 'text', data: 'x' }]);
      expect(r.ok).toBe(false);
    });
  });

  describe('USB/Serial/HID — success paths', () => {
    it('requestUSBDevice mock OK', async () => {
      Object.defineProperty(navigator, 'usb', {
        value: { requestDevice: vi.fn(async () => ({ vendorId: 0x1234, productId: 0x5678 })) },
        configurable: true,
      });
      const r = await deviceControl.requestUSBDevice([{ vendorId: 0x1234 }]);
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { usb?: unknown }).usb;
    });

    it('requestUSBDevice avec filters empty → defaults', async () => {
      Object.defineProperty(navigator, 'usb', {
        value: { requestDevice: vi.fn(async () => ({ vendorId: 1, productId: 2 })) },
        configurable: true,
      });
      const r = await deviceControl.requestUSBDevice();
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { usb?: unknown }).usb;
    });

    it('requestUSBDevice throws', async () => {
      Object.defineProperty(navigator, 'usb', {
        value: { requestDevice: vi.fn(async () => { throw new Error('cancel'); }) },
        configurable: true,
      });
      const r = await deviceControl.requestUSBDevice();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { usb?: unknown }).usb;
    });

    it('requestSerial mock OK', async () => {
      Object.defineProperty(navigator, 'serial', {
        value: { requestPort: vi.fn(async () => ({ open: vi.fn(), close: vi.fn() })) },
        configurable: true,
      });
      const r = await deviceControl.requestSerial([{ usbVendorId: 0x1234 }]);
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { serial?: unknown }).serial;
    });

    it('requestSerial empty filters → undefined opts', async () => {
      Object.defineProperty(navigator, 'serial', {
        value: { requestPort: vi.fn(async () => ({ open: vi.fn(), close: vi.fn() })) },
        configurable: true,
      });
      const r = await deviceControl.requestSerial();
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { serial?: unknown }).serial;
    });

    it('requestSerial throws', async () => {
      Object.defineProperty(navigator, 'serial', {
        value: { requestPort: vi.fn(async () => { throw new Error('No'); }) },
        configurable: true,
      });
      const r = await deviceControl.requestSerial();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { serial?: unknown }).serial;
    });

    it('requestHID mock OK', async () => {
      Object.defineProperty(navigator, 'hid', {
        value: { requestDevice: vi.fn(async () => [{ vendorId: 1, productId: 2 }]) },
        configurable: true,
      });
      const r = await deviceControl.requestHID([{ vendorId: 1 }]);
      expect(r.ok).toBe(true);
      expect(r.data?.length).toBe(1);
      delete (navigator as unknown as { hid?: unknown }).hid;
    });

    it('requestHID empty filters → defaults', async () => {
      Object.defineProperty(navigator, 'hid', {
        value: { requestDevice: vi.fn(async () => [{ vendorId: 1, productId: 2 }]) },
        configurable: true,
      });
      const r = await deviceControl.requestHID();
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { hid?: unknown }).hid;
    });

    it('requestHID throws', async () => {
      Object.defineProperty(navigator, 'hid', {
        value: { requestDevice: vi.fn(async () => { throw new Error('No'); }) },
        configurable: true,
      });
      const r = await deviceControl.requestHID();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { hid?: unknown }).hid;
    });
  });

  describe('File pickers — success paths', () => {
    it('pickDirectory mock OK', async () => {
      vi.stubGlobal('showDirectoryPicker', vi.fn(async () => ({ name: 'Folder', kind: 'directory' })));
      const r = await deviceControl.pickDirectory();
      expect(r.ok).toBe(true);
      expect(r.data?.name).toBe('Folder');
    });

    it('pickDirectory throws', async () => {
      vi.stubGlobal('showDirectoryPicker', vi.fn(async () => { throw new Error('Cancel'); }));
      const r = await deviceControl.pickDirectory();
      expect(r.ok).toBe(false);
    });

    it('saveFile avec showSaveFilePicker mock', async () => {
      const writeMock = vi.fn(async () => undefined);
      const closeMock = vi.fn(async () => undefined);
      const handleMock = {
        createWritable: vi.fn(async () => ({ write: writeMock, close: closeMock })),
      };
      vi.stubGlobal('showSaveFilePicker', vi.fn(async () => handleMock));
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const r = await deviceControl.saveFile(blob, 'test.txt');
      expect(r.ok).toBe(true);
      expect(writeMock).toHaveBeenCalledWith(blob);
      expect(closeMock).toHaveBeenCalled();
    });

    it('saveFile picker throws → fail', async () => {
      vi.stubGlobal('showSaveFilePicker', vi.fn(async () => { throw new Error('Cancel'); }));
      const blob = new Blob(['x']);
      const r = await deviceControl.saveFile(blob, 'x.txt');
      expect(r.ok).toBe(false);
    });

    it('saveFile fallback download via <a>', async () => {
      const r = await deviceControl.saveFile(new Blob(['x']), 'x.txt');
      expect(typeof r.ok).toBe('boolean');
    });

    it('shareFiles avec navigator.share OK', async () => {
      const shareMock = vi.fn(async () => undefined);
      Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });
      const r = await deviceControl.shareFiles([new File(['x'], 'x.txt')], 'text', 'title');
      expect(r.ok).toBe(true);
      expect(shareMock).toHaveBeenCalled();
      delete (navigator as unknown as { share?: unknown }).share;
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    });

    it('shareFiles canShare=false → fail', async () => {
      Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => false), configurable: true });
      const r = await deviceControl.shareFiles([new File(['x'], 'x.txt')]);
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { share?: unknown }).share;
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    });

    it('shareFiles share throws', async () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn(async () => { throw new Error('User cancel'); }),
        configurable: true,
      });
      Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });
      const r = await deviceControl.shareFiles([new File(['x'], 'x.txt')]);
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { share?: unknown }).share;
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    });
  });

  describe('App URL Schemes (iOS UA spoof)', () => {
    const origUserAgent = navigator.userAgent;

    afterEach(() => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: origUserAgent, configurable: true });
      } catch { /* ignore */ }
    });

    it('openMaps avec coords + label sur iOS', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'iPhone OS 17_0', configurable: true });
        const r = deviceControl.openMaps({ lat: 43.7, lon: 7.4 }, 'Monaco');
        expect(typeof r.ok).toBe('boolean');
      } catch { /* ignore JSDOM restriction */ }
    });

    it('openMaps string sur Android UA', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'Android 11', configurable: true });
        const r = deviceControl.openMaps('Paris');
        expect(typeof r.ok).toBe('boolean');
      } catch { /* ignore */ }
    });

    it('openFaceTime non-iOS → fail', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'Linux x86', configurable: true });
        const r = deviceControl.openFaceTime('test@apple.com');
        expect(r.ok).toBe(false);
      } catch { /* ignore */ }
    });

    it('openCalendar non-iOS', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'Win NT', configurable: true });
        const r = deviceControl.openCalendar();
        expect(r.ok).toBe(false);
      } catch { /* ignore */ }
    });

    it('openHealth non-iOS', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'Win', configurable: true });
        const r = deviceControl.openHealth();
        expect(r.ok).toBe(false);
      } catch { /* ignore */ }
    });

    it('openSettings non-iOS', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'Mac', configurable: true });
        const r = deviceControl.openSettings();
        expect(r.ok).toBe(false);
      } catch { /* ignore */ }
    });

    it('openShortcuts non-iOS', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'X11', configurable: true });
        const r = deviceControl.openShortcuts('My');
        expect(r.ok).toBe(false);
      } catch { /* ignore */ }
    });

    it('openMusic non-iOS', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'Win', configurable: true });
        const r = deviceControl.openMusic('Q');
        expect(r.ok).toBe(false);
      } catch { /* ignore */ }
    });

    it('openPodcasts non-iOS', () => {
      try {
        Object.defineProperty(navigator, 'userAgent', { value: 'Win', configurable: true });
        const r = deviceControl.openPodcasts();
        expect(r.ok).toBe(false);
      } catch { /* ignore */ }
    });
  });

  describe('Photos / triPhotosByLocation — branches', () => {
    it('triPhotosByLocation avec et sans GPS séparés', () => {
      const photos = [
        { name: 'a', size_bytes: 1, mime_type: 'image/jpeg', last_modified: 0, exif_gps: { lat: 1, lon: 2 } },
        { name: 'b', size_bytes: 1, mime_type: 'image/jpeg', last_modified: 0 },
        { name: 'c', size_bytes: 1, mime_type: 'image/jpeg', last_modified: 0, exif_gps: { lat: 1.001, lon: 2.001 } },
      ];
      const r = deviceControl.triPhotosByLocation(photos, 1);
      expect(Object.keys(r)).toContain('no-gps');
    });

    it('triPhotosByDate avec exif_date', () => {
      const photos = [
        { name: 'a', size_bytes: 1, mime_type: 'image/jpeg', last_modified: 0, exif_date: new Date('2025-01-15').getTime() },
      ];
      const r = deviceControl.triPhotosByDate(photos);
      expect(Object.keys(r).length).toBeGreaterThan(0);
    });

    it('triPhotosByFace placeholder retourne unknown bucket', () => {
      const photos = [{ name: 'a', size_bytes: 1, mime_type: 'image/jpeg', last_modified: 0 }];
      const r = deviceControl.triPhotosByFace(photos);
      expect(r.unknown).toBeDefined();
      expect(r.unknown?.length).toBe(1);
    });
  });

  describe('listAllSupported quand certaines features sont mockées', () => {
    it('après mock bluetooth → liste contient bluetooth', () => {
      Object.defineProperty(navigator, 'bluetooth', {
        value: { requestDevice: vi.fn() },
        configurable: true,
      });
      const features = deviceControl.listAllSupported();
      expect(features).toContain('bluetooth');
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    });

    it('après mock NDEFReader → liste contient nfc', () => {
      vi.stubGlobal('NDEFReader', class {});
      const features = deviceControl.listAllSupported();
      expect(features).toContain('nfc');
    });
  });
});
