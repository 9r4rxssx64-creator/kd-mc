/**
 * compiler.js — Assemblage frames PNG + audio TTS + musique → MP4 final
 *
 * Utilise @ffmpeg-installer/ffmpeg (binaire portable) — pas besoin d'ffmpeg système.
 *
 * Flow :
 *   1. frames PNG dans un dossier (frame_000000.png ... frame_NNNNNN.png)
 *   2. audio TTS (MP3) — narration principale
 *   3. musique de fond (MP3) — optionnelle, mixée à -20dB sous la narration
 *   4. → MP4 H.264 + AAC
 *
 * Exports :
 *   - compileVideo({framesDir, audioPath, musicPath, outputPath, fps, width, height})
 */
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";

let _ffmpegPath = null;

/**
 * Trouve le binaire ffmpeg. Priorités :
 *  1. @ffmpeg-installer/ffmpeg (npm bundled)
 *  2. ffmpeg système (which)
 */
async function findFfmpeg() {
  if (_ffmpegPath) return _ffmpegPath;

  // 1. Essayer le package npm
  try {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    if (mod && mod.default && mod.default.path) {
      _ffmpegPath = mod.default.path;
      return _ffmpegPath;
    }
    if (mod && mod.path) {
      _ffmpegPath = mod.path;
      return _ffmpegPath;
    }
  } catch (e) {
    // non installé, fallback
  }

  // 2. Fallback système
  _ffmpegPath = "ffmpeg";
  return _ffmpegPath;
}

/**
 * Exécute ffmpeg en capturant stdout/stderr.
 */
function runFfmpeg(args, opts = {}) {
  return new Promise(async (resolve, reject) => {
    const ffmpeg = await findFfmpeg();
    const proc = spawn(ffmpeg, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (opts.verbose) process.stderr.write(d);
    });

    const timeoutMs = opts.timeoutMs || 10 * 60 * 1000;
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const tail = stderr.split("\n").slice(-15).join("\n");
        reject(new Error(`ffmpeg exited with code ${code}\n${tail}`));
      }
    });
  });
}

/**
 * Compile une vidéo MP4 à partir de frames PNG + audio.
 *
 * @param {object} opts
 * @param {string} opts.framesDir       Dossier contenant frame_000000.png ... (séquence)
 * @param {string} opts.framesPattern   Pattern (défaut "frame_%06d.png")
 * @param {number} opts.fps             FPS (défaut 30)
 * @param {string} opts.audioPath       MP3 de narration TTS (optionnel mais recommandé)
 * @param {string} opts.musicPath       MP3 de musique de fond (optionnel)
 * @param {number} opts.musicVolume     Volume musique 0..1 (défaut 0.18)
 * @param {string} opts.outputPath      Chemin du MP4 de sortie
 * @param {number} opts.width           Résolution (défaut 1920)
 * @param {number} opts.height          (défaut 1080)
 * @param {string} opts.preset          Preset H.264 (défaut "medium")
 * @param {number} opts.crf             CRF qualité (défaut 20)
 * @param {boolean} opts.verbose        Afficher logs ffmpeg
 * @returns {Promise<{outputPath, sizeBytes, durationSec}>}
 */
export async function compileVideo(opts) {
  if (!opts.framesDir) throw new Error("compileVideo: framesDir required");
  if (!opts.outputPath) throw new Error("compileVideo: outputPath required");

  const fps = opts.fps || 30;
  const pattern = opts.framesPattern || "frame_%06d.png";
  const framesPath = path.join(opts.framesDir, pattern);
  const out = opts.outputPath;
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const preset = opts.preset || "medium";
  const crf = opts.crf ?? 20;
  const musicVol = opts.musicVolume ?? 0.18;

  fs.mkdirSync(path.dirname(out), { recursive: true });

  // Vérifier qu'au moins une frame existe
  const firstFrame = path.join(opts.framesDir, pattern.replace("%06d", "000000"));
  if (!fs.existsSync(firstFrame)) {
    throw new Error(`compileVideo: première frame introuvable : ${firstFrame}`);
  }

  // Construction de la commande ffmpeg
  // Cas 1 : pas d'audio
  // Cas 2 : audio TTS seul
  // Cas 3 : audio TTS + musique de fond (mixés via filter_complex amix)

  const args = ["-y", "-framerate", String(fps), "-i", framesPath];

  let hasNarration = false;
  let hasMusic = false;

  if (opts.audioPath && fs.existsSync(opts.audioPath)) {
    args.push("-i", opts.audioPath);
    hasNarration = true;
  }
  if (opts.musicPath && fs.existsSync(opts.musicPath)) {
    args.push("-i", opts.musicPath);
    hasMusic = true;
  }

  // Filter complex pour mixer audio si besoin
  if (hasNarration && hasMusic) {
    // [1:a]=narration, [2:a]=musique
    // Baisser la musique, mixer ensemble
    args.push(
      "-filter_complex",
      `[2:a]volume=${musicVol}[bgm];[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`,
      "-map", "0:v",
      "-map", "[a]"
    );
  } else if (hasNarration) {
    args.push("-map", "0:v", "-map", "1:a");
  } else if (hasMusic) {
    args.push(
      "-filter_complex",
      `[1:a]volume=${musicVol}[a]`,
      "-map", "0:v",
      "-map", "[a]"
    );
  } else {
    args.push("-map", "0:v");
  }

  // Encodage vidéo H.264
  args.push(
    "-c:v", "libx264",
    "-preset", preset,
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level:v", "4.1",
    "-vf", `scale=${width}:${height}:flags=lanczos`,
    "-r", String(fps),
    "-g", String(fps * 2),
    "-movflags", "+faststart"
  );

  // Audio AAC si présent
  if (hasNarration || hasMusic) {
    args.push(
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-shortest"
    );
  }

  args.push(out);

  if (opts.verbose) {
    console.log("[compileVideo] ffmpeg args:");
    console.log("  " + args.join(" "));
  }

  await runFfmpeg(args, { verbose: opts.verbose, timeoutMs: opts.timeoutMs });

  if (!fs.existsSync(out)) {
    throw new Error(`compileVideo: sortie introuvable après ffmpeg : ${out}`);
  }

  const stat = fs.statSync(out);
  return {
    outputPath: out,
    sizeBytes: stat.size,
    durationSec: null, // ffprobe nécessaire pour précision
  };
}

/**
 * Mixe deux fichiers audio (narration + musique) → MP3 unique.
 * Utile si on veut générer l'audio séparément avant le rendering.
 */
export async function mixAudio({ narrationPath, musicPath, outputPath, musicVolume = 0.18, verbose = false }) {
  if (!narrationPath || !fs.existsSync(narrationPath)) {
    throw new Error("mixAudio: narrationPath introuvable");
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (!musicPath || !fs.existsSync(musicPath)) {
    // Pas de musique → copie la narration
    fs.copyFileSync(narrationPath, outputPath);
    return outputPath;
  }

  const args = [
    "-y",
    "-i", narrationPath,
    "-i", musicPath,
    "-filter_complex",
    `[1:a]volume=${musicVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2`,
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    outputPath,
  ];

  await runFfmpeg(args, { verbose });
  return outputPath;
}

/**
 * Récupère les infos d'un fichier vidéo via ffprobe (durée, résolution, etc.).
 */
export async function probeVideo(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`probeVideo: file not found ${filePath}`);
  const ffmpeg = await findFfmpeg();
  // ffprobe est généralement dans le même répertoire que ffmpeg
  const ffprobePath = ffmpeg.replace(/ffmpeg$/, "ffprobe");

  return new Promise((resolve, reject) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];
    const proc = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(out)); }
        catch (e) { reject(new Error(`probeVideo JSON parse: ${e.message}`)); }
      } else {
        reject(new Error(`ffprobe exit code ${code}`));
      }
    });
  });
}

export default { compileVideo, mixAudio, probeVideo };
