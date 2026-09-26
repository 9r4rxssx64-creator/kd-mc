/**
 * narrative-storytelling.js — Template "narrative storytelling" (faceless)
 *
 * Niche RPM #1 sur YouTube en 2026 : $12.82 RPM, croissance 21x.
 * Format : 8-15 min long-form OU 60s short-form
 *
 * Pipeline :
 *   1. Charge le script depuis la content-library (ou prompt direct)
 *   2. Génère narration TTS via edge-tts (voix dramatique mâle)
 *   3. Synchronise les subtitles word-by-word
 *   4. Génère frames avec background cinematic + karaoke captions
 *   5. Compile MP4 avec FFmpeg + musique de fond
 *   6. Retourne {videoPath, durationSec, metadata}
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

/**
 * Génère une vidéo narrative storytelling complète.
 *
 * @param {object} story
 * @param {string} story.id          Identifiant unique (ex: "betrayal-001")
 * @param {string} story.title       Titre (affiché en intro)
 * @param {string} story.script      Script complet (texte à narrer)
 * @param {string} story.tags        Tags pour SEO (array)
 *
 * @param {object} opts
 * @param {string} opts.format       "long" (16:9 1920x1080) ou "short" (9:16 1080x1920)
 * @param {string} opts.voice        Nom de voix edge-tts (défaut: dramatic male)
 * @param {string} opts.musicPath    MP3 musique de fond (optionnel)
 * @param {string} opts.bgImage      Image de fond statique (optionnel)
 * @param {string} opts.outputDir    Dossier de sortie (défaut: tools/social/output/{id}/)
 * @param {number} opts.fps          FPS (défaut 30)
 * @param {boolean} opts.verbose     Logs ffmpeg
 * @returns {Promise<{videoPath, durationSec, audioPath, metadata}>}
 */
export async function generate(story, opts = {}) {
  return generateNarrativeVideo(story, opts);
}

export async function generateNarrativeVideo(story, opts = {}) {
  if (!story || !story.script) {
    throw new Error("generateNarrativeVideo: story.script required");
  }

  const id = story.id || `story_${Date.now()}`;
  const format = opts.format || "long";
  const fps = opts.fps || 30;
  const outputDir = opts.outputDir || path.join(SOCIAL_ROOT, "output", id);
  const framesDir = path.join(outputDir, "frames");

  // Dimensions selon format
  const dims = format === "short"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };

  // === 1. Génère TTS ===
  console.log(`[narrative] [${id}] Génération TTS...`);
  const audioPath = path.join(outputDir, "narration.mp3");
  fs.mkdirSync(outputDir, { recursive: true });

  const tts = await generateSpeech(story.script, {
    outputPath: audioPath,
    voice: opts.voice || VOICES.en_storytelling_male_dramatic,
    rate: opts.rate ?? -5, // Légèrement plus lent = plus dramatique
    pitch: opts.pitch ?? -3,
  });

  console.log(`[narrative] [${id}] TTS OK: ${tts.audioPath} (${(tts.sizeBytes/1024).toFixed(0)} KB, ~${Math.round(tts.durationMs/1000)}s)`);

  // === 2. Synchronise subtitles ===
  const segments = segmentScript(story.script, tts.durationMs);
  const wordsPerLine = format === "short" ? 3 : 6;
  const subtitles = groupIntoSubtitles(segments, {
    wordsPerLine,
    maxCharsPerLine: format === "short" ? 22 : 50,
    breakOnPunct: true,
  });

  // Convertir au format attendu par frame-generator
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

  console.log(`[narrative] [${id}] ${subtitles.length} subtitles, ${segments.length} mots`);

  // === 3. Construit la scène ===
  const scene = {
    width: dims.width,
    height: dims.height,
    fps,
    durationMs: tts.durationMs + 800, // 800ms de buffer en fin
    bg: opts.bgImage && fs.existsSync(opts.bgImage)
      ? { type: "image", imagePath: opts.bgImage, options: { zoomStart: 1.05, zoomEnd: 1.18, panX: 0.04 } }
      : { type: "cinematic" },
    style: format === "short" ? "shorts" : "narrative",
    subtitles: subtitlesForRender,
    title: story.title,
    watermark: opts.watermark || "",
    showProgress: true,
  };

  // === 4. Génère les frames ===
  console.log(`[narrative] [${id}] Génération frames...`);
  const totalFrames = Math.ceil(scene.durationMs / 1000 * fps);
  await generateFrames(scene, framesDir, {
    onProgress: (cur, total) => {
      process.stdout.write(`\r  Frames: ${cur}/${total} (${Math.round(cur/total*100)}%)`);
    },
  });
  process.stdout.write("\n");

  // === 5. Compile MP4 ===
  console.log(`[narrative] [${id}] Compilation MP4...`);
  const videoPath = path.join(outputDir, `${id}_${format}.mp4`);
  const result = await compileVideo({
    framesDir,
    fps,
    audioPath: tts.audioPath,
    musicPath: opts.musicPath,
    musicVolume: opts.musicVolume ?? 0.15,
    outputPath: videoPath,
    width: dims.width,
    height: dims.height,
    crf: 20,
    preset: "medium",
    verbose: opts.verbose,
  });

  // Nettoyer les frames si pas demandé de garder
  if (!opts.keepFrames) {
    try {
      const files = fs.readdirSync(framesDir);
      for (const f of files) {
        if (f.startsWith("frame_")) fs.unlinkSync(path.join(framesDir, f));
      }
      fs.rmdirSync(framesDir);
    } catch (e) {
      // pas grave
    }
  }

  console.log(`[narrative] [${id}] ✅ ${videoPath} (${(result.sizeBytes/1024/1024).toFixed(2)} MB)`);

  return {
    videoPath,
    durationSec: scene.durationMs / 1000,
    audioPath: tts.audioPath,
    metadata: {
      id,
      title: story.title,
      tags: story.tags || [],
      format,
      width: dims.width,
      height: dims.height,
      fps,
      durationMs: scene.durationMs,
      sizeBytes: result.sizeBytes,
      voice: tts.voice,
    },
  };
}

export default { generateNarrativeVideo };
