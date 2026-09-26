/**
 * APEX v13.4.128 — Client Cloudflare Worker proxy `apex-secrets-proxy`.
 *
 * Demande Kevin 2026-05-15 : "J'ai rentré dans les secrets tous les codes API.
 * Tu peux tout tester et intégrer ça à Apex dans sa mémoire pour ne pas oublier."
 *
 * PATTERN : Apex n'a JAMAIS les clés API directement. Il appelle un Cloudflare
 * Worker proxy qui détient les clés en env vars Cloudflare (jamais visibles
 * côté client). Le Worker forward avec auth correcte vers les APIs upstream.
 *
 * Sécurité :
 * - PIN admin Kevin SHA-256 envoyé en header `x-apex-pin` pour auth
 * - Worker rejette si PIN invalide → impossible d'abuser depuis client malveillant
 * - Apex IA voit jamais Anthropic_KEY, etc. : il fait juste `fetch('/anthropic/...')`
 *
 * Survit reinstall PWA : Kevin re-saisit juste son PIN admin (déjà persiste
 * via Keychain iOS / iCloud Keychain). Worker URL fixe via Cloudflare DNS.
 */

import { logger } from '../../core/logger.js';

const DEFAULT_WORKER_URL = 'https://apex-secrets-proxy.9r4rxssx64.workers.dev';
const PROXY_URL_STORAGE_KEY = 'apex_v13_secrets_proxy_url';

/* Providers disponibles via le proxy (synced avec wrangler.toml secrets) */
export const PROXY_PROVIDERS = [
  'anthropic',
  'openai',
  'groq',
  'gemini',
  'deepseek',
  'perplexity',
  'tavily',
  'pinecone',
  'telegram',
  'railway',
  'cloudflare',
  'vonage',
  'opn-lego',
  'jwt',
  'emailjs',
  /* v13.4.278 (Kevin "Apex doit avoir accès à tous mes secrets GitHub") :
   * alignés sur PROXY_MAP du worker (sync-apex-secrets-to-cf-worker.yml). */
  'xai',
  'mistral',
  'cohere',
  'together',
  'finnhub',
  'pexels',
  'replicate',
  /* v13.4.345 (Kevin « intègre les IA gratuites ») : Cerebras (~1M tok/jour gratuit,
   * le plus rapide). Route via le proxy dès que le secret CEREBRAS_API_KEY est ajouté. */
  'cerebras',
  /* v13.4.366 (Kevin 2026-09-05 « Fait tourner Apex sur Qwen l'IA gratuite ») : Qwen servi
   * par Cloudflare Workers AI DANS le worker (binding AI, 0 clé, 0 compte tiers). Route
   * /qwen/v1/chat/completions, format OpenAI. Annoncé par /health dès que le binding existe. */
  'qwen',
] as const;

export type ProxyProvider = (typeof PROXY_PROVIDERS)[number];

interface ProxyHealth {
  ok: boolean;
  proxy: string;
  available_providers: string[];
  total: number;
}

interface ProxyFetchOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | FormData | Blob | ArrayBuffer | null;
  signal?: AbortSignal;
}

function getWorkerUrl(): string {
  try {
    const stored = localStorage.getItem(PROXY_URL_STORAGE_KEY);
    /* v13.4.281 — ignore une URL stockée pointant vers l'ancien sous-domaine
     * orphelin `desarzens-kevin` : le worker réel est sur `9r4rxssx64.workers.dev`
     * (sous-domaine du compte). Sans ce garde-fou, une vieille valeur persistée
     * masquerait le DEFAULT corrigé → Cloudflare/Finnhub restent rouges. */
    if (stored && stored.startsWith('https://') && !stored.includes('desarzens-kevin')) {
      return stored.replace(/\/$/, '');
    }
  } catch { /* ignore */ }
  return DEFAULT_WORKER_URL;
}

/**
 * Récupère le PIN admin Kevin hashé SHA-256 (pour header x-apex-pin).
 * Le PIN brut n'est jamais envoyé — seulement son hash. Worker compare
 * avec APEX_ADMIN_PIN_SHA256 env var côté server.
 */
async function getAdminPinHash(): Promise<string | null> {
  try {
    /* Récupère PIN brut depuis vault (chiffré) puis hash */
    const { vault } = await import('../vault/vault.js');
    const pinPlain = await vault.readKey('ax_pin_kdmc_admin');
    if (!pinPlain) {
      /* Fallback : ax_pin global admin (legacy) */
      const fallback = await vault.readKey('ax_pin');
      if (!fallback) return null;
      return sha256Hex(fallback);
    }
    return sha256Hex(pinPlain);
  } catch (err: unknown) {
    logger.warn('secrets-proxy', 'getAdminPinHash failed', { err });
    return null;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Test si le proxy est joignable + liste providers disponibles.
 */
async function checkHealth(): Promise<{ ok: boolean; data?: ProxyHealth; error?: string }> {
  const url = getWorkerUrl();
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const data = (await r.json()) as ProxyHealth;
    return { ok: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.slice(0, 80) };
  }
}

/**
 * Forward une requête API via le proxy Cloudflare.
 *
 * @example
 * // Au lieu de : fetch('https://api.anthropic.com/v1/messages', {headers:{'x-api-key':secretKey}})
 * proxyFetch('anthropic', '/v1/messages', { method:'POST', body: JSON.stringify({...}) })
 */
async function proxyFetch(
  provider: ProxyProvider,
  path: string,
  opts: ProxyFetchOpts = {},
): Promise<Response> {
  const url = getWorkerUrl();
  const pinHash = await getAdminPinHash();
  if (!pinHash) {
    throw new Error('Apex secrets proxy : PIN admin requis (non configuré dans vault)');
  }
  const headers = new Headers(opts.headers ?? {});
  headers.set('x-apex-pin', pinHash);
  if (opts.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const fullUrl = `${url}/${provider}${path.startsWith('/') ? path : '/' + path}`;
  const fetchOpts: RequestInit = {
    method: opts.method ?? 'GET',
    headers,
  };
  if (opts.body !== undefined && opts.body !== null) fetchOpts.body = opts.body;
  if (opts.signal) fetchOpts.signal = opts.signal;
  return fetch(fullUrl, fetchOpts);
}

/**
 * Détecte si le proxy est configuré (au moins workerUrl set) et joignable.
 * Permet au boot de switcher entre mode vault local OU mode proxy server-side.
 */
async function isProxyAvailable(): Promise<boolean> {
  try {
    const r = await checkHealth();
    return r.ok && !!r.data?.available_providers.length;
  } catch {
    return false;
  }
}

/**
 * Définit l'URL du Worker custom (si Kevin déploie sur un sous-domaine).
 * Sinon utilise default `https://apex-secrets-proxy.workers.dev`.
 */
function setWorkerUrl(url: string): void {
  try {
    localStorage.setItem(PROXY_URL_STORAGE_KEY, url.replace(/\/$/, ''));
  } catch { /* quota */ }
}

export const apexSecretsProxy = {
  checkHealth,
  proxyFetch,
  isProxyAvailable,
  setWorkerUrl,
  getWorkerUrl,
  PROXY_PROVIDERS,
};
