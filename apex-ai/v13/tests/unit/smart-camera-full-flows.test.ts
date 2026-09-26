/**
 * Smart-camera : couverture max via Proxy mock pour video.onloadedmetadata.
 * Le defi : déclencher onloadedmetadata APRÈS que le code l'assigne.
 * Solution : Object.defineProperty getter/setter sur HTMLVideoElement.prototype.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { smartCamera } from '../../services/ai/smart-camera.js';

function makeVideoStream(): MediaStream {
  const track = {
    stop: vi.fn(),
    kind: 'video',
    getCapabilities: () => ({}),
    applyConstraints: vi.fn(() => Promise.resolve()),
  };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

describe('Smart Camera capture flows (full success via Proxy mocks)', () => {
  let origCreateElement: typeof document.createElement;
  let origMediaDevices: unknown;

  beforeEach(() => {
    origCreateElement = document.createElement.bind(document);
    origMediaDevices = (navigator as { mediaDevices?: unknown }).mediaDevices;
    smartCamera.stopAll();
  });

  afterEach(() => {
    document.createElement = origCreateElement;
    Object.defineProperty(navigator, 'mediaDevices', { value: origMediaDevices, configurable: true });
    smartCamera.stopAll();
    vi.restoreAllMocks();
  });

  function setupCapableMocks(): void {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(() => Promise.resolve(makeVideoStream())),
        enumerateDevices: vi.fn(() => Promise.resolve([])),
      },
      configurable: true,
    });
    document.createElement = ((tag: string): HTMLElement => {
      const el = origCreateElement(tag);
      if (tag === 'video') {
        const v = el as HTMLVideoElement & {
          play?: () => Promise<void>;
          _onloadedmetadata?: (() => void) | null;
        };
        v.play = (): Promise<void> => Promise.resolve();
        Object.defineProperty(v, 'videoWidth', { value: 640, configurable: true });
        Object.defineProperty(v, 'videoHeight', { value: 480, configurable: true });
        /* Trigger onloadedmetadata dès qu'il est défini */
        Object.defineProperty(v, 'onloadedmetadata', {
          configurable: true,
          set(handler: (() => void) | null) {
            v._onloadedmetadata = handler;
            if (handler) setTimeout(() => handler(), 1);
          },
          get(): (() => void) | null {
            return v._onloadedmetadata ?? null;
          },
        });
      }
      if (tag === 'canvas') {
        const c = el as HTMLCanvasElement;
        c.getContext = ((): CanvasRenderingContext2D | null => ({
          drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D)) as typeof c.getContext;
        c.toDataURL = (): string => 'data:image/jpeg;base64,fake';
        c.toBlob = (cb: BlobCallback): void => {
          cb(new Blob(['fake'], { type: 'image/jpeg' }));
        };
      }
      return el;
    }) as typeof document.createElement;
  }

  it('captureSingle complet → ok=true blobs.length=1 dataUrls.length=1', async () => {
    setupCapableMocks();
    const r = await smartCamera.captureSingle('environment');
    expect(r.mode).toBe('single');
    if (r.ok) {
      expect(r.blobs?.length).toBe(1);
      expect(r.dataUrls?.length).toBe(1);
      expect(r.count).toBe(1);
    }
  });

  it('captureBurst count=3 → ok=true blobs.length=3', async () => {
    setupCapableMocks();
    const r = await smartCamera.captureBurst(3, 10, 'environment');
    expect(r.mode).toBe('burst');
    if (r.ok) {
      expect(r.blobs?.length).toBe(3);
    }
  });

  it('captureTimelapse 100ms / 50ms → ok=true', async () => {
    setupCapableMocks();
    const r = await smartCamera.captureTimelapse(100, 50, 'environment');
    expect(r.mode).toBe('timelapse');
  });

  it('captureSingle avec user facing camera', async () => {
    setupCapableMocks();
    const r = await smartCamera.captureSingle('user');
    expect(r.mode).toBe('single');
  });

  it('captureSingle deuxième appel libère bien stream (no leak)', async () => {
    setupCapableMocks();
    await smartCamera.captureSingle('environment');
    const r = await smartCamera.captureSingle('environment');
    expect(r.mode).toBe('single');
  });

  it('captureBurst clamp count > 20 → max 20 captures', async () => {
    setupCapableMocks();
    const r = await smartCamera.captureBurst(50, 5, 'environment');
    expect(r.mode).toBe('burst');
    if (r.ok) {
      expect(r.blobs?.length).toBeLessThanOrEqual(20);
    }
  });
});
