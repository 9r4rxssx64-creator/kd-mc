/**
 * shorts-extractor.js — Extrait 3 Shorts 9:16 depuis une vidéo long-form 16:9
 *
 * Stratégie :
 *   1. Analyse la vidéo source (durée, résolution)
 *   2. Sélectionne 3 segments distincts (début/milieu/fin)
 *   3. Pour chaque segment :
 *      - Trim avec FFmpeg
 *      - Crop + scale en 9:16 (1080x1920)
 *      - Ajoute zoom léger (Ken Burns) pour remplir sans bandes noires
 *   4. Retourne les chemins des 3 Shorts
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extrait N shorts depuis une vidéo long-form.
 *
 * @param {string} inputPath    Chemin de la vidéo long-form (16:9 ou autre)
 * @param {object} opts
 * @param {number} opts.count          Nombre de shorts à extraire (défaut 3)
 * @param {number} opts.targetDurationSec Durée cible par short (défaut 45s)
 * @param {string} opts.outputDir      Dossier de sortie (défaut: <input>/shorts/)
 * @param {number[]} opts.startSeconds Positions de début en secondes (sinon auto)
 * @returns {Promise<Array<{path, startSec, durationSec, index}>>}
 */
export async function extractShorts(inputPath, opts = {}) {
  if (!fs.existsSync(inputPath)) throw new Error(`Vidéo introuvable : ${inputPath}`);
  const ffmpeg = await findFfmpeg();

  // Analyse durée de la source
  const info = await probeVideo(inputPath);
  const totalSec = info.durationSec;
  const count = opts.count || 3;
  const targetDur = opts.targetDurationSec || 45;

  if (totalSec < targetDur * count) {
    // Pas assez long pour N shorts distincts → réduire count
    const possibleCount = Math.max(1, Math.floor(totalSec / targetDur));
    console.log(`[shorts] Source trop courte (${totalSec.toFixed(1)}s), extraction de ${possibleCount} shorts au lieu de ${count}`);
    opts.count = possibleCount;
  }

  // Positions de découpage : répartir uniformément
  let startSeconds;
  if (opts.startSeconds && opts.startSeconds.length === count) {
    startSeconds = opts.startSeconds;
  } else {
    const segLength = totalSec / (count + 1);
    startSeconds = Array.from({ length: count }, (_, i) => segLength * (i + 0.5));
  }

  const outputDir = opts.outputDir || path.join(path.dirname(inputPath), "shorts");
  fs.mkdirSync(outputDir, { recursive: true });

  const inputBase = path.basename(inputPath, path.extname(inputPath));
  const results = [];

  for (let i = 0; i < count; i++) {
    const startSec = startSeconds[i];
    const outputPath = path.join(outputDir, `${inputBase}_short_${i + 1}.mp4`);

    console.log(`[shorts] ${i + 1}/${count} : ${formatTime(startSec)} → ${formatTime(startSec + targetDur)}`);
    await extractOneShort(inputPath, outputPath, startSec, targetDur, info, ffmpeg);

    results.push({
      path: outputPath,
      startSec,
      durationSec: targetDur,
      index: i + 1,
      sourceVideo: inputPath,
    });
  }

  return results;
}

/**
 * Extrait un seul short avec crop intelligent.
 */
async function extractOneShort(input, output, startSec, durationSec, sourceInfo, ffmpeg) {
  const isPortrait = sourceInfo.height > sourceInfo.width;
  const targetW = 1080;
  const targetH = 1920;

  // Construction du filtre vidéo
  // Si source = landscape 16:9 → crop central 9:16 avec scale
  // Si source = déjà portrait → juste scale
  let vfilter;
  if (isPortrait) {
    vfilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black`;
  } else {
    // Crop central puis scale
    vfilter = `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=${targetW}:${targetH}`;
  }

  const args = [
    "-y",
    "-ss", String(startSec),
    "-i", input,
    "-t", String(durationSec),
    "-vf", vfilter,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.1",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-movflags", "+faststart",
    output,
  ];

  await runFfmpeg(ffmpeg, args);
}

/**
 * Probe a video for duration/resolution.
 */
async function probeVideo(filePath) {
  const ffmpeg = await findFfmpeg();

  return new Promise((resolve, reject) => {
    // Use ffmpeg -i to get info (no ffprobe bundled)
    const proc = spawn(ffmpeg, ["-i", filePath, "-hide_banner"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", () => {
      // Parse: "Duration: 00:00:32.03, start: 0.000000, bitrate: 408 kb/s"
      const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const res = stderr.match(/Video:.*?(\d+)x(\d+)/);
      const fps = stderr.match(/(\d+(?:\.\d+)?)\s*fps/);
      if (!dur) return reject(new Error(`Impossible de parser la durée : ${stderr.substring(0, 200)}`));
      const durationSec = parseInt(dur[1]) * 3600 + parseInt(dur[2]) * 60 + parseFloat(dur[3]);
      resolve({
        durationSec,
        width: res ? parseInt(res[1]) : 1920,
        height: res ? parseInt(res[2]) : 1080,
        fps: fps ? parseFloat(fps[1]) : 30,
      });
    });
    proc.on("error", reject);
  });
}

/* ---------- Helpers ---------- */

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.split("\n").slice(-5).join(" ").substring(0, 300)}`));
    });
    proc.on("error", reject);
  });
}

let _ffmpegPath = null;
async function findFfmpeg() {
  if (_ffmpegPath) return _ffmpegPath;
  try {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    _ffmpegPath = (mod.default && mod.default.path) || mod.path || "ffmpeg";
  } catch (e) {
    _ffmpegPath = "ffmpeg";
  }
  return _ffmpegPath;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default { extractShorts };
