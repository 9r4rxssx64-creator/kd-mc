/**
 * client.js — Module Gmail (ES module)
 *
 * Exports :
 *   - readRecentEmails(n=10) : liste les N derniers emails
 *   - sendEmail(to, subject, body, html=false) : envoie un email
 *   - searchEmails(query) : recherche Gmail (syntaxe Gmail standard)
 *   - markAsRead(messageId) : marque un email comme lu
 *
 * Authentification :
 *   - Variables env : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *   - Fallback : credentials.json + token.json dans ce dossier
 *
 * Auteur : Kevin DESARZENS (U11804) — projet KDMC
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

let _client = null;

/* ---------- Authentification (lazy + cached) ---------- */

async function _readJsonIfExists(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function _getAuthClient() {
  if (_client) return _client;

  let clientId = process.env.GMAIL_CLIENT_ID;
  let clientSecret = process.env.GMAIL_CLIENT_SECRET;
  let refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  // Fallback fichier si env vars absentes
  if (!clientId || !clientSecret) {
    const creds = await _readJsonIfExists(CREDENTIALS_PATH);
    const cfg = creds && (creds.installed || creds.web);
    if (cfg) {
      clientId = clientId || cfg.client_id;
      clientSecret = clientSecret || cfg.client_secret;
    }
  }

  if (!refreshToken) {
    const tok = await _readJsonIfExists(TOKEN_PATH);
    if (tok && tok.refresh_token) refreshToken = tok.refresh_token;
  }

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail : credentials manquants. Définir GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN " +
        "ou créer credentials.json + token.json (voir setup.md)"
    );
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  _client = google.gmail({ version: "v1", auth: oAuth2Client });
  return _client;
}

/* ---------- Helpers internes ---------- */

function _findHeader(headers, name) {
  if (!headers) return "";
  const h = headers.find((x) => x.name && x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function _toBase64Url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function _buildRawEmail(to, subject, body, html) {
  // Encoder le sujet en UTF-8 pour supporter les accents (RFC 2047)
  const encodedSubject = "=?UTF-8?B?" + Buffer.from(subject, "utf8").toString("base64") + "?=";
  const contentType = html
    ? 'text/html; charset="UTF-8"'
    : 'text/plain; charset="UTF-8"';

  const lines = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}`,
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ];
  return _toBase64Url(lines.join("\r\n"));
}

/* ---------- API publique ---------- */

/**
 * Liste les N derniers emails de la boîte de réception.
 * @param {number} n - Nombre d'emails (défaut 10, max 100)
 * @returns {Promise<Array<{id, threadId, from, to, subject, date, snippet, unread}>>}
 */
export async function readRecentEmails(n = 10) {
  try {
    const gmail = await _getAuthClient();
    const max = Math.min(Math.max(1, n), 100);

    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: max,
      labelIds: ["INBOX"],
    });

    const messages = list.data.messages || [];
    const results = await Promise.all(
      messages.map(async (m) => {
        const det = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = det.data.payload && det.data.payload.headers;
        return {
          id: det.data.id,
          threadId: det.data.threadId,
          from: _findHeader(headers, "From"),
          to: _findHeader(headers, "To"),
          subject: _findHeader(headers, "Subject"),
          date: _findHeader(headers, "Date"),
          snippet: det.data.snippet || "",
          unread: (det.data.labelIds || []).includes("UNREAD"),
        };
      })
    );
    return results;
  } catch (err) {
    throw new Error(`Gmail readRecentEmails : ${err.message}`);
  }
}

/**
 * Envoie un email.
 * @param {string} to - Destinataire (format "name@example.com" ou "Nom <name@example.com>")
 * @param {string} subject - Sujet (UTF-8 supporté)
 * @param {string} body - Corps du message
 * @param {boolean} html - Si true, body est traité comme HTML
 * @returns {Promise<{id, threadId}>}
 */
export async function sendEmail(to, subject, body, html = false) {
  if (!to || !subject || body == null) {
    throw new Error("Gmail sendEmail : to, subject, body requis");
  }
  try {
    const gmail = await _getAuthClient();
    const raw = _buildRawEmail(to, subject, body, html);
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return { id: res.data.id, threadId: res.data.threadId };
  } catch (err) {
    throw new Error(`Gmail sendEmail : ${err.message}`);
  }
}

/**
 * Recherche d'emails avec la syntaxe Gmail.
 * Exemples : "from:sbm.mc subject:planning", "is:unread newer_than:7d", "has:attachment"
 * @param {string} query
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export async function searchEmails(query, maxResults = 20) {
  if (!query) throw new Error("Gmail searchEmails : query requis");
  try {
    const gmail = await _getAuthClient();
    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(Math.max(1, maxResults), 100),
    });
    const messages = list.data.messages || [];
    const results = await Promise.all(
      messages.map(async (m) => {
        const det = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = det.data.payload && det.data.payload.headers;
        return {
          id: det.data.id,
          threadId: det.data.threadId,
          from: _findHeader(headers, "From"),
          subject: _findHeader(headers, "Subject"),
          date: _findHeader(headers, "Date"),
          snippet: det.data.snippet || "",
          unread: (det.data.labelIds || []).includes("UNREAD"),
        };
      })
    );
    return results;
  } catch (err) {
    throw new Error(`Gmail searchEmails : ${err.message}`);
  }
}

/**
 * Marque un message comme lu (retire le label UNREAD).
 * @param {string} messageId
 * @returns {Promise<{id, success}>}
 */
export async function markAsRead(messageId) {
  if (!messageId) throw new Error("Gmail markAsRead : messageId requis");
  try {
    const gmail = await _getAuthClient();
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
    return { id: messageId, success: true };
  } catch (err) {
    throw new Error(`Gmail markAsRead : ${err.message}`);
  }
}

export default { readRecentEmails, sendEmail, searchEmails, markAsRead };
