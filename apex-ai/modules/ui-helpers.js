/**
 * apex-modules/ui-helpers.js
 *
 * Module ES6 — UI/DOM helpers (esc, format, classnames, etc.).
 * Pure functions.
 */

"use strict";

/* ============================================================
   ESCAPE HTML — XSS prevention
   ============================================================ */

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

export function escAttr(str) {
  return escHTML(str);
}

/* ============================================================
   FORMAT — Date, currency, duration
   ============================================================ */

export function formatDate(ts, locale = "fr-FR") {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(locale);
  } catch (_e) {
    return String(ts);
  }
}

export function formatRelativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "il y a " + sec + "s";
  const min = Math.floor(sec / 60);
  if (min < 60) return "il y a " + min + "min";
  const hr = Math.floor(min / 60);
  if (hr < 24) return "il y a " + hr + "h";
  const days = Math.floor(hr / 24);
  if (days < 30) return "il y a " + days + "j";
  const months = Math.floor(days / 30);
  if (months < 12) return "il y a " + months + " mois";
  return "il y a " + Math.floor(months / 12) + " an(s)";
}

export function formatCurrency(amount, currency = "EUR", locale = "fr-FR") {
  if (typeof amount !== "number") return "";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch (_e) {
    return amount + " " + currency;
  }
}

export function formatBytes(bytes) {
  if (typeof bytes !== "number") return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

/* ============================================================
   CLASSNAMES
   ============================================================ */

export function cx(...args) {
  return args.filter(Boolean).join(" ");
}

/* ============================================================
   TRUNCATE
   ============================================================ */

export function truncate(str, max = 100, suffix = "...") {
  if (typeof str !== "string") return "";
  if (str.length <= max) return str;
  return str.slice(0, max - suffix.length) + suffix;
}

/* ============================================================
   PARSE QUERY PARAMS
   ============================================================ */

export function parseQuery(search) {
  const params = {};
  if (!search) return params;
  const s = search.startsWith("?") ? search.slice(1) : search;
  for (const pair of s.split("&")) {
    const [k, v] = pair.split("=");
    if (k) params[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
  }
  return params;
}

export const VERSION = "1.0.0";
