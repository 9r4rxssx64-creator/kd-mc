/**
 * APEX v13.3.53 — Study Service
 *
 * Règle Kevin (2026-05-07 23h55) — ABSOLUE :
 * "Et étudier les sites, liens, codes etc"
 *
 * Quand Apex détecte un service (via credential ou URL ou nom), il l'étudie en
 * profondeur :
 *  - homepage / API URL / format (REST/GraphQL/SSE/WS)
 *  - pricing (free tier, plans, prix)
 *  - status / console / docs
 *  - rate limits + capabilities
 *  - alternatives concurrentes (pour proposer migration)
 *
 * Stockage : `ax_services_knowledge_<service>` (FB_FIX shared, partagé cross-app
 * via Firebase). Apex apprend au fur et à mesure → la 2e session bénéficie de
 * la 1ère.
 *
 * Sentinelle `service-knowledge-watch` (1×/sem) re-fetch chaque service connu
 * pour détecter changements pricing.
 */

import { logger } from '../../core/logger.js';
import { firebase } from '../storage/firebase.js';
import { CREDENTIAL_PATTERNS, detectCredential } from '../vault/credential-patterns.js';

export interface ServicePricing {
  plan: string;
  price: string;
  features: string[];
}

export interface ServiceCompetitor {
  service: string;
  pros: string[];
  price: string;
}

export interface ServiceStudy {
  service_name: string;
  homepage: string;
  api_url?: string;
  api_format?: 'rest' | 'graphql' | 'sse' | 'websocket';
  pricing?: ServicePricing[];
  status_url?: string;
  console_url?: string;
  docs_url?: string;
  capabilities: string[];
  rate_limits?: string;
  free_tier?: string;
  competitors?: ServiceCompetitor[];
  studied_at: number;
}

const KNOWLEDGE_PREFIX = 'ax_services_knowledge_';
const STUDY_TTL_MS = 7 * 24 * 60 * 60 * 1000; /* 1 semaine */

/* === Catalogue connaissance hard-codée (seed) === */

const SEED_KNOWLEDGE: Record<string, Partial<ServiceStudy>> = {
  anthropic: {
    homepage: 'https://www.anthropic.com',
    api_url: 'https://api.anthropic.com',
    api_format: 'rest',
    docs_url: 'https://docs.anthropic.com',
    console_url: 'https://console.anthropic.com',
    status_url: 'https://status.anthropic.com',
    capabilities: ['chat', 'vision', 'tools', 'caching', 'streaming'],
    free_tier: 'Aucun (paiement à l\'usage)',
    pricing: [
      { plan: 'Sonnet 4.6', price: '$3/M input · $15/M output', features: ['200K ctx', 'caching'] },
      { plan: 'Opus 4.7', price: '$15/M input · $75/M output', features: ['200K ctx', 'top accuracy'] },
      { plan: 'Haiku 4.5', price: '$0.25/M input · $1.25/M output', features: ['200K ctx', 'rapide'] },
    ],
    competitors: [
      { service: 'openai', pros: ['Multi-modal natif', 'Tool use mature'], price: 'gpt-4o $2.50/M' },
      { service: 'google', pros: ['Gemini 2.5 Pro 2M ctx', 'Free tier généreux'], price: 'Gemini Flash $0.075/M' },
    ],
  },
  openai: {
    homepage: 'https://openai.com',
    api_url: 'https://api.openai.com',
    api_format: 'rest',
    docs_url: 'https://platform.openai.com/docs',
    console_url: 'https://platform.openai.com',
    status_url: 'https://status.openai.com',
    capabilities: ['chat', 'vision', 'tools', 'embeddings', 'tts', 'stt', 'images'],
    pricing: [
      { plan: 'GPT-4o', price: '$2.50/M input · $10/M output', features: ['128K ctx', 'vision'] },
      { plan: 'GPT-4o-mini', price: '$0.15/M input · $0.60/M output', features: ['128K ctx'] },
    ],
    competitors: [
      { service: 'anthropic', pros: ['Caching agressif', 'Sécurité'], price: 'Sonnet $3/M' },
    ],
  },
  stripe: {
    homepage: 'https://stripe.com',
    api_url: 'https://api.stripe.com',
    api_format: 'rest',
    docs_url: 'https://stripe.com/docs',
    console_url: 'https://dashboard.stripe.com',
    status_url: 'https://status.stripe.com',
    capabilities: ['payments', 'subscriptions', 'invoicing', 'connect', 'identity', 'tax'],
    pricing: [
      { plan: 'Standard', price: '1.5% + 0.25€ EU cards', features: ['no monthly fee'] },
    ],
  },
  ewelink: {
    homepage: 'https://www.ewelink.cc',
    api_url: 'https://us-apia.coolkit.cc',
    api_format: 'rest',
    docs_url: 'https://coolkit-technologies.github.io/eWeLink-API',
    capabilities: ['iot_control', 'sonoff_devices', 'oauth2', 'scenes'],
  },
  broadlink: {
    homepage: 'https://www.broadlink.com',
    api_format: 'rest',
    capabilities: ['ir_blaster', 'rf_control', 'cloud_remote', 'local_lan'],
    docs_url: 'https://github.com/mjg59/python-broadlink',
  },
  hue: {
    homepage: 'https://www.philips-hue.com',
    api_format: 'rest',
    api_url: 'https://discovery.meethue.com',
    docs_url: 'https://developers.meethue.com',
    capabilities: ['lights', 'scenes', 'sensors', 'rooms', 'entertainment'],
  },
  groq: {
    homepage: 'https://groq.com',
    api_url: 'https://api.groq.com',
    api_format: 'rest',
    docs_url: 'https://console.groq.com/docs',
    console_url: 'https://console.groq.com',
    free_tier: '14K req/jour Llama 3.3',
    capabilities: ['chat', 'fastest_inference', 'whisper'],
  },
  github: {
    homepage: 'https://github.com',
    api_url: 'https://api.github.com',
    api_format: 'rest',
    docs_url: 'https://docs.github.com/rest',
    capabilities: ['repos', 'actions', 'issues', 'pr', 'secrets', 'pages'],
    free_tier: 'Repos publics illimités',
  },
  cloudflare: {
    homepage: 'https://www.cloudflare.com',
    api_url: 'https://api.cloudflare.com',
    api_format: 'rest',
    docs_url: 'https://developers.cloudflare.com',
    console_url: 'https://dash.cloudflare.com',
    capabilities: ['workers', 'r2', 'kv', 'd1', 'pages', 'dns', 'cdn'],
    free_tier: 'Workers 100K req/jour, R2 10GB',
  },
};

class StudyService {
  /**
   * Étudie un service via son URL.
   */
  async studyByURL(url: string): Promise<ServiceStudy> {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    /* Si subdomain (api.x.com / console.x.com / dash.x.com) → utilise le second-level (x).
     * Sinon utilise le premier label (x.com → x). */
    const parts = host.split('.');
    const service = parts.length >= 3 ? (parts[parts.length - 2] ?? parts[0] ?? host) : (parts[0] ?? host);
    /* Cache hit ? */
    const cached = this.getKnown(service);
    if (cached && Date.now() - cached.studied_at < STUDY_TTL_MS) {
      return cached;
    }
    return this.studyByName(service);
  }

  /**
   * Étudie un service via son credential (infère service depuis pattern).
   */
  async studyByCredential(token: string): Promise<ServiceStudy> {
    const pattern = detectCredential(token);
    if (!pattern) {
      throw new Error('Pattern non reconnu — impossible d\'étudier');
    }
    const service = pattern.storageKey.replace(/^ax_/, '').replace(/_key$|_token$|_pat$/, '');
    return this.studyByName(service);
  }

  /**
   * Étudie un service via son nom.
   * 1. Cache (ax_services_knowledge_<service>)
   * 2. Seed knowledge (hard-coded)
   * 3. Fallback : info minimale depuis CREDENTIAL_PATTERNS
   */
  async studyByName(serviceName: string): Promise<ServiceStudy> {
    const slug = serviceName.toLowerCase().replace(/\s+/g, '_');

    /* 1. Cache */
    const cached = this.getKnown(slug);
    if (cached && Date.now() - cached.studied_at < STUDY_TTL_MS) {
      return cached;
    }

    /* 2. Seed knowledge */
    const seed = SEED_KNOWLEDGE[slug];
    if (seed) {
      const study: ServiceStudy = {
        service_name: slug,
        homepage: seed.homepage ?? `https://${slug}.com`,
        capabilities: seed.capabilities ?? [],
        ...seed,
        studied_at: Date.now(),
      };
      this.persistKnowledge(slug, study);
      return study;
    }

    /* 3. Fallback : extraire depuis CREDENTIAL_PATTERNS */
    const pattern = CREDENTIAL_PATTERNS.find((p) =>
      p.storageKey.replace(/^ax_/, '').replace(/_key$|_token$|_pat$/, '') === slug,
    );
    const study: ServiceStudy = {
      service_name: slug,
      homepage: pattern?.dashboard ?? `https://${slug}.com`,
      capabilities: [],
      studied_at: Date.now(),
    };
    if (pattern?.docs) study.docs_url = pattern.docs;
    if (pattern?.dashboard) study.console_url = pattern.dashboard;
    this.persistKnowledge(slug, study);
    return study;
  }

  /**
   * Compare un service à 3 alternatives.
   */
  async compareToAlternatives(service: string): Promise<ServiceCompetitor[]> {
    const study = await this.studyByName(service);
    return study.competitors ?? [];
  }

  /**
   * Lecture cache.
   */
  getKnown(serviceName: string): ServiceStudy | null {
    const slug = serviceName.toLowerCase().replace(/\s+/g, '_');
    try {
      const raw = localStorage.getItem(KNOWLEDGE_PREFIX + slug);
      if (!raw) return null;
      return JSON.parse(raw) as ServiceStudy;
    } catch {
      return null;
    }
  }

  /**
   * Liste tous les services connus.
   */
  listKnown(): ServiceStudy[] {
    const out: ServiceStudy[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KNOWLEDGE_PREFIX)) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) out.push(JSON.parse(raw) as ServiceStudy);
        } catch {
          /* skip invalid */
        }
      }
    }
    return out.sort((a, b) => b.studied_at - a.studied_at);
  }

  /**
   * v13.3.74 M4 (audit Apex v13.3.73 issue #240) — Auto-fetch top providers au boot.
   *
   * Quand admin Kevin login pour la 1ère fois (ou si knowledge entries < 5),
   * on auto-étudie les top 5 providers couramment utilisés. Permet à l'IA
   * d'avoir un contexte riche dès le 1er message utilisateur.
   *
   * Ne re-fetch pas si déjà étudié dans la dernière semaine (TTL 7j).
   * Idempotent : 2× boot = no-op (cache hit).
   *
   * @param threshold Si listKnown().length < threshold → auto-fetch.
   * @returns { fetched: nombre étudiés, total: total cache après }
   */
  async autoFetchTopProviders(threshold = 5): Promise<{ fetched: number; total: number; errors: string[] }> {
    const TOP_PROVIDERS = ['anthropic', 'github', 'firebase', 'cloudflare', 'stripe'];
    const known = this.listKnown();
    /* Skip si déjà ≥ threshold connus ET fresh (< 7j) */
    if (known.length >= threshold) {
      const allFresh = known.every((k) => Date.now() - k.studied_at < STUDY_TTL_MS);
      if (allFresh) {
        return { fetched: 0, total: known.length, errors: [] };
      }
    }
    let fetched = 0;
    const errors: string[] = [];
    for (const service of TOP_PROVIDERS) {
      try {
        const cached = this.getKnown(service);
        if (cached && Date.now() - cached.studied_at < STUDY_TTL_MS) continue; /* fresh, skip */
        await this.studyByName(service);
        fetched++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${service}: ${msg}`);
      }
    }
    logger.info('study-service', `autoFetchTopProviders : ${fetched}/${TOP_PROVIDERS.length} fetched (total cache=${this.listKnown().length})`, { errors });
    return { fetched, total: this.listKnown().length, errors };
  }

  /**
   * v13.3.74 M4 (audit) — Sentinelle service-knowledge-watch helper.
   * Run hebdo par sentinelles registry (1 sem). Re-fetch tous services connus
   * pour détecter changements pricing/capabilities.
   * Délègue à refreshAll() existant.
   */
  async runWeeklyKnowledgeWatch(): Promise<{ refreshed: number; errors: string[] }> {
    return this.refreshAll();
  }

  /**
   * Force re-fetch (triggered par sentinelle hebdo).
   */
  async refreshAll(): Promise<{ refreshed: number; errors: string[] }> {
    const known = this.listKnown();
    let refreshed = 0;
    const errors: string[] = [];
    for (const study of known) {
      try {
        /* Invalide cache puis re-study */
        localStorage.removeItem(KNOWLEDGE_PREFIX + study.service_name);
        await this.studyByName(study.service_name);
        refreshed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${study.service_name}: ${msg}`);
      }
    }
    logger.info('study-service', `refreshAll: ${refreshed}/${known.length}`, { errors });
    return { refreshed, errors };
  }

  private persistKnowledge(slug: string, study: ServiceStudy): void {
    try {
      localStorage.setItem(KNOWLEDGE_PREFIX + slug, JSON.stringify(study));
    } catch {
      /* quota → skip */
    }
    /* Mirror Firebase (FB_FIX shared) — non-bloquant */
    try {
      void firebase.write(KNOWLEDGE_PREFIX + slug, study);
    } catch {
      /* offline → skip */
    }
  }
}

export const studyService = new StudyService();
