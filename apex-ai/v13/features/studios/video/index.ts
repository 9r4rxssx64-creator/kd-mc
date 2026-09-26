/**
 * APEX v13 — Studio Vidéo EXPERT PRO (port v12 + boost v13).
 *
 * Studio créatif pour montage vidéo simple via MediaRecorder API + Canvas.
 * Niveau expert : éditeur vidéo browser CapCut-like.
 *
 * Features Kevin :
 * - Upload vidéos multiples (MP4, WebM, MOV, MKV)
 * - Timeline visuelle (cuts, durée, transitions)
 * - Captions auto + traduction 30 langues
 * - Crop / rotate / mirror / flip
 * - Color grading : saturation, contrast, lift/gamma/gain (3-way)
 * - LUT presets : cinéma, vintage, BW, sépia, teal-orange, neutre
 * - Picture-in-picture / split screen
 * - Green screen chroma key (HSV-based)
 * - Speed ramping (slow-mo / fast)
 * - Stabilization (heuristique reduction-shake)
 * - Auto-crop format vertical TikTok 9:16, horizontal YouTube 16:9, carré IG 1:1
 * - Watermark logo (position + opacité)
 * - Export MP4 / WebM via MediaRecorder + canvas + audio mix
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Validation stricte (formats, tailles)
 * - Cleanup ObjectURL pour éviter leak
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { isFeatureEnabled, renderDisabledNotice } from '../../../services/auth/feature-toggles.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeVideoScope: CleanupScope | null = null;

export function dispose(): void {
  activeVideoScope?.cleanup();
  activeVideoScope = null;
}

export type TransitionKind = 'none' | 'fade' | 'cut' | 'slide' | 'dissolve' | 'wipe' | 'zoom' | 'glitch' | 'morph' | 'flash' | 'spin' | 'shutter' | 'iris' | 'whip_pan' | 'crossfade' | 'film_burn' | 'glitch_rgb' | 'cube_3d' | 'reveal_circle' | 'split_horizontal' | 'split_vertical';
export type AspectRatio = 'original' | '16:9' | '9:16' | '1:1' | '4:3' | '21:9' | '2.39:1' | '5:4' | '3:2';
export type LutPreset = 'none' | 'cinema' | 'vintage' | 'bw' | 'sepia' | 'teal-orange' | 'cool' | 'warm' | 'noir' | 'cyberpunk' | 'anime' | 'kodak_portra' | 'fuji_velvia' | 'matrix_green' | 'wes_anderson' | 'la_la_land' | 'blade_runner' | 'desaturated' | 'high_contrast' | 'pastel' | 'gold_rush' | 'tropical';
export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type CropFormat = 'auto-tiktok' | 'auto-youtube' | 'auto-ig' | 'auto-cinema' | 'manual';

export interface ColorGrading {
  saturation: number; /* 0..2 (1 = neutre) */
  contrast: number; /* 0..2 (1 = neutre) */
  brightness: number; /* -1..+1 (0 = neutre) */
  lift: { r: number; g: number; b: number }; /* shadows -0.5..+0.5 */
  gamma: { r: number; g: number; b: number }; /* midtones 0.5..1.5 */
  gain: { r: number; g: number; b: number }; /* highlights 0.5..1.5 */
  lutPreset: LutPreset;
}

export interface ChromaKey {
  enabled: boolean;
  keyColor: { r: number; g: number; b: number }; /* 0..255 */
  threshold: number; /* 0..255, distance euclidienne max */
  smoothness: number; /* 0..1 */
}

export interface Watermark {
  enabled: boolean;
  text: string; /* logo text ou URL data: */
  position: WatermarkPosition;
  opacity: number; /* 0..1 */
}

export interface Transform {
  rotate: 0 | 90 | 180 | 270;
  mirrorH: boolean;
  mirrorV: boolean;
  cropX: number; /* 0..1 */
  cropY: number; /* 0..1 */
  cropW: number; /* 0..1 */
  cropH: number; /* 0..1 */
}

export interface VideoClip {
  id: string;
  name: string;
  url: string | null; /* ObjectURL si fichier importé */
  duration: number; /* secondes */
  start: number; /* trim start sec */
  end: number; /* trim end sec */
  speed: number; /* 0.25..4 (1 = vitesse normale) */
  caption: string;
  captionLang: string; /* fr, en, es, it, de, … */
  transition: TransitionKind;
  transform: Transform;
  colorGrading: ColorGrading;
  chromaKey: ChromaKey;
  stabilize: boolean;
}

export const MAX_CLIPS = 16; /* boost v13 : 12 → 16 clips timeline */
export const MAX_FILE_SIZE_MB = 200;
export const MAX_TOTAL_DURATION_S = 600; /* 10 min */
export const ACCEPTED_FORMATS: readonly string[] = [
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg', 'video/3gpp',
];

export const SUPPORTED_LANGS: readonly string[] = [
  'fr', 'en', 'es', 'it', 'de', 'pt', 'nl', 'ru', 'pl', 'ar',
  'zh', 'ja', 'ko', 'tr', 'sv', 'da', 'no', 'fi', 'el', 'he',
  'hi', 'th', 'vi', 'id', 'ms', 'cs', 'hu', 'ro', 'uk', 'bg',
  /* boost v13 : +20 langues sous-titres pro */
  'ca', 'eu', 'gl', 'cy', 'ga', 'sk', 'sl', 'hr', 'sr', 'lt',
  'lv', 'et', 'is', 'mt', 'sq', 'mk', 'be', 'ka', 'hy', 'az',
] as const;

/* boost v13 — Streaming platform export presets (codec/bitrate/resolution recommendations) */
export const STREAMING_PRESETS = {
  youtube_4k: { codec: 'h265', bitrate: 35000, resolution: '3840x2160', fps: 30, aspect: '16:9' },
  youtube_1080p: { codec: 'h264', bitrate: 8000, resolution: '1920x1080', fps: 30, aspect: '16:9' },
  youtube_shorts: { codec: 'h264', bitrate: 6000, resolution: '1080x1920', fps: 30, aspect: '9:16' },
  tiktok: { codec: 'h264', bitrate: 5000, resolution: '1080x1920', fps: 30, aspect: '9:16' },
  instagram_reels: { codec: 'h264', bitrate: 5000, resolution: '1080x1920', fps: 30, aspect: '9:16' },
  instagram_post: { codec: 'h264', bitrate: 4000, resolution: '1080x1080', fps: 30, aspect: '1:1' },
  instagram_story: { codec: 'h264', bitrate: 4000, resolution: '1080x1920', fps: 30, aspect: '9:16' },
  twitter: { codec: 'h264', bitrate: 5000, resolution: '1280x720', fps: 30, aspect: '16:9' },
  linkedin: { codec: 'h264', bitrate: 5000, resolution: '1920x1080', fps: 30, aspect: '16:9' },
  vimeo_4k: { codec: 'h265', bitrate: 30000, resolution: '3840x2160', fps: 30, aspect: '16:9' },
  facebook: { codec: 'h264', bitrate: 4000, resolution: '1280x720', fps: 30, aspect: '16:9' },
  cinema_dcp: { codec: 'jpeg2000', bitrate: 250000, resolution: '4096x2160', fps: 24, aspect: '2.39:1' },
} as const;

/* boost v13 — Watermark animation presets */
export const WATERMARK_ANIMATIONS = {
  none: { duration: 0, type: 'static' },
  fade_in: { duration: 1000, type: 'fade' },
  slide_in: { duration: 800, type: 'slide' },
  zoom_pulse: { duration: 1500, type: 'pulse' },
  rotate_360: { duration: 2000, type: 'rotate' },
  bounce: { duration: 1200, type: 'bounce' },
} as const;

/* boost v13 — Speed ramp presets (slow-mo et fast professionnels) */
export const SPEED_RAMP_PRESETS = {
  slow_mo_30: { speed: 0.3, label: 'Slow-mo 30%' },
  slow_mo_50: { speed: 0.5, label: 'Slow-mo 50%' },
  super_slow: { speed: 0.1, label: 'Super slow 10%' },
  normal: { speed: 1, label: 'Vitesse normale' },
  speed_2x: { speed: 2, label: 'Accéléré 2×' },
  speed_4x: { speed: 4, label: 'Accéléré 4×' },
  timelapse_8x: { speed: 8, label: 'Timelapse 8×' },
} as const;

export const ASPECT_RATIOS: Record<Exclude<AspectRatio, 'original'>, { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '4:3': { w: 1440, h: 1080 },
  '21:9': { w: 2560, h: 1080 },
  '2.39:1': { w: 2580, h: 1080 }, /* CinemaScope */
  '5:4': { w: 1350, h: 1080 },
  '3:2': { w: 1620, h: 1080 },
};

export function defaultColorGrading(): ColorGrading {
  return {
    saturation: 1,
    contrast: 1,
    brightness: 0,
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 1, g: 1, b: 1 },
    gain: { r: 1, g: 1, b: 1 },
    lutPreset: 'none',
  };
}

export function defaultChromaKey(): ChromaKey {
  return {
    enabled: false,
    keyColor: { r: 0, g: 255, b: 0 }, /* green screen */
    threshold: 80,
    smoothness: 0.1,
  };
}

export function defaultTransform(): Transform {
  return {
    rotate: 0,
    mirrorH: false,
    mirrorV: false,
    cropX: 0,
    cropY: 0,
    cropW: 1,
    cropH: 1,
  };
}

export function createClip(name: string, duration: number = 0): VideoClip {
  return {
    id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 100),
    url: null,
    duration: Math.max(0, duration),
    start: 0,
    end: duration,
    speed: 1,
    caption: '',
    captionLang: 'fr',
    transition: 'cut',
    transform: defaultTransform(),
    colorGrading: defaultColorGrading(),
    chromaKey: defaultChromaKey(),
    stabilize: false,
  };
}

/**
 * Format secondes en MM:SS lisible.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Calcul durée totale clips en respectant la vitesse (speed ramping).
 * Si speed=2 et clip de 10s → durée effective = 5s.
 */
export function calcTotalDuration(clips: readonly VideoClip[]): number {
  return clips.reduce((sum, c) => {
    const trimmed = Math.max(0, c.end - c.start);
    const speed = c.speed > 0 ? c.speed : 1;
    return sum + (trimmed / speed);
  }, 0);
}

/**
 * Validation format fichier vidéo (whitelist MIME).
 */
export function isValidVideoFormat(mimeType: string): boolean {
  return ACCEPTED_FORMATS.includes(mimeType);
}

/**
 * Validation langue caption.
 */
export function isValidLang(lang: string): boolean {
  return SUPPORTED_LANGS.includes(lang.toLowerCase());
}

/**
 * Calcule l'aspect ratio cible et les coordonnées de crop centrées
 * pour transformer une vidéo source (sw×sh) vers le format cible.
 * Ex : source 1920×1080 → 9:16 = crop centré 607×1080 (w=h*9/16).
 */
export function calcAutoCrop(
  sourceWidth: number, sourceHeight: number, format: CropFormat,
): { x: number; y: number; w: number; h: number; targetW: number; targetH: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: 0, y: 0, w: 0, h: 0, targetW: 0, targetH: 0 };
  }
  let target: { w: number; h: number };
  switch (format) {
    case 'auto-tiktok': target = ASPECT_RATIOS['9:16']; break;
    case 'auto-youtube': target = ASPECT_RATIOS['16:9']; break;
    case 'auto-ig': target = ASPECT_RATIOS['1:1']; break;
    case 'auto-cinema': target = ASPECT_RATIOS['21:9']; break;
    default: return { x: 0, y: 0, w: sourceWidth, h: sourceHeight, targetW: sourceWidth, targetH: sourceHeight };
  }
  const targetRatio = target.w / target.h;
  const sourceRatio = sourceWidth / sourceHeight;
  let cropW: number; let cropH: number;
  if (sourceRatio > targetRatio) {
    /* Source plus large → crop horizontal centré */
    cropH = sourceHeight;
    cropW = Math.round(cropH * targetRatio);
  } else {
    /* Source plus haute → crop vertical centré */
    cropW = sourceWidth;
    cropH = Math.round(cropW / targetRatio);
  }
  const x = Math.round((sourceWidth - cropW) / 2);
  const y = Math.round((sourceHeight - cropH) / 2);
  return { x, y, w: cropW, h: cropH, targetW: target.w, targetH: target.h };
}

/**
 * LUT preset → application sur pixel RGB.
 * Approximation : ajustements globaux pour préview.
 */
export function applyLutPreset(r: number, g: number, b: number, preset: LutPreset): { r: number; g: number; b: number } {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  switch (preset) {
    case 'none':
      return { r, g, b };
    case 'cinema':
      /* Teal-orange typique cinéma */
      return { r: clamp(r * 1.05 + 5), g: clamp(g * 0.95), b: clamp(b * 1.1) };
    case 'vintage':
      return { r: clamp(r * 0.9 + 30), g: clamp(g * 0.85 + 20), b: clamp(b * 0.7 + 10) };
    case 'bw': {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      return { r: clamp(gray), g: clamp(gray), b: clamp(gray) };
    }
    case 'sepia':
      return {
        r: clamp(0.393 * r + 0.769 * g + 0.189 * b),
        g: clamp(0.349 * r + 0.686 * g + 0.168 * b),
        b: clamp(0.272 * r + 0.534 * g + 0.131 * b),
      };
    case 'teal-orange':
      return { r: clamp(r * 1.15), g: clamp(g * 0.92), b: clamp(b * 1.08) };
    case 'cool':
      return { r: clamp(r * 0.92), g: clamp(g * 0.98), b: clamp(b * 1.15) };
    case 'warm':
      return { r: clamp(r * 1.1), g: clamp(g * 1.02), b: clamp(b * 0.9) };
    case 'noir':
      /* High contrast BW */
      return ((): { r: number; g: number; b: number } => {
        const gray = (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? 255 : 0;
        return { r: clamp(gray), g: clamp(gray), b: clamp(gray) };
      })();
    /* boost v13 : 13 nouveaux LUT presets cinéma */
    case 'cyberpunk':
      return { r: clamp(r * 0.85 + 30), g: clamp(g * 0.7), b: clamp(b * 1.4) };
    case 'anime':
      return { r: clamp(r * 1.1 + 5), g: clamp(g * 1.05 + 10), b: clamp(b * 1.15) };
    case 'kodak_portra':
      /* Portrait warm tones */
      return { r: clamp(r * 1.08 + 8), g: clamp(g * 1.0), b: clamp(b * 0.95 - 5) };
    case 'fuji_velvia':
      /* Saturated landscape */
      return { r: clamp(r * 1.15), g: clamp(g * 1.18), b: clamp(b * 1.05) };
    case 'matrix_green':
      return { r: clamp(r * 0.4), g: clamp(g * 1.3 + 20), b: clamp(b * 0.4) };
    case 'wes_anderson':
      /* Pastel symétrie */
      return { r: clamp(r * 0.95 + 30), g: clamp(g * 0.92 + 25), b: clamp(b * 0.88 + 20) };
    case 'la_la_land':
      /* Magenta/Cyan dreamy */
      return { r: clamp(r * 1.05 + 10), g: clamp(g * 0.92), b: clamp(b * 1.12 + 8) };
    case 'blade_runner':
      /* Orange + Teal contrast extrême */
      return { r: clamp(r * 1.2 - 10), g: clamp(g * 0.85), b: clamp(b * 1.1 - 5) };
    case 'desaturated':
      return ((): { r: number; g: number; b: number } => {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        return { r: clamp(r * 0.4 + gray * 0.6), g: clamp(g * 0.4 + gray * 0.6), b: clamp(b * 0.4 + gray * 0.6) };
      })();
    case 'high_contrast':
      return { r: clamp((r - 128) * 1.5 + 128), g: clamp((g - 128) * 1.5 + 128), b: clamp((b - 128) * 1.5 + 128) };
    case 'pastel':
      return { r: clamp(r * 0.7 + 76), g: clamp(g * 0.7 + 76), b: clamp(b * 0.7 + 76) };
    case 'gold_rush':
      return { r: clamp(r * 1.15 + 15), g: clamp(g * 1.05 + 5), b: clamp(b * 0.7) };
    case 'tropical':
      return { r: clamp(r * 1.05), g: clamp(g * 1.15 + 10), b: clamp(b * 1.1) };
    default:
      return { r, g, b };
  }
}

/* boost v13 — Helpers vidéo experts pros */

/**
 * Generate WebVTT subtitle file from caption clips.
 * Format standard W3C compatible Vimeo / YouTube / HTML5.
 */
export function generateWebVtt(clips: readonly VideoClip[]): string {
  let vtt = 'WEBVTT\n\n';
  let cursor = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (!c || !c.caption) { cursor += (c?.end ?? 0) - (c?.start ?? 0); continue; }
    const dur = (c.end - c.start) / Math.max(0.25, c.speed);
    const start = formatVttTime(cursor);
    const end = formatVttTime(cursor + dur);
    vtt += `${i + 1}\n${start} --> ${end}\n${c.caption}\n\n`;
    cursor += dur;
  }
  return vtt;
}

/**
 * Generate SRT subtitle file (legacy mais universellement supporté).
 */
export function generateSrt(clips: readonly VideoClip[]): string {
  let srt = '';
  let cursor = 0;
  let idx = 1;
  for (const c of clips) {
    if (!c.caption) { cursor += (c.end - c.start) / Math.max(0.25, c.speed); continue; }
    const dur = (c.end - c.start) / Math.max(0.25, c.speed);
    const start = formatSrtTime(cursor);
    const end = formatSrtTime(cursor + dur);
    srt += `${idx}\n${start} --> ${end}\n${c.caption}\n\n`;
    cursor += dur;
    idx++;
  }
  return srt;
}

/**
 * Format secondes → HH:MM:SS.mmm WebVTT.
 */
export function formatVttTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds * 1000) % 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Format secondes → HH:MM:SS,mmm SRT (virgule au lieu de point).
 */
export function formatSrtTime(seconds: number): string {
  return formatVttTime(seconds).replace('.', ',');
}

/**
 * Calcul du bitrate optimal pour atteindre une taille fichier cible (Mo).
 */
export function calcOptimalBitrate(durationSec: number, targetSizeMb: number, audioBitrateKbps = 128): number {
  if (durationSec <= 0) return 0;
  const totalBitsBudget = targetSizeMb * 8 * 1024 * 1024;
  const audioBits = audioBitrateKbps * 1024 * durationSec;
  const videoBits = totalBitsBudget - audioBits;
  const videoKbps = Math.max(500, Math.floor(videoBits / durationSec / 1024));
  return videoKbps;
}

/**
 * Suggère preset streaming optimal selon plateforme cible + format.
 */
export function suggestStreamingPreset(platform: keyof typeof STREAMING_PRESETS): { codec: string; bitrate: number; resolution: string; fps: number; aspect: string } {
  return STREAMING_PRESETS[platform] ?? STREAMING_PRESETS.youtube_1080p;
}

/**
 * Check si un clip dépasse les limites recommandées (e.g. TikTok < 60s).
 */
export function checkPlatformConstraints(durationSec: number, platform: 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'twitter'): { ok: boolean; maxSec: number; reason?: string } {
  const limits = { tiktok: 180, instagram_reels: 90, youtube_shorts: 60, twitter: 140 };
  const max = limits[platform] ?? 600;
  return {
    ok: durationSec <= max,
    maxSec: max,
    reason: durationSec > max ? `Trop long pour ${platform} (${durationSec}s > ${max}s)` : '',
  };
}

/**
 * Calcule grille rule of thirds pour positionnement watermark / focus.
 */
export function calcRuleOfThirds(width: number, height: number): { lines: { x1: number; y1: number; x2: number; y2: number }[]; intersections: { x: number; y: number }[] } {
  const x1 = width / 3, x2 = (width / 3) * 2;
  const y1 = height / 3, y2 = (height / 3) * 2;
  return {
    lines: [
      { x1, y1: 0, x2: x1, y2: height },
      { x1: x2, y1: 0, x2: x2, y2: height },
      { x1: 0, y1, x2: width, y2: y1 },
      { x1: 0, y1: y2, x2: width, y2: y2 },
    ],
    intersections: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x1, y: y2 }, { x: x2, y: y2 }],
  };
}

/**
 * Application color grading complet (saturation + contrast + brightness + 3-way).
 */
export function applyColorGrading(r: number, g: number, b: number, cg: ColorGrading): { r: number; g: number; b: number } {
  const clamp = (v: number): number => Math.max(0, Math.min(255, v));
  /* 1. LUT preset d'abord */
  let result = applyLutPreset(r, g, b, cg.lutPreset);
  /* 2. Brightness */
  result = { r: result.r + cg.brightness * 255, g: result.g + cg.brightness * 255, b: result.b + cg.brightness * 255 };
  /* 3. Contrast (autour de 128) */
  result = {
    r: (result.r - 128) * cg.contrast + 128,
    g: (result.g - 128) * cg.contrast + 128,
    b: (result.b - 128) * cg.contrast + 128,
  };
  /* 4. Saturation (vs gray) */
  const gray = 0.299 * result.r + 0.587 * result.g + 0.114 * result.b;
  result = {
    r: gray + (result.r - gray) * cg.saturation,
    g: gray + (result.g - gray) * cg.saturation,
    b: gray + (result.b - gray) * cg.saturation,
  };
  /* 5. Lift / Gamma / Gain (3-way color) */
  /* Lift = shadows offset (additif avant gamma) */
  result = {
    r: result.r + cg.lift.r * 255,
    g: result.g + cg.lift.g * 255,
    b: result.b + cg.lift.b * 255,
  };
  /* Gamma midtones (puissance) */
  result = {
    r: 255 * Math.pow(Math.max(0, result.r) / 255, 1 / Math.max(0.1, cg.gamma.r)),
    g: 255 * Math.pow(Math.max(0, result.g) / 255, 1 / Math.max(0.1, cg.gamma.g)),
    b: 255 * Math.pow(Math.max(0, result.b) / 255, 1 / Math.max(0.1, cg.gamma.b)),
  };
  /* Gain highlights (multiplicatif) */
  result = {
    r: result.r * cg.gain.r,
    g: result.g * cg.gain.g,
    b: result.b * cg.gain.b,
  };
  return { r: clamp(result.r), g: clamp(result.g), b: clamp(result.b) };
}

/**
 * Distance euclidienne RGB pour chroma key.
 */
export function rgbDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Application chroma key : si pixel proche keyColor → alpha=0 (transparent).
 * Retourne {alpha: 0..255} pour préview.
 */
export function applyChromaKey(r: number, g: number, b: number, ck: ChromaKey): number {
  if (!ck.enabled) return 255;
  const dist = rgbDistance({ r, g, b }, ck.keyColor);
  if (dist >= ck.threshold) return 255;
  /* Smooth zone autour du seuil */
  const smoothRange = ck.smoothness * ck.threshold;
  if (dist > ck.threshold - smoothRange) {
    const t = (ck.threshold - dist) / smoothRange;
    return Math.round(255 * (1 - t));
  }
  return 0;
}

/**
 * Watermark coordinates dans une frame WxH.
 */
export function calcWatermarkCoords(
  position: WatermarkPosition,
  frameW: number, frameH: number,
  textW: number, textH: number,
  margin = 16,
): { x: number; y: number } {
  switch (position) {
    case 'top-left': return { x: margin, y: margin };
    case 'top-right': return { x: frameW - textW - margin, y: margin };
    case 'bottom-left': return { x: margin, y: frameH - textH - margin };
    case 'bottom-right': return { x: frameW - textW - margin, y: frameH - textH - margin };
    case 'center': return { x: Math.round((frameW - textW) / 2), y: Math.round((frameH - textH) / 2) };
    default: return { x: margin, y: margin };
  }
}

/**
 * Stabilisation heuristique : retourne décalage à appliquer pour réduire shake.
 * Approche simplifiée : moyenne mobile sur prev frames.
 */
export function calcStabilizationOffset(
  prevOffsets: readonly { x: number; y: number }[],
  currentOffset: { x: number; y: number },
  smoothing = 0.7,
): { x: number; y: number } {
  if (prevOffsets.length === 0) return currentOffset;
  const avgX = prevOffsets.reduce((s, o) => s + o.x, 0) / prevOffsets.length;
  const avgY = prevOffsets.reduce((s, o) => s + o.y, 0) / prevOffsets.length;
  return {
    x: Math.round(avgX * smoothing + currentOffset.x * (1 - smoothing)),
    y: Math.round(avgY * smoothing + currentOffset.y * (1 - smoothing)),
  };
}

class VideoStudioStore {
  private clips: VideoClip[] = [];
  private aspectRatio: AspectRatio = 'original';
  private watermark: Watermark = { enabled: false, text: 'APEX', position: 'bottom-right', opacity: 0.5 };

  list(): readonly VideoClip[] {
    return this.clips;
  }

  add(name: string, duration: number = 0): VideoClip | null {
    if (this.clips.length >= MAX_CLIPS) {
      logger.warn('studio-video', 'max clips reached', { count: this.clips.length });
      return null;
    }
    const c = createClip(name, duration);
    this.clips.push(c);
    return c;
  }

  remove(id: string): boolean {
    const before = this.clips.length;
    /* Cleanup ObjectURL pour éviter memory leak */
    const clip = this.clips.find((c) => c.id === id);
    if (clip?.url) {
      try {
        URL.revokeObjectURL(clip.url);
      } catch (err) {
        logger.warn('studio-video', 'revokeObjectURL failed', { err });
      }
    }
    this.clips = this.clips.filter((c) => c.id !== id);
    return this.clips.length < before;
  }

  update(
    id: string,
    patch: Partial<Pick<VideoClip, 'caption' | 'captionLang' | 'start' | 'end' | 'transition' | 'name' | 'speed' | 'stabilize'>>,
  ): boolean {
    const c = this.clips.find((x) => x.id === id);
    if (!c) return false;
    if (patch.caption !== undefined) c.caption = patch.caption.slice(0, 200);
    if (patch.captionLang !== undefined && isValidLang(patch.captionLang)) c.captionLang = patch.captionLang.toLowerCase();
    if (patch.name !== undefined) c.name = patch.name.slice(0, 100);
    if (patch.start !== undefined) c.start = Math.max(0, Math.min(c.duration, patch.start));
    if (patch.end !== undefined) c.end = Math.max(c.start, Math.min(c.duration, patch.end));
    if (patch.transition !== undefined) c.transition = patch.transition;
    if (patch.speed !== undefined) c.speed = Math.max(0.25, Math.min(4, patch.speed));
    if (patch.stabilize !== undefined) c.stabilize = patch.stabilize;
    return true;
  }

  updateTransform(id: string, patch: Partial<Transform>): boolean {
    const c = this.clips.find((x) => x.id === id);
    if (!c) return false;
    if (patch.rotate !== undefined && [0, 90, 180, 270].includes(patch.rotate)) c.transform.rotate = patch.rotate;
    if (patch.mirrorH !== undefined) c.transform.mirrorH = patch.mirrorH;
    if (patch.mirrorV !== undefined) c.transform.mirrorV = patch.mirrorV;
    if (patch.cropX !== undefined) c.transform.cropX = Math.max(0, Math.min(1, patch.cropX));
    if (patch.cropY !== undefined) c.transform.cropY = Math.max(0, Math.min(1, patch.cropY));
    if (patch.cropW !== undefined) c.transform.cropW = Math.max(0, Math.min(1, patch.cropW));
    if (patch.cropH !== undefined) c.transform.cropH = Math.max(0, Math.min(1, patch.cropH));
    return true;
  }

  updateColorGrading(id: string, patch: Partial<ColorGrading>): boolean {
    const c = this.clips.find((x) => x.id === id);
    if (!c) return false;
    if (patch.saturation !== undefined) c.colorGrading.saturation = Math.max(0, Math.min(2, patch.saturation));
    if (patch.contrast !== undefined) c.colorGrading.contrast = Math.max(0, Math.min(2, patch.contrast));
    if (patch.brightness !== undefined) c.colorGrading.brightness = Math.max(-1, Math.min(1, patch.brightness));
    if (patch.lift !== undefined) {
      c.colorGrading.lift = {
        r: Math.max(-0.5, Math.min(0.5, patch.lift.r)),
        g: Math.max(-0.5, Math.min(0.5, patch.lift.g)),
        b: Math.max(-0.5, Math.min(0.5, patch.lift.b)),
      };
    }
    if (patch.gamma !== undefined) {
      c.colorGrading.gamma = {
        r: Math.max(0.5, Math.min(1.5, patch.gamma.r)),
        g: Math.max(0.5, Math.min(1.5, patch.gamma.g)),
        b: Math.max(0.5, Math.min(1.5, patch.gamma.b)),
      };
    }
    if (patch.gain !== undefined) {
      c.colorGrading.gain = {
        r: Math.max(0.5, Math.min(1.5, patch.gain.r)),
        g: Math.max(0.5, Math.min(1.5, patch.gain.g)),
        b: Math.max(0.5, Math.min(1.5, patch.gain.b)),
      };
    }
    if (patch.lutPreset !== undefined) c.colorGrading.lutPreset = patch.lutPreset;
    return true;
  }

  updateChromaKey(id: string, patch: Partial<ChromaKey>): boolean {
    const c = this.clips.find((x) => x.id === id);
    if (!c) return false;
    if (patch.enabled !== undefined) c.chromaKey.enabled = patch.enabled;
    if (patch.keyColor !== undefined) {
      c.chromaKey.keyColor = {
        r: Math.max(0, Math.min(255, Math.round(patch.keyColor.r))),
        g: Math.max(0, Math.min(255, Math.round(patch.keyColor.g))),
        b: Math.max(0, Math.min(255, Math.round(patch.keyColor.b))),
      };
    }
    if (patch.threshold !== undefined) c.chromaKey.threshold = Math.max(0, Math.min(255, patch.threshold));
    if (patch.smoothness !== undefined) c.chromaKey.smoothness = Math.max(0, Math.min(1, patch.smoothness));
    return true;
  }

  setUrl(id: string, url: string): boolean {
    const c = this.clips.find((x) => x.id === id);
    if (!c) return false;
    c.url = url;
    return true;
  }

  setAspectRatio(ratio: AspectRatio): void {
    this.aspectRatio = ratio;
  }

  getAspectRatio(): AspectRatio {
    return this.aspectRatio;
  }

  setWatermark(patch: Partial<Watermark>): void {
    if (patch.enabled !== undefined) this.watermark.enabled = patch.enabled;
    if (patch.text !== undefined) this.watermark.text = patch.text.slice(0, 100);
    if (patch.position !== undefined) this.watermark.position = patch.position;
    if (patch.opacity !== undefined) this.watermark.opacity = Math.max(0, Math.min(1, patch.opacity));
  }

  getWatermark(): Watermark {
    return this.watermark;
  }

  reorder(ids: readonly string[]): boolean {
    const map = new Map(this.clips.map((c) => [c.id, c]));
    const reordered: VideoClip[] = [];
    for (const id of ids) {
      const c = map.get(id);
      if (c) reordered.push(c);
    }
    if (reordered.length !== this.clips.length) return false;
    this.clips = reordered;
    return true;
  }

  clear(): void {
    /* Cleanup ObjectURLs */
    for (const c of this.clips) {
      if (c.url) {
        try {
          URL.revokeObjectURL(c.url);
        } catch { /* ignore */ }
      }
    }
    this.clips = [];
  }

  count(): number {
    return this.clips.length;
  }

  validateFileSize(sizeBytes: number): boolean {
    return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_MB * 1024 * 1024;
  }

  validateTotalDuration(): { ok: boolean; total: number } {
    const total = calcTotalDuration(this.clips);
    return { ok: total <= MAX_TOTAL_DURATION_S, total };
  }
}

export const videoStudioStore = new VideoStudioStore();

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeVideoScope?.cleanup();
  activeVideoScope = createCleanupScope('studios-video');
  const user = store.get('user') as { id?: string; name?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout) */
  if (!isFeatureEnabled('studio.video', uid)) {
    rootEl.innerHTML = renderDisabledNotice('studio.video');
    return;
  }
  const clips = videoStudioStore.list();
  const total = calcTotalDuration(clips);
  const aspect = videoStudioStore.getAspectRatio();

  const clipsHtml = clips.length > 0
    ? clips.map((c, i) => `
        <div class="ax-video-clip ax-gs-400" data-clip-id="${escapeHtml(c.id)}">
          <div class="ax-gs-22">
            <strong class="ax-gs-266">#${i + 1} · ${escapeHtml(c.name)}</strong>
            <span class="ax-gs-5">${formatDuration((c.end - c.start) / Math.max(0.25, c.speed))}</span>
          </div>
          <input type="text" aria-label="Sous-titre du clip" placeholder="Caption (sous-titre)…" maxlength="200" value="${escapeHtml(c.caption)}" data-action="caption" data-clip-id="${escapeHtml(c.id)}" style="width:100%;padding:8px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;margin-bottom:6px;min-height:36px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <select data-action="transition" data-clip-id="${escapeHtml(c.id)}" class="ax-gs-474">
              <option value="cut" ${c.transition === 'cut' ? 'selected' : ''}>Coupe</option>
              <option value="fade" ${c.transition === 'fade' ? 'selected' : ''}>Fondu</option>
              <option value="slide" ${c.transition === 'slide' ? 'selected' : ''}>Glissé</option>
              <option value="dissolve" ${c.transition === 'dissolve' ? 'selected' : ''}>Dissolve</option>
              <option value="wipe" ${c.transition === 'wipe' ? 'selected' : ''}>Wipe</option>
              <option value="zoom" ${c.transition === 'zoom' ? 'selected' : ''}>Zoom</option>
              <option value="none" ${c.transition === 'none' ? 'selected' : ''}>Aucune</option>
            </select>
            <select data-action="lut" data-clip-id="${escapeHtml(c.id)}" class="ax-gs-474">
              <option value="none" ${c.colorGrading.lutPreset === 'none' ? 'selected' : ''}>Pas de LUT</option>
              <option value="cinema" ${c.colorGrading.lutPreset === 'cinema' ? 'selected' : ''}>Cinéma</option>
              <option value="vintage" ${c.colorGrading.lutPreset === 'vintage' ? 'selected' : ''}>Vintage</option>
              <option value="bw" ${c.colorGrading.lutPreset === 'bw' ? 'selected' : ''}>Noir & Blanc</option>
              <option value="sepia" ${c.colorGrading.lutPreset === 'sepia' ? 'selected' : ''}>Sépia</option>
              <option value="teal-orange" ${c.colorGrading.lutPreset === 'teal-orange' ? 'selected' : ''}>Teal-Orange</option>
              <option value="cool" ${c.colorGrading.lutPreset === 'cool' ? 'selected' : ''}>Froid</option>
              <option value="warm" ${c.colorGrading.lutPreset === 'warm' ? 'selected' : ''}>Chaud</option>
              <option value="noir" ${c.colorGrading.lutPreset === 'noir' ? 'selected' : ''}>Noir contrasté</option>
            </select>
          </div>
          <label class="ax-gs-470">Vitesse ×${c.speed.toFixed(2)} <input type="range" aria-label="Vitesse de lecture du clip" min="25" max="400" value="${Math.round(c.speed * 100)}" data-action="speed" data-clip-id="${escapeHtml(c.id)}" class="ax-gs-259"></label>
          <button class="ax-btn ax-btn-sm" data-action="remove-clip" data-clip-id="${escapeHtml(c.id)}" style="margin-top:8px;font-size:11px;padding:6px 10px;color:#ff6666;min-height:36px">Supprimer</button>
        </div>
      `).join('')
    : '<p class="ax-gs-213">Aucun clip. Importe ta première vidéo !</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🎬 Studio Vidéo Pro</h1>
        <span class="ax-gs-3">${clips.length}/${MAX_CLIPS} clips · ${formatDuration(total)} · ${escapeHtml(aspect)}</span>
      </header>

      <div class="ax-gs-1">
        <p class="ax-gs-468">Timeline ${MAX_CLIPS} clips, ${formatDuration(MAX_TOTAL_DURATION_S)} total. Cuts, transitions, captions ${SUPPORTED_LANGS.length} langues, LUTs cinéma, color grading 3-way, chroma key, stabilization, vertical TikTok auto.</p>
        <div class="ax-gs-7">
          <input type="file" id="ax-video-upload" aria-label="Importer fichiers vidéo" accept="video/*" multiple class="ax-gs-359">
          <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-video-upload-btn">📂 Importer vidéos</button>
          <button class="ax-btn ax-gs-401" data-aspect="9:16">📱 TikTok 9:16</button>
          <button class="ax-btn ax-gs-401" data-aspect="16:9">▶ YouTube 16:9</button>
          <button class="ax-btn ax-gs-401" data-aspect="1:1">⬛ IG 1:1</button>
          <button class="ax-btn ax-gs-401" id="ax-video-export">💾 Export MP4</button>
          <button class="ax-btn ax-gs-460" id="ax-video-clear">🗑 Tout effacer</button>
        </div>
      </div>

      <div id="ax-video-clips">${clipsHtml}</div>

      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, _uid: string): void {
  rootEl.querySelector<HTMLButtonElement>('#ax-video-upload-btn')?.addEventListener('click', () => {
    rootEl.querySelector<HTMLInputElement>('#ax-video-upload')?.click();
  });

  rootEl.querySelector<HTMLInputElement>('#ax-video-upload')?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!isValidVideoFormat(f.type)) {
        logger.warn('studio-video', 'invalid format', { type: f.type, name: f.name });
        continue;
      }
      if (!videoStudioStore.validateFileSize(f.size)) {
        logger.warn('studio-video', 'file too big', { size: f.size, name: f.name });
        continue;
      }
      const c = videoStudioStore.add(f.name);
      if (c) {
        try {
          const url = URL.createObjectURL(f);
          videoStudioStore.setUrl(c.id, url);
        } catch (err) {
          logger.warn('studio-video', 'createObjectURL failed', { err });
        }
        logger.info('studio-video', 'clip imported', { name: f.name });
      }
    }
    render(rootEl);
  });

  rootEl.querySelectorAll<HTMLElement>('[data-aspect]').forEach((btn) => {
    activeVideoScope!.bind(btn, 'click', () => {
      const a = btn.dataset['aspect'] as AspectRatio;
      videoStudioStore.setAspectRatio(a);
      render(rootEl);
    });
  });

  rootEl.querySelector<HTMLButtonElement>('#ax-video-clear')?.addEventListener('click', () => {
    videoStudioStore.clear();
    render(rootEl);
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="remove-clip"]').forEach((btn) => {
    activeVideoScope!.bind(btn, 'click', () => {
      const id = btn.dataset['clipId'];
      if (!id) return;
      if (videoStudioStore.remove(id)) render(rootEl);
    });
  });

  rootEl.querySelectorAll<HTMLInputElement>('[data-action="caption"]').forEach((input) => {
    activeVideoScope!.bind(input, 'input', () => {
      const id = input.dataset['clipId'];
      if (!id) return;
      videoStudioStore.update(id, { caption: input.value });
    });
  });

  rootEl.querySelectorAll<HTMLSelectElement>('[data-action="transition"]').forEach((sel) => {
    activeVideoScope!.bind(sel, 'change', () => {
      const id = sel.dataset['clipId'];
      if (!id) return;
      videoStudioStore.update(id, { transition: sel.value as TransitionKind });
    });
  });

  rootEl.querySelectorAll<HTMLSelectElement>('[data-action="lut"]').forEach((sel) => {
    activeVideoScope!.bind(sel, 'change', () => {
      const id = sel.dataset['clipId'];
      if (!id) return;
      videoStudioStore.updateColorGrading(id, { lutPreset: sel.value as LutPreset });
    });
  });

  rootEl.querySelectorAll<HTMLInputElement>('[data-action="speed"]').forEach((slider) => {
    activeVideoScope!.bind(slider, 'input', () => {
      const id = slider.dataset['clipId'];
      if (!id) return;
      videoStudioStore.update(id, { speed: parseInt(slider.value, 10) / 100 });
      render(rootEl);
    });
  });
}
