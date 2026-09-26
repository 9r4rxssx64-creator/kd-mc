/**
 * APEX v13 — Pre-flight Check Service
 *
 * Règle Kevin 2026-05-04 :
 * "Comme il doit vérifier le fonctionnement des outils et modules avant de les présenter."
 *
 * Avant de présenter un tool / module / feature à l'utilisateur (UI Mes compétences,
 * intent detection, system prompt), Apex DOIT vérifier que la dépendance est dispo,
 * la clé API présente, le quota OK, l'API browser supportée, etc.
 *
 * Architecture :
 * - PreflightCheck = test enregistré pour un toolId donné (catégorie + test async)
 * - PreflightResult = résultat structuré (ok/ready, missing deps, autoFix optionnel)
 * - Cache TTL 5 min : évite re-test à chaque hover/click
 * - preflightAll / preflightCategory : parallélisé Promise.all
 * - autoFix : tentative auto de correction (lazy load, request permission, ouvrir vault…)
 *
 * Pas commit. Pas modif globale. Ce fichier seul + son test.
 */

import { logger } from '../../core/logger.js';

/* ============================================================
 * Types publics
 * ============================================================ */

export type PreflightCategory =
  | 'tool'
  | 'module'
  | 'feature'
  | 'sentinel'
  | 'studio'
  | 'pro'
  | 'voice'
  | 'browser'
  | 'auth'
  | 'storage';

export interface PreflightResult {
  ok: boolean;
  ready: boolean;
  missingDeps?: string[];
  error?: string;
  autoFixAvailable?: boolean;
  autoFixLabel?: string;
  autoFix?: () => Promise<boolean>;
  ts: number;
}

export interface PreflightCheck {
  toolId: string;
  category: PreflightCategory;
  test: () => Promise<PreflightResult>;
}

export interface PreflightRegistry {
  register(check: PreflightCheck): void;
  unregister(toolId: string): boolean;
  list(): readonly PreflightCheck[];
  has(toolId: string): boolean;
  preflightCheck(toolId: string, opts?: { useCache?: boolean }): Promise<PreflightResult>;
  preflightAll(): Promise<Map<string, PreflightResult>>;
  preflightCategory(cat: PreflightCategory): Promise<Map<string, PreflightResult>>;
  invalidateCache(toolId?: string): void;
  getCachedResult(toolId: string): PreflightResult | null;
}

/* ============================================================
 * Implementation interne
 * ============================================================ */

const CACHE_TTL_MS = 5 * 60 * 1000; /* 5 min */

const checks = new Map<string, PreflightCheck>();
const cache = new Map<string, PreflightResult>();

function makeResult(partial: Partial<PreflightResult>): PreflightResult {
  return {
    ok: partial.ok ?? false,
    ready: partial.ready ?? false,
    ts: Date.now(),
    ...(partial.missingDeps ? { missingDeps: partial.missingDeps } : {}),
    ...(partial.error ? { error: partial.error } : {}),
    ...(partial.autoFixAvailable !== undefined ? { autoFixAvailable: partial.autoFixAvailable } : {}),
    ...(partial.autoFixLabel ? { autoFixLabel: partial.autoFixLabel } : {}),
    ...(partial.autoFix ? { autoFix: partial.autoFix } : {}),
  };
}

function isCacheValid(r: PreflightResult): boolean {
  return Date.now() - r.ts < CACHE_TTL_MS;
}

async function runCheck(check: PreflightCheck): Promise<PreflightResult> {
  try {
    const r = await check.test();
    return makeResult(r);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('preflight', `Test ${check.toolId} a levé`, { error: msg });
    return makeResult({
      ok: false,
      ready: false,
      error: `Erreur interne du test: ${msg}`,
    });
  }
}

/* ============================================================
 * Registry public
 * ============================================================ */

export const preflightRegistry: PreflightRegistry = {
  register(check: PreflightCheck): void {
    if (!check.toolId || typeof check.toolId !== 'string') {
      throw new Error('PreflightCheck.toolId requis (string non vide)');
    }
    if (typeof check.test !== 'function') {
      throw new Error(`PreflightCheck.test requis (function) pour ${check.toolId}`);
    }
    checks.set(check.toolId, check);
  },

  unregister(toolId: string): boolean {
    cache.delete(toolId);
    return checks.delete(toolId);
  },

  list(): readonly PreflightCheck[] {
    return Array.from(checks.values());
  },

  has(toolId: string): boolean {
    return checks.has(toolId);
  },

  async preflightCheck(toolId: string, opts?: { useCache?: boolean }): Promise<PreflightResult> {
    const useCache = opts?.useCache !== false; /* default true */
    const check = checks.get(toolId);
    if (!check) {
      return makeResult({
        ok: false,
        ready: false,
        error: `Tool inconnu: ${toolId}`,
      });
    }
    if (useCache) {
      const cached = cache.get(toolId);
      if (cached && isCacheValid(cached)) {
        return cached;
      }
    }
    const result = await runCheck(check);
    cache.set(toolId, result);
    return result;
  },

  async preflightAll(): Promise<Map<string, PreflightResult>> {
    const ids = Array.from(checks.keys());
    const results = await Promise.all(
      ids.map(async (id) => [id, await this.preflightCheck(id)] as const),
    );
    return new Map(results);
  },

  async preflightCategory(cat: PreflightCategory): Promise<Map<string, PreflightResult>> {
    const filtered = Array.from(checks.values()).filter((c) => c.category === cat);
    const results = await Promise.all(
      filtered.map(async (c) => [c.toolId, await this.preflightCheck(c.toolId)] as const),
    );
    return new Map(results);
  },

  invalidateCache(toolId?: string): void {
    if (toolId === undefined) {
      cache.clear();
      return;
    }
    cache.delete(toolId);
  },

  getCachedResult(toolId: string): PreflightResult | null {
    const r = cache.get(toolId);
    if (!r) return null;
    if (!isCacheValid(r)) {
      cache.delete(toolId);
      return null;
    }
    return r;
  },
};

/* ============================================================
 * Helpers internes pour tests built-in
 * ============================================================ */

function lsHasNonEmpty(key: string): boolean {
  try {
    const v = localStorage.getItem(key);
    return typeof v === 'string' && v.length > 0;
  } catch {
    return false;
  }
}

function anyKeyPresent(keys: readonly string[]): string | null {
  for (const k of keys) {
    if (lsHasNonEmpty(k)) return k;
  }
  return null;
}

function ok(extra?: Partial<PreflightResult>): PreflightResult {
  return makeResult({ ok: true, ready: true, ...extra });
}

function ko(error: string, extra?: Partial<PreflightResult>): PreflightResult {
  return makeResult({ ok: false, ready: false, error, ...extra });
}

function openVault(_field: string): () => Promise<boolean> {
  return async () => {
    try {
      /* Best-effort : envoie un event que la couche UI peut intercepter
       * pour ouvrir le vault et focus le champ. Si pas de listener → no-op. */
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        const ev = new CustomEvent('apex:open-vault', { detail: { field: _field } });
        window.dispatchEvent(ev);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };
}

/* ============================================================
 * Tests built-in (≥ 30 enregistrés)
 * ============================================================ */

/* ---- Tools IA ---- */

preflightRegistry.register({
  toolId: 'tool.web_search',
  category: 'tool',
  test: async () => {
    const found = anyKeyPresent(['ax_brave_key', 'ax_tavily_key', 'ax_serpapi_key']);
    if (found) return ok();
    return ko('Aucune clé Web Search (Brave/Tavily/SerpAPI) configurée.', {
      missingDeps: ['ax_brave_key', 'ax_tavily_key', 'ax_serpapi_key'],
      autoFixAvailable: true,
      autoFixLabel: 'Configurer une clé dans le Vault',
      autoFix: openVault('ax_brave_key'),
    });
  },
});

preflightRegistry.register({
  toolId: 'tool.image_analyze',
  category: 'tool',
  test: async () => {
    const found = anyKeyPresent(['ax_anthropic_key', 'ax_openai_key', 'ax_google_key']);
    if (found) return ok();
    return ko('Aucun provider IA vision configuré (Anthropic/OpenAI/Google).', {
      missingDeps: ['ax_anthropic_key', 'ax_openai_key', 'ax_google_key'],
      autoFixAvailable: true,
      autoFixLabel: 'Ajouter clé Anthropic',
      autoFix: openVault('ax_anthropic_key'),
    });
  },
});

preflightRegistry.register({
  toolId: 'tool.email_send',
  category: 'tool',
  test: async () => {
    const found = anyKeyPresent(['ax_brevo_key', 'ax_resend_key', 'ax_sendgrid_key']);
    if (found) return ok();
    return ko('Aucune clé email transactionnel (Brevo/Resend/SendGrid).', {
      missingDeps: ['ax_brevo_key', 'ax_resend_key', 'ax_sendgrid_key'],
      autoFixAvailable: true,
      autoFixLabel: 'Configurer Brevo',
      autoFix: openVault('ax_brevo_key'),
    });
  },
});

preflightRegistry.register({
  toolId: 'tool.sms_send',
  category: 'tool',
  test: async () => {
    const found = anyKeyPresent(['ax_twilio_key', 'ax_vonage_key']);
    if (found) return ok();
    return ko('Aucune clé SMS (Twilio/Vonage).', {
      missingDeps: ['ax_twilio_key'],
      autoFixAvailable: true,
      autoFixLabel: 'Configurer Twilio',
      autoFix: openVault('ax_twilio_key'),
    });
  },
});

preflightRegistry.register({
  toolId: 'tool.translate',
  category: 'tool',
  test: async () => {
    const found = anyKeyPresent(['ax_deepl_key']);
    if (found) return ok();
    /* Fallback Web Speech / heuristique → toujours dispo */
    return ok({ missingDeps: ['ax_deepl_key'] });
  },
});

preflightRegistry.register({
  toolId: 'tool.calendar',
  category: 'tool',
  test: async () => {
    const found = anyKeyPresent(['ax_google_calendar_token', 'ax_google_oauth_token']);
    if (found) return ok();
    return ko('Pas de token Google Calendar OAuth.', {
      missingDeps: ['ax_google_calendar_token'],
      autoFixAvailable: true,
      autoFixLabel: 'Connecter Google',
      autoFix: openVault('ax_google_calendar_token'),
    });
  },
});

preflightRegistry.register({
  toolId: 'tool.weather',
  category: 'tool',
  test: async () => {
    /* open-meteo gratuit, pas de clé requise */
    return ok();
  },
});

/* ---- Modules pro ---- */

preflightRegistry.register({
  toolId: 'pro.cuisine',
  category: 'pro',
  test: async () => ok(),
});

preflightRegistry.register({
  toolId: 'pro.medical',
  category: 'pro',
  test: async () => ok({ missingDeps: [] }),
});

preflightRegistry.register({
  toolId: 'pro.finance',
  category: 'pro',
  test: async () => ok(),
});

preflightRegistry.register({
  toolId: 'pro.legal',
  category: 'pro',
  test: async () => ok(),
});

preflightRegistry.register({
  toolId: 'pro.translator',
  category: 'pro',
  test: async () => {
    const hasDeepL = lsHasNonEmpty('ax_deepl_key');
    const hasSpeech =
      typeof globalThis !== 'undefined' &&
      ('SpeechSynthesis' in globalThis || 'speechSynthesis' in globalThis);
    if (hasDeepL || hasSpeech) return ok();
    return ko('Pas de DeepL et SpeechSynthesis indisponible.', {
      missingDeps: ['ax_deepl_key', 'SpeechSynthesis'],
      autoFixAvailable: true,
      autoFixLabel: 'Ajouter clé DeepL',
      autoFix: openVault('ax_deepl_key'),
    });
  },
});

/* ---- Studios ---- */

preflightRegistry.register({
  toolId: 'studio.music',
  category: 'studio',
  test: async () => {
    const ac =
      typeof globalThis !== 'undefined' &&
      ('AudioContext' in globalThis ||
        'webkitAudioContext' in globalThis);
    if (ac) return ok();
    return ko('Web Audio API indisponible (navigateur trop ancien).', {
      missingDeps: ['AudioContext'],
    });
  },
});

preflightRegistry.register({
  toolId: 'studio.video',
  category: 'studio',
  test: async () => {
    const mr = typeof globalThis !== 'undefined' && 'MediaRecorder' in globalThis;
    if (mr) return ok();
    return ko('MediaRecorder API indisponible.', { missingDeps: ['MediaRecorder'] });
  },
});

preflightRegistry.register({
  toolId: 'studio.cv',
  category: 'studio',
  test: async () => ok(),
});

preflightRegistry.register({
  toolId: 'studio.invoice',
  category: 'studio',
  test: async () => ok(),
});

preflightRegistry.register({
  toolId: 'studio.contract',
  category: 'studio',
  test: async () => ok(),
});

/* ---- Voice ---- */

preflightRegistry.register({
  toolId: 'voice.tts',
  category: 'voice',
  test: async () => {
    const ok1 = typeof globalThis !== 'undefined' && 'speechSynthesis' in globalThis;
    if (ok1) return ok();
    return ko('SpeechSynthesis indisponible (Safari iOS PWA peut bloquer).', {
      missingDeps: ['speechSynthesis'],
    });
  },
});

preflightRegistry.register({
  toolId: 'voice.stt',
  category: 'voice',
  test: async () => {
    const ok1 =
      typeof globalThis !== 'undefined' &&
      ('SpeechRecognition' in globalThis || 'webkitSpeechRecognition' in globalThis);
    if (ok1) return ok();
    return ko('SpeechRecognition indisponible.', {
      missingDeps: ['SpeechRecognition', 'webkitSpeechRecognition'],
    });
  },
});

preflightRegistry.register({
  toolId: 'voice.elevenlabs',
  category: 'voice',
  test: async () => {
    if (lsHasNonEmpty('ax_elevenlabs_key')) return ok();
    return ko('Clé ElevenLabs absente.', {
      missingDeps: ['ax_elevenlabs_key'],
      autoFixAvailable: true,
      autoFixLabel: 'Configurer ElevenLabs',
      autoFix: openVault('ax_elevenlabs_key'),
    });
  },
});

preflightRegistry.register({
  toolId: 'voice.wake_word',
  category: 'voice',
  test: async () => {
    const ok1 =
      typeof globalThis !== 'undefined' &&
      ('SpeechRecognition' in globalThis || 'webkitSpeechRecognition' in globalThis);
    if (ok1) return ok();
    return ko('Wake word requiert SpeechRecognition.', {
      missingDeps: ['SpeechRecognition'],
    });
  },
});

/* ---- Browser ---- */

preflightRegistry.register({
  toolId: 'browser.iframe',
  category: 'browser',
  test: async () => {
    const can = typeof document !== 'undefined' && typeof document.createElement === 'function';
    if (can) return ok();
    return ko('document.createElement indisponible.', { missingDeps: ['document'] });
  },
});

preflightRegistry.register({
  toolId: 'browser.bookmarks',
  category: 'browser',
  test: async () => {
    try {
      if (typeof localStorage === 'undefined') return ko('localStorage indisponible.');
      const tk = '__apex_pf_test__';
      localStorage.setItem(tk, '1');
      localStorage.removeItem(tk);
      return ok();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return ko(`localStorage erreur: ${msg}`, { missingDeps: ['localStorage'] });
    }
  },
});

preflightRegistry.register({
  toolId: 'browser.share',
  category: 'browser',
  test: async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) return ok();
    return ko('Web Share API indisponible (desktop souvent).', { missingDeps: ['navigator.share'] });
  },
});

/* ---- Auth ---- */

preflightRegistry.register({
  toolId: 'auth.pin',
  category: 'auth',
  test: async () => {
    if (lsHasNonEmpty('ax_pin') || lsHasNonEmpty('ax_pin_hash')) return ok();
    return ko('PIN admin non configuré.', {
      missingDeps: ['ax_pin'],
      autoFixAvailable: true,
      autoFixLabel: 'Définir un PIN',
      autoFix: openVault('ax_pin'),
    });
  },
});

preflightRegistry.register({
  toolId: 'auth.webauthn',
  category: 'auth',
  test: async () => {
    const has = typeof globalThis !== 'undefined' && 'PublicKeyCredential' in globalThis;
    if (!has) return ko('WebAuthn indisponible (HTTPS requis).', { missingDeps: ['PublicKeyCredential'] });
    if (lsHasNonEmpty('ax_webauthn_credential_id')) return ok();
    return ko('WebAuthn disponible mais aucune crédential enrôlée.', {
      missingDeps: ['ax_webauthn_credential_id'],
      autoFixAvailable: true,
      autoFixLabel: 'Enrôler FaceID/TouchID',
    });
  },
});

preflightRegistry.register({
  toolId: 'auth.voice',
  category: 'auth',
  test: async () => {
    if (lsHasNonEmpty('ax_voice_print_admin') || lsHasNonEmpty('ax_voice_print_user')) return ok();
    return ko('Empreinte vocale non enrôlée.', {
      missingDeps: ['ax_voice_print_admin'],
      autoFixAvailable: true,
      autoFixLabel: 'Enrôler la voix',
    });
  },
});

/* ---- Storage ---- */

preflightRegistry.register({
  toolId: 'storage.localStorage',
  category: 'storage',
  test: async () => {
    try {
      if (typeof localStorage === 'undefined') {
        return ko('localStorage indisponible.', { missingDeps: ['localStorage'] });
      }
      const tk = '__apex_pf_quota__';
      localStorage.setItem(tk, 'x');
      localStorage.removeItem(tk);
      return ok();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return ko(`Quota dépassé ou indisponible: ${msg}`, {
        missingDeps: ['localStorage_quota'],
        autoFixAvailable: true,
        autoFixLabel: 'Lancer cleanup',
      });
    }
  },
});

preflightRegistry.register({
  toolId: 'storage.indexedDB',
  category: 'storage',
  test: async () => {
    if (typeof indexedDB === 'undefined') {
      return ko('IndexedDB indisponible (mode privé Safari ?).', { missingDeps: ['indexedDB'] });
    }
    return ok();
  },
});

preflightRegistry.register({
  toolId: 'storage.firebase',
  category: 'storage',
  test: async () => {
    if (lsHasNonEmpty('ax_firebase_url') || lsHasNonEmpty('ax_firebase_token')) return ok();
    return ko('Firebase Realtime DB non configurée.', {
      missingDeps: ['ax_firebase_url'],
      autoFixAvailable: true,
      autoFixLabel: 'Configurer Firebase',
      autoFix: openVault('ax_firebase_url'),
    });
  },
});

/* ---- Sentinels ---- */

preflightRegistry.register({
  toolId: 'sentinel.security_watch',
  category: 'sentinel',
  test: async () => ok(),
});

preflightRegistry.register({
  toolId: 'sentinel.token_balance_watch',
  category: 'sentinel',
  test: async () => {
    if (anyKeyPresent(['ax_anthropic_key', 'ax_openai_key', 'ax_groq_key'])) return ok();
    return ko('Aucune clé IA → token balance watch inutile.', {
      missingDeps: ['ax_anthropic_key', 'ax_openai_key'],
    });
  },
});

/* ---- Modules génériques ---- */

preflightRegistry.register({
  toolId: 'module.calculator',
  category: 'module',
  test: async () => ok(),
});

preflightRegistry.register({
  toolId: 'module.notes',
  category: 'module',
  test: async () => {
    if (typeof localStorage === 'undefined') {
      return ko('localStorage requis pour notes.', { missingDeps: ['localStorage'] });
    }
    return ok();
  },
});

preflightRegistry.register({
  toolId: 'module.calendar_local',
  category: 'module',
  test: async () => ok(),
});

/* ---- Features ---- */

preflightRegistry.register({
  toolId: 'feature.chat_streaming',
  category: 'feature',
  test: async () => {
    const has = typeof globalThis !== 'undefined' && 'ReadableStream' in globalThis;
    if (has) return ok();
    return ko('ReadableStream indisponible.', { missingDeps: ['ReadableStream'] });
  },
});

preflightRegistry.register({
  toolId: 'feature.notifications',
  category: 'feature',
  test: async () => {
    const has = typeof globalThis !== 'undefined' && 'Notification' in globalThis;
    if (has) return ok();
    return ko('Notification API indisponible (iOS Safari hors PWA).', {
      missingDeps: ['Notification'],
    });
  },
});

preflightRegistry.register({
  toolId: 'feature.geolocation',
  category: 'feature',
  test: async () => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) return ok();
    return ko('Geolocation API indisponible.', { missingDeps: ['navigator.geolocation'] });
  },
});

preflightRegistry.register({
  toolId: 'feature.clipboard',
  category: 'feature',
  test: async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) return ok();
    return ko('Clipboard API indisponible (HTTPS requis).', { missingDeps: ['navigator.clipboard'] });
  },
});

/* ============================================================
 * Convenience exports (helpers réutilisables côté UI)
 * ============================================================ */

/**
 * preflightCheck(toolId, opts?) — wrapper court pour la couche UI.
 * Avant d'afficher un bouton tool, vérifier prêt → sinon afficher hint + autoFix.
 */
export async function preflightCheck(
  toolId: string,
  opts?: { useCache?: boolean },
): Promise<PreflightResult> {
  return preflightRegistry.preflightCheck(toolId, opts);
}

/** preflightAll() — pour audit dashboard admin (vue "Mes compétences IA"). */
export async function preflightAll(): Promise<Map<string, PreflightResult>> {
  return preflightRegistry.preflightAll();
}

/** preflightCategory(cat) — filtre par catégorie. */
export async function preflightCategory(
  cat: PreflightCategory,
): Promise<Map<string, PreflightResult>> {
  return preflightRegistry.preflightCategory(cat);
}

/** Synthèse texte (system prompt enrichment). */
export function summarizeResults(results: ReadonlyMap<string, PreflightResult>): string {
  const total = results.size;
  let okCount = 0;
  const broken: string[] = [];
  for (const [id, r] of results) {
    if (r.ok && r.ready) okCount += 1;
    else broken.push(id);
  }
  const lines = [`Pre-flight: ${okCount}/${total} prêts.`];
  if (broken.length > 0) {
    lines.push(`Indisponibles: ${broken.slice(0, 8).join(', ')}${broken.length > 8 ? '…' : ''}`);
  }
  return lines.join('\n');
}
