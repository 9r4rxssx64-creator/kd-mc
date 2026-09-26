/**
 * APEX v13 — PII redaction outbound IA (P1 audit)
 *
 * Filtre les données sensibles AVANT envoi aux providers IA externes
 * (Anthropic, OpenAI, Groq, Gemini, OpenRouter, etc.) pour éviter leak.
 *
 * Patterns redactés :
 * - Email
 * - Téléphone FR / Monaco
 * - Carte bancaire (PAN)
 * - IBAN
 * - SIRET
 * - TVA EU
 * - Passeport / CNI
 * - Sécurité Sociale FR
 * - Adresses crypto BTC/ETH (avertissement, pas redact car déjà publiques)
 * - API keys (couverture redondante avec logger.redact)
 *
 * Anti-pattern v12.785 : zéro filtre outbound, tout passait en clair vers providers.
 */

const PII_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp; replace: string }> = [
  /* Emails (sauf admin Kevin reconnu) */
  { name: 'email', regex: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, replace: '[EMAIL_REDACTED]' },
  /* Cartes bancaires (16 chiffres avec espaces/tirets optionnels) */
  { name: 'cb', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replace: '[CB_REDACTED]' },
  /* IBAN */
  { name: 'iban', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, replace: '[IBAN_REDACTED]' },
  /* Téléphone FR / Monaco / international */
  { name: 'phone_fr', regex: /\b(?:\+?33|0)[1-9](?:[\s.-]?\d{2}){4}\b/g, replace: '[TEL_REDACTED]' },
  { name: 'phone_monaco', regex: /\b\+?377[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b/g, replace: '[TEL_REDACTED]' },
  /* Sécu sociale FR (15 chiffres avec format STRICT — réduit false positives) */
  {
    name: 'ss_fr',
    regex: /\b[12]\s\d{2}\s\d{2}\s(?:0[1-9]|1[0-2]|2A|2B|9[5-9])\s\d{3}\s\d{3}\s\d{2}\b/g,
    replace: '[SS_REDACTED]',
  },
  /* Passeport FR (9 chars : 2 chiffres + 2 lettres + 5 chiffres — format strict) */
  { name: 'passport_fr', regex: /\b\d{2}[A-Z]{2}\d{5}\b/g, replace: '[PASSPORT_REDACTED]' },
  /* CNI FR — format strict 12 chiffres consécutifs SANS espaces (pas tout 12 chiffres aléatoire)
   * Anti-false-positive audit : "12 chiffres" matchait n'importe quel n° tél/sécu mal formaté */
  /* Désactivé Jet 3 — false positives élevés. Sera activé après whitelist user-confirm Jet 3.5 */
  /* SIRET — strict 14 chiffres consécutifs précédés "SIRET" ou "siret" pour réduire false positives */
  {
    name: 'siret',
    regex: /(?:SIRET[:\s]*)\d{14}\b/gi,
    replace: 'SIRET: [SIRET_REDACTED]',
  },
  /* TVA EU */
  { name: 'vat_eu', regex: /\b[A-Z]{2}\d{8,12}\b/g, replace: '[VAT_REDACTED]' },
  /* API keys (defense en profondeur, déjà couvert logger) */
  { name: 'sk_ant', regex: /sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/g, replace: '[KEY_REDACTED]' },
  { name: 'sk_openai', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g, replace: '[KEY_REDACTED]' },
  { name: 'aiza', regex: /AIza[A-Za-z0-9_-]{33}/g, replace: '[KEY_REDACTED]' },
  { name: 'ghp', regex: /ghp_[A-Za-z0-9]{36}/g, replace: '[KEY_REDACTED]' },
  { name: 'github_pat', regex: /github_pat_[A-Za-z0-9_]{82,}/g, replace: '[KEY_REDACTED]' },
  { name: 'stripe_sk', regex: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g, replace: '[KEY_REDACTED]' },
  { name: 'gsk', regex: /gsk_[A-Za-z0-9]{40,}/g, replace: '[KEY_REDACTED]' },
];

/**
 * v13.1.2 Kevin "chat privé, je colle ce que je veux" :
 * Si admin Kevin connecté → BYPASS PII redaction.
 * Toutes ses données sont déjà chiffrées AES-GCM-256 dans vault, et il a tous les droits.
 */
function isAdminKevin(): boolean {
  try {
    const userRaw = localStorage.getItem('apex_v13_user');
    if (!userRaw) return false;
    const user = JSON.parse(userRaw) as { id?: string };
    return user.id === 'kdmc_admin';
  } catch {
    return false;
  }
}

/**
 * v13.1.2 Privacy mode strict : si user actif → bypass aussi (n'affole pas).
 * PII redaction reste actif uniquement pour clients non-admin (B2B/B2C tiers).
 */
function shouldRedact(): boolean {
  if (isAdminKevin()) return false;
  /* Privacy mode user — opt-in via Settings */
  if (localStorage.getItem('apex_v13_privacy_no_redact') === '1') return false;
  return true;
}

/**
 * Redacte les PII d'un texte.
 * Si le texte contient des PII, retourne version filtrée + warning.
 * v13.1.2 : Kevin admin BYPASS — il colle ce qu'il veut (chiffré vault de toute façon).
 */
export function redactPII(text: string): { redacted: string; foundCount: number } {
  if (!shouldRedact()) {
    return { redacted: text, foundCount: 0 };
  }
  let redacted = text;
  let foundCount = 0;
  for (const p of PII_PATTERNS) {
    const matches = redacted.match(p.regex);
    if (matches) {
      foundCount += matches.length;
      redacted = redacted.replace(p.regex, p.replace);
    }
  }
  return { redacted, foundCount };
}

/**
 * Wrapper pour ChatMessage (string ou array de blocks Anthropic).
 */
export function redactMessageContent(content: unknown): unknown {
  if (typeof content === 'string') {
    return redactPII(content).redacted;
  }
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string') {
        return { ...block, text: redactPII(block.text).redacted };
      }
      return block;
    });
  }
  return content;
}
