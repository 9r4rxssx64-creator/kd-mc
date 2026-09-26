/**
 * APEX v13 — Orchestrateur central des projets Kevin
 *
 * Demande Kevin (rebuild plan) :
 * "Apex doit auto-gérer les autres projets Kevin (orchestrateur central)"
 *
 * Bridges exposés via tools IA :
 * - cmc_read       : lit /cmcteams/* Firebase shared
 * - cmc_write_motd : écrit message du jour CMC (admin only)
 * - open_tool      : ouvre tools/*.html dans browser embed
 * - kdmc_stats     : stats e-KDMC marketplaces
 * - telecommande_send : envoie commande IR/Wifi via bridge
 *
 * Aucun projet Kevin n'est modifié — Apex ne fait que LIRE leurs schémas Firebase
 * et LANCER leurs URLs publiques.
 */

import { logger } from '../../core/logger.js';
import { firebase } from '../storage/firebase.js';

export interface KevinProject {
  id: string;
  name: string;
  url: string;
  firebasePath?: string;
  toolsAvailable: string[];
}

export const PROJECTS: readonly KevinProject[] = [
  {
    id: 'apex',
    name: 'APEX AI v13',
    url: 'https://apex-ai.kd-mc.com/',
    firebasePath: 'apex',
    toolsAvailable: [
      'audit_self', 'memory_recall', 'memory_add', 'lesson_record',
      'self_improve', 'project_status', 'sentinels_status', 'perf_metrics',
    ],
  },
  {
    id: 'cmcteams',
    name: 'CMCteams (Casino Monaco)',
    url: 'https://cmcteams.kd-mc.com/',
    firebasePath: 'cmcteams',
    toolsAvailable: ['cmc_read', 'cmc_write_motd', 'cmc_get_admin_profile'],
  },
  {
    id: 'telecommande',
    name: 'Télécommande KDMC',
    url: 'https://apex-chat.kd-mc.com/',
    toolsAvailable: ['telecommande_send', 'telecommande_status'],
  },
  {
    id: 'crackpass',
    name: 'CrackPass (générateur passwords)',
    url: 'https://cmcteams.kd-mc.com/tools/codes-decoder.html',
    toolsAvailable: ['crackpass_check', 'crackpass_generate'],
  },
  {
    id: 'kdmc',
    name: 'KDMC (hub central)',
    url: '',
    toolsAvailable: ['kdmc_stats'],
  },
  {
    id: 'ekdmc',
    name: 'e-KDMC (marketplace)',
    url: '',
    firebasePath: 'ekdmc',
    toolsAvailable: ['ekdmc_stats', 'ekdmc_orders'],
  },
  {
    id: 'iakdmc',
    name: 'IA-KDMC (référence archive)',
    url: '',
    toolsAvailable: ['iakdmc_lookup'],
  },
  /* Extensions v13.0.1 (Kevin demande "tous mes projets intégrés") */
  /* Apex Chat EMBEDDED dans Apex AI (Kevin + Laurence + family) */
  {
    id: 'apex_chat_embedded',
    name: 'Apex Chat (embedded admin/family)',
    url: 'https://apex-ai.kd-mc.com/#chat',
    firebasePath: 'apex/chat',
    toolsAvailable: ['chat_read', 'chat_export'],
  },
  /* Apex Chat STANDALONE pour amis/autres (avec pub Apex AI cross-promo) */
  {
    id: 'apex_chat_standalone',
    name: 'Apex Chat Standalone (amis/clients)',
    url: 'https://apex-chat.kdmc.fr/',
    firebasePath: 'apex_chat_standalone',
    toolsAvailable: ['chat_basic', 'chat_share'],
  },
  {
    id: 'social_video',
    name: 'Social Video Pipeline',
    url: '',
    toolsAvailable: ['video_studio', 'social_publish'],
  },
  {
    id: 'eapex',
    name: 'e-APEX (commerce admin)',
    url: 'https://apex-ai.kd-mc.com/#admin',
    firebasePath: 'eapex',
    toolsAvailable: ['eapex_stats', 'eapex_subscriptions'],
  },
];

export const TOOLS_HTML: ReadonlyArray<{ id: string; name: string; path: string }> = [
  { id: 'album_laurence', name: 'Album Laurence', path: 'tools/album-laurence.html' },
  { id: 'kevin_todo', name: 'TODO Kevin iPhone', path: 'tools/kevin-todo-iphone.html' },
  { id: 'gen_bulletin', name: 'Bulletin de paie', path: 'tools/gen-bulletin-paie.html' },
  { id: 'planning_weekend', name: 'Planning weekend', path: 'tools/planning-weekend.html' },
  { id: 'codes_decoder', name: 'Décodeur codes', path: 'tools/codes-decoder.html' },
  { id: 'calc_conventions', name: 'Calculatrice conventions', path: 'tools/calc-conventions.html' },
  { id: 'gen_og_png', name: 'Generator OG PNG', path: 'tools/gen-og-png.html' },
  { id: 'cf_deploy', name: 'Cloudflare deploy', path: 'tools/cloudflare/deploy-worker.html' },
  { id: 'cf_vapid', name: 'Cloudflare VAPID gen', path: 'tools/cloudflare/gen-vapid.html' },
];

class Orchestrator {
  listProjects(): readonly KevinProject[] {
    return PROJECTS;
  }

  listTools(): typeof TOOLS_HTML {
    return TOOLS_HTML;
  }

  /**
   * v13.4.201 (Kevin 2026-05-16 "Apex consomme") :
   * cmcRead acceptait aucun param → retournait TOUT /cmcteams (50KB+) à chaque
   * appel IA → tokens cramés. Désormais accepte scope filtré pour ne lire que
   * la portion utile.
   *
   * @param opts.scope - 'all' (legacy, déconseillé), 'employees', 'teams',
   *                     'overrides', 'planning_month', 'planning_user',
   *                     'motd', 'audit', 'last_import_health'
   * @param opts.user_uid - id employé (pour scope planning_user)
   * @param opts.year - année (pour scope planning_month + planning_user)
   * @param opts.month - mois 1-12 (pour scope planning_month + planning_user)
   * @param opts.day - jour optionnel pour focus 1 jour
   */
  async cmcRead(opts?: {
    scope?: 'all' | 'employees' | 'teams' | 'overrides' | 'planning_month' | 'planning_user' | 'motd' | 'audit' | 'last_import_health';
    user_uid?: string;
    year?: number;
    month?: number;
    day?: number;
  }): Promise<unknown> {
    const scope = opts?.scope ?? 'last_import_health';
    if (scope === 'all') {
      /* Garde-fou : 'all' déprécié — log warning pour traquer usages */
      logger.warn('orchestrator', 'cmcRead(scope=all) déconseillé — préfère un scope filtré pour économiser tokens IA');
      return firebase.read<unknown>('cmcteams');
    }
    if (scope === 'employees') return firebase.read<unknown>('cmcteams/cmc_e');
    if (scope === 'teams') return firebase.read<unknown>('cmcteams/cmc_t');
    if (scope === 'motd') return firebase.read<unknown>('cmcteams/cmc_motd');
    if (scope === 'audit') return firebase.read<unknown>('cmcteams/cmc_audit');
    if (scope === 'last_import_health') return this.cmcLastImportHealth();
    if (scope === 'overrides') {
      if (typeof opts?.year === 'number' && typeof opts.month === 'number') {
        return firebase.read<unknown>(`cmcteams/cmc_ov/${opts.year}-${opts.month}`);
      }
      return firebase.read<unknown>('cmcteams/cmc_ov');
    }
    if (scope === 'planning_month' && typeof opts?.year === 'number' && typeof opts.month === 'number') {
      return firebase.read<unknown>(`cmcteams/cmc_ov/${opts.year}-${opts.month}`);
    }
    if (scope === 'planning_user' && opts?.user_uid && typeof opts.year === 'number' && typeof opts.month === 'number') {
      const monthData = await firebase.read<Record<string, unknown>>(`cmcteams/cmc_ov/${opts.year}-${opts.month}`);
      if (!monthData || typeof monthData !== 'object') return null;
      const userKey = opts.user_uid;
      const result: Record<string, unknown> = {};
      for (const [dayKey, cellData] of Object.entries(monthData)) {
        if (dayKey.startsWith(`${userKey}_`)) {
          const dayNum = Number(dayKey.split('_')[1]);
          if (typeof opts.day === 'number' && opts.day !== dayNum) continue;
          result[String(dayNum)] = cellData;
        }
      }
      return { user_uid: userKey, year: opts.year, month: opts.month, days: result };
    }
    return { error: 'invalid_scope_or_missing_params', scope, opts };
  }

  async kdmcStats(): Promise<unknown> {
    return firebase.read<unknown>('ekdmc');
  }

  /**
   * v13.4.86 — Parité Apex/CMC (Kevin 2026-05-14 23:30 "Parité apex total maximum
   * optimal"). Lit l'historique fidélité + lossless import CMCteams via Firebase
   * shared pour qu'Apex puisse alerter/analyser les imports SBM.
   */
  async cmcImportAuditLog(): Promise<{
    fidelity: ReadonlyArray<unknown>;
    lossless: ReadonlyArray<unknown>;
  }> {
    const [fidelity, lossless] = await Promise.all([
      firebase.read<unknown>('cmcteams/cmc_import_fidelity_log').catch(() => null),
      firebase.read<unknown>('cmcteams/cmc_import_lossless_log').catch(() => null),
    ]);
    return {
      fidelity: Array.isArray(fidelity) ? (fidelity as unknown[]) : [],
      lossless: Array.isArray(lossless) ? (lossless as unknown[]) : [],
    };
  }

  /**
   * v13.4.86 — Détecte si dernier import CMC a un problème (fidelity < 75 OU
   * lossless gap > 5%). Permet à Apex IA de notif admin Kevin proactivement.
   */
  async cmcLastImportHealth(): Promise<{
    ok: boolean;
    issues: ReadonlyArray<string>;
    fidelity_score?: number;
    lossless_gap?: number;
  }> {
    const logs = await this.cmcImportAuditLog();
    const issues: string[] = [];
    const lastFidelity = logs.fidelity[logs.fidelity.length - 1] as { score?: number } | undefined;
    const lastLossless = logs.lossless[logs.lossless.length - 1] as { gap?: number } | undefined;
    if (lastFidelity && typeof lastFidelity.score === 'number' && lastFidelity.score < 75) {
      issues.push(`Fidélité basse : ${lastFidelity.score}%`);
    }
    if (lastLossless && typeof lastLossless.gap === 'number' && lastLossless.gap > 5) {
      issues.push(`Lossless gap : ${lastLossless.gap}% (cells PDF non capturées)`);
    }
    return {
      ok: issues.length === 0,
      issues,
      ...(lastFidelity?.score !== undefined && { fidelity_score: lastFidelity.score }),
      ...(lastLossless?.gap !== undefined && { lossless_gap: lastLossless.gap }),
    };
  }

  openTool(toolId: string): { ok: boolean; url?: string } {
    const tool = TOOLS_HTML.find((t) => t.id === toolId);
    if (!tool) return { ok: false };
    const baseUrl = location.origin;
    const fullUrl = `${baseUrl}/CMCteams/${tool.path}`;
    logger.info('orchestrator', `Opening tool: ${tool.name}`);
    return { ok: true, url: fullUrl };
  }

  /* IA tool definitions au format Anthropic — exportable au system prompt */
  getToolDefinitions(): unknown[] {
    return [
      {
        name: 'cmc_read',
        description: 'Lit les données CMCteams (planning casino) depuis Firebase shared',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'open_tool',
        description: 'Ouvre un outil HTML autonome dans le browser embed',
        input_schema: {
          type: 'object',
          properties: { tool_id: { type: 'string', enum: TOOLS_HTML.map((t) => t.id) } },
          required: ['tool_id'],
        },
      },
      {
        name: 'kdmc_stats',
        description: 'Statistiques e-KDMC marketplace',
        input_schema: { type: 'object', properties: {} },
      },
    ];
  }
}

export const orchestrator = new Orchestrator();
