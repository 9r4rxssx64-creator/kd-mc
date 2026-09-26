/**
 * Facebook Pages API — client CMCteams
 *
 * Variables d'environnement requises :
 *   - FB_PAGE_ID    : id numérique de la page Facebook
 *   - FB_PAGE_TOKEN : Page Access Token permanent (cf. setup.md)
 *
 * Optionnel :
 *   - FB_GRAPH_VERSION : version Graph API (défaut "v20.0")
 *
 * Toutes les fonctions sont async et retournent un objet JSON parsé.
 * En cas d'erreur HTTP ou métier, lèvent une Error avec message clair.
 */

import axios from "axios";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v20.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function getEnv() {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId) throw new Error("FB_PAGE_ID manquant dans l'environnement");
  if (!token) throw new Error("FB_PAGE_TOKEN manquant dans l'environnement");
  return { pageId, token };
}

function fmtError(err, context) {
  if (err.response && err.response.data && err.response.data.error) {
    const e = err.response.data.error;
    return new Error(`[FB ${context}] ${e.code}/${e.type} : ${e.message}`);
  }
  return new Error(`[FB ${context}] ${err.message || String(err)}`);
}

/**
 * Publie un post texte (avec image optionnelle) sur la page.
 * @param {string} message  Texte du post
 * @param {string} [imageUrl] URL HTTPS publique d'une image (optionnel)
 * @returns {Promise<{id: string, post_id?: string}>}
 */
export async function createPost(message, imageUrl) {
  if (!message || typeof message !== "string") {
    throw new Error("createPost: 'message' doit être une chaîne non vide");
  }
  const { pageId, token } = getEnv();
  try {
    if (imageUrl) {
      // Post photo + caption
      const res = await axios.post(`${BASE}/${pageId}/photos`, {
        url: imageUrl,
        caption: message,
        access_token: token
      });
      return res.data;
    }
    // Post texte simple
    const res = await axios.post(`${BASE}/${pageId}/feed`, {
      message,
      access_token: token
    });
    return res.data;
  } catch (err) {
    throw fmtError(err, "createPost");
  }
}

/**
 * Récupère les insights de la page.
 * @param {string[]} metrics  Ex: ["page_impressions","page_engaged_users","page_fans"]
 * @param {object} [opts]
 * @param {string} [opts.period="day"]      "day" | "week" | "days_28"
 * @param {string} [opts.since]             ISO date (optionnel)
 * @param {string} [opts.until]             ISO date (optionnel)
 * @returns {Promise<object>}
 */
export async function getPageInsights(metrics, opts = {}) {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error("getPageInsights: 'metrics' doit être un tableau non vide");
  }
  const { pageId, token } = getEnv();
  const params = {
    metric: metrics.join(","),
    period: opts.period || "day",
    access_token: token
  };
  if (opts.since) params.since = opts.since;
  if (opts.until) params.until = opts.until;
  try {
    const res = await axios.get(`${BASE}/${pageId}/insights`, { params });
    return res.data;
  } catch (err) {
    throw fmtError(err, "getPageInsights");
  }
}

/**
 * Liste les conversations (Messenger) avec messages non-lus.
 * @param {number} [limit=25]
 * @returns {Promise<Array<{id:string, snippet:string, unread_count:number, updated_time:string}>>}
 */
export async function listUnreadMessages(limit = 25) {
  const { pageId, token } = getEnv();
  try {
    const res = await axios.get(`${BASE}/${pageId}/conversations`, {
      params: {
        fields: "id,snippet,unread_count,updated_time,participants",
        limit,
        access_token: token
      }
    });
    const all = (res.data && res.data.data) || [];
    return all.filter((c) => (c.unread_count || 0) > 0);
  } catch (err) {
    throw fmtError(err, "listUnreadMessages");
  }
}

/**
 * Répond à une conversation Messenger.
 * @param {string} conversationId  id de la conversation (obtenu via listUnreadMessages)
 * @param {string} text            Message à envoyer
 * @returns {Promise<{message_id:string}>}
 */
export async function replyToMessage(conversationId, text) {
  if (!conversationId) throw new Error("replyToMessage: 'conversationId' requis");
  if (!text) throw new Error("replyToMessage: 'text' requis");
  const { token } = getEnv();
  try {
    // 1) Récupérer le PSID (recipient) à partir de la conversation
    const conv = await axios.get(`${BASE}/${conversationId}`, {
      params: { fields: "participants", access_token: token }
    });
    const parts = (conv.data && conv.data.participants && conv.data.participants.data) || [];
    const recipient = parts.find((p) => p.id && p.id !== process.env.FB_PAGE_ID);
    if (!recipient) throw new Error("recipient introuvable dans la conversation");

    // 2) Envoyer via Send API
    const res = await axios.post(`${BASE}/me/messages`, {
      recipient: { id: recipient.id },
      message: { text },
      messaging_type: "RESPONSE",
      access_token: token
    });
    return res.data;
  } catch (err) {
    throw fmtError(err, "replyToMessage");
  }
}

export default {
  createPost,
  getPageInsights,
  listUnreadMessages,
  replyToMessage
};
