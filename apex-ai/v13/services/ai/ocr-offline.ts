/**
 * APEX v13.3.57 PUSH-100 — OCR Offline (tesseract.js fallback)
 *
 * Quand Vision IA (Claude / GPT-4 Vision) est indisponible (pas de clé,
 * quota épuisé, network down), fallback OCR offline via tesseract.js
 * lazy-loadé depuis CDN.
 *
 * v13.3.71 (perf) : tente d'abord le Web Worker dédié (`workers/ocr.worker.ts`)
 * pour ne pas bloquer le main thread (~1-3s par scan). Si Worker indispo
 * (legacy browser, CSP, ready timeout) → fallback main-thread (comportement
 * historique inchangé).
 *
 * Anti-pattern Kevin :
 * - Lazy load uniquement à la demande (~3 MB tesseract WASM)
 * - Cache mémoire pour évites re-init worker à chaque appel
 * - Timeout strict pour éviter blocage UI
 * - Pas de stockage image (privacy)
 */

import { logger } from '../../core/logger.js';
import type {
  OcrWorkerRequest,
  OcrWorkerResponse,
} from '../../workers/ocr.worker.js';

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.min.js';
const DEFAULT_LANG = 'fra+eng'; /* Français + Anglais par défaut Kevin */
const DEFAULT_TIMEOUT_MS = 60_000; /* 60s max — OCR peut être lent sur grande image */

interface TesseractWorker {
  recognize: (image: string | Blob | HTMLImageElement | HTMLCanvasElement) => Promise<{
    data: { text: string; confidence: number };
  }>;
  terminate: () => Promise<void>;
}

interface TesseractGlobal {
  createWorker: (lang: string) => Promise<TesseractWorker>;
}

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

export interface OcrResult {
  ok: boolean;
  text: string;
  confidence: number;
  latency_ms: number;
  error?: string;
  source: 'tesseract-offline';
}

interface OcrWorkerPending {
  resolve: (v: { text: string; confidence: number; latency_ms: number; lang: string }) => void;
  reject: (err: Error) => void;
}

class OcrOfflineService {
  private worker: TesseractWorker | null = null;
  private workerLang: string | null = null;
  private loadPromise: Promise<void> | null = null;
  /* Web Worker dédié (off-main-thread) — lazy init au 1er scan */
  private dedicatedWorker: Worker | null = null;
  private dedicatedReady = false;
  private dedicatedInitPromise: Promise<boolean> | null = null;
  private dedicatedPermFail = false;
  private dedicatedPending = new Map<number, OcrWorkerPending>();
  private dedicatedNextId = 1;

  /**
   * Charge tesseract.js depuis CDN (lazy, idempotent).
   * Si déjà chargé, retourne immédiatement.
   */
  private async loadTesseract(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('OCR offline requires browser environment');
    }
    if (window.Tesseract) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_CDN;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = (): void => {
        if (window.Tesseract) {
          logger.info('ocr-offline', 'tesseract.js loaded from CDN');
          resolve();
        } else {
          reject(new Error('tesseract.js loaded but Window.Tesseract undefined'));
        }
      };
      script.onerror = (): void => {
        this.loadPromise = null; /* allow retry */
        reject(new Error('Failed to load tesseract.js from CDN'));
      };
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  /**
   * Init worker tesseract pour une langue.
   * Si worker existe avec autre langue → terminate puis re-create.
   */
  private async ensureWorker(lang: string): Promise<TesseractWorker> {
    await this.loadTesseract();
    if (!window.Tesseract) {
      throw new Error('Tesseract global not available after load');
    }
    if (this.worker && this.workerLang === lang) {
      return this.worker;
    }
    /* Terminate old worker if lang changed */
    if (this.worker && this.workerLang !== lang) {
      try {
        await this.worker.terminate();
      } catch {
        /* ignore */
      }
      this.worker = null;
      this.workerLang = null;
    }
    this.worker = await window.Tesseract.createWorker(lang);
    this.workerLang = lang;
    return this.worker;
  }

  /**
   * Lazy-init du Web Worker dédié (workers/ocr.worker.ts).
   * Retourne true si worker prêt, false si indispo → fallback main-thread.
   */
  private ensureDedicatedWorker(): Promise<boolean> {
    if (this.dedicatedReady) return Promise.resolve(true);
    if (this.dedicatedPermFail) return Promise.resolve(false);
    if (this.dedicatedInitPromise) return this.dedicatedInitPromise;

    this.dedicatedInitPromise = new Promise<boolean>((resolve) => {
      try {
        if (typeof Worker === 'undefined') {
          this.dedicatedPermFail = true;
          resolve(false);
          return;
        }
        const w = new Worker(
          new URL('../../workers/ocr.worker.ts', import.meta.url),
          { type: 'module' },
        );
        let readyTimer: ReturnType<typeof setTimeout> | null = null;
        const onReady = (event: MessageEvent<unknown>): void => {
          const data = event.data as { type?: string };
          if (data?.type === 'ready') {
            this.dedicatedReady = true;
            if (readyTimer) clearTimeout(readyTimer);
            w.removeEventListener('message', onReady);
            w.addEventListener('message', this.onDedicatedMessage);
            w.addEventListener('error', this.onDedicatedError);
            this.dedicatedWorker = w;
            resolve(true);
          }
        };
        w.addEventListener('message', onReady);
        readyTimer = setTimeout(() => {
          w.removeEventListener('message', onReady);
          this.dedicatedPermFail = true;
          try { w.terminate(); } catch { /* ignore */ }
          logger.warn('ocr-offline', 'worker ready timeout → fallback main-thread');
          resolve(false);
        }, 3000);
      } catch (err) {
        this.dedicatedPermFail = true;
        logger.warn('ocr-offline', 'worker creation failed → fallback main-thread', { err });
        resolve(false);
      }
    });
    return this.dedicatedInitPromise;
  }

  private onDedicatedMessage = (event: MessageEvent<unknown>): void => {
    const data = event.data as OcrWorkerResponse | { type?: string };
    if (!data || typeof (data as { id?: unknown }).id !== 'number') return;
    const resp = data as OcrWorkerResponse;
    const pending = this.dedicatedPending.get(resp.id);
    if (!pending) return;
    this.dedicatedPending.delete(resp.id);
    if (resp.type === 'ok') {
      const r = resp.result as { text?: string; confidence?: number; latency_ms?: number; lang?: string };
      if (typeof r.text === 'string') {
        pending.resolve({
          text: r.text,
          confidence: r.confidence ?? 0,
          latency_ms: r.latency_ms ?? 0,
          lang: r.lang ?? DEFAULT_LANG,
        });
      } else {
        /* cleanup ack — pas attendu en pending recognize */
        pending.reject(new Error('unexpected_cleanup_ack'));
      }
    } else {
      pending.reject(new Error(resp.error));
    }
  };

  private onDedicatedError = (event: ErrorEvent): void => {
    logger.warn('ocr-offline', 'worker error', { msg: event.message });
    for (const [, p] of this.dedicatedPending) {
      p.reject(new Error(`worker_error: ${event.message}`));
    }
    this.dedicatedPending.clear();
  };

  private callDedicated(
    imageBase64: string,
    lang: string,
    timeoutMs: number,
  ): Promise<{ text: string; confidence: number; latency_ms: number; lang: string }> {
    if (!this.dedicatedWorker) return Promise.reject(new Error('worker_not_ready'));
    const id = this.dedicatedNextId++;
    return new Promise((resolve, reject) => {
      this.dedicatedPending.set(id, { resolve, reject });
      const req: OcrWorkerRequest = { type: 'recognize', id, imageBase64, lang, timeoutMs };
      this.dedicatedWorker?.postMessage(req);
      /* Safety timeout 5s au-dessus du timeout interne */
      setTimeout(() => {
        if (this.dedicatedPending.has(id)) {
          this.dedicatedPending.delete(id);
          reject(new Error('worker_call_timeout'));
        }
      }, timeoutMs + 5_000);
    });
  }

  /**
   * Reconnaît du texte dans une image.
   * @param imageBase64 - Image encodée base64 ('data:image/png;base64,...' ou raw base64)
   * @param options - { lang, timeoutMs }
   *
   * Stratégie v13.3.71 :
   * 1. Tente le Web Worker dédié (off-main-thread, ne bloque pas l'UI).
   * 2. Si Worker indispo → fallback main-thread (comportement historique).
   */
  async recognizeText(
    imageBase64: string,
    options: { lang?: string; timeoutMs?: number } = {},
  ): Promise<OcrResult> {
    const start = Date.now();
    const lang = options.lang ?? DEFAULT_LANG;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const result: OcrResult = {
      ok: false,
      text: '',
      confidence: 0,
      latency_ms: 0,
      source: 'tesseract-offline',
    };

    if (!imageBase64) {
      result.error = 'empty_image';
      return result;
    }

    /* 1. Try off-main-thread worker first (perf) */
    try {
      const ok = await this.ensureDedicatedWorker();
      if (ok) {
        const r = await this.callDedicated(imageBase64, lang, timeoutMs);
        result.ok = true;
        result.text = r.text;
        result.confidence = r.confidence;
        result.latency_ms = r.latency_ms || (Date.now() - start);
        return result;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('ocr-offline', 'worker recognize failed → fallback main-thread', { err: msg });
      /* fallthrough to main-thread */
    }

    /* 2. Fallback main-thread (comportement historique). */
    try {
      const worker = await this.ensureWorker(lang);
      /* Normalize : si pas de prefix data:, ajoute */
      const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
      /* Wrap dans Promise.race pour timeout strict */
      const recognition = worker.recognize(dataUrl);
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('ocr_timeout')), timeoutMs);
      });
      const recognized = await Promise.race([recognition, timeout]);
      result.ok = true;
      result.text = recognized.data.text;
      result.confidence = Math.round(recognized.data.confidence) / 100;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      logger.warn('ocr-offline', 'recognition failed', { err: msg });
    } finally {
      result.latency_ms = Date.now() - start;
    }
    return result;
  }

  /**
   * True si OCR offline est dispo (browser context + tesseract chargeable).
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  /**
   * Cleanup : termine les workers et libère mémoire.
   * v13.3.71 : termine aussi le Web Worker dédié.
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        /* ignore */
      }
      this.worker = null;
      this.workerLang = null;
    }
    if (this.dedicatedWorker) {
      try {
        this.dedicatedWorker.terminate();
      } catch {
        /* ignore */
      }
      this.dedicatedWorker = null;
      this.dedicatedReady = false;
      this.dedicatedInitPromise = null;
      this.dedicatedPermFail = false;
      /* Reject all pending */
      for (const [, p] of this.dedicatedPending) {
        try { p.reject(new Error('cleanup')); } catch { /* ignore */ }
      }
      this.dedicatedPending.clear();
    }
  }
}

export const ocrOffline = new OcrOfflineService();
