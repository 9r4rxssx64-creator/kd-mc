/**
 * APEX v13 — AI Providers Health Check
 *
 * Audit Kevin v13.1.0 (oubli #3) :
 * - Ping HEAD/light request chaque provider toutes 60s en background
 * - Latency > 3s → marqué "slow"
 * - Fail 3x consécutifs → marqué "down"
 * - Stockage `apex_v13_provider_health`
 * - API : `aiProvidersHealth.getStatus()` retourne `{anthropic:'ok', openai:'down', groq:'slow'}`
 * - Affichage features/dashboard ou statut bar
 *
 * Règles CLAUDE.md :
 * - "Anti-blocage IA, auto-déblocage total" → on détecte les providers KO AVANT que
 *   l'utilisateur tape un message → priorité fallback chain bonifiée.
 * - "JAMAIS de réponse vide" → health connu = on choisit toujours un provider sain.
 * - "Préflight test obligatoire" → ce service alimente preflight.ts pour le statut UI.
 *
 * Architecture :
 * - SLOW_THRESHOLD_MS = 3000 (3s)
 * - DOWN_FAIL_COUNT = 3 (3 échecs consécutifs)
 * - PING_INTERVAL_MS = 60_000 (60s)
 * - Endpoint ping minimal : OPTIONS / HEAD selon provider (pas de coût $)
 * - Anti-zombie : AbortController par ping (timeout 5s)
 */

import { logger } from '../../core/logger.js';

export type ProviderId = 'anthropic' | 'openrouter' | 'groq' | 'gemini' | 'openclaw';
export type HealthStatus = 'ok' | 'slow' | 'down' | 'unknown';

export interface ProviderHealth {
  provider: ProviderId;
  status: HealthStatus;
  latency_ms: number; /* dernière mesure ; -1 si pas encore mesuré */
  last_ping_ts: number;
  consecutive_failures: number;
  last_error?: string;
}

const STORAGE_KEY = 'apex_v13_provider_health';

const SLOW_THRESHOLD_MS = 3000;
const DOWN_FAIL_COUNT = 3;
const PING_INTERVAL_MS = 60_000;
const PING_TIMEOUT_MS = 5000;

/**
 * Endpoints "light" pour ping (OPTIONS/HEAD ou GET sur path public minimal).
 * On vérifie uniquement la joignabilité réseau + DNS — PAS l'auth.
 * Donc HTTP 401 / 403 = provider UP (auth gating), HTTP 5xx ou network err = provider DOWN.
 */
const PING_ENDPOINTS: Record<ProviderId, string> = {
  /* Anthropic n'expose pas de health endpoint public — on ping le root API
     qui retourne 404 (mais TLS OK = service vivant). */
  anthropic: 'https://api.anthropic.com/v1/messages',
  openrouter: 'https://openrouter.ai/api/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  /* v13.3.87 P1.11 (Kevin audit externe brutal 2026-05-08) : openclaw était placeholder
   * fake → toujours DOWN dans health → faux positif "2/4 providers KO sans alerte".
   * Conservé dans types pour compat tests, EXCLU du health check live. */
  openclaw: 'https://api.openclaw.io/v1/models' /* placeholder — exclu PROBE_PROVIDERS */,
};

const ALL_PROVIDERS: readonly ProviderId[] = [
  'anthropic',
  'openrouter',
  'groq',
  'gemini',
  'openclaw',
];

/* v13.3.87 P1.11 : providers réellement testables (pas de placeholder fake).
 * openclaw exclu car endpoint placeholder → générait faux positif "DOWN" sans valeur. */
const PROBE_PROVIDERS: readonly ProviderId[] = [
  'anthropic',
  'openrouter',
  'groq',
  'gemini',
];

/* HTTP status considérés comme "service vivant" (réponse réseau + serveur traite la requête).
   401/403 = manque auth, 404 = endpoint inconnu mais serveur OK, 405 = method not allowed mais OK,
   429 = rate limit (service vivant), 200 = pleinement OK. */
const ALIVE_STATUSES: ReadonlySet<number> = new Set([200, 201, 204, 400, 401, 403, 404, 405, 429]);

class AIProvidersHealth {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private state: Map<ProviderId, ProviderHealth> = new Map();
  private started = false;

  constructor() {
    this.loadFromStorage();
    /* État initial pour providers manquants (jamais pingués) */
    for (const p of ALL_PROVIDERS) {
      if (!this.state.has(p)) {
        this.state.set(p, {
          provider: p,
          status: 'unknown',
          latency_ms: -1,
          last_ping_ts: 0,
          consecutive_failures: 0,
        });
      }
    }
  }

  /**
   * Démarre la sentinelle ping 60s. Idempotent (safe à appeler plusieurs fois).
   * Premier ping immédiat, puis setInterval.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    /* Ping immédiat au boot (asynchrone, ne bloque pas) */
    void this.pingAll();
    this.intervalId = setInterval(() => {
      void this.pingAll();
    }, PING_INTERVAL_MS);
    logger.info('ai-providers-health', 'started (ping every 60s)');
  }

  /**
   * Stop la sentinelle (utilisé pour tests + lifecycle teardown).
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.started = false;
  }

  /**
   * Retourne snapshot status par provider (lecture seule).
   * Format : { anthropic: 'ok', openai: 'down', groq: 'slow' }.
   */
  getStatus(): Record<ProviderId, HealthStatus> {
    const out = {} as Record<ProviderId, HealthStatus>;
    for (const p of ALL_PROVIDERS) {
      out[p] = this.state.get(p)?.status ?? 'unknown';
    }
    return out;
  }

  /**
   * Détails complets pour UI dashboard (latency, last_ping, errors).
   */
  getDetails(): readonly ProviderHealth[] {
    return ALL_PROVIDERS.map((p) => {
      const found = this.state.get(p);
      if (found) return { ...found };
      return {
        provider: p,
        status: 'unknown' as HealthStatus,
        latency_ms: -1,
        last_ping_ts: 0,
        consecutive_failures: 0,
      };
    });
  }

  /**
   * Liste providers utilisables (status ok ou slow). Down/unknown filtrés.
   * Utilisé par ai-router pour bonifier la chain : prioriser ok > slow > unknown > down.
   */
  getHealthyProviders(): readonly ProviderId[] {
    const ranked: Array<{ provider: ProviderId; rank: number }> = [];
    for (const p of ALL_PROVIDERS) {
      const s = this.state.get(p)?.status ?? 'unknown';
      const rank = s === 'ok' ? 0 : s === 'slow' ? 1 : s === 'unknown' ? 2 : 3;
      ranked.push({ provider: p, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank);
    return ranked.filter((r) => r.rank < 3).map((r) => r.provider);
  }

  /**
   * Force un ping immédiat de tous les providers (utile bouton "Re-tester" UI admin).
   *
   * v13.3.87 P1.11 : utilise PROBE_PROVIDERS (4 providers réels) au lieu d'ALL_PROVIDERS.
   * openclaw est un placeholder fake qui causait faux positifs "DOWN sans alerte".
   * Reset de son state à 'unknown' pour être honnête en UI (pas tester ≠ pas down).
   */
  async pingAll(): Promise<void> {
    await Promise.all(PROBE_PROVIDERS.map((p) => this.pingOne(p)));
    /* openclaw : statut explicite "unknown" car non testé (vs faux "down") */
    for (const p of ALL_PROVIDERS) {
      if (!PROBE_PROVIDERS.includes(p)) {
        this.state.set(p, {
          provider: p,
          status: 'unknown',
          latency_ms: -1,
          last_ping_ts: Date.now(),
          consecutive_failures: 0,
          last_error: 'placeholder endpoint, not probed',
        });
      }
    }
    this.saveToStorage();
  }

  /**
   * Ping un seul provider (utilisé par pingAll + tests unitaires).
   * Public pour permettre re-test ciblé depuis admin UI.
   */
  async pingOne(provider: ProviderId): Promise<ProviderHealth> {
    const url = PING_ENDPOINTS[provider];
    const start = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    let latency = -1;
    let status: HealthStatus = 'down';
    let errMsg: string | undefined;

    try {
      const res = await fetch(url, {
        method: 'OPTIONS',
        signal: ctrl.signal,
      });
      latency = Date.now() - start;
      if (ALIVE_STATUSES.has(res.status)) {
        status = latency > SLOW_THRESHOLD_MS ? 'slow' : 'ok';
      } else {
        status = 'down';
        errMsg = `HTTP ${res.status}`;
      }
    } catch (err: unknown) {
      latency = Date.now() - start;
      const e = err instanceof Error ? err : new Error(String(err));
      errMsg = e.name === 'AbortError' ? 'timeout' : e.message;
      status = 'down';
    } finally {
      clearTimeout(timer);
    }

    const prev = this.state.get(provider);
    const prevFailures = prev?.consecutive_failures ?? 0;
    let consecutive_failures = status === 'down' ? prevFailures + 1 : 0;

    /* Si déjà <3 échecs, on garde ok/slow tant que pas atteint le seuil down strict.
       Mais si 3+ échecs consécutifs → on force "down" même si dernier ping a passé.
       Logique inverse : on respecte la mesure courante si vivant, sinon on accumule. */
    let finalStatus: HealthStatus = status;
    if (status === 'down' && consecutive_failures < DOWN_FAIL_COUNT) {
      /* Pas encore atteint seuil strict, on conserve "slow" (avertissement) plutôt que "down". */
      finalStatus = 'slow';
    } else if (status !== 'down') {
      /* Reset failures sur succès. */
      consecutive_failures = 0;
    }

    const updated: ProviderHealth = {
      provider,
      status: finalStatus,
      latency_ms: latency,
      last_ping_ts: Date.now(),
      consecutive_failures,
      ...(errMsg !== undefined ? { last_error: errMsg } : {}),
    };
    this.state.set(provider, updated);

    if (finalStatus === 'down') {
      logger.warn('ai-providers-health', `${provider} marked DOWN`, {
        consecutive_failures,
        last_error: errMsg,
      });
    } else if (finalStatus === 'slow') {
      logger.info('ai-providers-health', `${provider} slow`, { latency_ms: latency });
    }

    return updated;
  }

  /**
   * Reset complet (force tous "unknown" + clear failures). Utile après changement clé API
   * ou bouton "Reset health" admin.
   */
  reset(): void {
    for (const p of ALL_PROVIDERS) {
      this.state.set(p, {
        provider: p,
        status: 'unknown',
        latency_ms: -1,
        last_ping_ts: 0,
        consecutive_failures: 0,
      });
    }
    this.saveToStorage();
  }

  /**
   * Persiste l'état dans localStorage pour reprise au reload (évite re-ping à chaque navigation).
   */
  private saveToStorage(): void {
    try {
      const arr = Array.from(this.state.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (err: unknown) {
      logger.warn('ai-providers-health', 'storage save failed', { err });
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (
          item &&
          typeof item === 'object' &&
          'provider' in item &&
          typeof (item as { provider: unknown }).provider === 'string'
        ) {
          const ph = item as ProviderHealth;
          if ((ALL_PROVIDERS as readonly string[]).includes(ph.provider)) {
            this.state.set(ph.provider, ph);
          }
        }
      }
    } catch {
      /* silent — corrupted storage = repart de zéro */
    }
  }
}

export const aiProvidersHealth = new AIProvidersHealth();
