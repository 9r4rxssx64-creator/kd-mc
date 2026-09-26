/**
 * publishers/facebook.js — Upload vidéo sur Facebook Page
 *
 * Étend le client existant tools/integrations/facebook/client.js (qui gère posts texte/photo)
 * avec :
 *   - uploadVideo(filePath, opts) : upload vidéo standard (POST /{page-id}/videos)
 *   - createReel(filePath, opts)  : Reel via 3-step (initialize → upload → finish)
 *
 * Variables d'env requises :
 *   - FB_PAGE_ID
 *   - FB_PAGE_TOKEN
 */
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import FormData from "form-data";
import { retry, validateVideo, checkEnvKeys, logPublish } from "./base-publisher.js";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v20.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD_BASE = `https://rupload.facebook.com/${GRAPH_VERSION}`;

/**
 * Upload une vidéo standard sur la page Facebook (multipart non-resumable).
 *
 * @param {string} filePath        Chemin local du MP4
 * @param {object} opts
 * @param {string} opts.title      Titre de la vidéo
 * @param {string} opts.description Description (caption)
 * @param {boolean} opts.published Publier immédiatement (défaut true)
 * @returns {Promise<{id, video_id}>}
 */
export async function uploadVideo(filePath, opts = {}) {
  const cfg = checkEnvKeys("facebook");
  validateVideo(filePath, "facebook", "video");
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;

  const form = new FormData();
  form.append("source", fs.createReadStream(filePath));
  if (opts.title) form.append("title", opts.title);
  if (opts.description) form.append("description", opts.description);
  form.append("published", opts.published === false ? "false" : "true");
  form.append("access_token", token);

  const result = await retry(async () => {
    const res = await axios.post(`${BASE}/${pageId}/videos`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 5 * 60 * 1000,
    });
    return res.data;
  }, { maxRetries: 2, delayMs: 3000 });

  logPublish("facebook", result, { title: opts.title, type: "video", file: path.basename(filePath) });
  return result;
}

/**
 * Crée un Reel Facebook (vidéo verticale 9:16).
 * Workflow 3 étapes : initialize → upload → finish.
 *
 * @param {string} filePath  Chemin du MP4 9:16 (max 90s)
 * @param {object} opts
 * @param {string} opts.description  Caption du Reel
 * @returns {Promise<{video_id, post_id}>}
 */
export async function createReel(filePath, opts = {}) {
  const cfg = checkEnvKeys("facebook");
  validateVideo(filePath, "facebook", "reel");
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  const fileSize = fs.statSync(filePath).size;

  // ÉTAPE 1 : Initialize upload
  const init = await retry(async () => {
    const res = await axios.post(`${BASE}/${pageId}/video_reels`, null, {
      params: {
        upload_phase: "start",
        access_token: token,
      },
    });
    return res.data;
  });

  const videoId = init.video_id;
  const uploadUrl = init.upload_url; // rupload.facebook.com URL

  // ÉTAPE 2 : Upload chunks (binary)
  await retry(async () => {
    const stream = fs.createReadStream(filePath);
    const res = await axios.post(uploadUrl, stream, {
      headers: {
        "Authorization": `OAuth ${token}`,
        "offset": "0",
        "file_size": String(fileSize),
        "Content-Type": "application/octet-stream",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 10 * 60 * 1000,
    });
    return res.data;
  }, { maxRetries: 2, delayMs: 5000 });

  // ÉTAPE 3 : Finish + publish
  const finish = await retry(async () => {
    const res = await axios.post(`${BASE}/${pageId}/video_reels`, null, {
      params: {
        upload_phase: "finish",
        video_id: videoId,
        video_state: "PUBLISHED",
        description: opts.description || "",
        access_token: token,
      },
    });
    return res.data;
  });

  const result = { video_id: videoId, ...finish };
  logPublish("facebook", result, { type: "reel", description: opts.description, file: path.basename(filePath) });
  return result;
}

/**
 * Récupère les insights d'une vidéo publiée.
 */
export async function getVideoInsights(videoId) {
  checkEnvKeys("facebook");
  const token = process.env.FB_PAGE_TOKEN;
  const metrics = [
    "post_video_views",
    "post_video_avg_time_watched",
    "post_video_complete_views_organic",
    "post_video_likes_by_reaction_type",
  ].join(",");

  const res = await axios.get(`${BASE}/${videoId}/video_insights`, {
    params: { metric: metrics, access_token: token },
  });
  return res.data;
}

export default { uploadVideo, createReel, getVideoInsights };
