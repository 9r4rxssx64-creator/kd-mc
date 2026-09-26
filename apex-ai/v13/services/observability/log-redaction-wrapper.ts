/* eslint-disable no-console -- ce module wrappe explicitement console.* pour redaction PII */
/**
 * APEX v13 — Log Redaction Wrapper (P0 sécu fix audit OWASP ASVS L2 V7.1.1)
 *
 * Mission : intercepter TOUS les logs (console.* + window.console + futures
 * intégrations) AVANT qu'ils n'émettent vers la console DevTools, Sentry,
 * audit-log ou tout autre sink, et appliquer une redaction systémique de
 * patterns sensibles (API keys, tokens, secrets, JWT, Bearer, IBAN, CB, etc).
 *
 * Pourquoi : `core/logger.ts` redacte déjà via `redact()` interne, mais des
 * dizaines d'occurrences de `console.log/warn/error` directes existent dans
 * services/ pour debug ad-hoc. De plus, des libs tierces (Vite HMR, vendor
 * SDK) peuvent logguer. installGlobal() patche l'objet global console UNE
 * SEULE FOIS au boot, defense en profondeur sans toucher au code existant.
 *
 * Anti-pattern v12.785 : zéro défense globale, secrets pouvaient leaker via
 * console.log ad-hoc dans n'importe quel service. Audit OWASP ASVS L2 V7.1.1
 * exige que les secrets ne soient JAMAIS écrits dans des logs ; on bloque la
 * voie principale (console) au boot.
 *
 * Patterns redactés (ordre = priorité, premier match l'emporte) :
 * - Anthropic key  : sk-ant-api*           → [REDACTED:anthropic_key]
 * - OpenAI key     : sk-proj-*, sk-*       → [REDACTED:openai_key]
 * - Google AI      : AIza*                 → [REDACTED:google_api_key]
 * - GitHub PAT     : ghp_*, github_pat_*   → [REDACTED:github_pat]
 * - GitHub OAuth   : ghs_*, gho_*, ghu_*   → [REDACTED:github_oauth]
 * - Stripe secret  : sk_live_*, sk_test_*  → [REDACTED:stripe_key]
 * - Brevo          : xkeysib-*             → [REDACTED:brevo_key]
 * - Resend         : re_*                  → [REDACTED:resend_key]
 * - Groq           : gsk_*                 → [REDACTED:groq_key]
 * - Perplexity     : pplx-*                → [REDACTED:perplexity_key]
 * - Pinecone       : pcsk_*                → [REDACTED:pinecone_key]
 * - JWT            : eyJ.*\.[A-Za-z0-9_-]+ → [REDACTED:jwt]
 * - Bearer         : Bearer <token>        → [REDACTED:bearer_token]
 * - IBAN           : EU IBAN format        → [REDACTED:iban]
 * - CB             : 16 chiffres groupés   → [REDACTED:credit_card]
 *
 * Usage :
 *   import { logRedaction } from '@services/observability/log-redaction-wrapper.js';
 *   logRedaction.installGlobal();   // au boot, AVANT tout autre service
 *
 *   // À ce stade, tout console.log avec une clé API sera redacté avant
 *   // émission (DevTools, Sentry, audit). Le code applicatif n'a rien à
 *   // changer (transparent).
 *
 * Tests : voir tests/unit/log-redaction-wrapper.test.ts
 */

interface RedactionPattern {
  /** Identifiant lisible du type de secret (sera affiché dans le placeholder) */
  readonly name: string;
  /** Regex avec flag global (pour replace all occurrences) */
  readonly regex: RegExp;
  /** Étiquette dans le placeholder `[REDACTED:<label>]` */
  readonly label: string;
}

/* Ordre matters : patterns spécifiques (sk-ant) AVANT génériques (sk-).
 * Bearer en TÊTE pour matcher AVANT les patterns de tokens spécifiques :
 * sinon "Bearer ghp_xxx" devient "Bearer [REDACTED:github_pat]" au lieu de
 * "[REDACTED:bearer_token]" (qui couvre toute la zone sensible y compris
 * les bytes du token GitHub). */
const PATTERNS: ReadonlyArray<RedactionPattern> = [
  /* Bearer token (Authorization header) — capture toute valeur après Bearer.
   * EN PREMIER pour englober "Bearer ghp_xxx" entièrement. */
  { name: 'bearer_token', regex: /Bearer\s+[A-Za-z0-9._-]{20,}/gi, label: 'bearer_token' },
  /* Anthropic — sk-ant-api03-XXXX (préfixe distinctif, doit matcher AVANT sk-*) */
  { name: 'anthropic_key', regex: /sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/g, label: 'anthropic_key' },
  /* OpenAI projects API : sk-proj-XXXX */
  { name: 'openai_proj_key', regex: /sk-proj-[A-Za-z0-9_-]{40,}/g, label: 'openai_proj_key' },
  /* OpenAI legacy / Stripe live/test (Stripe a un préfixe sk_ avec underscore !) */
  { name: 'stripe_key', regex: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g, label: 'stripe_key' },
  /* OpenAI generic — APRÈS sk-ant et sk-proj pour ne pas les écraser */
  { name: 'openai_key', regex: /sk-[A-Za-z0-9]{40,}/g, label: 'openai_key' },
  /* Google API Key (GMaps, Gemini, Translate) */
  { name: 'google_api_key', regex: /AIza[A-Za-z0-9_-]{33}/g, label: 'google_api_key' },
  /* GitHub Personal Access Token (classic) */
  { name: 'github_pat_classic', regex: /ghp_[A-Za-z0-9]{36}/g, label: 'github_pat' },
  /* GitHub Personal Access Token (fine-grained) */
  { name: 'github_pat_fine', regex: /github_pat_[A-Za-z0-9_]{82,}/g, label: 'github_pat' },
  /* GitHub OAuth tokens */
  { name: 'github_oauth_server', regex: /ghs_[A-Za-z0-9]{36}/g, label: 'github_oauth' },
  { name: 'github_oauth_user', regex: /gho_[A-Za-z0-9]{36}/g, label: 'github_oauth' },
  { name: 'github_oauth_user_to_server', regex: /ghu_[A-Za-z0-9]{36}/g, label: 'github_oauth' },
  /* Brevo (ex-SendinBlue) */
  { name: 'brevo_key', regex: /xkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}/g, label: 'brevo_key' },
  /* Resend (transactional email) */
  { name: 'resend_key', regex: /re_[A-Za-z0-9_]{20,}/g, label: 'resend_key' },
  /* Groq (LPU inference) */
  { name: 'groq_key', regex: /gsk_[A-Za-z0-9]{40,}/g, label: 'groq_key' },
  /* Perplexity */
  { name: 'perplexity_key', regex: /pplx-[a-f0-9]{40,}/g, label: 'perplexity_key' },
  /* Pinecone (vector DB) */
  { name: 'pinecone_key', regex: /pcsk_[A-Za-z0-9_]{40,}/g, label: 'pinecone_key' },
  /* JWT — header.payload.signature, base64url, points obligatoires */
  { name: 'jwt', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'jwt' },
  /* IBAN — format EU strict (FR/MC/etc) */
  { name: 'iban', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, label: 'iban' },
  /* Carte bancaire — 16 chiffres avec espaces/tirets optionnels (Visa/MC/Amex/Discover) */
  { name: 'credit_card', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, label: 'credit_card' },
];

interface RedactionStats {
  /** Total redactions appliquées depuis installGlobal() */
  totalRedactions: number;
  /** Compteur par type de pattern */
  byType: Record<string, number>;
  /** Timestamp dernière redaction (Date.now()) */
  lastRedactionAt: number | null;
}

/**
 * Service singleton de redaction globale console.
 */
class LogRedactionWrapper {
  private installed = false;
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    info: typeof console.info;
    trace: typeof console.trace;
  } | null = null;
  private stats: RedactionStats = {
    totalRedactions: 0,
    byType: {},
    lastRedactionAt: null,
  };

  /**
   * Redacte une string en appliquant tous les patterns dans l'ordre.
   * Retourne la string modifiée + nombre de redactions effectuées.
   */
  redactString(input: string): { redacted: string; count: number } {
    let s = input;
    let count = 0;
    for (const p of PATTERNS) {
      const matches = s.match(p.regex);
      if (matches && matches.length > 0) {
        const n = matches.length;
        count += n;
        this.stats.byType[p.name] = (this.stats.byType[p.name] ?? 0) + n;
        s = s.replace(p.regex, `[REDACTED:${p.label}]`);
      }
    }
    if (count > 0) {
      this.stats.totalRedactions += count;
      this.stats.lastRedactionAt = Date.now();
    }
    return { redacted: s, count };
  }

  /**
   * Redacte récursivement n'importe quelle valeur (string, object, array, error).
   * - string : applique redactString
   * - Error : redacte message + stack
   * - object/array : sérialise JSON, redacte, désérialise (best-effort)
   * - autres : retourne tel quel (number, boolean, null, undefined)
   */
  redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.redactString(value).redacted;
    }
    if (value instanceof Error) {
      const message = this.redactString(value.message).redacted;
      const stack = value.stack ? this.redactString(value.stack).redacted : undefined;
      const redactedErr = new Error(message);
      if (stack !== undefined) {
        redactedErr.stack = stack;
      }
      redactedErr.name = value.name;
      return redactedErr;
    }
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    /* Object/Array : best-effort via JSON round-trip */
    try {
      const json = JSON.stringify(value);
      const redacted = this.redactString(json).redacted;
      return JSON.parse(redacted) as unknown;
    } catch {
      /* Cyclic ref ou non-sérialisable → retourne placeholder safe */
      return '[unserializable_object]';
    }
  }

  /**
   * Redacte tous les arguments d'un appel console.*
   */
  redactArgs(args: unknown[]): unknown[] {
    return args.map((a) => this.redactValue(a));
  }

  /**
   * Patche console.log/warn/error/debug/info/trace globalement.
   * Idempotent : appels multiples sans effet (1er install gagne).
   *
   * À appeler EN PREMIER au boot, avant tout autre service.
   *
   * Sur SSR/test sans `console`, no-op.
   */
  installGlobal(): void {
    if (this.installed) return;
    if (typeof console === 'undefined') return;

    /* Sauvegarde des originaux pour restoreGlobal() (utile en tests) */
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      trace: console.trace.bind(console),
    };

    const orig = this.originalConsole;
    const self = this;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    console.log = function (...args: unknown[]): void {
      orig.log(...self.redactArgs(args) as any[]);
    };
    console.warn = function (...args: unknown[]): void {
      orig.warn(...self.redactArgs(args) as any[]);
    };
    console.error = function (...args: unknown[]): void {
      orig.error(...self.redactArgs(args) as any[]);
    };
    console.debug = function (...args: unknown[]): void {
      orig.debug(...self.redactArgs(args) as any[]);
    };
    console.info = function (...args: unknown[]): void {
      orig.info(...self.redactArgs(args) as any[]);
    };
    console.trace = function (...args: unknown[]): void {
      orig.trace(...self.redactArgs(args) as any[]);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    this.installed = true;
  }

  /**
   * Restaure le console original. Utilisé en tests pour reset.
   * No-op si pas installé.
   */
  restoreGlobal(): void {
    if (!this.installed || !this.originalConsole) return;
    if (typeof console === 'undefined') return;
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;
    console.trace = this.originalConsole.trace;
    this.installed = false;
    this.originalConsole = null;
  }

  /**
   * Retourne les stats accumulées (audit / HUD admin).
   */
  getStats(): Readonly<RedactionStats> {
    return {
      totalRedactions: this.stats.totalRedactions,
      byType: { ...this.stats.byType },
      lastRedactionAt: this.stats.lastRedactionAt,
    };
  }

  /**
   * Reset stats (utile en tests).
   */
  resetStats(): void {
    this.stats = { totalRedactions: 0, byType: {}, lastRedactionAt: null };
  }

  /**
   * Indique si le wrap est actif.
   */
  isInstalled(): boolean {
    return this.installed;
  }

  /**
   * Liste des patterns actifs (audit / debug).
   * Retourne uniquement metadata (name + label), pas la regex pour ne pas
   * leak les détails d'implémentation à un attaquant qui obtiendrait stats.
   */
  listPatterns(): ReadonlyArray<{ name: string; label: string }> {
    return PATTERNS.map((p) => ({ name: p.name, label: p.label }));
  }
}

export const logRedaction = new LogRedactionWrapper();

/* Export pour tests unitaires */
export { LogRedactionWrapper };
export type { RedactionPattern, RedactionStats };
