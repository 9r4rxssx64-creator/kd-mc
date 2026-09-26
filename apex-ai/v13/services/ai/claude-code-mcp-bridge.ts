/**
 * APEX v13 — Claude Code MCP Bridge (FALLBACK OPTIONNEL — pas critique).
 *
 * ⚠️ Demande Kevin 2026-05-08 ABSOLUE :
 *   "Je veux qu'il n'ait plus besoin de Claude Code, qu'il soit autonome
 *    pour toutes ces fonctionnalités."
 *
 * → Ce module devient un FALLBACK OPTIONNEL uniquement.
 * → La source PRIMAIRE = `direct-connectors-registry.ts` (50+ APIs DIRECTES
 *   appelées par Apex sans dépendre de Claude Code/Anthropic).
 *
 * Quand utiliser ce bridge :
 * - Tâches LOURDES qui bénéficient des MCP Claude Code (refactor multi-fichiers,
 *   analyse repo gros, gen code structurée) ET Kevin a un abonnement Claude actif.
 * - Pour TOUT le reste → directConnectors.invoke() est la voie autonome.
 *
 * Catalogue informatif (au cas où abonnement actif) :
 * - GitHub MCP : équivalent direct = directConnectors.invoke({ id: 'github_api' })
 * - Gmail MCP : équivalent direct = directConnectors.invoke({ id: 'resend' / 'brevo' / 'emailjs' })
 * - Drive MCP : équivalent direct = directConnectors.invoke({ id: 'jsonbin' / 'firebase_rtdb' / 'pinata_ipfs' })
 */

import { logger } from '../../core/logger.js';

import { claudeBridge, type TodoType } from './claude-bridge.js';

/* ============================================================================
 * Catalogue MCP — capacités exposées par Claude Code
 * ============================================================================ */

export type MCPServerId = 'github' | 'gmail' | 'drive' | 'memory' | 'sequential-thinking';

export interface MCPCapability {
  server: MCPServerId;
  tool: string;
  description: string;
  category:
    | 'git_repo'
    | 'pr_review'
    | 'issue_tracking'
    | 'email_compose'
    | 'email_search'
    | 'file_storage'
    | 'memory'
    | 'reasoning';
  /** Mots-clés FR/EN qui déclenchent une suggestion d'utilisation. */
  triggers: string[];
  /** Niveau d'autorisation : auto (Apex peut escalader sans Kevin), notify (push Kevin), validate (modal Kevin). */
  authorization: 'auto' | 'notify' | 'validate';
}

export const MCP_CATALOG: MCPCapability[] = [
  /* ============== GitHub MCP ============== */
  {
    server: 'github',
    tool: 'mcp__github__create_issue',
    description: 'Crée une issue GitHub (bug report, feature request, todo).',
    category: 'issue_tracking',
    triggers: ['issue', 'bug report', 'créer ticket', 'open issue', 'rapport bug'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__add_issue_comment',
    description: 'Ajoute un commentaire à une issue ou PR existante.',
    category: 'issue_tracking',
    triggers: ['commenter issue', 'reply pr', 'ajout commentaire', 'comment'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__create_pull_request',
    description: 'Ouvre une pull request depuis une branche feature.',
    category: 'pr_review',
    triggers: ['pull request', 'pr', 'merge request', 'demande de fusion'],
    authorization: 'notify',
  },
  {
    server: 'github',
    tool: 'mcp__github__pull_request_review_write',
    description: 'Écrit une revue de PR (approve/request_changes/comment).',
    category: 'pr_review',
    triggers: ['review pr', 'approuver pr', 'revue code'],
    authorization: 'validate',
  },
  {
    server: 'github',
    tool: 'mcp__github__merge_pull_request',
    description: 'Merge une PR (squash, merge ou rebase).',
    category: 'pr_review',
    triggers: ['merge pr', 'fusionner pr', 'integrer pr'],
    authorization: 'validate',
  },
  {
    server: 'github',
    tool: 'mcp__github__create_or_update_file',
    description: 'Crée ou modifie un fichier dans le repo (commit unique).',
    category: 'git_repo',
    triggers: ['modifier fichier github', 'commit fichier', 'éditer repo'],
    authorization: 'notify',
  },
  {
    server: 'github',
    tool: 'mcp__github__create_branch',
    description: 'Crée une nouvelle branche depuis main ou autre source.',
    category: 'git_repo',
    triggers: ['nouvelle branche', 'créer branche', 'feature branch'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__list_branches',
    description: 'Liste les branches du repo.',
    category: 'git_repo',
    triggers: ['lister branches', 'voir branches'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__list_commits',
    description: 'Liste les commits récents (filter par branche, auteur, date).',
    category: 'git_repo',
    triggers: ['historique commits', 'voir commits', 'log git'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__get_file_contents',
    description: 'Lit le contenu brut d\'un fichier dans une branche.',
    category: 'git_repo',
    triggers: ['lire fichier github', 'voir code', 'fetch raw'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__search_code',
    description: 'Recherche full-text dans tout le code du repo.',
    category: 'git_repo',
    triggers: ['chercher code', 'grep github', 'find symbol'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__list_issues',
    description: 'Liste les issues (filter par état, labels, auteur).',
    category: 'issue_tracking',
    triggers: ['lister issues', 'voir issues', 'tickets ouverts'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__run_secret_scanning',
    description: 'Scan secrets fuités dans le repo (tokens, clés API).',
    category: 'git_repo',
    triggers: ['scan secrets', 'audit fuites', 'check tokens leak'],
    authorization: 'auto',
  },
  {
    server: 'github',
    tool: 'mcp__github__enable_pr_auto_merge',
    description: 'Active l\'auto-merge sur une PR (CI green = merge auto).',
    category: 'pr_review',
    triggers: ['auto merge', 'fusion automatique pr'],
    authorization: 'validate',
  },

  /* ============== Gmail MCP ============== */
  {
    server: 'gmail',
    tool: 'mcp__b9df8c43__create_draft',
    description: 'Crée un brouillon email Gmail (to, cc, bcc, subject, body, html).',
    category: 'email_compose',
    triggers: ['brouillon email', 'draft mail', 'préparer email', 'écrire mail'],
    authorization: 'notify',
  },
  {
    server: 'gmail',
    tool: 'mcp__b9df8c43__search_threads',
    description: 'Recherche threads emails (query Gmail standard : from:, subject:, has:attachment, etc.).',
    category: 'email_search',
    triggers: ['chercher email', 'mail recu', 'search inbox', 'trouver mail'],
    authorization: 'auto',
  },
  {
    server: 'gmail',
    tool: 'mcp__b9df8c43__get_thread',
    description: 'Récupère un thread email complet avec tous ses messages.',
    category: 'email_search',
    triggers: ['lire thread', 'voir conversation email', 'détails mail'],
    authorization: 'auto',
  },
  {
    server: 'gmail',
    tool: 'mcp__b9df8c43__list_drafts',
    description: 'Liste les brouillons emails.',
    category: 'email_compose',
    triggers: ['mes brouillons', 'drafts list'],
    authorization: 'auto',
  },
  {
    server: 'gmail',
    tool: 'mcp__b9df8c43__list_labels',
    description: 'Liste les labels Gmail (folders).',
    category: 'email_compose',
    triggers: ['labels gmail', 'dossiers email'],
    authorization: 'auto',
  },
  {
    server: 'gmail',
    tool: 'mcp__b9df8c43__create_label',
    description: 'Crée un nouveau label Gmail (couleur configurable).',
    category: 'email_compose',
    triggers: ['nouveau label', 'créer dossier email'],
    authorization: 'auto',
  },

  /* ============== Drive MCP ============== */
  {
    server: 'drive',
    tool: 'mcp__74b57604__create_file',
    description: 'Crée un fichier Drive (text/csv → Doc/Sheet auto, ou tout MIME type).',
    category: 'file_storage',
    triggers: ['créer doc drive', 'nouveau fichier drive', 'upload drive', 'sauvegarder drive'],
    authorization: 'notify',
  },
  {
    server: 'drive',
    tool: 'mcp__74b57604__read_file_content',
    description: 'Lit le contenu d\'un fichier Drive (Doc/Sheet/PDF/Office/images OCR).',
    category: 'file_storage',
    triggers: ['lire drive', 'voir fichier drive', 'extraire texte drive'],
    authorization: 'auto',
  },
  {
    server: 'drive',
    tool: 'mcp__74b57604__search_files',
    description: 'Recherche fichiers Drive par nom, contenu, type, dossier.',
    category: 'file_storage',
    triggers: ['chercher drive', 'trouver fichier google', 'find document'],
    authorization: 'auto',
  },
  {
    server: 'drive',
    tool: 'mcp__74b57604__list_recent_files',
    description: 'Liste les fichiers Drive récemment modifiés.',
    category: 'file_storage',
    triggers: ['drive récents', 'derniers fichiers'],
    authorization: 'auto',
  },
  {
    server: 'drive',
    tool: 'mcp__74b57604__copy_file',
    description: 'Copie un fichier Drive (nouveau titre, nouveau dossier optionnels).',
    category: 'file_storage',
    triggers: ['copier drive', 'duplicate document'],
    authorization: 'notify',
  },
  {
    server: 'drive',
    tool: 'mcp__74b57604__download_file_content',
    description: 'Télécharge le contenu binaire (base64) d\'un fichier Drive.',
    category: 'file_storage',
    triggers: ['télécharger drive', 'export drive'],
    authorization: 'auto',
  },
  {
    server: 'drive',
    tool: 'mcp__74b57604__get_file_metadata',
    description: 'Récupère les métadonnées d\'un fichier Drive (taille, dates, propriétaire).',
    category: 'file_storage',
    triggers: ['infos fichier drive', 'metadata drive'],
    authorization: 'auto',
  },
  {
    server: 'drive',
    tool: 'mcp__74b57604__get_file_permissions',
    description: 'Liste les permissions d\'un fichier Drive (qui a accès).',
    category: 'file_storage',
    triggers: ['permissions drive', 'qui peut voir'],
    authorization: 'auto',
  },
];

/* ============================================================================
 * Helpers detection + escalade
 * ============================================================================ */

class ClaudeCodeMCPBridge {
  /**
   * Détecte si un message user matche un trigger MCP → suggère utilisation.
   */
  detectMCPIntent(text: string): MCPCapability[] {
    const lc = text.toLowerCase();
    const matches: MCPCapability[] = [];
    for (const cap of MCP_CATALOG) {
      for (const trig of cap.triggers) {
        if (lc.includes(trig.toLowerCase())) {
          matches.push(cap);
          break;
        }
      }
    }
    return matches;
  }

  /**
   * Liste tous les serveurs MCP dispos.
   */
  listServers(): { id: MCPServerId; toolCount: number; categories: string[] }[] {
    const groups = new Map<MCPServerId, MCPCapability[]>();
    for (const cap of MCP_CATALOG) {
      const arr = groups.get(cap.server) ?? [];
      arr.push(cap);
      groups.set(cap.server, arr);
    }
    return Array.from(groups.entries()).map(([id, caps]) => ({
      id,
      toolCount: caps.length,
      categories: Array.from(new Set(caps.map((c) => c.category))),
    }));
  }

  /**
   * Escalade vers Claude Code pour exécuter un outil MCP.
   * Apex IA appelle ça quand elle veut utiliser un MCP.
   */
  async escalateMCPRequest(opts: {
    server: MCPServerId;
    tool: string;
    args: Record<string, unknown>;
    reason: string;
    severity?: 'critical' | 'high' | 'medium' | 'low';
  }): Promise<{ ok: boolean; todoId?: string }> {
    const cap = MCP_CATALOG.find((c) => c.tool === opts.tool && c.server === opts.server);
    if (!cap) {
      logger.warn('mcp-bridge', `Unknown MCP tool: ${opts.server}/${opts.tool}`);
      return { ok: false };
    }
    const todoType: TodoType = this.mapCategoryToTodoType(cap.category);
    try {
      const todo = await claudeBridge.pushTodo({
        type: todoType,
        src: 'apex',
        title: `[MCP ${cap.server}] ${cap.tool.split('__').pop()}`,
        description: opts.reason,
        context: {
          mcp_server: opts.server,
          mcp_tool: opts.tool,
          mcp_args: opts.args,
          authorization: cap.authorization,
        },
        severity: opts.severity ?? 'medium',
      });
      logger.info('mcp-bridge', `MCP escalated: ${cap.tool} → todo ${todo.id}`);
      return { ok: true, todoId: todo.id };
    } catch (err: unknown) {
      logger.warn('mcp-bridge', 'escalateMCPRequest failed', { err });
      return { ok: false };
    }
  }

  private mapCategoryToTodoType(cat: MCPCapability['category']): TodoType {
    switch (cat) {
      case 'pr_review':
      case 'git_repo':
        return 'fix_bug';
      case 'issue_tracking':
        return 'investigate';
      case 'email_compose':
      case 'email_search':
      case 'file_storage':
        return 'add_feature';
      case 'memory':
      case 'reasoning':
        return 'add_feature';
      default:
        return 'investigate';
    }
  }

  /**
   * Section system prompt : informe Apex IA des MCP dispos.
   */
  buildSystemPromptSection(): string {
    const servers = this.listServers();
    const lines = [
      '\n## 🔌 Connecteurs MCP (Claude Code) — utilisables via escalade Firebase',
      '',
      'Tu (Apex) as accès aux outils Claude Code suivants en escaladant via `claudeCodeMCPBridge.escalateMCPRequest()`.',
      'Le pipeline : tu pushes une todo → GitHub Action repository_dispatch → Claude Code exécute → résultat dans `ax_handoff_journal`.',
      '',
    ];
    for (const srv of servers) {
      lines.push(`### ${srv.id.toUpperCase()} (${srv.toolCount} outils — ${srv.categories.join(', ')})`);
      const tools = MCP_CATALOG.filter((c) => c.server === srv.id);
      for (const t of tools) {
        const auth = t.authorization === 'auto' ? '🟢' : t.authorization === 'notify' ? '🟡' : '🔴';
        lines.push(`- ${auth} \`${t.tool.split('__').pop()}\` : ${t.description}`);
      }
      lines.push('');
    }
    lines.push(
      '**Quand utiliser** : tâches non triviales qui nécessitent accès GitHub repo, Gmail, ou Drive.',
      '**Auto** = tu peux escalader sans demander Kevin. **Notify** = Kevin reçoit notif push. **Validate** = modal confirmation Kevin.',
    );
    return lines.join('\n');
  }

  /**
   * Stats pour vue admin (vClaudeCodeMCP).
   */
  getStats(): {
    totalCapabilities: number;
    byServer: Record<string, number>;
    byCategory: Record<string, number>;
    byAuthorization: Record<string, number>;
  } {
    const byServer: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byAuthorization: Record<string, number> = {};
    for (const cap of MCP_CATALOG) {
      byServer[cap.server] = (byServer[cap.server] ?? 0) + 1;
      byCategory[cap.category] = (byCategory[cap.category] ?? 0) + 1;
      byAuthorization[cap.authorization] = (byAuthorization[cap.authorization] ?? 0) + 1;
    }
    return {
      totalCapabilities: MCP_CATALOG.length,
      byServer,
      byCategory,
      byAuthorization,
    };
  }
}

export const claudeCodeMCPBridge = new ClaudeCodeMCPBridge();
