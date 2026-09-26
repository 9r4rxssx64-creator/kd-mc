/**
 * tts.js — Text-to-speech multi-backend
 *
 * Backends supportés (priorité par défaut, fallback automatique) :
 *   1. msedge-tts  — voix neural Microsoft Edge (300+ voix, qualité premium)
 *                    Nécessite accès internet à speech.platform.bing.com
 *   2. espeak-ng   — TTS local, qualité robotique, mais 100% offline et gratuit
 *
 * L'utilisateur peut forcer un backend via opts.backend = "edge" | "espeak"
 *
 * Exports :
 *   - generateSpeech(text, opts) : génère un MP3 + retourne durée
 *   - listVoices() : liste les voix disponibles
 *   - VOICES : voix recommandées pour chaque cas d'usage
 *   - TTS_BACKEND : backend détecté
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/* ---------- Voix recommandées ---------- */

export const VOICES = {
  // Edge TTS — qualité neural premium
  en_storytelling_male: "en-US-GuyNeural",
  en_storytelling_male_dramatic: "en-US-DavisNeural",
  en_storytelling_female: "en-US-AriaNeural",
  en_documentary: "en-US-AndrewNeural",
  en_motivation: "en-US-RogerNeural",
  en_calm: "en-US-EmmaNeural",
  fr_male_narrative: "fr-FR-HenriNeural",
  fr_female_narrative: "fr-FR-DeniseNeural",
  fr_male_dramatic: "fr-FR-AlainNeural",
  en_uk_narrator: "en-GB-RyanNeural",
  en_uk_female: "en-GB-SoniaNeural",
};

// Mapping vers voix espeak-ng équivalentes
export const ESPEAK_VOICES = {
  "en-US-GuyNeural": "en-us+m3",
  "en-US-DavisNeural": "en-us+m4",
  "en-US-AriaNeural": "en-us+f3",
  "en-US-AndrewNeural": "en-us+m1",
  "en-US-RogerNeural": "en-us+m2",
  "en-US-EmmaNeural": "en-us+f4",
  "fr-FR-HenriNeural": "fr+m3",
  "fr-FR-DeniseNeural": "fr+f3",
  "fr-FR-AlainNeural": "fr+m4",
  "en-GB-RyanNeural": "en-gb+m3",
  "en-GB-SoniaNeural": "en-gb+f3",
};

/* ---------- Détection backend ---------- */

let _detectedBackend = null;

async function detectBackend(forced) {
  if (forced === "espeak") return "espeak";
  if (forced === "edge") return "edge";
  if (_detectedBackend) return _detectedBackend;

  // Test rapide d'accès au serveur Edge TTS
  try {
    const ok = await new Promise((resolve) => {
      const proc = spawn("curl", [
        "-s", "-o", "/dev/null",
        "-w", "%{http_code}",
        "-m", "3",
        "https://speech.platform.bing.com/",
      ], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc.stdout.on("data", (d) => (out += d.toString()));
      proc.on("close", () => resolve(out.startsWith("2") || out.startsWith("4") && out !== "403"));
      proc.on("error", () => resolve(false));
    });
    if (ok) {
      _detectedBackend = "edge";
      return _detectedBackend;
    }
  } catch (e) { /* fallback */ }

  // Vérifier si espeak-ng est dispo
  try {
    const ok = await new Promise((resolve) => {
      const proc = spawn("espeak-ng", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
    if (ok) {
      _detectedBackend = "espeak";
      return _detectedBackend;
    }
  } catch (e) { /* nope */ }

  throw new Error(
    "Aucun backend TTS disponible. " +
    "Soit Edge TTS (internet à bing.com requis), soit espeak-ng (apt install espeak-ng)"
  );
}

export async function getBackend(forced) {
  return detectBackend(forced);
}

/* ---------- API principale ---------- */

/**
 * Génère un fichier audio à partir d'un texte.
 *
 * @param {string} text     Texte à dire
 * @param {object} opts
 * @param {string} opts.outputPath    Chemin du fichier audio à écrire
 * @param {string} opts.voice         Nom de voix (défaut: en-US-GuyNeural)
 * @param {string} opts.backend       "edge" | "espeak" | "auto" (défaut auto)
 * @param {number} opts.rate          Vitesse [-50, +50]
 * @param {number} opts.pitch         Pitch [-50, +50]
 * @param {number} opts.volume        Volume [-50, +50]
 * @returns {Promise<{audioPath, durationMs, sizeBytes, voice, backend}>}
 */
export async function generateSpeech(text, opts = {}) {
  if (!text || typeof text !== "string") {
    throw new Error("generateSpeech: 'text' must be a non-empty string");
  }
  const outputPath = opts.outputPath;
  if (!outputPath) {
    throw new Error("generateSpeech: 'outputPath' required");
  }

  const backend = await detectBackend(opts.backend);
  const voice = opts.voice || VOICES.en_storytelling_male;
  const rate = clamp(opts.rate ?? 0, -50, 50);
  const pitch = clamp(opts.pitch ?? 0, -50, 50);
  const volume = clamp(opts.volume ?? 0, -50, 50);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (backend === "edge") {
    return generateWithEdge(text, outputPath, voice, { rate, pitch, volume });
  }
  return generateWithEspeak(text, outputPath, voice, { rate, pitch, volume });
}

/* ---------- Backend: Microsoft Edge ---------- */

async function generateWithEdge(text, outputPath, voice, { rate, pitch, volume }) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const ttsOptions = {};
  if (rate !== 0) ttsOptions.rate = (1 + rate / 100).toFixed(2);
  if (pitch !== 0) ttsOptions.pitch = (pitch >= 0 ? "+" : "") + Math.round(pitch * 5) + "Hz";
  if (volume !== 0) ttsOptions.volume = (1 + volume / 100).toFixed(2);

  const basePath = outputPath.replace(/\.(mp3|wav)$/i, "");
  const result = await tts.toFile(basePath, text, ttsOptions);

  let finalPath;
  if (typeof result === "string") finalPath = result;
  else if (result && result.audioFilePath) finalPath = result.audioFilePath;
  else finalPath = `${basePath}.mp3`;

  if (!fs.existsSync(finalPath) && fs.existsSync(`${basePath}.mp3`)) {
    finalPath = `${basePath}.mp3`;
  }
  if (!fs.existsSync(finalPath)) {
    throw new Error(`Edge TTS: output not created at ${finalPath}`);
  }

  const stat = fs.statSync(finalPath);
  // 24kHz mono 48kbps ≈ 6 KB/sec
  const durationMs = Math.round((stat.size / 6000) * 1000);

  return { audioPath: finalPath, durationMs, sizeBytes: stat.size, voice, backend: "edge" };
}

/* ---------- Backend: espeak-ng ---------- */

function generateWithEspeak(text, outputPath, voice, { rate, pitch, volume }) {
  return new Promise((resolve, reject) => {
    // Mapper voix Edge → espeak
    const espeakVoice = ESPEAK_VOICES[voice] || (voice.startsWith("fr") ? "fr+m3" : "en-us+m3");

    // Espeak-ng paramètres :
    //   -v voice
    //   -s speed (mots/min, défaut 175, range 80-450)
    //   -p pitch (0-99, défaut 50)
    //   -a amplitude (0-200, défaut 100)
    //   -w output.wav
    const espeakSpeed = Math.round(170 + rate * 1.5);
    const espeakPitch = Math.round(45 + pitch * 0.5);
    const espeakAmp = Math.round(100 + volume * 1);

    // Si l'extension est .mp3, on génère en .wav puis on convertit
    const isWav = outputPath.toLowerCase().endsWith(".wav");
    const wavPath = isWav ? outputPath : outputPath.replace(/\.mp3$/i, ".wav");

    const args = [
      "-v", espeakVoice,
      "-s", String(espeakSpeed),
      "-p", String(espeakPitch),
      "-a", String(espeakAmp),
      "-w", wavPath,
      // Le texte vient via stdin pour gérer les caractères spéciaux
    ];

    const proc = spawn("espeak-ng", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => reject(new Error(`espeak-ng spawn: ${err.message}`)));

    proc.on("close", async (code) => {
      if (code !== 0) {
        return reject(new Error(`espeak-ng exit ${code}: ${stderr}`));
      }
      if (!fs.existsSync(wavPath)) {
        return reject(new Error(`espeak-ng: WAV non créé ${wavPath}`));
      }

      // Si l'utilisateur veut MP3, convertir avec ffmpeg
      let finalPath = wavPath;
      if (!isWav) {
        try {
          finalPath = await convertWavToMp3(wavPath, outputPath);
          // Nettoyer le WAV temporaire
          fs.unlinkSync(wavPath);
        } catch (e) {
          // Pas grave : retourner le WAV
          finalPath = wavPath;
        }
      }

      const stat = fs.statSync(finalPath);
      // Estimation durée WAV (16-bit mono 22050Hz ≈ 44 KB/sec)
      const bytesPerSec = isWav ? 44100 : 16000;
      const durationMs = Math.round((stat.size / bytesPerSec) * 1000);

      resolve({
        audioPath: finalPath,
        durationMs,
        sizeBytes: stat.size,
        voice: espeakVoice,
        backend: "espeak",
      });
    });

    // Envoyer le texte via stdin
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

async function convertWavToMp3(wavPath, mp3Path) {
  const ffmpeg = await findFfmpeg();
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", wavPath, "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "24000", mp3Path];
    const proc = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(mp3Path)) resolve(mp3Path);
      else reject(new Error(`ffmpeg WAV→MP3 exit ${code}: ${stderr.split("\n").slice(-3).join(" ")}`));
    });
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

/* ---------- Liste des voix ---------- */

export async function listVoices() {
  const backend = await detectBackend();
  if (backend === "edge") {
    const tts = new MsEdgeTTS();
    return await tts.getVoices();
  }
  // espeak-ng : liste via --voices
  return new Promise((resolve, reject) => {
    const proc = spawn("espeak-ng", ["--voices"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("close", () => {
      const lines = out.trim().split("\n").slice(1);
      const voices = lines.map((l) => {
        const parts = l.trim().split(/\s+/);
        return {
          Name: parts[3] || "",
          ShortName: parts[3] || "",
          Locale: parts[1] || "",
          Gender: parts[2] || "",
        };
      });
      resolve(voices);
    });
    proc.on("error", reject);
  });
}

/* ---------- Helpers ---------- */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

export default { generateSpeech, listVoices, getBackend, VOICES, ESPEAK_VOICES };
