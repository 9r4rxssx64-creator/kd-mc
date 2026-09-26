/**
 * breaking-news.js — Breaking News / Expose-style video template
 *
 * News-style format with urgency elements: red banners, tickers, timestamps,
 * split-screen effects, and fast-paced narration. Optimized for YouTube
 * long-form investigative / news commentary content.
 *
 * Style references: CNN, BBC Breaking, Philip DeFranco, Johnny Harris
 * Target RPM: $10-16 (news/commentary niche)
 * Optimal length: 8-20 minutes
 *
 * Pipeline:
 *   1. Parse script into segments with alerts, tickers, timestamps
 *   2. Generate TTS with urgent, authoritative voice
 *   3. Sync subtitles at news-broadcast pacing
 *   4. Generate frames: red banners + ticker + timestamps + split-screen
 *   5. Compile MP4 with urgency music
 *   6. Return {videoPath, durationSec, metadata}
 *
 * Script format:
 *   [HEADLINE: Major Discovery Changes Everything]
 *   [ALERT: BREAKING — New evidence has emerged]
 *   [TICKER: Markets react to the announcement | Officials comment later today]
 *   [TIMESTAMP: 2026-04-15 09:32 UTC]
 *   [SPLIT: Left Panel | Right Panel]
 *   Regular narration text goes here.
 *   [SOURCE: Reuters, April 2026]
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

/* ---------- Breaking news constants ---------- */

/** Color palette — news broadcast, high urgency */
const NEWS_PALETTE = {
  bgPrimary: "#0a0e1a",
  bgSecondary: "#101828",
  bgPanel: "rgba(10, 14, 26, 0.92)",
  bannerRed: "#cc0000",
  bannerRedDark: "#990000",
  bannerRedGlow: "rgba(204, 0, 0, 0.4)",
  tickerBg: "#1a1a2e",
  tickerText: "#ffffff",
  tickerAccent: "#ffcc00",
  alertRed: "#ff0000",
  alertWhite: "#ffffff",
  timestampBg: "rgba(0, 0, 0, 0.75)",
  timestampText: "#00ff88",
  textPrimary: "#f0f0f0",
  textSecondary: "#b0b0b0",
  textMuted: "#808080",
  splitDivider: "#cc0000",
  sourceText: "#aaaaaa",
  overlayDark: "rgba(0, 0, 0, 0.6)",
  headlineBg: "rgba(204, 0, 0, 0.9)",
  headlineText: "#ffffff",
  liveIndicator: "#ff0000",
};

/** Font stack for news broadcast aesthetic */
const NEWS_FONTS = {
  headline: "bold 68px 'Inter', 'Helvetica', Arial, sans-serif",
  headlineSmall: "bold 52px 'Inter', 'Helvetica', Arial, sans-serif",
  banner: "bold 44px 'Inter', 'Helvetica', Arial, sans-serif",
  bannerLabel: "bold 36px 'Inter', 'Helvetica', Arial, sans-serif",
  ticker: "500 28px 'Inter', 'Helvetica', Arial, sans-serif",
  timestamp: "600 22px 'Courier New', 'Consolas', monospace",
  subtitle: "bold 42px 'Inter', 'Helvetica', Arial, sans-serif",
  subtitleShort: "bold 52px 'Inter', 'Helvetica', Arial, sans-serif",
  source: "italic 24px 'Georgia', 'Times New Roman', serif",
  splitLabel: "600 32px 'Inter', 'Helvetica', Arial, sans-serif",
  liveLabel: "bold 20px 'Inter', 'Helvetica', Arial, sans-serif",
  small: "400 22px 'Inter', 'Helvetica', Arial, sans-serif",
};

/** Default TTS — urgent, fast, authoritative */
const NEWS_TTS_DEFAULTS = {
  voice: VOICES.en_uk_narrator, // en-GB-RyanNeural — broadcast authority
  rate: 3,    // Slightly fast for urgency
  pitch: 0,   // Neutral pitch — professional
};

/**
 * Parse a breaking-news script into structured elements.
 *
 * @param {string} script  Raw script text
 * @returns {{ narrationText, headline, alerts[], tickers[], timestamps[], splits[], sources[] }}
 */
function parseNewsScript(script) {
  const lines = script.split("\n");
  let headline = "BREAKING NEWS";
  const alerts = [];
  const tickers = [];
  const timestamps = [];
  const splits = [];
  const sources = [];
  const narrationParts = [];
  let narrationWordCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // [HEADLINE: ...]
    const headlineMatch = line.match(/^\[HEADLINE:\s*(.+?)\]$/);
    if (headlineMatch) {
      headline = headlineMatch[1];
      continue;
    }

    // [ALERT: BREAKING — text]
    const alertMatch = line.match(/^\[ALERT:\s*(.+?)\]$/);
    if (alertMatch) {
      alerts.push({ text: alertMatch[1], wordOffset: narrationWordCount });
      continue;
    }

    // [TICKER: item1 | item2 | item3]
    const tickerMatch = line.match(/^\[TICKER:\s*(.+?)\]$/);
    if (tickerMatch) {
      const items = tickerMatch[1].split("|").map((s) => s.trim()).filter(Boolean);
      tickers.push({ items, wordOffset: narrationWordCount });
      continue;
    }

    // [TIMESTAMP: 2026-04-15 09:32 UTC]
    const tsMatch = line.match(/^\[TIMESTAMP:\s*(.+?)\]$/);
    if (tsMatch) {
      timestamps.push({ text: tsMatch[1], wordOffset: narrationWordCount });
      continue;
    }

    // [SPLIT: Left | Right]
    const splitMatch = line.match(/^\[SPLIT:\s*(.+?)\s*\|\s*(.+?)\]$/);
    if (splitMatch) {
      splits.push({
        left: splitMatch[1],
        right: splitMatch[2],
        wordOffset: narrationWordCount,
      });
      continue;
    }

    // [SOURCE: citation]
    const sourceMatch = line.match(/^\[SOURCE:\s*(.+?)\]$/);
    if (sourceMatch) {
      sources.push({ text: sourceMatch[1], wordOffset: narrationWordCount });
      continue;
    }

    // Regular narration
    narrationParts.push(line);
    narrationWordCount += line.split(/\s+/).filter(Boolean).length;
  }

  return {
    narrationText: narrationParts.join(" ").replace(/\s+/g, " ").trim(),
    headline,
    alerts,
    tickers,
    timestamps,
    splits,
    sources,
  };
}

/**
 * Build overlay descriptors for banners, tickers, timestamps, and alerts.
 *
 * @param {object} parsed   Output from parseNewsScript
 * @param {Array} segments  Word-level timing
 * @param {number} totalDurationMs
 * @param {{ width: number, height: number }} dims
 * @returns {Array} overlays
 */
function buildNewsOverlays(parsed, segments, totalDurationMs, dims) {
  const overlays = [];
  const { width: w, height: h } = dims;
  const isVertical = h > w;

  function msAtWord(wordOffset) {
    if (!segments.length) return 0;
    return segments[Math.min(wordOffset, segments.length - 1)].startMs;
  }

  // --- Persistent headline banner (top of screen) ---
  overlays.push({
    startMs: 0,
    endMs: totalDurationMs,
    type: "headline_banner",
    draw(ctx, fw, fh, progress) {
      const bannerH = isVertical ? 140 : 90;
      const bannerY = isVertical ? 60 : 0;

      ctx.save();

      // Red banner background
      ctx.fillStyle = NEWS_PALETTE.headlineBg;
      ctx.fillRect(0, bannerY, fw, bannerH);

      // "BREAKING" label on left
      const labelW = isVertical ? 220 : 180;
      ctx.fillStyle = NEWS_PALETTE.bannerRedDark;
      ctx.fillRect(0, bannerY, labelW, bannerH);

      ctx.fillStyle = NEWS_PALETTE.alertWhite;
      ctx.font = NEWS_FONTS.bannerLabel;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Blinking effect for "BREAKING"
      const blink = Math.sin(progress * totalDurationMs / 400) > -0.3;
      if (blink) {
        ctx.fillText("BREAKING", labelW / 2, bannerY + bannerH / 2);
      }

      // Headline text
      ctx.fillStyle = NEWS_PALETTE.headlineText;
      ctx.font = isVertical ? NEWS_FONTS.headlineSmall : NEWS_FONTS.banner;
      ctx.textAlign = "left";
      const textX = labelW + 20;
      const maxW = fw - textX - 20;
      const headlineText = parsed.headline.toUpperCase();
      // Truncate if too long
      let displayText = headlineText;
      while (ctx.measureText(displayText).width > maxW && displayText.length > 10) {
        displayText = displayText.slice(0, -4) + "...";
      }
      ctx.fillText(displayText, textX, bannerY + bannerH / 2);

      // LIVE indicator (top-right)
      const liveX = fw - 80;
      const liveY = bannerY + bannerH / 2;
      if (blink) {
        ctx.beginPath();
        ctx.arc(liveX - 20, liveY, 6, 0, Math.PI * 2);
        ctx.fillStyle = NEWS_PALETTE.liveIndicator;
        ctx.fill();
      }
      ctx.fillStyle = NEWS_PALETTE.alertWhite;
      ctx.font = NEWS_FONTS.liveLabel;
      ctx.textAlign = "left";
      ctx.fillText("LIVE", liveX - 8, liveY + 1);

      ctx.restore();
    },
  });

  // --- News ticker at bottom ---
  const allTickerItems = parsed.tickers.flatMap((t) => t.items);
  if (allTickerItems.length > 0) {
    const tickerText = allTickerItems.join("  ●  ");
    overlays.push({
      startMs: 2000, // Start after intro
      endMs: totalDurationMs,
      type: "ticker",
      draw(ctx, fw, fh, progress) {
        const tickerH = isVertical ? 50 : 40;
        const tickerY = fh - tickerH;

        ctx.save();

        // Ticker background
        ctx.fillStyle = NEWS_PALETTE.tickerBg;
        ctx.fillRect(0, tickerY, fw, tickerH);

        // Top border line
        ctx.fillStyle = NEWS_PALETTE.bannerRed;
        ctx.fillRect(0, tickerY, fw, 2);

        // Scrolling ticker text
        ctx.fillStyle = NEWS_PALETTE.tickerText;
        ctx.font = NEWS_FONTS.ticker;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const textW = ctx.measureText(tickerText + "  ●  ").width;
        const scrollSpeed = 80; // pixels per second
        const elapsed = progress * (totalDurationMs - 2000) / 1000;
        const offset = -(elapsed * scrollSpeed) % (textW + fw);

        // Clip to ticker area
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, tickerY, fw, tickerH);
        ctx.clip();

        // Draw repeated ticker text for seamless scroll
        let x = offset + fw;
        while (x < fw + textW * 2) {
          ctx.fillText(tickerText, x, tickerY + tickerH / 2 + 1);
          x += textW;
        }
        ctx.restore();

        ctx.restore();
      },
    });
  }

  // --- Alert banners (slide in from top, red, urgent) ---
  for (const alert of parsed.alerts) {
    const startMs = msAtWord(alert.wordOffset);
    const duration = 4500;
    overlays.push({
      startMs,
      endMs: startMs + duration,
      type: "alert_banner",
      data: { text: alert.text },
      draw(ctx, fw, fh, progress) {
        const slideIn = progress < 0.1 ? progress / 0.1 : 1;
        const slideOut = progress > 0.9 ? 1 - (progress - 0.9) / 0.1 : 1;
        const visibility = Math.min(slideIn, slideOut);
        const alertH = isVertical ? 110 : 80;
        const alertY = (isVertical ? 220 : 100) - (1 - visibility) * alertH * 1.5;

        ctx.save();
        ctx.globalAlpha = visibility;

        // Red alert bar
        ctx.fillStyle = NEWS_PALETTE.bannerRed;
        ctx.fillRect(0, alertY, fw, alertH);

        // Glow effect
        ctx.shadowColor = NEWS_PALETTE.bannerRedGlow;
        ctx.shadowBlur = 20;

        // Alert text
        ctx.fillStyle = NEWS_PALETTE.alertWhite;
        ctx.font = NEWS_FONTS.banner;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        wrapText(ctx, alert.text.toUpperCase(), fw / 2, alertY + alertH / 2, fw * 0.9, 48);

        ctx.restore();
      },
    });
  }

  // --- Timestamps on screen ---
  for (const ts of parsed.timestamps) {
    const startMs = msAtWord(ts.wordOffset);
    const duration = 6000;
    overlays.push({
      startMs,
      endMs: startMs + duration,
      type: "timestamp",
      data: { text: ts.text },
      draw(ctx, fw, fh, progress) {
        const fadeIn = progress < 0.1 ? progress / 0.1 : 1;
        const fadeOut = progress > 0.9 ? 1 - (progress - 0.9) / 0.1 : 1;
        const alpha = Math.min(fadeIn, fadeOut);

        ctx.save();
        ctx.globalAlpha = alpha;

        const tsX = isVertical ? 40 : 30;
        const tsY = fh - (isVertical ? 100 : 70);
        const padding = 10;

        // Background
        ctx.font = NEWS_FONTS.timestamp;
        const textW = ctx.measureText(ts.text).width;
        ctx.fillStyle = NEWS_PALETTE.timestampBg;
        roundRect(ctx, tsX - padding, tsY - 16, textW + padding * 2, 32, 4);
        ctx.fill();

        // Timestamp text (green monospace for tech look)
        ctx.fillStyle = NEWS_PALETTE.timestampText;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(ts.text, tsX, tsY);

        ctx.restore();
      },
    });
  }

  // --- Split-screen effects ---
  for (const split of parsed.splits) {
    const startMs = msAtWord(split.wordOffset);
    const duration = 5000;
    overlays.push({
      startMs,
      endMs: startMs + duration,
      type: "split_screen",
      data: { left: split.left, right: split.right },
      draw(ctx, fw, fh, progress) {
        const slideIn = Math.min(1, progress / 0.15);
        const slideOut = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;
        const alpha = Math.min(slideIn, slideOut);
        const splitOpenProgress = easeOutCubic(slideIn);

        ctx.save();
        ctx.globalAlpha = alpha;

        const midX = fw / 2;
        const panelY = isVertical ? fh * 0.3 : fh * 0.25;
        const panelH = isVertical ? fh * 0.35 : fh * 0.45;

        // Dark overlay behind panels
        ctx.fillStyle = NEWS_PALETTE.overlayDark;
        ctx.fillRect(0, panelY, fw, panelH);

        // Left panel
        const leftW = (midX - 3) * splitOpenProgress;
        ctx.fillStyle = NEWS_PALETTE.bgPanel;
        ctx.fillRect(midX - leftW, panelY, leftW, panelH);

        // Right panel
        const rightW = (midX - 3) * splitOpenProgress;
        ctx.fillStyle = NEWS_PALETTE.bgPanel;
        ctx.fillRect(midX + 3, panelY, rightW, panelH);

        // Divider
        ctx.fillStyle = NEWS_PALETTE.splitDivider;
        ctx.fillRect(midX - 2, panelY, 4, panelH);

        // Labels
        if (splitOpenProgress > 0.5) {
          const labelAlpha = (splitOpenProgress - 0.5) / 0.5;
          ctx.globalAlpha = alpha * labelAlpha;
          ctx.fillStyle = NEWS_PALETTE.textPrimary;
          ctx.font = NEWS_FONTS.splitLabel;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          wrapText(ctx, split.left, midX / 2, panelY + panelH / 2, midX - 40, 40);
          wrapText(ctx, split.right, midX + midX / 2, panelY + panelH / 2, midX - 40, 40);
        }

        ctx.restore();
      },
    });
  }

  // --- Source citations ---
  for (const src of parsed.sources) {
    const startMs = msAtWord(src.wordOffset);
    const duration = 4000;
    overlays.push({
      startMs,
      endMs: startMs + duration,
      type: "source",
      data: { text: src.text },
      draw(ctx, fw, fh, progress) {
        const fadeIn = progress < 0.15 ? progress / 0.15 : 1;
        const fadeOut = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;
        const alpha = Math.min(fadeIn, fadeOut);

        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = NEWS_PALETTE.sourceText;
        ctx.font = NEWS_FONTS.source;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`Source: ${src.text}`, fw - 30, fh - (isVertical ? 70 : 55));
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

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Generates a complete breaking-news / expose style video.
 *
 * @param {object} story
 * @param {string} story.id            Unique identifier (e.g. "expose-scandal-001")
 * @param {string} story.title         Video title
 * @param {string} story.script        Full script with [HEADLINE], [ALERT], etc.
 * @param {string[]} story.tags        SEO tags
 * @param {string} [story.description] Video description
 *
 * @param {object} opts
 * @param {string} [opts.format="long"]  "long" (16:9 1920x1080) or "short" (9:16 1080x1920)
 * @param {string} [opts.voice]          TTS voice override
 * @param {string} [opts.musicPath]      Urgency / news background music MP3
 * @param {string} [opts.bgImage]        Background image
 * @param {string} [opts.outputDir]      Output directory
 * @param {number} [opts.fps=30]         Frames per second
 * @param {number} [opts.musicVolume=0.18] Background music level
 * @param {boolean} [opts.keepFrames]    Keep frame PNGs after compile
 * @param {boolean} [opts.verbose]       FFmpeg verbose output
 * @returns {Promise<{videoPath, durationSec, audioPath, metadata}>}
 */
export async function generate(story, opts = {}) {
  if (!story || !story.script) {
    throw new Error("breaking-news.generate: story.script required");
  }

  const id = story.id || `news_${Date.now()}`;
  const format = opts.format || "long"; // Default landscape for YouTube
  const fps = opts.fps || 30;
  const outputDir = opts.outputDir || path.join(SOCIAL_ROOT, "output", id);
  const framesDir = path.join(outputDir, "frames");

  // Dimensions: news defaults to landscape (YouTube)
  const dims = format === "short"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };

  // === 1. Parse script structure ===
  console.log(`[breaking-news] [${id}] Parsing script...`);
  const parsed = parseNewsScript(story.script);
  console.log(
    `[breaking-news] [${id}] Headline: "${parsed.headline}" — ` +
    `${parsed.alerts.length} alerts, ${parsed.tickers.length} tickers, ` +
    `${parsed.timestamps.length} timestamps, ${parsed.splits.length} splits`
  );

  // === 2. Generate TTS — urgent, authoritative ===
  console.log(`[breaking-news] [${id}] Generating TTS...`);
  const audioPath = path.join(outputDir, "narration.mp3");
  fs.mkdirSync(outputDir, { recursive: true });

  const tts = await generateSpeech(parsed.narrationText, {
    outputPath: audioPath,
    voice: opts.voice || NEWS_TTS_DEFAULTS.voice,
    rate: opts.rate ?? NEWS_TTS_DEFAULTS.rate,
    pitch: opts.pitch ?? NEWS_TTS_DEFAULTS.pitch,
  });

  console.log(`[breaking-news] [${id}] TTS OK: ${(tts.sizeBytes / 1024).toFixed(0)} KB, ~${Math.round(tts.durationMs / 1000)}s`);

  // === 3. Sync subtitles — news pacing ===
  const segments = segmentScript(parsed.narrationText, tts.durationMs);
  const wordsPerLine = format === "short" ? 4 : 7;
  const subtitles = groupIntoSubtitles(segments, {
    wordsPerLine,
    maxCharsPerLine: format === "short" ? 30 : 55,
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

  console.log(`[breaking-news] [${id}] ${subtitles.length} subtitle groups, ${segments.length} words`);

  // === 4. Build overlays ===
  const totalDurationMs = tts.durationMs + 1000;
  const overlays = buildNewsOverlays(parsed, segments, totalDurationMs, dims);
  console.log(`[breaking-news] [${id}] ${overlays.length} overlays prepared`);

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
          options: { zoomStart: 1.0, zoomEnd: 1.08, panX: 0.01, panY: 0 },
        }
      : {
          type: "cinematic",
          options: { center: "#0a0e1a", edge: "#050810" },
        },
    style: format === "short" ? "shorts" : "narrative",
    subtitles: subtitlesForRender,
    overlays,
    title: null, // Headline is in the persistent banner overlay
    watermark: opts.watermark || "",
    showProgress: true,
  };

  // === 6. Generate frames ===
  console.log(`[breaking-news] [${id}] Generating frames...`);
  await generateFrames(scene, framesDir, {
    onProgress: (cur, total) => {
      process.stdout.write(`\r  Frames: ${cur}/${total} (${Math.round((cur / total) * 100)}%)`);
    },
  });
  process.stdout.write("\n");

  // === 7. Compile MP4 ===
  console.log(`[breaking-news] [${id}] Compiling MP4...`);
  const videoPath = path.join(outputDir, `${id}_${format}.mp4`);
  const result = await compileVideo({
    framesDir,
    fps,
    audioPath: tts.audioPath,
    musicPath: opts.musicPath,
    musicVolume: opts.musicVolume ?? 0.18,
    outputPath: videoPath,
    width: dims.width,
    height: dims.height,
    crf: 19,
    preset: "medium",
    verbose: opts.verbose,
  });

  // === 8. Cleanup ===
  if (!opts.keepFrames) {
    try {
      const files = fs.readdirSync(framesDir);
      for (const f of files) {
        if (f.startsWith("frame_")) fs.unlinkSync(path.join(framesDir, f));
      }
      fs.rmdirSync(framesDir);
    } catch (_e) { /* non-critical */ }
  }

  console.log(`[breaking-news] [${id}] Done: ${videoPath} (${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

  return {
    videoPath,
    durationSec: totalDurationMs / 1000,
    audioPath: tts.audioPath,
    metadata: {
      id,
      title: story.title || parsed.headline,
      description: story.description || "",
      tags: story.tags || [],
      format,
      template: "breaking-news",
      width: dims.width,
      height: dims.height,
      fps,
      durationMs: totalDurationMs,
      sizeBytes: result.sizeBytes,
      voice: tts.voice,
      headline: parsed.headline,
      alertCount: parsed.alerts.length,
      tickerItemCount: parsed.tickers.reduce((n, t) => n + t.items.length, 0),
      sourceCount: parsed.sources.length,
    },
  };
}

export default { generate };
