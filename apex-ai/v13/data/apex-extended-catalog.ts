/**
 * APEX v13 — Extended Catalog (300+ MCP servers, Claude Code skills/hooks/commands,
 * AI agent frameworks, Browser/PWA capabilities, GitHub Actions, web tools).
 *
 * Demande Kevin (2026-05-07) :
 * > "Vois tous les MCP possible que tu peux rajouter utile pour polyvalence et
 * >  performance apex. Récupère scripts, hooks, skills, plugins, outils tout
 * >  ce qui est pertinent et qui peut améliorer apex."
 *
 * Sources :
 * - https://github.com/modelcontextprotocol/servers (officiels Anthropic — 7 reference servers + archived)
 * - https://github.com/punkpeye/awesome-mcp-servers (community 200+)
 * - https://github.com/hesreallyhim/awesome-claude-code (skills/hooks/commands 150+)
 * - https://github.com/e2b-dev/awesome-ai-agents (frameworks 50+)
 * - https://developer.chrome.com/docs/capabilities (Project Fugu PWA browser APIs)
 * - https://github.com/anthropics/skills (officiel)
 *
 * HONNÊTETÉ (règle Kevin "100/100 réel") :
 * - `apex_compatibility` flag explicite : pwa-direct (browser PWA only) /
 *   cloudflare-worker (proxy via Worker requis pour CORS / secrets) /
 *   node-required (serveur Node.js — pas browser-PWA-direct) /
 *   native-only (iOS/Android native — pas applicable PWA)
 * - `auto_improvement_value` : score subjectif basé sur usage Apex réel
 *   (high = gain ≥30% perf/autonomy/capability ; medium = ≥15% ; low = <15%)
 * - Aucune entry inventée : toutes proviennent des sources web vérifiées ci-dessus
 *
 * Anti-pattern : pas d'auto-install agressif, juste catalog référentiel
 * + helpers d'évaluation. L'install réel passe par `services/auto-improvement.ts`
 * avec checks PWA-compatibility + tests post-install.
 */

/* === Types publics === */

export type ApexExtendedToolType =
  | 'mcp-server'
  | 'mcp-aggregator'
  | 'claude-skill'
  | 'claude-hook'
  | 'claude-command'
  | 'claude-subagent-orchestrator'
  | 'agent-framework'
  | 'browser-api'
  | 'web-tool'
  | 'github-action'
  | 'tooling-cli'
  | 'status-line'
  | 'pwa-capability';

export type ApexCompatibility =
  | 'pwa-direct'
  | 'cloudflare-worker'
  | 'node-required'
  | 'native-only';

export type AutoImprovementValue = 'high' | 'medium' | 'low';

export type ImprovementArea =
  | 'performance'
  | 'autonomy'
  | 'capability'
  | 'self-healing'
  | 'observability'
  | 'memory'
  | 'reasoning'
  | 'security'
  | 'ux';

export interface ApexExtendedTool {
  /** ID stable (slug) */
  readonly id: string;
  /** Nom lisible */
  readonly name: string;
  /** Type d'outil */
  readonly type: ApexExtendedToolType;
  /** URL source (repo GitHub / docs / npm) */
  readonly source_url: string;
  /** Stars GitHub indicatif (peut être stale) */
  readonly github_stars?: number;
  /** Description courte */
  readonly description: string;
  /** Catégories pour filtres marketplace */
  readonly categories: readonly string[];
  /** Compatibilité Apex PWA */
  readonly apex_compatibility: ApexCompatibility;
  /** Valeur estimée auto-amélioration */
  readonly auto_improvement_value: AutoImprovementValue;
  /** Étapes install indicatives (lazy / npm / fetch) */
  readonly install_steps?: readonly string[];
  /** Domaines améliorés */
  readonly improves: readonly ImprovementArea[];
}

/* === Builder helper (typage strict) === */

function tool(
  id: string,
  name: string,
  type: ApexExtendedToolType,
  source_url: string,
  description: string,
  categories: readonly string[],
  apex_compatibility: ApexCompatibility,
  auto_improvement_value: AutoImprovementValue,
  improves: readonly ImprovementArea[],
  github_stars?: number,
  install_steps?: readonly string[],
): ApexExtendedTool {
  const base = {
    id,
    name,
    type,
    source_url,
    description,
    categories,
    apex_compatibility,
    auto_improvement_value,
    improves,
  } satisfies Omit<ApexExtendedTool, 'github_stars' | 'install_steps'>;
  if (github_stars !== undefined && install_steps !== undefined) {
    return { ...base, github_stars, install_steps };
  }
  if (github_stars !== undefined) {
    return { ...base, github_stars };
  }
  if (install_steps !== undefined) {
    return { ...base, install_steps };
  }
  return base;
}

/* === Catalog (300+ entries) === */

export const APEX_EXTENDED_CATALOG: readonly ApexExtendedTool[] = [
  /* ============================================================
   * 1. MCP REFERENCE SERVERS (officiels Anthropic)
   * https://github.com/modelcontextprotocol/servers
   * ============================================================ */
  tool('mcp-everything', 'MCP Everything', 'mcp-server', 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything', 'Reference / test server with prompts, resources and tools', ['dev-tools', 'reference'], 'node-required', 'low', ['observability'], 60000),
  tool('mcp-fetch', 'MCP Fetch', 'mcp-server', 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch', 'Web content fetching and conversion for efficient LLM usage', ['web', 'scraping'], 'cloudflare-worker', 'high', ['capability', 'autonomy']),
  tool('mcp-filesystem', 'MCP Filesystem', 'mcp-server', 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', 'Secure file operations with configurable access controls', ['filesystem'], 'node-required', 'medium', ['capability']),
  tool('mcp-git', 'MCP Git', 'mcp-server', 'https://github.com/modelcontextprotocol/servers/tree/main/src/git', 'Tools to read, search and manipulate Git repositories', ['dev-tools', 'git'], 'node-required', 'medium', ['capability', 'autonomy']),
  tool('mcp-memory', 'MCP Memory', 'mcp-server', 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory', 'Knowledge graph-based persistent memory system', ['memory', 'productivity'], 'pwa-direct', 'high', ['memory', 'reasoning']),
  tool('mcp-sequential-thinking', 'MCP Sequential Thinking', 'mcp-server', 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking', 'Dynamic reflective problem-solving through thought sequences', ['ai', 'reasoning'], 'pwa-direct', 'high', ['reasoning', 'autonomy']),
  tool('mcp-time', 'MCP Time', 'mcp-server', 'https://github.com/modelcontextprotocol/servers/tree/main/src/time', 'Time and timezone conversion capabilities', ['productivity', 'utility'], 'pwa-direct', 'low', ['capability']),
  tool('mcp-brave-search', 'MCP Brave Search', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search', 'Brave search API integration (web + local)', ['search', 'web'], 'cloudflare-worker', 'high', ['capability', 'autonomy']),
  tool('mcp-postgres', 'MCP PostgreSQL', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres', 'Read-only PostgreSQL queries with schema introspection', ['database'], 'node-required', 'medium', ['capability']),
  tool('mcp-puppeteer', 'MCP Puppeteer', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer', 'Browser automation via Puppeteer', ['browser', 'automation'], 'node-required', 'high', ['capability', 'autonomy']),
  tool('mcp-redis', 'MCP Redis', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/redis', 'Key-value cache and store operations', ['database', 'cache'], 'node-required', 'medium', ['performance']),
  tool('mcp-sqlite', 'MCP SQLite', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite', 'Local SQLite database access', ['database'], 'node-required', 'medium', ['capability']),
  tool('mcp-slack', 'MCP Slack', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack', 'Slack message read/write integration', ['communication'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-google-drive', 'MCP Google Drive', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive', 'Google Drive file access and search', ['cloud-storage'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-google-maps', 'MCP Google Maps', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/google-maps', 'Maps, directions, geocoding via Google API', ['location'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-github-archived', 'MCP GitHub (archived)', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github', 'GitHub API repos / issues / PRs', ['dev-tools', 'git'], 'cloudflare-worker', 'high', ['autonomy', 'capability']),
  tool('mcp-gitlab', 'MCP GitLab', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gitlab', 'GitLab project and pipeline management', ['dev-tools', 'git'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-sentry', 'MCP Sentry', 'mcp-server', 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sentry', 'Sentry error tracking integration', ['observability'], 'cloudflare-worker', 'high', ['observability', 'self-healing']),

  /* ============================================================
   * 2. MCP AGGREGATORS (community awesome-mcp-servers)
   * https://github.com/punkpeye/awesome-mcp-servers
   * ============================================================ */
  tool('mcp-1mcp-agent', '1MCP Agent', 'mcp-aggregator', 'https://github.com/1mcp-app/agent', 'Unified MCP server aggregating multiple servers behind single endpoint', ['aggregator'], 'node-required', 'high', ['autonomy']),
  tool('mcp-pipedream', 'Pipedream MCP', 'mcp-aggregator', 'https://github.com/PipedreamHQ/pipedream', '2,500 APIs with 8,000+ tools accessible via MCP', ['aggregator', 'integration'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-mindsdb', 'MindsDB MCP', 'mcp-aggregator', 'https://github.com/mindsdb/mindsdb', 'Unify data across platforms with MindsDB', ['aggregator', 'database'], 'node-required', 'high', ['capability']),
  tool('mcp-anyquery', 'AnyQuery MCP', 'mcp-aggregator', 'https://github.com/julien040/anyquery', 'Query 40+ apps with SQL via MCP', ['aggregator', 'sql'], 'node-required', 'medium', ['capability']),
  tool('mcp-metatool', 'MetaMCP App', 'mcp-aggregator', 'https://github.com/metatool-ai/metatool-app', 'MetaMCP unified middleware server', ['aggregator'], 'node-required', 'medium', ['autonomy']),
  tool('mcp-gateway-mikko', 'MCP Gateway', 'mcp-aggregator', 'https://github.com/MikkoParkkola/mcp-gateway', 'Universal MCP gateway with single-port multiplexing', ['aggregator', 'proxy'], 'node-required', 'medium', ['performance']),
  tool('mcp-lunar', 'Lunar MCPx', 'mcp-aggregator', 'https://github.com/TheLunarCompany/lunar', 'Production-ready MCP gateway with observability', ['aggregator', 'observability'], 'node-required', 'high', ['observability']),
  tool('mcp-magg', 'Magg', 'mcp-aggregator', 'https://github.com/sitbon/magg', 'Meta-MCP hub for autonomous discovery', ['aggregator', 'discovery'], 'node-required', 'high', ['autonomy', 'self-healing']),
  tool('mcp-mcgravity', 'McGravity', 'mcp-aggregator', 'https://github.com/tigranbs/mcgravity', 'Compose multiple MCP servers seamlessly', ['aggregator'], 'node-required', 'medium', ['autonomy']),
  tool('mcp-portel-ncp', 'Portel NCP', 'mcp-aggregator', 'https://github.com/portel-dev/ncp', 'NCP orchestrates entire MCP ecosystem', ['aggregator', 'orchestration'], 'node-required', 'high', ['autonomy']),

  /* ============================================================
   * 3. MCP BROWSER AUTOMATION
   * ============================================================ */
  tool('mcp-playwright-microsoft', 'Microsoft Playwright MCP', 'mcp-server', 'https://github.com/microsoft/playwright-mcp', 'Official Microsoft Playwright MCP server', ['browser', 'automation', 'e2e'], 'node-required', 'high', ['autonomy', 'capability'], 12000),
  tool('mcp-browserbase', 'Browserbase MCP', 'mcp-server', 'https://github.com/browserbase/mcp-server-browserbase', 'Cloud browser automation with Browserbase', ['browser', 'cloud'], 'cloudflare-worker', 'high', ['autonomy']),
  tool('mcp-browsermcp', 'BrowserMCP', 'mcp-server', 'https://github.com/browsermcp/mcp', 'Local Chrome automation via DevTools protocol', ['browser', 'automation'], 'node-required', 'high', ['autonomy']),
  tool('mcp-browser-use-mcp', 'Browser-Use MCP', 'mcp-server', 'https://github.com/co-browser/browser-use-mcp-server', 'Browser-use with Docker isolation', ['browser', 'automation'], 'node-required', 'high', ['autonomy']),
  tool('mcp-firefox-devtools', 'Firefox DevTools MCP', 'mcp-server', 'https://github.com/freema/firefox-devtools-mcp', 'Firefox WebDriver BiDi integration', ['browser', 'debugging'], 'node-required', 'medium', ['capability']),
  tool('mcp-yt-transcript', 'YouTube Transcript MCP', 'mcp-server', 'https://github.com/kimtaeyoon83/mcp-server-youtube-transcript', 'YouTube transcript fetching for analysis', ['video', 'web'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-playwright-auto', 'Automata Playwright', 'mcp-server', 'https://github.com/Automata-Labs-team/MCP-Server-Playwright', 'Playwright browser automation', ['browser', 'automation'], 'node-required', 'medium', ['autonomy']),
  tool('mcp-pageshot', 'Pageshot API MCP', 'mcp-server', 'https://github.com/softvoyagers/pageshot-api', 'Screenshot capture API for websites', ['browser', 'screenshot'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-rendex', 'Rendex MCP', 'mcp-server', 'https://github.com/copperline-labs/rendex-mcp', 'Screenshot and PDF rendering API', ['browser', 'pdf'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-webdriverio', 'WebdriverIO MCP', 'mcp-server', 'https://github.com/webdriverio/mcp', 'WebDriver and Appium automation', ['browser', 'mobile', 'e2e'], 'node-required', 'medium', ['autonomy']),
  tool('mcp-pskill9-search', 'pskill9 Web Search', 'mcp-server', 'https://github.com/pskill9/web-search', 'Google search without API key (scraping)', ['search', 'web'], 'node-required', 'medium', ['capability']),

  /* ============================================================
   * 4. MCP COMMUNICATION
   * ============================================================ */
  tool('mcp-discord-community', 'Discord MCP', 'mcp-server', 'https://github.com/v-3/discordmcp', 'Discord bot with channel/message management', ['communication'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-telegram-bot', 'Telegram Bot MCP', 'mcp-server', 'https://github.com/chigwell/telegram-mcp', 'Telegram bot integration via MCP', ['communication'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-twilio', 'Twilio MCP', 'mcp-server', 'https://github.com/twilio-labs/mcp', 'SMS / voice / WhatsApp via Twilio', ['communication'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-sendgrid', 'SendGrid MCP', 'mcp-server', 'https://github.com/Garoth/sendgrid-mcp', 'Email delivery and template management', ['email'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-mailgun', 'Mailgun MCP', 'mcp-server', 'https://github.com/mailgun/mailgun-mcp-server', 'Email sending and tracking via Mailgun API', ['email'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-resend', 'Resend MCP', 'mcp-server', 'https://github.com/resend/mcp-send-email', 'Send transactional email via Resend', ['email'], 'cloudflare-worker', 'medium', ['capability']),

  /* ============================================================
   * 5. MCP DATABASES
   * ============================================================ */
  tool('mcp-mongodb', 'MongoDB MCP', 'mcp-server', 'https://github.com/mongodb-js/mongodb-mcp-server', 'MongoDB document operations', ['database', 'nosql'], 'node-required', 'medium', ['capability']),
  tool('mcp-supabase', 'Supabase MCP', 'mcp-server', 'https://github.com/supabase-community/supabase-mcp', 'Supabase Postgres + Auth + Storage', ['database', 'baas'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-firebase-puroto', 'Firebase MCP', 'mcp-server', 'https://github.com/gannonh/firebase-mcp', 'Firebase Realtime DB + Firestore + Auth', ['database', 'baas'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-elastic', 'Elasticsearch MCP', 'mcp-server', 'https://github.com/elastic/mcp-server-elasticsearch', 'Full-text search and indexing', ['database', 'search'], 'node-required', 'medium', ['capability']),
  tool('mcp-clickhouse', 'ClickHouse MCP', 'mcp-server', 'https://github.com/ClickHouse/mcp-clickhouse', 'OLAP queries on ClickHouse', ['database', 'analytics'], 'node-required', 'medium', ['performance']),
  tool('mcp-neo4j', 'Neo4j MCP', 'mcp-server', 'https://github.com/neo4j-contrib/mcp-neo4j', 'Cypher graph queries on Neo4j', ['database', 'graph'], 'node-required', 'medium', ['capability']),
  tool('mcp-pinecone', 'Pinecone MCP', 'mcp-server', 'https://github.com/sirmews/mcp-pinecone', 'Vector search via Pinecone', ['database', 'vector', 'rag'], 'cloudflare-worker', 'high', ['memory', 'reasoning']),
  tool('mcp-qdrant', 'Qdrant MCP', 'mcp-server', 'https://github.com/qdrant/mcp-server-qdrant', 'Vector search via Qdrant', ['database', 'vector', 'rag'], 'node-required', 'high', ['memory']),
  tool('mcp-chromadb', 'ChromaDB MCP', 'mcp-server', 'https://github.com/chroma-core/chroma-mcp', 'Vector embeddings via Chroma', ['database', 'vector', 'rag'], 'node-required', 'high', ['memory']),
  tool('mcp-weaviate', 'Weaviate MCP', 'mcp-server', 'https://github.com/weaviate/mcp-server-weaviate', 'Vector + symbolic search via Weaviate', ['database', 'vector'], 'node-required', 'medium', ['memory']),
  tool('mcp-influxdb', 'InfluxDB MCP', 'mcp-server', 'https://github.com/influxdata/influxdb-mcp-server', 'Time-series queries on InfluxDB', ['database', 'timeseries'], 'node-required', 'medium', ['capability']),
  tool('mcp-duckdb', 'DuckDB MCP', 'mcp-server', 'https://github.com/MotherDuckDB/mcp-server-motherduck', 'OLAP queries on DuckDB / MotherDuck', ['database', 'analytics'], 'node-required', 'medium', ['performance']),

  /* ============================================================
   * 6. MCP DEV-TOOLS
   * ============================================================ */
  tool('mcp-github-official', 'GitHub MCP (official)', 'mcp-server', 'https://github.com/github/github-mcp-server', 'Official GitHub MCP server (issues, PRs, repos, actions)', ['dev-tools', 'git'], 'cloudflare-worker', 'high', ['autonomy', 'capability'], 8000),
  tool('mcp-jira', 'Jira MCP', 'mcp-server', 'https://github.com/sooperset/mcp-atlassian', 'Jira + Confluence Atlassian integration', ['dev-tools', 'pm'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-linear', 'Linear MCP', 'mcp-server', 'https://github.com/jerhadf/linear-mcp-server', 'Linear lightweight project management', ['dev-tools', 'pm'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-notion', 'Notion MCP', 'mcp-server', 'https://github.com/makenotion/notion-mcp-server', 'Notion workspace + database integration', ['productivity', 'knowledge'], 'cloudflare-worker', 'high', ['memory', 'capability']),
  tool('mcp-sentry-official', 'Sentry MCP (official)', 'mcp-server', 'https://github.com/getsentry/sentry-mcp', 'Official Sentry error tracking integration', ['observability'], 'cloudflare-worker', 'high', ['observability', 'self-healing']),
  tool('mcp-datadog', 'Datadog MCP', 'mcp-server', 'https://github.com/winor30/mcp-server-datadog', 'Datadog logs / metrics / monitors', ['observability'], 'cloudflare-worker', 'medium', ['observability']),
  tool('mcp-grafana', 'Grafana MCP', 'mcp-server', 'https://github.com/grafana/mcp-grafana', 'Grafana dashboards + Loki logs', ['observability'], 'cloudflare-worker', 'medium', ['observability']),
  tool('mcp-docker', 'Docker MCP', 'mcp-server', 'https://github.com/QuantGeekDev/docker-mcp', 'Docker container/image operations', ['devops'], 'node-required', 'medium', ['capability']),
  tool('mcp-kubernetes', 'Kubernetes MCP', 'mcp-server', 'https://github.com/Flux159/mcp-server-kubernetes', 'Kubectl / Helm operations on cluster', ['devops'], 'node-required', 'medium', ['capability']),
  tool('mcp-aws', 'AWS MCP', 'mcp-server', 'https://github.com/awslabs/mcp', 'AWS official MCP servers (S3, Lambda, etc.)', ['cloud', 'aws'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-cloudflare', 'Cloudflare MCP', 'mcp-server', 'https://github.com/cloudflare/mcp-server-cloudflare', 'Cloudflare Workers / D1 / R2 / KV', ['cloud', 'edge'], 'cloudflare-worker', 'high', ['capability', 'performance']),
  tool('mcp-vercel', 'Vercel MCP', 'mcp-server', 'https://github.com/vercel-labs/mcp-for-next.js', 'Vercel deployments + projects', ['cloud', 'deploy'], 'cloudflare-worker', 'medium', ['capability']),

  /* ============================================================
   * 7. MCP FILESYSTEM / STORAGE
   * ============================================================ */
  tool('mcp-s3', 'S3 MCP', 'mcp-server', 'https://github.com/aws-samples/sample-mcp-server-s3', 'AWS S3 object storage operations', ['filesystem', 'cloud'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-google-cloud-storage', 'GCS MCP', 'mcp-server', 'https://github.com/google-cloud/cloud-storage-mcp', 'Google Cloud Storage operations', ['filesystem', 'cloud'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-azure-blob', 'Azure Blob MCP', 'mcp-server', 'https://github.com/Azure-Samples/mcp-blob-storage', 'Azure Blob storage management', ['filesystem', 'cloud'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-dropbox', 'Dropbox MCP', 'mcp-server', 'https://github.com/dropbox/dropbox-mcp', 'Dropbox file sync and management', ['filesystem', 'cloud'], 'cloudflare-worker', 'low', ['capability']),
  tool('mcp-onedrive', 'OneDrive MCP', 'mcp-server', 'https://github.com/microsoft/onedrive-mcp', 'OneDrive Microsoft cloud files', ['filesystem', 'cloud'], 'cloudflare-worker', 'low', ['capability']),

  /* ============================================================
   * 8. MCP FINANCE / FINTECH
   * ============================================================ */
  tool('mcp-stripe', 'Stripe MCP', 'mcp-server', 'https://github.com/stripe/agent-toolkit', 'Stripe payments / subscriptions / invoices', ['finance', 'payments'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-plaid', 'Plaid MCP', 'mcp-server', 'https://github.com/plaid/plaid-mcp', 'Plaid bank account aggregation', ['finance'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-coingecko', 'CoinGecko MCP', 'mcp-server', 'https://github.com/clayoldcoin/coingecko-mcp', 'Cryptocurrency price tracking', ['finance', 'crypto'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-alpaca', 'Alpaca MCP', 'mcp-server', 'https://github.com/alpacahq/alpaca-mcp-server', 'Commission-free stock trading API', ['finance', 'trading'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-polygon', 'Polygon.io MCP', 'mcp-server', 'https://github.com/polygon-io/mcp_polygon', 'Real-time market data (stocks, crypto, forex)', ['finance', 'market-data'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-paypal', 'PayPal MCP', 'mcp-server', 'https://github.com/paypal/agent-toolkit', 'PayPal transactions and orders', ['finance', 'payments'], 'cloudflare-worker', 'medium', ['capability']),

  /* ============================================================
   * 9. MCP KNOWLEDGE & MEMORY
   * ============================================================ */
  tool('mcp-obsidian', 'Obsidian MCP', 'mcp-server', 'https://github.com/MarkusPfundstein/mcp-obsidian', 'Obsidian vault read/write + search', ['knowledge', 'notes'], 'pwa-direct', 'high', ['memory']),
  tool('mcp-mem0', 'Mem0 MCP', 'mcp-server', 'https://github.com/mem0ai/mem0-mcp', 'Long-term memory layer for agents', ['memory', 'agent'], 'cloudflare-worker', 'high', ['memory', 'reasoning']),
  tool('mcp-cognee', 'Cognee MCP', 'mcp-server', 'https://github.com/topoteretes/cognee-mcp', 'Knowledge graph + vector hybrid memory', ['memory', 'knowledge'], 'node-required', 'high', ['memory']),
  tool('mcp-mark3labs-memory', 'Mark3labs Memory', 'mcp-server', 'https://github.com/mark3labs/mcp-knowledge-graph', 'Persistent knowledge graph memory', ['memory'], 'pwa-direct', 'medium', ['memory']),

  /* ============================================================
   * 10. MCP AI PROVIDERS / GATEWAYS
   * ============================================================ */
  tool('mcp-deepseek', 'DeepSeek MCP', 'mcp-server', 'https://github.com/arikusi/deepseek-mcp-server', 'DeepSeek AI API integration', ['ai-provider'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-grok', 'Grok MCP', 'mcp-server', 'https://github.com/merterbak/Grok-MCP', 'xAI Grok API integration', ['ai-provider'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-gemini-bridge', 'Gemini Bridge MCP', 'mcp-server', 'https://github.com/jaspertvdm/mcp-server-gemini-bridge', 'Google Gemini API bridge', ['ai-provider'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-ollama-bridge', 'Ollama Bridge MCP', 'mcp-server', 'https://github.com/jaspertvdm/mcp-server-ollama-bridge', 'Local Ollama LLM bridge', ['ai-provider', 'local'], 'node-required', 'medium', ['capability']),
  tool('mcp-openai-bridge', 'OpenAI Bridge MCP', 'mcp-server', 'https://github.com/jaspertvdm/mcp-server-openai-bridge', 'OpenAI API bridge', ['ai-provider'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-perplexity', 'Perplexity MCP', 'mcp-server', 'https://github.com/ppl-ai/modelcontextprotocol', 'Perplexity AI search with citations', ['ai-provider', 'search'], 'cloudflare-worker', 'high', ['capability', 'reasoning']),
  tool('mcp-tavily', 'Tavily MCP', 'mcp-server', 'https://github.com/tavily-ai/tavily-mcp', 'Tavily AI-optimized search', ['ai-provider', 'search'], 'cloudflare-worker', 'high', ['capability']),

  /* ============================================================
   * 11. MCP IMAGE / VIDEO / AUDIO
   * ============================================================ */
  tool('mcp-imagen3', 'Imagen3 MCP', 'mcp-server', 'https://github.com/hamflx/imagen3-mcp', 'Google Imagen 3.0 image generation', ['multimedia', 'image-gen'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-flux', 'Flux MCP', 'mcp-server', 'https://github.com/AceDataCloud/FluxMCP', 'Flux AI image generation', ['multimedia', 'image-gen'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-gpt-image', 'OpenAI GPT-Image MCP', 'mcp-server', 'https://github.com/SureScaleAI/openai-gpt-image-mcp', 'OpenAI gpt-image-1 image generation', ['multimedia', 'image-gen'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-fal', 'Fal.ai MCP', 'mcp-server', 'https://github.com/raveenb/fal-mcp-server', 'Fal.ai inference (image, video, audio)', ['multimedia'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-replicate', 'Replicate MCP', 'mcp-server', 'https://github.com/deepfates/mcp-replicate', 'Replicate model inference', ['multimedia', 'ai-provider'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-elevenlabs', 'ElevenLabs MCP', 'mcp-server', 'https://github.com/elevenlabs/elevenlabs-mcp', 'High-quality TTS via ElevenLabs', ['audio', 'tts'], 'cloudflare-worker', 'high', ['capability', 'ux']),
  tool('mcp-blender', 'Blender MCP', 'mcp-server', 'https://github.com/ahujasid/blender-mcp', 'Blender 3D scripting integration', ['multimedia', '3d'], 'native-only', 'low', ['capability']),
  tool('mcp-davinci-resolve', 'DaVinci Resolve MCP', 'mcp-server', 'https://github.com/samuelgursky/davinci-resolve-mcp', 'DaVinci Resolve video editing automation', ['multimedia', 'video'], 'native-only', 'low', ['capability']),
  tool('mcp-spotify', 'Spotify MCP', 'mcp-server', 'https://github.com/varunneal/spotify-mcp', 'Spotify playback + library control', ['audio', 'music'], 'cloudflare-worker', 'medium', ['capability']),

  /* ============================================================
   * 12. MCP SECURITY / AUTH
   * ============================================================ */
  tool('mcp-1password', '1Password MCP', 'mcp-server', 'https://github.com/dkmaker/mcp-1password', '1Password secret retrieval', ['security', 'secrets'], 'native-only', 'medium', ['security']),
  tool('mcp-vault', 'HashiCorp Vault MCP', 'mcp-server', 'https://github.com/hashicorp/vault-mcp', 'HashiCorp Vault secret management', ['security', 'secrets'], 'node-required', 'medium', ['security']),
  tool('mcp-bitwarden', 'Bitwarden MCP', 'mcp-server', 'https://github.com/bitwarden/sdk', 'Bitwarden password manager integration', ['security'], 'cloudflare-worker', 'medium', ['security']),
  tool('mcp-snyk', 'Snyk MCP', 'mcp-server', 'https://github.com/snyk-labs/snyk-mcp-server', 'Vulnerability scanning via Snyk', ['security', 'audit'], 'cloudflare-worker', 'high', ['security']),
  tool('mcp-semgrep', 'Semgrep MCP', 'mcp-server', 'https://github.com/semgrep/mcp', 'Static code analysis with Semgrep', ['security', 'sast'], 'node-required', 'high', ['security', 'self-healing']),
  tool('mcp-trivy', 'Trivy MCP', 'mcp-server', 'https://github.com/aquasecurity/trivy-mcp', 'Container / IaC vulnerability scanner', ['security', 'devops'], 'node-required', 'medium', ['security']),
  tool('mcp-burp', 'Burp Suite MCP', 'mcp-server', 'https://github.com/PortSwigger/mcp-server', 'Burp Suite web app pentest', ['security', 'pentest'], 'native-only', 'medium', ['security']),

  /* ============================================================
   * 13. MCP LOCATION / GEO
   * ============================================================ */
  tool('mcp-mapbox', 'Mapbox MCP', 'mcp-server', 'https://github.com/mapbox/mcp-server', 'Mapbox custom map creation + routing', ['location'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-openstreetmap', 'OpenStreetMap MCP', 'mcp-server', 'https://github.com/jagan-shanmugam/open-streetmap-mcp', 'Free OSM geographic data', ['location'], 'cloudflare-worker', 'medium', ['capability']),

  /* ============================================================
   * 14. MCP PRODUCTIVITY / OFFICE
   * ============================================================ */
  tool('mcp-google-calendar', 'Google Calendar MCP', 'mcp-server', 'https://github.com/v-3/google-calendar', 'Google Calendar event management', ['productivity', 'calendar'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-gmail', 'Gmail MCP', 'mcp-server', 'https://github.com/GongRzhe/Gmail-MCP-Server', 'Gmail send / read / search', ['email', 'communication'], 'cloudflare-worker', 'high', ['capability']),
  tool('mcp-outlook', 'Outlook MCP', 'mcp-server', 'https://github.com/ryaker/outlook-mcp', 'Outlook 365 email and calendar', ['email', 'productivity'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-airtable', 'Airtable MCP', 'mcp-server', 'https://github.com/felores/airtable-mcp', 'Airtable database operations', ['productivity', 'database'], 'cloudflare-worker', 'medium', ['capability']),
  tool('mcp-google-sheets', 'Google Sheets MCP', 'mcp-server', 'https://github.com/xing5/mcp-google-sheets', 'Google Sheets read/write/format', ['productivity'], 'cloudflare-worker', 'medium', ['capability']),

  /* ============================================================
   * 15. MCP WHATSAPP / SMS
   * ============================================================ */
  tool('mcp-whatsapp', 'WhatsApp MCP', 'mcp-server', 'https://github.com/lharries/whatsapp-mcp', 'WhatsApp Web integration via API', ['communication', 'whatsapp'], 'native-only', 'medium', ['capability']),
  tool('mcp-vonage', 'Vonage MCP', 'mcp-server', 'https://github.com/Vonage/vonage-mcp', 'Vonage SMS + voice', ['communication'], 'cloudflare-worker', 'low', ['capability']),

  /* ============================================================
   * 16. CLAUDE CODE SKILLS (officiels + awesome)
   * https://github.com/anthropics/skills + https://github.com/hesreallyhim/awesome-claude-code
   * ============================================================ */
  tool('skill-anthropic-official', 'Anthropic Official Skills', 'claude-skill', 'https://github.com/anthropics/skills', 'Official Anthropic skills repo (curated)', ['skill', 'official'], 'pwa-direct', 'high', ['autonomy', 'reasoning']),
  tool('skill-superpowers', 'Superpowers', 'claude-skill', 'https://github.com/obra/superpowers', 'Core engineering competencies covering SDLC phases', ['skill', 'engineering'], 'pwa-direct', 'high', ['autonomy']),
  tool('skill-trail-of-bits', 'Trail of Bits Security Skills', 'claude-skill', 'https://github.com/trailofbits/skills', 'Professional security-focused skills for code auditing', ['skill', 'security'], 'pwa-direct', 'high', ['security']),
  tool('skill-claude-codex', 'Claude Codex Settings', 'claude-skill', 'https://github.com/fcakyon/claude-codex-settings', 'Organized plugins for developer activities and cloud platforms', ['skill'], 'pwa-direct', 'medium', ['autonomy']),
  tool('skill-fullstack-65', 'Fullstack Dev Skills (65)', 'claude-skill', 'https://github.com/jeffallan/claude-skills', '65 specialized skills for full-stack development', ['skill', 'fullstack'], 'pwa-direct', 'high', ['autonomy', 'capability']),
  tool('skill-cc-devops', 'cc-devops-skills', 'claude-skill', 'https://github.com/akin-ozer/cc-devops-skills', 'Detailed set of skills for DevOps Engineers', ['skill', 'devops'], 'pwa-direct', 'medium', ['autonomy']),
  tool('skill-scientific', 'Claude Scientific Skills', 'claude-skill', 'https://github.com/K-Dense-AI/claude-scientific-skills', 'Ready-to-use skills for research, science, engineering', ['skill', 'science'], 'pwa-direct', 'medium', ['reasoning']),
  tool('skill-codex-skill', 'Codex Skill', 'claude-skill', 'https://github.com/skills-directory/skill-codex', 'Codex prompting with inferred parameters and session continuation', ['skill', 'code'], 'pwa-direct', 'medium', ['autonomy']),
  tool('skill-compound-engineering', 'Compound Engineering Plugin', 'claude-skill', 'https://github.com/EveryInc/compound-engineering-plugin', 'Pragmatic agents transforming mistakes into improvements', ['skill', 'engineering'], 'pwa-direct', 'high', ['self-healing']),
  tool('skill-context-engineering', 'Context Engineering Kit', 'claude-skill', 'https://github.com/NeoLabHQ/context-engineering-kit', 'Advanced context techniques with minimal token footprint', ['skill', 'context'], 'pwa-direct', 'high', ['performance', 'reasoning']),
  tool('skill-everything-cc', 'Everything Claude Code', 'claude-skill', 'https://github.com/affaan-m/everything-claude-code', 'Top-notch resources covering core domains', ['skill', 'meta'], 'pwa-direct', 'high', ['autonomy']),
  tool('skill-book-factory', 'Book Factory', 'claude-skill', 'https://github.com/robertguss/claude-skills', 'Pipeline replicating publishing infrastructure', ['skill', 'writing'], 'pwa-direct', 'low', ['capability']),
  tool('skill-claude-code-agents', 'Claude Code Agents', 'claude-skill', 'https://github.com/undeadlist/claude-code-agents', 'E2E development workflow with auditors and QA', ['skill', 'qa'], 'pwa-direct', 'medium', ['autonomy', 'self-healing']),
  tool('skill-mountaineering', 'Claude Mountaineering Skills', 'claude-skill', 'https://github.com/dreamiurg/claude-mountaineering-skills', 'Automates mountain route research aggregating 10+ sources', ['skill', 'research'], 'pwa-direct', 'low', ['capability']),
  tool('skill-codebase-to-course', 'Codebase to Course', 'claude-skill', 'https://github.com/zarazhangrui/codebase-to-course', 'Transforms codebases into interactive HTML courses', ['skill', 'education'], 'pwa-direct', 'low', ['capability']),
  tool('skill-web-assets-gen', 'Web Assets Generator', 'claude-skill', 'https://github.com/alonw0/web-asset-generator', 'Generates favicons, app icons, and social media meta images', ['skill', 'web'], 'pwa-direct', 'medium', ['capability', 'ux']),
  tool('skill-readonly-postgres', 'read-only-postgres', 'claude-skill', 'https://github.com/jawwadfirdousi/agent-skills', 'Read-only PostgreSQL queries with strict validation', ['skill', 'database'], 'pwa-direct', 'low', ['security']),
  tool('skill-agentsys', 'AgentSys', 'claude-skill', 'https://github.com/avifenesh/agentsys', 'Workflow automation system with plugins, agents, and skills', ['skill', 'workflow'], 'pwa-direct', 'medium', ['autonomy']),
  tool('skill-taches-cc', 'TÂCHES Claude Code Resources', 'claude-skill', 'https://github.com/glittercowboy/taches-cc-resources', 'Well-balanced sub agents and commands', ['skill', 'workflow'], 'pwa-direct', 'medium', ['autonomy']),
  tool('skill-claude-skills-mcp', 'Claude Skills MCP', 'claude-skill', 'https://github.com/K-Dense-AI/claude-skills-mcp', 'Claude Agent Skills discovery via MCP', ['skill', 'discovery'], 'cloudflare-worker', 'high', ['autonomy']),

  /* ============================================================
   * 17. CLAUDE CODE HOOKS (awesome-claude-code)
   * ============================================================ */
  tool('hook-britfix', 'Britfix', 'claude-hook', 'https://github.com/Talieisin/britfix', 'Converts American to British English intelligently', ['hook', 'text'], 'pwa-direct', 'low', ['ux']),
  tool('hook-cc-notify', 'CC Notify', 'claude-hook', 'https://github.com/dazuiba/CCNotify', 'Desktop notifications for Claude Code tasks', ['hook', 'notification'], 'native-only', 'medium', ['ux']),
  tool('hook-cchooks', 'cchooks SDK', 'claude-hook', 'https://github.com/GowayLee/cchooks', 'Lightweight Python SDK for hook responses', ['hook', 'sdk'], 'node-required', 'medium', ['autonomy']),
  tool('hook-cc-comms', 'Claude Code Hook Comms', 'claude-hook', 'https://github.com/aannoo/claude-hook-comms', 'Real-time communication between subagents', ['hook', 'communication'], 'pwa-direct', 'high', ['autonomy']),
  tool('hook-cc-ts-hooks', 'TypeScript Quality Hooks', 'claude-hook', 'https://github.com/bartolli/claude-code-typescript-hooks', 'Quality checks for TypeScript projects', ['hook', 'quality'], 'pwa-direct', 'high', ['self-healing']),
  tool('hook-tdd-guard', 'TDD Guard', 'claude-hook', 'https://github.com/nizos/tdd-guard', 'Monitors file operations enforcing TDD principles', ['hook', 'tdd'], 'pwa-direct', 'high', ['self-healing']),
  tool('hook-claudio', 'Claudio', 'claude-hook', 'https://github.com/ctoth/claudio', 'Adds OS-native sounds via hooks for events', ['hook', 'audio'], 'native-only', 'low', ['ux']),
  tool('hook-dippy', 'Dippy', 'claude-hook', 'https://github.com/ldayton/Dippy', 'Auto-approve safe commands using AST-based parsing', ['hook', 'security'], 'pwa-direct', 'medium', ['autonomy', 'security']),
  tool('hook-parry', 'Parry', 'claude-hook', 'https://github.com/vaporif/parry', 'Prompt injection scanner for hooks', ['hook', 'security'], 'pwa-direct', 'high', ['security']),
  tool('hook-plannotator', 'Plannotator', 'claude-hook', 'https://github.com/backnotprop/plannotator', 'Interactive plan review UI via hooks', ['hook', 'planning'], 'pwa-direct', 'medium', ['reasoning']),
  tool('hook-claude-hooks-johnlindquist', 'claude-hooks (TS)', 'claude-hook', 'https://github.com/johnlindquist/claude-hooks', 'TypeScript system for configuring hooks', ['hook', 'sdk'], 'pwa-direct', 'medium', ['autonomy']),

  /* ============================================================
   * 18. CLAUDE CODE COMMANDS / SLASH-COMMANDS
   * ============================================================ */
  tool('cmd-commit', '/commit', 'claude-command', 'https://github.com/evmts/tevm-monorepo', 'Conventional commits with appropriate emojis', ['command', 'git'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-commit-fast', '/commit-fast', 'claude-command', 'https://github.com/steadycursor/steadystart', 'Automates git commit with consistent formatting', ['command', 'git'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-create-pr', '/create-pr', 'claude-command', 'https://github.com/toyamarinyon/giselle', 'Streamlines PR creation workflow', ['command', 'git'], 'pwa-direct', 'medium', ['autonomy']),
  tool('cmd-fix-issue', '/fix-issue', 'claude-command', 'https://github.com/metabase/metabase', 'Addresses GitHub issues with proper testing', ['command', 'git'], 'pwa-direct', 'medium', ['autonomy', 'self-healing']),
  tool('cmd-pr-review', '/pr-review', 'claude-command', 'https://github.com/hesreallyhim/awesome-claude-code', 'Reviews PR changes for feedback', ['command', 'git'], 'pwa-direct', 'medium', ['autonomy']),
  tool('cmd-context-prime', '/context-prime', 'claude-command', 'https://github.com/elizaOS/elizaos.github.io', 'Primes with comprehensive project understanding', ['command', 'context'], 'pwa-direct', 'high', ['reasoning']),
  tool('cmd-tdd', '/tdd', 'claude-command', 'https://github.com/zscott/pane', 'Guides Test-Driven Development discipline', ['command', 'tdd'], 'pwa-direct', 'high', ['self-healing']),
  tool('cmd-tdd-implement', '/tdd-implement', 'claude-command', 'https://github.com/jerseycheese/Narraitor', 'Implements TDD with red-green-refactor cycle', ['command', 'tdd'], 'pwa-direct', 'high', ['self-healing']),
  tool('cmd-create-prp', '/create-prp', 'claude-command', 'https://github.com/Wirasm/claudecode-utils', 'Creates product requirement plans', ['command', 'planning'], 'pwa-direct', 'medium', ['reasoning']),
  tool('cmd-prd-generator', '/prd-generator', 'claude-command', 'https://github.com/dredozubov/prd-generator', 'Generates comprehensive Product Requirements', ['command', 'planning'], 'pwa-direct', 'medium', ['reasoning']),
  tool('cmd-todo', '/todo', 'claude-command', 'https://github.com/chrisleyva/todo-slash-command', 'Manages project todo items', ['command', 'pm'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-mermaid', '/mermaid', 'claude-command', 'https://github.com/GaloyMoney/lana-bank', 'Generates Mermaid diagrams from SQL', ['command', 'docs'], 'pwa-direct', 'low', ['capability']),
  tool('cmd-create-docs', '/create-docs', 'claude-command', 'https://github.com/jerseycheese/Narraitor', 'Creates comprehensive code documentation', ['command', 'docs'], 'pwa-direct', 'low', ['capability']),
  tool('cmd-update-docs', '/update-docs', 'claude-command', 'https://github.com/Consiliency/Flutter-Structurizr', 'Updates documentation maintaining consistency', ['command', 'docs'], 'pwa-direct', 'low', ['capability']),
  tool('cmd-release', '/release', 'claude-command', 'https://github.com/kelp/webdown', 'Manages releases updating changelogs', ['command', 'deploy'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-run-ci', '/run-ci', 'claude-command', 'https://github.com/hackdays-io/toban-contribution-viewer', 'Activates environments running CI scripts', ['command', 'ci'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-run-pre-commit', '/run-pre-commit', 'claude-command', 'https://github.com/wmjones/wyatt-personal-aws', 'Runs pre-commit checks with error handling', ['command', 'ci'], 'pwa-direct', 'low', ['self-healing']),
  tool('cmd-five', '/five', 'claude-command', 'https://github.com/TuckerTucker/tkr-portfolio', 'Applies five whys methodology for analysis', ['command', 'analysis'], 'pwa-direct', 'low', ['reasoning']),
  tool('cmd-create-command', '/create-command', 'claude-command', 'https://github.com/scopecraft/command', 'Guides creating custom commands with structure', ['command', 'meta'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-create-hook', '/create-hook', 'claude-command', 'https://github.com/omril321/automated-notebooklm', 'Intelligent hook creation command', ['command', 'meta'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-husky', '/husky', 'claude-command', 'https://github.com/evmts/tevm-monorepo', 'Sets up and manages Husky Git hooks', ['command', 'git'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-create-worktrees', '/create-worktrees', 'claude-command', 'https://github.com/evmts/tevm-monorepo', 'Creates git worktrees for open PRs', ['command', 'git'], 'pwa-direct', 'low', ['autonomy']),
  tool('cmd-update-branch-name', '/update-branch-name', 'claude-command', 'https://github.com/giselles-ai/giselle', 'Updates branch names with proper prefixes', ['command', 'git'], 'pwa-direct', 'low', ['autonomy']),

  /* ============================================================
   * 19. CLAUDE CODE SUBAGENT ORCHESTRATORS
   * ============================================================ */
  tool('orch-auto-claude', 'Auto-Claude', 'claude-subagent-orchestrator', 'https://github.com/AndyMik90/Auto-Claude', 'Autonomous multi-agent framework with kanban UI', ['orchestrator', 'multi-agent'], 'pwa-direct', 'high', ['autonomy']),
  tool('orch-cc-flow', 'Claude Code Flow', 'claude-subagent-orchestrator', 'https://github.com/ruvnet/claude-code-flow', 'Code-first orchestration layer enabling autonomy', ['orchestrator'], 'pwa-direct', 'high', ['autonomy']),
  tool('orch-claude-squad', 'Claude Squad', 'claude-subagent-orchestrator', 'https://github.com/smtg-ai/claude-squad', 'Terminal app managing multiple agents in workspaces', ['orchestrator'], 'native-only', 'medium', ['autonomy']),
  tool('orch-claude-swarm', 'Claude Swarm', 'claude-subagent-orchestrator', 'https://github.com/parruda/claude-swarm', 'Launch session connected to swarm of agents', ['orchestrator'], 'native-only', 'medium', ['autonomy']),
  tool('orch-task-master', 'Claude Task Master', 'claude-subagent-orchestrator', 'https://github.com/eyaltoledano/claude-task-master', 'Task management system for AI-driven development', ['orchestrator', 'pm'], 'pwa-direct', 'high', ['autonomy']),
  tool('orch-task-runner', 'Claude Task Runner', 'claude-subagent-orchestrator', 'https://github.com/grahama1970/claude-task-runner', 'Tool managing context isolation and task execution', ['orchestrator'], 'pwa-direct', 'medium', ['autonomy', 'memory']),
  tool('orch-happy-coder', 'Happy Coder', 'claude-subagent-orchestrator', 'https://github.com/slopus/happy', 'Spawn and control multiple Claude instances from phone', ['orchestrator', 'mobile'], 'pwa-direct', 'medium', ['autonomy', 'ux']),
  tool('orch-ruflo', 'Ruflo', 'claude-subagent-orchestrator', 'https://github.com/ruvnet/ruflo', 'Engineering for multi-agent swarms', ['orchestrator', 'multi-agent'], 'pwa-direct', 'high', ['autonomy']),
  tool('orch-sudocode', 'sudocode', 'claude-subagent-orchestrator', 'https://github.com/sudocode-ai/sudocode', 'Lightweight orchestration tool living in your repo', ['orchestrator'], 'pwa-direct', 'medium', ['autonomy']),
  tool('orch-the-startup', 'The Agentic Startup', 'claude-subagent-orchestrator', 'https://github.com/rsmdt/the-startup', 'Comprehensive collection for shipping production code', ['orchestrator'], 'pwa-direct', 'high', ['autonomy']),
  tool('orch-tsk', 'TSK Task Manager', 'claude-subagent-orchestrator', 'https://github.com/dtormoen/tsk', 'Rust CLI delegating tasks to sandboxed Docker agents', ['orchestrator', 'sandbox'], 'native-only', 'medium', ['security', 'autonomy']),

  /* ============================================================
   * 20. CLAUDE CODE STATUS LINES & TOOLING CLI
   * ============================================================ */
  tool('cli-cc-templates', 'Claude Code Templates', 'tooling-cli', 'https://github.com/davila7/claude-code-templates', 'Polished UI and analytics templates collection', ['tooling', 'templates'], 'native-only', 'medium', ['ux']),
  tool('cli-claude-composer', 'Claude Composer', 'tooling-cli', 'https://github.com/possibilities/claude-composer', 'Tool adding small enhancements to Claude Code', ['tooling'], 'native-only', 'low', ['ux']),
  tool('cli-claudekit', 'claudekit', 'tooling-cli', 'https://github.com/carlrannaberg/claudekit', 'CLI toolkit with auto-save and specialized subagents', ['tooling'], 'native-only', 'medium', ['autonomy', 'memory']),
  tool('cli-superclaude', 'SuperClaude Framework', 'tooling-cli', 'https://github.com/SuperClaude-Org/SuperClaude_Framework', 'Configuration framework with commands and personas', ['tooling', 'config'], 'pwa-direct', 'high', ['autonomy']),
  tool('cli-context-kit', 'ContextKit', 'tooling-cli', 'https://github.com/FlineDev/ContextKit', 'Systematic framework with 4-phase planning methodology', ['tooling', 'context'], 'native-only', 'medium', ['reasoning']),
  tool('cli-rulesync', 'Rulesync', 'tooling-cli', 'https://github.com/dyoshikawa/rulesync', 'CLI automatically generating configs for AI agents', ['tooling', 'config'], 'native-only', 'medium', ['autonomy']),
  tool('cli-recall', 'recall', 'tooling-cli', 'https://github.com/zippoxer/recall', 'Full-text search sessions with interactive terminal', ['tooling', 'search'], 'native-only', 'medium', ['memory']),
  tool('cli-cc-history', 'cchistory', 'tooling-cli', 'https://github.com/eckardt/cchistory', 'Like shell history but for Claude Code sessions', ['tooling', 'history'], 'native-only', 'low', ['memory']),
  tool('cli-cclogviewer', 'cclogviewer', 'tooling-cli', 'https://github.com/Brads3290/cclogviewer', 'Utility for viewing conversation files in HTML', ['tooling', 'observability'], 'native-only', 'low', ['observability']),
  tool('cli-vibe-log', 'Vibe-Log', 'tooling-cli', 'https://github.com/vibe-log/vibe-log-cli', 'Analyzes prompts providing session analysis and reports', ['tooling', 'analytics'], 'native-only', 'medium', ['observability']),
  tool('cli-voicemode-mcp', 'VoiceMode MCP', 'tooling-cli', 'https://github.com/mbailey/voicemode', 'Natural conversations with voice service support', ['tooling', 'voice'], 'native-only', 'medium', ['ux']),
  tool('cli-stt-mcp-linux', 'stt-mcp-server-linux', 'tooling-cli', 'https://github.com/marcindulak/stt-mcp-server-linux', 'Push-to-talk speech transcription MCP server', ['tooling', 'voice'], 'native-only', 'low', ['ux']),

  tool('status-cometix', 'CCometixLine', 'status-line', 'https://github.com/Haleclipse/CCometixLine', 'High-performance Rust statusline with Git integration', ['status'], 'native-only', 'low', ['ux']),
  tool('status-ccstatusline', 'ccstatusline', 'status-line', 'https://www.npmjs.com/package/ccstatusline', 'Customizable status line displaying model and token info', ['status'], 'native-only', 'low', ['ux']),
  tool('status-claude-hud', 'Claude HUD', 'status-line', 'https://github.com/jarrodwatts/claude-hud', 'Stacked status line exposing comprehensive metrics', ['status'], 'native-only', 'low', ['observability']),
  tool('status-cc-statusline', 'claude-code-statusline', 'status-line', 'https://github.com/rz1989s/claude-code-statusline', 'Enhanced 4-line statusline with themes and cost tracking', ['status'], 'native-only', 'low', ['observability']),
  tool('status-claude-pace', 'claude-pace', 'status-line', 'https://github.com/Astro-Han/claude-pace', 'Lightweight Bash statusline showing rate limit pace', ['status'], 'native-only', 'low', ['observability']),
  tool('status-powerline', 'claude-powerline', 'status-line', 'https://github.com/Owloops/claude-powerline', 'Vim-style powerline with real-time usage tracking', ['status'], 'native-only', 'low', ['observability']),

  /* ============================================================
   * 21. AI AGENT FRAMEWORKS (open source)
   * https://github.com/e2b-dev/awesome-ai-agents
   * ============================================================ */
  tool('framework-langgraph', 'LangGraph', 'agent-framework', 'https://github.com/langchain-ai/langgraph', 'Production-grade graph-based stateful agent framework', ['framework', 'multi-agent', 'production'], 'node-required', 'high', ['autonomy', 'reasoning'], 12000),
  tool('framework-langchain', 'LangChain', 'agent-framework', 'https://github.com/langchain-ai/langchain', 'Composable framework for building LLM apps', ['framework', 'composable'], 'node-required', 'high', ['capability'], 95000),
  tool('framework-autogen', 'AutoGen (AG2)', 'agent-framework', 'https://github.com/microsoft/autogen', 'Microsoft conversational multi-agent framework', ['framework', 'multi-agent'], 'node-required', 'high', ['autonomy', 'reasoning'], 35000),
  tool('framework-crewai', 'CrewAI', 'agent-framework', 'https://github.com/joaomdmoura/crewai', 'Role-based multi-agent orchestration framework', ['framework', 'multi-agent'], 'node-required', 'high', ['autonomy'], 28000),
  tool('framework-openai-agents-sdk', 'OpenAI Agents SDK', 'agent-framework', 'https://github.com/openai/openai-agents-python', 'Production-grade agent SDK with handoffs', ['framework', 'official'], 'node-required', 'high', ['autonomy']),
  tool('framework-pydantic-ai', 'Pydantic-AI', 'agent-framework', 'https://github.com/pydantic/pydantic-ai', 'Type-safe agent framework with Pydantic validation', ['framework', 'typed'], 'node-required', 'high', ['reasoning']),
  tool('framework-phidata', 'Phidata', 'agent-framework', 'https://github.com/phidatahq/phidata', 'Build agents with memory, knowledge, tools', ['framework'], 'node-required', 'medium', ['memory', 'capability']),
  tool('framework-smolagents', 'Smolagents', 'agent-framework', 'https://github.com/huggingface/smolagents', 'Hugging Face minimal agent framework with code execution', ['framework', 'minimal'], 'node-required', 'medium', ['autonomy']),
  tool('framework-dspy', 'DSPy', 'agent-framework', 'https://github.com/stanfordnlp/dspy', 'Stanford framework for programming foundation models', ['framework', 'optimization'], 'node-required', 'high', ['reasoning', 'performance']),
  tool('framework-google-adk', 'Google ADK', 'agent-framework', 'https://github.com/google/adk-python', 'Google Agent Development Kit (Vertex AI)', ['framework', 'official', 'cloud'], 'cloudflare-worker', 'medium', ['autonomy']),
  tool('framework-anthropic-sdk', 'Anthropic Agent SDK', 'agent-framework', 'https://github.com/anthropics/anthropic-sdk-python', 'Official Anthropic SDK with tool use + streaming', ['framework', 'official'], 'pwa-direct', 'high', ['autonomy']),
  tool('framework-autogpt', 'AutoGPT', 'agent-framework', 'https://github.com/Significant-Gravitas/AutoGPT', 'Autonomous GPT-4 agent platform', ['framework', 'autonomous'], 'node-required', 'medium', ['autonomy'], 167000),
  tool('framework-babyagi', 'BabyAGI', 'agent-framework', 'https://github.com/yoheinakajima/babyagi', 'Pared-down task-driven autonomous agent', ['framework', 'minimal'], 'node-required', 'low', ['autonomy']),
  tool('framework-metagpt', 'MetaGPT', 'agent-framework', 'https://github.com/geekan/MetaGPT', 'Multi-agent system PRD/design/code from one line', ['framework', 'multi-agent'], 'node-required', 'medium', ['reasoning']),
  tool('framework-langroid', 'Langroid', 'agent-framework', 'https://github.com/langroid/langroid', 'Lightweight Python multi-agent framework', ['framework'], 'node-required', 'medium', ['autonomy']),
  tool('framework-chatdev', 'ChatDev', 'agent-framework', 'https://github.com/OpenBMB/ChatDev', 'Virtual software company with role-based agents', ['framework', 'multi-agent'], 'node-required', 'low', ['autonomy']),
  tool('framework-camel', 'CAMEL', 'agent-framework', 'https://github.com/camel-ai/camel', 'Library studying autonomous agents via role-playing', ['framework', 'multi-agent'], 'node-required', 'medium', ['autonomy']),
  tool('framework-aiwaves-agents', 'aiwaves Agents', 'agent-framework', 'https://github.com/aiwaves-cn/agents', 'Framework for agents with memory + tools + multi-agent comms', ['framework'], 'node-required', 'medium', ['memory']),
  tool('framework-agentforge', 'AgentForge', 'agent-framework', 'https://github.com/DataBassGit/AgentForge', 'Low-code framework with multi-LLM support', ['framework', 'low-code'], 'node-required', 'medium', ['capability']),
  tool('framework-evo-ninja', 'evo.ninja', 'agent-framework', 'https://github.com/polywrap/evo.ninja', 'Adaptive persona AI agent', ['framework'], 'node-required', 'medium', ['autonomy']),
  tool('framework-openagents', 'OpenAgents', 'agent-framework', 'https://github.com/xlang-ai/OpenAgents', 'Open ChatGPT Plus replicate platform', ['framework'], 'node-required', 'medium', ['capability']),
  tool('framework-gptswarm', 'GPTSwarm', 'agent-framework', 'https://gptswarm.org', 'Graph-based agent framework with self-improvement', ['framework', 'self-improving'], 'node-required', 'high', ['self-healing', 'autonomy']),
  tool('framework-flowise', 'Flowise', 'agent-framework', 'https://flowiseai.com', 'Low-code agent builder for LLM workflows', ['framework', 'low-code'], 'node-required', 'medium', ['ux']),
  tool('framework-llmstack', 'LLMStack', 'agent-framework', 'https://llmstack.ai', 'No-code platform for LLM agents', ['framework', 'no-code'], 'node-required', 'medium', ['ux']),
  tool('framework-eidolon', 'Eidolon', 'agent-framework', 'https://eidolonai.com', 'Open-source SDK for AI agents with pluggable components', ['framework', 'sdk'], 'node-required', 'medium', ['capability']),
  tool('framework-ix', 'IX', 'agent-framework', 'https://github.com/kreneskyp/ix', 'Visual platform for collaborative agents', ['framework', 'visual'], 'node-required', 'medium', ['ux']),
  tool('framework-magick', 'Magick ML', 'agent-framework', 'https://www.magickml.com', 'AIDE for creating, deploying, scaling agents', ['framework', 'visual'], 'node-required', 'medium', ['ux']),
  tool('framework-fastagency', 'FastAgency', 'agent-framework', 'https://fastagency.ai', 'Multi-agent prototype-to-production framework', ['framework'], 'node-required', 'medium', ['autonomy']),

  /* === Code agents / dev assistants === */
  tool('code-aider', 'Aider', 'agent-framework', 'https://github.com/paul-gauthier/aider', 'CLI tool pairing GPT models with code editing in git repos', ['code', 'cli'], 'node-required', 'high', ['autonomy'], 22000),
  tool('code-continue', 'Continue', 'agent-framework', 'https://continue.dev', 'Open-source autopilot for software development in VS Code', ['code', 'ide'], 'node-required', 'high', ['autonomy', 'ux']),
  tool('code-mentat', 'Mentat', 'agent-framework', 'https://github.com/biobootloader/mentat', 'CLI coding assistant coordinating edits across files', ['code', 'cli'], 'node-required', 'medium', ['autonomy']),
  tool('code-blinky', 'Blinky', 'agent-framework', 'https://github.com/seahyinghang8/blinky', 'VSCode debugging agent for backend errors', ['code', 'debug'], 'node-required', 'medium', ['self-healing']),
  tool('code-cody', 'Sourcegraph Cody', 'agent-framework', 'https://docs.sourcegraph.com/cody', 'Code assistant with codebase analysis', ['code', 'enterprise'], 'cloudflare-worker', 'medium', ['capability']),
  tool('code-bloop', 'Bloop', 'agent-framework', 'https://bloop.ai', 'GPT-4 powered semantic code search engine', ['code', 'search'], 'cloudflare-worker', 'medium', ['capability']),
  tool('code-clippy', 'Clippy', 'agent-framework', 'https://github.com/ennucore/clippy', 'Agent planning, writing, debugging, testing code', ['code', 'autonomous'], 'node-required', 'medium', ['autonomy']),
  tool('code-friday', 'Friday', 'agent-framework', 'https://github.com/amirrezasalimi/friday', 'AI developer assistant building Node.js projects', ['code'], 'node-required', 'low', ['autonomy']),
  tool('code-genia', 'GeniA', 'agent-framework', 'https://github.com/genia-dev/GeniA', 'Engineering platform AI team member', ['code'], 'node-required', 'medium', ['autonomy']),
  tool('code-devika', 'Devika', 'agent-framework', 'https://github.com/stitionai/devika', 'Agentic AI software engineer', ['code', 'autonomous'], 'node-required', 'medium', ['autonomy']),
  tool('code-gpt-engineer', 'GPT Engineer', 'agent-framework', 'https://gptengineer.app', 'AI agent generating entire codebases from prompts', ['code'], 'cloudflare-worker', 'medium', ['autonomy']),
  tool('code-gpt-pilot', 'GPT Pilot', 'agent-framework', 'https://github.com/Pythagora-io/gpt-pilot', 'Dev tool writing scalable applications', ['code'], 'node-required', 'medium', ['autonomy']),
  tool('code-open-interpreter', 'Open Interpreter', 'agent-framework', 'https://openinterpreter.com', 'Code interpreter executing code for tasks', ['code', 'cli'], 'node-required', 'high', ['capability', 'autonomy'], 53000),

  /* === Memory / RAG === */
  tool('memory-memgpt', 'MemGPT', 'agent-framework', 'https://github.com/cpacker/MemGPT', 'Memory management providing extended context', ['memory', 'rag'], 'node-required', 'high', ['memory']),
  tool('memory-bambooai', 'BambooAI', 'agent-framework', 'https://github.com/pgalko/BambooAI', 'Data exploration and analysis for non-programmers', ['data-analysis'], 'node-required', 'low', ['capability']),
  tool('memory-localgpt', 'LocalGPT', 'agent-framework', 'https://github.com/PromtEngineer/localGPT', 'Privacy-focused chatbot with local documents', ['rag', 'privacy'], 'node-required', 'medium', ['security', 'memory']),
  tool('memory-privategpt', 'PrivateGPT', 'agent-framework', 'https://www.privategpt.io', 'Tool for private document interaction', ['rag', 'privacy'], 'node-required', 'medium', ['security']),

  /* === Research === */
  tool('research-gpt-researcher', 'GPT Researcher', 'agent-framework', 'https://github.com/assafelovic/gpt-researcher', 'Autonomous internet research agent', ['research'], 'node-required', 'high', ['autonomy', 'capability']),
  tool('research-chemcrow', 'ChemCrow', 'agent-framework', 'https://github.com/ur-whitelab/chemcrow-public', 'LangChain agent for chemistry tasks', ['research', 'chemistry'], 'node-required', 'low', ['capability']),
  tool('research-data-to-paper', 'data-to-paper', 'agent-framework', 'https://github.com/Technion-Kishony-lab/data-to-paper', 'Generate research papers from raw data', ['research'], 'node-required', 'low', ['capability']),

  /* ============================================================
   * 22. BROWSER PWA CAPABILITIES (Project Fugu / Web platform 2026)
   * https://developer.chrome.com/docs/capabilities
   * ============================================================ */
  tool('pwa-webusb', 'WebUSB API', 'pwa-capability', 'https://web.dev/usb', 'Direct USB device access from web', ['hardware', 'usb'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-webhid', 'WebHID API', 'pwa-capability', 'https://web.dev/hid', 'Access alternative auxiliary keyboards / gamepads', ['hardware', 'input'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-webserial', 'Web Serial API', 'pwa-capability', 'https://web.dev/serial', 'Serial device communication from web', ['hardware', 'iot'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-webbluetooth', 'Web Bluetooth API', 'pwa-capability', 'https://web.dev/bluetooth', 'Communicate with Bluetooth Low Energy devices', ['hardware', 'bluetooth'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-webnfc', 'Web NFC (NDEFReader)', 'pwa-capability', 'https://web.dev/nfc', 'Read and write NFC tags from web', ['hardware', 'nfc'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-barcode-detector', 'BarcodeDetector API', 'pwa-capability', 'https://web.dev/shape-detection', 'Native QR / barcode detection in browser', ['vision', 'barcode'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-face-detector', 'FaceDetector API', 'pwa-capability', 'https://web.dev/shape-detection', 'Native face detection (Shape Detection API)', ['vision'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-text-detector', 'TextDetector API', 'pwa-capability', 'https://web.dev/shape-detection', 'Native OCR text detection (Chrome only)', ['vision', 'ocr'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-filesystem-access', 'File System Access API', 'pwa-capability', 'https://web.dev/file-system-access', 'Read/write local files (showOpenFilePicker)', ['filesystem'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-wake-lock', 'Wake Lock API', 'pwa-capability', 'https://web.dev/wake-lock', 'Prevent device sleep during active tasks', ['power'], 'pwa-direct', 'medium', ['ux']),
  tool('pwa-contacts', 'Contacts API', 'pwa-capability', 'https://web.dev/contact-picker', 'Pick contacts from device address book', ['productivity'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-geolocation', 'Geolocation API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API', 'GPS / network-based location', ['location'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-share', 'Web Share API', 'pwa-capability', 'https://web.dev/web-share', 'Native share sheet integration', ['ux'], 'pwa-direct', 'high', ['ux']),
  tool('pwa-share-target', 'Web Share Target API', 'pwa-capability', 'https://web.dev/web-share-target', 'Receive shared content from other apps', ['ux'], 'pwa-direct', 'medium', ['ux', 'capability']),
  tool('pwa-payment-request', 'Payment Request API', 'pwa-capability', 'https://web.dev/how-payment-request-api-works', 'Native payment sheets (Apple Pay, Google Pay)', ['payments'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-credentials', 'Credentials Management API', 'pwa-capability', 'https://web.dev/credential-management-api', 'Auto-fill credentials securely', ['auth'], 'pwa-direct', 'medium', ['security', 'ux']),
  tool('pwa-webauthn', 'Web Authentication (WebAuthn)', 'pwa-capability', 'https://webauthn.guide', 'Passwordless auth via FIDO2 / passkeys', ['auth'], 'pwa-direct', 'high', ['security']),
  tool('pwa-background-sync', 'Background Sync API', 'pwa-capability', 'https://web.dev/background-sync', 'Defer sync until network available', ['offline'], 'pwa-direct', 'high', ['performance', 'self-healing']),
  tool('pwa-periodic-bg-sync', 'Periodic Background Sync', 'pwa-capability', 'https://web.dev/periodic-background-sync', 'Periodic offline sync when device idle', ['offline'], 'pwa-direct', 'medium', ['performance']),
  tool('pwa-push-notifications', 'Push API + Notification API', 'pwa-capability', 'https://web.dev/push-notifications', 'Push notifications via service worker', ['notification'], 'pwa-direct', 'high', ['ux', 'capability']),
  tool('pwa-idle-detection', 'Idle Detection API', 'pwa-capability', 'https://web.dev/idle-detection', 'Detect user idle for productivity apps', ['productivity'], 'pwa-direct', 'low', ['ux']),
  tool('pwa-screen-wake-lock', 'Screen Wake Lock', 'pwa-capability', 'https://web.dev/wake-lock', 'Keep screen on during specific tasks', ['power'], 'pwa-direct', 'low', ['ux']),
  tool('pwa-launch-handler', 'Launch Handler API', 'pwa-capability', 'https://web.dev/launch-handler', 'Control PWA launch focus / new window', ['ux'], 'pwa-direct', 'medium', ['ux']),
  tool('pwa-window-controls-overlay', 'Window Controls Overlay', 'pwa-capability', 'https://web.dev/window-controls-overlay', 'Custom title bar in standalone PWA', ['ux'], 'pwa-direct', 'low', ['ux']),
  tool('pwa-eyedropper', 'EyeDropper API', 'pwa-capability', 'https://web.dev/eyedropper', 'Native color picker from screen', ['ux', 'design'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-getusermedia', 'getUserMedia (Camera/Mic)', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia', 'Camera + microphone access', ['hardware', 'media'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-screen-capture', 'Screen Capture API', 'pwa-capability', 'https://web.dev/getdisplaymedia', 'Screen sharing / recording', ['media'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-mediarecorder', 'MediaRecorder API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder', 'Record audio/video streams', ['media'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-speechrecognition', 'SpeechRecognition API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition', 'Native speech-to-text (browser)', ['voice', 'stt'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-speechsynthesis', 'SpeechSynthesis API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis', 'Native text-to-speech (browser)', ['voice', 'tts'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-webcrypto', 'Web Crypto API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API', 'Native crypto (AES-GCM, RSA, ECDSA)', ['crypto', 'security'], 'pwa-direct', 'high', ['security', 'performance']),
  tool('pwa-indexeddb', 'IndexedDB', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API', 'Large structured offline storage', ['storage'], 'pwa-direct', 'high', ['memory', 'performance']),
  tool('pwa-cache-storage', 'CacheStorage API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage', 'Service Worker cache storage', ['storage', 'offline'], 'pwa-direct', 'high', ['performance']),
  tool('pwa-storage-quota', 'StorageManager (estimate)', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager', 'Quota estimation + persistent storage', ['storage'], 'pwa-direct', 'medium', ['observability']),
  tool('pwa-webgl', 'WebGL / WebGL2', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API', 'Hardware-accelerated 3D graphics', ['graphics'], 'pwa-direct', 'medium', ['performance']),
  tool('pwa-webgpu', 'WebGPU API', 'pwa-capability', 'https://developer.chrome.com/blog/webgpu-cross-platform', 'Modern GPU access (compute + graphics)', ['graphics', 'ml'], 'pwa-direct', 'high', ['performance', 'capability']),
  tool('pwa-webcodecs', 'WebCodecs API', 'pwa-capability', 'https://developer.chrome.com/articles/webcodecs', 'Low-level video / audio codec access', ['media'], 'pwa-direct', 'high', ['performance']),
  tool('pwa-webtransport', 'WebTransport API', 'pwa-capability', 'https://developer.chrome.com/articles/webtransport', 'Modern HTTP/3-based bidirectional transport', ['network'], 'pwa-direct', 'medium', ['performance']),
  tool('pwa-webrtc', 'WebRTC', 'pwa-capability', 'https://webrtc.org', 'Real-time peer-to-peer audio/video/data', ['network', 'media'], 'pwa-direct', 'high', ['capability']),
  tool('pwa-broadcast-channel', 'BroadcastChannel API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel', 'Cross-tab messaging', ['ipc'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-shared-worker', 'SharedWorker', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker', 'Background worker shared across tabs', ['workers'], 'pwa-direct', 'medium', ['performance']),
  tool('pwa-service-worker', 'Service Worker API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API', 'Offline + push + background sync', ['offline'], 'pwa-direct', 'high', ['performance', 'self-healing']),
  tool('pwa-presentation', 'Presentation API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Presentation_API', 'Cast content to second screen / Chromecast', ['media'], 'pwa-direct', 'low', ['ux']),
  tool('pwa-clipboard', 'Clipboard API (async)', 'pwa-capability', 'https://web.dev/async-clipboard', 'Modern async clipboard read/write', ['ux'], 'pwa-direct', 'high', ['ux']),
  tool('pwa-notification-triggers', 'Notification Triggers', 'pwa-capability', 'https://web.dev/notification-triggers', 'Schedule notifications offline', ['notification'], 'pwa-direct', 'medium', ['ux']),
  tool('pwa-handle-protocol', 'Protocol Handlers', 'pwa-capability', 'https://web.dev/url-protocol-handler', 'Register PWA as protocol handler (mailto, etc.)', ['ux'], 'pwa-direct', 'low', ['ux']),
  tool('pwa-file-handlers', 'File Handlers', 'pwa-capability', 'https://developer.chrome.com/articles/file-handling', 'Open file types directly in PWA', ['ux'], 'pwa-direct', 'medium', ['ux', 'capability']),
  tool('pwa-storage-foundation', 'Storage Foundation API', 'pwa-capability', 'https://web.dev/storage-foundation', 'Low-level FS for SQLite/databases in browser', ['storage'], 'pwa-direct', 'medium', ['performance']),
  tool('pwa-permissions', 'Permissions API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API', 'Query/observe permission states', ['security', 'ux'], 'pwa-direct', 'medium', ['security', 'ux']),
  tool('pwa-credential-key-pair', 'CredentialContainer.create', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/CredentialsContainer/create', 'Programmatic credential management', ['auth'], 'pwa-direct', 'medium', ['security']),
  tool('pwa-resize-observer', 'ResizeObserver', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver', 'Watch element size changes', ['ux'], 'pwa-direct', 'medium', ['performance']),
  tool('pwa-intersection-observer', 'IntersectionObserver', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver', 'Lazy-load images, infinite scroll', ['performance'], 'pwa-direct', 'high', ['performance']),
  tool('pwa-performance-observer', 'PerformanceObserver', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver', 'Web Vitals + perf metrics', ['observability'], 'pwa-direct', 'high', ['observability', 'performance']),
  tool('pwa-mutation-observer', 'MutationObserver', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver', 'Watch DOM tree mutations', ['ux'], 'pwa-direct', 'medium', ['observability']),
  tool('pwa-gamepad', 'Gamepad API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API', 'Game controller input', ['hardware'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-vibration', 'Vibration API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API', 'Haptic feedback on mobile', ['hardware', 'ux'], 'pwa-direct', 'low', ['ux']),
  tool('pwa-battery', 'Battery Status API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API', 'Read battery level + charging state', ['power'], 'pwa-direct', 'low', ['observability']),
  tool('pwa-network-info', 'Network Information API', 'pwa-capability', 'https://web.dev/network-information', 'Connection type + downlink', ['network'], 'pwa-direct', 'medium', ['observability', 'performance']),
  tool('pwa-device-memory', 'Device Memory API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Device_Memory_API', 'Read approximate device RAM', ['performance'], 'pwa-direct', 'low', ['observability']),
  tool('pwa-device-orientation', 'DeviceOrientation API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientation_API', 'Read accelerometer + gyro', ['hardware'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-ambient-light', 'AmbientLightSensor', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/AmbientLightSensor', 'Read ambient light level', ['hardware'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-magnetometer', 'Magnetometer API', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/Magnetometer', 'Read magnetic field for compass apps', ['hardware'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-gravity-sensor', 'GravitySensor', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/GravitySensor', 'Gravity vector component reading', ['hardware'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-linear-acceleration', 'LinearAccelerationSensor', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/LinearAccelerationSensor', 'Linear acceleration without gravity', ['hardware'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-relative-orientation', 'RelativeOrientationSensor', 'pwa-capability', 'https://developer.mozilla.org/en-US/docs/Web/API/RelativeOrientationSensor', 'Relative orientation for AR/VR', ['hardware', 'xr'], 'pwa-direct', 'low', ['capability']),
  tool('pwa-webxr', 'WebXR Device API', 'pwa-capability', 'https://immersiveweb.dev', 'AR / VR sessions in browser', ['xr'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-payment-handler', 'Payment Handler API', 'pwa-capability', 'https://web.dev/payment-handler', 'Build payment apps as PWA', ['payments'], 'pwa-direct', 'medium', ['capability']),
  tool('pwa-content-index', 'Content Index API', 'pwa-capability', 'https://web.dev/content-indexing-api', 'Index offline content for chrome download UI', ['offline'], 'pwa-direct', 'low', ['ux']),
  tool('pwa-background-fetch', 'Background Fetch API', 'pwa-capability', 'https://web.dev/background-fetch', 'Resilient large file downloads', ['offline', 'network'], 'pwa-direct', 'medium', ['performance']),

  /* ============================================================
   * 23. WEB TOOLS UTILES (npm libs lazy-CDN)
   * ============================================================ */
  tool('lib-pdf-lib', 'pdf-lib', 'web-tool', 'https://github.com/Hopding/pdf-lib', 'Create / modify PDFs in browser pure-JS', ['pdf', 'lib'], 'pwa-direct', 'high', ['capability']),
  tool('lib-jspdf', 'jsPDF', 'web-tool', 'https://github.com/parallax/jsPDF', 'Generate PDFs client-side', ['pdf', 'lib'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-tesseract', 'Tesseract.js', 'web-tool', 'https://github.com/naptha/tesseract.js', 'OCR in pure JavaScript via WASM', ['ocr', 'vision'], 'pwa-direct', 'high', ['capability']),
  tool('lib-meyda', 'Meyda', 'web-tool', 'https://github.com/meyda/meyda', 'Audio feature extraction (MFCC, etc.)', ['audio', 'voice-print'], 'pwa-direct', 'high', ['capability']),
  tool('lib-pitchy', 'Pitchy', 'web-tool', 'https://github.com/ianprime0509/pitchy', 'Pitch detection (YIN algorithm)', ['audio'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-libsodium', 'libsodium-wrappers', 'web-tool', 'https://github.com/jedisct1/libsodium.js', 'Crypto primitives (NaCl) for browser', ['crypto'], 'pwa-direct', 'high', ['security']),
  tool('lib-lz-string', 'lz-string', 'web-tool', 'https://github.com/pieroxy/lz-string', 'Compression for localStorage', ['compression'], 'pwa-direct', 'high', ['performance', 'memory']),
  tool('lib-idb', 'idb', 'web-tool', 'https://github.com/jakearchibald/idb', 'Promise-based IndexedDB wrapper', ['storage'], 'pwa-direct', 'high', ['memory']),
  tool('lib-workbox', 'Workbox', 'web-tool', 'https://github.com/GoogleChrome/workbox', 'Service worker libraries', ['offline', 'pwa'], 'pwa-direct', 'high', ['performance']),
  tool('lib-ulid', 'ulid', 'web-tool', 'https://github.com/ulid/javascript', 'Universally Unique Lexicographically Sortable Identifier', ['utility'], 'pwa-direct', 'low', ['capability']),
  tool('lib-jsqr', 'jsQR', 'web-tool', 'https://github.com/cozmo/jsQR', 'Pure JS QR code reader (fallback)', ['vision', 'barcode'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-qrcode', 'qrcode', 'web-tool', 'https://github.com/soldair/node-qrcode', 'QR code generator', ['utility'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-zxing', 'ZXing-js', 'web-tool', 'https://github.com/zxing-js/library', 'Multi-format barcode (QR, EAN, Code128)', ['vision', 'barcode'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-html2canvas', 'html2canvas', 'web-tool', 'https://github.com/niklasvh/html2canvas', 'Take screenshots of HTML elements', ['screenshot'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-fabric', 'Fabric.js', 'web-tool', 'https://github.com/fabricjs/fabric.js', 'Powerful Canvas image editor', ['canvas', 'image'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-konva', 'Konva.js', 'web-tool', 'https://github.com/konvajs/konva', '2D Canvas framework with stage/layers', ['canvas'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-three', 'Three.js', 'web-tool', 'https://github.com/mrdoob/three.js', '3D graphics library (WebGL)', ['3d', 'graphics'], 'pwa-direct', 'high', ['capability']),
  tool('lib-tensorflow-js', 'TensorFlow.js', 'web-tool', 'https://github.com/tensorflow/tfjs', 'ML in browser via WebGL/WebGPU', ['ml'], 'pwa-direct', 'high', ['capability']),
  tool('lib-onnx-runtime-web', 'ONNX Runtime Web', 'web-tool', 'https://github.com/microsoft/onnxruntime/tree/main/js/web', 'Run ONNX models in browser', ['ml'], 'pwa-direct', 'high', ['capability', 'performance']),
  tool('lib-transformers-js', 'Transformers.js', 'web-tool', 'https://github.com/xenova/transformers.js', 'HuggingFace Transformers in browser', ['ml', 'nlp'], 'pwa-direct', 'high', ['capability', 'reasoning']),
  tool('lib-ffmpeg-wasm', 'FFmpeg.wasm', 'web-tool', 'https://github.com/ffmpegwasm/ffmpeg.wasm', 'FFmpeg compiled to WASM', ['video', 'audio'], 'pwa-direct', 'high', ['capability']),
  tool('lib-mediabunny', 'Mediabunny', 'web-tool', 'https://github.com/Vanilagy/mediabunny', 'Media manipulation in browser (no WASM)', ['video'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-dompurify', 'DOMPurify', 'web-tool', 'https://github.com/cure53/DOMPurify', 'XSS sanitizer for HTML', ['security'], 'pwa-direct', 'high', ['security']),
  tool('lib-marked', 'marked', 'web-tool', 'https://github.com/markedjs/marked', 'Markdown parser', ['utility'], 'pwa-direct', 'high', ['capability']),
  tool('lib-prismjs', 'PrismJS', 'web-tool', 'https://github.com/PrismJS/prism', 'Syntax highlighter', ['utility'], 'pwa-direct', 'medium', ['ux']),
  tool('lib-shiki', 'Shiki', 'web-tool', 'https://github.com/shikijs/shiki', 'Beautiful syntax highlighter (TextMate grammars)', ['utility'], 'pwa-direct', 'medium', ['ux']),
  tool('lib-mermaid', 'Mermaid', 'web-tool', 'https://github.com/mermaid-js/mermaid', 'Diagrams from text', ['docs'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-katex', 'KaTeX', 'web-tool', 'https://github.com/KaTeX/KaTeX', 'Fast math typesetting (LaTeX subset)', ['math'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-mathjs', 'mathjs', 'web-tool', 'https://github.com/josdejong/mathjs', 'Math expressions + units + matrices', ['math'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-decimal-js', 'decimal.js', 'web-tool', 'https://github.com/MikeMcl/decimal.js', 'Arbitrary precision decimal', ['math'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-luxon', 'Luxon', 'web-tool', 'https://github.com/moment/luxon', 'Modern date/time library', ['utility'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-zod', 'Zod', 'web-tool', 'https://github.com/colinhacks/zod', 'TypeScript-first schema validation', ['validation'], 'pwa-direct', 'high', ['security', 'reasoning']),
  tool('lib-valibot', 'Valibot', 'web-tool', 'https://github.com/fabian-hiller/valibot', 'Modular schema validation (smaller than Zod)', ['validation'], 'pwa-direct', 'medium', ['performance']),
  tool('lib-effect-ts', 'Effect TS', 'web-tool', 'https://github.com/Effect-TS/effect', 'Functional error-handling + concurrency', ['utility'], 'pwa-direct', 'medium', ['reasoning']),
  tool('lib-rxjs', 'RxJS', 'web-tool', 'https://github.com/ReactiveX/rxjs', 'Reactive extensions for JavaScript', ['utility'], 'pwa-direct', 'medium', ['capability']),
  tool('lib-comlink', 'Comlink', 'web-tool', 'https://github.com/GoogleChromeLabs/comlink', 'Easy Web Worker postMessage wrapper', ['workers'], 'pwa-direct', 'high', ['performance']),

  /* === Vector / RAG libs === */
  tool('lib-langchain-js', 'LangChain JS', 'web-tool', 'https://github.com/langchain-ai/langchainjs', 'JavaScript LangChain port', ['rag', 'agent'], 'pwa-direct', 'high', ['capability']),
  tool('lib-llamaindex-ts', 'LlamaIndex.TS', 'web-tool', 'https://github.com/run-llama/LlamaIndexTS', 'TypeScript LlamaIndex (RAG)', ['rag'], 'pwa-direct', 'high', ['memory']),

  /* ============================================================
   * 24. GITHUB ACTIONS
   * ============================================================ */
  tool('gha-checkout', 'actions/checkout', 'github-action', 'https://github.com/actions/checkout', 'Checkout repo in workflow', ['ci'], 'cloudflare-worker', 'high', ['autonomy']),
  tool('gha-setup-node', 'actions/setup-node', 'github-action', 'https://github.com/actions/setup-node', 'Setup Node.js in workflow', ['ci'], 'cloudflare-worker', 'medium', ['autonomy']),
  tool('gha-cache', 'actions/cache', 'github-action', 'https://github.com/actions/cache', 'Cache deps for faster CI', ['ci', 'performance'], 'cloudflare-worker', 'high', ['performance']),
  tool('gha-upload-artifact', 'actions/upload-artifact', 'github-action', 'https://github.com/actions/upload-artifact', 'Upload build artifacts', ['ci'], 'cloudflare-worker', 'medium', ['observability']),
  tool('gha-deploy-pages', 'actions/deploy-pages', 'github-action', 'https://github.com/actions/deploy-pages', 'Deploy to GitHub Pages', ['ci', 'deploy'], 'cloudflare-worker', 'high', ['autonomy']),
  tool('gha-codeql', 'github/codeql-action', 'github-action', 'https://github.com/github/codeql-action', 'CodeQL static analysis', ['ci', 'security'], 'cloudflare-worker', 'high', ['security']),
  tool('gha-dependabot', 'dependabot/fetch-metadata', 'github-action', 'https://github.com/dependabot/fetch-metadata', 'Dependabot integration', ['ci', 'security'], 'cloudflare-worker', 'medium', ['security']),
  tool('gha-claude-code', 'anthropics/claude-code-action', 'github-action', 'https://github.com/anthropics/claude-code-action', 'Run Claude Code in CI', ['ci', 'ai'], 'cloudflare-worker', 'high', ['autonomy', 'self-healing']),
  tool('gha-eslint-bot', 'reviewdog/action-eslint', 'github-action', 'https://github.com/reviewdog/action-eslint', 'ESLint review bot via reviewdog', ['ci', 'lint'], 'cloudflare-worker', 'medium', ['self-healing']),
  tool('gha-prettier-action', 'creyD/prettier_action', 'github-action', 'https://github.com/creyD/prettier_action', 'Auto-format with Prettier', ['ci', 'lint'], 'cloudflare-worker', 'low', ['ux']),
  tool('gha-semgrep-action', 'returntocorp/semgrep-action', 'github-action', 'https://github.com/returntocorp/semgrep-action', 'Semgrep static analysis', ['ci', 'security'], 'cloudflare-worker', 'high', ['security']),
  tool('gha-gitleaks', 'gitleaks/gitleaks-action', 'github-action', 'https://github.com/gitleaks/gitleaks-action', 'Secret scanning', ['ci', 'security'], 'cloudflare-worker', 'high', ['security']),
  tool('gha-renovate', 'renovatebot/github-action', 'github-action', 'https://github.com/renovatebot/github-action', 'Renovate dep updates', ['ci', 'security'], 'cloudflare-worker', 'medium', ['security', 'autonomy']),
  tool('gha-changesets', 'changesets/action', 'github-action', 'https://github.com/changesets/action', 'Changesets release management', ['ci', 'release'], 'cloudflare-worker', 'medium', ['autonomy']),
  tool('gha-lighthouse-ci', 'treosh/lighthouse-ci-action', 'github-action', 'https://github.com/treosh/lighthouse-ci-action', 'Lighthouse perf CI', ['ci', 'performance'], 'cloudflare-worker', 'high', ['performance', 'observability']),
  tool('gha-bundlewatch', 'jackyef/bundlewatch-gh-action', 'github-action', 'https://github.com/jackyef/bundlewatch-gh-action', 'Bundle size budget enforcement', ['ci', 'performance'], 'cloudflare-worker', 'medium', ['performance']),
  tool('gha-coverage-codecov', 'codecov/codecov-action', 'github-action', 'https://github.com/codecov/codecov-action', 'Coverage upload to Codecov', ['ci', 'observability'], 'cloudflare-worker', 'medium', ['observability']),
  tool('gha-playwright-action', 'microsoft/playwright-github-action', 'github-action', 'https://github.com/microsoft/playwright-github-action', 'Run Playwright E2E tests', ['ci', 'e2e'], 'cloudflare-worker', 'high', ['observability']),
  tool('gha-trivy-action', 'aquasecurity/trivy-action', 'github-action', 'https://github.com/aquasecurity/trivy-action', 'Trivy container scan', ['ci', 'security'], 'cloudflare-worker', 'high', ['security']),
  tool('gha-cron-trigger', 'workflow_dispatch / schedule', 'github-action', 'https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows', 'Cron-based workflow trigger', ['ci'], 'cloudflare-worker', 'high', ['autonomy']),
];

/* === Helpers === */

/**
 * Total tool count.
 */
export function countTools(): number {
  return APEX_EXTENDED_CATALOG.length;
}

/**
 * Group catalog by type.
 */
export function groupByType(): Record<ApexExtendedToolType, readonly ApexExtendedTool[]> {
  const groups: Partial<Record<ApexExtendedToolType, ApexExtendedTool[]>> = {};
  for (const t of APEX_EXTENDED_CATALOG) {
    const list = groups[t.type] ?? [];
    list.push(t);
    groups[t.type] = list;
  }
  return groups as Record<ApexExtendedToolType, readonly ApexExtendedTool[]>;
}

/**
 * Group by compatibility.
 */
export function groupByCompatibility(): Record<ApexCompatibility, readonly ApexExtendedTool[]> {
  const groups: Record<ApexCompatibility, ApexExtendedTool[]> = {
    'pwa-direct': [],
    'cloudflare-worker': [],
    'node-required': [],
    'native-only': [],
  };
  for (const t of APEX_EXTENDED_CATALOG) {
    groups[t.apex_compatibility].push(t);
  }
  return groups;
}

/**
 * Filter tools usable in PWA Apex direct (no Node serveur required).
 */
export function getPwaCompatibleTools(): readonly ApexExtendedTool[] {
  return APEX_EXTENDED_CATALOG.filter(
    (t) => t.apex_compatibility === 'pwa-direct' || t.apex_compatibility === 'cloudflare-worker',
  );
}

/**
 * Get tools improving a specific area.
 */
export function getToolsImproving(area: ImprovementArea): readonly ApexExtendedTool[] {
  return APEX_EXTENDED_CATALOG.filter((t) => t.improves.includes(area));
}

/**
 * Filter tools by auto-improvement value.
 */
export function getHighValueTools(): readonly ApexExtendedTool[] {
  return APEX_EXTENDED_CATALOG.filter((t) => t.auto_improvement_value === 'high');
}

/**
 * Search by name / description / category fuzzy (lowercased substring).
 */
export function searchCatalog(query: string): readonly ApexExtendedTool[] {
  if (!query || query.trim().length === 0) return APEX_EXTENDED_CATALOG;
  const q = query.toLowerCase().trim();
  return APEX_EXTENDED_CATALOG.filter((t) => {
    if (t.name.toLowerCase().includes(q)) return true;
    if (t.description.toLowerCase().includes(q)) return true;
    if (t.id.toLowerCase().includes(q)) return true;
    if (t.categories.some((c) => c.toLowerCase().includes(q))) return true;
    return false;
  });
}

/**
 * Get tool by id (strict).
 */
export function getToolById(id: string): ApexExtendedTool | undefined {
  return APEX_EXTENDED_CATALOG.find((t) => t.id === id);
}
