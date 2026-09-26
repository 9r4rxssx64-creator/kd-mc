/**
 * apex-modules/credentials.js
 *
 * Module ES6 — Reconnaissance auto credentials (30+ services courants).
 * Pure functions, no global access.
 *
 * Tests : tests/apex-modules-credentials.test.js
 */

"use strict";

/* ============================================================
   AX_CREDENTIAL_PATTERNS — Regex par service
   ============================================================ */

export const PATTERNS = {
  anthropic_key: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/,
  openai_key:    /^sk-[A-Za-z0-9]{40,}$/,
  openai_proj:   /^sk-proj-[A-Za-z0-9_-]{40,}$/,
  google_api:    /^AIza[A-Za-z0-9_-]{33}$/,
  github_pat:    /^ghp_[A-Za-z0-9]{36}$/,
  github_fine:   /^github_pat_[A-Za-z0-9_]{82,}$/,
  stripe_sk_live:/^sk_live_[A-Za-z0-9]{24,}$/,
  stripe_sk_test:/^sk_test_[A-Za-z0-9]{24,}$/,
  stripe_pk_live:/^pk_live_[A-Za-z0-9]{24,}$/,
  stripe_pk_test:/^pk_test_[A-Za-z0-9]{24,}$/,
  brevo:         /^xkeysib-[a-f0-9]+-[A-Za-z0-9]+$/,
  resend:        /^re_[A-Za-z0-9_]+$/,
  groq:          /^gsk_[A-Za-z0-9]+$/,
  perplexity:    /^pplx-[A-Za-z0-9]+$/,
  deepl:         /^[a-f0-9-]{36}:fx$/,
  airtable_pat:  /^pat[A-Za-z0-9.]+$/,
  notion:        /^secret_[A-Za-z0-9]+$/,
  replicate:     /^r8_[A-Za-z0-9]+$/,
  slack_bot:     /^xox[bp]-[A-Za-z0-9-]+$/,
  telegram_bot:  /^\d{8,}:[A-Za-z0-9_-]{35}$/,
  aws_key:       /^AKIA[0-9A-Z]{16}$/,
  openrouter:    /^sk-or-v1-[A-Za-z0-9]+$/,
  mistral:       /^[A-Za-z0-9]{32}$/,
  /* identifiants non-token */
  email:         /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i,
  iban:          /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/,
  bic:           /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/,
  siret:         /^\d{14}$/,
  vat_eu:        /^[A-Z]{2}\d{8,12}$/,
  phone_fr:      /^(\+?33|0)[1-9]\d{8}$/,
  phone_monaco:  /^\+?377\d{8}$/,
  btc_addr:      /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/,
  eth_addr:      /^0x[a-fA-F0-9]{40}$/,
  /* DANGER : detect mais NE PAS stocker */
  card_pan:      /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
  seed_phrase_12:/^(\w+\s){11}\w+$/,
  seed_phrase_24:/^(\w+\s){23}\w+$/
};

/* ============================================================
   SERVICE REGISTRY — métadonnées par type
   ============================================================ */

export const REGISTRY = {
  anthropic_key: { service: "Anthropic", store_key: "ax_anthropic_key", dashboard: "https://console.anthropic.com", billing: "https://console.anthropic.com/settings/billing", docs: "https://docs.anthropic.com" },
  openai_key:    { service: "OpenAI", store_key: "ax_openai_key", dashboard: "https://platform.openai.com", billing: "https://platform.openai.com/account/billing", docs: "https://platform.openai.com/docs" },
  google_api:    { service: "Google Cloud", store_key: "ax_google_api_key", dashboard: "https://console.cloud.google.com" },
  github_pat:    { service: "GitHub", store_key: "ax_gh_pat", dashboard: "https://github.com/settings/tokens" },
  github_fine:   { service: "GitHub fine-grained", store_key: "ax_gh_pat", dashboard: "https://github.com/settings/tokens?type=beta" },
  stripe_sk_live:{ service: "Stripe (live)", store_key: "ax_stripe_sk_live", dashboard: "https://dashboard.stripe.com" },
  brevo:         { service: "Brevo", store_key: "ax_brevo_key", dashboard: "https://app.brevo.com" },
  resend:        { service: "Resend", store_key: "ax_resend_key", dashboard: "https://resend.com/overview" },
  groq:          { service: "Groq", store_key: "ax_groq_key", dashboard: "https://console.groq.com" },
  aws_key:       { service: "AWS", store_key: "ax_aws_access_key", dashboard: "https://console.aws.amazon.com" },
  openrouter:    { service: "OpenRouter", store_key: "ax_openrouter_key", dashboard: "https://openrouter.ai/keys" },
  card_pan:      { service: "Carte bancaire", store_key: null, category: "DANGER", warn: "Apex ne stocke JAMAIS de CB. Utilise Stripe Checkout / Apple Pay." },
  seed_phrase_12:{ service: "Seed phrase 12 mots", store_key: null, category: "DANGER", warn: "Hardware wallet obligatoire." },
  seed_phrase_24:{ service: "Seed phrase 24 mots", store_key: null, category: "DANGER", warn: "Hardware wallet obligatoire." }
};

/* ============================================================
   IDENTIFY — match value contre PATTERNS
   ============================================================ */

/**
 * Identify credential type from raw value.
 * Returns { type, info } or null.
 */
export function identify(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (v.length < 6) return null;
  const candidates = [];
  for (const type of Object.keys(PATTERNS)) {
    try {
      if (PATTERNS[type].test(v)) {
        candidates.push({ type, info: REGISTRY[type] || { service: type } });
      }
    } catch (_e) {}
  }
  if (!candidates.length) return null;
  /* Prefer with store_key + service */
  candidates.sort((a, b) => {
    const sa = (a.info.store_key ? 2 : 0) + (a.info.service ? 1 : 0);
    const sb = (b.info.store_key ? 2 : 0) + (b.info.service ? 1 : 0);
    return sb - sa;
  });
  return candidates[0];
}

/* ============================================================
   LINKS AUTO-CREATE — patterns standards par service
   ============================================================ */

export const LINK_PATTERNS = [
  { tpl: "https://console.{s}.com", role: "dashboard" },
  { tpl: "https://app.{s}.com", role: "dashboard" },
  { tpl: "https://dashboard.{s}.com", role: "dashboard" },
  { tpl: "https://{s}.com/account/billing", role: "billing" },
  { tpl: "https://{s}.com/billing", role: "billing" },
  { tpl: "https://docs.{s}.com", role: "docs" },
  { tpl: "https://{s}.com/docs", role: "docs" },
  { tpl: "https://api.{s}.com/docs", role: "docs" },
  { tpl: "https://status.{s}.com", role: "status" },
  { tpl: "https://{s}.com/support", role: "support" }
];

/**
 * Generate URLs from service slug using standard patterns.
 * Pure : ne fait pas le HEAD test.
 */
export function generateLinkURLs(serviceName, knownLinks) {
  if (!serviceName) return {};
  const slug = serviceName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const links = {};
  /* Known first */
  if (knownLinks) {
    for (const role of Object.keys(knownLinks)) {
      if (knownLinks[role]) links[role] = { url: knownLinks[role], source: "known" };
    }
  }
  /* Then patterns */
  for (const p of LINK_PATTERNS) {
    if (!links[p.role]) {
      links[p.role] = { url: p.tpl.replace("{s}", slug), source: "pattern" };
    }
  }
  return links;
}

export const VERSION = "1.0.0";
