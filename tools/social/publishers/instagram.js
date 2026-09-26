/**
 * publishers/instagram.js — Upload Reel sur Instagram Business
 *
 * Instagram Reels n'accepte PAS d'upload direct de fichier — il faut une URL HTTPS publique.
 * Solution : upload temporaire vers Google Drive (ou GitHub release) → URL → API Reels.
 *
 * Variables d'env requises :
 *   - IG_USER_ID
 *   - IG_ACCESS_TOKEN (= FB_PAGE_TOKEN)
 *
 * Workflow Reel :
 *   1. Upload MP4 vers stockage public → obtenir URL HTTPS
 *   2. POST /{ig-user-id}/media avec media_type=REELS, video_url=...
 *   3. Polling status du container (FINISHED)
 *   4. POST /{ig-user-id}/media_publish avec creation_id
 */
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { retry, validateVideo, checkEnvKeys, logPublish } from "./base-publisher.js";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v20.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Crée un Reel Instagram à partir d'une URL vidéo publique.
 *
 * @param {string} videoUrl  URL HTTPS publique du MP4 9:16
 * @param {object} opts
 * @param {string} opts.caption     Légende (max 2200 chars, max 30 hashtags)
 * @param {string} opts.coverUrl    URL d'une image de cover (optionnel)
 * @param {boolean} opts.shareToFeed  Partager aussi dans le feed (défaut true)
 * @returns {Promise<{id, container_id}>}
 */
export async function createReel(videoUrl, opts = {}) {
  checkEnvKeys("instagram");
  if (!videoUrl) throw new Error("createReel: videoUrl requis (HTTPS public)");
  if (!videoUrl.startsWith("https://")) {
    throw new Error("createReel: l'URL doit être HTTPS (Instagram l'exige)");
  }
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;

  // ÉTAPE 1 : Créer le container
  const params = {
    media_type: "REELS",
    video_url: videoUrl,
    caption: opts.caption || "",
    share_to_feed: opts.shareToFeed === false ? "false" : "true",
    access_token: token,
  };
  if (opts.coverUrl) params.cover_url = opts.coverUrl;

  const create = await retry(async () => {
    const res = await axios.post(`${BASE}/${igUserId}/media`, null, { params });
    return res.data;
  });

  const containerId = create.id;
  if (!containerId) throw new Error("Instagram: container ID non retourné");

  // ÉTAPE 2 : Polling jusqu'à FINISHED (max 5 min)
  const maxPolls = 30;
  const pollDelay = 10000;
  let status = "IN_PROGRESS";
  let pollCount = 0;
  while (status !== "FINISHED" && pollCount < maxPolls) {
    await new Promise((r) => setTimeout(r, pollDelay));
    const statusRes = await axios.get(`${BASE}/${containerId}`, {
      params: { fields: "status_code,status", access_token: token },
    });
    status = statusRes.data.status_code || statusRes.data.status;
    pollCount++;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Instagram container échec : ${status}`);
    }
    if (process.env.DEBUG) console.log(`  IG polling ${pollCount}/${maxPolls} : ${status}`);
  }
  if (status !== "FINISHED") {
    throw new Error(`Instagram container timeout après ${maxPolls * pollDelay / 1000}s`);
  }

  // ÉTAPE 3 : Publier
  const publish = await retry(async () => {
    const res = await axios.post(`${BASE}/${igUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: token },
    });
    return res.data;
  });

  const result = { ...publish, container_id: containerId };
  logPublish("instagram", result, { type: "reel", caption: opts.caption });
  return result;
}

/**
 * Upload un fichier vers Google Drive et retourne une URL publique.
 * Utilise le client tools/integrations/gdrive/ (s'il est configuré).
 *
 * @param {string} filePath Chemin local
 * @returns {Promise<string>} URL HTTPS publique
 */
export async function uploadToPublicHost(filePath) {
  // Tente d'utiliser le client gdrive existant
  const gdrivePath = "/home/user/CMCteams/tools/integrations/gdrive/client.js";
  if (fs.existsSync(gdrivePath)) {
    try {
      const gdrive = await import(gdrivePath);
      if (typeof gdrive.uploadFile === "function") {
        const result = await gdrive.uploadFile(filePath, { public: true });
        return result.publicUrl || result.url;
      }
    } catch (e) {
      console.error(`gdrive échec : ${e.message}`);
    }
  }

  throw new Error(
    "uploadToPublicHost: aucune méthode de stockage public configurée.\n" +
    "Options : 1) Configurer Google Drive (tools/integrations/gdrive/setup.md)\n" +
    "         2) Uploader manuellement le fichier sur un host HTTPS et passer l'URL"
  );
}

/**
 * Workflow complet : prend un fichier local → uploade → publie.
 */
export async function publishReelFromFile(filePath, opts = {}) {
  validateVideo(filePath, "instagram", "reel");
  console.log(`[IG] Upload vers stockage public...`);
  const url = await uploadToPublicHost(filePath);
  console.log(`[IG] URL publique : ${url}`);
  console.log(`[IG] Création Reel...`);
  return await createReel(url, opts);
}

/**
 * Récupère les insights d'un Reel.
 */
export async function getReelInsights(mediaId) {
  checkEnvKeys("instagram");
  const token = process.env.IG_ACCESS_TOKEN;
  const metrics = ["plays", "reach", "likes", "comments", "shares", "saved", "total_interactions"].join(",");

  const res = await axios.get(`${BASE}/${mediaId}/insights`, {
    params: { metric: metrics, access_token: token },
  });
  return res.data;
}

export default { createReel, publishReelFromFile, uploadToPublicHost, getReelInsights };
