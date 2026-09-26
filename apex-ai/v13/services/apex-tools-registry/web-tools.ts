/**
 * APEX v13 — Tools registry: web category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const WEB_TOOLS: readonly ApexTool[] = [
  {
    name: 'web_search',
    description: 'Recherche web via Brave Search → Tavily → DuckDuckGo failover. Retourne 5 résultats.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Requête de recherche' },
        max_results: { type: 'number', description: 'Nombre de résultats (default: 5)' },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'web_fetch',
    description: 'Fetch une URL HTTP et extrait le contenu textuel (sans HTML).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL HTTPS' },
      },
      required: ['url'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'open_url',
    description: 'Ouvre une URL dans modal pop-up Apex avec 2 boutons 1-clic : "Ouvrir dans Apex" (browser embed) ou "Ouvrir Safari" (nouvel onglet). Kevin règle CLAUDE.md "1 CLIC + FENÊTRE + BOUTON DIRECT". Utilise quand user dit "ouvre Google", "va sur tel site", "navigue vers...".',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL ou domaine (https:// ajouté auto si manquant)' },
        label: { type: 'string', description: 'Label affiché dans titre modal (optionnel)' },
        description: { type: 'string', description: 'Description courte (optionnel)' },
      },
      required: ['url'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'find_my_login_url',
    description: 'Cherche en autonomie l\'URL de connexion + dashboard + billing + api_keys + usage pour un service Kevin (ex: "ouvre ma boîte Gmail" → URL accounts.google.com).',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Nom du service (ex: anthropic, gmail, github, revolut) ou identifiant (email, IBAN)' },
      },
      required: ['service'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'scrape_url',
    description: 'Extraction structurée d\'une page web (titre, méta, body texte). Pas exec JS.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL HTTPS' },
      },
      required: ['url'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'clone_site',
    description: 'Lit, extrait ou CLONE une page web publique via le worker kdmc-clone (fetch côté serveur → contourne blocages CORS/embed). mode="read" (texte + markdown lisibles, défaut), "meta" (titre, description, technos détectées, liens internes), "html" (HTML brut), "clone" (HTML portable qui s\'ouvre seul, liens/images absolutisés). Utilise quand user dit "clone ce site", "lis/copie cette page", "extrais le contenu de...", "récupère le HTML de...".',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL de la page (https:// ajouté auto si manquant)' },
        mode: { type: 'string', description: 'read | meta | html | clone (défaut: read)' },
      },
      required: ['url'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'osint_tools',
    description: 'Répertoire OSINT curé (investigation en sources ouvertes) : cartes/satellite, vols, navires, webcams, pseudos/personnes, domaines·IP·infra, image inversée, réseaux sociaux, fuites/compromissions, vérification d\'actualité. Retourne les outils (nom + URL) par catégorie, avec le hub complet kd-mc.com/osint/. Utilise quand user demande "outils OSINT", "comment tracer un navire/avion", "vérifier une image/une fuite", "chercher un pseudo", "webcams live", etc. Param category optionnel pour filtrer (ex "maritime", "vols", "image").',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtre optionnel : catégorie ou nom d\'outil (ex "navires", "vols", "image inversée", "fuites")' },
      },
      required: [],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'wikipedia_lookup',
    description: 'Recherche Wikipedia (FR par défaut) via API publique gratuite. Retourne extrait + URL article.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Terme recherché' },
        lang: { type: 'string', description: 'Code langue ISO (fr, en, it, es, de... default: fr)' },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'youtube_search',
    description: 'Recherche YouTube (URL search results, sans clé API). Retourne lien recherche cliquable + suggestions vidéos via embed.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'github_search',
    description: 'Recherche code/repos GitHub via API publique (rate-limit 10/min sans token, 30/min avec).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Requête (ex: "language:typescript user:9r4rxssx64-creator")' },
        type: { type: 'string', enum: ['code', 'repos', 'users', 'issues'] },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'stackoverflow_search',
    description: 'Recherche StackOverflow via API gratuite. Retourne questions + réponses acceptées.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        tag: { type: 'string', description: 'Tag optionnel (ex: typescript, react)' },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'unshorten_url',
    description: 'Déplie une URL raccourcie (bit.ly, t.co, etc.) via redirection HTTP.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'navigate_to',
    description:
      'Navigue Apex vers une vue interne et highlight un champ optionnel. Aliases: "coffre.gemini", "coffre.openai", "settings.theme", "monitoring", "browser", "chat" — voir registry. Use case Kevin "où je colle ma clé Gemini ?" → navigate_to("coffre.gemini") → ouvre vault + scroll + highlight champ ax_gemini_key.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Alias cible (ex: "coffre.gemini", "settings.theme", "monitoring")' },
        field: { type: 'string', description: 'Champ override optionnel (default: champ associé à l\'alias)' },
      },
      required: ['target'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'autofill_field',
    description:
      'Remplit un champ Coffre/Settings/Profil après confirmation user (modal). Si admin Kevin avec confirm=false → écriture directe. Whitelist stricte des clés. Refuse forbidden patterns (CB, seed phrase). Use case "remplis ax_gemini_key avec AIzaSyXXX".',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Clé Coffre/Settings (ex: "ax_gemini_key", "ax_paypal_me")' },
        value: { type: 'string', description: 'Valeur à écrire (sera chiffrée AES-GCM si Coffre)' },
        confirm: { type: 'boolean', description: 'Demande confirmation modal (true par défaut). Admin Kevin peut passer false.' },
        reason: { type: 'string', description: 'Raison du remplissage (audit log)' },
      },
      required: ['key', 'value'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'unblock_url',
    description:
      'Tente de contourner X-Frame-Options/CSP frame-ancestors via cascade : direct → web.archive.org → r.jina.ai (reader) → CORS proxy custom. Si toutes échouent → fallback Safari (window.open). Retourne {ok, method, url, attempts}.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL à essayer de débloquer (https://...)' },
      },
      required: ['url'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
];
