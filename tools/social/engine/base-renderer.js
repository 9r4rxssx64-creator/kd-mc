/**
 * base-renderer.js — Primitives de rendu canvas partagées
 *
 * Fournit les fonctions atomiques utilisées par tous les renderers (long-form, short-form).
 * Sépare la logique "comment dessiner" du "quoi dessiner" (templates).
 *
 * Style : look "cinéma sombre + accent doré" — esthétique narrative storytelling
 * qui marche bien sur YouTube/TikTok pour le faceless content.
 */
import { createCanvas } from "canvas";

/* ---------- Palette ---------- */

export const PALETTE = {
  // Backgrounds
  bgDeep: "#0a0a0f",
  bgMid: "#15151f",
  bgLight: "#22222e",

  // Accents (gold)
  goldBright: "#ffdc40",
  gold: "#c9a227",
  goldDark: "#7a6320",

  // Texte
  textPrimary: "#f5f5f0",
  textSecondary: "#b8b8b0",
  textMuted: "#7a7a72",

  // Drama / accents narratifs
  bloodRed: "#a01818",
  shadowBlue: "#1a2030",
  dangerOrange: "#d96a1f",

  // Overlay
  overlayDark: "rgba(0, 0, 0, 0.65)",
  overlayLight: "rgba(0, 0, 0, 0.35)",
};

/* ---------- Fonts ---------- */

export const FONTS = {
  display: "bold 96px 'Inter', 'Helvetica', Arial, sans-serif",
  title: "bold 72px 'Inter', 'Helvetica', Arial, sans-serif",
  subtitle: "600 56px 'Inter', 'Helvetica', Arial, sans-serif",
  body: "500 40px 'Inter', 'Helvetica', Arial, sans-serif",
  caption: "bold 64px 'Inter', 'Helvetica', Arial, sans-serif",
  captionSmall: "bold 48px 'Inter', 'Helvetica', Arial, sans-serif",
  small: "400 28px 'Inter', 'Helvetica', Arial, sans-serif",
};

/* ---------- Canvas factory ---------- */

/**
 * Crée un canvas + contexte avec antialiasing optimal.
 */
export function createFrame(width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.antialias = "subpixel";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

/* ---------- Backgrounds ---------- */

/**
 * Fond gradient sombre + vignette (look cinéma).
 */
export function drawCinematicBg(ctx, w, h, opts = {}) {
  const cx = w / 2;
  const cy = h / 2;

  // Gradient radial sombre
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
  grad.addColorStop(0, opts.center || PALETTE.bgMid);
  grad.addColorStop(1, opts.edge || PALETTE.bgDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Vignette (assombrir les bords)
  const vignette = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Fond image (Ken Burns effect — zoom/pan progressif).
 * @param {Image} img  Image Canvas (chargée via loadImage)
 * @param {number} progress  0..1 (avancement dans l'animation)
 */
export function drawKenBurns(ctx, img, w, h, progress = 0, opts = {}) {
  const zoomStart = opts.zoomStart ?? 1.0;
  const zoomEnd = opts.zoomEnd ?? 1.15;
  const panX = opts.panX ?? 0.05; // ratio de pan horizontal
  const panY = opts.panY ?? 0;

  const zoom = zoomStart + (zoomEnd - zoomStart) * progress;
  const offsetX = panX * w * progress;
  const offsetY = panY * h * progress;

  // Calcul cover (l'image couvre le canvas)
  const imgRatio = img.width / img.height;
  const canvasRatio = w / h;
  let drawW, drawH;
  if (imgRatio > canvasRatio) {
    drawH = h * zoom;
    drawW = drawH * imgRatio;
  } else {
    drawW = w * zoom;
    drawH = drawW / imgRatio;
  }
  const dx = (w - drawW) / 2 - offsetX;
  const dy = (h - drawH) / 2 - offsetY;

  ctx.drawImage(img, dx, dy, drawW, drawH);

  // Overlay sombre pour lisibilité du texte
  ctx.fillStyle = opts.overlayColor || "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, h);
}

/* ---------- Texte ---------- */

/**
 * Texte avec ombre portée (style YouTube faceless / TikTok).
 */
export function drawTextWithShadow(ctx, text, x, y, opts = {}) {
  ctx.save();
  ctx.font = opts.font || FONTS.body;
  ctx.fillStyle = opts.color || PALETTE.textPrimary;
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = opts.baseline || "middle";

  // Ombre portée
  ctx.shadowColor = opts.shadowColor || "rgba(0,0,0,0.85)";
  ctx.shadowBlur = opts.shadowBlur ?? 12;
  ctx.shadowOffsetX = opts.shadowOffsetX ?? 3;
  ctx.shadowOffsetY = opts.shadowOffsetY ?? 4;

  ctx.fillText(text, x, y);

  // Stroke optionnel
  if (opts.strokeColor) {
    ctx.shadowColor = "transparent";
    ctx.lineWidth = opts.strokeWidth ?? 4;
    ctx.strokeStyle = opts.strokeColor;
    ctx.strokeText(text, x, y);
  }
  ctx.restore();
}

/**
 * Texte multiligne avec word wrap automatique.
 */
export function drawTextWrapped(ctx, text, x, y, maxWidth, lineHeight, opts = {}) {
  ctx.save();
  ctx.font = opts.font || FONTS.body;
  ctx.fillStyle = opts.color || PALETTE.textPrimary;
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = "middle";

  if (opts.shadowColor !== "none") {
    ctx.shadowColor = opts.shadowColor || "rgba(0,0,0,0.85)";
    ctx.shadowBlur = opts.shadowBlur ?? 12;
    ctx.shadowOffsetY = opts.shadowOffsetY ?? 4;
  }

  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const totalH = lines.length * lineHeight;
  const startY = y - totalH / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineHeight;
    if (opts.strokeColor) {
      ctx.lineWidth = opts.strokeWidth ?? 4;
      ctx.strokeStyle = opts.strokeColor;
      ctx.strokeText(lines[i], x, ly);
    }
    ctx.fillText(lines[i], x, ly);
  }
  ctx.restore();
  return { lines, totalHeight: totalH };
}

/**
 * Caption "TikTok pop-in" (texte qui apparait avec scale-up + bg pill).
 *
 * @param {number} progress  0..1 (animation pop-in)
 */
export function drawCaptionPill(ctx, text, x, y, w, h, progress = 1, opts = {}) {
  const easeOut = 1 - Math.pow(1 - progress, 3);
  const scale = 0.7 + 0.3 * easeOut;
  const alpha = Math.min(1, easeOut * 1.5);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Background pill (arrondi)
  const padX = 30;
  const padY = 18;
  const radius = h / 2 + padY;

  ctx.font = opts.font || FONTS.caption;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textW = ctx.measureText(text).width;
  const pillW = textW + padX * 2;
  const pillH = h + padY * 2;

  // Fond noir semi-transparent
  ctx.fillStyle = opts.bgColor || "rgba(0,0,0,0.85)";
  roundRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, radius);
  ctx.fill();

  // Texte
  ctx.fillStyle = opts.color || PALETTE.textPrimary;
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, 0, 0);

  // Highlight optionnel (mot actif en jaune)
  if (opts.highlightColor) {
    ctx.fillStyle = opts.highlightColor;
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}

/**
 * Karaoke-style word highlight : affiche TOUS les mots de la ligne,
 * mais le mot "actif" est mis en évidence (couleur dorée + scale).
 */
export function drawKaraokeLine(ctx, words, activeIdx, x, y, opts = {}) {
  ctx.save();
  ctx.font = opts.font || FONTS.caption;
  ctx.textBaseline = "middle";

  // Mesure totale pour centrer
  const spacing = opts.spacing ?? 18;
  const measures = words.map((w) => ctx.measureText(w).width);
  const totalW = measures.reduce((a, b) => a + b, 0) + spacing * (words.length - 1);
  let cursor = x - totalW / 2;

  for (let i = 0; i < words.length; i++) {
    const isActive = i === activeIdx;
    const wWidth = measures[i];
    const cx = cursor + wWidth / 2;

    ctx.save();
    if (isActive) {
      ctx.translate(cx, y);
      ctx.scale(1.15, 1.15);
      ctx.fillStyle = opts.activeColor || PALETTE.goldBright;
      ctx.shadowColor = "rgba(255,220,64,0.5)";
      ctx.shadowBlur = 20;
      ctx.textAlign = "center";
      ctx.fillText(words[i], 0, 0);
    } else {
      ctx.fillStyle = opts.color || PALETTE.textPrimary;
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.textAlign = "center";
      ctx.fillText(words[i], cx, y);
    }
    ctx.restore();

    cursor += wWidth + spacing;
  }
  ctx.restore();
}

/* ---------- Shapes ---------- */

export function roundRect(ctx, x, y, w, h, r) {
  if (r < 0) r = 0;
  if (r > Math.min(w, h) / 2) r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Barre de progression discrète en bas (style YouTube/TikTok).
 */
export function drawProgressBar(ctx, w, h, progress, opts = {}) {
  const barH = opts.height || 6;
  const margin = opts.margin || 0;
  const y = opts.y ?? h - barH - margin;

  // Fond
  ctx.fillStyle = opts.bgColor || "rgba(255,255,255,0.18)";
  ctx.fillRect(margin, y, w - margin * 2, barH);

  // Avancée
  ctx.fillStyle = opts.color || PALETTE.goldBright;
  ctx.fillRect(margin, y, (w - margin * 2) * progress, barH);
}

/* ---------- Easings ---------- */

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

export default {
  PALETTE,
  FONTS,
  createFrame,
  drawCinematicBg,
  drawKenBurns,
  drawTextWithShadow,
  drawTextWrapped,
  drawCaptionPill,
  drawKaraokeLine,
  drawProgressBar,
  roundRect,
  ease,
};
