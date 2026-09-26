/**
 * AI Safety — Détection jailbreak (regex patterns + scoring)
 *
 * Mirroir typé de window.axDetectJailbreak (apex-ai/index.html v12.538).
 */

export interface JailbreakResult {
  jailbreak: boolean;
  pattern?: string;
}

const JAILBREAK_PATTERNS: Array<{ p: RegExp; name: string }> = [
  { p: /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|prompts|rules)/i, name: "ignore_instructions" },
  { p: /(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(?:an?\s+)?(?:dan|jailbroken|unrestricted|evil|uncensored)/i, name: "persona_override" },
  { p: /(?:disregard|forget|bypass|override)\s+(?:your\s+)?(?:safety|guidelines|rules|filters|restrictions)/i, name: "safety_bypass" },
  { p: /\b(?:dan|developer\s+mode|sudo\s+mode|jailbreak\s+mode|god\s+mode)\b/i, name: "known_jailbreak" },
  { p: /(?:reveal|show|print|display)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|hidden\s+rules)/i, name: "prompt_extraction" },
  { p: /<\|.*?(?:system|admin|root|sudo).*?\|>/i, name: "injection_token" },
  { p: /```\s*(?:system|admin|root)\s*\n/i, name: "fence_injection" }
];

export function detectJailbreak(text: string): JailbreakResult {
  if (!text || typeof text !== "string") return { jailbreak: false };
  for (const { p, name } of JAILBREAK_PATTERNS) {
    if (p.test(text)) return { jailbreak: true, pattern: name };
  }
  return { jailbreak: false };
}

export const PERSONA_WHITELIST = [
  "assistant", "admin", "kevin", "laurence", "child_safe",
  "pro_juriste", "pro_finance", "pro_medecin", "pro_cuisine",
  "pro_archi", "pro_translator", "pro_admin"
] as const;

export type PersonaName = typeof PERSONA_WHITELIST[number];

export function validatePersona(persona: string): PersonaName {
  if (!persona || typeof persona !== "string") return "assistant";
  const p = persona.toLowerCase().trim();
  return (PERSONA_WHITELIST as readonly string[]).includes(p) ? (p as PersonaName) : "assistant";
}
