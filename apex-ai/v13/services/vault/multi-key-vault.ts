/**
 * APEX v13 — Multi-Key Vault (failover key-level)
 *
 * Demande Kevin 2026-05-07 :
 * "Quand j'ai 2 clés API qui reconnaît de la même famille (Anthropic, Gemini, etc.)
 *  il les stocke et les garde. Si une devient plus fonctionnelle, il enchaîne sur
 *  une autre pour test jusqu'à ce qu'il en ait une qui fonctionne. Et il garde
 *  tout ça en historique."
 *
 * Architecture :
 * - Chaque clé est une `KeyEntry` indépendante (UUID + status + métriques).
 * - Plusieurs clés/service possibles (anthropic#A, anthropic#B, anthropic#C…).
 * - Chiffrement réutilise vault.encryptAuto/decryptAuto (AES-GCM-256 + PBKDF2 200k).
 * - Stockage : `apex_v13_multi_keys` (localStorage + Firebase backup chiffré).
 * - Test endpoint = ping minimal (HEAD/GET light) → ok / latency / reason.
 * - Failover : si current fail → tryFailoverKey() switch sur la suivante par préférence.
 * - Historique : keys "invalid" ne sont JAMAIS supprimées, juste marquées (restorable).
 * - Health status global : green = au moins 1 clé ok partout, yellow = 1+ failing, red = 1+ service entièrement down.
 *
 * Règles CLAUDE.md absolues :
 * - "Anti-blocage IA, auto-déblocage total" → on essaie TOUTES les clés avant d'abandonner
 * - "JAMAIS de réponse vide" → fallback chain key → provider → mode dégradé
 * - "Historique COMPLET admin" → keys archivées, jamais perdues
 */

import { logger } from '../../core/logger.js';
import type { ProxyProvider } from '../integrations/apex-secrets-proxy-client.js';

/* Lazy vault accessor — break circular dep multi-key-vault ↔ vault.
   vault.ts dynamic-imports multi-key-vault.ts (line ~927) ; if we keep
   the static import here, madge reports a cycle. Lazy resolution avoids
   that without changing runtime semantics (vault est singleton instancié
   au boot via core/bootstrap → vault.init()). */
type VaultModule = typeof import('./vault.js');
let _vaultRef: VaultModule['vault'] | null = null;
async function getVault(): Promise<VaultModule['vault']> {
  if (_vaultRef) return _vaultRef;
  const mod = await import('./vault.js');
  _vaultRef = mod.vault;
  return _vaultRef;
}

export type KeyStatus = 'active' | 'failing' | 'rate-limited' | 'invalid' | 'unknown';

export type HealthStatus = 'green' | 'yellow' | 'red';

export interface KeyEntry {
  id: string;
  service: string;
  encrypted: string;
  addedAt: number;
  lastTestedAt?: number;
  lastWorkedAt?: number;
  status: KeyStatus;
  failCount: number;
  successCount: number;
  alias?: string;
  preferredOrder?: number;
  /* Si invalid → on garde history mais on ne tente plus */
  invalidReason?: string;
  invalidAt?: number;
  /* v13.4.284 (Kevin "il perd les infos Identité/Autres/appartements, jamais
   * affichées") : catégorie UI explicite choisie par Kevin (override de la
   * déduction par nom de service) + label « à quoi ça correspond » + kind.
   * kind:'info' = donnée perso non testable (nom, email, adresse, note) → témoin
   * vert « enregistré », jamais de ping API. kind:'secret' (défaut) = clé/token. */
  category?: string;
  label?: string;
  kind?: 'secret' | 'info';
}

export interface KeyTestResult {
  ok: boolean;
  latencyMs: number;
  reason?: string;
}

export interface ServiceStats {
  total: number;
  active: number;
  failing: number;
  invalid: number;
  lastSuccess: number;
}

interface PingConfig {
  url: string;
  method: 'GET' | 'HEAD' | 'POST' | 'OPTIONS';
  buildHeaders: (apiKey: string) => Record<string, string>;
  body?: string;
  /** v13.4.274 — Override URL avec injection apiKey (cas Finnhub `?token=` query param).
   * Si fourni, `url` n'est utilisé que comme fallback. */
  buildUrl?: (apiKey: string) => string;
  /* Statuts considérés comme "clé fonctionnelle" (ex: 200, 400 = body issue mais clé valide).
     401/403/429 par défaut → failing (sauf override). */
}

/** v13.4.279 (Kevin "Finnhub/Railway/Cloudflare ne fonctionnent pas") :
 * ces APIs bloquent le CORS navigateur → le test direct (fetch) échoue toujours,
 * même avec une clé valide → statut "failing/dégradé" trompeur. On les teste VIA
 * LE PROXY apex-secrets-proxy (côté serveur Cloudflare = pas de CORS) qui injecte
 * la clé du worker. Fallback test direct si le proxy est indisponible. */
const PROXY_TEST_PATHS: Record<string, { path: string; method: 'GET' | 'POST'; body?: string }> = {
  cloudflare: { path: '/client/v4/user/tokens/verify', method: 'GET' },
  railway: { path: '/graphql/v2', method: 'POST', body: JSON.stringify({ query: '{ __typename }' }) },
  finnhub: { path: '/api/v1/quote?symbol=AAPL', method: 'GET' },
};

/** v13.4.282 (Kevin « Cloudflare/Railway/Finnhub/Replicate ne fonctionnent pas ») :
 * test FIABLE des providers servis par le proxy = vérifier leur présence dans
 * `available_providers` du `/health` du worker (endpoint OUVERT : pas de PIN, pas
 * de CORS, pas d'appel upstream). Le `proxyFetch` réel dépendait du PIN admin
 * (`x-apex-pin` vs `APEX_ADMIN_PIN_SHA256`) → fragile/401. Le `/health` reflète
 * « le worker a la clé » = ce que Kevin veut voir (vert). Couvre aussi Replicate
 * (absent de PROXY_TEST_PATHS). */
const PROXY_HEALTH_SERVICES = new Set(['cloudflare', 'railway', 'finnhub', 'replicate']);

const STORAGE_KEY = 'apex_v13_multi_keys';
const MAX_FAIL_BEFORE_FAILING = 3;
const HEALTH_RECENT_TEST_MS = 24 * 60 * 60 * 1000; /* < 24h = "testé récemment" */

/**
 * Ping endpoint config par service. Permet test "léger" sans consommer le quota.
 * Si pas configuré, testKey retourne {ok:false, reason:'no test endpoint'}.
 */
const PING_CONFIGS: Record<string, PingConfig> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
    buildHeaders: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ 'x-goog-api-key': apiKey }),
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ 'x-goog-api-key': apiKey }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  perplexity: {
    url: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }),
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  cohere: {
    url: 'https://api.cohere.ai/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  /* v13.4.113 (Kevin "no test endpoint configured" persiste pour github_pat_classic) :
   * Multi-key-vault.testKey utilise PING_CONFIGS, pas apex-credential-tester.
   * Mon fix v13.4.106 était dans le mauvais fichier. Ajout direct ici. */
  github: {
    url: 'https://api.github.com/user',
    method: 'GET',
    buildHeaders: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      accept: 'application/vnd.github+json',
    }),
  },
  github_pat_classic: {
    url: 'https://api.github.com/user',
    method: 'GET',
    buildHeaders: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      accept: 'application/vnd.github+json',
    }),
  },
  github_pat_finegrained: {
    url: 'https://api.github.com/user',
    method: 'GET',
    buildHeaders: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      accept: 'application/vnd.github+json',
    }),
  },
  xai: {
    url: 'https://api.x.ai/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  pinecone: {
    url: 'https://api.pinecone.io/indexes',
    method: 'GET',
    buildHeaders: (apiKey) => ({ 'Api-Key': apiKey }),
  },
  tavily: {
    url: 'https://api.tavily.com/search',
    method: 'POST',
    body: JSON.stringify({ query: 'ping', max_results: 1 }),
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }),
  },
  together: {
    url: 'https://api.together.xyz/v1/models',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  finnhub: {
    /* v13.4.274 (Kevin "Finnhub ne fonctionne pas") : aligné sur la méthode
     * officielle Finnhub (`?token=`) ET sur le worker proxy. Header X-Finnhub-Token
     * marchait aussi mais désaccord = ambiguïté + parfois 401 inutile. */
    url: 'https://finnhub.io/api/v1/quote?symbol=AAPL',
    method: 'GET',
    buildHeaders: () => ({}),
    buildUrl: (apiKey) => `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(apiKey)}`,
  },
  railway: {
    /* v13.4.274 (Kevin "Railway ne fonctionne pas") : nouveau PING_CONFIG.
     * Avant : pas d'endpoint → testKey() retournait "no test endpoint" →
     * statut perpétuel "unknown" → Kevin pense que ça marche pas.
     * Maintenant : POST GraphQL `{__typename}` minimal — 200 si auth OK. */
    url: 'https://backboard.railway.app/graphql/v2',
    method: 'POST',
    body: JSON.stringify({ query: '{ __typename }' }),
    buildHeaders: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  cloudflare: {
    url: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  vercel: {
    url: 'https://api.vercel.com/v2/user',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  stripe: {
    url: 'https://api.stripe.com/v1/balance',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  resend: {
    url: 'https://api.resend.com/domains',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  brevo: {
    url: 'https://api.brevo.com/v3/account',
    method: 'GET',
    buildHeaders: (apiKey) => ({ 'api-key': apiKey }),
  },
  elevenlabs: {
    url: 'https://api.elevenlabs.io/v1/user',
    method: 'GET',
    buildHeaders: (apiKey) => ({ 'xi-api-key': apiKey }),
  },
  notion: {
    url: 'https://api.notion.com/v1/users/me',
    method: 'GET',
    buildHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}`, 'Notion-Version': '2022-06-28' }),
  },
};

/**
 * Génère un ID UUID v4 (sans dépendance externe).
 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  /* Fallback safe random (test env happy-dom). */
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  );
}

class MultiKeyVault {
  private cache: KeyEntry[] | null = null;

  /**
   * Charge l'index complet depuis localStorage (lazy + cache mémoire).
   */
  private load(): KeyEntry[] {
    if (this.cache !== null) return this.cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.cache = [];
        return this.cache;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        this.cache = [];
        return this.cache;
      }
      this.cache = (parsed as KeyEntry[]).filter(
        (e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.service === 'string',
      );
      return this.cache;
    } catch (err: unknown) {
      logger.warn('multi-key-vault', 'load failed (corrupt storage?)', { err });
      this.cache = [];
      return this.cache;
    }
  }

  /**
   * Persiste l'index. Backup Firebase chiffré best-effort (non bloquant).
   */
  private async persist(): Promise<void> {
    const data = this.cache ?? [];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err: unknown) {
      logger.warn('multi-key-vault', 'persist localStorage failed', { err });
    }
    /* Firebase backup chiffré (les `encrypted` champs sont déjà AXENC1: chiffrés,
       donc OK de pousser en clair la liste — chaque entrée reste opaque). */
    try {
      const { firebase, FB_FIX } = await import('../storage/firebase.js');
      if (FB_FIX.includes(STORAGE_KEY)) {
        await firebase.write(STORAGE_KEY, data);
      }
    } catch (err: unknown) {
      logger.debug('multi-key-vault', 'firebase backup skipped (offline ok)', { err });
    }
  }

  /**
   * Ajoute une nouvelle clé pour un service (sans écraser les autres).
   * Si une clé identique (même plaintext) existe déjà → retourne celle-ci sans dup.
   */
  async addKey(
    service: string,
    plaintextValue: string,
    opts?: {
      alias?: string;
      preferredOrder?: number;
      category?: string;
      label?: string;
      kind?: 'secret' | 'info';
    },
  ): Promise<KeyEntry> {
    if (!service || !plaintextValue) {
      throw new Error('addKey: service and plaintextValue required');
    }
    const list = this.load();
    /* Dédupe : si plaintext identique déjà présent → retourne entry existante */
    for (const existing of list) {
      if (existing.service !== service) continue;
      const existingPlain = await (await getVault()).decryptAuto(existing.encrypted).catch(() => null);
      if (existingPlain === plaintextValue) {
        /* Re-active si invalide (Kevin a re-collé une clé qu'on avait marquée morte) */
        if (existing.status === 'invalid' || existing.status === 'failing') {
          existing.status = 'unknown';
          existing.failCount = 0;
          delete existing.invalidReason;
          delete existing.invalidAt;
          await this.persist();
        }
        return { ...existing };
      }
    }
    const encrypted = await (await getVault()).encryptAuto(plaintextValue);
    const entry: KeyEntry = {
      id: uuid(),
      service,
      encrypted,
      addedAt: Date.now(),
      status: 'unknown',
      failCount: 0,
      successCount: 0,
      ...(opts?.alias !== undefined && { alias: opts.alias }),
      ...(opts?.preferredOrder !== undefined && { preferredOrder: opts.preferredOrder }),
      ...(opts?.category !== undefined && opts.category !== '' && { category: opts.category }),
      ...(opts?.label !== undefined && opts.label !== '' && { label: opts.label }),
      ...(opts?.kind !== undefined && { kind: opts.kind }),
    };
    /* kind:'info' → vert « enregistré » direct (rien à pinger). */
    if (entry.kind === 'info') {
      entry.status = 'active';
      entry.successCount = 1;
      entry.lastWorkedAt = Date.now();
    }
    list.push(entry);
    this.cache = list;
    await this.persist();
    /* v13.4.270 (Kevin "Toutes nouvelles informations dois être sauvegardé sûr
     * immédiatement. Auto.") : push IMMÉDIAT du backup chiffré dédié vers
     * Firebase `vault_backup/<uid>/<storageKey>` (force:true bypass throttle
     * 5min). Garantit redondance cross-device dès le collage, sans attendre
     * l'auto-maintenance suivante (1×/h max). Best-effort : si Firebase
     * offline, le push est queueé et flush auto à la reconnexion. */
    try {
      const storageKey = `ax_${service}_key`;
      const { vaultFirebaseBackup } = await import('./vault-firebase-backup.js');
      void vaultFirebaseBackup.push(storageKey, encrypted, { force: true }).catch((err: unknown) => {
        logger.debug('multi-key-vault', `immediate backup skipped for ${service}`, { err });
      });
    } catch (err: unknown) {
      logger.debug('multi-key-vault', 'vault-fb-backup import failed', { err });
    }
    logger.info('multi-key-vault', `addKey ${service} (id=${entry.id.slice(0, 8)}) — backup immédiat déclenché`, {
      alias: entry.alias,
      total_for_service: this.listKeys(service).length,
    });
    return { ...entry };
  }

  /**
   * Liste les clés non-invalides pour un service, triées par préférence (active > unknown > rate-limited > failing).
   * Les entrées "invalid" sont en historique (filtrées ici par défaut).
   */
  listKeys(service: string, includeInvalid = false): KeyEntry[] {
    const all = this.load().filter((k) => k.service === service);
    const filtered = includeInvalid ? all : all.filter((k) => k.status !== 'invalid');
    return [...filtered].sort((a, b) => {
      /* preferredOrder explicite gagne (plus petit = priorité) */
      if (a.preferredOrder !== undefined && b.preferredOrder !== undefined) {
        return a.preferredOrder - b.preferredOrder;
      }
      if (a.preferredOrder !== undefined) return -1;
      if (b.preferredOrder !== undefined) return 1;
      /* Sinon : status rank, puis lastWorkedAt récent en priorité */
      const rank = (s: KeyStatus): number => {
        switch (s) {
          case 'active':
            return 0;
          case 'unknown':
            return 1;
          case 'rate-limited':
            return 2;
          case 'failing':
            return 3;
          case 'invalid':
            return 4;
        }
      };
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      return (b.lastWorkedAt ?? 0) - (a.lastWorkedAt ?? 0);
    });
  }

  /**
   * Liste TOUTES les clés (tous services, incl. invalides) — pour UI admin globale.
   */
  listAll(includeInvalid = true): KeyEntry[] {
    const all = this.load();
    return includeInvalid ? [...all] : all.filter((k) => k.status !== 'invalid');
  }

  /**
   * v13.3.54 — Dédoublication automatique (Kevin "je ne peux pas effacer les doublons api anthropic").
   *
   * Détecte clés multiples du même service avec :
   * - Même encryptedValue (vraies copies — supprime toutes sauf 1)
   * - Status invalid + une autre du même service active → supprime invalide
   * - Plusieurs actives même service → garde la plus récemment testée/ajoutée
   *
   * Returns : { dedupedCount, kept }
   */
  dedupAuto(opts?: { dryRun?: boolean }): { dedupedCount: number; kept: { service: string; id: string }[] } {
    const all = this.load();
    const dryRun = opts?.dryRun ?? false;
    const byServiceValue = new Map<string, KeyEntry[]>(); /* group by service + encryptedValue (true duplicates) */
    const byService = new Map<string, KeyEntry[]>(); /* group by service (decide best) */

    for (const entry of all) {
      const groupKey = `${entry.service}::${entry.encrypted}`;
      const arr = byServiceValue.get(groupKey) ?? [];
      arr.push(entry);
      byServiceValue.set(groupKey, arr);

      const svcArr = byService.get(entry.service) ?? [];
      svcArr.push(entry);
      byService.set(entry.service, svcArr);
    }

    const toRemove = new Set<string>();
    const kept: { service: string; id: string }[] = [];

    /* Phase 1 : exact duplicates (same encryptedValue) → keep most recent */
    for (const [, group] of byServiceValue) {
      if (group.length <= 1) continue;
      group.sort((a, b) => (b.lastTestedAt ?? b.addedAt) - (a.lastTestedAt ?? a.addedAt));
      kept.push({ service: group[0]!.service, id: group[0]!.id });
      for (let i = 1; i < group.length; i++) toRemove.add(group[i]!.id);
    }

    /* Phase 2 : same service, multiple active + invalid → remove invalids */
    for (const [, group] of byService) {
      if (group.length <= 1) continue;
      const actives = group.filter((g) => g.status !== 'invalid');
      const invalids = group.filter((g) => g.status === 'invalid');
      if (actives.length >= 1 && invalids.length > 0) {
        for (const inv of invalids) toRemove.add(inv.id);
      }
    }

    if (dryRun) {
      return { dedupedCount: toRemove.size, kept };
    }

    if (toRemove.size > 0) {
      for (const id of toRemove) {
        try {
          this.removeKey(id);
        } catch (err: unknown) {
          logger.warn('multi-key-vault', 'dedupAuto removeKey failed', { id, err });
        }
      }
      logger.info('multi-key-vault', `🧹 dedupAuto removed ${toRemove.size} duplicate keys`);
    }

    return { dedupedCount: toRemove.size, kept };
  }

  /**
   * Récupère LA clé courante (la meilleure dispo) pour un service.
   * Retourne {keyId, plaintext} ou null si aucune clé utilisable.
   */
  async getCurrentKey(service: string): Promise<{ keyId: string; plaintext: string } | null> {
    const candidates = this.listKeys(service).filter(
      (k) => k.status === 'active' || k.status === 'unknown' || k.status === 'rate-limited',
    );
    if (candidates.length === 0) {
      /* fallback : tente même les "failing" (mieux que rien) */
      const fallback = this.listKeys(service).filter((k) => k.status === 'failing');
      if (fallback.length === 0) return null;
      const first = fallback[0];
      if (!first) return null;
      const plain = await (await getVault()).decryptAuto(first.encrypted);
      if (plain === null) return null;
      return { keyId: first.id, plaintext: plain };
    }
    const best = candidates[0];
    if (!best) return null;
    const plain = await (await getVault()).decryptAuto(best.encrypted);
    if (plain === null) {
      logger.warn('multi-key-vault', 'getCurrentKey decrypt failed', { keyId: best.id });
      return null;
    }
    return { keyId: best.id, plaintext: plain };
  }

  /**
   * Test une clé spécifique. Met à jour status + métriques.
   * Retourne {ok, latencyMs, reason}.
   */
  async testKey(keyId: string): Promise<KeyTestResult> {
    const list = this.load();
    const entry = list.find((k) => k.id === keyId);
    if (!entry) return { ok: false, latencyMs: 0, reason: 'key not found' };
    /* v13.4.284 — entrée info (nom/email/adresse/note) : rien à pinger, elle est
     * « enregistrée » → témoin vert direct, jamais marquée failing/invalid. */
    if (entry.kind === 'info') {
      entry.status = 'active';
      entry.failCount = 0;
      entry.successCount += 1;
      entry.lastTestedAt = Date.now();
      entry.lastWorkedAt = Date.now();
      await this.persist();
      return { ok: true, latencyMs: 0, reason: 'info (enregistré)' };
    }
    /* v13.4.283 — providers servis par le proxy : test via /health (membership)
     * AVANT la vérif PING_CONFIG (Replicate n'a PAS de PING_CONFIG → renvoyait
     * « no test endpoint configured » et ne testait jamais). Sans PIN, sans CORS,
     * sans appel upstream. Matching insensible à la casse. */
    if (PROXY_HEALTH_SERVICES.has(entry.service.toLowerCase())) {
      const t0 = Date.now();
      try {
        const { apexSecretsProxy } = await import('../integrations/apex-secrets-proxy-client.js');
        const h = await apexSecretsProxy.checkHealth();
        if (h.ok && h.data) {
          entry.lastTestedAt = Date.now();
          const present = h.data.available_providers.some(
            (p) => p.toLowerCase() === entry.service.toLowerCase(),
          );
          if (present) {
            entry.status = 'active';
            entry.failCount = 0;
            entry.successCount += 1;
            entry.lastWorkedAt = Date.now();
            await this.persist();
            return { ok: true, latencyMs: Date.now() - t0 };
          }
          this.markEntryStatus(entry, 'failing', 'non configuré dans le proxy (clé absente côté worker)');
          await this.persist();
          return { ok: false, latencyMs: Date.now() - t0, reason: 'non configuré (proxy)' };
        }
      } catch {
        /* /health KO → on continue vers la logique normale ci-dessous */
      }
    }
    const config = PING_CONFIGS[entry.service];
    if (!config) {
      /* Pas de ping endpoint configuré : on ne peut pas tester, on conserve unknown */
      entry.lastTestedAt = Date.now();
      await this.persist();
      return { ok: false, latencyMs: 0, reason: 'no test endpoint configured' };
    }
    /* v13.3.21 (Kevin "decrypt failed" 2026-05-07) :
     * Use decryptDetailed pour distinguer decrypt_failed (recoverable) de bad_format (corruption).
     * Si decrypt_failed → status 'failing' (pas 'invalid' définitif) pour permettre retry après recover. */
    const detailed = await (await getVault()).decryptDetailed(entry.encrypted);
    if (!detailed.ok) {
      const reason = detailed.reason ?? 'decrypt_failed';
      if (reason === 'decrypt_failed') {
        /* RECOVERABLE : Kevin peut recoller la clé via UI "Récupérer".
         * Status = 'failing' (pas 'invalid') pour ne pas archiver définitivement. */
        this.markEntryStatus(entry, 'failing', 'decrypt_failed (passphrase rotation?) — recolle pour récupérer');
        await this.persist();
        return { ok: false, latencyMs: 0, reason: 'decrypt_failed' };
      }
      /* bad_format ou no_passphrase → invalid (corruption ou edge case rare) */
      this.markEntryStatus(entry, 'invalid', reason);
      await this.persist();
      return { ok: false, latencyMs: 0, reason };
    }
    const plain = detailed.plaintext as string;
    const start = Date.now();
    try {
      let res: Response | null = null;
      /* v13.4.279 — providers CORS-bloqués : test via le proxy server-side. */
      const pt = PROXY_TEST_PATHS[entry.service];
      if (pt) {
        try {
          const { apexSecretsProxy } = await import('../integrations/apex-secrets-proxy-client.js');
          if (await apexSecretsProxy.isProxyAvailable()) {
            res = await apexSecretsProxy.proxyFetch(entry.service as ProxyProvider, pt.path, {
              method: pt.method,
              body: pt.body ?? null,
              signal: AbortSignal.timeout(8000),
            });
          }
        } catch {
          res = null; /* proxy indispo → fallback direct ci-dessous */
        }
      }
      if (res === null) {
        const init: RequestInit = {
          method: config.method,
          headers: config.buildHeaders(plain),
          signal: AbortSignal.timeout(8000),
        };
        if (config.body !== undefined) init.body = config.body;
        /* v13.4.274 — buildUrl override (cas Finnhub `?token=` injecté). */
        const targetUrl = config.buildUrl ? config.buildUrl(plain) : config.url;
        res = await fetch(targetUrl, init);
      }
      const latency = Date.now() - start;
      const status = res.status;
      entry.lastTestedAt = Date.now();
      if (status === 401 || status === 403) {
        this.markEntryStatus(entry, 'invalid', `HTTP ${status}`);
        await this.persist();
        return { ok: false, latencyMs: latency, reason: `HTTP ${status}` };
      }
      if (status === 429) {
        this.markEntryStatus(entry, 'rate-limited', 'HTTP 429');
        await this.persist();
        return { ok: false, latencyMs: latency, reason: 'rate-limited' };
      }
      if (status >= 500) {
        this.bumpFailCount(entry, `HTTP ${status}`);
        await this.persist();
        return { ok: false, latencyMs: latency, reason: `HTTP ${status}` };
      }
      /* 2xx, 4xx (≠ 401/403/429) = clé fonctionnelle (l'API a accepté l'auth) */
      entry.status = 'active';
      entry.failCount = 0;
      entry.successCount += 1;
      entry.lastWorkedAt = Date.now();
      await this.persist();
      return { ok: true, latencyMs: latency };
    } catch (err: unknown) {
      const latency = Date.now() - start;
      const e = err instanceof Error ? err : new Error(String(err));
      const reason = e.name === 'AbortError' ? 'timeout' : e.message;
      entry.lastTestedAt = Date.now();
      this.bumpFailCount(entry, reason);
      await this.persist();
      return { ok: false, latencyMs: latency, reason };
    }
  }

  /**
   * Failover : si current key fail, switch sur la prochaine candidate.
   * Marque la précédente "failing" et tente la suivante. Retourne la nouvelle clé ou null.
   */
  async tryFailoverKey(
    service: string,
    currentKeyId: string,
    error: string,
  ): Promise<{ keyId: string; plaintext: string } | null> {
    const list = this.load();
    const current = list.find((k) => k.id === currentKeyId);
    if (current) {
      this.bumpFailCount(current, error);
      /* Si erreur explicite auth → invalide direct */
      if (/401|403|invalid.api.key|unauthor/i.test(error)) {
        this.markEntryStatus(current, 'invalid', error);
      } else if (/429|rate.limit|quota/i.test(error)) {
        this.markEntryStatus(current, 'rate-limited', error);
      }
      await this.persist();
    }
    /* Cherche prochaine clé du même service hors current */
    const candidates = this.listKeys(service).filter(
      (k) => k.id !== currentKeyId && (k.status === 'active' || k.status === 'unknown' || k.status === 'rate-limited'),
    );
    if (candidates.length === 0) {
      /* Dernier recours : essaie une "failing" hors current */
      const fb = this.listKeys(service).filter((k) => k.id !== currentKeyId && k.status === 'failing');
      if (fb.length === 0) return null;
      const first = fb[0];
      if (!first) return null;
      const plain = await (await getVault()).decryptAuto(first.encrypted);
      if (plain === null) return null;
      logger.info('multi-key-vault', `failover ${service} → failing fallback ${first.id.slice(0, 8)}`);
      return { keyId: first.id, plaintext: plain };
    }
    const next = candidates[0];
    if (!next) return null;
    const plain = await (await getVault()).decryptAuto(next.encrypted);
    if (plain === null) return null;
    logger.info('multi-key-vault', `failover ${service} → switched to ${next.id.slice(0, 8)}`);
    return { keyId: next.id, plaintext: plain };
  }

  /**
   * Stats agrégées par service.
   */
  getStats(service: string): ServiceStats {
    const all = this.load().filter((k) => k.service === service);
    const stats: ServiceStats = {
      total: all.length,
      active: 0,
      failing: 0,
      invalid: 0,
      lastSuccess: 0,
    };
    for (const k of all) {
      if (k.status === 'active') stats.active += 1;
      else if (k.status === 'failing') stats.failing += 1;
      else if (k.status === 'invalid') stats.invalid += 1;
      if ((k.lastWorkedAt ?? 0) > stats.lastSuccess) stats.lastSuccess = k.lastWorkedAt ?? 0;
    }
    return stats;
  }

  /**
   * Liste services dont TOUTES les clés sont down (failing/invalid) — déclenche lumière rouge.
   */
  getServicesDown(): string[] {
    const list = this.load();
    const services = new Set<string>();
    for (const k of list) services.add(k.service);
    const down: string[] = [];
    for (const s of services) {
      const keys = list.filter((k) => k.service === s);
      if (keys.length === 0) continue;
      const allBad = keys.every((k) => k.status === 'failing' || k.status === 'invalid');
      if (allBad) down.push(s);
    }
    return down;
  }

  /**
   * Liste les services qui ont au moins une clé failing/invalid mais aussi au moins une OK.
   * Sert à la lumière jaune.
   */
  getServicesPartial(): string[] {
    const list = this.load();
    const services = new Set<string>();
    for (const k of list) services.add(k.service);
    const partial: string[] = [];
    for (const s of services) {
      const keys = list.filter((k) => k.service === s);
      const hasGood = keys.some((k) => k.status === 'active' || k.status === 'unknown');
      const hasBad = keys.some(
        (k) => k.status === 'failing' || k.status === 'invalid' || k.status === 'rate-limited',
      );
      if (hasGood && hasBad) partial.push(s);
    }
    return partial;
  }

  /**
   * Statut santé global pour lumière dashboard.
   * - green : aucun service down + aucun service partial
   * - yellow : ≥ 1 service partial (1+ failing mais autre OK)
   * - red : ≥ 1 service entier down
   */
  getHealthStatus(): HealthStatus {
    if (this.load().length === 0) return 'green'; /* aucune clé = pas de panne */
    const down = this.getServicesDown();
    if (down.length > 0) return 'red';
    const partial = this.getServicesPartial();
    if (partial.length > 0) return 'yellow';
    return 'green';
  }

  /**
   * Re-test toutes les clés failing/unknown (sentinelle 30 min).
   * - skip celles testées < 5 min
   * - skip "invalid" (history figée)
   * - swap auto si une "failing" redevient "active" → log info
   */
  async healthCheckAll(): Promise<{ tested: number; recovered: number; stillDown: number }> {
    const list = this.load();
    const now = Date.now();
    let tested = 0;
    let recovered = 0;
    let stillDown = 0;
    for (const entry of list) {
      if (entry.status === 'invalid') continue;
      if (entry.lastTestedAt !== undefined && now - entry.lastTestedAt < 5 * 60 * 1000) continue;
      const before = entry.status;
      const result = await this.testKey(entry.id);
      tested += 1;
      if (result.ok && (before === 'failing' || before === 'rate-limited')) {
        recovered += 1;
        logger.info('multi-key-vault', `🔄 ${entry.service}#${entry.id.slice(0, 8)} recovered`);
      }
      if (!result.ok && entry.status === 'failing') {
        /* 'invalid' déjà filtré ligne 534 (continue) */
        stillDown += 1;
      }
    }
    return { tested, recovered, stillDown };
  }

  /**
   * Marque une clé invalide explicitement (admin force) → archive history.
   */
  markInvalid(keyId: string, reason: string): void {
    const list = this.load();
    const entry = list.find((k) => k.id === keyId);
    if (!entry) return;
    this.markEntryStatus(entry, 'invalid', reason);
    void this.persist();
  }

  /**
   * v13.4.284 — met à jour les métadonnées d'affichage (catégorie / label « à quoi
   * ça correspond » / kind) sans toucher à la valeur chiffrée. Utilisé par le
   * modal Modifier du Coffre. Champ omis = inchangé ; chaîne vide = effacé.
   */
  setMeta(
    keyId: string,
    patch: { category?: string; label?: string; alias?: string; kind?: 'secret' | 'info' },
  ): boolean {
    const list = this.load();
    const entry = list.find((k) => k.id === keyId);
    if (!entry) return false;
    if (patch.category !== undefined) {
      if (patch.category === '') delete entry.category;
      else entry.category = patch.category;
    }
    if (patch.label !== undefined) {
      if (patch.label === '') delete entry.label;
      else entry.label = patch.label;
    }
    if (patch.alias !== undefined) {
      if (patch.alias === '') delete entry.alias;
      else entry.alias = patch.alias;
    }
    if (patch.kind !== undefined) {
      entry.kind = patch.kind;
      if (patch.kind === 'info' && entry.status === 'unknown') {
        entry.status = 'active';
        entry.lastWorkedAt = Date.now();
      }
    }
    void this.persist();
    return true;
  }

  /**
   * Restore une clé depuis history (admin re-vérifie). Status redevient unknown.
   */
  restoreKey(keyId: string): void {
    const list = this.load();
    const entry = list.find((k) => k.id === keyId);
    if (!entry) return;
    entry.status = 'unknown';
    entry.failCount = 0;
    delete entry.invalidReason;
    delete entry.invalidAt;
    void this.persist();
  }

  /**
   * Supprime définitivement une clé (admin). Préfère markInvalid (garde history).
   *
   * v13.3.51 fix Kevin "j'ai déjà fait poubelle plusieurs fois mais il se remet" :
   * Marque la storage_key dans `ax_credentials_deleted` whitelist pour empêcher
   * vault.startCredentialsWatch() poll 30s de restaurer depuis IDB shadow.
   * Aussi : removeItem localStorage + delete IDB shadow + Firebase null pour
   * propagation triple persistence.
   */
  removeKey(keyId: string): void {
    const list = this.load();
    const entry = list.find((k) => k.id === keyId);
    const keep = list.filter((k) => k.id !== keyId);
    this.cache = keep;
    void this.persist();

    if (!entry) return;

    /* Marque la storage_key comme volontairement supprimée */
    try {
      const storageKey = `ax_${entry.service ?? 'unknown'}_key`;
      const deleted = JSON.parse(localStorage.getItem('ax_credentials_deleted') ?? '[]') as string[];
      if (Array.isArray(deleted) && !deleted.includes(storageKey)) {
        deleted.push(storageKey);
        if (deleted.length > 200) deleted.shift(); /* cap FIFO */
        localStorage.setItem('ax_credentials_deleted', JSON.stringify(deleted));
      }
      /* Triple cleanup : localStorage + IDB shadow + Firebase null */
      localStorage.removeItem(storageKey);
      void import('./vault.js').then(({ vault }) => {
        try { void (vault as { _deleteFromIdb?: (k: string) => Promise<void> })._deleteFromIdb?.(storageKey); } catch { /* ignore */ }
      }).catch(() => { /* ignore */ });
      void import('../storage/firebase.js').then(({ firebase }) => {
        try { void firebase.write(storageKey, null); } catch { /* ignore */ }
      }).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }

  /**
   * Renomme alias.
   */
  setAlias(keyId: string, alias: string): void {
    const entry = this.load().find((k) => k.id === keyId);
    if (!entry) return;
    entry.alias = alias;
    void this.persist();
  }

  /**
   * Définit ordre préférentiel (plus petit = priorité). undefined = retour auto.
   */
  setPreferredOrder(keyId: string, order: number | undefined): void {
    const entry = this.load().find((k) => k.id === keyId);
    if (!entry) return;
    if (order === undefined) delete entry.preferredOrder;
    else entry.preferredOrder = order;
    void this.persist();
  }

  /**
   * Export complet (encrypted intact). Pour migration / backup user.
   */
  exportAllEncrypted(): string {
    return JSON.stringify(this.load());
  }

  /**
   * Import depuis backup. Merge non destructif (skip si id déjà présent).
   */
  importEncrypted(data: string): { imported: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return { imported: 0 };
    }
    if (!Array.isArray(parsed)) return { imported: 0 };
    const list = this.load();
    const existingIds = new Set(list.map((k) => k.id));
    let imported = 0;
    for (const item of parsed as KeyEntry[]) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.id !== 'string' || typeof item.service !== 'string') continue;
      if (typeof item.encrypted !== 'string') continue;
      if (existingIds.has(item.id)) continue;
      list.push(item);
      imported += 1;
    }
    this.cache = list;
    void this.persist();
    logger.info('multi-key-vault', `imported ${imported} keys`);
    return { imported };
  }

  /**
   * Reset complet (tests). Vide localStorage + cache.
   */
  resetAll(): void {
    this.cache = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /**
   * Force re-load depuis localStorage (utile pour tests + sync cross-tab).
   * Ignore le cache mémoire. À utiliser après injection externe de localStorage.
   */
  reloadFromStorage(): void {
    this.cache = null;
    this.load();
  }

  /**
   * v13.3.21 (Kevin fix "decrypt failed") :
   * Liste les clés dont le decrypt a échoué (failing avec invalidReason "decrypt_failed").
   * Utilisé par UI "Récupérer cette clé" + sentinelle decrypt-watch.
   */
  listDecryptFailed(): KeyEntry[] {
    return this.load().filter((k) => {
      if (k.status !== 'failing') return false;
      const reason = k.invalidReason ?? '';
      return /decrypt_failed|decrypt failed|passphrase rotation/i.test(reason);
    });
  }

  /**
   * v13.3.21 (Kevin fix "decrypt failed") :
   * Récupération clé : Kevin recolle plaintext, on re-chiffre avec passphrase courante,
   * on remplace l'ancien encrypted, on remet status à 'unknown' pour re-test.
   */
  async recoverKey(keyId: string, plaintextValue: string): Promise<{ ok: boolean; reason?: string }> {
    if (!plaintextValue || !plaintextValue.trim()) {
      return { ok: false, reason: 'Valeur vide' };
    }
    const list = this.load();
    const entry = list.find((k) => k.id === keyId);
    if (!entry) return { ok: false, reason: 'Clé non trouvée' };
    try {
      entry.encrypted = await (await getVault()).encryptAuto(plaintextValue.trim());
      entry.status = 'unknown';
      entry.failCount = 0;
      delete entry.invalidReason;
      delete entry.invalidAt;
      await this.persist();
      logger.info('multi-key-vault', `✅ recoverKey ${entry.service}#${entry.id.slice(0, 8)} (re-chiffré + reset status)`);
      return { ok: true };
    } catch (err: unknown) {
      logger.error('multi-key-vault', 'recoverKey failed', { err, keyId });
      return { ok: false, reason: String(err).slice(0, 200) };
    }
  }

  /**
   * Liste tous les services connus (clés présentes au moins 1).
   */
  getKnownServices(): string[] {
    const services = new Set<string>();
    for (const k of this.load()) services.add(k.service);
    return Array.from(services).sort();
  }

  /**
   * UI helper : couleur lumière par service (vert/jaune/rouge/gris).
   */
  getServiceLight(service: string): 'green' | 'yellow' | 'red' | 'gray' {
    const keys = this.load().filter((k) => k.service === service);
    if (keys.length === 0) return 'gray';
    const hasActive = keys.some(
      (k) => k.status === 'active' && (Date.now() - (k.lastTestedAt ?? 0)) < HEALTH_RECENT_TEST_MS,
    );
    const hasUsable = keys.some((k) => k.status === 'active' || k.status === 'unknown');
    const allBad = keys.every((k) => k.status === 'failing' || k.status === 'invalid');
    const allRateLimited = keys.every((k) => k.status === 'rate-limited');
    if (allBad) return 'red';
    if (allRateLimited) return 'yellow';
    if (hasActive) return 'green';
    if (hasUsable) {
      /* Si au moins 1 failing/rate-limited mais d'autres OK → jaune */
      const hasBad = keys.some(
        (k) => k.status === 'failing' || k.status === 'invalid' || k.status === 'rate-limited',
      );
      return hasBad ? 'yellow' : 'gray';
    }
    return 'gray';
  }

  /* === Internals === */

  private bumpFailCount(entry: KeyEntry, reason: string): void {
    entry.failCount += 1;
    entry.lastTestedAt = Date.now();
    if (entry.failCount >= MAX_FAIL_BEFORE_FAILING && entry.status !== 'invalid') {
      this.markEntryStatus(entry, 'failing', reason);
    } else if (entry.status === 'active' || entry.status === 'unknown') {
      /* Sub-threshold : on garde 'unknown' tant qu'on n'a pas atteint 3 fails */
      entry.status = 'unknown';
    }
  }

  private markEntryStatus(entry: KeyEntry, status: KeyStatus, reason: string): void {
    entry.status = status;
    if (status === 'invalid') {
      entry.invalidReason = reason;
      entry.invalidAt = Date.now();
    }
  }

  /**
   * v13.4.266 (Kevin "diag dit 14 clés mais visuel coffre = juste Anthropic") :
   * MIGRATION des clés legacy flat localStorage → coffre central.
   *
   * Cause racine : avant l'introduction du multi-key-vault (apex_v13_multi_keys),
   * Apex stockait chaque clé API dans une storage_key flat dédiée (ax_anthropic_key,
   * ax_openai_key, etc.) chiffrée AXENC1:. L'UI Coffre (buildCredentialDisplays())
   * lit uniquement le coffre central — les clés flat restent invisibles.
   *
   * Cette fonction :
   * 1. Scanne localStorage pour clés `ax_*_key`, `ax_*_token`, `ax_*_secret`,
   *    `apex_v13_*_key` chiffrées AXENC1:
   * 2. Pour chacune : tente decrypt + dérive service depuis storage_key
   * 3. Si service IA valide ET pas déjà présent dans le coffre → addKey()
   * 4. Skip les tokens infra (push_admin_token, jwt_secret, etc.)
   *
   * Lecture seule sur localStorage (n'efface PAS les clés flat). Le user peut
   * relancer sans risque.
   */
  async migrateLegacyFlatKeys(): Promise<{
    scanned: number;
    migrated: number;
    failed: number;
    skipped: number;
    details: Array<{ key: string; status: 'migrated' | 'failed' | 'skipped'; reason?: string }>;
  }> {
    const result = {
      scanned: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      details: [] as Array<{ key: string; status: 'migrated' | 'failed' | 'skipped'; reason?: string }>,
    };
    /* Skip ces préfixes : tokens d'infrastructure pas exposés comme "clés API" */
    const SKIP_PREFIXES = [
      'apex_v13_push_admin_token',
      'apex_v13_pin',
      'apex_v13_user',
      'apex_v13_passphrase',
      'apex_v13_device',
      'apex_v13_vault_fb',
      'apex_v13_multi_keys',
    ];
    /* v13.4.267 (Kevin "bcp de clefs non fonctionnelles + liens pas bons") :
     * Table d'alias storage_key → service canonique. Sans ça :
     *   ax_cloudflare_global_key → service 'cloudflare_global' (absent de
     *   PING_CONFIGS + linksRegistry) → test échoue + lien invalide.
     * Avec : alias mappe vers le nom canonique connu des registres. */
    const STORAGE_KEY_ALIAS: Record<string, string> = {
      /* Cloudflare : 3 variantes de storage key → 1 service canonique */
      ax_cloudflare_global_key: 'cloudflare',
      ax_cloudflare_auth_token: 'cloudflare',
      ax_cloudflare_token: 'cloudflare',
      ax_cloudflare_api_token: 'cloudflare',
      /* GitHub : storage keys spécifiques mais PING_CONFIGS connaît les 2 sous-types */
      ax_github_token: 'github',
      ax_github_oauth: 'github',
      /* Google / Gemini parfois confondus */
      ax_google_key: 'google',
      ax_youtube_key: 'google',
      /* Railway : token infra, pas une clé API d'inférence — on l'importe
       * quand même pour traçabilité, mais sans endpoint test (le service
       * "railway" n'a pas de PING_CONFIG, le testKey retournera "no test
       * endpoint" proprement). */
      ax_railway_token: 'railway',
      /* Telegram bot : idem, infra not inference */
      ax_telegram_token: 'telegram',
      ax_telegram_bot_token: 'telegram',
      /* Stripe : 2 variantes (live/test) → service canonique 'stripe' */
      ax_stripe_sk: 'stripe',
      ax_stripe_pk: 'stripe',
      /* Pinecone alias */
      ax_pinecone_api_key: 'pinecone',
      /* Resend / Brevo alias */
      ax_brevo_smtp_key: 'brevo',
    };
    /* Aussi : SKIP_KEY_EXACT — storage keys qui ne sont PAS des clés API
     * d'inférence (identifiants persos, tags, emails). On ne les migre pas. */
    const SKIP_KEY_EXACT = new Set([
      'ax_kevin_whatsapp_phone',
      'ax_paypal_email',
      'ax_revolut_tag',
      'ax_lydia_tag',
      'ax_iban_nom',
      'ax_iban',
      'ax_bic',
      'ax_btc_address',
      'ax_eth_address',
    ]);
    /* Pattern → service IA. Si la storage_key matche, on l'importe avec ce service. */
    const flatKeys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!(k.startsWith('ax_') || k.startsWith('apex_v13_'))) continue;
        if (!(k.endsWith('_key') || k.endsWith('_token') || k.endsWith('_secret'))) continue;
        if (SKIP_PREFIXES.some((p) => k.startsWith(p))) continue;
        if (SKIP_KEY_EXACT.has(k)) continue;
        const v = localStorage.getItem(k);
        if (!v || !v.startsWith('AXENC1:')) continue;
        flatKeys.push(k);
      }
    } catch {
      /* localStorage indispo */
    }
    result.scanned = flatKeys.length;
    if (flatKeys.length === 0) return result;
    const vault = await getVault();
    for (const storageKey of flatKeys) {
      try {
        const encrypted = localStorage.getItem(storageKey);
        if (!encrypted) {
          result.failed += 1;
          result.details.push({ key: storageKey, status: 'failed', reason: 'storage_disappeared' });
          continue;
        }
        /* v13.4.267 : alias table d'abord, sinon dérivation littérale.
         * Ex : `ax_cloudflare_global_key` → 'cloudflare' (via alias) au lieu de 'cloudflare_global'. */
        let service = STORAGE_KEY_ALIAS[storageKey];
        if (!service) {
          service = storageKey
            .replace(/^ax_/, '')
            .replace(/^apex_v13_/, '')
            .replace(/_(key|token|secret)$/, '');
        }
        if (!service) {
          result.skipped += 1;
          result.details.push({ key: storageKey, status: 'skipped', reason: 'service_unknown' });
          continue;
        }
        /* Si une clé du même service existe déjà dans le coffre central → skip
         * (anti-doublon, ne pas écraser une migration manuelle déjà faite). */
        const existing = this.listKeys(service);
        if (existing.length > 0) {
          result.skipped += 1;
          result.details.push({ key: storageKey, status: 'skipped', reason: 'already_in_vault' });
          continue;
        }
        /* Decrypt + import */
        const plaintext = await vault.decryptAuto(encrypted);
        if (!plaintext || plaintext.length < 8) {
          result.failed += 1;
          result.details.push({ key: storageKey, status: 'failed', reason: 'decrypt_failed' });
          continue;
        }
        await this.addKey(service, plaintext, { alias: `migré depuis ${storageKey}` });
        result.migrated += 1;
        result.details.push({ key: storageKey, status: 'migrated' });
      } catch (err: unknown) {
        result.failed += 1;
        result.details.push({
          key: storageKey,
          status: 'failed',
          reason: String(err).slice(0, 80),
        });
      }
    }
    logger.info(
      'multi-key-vault',
      `migrateLegacyFlatKeys: scanned=${result.scanned} migrated=${result.migrated} failed=${result.failed} skipped=${result.skipped}`,
    );
    return result;
  }

  /**
   * v13.4.267 (Kevin "bcp de clefs non fonctionnelles + liens pas bons") :
   * RÉPARE les entrées du coffre central déjà migrées avec un service
   * non-canonique (ex : `cloudflare_global`, `cloudflare_token`).
   *
   * Pour chaque entrée du coffre :
   * - Cherche le nom canonique dans une table de rename
   * - Si rename nécessaire ET service canonique pas déjà occupé → renomme in-place
   * - Sinon skip
   *
   * Lecture seule sur les valeurs encrypted (juste rename du champ `service`).
   * Anti-doublon : si le service canonique existe déjà, on garde l'entrée
   * existante et on supprime la duplicate mal nommée (vault dédupe la valeur).
   */
  async repairMisnamedServices(): Promise<{
    scanned: number;
    renamed: number;
    deleted_duplicate: number;
    skipped: number;
    details: Array<{ from: string; to: string; status: 'renamed' | 'deleted_duplicate' | 'skipped'; reason?: string }>;
  }> {
    const RENAME_MAP: Record<string, string> = {
      cloudflare_global: 'cloudflare',
      cloudflare_auth: 'cloudflare',
      cloudflare_api_token: 'cloudflare',
      cloudflare_token: 'cloudflare',
      cloudflare_global_key: 'cloudflare',
      google_key: 'google',
      youtube_key: 'google',
      pinecone_api: 'pinecone',
      stripe_sk: 'stripe',
      stripe_pk: 'stripe',
      brevo_smtp: 'brevo',
      telegram_bot: 'telegram',
      github_oauth: 'github',
    };
    const result = {
      scanned: 0,
      renamed: 0,
      deleted_duplicate: 0,
      skipped: 0,
      details: [] as Array<{ from: string; to: string; status: 'renamed' | 'deleted_duplicate' | 'skipped'; reason?: string }>,
    };
    const list = this.load();
    result.scanned = list.length;
    let modified = false;
    for (const entry of list) {
      const canonical = RENAME_MAP[entry.service];
      if (!canonical) {
        continue; /* déjà canonique ou hors map */
      }
      /* Si le service canonique existe déjà dans le coffre, dédup au lieu de rename */
      const conflictingEntry = list.find(
        (k) => k.id !== entry.id && k.service === canonical,
      );
      if (conflictingEntry) {
        /* Marquer cette entrée comme dup à supprimer */
        entry.status = 'invalid';
        entry.invalidReason = `Duplicate de ${canonical} (service initialement mal nommé ${entry.service})`;
        entry.invalidAt = Date.now();
        result.deleted_duplicate += 1;
        result.details.push({
          from: entry.service,
          to: canonical,
          status: 'deleted_duplicate',
          reason: `service ${canonical} déjà présent`,
        });
        modified = true;
      } else {
        const oldService = entry.service;
        entry.service = canonical;
        /* Reset status pour qu'un test re-run propre */
        if (entry.status === 'failing' || entry.status === 'invalid') {
          entry.status = 'unknown';
          entry.failCount = 0;
          delete entry.invalidReason;
          delete entry.invalidAt;
        }
        result.renamed += 1;
        result.details.push({
          from: oldService,
          to: canonical,
          status: 'renamed',
        });
        modified = true;
      }
    }
    if (modified) {
      this.cache = list;
      await this.persist();
    }
    result.skipped = result.scanned - result.renamed - result.deleted_duplicate;
    logger.info(
      'multi-key-vault',
      `repairMisnamedServices: scanned=${result.scanned} renamed=${result.renamed} deleted_dup=${result.deleted_duplicate} skipped=${result.skipped}`,
    );
    return result;
  }
}

export const multiKeyVault = new MultiKeyVault();
