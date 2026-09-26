/**
 * AI Thumbnail Generator — Professional-grade, multi-layout, A/B variant system
 * Supports 6 layouts × 5 platforms × multiple color schemes
 */
let createCanvas, loadImage, registerFont;
try {
  const canvas = await import('canvas');
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
  registerFont = canvas.registerFont || (() => {});
} catch {
  const err = () => { throw new Error('canvas package required: npm install canvas'); };
  createCanvas = err; loadImage = err; registerFont = () => {};
}
import fs from 'fs';
import path from 'path';

const PLATFORM_SIZES = {
  youtube:   { w: 1280, h: 720,  label: 'YouTube' },
  instagram: { w: 1080, h: 1080, label: 'Instagram' },
  tiktok:    { w: 1080, h: 1920, label: 'TikTok' },
  twitter:   { w: 1200, h: 675,  label: 'Twitter/X' },
  facebook:  { w: 1200, h: 630,  label: 'Facebook' },
};

const COLOR_SCHEMES = {
  'midnight-gold':  { bg: '#0a0a12', primary: '#d4af37', secondary: '#1a1a2e', accent: '#ffd700', text: '#ffffff', gradient: ['#0a0a12','#1a1a2e','#0d0d1a'] },
  'blood-red':      { bg: '#1a0000', primary: '#cc0000', secondary: '#2d0000', accent: '#ff3333', text: '#ffffff', gradient: ['#1a0000','#330000','#0d0000'] },
  'ocean-blue':     { bg: '#001a33', primary: '#0066cc', secondary: '#002244', accent: '#33aaff', text: '#ffffff', gradient: ['#001a33','#003366','#000d1a'] },
  'forest-green':   { bg: '#001a0d', primary: '#009933', secondary: '#002211', accent: '#33cc66', text: '#ffffff', gradient: ['#001a0d','#003319','#000d06'] },
  'royal-purple':   { bg: '#1a0033', primary: '#7700cc', secondary: '#220044', accent: '#aa33ff', text: '#ffffff', gradient: ['#1a0033','#330066','#0d001a'] },
  'neon-pink':      { bg: '#1a0011', primary: '#ff0077', secondary: '#2d001a', accent: '#ff33aa', text: '#ffffff', gradient: ['#1a0011','#330022','#0d0008'] },
  'sunset-orange':  { bg: '#1a0d00', primary: '#cc6600', secondary: '#2d1500', accent: '#ff9933', text: '#ffffff', gradient: ['#1a0d00','#332200','#0d0600'] },
  'arctic-white':   { bg: '#f0f4f8', primary: '#2d3748', secondary: '#e2e8f0', accent: '#4299e1', text: '#1a202c', gradient: ['#f0f4f8','#e2e8f0','#cbd5e0'] },
  'matrix-green':   { bg: '#000d00', primary: '#00ff00', secondary: '#001a00', accent: '#33ff33', text: '#00ff00', gradient: ['#000d00','#001a00','#000600'] },
  'monochrome':     { bg: '#111111', primary: '#ffffff', secondary: '#222222', accent: '#cccccc', text: '#ffffff', gradient: ['#111111','#1a1a1a','#0d0d0d'] },
};

const LAYOUTS = ['dramatic', 'split', 'numbered', 'versus', 'question', 'minimal'];

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fitText(ctx, text, maxWidth, startSize, minSize = 20) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `bold ${size}px "Inter","Helvetica Neue",Arial,sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawNoise(ctx, w, h, intensity = 0.03) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 255 * intensity;
    d[i] += noise; d[i + 1] += noise; d[i + 2] += noise;
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawVignette(ctx, w, h, strength = 0.6) {
  const grd = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
}

function drawGlow(ctx, x, y, radius, color) {
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grd.addColorStop(0, hexToRgba(color, 0.4));
  grd.addColorStop(0.5, hexToRgba(color, 0.1));
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawBackground(ctx, w, h, scheme) {
  const grd = ctx.createLinearGradient(0, 0, w * 0.3, h);
  scheme.gradient.forEach((c, i) => grd.addColorStop(i / (scheme.gradient.length - 1), c));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 50 + Math.random() * 150, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(scheme.primary, 0.03 + Math.random() * 0.04);
    ctx.fill();
  }
}

function drawStrokedText(ctx, text, x, y, opts = {}) {
  const { strokeColor = '#000000', strokeWidth = 4, fillColor = '#ffffff' } = opts;
  ctx.save();
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ─── Layout: DRAMATIC ────────────────────────────────────────────
function layoutDramatic(ctx, w, h, title, scheme) {
  drawBackground(ctx, w, h, scheme);
  drawGlow(ctx, w * 0.5, h * 0.4, w * 0.5, scheme.primary);
  const barH = h * 0.08;
  ctx.fillStyle = hexToRgba(scheme.primary, 0.9);
  ctx.fillRect(0, h * 0.02, w, barH);
  ctx.fillRect(0, h - barH - h * 0.02, w, barH);
  const maxW = w * 0.85;
  const fontSize = fitText(ctx, title, maxW, Math.floor(h * 0.14), 28);
  ctx.font = `bold ${fontSize}px "Inter","Helvetica Neue",Arial,sans-serif`;
  const lines = wrapText(ctx, title.toUpperCase(), maxW);
  const lineH = fontSize * 1.15;
  const totalH = lines.length * lineH;
  const startY = (h - totalH) / 2 + fontSize / 2;
  lines.forEach((line, i) => {
    ctx.shadowColor = scheme.primary;
    ctx.shadowBlur = 30;
    drawStrokedText(ctx, line, w / 2, startY + i * lineH, {
      fillColor: scheme.text, strokeColor: '#000', strokeWidth: 6
    });
    ctx.shadowBlur = 0;
  });
  drawVignette(ctx, w, h, 0.7);
  drawNoise(ctx, w, h, 0.025);
}

// ─── Layout: SPLIT ───────────────────────────────────────────────
function layoutSplit(ctx, w, h, title, scheme) {
  drawBackground(ctx, w, h, scheme);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.55, 0);
  ctx.lineTo(w * 0.45, h);
  ctx.lineTo(w, h);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(scheme.primary, 0.15);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = hexToRgba(scheme.primary, 0.8);
  ctx.fillRect(w * 0.48, h * 0.1, 4, h * 0.8);
  const maxW = w * 0.4;
  const fontSize = fitText(ctx, title, maxW, Math.floor(h * 0.1), 24);
  ctx.font = `bold ${fontSize}px "Inter","Helvetica Neue",Arial,sans-serif`;
  const lines = wrapText(ctx, title.toUpperCase(), maxW);
  const lineH = fontSize * 1.2;
  const startY = (h - lines.length * lineH) / 2 + fontSize / 2;
  lines.forEach((line, i) => {
    drawStrokedText(ctx, line, w * 0.24, startY + i * lineH, {
      fillColor: scheme.text, strokeWidth: 4
    });
  });
  drawGlow(ctx, w * 0.75, h * 0.5, w * 0.3, scheme.primary);
  const iconSize = Math.min(w, h) * 0.2;
  ctx.font = `${iconSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hexToRgba(scheme.primary, 0.6);
  ctx.fillText('⚡', w * 0.75, h * 0.5);
  drawVignette(ctx, w, h, 0.5);
  drawNoise(ctx, w, h, 0.02);
}

// ─── Layout: NUMBERED ────────────────────────────────────────────
function layoutNumbered(ctx, w, h, title, scheme, opts = {}) {
  drawBackground(ctx, w, h, scheme);
  const num = opts.number || '#1';
  const numSize = Math.floor(h * 0.55);
  ctx.font = `900 ${numSize}px "Inter","Helvetica Neue",Arial,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const grd = ctx.createLinearGradient(w * 0.2, h * 0.1, w * 0.8, h * 0.9);
  grd.addColorStop(0, hexToRgba(scheme.primary, 0.15));
  grd.addColorStop(1, hexToRgba(scheme.accent, 0.08));
  ctx.fillStyle = grd;
  ctx.fillText(num, w * 0.5, h * 0.45);
  ctx.strokeStyle = hexToRgba(scheme.primary, 0.4);
  ctx.lineWidth = 3;
  ctx.strokeText(num, w * 0.5, h * 0.45);
  const maxW = w * 0.8;
  const fontSize = fitText(ctx, title, maxW, Math.floor(h * 0.1), 22);
  ctx.font = `bold ${fontSize}px "Inter","Helvetica Neue",Arial,sans-serif`;
  const lines = wrapText(ctx, title.toUpperCase(), maxW);
  const lineH = fontSize * 1.2;
  const startY = h * 0.72;
  lines.forEach((line, i) => {
    ctx.shadowColor = scheme.primary;
    ctx.shadowBlur = 20;
    drawStrokedText(ctx, line, w / 2, startY + i * lineH, {
      fillColor: scheme.accent, strokeColor: '#000', strokeWidth: 5
    });
    ctx.shadowBlur = 0;
  });
  drawVignette(ctx, w, h, 0.65);
  drawNoise(ctx, w, h, 0.02);
}

// ─── Layout: VERSUS ──────────────────────────────────────────────
function layoutVersus(ctx, w, h, title, scheme) {
  drawBackground(ctx, w, h, scheme);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.48, 0);
  ctx.lineTo(w * 0.42, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(scheme.primary, 0.12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.52, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(w * 0.58, h);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(scheme.accent, 0.12);
  ctx.fill();
  ctx.restore();
  const badgeR = Math.min(w, h) * 0.1;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = scheme.primary;
  ctx.fill();
  ctx.strokeStyle = scheme.accent;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.font = `900 ${badgeR * 0.8}px "Inter",Arial,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('VS', w / 2, h / 2);
  const parts = title.split(/\s+vs\.?\s+/i);
  const left = (parts[0] || title).toUpperCase();
  const right = (parts[1] || '???').toUpperCase();
  const sideW = w * 0.35;
  const fzL = fitText(ctx, left, sideW, Math.floor(h * 0.09), 20);
  ctx.font = `bold ${fzL}px "Inter",Arial,sans-serif`;
  wrapText(ctx, left, sideW).forEach((line, i) => {
    drawStrokedText(ctx, line, w * 0.22, h * 0.35 + i * fzL * 1.2, {
      fillColor: scheme.text, strokeWidth: 4
    });
  });
  const fzR = fitText(ctx, right, sideW, Math.floor(h * 0.09), 20);
  ctx.font = `bold ${fzR}px "Inter",Arial,sans-serif`;
  wrapText(ctx, right, sideW).forEach((line, i) => {
    drawStrokedText(ctx, line, w * 0.78, h * 0.35 + i * fzR * 1.2, {
      fillColor: scheme.accent, strokeWidth: 4
    });
  });
  drawVignette(ctx, w, h, 0.6);
  drawNoise(ctx, w, h, 0.02);
}

// ─── Layout: QUESTION ────────────────────────────────────────────
function layoutQuestion(ctx, w, h, title, scheme) {
  drawBackground(ctx, w, h, scheme);
  drawGlow(ctx, w * 0.5, h * 0.35, w * 0.4, scheme.primary);
  const qSize = Math.floor(h * 0.35);
  ctx.font = `900 ${qSize}px "Inter",Arial,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = scheme.primary;
  ctx.shadowBlur = 50;
  ctx.fillStyle = hexToRgba(scheme.primary, 0.25);
  ctx.fillText('?', w / 2, h * 0.32);
  ctx.shadowBlur = 0;
  const maxW = w * 0.82;
  const fontSize = fitText(ctx, title, maxW, Math.floor(h * 0.085), 22);
  ctx.font = `bold ${fontSize}px "Inter","Helvetica Neue",Arial,sans-serif`;
  const lines = wrapText(ctx, title, maxW);
  const lineH = fontSize * 1.25;
  const startY = h * 0.62;
  const pad = 16;
  const blockH = lines.length * lineH + pad * 2;
  ctx.fillStyle = hexToRgba('#000000', 0.5);
  const rr = 12;
  const bx = w * 0.08, bw = w * 0.84, by = startY - fontSize / 2 - pad;
  ctx.beginPath();
  ctx.moveTo(bx + rr, by);
  ctx.lineTo(bx + bw - rr, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
  ctx.lineTo(bx + bw, by + blockH - rr);
  ctx.quadraticCurveTo(bx + bw, by + blockH, bx + bw - rr, by + blockH);
  ctx.lineTo(bx + rr, by + blockH);
  ctx.quadraticCurveTo(bx, by + blockH, bx, by + blockH - rr);
  ctx.lineTo(bx, by + rr);
  ctx.quadraticCurveTo(bx, by, bx + rr, by);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexToRgba(scheme.primary, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  lines.forEach((line, i) => {
    drawStrokedText(ctx, line, w / 2, startY + i * lineH, {
      fillColor: scheme.text, strokeWidth: 3
    });
  });
  drawVignette(ctx, w, h, 0.55);
  drawNoise(ctx, w, h, 0.02);
}

// ─── Layout: MINIMAL ─────────────────────────────────────────────
function layoutMinimal(ctx, w, h, title, scheme) {
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, scheme.gradient[0]);
  grd.addColorStop(1, scheme.gradient[1] || scheme.gradient[0]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  const maxW = w * 0.7;
  const fontSize = fitText(ctx, title, maxW, Math.floor(h * 0.1), 24);
  ctx.font = `600 ${fontSize}px "Inter","Helvetica Neue",Arial,sans-serif`;
  const lines = wrapText(ctx, title, maxW);
  const lineH = fontSize * 1.35;
  const totalH = lines.length * lineH;
  const startY = (h - totalH) / 2 + fontSize / 2;
  lines.forEach((line, i) => {
    ctx.fillStyle = scheme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(line, w / 2, startY + i * lineH);
  });
  const lineW = w * 0.15;
  ctx.strokeStyle = scheme.primary;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2 - lineW / 2, startY + totalH + 20);
  ctx.lineTo(w / 2 + lineW / 2, startY + totalH + 20);
  ctx.stroke();
  drawNoise(ctx, w, h, 0.015);
}

const LAYOUT_FN = {
  dramatic: layoutDramatic,
  split: layoutSplit,
  numbered: layoutNumbered,
  versus: layoutVersus,
  question: layoutQuestion,
  minimal: layoutMinimal,
};

function renderThumbnail(title, opts = {}) {
  const platform = opts.platform || 'youtube';
  const size = PLATFORM_SIZES[platform] || PLATFORM_SIZES.youtube;
  const layout = opts.layout || 'dramatic';
  const schemeName = opts.colorScheme || 'midnight-gold';
  const scheme = COLOR_SCHEMES[schemeName] || COLOR_SCHEMES['midnight-gold'];
  const { w, h } = size;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const fn = LAYOUT_FN[layout] || layoutDramatic;
  fn(ctx, w, h, title, scheme, opts);
  if (opts.channelName) {
    const tagH = Math.floor(h * 0.04);
    ctx.font = `bold ${tagH}px "Inter",Arial,sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = hexToRgba(scheme.primary, 0.7);
    ctx.fillText(opts.channelName, w - 20, h - 12);
  }
  return canvas;
}

export async function generateThumbnail(title, opts = {}) {
  const outDir = opts.outDir || path.join(process.cwd(), 'tools/social/output/thumbnails');
  fs.mkdirSync(outDir, { recursive: true });
  const canvas = renderThumbnail(title, opts);
  const platform = opts.platform || 'youtube';
  const layout = opts.layout || 'dramatic';
  const fname = `thumb_${platform}_${layout}_${Date.now()}.png`;
  const fpath = path.join(outDir, fname);
  fs.writeFileSync(fpath, canvas.toBuffer('image/png'));
  return { path: fpath, platform, layout, colorScheme: opts.colorScheme || 'midnight-gold' };
}

export async function generateVariants(title, opts = {}) {
  const schemes = ['midnight-gold', 'blood-red', 'neon-pink', 'ocean-blue', 'monochrome'];
  const layouts = opts.layouts || ['dramatic', 'split', 'question'];
  const results = [];
  const outDir = opts.outDir || path.join(process.cwd(), 'tools/social/output/thumbnails');
  fs.mkdirSync(outDir, { recursive: true });
  for (const layout of layouts) {
    for (const scheme of schemes.slice(0, opts.schemesPerLayout || 2)) {
      const canvas = renderThumbnail(title, { ...opts, layout, colorScheme: scheme });
      const fname = `variant_${layout}_${scheme}_${Date.now()}.png`;
      const fpath = path.join(outDir, fname);
      fs.writeFileSync(fpath, canvas.toBuffer('image/png'));
      results.push({ path: fpath, layout, colorScheme: scheme, variant: `${layout}-${scheme}` });
    }
  }
  return results;
}

export async function generateForAllPlatforms(title, opts = {}) {
  const results = {};
  const outDir = opts.outDir || path.join(process.cwd(), 'tools/social/output/thumbnails');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [platform, size] of Object.entries(PLATFORM_SIZES)) {
    const canvas = renderThumbnail(title, { ...opts, platform });
    const fname = `thumb_${platform}_${Date.now()}.png`;
    const fpath = path.join(outDir, fname);
    fs.writeFileSync(fpath, canvas.toBuffer('image/png'));
    results[platform] = { path: fpath, width: size.w, height: size.h };
  }
  return results;
}

export { PLATFORM_SIZES, COLOR_SCHEMES, LAYOUTS, renderThumbnail };
