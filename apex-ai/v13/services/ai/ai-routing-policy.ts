/**
 * APEX v13 — AI Routing Policy intelligente.
 *
 * Demande Kevin 2026-05-04 :
 * "Priorise les gratuits performants sans limite ou non gênant à terme.
 *  Organise au mieux la conso entre les différentes IA suivant les demandes,
 *  travaux demandés et les choix admins. Toujours garder Anthropic opérationnel
 *  en priorité."
 *
 * Stratégie :
 * 1. ANTHROPIC = priorité absolue par défaut (admin, sécu, raisonnement complexe)
 * 2. FREE FIRST : tâches simples → Groq/Gemini gratuit
 * 3. DOMAIN ROUTING : code → DeepSeek/Claude, vision → Gemini, speed → Groq
 * 4. FAILOVER : Anthropic → OpenRouter (free) → Gemini → Groq → OpenAI
 * 5. ADMIN OVERRIDE : preferredProvider + economyMode/premiumMode
 * 6. AUTO ÉCONOMIE : si budget Anthropic > 80% → bascule auto free-first
 *
 * Anti-pattern :
 * - Pas bloquer user si Anthropic full → toujours fallback gratuit
 * - Garder réserve Anthropic pour admin Kevin urgent
 */

import { logger } from '../../core/logger.js';
import { PROXY_PROVIDERS } from '../integrations/apex-secrets-proxy-client.js';
import { consumptionMonitor } from '../observability/consumption-monitor.js';


/* v13.4.366 : 'qwen' = Qwen GRATUIT servi par Cloudflare Workers AI via le proxy (0 clé). */
export type ProviderId = 'anthropic' | 'openai' | 'groq' | 'gemini' | 'openrouter' | 'deepseek' | 'cohere' | 'mistral' | 'perplexity' | 'qwen';

export type TaskDomain =
  | 'general' /* Chat normal */
  | 'admin' /* Admin Kevin (sécurité, config, sensitive) */
  | 'code' /* Programmation */
  | 'vision' /* Image / OCR analysis */
  | 'long_context' /* Document > 5000 tokens */
  | 'speed' /* Vitesse critique */
  | 'reasoning' /* Raisonnement complexe */
  | 'search' /* Citations / recherche */
  | 'translation' /* Traduction simple */
  | 'summary' /* Résumé court */
  | 'creative'; /* Écriture créative */

/* v13.4.362 (Kevin « Privilégie les IA gratuites suivant les questions ») :
 * 'free-smart' = par DÉFAUT pour l'admin. Questions SIMPLES (traduction, résumé,
 * rapidité, chat général, vision) → IA GRATUITE d'abord (Gemini/Groq/OpenRouter).
 * Questions COMPLEXES (code, raisonnement, admin, créatif, long contexte) → Anthropic.
 * Anthropic reste en fallback partout → une panne Anthropic ne bloque plus rien.
 * v13.4.366 (Kevin « Fait tourner Apex sur Qwen l'IA gratuite ») : le gratuit choisi en
 * premier est désormais QWEN (Workers AI, 0 clé) ; la bascule par domaine est inchangée. */
export type RoutingMode = 'auto' | 'economy' | 'premium' | 'forced' | 'free-smart';

export interface RoutingDecision {
  primary: ProviderId;
  fallback_chain: readonly ProviderId[];
  reason: string;
  is_free_tier: boolean;
  estimated_cost_eur: number;
}

/* v13.4.366 (Kevin 2026-09-05 « Fait tourner Apex sur Qwen l'IA gratuite, privilégie les IA
 * gratuites en tâche principale pour l'instant, et suivant les questions elle bascule
 * automatiquement sur la plus polyvalente, la plus pertinente pour la tâche ») :
 *   - QWEN (gratuit, Workers AI, 0 clé) = IA PRINCIPALE des questions courantes
 *     (général, résumé, traduction) ;
 *   - la question DÉCIDE de la bascule : code / raisonnement / admin / créatif → Anthropic
 *     (la plus polyvalente), vision → Gemini, recherche → Perplexity, vitesse → Groq,
 *     très long contexte → Gemini (1M) ;
 *   - Qwen reste 2e partout où il est pertinent (secours gratuit), Anthropic reste en
 *     secours partout → une panne ne bloque jamais. */
const DOMAIN_PREFERENCES: Record<TaskDomain, readonly ProviderId[]> = {
  /* Admin Kevin (actions, outils, sécurité) = TOUJOURS Anthropic d'abord (seul provider à outils) */
  admin: ['anthropic', 'openai', 'gemini', 'qwen'],
  /* Raisonnement complexe = Anthropic > Qwen (qwen3 raisonne, gratuit) > OpenAI > Gemini */
  reasoning: ['anthropic', 'qwen', 'openai', 'gemini', 'groq'],
  /* Code = Anthropic > Qwen (qwen2.5-coder gratuit) > DeepSeek > OpenAI */
  code: ['anthropic', 'qwen', 'deepseek', 'openai', 'gemini'],
  /* Vision = Gemini gratuit + Claude (Qwen texte seul sur Workers AI → absent) */
  vision: ['gemini', 'anthropic', 'openai'],
  /* Long context = Gemini 1M tokens gratuit, puis Qwen 3.8 (262k) */
  long_context: ['gemini', 'anthropic', 'qwen', 'openai'],
  /* Speed = Groq (500+ tok/sec), puis Qwen gratuit */
  speed: ['groq', 'qwen', 'gemini', 'openrouter', 'anthropic'],
  /* Search citations = Perplexity puis Anthropic */
  search: ['perplexity', 'anthropic', 'gemini', 'qwen'],
  /* Traduction simple = Qwen gratuit (multilingue) d'abord */
  translation: ['qwen', 'gemini', 'groq', 'openrouter', 'anthropic'],
  /* Résumé court = Qwen gratuit d'abord */
  summary: ['qwen', 'groq', 'gemini', 'openrouter', 'anthropic'],
  /* Créatif = Anthropic en premier (qualité), Qwen en secours gratuit */
  creative: ['anthropic', 'qwen', 'openai', 'gemini'],
  /* Général = QWEN GRATUIT EN PRINCIPAL (Kevin 2026-09-05), Anthropic en secours */
  general: ['qwen', 'anthropic', 'gemini', 'groq', 'openrouter'],
};

/* Qwen en tête : c'est lui que « gratuit d'abord » choisit quand plusieurs gratuits existent. */
const FREE_PROVIDERS: readonly ProviderId[] = ['qwen', 'groq', 'gemini', 'openrouter'];

/* v13.4.362 — Providers IA servis par le proxy Cloudflare (clé côté serveur).
 * Quand le proxy est actif (défaut), ces providers sont DISPONIBLES même sans
 * clé locale `ax_*_key` → indispensable pour que free-smart route vraiment vers
 * Gemini/Groq. Source unique = PROXY_PROVIDERS du client proxy. */
const PROXIED_AI: ReadonlySet<ProviderId> = new Set(
  (PROXY_PROVIDERS as readonly string[]).filter(
    (p): p is ProviderId => (['anthropic', 'openai', 'groq', 'gemini', 'deepseek', 'cohere', 'mistral', 'perplexity', 'qwen'] as string[]).includes(p),
  ),
);

/* v13.4.362 — Domaines "simples" où une IA GRATUITE suffit (mode free-smart).
 * Les autres (code, reasoning, admin, creative, long_context, search) gardent
 * Anthropic/spécialisé en primaire pour la qualité. */
const SIMPLE_FREE_DOMAINS: readonly TaskDomain[] = ['translation', 'summary', 'speed', 'general', 'vision'];

/* Coûts indicatifs €/1M tokens (avg in/out) */
const COST_PER_M_TOKENS_EUR: Record<ProviderId, number> = {
  anthropic: 8.0,    /* Sonnet 4.6 */
  openai: 6.0,       /* GPT-4o */
  groq: 0,           /* Free tier */
  gemini: 0,         /* Free tier 1M/jour */
  openrouter: 0,     /* Free models Llama, Mixtral */
  deepseek: 0.4,     /* Très bon marché */
  cohere: 1.5,       /* Command R+ */
  mistral: 4.0,      /* Large */
  perplexity: 5.0,   /* Sonar */
  qwen: 0,           /* v13.4.366 : Workers AI, palier gratuit — 0 € */
};

class AIRoutingPolicy {
  /**
   * Décide quel provider utiliser pour une tâche donnée.
   */
  decide(domain: TaskDomain = 'general', estimatedTokens = 1000): RoutingDecision {
    const mode = this.getMode();
    const adminOverride = this.getAdminOverride();

    /* Mode forced : admin a forcé un provider spécifique */
    if (mode === 'forced' && adminOverride) {
      return this.buildDecision(adminOverride, domain, estimatedTokens, `Admin forced ${adminOverride}`);
    }

    /* Mode premium : Anthropic Opus toujours */
    if (mode === 'premium') {
      return this.buildDecision('anthropic', domain, estimatedTokens, 'Premium mode (Anthropic always)');
    }

    /* Mode free-smart (Kevin « privilégie les IA gratuites suivant les questions ») :
     * questions SIMPLES → IA gratuite d'abord ; questions COMPLEXES → Anthropic.
     * Anthropic (et les payants du domaine) restent en fallback → 0 blocage si panne. */
    if (mode === 'free-smart') {
      if (SIMPLE_FREE_DOMAINS.includes(domain)) {
        /* Prend le 1er provider gratuit du domaine, sinon n'importe quel gratuit dispo. */
        const prefs = DOMAIN_PREFERENCES[domain];
        const freeInDomain = prefs.find((p) => FREE_PROVIDERS.includes(p) && this.hasKey(p))
          ?? FREE_PROVIDERS.find((p) => this.hasKey(p));
        if (freeInDomain) {
          return this.buildDecision(freeInDomain, domain, estimatedTokens,
            `Free-smart : question simple (${domain}) → ${freeInDomain} (gratuit)`);
        }
        /* aucun gratuit configuré → domaine normal (Anthropic) */
      }
      /* Domaine complexe (code/reasoning/admin/creative/long_context/search) OU
       * pas de gratuit → primaire du domaine (Anthropic-first), free en fallback. */
      const prefs = DOMAIN_PREFERENCES[domain];
      const primary = prefs.find((p) => this.hasKey(p)) ?? 'anthropic';
      return this.buildDecision(primary, domain, estimatedTokens,
        `Free-smart : question ${domain} → ${primary} (qualité)`);
    }

    /* Mode economy : free first systématique */
    if (mode === 'economy') {
      const freeAvailable = FREE_PROVIDERS.find((p) => this.hasKey(p));
      if (freeAvailable) {
        return this.buildDecision(freeAvailable, domain, estimatedTokens, 'Economy mode (free first)');
      }
      /* Pas de provider gratuit configuré → fallback Anthropic */
      return this.buildDecision('anthropic', domain, estimatedTokens, 'Economy mode mais aucun free configuré');
    }

    /* Mode auto (défaut) : domain-based + Anthropic priority + budget aware */

    /* Check budget Anthropic */
    const anthropicStatus = consumptionMonitor.getServiceStatus('anthropic');
    const anthropicCritical = anthropicStatus.severity === 'critical';
    const anthropicWarn = anthropicStatus.severity === 'warn';

    /* Domain admin = TOUJOURS Anthropic même si budget critique (réserve admin) */
    if (domain === 'admin') {
      return this.buildDecision('anthropic', domain, estimatedTokens, 'Admin task : Anthropic priority absolute');
    }

    const preferences = DOMAIN_PREFERENCES[domain];
    const available = preferences.filter((p) => this.hasKey(p));

    /* Si Anthropic critique → free first */
    if (anthropicCritical) {
      const freeOption = available.find((p) => FREE_PROVIDERS.includes(p));
      if (freeOption) {
        return this.buildDecision(freeOption, domain, estimatedTokens,
          `Anthropic ${anthropicStatus.pct_used}% → free fallback ${freeOption}`);
      }
    }

    /* Si Anthropic warn (>70%) et tâche simple (summary/translation) → free first */
    if (anthropicWarn && (domain === 'summary' || domain === 'translation' || domain === 'speed')) {
      const freeOption = available.find((p) => FREE_PROVIDERS.includes(p));
      if (freeOption) {
        return this.buildDecision(freeOption, domain, estimatedTokens,
          `Anthropic ${anthropicStatus.pct_used}% + tâche simple → ${freeOption}`);
      }
    }

    /* Sinon : préférence domain (Anthropic priority par défaut) */
    const primary = available[0] ?? 'anthropic';
    return this.buildDecision(primary, domain, estimatedTokens,
      `Domain ${domain} preference (Anthropic priority)`);
  }

  /**
   * Construit decision complète avec fallback chain.
   */
  private buildDecision(primary: ProviderId, domain: TaskDomain, tokens: number, reason: string): RoutingDecision {
    const allPrefs = DOMAIN_PREFERENCES[domain];
    const fallbacks = allPrefs.filter((p) => p !== primary && this.hasKey(p));
    /* Ajoute always free providers en queue de fallback */
    for (const free of FREE_PROVIDERS) {
      if (!fallbacks.includes(free) && primary !== free && this.hasKey(free)) {
        fallbacks.push(free);
      }
    }
    const cost = (COST_PER_M_TOKENS_EUR[primary] * tokens) / 1_000_000;
    return {
      primary,
      fallback_chain: fallbacks,
      reason,
      is_free_tier: FREE_PROVIDERS.includes(primary),
      estimated_cost_eur: cost,
    };
  }

  /**
   * Mode actuel (admin choice persisté).
   */
  getMode(): RoutingMode {
    try {
      const m = localStorage.getItem('apex_v13_routing_mode');
      const valid = m === 'auto' || m === 'economy' || m === 'premium' || m === 'forced' || m === 'free-smart';
      const isAdmin = localStorage.getItem('apex_v13_uid') === 'kdmc_admin';
      /* v13.4.338 (Kevin « toujours openai » MALGRÉ le fix v337) : cause racine =
       * un mode stocké 'economy' posé AUTOMATIQUEMENT par apex-self-audit
       * (switch_to_economy_mode) OU un ancien toggle → getMode le renvoyait AVANT le
       * défaut premium → l'admin n'était pas en premium → v337 (premium-only) ne
       * s'activait pas → smart-router remettait openai en tête.
       *
       * Fix (conforme leçon #124 : respecter le choix EXPLICITE, pas un réglage auto) :
       * pour l'ADMIN, on n'honore le mode stocké QUE s'il a été choisi EXPLICITEMENT
       * via ⚡ (flag `apex_v13_routing_mode_explicit`). Un mode posé par un auto-fix
       * (sans flag) est IGNORÉ → l'admin retombe sur 'premium' (Anthropic toujours).
       * Effet de bord voulu : les appareils déjà pollués (economy auto, sans flag)
       * repassent premium tout seuls, sans action de Kevin. Les clients : inchangés. */
      if (valid) {
        if (!isAdmin) return m;
        const explicit = localStorage.getItem('apex_v13_routing_mode_explicit') === '1';
        if (explicit) return m;
        /* admin + mode stocké NON explicite → ignoré, on tombe sur le défaut admin */
      }
      /* v13.4.362 (Kevin « Privilégie les IA gratuites suivant les questions ») :
       * défaut admin = 'free-smart' (gratuit pour les questions simples, Anthropic
       * pour les complexes) au lieu de 'premium' (Anthropic toujours). Kevin peut
       * toujours forcer 'premium' explicitement via ⚡ (respecté, cf. leçon #124). */
      if (isAdmin) return 'free-smart';
    } catch {
      /* ignore */
    }
    return 'auto';
  }

  /**
   * @param explicit true = choix utilisateur direct (⚡ / réglages) → honoré même
   *   pour l'admin. false (défaut) = réglage automatique (auto-fix) → n'écrase PAS
   *   le défaut premium de l'admin (cf. getMode v13.4.338).
   */
  setMode(mode: RoutingMode, explicit = false): void {
    try {
      localStorage.setItem('apex_v13_routing_mode', mode);
      if (explicit) localStorage.setItem('apex_v13_routing_mode_explicit', '1');
      else localStorage.removeItem('apex_v13_routing_mode_explicit');
      logger.info('ai-routing-policy', `mode set to ${mode}`, { explicit });
    } catch {
      /* ignore */
    }
  }

  getAdminOverride(): ProviderId | null {
    try {
      const o = localStorage.getItem('apex_v13_routing_forced_provider');
      if (!o) return null;
      const valid: ProviderId[] = ['anthropic', 'openai', 'groq', 'gemini', 'openrouter', 'deepseek', 'cohere', 'mistral', 'perplexity', 'qwen'];
      return valid.includes(o as ProviderId) ? (o as ProviderId) : null;
    } catch {
      return null;
    }
  }

  setAdminOverride(provider: ProviderId | null): void {
    try {
      if (provider === null) {
        localStorage.removeItem('apex_v13_routing_forced_provider');
      } else {
        localStorage.setItem('apex_v13_routing_forced_provider', provider);
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Détecte automatiquement le domain depuis le texte user.
   * Heuristique simple — Apex IA peut override.
   */
  detectDomain(text: string): TaskDomain {
    const lc = text.toLowerCase();
    /* v13.4.366 : une DEMANDE D'ACTION (lancer, déployer, corriger, modifier, configurer,
     * tester, auditer…) exige les OUTILS d'Apex — seul Anthropic les porte
     * (PROVIDERS_WITH_TOOLS). Sans ce garde, « Qwen en principal » aurait répondu du texte
     * à « lance l'audit » au lieu d'agir → domaine admin (Anthropic d'abord). */
    if (/\b(lance|exécute|execute|déploie|deploie|corrige|répare|repare|modifie|configure|installe|active|désactive|desactive|supprime|envoie|sauvegarde|synchronise|publie|merge|pousse|audit(e|er)?|teste|vérifie|verifie|diagnosti(c|que))\b/.test(lc)
      && !/\b(comment|pourquoi|est-ce que|c'est quoi|explique)\b/.test(lc)) return 'admin';
    if (/\bcode|programme|fonction|debug|bug|typescript|javascript|python|php|sql\b/.test(lc)) return 'code';
    if (/\bimage|photo|vision|scanner?|reconnaitre|détecter\b/.test(lc)) return 'vision';
    if (/\btraduit?|translate|en (anglais|italien|allemand|espagnol)\b/.test(lc)) return 'translation';
    if (/\brésume|résum[eé]|tldr|résumé\b/.test(lc)) return 'summary';
    if (/\b(rapide|vite|urgent|asap|maintenant)\b/.test(lc)) return 'speed';
    if (/\bcherche|recherche|trouve|google|info sur\b/.test(lc)) return 'search';
    if (/\bécris|invente|imagine|crée|histoire|poème\b/.test(lc)) return 'creative';
    if (text.length > 5000) return 'long_context';
    if (/\branalyse|réfléchis|explique|pourquoi|comment\b/.test(lc) && text.length > 200) return 'reasoning';
    return 'general';
  }

  /**
   * Status complet pour vue admin (debug routing).
   */
  getStatus(): {
    mode: RoutingMode;
    forced: ProviderId | null;
    anthropic_health: 'ok' | 'warn' | 'critical';
    free_providers_available: readonly ProviderId[];
    paid_providers_available: readonly ProviderId[];
  } {
    /* v13.4.362 : getStatus reflète les clés LOCALES réellement stockées (comme avant) —
     * l'apex-self-audit v13.4.340 s'appuie dessus + son PROPRE test proxy. La voie proxy
     * est gérée à part (routing hasKey proxy-aware). Ne PAS rendre getStatus proxy-aware
     * (sinon le finding « aucun provider » ne sort jamais → next_steps vides). */
    const free = FREE_PROVIDERS.filter((p) => this.hasLocalKey(p));
    const paid = (['anthropic', 'openai', 'deepseek', 'cohere', 'mistral', 'perplexity'] as ProviderId[]).filter((p) => this.hasLocalKey(p));
    const anthropicStatus = consumptionMonitor.getServiceStatus('anthropic');
    return {
      mode: this.getMode(),
      forced: this.getAdminOverride(),
      anthropic_health: anthropicStatus.severity,
      free_providers_available: free,
      paid_providers_available: paid,
    };
  }

  /**
   * Recommandation Kevin : qu'est-ce qui manque pour optimal ?
   */
  recommendActions(): readonly { priority: 'high' | 'medium' | 'low'; action: string; url?: string }[] {
    const recos: Array<{ priority: 'high' | 'medium' | 'low'; action: string; url?: string }> = [];
    if (!this.hasLocalKey('anthropic')) {
      recos.push({
        priority: 'high',
        action: 'Configurer Anthropic (priorité absolue Kevin)',
        url: 'https://console.anthropic.com/settings/keys',
      });
    }
    if (!this.hasLocalKey('groq')) {
      recos.push({
        priority: 'high',
        action: 'Inscription Groq (gratuit + 500 tok/sec rapide)',
        url: 'https://console.groq.com/keys',
      });
    }
    if (!this.hasLocalKey('gemini')) {
      recos.push({
        priority: 'high',
        action: 'Inscription Gemini (gratuit 1M tokens/jour)',
        url: 'https://aistudio.google.com/app/apikey',
      });
    }
    if (!this.hasLocalKey('openrouter')) {
      recos.push({
        priority: 'medium',
        action: 'Inscription OpenRouter (failover universel free Llama/Mixtral)',
        url: 'https://openrouter.ai/keys',
      });
    }
    return recos;
  }

  /** Proxy Cloudflare actif ? (défaut true — flag `apex_v13_use_secrets_proxy`). */
  private proxyActive(): boolean {
    try {
      const f = localStorage.getItem('apex_v13_use_secrets_proxy');
      return f !== 'false' && f !== '0';
    } catch {
      return true;
    }
  }

  private hasKey(provider: ProviderId): boolean {
    try {
      /* v13.4.362 : proxy actif → provider proxié dispo côté serveur (clé serveur),
       * même sans clé locale. Sinon on retombe sur la clé locale legacy `ax_*_key`. */
      if (this.proxyActive() && PROXIED_AI.has(provider)) return true;
      return this.hasLocalKey(provider);
    } catch {
      return false;
    }
  }

  /** Clé LOCALE réellement stockée (indépendant du proxy). Sert aux recommandations
   * de config : proposer d'ajouter une clé locale = backup si le proxy tombe. */
  private hasLocalKey(provider: ProviderId): boolean {
    try {
      const raw = localStorage.getItem(`ax_${provider}_key`);
      return raw !== null && raw.length > 0;
    } catch {
      return false;
    }
  }
}

export const aiRoutingPolicy = new AIRoutingPolicy();
