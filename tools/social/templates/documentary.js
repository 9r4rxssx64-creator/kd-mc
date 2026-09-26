/**
 * documentary.js — Documentary-style video template
 *
 * Professional documentary format optimized for YouTube long-form content.
 * Features slower pacing, Ken Burns effects, fact overlay cards, source citations,
 * and professional lower-thirds for speaker identification.
 *
 * Style references: Vox, Wendover Productions, Real Engineering
 * Target RPM: $8-14 (educational/documentary niche)
 * Optimal length: 10-20 minutes
 *
 * Pipeline:
 *   1. Parse script into sections with facts/citations
 *   2. Generate TTS with deep, authoritative voice (en_documentary)
 *   3. Sync subtitles at documentary pacing (8-12 words/line)
 *   4. Generate frames: Ken Burns bg + fact cards + lower-thirds + citations
 *   5. Compile MP4 with ambient/cinematic background music
 *   6. Return {videoPath, durationSec, metadata}
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

/* ---------- Documentary-specific constants ---------- */

/** Color palette — muted, professional, trust-inspiring */
const DOC_PALETTE = {
  bgPrimary: "#0d1117",
  bgSecondary: "#161b22",
  bgCard: "rgba(22, 27, 34, 0.92)",
  accent: "#58a6ff",
  accentWarm: "#d29922",
  textPrimary: "#e6edf3",
  textSecondary: "#8b949e",
  textMuted: "#6e7681",
  citationBg: "rgba(13, 17, 23, 0.85)",
  factCardBg: "rgba(22, 27, 34, 0.95)",
  factCardBorder: "#30363d",
  lowerThirdBg: "rgba(13, 17, 23, 0.88)",
  lowerThirdAccent: "#58a6ff",
  overlayDark: "rgba(0, 0, 0, 0.55)",
};

/** Font stack for documentary aesthetic */
const DOC_FONTS = {
  sectionTitle: "bold 78px 'Georgia', 'Times New Roman', serif",
  subtitle: "500 44px 'Inter', 'Helvetica', Arial, sans-serif",
  factTitle: "bold 52px 'Inter', 'Helvetica', Arial, sans-serif",
  factBody: "400 38px 'Inter', 'Helvetica', Arial, sans-serif",
  factNumber: "bold 120px 'Inter', 'Helvetica', Arial, sans-serif",
  citation: "italic 26px 'Georgia', 'Times New Roman', serif",
  lowerThirdName: "bold 36px 'Inter', 'Helvetica', Arial, sans-serif",
  lowerThirdRole: "400 28px 'Inter', 'Helvetica', Arial, sans-serif",
  chapterLabel: "600 32px 'Inter', 'Helvetica', Arial, sans-serif",
  timestamp: "500 24px 'Courier New', monospace",
};

/** Default documentary TTS settings — slower, deeper, authoritative */
const DOC_TTS_DEFAULTS = {
  voice: VOICES.en_documentary, // en-US-AndrewNeural
  rate: -8,   // Noticeably slower than normal
  pitch: -5,  // Deeper tone
};

/**
 * Parse a documentary script into structured sections.
 *
 * Script format supports markers:
 *   [SECTION: Title]          — chapter break
 *   [FACT: stat or number]    — fact overlay card
 *   [CITE: source text]       — citation at bottom
 *   [LOWER: Name | Role]      — lower-third identification
 *   [PAUSE: 2]                — pause in seconds
 *
 * @param {string} script  Raw script text
 * @returns {{ narrationText: string, sections: Array, facts: Array, citations: Array, lowerThirds: Array }}
 */
function parseDocumentaryScript(script) {
  const sections = [];
  const facts = [];
  const citations = [];
  const lowerThirds = [];
  const lines = script.split("\n");

  let currentSection = { title: "Introduction", startLine: 0 };
  let narrationParts = [];
  let narrationWordCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // [SECTION: Chapter Title]
    const sectionMatch = line.match(/^\[SECTION:\s*(.+?)\]$/);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1], wordOffset: narrationWordCount };
      sections.push(currentSection);
      continue;
    }

    // [FACT: The ocean covers 71% of Earth's surface]
    const factMatch = line.match(/^\[FACT:\s*(.+?)\]$/);
    if (factMatch) {
      facts.push({ text: factMatch[1], wordOffset: narrationWordCount });
      continue;
    }

    // [CITE: NASA, 2025 — Ocean Surface Report]
    const citeMatch = line.match(/^\[CITE:\s*(.+?)\]$/);
    if (citeMatch) {
      citations.push({ text: citeMatch[1], wordOffset: narrationWordCount });
      continue;
    }

    // [LOWER: Dr. Jane Smith | Marine Biologist]
    const lowerMatch = line.match(/^\[LOWER:\s*(.+?)\s*\|\s*(.+?)\]$/);
    if (lowerMatch) {
      lowerThirds.push({
        name: lowerMatch[1],
        role: lowerMatch[2],
        wordOffset: narrationWordCount,
      });
      continue;
    }

    // [PAUSE: 2] — insert a natural pause
    const pauseMatch = line.match(/^\[PAUSE:\s*(\d+(?:\.\d+)?)\]$/);
    if (pauseMatch) {
      // Pauses are handled in timing, skip for narration
      continue;
    }

    // Regular narration text
    narrationParts.push(line);
    narrationWordCount += line.split(/\s+/).length;
  }

  // Add intro section if none defined
  if (sections.length === 0) {
    sections.push({ title: "Introduction", wordOffset: 0 });
  }

  return {
    narrationText: narrationParts.join(" "),
    sections,
    facts,
    citations,
    lowerThirds,
  };
}

/**
 * Build overlay descriptors for fact cards, citations, and lower-thirds.
 * Each overlay is timed to appear at the right moment based on word offsets.
 *
 * @param {object} parsed        Output from parseDocumentaryScript
 * @param {Array} segments       Word-level timing from segmentScript
 * @param {number} totalDurationMs
 * @param {{ width: number, height: number }} dims
 * @returns {Array} overlays for the frame generator
 */
function buildDocumentaryOverlays(parsed, segments, totalDurationMs, dims) {
  const overlays = [];
  const { width: w, height: h } = dims;

  // Helper: get timestamp from word offset
  function msAtWord(wordOffset) {
    if (wordOffset >= segments.length) return totalDurationMs - 2000;
    return segments[Math.min(wordOffset, segments.length - 1)].startMs;
  }

  // --- Fact overlay cards (slide in from right) ---
  for (const fact of parsed.facts) {
    const startMs = msAtWord(fact.wordOffset);
    const duration = 5000; // 5 seconds on screen
    overlays.push({
      startMs,
      endMs: startMs + duration,
      type: "fact_card",
      data: { text: fact.text },
      draw(ctx, frameW, frameH, progress) {
        const cardW = frameW * 0.4;
        const cardH = 160;
        const margin = 40;
        // Slide in from right
        const slideProgress = progress < 0.1
          ? progress / 0.1
          : progress > 0.9
            ? 1 - (progress - 0.9) / 0.1
            : 1;
        const x = frameW - cardW - margin + (1 - slideProgress) * (cardW + margin);
        const y = frameH * 0.15;

        // Card background
        ctx.save();
        ctx.globalAlpha = slideProgress;
        ctx.fillStyle = DOC_PALETTE.factCardBg;
        ctx.beginPath();
        roundRect(ctx, x, y, cardW, cardH, 12);
        ctx.fill();

        // Left accent bar
        ctx.fillStyle = DOC_PALETTE.accent;
        ctx.fillRect(x, y, 4, cardH);

        // Fact text
        ctx.fillStyle = DOC_PALETTE.textPrimary;
        ctx.font = DOC_FONTS.factBody;
        wrapText(ctx, fact.text, x + 24, y + 45, cardW - 48, 44);
        ctx.restore();
      },
    });
  }

  // --- Citations (fade in at bottom) ---
  for (const cite of parsed.citations) {
    const startMs = msAtWord(cite.wordOffset);
    const duration = 4000;
    overlays.push({
      startMs,
      endMs: startMs + duration,
      type: "citation",
      data: { text: cite.text },
      draw(ctx, frameW, frameH, progress) {
        const alpha = progress < 0.15
          ? progress / 0.15
          : progress > 0.85
            ? 1 - (progress - 0.85) / 0.15
            : 1;
        ctx.save();
        ctx.globalAlpha = alpha;

        // Citation bar at bottom
        const barH = 44;
        const barY = frameH - barH - 20;
        ctx.fillStyle = DOC_PALETTE.citationBg;
        ctx.fillRect(0, barY, frameW, barH);

        // Source text
        ctx.fillStyle = DOC_PALETTE.textSecondary;
        ctx.font = DOC_FONTS.citation;
        ctx.textAlign = "right";
        ctx.fillText(`Source: ${cite.text}`, frameW - 30, barY + 30);
        ctx.restore();
      },
    });
  }

  // --- Lower-thirds (professional name card) ---
  for (const lt of parsed.lowerThirds) {
    const startMs = msAtWord(lt.wordOffset);
    const duration = 4500;
    overlays.push({
      startMs,
      endMs: startMs + duration,
      type: "lower_third",
      data: { name: lt.name, role: lt.role },
      draw(ctx, frameW, frameH, progress) {
        const slideIn = progress < 0.12 ? progress / 0.12 : 1;
        const slideOut = progress > 0.88 ? 1 - (progress - 0.88) / 0.12 : 1;
        const alpha = Math.min(slideIn, slideOut);
        const slideX = (1 - slideIn) * -350;

        ctx.save();
        ctx.globalAlpha = alpha;

        const ltW = 420;
        const ltH = 80;
        const ltX = 40 + slideX;
        const ltY = frameH - 150;

        // Background
        ctx.fillStyle = DOC_PALETTE.lowerThirdBg;
        ctx.fillRect(ltX, ltY, ltW, ltH);

        // Accent line on left
        ctx.fillStyle = DOC_PALETTE.lowerThirdAccent;
        ctx.fillRect(ltX, ltY, 4, ltH);

        // Name
        ctx.fillStyle = DOC_PALETTE.textPrimary;
        ctx.font = DOC_FONTS.lowerThirdName;
        ctx.textAlign = "left";
        ctx.fillText(lt.name, ltX + 20, ltY + 34);

        // Role
        ctx.fillStyle = DOC_PALETTE.textSecondary;
        ctx.font = DOC_FONTS.lowerThirdRole;
        ctx.fillText(lt.role, ltX + 20, ltY + 64);

        ctx.restore();
      },
    });
  }

  // --- Section title cards (chapter transitions) ---
  for (let i = 0; i < parsed.sections.length; i++) {
    const sec = parsed.sections[i];
    const startMs = msAtWord(sec.wordOffset);
    overlays.push({
      startMs: Math.max(0, startMs - 500),
      endMs: startMs + 3500,
      type: "section_title",
      data: { title: sec.title, index: i + 1 },
      draw(ctx, frameW, frameH, progress) {
        const fadeIn = progress < 0.2 ? progress / 0.2 : 1;
        const fadeOut = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;
        const alpha = Math.min(fadeIn, fadeOut);

        ctx.save();
        ctx.globalAlpha = alpha * 0.92;

        // Semi-transparent overlay during chapter transition
        ctx.fillStyle = DOC_PALETTE.overlayDark;
        ctx.fillRect(0, frameH * 0.35, frameW, frameH * 0.3);

        // Chapter number
        ctx.fillStyle = DOC_PALETTE.accent;
        ctx.font = DOC_FONTS.chapterLabel;
        ctx.textAlign = "center";
        ctx.fillText(`CHAPTER ${i + 1}`, frameW / 2, frameH * 0.44);

        // Section title
        ctx.fillStyle = DOC_PALETTE.textPrimary;
        ctx.font = DOC_FONTS.sectionTitle;
        ctx.fillText(sec.title, frameW / 2, frameH * 0.55);

        // Decorative line under title
        const lineW = Math.min(ctx.measureText(sec.title).width + 40, frameW * 0.6);
        ctx.strokeStyle = DOC_PALETTE.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(frameW / 2 - lineW / 2, frameH * 0.58);
        ctx.lineTo(frameW / 2 + lineW / 2, frameH * 0.58);
        ctx.stroke();

        ctx.restore();
      },
    });
  }

  return overlays;
}

/* ---------- Canvas helpers ---------- */

function roundRect(ctx, x, y, w, h, r) {
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

/**
 * Generates a complete documentary-style video.
 *
 * @param {object} story
 * @param {string} story.id            Unique identifier (e.g. "ocean-depths-001")
 * @param {string} story.title         Video title
 * @param {string} story.script        Full script with optional markers
 * @param {string[]} story.tags        SEO tags
 * @param {string} [story.description] YouTube description
 *
 * @param {object} opts
 * @param {string} [opts.format="long"]  "long" (16:9 1920x1080) or "short" (9:16 1080x1920)
 * @param {string} [opts.voice]          TTS voice override
 * @param {string} [opts.musicPath]      Ambient/cinematic background music MP3
 * @param {string} [opts.bgImage]        Ken Burns background image
 * @param {string} [opts.outputDir]      Output directory
 * @param {number} [opts.fps=30]         Frames per second
 * @param {number} [opts.musicVolume=0.12] Background music level (lower for docs)
 * @param {boolean} [opts.keepFrames]    Keep frame PNGs after compile
 * @param {boolean} [opts.verbose]       FFmpeg verbose output
 * @returns {Promise<{videoPath, durationSec, audioPath, metadata}>}
 */
export async function generate(story, opts = {}) {
  if (!story || !story.script) {
    throw new Error("documentary.generate: story.script required");
  }

  const id = story.id || `doc_${Date.now()}`;
  const format = opts.format || "long";
  const fps = opts.fps || 30;
  const outputDir = opts.outputDir || path.join(SOCIAL_ROOT, "output", id);
  const framesDir = path.join(outputDir, "frames");

  // Dimensions: documentary defaults to landscape (YouTube)
  const dims = format === "short"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };

  // === 1. Parse script structure ===
  console.log(`[documentary] [${id}] Parsing script...`);
  const parsed = parseDocumentaryScript(story.script);
  console.log(`[documentary] [${id}] Found ${parsed.sections.length} sections, ${parsed.facts.length} facts, ${parsed.citations.length} citations, ${parsed.lowerThirds.length} lower-thirds`);

  // === 2. Generate TTS — deep, authoritative voice ===
  console.log(`[documentary] [${id}] Generating TTS...`);
  const audioPath = path.join(outputDir, "narration.mp3");
  fs.mkdirSync(outputDir, { recursive: true });

  const tts = await generateSpeech(parsed.narrationText, {
    outputPath: audioPath,
    voice: opts.voice || DOC_TTS_DEFAULTS.voice,
    rate: opts.rate ?? DOC_TTS_DEFAULTS.rate,
    pitch: opts.pitch ?? DOC_TTS_DEFAULTS.pitch,
  });

  console.log(`[documentary] [${id}] TTS OK: ${(tts.sizeBytes / 1024).toFixed(0)} KB, ~${Math.round(tts.durationMs / 1000)}s`);

  // === 3. Synchronize subtitles — longer lines for documentary pacing ===
  const segments = segmentScript(parsed.narrationText, tts.durationMs);
  const wordsPerLine = format === "short" ? 5 : 10; // Documentary = more words per line
  const subtitles = groupIntoSubtitles(segments, {
    wordsPerLine,
    maxCharsPerLine: format === "short" ? 35 : 70,
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

  console.log(`[documentary] [${id}] ${subtitles.length} subtitle groups, ${segments.length} words`);

  // === 4. Build overlays (fact cards, citations, lower-thirds, sections) ===
  const totalDurationMs = tts.durationMs + 1200; // Buffer for documentary outro
  const overlays = buildDocumentaryOverlays(parsed, segments, totalDurationMs, dims);
  console.log(`[documentary] [${id}] ${overlays.length} overlays prepared`);

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
          options: {
            // Ken Burns: slow zoom + gentle pan (documentary feel)
            zoomStart: 1.0,
            zoomEnd: 1.12,
            panX: 0.02,
            panY: 0.01,
          },
        }
      : { type: "cinematic" },
    style: format === "short" ? "shorts" : "narrative",
    subtitles: subtitlesForRender,
    overlays,
    title: story.title,
    watermark: opts.watermark || "",
    showProgress: true,
  };

  // === 6. Generate frames ===
  console.log(`[documentary] [${id}] Generating frames...`);
  await generateFrames(scene, framesDir, {
    onProgress: (cur, total) => {
      process.stdout.write(`\r  Frames: ${cur}/${total} (${Math.round((cur / total) * 100)}%)`);
    },
  });
  process.stdout.write("\n");

  // === 7. Compile MP4 with ambient music ===
  console.log(`[documentary] [${id}] Compiling MP4...`);
  const videoPath = path.join(outputDir, `${id}_${format}.mp4`);
  const result = await compileVideo({
    framesDir,
    fps,
    audioPath: tts.audioPath,
    musicPath: opts.musicPath,
    musicVolume: opts.musicVolume ?? 0.12, // Lower music for documentary clarity
    outputPath: videoPath,
    width: dims.width,
    height: dims.height,
    crf: 18, // Higher quality for YouTube long-form
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

  console.log(`[documentary] [${id}] Done: ${videoPath} (${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

  return {
    videoPath,
    durationSec: totalDurationMs / 1000,
    audioPath: tts.audioPath,
    metadata: {
      id,
      title: story.title,
      description: story.description || "",
      tags: story.tags || [],
      format,
      template: "documentary",
      width: dims.width,
      height: dims.height,
      fps,
      durationMs: totalDurationMs,
      sizeBytes: result.sizeBytes,
      voice: tts.voice,
      sections: parsed.sections.map((s) => s.title),
      factCount: parsed.facts.length,
      citationCount: parsed.citations.length,
    },
  };
}

export default { generate };
