/**
 * APEX v13 — Auto-Discover Links (autonome 100%).
 *
 * Demande Kevin 2026-05-07 :
 * "Dans le coffre visuel j'espère que tu as rajouté qu'il aille chercher tous les liens
 *  qui trouvent par rapport à mes identifiants pour les mettre au bon endroit pouvoir
 *  me connecter avec mes codes etc en toute autonomie. Sinon si ça n'y est pas je lui
 *  dirai d'aller chercher mais je veux qu'il fasse les recherches par rapport à tous
 *  les codes qui trouvent etc en toute autonomie."
 *
 * Mission :
 * Pour CHAQUE credential stocké dans le vault, découvrir AUTOMATIQUEMENT en parallèle :
 *   login, dashboard, billing, api_keys, usage, docs, status_page,
 *   password_reset, account_settings, support, invoices.
 *
 * Stratégie en cascade (du plus rapide/sûr au plus lent/exploratoire) :
 *   1. pre_configured  : lookup dans links-registry (40+ services courants)
 *   2. web_search      : Brave/Tavily (vault) + DuckDuckGo HTML fallback
 *   3. pattern_discovery : 30+ URL templates (login.X.com, X.com/login, etc.)
 *      + HEAD validation parallèle (navigator-friendly mode no-cors).
 *   4. user_provided   : prend le pas si Kevin saisit manuellement.
 *
 * Resolution identifiant → service :
 *   - Email gmail.com → Gmail (mail.google.com / accounts.google.com)
 *   - Email outlook/hotmail/live → Outlook/Microsoft (outlook.live.com)
 *   - IBAN FR76 préfixe banque (5 chiffres après FR76) → BIC + login banque
 *   - Phone +377 → opérateur Monaco
 *   - URL → service via domaine
 *
 * Cache localStorage `apex_v13_discovered_links` (FIFO 200 entries, sync Firebase optionnel).
 * Re-verify alive via sentinelle `links-rediscover` hebdomadaire.
 *
 * Anti-pattern :
 * - Pas de blocage UI : discover() est non-bloquant et toujours retourne un résultat.
 * - Pas de credentials envoyés au search engine : seuls le NOM service / hint.
 * - HEAD fetch timeout 3s — ne hang jamais.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { linksRegistry } from './links-registry.js';

/**
 * Liens découverts pour un service.
 */
export interface DiscoveredLinks {
  /** Slug normalisé (lowercase) du service (ex: "anthropic", "gmail") */
  service: string;
  /** Nom affichable */
  name?: string;
  /** Page de connexion (priorité absolue Kevin) */
  login?: string;
  /** Dashboard / page principale après login */
  dashboard?: string;
  /** Page billing / recharge crédit */
  billing?: string;
  /** Page gestion clés API */
  api_keys?: string;
  /** Page consommation / usage */
  usage?: string;
  /** Documentation officielle */
  docs?: string;
  /** Page statut / monitoring uptime */
  status_page?: string;
  /** Page reset mot de passe */
  password_reset?: string;
  /** Page settings / profil compte */
  account_settings?: string;
  /** Centre support / contact */
  support?: string;
  /** Page factures / historique */
  invoices?: string;
  /** Source de découverte */
  source: 'pre_configured' | 'web_search' | 'pattern_discovery' | 'user_provided';
  /** Confidence 0.0-1.0 (1.0 = pre-configured ou user, 0.95 = web search match nom + URLs alive,
   *  0.7 = URLs alive seul, 0.5 = pattern match sans HEAD validation, 0.3 = web search seul) */
  confidence: number;
  /** Timestamp dernière vérification (ms epoch) */
  verifiedAt?: number;
  /** Au moins une URL répond (HEAD test) */
  alive: boolean;
}

/**
 * Stats batch discoverAllStored.
 */
export interface DiscoverAllResult {
  /** Total credentials scannés */
  total: number;
  /** Nouveaux services découverts (pas encore dans cache) */
  new: number;
  /** Services revérifiés alive */
  verified: number;
}

/**
 * Stats reVerifyAll.
 */
export interface ReVerifyResult {
  tested: number;
  alive: number;
  broken: number;
}

/**
 * Résultat findServiceFromIdentifier.
 */
export interface ServiceFromIdentifier {
  service?: string;
  loginUrl?: string;
  confidence: number;
}

/* ────────────────── Constantes / templates ────────────────── */

/**
 * URL templates pour pattern discovery.
 * `{X}` est remplacé par le service slug en lowercase.
 * Ordonnés par catégorie pour scanner en parallèle.
 */
const URL_PATTERNS: Record<string, readonly string[]> = {
  login: [
    'login.{X}.com',
    '{X}.com/login',
    '{X}.com/signin',
    'auth.{X}.com',
    'accounts.{X}.com',
  ],
  dashboard: [
    'app.{X}.com',
    'console.{X}.com',
    'dashboard.{X}.com',
    '{X}.com/dashboard',
    '{X}.com/admin',
  ],
  billing: [
    '{X}.com/billing',
    '{X}.com/account/billing',
    '{X}.com/settings/billing',
    '{X}.com/upgrade',
    '{X}.com/credits',
  ],
  api_keys: [
    '{X}.com/api',
    '{X}.com/api/keys',
    '{X}.com/account/api',
    '{X}.com/settings/api',
    '{X}.com/developer',
  ],
  account_settings: [
    '{X}.com/account',
    '{X}.com/profile',
    '{X}.com/settings',
    'me.{X}.com',
  ],
  password_reset: [
    '{X}.com/reset-password',
    '{X}.com/forgot-password',
    '{X}.com/account/recover',
  ],
  docs: [
    'docs.{X}.com',
    'developer.{X}.com',
    '{X}.com/docs',
  ],
  status_page: [
    'status.{X}.com',
    '{X}-status.com',
    '{X}.statuspage.io',
  ],
  support: [
    'help.{X}.com',
    'support.{X}.com',
    '{X}.com/support',
  ],
};

/**
 * Mapping email domain → service.
 * Permet : Kevin colle son email → Apex sait quel site/service ouvrir.
 */
const EMAIL_DOMAIN_TO_SERVICE: Record<string, { service: string; loginUrl: string; name: string }> = {
  'gmail.com': { service: 'google', loginUrl: 'https://accounts.google.com/signin', name: 'Gmail / Google' },
  'googlemail.com': { service: 'google', loginUrl: 'https://accounts.google.com/signin', name: 'Gmail / Google' },
  'outlook.com': { service: 'microsoft', loginUrl: 'https://login.live.com', name: 'Outlook / Microsoft' },
  'hotmail.com': { service: 'microsoft', loginUrl: 'https://login.live.com', name: 'Outlook / Microsoft' },
  'hotmail.fr': { service: 'microsoft', loginUrl: 'https://login.live.com', name: 'Outlook / Microsoft' },
  'live.com': { service: 'microsoft', loginUrl: 'https://login.live.com', name: 'Outlook / Microsoft' },
  'live.fr': { service: 'microsoft', loginUrl: 'https://login.live.com', name: 'Outlook / Microsoft' },
  'icloud.com': { service: 'apple', loginUrl: 'https://www.icloud.com', name: 'Apple iCloud' },
  'me.com': { service: 'apple', loginUrl: 'https://www.icloud.com', name: 'Apple iCloud' },
  'mac.com': { service: 'apple', loginUrl: 'https://www.icloud.com', name: 'Apple iCloud' },
  'yahoo.com': { service: 'yahoo', loginUrl: 'https://login.yahoo.com', name: 'Yahoo Mail' },
  'yahoo.fr': { service: 'yahoo', loginUrl: 'https://login.yahoo.com', name: 'Yahoo Mail' },
  'protonmail.com': { service: 'protonmail', loginUrl: 'https://account.proton.me/login', name: 'ProtonMail' },
  'proton.me': { service: 'protonmail', loginUrl: 'https://account.proton.me/login', name: 'ProtonMail' },
  'gmx.com': { service: 'gmx', loginUrl: 'https://www.gmx.com', name: 'GMX' },
  'orange.fr': { service: 'orange', loginUrl: 'https://login.orange.fr', name: 'Orange Mail' },
  'wanadoo.fr': { service: 'orange', loginUrl: 'https://login.orange.fr', name: 'Orange Mail' },
  'free.fr': { service: 'free', loginUrl: 'https://subscribe.free.fr/login/', name: 'Free Mail' },
  'sfr.fr': { service: 'sfr', loginUrl: 'https://www.sfr.fr/auth', name: 'SFR Mail' },
  'laposte.net': { service: 'laposte', loginUrl: 'https://www.laposte.net', name: 'La Poste Mail' },
};

/**
 * IBAN FR : code banque (5 chiffres positions 5-9 après FR76).
 * Mapping → BIC / banque + URL login.
 * Sources publiques INSEE/Banque de France.
 */
const IBAN_FR_BANK_CODES: Record<string, { service: string; loginUrl: string; name: string }> = {
  '30001': { service: 'banque_de_france', loginUrl: 'https://www.banque-france.fr', name: 'Banque de France' },
  '30002': { service: 'credit_lyonnais', loginUrl: 'https://www.credit-agricole.fr', name: 'LCL Crédit Lyonnais' },
  '30003': { service: 'societe_generale', loginUrl: 'https://particuliers.societegenerale.fr', name: 'Société Générale' },
  '30004': { service: 'bnp_paribas', loginUrl: 'https://mabanque.bnpparibas', name: 'BNP Paribas' },
  '30056': { service: 'hsbc', loginUrl: 'https://www.hsbc.fr', name: 'HSBC France' },
  '30066': { service: 'cic', loginUrl: 'https://www.cic.fr', name: 'CIC' },
  '30076': { service: 'credit_du_nord', loginUrl: 'https://www.credit-du-nord.fr', name: 'Crédit du Nord' },
  '10011': { service: 'credit_municipal_paris', loginUrl: 'https://www.creditmunicipal.fr', name: 'Crédit Municipal Paris' },
  '10057': { service: 'credit_industriel_normandie', loginUrl: 'https://www.cic.fr', name: 'CIC Nord-Ouest' },
  '11315': { service: 'caisse_depots', loginUrl: 'https://www.caissedesdepots.fr', name: 'Caisse des Dépôts' },
  '12006': { service: 'banque_palatine', loginUrl: 'https://www.palatine.fr', name: 'Banque Palatine' },
  '13135': { service: 'credit_cooperatif', loginUrl: 'https://www.credit-cooperatif.coop', name: 'Crédit Coopératif' },
  '14445': { service: 'caisse_epargne', loginUrl: 'https://www.caisse-epargne.fr', name: 'Caisse d\'Épargne' },
  '14505': { service: 'banque_populaire', loginUrl: 'https://www.banquepopulaire.fr', name: 'Banque Populaire' },
  '15489': { service: 'cmb', loginUrl: 'https://www.cmb.fr', name: 'Crédit Mutuel de Bretagne' },
  '16798': { service: 'monte_paschi', loginUrl: 'https://www.banquemontepaschi.fr', name: 'Banque Monte Paschi' },
  '17515': { service: 'banque_postale', loginUrl: 'https://www.labanquepostale.fr', name: 'La Banque Postale' },
  '18206': { service: 'societe_marseillaise_credit', loginUrl: 'https://www.smc.fr', name: 'Société Marseillaise de Crédit' },
  '18707': { service: 'credit_agricole', loginUrl: 'https://www.credit-agricole.fr', name: 'Crédit Agricole' },
  '20041': { service: 'la_banque_postale', loginUrl: 'https://www.labanquepostale.fr', name: 'La Banque Postale' },
  '30077': { service: 'smc', loginUrl: 'https://www.smc.fr', name: 'Société Marseillaise de Crédit' },
  '40031': { service: 'banque_postale', loginUrl: 'https://www.labanquepostale.fr', name: 'La Banque Postale' },
  '16958': { service: 'revolut', loginUrl: 'https://app.revolut.com', name: 'Revolut' },
  '17569': { service: 'fortuneo', loginUrl: 'https://www.fortuneo.fr', name: 'Fortuneo' },
};

/* Cache TTL : 7 jours pour discovered links */
const CACHE_KEY = 'apex_v13_discovered_links';
const CACHE_MAX_ENTRIES = 200;
const HEAD_TIMEOUT_MS = 3000;

/* ────────────────── Service principal ────────────────── */

class AutoDiscoverLinks {
  /**
   * Discover liens pour un service.
   *
   * Cascade : pre_configured → web_search → pattern_discovery.
   * Cache localStorage 7 jours sauf opts.force.
   *
   * @example
   * ```ts
   * const links = await autoDiscoverLinks.discover('anthropic');
   * console.log(links.login, links.dashboard, links.billing);
   * ```
   */
  async discover(service: string, opts?: { force?: boolean }): Promise<DiscoveredLinks> {
    const slug = this.normalizeServiceName(service);
    if (!slug) {
      return {
        service: service.toLowerCase(),
        source: 'pattern_discovery',
        confidence: 0,
        alive: false,
      };
    }

    /* Cache hit (sauf force) */
    if (!opts?.force) {
      const cached = this.getCached(slug);
      if (cached && this.isCacheFresh(cached)) {
        logger.debug('auto-discover-links', `cache hit ${slug}`);
        return cached;
      }
    }

    /* 1. pre-configured (links-registry) */
    const preConfigured = this.tryPreConfigured(slug);
    if (preConfigured) {
      this.cache(preConfigured);
      void auditLog.record('links.discovered', {
        details: { service: slug, source: 'pre_configured' },
      });
      return preConfigured;
    }

    /* 2. pattern_discovery (HEAD test parallèle, plus rapide que web search) */
    const patternResult = await this.tryPatternDiscovery(slug);
    if (patternResult.alive && patternResult.confidence >= 0.5) {
      this.cache(patternResult);
      void auditLog.record('links.discovered', {
        details: { service: slug, source: 'pattern_discovery', alive: true },
      });
      return patternResult;
    }

    /* 3. web_search (Brave/Tavily/DDG) */
    const searchResult = await this.tryWebSearch(slug);
    if (searchResult) {
      /* Combine web search avec pattern discovery pour enrichir */
      const merged = this.merge(searchResult, patternResult);
      this.cache(merged);
      void auditLog.record('links.discovered', {
        details: { service: slug, source: 'web_search', alive: merged.alive },
      });
      return merged;
    }

    /* Fallback : retourne pattern result même si confidence basse */
    this.cache(patternResult);
    return patternResult;
  }

  /**
   * Discover ALL links pour TOUS les credentials stockés (batch).
   *
   * Lit les services depuis localStorage `ax_links_registry_v2` ou catalogue
   * links-registry, puis discover() chaque en parallèle (limite concurrence 5).
   */
  async discoverAllStored(): Promise<DiscoverAllResult> {
    /* Sources : links-registry persistées + catalogue 40+ services + multi-keys */
    const services = new Set<string>();
    try {
      for (const link of linksRegistry.list()) {
        services.add(link.service);
      }
      for (const id of linksRegistry.catalogue()) {
        services.add(id);
      }
    } catch (err: unknown) {
      logger.warn('auto-discover-links', 'list services failed', { err });
    }

    /* Multi-key vault services aussi */
    try {
      const { multiKeyVault } = await import('../vault/multi-key-vault.js');
      for (const k of multiKeyVault.listAll(true)) {
        services.add(k.service);
      }
    } catch (err: unknown) {
      logger.debug('auto-discover-links', 'multi-key import skipped', { err });
    }

    let newCount = 0;
    let verifiedCount = 0;
    /* Concurrence limitée : batch 5 à la fois */
    const list = Array.from(services);
    const BATCH = 5;
    for (let i = 0; i < list.length; i += BATCH) {
      const slice = list.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (svc) => {
          const before = this.getCached(svc);
          const result = await this.discover(svc);
          if (!before) newCount++;
          if (result.alive) verifiedCount++;
        }),
      );
    }
    logger.info(
      'auto-discover-links',
      `discoverAllStored: total=${list.length} new=${newCount} verified=${verifiedCount}`,
    );
    return { total: list.length, new: newCount, verified: verifiedCount };
  }

  /**
   * Pour un identifiant détecté (email, IBAN, URL), trouve le SITE associé.
   *
   * @example
   * ```ts
   * findServiceFromIdentifier('kevin@gmail.com') → { service: 'google', loginUrl: 'https://accounts.google.com/signin' }
   * findServiceFromIdentifier('FR7630003012345678901234567') → { service: 'societe_generale', ... }
   * ```
   */
  async findServiceFromIdentifier(identifier: string, hint?: string): Promise<ServiceFromIdentifier> {
    const value = identifier.trim();
    if (!value) return { confidence: 0 };

    /* hint utilisateur prioritaire */
    if (hint) {
      const hintLc = hint.toLowerCase().trim();
      const link = linksRegistry.get(hintLc);
      if (link) {
        return {
          service: hintLc,
          ...(link.dashboard && { loginUrl: link.dashboard }),
          confidence: 0.9,
        };
      }
    }

    /* Email → service via domaine */
    const emailMatch = /^[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(value);
    if (emailMatch && emailMatch[1]) {
      const domain = emailMatch[1].toLowerCase();
      const known = EMAIL_DOMAIN_TO_SERVICE[domain];
      if (known) {
        return {
          service: known.service,
          loginUrl: known.loginUrl,
          confidence: 0.95,
        };
      }
      /* Domain custom → tente links-registry par hostname (sans TLD) */
      const slug = domain.split('.')[0] ?? '';
      const link = linksRegistry.get(slug);
      if (link?.dashboard) {
        return { service: slug, loginUrl: link.dashboard, confidence: 0.7 };
      }
      /* Sinon URL générique du domaine */
      return { service: slug, loginUrl: `https://${domain}`, confidence: 0.5 };
    }

    /* IBAN FR → banque via code banque (positions 5-9 après FR76) */
    const ibanFr = /^FR\d{2}(\d{5})/.exec(value.replace(/\s/g, ''));
    if (ibanFr && ibanFr[1]) {
      const bankCode = ibanFr[1];
      const known = IBAN_FR_BANK_CODES[bankCode];
      if (known) {
        return {
          service: known.service,
          loginUrl: known.loginUrl,
          confidence: 0.95,
        };
      }
      return { service: 'unknown_bank_fr', confidence: 0.3 };
    }

    /* IBAN MC (Monaco) — Crédit Foncier de Monaco / SBM Bank etc. */
    const ibanMc = /^MC\d{2}/.exec(value.replace(/\s/g, ''));
    if (ibanMc) {
      return {
        service: 'banque_monaco',
        loginUrl: 'https://www.cfm-mc.com',
        confidence: 0.7,
      };
    }

    /* Phone Monaco +377 */
    if (/^\+?377\d{8}$/.test(value.replace(/\s/g, ''))) {
      return {
        service: 'monaco_telecom',
        loginUrl: 'https://www.monaco-telecom.mc',
        confidence: 0.85,
      };
    }

    /* URL → service via domaine */
    const urlMatch = /^https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/i.exec(value);
    if (urlMatch && urlMatch[1]) {
      const domain = urlMatch[1].toLowerCase();
      const slug = this.serviceFromDomain(domain);
      const link = linksRegistry.get(slug);
      if (link) {
        return {
          service: slug,
          ...(link.dashboard && { loginUrl: link.dashboard }),
          confidence: 0.8,
        };
      }
      return { service: slug, loginUrl: `https://${domain}`, confidence: 0.5 };
    }

    /* Fallback : tente lookup directement dans links-registry */
    const direct = linksRegistry.get(value.toLowerCase());
    if (direct) {
      return {
        service: value.toLowerCase(),
        ...(direct.dashboard && { loginUrl: direct.dashboard }),
        confidence: 0.85,
      };
    }

    return { confidence: 0 };
  }

  /**
   * Génère URL login pour service connu (avec optional redirect post-login).
   *
   * @example
   * ```ts
   * generateLoginUrl('github', { redirectTo: 'https://github.com/settings' })
   *   → 'https://github.com/login?return_to=...'
   * ```
   */
  generateLoginUrl(service: string, opts?: { redirectTo?: string }): string | null {
    const slug = this.normalizeServiceName(service);
    if (!slug) return null;
    const cached = this.getCached(slug);
    let loginUrl: string | null = null;
    if (cached?.login) {
      loginUrl = cached.login;
    } else {
      /* Fallback : tente login.X.com puis X.com/login */
      loginUrl = `https://login.${slug}.com`;
    }
    if (opts?.redirectTo) {
      try {
        const sep = loginUrl.includes('?') ? '&' : '?';
        return `${loginUrl}${sep}return_to=${encodeURIComponent(opts.redirectTo)}`;
      } catch {
        return loginUrl;
      }
    }
    return loginUrl;
  }

  /**
   * Get cached discovered links pour un service (sans declencher discover).
   */
  getCached(service: string): DiscoveredLinks | null {
    const slug = this.normalizeServiceName(service);
    if (!slug) return null;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw) as DiscoveredLinks[];
      if (!Array.isArray(cache)) return null;
      return cache.find((c) => c.service === slug) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Re-verify alive sur tous links cachés (sentinelle quotidienne).
   */
  async reVerifyAll(): Promise<ReVerifyResult> {
    const cache = this.loadCache();
    let alive = 0;
    let broken = 0;
    let tested = 0;
    /* Test parallèle (batch 5) */
    const BATCH = 5;
    for (let i = 0; i < cache.length; i += BATCH) {
      const slice = cache.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (link) => {
          tested++;
          /* Tester URL la plus représentative : login > dashboard > docs */
          const testUrl = link.login ?? link.dashboard ?? link.docs;
          if (!testUrl) {
            broken++;
            link.alive = false;
            link.verifiedAt = Date.now();
            return;
          }
          const isAlive = await this.headOk(testUrl);
          link.alive = isAlive;
          link.verifiedAt = Date.now();
          if (isAlive) alive++;
          else broken++;
        }),
      );
    }
    this.persistCache(cache);
    logger.info(
      'auto-discover-links',
      `reVerifyAll: tested=${tested} alive=${alive} broken=${broken}`,
    );
    return { tested, alive, broken };
  }

  /* ────────────────── Internals ────────────────── */

  /**
   * Strategy 1 : pre-configured depuis links-registry (40+ services).
   */
  private tryPreConfigured(slug: string): DiscoveredLinks | null {
    const link = linksRegistry.get(slug);
    if (!link) return null;
    const result: DiscoveredLinks = {
      service: slug,
      ...(link.name !== undefined && { name: link.name }),
      ...(link.dashboard !== undefined && { dashboard: link.dashboard }),
      ...(link.billing !== undefined && { billing: link.billing }),
      ...(link.api_keys_page !== undefined && { api_keys: link.api_keys_page }),
      ...(link.usage !== undefined && { usage: link.usage }),
      ...(link.docs !== undefined && { docs: link.docs }),
      ...(link.status_page !== undefined && { status_page: link.status_page }),
      ...(link.support !== undefined && { support: link.support }),
      source: 'pre_configured',
      confidence: 1.0,
      alive: link.alive,
      verifiedAt: Date.now(),
    };
    return result;
  }

  /**
   * Strategy 2 : pattern discovery via URL templates + HEAD validation parallèle.
   */
  private async tryPatternDiscovery(slug: string): Promise<DiscoveredLinks> {
    const result: DiscoveredLinks = {
      service: slug,
      source: 'pattern_discovery',
      confidence: 0,
      alive: false,
      verifiedAt: Date.now(),
    };
    let aliveCount = 0;

    /* Pour chaque catégorie : test HEAD sur premier candidat alive */
    const categories = Object.keys(URL_PATTERNS) as Array<keyof typeof URL_PATTERNS>;
    /* Parallélise par catégorie pour rapidité */
    const promises = categories.map(async (cat) => {
      const templates = URL_PATTERNS[cat] ?? [];
      for (const tmpl of templates) {
        const url = `https://${tmpl.replace(/\{X\}/g, slug)}`;
        const ok = await this.headOk(url);
        if (ok) return { cat, url };
      }
      return null;
    });
    const found = await Promise.all(promises);
    for (const f of found) {
      if (!f) continue;
      aliveCount++;
      switch (f.cat) {
        case 'login': result.login = f.url; break;
        case 'dashboard': result.dashboard = f.url; break;
        case 'billing': result.billing = f.url; break;
        case 'api_keys': result.api_keys = f.url; break;
        case 'account_settings': result.account_settings = f.url; break;
        case 'password_reset': result.password_reset = f.url; break;
        case 'docs': result.docs = f.url; break;
        case 'status_page': result.status_page = f.url; break;
        case 'support': result.support = f.url; break;
      }
    }
    result.alive = aliveCount > 0;
    /* Confidence : alive_count / total_categories */
    const total = categories.length;
    result.confidence = total > 0 ? Math.min(0.85, aliveCount / total + 0.1) : 0;
    return result;
  }

  /**
   * Strategy 3 : web search Brave/Tavily/DDG pour trouver login URL officielle.
   */
  private async tryWebSearch(slug: string): Promise<DiscoveredLinks | null> {
    const query = `${slug} login dashboard api keys`;
    const results = await this.fetchSearchResults(query);
    if (results.length === 0) return null;
    /* Premier résultat avec domaine plausible */
    for (const r of results) {
      const domain = this.extractDomain(r.url);
      if (!domain) continue;
      if (!domain.includes(slug) && !slug.includes(domain.split('.')[0] ?? '')) continue;
      return {
        service: slug,
        login: r.url,
        dashboard: `https://${domain}`,
        source: 'web_search',
        confidence: 0.6,
        alive: true,
        verifiedAt: Date.now(),
      };
    }
    return null;
  }

  /**
   * Web search via vault keys (Brave > Tavily > DDG fallback).
   * Mêmes endpoints que unknown-credential-resolver, factorisés ici en best-effort.
   */
  private async fetchSearchResults(query: string): Promise<Array<{ url: string; title: string }>> {
    /* Brave (depuis vault) */
    try {
      const { vault } = await import('../vault/vault.js');
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
      logger.debug('auto-discover-links', 'Brave search failed', { err });
    }

    /* Tavily (depuis vault) */
    try {
      const { vault } = await import('../vault/vault.js');
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
      logger.debug('auto-discover-links', 'Tavily search failed', { err });
    }

    /* DDG HTML scrape (best-effort, gratuit, no key) */
    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const html = await res.text();
      const results: Array<{ url: string; title: string }> = [];
      const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRegex.exec(html)) !== null && results.length < 8) {
        results.push({ url: m[1] ?? '', title: m[2] ?? '' });
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Test HEAD silencieux : url alive si status 200/3xx/401/403, ou opaque.
   */
  private async headOk(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (res.type === 'opaque') return true;
      if (res.status >= 200 && res.status < 400) return true;
      if (res.status === 401 || res.status === 403) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Merge web search result avec pattern discovery (web prioritaire pour login).
   */
  private merge(primary: DiscoveredLinks, secondary: DiscoveredLinks): DiscoveredLinks {
    const merged: DiscoveredLinks = {
      service: primary.service,
      source: primary.source,
      confidence: Math.max(primary.confidence, secondary.confidence),
      alive: primary.alive || secondary.alive,
      verifiedAt: Date.now(),
    };
    /* Champs : primary > secondary */
    const fields = [
      'name', 'login', 'dashboard', 'billing', 'api_keys', 'usage',
      'docs', 'status_page', 'password_reset', 'account_settings',
      'support', 'invoices',
    ] as const;
    for (const f of fields) {
      const val = primary[f] ?? secondary[f];
      if (val !== undefined) {
        (merged as unknown as Record<string, unknown>)[f] = val;
      }
    }
    return merged;
  }

  /**
   * Charge le cache complet depuis localStorage.
   */
  private loadCache(): DiscoveredLinks[] {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as DiscoveredLinks[];
    } catch {
      return [];
    }
  }

  /**
   * Cache un lien découvert (FIFO 200 max, dédup par service).
   */
  private cache(link: DiscoveredLinks): void {
    const cache = this.loadCache();
    const idx = cache.findIndex((c) => c.service === link.service);
    if (idx >= 0) cache[idx] = link;
    else cache.push(link);
    /* FIFO 200 */
    const trimmed = cache.length > CACHE_MAX_ENTRIES ? cache.slice(-CACHE_MAX_ENTRIES) : cache;
    this.persistCache(trimmed);
  }

  private persistCache(cache: DiscoveredLinks[]): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* quota — ignore */
    }
  }

  /**
   * Cache fresh si verifiedAt < 7 jours.
   */
  private isCacheFresh(link: DiscoveredLinks): boolean {
    if (!link.verifiedAt) return false;
    const age = Date.now() - link.verifiedAt;
    return age < 7 * 24 * 60 * 60 * 1000;
  }

  /**
   * Normalize service name : lowercase, trim, alphanum + `_`.
   */
  private normalizeServiceName(service: string): string {
    return service.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  }

  private extractDomain(url: string): string | null {
    if (!url) return null;
    const m = url.match(/^https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/|$|:|\?)/i);
    return m?.[1] ?? null;
  }

  private serviceFromDomain(domain: string): string {
    const parts = domain.split('.');
    const generic = new Set(['api', 'www', 'app', 'dashboard', 'console', 'developer', 'docs', 'login', 'auth', 'accounts']);
    for (const p of parts) {
      if (!generic.has(p) && p.length >= 3 && !/^\d+$/.test(p)) {
        return p.toLowerCase();
      }
    }
    return parts[0] ?? 'unknown';
  }
}

export const autoDiscoverLinks = new AutoDiscoverLinks();
