/**
 * apex-modules/ai-providers.js
 *
 * Module ES6 — AI provider chain (failover, model picker, cost estimation).
 * Pure config + pure functions.
 */

"use strict";

/* ============================================================
   PROVIDER REGISTRY
   ============================================================ */

export const PROVIDERS = {
  anthropic: {
    name: "Anthropic Claude",
    api_url: "https://api.anthropic.com/v1/messages",
    key_storage: "ax_anthropic_key",
    default_model: "claude-sonnet-4-6",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
    free_tier: false,
    priority: 1
  },
  groq: {
    name: "Groq Cloud",
    api_url: "https://api.groq.com/openai/v1/chat/completions",
    key_storage: "ax_groq_key",
    default_model: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    cost_per_1k_input: 0,
    cost_per_1k_output: 0,
    free_tier: true,
    priority: 2
  },
  openai: {
    name: "OpenAI",
    api_url: "https://api.openai.com/v1/chat/completions",
    key_storage: "ax_openai_key",
    default_model: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o1-mini"],
    cost_per_1k_input: 0.0025,
    cost_per_1k_output: 0.01,
    free_tier: false,
    priority: 3
  },
  gemini: {
    name: "Google Gemini",
    api_url: "https://generativelanguage.googleapis.com/v1beta/models",
    key_storage: "ax_gemini_key",
    default_model: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    cost_per_1k_input: 0.00125,
    cost_per_1k_output: 0.005,
    free_tier: true, /* 1500 req/day free */
    priority: 4
  },
  openrouter: {
    name: "OpenRouter",
    api_url: "https://openrouter.ai/api/v1/chat/completions",
    key_storage: "ax_openrouter_key",
    default_model: "auto",
    models: ["auto", "anthropic/claude-sonnet-4.5"],
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
    free_tier: false,
    priority: 5
  }
};

/* ============================================================
   FAILOVER CHAIN — order by priority, filter by available keys
   ============================================================ */

/**
 * Build failover chain : list providers with available API keys, sorted by priority.
 */
export function buildFailoverChain(availableKeys) {
  const out = [];
  for (const id of Object.keys(PROVIDERS)) {
    const p = PROVIDERS[id];
    if (availableKeys.includes(p.key_storage)) {
      out.push({ id, ...p });
    }
  }
  out.sort((a, b) => a.priority - b.priority);
  return out;
}

/* ============================================================
   MODEL PICKER — choose cheapest provider with required model
   ============================================================ */

/**
 * Pick cheapest available provider (priority free tier).
 */
export function pickCheapest(availableKeys) {
  const chain = buildFailoverChain(availableKeys);
  /* Priority free_tier first */
  const free = chain.filter((p) => p.free_tier);
  if (free.length) return free[0];
  /* Sort by cost */
  chain.sort((a, b) => a.cost_per_1k_input - b.cost_per_1k_input);
  return chain[0] || null;
}

/* ============================================================
   COST ESTIMATION
   ============================================================ */

/**
 * Estimate cost for a request (input/output tokens).
 */
export function estimateCost(provider, inputTokens, outputTokens) {
  if (!provider || !PROVIDERS[provider]) return 0;
  const p = PROVIDERS[provider];
  const inCost = (inputTokens / 1000) * p.cost_per_1k_input;
  const outCost = (outputTokens / 1000) * p.cost_per_1k_output;
  return inCost + outCost;
}

/* ============================================================
   PROMPT CACHING ELIGIBILITY (Anthropic-specific)
   ============================================================ */

/**
 * Determine if prompt caching should be used (system prompt > 2048 tokens estimated).
 */
export function shouldUseCaching(systemPromptText) {
  if (typeof systemPromptText !== "string") return false;
  /* Heuristique : 1 token ≈ 4 chars EN, 5 chars FR */
  const estimatedTokens = systemPromptText.length / 4;
  return estimatedTokens >= 2048;
}

export const VERSION = "1.0.0";
