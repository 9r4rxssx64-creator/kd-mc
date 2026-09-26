/**
 * APEX v13 — Tools registry: memory category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const MEMORY_TOOLS: readonly ApexTool[] = [
  {
    name: 'knowledge_update',
    description: 'Fetch documentation officielle récente (Anthropic, OpenAI, Stripe, Firebase, Cloudflare, etc.) et met à jour la KB Apex.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Ex: anthropic, openai, stripe, firebase, cloudflare, vercel' },
      },
      required: ['provider'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'memory_recall',
    description: 'Cherche dans la mémoire persistante Apex (ax_persistent_memory) par mot-clé. Retourne facts + lessons learned correspondants.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        scope: { type: 'string', enum: ['facts', 'lessons', 'kb', 'all'] },
      },
      required: ['keyword'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'memory_add',
    description: 'Ajoute un fait à la mémoire persistante Apex (catégorisé). Cross-session retention.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Ex: kevin_preferences, project_state, lesson_learned' },
        fact: { type: 'string' },
      },
      required: ['category', 'fact'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'lesson_record',
    description: 'Enregistre une lesson learned (erreur évitée + pattern + sévérité) cross-session.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        text: { type: 'string' },
        category: { type: 'string', description: 'Ex: parser, security, ui, perf' },
        severity: { type: 'string', enum: ['info', 'warn', 'critical'] },
      },
      required: ['title', 'text', 'severity'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'memory_add_entity',
    description:
      'Ajoute une entité au knowledge graph (ou réutilise si name+type déjà existants). Use case : Apex apprend "Kevin DESARZENS" (type=person, observations=["admin Apex","habite Monaco"]) → entité réutilisable cross-session. Idempotent : observations dédupliquées si entité existe déjà.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom de l\'entité (ex: "Kevin DESARZENS", "Apex AI", "CMCteams")' },
        type: { type: 'string', description: 'Type/catégorie (ex: "person", "project", "concept", "organization", "place")' },
        observations: {
          type: 'array',
          description: 'Liste de faits à attacher (ex: ["admin", "habite Monaco"]). Optionnel.',
        },
      },
      required: ['name', 'type'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'memory_add_relation',
    description:
      'Crée une relation orientée entre 2 entités du knowledge graph (from → to). Use case : memory_add_relation("ent_kevin","ent_laurence","loves") ou ("ent_apex","ent_cmcteams","integrates_with"). Idempotent : (from, to, type) déjà existante → réutilise.',
    inputSchema: {
      type: 'object',
      properties: {
        from_id: { type: 'string', description: 'Id de l\'entité source (retourné par memory_add_entity)' },
        to_id: { type: 'string', description: 'Id de l\'entité cible' },
        type: { type: 'string', description: 'Type de relation (ex: "loves", "works_at", "depends_on", "uses")' },
      },
      required: ['from_id', 'to_id', 'type'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'memory_search',
    description:
      'Recherche dans le knowledge graph par tokens (full-text sur name + type + observations, ranking par tokens matched + bonus name match). Retourne entités les plus pertinentes. Use case Kevin "que sais-tu sur Laurence ?" → memory_search("Laurence") → entité + ses observations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Requête full-text (ex: "Kevin Monaco admin")' },
        limit: { type: 'number', description: 'Max résultats retournés (default 20, max 100)' },
        type: { type: 'string', description: 'Filtre type entité (optionnel, ex: "person")' },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'memory_get_related',
    description:
      'Traversal BFS du graphe à partir d\'une entité, jusqu\'à `depth` levels (max 5). Retourne les nodes voisins + le type de relation par lequel on les a trouvés. Use case : "qui est lié à Kevin via Apex ?" → start Kevin, depth 2.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'Id de l\'entité de départ' },
        depth: { type: 'number', description: 'Profondeur traversal (default 1, max 5)' },
      },
      required: ['entity_id'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'thinking_start',
    description:
      'Démarre un raisonnement multi-étapes sur un problème complexe. Apex peut ensuite ajouter des steps, réviser, brancher. Préférable à une réponse directe quand problème complexe (audit, debug, planification).',
    inputSchema: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: 'Énoncé du problème à résoudre' },
        estimated_steps: { type: 'number', description: 'Nombre d\'étapes estimé (default 5, max 200)' },
      },
      required: ['problem'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'thinking_add_step',
    description:
      'Ajoute une étape de raisonnement à un thought actif. Utiliser après thinking_start. Marque can_revise=false si étape factuelle non révisable.',
    inputSchema: {
      type: 'object',
      properties: {
        thought_id: { type: 'string', description: 'Id retourné par thinking_start' },
        content: { type: 'string', description: 'Contenu de l\'étape (raisonnement)' },
        reflections: { type: 'string', description: 'Notes/doutes optionnels' },
        can_revise: { type: 'boolean', description: 'true par défaut. false si l\'étape est factuelle non révisable.' },
      },
      required: ['thought_id', 'content'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'thinking_revise',
    description:
      'Revoit une étape précédente : remplace son contenu par newContent, ajoute une step kind=revision. L\'étape originale est tracée dans reflections. À utiliser quand une analyse révèle une erreur précédente.',
    inputSchema: {
      type: 'object',
      properties: {
        thought_id: { type: 'string', description: 'Id du thought' },
        step_index: { type: 'number', description: 'Index de l\'étape à réviser' },
        new_content: { type: 'string', description: 'Nouveau contenu remplaçant' },
      },
      required: ['thought_id', 'step_index', 'new_content'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'thinking_branch',
    description:
      'Crée une branche alternative depuis une étape. Utile pour explorer une option différente sans perdre la chaîne principale.',
    inputSchema: {
      type: 'object',
      properties: {
        thought_id: { type: 'string', description: 'Id du thought' },
        from_step: { type: 'number', description: 'Index de l\'étape parent depuis laquelle brancher' },
        alternative: { type: 'string', description: 'Contenu de l\'alternative explorée' },
      },
      required: ['thought_id', 'from_step', 'alternative'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'thinking_complete',
    description:
      'Complète un thought avec une conclusion. Retourne la chaîne complète des steps (audit). Status passe à "completed", plus de mutation possible.',
    inputSchema: {
      type: 'object',
      properties: {
        thought_id: { type: 'string', description: 'Id du thought' },
        conclusion: { type: 'string', description: 'Conclusion finale du raisonnement' },
      },
      required: ['thought_id', 'conclusion'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
];
