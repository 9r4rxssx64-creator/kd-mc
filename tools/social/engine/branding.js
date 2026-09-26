/**
 * Branding & Watermark System — Brand kits, intros/outros, color schemes
 */
let createCanvas, loadImage;
try {
  const canvas = await import('canvas');
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
} catch {
  createCanvas = () => { throw new Error('canvas package required: npm install canvas'); };
  loadImage = createCanvas;
}
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'tools/social/data');
const BRANDS_FILE = path.join(DATA_DIR, 'brands.json');

const DEFAULT_BRAND = {
  name: 'KDMC Stories',
  channelName: 'KDMC Stories',
  tagline: 'Stories that stick with you',
  colors: { primary: '#d4af37', secondary: '#1a1a2e', accent: '#ffd700', bg: '#0a0a12', text: '#ffffff' },
  fonts: { heading: 'Inter', body: 'Inter' },
  watermark: { position: 'bottom-right', opacity: 0.3, text: 'KDMC Stories', size: 24 },
  social: { youtube: '@KDMCStories', instagram: '@kdmcstories', tiktok: '@kdmcstories' },
};

const COLOR_SCHEMES = {
  'midnight-gold':  { primary: '#d4af37', secondary: '#1a1a2e', accent: '#ffd700', bg: '#0a0a12', text: '#ffffff' },
  'blood-red':      { primary: '#cc0000', secondary: '#2d0000', accent: '#ff3333', bg: '#1a0000', text: '#ffffff' },
  'ocean-blue':     { primary: '#0066cc', secondary: '#002244', accent: '#33aaff', bg: '#001a33', text: '#ffffff' },
  'forest-green':   { primary: '#009933', secondary: '#002211', accent: '#33cc66', bg: '#001a0d', text: '#ffffff' },
  'royal-purple':   { primary: '#7700cc', secondary: '#220044', accent: '#aa33ff', bg: '#1a0033', text: '#ffffff' },
  'neon-pink':      { primary: '#ff0077', secondary: '#2d001a', accent: '#ff33aa', bg: '#1a0011', text: '#ffffff' },
  'sunset-orange':  { primary: '#cc6600', secondary: '#2d1500', accent: '#ff9933', bg: '#1a0d00', text: '#ffffff' },
  'arctic-white':   { primary: '#2d3748', secondary: '#e2e8f0', accent: '#4299e1', bg: '#f0f4f8', text: '#1a202c' },
  'matrix-green':   { primary: '#00ff00', secondary: '#001a00', accent: '#33ff33', bg: '#000d00', text: '#00ff00' },
  'monochrome':     { primary: '#ffffff', secondary: '#222222', accent: '#cccccc', bg: '#111111', text: '#ffffff' },
};

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function loadBrands() { try { return JSON.parse(fs.readFileSync(BRANDS_FILE, 'utf-8')); } catch { return { brands: { default: DEFAULT_BRAND } }; } }
function saveBrands(db) { ensureDir(); fs.writeFileSync(BRANDS_FILE, JSON.stringify(db, null, 2)); }

function hexToRgba(hex, a = 1) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function loadBrandKit(name = 'default') {
  const db = loadBrands();
  return db.brands[name] || DEFAULT_BRAND;
}

export function saveBrandKit(name, config) {
  const db = loadBrands();
  db.brands[name] = { ...DEFAULT_BRAND, ...config, updatedAt: new Date().toISOString() };
  saveBrands(db);
  return db.brands[name];
}

export function listBrandKits() {
  const db = loadBrands();
  return Object.keys(db.brands);
}

export function getScheme(name) {
  return COLOR_SCHEMES[name] || COLOR_SCHEMES['midnight-gold'];
}

export function listSchemes() { return Object.keys(COLOR_SCHEMES); }

export function applyWatermark(canvas, ctx, brandKit = null, opts = {}) {
  const kit = brandKit || DEFAULT_BRAND;
  const wm = { ...kit.watermark, ...opts };
  const { position = 'bottom-right', opacity = 0.3, text, size = 24 } = wm;
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `bold ${size}px "${kit.fonts?.heading || 'Inter'}",Arial,sans-serif`;
  ctx.textBaseline = 'middle';
  const padding = size * 0.8;
  const metrics = ctx.measureText(text || kit.channelName);
  const tw = metrics.width;
  let x, y;
  switch (position) {
    case 'top-left':     x = padding; y = padding + size / 2; ctx.textAlign = 'left'; break;
    case 'top-right':    x = w - padding; y = padding + size / 2; ctx.textAlign = 'right'; break;
    case 'bottom-left':  x = padding; y = h - padding - size / 2; ctx.textAlign = 'left'; break;
    case 'center':       x = w / 2; y = h / 2; ctx.textAlign = 'center'; break;
    default:             x = w - padding; y = h - padding - size / 2; ctx.textAlign = 'right';
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(text || kit.channelName, x, y);
  ctx.fillStyle = kit.colors?.primary || '#d4af37';
  ctx.fillText(text || kit.channelName, x, y);
  ctx.restore();
}

export function generateIntroFrames(brandKit = null, title = '', opts = {}) {
  const kit = brandKit || DEFAULT_BRAND;
  const w = opts.width || 1920, h = opts.height || 1080;
  const fps = opts.fps || 30;
  const durationSec = opts.duration || 3;
  const totalFrames = fps * durationSec;
  const frames = [];
  const outDir = opts.outDir || path.join(process.cwd(), 'tools/social/output/intro_frames');
  fs.mkdirSync(outDir, { recursive: true });
  for (let f = 0; f < totalFrames; f++) {
    const progress = f / totalFrames;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, w * 0.3, h);
    grd.addColorStop(0, kit.colors?.bg || '#0a0a12');
    grd.addColorStop(1, kit.colors?.secondary || '#1a1a2e');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    const logoAlpha = Math.min(1, progress * 3);
    const logoScale = 0.8 + 0.2 * Math.min(1, progress * 2.5);
    ctx.save();
    ctx.globalAlpha = logoAlpha;
    ctx.translate(w / 2, h * 0.4);
    ctx.scale(logoScale, logoScale);
    const nameSize = Math.floor(h * 0.08);
    ctx.font = `bold ${nameSize}px "${kit.fonts?.heading || 'Inter'}",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = kit.colors?.primary || '#d4af37';
    ctx.shadowBlur = 30 * logoAlpha;
    ctx.fillStyle = kit.colors?.primary || '#d4af37';
    ctx.fillText(kit.channelName || kit.name, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
    if (kit.tagline && progress > 0.3) {
      const tagAlpha = Math.min(1, (progress - 0.3) * 3);
      ctx.globalAlpha = tagAlpha;
      ctx.font = `300 ${Math.floor(h * 0.03)}px "${kit.fonts?.body || 'Inter'}",sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = kit.colors?.text || '#ffffff';
      ctx.fillText(kit.tagline, w / 2, h * 0.48);
      ctx.globalAlpha = 1;
    }
    if (title && progress > 0.5) {
      const titleAlpha = Math.min(1, (progress - 0.5) * 4);
      ctx.globalAlpha = titleAlpha;
      const titleSize = Math.floor(h * 0.05);
      ctx.font = `600 ${titleSize}px "${kit.fonts?.heading || 'Inter'}",sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = kit.colors?.text || '#ffffff';
      ctx.fillText(title.length > 60 ? title.slice(0, 57) + '...' : title, w / 2, h * 0.65);
      ctx.globalAlpha = 1;
    }
    const lineW = w * 0.2 * Math.min(1, progress * 2);
    ctx.strokeStyle = hexToRgba(kit.colors?.primary || '#d4af37', 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - lineW / 2, h * 0.53);
    ctx.lineTo(w / 2 + lineW / 2, h * 0.53);
    ctx.stroke();
    const fname = `intro_${String(f).padStart(6, '0')}.png`;
    const fpath = path.join(outDir, fname);
    fs.writeFileSync(fpath, canvas.toBuffer('image/png'));
    frames.push(fpath);
  }
  return frames;
}

export function generateOutroFrames(brandKit = null, opts = {}) {
  const kit = brandKit || DEFAULT_BRAND;
  const w = opts.width || 1920, h = opts.height || 1080;
  const fps = opts.fps || 30;
  const durationSec = opts.duration || 4;
  const totalFrames = fps * durationSec;
  const frames = [];
  const outDir = opts.outDir || path.join(process.cwd(), 'tools/social/output/outro_frames');
  fs.mkdirSync(outDir, { recursive: true });
  for (let f = 0; f < totalFrames; f++) {
    const progress = f / totalFrames;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, kit.colors?.bg || '#0a0a12');
    grd.addColorStop(1, kit.colors?.secondary || '#1a1a2e');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    const fadeIn = Math.min(1, progress * 4);
    ctx.globalAlpha = fadeIn;
    const subSize = Math.floor(h * 0.06);
    ctx.font = `bold ${subSize}px "${kit.fonts?.heading || 'Inter'}",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = kit.colors?.primary || '#d4af37';
    ctx.fillText('SUBSCRIBE', w / 2, h * 0.3);
    ctx.font = `300 ${Math.floor(h * 0.035)}px "${kit.fonts?.body || 'Inter'}",sans-serif`;
    ctx.fillStyle = kit.colors?.text || '#ffffff';
    ctx.fillText('for more stories', w / 2, h * 0.38);
    if (progress > 0.25) {
      const socAlpha = Math.min(1, (progress - 0.25) * 4);
      ctx.globalAlpha = socAlpha;
      const handles = [];
      if (kit.social?.youtube) handles.push(`YouTube: ${kit.social.youtube}`);
      if (kit.social?.instagram) handles.push(`IG: ${kit.social.instagram}`);
      if (kit.social?.tiktok) handles.push(`TikTok: ${kit.social.tiktok}`);
      const socSize = Math.floor(h * 0.025);
      ctx.font = `400 ${socSize}px "${kit.fonts?.body || 'Inter'}",sans-serif`;
      ctx.fillStyle = hexToRgba(kit.colors?.text || '#ffffff', 0.7);
      handles.forEach((handle, i) => {
        ctx.fillText(handle, w / 2, h * 0.55 + i * socSize * 1.6);
      });
    }
    const bellSize = Math.floor(h * 0.07);
    const bellY = h * 0.7;
    const bellPulse = 1 + 0.05 * Math.sin(progress * Math.PI * 8);
    ctx.save();
    ctx.translate(w / 2, bellY);
    ctx.scale(bellPulse, bellPulse);
    ctx.font = `${bellSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔔', 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
    const fname = `outro_${String(f).padStart(6, '0')}.png`;
    const fpath = path.join(outDir, fname);
    fs.writeFileSync(fpath, canvas.toBuffer('image/png'));
    frames.push(fpath);
  }
  return frames;
}

export { COLOR_SCHEMES, DEFAULT_BRAND };
