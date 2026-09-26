/**
 * apex-modules/crypto-vault.js
 *
 * Module ES6 — AES-GCM 256 + PBKDF2 100k iterations.
 * Pure crypto helpers (no global state).
 */

"use strict";

const PBKDF2_ITERATIONS = 100000;
const SALT_LEN = 16;
const IV_LEN = 12;

/* ============================================================
   Encrypt with passphrase (PBKDF2-derived key)
   ============================================================ */

export async function encryptWithPassphrase(plaintext, passphrase) {
  if (!plaintext || !passphrase) return null;
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("crypto.subtle unavailable");
  }
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(salt.length + iv.length + ct.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ct), salt.length + iv.length);
  return btoa(String.fromCharCode.apply(null, Array.from(combined)));
}

export async function decryptWithPassphrase(ciphertextB64, passphrase) {
  if (!ciphertextB64 || !passphrase) return null;
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("crypto.subtle unavailable");
  }
  try {
    const combined = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LEN);
    const iv = combined.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const ct = combined.slice(SALT_LEN + IV_LEN);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch (e) {
    return null;
  }
}

/* ============================================================
   Mask helpers (for UI display without revealing secret)
   ============================================================ */

export function maskSecret(value, opts = {}) {
  if (typeof value !== "string") return "***";
  const visiblePrefix = opts.visiblePrefix || 4;
  const visibleSuffix = opts.visibleSuffix || 4;
  if (value.length <= visiblePrefix + visibleSuffix) return "***";
  return value.slice(0, visiblePrefix) + "***" + value.slice(-visibleSuffix);
}

/* ============================================================
   Random tokens (UUID, nonces)
   ============================================================ */

export function randomNonce(byteLen = 16) {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    /* Fallback Math.random (non crypto-safe) */
    let s = "";
    for (let i = 0; i < byteLen; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
    return s;
  }
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function uuid4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  /* Fallback */
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const VERSION = "1.0.0";
export const PBKDF2_ITERATIONS_EXPORT = PBKDF2_ITERATIONS;
