/**
 * APEX v13 — OCR Web Worker
 *
 * Off-main-thread Tesseract.js OCR.
 *
 * Pourquoi un worker dédié :
 * - Tesseract.js bloque 1-3s par scan sur main thread (init WASM + reconnaissance).
 *   Même si Tesseract.js v5 utilise déjà un worker interne pour l'init, charger le
 *   script via importScripts() depuis CDN reste lent → on isole.
 * - Permet au worker de garder son state warm entre scans (worker tesseract réutilisé).
 *
 * Stratégie :
 * - Lazy-load tesseract.js depuis CDN via importScripts().
 *   (Tesseract.js v5 expose un global `Tesseract` quand chargé via UMD.)
 * - Crée un Tesseract worker interne avec lang FR+EN par défaut.
 * - Reconnaissance text + confidence par image (data URL ou base64).
 * - Pas de stockage image (privacy).
 *
 * Lazy-init obligatoire : services/ocr-offline.ts l'instancie au 1er scan.
 * Pas chargé au boot (~3 MB WASM).
 *
 * Backward-compat : services/ocr-offline.ts garde fallback main-thread (charge
 * Tesseract via <script>) si Worker indispo.
 */

/// <reference lib="webworker" />

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.min.js';
const DEFAULT_LANG = 'fra+eng';
const DEFAULT_TIMEOUT_MS = 60_000;

/* Tesseract globals injectés via importScripts() */
interface TesseractRecognized {
  data: { text: string; confidence: number };
}

interface TesseractInternalWorker {
  recognize: (image: string) => Promise<TesseractRecognized>;
  terminate: () => Promise<void>;
}

interface TesseractGlobal {
  createWorker: (lang: string) => Promise<TesseractInternalWorker>;
}

declare const Tesseract: TesseractGlobal | undefined;

export interface OcrWorkerRecognizeReq {
  type: 'recognize';
  id: number;
  imageBase64: string;
  lang?: string;
  timeoutMs?: number;
}

export interface OcrWorkerCleanupReq {
  type: 'cleanup';
  id: number;
}

export type OcrWorkerRequest = OcrWorkerRecognizeReq | OcrWorkerCleanupReq;

export interface OcrWorkerOkRecognize {
  type: 'ok';
  id: number;
  result: {
    text: string;
    confidence: number;
    latency_ms: number;
    lang: string;
  };
}

export interface OcrWorkerOkVoid {
  type: 'ok';
  id: number;
  result: { cleaned: boolean };
}

export interface OcrWorkerErr {
  type: 'err';
  id: number;
  error: string;
}

export type OcrWorkerResponse = OcrWorkerOkRecognize | OcrWorkerOkVoid | OcrWorkerErr;

let tesseractLoaded = false;
let loadPromise: Promise<void> | null = null;
let internalWorker: TesseractInternalWorker | null = null;
let internalWorkerLang: string | null = null;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const ctx: DedicatedWorkerGlobalScope = self as any;

/* importScripts est dispo dans Worker (sync). Tesseract v5 charge ses propres
 * sub-workers en interne via Blob URLs — fonctionne dans un classic Worker. */
function loadTesseract(): Promise<void> {
  if (tesseractLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      (ctx as any).importScripts(TESSERACT_CDN);
      if (typeof Tesseract === 'undefined') {
        loadPromise = null;
        reject(new Error('tesseract_not_global_after_import'));
        return;
      }
      tesseractLoaded = true;
      resolve();
    } catch (err) {
      loadPromise = null;
      const msg = err instanceof Error ? err.message : String(err);
      reject(new Error(`tesseract_load_failed: ${msg}`));
    }
  });
  return loadPromise;
}

async function ensureInternalWorker(lang: string): Promise<TesseractInternalWorker> {
  await loadTesseract();
  if (typeof Tesseract === 'undefined') {
    throw new Error('tesseract_unavailable');
  }
  if (internalWorker && internalWorkerLang === lang) return internalWorker;
  if (internalWorker && internalWorkerLang !== lang) {
    try {
      await internalWorker.terminate();
    } catch {
      /* ignore */
    }
    internalWorker = null;
    internalWorkerLang = null;
  }
  internalWorker = await Tesseract.createWorker(lang);
  internalWorkerLang = lang;
  return internalWorker;
}

async function recognize(
  imageBase64: string,
  lang: string,
  timeoutMs: number,
): Promise<{ text: string; confidence: number; latency_ms: number; lang: string }> {
  const start = Date.now();
  if (!imageBase64) throw new Error('empty_image');
  const worker = await ensureInternalWorker(lang);
  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;
  const recognition = worker.recognize(dataUrl);
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('ocr_timeout')), timeoutMs);
  });
  const recognized = await Promise.race([recognition, timeout]);
  return {
    text: recognized.data.text,
    confidence: Math.round(recognized.data.confidence) / 100,
    latency_ms: Date.now() - start,
    lang,
  };
}

async function cleanup(): Promise<{ cleaned: boolean }> {
  if (!internalWorker) return { cleaned: false };
  try {
    await internalWorker.terminate();
  } catch {
    /* ignore */
  }
  internalWorker = null;
  internalWorkerLang = null;
  return { cleaned: true };
}

function isRequest(v: unknown): v is OcrWorkerRequest {
  if (!v || typeof v !== 'object') return false;
  const r = v as { type?: unknown; id?: unknown };
  if (typeof r.id !== 'number') return false;
  return r.type === 'recognize' || r.type === 'cleanup';
}

ctx.addEventListener('message', (event: MessageEvent<unknown>) => {
  void (async (): Promise<void> => {
    const data = event.data;
    if (!isRequest(data)) {
      const id =
        typeof (data as { id?: unknown })?.id === 'number'
          ? ((data as { id: number }).id)
          : -1;
      const errMsg: OcrWorkerErr = { type: 'err', id, error: 'invalid_request' };
      ctx.postMessage(errMsg);
      return;
    }
    try {
      if (data.type === 'recognize') {
        const result = await recognize(
          data.imageBase64,
          data.lang ?? DEFAULT_LANG,
          data.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
        const ok: OcrWorkerOkRecognize = { type: 'ok', id: data.id, result };
        ctx.postMessage(ok);
      } else {
        const result = await cleanup();
        const ok: OcrWorkerOkVoid = { type: 'ok', id: data.id, result };
        ctx.postMessage(ok);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errResp: OcrWorkerErr = { type: 'err', id: data.id, error: msg };
      ctx.postMessage(errResp);
    }
  })();
});

ctx.postMessage({ type: 'ready' });
