/**
 * listicle.js — Top-10 / Countdown video template
 *
 * High-engagement countdown format optimized for TikTok, Shorts, and Reels.
 * Features big number transitions, per-item title cards, progress indicator,
 * and quick pacing to maximize viewer retention.
 *
 * Style references: WatchMojo, Screen Rant, MostAmazingTop10
 * Target RPM: $4-8 (entertainment / listicle niche)
 * Optimal length: 60-180 seconds (short-form) or 8-15 min (long-form)
 *
 * Pipeline:
 *   1. Parse script into numbered items with title + narration
 *   2. Generate TTS with energetic voice
 *   3. Sync subtitles at fast pacing (3-5 words/line)
 *   4. Generate frames: number transitions + title cards + progress bar
 *   5. Compile MP4 with upbeat background music + whoosh SFX
 *   6. Return {videoPath, durationSec, metadata}
 *
 * Script format:
 *   [TITLE: Top 10 Craziest Discoveries]
 *   [ITEM: 10 | The Bermuda Triangle]
 *   Narration text for item 10...
 *   [ITEM: 9 | Ancient Underground Cities]
 *   Narration text for item 9...
 *   ...
 *   [ITEM: 1 | The Final Reveal]
 *   Narration for the number 1 item.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSpeech, VOICES } from "../engine/tts.js";
import { segmentScript, groupIntoSubtitles } from "../engine/subtitle-engine.js";
import { generateFrames } from "../engine/frame-generator.js";
import { compileVideo } from "../engine/compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCIAL_ROOT = path.resolve(__dirname, "..");

/* ---------- Listicle-specific constants ---------- */

/** Color palette — bold, energetic, high-contrast */
const LIST_PALETTE = {
  bgPrimary: "#0a0a14",
  bgSecondary: "#12121e",
  bgCard: "rgba(18, 18, 30, 0.93)",
  numberGlow: "#ff4444",
  numberColor: "#ffffff",
  numberStroke: "#cc0000",
  accentYellow: "#ffd700",
  accentCyan: "#00e5ff",
  textPrimary: "#ffffff",
  textSecondary: "#c0c0c0",
  textMuted: "#888888",
  progressBg: "rgba(255, 255, 255, 0.15)",
  progressFill: "#ff4444",
  progressDone: "#00e5ff",
  titleCardBg: "rgba(0, 0, 0, 0.82)",
  titleCardBorder: "#ff4444",
  overlayDark: "rgba(0, 0, 0, 0.6)",
};

/** Font stack for listicle aesthetic — punchy, bold */
const LIST_FONTS = {
  bigNumber: "bold 280px 'Impact', 'Arial Black', sans-serif",
  bigNumberShort: "bold 360px 'Impact', 'Arial Black', sans-serif",
  itemTitle: "bold 64px 'Inter', 'Helvetica', Arial, sans-serif",
  itemTitleShort: "bold 72px 'Inter', 'Helvetica', Arial, sans-serif",
  subtitle: "bold 48px 'Inter', 'Helvetica', Arial, sans-serif",
  subtitleShort: "bold 56px 'Inter', 'Helvetica', Arial, sans-serif",
  progress: "600 28px 'Inter', 'Helvetica', Arial, sans-serif",
  videoTitle: "bold 88px 'Impact', 'Arial Black', sans-serif",
  videoTitleShort: "bold 96px 'Impact', 'Arial Black', sans-serif",
  small: "400 24px 'Inter', 'Helvetica', Arial, sans-serif",
};

/** Default TTS settings — energetic, fast-paced */
const LIST_TTS_DEFAULTS = {
  voice: VOICES.en_storytelling_male_dramatic, // en-US-DavisNeural — punchy
  rate: 5,    // Slightly faster for energy
  pitch: 2,   // Slightly higher for excitement
};

/**
 * Parse a listicle script into structured items.
 *
 * Script format:
 *   [TITLE: Top 10 Something]
 *   [INTRO]  optional intro text before first item
 *   [ITEM: 10 | Item Title Here]
 *   Narration for this item goes here. Can be multiple lines.
 *   [ITEM: 9 | Another Item]
 *   More narration...
 *   [OUTRO] optional outro after last item
 *
 * @param {string} script  Raw script text
 * @returns {{ narrationText, videoTitle, items[], introText, outroText }}
 */
function parseListicleScript(script) {
  const lines = script.split("\n");
  let videoTitle = "Top 10";
  const items = [];
  let introText = "";
  let outroText = "";
  let currentItem = null;
  let section = "pre"; // "pre" | "intro" | "item" | "outro"
  const narrationParts = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // [TITLE: ...]
    const titleMatch = line.match(/^\[TITLE:\s*(.+?)\]$/);
    if (titleMatch) {
      videoTitle = titleMatch[1];
      continue;
    }

    // [INTRO]
    if (/^\[INTRO\]$/i.test(line)) {
      section = "intro";
      continue;
    }

    // [OUTRO]
    if (/^\[OUTRO\]$/i.test(line)) {
      // Flush current item
      if (currentItem) {
        currentItem.narration = currentItem._lines.join(" ");
        narrationParts.push(currentItem.narration);
        items.push(currentItem);
        currentItem = null;
      }
      section = "outro";
      continue;
    }

    // [ITEM: N | Title]
    const itemMatch = line.match(/^\[ITEM:\s*(\d+)\s*\|\s*(.+?)\]$/);
    if (itemMatch) {
      // Flush previous item
      if (currentItem) {
        currentItem.narration = currentItem._lines.join(" ");
        narrationParts.push(currentItem.narration);
        items.push(currentItem);
      }
      if (section === "intro" && introText) {
        narrationParts.push(introText);
      }
      currentItem = {
        number: parseInt(itemMatch[1], 10),
        title: itemMatch[2],
        narration: "",
        _lines: [],
        wordOffset: narrationParts.join(" ").split(/\s+/).filter(Boolean).length,
      };
      section = "item";
      continue;
    }

    // Regular text
    if (section === "intro") {
      introText += (introText ? " " : "") + line;
    } else if (section === "outro") {
      outroText += (outroText ? " " : "") + line;
    } else if (section === "item" && currentItem) {
      currentItem._lines.push(line);
    } else {
      // Pre-title text treated as intro
      introText += (introText ? " " : "") + line;
    }
  }

  // Flush last item
  if (currentItem) {
    currentItem.narration = currentItem._lines.join(" ");
    narrationParts.push(currentItem.narration);
    items.push(currentItem);
  }

  if (outroText) {
    narrationParts.push(outroText);
  }

  // Insert intro at start
  const fullNarration = introText
    ? [introText, ...narrationParts].join(" ")
    : narrationParts.join(" ");

  // Clean up internal _lines
  for (const item of items) {
    delete item._lines;
  }

  // Sort items by number descending (10, 9, 8... 1)
  items.sort((a, b) => b.number - a.number);

  return {
    narrationText: fullNarration.replace(/\s+/g, " ").trim(),
    videoTitle,
    items,
    introText: introText || "",
    outroText: outroText || "",
    totalItems: items.length,
  };
}

/**
 * Build overlay descriptors for number transitions, title cards, and progress.
 *
 * @param {object} parsed   Output from parseListicleScript
 * @param {Array} segments  Word-level timing from segmentScript
 * @param {number} totalDurationMs
 * @param {{ width: number, height: number }} dims
 * @returns {Array} overlays for the frame generator
 */
function buildListicleOverlays(parsed, segments, totalDurationMs, dims) {
  const overlays = [];
  const { width: w, height: h } = dims;
  const isVertical = h > w;
  const totalItems = parsed.totalItems;

  // Helper: get timestamp from word offset
  function msAtWord(wordOffset) {
    if (!segments.length) return 0;
    const idx = Math.min(wordOffset, segments.length - 1);
    return segments[idx].startMs;
  }

  // --- Video title card (first 3 seconds) ---
  overlays.push({
    startMs: 0,
    endMs: 3000,
    type: "video_title",
    draw(ctx, fw, fh, progress) {
      const fadeIn = progress < 0.2 ? progress / 0.2 : 1;
      const fadeOut = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;
      const alpha = Math.min(fadeIn, fadeOut);
      const scale = 0.85 + 0.15 * easeOutBack(Math.min(1, progress / 0.3));

      ctx.save();
      ctx.globalAlpha = alpha;

      // Darkened overlay
      ctx.fillStyle = LIST_PALETTE.overlayDark;
      ctx.fillRect(0, 0, fw, fh);

      // Title
      ctx.translate(fw / 2, fh * (isVertical ? 0.45 : 0.5));
      ctx.scale(scale, scale);
      ctx.font = isVertical ? LIST_FONTS.videoTitleShort : LIST_FONTS.videoTitle;
      ctx.fillStyle = LIST_PALETTE.accentYellow;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(255, 215, 0, 0.4)";
      ctx.shadowBlur = 30;
      wrapText(ctx, parsed.videoTitle.toUpperCase(), 0, 0, fw * 0.85, isVertical ? 110 : 100);
      ctx.restore();
    },
  });

  // --- Per-item overlays ---
  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i];
    const startMs = msAtWord(item.wordOffset);

    // Big number transition (1.8 seconds)
    const numDuration = 1800;
    overlays.push({
      startMs: Math.max(0, startMs - 200),
      endMs: startMs + numDuration,
      type: "number_transition",
      data: { number: item.number },
      draw(ctx, fw, fh, progress) {
        // Phase 1: number zooms in (0-0.4)
        // Phase 2: number holds (0.4-0.7)
        // Phase 3: number slides up, title appears (0.7-1.0)
        const phase1 = Math.min(1, progress / 0.4);
        const phase3 = progress > 0.7 ? (progress - 0.7) / 0.3 : 0;

        ctx.save();

        // Dark overlay for visibility
        const overlayAlpha = progress < 0.15 ? progress / 0.15 : progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;
        ctx.globalAlpha = overlayAlpha * 0.75;
        ctx.fillStyle = LIST_PALETTE.bgPrimary;
        ctx.fillRect(0, 0, fw, fh);
        ctx.globalAlpha = overlayAlpha;

        // Big number
        const numScale = 0.3 + 0.7 * easeOutBack(phase1);
        const numY = fh * (isVertical ? 0.4 : 0.45) - phase3 * fh * 0.15;
        ctx.translate(fw / 2, numY);
        ctx.scale(numScale, numScale);

        // Number glow
        ctx.shadowColor = LIST_PALETTE.numberGlow;
        ctx.shadowBlur = 40;

        // Number stroke
        ctx.font = isVertical ? LIST_FONTS.bigNumberShort : LIST_FONTS.bigNumber;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 8;
        ctx.strokeStyle = LIST_PALETTE.numberStroke;
        ctx.strokeText(String(item.number), 0, 0);

        // Number fill
        ctx.fillStyle = LIST_PALETTE.numberColor;
        ctx.fillText(String(item.number), 0, 0);

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Item title (appears in phase 3)
        if (phase3 > 0) {
          const titleAlpha = easeOutCubic(phase3);
          ctx.globalAlpha = overlayAlpha * titleAlpha;
          ctx.fillStyle = LIST_PALETTE.accentYellow;
          ctx.font = isVertical ? LIST_FONTS.itemTitleShort : LIST_FONTS.itemTitle;
          ctx.textAlign = "center";
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 12;
          wrapText(
            ctx,
            item.title.toUpperCase(),
            fw / 2,
            fh * (isVertical ? 0.62 : 0.68),
            fw * 0.85,
            isVertical ? 80 : 72
          );
        }

        ctx.restore();
      },
    });

    // Progress indicator (persists during item narration)
    const itemEndMs = i < parsed.items.length - 1
      ? msAtWord(parsed.items[i + 1].wordOffset)
      : totalDurationMs - 1000;

    overlays.push({
      startMs: startMs + numDuration,
      endMs: itemEndMs,
      type: "progress_indicator",
      data: { current: totalItems - i, total: totalItems },
      draw(ctx, fw, fh, progress) {
        const currentIdx = totalItems - item.number + 1;
        const fadeIn = Math.min(1, progress / 0.1);
        const fadeOut = progress > 0.9 ? 1 - (progress - 0.9) / 0.1 : 1;
        ctx.save();
        ctx.globalAlpha = Math.min(fadeIn, fadeOut) * 0.9;

        // Dot progress at top
        const dotR = isVertical ? 8 : 6;
        const dotSpacing = isVertical ? 28 : 22;
        const totalDotsW = totalItems * dotSpacing;
        const startX = fw / 2 - totalDotsW / 2;
        const dotY = isVertical ? 120 : 40;

        for (let d = 0; d < totalItems; d++) {
          const dx = startX + d * dotSpacing + dotSpacing / 2;
          ctx.beginPath();
          ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
          if (d < currentIdx) {
            ctx.fillStyle = LIST_PALETTE.progressDone;
          } else if (d === currentIdx) {
            ctx.fillStyle = LIST_PALETTE.progressFill;
          } else {
            ctx.fillStyle = LIST_PALETTE.progressBg;
          }
          ctx.fill();
        }

        // Current item number badge (top-left or top-right)
        const badgeX = isVertical ? fw - 70 : fw - 60;
        const badgeY = isVertical ? 115 : 40;
        const badgeR = isVertical ? 30 : 24;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = LIST_PALETTE.numberGlow;
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = isVertical ? "bold 28px Impact, sans-serif" : "bold 22px Impact, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`#${item.number}`, badgeX, badgeY);

        ctx.restore();
      },
    });
  }

  return overlays;
}

/* ---------- Canvas helpers ---------- */

function roundRect(ctx, x, y, w, h, r) {
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

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const word of words) {
    const test = line + (line ? " " : "") + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Generates a complete listicle / countdown video.
 *
 * @param {object} story
 * @param {string} story.id            Unique identifier (e.g. "top10-ocean-001")
 * @param {string} story.title         Fallback title if not in script
 * @param {string} story.script        Full script with [ITEM: N | Title] markers
 * @param {string[]} story.tags        SEO tags
 * @param {string} [story.description] Video description
 *
 * @param {object} opts
 * @param {string} [opts.format="short"]  "short" (9:16 1080x1920) or "long" (16:9 1920x1080)
 * @param {string} [opts.voice]           TTS voice override
 * @param {string} [opts.musicPath]       Upbeat background music MP3
 * @param {string} [opts.bgImage]         Background image for Ken Burns
 * @param {string} [opts.outputDir]       Output directory
 * @param {number} [opts.fps=30]          Frames per second
 * @param {number} [opts.musicVolume=0.20] Background music level (higher for energy)
 * @param {boolean} [opts.keepFrames]     Keep frame PNGs after compile
 * @param {boolean} [opts.verbose]        FFmpeg verbose output
 * @returns {Promise<{videoPath, durationSec, audioPath, metadata}>}
 */
export async function generate(story, opts = {}) {
  if (!story || !story.script) {
    throw new Error("listicle.generate: story.script required");
  }

  const id = story.id || `list_${Date.now()}`;
  const format = opts.format || "short"; // Default vertical for TikTok/Shorts
  const fps = opts.fps || 30;
  const outputDir = opts.outputDir || path.join(SOCIAL_ROOT, "output", id);
  const framesDir = path.join(outputDir, "frames");

  // Dimensions: listicle defaults to vertical (TikTok/Shorts)
  const dims = format === "short"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };

  // === 1. Parse script structure ===
  console.log(`[listicle] [${id}] Parsing script...`);
  const parsed = parseListicleScript(story.script);
  const videoTitle = parsed.videoTitle || story.title || "Top 10";
  console.log(`[listicle] [${id}] "${videoTitle}" — ${parsed.totalItems} items`);

  if (parsed.items.length === 0) {
    throw new Error("listicle.generate: no [ITEM: N | Title] markers found in script");
  }

  // === 2. Generate TTS — energetic, punchy voice ===
  console.log(`[listicle] [${id}] Generating TTS...`);
  const audioPath = path.join(outputDir, "narration.mp3");
  fs.mkdirSync(outputDir, { recursive: true });

  const tts = await generateSpeech(parsed.narrationText, {
    outputPath: audioPath,
    voice: opts.voice || LIST_TTS_DEFAULTS.voice,
    rate: opts.rate ?? LIST_TTS_DEFAULTS.rate,
    pitch: opts.pitch ?? LIST_TTS_DEFAULTS.pitch,
  });

  console.log(`[listicle] [${id}] TTS OK: ${(tts.sizeBytes / 1024).toFixed(0)} KB, ~${Math.round(tts.durationMs / 1000)}s`);

  // === 3. Synchronize subtitles — short lines for quick pacing ===
  const segments = segmentScript(parsed.narrationText, tts.durationMs);
  const wordsPerLine = format === "short" ? 3 : 5;
  const subtitles = groupIntoSubtitles(segments, {
    wordsPerLine,
    maxCharsPerLine: format === "short" ? 22 : 40,
    breakOnPunct: true,
  });

  const subtitlesForRender = subtitles.map((g) => ({
    text: g.text,
    startMs: g.startMs,
    endMs: g.endMs,
    words: g.words.map((w) => ({
      word: w.word,
      startMs: w.startMs,
      endMs: w.endMs,
    })),
  }));

  console.log(`[listicle] [${id}] ${subtitles.length} subtitle groups, ${segments.length} words`);

  // === 4. Build overlays (numbers, title cards, progress) ===
  const totalDurationMs = tts.durationMs + 800;
  const overlays = buildListicleOverlays(parsed, segments, totalDurationMs, dims);
  console.log(`[listicle] [${id}] ${overlays.length} overlays prepared`);

  // === 5. Construct scene ===
  const scene = {
    width: dims.width,
    height: dims.height,
    fps,
    durationMs: totalDurationMs,
    bg: opts.bgImage && fs.existsSync(opts.bgImage)
      ? {
          type: "image",
          imagePath: opts.bgImage,
          options: { zoomStart: 1.05, zoomEnd: 1.20, panX: 0.04 },
        }
      : { type: "cinematic" },
    style: format === "short" ? "shorts" : "narrative",
    subtitles: subtitlesForRender,
    overlays,
    title: null, // Handled by overlay instead
    watermark: opts.watermark || "",
    showProgress: true,
  };

  // === 6. Generate frames ===
  console.log(`[listicle] [${id}] Generating frames...`);
  await generateFrames(scene, framesDir, {
    onProgress: (cur, total) => {
      process.stdout.write(`\r  Frames: ${cur}/${total} (${Math.round((cur / total) * 100)}%)`);
    },
  });
  process.stdout.write("\n");

  // === 7. Compile MP4 ===
  console.log(`[listicle] [${id}] Compiling MP4...`);
  const videoPath = path.join(outputDir, `${id}_${format}.mp4`);
  const result = await compileVideo({
    framesDir,
    fps,
    audioPath: tts.audioPath,
    musicPath: opts.musicPath,
    musicVolume: opts.musicVolume ?? 0.20, // Higher music for energy
    outputPath: videoPath,
    width: dims.width,
    height: dims.height,
    crf: 20,
    preset: "medium",
    verbose: opts.verbose,
  });

  // === 8. Cleanup frames ===
  if (!opts.keepFrames) {
    try {
      const files = fs.readdirSync(framesDir);
      for (const f of files) {
        if (f.startsWith("frame_")) fs.unlinkSync(path.join(framesDir, f));
      }
      fs.rmdirSync(framesDir);
    } catch (_e) { /* non-critical */ }
  }

  console.log(`[listicle] [${id}] Done: ${videoPath} (${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

  return {
    videoPath,
    durationSec: totalDurationMs / 1000,
    audioPath: tts.audioPath,
    metadata: {
      id,
      title: videoTitle,
      description: story.description || "",
      tags: story.tags || [],
      format,
      template: "listicle",
      width: dims.width,
      height: dims.height,
      fps,
      durationMs: totalDurationMs,
      sizeBytes: result.sizeBytes,
      voice: tts.voice,
      totalItems: parsed.totalItems,
      items: parsed.items.map((it) => ({ number: it.number, title: it.title })),
    },
  };
}

export default { generate };
