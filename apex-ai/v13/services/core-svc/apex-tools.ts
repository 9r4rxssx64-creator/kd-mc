/**
 * APEX v13 — Registry complet outils IA Apex (parité Claude Code).
 *
 * Demande Kevin (2026-05-03) :
 * "Apex doit pouvoir s'autogérer s'autocorriger s'automodifier.
 * Quoique je lui demande comme modification, qu'il puisse le faire.
 * Niveau Claude Code expert. Polyvalence. Autonomie totale."
 *
 * Outils exposés via tool_use Anthropic format :
 * - read_file       : lit un fichier du repo via GitHub raw
 * - edit_file       : propose un edit (review obligatoire si non admin Kevin)
 * - run_test        : lance la suite de tests (sandbox safe)
 * - audit_self      : lance audit subagent indépendant
 * - commit_push     : git commit + push (nécessite GitHub PAT scopé)
 * - web_search      : recherche web (Brave/Tavily/DuckDuckGo failover)
 * - web_fetch       : fetch URL et extrait contenu textuel
 * - run_lint        : npm run lint sandbox
 * - run_typecheck   : tsc --noEmit
 * - read_logs       : lit logs runtime + audit log
 * - escalate_human  : escalade Kevin via push notif si action niveau C
 *
 * Sécurité :
 * - Tier admin (Kevin) : tous tools accessibles
 * - Tier laurence/family : read-only + escalate_human pour modifications
 * - Tier client_pro/free : read_file + web_search + web_fetch uniquement
 *
 * Anti-pattern Kevin : pas d'eval, pas de new Function, pas d'exec arbitraire.
 * Tout passe par dispatcher whitelist + audit log immutable.
 */

import { logger } from '../../core/logger.js';
import { ADMIN_TOOLS } from '../apex-tools-registry/admin-tools.js';
import { CODE_TOOLS } from '../apex-tools-registry/code-tools.js';
import { COMM_TOOLS } from '../apex-tools-registry/comm-tools.js';
import { DEVICE_TOOLS } from '../apex-tools-registry/device-tools.js';
import { IOT_TOOLS } from '../apex-tools-registry/iot-tools.js';
import { MARKETPLACE_TOOLS } from '../apex-tools-registry/marketplace-tools.js';
import { MEDIA_TOOLS } from '../apex-tools-registry/media-tools.js';
import { MEMORY_TOOLS } from '../apex-tools-registry/memory-tools.js';
import { SKILLS_TOOLS } from '../apex-tools-registry/skills-tools.js';
import { WEB_TOOLS } from '../apex-tools-registry/web-tools.js';
import { auditLog } from '../observability/audit-log.js';

import type { ApexTool } from './apex-tools-types.js';

export type { ApexTool } from './apex-tools-types.js';

const APEX_TOOLS: readonly ApexTool[] = [
  ...CODE_TOOLS,
  ...WEB_TOOLS,
  ...MEMORY_TOOLS,
  ...DEVICE_TOOLS,
  ...COMM_TOOLS,
  ...IOT_TOOLS,
  ...MARKETPLACE_TOOLS,
  ...ADMIN_TOOLS,
  ...MEDIA_TOOLS,
  ...SKILLS_TOOLS,
];

class ApexToolsRegistry {
  /**
   * Liste les tools disponibles pour un user donné selon son tier.
   * (P0 audit Kevin : tier admin = TOUT, tier client = read-only).
   */
  listForTier(tier: ApexTool['minTier']): readonly ApexTool[] {
    const TIER_RANK: Record<ApexTool['minTier'], number> = {
      admin: 5,
      laurence: 4,
      family: 3,
      client_pro: 2,
      client_free: 1,
    };
    const userRank = TIER_RANK[tier];
    return APEX_TOOLS.filter((t) => TIER_RANK[t.minTier] <= userRank);
  }

  list(): readonly ApexTool[] {
    return APEX_TOOLS;
  }

  getByName(name: string): ApexTool | null {
    return APEX_TOOLS.find((t) => t.name === name) ?? null;
  }

  /**
   * Format Anthropic tool_use pour injection system prompt.
   */
  toAnthropicFormat(filterTier?: ApexTool['minTier']): unknown[] {
    const tools = filterTier ? this.listForTier(filterTier) : APEX_TOOLS;
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  /**
   * Vérifie si un user peut exécuter un tool donné.
   * Retourne {allowed, requires_validation} :
   * - allowed=false → tier insuffisant
   * - requires_validation=true → impactLevel C, escalate Kevin obligatoire
   */
  canExecute(toolName: string, userTier: ApexTool['minTier']): {
    allowed: boolean;
    requires_validation: boolean;
    reason?: string;
  } {
    const tool = this.getByName(toolName);
    if (!tool) return { allowed: false, requires_validation: false, reason: 'Tool inconnu' };

    /* Tier rank check : userTier doit être >= tool.minTier */
    const TIER_RANK: Record<ApexTool['minTier'], number> = {
      admin: 5,
      laurence: 4,
      family: 3,
      client_pro: 2,
      client_free: 1,
    };
    const userRank = TIER_RANK[userTier];
    const minRank = TIER_RANK[tool.minTier];
    if (userRank < minRank) {
      return { allowed: false, requires_validation: false, reason: 'Tier insuffisant' };
    }

    /* Impact level C → validation Kevin obligatoire si pas admin */
    if (tool.impactLevel === 'C' && userTier !== 'admin') {
      return { allowed: true, requires_validation: true };
    }
    return { allowed: true, requires_validation: false };
  }

  /**
   * Audit log obligatoire pour toute exécution tool (traçabilité immutable).
   */
  async logExecution(toolName: string, userTier: string, params: Record<string, unknown>, ok: boolean): Promise<void> {
    await auditLog.record('tool.execution', {
      details: {
        tool: toolName,
        tier: userTier,
        params: JSON.parse(JSON.stringify(params)) as Record<string, unknown>,
        ok,
      },
    });
    logger.info('apex-tools', `Tool exec: ${toolName} (${userTier}) → ${ok ? 'OK' : 'FAIL'}`);
  }
}

export const apexTools = new ApexToolsRegistry();
