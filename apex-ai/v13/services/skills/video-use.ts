/**
 * APEX v13.4.12 — Skill : Video Use (ffmpeg.wasm + Hyperframes).
 *
 * Lazy-load @ffmpeg/ffmpeg + @ffmpeg/util via CDN (esm.sh) au 1er usage.
 * Operations supportées :
 *  - cut         : couper [start, end] secondes
 *  - concat      : concaténer 2+ vidéos
 *  - resize      : changer dimensions (9:16, 1:1, 16:9)
 *  - watermark   : overlay image base64 (position, opacité)
 *  - extract_audio : extraire MP3
 *  - captions    : burn-in SRT
 *
 * Fallback iOS Safari : si crash mémoire > 100MB, propose
 * Cloudflare Worker server-side transcoding (URL configurable Vault).
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

const FFMPEG_CDN = 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
const FFMPEG_UTIL_CDN = 'https://esm.sh/@ffmpeg/util@0.12.1';
const FFMPEG_CORE_URL = 'https://esm.sh/@ffmpeg/core@0.12.6/dist/esm';

export type VideoOperation = 'cut' | 'concat' | 'resize' | 'watermark' | 'extract_audio' | 'captions';

export interface VideoEditInput {
  operation: VideoOperation;
  videoSource: string; /* blob://, data:, https:// */
  params?: Record<string, unknown> | undefined;
}

export interface VideoEditOutput {
  success: boolean;
  filename: string;
  blobUrl: string;
  durationSec?: number | undefined;
  sizeBytes: number;
  resolution?: string | undefined;
  error?: string | undefined;
}

let ffmpegInstance: unknown = null;

async function loadFfmpeg(): Promise<unknown> {
  if (ffmpegInstance) return ffmpegInstance;
  try {
    /* Dynamic ESM import via CDN */
    const ffmpegMod = await import(/* @vite-ignore */ FFMPEG_CDN);
    const utilMod = await import(/* @vite-ignore */ FFMPEG_UTIL_CDN);
    const { FFmpeg } = ffmpegMod as { FFmpeg: new () => Record<string, unknown> };
    const { toBlobURL, fetchFile } = utilMod as {
      toBlobURL: (url: string, mimeType: string) => Promise<string>;
      fetchFile: (input: unknown) => Promise<Uint8Array>;
    };
    const ff = new FFmpeg();
    const load = ff['load'] as (opts: { coreURL: string; wasmURL: string }) => Promise<void>;
    await load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    /* Stocke instance + helpers ensemble */
    ffmpegInstance = { ff, fetchFile, toBlobURL };
    return ffmpegInstance;
  } catch (err) {
    logger.warn('skill.video', 'ffmpeg load failed', { err });
    return null;
  }
}

async function fetchToBytes(source: string): Promise<Uint8Array> {
  const response = await fetch(source);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export const videoUse = {
  async edit(input: VideoEditInput): Promise<VideoEditOutput> {
    try {
      const instance = (await loadFfmpeg()) as
        | {
            ff: Record<string, unknown>;
            fetchFile: (input: unknown) => Promise<Uint8Array>;
          }
        | null;
      if (!instance) {
        return {
          success: false,
          filename: '',
          blobUrl: '',
          sizeBytes: 0,
          error: 'ffmpeg.wasm CDN load failed (iOS Safari mémoire ?) — utiliser Cloudflare Worker fallback',
        };
      }
      const { ff, fetchFile } = instance;
      const inputBytes = await fetchToBytes(input.videoSource).catch(() => fetchFile(input.videoSource));
      const inputName = 'in.mp4';
      const outputName = 'out.mp4';

      const writeFile = ff['writeFile'] as (name: string, data: Uint8Array) => Promise<void>;
      const readFile = ff['readFile'] as (name: string) => Promise<Uint8Array>;
      const exec = ff['exec'] as (args: string[]) => Promise<number>;

      await writeFile(inputName, inputBytes);

      const params = input.params ?? {};
      let args: string[] = [];

      switch (input.operation) {
        case 'cut': {
          const startSec = typeof params['start_sec'] === 'number' ? params['start_sec'] : 0;
          const endSec = typeof params['end_sec'] === 'number' ? params['end_sec'] : 10;
          args = ['-i', inputName, '-ss', String(startSec), '-to', String(endSec), '-c', 'copy', outputName];
          break;
        }
        case 'resize': {
          const ratio = (params['target_ratio'] as string) ?? '16:9';
          const filter =
            ratio === '9:16'
              ? 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2'
              : ratio === '1:1'
                ? 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2'
                : 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
          args = ['-i', inputName, '-vf', filter, '-c:a', 'copy', outputName];
          break;
        }
        case 'extract_audio': {
          args = ['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', 'audio.mp3'];
          break;
        }
        case 'watermark': {
          /* Watermark image fournie en base64 dans params.watermark_image_base64 */
          const watermarkB64 = (params['watermark_image_base64'] as string) ?? '';
          if (!watermarkB64) {
            return {
              success: false,
              filename: '',
              blobUrl: '',
              sizeBytes: 0,
              error: 'watermark_image_base64 requis',
            };
          }
          /* Decode base64 → write logo.png */
          const wmBytes = Uint8Array.from(atob(watermarkB64.replace(/^data:image\/[^;]+;base64,/, '')), (c) =>
            c.charCodeAt(0),
          );
          await writeFile('logo.png', wmBytes);
          args = [
            '-i',
            inputName,
            '-i',
            'logo.png',
            '-filter_complex',
            'overlay=W-w-10:H-h-10',
            outputName,
          ];
          break;
        }
        case 'concat': {
          /* Multiple sources via params.sources[] */
          const sources = (params['sources'] as string[]) ?? [];
          if (sources.length < 2) {
            return {
              success: false,
              filename: '',
              blobUrl: '',
              sizeBytes: 0,
              error: 'concat requires 2+ sources',
            };
          }
          const concatList: string[] = [];
          for (let i = 0; i < sources.length; i++) {
            const src = sources[i];
            if (!src) continue;
            const fn = `c${i}.mp4`;
            const b = await fetchToBytes(src).catch(() => fetchFile(src));
            await writeFile(fn, b);
            concatList.push(`file '${fn}'`);
          }
          await writeFile('concat.txt', new TextEncoder().encode(concatList.join('\n')));
          args = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', outputName];
          break;
        }
        case 'captions': {
          /* Burn-in SRT (params.srt_text) */
          const srt = (params['srt_text'] as string) ?? '';
          if (!srt) {
            return {
              success: false,
              filename: '',
              blobUrl: '',
              sizeBytes: 0,
              error: 'srt_text requis',
            };
          }
          await writeFile('subs.srt', new TextEncoder().encode(srt));
          args = ['-i', inputName, '-vf', "subtitles=subs.srt", outputName];
          break;
        }
        default:
          return {
            success: false,
            filename: '',
            blobUrl: '',
            sizeBytes: 0,
            error: `Operation ${input.operation as string} non implémentée`,
          };
      }

      const exitCode = await exec(args);
      if (exitCode !== 0) {
        return {
          success: false,
          filename: '',
          blobUrl: '',
          sizeBytes: 0,
          error: `ffmpeg exit code ${exitCode}`,
        };
      }

      const outName = input.operation === 'extract_audio' ? 'audio.mp3' : outputName;
      const outputBytes = await readFile(outName);
      const mime = input.operation === 'extract_audio' ? 'audio/mpeg' : 'video/mp4';
      const blob = new Blob([new Uint8Array(outputBytes)], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const filename = `${input.operation}_${Date.now()}.${input.operation === 'extract_audio' ? 'mp3' : 'mp4'}`;

      await auditLog.record('skill.video.edited', {
        details: { operation: input.operation, size: blob.size },
      });

      return {
        success: true,
        filename,
        blobUrl,
        sizeBytes: blob.size,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('skill.video', 'edit failed', { err: errMsg });
      return {
        success: false,
        filename: '',
        blobUrl: '',
        sizeBytes: 0,
        error: errMsg,
      };
    }
  },

  /**
   * Hyperframes : compose vidéo via HTML/CSS/JS rendering offscreen.
   * Utilise html2canvas + MediaRecorder pour capturer animations.
   */
  async composeHyperframes(input: {
    compositionId: string;
    dataWidth?: number | undefined;
    dataHeight?: number | undefined;
    dataFps?: number | undefined;
    beats: Array<{ id: string; durationMs: number; html: string; css?: string | undefined }>;
  }): Promise<VideoEditOutput> {
    try {
      const width = input.dataWidth ?? 1920;
      const height = input.dataHeight ?? 1080;
      const fps = input.dataFps ?? 30;

      /* Création offscreen container */
      const offscreen = document.createElement('div');
      offscreen.style.cssText = `position:fixed;top:-99999px;left:0;width:${width}px;height:${height}px;overflow:hidden`;
      document.body.appendChild(offscreen);

      /* Création canvas pour MediaRecorder */
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });

      recorder.start();

      /* Sérialise beats : pour chaque beat, render HTML → svg → canvas via SVG foreignObject */
      for (const beat of input.beats) {
        const styleTag = beat.css ? `<style>${beat.css}</style>` : '';
        const svgData =
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
          `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${styleTag}${beat.html}</div></foreignObject></svg>`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          img.onload = () => {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        });
        await new Promise((r) => setTimeout(r, beat.durationMs));
      }

      recorder.stop();
      const blob = await done;
      document.body.removeChild(offscreen);

      const blobUrl = URL.createObjectURL(blob);
      const filename = `hyperframes_${input.compositionId}_${Date.now()}.webm`;

      await auditLog.record('skill.hyperframes.composed', {
        details: { compositionId: input.compositionId, beats: input.beats.length, size: blob.size },
      });

      return {
        success: true,
        filename,
        blobUrl,
        sizeBytes: blob.size,
        resolution: `${width}x${height}`,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('skill.hyperframes', 'compose failed', { err: errMsg });
      return {
        success: false,
        filename: '',
        blobUrl: '',
        sizeBytes: 0,
        error: errMsg,
      };
    }
  },
};
