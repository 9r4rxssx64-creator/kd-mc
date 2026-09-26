/**
 * APEX v13 — Tools registry: admin category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const ADMIN_TOOLS: readonly ApexTool[] = [
  {
    name: 'read_logs',
    description: 'Lit les logs runtime Apex (audit log + observability buffer + sentinels).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['audit', 'errors', 'sentinels', 'all'], description: 'Type de logs' },
        limit: { type: 'number', description: 'Nb max entries (default: 50)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'escalate_human',
    description: 'Escalade vers Kevin (push notif WhatsApp/email) pour validation action niveau C.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Description action proposée' },
        context: { type: 'string', description: 'Contexte / pourquoi nécessaire' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['action', 'urgency'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'cmc_read',
    description: 'Lit les données CMCteams (planning casino, employés) depuis Firebase shared. UTILISE TOUJOURS un scope filtré (planning_user, planning_month, last_import_health) pour économiser les tokens — JAMAIS scope=all sauf si vraiment nécessaire (>50KB).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all', 'employees', 'teams', 'overrides', 'planning_month', 'planning_user', 'motd', 'audit', 'last_import_health'],
          description: "Type de donnée à lire. Préfère 'planning_user' (planning d'un user pour 1 mois ± 1 jour), 'planning_month' (toutes les cells d'un mois), 'last_import_health' (état dernier import).",
        },
        user_uid: { type: 'string', description: "ID employé CMC (pour scope planning_user, ex 'U11804')" },
        year: { type: 'number', description: 'Année (pour planning_*)' },
        month: { type: 'number', description: 'Mois 1-12 (pour planning_*)' },
        day: { type: 'number', description: 'Jour 1-31 optionnel (focus 1 journée)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'github_clean_notifications',
    description: "v13.4.203 (Kevin 'arrête les mails GitHub') : nettoie automatiquement les notifications GitHub Actions de Kevin. Liste les threads workflow/CI, les désabonne, puis marque toute la boîte comme lue. Utilise ax_github_token du Vault. Aucune action Kevin requise — appelle ce tool quand Kevin dit 'arrête les mails GitHub', 'vide mes notifs', 'github noise off', etc.",
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'view_audit_log',
    description: "v13.4.215 — Ouvre la vue admin Audit Log Viewer (chain hash immutable, 1000 entries max, filtres action/actor/search, export JSON). Trigger : 'voir audit log', 'historique actions admin', 'export audit'.",
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'multi_branch_status',
    description: "v13.4.205 (Kevin 'toutes branches Claude Code coordonnées') : retourne le rapport multi-branch coordinator. Liste branches claude/* actives, fichiers en conflit, branches non mergées anciennes, recommandations. Trigger : 'Apex état branches', 'conflits branches', 'coordination'.",
    inputSchema: { type: 'object', properties: { refresh: { type: 'boolean', description: 'true = force refresh GitHub API, false = cache localStorage' } } },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'github_mute_repo',
    description: "v13.4.203 : mute COMPLÈTEMENT le repo cmcteams (ignore = true). Plus AUCUNE notification GitHub pour ce repo, jamais. À utiliser uniquement si Kevin demande explicitement de tout couper (pas Action seulement).",
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'open_tool',
    description: 'Ouvre un outil HTML autonome (album-laurence, codes-decoder, calc-conventions, etc.) dans browser embed.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_id: { type: 'string' },
      },
      required: ['tool_id'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'backup_trigger',
    description: 'Déclenche un backup Firebase complet (snapshot daté + IDB shadow).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'vault_action',
    description: 'Action sur Coffre : list, get (uid), set (admin only), revoke. Tous opérations chiffrées AES-GCM 256.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'set', 'revoke'] },
        key: { type: 'string' },
        value: { type: 'string', description: 'Pour set uniquement' },
      },
      required: ['action'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'multi_llm_consensus',
    description: 'Lance 3 LLM en parallèle (Claude+GPT+Groq) sur même prompt → vote consensus + confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        providers: { type: 'string', description: 'Comma-separated (default: anthropic,openrouter,groq)' },
      },
      required: ['prompt'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'detect_intent',
    description: 'NLP intent detection sur message user (chat/search/admin/studio_X). Retourne intent + confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'sentinels_status',
    description: 'État des 13 sentinelles 24/7 (token-watch, backup-watch, error-watch, etc.) + lastResult.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'perf_metrics',
    description: 'Snapshot Web Vitals (LCP/INP/CLS/FCP/TTFB) + score Lighthouse runtime.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'reset_user_pin',
    description:
      'Reset le PIN d\'un user (admin Kevin only). Pousse une command Firebase ; iPhone du target la reçoit via SSE et exécute le reset local (clear PIN + reload). Aucune action manuelle de Kevin requise après l\'appel.',
    inputSchema: {
      type: 'object',
      properties: {
        target_uid: {
          type: 'string',
          description: 'User ID cible (ex: laurence_sp). DOIT être un user pré-configuré non admin.',
        },
        reason: {
          type: 'string',
          description: 'Raison du reset (oubli PIN, test, etc.) — affichée dans audit log.',
        },
      },
      required: ['target_uid'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'setup_user_account',
    description:
      'Configure complètement un compte user (PIN + clear lockout + activation) en autonomie. Apex IA récupère le code dans sa persistent_memory + hash + appelle ce tool. Le PIN clair n\'est JAMAIS envoyé à Firebase. Use case : Kevin "Apex configure le compte de Laurence avec son code".',
    inputSchema: {
      type: 'object',
      properties: {
        target_uid: {
          type: 'string',
          description: 'User ID cible (ex: laurence_sp). Whitelist non-admin uniquement.',
        },
        pin_clear: {
          type: 'string',
          description: 'PIN en clair (4-12 chiffres). Sera hashé PBKDF2 200k avant stockage. Récupéré depuis ax_persistent_memory ou fourni par Kevin.',
        },
        display_name: {
          type: 'string',
          description: 'Nom affiché user (ex: Laurence Saint-Polit) — pré-rempli champ login.',
        },
        reason: {
          type: 'string',
          description: 'Raison du setup (audit log).',
        },
      },
      required: ['target_uid', 'pin_clear'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'llm_council',
    description:
      'Délibération multi-LLM en 3 rounds (brainstorm parallèle → critique croisée → synthèse juge) pour décisions critiques niveau expert mondial. 5 IA experts par défaut (Claude/GPT-4o/Gemini/Llama/Mistral). Use case Kevin : audit production, choix architecture, validation refactor majeur, comparaison techno. Coût ~0.05$/run.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Question/décision à délibérer (préciser contexte et alternatives).',
        },
        max_rounds: {
          type: 'number',
          description: 'Nombre de rounds : 1 (brainstorm only) | 2 (+ critique) | 3 (+ synthèse juge, défaut).',
        },
        members_preset: {
          type: 'string',
          enum: ['default', 'security', 'ux', 'performance', 'business'],
          description: 'Council preset selon expertise prioritaire (default = mix all-star).',
        },
      },
      required: ['task'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
];
