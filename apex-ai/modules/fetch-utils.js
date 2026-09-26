/**
 * apex-modules/fetch-utils.js
 *
 * Module ES6 — Fetch helpers (timeout, retry, redact).
 * No global state.
 */

"use strict";

import { redactSecrets } from "./security.js";

/* ============================================================
   Fetch with timeout (AbortController)
   ============================================================ */

export function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
  if (typeof AbortController === "undefined") {
    return fetch(url, opts);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

/* ============================================================
   Retry with exponential backoff
   ============================================================ */

export async function fetchWithRetry(url, opts = {}, retryOpts = {}) {
  const maxRetries = retryOpts.maxRetries || 3;
  const baseDelayMs = retryOpts.baseDelayMs || 1000;
  const timeoutMs = retryOpts.timeoutMs || 30000;
  const retryStatuses = retryOpts.retryStatuses || [500, 502, 503, 504, 429];
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetchWithTimeout(url, opts, timeoutMs);
      if (r.ok) return r;
      if (!retryStatuses.includes(r.status)) return r; /* don't retry 4xx (client errors) */
      lastError = new Error("HTTP " + r.status);
    } catch (e) {
      lastError = e;
    }
    if (attempt < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/* ============================================================
   Hosts that should NOT have body redacted (API providers)
   ============================================================ */

export const SKIP_REDACT_HOSTS = [
  "api.anthropic.com",
  "api.openai.com",
  "api.x.ai",
  "generativelanguage.googleapis.com",
  "api.groq.com",
  "openrouter.ai",
  "api.cohere",
  "api.deepseek.com",
  "api.perplexity.ai",
  "api.mistral.ai",
  "api.github.com",
  "api.cloudflare.com",
  "firebasedatabase.app",
  ".workers.dev",
  "api.stripe.com",
  "api.brevo.com",
  "api.resend.com"
];

export function shouldSkipRedact(url) {
  if (!url) return false;
  const u = String(url);
  for (const host of SKIP_REDACT_HOSTS) {
    if (u.indexOf(host) >= 0) return true;
  }
  return false;
}

/* ============================================================
   Fetch with body redaction (for non-API hosts)
   ============================================================ */

export async function fetchSafeRedact(url, opts = {}) {
  const init = { ...opts };
  if (!shouldSkipRedact(url) && init.body && typeof init.body === "string") {
    try { init.body = redactSecrets(init.body); } catch (_e) {}
  }
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e && e.message) e.message = redactSecrets(e.message);
    throw e;
  }
}

/* ============================================================
   HEAD test (for link validation, alive check)
   ============================================================ */

export async function isAlive(url, timeoutMs = 3000) {
  try {
    const r = await fetchWithTimeout(url, { method: "HEAD", mode: "no-cors" }, timeoutMs);
    return true;
  } catch (_e) {
    return false;
  }
}

export const VERSION = "1.0.0";
