/**
 * APEX v13.4.100 — Test RUNTIME credentials (Kevin "teste tout toujours").
 *
 * Pour chaque service connu, pingue son endpoint /me ou équivalent en lisant
 * le credential vault. Retourne status : ok / invalid / rate_limited / quota / network_error.
 *
 * Utilisé par :
 *  - apex-credential-associator.runTest(id) au add d'un credential
 *  - sentinelle credentials-watch quotidienne
 *  - bouton admin "Re-tester tout maintenant"
 *
 * INTERDIT : prétendre qu'un credential fonctionne sans avoir lancé ce test.
 */

import { logger } from '../../core/logger.js';

import { vault } from './vault.js';

export interface TestResult {
  service: string;
  status: 'ok' | 'invalid' | 'rate_limited' | 'quota_exceeded' | 'network_error' | 'untested';
  http_status?: number;
  rate_limit_remaining?: number;
  ts: number;
  detail?: string;
}

/** Configuration test par service connu */
interface ServiceTestConfig {
  /** Clé vault à lire */
  storageKey: string;
  /** URL endpoint pour test (GET ou HEAD) */
  testUrl: string;
  /** Header auth à construire depuis le token */
  authHeader: (token: string) => Record<string, string>;
  /** Méthode HTTP */
  method?: 'GET' | 'HEAD' | 'POST';
  /** Body si POST */
  body?: () => string;
}

const SERVICE_TESTS: Record<string, ServiceTestConfig> = {
  anthropic: {
    storageKey: 'ax_anthropic_key',
    testUrl: 'https://api.anthropic.com/v1/messages',
    /* Anthropic requires POST messages. Use minimal request to check 401 vs 200. */
    method: 'POST',
    authHeader: (t: string) => ({
      'x-api-key': t,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    body: () => JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  },
  openai: {
    storageKey: 'ax_openai_key',
    testUrl: 'https://api.openai.com/v1/models',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  groq: {
    storageKey: 'ax_groq_key',
    testUrl: 'https://api.groq.com/openai/v1/models',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  mistral: {
    storageKey: 'ax_mistral_key',
    testUrl: 'https://api.mistral.ai/v1/models',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  deepseek: {
    storageKey: 'ax_deepseek_key',
    testUrl: 'https://api.deepseek.com/v1/models',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  perplexity: {
    storageKey: 'ax_perplexity_key',
    testUrl: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}`, 'content-type': 'application/json' }),
    body: () => JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  },
  github: {
    storageKey: 'ax_github_token',
    testUrl: 'https://api.github.com/user',
    method: 'GET',
    authHeader: (t: string) => ({
      Authorization: `Bearer ${t}`,
      Accept: 'application/vnd.github+json',
    }),
  },
  /* v13.4.106 (Kevin "no test endpoint configured" pour GitHub PAT classic) :
   * Le pattern v13.4.49 a renommé storageKey en ax_github_pat_classic /
   * ax_github_pat_finegrained. On ajoute les 2 variants ici comme alias. */
  github_pat_classic: {
    storageKey: 'ax_github_pat_classic',
    testUrl: 'https://api.github.com/user',
    method: 'GET',
    authHeader: (t: string) => ({
      Authorization: `Bearer ${t}`,
      Accept: 'application/vnd.github+json',
    }),
  },
  github_pat_finegrained: {
    storageKey: 'ax_github_pat_finegrained',
    testUrl: 'https://api.github.com/user',
    method: 'GET',
    authHeader: (t: string) => ({
      Authorization: `Bearer ${t}`,
      Accept: 'application/vnd.github+json',
    }),
  },
  xai: {
    storageKey: 'ax_xai_key',
    testUrl: 'https://api.x.ai/v1/models',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  /* v13.4.102 (Kevin "no test endpoint configured") — ajout services manquants */
  cohere: {
    storageKey: 'ax_cohere_key',
    testUrl: 'https://api.cohere.com/v1/models',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  openrouter: {
    storageKey: 'ax_openrouter_key',
    testUrl: 'https://openrouter.ai/api/v1/auth/key',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  gemini: {
    storageKey: 'ax_gemini_key',
    /* Google API : auth via query param ?key=, pas header */
    testUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    method: 'GET',
    authHeader: (_t: string) => ({}),
  },
  pinecone: {
    storageKey: 'ax_pinecone_key',
    testUrl: 'https://api.pinecone.io/indexes',
    method: 'GET',
    authHeader: (t: string) => ({ 'Api-Key': t }),
  },
  stripe: {
    storageKey: 'ax_stripe_key',
    testUrl: 'https://api.stripe.com/v1/balance',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  telegram_bot: {
    storageKey: 'ax_telegram_bot_token',
    /* Telegram : token dans URL path, pas header */
    testUrl: '', /* construit dynamiquement dans testRuntime */
    method: 'GET',
    authHeader: () => ({}),
  },
  resend: {
    storageKey: 'ax_resend_key',
    testUrl: 'https://api.resend.com/domains',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  brevo: {
    storageKey: 'ax_brevo_key',
    testUrl: 'https://api.brevo.com/v3/account',
    method: 'GET',
    authHeader: (t: string) => ({ 'api-key': t }),
  },
  elevenlabs: {
    storageKey: 'ax_elevenlabs_key',
    testUrl: 'https://api.elevenlabs.io/v1/user',
    method: 'GET',
    authHeader: (t: string) => ({ 'xi-api-key': t }),
  },
  /* v13.4.108 (Kevin context drop 2026-05-15) — ajout services Kevin stack */
  together: {
    storageKey: 'ax_together_key',
    testUrl: 'https://api.together.xyz/v1/models',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  tavily: {
    storageKey: 'ax_tavily_key',
    /* Tavily POST search avec query minimal */
    testUrl: 'https://api.tavily.com/search',
    method: 'POST',
    authHeader: (t: string) => ({ 'content-type': 'application/json', 'authorization': `Bearer ${t}` }),
    body: () => JSON.stringify({ query: 'ping', max_results: 1 }),
  },
  finnhub: {
    storageKey: 'ax_finnhub_key',
    /* Finnhub : token dans URL query, ping quote AAPL */
    testUrl: 'https://finnhub.io/api/v1/quote?symbol=AAPL',
    method: 'GET',
    authHeader: (t: string) => ({ 'X-Finnhub-Token': t }),
  },
  cloudflare: {
    storageKey: 'ax_cloudflare_token',
    testUrl: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  vercel: {
    storageKey: 'ax_vercel_token',
    testUrl: 'https://api.vercel.com/v2/user',
    method: 'GET',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}` }),
  },
  railway: {
    storageKey: 'ax_railway_token',
    /* Railway GraphQL projects query — compatible avec project-scoped ET
       account-scoped tokens (vs { me } qui exige account scope uniquement) */
    testUrl: 'https://backboard.railway.com/graphql/v2',
    method: 'POST',
    authHeader: (t: string) => ({ Authorization: `Bearer ${t}`, 'content-type': 'application/json' }),
    body: () => JSON.stringify({ query: '{ projects { edges { node { id name } } } }' }),
  },
};

async function testRuntime(service: string): Promise<TestResult> {
  const cfg = SERVICE_TESTS[service.toLowerCase()];
  if (!cfg) {
    return {
      service,
      status: 'untested',
      ts: Date.now(),
      detail: `no test config for service ${service}`,
    };
  }
  let token = '';
  try {
    token = await vault.readKey(cfg.storageKey);
  } catch (err: unknown) {
    return {
      service,
      status: 'network_error',
      ts: Date.now(),
      detail: `vault read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!token || token.length < 10) {
    return {
      service,
      status: 'invalid',
      ts: Date.now(),
      detail: 'token missing or too short',
    };
  }
  try {
    const headers = cfg.authHeader(token);
    const init: RequestInit = {
      method: cfg.method ?? 'GET',
      headers,
    };
    if (cfg.body) init.body = cfg.body();
    /* Timeout 8s pour ne pas bloquer trop longtemps */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    init.signal = controller.signal;
    const resp = await fetch(cfg.testUrl, init);
    clearTimeout(timeout);
    const status = resp.status;
    const rlRemaining = resp.headers.get('x-ratelimit-remaining');
    const rateLimitRemaining = rlRemaining ? parseInt(rlRemaining, 10) : undefined;

    let result: TestResult['status'] = 'untested';
    let detail = `HTTP ${status}`;
    if (status >= 200 && status < 300) {
      result = 'ok';
    } else if (status === 401 || status === 403) {
      result = 'invalid';
      detail = `auth failed HTTP ${status}`;
    } else if (status === 429) {
      result = 'rate_limited';
      detail = `rate limited HTTP 429`;
    } else if (status === 402) {
      result = 'quota_exceeded';
      detail = `quota exceeded HTTP 402`;
    } else if (status >= 500) {
      result = 'network_error';
      detail = `server error HTTP ${status}`;
    } else {
      result = 'invalid';
      detail = `unexpected HTTP ${status}`;
    }
    const out: TestResult = { service, status: result, http_status: status, ts: Date.now(), detail };
    if (rateLimitRemaining !== undefined) out.rate_limit_remaining = rateLimitRemaining;
    return out;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    /* Distinguer abort timeout vs autre */
    const isAbort = /abort/i.test(msg);
    return {
      service,
      status: 'network_error',
      ts: Date.now(),
      detail: isAbort ? 'timeout 8s' : msg.slice(0, 100),
    };
  }
}

async function testAllConfigured(): Promise<TestResult[]> {
  const services = Object.keys(SERVICE_TESTS);
  logger.info('cred-tester', `Running ${services.length} parallel tests`);
  const results = await Promise.allSettled(services.map((s) => testRuntime(s)));
  return results.map((r, i) => {
    const svc = services[i] ?? 'unknown';
    if (r.status === 'fulfilled') return r.value;
    return {
      service: svc,
      status: 'network_error' as const,
      ts: Date.now(),
      detail: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });
}

function isServiceSupported(service: string): boolean {
  return service.toLowerCase() in SERVICE_TESTS;
}

function listSupportedServices(): string[] {
  return Object.keys(SERVICE_TESTS);
}

export { testRuntime, testAllConfigured, isServiceSupported, listSupportedServices };
