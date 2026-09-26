/**
 * client.js — Module Telegram Bot (ES module)
 *
 * Exports :
 *   - sendMessage(text, opts={}) : envoyer un message texte
 *   - sendPhoto(filePath, caption) : envoyer une photo
 *   - sendDocument(filePath, caption) : envoyer un document (JSON, PDF, etc.)
 *   - onMessage(callback) : écouter les messages entrants (commandes)
 *   - escapeHtml(str) / escapeMarkdownV2(str) : helpers d'échappement
 *
 * Variables env requises :
 *   - TELEGRAM_BOT_TOKEN
 *   - TELEGRAM_CHAT_ID (chat par défaut pour sendMessage/sendPhoto/sendDocument)
 *
 * Auteur : Kevin DESARZENS (U11804) — projet KDMC
 */

import fs from "node:fs";
import TelegramBot from "node-telegram-bot-api";

let _bot = null;
let _polling = false;

/* ---------- Init lazy ---------- */

function _getBot(opts = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "Telegram : TELEGRAM_BOT_TOKEN manquant (voir setup.md)"
    );
  }
  if (!_bot) {
    // Polling activé seulement si onMessage() est appelé
    _bot = new TelegramBot(token, { polling: false });
  }
  return _bot;
}

function _getDefaultChatId() {
  const id = process.env.TELEGRAM_CHAT_ID;
  if (!id) {
    throw new Error(
      "Telegram : TELEGRAM_CHAT_ID manquant (voir setup.md)"
    );
  }
  return id;
}

/* ---------- Helpers d'échappement ---------- */

/**
 * Échappe une chaîne pour le mode HTML de Telegram.
 * Supporte : <b>, <i>, <u>, <s>, <code>, <pre>, <a href>
 */
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Échappe une chaîne pour MarkdownV2 (mode strict de Telegram).
 * Tous les caractères réservés doivent être préfixés par \
 */
export function escapeMarkdownV2(str) {
  if (str == null) return "";
  return String(str).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/* ---------- API publique ---------- */

/**
 * Envoie un message texte.
 * @param {string} text - Texte du message
 * @param {object} opts - Options Telegram (parse_mode, reply_markup, chat_id…)
 * @returns {Promise<object>} - Message envoyé
 */
export async function sendMessage(text, opts = {}) {
  if (text == null) throw new Error("Telegram sendMessage : text requis");
  try {
    const bot = _getBot();
    const chatId = opts.chat_id || _getDefaultChatId();
    const sendOpts = { ...opts };
    delete sendOpts.chat_id;
    return await bot.sendMessage(chatId, String(text), sendOpts);
  } catch (err) {
    throw new Error(`Telegram sendMessage : ${err.message}`);
  }
}

/**
 * Envoie une photo (chemin local ou URL).
 * @param {string} pathOrUrl - Chemin du fichier OU URL publique
 * @param {string} caption - Légende (optionnelle)
 * @param {object} opts - Options supplémentaires
 * @returns {Promise<object>}
 */
export async function sendPhoto(pathOrUrl, caption = "", opts = {}) {
  if (!pathOrUrl) throw new Error("Telegram sendPhoto : path/URL requis");
  try {
    const bot = _getBot();
    const chatId = opts.chat_id || _getDefaultChatId();
    const sendOpts = { caption, ...opts };
    delete sendOpts.chat_id;

    // Si chemin local : passer un stream pour éviter de tout charger en mémoire
    const isUrl = /^https?:\/\//i.test(pathOrUrl);
    const payload = isUrl ? pathOrUrl : fs.createReadStream(pathOrUrl);
    return await bot.sendPhoto(chatId, payload, sendOpts);
  } catch (err) {
    throw new Error(`Telegram sendPhoto : ${err.message}`);
  }
}

/**
 * Envoie un document (JSON, PDF, ZIP, etc.).
 * @param {string} filePath - Chemin local du fichier
 * @param {string} caption - Légende
 * @param {object} opts - Options
 * @returns {Promise<object>}
 */
export async function sendDocument(filePath, caption = "", opts = {}) {
  if (!filePath) throw new Error("Telegram sendDocument : filePath requis");
  try {
    const bot = _getBot();
    const chatId = opts.chat_id || _getDefaultChatId();
    const sendOpts = { caption, ...opts };
    delete sendOpts.chat_id;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Fichier introuvable : ${filePath}`);
    }
    const stream = fs.createReadStream(filePath);
    return await bot.sendDocument(chatId, stream, sendOpts);
  } catch (err) {
    throw new Error(`Telegram sendDocument : ${err.message}`);
  }
}

/**
 * Écoute les messages entrants. Démarre le polling si pas déjà actif.
 * Filtre par défaut : seuls les messages depuis TELEGRAM_CHAT_ID sont transmis
 * (sécurité — empêche n'importe qui d'envoyer des commandes).
 *
 * @param {function(msg)} callback - Reçoit l'objet message Telegram
 * @param {object} opts - { allowAnyChat: false }
 * @returns {function} - Fonction pour arrêter l'écoute
 */
export function onMessage(callback, opts = {}) {
  if (typeof callback !== "function") {
    throw new Error("Telegram onMessage : callback fonction requis");
  }
  const bot = _getBot();
  const allowedChatId = opts.allowAnyChat ? null : _getDefaultChatId();

  if (!_polling) {
    bot.startPolling().catch((err) => {
      console.error("Telegram polling error :", err.message);
    });
    _polling = true;
  }

  const handler = (msg) => {
    try {
      if (allowedChatId && String(msg.chat.id) !== String(allowedChatId)) {
        // Message hors chat autorisé — ignorer
        return;
      }
      callback(msg);
    } catch (err) {
      console.error("Telegram onMessage callback error :", err.message);
    }
  };

  bot.on("message", handler);

  // Retourne une fonction pour stopper le listener (pas le polling global)
  return () => {
    bot.removeListener("message", handler);
  };
}

/**
 * Arrête le polling (utile pour tests / scripts ponctuels).
 */
export async function stopPolling() {
  if (_bot && _polling) {
    await _bot.stopPolling();
    _polling = false;
  }
}

export default {
  sendMessage,
  sendPhoto,
  sendDocument,
  onMessage,
  stopPolling,
  escapeHtml,
  escapeMarkdownV2,
};
