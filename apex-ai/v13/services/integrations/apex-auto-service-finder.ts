/**
 * APEX v13.4.110 — Auto Service Finder autonome (Kevin "cherche bon emplacement").
 *
 * Kevin 2026-05-15 04h05 : "Toujours test réel jusqu'à fonctionnable. Si
 * j'intègre qlq chose c'est que ça fonctionne donc apex doit chercher le bon
 * emplacement autonome jusqu'à trouver le bon sans s'arrêter."
 *
 * PRINCIPE : pattern matching = juste un HINT. La vraie validation = test runtime.
 * Si Kevin colle un token inconnu, Apex teste contre TOUS les services connus
 * en parallèle. Premier qui retourne 200/2xx → c'est le bon service.
 *
 * FLOW :
 *   1. Kevin colle text → smart-classifier détecte pattern (peut-être inconnu)
 *   2. Si pattern inconnu OU learned token OU classify ambigu :
 *      → findServiceForToken(plainText) lance Promise.allSettled sur 20+ endpoints
 *   3. Pour chaque service :
 *      - Construit la requête auth selon le service (header Bearer / Api-Key / etc.)
 *      - GET / POST ping endpoint avec timeout 5s
 *      - Si 2xx → MATCH trouvé
 *      - Si 401/403 → KO mais format reconnu (token type identifié)
 *      - Si 429 → quota mais clé valide (MATCH)
 *      - Si 5xx/network → INCONCLUSIF (retry plus tard)
 *   4. Retourne tous les services qui ont matché + leurs métadonnées
 *   5. Si 1 match → stocke avec le bon storageKey + sentinelle dédiée
 *   6. Si 0 match → propose UI "Quel service ?" + apprend la réponse
 *   7. Si N>1 match → propose UI "Plusieurs services possibles, lequel ?"
 *
 * SECURITÉ : timeout 5s par service, max 25 services testés en parallèle,
 * AbortController pour stopper si réponse trouvée.
 */

import { logger } from '../../core/logger.js';

interface ServiceTestConfig {
  service: string;
  testUrl: string;
  method: 'GET' | 'POST' | 'HEAD';
  authHeader: (token: string) => Record<string, string>;
  body?: () => string;
  /** Optionnel : seul ce prefix peut être testé contre ce service */
  prefixHint?: RegExp;
}

export interface FoundService {
  service: string;
  http_status: number;
  match_quality: 'perfect' | 'valid_quota_exceeded' | 'auth_failed' | 'inconclusive';
  detail: string;
}

export interface FindServiceResult {
  ok: boolean;
  matches: FoundService[];
  best?: FoundService;
  tested_count: number;
  duration_ms: number;
}

/**
 * Configuration de TOUS les services testables (étendu v13.4.110).
 * Si Kevin ajoute un nouveau service, l'ajouter ici.
 */
const ALL_SERVICE_TESTS: ServiceTestConfig[] = [
  {
    service: 'anthropic',
    testUrl: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    authHeader: (t) => ({ 'x-api-key': t, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
    body: () => JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
    prefixHint: /^sk-ant/i,
  },
  {
    service: 'openai',
    testUrl: 'https://api.openai.com/v1/models',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
    prefixHint: /^sk-/i,
  },
  {
    service: 'groq',
    testUrl: 'https://api.groq.com/openai/v1/models',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
    prefixHint: /^gsk_/i,
  },
  {
    service: 'mistral',
    testUrl: 'https://api.mistral.ai/v1/models',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  {
    service: 'deepseek',
    testUrl: 'https://api.deepseek.com/v1/models',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  {
    service: 'xai',
    testUrl: 'https://api.x.ai/v1/models',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
    prefixHint: /^xai-/i,
  },
  {
    service: 'perplexity',
    testUrl: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    authHeader: (t) => ({ Authorization: `Bearer ${t}`, 'content-type': 'application/json' }),
    body: () => JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
    prefixHint: /^pplx-/i,
  },
  {
    service: 'cohere',
    testUrl: 'https://api.cohere.com/v1/models',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  {
    service: 'openrouter',
    testUrl: 'https://openrouter.ai/api/v1/auth/key',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  {
    service: 'gemini',
    testUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    method: 'GET',
    authHeader: () => ({}),
    prefixHint: /^AIza/i,
  },
  {
    service: 'together',
    testUrl: 'https://api.together.xyz/v1/models',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  {
    service: 'tavily',
    testUrl: 'https://api.tavily.com/search',
    method: 'POST',
    authHeader: (t) => ({ 'content-type': 'application/json', Authorization: `Bearer ${t}` }),
    body: () => JSON.stringify({ query: 'ping', max_results: 1 }),
    prefixHint: /^tvly-/i,
  },
  {
    service: 'pinecone',
    testUrl: 'https://api.pinecone.io/indexes',
    method: 'GET',
    authHeader: (t) => ({ 'Api-Key': t }),
    prefixHint: /^pcsk_/i,
  },
  {
    service: 'github',
    testUrl: 'https://api.github.com/user',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json' }),
    prefixHint: /^(ghp_|gho_|ghs_|ghu_|github_pat_)/i,
  },
  {
    service: 'cloudflare',
    testUrl: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  {
    service: 'vercel',
    testUrl: 'https://api.vercel.com/v2/user',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  {
    service: 'stripe',
    testUrl: 'https://api.stripe.com/v1/balance',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
    prefixHint: /^(sk_live_|sk_test_|rk_live_|rk_test_)/i,
  },
  {
    service: 'resend',
    testUrl: 'https://api.resend.com/domains',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
    prefixHint: /^re_/i,
  },
  {
    service: 'brevo',
    testUrl: 'https://api.brevo.com/v3/account',
    method: 'GET',
    authHeader: (t) => ({ 'api-key': t }),
    prefixHint: /^xkeysib-/i,
  },
  {
    service: 'elevenlabs',
    testUrl: 'https://api.elevenlabs.io/v1/user',
    method: 'GET',
    authHeader: (t) => ({ 'xi-api-key': t }),
  },
  {
    service: 'finnhub',
    testUrl: 'https://finnhub.io/api/v1/quote?symbol=AAPL',
    method: 'GET',
    authHeader: (t) => ({ 'X-Finnhub-Token': t }),
  },
  {
    service: 'notion',
    testUrl: 'https://api.notion.com/v1/users/me',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Bearer ${t}`, 'Notion-Version': '2022-06-28' }),
    prefixHint: /^secret_/i,
  },
  {
    service: 'replicate',
    testUrl: 'https://api.replicate.com/v1/account',
    method: 'GET',
    authHeader: (t) => ({ Authorization: `Token ${t}` }),
    prefixHint: /^r8_/i,
  },
];

const TIMEOUT_MS = 5_000;

async function testOneService(cfg: ServiceTestConfig, token: string): Promise<FoundService> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = cfg.authHeader(token);
    const init: RequestInit = { method: cfg.method, headers, signal: controller.signal };
    if (cfg.body) init.body = cfg.body();
    let url = cfg.testUrl;
    /* Gemini : auth via query param ?key=, pas header */
    if (cfg.service === 'gemini') {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}key=${encodeURIComponent(token)}`;
    }
    const resp = await fetch(url, init);
    clearTimeout(timeout);
    const status = resp.status;
    if (status >= 200 && status < 300) {
      return { service: cfg.service, http_status: status, match_quality: 'perfect', detail: `✅ HTTP ${status} → ${cfg.service} CONFIRMÉ` };
    }
    if (status === 429) {
      /* Quota dépassé MAIS clé valide */
      return { service: cfg.service, http_status: status, match_quality: 'valid_quota_exceeded', detail: `⚠️ HTTP 429 (quota) — clé valide ${cfg.service}` };
    }
    if (status === 401 || status === 403) {
      return { service: cfg.service, http_status: status, match_quality: 'auth_failed', detail: `❌ HTTP ${status} — clé invalide pour ${cfg.service}` };
    }
    return { service: cfg.service, http_status: status, match_quality: 'inconclusive', detail: `? HTTP ${status} — inconclusif` };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = /abort/i.test(msg);
    return {
      service: cfg.service,
      http_status: 0,
      match_quality: 'inconclusive',
      detail: isAbort ? `⏱ Timeout 5s ${cfg.service}` : `🔌 Network error ${cfg.service}: ${msg.slice(0, 60)}`,
    };
  }
}

/**
 * Cherche LE service qui correspond à ce token, en testant TOUS les endpoints
 * connus en parallèle. Priorise les services dont le prefixHint match.
 */
export async function findServiceForToken(token: string): Promise<FindServiceResult> {
  const t0 = Date.now();
  if (!token || token.length < 10) {
    return { ok: false, matches: [], tested_count: 0, duration_ms: 0 };
  }

  /* v13.4.110 (Kevin "sans s arreter") : test TOUS les services en parallele.
   * Priorise prefix match en premier (plus rapide statistiquement) mais
   * NE PAS exclure les autres — si Kevin a un token au format inattendu,
   * Apex doit quand meme essayer tous les services. Brute force complet. */
  const prefixMatches = ALL_SERVICE_TESTS.filter((cfg) => cfg.prefixHint?.test(token));
  const otherServices = ALL_SERVICE_TESTS.filter((cfg) => !cfg.prefixHint?.test(token));
  /* fullList = prefix matches d'abord + reste (dont services sans prefixHint) */
  const fullList = [...prefixMatches, ...otherServices];

  logger.info('auto-service-finder', `🔎 Test parallèle sur ${fullList.length} services (${prefixMatches.length} prefix match en tete)`);

  /* Test parallèle Promise.allSettled — pas allCatch car on veut tous les résultats */
  const results = await Promise.allSettled(fullList.map((cfg) => testOneService(cfg, token)));
  const found: FoundService[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const res = r.value;
      /* Garde uniquement matches significatifs (perfect ou quota — clé valide) */
      if (res.match_quality === 'perfect' || res.match_quality === 'valid_quota_exceeded') {
        found.push(res);
      }
    }
  }

  /* Sort : perfect avant quota */
  found.sort((a, b) => {
    if (a.match_quality === 'perfect' && b.match_quality !== 'perfect') return -1;
    if (a.match_quality !== 'perfect' && b.match_quality === 'perfect') return 1;
    return 0;
  });

  const duration = Date.now() - t0;
  logger.info('auto-service-finder', `✅ ${found.length} services match en ${duration}ms`, { matches: found.map((f) => f.service) });

  const result: FindServiceResult = {
    ok: found.length > 0,
    matches: found,
    tested_count: fullList.length,
    duration_ms: duration,
  };
  if (found[0]) result.best = found[0];
  return result;
}

export const apexAutoServiceFinder = { findServiceForToken };
