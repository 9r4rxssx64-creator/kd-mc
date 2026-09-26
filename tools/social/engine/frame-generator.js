/**
 * frame-generator.js — Génération de séquences de frames PNG pour FFmpeg
 *
 * Reçoit une "scène" (description de ce qui doit être affiché à chaque instant)
 * et génère N frames PNG séquentielles (frame_000000.png ... frame_NNNNNN.png).
 *
 * Format de scène :
 *   {
 *     width, height, fps,
 *     durationMs,
 *     bg: { type: "cinematic" | "image", imagePath?, options? },
 *     subtitles: [{ text, startMs, endMs, words: [{word, startMs, endMs}] }],
 *     overlays: [{ startMs, endMs, draw(ctx, w, h, progress) }],
 *     style: "narrative" | "shorts" | "demo"
 *   }
 *
 * Exports :
 *   - generateFrames(scene, outputDir) : génère les frames + retourne {frameCount, framesDir}
 */
import fs from "node:fs";
import path from "node:path";
import { loadImage } from "canvas";
import {
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
  ease,
} from "./base-renderer.js";

/**
 * Génère toutes les frames PNG d'une scène.
 *
 * @param {object} scene
 * @param {string} outputDir
 * @param {object} opts
 * @param {function} opts.onProgress  (current, total) callback
 * @returns {Promise<{frameCount, framesDir, durationSec}>}
 */
export async function generateFrames(scene, outputDir, opts = {}) {
  const fps = scene.fps || 30;
  const w = scene.width || 1920;
  const h = scene.height || 1080;
  const durationMs = scene.durationMs;
  if (!durationMs || durationMs <= 0) {
    throw new Error("generateFrames: scene.durationMs required (> 0)");
  }
  const totalFrames = Math.ceil((durationMs / 1000) * fps);

  fs.mkdirSync(outputDir, { recursive: true });

  // Pré-charger les images de fond si présentes
  const bgImages = {};
  if (scene.bg && scene.bg.type === "image" && scene.bg.imagePath) {
    if (fs.existsSync(scene.bg.imagePath)) {
      bgImages.main = await loadImage(scene.bg.imagePath);
    }
  }
  if (Array.isArray(scene.bgImages)) {
    for (let i = 0; i < scene.bgImages.length; i++) {
      const p = scene.bgImages[i];
      if (fs.existsSync(p)) {
        bgImages[`img_${i}`] = await loadImage(p);
      }
    }
  }

  const lastReportTime = { ts: Date.now() };

  for (let f = 0; f < totalFrames; f++) {
    const ms = (f / fps) * 1000;
    const progress = ms / durationMs;
    const { canvas, ctx } = createFrame(w, h);

    // === BACKGROUND ===
    drawSceneBackground(ctx, scene, bgImages, w, h, ms, progress);

    // === SUBTITLES (karaoke style) ===
    if (Array.isArray(scene.subtitles)) {
      drawActiveSubtitle(ctx, scene.subtitles, ms, w, h, scene.style);
    }

    // === OVERLAYS personnalisés ===
    if (Array.isArray(scene.overlays)) {
      for (const ov of scene.overlays) {
        if (ms >= ov.startMs && ms <= ov.endMs && typeof ov.draw === "function") {
          const localProg = (ms - ov.startMs) / (ov.endMs - ov.startMs);
          ov.draw(ctx, w, h, localProg, ms);
        }
      }
    }

    // === PROGRESS BAR ===
    if (scene.showProgress !== false) {
      drawProgressBar(ctx, w, h, progress, {
        height: 4,
        margin: 0,
        bgColor: "rgba(255,255,255,0.12)",
        color: PALETTE.goldBright,
      });
    }

    // === TITLE (overlay permanent en haut, optionnel) ===
    if (scene.title) {
      drawTitleOverlay(ctx, scene.title, w, h, ms);
    }

    // === BRAND/WATERMARK ===
    if (scene.watermark) {
      drawWatermark(ctx, scene.watermark, w, h);
    }

    // Écriture PNG
    const fname = `frame_${String(f).padStart(6, "0")}.png`;
    const fpath = path.join(outputDir, fname);
    const buf = canvas.toBuffer("image/png", { compressionLevel: 6 });
    fs.writeFileSync(fpath, buf);

    // Progress callback (max 1x/sec)
    if (opts.onProgress && (Date.now() - lastReportTime.ts > 1000 || f === totalFrames - 1)) {
      opts.onProgress(f + 1, totalFrames);
      lastReportTime.ts = Date.now();
    }
  }

  return {
    frameCount: totalFrames,
    framesDir: outputDir,
    durationSec: durationMs / 1000,
  };
}

/* ---------- Helpers de rendu de scène ---------- */

function drawSceneBackground(ctx, scene, bgImages, w, h, ms, progress) {
  const bg = scene.bg || { type: "cinematic" };

  if (bg.type === "image" && bgImages.main) {
    drawKenBurns(ctx, bgImages.main, w, h, progress, bg.options || {});
  } else if (bg.type === "imagePulse" && bgImages.main) {
    // Image avec léger pulse + zoom
    const pulseProg = (Math.sin(ms / 1000 * 0.5) + 1) / 2;
    drawKenBurns(ctx, bgImages.main, w, h, pulseProg * 0.4 + 0.3, {
      zoomStart: 1.05, zoomEnd: 1.18, panX: 0.03, panY: 0.02,
    });
  } else if (bg.type === "imageRotation" && Array.isArray(scene.bgImages) && scene.bgImages.length > 0) {
    // Images qui se succèdent (1 toutes les N secondes)
    const period = bg.period || 4000;
    const idx = Math.floor(ms / period) % scene.bgImages.length;
    const img = bgImages[`img_${idx}`];
    if (img) {
      const localProg = (ms % period) / period;
      drawKenBurns(ctx, img, w, h, localProg, bg.options || {});
    } else {
      drawCinematicBg(ctx, w, h, bg.options || {});
    }
  } else {
    drawCinematicBg(ctx, w, h, bg.options || {});
  }
}

function drawActiveSubtitle(ctx, subtitles, ms, w, h, style) {
  // Trouver le subtitle actif
  const active = subtitles.find((s) => ms >= s.startMs && ms <= s.endMs);
  if (!active) return;

  // Position : centre vertical pour shorts, bas pour long-form
  const isVertical = h > w; // 9:16
  const y = isVertical ? h * 0.55 : h * 0.78;

  // Choix du style
  if (style === "shorts" || isVertical) {
    // Style TikTok karaoke avec mot actif highlighted
    const words = active.words || [];
    let activeIdx = -1;
    for (let i = 0; i < words.length; i++) {
      if (ms >= words[i].startMs && ms <= words[i].endMs) {
        activeIdx = i;
        break;
      }
    }
    const wordTexts = words.map((w) => w.word);
    drawKaraokeLine(ctx, wordTexts, activeIdx, w / 2, y, {
      font: isVertical ? FONTS.caption : FONTS.captionSmall,
      activeColor: PALETTE.goldBright,
      color: PALETTE.textPrimary,
      spacing: 22,
    });
  } else {
    // Style long-form : caption sobre en bas
    drawTextWrapped(ctx, active.text, w / 2, y, w * 0.85, 60, {
      font: FONTS.captionSmall,
      color: PALETTE.textPrimary,
      shadowColor: "rgba(0,0,0,0.9)",
      shadowBlur: 14,
      shadowOffsetY: 5,
      strokeColor: "rgba(0,0,0,0.6)",
      strokeWidth: 3,
    });
  }
}

function drawTitleOverlay(ctx, title, w, h, ms) {
  // Apparait pendant les 4 premières secondes, fade-in/out
  if (ms > 4000) return;
  let alpha = 1;
  if (ms < 500) alpha = ms / 500;
  if (ms > 3500) alpha = 1 - (ms - 3500) / 500;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  const isVertical = h > w;
  const y = isVertical ? h * 0.18 : h * 0.15;

  drawTextWithShadow(ctx, title.toUpperCase(), w / 2, y, {
    font: isVertical ? FONTS.title : FONTS.display,
    color: PALETTE.goldBright,
    align: "center",
    shadowColor: "rgba(0,0,0,0.9)",
    shadowBlur: 20,
  });
  ctx.restore();
}

function drawWatermark(ctx, text, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawTextWithShadow(ctx, text, w - 30, h - 30, {
    font: FONTS.small,
    color: PALETTE.textSecondary,
    align: "right",
    baseline: "bottom",
    shadowBlur: 6,
  });
  ctx.restore();
}

export default { generateFrames };
