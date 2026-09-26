/**
 * publishers/youtube.js — Upload vidéo YouTube via YouTube Data API v3
 *
 * Utilise googleapis SDK officiel.
 *
 * Variables d'env requises :
 *   - YOUTUBE_CLIENT_ID
 *   - YOUTUBE_CLIENT_SECRET
 *   - YOUTUBE_REFRESH_TOKEN
 *
 * Guide setup : tools/social/docs/setup-youtube.md
 */
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { retry, validateVideo, checkEnvKeys, logPublish } from "./base-publisher.js";

const OAUTH2 = google.auth.OAuth2;
let _cachedAuth = null;

/**
 * Récupère une instance OAuth2 authentifiée.
 */
function getAuth() {
  if (_cachedAuth) return _cachedAuth;

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "YouTube credentials manquants. Voir tools/social/docs/setup-youtube.md\n" +
      "Variables requises : YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN"
    );
  }

  const auth = new OAUTH2(clientId, clientSecret, "http://localhost");
  auth.setCredentials({ refresh_token: refreshToken });
  _cachedAuth = auth;
  return auth;
}

/**
 * Upload une vidéo sur YouTube.
 *
 * @param {string} filePath    Chemin local MP4
 * @param {object} opts
 * @param {string} opts.title           Titre (max 100 chars)
 * @param {string} opts.description     Description (max 5000 chars)
 * @param {string[]} opts.tags          Tags (combined max 500 chars)
 * @param {string} opts.categoryId      "22" = People & Blogs, "24" = Entertainment, "27" = Education
 * @param {string} opts.privacyStatus   "private" | "unlisted" | "public"
 * @param {string} opts.thumbnailPath   (optionnel) Image JPEG/PNG pour miniature
 * @param {boolean} opts.isShort        Si true, ajoute #Shorts et configure en Short
 * @returns {Promise<{id, url, videoId, metadata}>}
 */
export async function uploadVideo(filePath, opts = {}) {
  checkEnvKeys("youtube");
  validateVideo(filePath, "youtube", opts.isShort ? "short" : "video");

  const auth = getAuth();
  const youtube = google.youtube({ version: "v3", auth });

  // Titre : ajouter #Shorts si isShort
  let title = opts.title || "Untitled";
  if (opts.isShort && !/(#shorts|#short)/i.test(title)) {
    title = `${title} #Shorts`.substring(0, 100);
  }

  const metadata = {
    snippet: {
      title: title.substring(0, 100),
      description: (opts.description || "").substring(0, 5000),
      tags: (opts.tags || []).slice(0, 15),
      categoryId: opts.categoryId || "22",
    },
    status: {
      privacyStatus: opts.privacyStatus || "private",
      selfDeclaredMadeForKids: false,
      embeddable: true,
    },
  };

  console.log(`[YouTube] Upload : "${title}" (${opts.privacyStatus || "private"})`);

  const uploadRes = await retry(async () => {
    return await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: metadata,
      media: {
        body: fs.createReadStream(filePath),
      },
    });
  }, { maxRetries: 2, delayMs: 5000 });

  const videoId = uploadRes.data.id;
  const videoUrl = `https://youtube.com/watch?v=${videoId}`;
  console.log(`[YouTube] ✅ Uploadé : ${videoUrl}`);

  // Upload thumbnail si fourni
  if (opts.thumbnailPath && fs.existsSync(opts.thumbnailPath)) {
    try {
      console.log(`[YouTube] Upload thumbnail...`);
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(opts.thumbnailPath) },
      });
      console.log(`[YouTube] ✅ Thumbnail set`);
    } catch (e) {
      console.error(`[YouTube] ⚠ Thumbnail échec : ${e.message}`);
    }
  }

  const result = {
    id: videoId,
    videoId,
    url: videoUrl,
    metadata: uploadRes.data,
  };
  logPublish("youtube", result, {
    title,
    isShort: !!opts.isShort,
    privacy: opts.privacyStatus || "private",
    file: path.basename(filePath),
  });
  return result;
}

/**
 * Récupère les stats d'une vidéo.
 */
export async function getVideoStats(videoId) {
  const auth = getAuth();
  const youtube = google.youtube({ version: "v3", auth });
  const res = await youtube.videos.list({
    part: ["statistics", "snippet", "status"],
    id: [videoId],
  });
  return res.data.items?.[0] || null;
}

/**
 * Liste les dernières vidéos de la chaîne.
 */
export async function listMyVideos(maxResults = 10) {
  const auth = getAuth();
  const youtube = google.youtube({ version: "v3", auth });

  const myChannels = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  });
  const uploadsPlaylist = myChannels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) return [];

  const playlistItems = await youtube.playlistItems.list({
    part: ["snippet"],
    playlistId: uploadsPlaylist,
    maxResults,
  });

  return playlistItems.data.items || [];
}

/**
 * Update les metadata (titre, description) d'une vidéo existante.
 */
export async function updateVideo(videoId, updates = {}) {
  const auth = getAuth();
  const youtube = google.youtube({ version: "v3", auth });

  const res = await youtube.videos.update({
    part: ["snippet", "status"],
    requestBody: {
      id: videoId,
      snippet: {
        title: updates.title,
        description: updates.description,
        tags: updates.tags,
        categoryId: updates.categoryId || "22",
      },
      status: updates.privacyStatus ? { privacyStatus: updates.privacyStatus } : undefined,
    },
  });
  return res.data;
}

export default { uploadVideo, getVideoStats, listMyVideos, updateVideo };
