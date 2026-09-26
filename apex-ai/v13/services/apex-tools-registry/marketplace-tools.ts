/**
 * APEX v13 — Tools registry: marketplace category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const MARKETPLACE_TOOLS: readonly ApexTool[] = [
  {
    name: 'marketplace_list_installed',
    description: 'Liste tous les plugins actuellement installés dans Apex (catalog + runtime).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'marketplace_search',
    description: 'Recherche fuzzy dans le catalog (~196 plugins) par nom / tag / description.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Mot-clé recherché (ex: "github", "memory", "rag")' },
        max: { type: 'number', description: 'Nombre max de résultats (default 30)' },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'marketplace_install',
    description: 'Installe un plugin du catalog. Vérifie pwa_compatible + clé API requise. Niveau B (Kevin notifié).',
    inputSchema: {
      type: 'object',
      properties: {
        plugin_id: { type: 'string', description: 'ID plugin (ex: "github", "supabase", "exa")' },
      },
      required: ['plugin_id'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'marketplace_recommend',
    description: 'Liste les plugins recommandés pour Kevin (PWA-compatible + valeur ≥ medium, pas installés).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtre catégorie (ex: "memory", "vector-rag")' },
        max: { type: 'number', description: 'Nombre max (default 20)' },
        min_value: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] as const },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'meta_search',
    description:
      'Cherche unifié dans 30+ marketplaces (HuggingFace, NPM, GitHub, Civitai, Replicate, Docker Hub, WordPress, Apple Store, data.gouv.fr, MCP servers, …). Retourne items agrégés.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Mot-clé recherché (ex: "stable diffusion", "react", "postgres")' },
        categories: {
          type: 'string',
          description: 'Catégories séparées virgule (ai-ml, code-packages, github, extensions, automation, saas, cloud, apis, datasets, anthropic). Vide = toutes PWA-compat.',
        },
        limit: { type: 'number', description: 'Limite résultats agrégés (default 50)' },
        include_non_pwa: { type: 'boolean', description: 'Inclure marketplaces non-PWA (proxy/OAuth requis)' },
      },
      required: ['query'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'meta_install',
    description:
      'Installe / utilise un item depuis un marketplace (npm install, ouvre URL, copie commande CLI, lance OAuth). Audit log immutable.',
    inputSchema: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'ID provider (ex: "npm", "huggingface", "github-marketplace")' },
        itemId: { type: 'string', description: 'ID item natif marketplace (package name, model id, etc.)' },
      },
      required: ['providerId', 'itemId'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'meta_trending',
    description:
      'Récupère les items trending d\'un marketplace donné (top stars / downloads). Utile pour discovery passive.',
    inputSchema: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'ID marketplace' },
        limit: { type: 'number', description: 'Nombre items (default 10)' },
      },
      required: ['providerId'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'meta_recommend',
    description:
      'Recommandations contextuelles pour Apex/Kevin (marketplaces non explorés + Anthropic-specific + trending HF). Aucun param.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'meta_list_providers',
    description:
      'Liste les 30+ marketplaces enregistrés (avec filtres optionnels catégorie / pwa-compat / clé-api / free-tier).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtre catégorie' },
        pwa_compatible: { type: 'boolean', description: 'Si true, garder seulement PWA-compatible' },
        api_key_required: { type: 'boolean', description: 'Si true, garder seulement ceux qui exigent clé API' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
];
