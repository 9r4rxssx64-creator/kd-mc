/**
 * apex-modules/storage.js
 *
 * Module ES6 — Storage abstraction (localStorage + IDB shadow + queue).
 * Pure helpers (caller injects backend).
 */

"use strict";

/* ============================================================
   JSON-safe localStorage wrappers
   ============================================================ */

/**
 * Read JSON from localStorage with default fallback.
 */
export function readJSON(key, fallback) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    if (v === null || v === undefined) return fallback;
    return JSON.parse(v);
  } catch (_e) {
    return fallback;
  }
}

/**
 * Write JSON to localStorage. Returns true on success.
 */
export function writeJSON(key, value) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    /* QuotaExceededError or other */
    return false;
  }
}

/**
 * Remove key from localStorage.
 */
export function removeKey(key) {
  if (typeof localStorage === "undefined") return false;
  try { localStorage.removeItem(key); return true; } catch (_e) { return false; }
}

/* ============================================================
   Storage stats
   ============================================================ */

/**
 * Compute localStorage size in bytes (approximate).
 */
export function getLocalStorageSize() {
  if (typeof localStorage === "undefined") return 0;
  let total = 0;
  try {
    for (const k in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
        const v = localStorage.getItem(k) || "";
        total += (k.length + v.length) * 2; /* utf-16 char = 2 bytes */
      }
    }
  } catch (_e) {}
  return total;
}

/**
 * List all ax_* keys with sizes.
 */
export function listAxKeys() {
  if (typeof localStorage === "undefined") return [];
  const out = [];
  try {
    for (const k in localStorage) {
      if (!Object.prototype.hasOwnProperty.call(localStorage, k)) continue;
      if (k.indexOf("ax_") !== 0) continue;
      const v = localStorage.getItem(k) || "";
      out.push({ key: k, size: v.length });
    }
  } catch (_e) {}
  return out.sort((a, b) => b.size - a.size);
}

/* ============================================================
   FIFO cap helpers (logs, audit, message arrays)
   ============================================================ */

/**
 * Cap array to maxLen, drop oldest. Returns capped array.
 */
export function capArray(arr, maxLen) {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= maxLen) return arr;
  return arr.slice(-maxLen);
}

/**
 * Read array from key, push entry, cap, write back.
 */
export function appendCap(key, entry, maxLen = 500) {
  const arr = readJSON(key, []);
  if (!Array.isArray(arr)) return false;
  arr.push(entry);
  return writeJSON(key, capArray(arr, maxLen));
}

/* ============================================================
   Sync queue (offline writes to replay)
   ============================================================ */

const QUEUE_KEY = "ax_sync_queue";

export function queueAdd(operation) {
  const q = readJSON(QUEUE_KEY, []);
  q.push({ ...operation, queued_at: Date.now() });
  return writeJSON(QUEUE_KEY, capArray(q, 200));
}

export function queueDrain() {
  const q = readJSON(QUEUE_KEY, []);
  writeJSON(QUEUE_KEY, []);
  return q;
}

export function queueSize() {
  return readJSON(QUEUE_KEY, []).length;
}

export const VERSION = "1.0.0";
