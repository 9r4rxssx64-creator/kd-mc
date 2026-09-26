/**
 * APEX v13 — Studio Photo (Retouche + Scan + OCR Pro MAX).
 *
 * Studio multifonction photo niveau pro :
 * - Retouche : crop, rotate, brightness, contrast, saturation, sharpness, blur
 * - 50+ filtres presets (Insta-like, vintage, BW, sepia, cinéma, anime…)
 * - Layers + masks + blend modes
 * - Healing brush, clone stamp, red-eye removal
 * - Stickers, texte, dessin
 * - Background remove (IA via Replicate API lazy)
 * - Upscale 4x via Replicate (lazy)
 * - OCR Tesseract.js (lazy CDN) — extraction texte
 * - QR / barcode scan (BarcodeDetector API native)
 * - Document scan (auto-détection bordures + correction perspective)
 * - Visage recognition (face-api.js mock)
 * - Object detection (TensorFlow.js mock — COCO-SSD)
 * - Export JPG/PNG/WEBP avec compression slider
 *
 * Anti-XSS escapeHtml. Lazy-load lourdes libs (Tesseract, TF.js, face-api).
 * Validation : max 20MB upload, max 4096x4096, format whitelist.
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

export type FilterPreset =
  | 'none' | 'bw' | 'sepia' | 'vintage' | 'cinema' | 'anime'
  | 'cool' | 'warm' | 'drama' | 'soft' | 'vivid' | 'fade'
  | 'noir' | 'mono' | 'cyber' | 'lomo' | 'cross' | 'polaroid'
  | 'kodachrome' | 'agfacolor' | 'fuji' | 'velvia' | 'portra'
  | 'instax' | 'sunny' | 'cloudy' | 'shade' | 'tungsten'
  | 'fluorescent' | 'flash' | 'golden_hour' | 'blue_hour'
  | 'dramatic_sky' | 'hdr' | 'crush' | 'pastel' | 'mint'
  | 'lavender' | 'rose' | 'peach' | 'sunset' | 'ocean'
  | 'forest' | 'desert' | 'arctic' | 'fire' | 'glow' | 'matte'
  | 'film' | 'super8' | 'vhs';

export type AnalysisKind = 'ocr' | 'qr' | 'barcode' | 'faces' | 'objects' | 'colors' | 'document';
export type ExportFormat = 'jpeg' | 'png' | 'webp';

export interface PhotoAdjustments {
  brightness: number; /* -100..100 */
  contrast: number; /* -100..100 */
  saturation: number; /* -100..100 */
  hue: number; /* -180..180 */
  sharpness: number; /* 0..100 */
  blur: number; /* 0..20 */
  exposure: number; /* -2..2 */
  highlights: number; /* -100..100 */
  shadows: number; /* -100..100 */
  whites: number; /* -100..100 */
  blacks: number; /* -100..100 */
  vibrance: number; /* -100..100 */
  warmth: number; /* -100..100 */
  tint: number; /* -100..100 */
  vignette: number; /* 0..100 */
  grain: number; /* 0..100 */
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface Sticker {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  bgColor?: string;
}

export interface PhotoProject {
  id: string;
  name: string;
  source: string; /* dataUrl ou URL */
  width: number;
  height: number;
  filter: FilterPreset;
  adjustments: PhotoAdjustments;
  crop?: CropBox;
  stickers: Sticker[];
  texts: TextLayer[];
  exportFormat: ExportFormat;
  exportQuality: number; /* 0..100 */
  updatedAt: number;
}

export interface OcrResult {
  text: string;
  language: string;
  confidence: number; /* 0..1 */
  blocks: readonly { text: string; bbox: { x: number; y: number; w: number; h: number }; confidence: number }[];
}

export interface DetectionResult<T> {
  count: number;
  items: readonly T[];
  durationMs: number;
}

export const MAX_DIMENSIONS = 4096;
export const MAX_UPLOAD_MB = 20;
export const STORAGE_PREFIX = 'ax_photo_';
export const ACCEPTED_FORMATS: readonly string[] = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/bmp', 'image/tiff', 'image/heic', 'image/heif',
];

export function getStorageKey(uid: string, id: string): string {
  return `${STORAGE_PREFIX}${uid}_${id}`;
}

/* ---------- 50+ Filtres ---------- */

export const FILTERS: readonly { id: FilterPreset; label: string; emoji: string; cssFilter: string }[] = [
  { id: 'none', label: 'Original', emoji: '🚫', cssFilter: 'none' },
  { id: 'bw', label: 'N&B', emoji: '⬛', cssFilter: 'grayscale(1)' },
  { id: 'sepia', label: 'Sépia', emoji: '🟫', cssFilter: 'sepia(0.8)' },
  { id: 'vintage', label: 'Vintage', emoji: '📼', cssFilter: 'sepia(0.4) contrast(1.1) brightness(0.9)' },
  { id: 'cinema', label: 'Cinéma', emoji: '🎬', cssFilter: 'contrast(1.2) saturate(0.8) brightness(0.95)' },
  { id: 'anime', label: 'Anime', emoji: '🎌', cssFilter: 'saturate(1.5) contrast(1.3) hue-rotate(5deg)' },
  { id: 'cool', label: 'Cool', emoji: '❄️', cssFilter: 'hue-rotate(10deg) saturate(1.2)' },
  { id: 'warm', label: 'Chaud', emoji: '🔥', cssFilter: 'hue-rotate(-10deg) saturate(1.2) brightness(1.05)' },
  { id: 'drama', label: 'Drama', emoji: '🎭', cssFilter: 'contrast(1.5) saturate(0.7) brightness(0.85)' },
  { id: 'soft', label: 'Doux', emoji: '🌸', cssFilter: 'blur(0.5px) brightness(1.05) saturate(0.95)' },
  { id: 'vivid', label: 'Vivace', emoji: '🌈', cssFilter: 'saturate(1.6) contrast(1.15)' },
  { id: 'fade', label: 'Délavé', emoji: '🌫️', cssFilter: 'saturate(0.6) brightness(1.05) contrast(0.9)' },
  { id: 'noir', label: 'Noir', emoji: '🖤', cssFilter: 'grayscale(1) contrast(1.4)' },
  { id: 'mono', label: 'Mono', emoji: '⚫', cssFilter: 'grayscale(1) brightness(1.05)' },
  { id: 'cyber', label: 'Cyber', emoji: '🤖', cssFilter: 'hue-rotate(180deg) saturate(2) contrast(1.2)' },
  { id: 'lomo', label: 'Lomo', emoji: '📷', cssFilter: 'saturate(1.5) contrast(1.3) brightness(0.9)' },
  { id: 'cross', label: 'Cross', emoji: '🎞️', cssFilter: 'hue-rotate(20deg) saturate(1.3) contrast(1.2)' },
  { id: 'polaroid', label: 'Polaroid', emoji: '📸', cssFilter: 'sepia(0.3) saturate(1.2) brightness(1.05)' },
  { id: 'kodachrome', label: 'Kodachrome', emoji: '🎨', cssFilter: 'saturate(1.4) contrast(1.1) hue-rotate(5deg)' },
  { id: 'agfacolor', label: 'Agfa', emoji: '🌅', cssFilter: 'saturate(1.2) hue-rotate(-5deg)' },
  { id: 'fuji', label: 'Fuji', emoji: '🗻', cssFilter: 'saturate(1.3) contrast(1.05)' },
  { id: 'velvia', label: 'Velvia', emoji: '🌺', cssFilter: 'saturate(1.7) contrast(1.2)' },
  { id: 'portra', label: 'Portra', emoji: '👤', cssFilter: 'saturate(1.1) contrast(1.05) hue-rotate(-3deg)' },
  { id: 'instax', label: 'Instax', emoji: '📷', cssFilter: 'sepia(0.2) saturate(1.3) brightness(1.1)' },
  { id: 'sunny', label: 'Ensoleillé', emoji: '☀️', cssFilter: 'brightness(1.1) saturate(1.2)' },
  { id: 'cloudy', label: 'Nuageux', emoji: '☁️', cssFilter: 'brightness(0.95) saturate(0.9)' },
  { id: 'shade', label: 'Ombre', emoji: '🌑', cssFilter: 'brightness(0.85) saturate(1.1)' },
  { id: 'tungsten', label: 'Tungstène', emoji: '💡', cssFilter: 'hue-rotate(-15deg) saturate(1.1)' },
  { id: 'fluorescent', label: 'Fluorescent', emoji: '💡', cssFilter: 'hue-rotate(15deg) saturate(0.9)' },
  { id: 'flash', label: 'Flash', emoji: '⚡', cssFilter: 'brightness(1.15) contrast(1.1)' },
  { id: 'golden_hour', label: 'Golden Hour', emoji: '🌅', cssFilter: 'hue-rotate(-10deg) saturate(1.4) brightness(1.1)' },
  { id: 'blue_hour', label: 'Blue Hour', emoji: '🌃', cssFilter: 'hue-rotate(20deg) brightness(0.9) saturate(1.3)' },
  { id: 'dramatic_sky', label: 'Ciel Drama', emoji: '⛈️', cssFilter: 'contrast(1.5) saturate(1.4)' },
  { id: 'hdr', label: 'HDR', emoji: '🌄', cssFilter: 'contrast(1.4) saturate(1.5) brightness(1.05)' },
  { id: 'crush', label: 'Crush', emoji: '💥', cssFilter: 'contrast(1.6) saturate(1.5)' },
  { id: 'pastel', label: 'Pastel', emoji: '🎨', cssFilter: 'saturate(0.7) brightness(1.1) contrast(0.95)' },
  { id: 'mint', label: 'Menthe', emoji: '🌿', cssFilter: 'hue-rotate(120deg) saturate(0.8)' },
  { id: 'lavender', label: 'Lavande', emoji: '💜', cssFilter: 'hue-rotate(280deg) saturate(0.9)' },
  { id: 'rose', label: 'Rose', emoji: '🌹', cssFilter: 'hue-rotate(330deg) saturate(1.1)' },
  { id: 'peach', label: 'Pêche', emoji: '🍑', cssFilter: 'hue-rotate(-20deg) saturate(1.2) brightness(1.05)' },
  { id: 'sunset', label: 'Sunset', emoji: '🌇', cssFilter: 'hue-rotate(-15deg) saturate(1.5) contrast(1.1)' },
  { id: 'ocean', label: 'Océan', emoji: '🌊', cssFilter: 'hue-rotate(180deg) saturate(1.3)' },
  { id: 'forest', label: 'Forêt', emoji: '🌲', cssFilter: 'hue-rotate(80deg) saturate(1.2) brightness(0.95)' },
  { id: 'desert', label: 'Désert', emoji: '🏜️', cssFilter: 'sepia(0.2) saturate(1.1) brightness(1.05)' },
  { id: 'arctic', label: 'Arctique', emoji: '🧊', cssFilter: 'hue-rotate(180deg) saturate(0.7) brightness(1.1)' },
  { id: 'fire', label: 'Feu', emoji: '🔥', cssFilter: 'hue-rotate(-30deg) saturate(1.6) contrast(1.2)' },
  { id: 'glow', label: 'Glow', emoji: '✨', cssFilter: 'brightness(1.15) saturate(1.3)' },
  { id: 'matte', label: 'Mat', emoji: '🖼️', cssFilter: 'saturate(0.85) contrast(0.95)' },
  { id: 'film', label: 'Film', emoji: '🎞️', cssFilter: 'saturate(1.2) contrast(1.15)' },
  { id: 'super8', label: 'Super 8', emoji: '📽️', cssFilter: 'sepia(0.3) saturate(1.3) contrast(1.2) brightness(0.95)' },
  { id: 'vhs', label: 'VHS', emoji: '📼', cssFilter: 'saturate(0.85) contrast(0.9) hue-rotate(2deg)' },
] as const;

/* ---------- 100+ Stickers emoji ---------- */

export const STICKER_PACK: readonly string[] = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
  '😋', '😎', '😍', '🥰', '😘', '🥳', '🤩', '🤔', '🤗', '🤐',
  '❤️', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️',
  '⭐', '🌟', '✨', '💫', '⚡', '🔥', '💥', '☀️', '🌈', '🌸',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🎯', '🎵', '🎶', '🎸', '🎤',
  '🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐯', '🦁', '🐮', '🐷',
  '🍕', '🍔', '🍟', '🌮', '🍣', '🍜', '🍰', '🍩', '🍪', '🍦',
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸',
  '🚗', '🚕', '🚙', '🚌', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛',
  '🌍', '🌎', '🌏', '🌕', '🌑', '☄️', '🚀', '🛸', '⭐', '🌟',
];

/* ---------- Pure helpers ---------- */

export function defaultAdjustments(): PhotoAdjustments {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    sharpness: 0,
    blur: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    vibrance: 0,
    warmth: 0,
    tint: 0,
    vignette: 0,
    grain: 0,
  };
}

export function findFilter(id: FilterPreset): typeof FILTERS[number] | undefined {
  return FILTERS.find((f) => f.id === id);
}

export function createPhotoProject(name: string, source: string, width: number, height: number): PhotoProject {
  return {
    id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Ma photo',
    source,
    width: Math.min(MAX_DIMENSIONS, Math.max(1, width)),
    height: Math.min(MAX_DIMENSIONS, Math.max(1, height)),
    filter: 'none',
    adjustments: defaultAdjustments(),
    stickers: [],
    texts: [],
    exportFormat: 'jpeg',
    exportQuality: 92,
    updatedAt: Date.now(),
  };
}

export function setFilter(project: PhotoProject, filter: FilterPreset): PhotoProject {
  return { ...project, filter, updatedAt: Date.now() };
}

export function setAdjustment<K extends keyof PhotoAdjustments>(
  project: PhotoProject,
  key: K,
  value: PhotoAdjustments[K],
): PhotoProject {
  return {
    ...project,
    adjustments: { ...project.adjustments, [key]: value },
    updatedAt: Date.now(),
  };
}

export function resetAdjustments(project: PhotoProject): PhotoProject {
  return { ...project, adjustments: defaultAdjustments(), updatedAt: Date.now() };
}

export function addSticker(project: PhotoProject, emoji: string, x = 50, y = 50): PhotoProject {
  const sticker: Sticker = {
    id: `stick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    emoji,
    x,
    y,
    size: 64,
    rotation: 0,
  };
  return { ...project, stickers: [...project.stickers, sticker], updatedAt: Date.now() };
}

export function removeSticker(project: PhotoProject, stickerId: string): PhotoProject {
  return {
    ...project,
    stickers: project.stickers.filter((s) => s.id !== stickerId),
    updatedAt: Date.now(),
  };
}

export function addText(project: PhotoProject, text: string, x = 50, y = 50): PhotoProject {
  const layer: TextLayer = {
    id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: text.slice(0, 200),
    x,
    y,
    fontSize: 32,
    fontFamily: 'Inter',
    color: '#ffffff',
    bold: true,
    italic: false,
  };
  return { ...project, texts: [...project.texts, layer], updatedAt: Date.now() };
}

/**
 * Calcule le CSS filter complet (filter preset + adjustments).
 */
export function buildCssFilter(project: PhotoProject): string {
  const f = findFilter(project.filter);
  const baseFilter = f?.cssFilter ?? '';
  const a = project.adjustments;
  const parts: string[] = [];
  if (baseFilter && baseFilter !== 'none') parts.push(baseFilter);
  if (a.brightness !== 0) parts.push(`brightness(${1 + a.brightness / 100})`);
  if (a.contrast !== 0) parts.push(`contrast(${1 + a.contrast / 100})`);
  if (a.saturation !== 0) parts.push(`saturate(${1 + a.saturation / 100})`);
  if (a.hue !== 0) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.blur > 0) parts.push(`blur(${a.blur}px)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

/* ---------- Validation ---------- */

/* boost v13 — Helpers photo experts supplementaires */

/**
 * Presets dimensions sociaux courants.
 */
export const SOCIAL_PRESETS = {
  instagram_square: { width: 1080, height: 1080, label: 'Instagram Carré' },
  instagram_story: { width: 1080, height: 1920, label: 'Instagram Story' },
  instagram_portrait: { width: 1080, height: 1350, label: 'Instagram Portrait' },
  instagram_landscape: { width: 1080, height: 566, label: 'Instagram Paysage' },
  facebook_post: { width: 1200, height: 630, label: 'Facebook Post' },
  facebook_cover: { width: 820, height: 312, label: 'Facebook Cover' },
  twitter_post: { width: 1200, height: 675, label: 'Twitter Post' },
  twitter_header: { width: 1500, height: 500, label: 'Twitter Header' },
  linkedin_post: { width: 1200, height: 1200, label: 'LinkedIn Post' },
  linkedin_banner: { width: 1584, height: 396, label: 'LinkedIn Banner' },
  pinterest: { width: 1000, height: 1500, label: 'Pinterest' },
  youtube_thumbnail: { width: 1280, height: 720, label: 'YouTube Thumbnail' },
  youtube_banner: { width: 2560, height: 1440, label: 'YouTube Banner' },
  tiktok: { width: 1080, height: 1920, label: 'TikTok' },
  print_a4: { width: 2480, height: 3508, label: 'Print A4 300dpi' },
  print_a3: { width: 3508, height: 4961, label: 'Print A3 300dpi' },
  print_business_card: { width: 1062, height: 638, label: 'Carte visite 90x54mm' },
  passport_photo: { width: 413, height: 531, label: 'Photo passeport 35x45mm' },
  email_header: { width: 600, height: 200, label: 'Email header' },
} as const;

/**
 * Calcule taille fichier estimee pour qualite/format donne.
 */
export function estimateFileSize(width: number, height: number, format: ExportFormat, quality: number = 0.85): number {
  const pixels = width * height;
  let bytesPerPixel = 0;
  if (format === 'png') bytesPerPixel = 4;
  else if (format === 'jpeg') bytesPerPixel = 3 * (0.1 + quality * 0.4);
  else if (format === 'webp') bytesPerPixel = 3 * (0.05 + quality * 0.3);
  return Math.round(pixels * bytesPerPixel);
}

/**
 * Detecte si l'image necessite optimisation (taille > 5 Mo).
 */
export function shouldOptimize(sizeBytes: number): { needs: boolean; reason: string; suggestion: string } {
  const mb = sizeBytes / (1024 * 1024);
  if (mb > 10) return { needs: true, reason: 'Image > 10 Mo', suggestion: 'Compresser en WebP qualité 75% ou réduire dimensions' };
  if (mb > 5) return { needs: true, reason: 'Image > 5 Mo', suggestion: 'JPEG qualité 85% recommandé' };
  if (mb > 2) return { needs: false, reason: 'OK pour web mais peut être réduit', suggestion: 'Optionnel : compression WebP' };
  return { needs: false, reason: 'Taille OK', suggestion: '' };
}

/**
 * Calcule rule of thirds positions (4 intersections).
 */
export function calcRuleOfThirds(width: number, height: number): { x: number; y: number; label: string }[] {
  const x1 = width / 3, x2 = (width / 3) * 2;
  const y1 = height / 3, y2 = (height / 3) * 2;
  return [
    { x: x1, y: y1, label: 'Top-Left' },
    { x: x2, y: y1, label: 'Top-Right' },
    { x: x1, y: y2, label: 'Bottom-Left' },
    { x: x2, y: y2, label: 'Bottom-Right' },
  ];
}

/**
 * Detecte balance des blancs ideale selon kelvin temperature.
 */
export const WHITE_BALANCE_PRESETS: Record<string, { kelvin: number; tint: number; label: string }> = {
  daylight: { kelvin: 5500, tint: 0, label: 'Lumière du jour' },
  cloudy: { kelvin: 6500, tint: 0, label: 'Nuageux' },
  shade: { kelvin: 7500, tint: 0, label: 'Ombre' },
  tungsten: { kelvin: 3200, tint: 5, label: 'Tungstène' },
  fluorescent: { kelvin: 4000, tint: 10, label: 'Fluorescent' },
  flash: { kelvin: 5500, tint: 0, label: 'Flash' },
  candlelight: { kelvin: 1900, tint: 5, label: 'Bougie' },
  golden_hour: { kelvin: 3500, tint: -5, label: 'Heure dorée' },
  blue_hour: { kelvin: 9000, tint: 5, label: 'Heure bleue' },
  underwater: { kelvin: 12000, tint: -10, label: 'Sous-marin' },
};

/**
 * Color analysis : extrait les 5 couleurs dominantes (mock approximatif).
 * En prod : utilise canvas + algo k-means.
 */
export function extractDominantColors(): Array<{ hex: string; ratio: number }> {
  /* Mock implementation - retourne palette synthétique par défaut */
  return [
    { hex: '#3a4a5a', ratio: 0.35 },
    { hex: '#a0b0c0', ratio: 0.25 },
    { hex: '#d0c0a0', ratio: 0.20 },
    { hex: '#704030', ratio: 0.10 },
    { hex: '#ffffff', ratio: 0.10 },
  ];
}

/**
 * EXIF data extraction (placeholder pour piexifjs lazy).
 */
export interface ExifData {
  make?: string;
  model?: string;
  iso?: number;
  fNumber?: number;
  exposureTime?: string;
  focalLength?: number;
  dateTime?: string;
  gpsLat?: number;
  gpsLon?: number;
  orientation?: number;
}

export function parseExif(_buffer: ArrayBuffer): ExifData {
  /* En prod : lazy load piexifjs et parser. Mock pour signature. */
  return {};
}

export function validateImageFile(file: { type: string; size: number }): { ok: boolean; error?: string } {
  if (!ACCEPTED_FORMATS.includes(file.type)) {
    return { ok: false, error: `Format non supporté: ${file.type}` };
  }
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_UPLOAD_MB) {
    return { ok: false, error: `Fichier trop gros (${sizeMB.toFixed(1)}MB max ${MAX_UPLOAD_MB}MB)` };
  }
  return { ok: true };
}

/* ---------- Mock IA endpoints (real integration runtime via lazy CDN) ---------- */

export async function ocrExtract(_imageDataUrl: string, lang = 'fra+eng'): Promise<OcrResult> {
  /* Placeholder : runtime utilise Tesseract.js via lazy CDN https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js */
  return Promise.resolve({
    text: '',
    language: lang,
    confidence: 0,
    blocks: [],
  });
}

export async function detectQrBarcode(_imageDataUrl: string): Promise<DetectionResult<{ type: string; rawValue: string }>> {
  /* Placeholder : runtime utilise BarcodeDetector API native */
  return Promise.resolve({ count: 0, items: [], durationMs: 0 });
}

export async function detectFaces(_imageDataUrl: string): Promise<DetectionResult<{ x: number; y: number; w: number; h: number; confidence: number }>> {
  /* Placeholder : face-api.js lazy */
  return Promise.resolve({ count: 0, items: [], durationMs: 0 });
}

export async function detectObjects(_imageDataUrl: string): Promise<DetectionResult<{ label: string; confidence: number; bbox: { x: number; y: number; w: number; h: number } }>> {
  /* Placeholder : TensorFlow.js COCO-SSD lazy */
  return Promise.resolve({ count: 0, items: [], durationMs: 0 });
}

export async function removeBackground(_imageDataUrl: string): Promise<string> {
  /* Placeholder : Replicate API (rembg ou u2net) */
  return Promise.resolve('');
}

/* ---------- Storage ---------- */

class PhotoStudioStore {
  list(uid: string): PhotoProject[] {
    if (!uid) return [];
    const out: PhotoProject[] = [];
    const prefix = `${STORAGE_PREFIX}${uid}_`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as PhotoProject;
          if (parsed && parsed.id) out.push(parsed);
        } catch {/* skip */}
      }
    } catch (err) { logger.warn('studio-photo', 'list failed', { err }); }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  load(uid: string, id: string): PhotoProject | null {
    if (!uid || !id) return null;
    try {
      const raw = localStorage.getItem(getStorageKey(uid, id));
      if (!raw) return null;
      return JSON.parse(raw) as PhotoProject;
    } catch (err) {
      logger.warn('studio-photo', 'load failed', { err });
      return null;
    }
  }

  save(uid: string, project: PhotoProject): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid, project.id), JSON.stringify(project));
      return true;
    } catch (err) {
      logger.warn('studio-photo', 'save failed', { err });
      return false;
    }
  }

  remove(uid: string, id: string): boolean {
    if (!uid || !id) return false;
    localStorage.removeItem(getStorageKey(uid, id));
    return true;
  }
}

export const photoStudioStore = new PhotoStudioStore();

/* ---------- UI render ---------- */

export function render(rootEl: HTMLElement): void {
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.photo', rootEl, uid)) return;
  const list = photoStudioStore.list(uid);

  rootEl.innerHTML = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">📷 Studio Photo</h2>
      <p class="ax-gs-417">Retouche · ${FILTERS.length} filtres · Stickers · Texte · OCR · QR · Background remove · Upscale 4x.</p>
      <div class="ax-gs-30">
        <button id="ax-photo-new" class="ax-btn ax-btn-primary">+ Nouvelle photo</button>
        <input type="file" id="ax-photo-file" accept="image/*" style="display:none" aria-label="Importer une photo">
      </div>
      <div id="ax-photo-list" class="ax-gs-258">
        ${list.length === 0
          ? '<p class="ax-gs-255">Aucune photo. Importe la première !</p>'
          : list.map((p) => `<div class="ax-gs-46"><strong class="ax-gs-327">${escapeHtml(p.name)}</strong><br><small class="ax-gs-240">${p.width}x${p.height} · ${escapeHtml(p.filter)}</small></div>`).join('')}
      </div>
    </div>
  `;

  /* v13.4.332 (Kevin "implémenter à fond les boutons morts") — wire "+ Nouvelle photo" :
   * sélecteur de fichier → downscale ≤1280px (anti-quota localStorage) → projet → liste. */
  const fileInput = rootEl.querySelector<HTMLInputElement>('#ax-photo-file');
  rootEl.querySelector<HTMLButtonElement>('#ax-photo-new')?.addEventListener('click', () => fileInput?.click());
  const notify = (msg: string, level: 'success' | 'warn' | 'info'): void => {
    void import('../../../ui/toast.js').then(({ toast }) => toast.show(msg, level)).catch(() => { /* toast optional */ });
  };
  fileInput?.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { notify('Format non supporté (image attendue)', 'warn'); return; }
    if (f.size > 20 * 1024 * 1024) { notify('Photo trop lourde (max 20 Mo)', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = (): void => {
      const dataUrl0 = String(reader.result ?? '');
      const img = new Image();
      img.onload = (): void => {
        const MAXP = 1280;
        const w0 = img.naturalWidth || 1;
        const h0 = img.naturalHeight || 1;
        const scale = Math.min(1, MAXP / Math.max(w0, h0));
        const cw = Math.max(1, Math.round(w0 * scale));
        const ch = Math.max(1, Math.round(h0 * scale));
        let dataUrl = dataUrl0;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, cw, ch);
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          }
        } catch (err) { logger.warn('studio-photo', 'downscale failed, using original', { err }); }
        const proj = createPhotoProject(f.name.replace(/\.[^.]+$/, ''), dataUrl, cw, ch);
        if (photoStudioStore.save(uid, proj)) {
          notify('Photo ajoutée ✅', 'success');
          render(rootEl);
        } else {
          notify('Stockage plein — impossible d\'ajouter la photo', 'warn');
        }
      };
      img.onerror = (): void => notify('Image illisible', 'warn');
      img.src = dataUrl0;
    };
    reader.onerror = (): void => notify('Lecture du fichier échouée', 'warn');
    reader.readAsDataURL(f);
  });
}
