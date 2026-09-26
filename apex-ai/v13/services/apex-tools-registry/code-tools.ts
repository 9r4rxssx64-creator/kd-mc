/**
 * APEX v13 — Tools registry: code category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const CODE_TOOLS: readonly ApexTool[] = [
  {
    name: 'read_file',
    description: 'Lit le contenu d\'un fichier du repo CMCteams via GitHub raw URL.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif depuis racine repo (ex: apex-ai/v13/core/store.ts)' },
        branch: { type: 'string', description: 'Branche git (default: main)' },
      },
      required: ['path'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'edit_file',
    description: 'Propose un edit : remplace old_string par new_string dans path. Niveau C = validation Kevin obligatoire si non admin.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: 'Texte exact à remplacer (unique dans le fichier)' },
        new_string: { type: 'string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'run_test',
    description: 'Lance npm test (vitest) en sandbox. Retourne stdout + exit code.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Pattern fichiers test (default: tous)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'audit_self',
    description: 'Lance un audit subagent indépendant Explore sur l\'état actuel d\'Apex. Retourne score /100 par axe.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Scope audit : security, performance, ux, accessibility, all (default: all)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'commit_push',
    description: 'Git commit + push (nécessite GitHub PAT). Crée commit avec message + push branche claude/*.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message de commit clair (1-3 lignes)' },
        branch: { type: 'string', description: 'Branche cible (default: claude/auto-<ts>)' },
      },
      required: ['message'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'run_lint',
    description: 'Lance ESLint sur le repo. Retourne erreurs + warnings.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'run_typecheck',
    description: 'Lance tsc --noEmit pour vérifier types TypeScript.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'project_status',
    description: 'État courant d\'un projet Kevin (CMCteams, Télécommande, KDMC, e-KDMC, IA-KDMC, CrackPass) : version actuelle, tâches en cours, derniers commits.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', enum: ['cmcteams', 'telecommande', 'kdmc', 'ekdmc', 'iakdmc', 'crackpass', 'apex'] },
      },
      required: ['project_id'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'project_continue',
    description: 'Reprend un projet Kevin où il en est : lit handoff JSON + KEVIN_ACTIONS_TODO + dernières lessons learned, propose next steps.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
      },
      required: ['project_id'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'project_finish',
    description: 'Finalise un projet Kevin : audit complet + tests + deploy + closure handoff. Niveau C validation Kevin obligatoire.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
      },
      required: ['project_id'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'self_improve',
    description: 'Auto-amélioration : analyse le code Apex, propose 3 améliorations concrètes (perf, UX, sécurité). Niveau C si edit_file enchaîné.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Cible : performance, ux, security, accessibility, code_quality' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'search_repo_code',
    description: 'Cherche full-text dans le code source d\'un repo Kevin via GitHub Code Search API. Retourne paths + scores (max 20 résultats). Cache 1h anti rate-limit.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Requête full-text (ex: "addRepo function")' },
        repo: { type: 'string', description: 'Repo cible owner/repo (default: 9r4rxssx64-creator/CMCteams)' },
      },
      required: ['query'],
    },
    minTier: 'laurence',
    impactLevel: 'A',
  },
  {
    name: 'read_repo_file',
    description: 'Lit le contenu complet d\'un fichier d\'un repo Kevin via GitHub contents API. Décode base64 → string UTF-8.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif depuis racine repo (ex: apex-ai/v13/core/store.ts)' },
        repo: { type: 'string', description: 'Repo cible owner/repo (default: 9r4rxssx64-creator/CMCteams)' },
      },
      required: ['path'],
    },
    minTier: 'laurence',
    impactLevel: 'A',
  },
  {
    name: 'list_repo_files',
    description: 'Liste les fichiers d\'un répertoire d\'un repo (1 niveau profondeur, type file/dir).',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Chemin répertoire (default: racine repo)' },
        repo: { type: 'string', description: 'Repo cible owner/repo (default: 9r4rxssx64-creator/CMCteams)' },
      },
    },
    minTier: 'laurence',
    impactLevel: 'A',
  },
  {
    name: 'get_recent_commits',
    description: 'Liste les N derniers commits d\'un repo (default 10, max 100). Inclut sha, message, auteur, date.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Nombre de commits (1-100, default 10)' },
        repo: { type: 'string', description: 'Repo cible owner/repo (default: 9r4rxssx64-creator/CMCteams)' },
      },
    },
    minTier: 'laurence',
    impactLevel: 'A',
  },
  {
    name: 'get_repo_readme',
    description: 'Récupère le README d\'un repo Kevin (markdown brut, décodé base64).',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repo cible owner/repo (default: 9r4rxssx64-creator/CMCteams)' },
      },
    },
    minTier: 'laurence',
    impactLevel: 'A',
  },
  {
    name: 'execute_task',
    description: 'Exécute autonome via Claude Code Action GitHub : modify_file, create_file, run_test, run_lint, audit_repo, deploy_canary, backup_user_data, restore_from_backup. INTERDIT : delete_file, force_push, modify_user_credentials_external, send_external_email_without_consent. Niveau C = validation Kevin obligatoire.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Type de tâche autorisée (whitelist sécurité)',
          enum: ['modify_file', 'create_file', 'run_test', 'run_lint', 'audit_repo', 'deploy_canary', 'backup_user_data', 'restore_from_backup'],
        },
        params: { type: 'object', description: 'Paramètres spécifiques (path, content, env, depth, uid, ts...)' },
      },
      required: ['task', 'params'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'list_executions',
    description: 'Liste exécutions autonomes en cours/récentes (apex-execute). Filtres par statut, tâche, projet source.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'dispatched', 'running', 'completed', 'failed', 'cancelled', 'timeout'] },
        task: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'poll_execution',
    description: 'Vérifie le résultat d\'une exécution autonome (statut + url workflow GitHub).',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'ID exécution (exec_xxx)' } },
      required: ['task_id'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'cancel_execution',
    description: 'Annule une exécution pending/dispatched. Si workflow déjà running, le CI termine normalement.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'execute_stats',
    description: 'Stats apex-execute : total, success rate, avg duration, breakdown par tâche.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'execute_task_on_service',
    description: 'Exécute tâche concrète sur service externe Kevin (clé API vault). Services supportés : github, stripe, resend, telegram, brevo, openai, anthropic, vercel, cloudflare, paypal, discord, slack, notion, airtable, shopify. GitHub tasks: create_issue, add_comment, merge_pr (confirm:true), dispatch_workflow, create_or_update_file, delete_file (confirm:true). Autonomie totale Kevin 2026-05-04.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Nom service (github | stripe | resend | telegram | brevo | openai | anthropic | vercel | cloudflare | paypal | discord | slack | notion | airtable | shopify)' },
        task: { type: 'string', description: 'Tâche : send_email, create_issue, create_or_update_file, delete_file, send_message, etc. Voir docs handler.' },
        params: { type: 'object', description: 'Paramètres tâche (to, subject, amount, repo, channel, path, content, message, branch, etc.). Actions destructives (delete_file, merge_pr) exigent confirm:true.' },
      },
      required: ['service', 'task'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'create_or_update_file',
    description: 'CRÉE ou MET À JOUR un fichier dans le repo GitHub Kevin. Apex IA peut désormais écrire du code réellement (pas juste afficher). Si le fichier existe → update via SHA, sinon création. Encode auto base64. Branch default: main.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif depuis racine repo (ex: src/modules/clients/types.ts)' },
        content: { type: 'string', description: 'Contenu UTF-8 complet du fichier (sera encodé base64 auto)' },
        message: { type: 'string', description: 'Message commit (default: "Apex IA: update {path}")' },
        branch: { type: 'string', description: 'Branche cible (default: main)' },
        repo: { type: 'string', description: 'Repo cible owner/repo (default: 9r4rxssx64-creator/CMCteams)' },
      },
      required: ['path', 'content'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'delete_repo_file',
    description: 'SUPPRIME un fichier du repo GitHub. Action destructive — exige confirm:true. Crée commit avec message explicite.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif fichier à supprimer' },
        message: { type: 'string', description: 'Message commit (default: "Apex IA: delete {path}")' },
        branch: { type: 'string', description: 'Branche cible (default: main)' },
        repo: { type: 'string', description: 'Repo cible (default: 9r4rxssx64-creator/CMCteams)' },
        confirm: { type: 'boolean', description: 'DOIT être true pour valider la suppression' },
      },
      required: ['path', 'confirm'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'list_task_on_service_handlers',
    description: 'Liste services supportés par execute_task_on_service.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'client_free',
    impactLevel: 'A',
  },
];
