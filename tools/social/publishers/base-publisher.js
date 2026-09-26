/**
 * base-publisher.js — Logique partagée entre tous les publishers
 *
 * Fournit :
 *   - retry(fn, opts) : réessais avec backoff exponentiel
 *   - logPublish(platform, mediaId, metadata) : log local du résultat
 *   - validateVideo(filePath, platform) : vérifie compatibilité plateforme
 *   - withRateLimit(platform, fn) : rate limiting basique
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLATFORMS_PATH = path.join(__dirname, "..", "config", "platforms.json");
const PUBLISH_LOG_PATH = path.join(__dirname, "..", "output", "_publish-log.json");

/**
 * Retry avec backoff exponentiel.
 * @param {function} fn       Fonction async à retry
 * @param {object} opts
 * @param {number} opts.maxRetries  (défaut 3)
 * @param {number} opts.delayMs     (défaut 2000)
 * @param {function} opts.shouldRetry (err) => boolean
 */
export async function retry(fn, opts = {}) {
  const max = opts.maxRetries ?? 3;
  const baseDelay = opts.delayMs ?? 2000;
  const shouldRetry = opts.shouldRetry || (() => true);

  let lastErr = null;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === max || !shouldRetry(err)) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      console.error(`  ⚠ Retry ${attempt + 1}/${max} dans ${delay}ms : ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Log local du résultat de publication.
 */
export function logPublish(platform, result, metadata = {}) {
  let log = [];
  if (fs.existsSync(PUBLISH_LOG_PATH)) {
    try {
      log = JSON.parse(fs.readFileSync(PUBLISH_LOG_PATH, "utf8"));
    } catch (e) { log = []; }
  }
  const entry = {
    ts: new Date().toISOString(),
    platform,
    success: !!result && !result.error,
    mediaId: result && (result.id || result.mediaId || result.video_id) || null,
    error: result && result.error ? String(result.error) : null,
    metadata,
  };
  log.push(entry);
  // Limite à 500 entrées
  if (log.length > 500) log = log.slice(-500);
  fs.mkdirSync(path.dirname(PUBLISH_LOG_PATH), { recursive: true });
  fs.writeFileSync(PUBLISH_LOG_PATH, JSON.stringify(log, null, 2));
  return entry;
}

/**
 * Valide qu'un fichier vidéo respecte les contraintes de la plateforme.
 */
export function validateVideo(filePath, platform, formatKey = "video") {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Vidéo introuvable : ${filePath}`);
  }
  const platforms = JSON.parse(fs.readFileSync(PLATFORMS_PATH, "utf8"));
  const cfg = platforms[platform];
  if (!cfg) throw new Error(`Plateforme inconnue : ${platform}`);

  const stat = fs.statSync(filePath);
  const sizeMB = stat.size / 1024 / 1024;
  if (sizeMB > cfg.maxFileSizeMB) {
    throw new Error(
      `Vidéo trop volumineuse pour ${platform} : ${sizeMB.toFixed(2)} MB > ${cfg.maxFileSizeMB} MB`
    );
  }

  // Pas de check de durée/résolution sans ffprobe — laissé à la plateforme
  return { ok: true, sizeMB };
}

/**
 * Vérifie que les variables d'environnement requises sont définies.
 */
export function checkEnvKeys(platform) {
  const platforms = JSON.parse(fs.readFileSync(PLATFORMS_PATH, "utf8"));
  const cfg = platforms[platform];
  if (!cfg) throw new Error(`Plateforme inconnue : ${platform}`);
  const missing = (cfg.envKeys || []).filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[${platform}] Variables d'env manquantes : ${missing.join(", ")}\n` +
      `Voir tools/integrations/${platform}/setup.md`
    );
  }
  return cfg;
}

/**
 * Récupère le log de publication (pour status/dashboard).
 */
export function getPublishLog(opts = {}) {
  if (!fs.existsSync(PUBLISH_LOG_PATH)) return [];
  const log = JSON.parse(fs.readFileSync(PUBLISH_LOG_PATH, "utf8"));
  if (opts.platform) return log.filter((e) => e.platform === opts.platform);
  if (opts.lastN) return log.slice(-opts.lastN);
  return log;
}

export default { retry, logPublish, validateVideo, checkEnvKeys, getPublishLog };
