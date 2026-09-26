/**
 * apex-modules/security.js
 *
 * Module ES6 helpers sécurité PURS (no side effects, no global K/A access).
 * Extrait du monolithe index.html v12.578 pour Phase 4 modular refactor.
 *
 * Importable via :
 *   <script type="module">
 *     import * as ApexSecurity from './modules/security.js';
 *     window.ApexSecurity = ApexSecurity;
 *   </script>
 *
 * Tests : tests/apex-modules-security.test.js
 */

"use strict";

/* ============================================================
   SANITIZE — Anti-XSS
   ============================================================ */

const DANGEROUS_TAGS = ["script","iframe","object","embed","link","meta"];
const DANGEROUS_PROTO = /^(?:javascript|data|vbscript|file):/i;

/**
 * Strip dangerous HTML tags + event handlers + protocols.
 * Fallback si DOMPurify pas disponible.
 */
export function sanitizeHTMLStrict(html) {
  if (typeof html !== "string") return html;
  let out = html;
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<iframe\b[\s\S]*?(<\/iframe>|\/?>)/gi, "");
  out = out.replace(/<object\b[\s\S]*?(<\/object>|\/?>)/gi, "");
  out = out.replace(/<embed\b[^>]*\/?>/gi, "");
  out = out.replace(/<link\b[^>]*rel\s*=\s*["']?import["']?[^>]*>/gi, "");
  out = out.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
  out = out.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/javascript\s*:/gi, "blocked:");
  out = out.replace(/data\s*:\s*text\/html/gi, "blocked:text/html");
  out = out.replace(/vbscript\s*:/gi, "blocked:");
  return out;
}

/**
 * Heuristique : détecte si HTML est probablement dangereux.
 * Rapide pour skip sanitize si propre.
 */
export function looksDangerous(html) {
  if (typeof html !== "string" || html.length < 6) return false;
  return /<script\b|<iframe\b|<object\b|<embed\b|on\w+\s*=|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/i.test(html);
}

/**
 * Validate URL pour href : reject javascript:/data:/etc.
 */
export function isSafeURL(url) {
  if (typeof url !== "string") return false;
  if (DANGEROUS_PROTO.test(url.trim())) return false;
  return true;
}

/* ============================================================
   REDACT — Anti-leak tokens dans logs/error
   ============================================================ */

const REDACT_PATTERNS = [
  { name: "anthropic", re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/g, replacement: "[REDACT_ANTHROPIC]" },
  { name: "openai", re: /sk-[A-Za-z0-9]{40,}/g, replacement: "[REDACT_OPENAI]" },
  { name: "openai_proj", re: /sk-proj-[A-Za-z0-9_-]{40,}/g, replacement: "[REDACT_OPENAI_PROJ]" },
  { name: "google", re: /AIza[A-Za-z0-9_-]{33}/g, replacement: "[REDACT_GOOGLE]" },
  { name: "github_pat", re: /ghp_[A-Za-z0-9]{36}/g, replacement: "[REDACT_GHPAT]" },
  { name: "github_fine", re: /github_pat_[A-Za-z0-9_]{82,}/g, replacement: "[REDACT_GHFINE]" },
  { name: "stripe", re: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g, replacement: "[REDACT_STRIPE]" },
  { name: "brevo", re: /xkeysib-[a-f0-9]+-[A-Za-z0-9]+/g, replacement: "[REDACT_BREVO]" },
  { name: "resend", re: /re_[A-Za-z0-9_]{20,}/g, replacement: "[REDACT_RESEND]" },
  { name: "groq", re: /gsk_[A-Za-z0-9]{40,}/g, replacement: "[REDACT_GROQ]" },
  { name: "aws", re: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACT_AWS]" },
  { name: "iban", re: /[A-Z]{2}\d{2}[A-Z0-9]{10,30}/g, replacement: "[REDACT_IBAN]" },
  { name: "card_pan", re: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g, replacement: "[REDACT_CARD]" }
];

/**
 * Redact secrets in text (for logs, error messages, telemetry).
 */
export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const p of REDACT_PATTERNS) {
    out = out.replace(p.re, p.replacement);
  }
  return out;
}

/* ============================================================
   JAILBREAK DETECTION
   ============================================================ */

const JAILBREAK_PATTERNS = [
  { name: "ignore_instructions", re: /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?)/i },
  { name: "dan_persona", re: /you\s+are\s+now\s+(?:DAN|ChatGPT\s+jailbroken|do\s+anything\s+now)/i },
  { name: "pretend_human", re: /pretend\s+(?:to\s+be|you\s+are)\s+(?:not\s+an?\s+AI|a\s+human|without\s+restrictions)/i },
  { name: "no_rules", re: /act\s+as\s+(?:if|though)\s+you\s+(?:have\s+no|don'?t\s+have)\s+(?:rules|guidelines|safety)/i },
  { name: "new_instructions", re: /your\s+new\s+(?:instructions?|system\s+prompt|role)\s+(?:is|are)/i },
  { name: "forget_above", re: /forget\s+(?:everything|all)\s+(?:above|before|prior)/i },
  { name: "tag_inject", re: /<\/?(?:system|user|assistant)>/i },
  { name: "bracket_inject", re: /\[(?:system|admin|root)\]/i },
  { name: "safety_bypass", re: /disregard\s+(?:your\s+)?(?:safety|guidelines|rules|restrictions)/i },
  { name: "prompt_extraction", re: /(?:reveal|show|tell\s+me|leak|expose)\s+(?:your\s+)?(?:system\s+prompt|instructions|hidden\s+context)/i }
];

/**
 * Detect jailbreak attempts in user input.
 * Returns { jailbreak: bool, pattern: name, match: matched_text } or { jailbreak: false }.
 */
export function detectJailbreak(text) {
  if (typeof text !== "string" || !text) return { jailbreak: false };
  for (const p of JAILBREAK_PATTERNS) {
    const m = text.match(p.re);
    if (m) return { jailbreak: true, pattern: p.name, match: m[0].slice(0, 100) };
  }
  return { jailbreak: false };
}

/* ============================================================
   HASH SHA-256 (for audit chain)
   ============================================================ */

/**
 * Hash a string with SHA-256, return 32 hex chars (truncated).
 * Async (uses crypto.subtle).
 */
export async function hashSHA256(str) {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "NO_CRYPTO_" + Date.now();
  }
  try {
    const enc = new TextEncoder().encode(String(str));
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch (e) {
    return "ERR_" + Date.now();
  }
}

/* ============================================================
   AUDIT IMMUTABLE CHAIN
   ============================================================ */

/**
 * Append entry to immutable chain (SHA-256 prev_hash → hash).
 * Caller provides storage (read/write).
 */
export async function auditAppendImmutable(action, details, storage) {
  if (!storage || typeof storage.read !== "function" || typeof storage.write !== "function") {
    throw new Error("storage with read/write required");
  }
  const log = (await storage.read()) || [];
  const prevHash = log.length ? log[log.length - 1].hash : "0000000000000000";
  const entry = {
    id: log.length + 1,
    ts: Date.now(),
    action: String(action || "unknown").slice(0, 100),
    details: String(details || "").slice(0, 500),
    prev_hash: prevHash
  };
  entry.hash = await hashSHA256(JSON.stringify(entry));
  log.push(entry);
  if (log.length > 1000) log.splice(0, log.length - 1000);
  await storage.write(log);
  return entry;
}

/**
 * Verify audit chain integrity. Returns { ok, total, tampered: [...] }.
 */
export async function auditVerifyChain(storage) {
  if (!storage || typeof storage.read !== "function") return { ok: false, error: "no_storage" };
  const log = (await storage.read()) || [];
  const tampered = [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const expectedPrev = i === 0 ? "0000000000000000" : log[i - 1].hash;
    if (e.prev_hash !== expectedPrev) {
      tampered.push({ index: i, type: "chain_broken", expected: expectedPrev, got: e.prev_hash });
      continue;
    }
    const clone = { id: e.id, ts: e.ts, action: e.action, details: e.details, prev_hash: e.prev_hash };
    const expectedHash = await hashSHA256(JSON.stringify(clone));
    if (e.hash !== expectedHash) {
      tampered.push({ index: i, type: "hash_mismatch", expected: expectedHash, got: e.hash });
    }
  }
  return { ok: tampered.length === 0, total: log.length, tampered };
}

/* ============================================================
   VERSION INFO
   ============================================================ */

export const VERSION = "1.0.0";
export const APEX_MIN_VER = "v12.580";
