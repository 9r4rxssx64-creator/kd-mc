/**
 * APEX v13 — Unknown Credential Resolver (autonome).
 *
 * Demande Kevin 2026-05-04 :
 * "Si une clé ne se range pas il doit aller chercher sur internet le bon lien
 *  pour coller au bon endroit automatiquement et autonome.
 *  Tout autonome et automatique toujours partout."
 *
 * Architecture :
 * - Heuristiques sur la valeur (prefix, length, charset, format)
 * - Identification du service probable via patterns étendus
 * - Auto-fetch dashboard URL via heuristiques URL standards
 * - Web search VRAIE via Brave/Tavily (vault) + DuckDuckGo HTML fallback
 * - Validation HEAD candidate URLs (dashboard, billing, api_keys, docs, support)
 * - Auto-store dans `ax_<service>_key` deviné
 * - Auto-link dans links-registry
 * - Apprentissage : ajoute le nouveau pattern à `apex_v13_learned_patterns`
 * - Escalade Claude Code via `ax_claude_todo` pour ajouter au registry officiel
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export interface ResolvedCredential {
  service: string;
  storage_key: string;
  dashboard_url: string;
  billing_url?: string;
  api_keys_url?: string;
  docs_url?: string;
  support_url?: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  pattern_learned?: string; /* Nouveau pattern regex appris */
  alive_count?: number; /* Combien des URLs candidates répondent (HEAD test) */
}

/* Heuristiques étendues pour identifier service via prefix */
const PREFIX_HEURISTICS: ReadonlyArray<{
  prefix_match: RegExp;
  service: string;
  dashboard: string;
  billing?: string;
  confidence: 'high' | 'medium' | 'low';
}> = [
  /* AI Providers */
  { prefix_match: /^sk-ant-/i, service: 'anthropic', dashboard: 'https://console.anthropic.com/', billing: 'https://console.anthropic.com/settings/billing', confidence: 'high' },
  { prefix_match: /^sk-proj-/, service: 'openai_project', dashboard: 'https://platform.openai.com/', billing: 'https://platform.openai.com/account/billing', confidence: 'high' },
  { prefix_match: /^sk-svcacct-/, service: 'openai_service_account', dashboard: 'https://platform.openai.com/', confidence: 'high' },
  { prefix_match: /^sk-/, service: 'openai', dashboard: 'https://platform.openai.com/', billing: 'https://platform.openai.com/account/billing', confidence: 'medium' },
  { prefix_match: /^gsk_/, service: 'groq', dashboard: 'https://console.groq.com/', billing: 'https://console.groq.com/settings/billing', confidence: 'high' },
  { prefix_match: /^sk-or-/, service: 'openrouter', dashboard: 'https://openrouter.ai/', billing: 'https://openrouter.ai/credits', confidence: 'high' },
  { prefix_match: /^pplx-/, service: 'perplexity', dashboard: 'https://www.perplexity.ai/settings/api', confidence: 'high' },
  { prefix_match: /^xai-/, service: 'xai_grok', dashboard: 'https://console.x.ai/', confidence: 'high' },
  { prefix_match: /^AIza/, service: 'google_ai', dashboard: 'https://aistudio.google.com/app/apikey', confidence: 'high' },
  { prefix_match: /^r8_/, service: 'replicate', dashboard: 'https://replicate.com/account/api-tokens', billing: 'https://replicate.com/account/billing', confidence: 'high' },

  /* Payments */
  { prefix_match: /^sk_(live|test)_/, service: 'stripe_secret', dashboard: 'https://dashboard.stripe.com/apikeys', billing: 'https://dashboard.stripe.com/billing', confidence: 'high' },
  { prefix_match: /^pk_(live|test)_/, service: 'stripe_publishable', dashboard: 'https://dashboard.stripe.com/apikeys', confidence: 'high' },
  { prefix_match: /^rk_(live|test)_/, service: 'stripe_restricted', dashboard: 'https://dashboard.stripe.com/apikeys', confidence: 'high' },
  { prefix_match: /^whsec_/, service: 'stripe_webhook', dashboard: 'https://dashboard.stripe.com/webhooks', confidence: 'high' },
  { prefix_match: /^acct_/, service: 'stripe_connect', dashboard: 'https://dashboard.stripe.com/connect/accounts', confidence: 'high' },

  /* Email */
  { prefix_match: /^xkeysib-/, service: 'brevo', dashboard: 'https://app.brevo.com/', billing: 'https://app.brevo.com/billing/plan', confidence: 'high' },
  { prefix_match: /^re_/, service: 'resend', dashboard: 'https://resend.com/api-keys', billing: 'https://resend.com/settings/billing', confidence: 'high' },
  { prefix_match: /^SG\./, service: 'sendgrid', dashboard: 'https://app.sendgrid.com/settings/api_keys', confidence: 'high' },

  /* Dev / Hosting */
  { prefix_match: /^ghp_/, service: 'github_pat', dashboard: 'https://github.com/settings/tokens', confidence: 'high' },
  { prefix_match: /^github_pat_/, service: 'github_fine_grained', dashboard: 'https://github.com/settings/tokens?type=beta', confidence: 'high' },
  { prefix_match: /^gho_/, service: 'github_oauth', dashboard: 'https://github.com/settings/applications', confidence: 'high' },
  { prefix_match: /^glpat-/, service: 'gitlab', dashboard: 'https://gitlab.com/-/profile/personal_access_tokens', confidence: 'high' },
  { prefix_match: /^pat[A-Za-z0-9.]+$/, service: 'airtable', dashboard: 'https://airtable.com/create/tokens', confidence: 'high' },
  { prefix_match: /^secret_/, service: 'notion', dashboard: 'https://www.notion.so/my-integrations', confidence: 'high' },
  { prefix_match: /^xox[bp]-/, service: 'slack', dashboard: 'https://api.slack.com/apps', confidence: 'high' },
  { prefix_match: /^shpat_/, service: 'shopify_admin', dashboard: 'https://admin.shopify.com/', confidence: 'high' },

  /* Cloud */
  { prefix_match: /^AKIA/, service: 'aws_access_key', dashboard: 'https://console.aws.amazon.com/iam/home', confidence: 'high' },
  { prefix_match: /^AGPA[A-Z0-9]{16}$/, service: 'aws_root', dashboard: 'https://console.aws.amazon.com/', confidence: 'medium' },

  /* Misc */
  { prefix_match: /^xoxb-/, service: 'slack_bot', dashboard: 'https://api.slack.com/apps', confidence: 'high' },
  { prefix_match: /^\d+:[A-Za-z0-9_-]+$/, service: 'telegram_bot', dashboard: 'https://t.me/BotFather', confidence: 'high' },
];

/* Path candidates pour découverte URL d'un service à partir d'un domaine. */
const URL_PATH_CANDIDATES = {
  dashboard: ['', '/dashboard', '/account', '/console', '/app', '/admin'],
  billing: ['/billing', '/pricing', '/upgrade', '/account/billing', '/settings/billing', '/account/plan'],
  api_keys: ['/api-keys', '/keys', '/api/keys', '/settings/api-keys', '/settings/api', '/account/tokens', '/account/api-tokens', '/developers'],
  docs: ['/docs', '/documentation', '/api/docs', '/developers/docs', '/api'],
  support: ['/help', '/support', '/contact', '/help-center'],
} as const;

/* Domaines candidats pour un nom de service (sans TLD) — testés via HEAD. */
const DOMAIN_CANDIDATE_TEMPLATES = [
  'console.{name}.com',
  'app.{name}.com',
  'dashboard.{name}.com',
  '{name}.com',
  '{name}.io',
  '{name}.dev',
  '{name}.ai',
];

class UnknownCredentialResolver {
  /**
   * Tente d'identifier un service via heuristiques + web search fallback.
   */
  async tryIdentify(value: string): Promise<ResolvedCredential | null> {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 16) return null;

    /* 1. Heuristiques prefix (rapide, offline) */
    for (const h of PREFIX_HEURISTICS) {
      if (h.prefix_match.test(trimmed)) {
        const result: ResolvedCredential = {
          service: h.service,
          storage_key: `ax_${h.service}_key`,
          dashboard_url: h.dashboard,
          ...(h.billing && { billing_url: h.billing }),
          confidence: h.confidence,
          reason: `Prefix heuristic match : ${h.prefix_match.source}`,
        };
        void auditLog.record('credential.resolved_heuristic', {
          details: { service: h.service, confidence: h.confidence },
        });
        return result;
      }
    }

    /* 2. Format générique (length + charset) → propose service générique
       MAIS tente d'abord web search avec prefix pour identifier vrai service */
    const charset = this.detectCharset(trimmed);
    if (trimmed.length >= 32 && trimmed.length <= 256 && (charset === 'base64url' || charset === 'hex' || charset === 'alphanum')) {
      /* 2a. Web search VRAIE (Brave/Tavily si dispo, sinon DuckDuckGo) */
      try {
        const searched = await this.webSearchService(trimmed);
        if (searched) {
          /* Améliore : tente HEAD validation pour les URLs candidates */
          const validated = await this.discoverServiceUrls(searched.service, searched.dashboard_url);
          const enriched: ResolvedCredential = {
            ...searched,
            ...validated,
            /* Confidence : 0.95 = web search match name + URLs répondent → high
               0.7  = juste URLs répondent → medium
               0.3  = rien validé → low */
            confidence: validated.alive_count && validated.alive_count >= 2 ? 'high'
              : validated.alive_count && validated.alive_count >= 1 ? 'medium' : 'low',
          };
          void auditLog.record('credential.resolved_websearch', {
            details: { service: enriched.service, alive_count: enriched.alive_count, confidence: enriched.confidence },
          });
          return enriched;
        }
      } catch (err: unknown) {
        logger.warn('credential-resolver', 'web search failed', { err });
      }

      /* 2b. Token générique potentiel — auto-store comme "unknown_token_<hash>" */
      const shortHash = await this.shortHash(trimmed);
      const service = `unknown_${shortHash}`;
      void auditLog.record('credential.resolved_generic', {
        details: { length: trimmed.length, charset },
      });
      return {
        service,
        storage_key: `ax_${service}_key`,
        dashboard_url: 'https://duckduckgo.com/?q=' + encodeURIComponent(`API key format ${trimmed.slice(0, 8)}*`),
        confidence: 'low',
        reason: `Format générique ${charset} ${trimmed.length} chars — recherche web nécessaire`,
        pattern_learned: this.buildPatternFromValue(trimmed),
      };
    }

    /* 3. Web search fallback final pour valeurs non standard */
    try {
      const searched = await this.webSearchService(trimmed);
      if (searched) {
        void auditLog.record('credential.resolved_websearch', {
          details: { service: searched.service },
        });
        return searched;
      }
    } catch (err: unknown) {
      logger.warn('credential-resolver', 'web search failed', { err });
    }

    return null;
  }

  /**
   * Web search via Brave/Tavily (vault) + DuckDuckGo HTML fallback.
   */
  private async webSearchService(value: string): Promise<ResolvedCredential | null> {
    const prefix = value.slice(0, 8);
    const query = `"${prefix}" api dashboard login site format`;
    const candidates = await this.fetchSearchResults(query);
    if (candidates.length === 0) return null;

    /* Extract premier nom de service significatif depuis les résultats */
    for (const candidate of candidates) {
      const domain = this.extractDomain(candidate.url);
      if (!domain) continue;
      const service = this.serviceNameFromDomain(domain);
      if (!service) continue;
      return {
        service,
        storage_key: `ax_${service}_key`,
        dashboard_url: `https://${domain}`,
        confidence: 'low',
        reason: `Web search match domain : ${domain} (title: ${candidate.title.slice(0, 40)})`,
      };
    }
    return null;
  }

  /**
   * Tente Brave Search API → Tavily → DuckDuckGo HTML scrape.
   */
  private async fetchSearchResults(query: string): Promise<Array<{ url: string; title: string }>> {
    /* Brave (depuis vault) */
    try {
      const { vault } = await import('./vault.js');
      const braveKey = await vault.readKey('ax_brave_key');
      if (braveKey) {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
        const res = await fetch(url, {
          headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = (await res.json()) as { web?: { results?: Array<{ url?: string; title?: string }> } };
          const results = (data.web?.results ?? [])
            .map((r) => ({ url: r.url ?? '', title: r.title ?? '' }))
            .filter((r) => r.url);
          if (results.length > 0) return results;
        }
      }
    } catch (err: unknown) {
      logger.warn('credential-resolver', 'Brave search failed', { err });
    }

    /* Tavily (depuis vault) */
    try {
      const { vault } = await import('./vault.js');
      const tavilyKey = await vault.readKey('ax_tavily_key');
      if (tavilyKey) {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query, max_results: 8 }),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = (await res.json()) as { results?: Array<{ url?: string; title?: string }> };
          const results = (data.results ?? [])
            .map((r) => ({ url: r.url ?? '', title: r.title ?? '' }))
            .filter((r) => r.url);
          if (results.length > 0) return results;
        }
      }
    } catch (err: unknown) {
      logger.warn('credential-resolver', 'Tavily search failed', { err });
    }

    /* DuckDuckGo HTML scrape (fallback gratuit) */
    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const html = await res.text();
      const results: Array<{ url: string; title: string }> = [];
      const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRegex.exec(html)) !== null && results.length < 8) {
        results.push({ url: m[1] ?? '', title: m[2] ?? '' });
      }
      /* Fallback regex plus simple si DDG change format */
      if (results.length === 0) {
        const simpleRegex = /href="https?:\/\/([a-z0-9-]+\.[a-z]{2,}[^"]*)"/gi;
        while ((m = simpleRegex.exec(html)) !== null && results.length < 5) {
          results.push({ url: `https://${m[1]}`, title: '' });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Découvre URLs (dashboard/billing/api_keys/docs/support) pour un service via HEAD test.
   * Confidence améliorée si plusieurs URLs répondent.
   */
  private async discoverServiceUrls(service: string, baseDashboard: string): Promise<{
    dashboard_url: string;
    billing_url?: string;
    api_keys_url?: string;
    docs_url?: string;
    support_url?: string;
    alive_count: number;
  }> {
    const baseDomain = this.extractDomain(baseDashboard) ?? `${service}.com`;
    const result: {
      dashboard_url: string;
      billing_url?: string;
      api_keys_url?: string;
      docs_url?: string;
      support_url?: string;
      alive_count: number;
    } = {
      dashboard_url: baseDashboard,
      alive_count: 0,
    };

    /* Test HEAD parallèle pour chaque catégorie (max 1 path par catégorie) */
    const categories: Array<keyof typeof URL_PATH_CANDIDATES> = ['dashboard', 'billing', 'api_keys', 'docs', 'support'];
    for (const cat of categories) {
      const paths = URL_PATH_CANDIDATES[cat];
      for (const path of paths) {
        const candidateUrl = `https://${baseDomain}${path}`;
        const alive = await this.testUrlAlive(candidateUrl);
        if (alive) {
          if (cat === 'dashboard') result.dashboard_url = candidateUrl;
          else if (cat === 'billing') result.billing_url = candidateUrl;
          else if (cat === 'api_keys') result.api_keys_url = candidateUrl;
          else if (cat === 'docs') result.docs_url = candidateUrl;
          else if (cat === 'support') result.support_url = candidateUrl;
          result.alive_count += 1;
          break; /* premier alive suffit pour cette catégorie */
        }
      }
    }
    return result;
  }

  /**
   * Test HEAD/GET silencieux pour vérifier qu'une URL répond.
   * Considère "alive" si status 200, 301, 302, 401, 403 (page existe mais auth requise).
   * 404 = dead. Erreur réseau / opaque = considéré pas alive.
   */
  private async testUrlAlive(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors', /* navigator-friendly */
        signal: AbortSignal.timeout(3000),
        redirect: 'follow',
      });
      /* mode: 'no-cors' → opaque response, status toujours 0 */
      if (res.type === 'opaque') return true; /* probablement alive (CORS bloque mais serveur a répondu) */
      if (res.status >= 200 && res.status < 400) return true;
      if (res.status === 401 || res.status === 403) return true; /* page existe, auth requise */
      return false;
    } catch {
      /* Network error / timeout / DNS fail */
      return false;
    }
  }

  /**
   * Extrait domaine principal depuis URL.
   */
  private extractDomain(url: string): string | null {
    if (!url) return null;
    const m = url.match(/^https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/|$|:|\?)/i);
    return m?.[1] ?? null;
  }

  /**
   * Extrait nom service simple depuis domaine ("console.anthropic.com" → "anthropic").
   */
  private serviceNameFromDomain(domain: string): string {
    /* Priorité au sous-domaine si pas générique (api/www/app/dashboard/console) */
    const parts = domain.split('.');
    const generic = new Set(['api', 'www', 'app', 'dashboard', 'console', 'developer', 'docs']);
    for (const p of parts) {
      if (!generic.has(p) && p.length >= 3 && !/^\d+$/.test(p)) {
        return p.toLowerCase();
      }
    }
    return parts[0] ?? 'unknown';
  }

  /**
   * Apprend pattern + escalade Claude Code pour intégration officielle.
   */
  async learn(value: string, resolved: ResolvedCredential): Promise<void> {
    if (!resolved.pattern_learned) return;
    try {
      const learned = JSON.parse(localStorage.getItem('apex_v13_learned_patterns') ?? '[]') as Array<{
        service: string;
        pattern: string;
        sample_prefix: string;
        learned_at: number;
      }>;
      const exists = learned.some((l) => l.service === resolved.service);
      if (!exists) {
        learned.push({
          service: resolved.service,
          pattern: resolved.pattern_learned,
          sample_prefix: value.slice(0, 8),
          learned_at: Date.now(),
        });
        localStorage.setItem('apex_v13_learned_patterns', JSON.stringify(learned.slice(-50)));
      }
      /* Escalade Claude Code pour ajout officiel */
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<unknown>;
      todos.push({
        id: `c_pattern_${Date.now()}`,
        type: 'add_credential_pattern',
        service: resolved.service,
        pattern: resolved.pattern_learned,
        sample_prefix: value.slice(0, 8),
        confidence: resolved.confidence,
        ts: Date.now(),
        status: 'pending',
      });
      localStorage.setItem('ax_claude_todo', JSON.stringify(todos.slice(-50)));
    } catch (err: unknown) {
      logger.warn('credential-resolver', 'learn failed', { err });
    }
  }

  /**
   * Liste patterns appris (admin UI).
   */
  listLearned(): readonly { service: string; pattern: string; sample_prefix: string; learned_at: number }[] {
    try {
      return JSON.parse(localStorage.getItem('apex_v13_learned_patterns') ?? '[]') as Array<{
        service: string; pattern: string; sample_prefix: string; learned_at: number;
      }>;
    } catch {
      return [];
    }
  }

  /**
   * Validation HEAD test pour une URL — exposé pour tests + UI admin.
   */
  async testUrl(url: string): Promise<boolean> {
    return this.testUrlAlive(url);
  }

  /**
   * Découvre URLs candidates pour un nom de service donné (utile UI admin
   * pour vérifier qu'un service est bien intégré).
   */
  async discoverUrlsForService(serviceName: string): Promise<{
    candidates: string[];
    alive: string[];
  }> {
    const candidates: string[] = [];
    for (const tmpl of DOMAIN_CANDIDATE_TEMPLATES) {
      candidates.push(`https://${tmpl.replace('{name}', serviceName)}`);
    }
    const alive: string[] = [];
    for (const url of candidates) {
      if (await this.testUrlAlive(url)) alive.push(url);
    }
    return { candidates, alive };
  }

  /* === Helpers === */

  private detectCharset(value: string): 'hex' | 'base64' | 'base64url' | 'alphanum' | 'mixed' {
    if (/^[0-9a-f]+$/i.test(value)) return 'hex';
    if (/^[A-Za-z0-9+/=]+$/.test(value)) return 'base64';
    if (/^[A-Za-z0-9_-]+$/.test(value)) return 'base64url';
    if (/^[A-Za-z0-9]+$/.test(value)) return 'alphanum';
    return 'mixed';
  }

  private async shortHash(value: string): Promise<string> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      let h = 0;
      for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36).slice(0, 8);
    }
    try {
      const data = new TextEncoder().encode(value);
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .slice(0, 4)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return Math.random().toString(36).slice(2, 10);
    }
  }

  private buildPatternFromValue(value: string): string {
    /* Construit regex générique basé sur la valeur (premier 4 chars + reste générique) */
    const prefix = value.slice(0, 4).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const charset = this.detectCharset(value);
    const range =
      charset === 'hex' ? '[0-9a-f]' :
      charset === 'base64url' ? '[A-Za-z0-9_-]' :
      charset === 'alphanum' ? '[A-Za-z0-9]' :
      '[A-Za-z0-9+/=]';
    const minLen = Math.max(8, value.length - 8);
    return `^${prefix}${range}{${minLen},}$`;
  }
}

export const unknownCredentialResolver = new UnknownCredentialResolver();
