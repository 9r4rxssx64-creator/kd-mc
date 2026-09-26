/**
 * apex-modules/ai-safety.js
 *
 * Module ES6 — AI Safety helpers (confidence calibration, prompt injection guard,
 * tool whitelist, refusal calibration, citation enforcement).
 */

"use strict";

/* ============================================================
   CONFIDENCE CALIBRATION
   ============================================================ */

/**
 * Detect hedge words in response (indicates uncertainty already expressed).
 */
export function hasHedgeWords(text) {
  if (typeof text !== "string") return false;
  return /je\s+crois|peut[\s-]?etre|probablement|sans\s+garantie|environ|approximativement|approximate|i\s+think|likely|probably|maybe|perhaps/gi.test(text);
}

/**
 * Calibrate confidence : add hedge if low confidence detected.
 * opts.factual_question, opts.short_response_threshold (default 30)
 */
export function calibrateConfidence(response, opts = {}) {
  if (typeof response !== "string") return response;
  if (hasHedgeWords(response)) return response;
  const threshold = opts.short_response_threshold || 30;
  if (opts.factual_question && response.length < threshold) {
    return response + "\n\n_(Vérifie cette info — ma confiance est faible)_";
  }
  return response;
}

/* ============================================================
   PROMPT INJECTION GUARD
   ============================================================ */

const INJECTION_PATTERNS = [
  /\[\[\s*SYSTEM\s*\]\]/i,
  /<\|system\|>/i,
  /<\|im_start\|>/i,
  /\[INST\][\s\S]*?\[\/INST\]/i,
  /###\s*Instruction/i,
  /system\s*:\s*you\s+are\s+now/i,
  /\\nSystem:\s*/i
];

/**
 * Detect prompt injection attempts (different from jailbreak).
 */
export function detectPromptInjection(text) {
  if (typeof text !== "string" || !text) return { injection: false };
  for (let i = 0; i < INJECTION_PATTERNS.length; i++) {
    const m = text.match(INJECTION_PATTERNS[i]);
    if (m) return { injection: true, pattern_idx: i, match: m[0].slice(0, 100) };
  }
  return { injection: false };
}

/**
 * Sanitize user input before injecting into prompt template.
 * Strips system tags + escape special prompt markers.
 */
export function sanitizePromptInput(text) {
  if (typeof text !== "string") return text;
  let out = text;
  out = out.replace(/<\|[a-z_]+\|>/gi, ""); /* Remove ChatML markers */
  out = out.replace(/\[\[\s*(?:SYSTEM|ADMIN|ROOT)\s*\]\]/gi, ""); /* Remove injection brackets */
  out = out.replace(/\[INST\]/gi, "[USER_INST]");
  out = out.replace(/\[\/INST\]/gi, "[/USER_INST]");
  return out;
}

/* ============================================================
   TOOL WHITELIST
   ============================================================ */

/**
 * Validate tool call against whitelist.
 * Returns { allowed, reason }.
 */
export function validateToolCall(toolName, allowedTools, opts = {}) {
  if (!toolName) return { allowed: false, reason: "no_tool_name" };
  if (!Array.isArray(allowedTools)) return { allowed: false, reason: "no_whitelist" };
  if (!allowedTools.includes(toolName)) {
    return { allowed: false, reason: "not_whitelisted", attempted: toolName };
  }
  /* Rate-limit per turn */
  if (opts.callsThisTurn !== undefined && opts.maxCallsPerTurn !== undefined) {
    if (opts.callsThisTurn >= opts.maxCallsPerTurn) {
      return { allowed: false, reason: "rate_limit_exceeded", limit: opts.maxCallsPerTurn };
    }
  }
  return { allowed: true };
}

/* ============================================================
   REFUSAL CALIBRATION
   ============================================================ */

/**
 * Detect over-cautious refusals on benign requests.
 * Returns suggestion.
 */
export function shouldRevisit(response, prompt) {
  if (typeof response !== "string") return false;
  const refusalSignals = /je\s+ne\s+peux\s+pas|i\s+can'?t|i'?m\s+not\s+able|je\s+ne\s+suis\s+pas\s+autorise|cannot\s+(?:provide|help|assist)/i;
  if (!refusalSignals.test(response)) return false;
  /* Si prompt parle de cuisine, météo, traduction → refus suspect */
  const benignTopics = /recette|cuisine|meteo|traduction|translate|calculer|grammaire|orthographe|definition/i;
  if (typeof prompt === "string" && benignTopics.test(prompt)) {
    return { likely_overrefusal: true, topic: "benign_request" };
  }
  return false;
}

/* ============================================================
   CITATION ENFORCEMENT (sources Légifrance/Vidal/etc.)
   ============================================================ */

const KNOWN_SOURCES = [
  "legifrance.gouv.fr", "service-public.fr", "service-public.gouv.fr",
  "courdecassation.fr", "conseil-etat.fr", "curia.europa.eu", "echr.coe.int",
  "vidal.fr", "ansm.sante.fr", "has-sante.fr", "ameli.fr",
  "impots.gouv.fr", "urssaf.fr", "caf.fr", "pole-emploi.fr",
  "legimonaco.mc", "gouv.mc", "monaco.mc",
  "anthropic.com", "openai.com"
];

/**
 * Detect citations in response. Returns { has_citation, count, sources }.
 */
export function detectCitations(text) {
  if (typeof text !== "string") return { has_citation: false, count: 0 };
  const sources = [];
  for (const s of KNOWN_SOURCES) {
    if (text.toLowerCase().indexOf(s) >= 0) sources.push(s);
  }
  return { has_citation: sources.length > 0, count: sources.length, sources };
}

export const VERSION = "1.0.0";
