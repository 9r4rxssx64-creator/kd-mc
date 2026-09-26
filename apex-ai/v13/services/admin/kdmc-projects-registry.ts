/**
 * APEX v13 — KDMC Projects Registry
 *
 * Demande Kevin (CLAUDE.md règle absolue 2026-05-04) :
 * "Apex doit connaître TOUS projets internes pour tout faire en autonomie"
 *
 * Source de vérité unique des projets Kevin DESARZENS (KDMC).
 * Enrichit automatiquement le system prompt IA Apex à chaque appel.
 *
 * Différence vs `orchestrator.ts` :
 * - orchestrator = bridges runtime (cmc_read, open_tool, kdmc_stats)
 * - kdmc-projects-registry = METADATA riche (version, status, tech_stack,
 *   docs_links, sentinels_count, repo_url, deploy_url, last_updated)
 *   + formatForSystemPrompt() pour injection IA
 *
 * Storage :
 * - Catalog initial : in-memory (constante PROJECTS)
 * - Updates Kevin : localStorage `apex_v13_kdmc_projects_overrides` (merge sur catalog)
 *
 * API publique :
 * - list()                      : tous projets (catalog + overrides mergés)
 * - byId(id)                    : projet spécifique
 * - listActive()                : seulement status active/wip
 * - listByStatus(status)        : filtre par statut
 * - searchByKeyword(kw)         : recherche full-text (id/name/description/tech_stack)
 * - update(id, fields)          : update metadata (persist localStorage)
 * - formatForSystemPrompt()     : markdown structuré pour injection IA
 * - count()                     : total projets
 * - countActive()               : total actifs
 * - reset()                     : retire les overrides (utile tests)
 */

import { logger } from '../../core/logger.js';

export type ProjectStatus = 'active' | 'wip' | 'archived';

export interface KdmcProject {
  /** Slug stable, utilisé comme clé d'override et référence cross-service */
  id: string;
  /** Nom lisible affiché à Kevin et dans le system prompt */
  name: string;
  /** Numéro de version courant (ex: v13.0.20, v9.593) */
  version: string;
  /** active = production, wip = développement, archived = info conservée */
  status: ProjectStatus;
  /** Description courte (1 phrase, niche métier visible) */
  description: string;
  /** URL repo source (GitHub) */
  repo_url: string;
  /** URL déploiement live (GitHub Pages, Vercel, custom domain) */
  deploy_url: string;
  /** Adresse kd-mc.com dédiée (sous-domaine du portail, si applicable) */
  domain_url?: string;
  /** Stack technique principale (max 6 entries pour lisibilité IA) */
  tech_stack: readonly string[];
  /** Date de création (ISO 8601 YYYY-MM-DD) */
  created_at: string;
  /** Date dernière mise à jour metadata (timestamp ms) */
  last_updated: number;
  /** Liens documentation (clé lisible → URL) */
  docs_links: Readonly<Record<string, string>>;
  /** Nombre de sentinelles dédiées au projet (estimation) */
  sentinels_count: number;
}

const STORAGE_KEY_OVERRIDES = 'apex_v13_kdmc_projects_overrides';

/**
 * Catalogue initial (immutable). Source de vérité primaire.
 *
 * À enrichir quand Kevin lance un nouveau projet — ne jamais retirer un projet
 * archivé (info historique conservée pour mémoire IA cross-session).
 */
export const KDMC_PROJECTS: readonly KdmcProject[] = [
  {
    id: 'apex',
    name: 'APEX AI',
    version: 'v13.0.20',
    status: 'active',
    description: 'Assistant IA personnel niveau entreprise (multi-providers, vault chiffré, sentinelles 24/7)',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: 'https://apex-ai.kd-mc.com/',
    domain_url: 'https://apex-ai.kd-mc.com/',
    tech_stack: ['TypeScript', 'Vite', 'Vitest', 'Playwright', 'Anthropic Claude', 'Cloudflare Workers'],
    created_at: '2025-12-15',
    last_updated: Date.now(),
    docs_links: {
      claude_md: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/CLAUDE.md',
      readme: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/apex-ai/v13/README.md',
      apex_projects: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/APEX_PROJECTS.md',
    },
    sentinels_count: 22,
  },
  {
    id: 'cmcteams',
    name: 'CMCteams',
    version: 'v9.593',
    status: 'active',
    description: 'Planning + équipes Casino Monaco SBM (258 employés, sync Firebase temps réel)',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: 'https://cmcteams.kd-mc.com/',
    domain_url: 'https://cmcteams.kd-mc.com/',
    tech_stack: ['HTML5 SPA monofichier', 'JavaScript vanilla', 'Firebase Realtime DB', 'PWA'],
    created_at: '2024-06-01',
    last_updated: Date.now(),
    docs_links: {
      claude_md: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/CLAUDE.md',
      notes_user: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/NOTES_USER.md',
      changelog: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/CHANGELOG.md',
    },
    sentinels_count: 16,
  },
  {
    id: 'cmcteams-light',
    name: 'CMCteams light',
    version: 'v1.16',
    status: 'active',
    description: 'Vue rapide des ordres de départ + équipes du Casino Monaco (page légère, lecture sans ouvrir l\'app ; sync app↔page, mode admin PIN)',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: 'https://departs.kd-mc.com/',
    domain_url: 'https://cmcteams-light.kd-mc.com/',
    tech_stack: ['HTML5 monofichier', 'JavaScript vanilla', 'Firebase Realtime DB', 'PWA'],
    created_at: '2026-06-22',
    last_updated: Date.now(),
    docs_links: {
      claude_md: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/CLAUDE.md',
    },
    sentinels_count: 0,
  },
  {
    id: 'ekdmc',
    name: 'e-KDMC',
    version: 'v0.4',
    status: 'wip',
    description: 'Site web Kevin DESARZENS Music & Co — marketplace 5 boutiques + e-commerce',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: '',
    tech_stack: ['HTML5', 'JavaScript', 'Stripe', 'PayPal', 'Firebase'],
    created_at: '2026-01-10',
    last_updated: Date.now(),
    docs_links: {
      readme: 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/_PROJECTS_KDMC/README.md',
    },
    sentinels_count: 4,
  },
  {
    id: 'iakdmc',
    name: 'IA-KDMC',
    version: 'v0.1',
    status: 'archived',
    description: 'Archive lessons learned IA personnalisée Kevin (référence historique)',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: '',
    tech_stack: ['HTML5', 'JavaScript'],
    created_at: '2026-02-01',
    last_updated: Date.now(),
    docs_links: {},
    sentinels_count: 0,
  },
  {
    id: 'telecommande',
    name: 'Télécommande KDMC',
    version: 'v1.2',
    status: 'active',
    description: 'Universal remote (IR + Wifi + BLE + Zigbee) intégrée dans Apex /remote',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: 'https://apex-chat.kd-mc.com/',
    tech_stack: ['Web Bluetooth', 'Web NFC', 'Cloudflare Worker', 'PWA'],
    created_at: '2025-11-01',
    last_updated: Date.now(),
    docs_links: {},
    sentinels_count: 2,
  },
  {
    id: 'crackpass',
    name: 'CrackPass',
    version: 'v1.1',
    status: 'active',
    description: 'Gestionnaire mots de passe (générateur + vérificateur force, vault chiffré local)',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: 'https://cmcteams.kd-mc.com/tools/codes-decoder.html',
    tech_stack: ['HTML5 standalone', 'JavaScript', 'Crypto Web API'],
    created_at: '2025-10-15',
    last_updated: Date.now(),
    docs_links: {},
    sentinels_count: 1,
  },
  {
    id: 'apex_chat',
    name: 'Apex Chat',
    version: 'v0.2',
    status: 'wip',
    description: 'Interface conversationnelle standalone (clone WhatsApp pour amis/clients)',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: 'https://apex-chat.kd-mc.com/',
    domain_url: 'https://apex-chat.kd-mc.com/',
    tech_stack: ['TypeScript', 'Vite', 'Firebase Realtime DB', 'WhatsApp OTP'],
    created_at: '2026-03-01',
    last_updated: Date.now(),
    docs_links: {},
    sentinels_count: 3,
  },
  {
    id: 'social_video',
    name: 'Social Video Pipeline',
    version: 'v0.3',
    status: 'wip',
    description: 'Pipeline vidéo réseaux sociaux (YouTube + FB + IG, génération + publication auto)',
    repo_url: 'https://github.com/9r4rxssx64-creator/cmcteams',
    deploy_url: '',
    tech_stack: ['Node.js', 'FFmpeg', 'Gemini AI', 'YouTube API', 'Facebook Graph API'],
    created_at: '2026-02-15',
    last_updated: Date.now(),
    docs_links: {},
    sentinels_count: 2,
  },
];

/* Champs autorisés pour update(). Sécurité : id + created_at non éditables. */
const UPDATABLE_FIELDS = [
  'name',
  'version',
  'status',
  'description',
  'repo_url',
  'deploy_url',
  'tech_stack',
  'docs_links',
  'sentinels_count',
] as const;

type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

export type KdmcProjectUpdate = Partial<Pick<KdmcProject, UpdatableField>>;

class KdmcProjectsRegistry {
  private overrides: Record<string, KdmcProjectUpdate> = {};
  private hydrated = false;

  /** Charge les overrides depuis localStorage (idempotent). */
  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OVERRIDES);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, KdmcProjectUpdate>;
        if (parsed && typeof parsed === 'object') {
          this.overrides = parsed;
        }
      }
    } catch (err: unknown) {
      logger.warn('kdmc-projects-registry', 'hydrate failed', { err });
      this.overrides = {};
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(this.overrides));
    } catch (err: unknown) {
      logger.warn('kdmc-projects-registry', 'persist failed (quota?)', { err });
    }
  }

  private mergeWithOverride(base: KdmcProject): KdmcProject {
    const ovr = this.overrides[base.id];
    if (!ovr) return base;
    return {
      ...base,
      ...ovr,
      /* Préserve id + created_at (immutables) */
      id: base.id,
      created_at: base.created_at,
      /* tech_stack/docs_links déjà mergés par spread (override remplace) */
      tech_stack: ovr.tech_stack ?? base.tech_stack,
      docs_links: ovr.docs_links ?? base.docs_links,
      last_updated: ovr.version || ovr.status ? Date.now() : base.last_updated,
    };
  }

  /** Retourne tous les projets (catalog + overrides mergés). */
  list(): readonly KdmcProject[] {
    this.hydrate();
    return KDMC_PROJECTS.map((p) => this.mergeWithOverride(p));
  }

  /** Récupère un projet spécifique par id (null si inconnu). */
  byId(id: string): KdmcProject | null {
    this.hydrate();
    const base = KDMC_PROJECTS.find((p) => p.id === id);
    if (!base) return null;
    return this.mergeWithOverride(base);
  }

  /** Liste seulement les projets active OU wip (filtrage IA proactif). */
  listActive(): readonly KdmcProject[] {
    return this.list().filter((p) => p.status === 'active' || p.status === 'wip');
  }

  /** Filtre par statut exact. */
  listByStatus(status: ProjectStatus): readonly KdmcProject[] {
    return this.list().filter((p) => p.status === status);
  }

  /**
   * Recherche full-text dans id, name, description, tech_stack.
   * Casse-insensible. Tokens splittés sur espaces (tous doivent matcher).
   */
  searchByKeyword(kw: string): readonly KdmcProject[] {
    const q = kw.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    return this.list().filter((p) => {
      const haystack = [
        p.id,
        p.name,
        p.description,
        p.tech_stack.join(' '),
        p.version,
        p.status,
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }

  /**
   * Update metadata d'un projet (persist localStorage).
   * Champs immutables (id, created_at) silencieusement ignorés.
   * Retourne false si projet inconnu OU aucun champ valide.
   */
  update(id: string, fields: KdmcProjectUpdate): boolean {
    this.hydrate();
    const base = KDMC_PROJECTS.find((p) => p.id === id);
    if (!base) {
      logger.warn('kdmc-projects-registry', `update: project ${id} unknown`);
      return false;
    }
    const sanitized: KdmcProjectUpdate = {};
    let touched = 0;
    for (const k of Object.keys(fields) as Array<keyof KdmcProjectUpdate>) {
      if ((UPDATABLE_FIELDS as readonly string[]).includes(k)) {
        const value = fields[k];
        if (value !== undefined) {
          /* Affectation type-safe field-by-field (exactOptionalPropertyTypes) */
          (sanitized as Record<string, unknown>)[k] = value;
          touched++;
        }
      }
    }
    if (!touched) return false;
    const merged = { ...(this.overrides[id] ?? {}), ...sanitized };
    this.overrides[id] = merged;
    this.persist();
    logger.info('kdmc-projects-registry', `updated ${id}`, { fields: Object.keys(sanitized) });
    return true;
  }

  /** Total projets (active + wip + archived). */
  count(): number {
    return KDMC_PROJECTS.length;
  }

  /** Total active + wip uniquement. */
  countActive(): number {
    return this.listActive().length;
  }

  /** Retire tous les overrides (utile pour tests / reset admin). */
  reset(): void {
    this.overrides = {};
    this.hydrated = true;
    try {
      localStorage.removeItem(STORAGE_KEY_OVERRIDES);
    } catch {
      /* localStorage indisponible — silencieux */
    }
  }

  /**
   * Markdown structuré pour injection IA system prompt.
   *
   * Format (compact mais explicite) :
   * ## Projets KDMC (8 — 6 actifs/wip)
   * - **APEX AI** v13.0.20 (active) — assistant IA niveau entreprise
   *   stack: TypeScript, Vite, Vitest…
   *   live: https://...
   * - **CMCteams** v9.593 (active) — planning Casino Monaco
   *   ...
   *
   * Avec includeArchived=false (défaut) → ignore archived pour économiser tokens.
   */
  formatForSystemPrompt(opts?: { includeArchived?: boolean; maxStackEntries?: number }): string {
    const includeArchived = opts?.includeArchived ?? false;
    const maxStack = opts?.maxStackEntries ?? 4;
    const all = this.list();
    const visible = includeArchived ? all : all.filter((p) => p.status !== 'archived');
    const total = all.length;
    const active = all.filter((p) => p.status === 'active' || p.status === 'wip').length;

    const header = `## Projets KDMC (${total} total — ${active} actifs/wip)`;
    if (!visible.length) {
      return `${header}\n_(aucun projet visible — vérifie filtre archived)_`;
    }

    const lines: string[] = [header];
    for (const p of visible) {
      const stack = p.tech_stack.slice(0, maxStack).join(', ');
      const more = p.tech_stack.length > maxStack ? `, +${p.tech_stack.length - maxStack}` : '';
      lines.push(
        `- **${p.name}** ${p.version} (${p.status}) — ${p.description}`,
        `  stack: ${stack}${more}`,
        `  live: ${p.deploy_url}`,
      );
    }
    lines.push(
      '',
      '_Apex peut auto-gérer ces projets via orchestrator + tools dédiés._',
      '_Pour metadata détaillée (sentinels, docs links) : kdmcProjectsRegistry.byId(id)._',
    );
    return lines.join('\n');
  }
}

export const kdmcProjectsRegistry = new KdmcProjectsRegistry();
