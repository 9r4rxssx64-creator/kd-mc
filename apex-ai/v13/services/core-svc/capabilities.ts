/**
 * APEX v13 — Capabilities Registry (au-delà 100/100 axe Polyvalence).
 *
 * Demande Kevin (CLAUDE.md règle "Mes compétences IA") :
 * "Liste auto-générée depuis registry interne AX_CAPABILITIES + version
 *  Mise à jour AUTOMATIQUE à chaque release (sentinelle capabilities-watch)"
 *
 * Registry single source of truth pour :
 * - "Mes compétences IA" (UI vCapabilities côté user)
 * - Tutoriel découverte
 * - Intent detection (ce qu'Apex peut faire)
 * - System prompt enrichissement
 *
 * Auto-MAJ : chaque service nouveau ajouté → on register sa capability ici.
 * Sentinelle scan apex-tools.ts + features/* + services/* mensuel pour détecter orphans.
 */

/* v13.3.71 PERF : apex-tools registry retiré du bundle initial (76KB raw / 16KB gzip).
 * Lazy import dans `auditOrphans()` uniquement (méthode admin debug, jamais appelée au boot). */

export interface Capability {
  id: string;
  category: 'ia' | 'creation' | 'productivity' | 'security' | 'finance' | 'communication' | 'orchestration' | 'memory';
  emoji: string;
  label: string;
  description: string;
  since_version: string;
  tools_used: readonly string[];
  examples: readonly string[];
  enabled: boolean;
}

const CAPABILITIES: readonly Capability[] = [
  /* === IA === */
  {
    id: 'multi_provider_chat',
    category: 'ia',
    emoji: '🤖',
    label: 'Chat IA multi-provider',
    description: 'Conversations avec failover Anthropic Claude → OpenRouter → Groq → Gemini → OpenClaw',
    since_version: 'v13.0.0',
    tools_used: ['ai-router'],
    examples: ['Pose-moi n\'importe quelle question', 'Aide-moi à rédiger un email pro'],
    enabled: true,
  },
  {
    id: 'ai_safety',
    category: 'ia',
    emoji: '🛡',
    label: 'AI Safety (10 contrôles)',
    description: 'Alignment scoring + hallucination detect + prompt injection filter + jailbreak heuristics',
    since_version: 'v13.0.0',
    tools_used: ['ai-safety'],
    examples: ['Apex refuse jailbreaks et leak PII', 'Cite ses sources autoritaires'],
    enabled: true,
  },
  {
    id: 'voice_chat',
    category: 'ia',
    emoji: '🎙',
    label: 'Voix & wake word',
    description: 'STT (dictée) + TTS multi-voix + wake word "Dis Apex" + voice biométrie',
    since_version: 'v13.0.0',
    tools_used: ['voice'],
    examples: ['Dis Apex, ouvre mon planning', 'Dictée vocale de notes'],
    enabled: true,
  },

  /* === CRÉATION === */
  {
    id: 'studios_creatifs',
    category: 'creation',
    emoji: '🎨',
    label: 'Studios créatifs (15)',
    description: 'Musique, vidéo, CV, facture, contrat, présentation, clip, logo, archi, plant, geo, building, lunar, pet, scan',
    since_version: 'v13.0.0',
    tools_used: ['studios'],
    examples: ['Crée-moi un mix musical', 'Génère ma facture mensuelle'],
    enabled: true,
  },
  {
    id: 'ocr_vision',
    category: 'creation',
    emoji: '📷',
    label: 'OCR + Vision IA',
    description: 'Tesseract.js local pour OCR + Claude/GPT-4o vision pour analyse images',
    since_version: 'v13.0.0',
    tools_used: ['ocr_scan', 'image_analyze'],
    examples: ['Scanne ce ticket', 'Analyse cette photo'],
    enabled: true,
  },
  {
    id: 'qr_generation',
    category: 'creation',
    emoji: '⬛',
    label: 'QR Code generator',
    description: 'URL, vCard, WiFi credentials, plain text',
    since_version: 'v13.0.0',
    tools_used: ['qr_generate'],
    examples: ['QR pour mon WiFi maison', 'vCard contact pro'],
    enabled: true,
  },

  /* === PRODUCTIVITY === */
  {
    id: 'translate_30langs',
    category: 'productivity',
    emoji: '🌐',
    label: 'Traduction 30+ langues',
    description: 'DeepL premium → fallback Claude Haiku',
    since_version: 'v13.0.0',
    tools_used: ['translate'],
    examples: ['Traduis ce mail en italien', 'Mode interprète conversation live'],
    enabled: true,
  },
  {
    id: 'calendar_email',
    category: 'productivity',
    emoji: '📅',
    label: 'Agenda + emails',
    description: 'Création events iCal/Google + envoi via Brevo/Resend/EmailJS',
    since_version: 'v13.0.0',
    tools_used: ['create_calendar_event', 'send_email'],
    examples: ['RDV demain 14h dentiste', 'Envoie email récap au comptable'],
    enabled: true,
  },
  {
    id: 'pro_modules',
    category: 'productivity',
    emoji: '💼',
    label: 'Modules pro (8)',
    description: 'Cuisine, médical, finance, légal, traducteur, business, éducation, certifications',
    since_version: 'v13.0.0',
    tools_used: ['pro_modules'],
    examples: ['Article 1101 du Code civil', 'Recette risotto champignons'],
    enabled: true,
  },

  /* === SECURITY === */
  {
    id: 'vault_credentials',
    category: 'security',
    emoji: '🔐',
    label: 'Vault credentials (130+ patterns)',
    description: 'AES-GCM 256 + PBKDF2 200k + auto-detect Anthropic/OpenAI/Stripe/GitHub/etc.',
    since_version: 'v13.0.0',
    tools_used: ['vault', 'credential-patterns'],
    examples: ['Colle ta clé API, je détecte et range', 'Coffre fort chiffré'],
    enabled: true,
  },
  {
    id: 'webauthn_2fa',
    category: 'security',
    emoji: '👤',
    label: 'WebAuthn FaceID/TouchID',
    description: 'Authentification biométrique 2FA via passkeys',
    since_version: 'v13.0.0',
    tools_used: ['webauthn'],
    examples: ['Login FaceID iPhone', 'TouchID Mac'],
    enabled: true,
  },
  {
    id: 'rgpd_compliance',
    category: 'security',
    emoji: '⚖️',
    label: 'RGPD Art. 15-22',
    description: 'Export complet JSON + suppression cascade + consent granulaire',
    since_version: 'v13.0.0',
    tools_used: ['rgpd'],
    examples: ['Export mes données', 'Supprimer mon compte'],
    enabled: true,
  },

  /* === FINANCE === */
  {
    id: 'finance_calc',
    category: 'finance',
    emoji: '💰',
    label: 'Calcul fiscal/financier',
    description: 'IR France 2026 (tranches), crédit immo, plus-value (abattement), IBAN MOD97 ISO',
    since_version: 'v13.0.0',
    tools_used: ['finance_calculate'],
    examples: ['Calcul IR 50k€ 1 part', 'Mensualité crédit 200k 25 ans'],
    enabled: true,
  },
  {
    id: 'tokens_dashboard',
    category: 'finance',
    emoji: '📊',
    label: 'Dashboard conso tokens IA',
    description: 'Track usage par provider + estimation coût € + alertes si > seuil',
    since_version: 'v13.0.0',
    tools_used: ['tokens-dashboard'],
    examples: ['Combien j\'ai dépensé chez Anthropic ce mois ?', 'Alerte > 50€'],
    enabled: true,
  },
  {
    id: 'commerce_plans',
    category: 'finance',
    emoji: '💳',
    label: 'Commerce + plans (Stripe)',
    description: 'free / basic 9€ / pro 29€ / business — bypass admin Kevin',
    since_version: 'v13.0.0',
    tools_used: ['commerce'],
    examples: ['Toggle commerce ON/OFF', 'Assign plan pro à client'],
    enabled: true,
  },

  /* === COMMUNICATION === */
  {
    id: 'whatsapp_otp',
    category: 'communication',
    emoji: '💬',
    label: 'WhatsApp OTP confirmation',
    description: 'Création comptes clients via Kevin WhatsApp + code 6 caractères',
    since_version: 'v13.0.0',
    tools_used: ['whatsapp'],
    examples: ['Créer compte famille', 'Confirmer OTP'],
    enabled: true,
  },
  {
    id: 'telegram_push',
    category: 'communication',
    emoji: '📨',
    label: 'Telegram + push notifs',
    description: 'Bot @Kdmc_kevind_2026_bot + Cloudflare push worker',
    since_version: 'v13.0.0',
    tools_used: ['send_telegram'],
    examples: ['Notif Kevin si erreur critique'],
    enabled: true,
  },
  {
    id: 'web_search_failover',
    category: 'communication',
    emoji: '🔍',
    label: 'Web search 3 providers',
    description: 'Brave Search → Tavily → DuckDuckGo failover',
    since_version: 'v13.0.0',
    tools_used: ['web_search', 'web_fetch'],
    examples: ['Cherche les derniers modèles IA 2026', 'Fetch cette URL'],
    enabled: true,
  },

  /* === ORCHESTRATION === */
  {
    id: 'projects_orchestrator',
    category: 'orchestration',
    emoji: '🏗',
    label: 'Orchestrateur 6 projets Kevin',
    description: 'CMCteams + Télécommande + KDMC + e-KDMC + IA-KDMC + CrackPass',
    since_version: 'v13.0.0',
    tools_used: ['orchestrator', 'project_status', 'project_continue'],
    examples: ['Statut CMCteams', 'Continue le projet e-KDMC'],
    enabled: true,
  },
  {
    id: 'subagents_internal',
    category: 'orchestration',
    emoji: '🧠',
    label: 'Subagents internes (4 types)',
    description: 'audit / plan / research / monitor avec timeout 60s + cap 5 concurrent',
    since_version: 'v13.0.0',
    tools_used: ['agent-system'],
    examples: ['Lance audit perf indépendant', 'Plan cette feature en 5 steps'],
    enabled: true,
  },
  {
    id: 'sentinels_24_7',
    category: 'orchestration',
    emoji: '🛰',
    label: 'Sentinelles 24/7 (13)',
    description: 'token-watch, backup-watch, error-watch, security-watch, presence-watch, etc.',
    since_version: 'v13.0.0',
    tools_used: ['sentinels'],
    examples: ['Auto-fix patterns détectés', 'Alertes proactives admin'],
    enabled: true,
  },

  /* === MEMORY === */
  {
    id: 'memory_persistent',
    category: 'memory',
    emoji: '📚',
    label: 'Mémoire persistante cross-session',
    description: 'memory_add (1000 facts max) + memory_recall + lesson_record (500 lessons max)',
    since_version: 'v13.0.0',
    tools_used: ['memory_recall', 'memory_add', 'lesson_record'],
    examples: ['Rappelle ma préférence X', 'N\'oublie pas que je travaille au CMC'],
    enabled: true,
  },
  {
    id: 'knowledge_update_auto',
    category: 'memory',
    emoji: '🔄',
    label: 'Knowledge update auto',
    description: 'Fetch docs Anthropic/OpenAI/Stripe/Firebase/Cloudflare pour KB',
    since_version: 'v13.0.0',
    tools_used: ['knowledge_update'],
    examples: ['MAJ docs Anthropic', 'Synchronise dernières features'],
    enabled: true,
  },
  {
    id: 'auto_perf_monitoring',
    category: 'memory',
    emoji: '📈',
    label: 'Perf metrics live (Web Vitals)',
    description: 'LCP/INP/CLS/FCP/TTFB capturés via PerformanceObserver',
    since_version: 'v13.0.1',
    tools_used: ['perf-metrics'],
    examples: ['Score Lighthouse runtime', 'Alerte si LCP > 2.5s'],
    enabled: true,
  },
];

class CapabilitiesRegistry {
  list(): readonly Capability[] {
    return CAPABILITIES.filter((c) => c.enabled);
  }

  listAll(): readonly Capability[] {
    return CAPABILITIES;
  }

  byCategory(category: Capability['category']): readonly Capability[] {
    return this.list().filter((c) => c.category === category);
  }

  count(): number {
    return CAPABILITIES.filter((c) => c.enabled).length;
  }

  countByCategory(): Record<Capability['category'], number> {
    const result: Record<string, number> = {
      ia: 0,
      creation: 0,
      productivity: 0,
      security: 0,
      finance: 0,
      communication: 0,
      orchestration: 0,
      memory: 0,
    };
    for (const c of this.list()) {
      result[c.category] = (result[c.category] ?? 0) + 1;
    }
    return result as Record<Capability['category'], number>;
  }

  search(keyword: string): readonly Capability[] {
    const lc = keyword.toLowerCase();
    return this.list().filter(
      (c) =>
        c.label.toLowerCase().includes(lc) ||
        c.description.toLowerCase().includes(lc) ||
        c.examples.some((e) => e.toLowerCase().includes(lc)),
    );
  }

  /**
   * Format pour system prompt IA (parité Claude Code injection contexte).
   */
  toPromptContext(): string {
    const cats = this.countByCategory();
    const lines = [`APEX CAPABILITIES (${this.count()} actives)`];
    for (const [cat, n] of Object.entries(cats)) {
      if (n === 0) continue;
      lines.push(`  ${cat} (${n}) :`);
      const items = this.byCategory(cat as Capability['category']);
      for (const c of items.slice(0, 5)) {
        lines.push(`    ${c.emoji} ${c.label} — ${c.description.slice(0, 80)}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Audit orphans : capabilities listées mais tools manquants dans apex-tools registry.
   * Sprint 13.3.17 fix : `tools_used` recense aussi des services internes (ai-router,
   * voice, vault, sentinels...) qui ne sont pas exposés comme apex-tools mais sont
   * tout aussi présents. Whitelist pour ne pas les compter comme orphans.
   * v13.3.24 fix Kevin (screenshot 19:11 "16 tools orphelins (50%)") :
   *   - Whitelist services internes étendue (auto-backup, audit-log, observability, etc.
   *     déclarés dans bootstrap mais pas dans apex-tools registry)
   *   - Skip tools désactivés (cap.enabled=false) → pas comptés dans coverage
   *   - Cible >= 90% coverage (vs 50% screenshot) */
  async auditOrphans(): Promise<{ orphans: string[]; coverage_pct: number }> {
    /* v13.3.71 PERF : lazy load apex-tools (76KB raw) — appelé uniquement
     * depuis vue admin debug, jamais au boot. */
    const { apexTools } = await import('./apex-tools.js');
    const apexToolNames = new Set(apexTools.list().map((t) => t.name));
    const KNOWN_INTERNAL_SERVICES = new Set<string>([
      /* IA / orchestration */
      'ai-router', 'ai-safety', 'voice', 'studios', 'vault', 'credential-patterns',
      'webauthn', 'rgpd', 'pro_modules', 'tokens-dashboard', 'commerce',
      'whatsapp', 'orchestrator', 'agent-system', 'sentinels', 'perf-metrics',
      /* v13.3.24 : services internes wirés par bootstrap (non exposés via apex-tools) */
      'auto-backup', 'audit-log', 'observability', 'firebase-queue', 'memory',
      'memory-bridge', 'auth', 'capabilities', 'features-toggles', 'feature-toggles',
      'bodyguard', 'ai-providers-health', 'observability-dlq', 'self-healing',
      /* Services agent-system enfants (subagents internes) */
      'audit', 'plan', 'research', 'monitor',
    ]);
    const orphans: string[] = [];
    let total = 0;
    let matched = 0;
    /* v13.3.24 : itère uniquement les capabilities actives (enabled=true) */
    for (const cap of this.list()) {
      for (const t of cap.tools_used) {
        total++;
        if (apexToolNames.has(t) || KNOWN_INTERNAL_SERVICES.has(t)) matched++;
        else if (!orphans.includes(t)) orphans.push(t);
      }
    }
    return {
      orphans,
      coverage_pct: total > 0 ? Math.round((matched / total) * 100) : 100,
    };
  }
}

export const capabilities = new CapabilitiesRegistry();
