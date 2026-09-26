/**
 * Instagram Business — Graph API client (CMCteams)
 *
 * Variables d'environnement requises :
 *   - IG_USER_ID       : id du compte Instagram Business (cf. setup.md)
 *   - IG_ACCESS_TOKEN  : Page Access Token Facebook (le même que FB_PAGE_TOKEN)
 *
 * Optionnel :
 *   - FB_GRAPH_VERSION : version Graph API (défaut "v20.0")
 *
 * Workflow Instagram en 2 étapes pour la publication :
 *   1) Création du média (container) -> creation_id
 *   2) Publication via media_publish avec creation_id
 */

import axios from "axios";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v20.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function getEnv() {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!igUserId) throw new Error("IG_USER_ID manquant dans l'environnement");
  if (!token) throw new Error("IG_ACCESS_TOKEN manquant dans l'environnement");
  return { igUserId, token };
}

function fmtError(err, context) {
  if (err.response && err.response.data && err.response.data.error) {
    const e = err.response.data.error;
    return new Error(`[IG ${context}] ${e.code}/${e.type} : ${e.message}`);
  }
  return new Error(`[IG ${context}] ${err.message || String(err)}`);
}

async function _publishContainer(creationId, token) {
  const { igUserId } = getEnv();
  // Petite attente recommandée par Meta : container parfois pas encore "FINISHED"
  await new Promise((r) => setTimeout(r, 1500));
  const res = await axios.post(`${BASE}/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: token
  });
  return res.data;
}

/**
 * Publie une photo dans le feed Instagram.
 * @param {string} imageUrl  URL HTTPS publique d'une image JPEG (<8MB, ratio 4:5 -> 1.91:1)
 * @param {string} caption   Légende (max ~2200 caractères, max 30 hashtags)
 * @returns {Promise<{id:string}>}  id du média publié
 */
export async function createPost(imageUrl, caption) {
  if (!imageUrl) throw new Error("createPost: 'imageUrl' requis");
  const { igUserId, token } = getEnv();
  try {
    const create = await axios.post(`${BASE}/${igUserId}/media`, {
      image_url: imageUrl,
      caption: caption || "",
      access_token: token
    });
    const creationId = create.data && create.data.id;
    if (!creationId) throw new Error("creation_id non retourné par l'API");
    return await _publishContainer(creationId, token);
  } catch (err) {
    throw fmtError(err, "createPost");
  }
}

/**
 * Publie une story photo (24h de visibilité).
 * @param {string} imageUrl  URL HTTPS publique d'une image
 * @returns {Promise<{id:string}>}
 */
export async function createStory(imageUrl) {
  if (!imageUrl) throw new Error("createStory: 'imageUrl' requis");
  const { igUserId, token } = getEnv();
  try {
    const create = await axios.post(`${BASE}/${igUserId}/media`, {
      image_url: imageUrl,
      media_type: "STORIES",
      access_token: token
    });
    const creationId = create.data && create.data.id;
    if (!creationId) throw new Error("creation_id non retourné par l'API");
    return await _publishContainer(creationId, token);
  } catch (err) {
    throw fmtError(err, "createStory");
  }
}

/**
 * Récupère les insights d'un média (post/story/reel).
 * @param {string} mediaId  id du média
 * @param {string[]} [metrics]  Défaut : ["impressions","reach","engagement","saved"]
 * @returns {Promise<object>}
 */
export async function getMediaInsights(mediaId, metrics) {
  if (!mediaId) throw new Error("getMediaInsights: 'mediaId' requis");
  const { token } = getEnv();
  const list = metrics && metrics.length
    ? metrics
    : ["impressions", "reach", "engagement", "saved"];
  try {
    const res = await axios.get(`${BASE}/${mediaId}/insights`, {
      params: { metric: list.join(","), access_token: token }
    });
    return res.data;
  } catch (err) {
    throw fmtError(err, "getMediaInsights");
  }
}

/**
 * Liste les commentaires d'un média.
 * @param {string} mediaId
 * @param {number} [limit=50]
 * @returns {Promise<Array<{id:string,text:string,username:string,timestamp:string}>>}
 */
export async function listComments(mediaId, limit = 50) {
  if (!mediaId) throw new Error("listComments: 'mediaId' requis");
  const { token } = getEnv();
  try {
    const res = await axios.get(`${BASE}/${mediaId}/comments`, {
      params: {
        fields: "id,text,username,timestamp,like_count,replies{id,text,username}",
        limit,
        access_token: token
      }
    });
    return (res.data && res.data.data) || [];
  } catch (err) {
    throw fmtError(err, "listComments");
  }
}

/**
 * Répond à un commentaire.
 * @param {string} commentId
 * @param {string} text
 * @returns {Promise<{id:string}>}
 */
export async function replyComment(commentId, text) {
  if (!commentId) throw new Error("replyComment: 'commentId' requis");
  if (!text) throw new Error("replyComment: 'text' requis");
  const { token } = getEnv();
  try {
    const res = await axios.post(`${BASE}/${commentId}/replies`, {
      message: text,
      access_token: token
    });
    return res.data;
  } catch (err) {
    throw fmtError(err, "replyComment");
  }
}

export default {
  createPost,
  createStory,
  getMediaInsights,
  listComments,
  replyComment
};
