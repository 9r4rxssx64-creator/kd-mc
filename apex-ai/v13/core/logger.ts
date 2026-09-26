/**
 * APEX v13 — Logger structuré + Sentry bridge
 *
 * Niveau de logs : debug | info | warn | error
 * - Console formatée + couleur en dev
 * - Buffer rotatif local (max 500) pour debug HUD
 * - Bridge Sentry si DSN configuré (lazy-load)
 * - Redaction auto secrets (sk-*, ghp_*, AIza*, etc.) — patterns ALIGNÉS sur
 *   `services/log-redaction-wrapper.ts` (defense en profondeur cohérente).
 *
 * Anti-pattern évité : pas de console.log nu, tout passe par logger.
 *
 * Audit OWASP ASVS L2 V7.1.1 (sécu, 2026-05-08) — extension patterns :
 * Avant ce fix, seuls 10 patterns étaient redactés ici (sk-ant, sk-, AIza,
 * ghp_, github_pat_, xkeysib, re_, gsk_, pplx-, Bearer). Les patterns Stripe
 * (sk_live/sk_test), GitHub OAuth (ghs_/gho_/ghu_), Pinecone (pcsk_), JWT,
 * IBAN, CB n'étaient PAS couverts → fuites possibles via logger.* (utilisé
 * dans 894+ call sites du code applicatif vs console.* couvert par wrapper
 * global). On élargit ici à TOUS les patterns du wrapper, plus le scope est
 * également redacté (un dev pourrait par erreur passer un secret en scope).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: number;
  level: LogLevel;
  scope: string;
  msg: string;
  data?: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Patterns sensibles à redacter — ordre = priorité (premier match l'emporte).
 * MIROIR de `services/log-redaction-wrapper.ts` PATTERNS pour cohérence
 * defense-in-depth. Bearer EN PREMIER pour englober "Bearer ghp_xxx" en
 * une seule redaction au lieu de "Bearer [REDACTED]".
 */
const SECRET_PATTERNS: ReadonlyArray<{ regex: RegExp; label: string }> = [
  /* Bearer token (Authorization header) — capture toute valeur après Bearer. */
  { regex: /Bearer\s+[A-Za-z0-9._-]{20,}/gi, label: 'bearer_token' },
  /* Anthropic — sk-ant-apiNN-XXXX */
  { regex: /sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/g, label: 'anthropic_key' },
  /* OpenAI projects API : sk-proj-XXXX */
  { regex: /sk-proj-[A-Za-z0-9_-]{40,}/g, label: 'openai_proj_key' },
  /* Stripe secret key (live/test) — préfixe sk_ avec underscore */
  { regex: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g, label: 'stripe_key' },
  /* OpenAI generic — APRÈS sk-ant et sk-proj pour ne pas les écraser */
  { regex: /sk-[A-Za-z0-9]{40,}/g, label: 'openai_key' },
  /* Google API Key (GMaps, Gemini, Translate) */
  { regex: /AIza[A-Za-z0-9_-]{33}/g, label: 'google_api_key' },
  /* GitHub Personal Access Token (classic) */
  { regex: /ghp_[A-Za-z0-9]{36}/g, label: 'github_pat' },
  /* GitHub Personal Access Token (fine-grained) */
  { regex: /github_pat_[A-Za-z0-9_]{82,}/g, label: 'github_pat' },
  /* GitHub OAuth tokens (server, user, user-to-server) */
  { regex: /ghs_[A-Za-z0-9]{36}/g, label: 'github_oauth' },
  { regex: /gho_[A-Za-z0-9]{36}/g, label: 'github_oauth' },
  { regex: /ghu_[A-Za-z0-9]{36}/g, label: 'github_oauth' },
  /* AWS access key */
  { regex: /AKIA[0-9A-Z]{16}/g, label: 'aws_access_key' },
  /* Brevo (ex-SendinBlue) */
  { regex: /xkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}/g, label: 'brevo_key' },
  /* Resend (transactional email) */
  { regex: /re_[A-Za-z0-9_]{20,}/g, label: 'resend_key' },
  /* Groq (LPU inference) */
  { regex: /gsk_[A-Za-z0-9]{40,}/g, label: 'groq_key' },
  /* Perplexity */
  { regex: /pplx-[a-f0-9]{40,}/g, label: 'perplexity_key' },
  /* Pinecone (vector DB) */
  { regex: /pcsk_[A-Za-z0-9_]{40,}/g, label: 'pinecone_key' },
  /* JWT — header.payload.signature, base64url, points obligatoires */
  { regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'jwt' },
  /* IBAN — format EU strict (FR/MC/etc) */
  { regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, label: 'iban' },
  /* Carte bancaire — 16 chiffres avec espaces/tirets optionnels */
  { regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, label: 'credit_card' },
];

/**
 * Redacte récursivement une valeur arbitraire (string, object, Error, array).
 * - string : applique tous les patterns
 * - Error  : redacte message + stack (préserve name)
 * - object : sérialise JSON, redacte le JSON, désérialise
 * - autres : retourne tel quel (number, boolean, null, undefined)
 */
function redact(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    let s = input;
    for (const { regex, label } of SECRET_PATTERNS) s = s.replace(regex, `[REDACTED:${label}]`);
    return s;
  }
  if (input instanceof Error) {
    let message = input.message;
    for (const { regex, label } of SECRET_PATTERNS) {
      message = message.replace(regex, `[REDACTED:${label}]`);
    }
    const redactedErr = new Error(message);
    redactedErr.name = input.name;
    if (input.stack) {
      let stack = input.stack;
      for (const { regex, label } of SECRET_PATTERNS) {
        stack = stack.replace(regex, `[REDACTED:${label}]`);
      }
      redactedErr.stack = stack;
    }
    return redactedErr;
  }
  if (typeof input === 'object') {
    try {
      const json = JSON.stringify(input);
      let redactedJson = json;
      for (const { regex, label } of SECRET_PATTERNS) {
        redactedJson = redactedJson.replace(regex, `[REDACTED:${label}]`);
      }
      return JSON.parse(redactedJson) as unknown;
    } catch {
      /* Cyclic ref / non-sérialisable : placeholder safe */
      return '[unserializable]';
    }
  }
  return input;
}

class Logger {
  private buffer: LogEntry[] = [];
  private readonly maxBuffer = 500;
  private minLevel: LogLevel =
    typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? 'debug' : 'info';
  private sentryReady = false;

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  debug(scope: string, msg: string, data?: unknown): void {
    this.log('debug', scope, msg, data);
  }
  info(scope: string, msg: string, data?: unknown): void {
    this.log('info', scope, msg, data);
  }
  warn(scope: string, msg: string, data?: unknown): void {
    this.log('warn', scope, msg, data);
  }
  error(scope: string, msg: string, data?: unknown): void {
    this.log('error', scope, msg, data);
  }

  getBuffer(): readonly LogEntry[] {
    return this.buffer;
  }

  clearBuffer(): void {
    this.buffer = [];
  }

  private log(level: LogLevel, scope: string, msg: string, data?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    /* Defense en profondeur : on redacte AUSSI le scope (un dev pourrait
     * par erreur passer un secret en scope, ex: `logger.info(apiKey, ...)`). */
    const safeScope = redact(scope) as string;
    const safeMsg = redact(msg) as string;
    const safeData = data !== undefined ? redact(data) : undefined;

    const entry: LogEntry = {
      ts: Date.now(),
      level,
      scope: safeScope,
      msg: safeMsg,
      ...(safeData !== undefined && { data: safeData }),
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();

    /* Console formaté — déjà redacté ci-dessus. Le wrapper global console
     * (services/log-redaction-wrapper.ts) appliquera une seconde passe
     * idempotente (les `[REDACTED:*]` ne sont pas re-matchés). */
    const prefix = `[${level.toUpperCase()}] ${safeScope}`;
    const args =
      safeData !== undefined ? [prefix, safeMsg, safeData] : [prefix, safeMsg];
     
    if (level === 'error') console.error(...args);
    else if (level === 'warn') console.warn(...args);
    else if (level === 'info') console.info(...args);
    else console.debug(...args);
     

    /* Sentry bridge async (errors only, lazy) */
    if (level === 'error') void this.forwardToSentry(entry);
  }

  private async forwardToSentry(entry: LogEntry): Promise<void> {
    if (!this.sentryReady) return;
    /* TODO Jet 2 : import('@sentry/browser').captureMessage */
    void entry;
  }
}

export const logger = new Logger();

/* Export interne pour tests (pas de namespace public — usage tests only). */
export { redact as _redactForTests, SECRET_PATTERNS as _SECRET_PATTERNS };
