/**
 * WhatsApp Business Cloud API — client CMCteams
 *
 * Variables d'environnement requises :
 *   - WA_ACCESS_TOKEN     : token permanent (cf. setup.md section 4)
 *   - WA_PHONE_NUMBER_ID  : id du numéro émetteur côté Meta
 *
 * Optionnel :
 *   - WA_VERIFY_TOKEN     : utilisé pour la vérification webhook entrant
 *   - FB_GRAPH_VERSION    : version Graph API (défaut "v20.0")
 *
 * Format des numéros destinataires : E.164 SANS le "+" ni espaces.
 *   ex : "33612345678", "37798062121"
 */

import axios from "axios";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v20.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function getEnv() {
  const token = process.env.WA_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  if (!token) throw new Error("WA_ACCESS_TOKEN manquant dans l'environnement");
  if (!phoneId) throw new Error("WA_PHONE_NUMBER_ID manquant dans l'environnement");
  return { token, phoneId };
}

function fmtError(err, context) {
  if (err.response && err.response.data && err.response.data.error) {
    const e = err.response.data.error;
    return new Error(`[WA ${context}] ${e.code}/${e.type || "?"} : ${e.message}`);
  }
  return new Error(`[WA ${context}] ${err.message || String(err)}`);
}

function normalizePhone(p) {
  if (!p) throw new Error("Numéro de téléphone requis");
  const clean = String(p).replace(/[^0-9]/g, "");
  if (clean.length < 8) throw new Error(`Numéro invalide : ${p}`);
  return clean;
}

async function _send(payload) {
  const { token, phoneId } = getEnv();
  const res = await axios.post(`${BASE}/${phoneId}/messages`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  return res.data;
}

/**
 * Envoie un message texte simple. Possible UNIQUEMENT dans la fenêtre 24h
 * de réponse à un message reçu de l'utilisateur. Hors fenêtre, utiliser
 * sendTemplate().
 *
 * @param {string} phoneNumber  format E.164 sans "+", ex : "33612345678"
 * @param {string} text         message (max 4096 caractères)
 * @returns {Promise<object>}
 */
export async function sendMessage(phoneNumber, text) {
  if (!text) throw new Error("sendMessage: 'text' requis");
  const to = normalizePhone(phoneNumber);
  try {
    return await _send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text }
    });
  } catch (err) {
    throw fmtError(err, "sendMessage");
  }
}

/**
 * Envoie un message template (approuvé par Meta).
 *
 * @param {string} phoneNumber
 * @param {string} templateName     ex : "confirmation_planning_fr"
 * @param {Array<string>} [variables]  valeurs de {{1}}, {{2}}, ...
 * @param {string} [languageCode="fr"]
 * @returns {Promise<object>}
 */
export async function sendTemplate(phoneNumber, templateName, variables = [], languageCode = "fr") {
  if (!templateName) throw new Error("sendTemplate: 'templateName' requis");
  const to = normalizePhone(phoneNumber);
  const components = [];
  if (Array.isArray(variables) && variables.length > 0) {
    components.push({
      type: "body",
      parameters: variables.map((v) => ({ type: "text", text: String(v) }))
    });
  }
  try {
    return await _send({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {})
      }
    });
  } catch (err) {
    throw fmtError(err, "sendTemplate");
  }
}

/**
 * Envoie un média (image, document, vidéo, audio) via URL publique.
 *
 * @param {string} phoneNumber
 * @param {string} mediaUrl   URL HTTPS publique
 * @param {"image"|"document"|"video"|"audio"} type
 * @param {object} [opts]
 * @param {string} [opts.caption]   pour image/video/document
 * @param {string} [opts.filename]  pour document
 * @returns {Promise<object>}
 */
export async function sendMedia(phoneNumber, mediaUrl, type, opts = {}) {
  if (!mediaUrl) throw new Error("sendMedia: 'mediaUrl' requis");
  const allowed = ["image", "document", "video", "audio"];
  if (!allowed.includes(type)) {
    throw new Error(`sendMedia: 'type' doit être ${allowed.join("|")}`);
  }
  const to = normalizePhone(phoneNumber);
  const mediaObj = { link: mediaUrl };
  if (opts.caption && (type === "image" || type === "video" || type === "document")) {
    mediaObj.caption = opts.caption;
  }
  if (opts.filename && type === "document") {
    mediaObj.filename = opts.filename;
  }
  try {
    return await _send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type,
      [type]: mediaObj
    });
  } catch (err) {
    throw fmtError(err, "sendMedia");
  }
}

/**
 * Parse un payload de webhook entrant WhatsApp et retourne les messages
 * et statuts dans un format exploitable.
 *
 * Le serveur HTTP qui appelle cette fonction est responsable de :
 *   - répondre 200 immédiatement à Meta (sous 5s)
 *   - vérifier la signature HMAC SHA256 (X-Hub-Signature-256) avec app_secret
 *   - gérer la requête GET de validation initiale (hub.challenge)
 *
 * @param {object} body  body JSON brut envoyé par Meta
 * @returns {{
 *   messages: Array<{from:string, id:string, timestamp:string, type:string, text?:string, raw:object}>,
 *   statuses: Array<{id:string, status:string, recipient:string, timestamp:string}>
 * }}
 */
export function receiveWebhook(body) {
  const out = { messages: [], statuses: [] };
  if (!body || body.object !== "whatsapp_business_account") return out;
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const ch of changes) {
      const value = ch.value || {};
      // Messages entrants
      const msgs = Array.isArray(value.messages) ? value.messages : [];
      for (const m of msgs) {
        out.messages.push({
          from: m.from,
          id: m.id,
          timestamp: m.timestamp,
          type: m.type,
          text: m.text && m.text.body ? m.text.body : undefined,
          raw: m
        });
      }
      // Statuts (delivered, read, sent, failed)
      const sts = Array.isArray(value.statuses) ? value.statuses : [];
      for (const s of sts) {
        out.statuses.push({
          id: s.id,
          status: s.status,
          recipient: s.recipient_id,
          timestamp: s.timestamp
        });
      }
    }
  }
  return out;
}

/**
 * Helper pour la validation initiale du webhook (handshake GET).
 * Exemple Express :
 *   app.get("/whatsapp/webhook", (req, res) => {
 *     const challenge = verifyWebhookHandshake(req.query);
 *     if (challenge) res.status(200).send(challenge);
 *     else res.sendStatus(403);
 *   });
 */
export function verifyWebhookHandshake(query) {
  const expected = process.env.WA_VERIFY_TOKEN;
  if (!expected) throw new Error("WA_VERIFY_TOKEN manquant pour la vérification webhook");
  if (
    query &&
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === expected
  ) {
    return query["hub.challenge"] || "";
  }
  return null;
}

export default {
  sendMessage,
  sendTemplate,
  sendMedia,
  receiveWebhook,
  verifyWebhookHandshake
};
