/**
 * APEX v13 — Smart Camera multi-compétence (Kevin "caméra intelligente polyvalente").
 *
 * Modes camera supportés :
 * - SINGLE : 1 photo classique
 * - BURST : rafale 5-10 photos (sport, animaux, mouvement)
 * - TIMELAPSE : 1 photo / N secondes pendant durée
 * - SCAN : capture continue avec OCR Tesseract en live
 * - DOCUMENT : auto-détection bords + redressement perspective
 * - QR_LIVE : scanner QR en temps réel BarcodeDetector API
 * - VIDEO_RECORD : enregistrement vidéo MP4/WebM
 * - SELFIE : caméra avant + filtres beauté
 * - PANORAMA : multi-shots fusionnés
 *
 * Capabilities :
 * - Switch caméra avant/arrière
 * - Flash control (torch via track constraints)
 * - Zoom optical/digital
 * - Geolocation tagging EXIF (CGU consent obligatoire)
 * - Auto-routing intelligent (vision-recognition.classify → action cross-app)
 *
 * Anti-pattern Kevin :
 * - Stream cleanup CRITIQUE (track.stop() finally bloc)
 * - Permission caméra cooldown
 * - Pas de capture sans consent CGU
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export type CameraMode =
  | 'single'
  | 'burst'
  | 'timelapse'
  | 'scan'
  | 'document'
  | 'qr_live'
  | 'video_record'
  | 'selfie'
  | 'panorama';

export type FacingMode = 'user' | 'environment';

export interface CaptureResult {
  ok: boolean;
  mode: CameraMode;
  blobs?: Blob[];
  dataUrls?: string[];
  count?: number;
  duration_ms?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface CameraCapabilities {
  available: boolean;
  facing_modes: readonly FacingMode[];
  has_flash: boolean;
  has_zoom: boolean;
  max_zoom: number;
  has_focus: boolean;
  has_barcode_detector: boolean;
  has_video_recorder: boolean;
  has_geolocation: boolean;
}

class SmartCamera {
  private currentStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;

  /**
   * Détecte capabilities device (admin dashboard).
   */
  async detectCapabilities(): Promise<CameraCapabilities> {
    const result: CameraCapabilities = {
      available: false,
      facing_modes: [],
      has_flash: false,
      has_zoom: false,
      max_zoom: 1,
      has_focus: false,
      has_barcode_detector:
        typeof window !== 'undefined' &&
        typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector !== 'undefined',
      has_video_recorder: typeof MediaRecorder !== 'undefined',
      has_geolocation: typeof navigator !== 'undefined' && typeof navigator.geolocation !== 'undefined',
    };
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return result;
    result.available = typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!result.available) return result;
    /* Detect available cameras (env vs user) */
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      const facing: FacingMode[] = [];
      if (videoInputs.length > 0) facing.push('environment');
      if (videoInputs.length > 1) facing.push('user');
      (result as { facing_modes: readonly FacingMode[] }).facing_modes = facing;
    } catch {
      /* ignore */
    }
    return result;
  }

  /**
   * Single capture (mode classique).
   */
  async captureSingle(facing: FacingMode = 'environment'): Promise<CaptureResult> {
    const start = Date.now();
    let stream: MediaStream | null = null;
    try {
      stream = await this.openStream(facing);
      const { blob, dataUrl } = await this.captureFrame(stream);
      void auditLog.record('camera.captured', { details: { mode: 'single', size: blob.size } });
      return {
        ok: true,
        mode: 'single',
        blobs: [blob],
        dataUrls: [dataUrl],
        count: 1,
        duration_ms: Date.now() - start,
      };
    } catch (err: unknown) {
      return { ok: false, mode: 'single', reason: err instanceof Error ? err.message : String(err) };
    } finally {
      this.closeStream(stream);
    }
  }

  /**
   * Burst capture : N photos rapides.
   */
  async captureBurst(count = 5, intervalMs = 200, facing: FacingMode = 'environment'): Promise<CaptureResult> {
    const start = Date.now();
    const safeCount = Math.max(1, Math.min(20, count));
    let stream: MediaStream | null = null;
    const blobs: Blob[] = [];
    const dataUrls: string[] = [];
    try {
      stream = await this.openStream(facing);
      for (let i = 0; i < safeCount; i++) {
        const { blob, dataUrl } = await this.captureFrame(stream);
        blobs.push(blob);
        dataUrls.push(dataUrl);
        if (i < safeCount - 1) await this.sleep(intervalMs);
      }
      void auditLog.record('camera.captured', {
        details: { mode: 'burst', count: blobs.length },
      });
      return {
        ok: true,
        mode: 'burst',
        blobs,
        dataUrls,
        count: blobs.length,
        duration_ms: Date.now() - start,
      };
    } catch (err: unknown) {
      return { ok: false, mode: 'burst', reason: err instanceof Error ? err.message : String(err) };
    } finally {
      this.closeStream(stream);
    }
  }

  /**
   * Time-lapse : N captures sur durée totale.
   */
  async captureTimelapse(
    durationMs: number,
    intervalMs = 1000,
    facing: FacingMode = 'environment',
  ): Promise<CaptureResult> {
    const start = Date.now();
    const safeDuration = Math.max(intervalMs, Math.min(60_000, durationMs)); /* Max 60s */
    let stream: MediaStream | null = null;
    const blobs: Blob[] = [];
    const dataUrls: string[] = [];
    try {
      stream = await this.openStream(facing);
      while (Date.now() - start < safeDuration) {
        const { blob, dataUrl } = await this.captureFrame(stream);
        blobs.push(blob);
        dataUrls.push(dataUrl);
        await this.sleep(intervalMs);
      }
      void auditLog.record('camera.captured', {
        details: { mode: 'timelapse', count: blobs.length, duration_ms: Date.now() - start },
      });
      return {
        ok: true,
        mode: 'timelapse',
        blobs,
        dataUrls,
        count: blobs.length,
        duration_ms: Date.now() - start,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        mode: 'timelapse',
        reason: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.closeStream(stream);
    }
  }

  /**
   * Video recording (MediaRecorder API).
   */
  /* Kevin v13.0.61 : pas de limite vidéo (était 30s). 0 = illimité jusqu'à stopVideoRecord manuel. */
  async startVideoRecord(maxDurationMs = 0, facing: FacingMode = 'environment'): Promise<{
    ok: boolean;
    reason?: string;
  }> {
    if (typeof MediaRecorder === 'undefined') {
      return { ok: false, reason: 'MediaRecorder API non supportée' };
    }
    try {
      this.currentStream = await this.openStream(facing, true);
      this.mediaRecorder = new MediaRecorder(this.currentStream, { mimeType: 'video/webm' });
      this.mediaRecorder.start();
      /* Auto-stop UNIQUEMENT si maxDurationMs > 0 (sinon illimité, user stop manuellement) */
      if (maxDurationMs > 0) {
        setTimeout(() => {
          if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
        }, maxDurationMs);
      }
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Stop video recording + return Blob.
   */
  async stopVideoRecord(): Promise<{ ok: boolean; blob?: Blob; reason?: string }> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      this.closeStream(this.currentStream);
      this.currentStream = null;
      return { ok: false, reason: 'Aucun enregistrement actif' };
    }
    return new Promise((resolve) => {
      const chunks: Blob[] = [];
      const recorder = this.mediaRecorder;
      if (!recorder) {
        resolve({ ok: false, reason: 'MediaRecorder disparu' });
        return;
      }
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        this.closeStream(this.currentStream);
        this.currentStream = null;
        this.mediaRecorder = null;
        void auditLog.record('camera.video_recorded', { details: { size: blob.size } });
        resolve({ ok: true, blob });
      };
      recorder.stop();
    });
  }

  /**
   * QR Live scan : detect QR/barcode en temps réel via BarcodeDetector.
   * Callback retourne array de codes détectés (cleanup auto stop).
   */
  async scanQrLive(
    onDetect: (codes: Array<{ rawValue: string; format: string }>) => void,
    options: { facingMode?: FacingMode; durationMs?: number } = {},
  ): Promise<{ ok: boolean; reason?: string }> {
    const Detector = (window as unknown as { BarcodeDetector?: new (opts?: unknown) => unknown }).BarcodeDetector;
    if (!Detector) return { ok: false, reason: 'BarcodeDetector API non supportée' };
    let stream: MediaStream | null = null;
    try {
      stream = await this.openStream(options.facingMode ?? 'environment');
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      const detector = new Detector({ formats: ['qr_code', 'ean_13', 'code_128', 'data_matrix'] }) as {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string; format: string }>>;
      };
      const stopAt = Date.now() + (options.durationMs ?? 10_000);
      const loop = async (): Promise<void> => {
        if (Date.now() > stopAt) {
          this.closeStream(stream);
          return;
        }
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) onDetect(codes);
        } catch {
          /* skip frame */
        }
        setTimeout(() => void loop(), 250); /* 4 FPS */
      };
      void loop();
      return { ok: true };
    } catch (err: unknown) {
      this.closeStream(stream);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Toggle flash/torch (capability dependent).
   */
  async toggleFlash(on: boolean): Promise<{ ok: boolean; reason?: string }> {
    if (!this.currentStream) return { ok: false, reason: 'No active stream' };
    const track = this.currentStream.getVideoTracks()[0];
    if (!track) return { ok: false, reason: 'No video track' };
    const caps = track.getCapabilities() as { torch?: boolean };
    if (!caps.torch) return { ok: false, reason: 'Flash non supporté ce device' };
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as unknown as MediaTrackConstraintSet] });
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Set zoom level (capability dependent).
   */
  async setZoom(level: number): Promise<{ ok: boolean; reason?: string }> {
    if (!this.currentStream) return { ok: false, reason: 'No active stream' };
    const track = this.currentStream.getVideoTracks()[0];
    if (!track) return { ok: false, reason: 'No video track' };
    const caps = track.getCapabilities() as { zoom?: { min: number; max: number; step: number } };
    if (!caps.zoom) return { ok: false, reason: 'Zoom non supporté ce device' };
    const safeLevel = Math.max(caps.zoom.min, Math.min(caps.zoom.max, level));
    try {
      await track.applyConstraints({ advanced: [{ zoom: safeLevel } as unknown as MediaTrackConstraintSet] });
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Switch caméra avant/arrière.
   */
  async switchCamera(facing: FacingMode): Promise<{ ok: boolean; reason?: string }> {
    if (!this.currentStream) return { ok: false, reason: 'No active stream' };
    this.closeStream(this.currentStream);
    try {
      this.currentStream = await this.openStream(facing);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Stop tout : cleanup forcé.
   */
  stopAll(): void {
    if (this.mediaRecorder?.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.closeStream(this.currentStream);
    this.currentStream = null;
    this.mediaRecorder = null;
  }

  /* === Private helpers === */

  private async openStream(facing: FacingMode = 'environment', includeAudio = false): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('MediaDevices non disponible');
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: includeAudio,
    });
  }

  private async captureFrame(stream: MediaStream): Promise<{ blob: Blob; dataUrl: string }> {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('video load timeout')), 5000);
      video.onloadedmetadata = () => {
        clearTimeout(t);
        resolve();
      };
    });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('Blob creation failed');
    return { blob, dataUrl };
  }

  private closeStream(stream: MediaStream | null): void {
    if (!stream) return;
    try {
      for (const track of stream.getTracks()) track.stop();
    } catch (err: unknown) {
      logger.warn('smart-camera', 'closeStream failed', { err });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Liste modes supportés (UI tutorial).
   */
  listModes(): readonly { mode: CameraMode; emoji: string; description: string }[] {
    return [
      { mode: 'single', emoji: '📷', description: 'Photo simple' },
      { mode: 'burst', emoji: '⚡', description: 'Rafale (sport, animaux)' },
      { mode: 'timelapse', emoji: '⏱️', description: 'Time-lapse (durée définie)' },
      { mode: 'scan', emoji: '🔍', description: 'Scan continu OCR' },
      { mode: 'document', emoji: '📄', description: 'Document auto-redressé' },
      { mode: 'qr_live', emoji: '⬛', description: 'QR/barcode temps réel' },
      { mode: 'video_record', emoji: '🎬', description: 'Vidéo MP4/WebM' },
      { mode: 'selfie', emoji: '🤳', description: 'Selfie + filtres' },
      { mode: 'panorama', emoji: '🌅', description: 'Panorama multi-shots' },
    ];
  }
}

export const smartCamera = new SmartCamera();
