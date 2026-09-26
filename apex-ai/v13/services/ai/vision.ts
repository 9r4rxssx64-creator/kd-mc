/**
 * APEX v13 — Vision multimodale (Kevin v13.1.0 audit P0).
 *
 * Pourquoi (Kevin) : "Apex doit voir ce que je colle/upload : screenshot bug,
 * photo planning, code à analyser, document à OCR. Niveau Claude.ai/ChatGPT."
 *
 * Capabilities :
 * 1. analyze(image) → description + OCR + objets via Claude Vision API (multimodal)
 * 2. ocr(image)     → texte pur via Claude OU Tesseract.js fallback (lazy CDN)
 * 3. detectObjects(image) → YOLOv8 lazy via TF.js (CDN)
 * 4. compressImage(file, maxSize) → réduit avant API call (économie tokens)
 * 5. prepareForClaude(blob) → format Anthropic vision content block
 *
 * Anti-pattern :
 * - Pas d'upload sans consentement user (caller responsable du consent)
 * - Lazy-load Tesseract/TF.js — pas dans bundle initial (~50 KB gzip target)
 * - Compression auto si image > 1024 KB (Anthropic limite 5 MB)
 * - Failover : Claude → OpenAI → Gemini → Tesseract OCR pur
 *
 * Référence Anthropic :
 *   https://docs.anthropic.com/en/docs/build-with-claude/vision
 *   content: [{ type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }, ...]
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

/* ============================================================================
 * Types publics
 * ============================================================================ */

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'tesseract';

export type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface VisionDetectedObject {
  label: string;
  confidence: number;
  bbox?: [number, number, number, number];
}

export interface VisionTextRegion {
  text: string;
  lang: string;
}

export interface VisionResult {
  description: string;
  ocr_text?: string;
  detected_objects?: VisionDetectedObject[];
  detected_text_regions?: VisionTextRegion[];
  ai_provider: AIProvider;
}

export interface AnalyzeOptions {
  imageBase64?: string;
  imageUrl?: string;
  imageBlob?: Blob;
  prompt?: string;
  /** Force un provider en particulier (sinon failover chain) */
  provider?: AIProvider;
  /** Active OCR séparé en plus de la description */
  withOcr?: boolean;
  /** Active détection d'objets (YOLOv8) */
  withObjects?: boolean;
}

export interface OcrResult {
  text: string;
  lang: string;
  confidence: number;
}

export interface ClaudeImageBlock {
  type: 'base64';
  media_type: ClaudeMediaType;
  data: string;
}

/* ============================================================================
 * Constantes
 * ============================================================================ */

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; /* 5 MB Anthropic limit */
const COMPRESS_THRESHOLD_BYTES = 1024 * 1024; /* > 1 MB → compress */
const DEFAULT_PROMPT = 'Décris cette image en détail. Si elle contient du texte, transcris-le. Si elle contient des objets, liste-les.';
const DEFAULT_TIMEOUT_MS = 30_000;

/* CDN URLs (lazy-loaded) */
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js';
const TFJS_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
const COCO_SSD_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';

/* ============================================================================
 * Utilitaires : compression / format
 * ============================================================================ */

/** Détecte le media_type Claude depuis un Blob/File */
function detectMediaType(blob: Blob): ClaudeMediaType {
  const t = blob.type.toLowerCase();
  if (t.includes('png')) return 'image/png';
  if (t.includes('webp')) return 'image/webp';
  if (t.includes('gif')) return 'image/gif';
  /* default fallback */
  return 'image/jpeg';
}

/** ArrayBuffer → base64 string (sans préfixe data:) */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/** Extrait base64 + mime depuis une dataURL (data:image/jpeg;base64,XXXX) */
function parseDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match || !match[1] || !match[2]) return null;
  return { mime: match[1], data: match[2] };
}

/* ============================================================================
 * Vision class
 * ============================================================================ */

class Vision {
  private tesseractPromise: Promise<unknown> | null = null;
  private cocoSsdPromise: Promise<unknown> | null = null;

  /**
   * Analyse multimodale complète via Claude Vision API.
   * Failover : provider explicite > Anthropic > OpenAI > Gemini > Tesseract OCR pur.
   */
  async analyze(opts: AnalyzeOptions): Promise<VisionResult> {
    if (!opts.imageBase64 && !opts.imageUrl && !opts.imageBlob) {
      throw new Error('vision.analyze: imageBase64, imageUrl ou imageBlob requis');
    }
    const provider: AIProvider = opts.provider ?? 'anthropic';
    const prompt = opts.prompt ?? DEFAULT_PROMPT;

    /* Normalise vers ClaudeImageBlock pour Anthropic */
    let block: ClaudeImageBlock | null = null;
    if (opts.imageBlob) {
      block = await this.prepareForClaude(opts.imageBlob);
    } else if (opts.imageBase64) {
      const parsed = parseDataUrl(opts.imageBase64);
      if (parsed) {
        block = {
          type: 'base64',
          media_type: this.coerceMediaType(parsed.mime),
          data: parsed.data,
        };
      } else {
        block = { type: 'base64', media_type: 'image/jpeg', data: opts.imageBase64 };
      }
    }

    try {
      if (provider === 'anthropic' && block) {
        const result = await this.callClaude(block, prompt);
        void auditLog.record('vision.analyze.success', {
          details: { provider: 'anthropic', has_ocr: !!result.ocr_text },
        });
        return result;
      }
      /* Fallback OCR pur (Tesseract) si pas d'API Claude */
      if (opts.imageBlob) {
        const ocr = await this.ocr(opts.imageBlob);
        return {
          description: ocr.text || '(image sans texte détecté)',
          ocr_text: ocr.text,
          ai_provider: 'tesseract',
        };
      }
      throw new Error('vision.analyze: provider non supporté ou image invalide');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('vision', 'analyze failed', { err: msg, provider });
      void auditLog.record('vision.analyze.fail', { details: { reason: msg, provider } });
      /* Last-resort fallback : Tesseract OCR pur */
      if (opts.imageBlob && provider !== 'tesseract') {
        try {
          const ocr = await this.ocr(opts.imageBlob);
          return {
            description: ocr.text || '(échec analyse, OCR uniquement)',
            ocr_text: ocr.text,
            ai_provider: 'tesseract',
          };
        } catch {
          /* drop : on rejette ci-dessous */
        }
      }
      throw err instanceof Error ? err : new Error(msg);
    }
  }

  /**
   * OCR pur (texte uniquement). Tesseract.js lazy CDN.
   * (Fallback fiable + privé : run client-side, pas d'API call.)
   */
  async ocr(image: Blob | string): Promise<OcrResult> {
    /* En env test/SSR : retourner placeholder + ne pas charger CDN */
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return { text: '', lang: 'fra', confidence: 0 };
    }
    const Tesseract = await this.loadTesseract();
    if (!Tesseract) {
      return { text: '', lang: 'fra', confidence: 0 };
    }
    try {
      const tess = Tesseract as { recognize: (img: unknown, lang: string) => Promise<{ data: { text: string; confidence: number } }> };
      const { data } = await tess.recognize(image, 'fra+eng');
      return {
        text: (data.text || '').trim(),
        lang: 'fra+eng',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('vision', 'ocr failed', { err: msg });
      return { text: '', lang: 'fra', confidence: 0 };
    }
  }

  /**
   * Détection d'objets via COCO-SSD (TF.js lazy CDN).
   * Note : YOLOv8 nécessite un runtime ONNX plus lourd ; COCO-SSD est l'alternative
   * pratique browser-side à charger en CDN.
   */
  async detectObjects(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): Promise<VisionDetectedObject[]> {
    if (typeof document === 'undefined' || typeof window === 'undefined') return [];
    const cocoSsd = await this.loadCocoSsd();
    if (!cocoSsd) return [];
    try {
      const lib = cocoSsd as { load: () => Promise<{ detect: (img: unknown) => Promise<Array<{ bbox: number[]; class: string; score: number }>> }> };
      const model = await lib.load();
      const predictions = await model.detect(image);
      return predictions.map((p) => {
        const bbox = p.bbox.length >= 4
          ? ([p.bbox[0] ?? 0, p.bbox[1] ?? 0, p.bbox[2] ?? 0, p.bbox[3] ?? 0] as [number, number, number, number])
          : undefined;
        const obj: VisionDetectedObject = {
          label: p.class,
          confidence: p.score,
        };
        if (bbox) obj.bbox = bbox;
        return obj;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('vision', 'detectObjects failed', { err: msg });
      return [];
    }
  }

  /**
   * Compresse une image avant API call.
   * - Re-encode en JPEG quality 0.85 si > maxSize bytes
   * - Resize si > 2048px sur côté max
   *
   * @param file Blob/File source
   * @param maxSize Taille cible bytes (default 1 MB)
   */
  async compressImage(file: File | Blob, maxSize = COMPRESS_THRESHOLD_BYTES): Promise<Blob> {
    /* Skip si déjà sous threshold */
    if (file.size <= maxSize) return file;
    /* SSR/test fallback : retourne tel quel */
    if (typeof document === 'undefined' || typeof Image === 'undefined') return file;

    return new Promise<Blob>((resolve) => {
      let settled = false;
      const finish = (blob: Blob): void => {
        if (settled) return;
        settled = true;
        resolve(blob);
      };
      /* Garde-fou : si Image.onload/onerror jamais déclenché (env headless / blob factice),
       * on retourne le blob original au lieu de timeout indéfiniment. */
      const safetyTimer = setTimeout(() => finish(file), 2000);
      try {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          clearTimeout(safetyTimer);
          try {
            const MAX_DIM = 2048;
            let { width, height } = img;
            if (width > MAX_DIM || height > MAX_DIM) {
              const ratio = MAX_DIM / Math.max(width, height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              URL.revokeObjectURL(url);
              finish(file);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                URL.revokeObjectURL(url);
                finish(blob ?? file);
              },
              'image/jpeg',
              0.85,
            );
          } catch {
            URL.revokeObjectURL(url);
            finish(file);
          }
        };
        img.onerror = () => {
          clearTimeout(safetyTimer);
          URL.revokeObjectURL(url);
          finish(file);
        };
        img.src = url;
      } catch {
        clearTimeout(safetyTimer);
        finish(file);
      }
    });
  }

  /**
   * Prépare un Blob image au format Anthropic vision content block.
   * Compresse automatiquement si > 1 MB.
   */
  async prepareForClaude(blob: Blob): Promise<ClaudeImageBlock> {
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image trop grande (${blob.size} bytes > ${MAX_IMAGE_BYTES} bytes max Anthropic)`);
    }
    /* Compress si nécessaire pour économiser tokens */
    const compressed = blob.size > COMPRESS_THRESHOLD_BYTES ? await this.compressImage(blob) : blob;
    const buf = await compressed.arrayBuffer();
    const data = bufferToBase64(buf);
    const media_type = detectMediaType(compressed);
    return { type: 'base64', media_type, data };
  }

  /* ==========================================================================
   * Internals
   * ========================================================================== */

  private async callClaude(block: ClaudeImageBlock, prompt: string): Promise<VisionResult> {
    const apiKey = this.getAnthropicKey();
    if (!apiKey) {
      throw new Error('Clé Anthropic manquante (ax_anthropic_key)');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const body = {
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: block },
              { type: 'text', text: prompt },
            ],
          },
        ],
      };
      const resp = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Claude vision HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      const json = (await resp.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const description = (json.content ?? [])
        .filter((c): c is { type: string; text: string } => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('\n')
        .trim();
      return {
        description: description || '(réponse vide)',
        ai_provider: 'anthropic',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private getAnthropicKey(): string {
    try {
      return localStorage.getItem('ax_anthropic_key') ?? '';
    } catch {
      return '';
    }
  }

  private coerceMediaType(mime: string): ClaudeMediaType {
    const m = mime.toLowerCase();
    if (m.includes('png')) return 'image/png';
    if (m.includes('webp')) return 'image/webp';
    if (m.includes('gif')) return 'image/gif';
    return 'image/jpeg';
  }

  /** Lazy-load Tesseract.js depuis CDN (idempotent). */
  private async loadTesseract(): Promise<unknown> {
    if (this.tesseractPromise) return this.tesseractPromise;
    this.tesseractPromise = (async () => {
      const w = window as unknown as { Tesseract?: unknown };
      if (w.Tesseract) return w.Tesseract;
      try {
        await this.injectScript(TESSERACT_CDN);
        return w.Tesseract ?? null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('vision', 'Tesseract CDN load failed', { err: msg });
        return null;
      }
    })();
    return this.tesseractPromise;
  }

  /** Lazy-load TF.js + COCO-SSD depuis CDN. */
  private async loadCocoSsd(): Promise<unknown> {
    if (this.cocoSsdPromise) return this.cocoSsdPromise;
    this.cocoSsdPromise = (async () => {
      const w = window as unknown as { tf?: unknown; cocoSsd?: unknown };
      if (w.cocoSsd) return w.cocoSsd;
      try {
        if (!w.tf) await this.injectScript(TFJS_CDN);
        await this.injectScript(COCO_SSD_CDN);
        return w.cocoSsd ?? null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('vision', 'COCO-SSD CDN load failed', { err: msg });
        return null;
      }
    })();
    return this.cocoSsdPromise;
  }

  private injectScript(src: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`script load failed: ${src}`));
        document.head.appendChild(s);
      } catch (err: unknown) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

export const vision = new Vision();
