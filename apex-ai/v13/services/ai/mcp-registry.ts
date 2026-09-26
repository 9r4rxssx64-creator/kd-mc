/**
 * APEX v13 — MCP Servers Registry
 *
 * Catalogue des serveurs MCP connus + auto-registration au boot.
 * Stockage : localStorage `ax_mcp_servers` + Firebase FB_FIX shared.
 *
 * Serveurs intégrés par défaut :
 * - BOFiP fiscal (Bulletin Officiel Finances Publiques FR)
 * - Almanac Deep Research (openalmanac.dev)
 * - Legal Data Hunter (18M docs juridiques 110+ pays)
 *
 * Kevin admin peut ajouter d'autres serveurs via vue ?view=mcp-servers.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { mcpClient, type McpServer } from './mcp-client.js';

const STORAGE_KEY = 'ax_mcp_servers';

const DEFAULT_SERVERS: McpServer[] = [
  /* === Juridique / Fiscal === */
  {
    id: 'bofip',
    name: 'BOFiP — Bulletin Officiel Finances Publiques (FR)',
    url: 'https://mcp.openlegi.fr/bofip/mcp',
    tokenKey: 'bofip_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'legifrance',
    name: 'Légifrance — Codes + jurisprudence française (Openlegi.fr)',
    url: 'https://mcp.openlegi.fr/legifrance/mcp',
    tokenKey: 'legifrance_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'legal-hunter',
    name: 'Legal Data Hunter — 18M docs juridiques 110+ pays',
    url: 'https://mcp.openlegi.fr/legal/mcp',
    tokenKey: 'legal_hunter_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Recherche / Deep research === */
  {
    id: 'almanac',
    name: 'Almanac — Deep Research Agent',
    url: 'https://mcp.openalmanac.dev/mcp',
    tokenKey: 'almanac_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'tavily',
    name: 'Tavily — Web Search MCP (real-time)',
    url: 'https://mcp.tavily.com/mcp',
    tokenKey: 'tavily_key',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'brave-search',
    name: 'Brave Search MCP — Privacy-first web search',
    url: 'https://mcp.brave.com/search/mcp',
    tokenKey: 'brave_search_key',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo MCP — Search without tracking',
    url: 'https://mcp.duckduckgo.com/mcp',
    tokenKey: '',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === DevOps / Cloud === */
  {
    id: 'github',
    name: 'GitHub MCP — Issues, PR, repos, gists, code search',
    url: 'https://api.githubcopilot.com/mcp',
    tokenKey: 'github_pat_classic',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare MCP — Workers, DNS, R2, KV, Pages',
    url: 'https://mcp.cloudflare.com/mcp',
    tokenKey: 'cloudflare_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'vercel',
    name: 'Vercel MCP — Deployments, env vars, projects',
    url: 'https://mcp.vercel.com/mcp',
    tokenKey: 'vercel_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'railway',
    name: 'Railway MCP — Hosting, Postgres, Redis services',
    url: 'https://mcp.railway.app/mcp',
    tokenKey: 'railway_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Data / Vector DB / Memory === */
  {
    id: 'pinecone',
    name: 'Pinecone MCP — Vector DB Apex memory',
    url: 'https://mcp.pinecone.io/mcp',
    tokenKey: 'pinecone_key',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'firebase',
    name: 'Firebase MCP — Realtime DB + Auth + Firestore admin',
    url: 'https://mcp.firebase.google.com/mcp',
    tokenKey: 'firebase_service_account',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'supabase',
    name: 'Supabase MCP — Postgres + Auth + Storage',
    url: 'https://mcp.supabase.com/mcp',
    tokenKey: 'supabase_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Productivity / Comms === */
  {
    id: 'notion',
    name: 'Notion MCP — Pages, databases, blocks',
    url: 'https://mcp.notion.com/mcp',
    tokenKey: 'notion_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'slack',
    name: 'Slack MCP — Channels, DM, messages, users',
    url: 'https://mcp.slack.com/mcp',
    tokenKey: 'slack_bot_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'discord',
    name: 'Discord MCP — Servers, channels, messages',
    url: 'https://mcp.discord.com/mcp',
    tokenKey: 'discord_bot_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'telegram',
    name: 'Telegram MCP — Bot messages + groups',
    url: 'https://mcp.telegram.org/mcp',
    tokenKey: 'telegram_bot_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'gmail',
    name: 'Gmail MCP — Read, send, search, drafts',
    url: 'https://mcp.gmail.google.com/mcp',
    tokenKey: 'google_oauth_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'calendar',
    name: 'Google Calendar MCP — Events, schedule, invites',
    url: 'https://mcp.calendar.google.com/mcp',
    tokenKey: 'google_oauth_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Finance / Paiements === */
  {
    id: 'stripe',
    name: 'Stripe MCP — Customers, payments, subscriptions',
    url: 'https://mcp.stripe.com/mcp',
    tokenKey: 'stripe_sk',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'finnhub',
    name: 'Finnhub MCP — Stocks, forex, crypto market data',
    url: 'https://mcp.finnhub.io/mcp',
    tokenKey: 'finnhub_key',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'coingecko',
    name: 'CoinGecko MCP — Crypto prices + market cap',
    url: 'https://mcp.coingecko.com/mcp',
    tokenKey: '',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Monitoring / Observability === */
  {
    id: 'sentry',
    name: 'Sentry MCP — Errors, performance, releases',
    url: 'https://mcp.sentry.io/mcp',
    tokenKey: 'sentry_auth_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Domotique / IoT (anticipation futur) === */
  {
    id: 'home-assistant',
    name: 'Home Assistant MCP — Smart home control',
    url: 'http://homeassistant.local:8123/api/mcp',
    tokenKey: 'home_assistant_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Workflow / Automation === */
  {
    id: 'n8n',
    name: 'n8n MCP — Workflow automation triggers',
    url: 'https://mcp.n8n.io/mcp',
    tokenKey: 'n8n_api_key',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'make',
    name: 'Make.com MCP — Scenario triggers (Integromat)',
    url: 'https://mcp.make.com/mcp',
    tokenKey: 'make_token',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },

  /* === Anticipation futur 2026+ === */
  {
    id: 'apple-shortcuts',
    name: 'Apple Shortcuts MCP — iOS automation (anticipation)',
    url: 'https://mcp.apple.com/shortcuts/mcp',
    tokenKey: '',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'anthropic-skills',
    name: 'Anthropic Skills MCP — generate_docx/pptx/xlsx/pdf (anticipation)',
    url: 'https://mcp.anthropic.com/skills/mcp',
    tokenKey: 'anthropic_key',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
  {
    id: 'video-use',
    name: 'video-use MCP — Video generation Sora/Veo/Runway (anticipation)',
    url: 'https://mcp.video-use.com/mcp',
    tokenKey: 'video_use_key',
    status: 'unknown',
    toolsExposed: [],
    lastCheck: 0,
    errorCount: 0,
  },
];

class McpRegistry {
  /**
   * Init au boot : merge default servers avec ceux stockés.
   */
  async init(): Promise<void> {
    const stored = this.list();
    let needsSave = false;

    for (const def of DEFAULT_SERVERS) {
      if (!stored.find((s) => s.id === def.id)) {
        stored.push(def);
        needsSave = true;
        logger.info('mcp.registry', `Registered default server: ${def.id}`);
      }
    }

    if (needsSave) {
      this.save(stored);
    }

    /* Background discovery : list tools de chaque server alive */
    void this.discoverAll();
  }

  list(): McpServer[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as McpServer[];
    } catch {
      return [];
    }
  }

  get(id: string): McpServer | null {
    return this.list().find((s) => s.id === id) ?? null;
  }

  save(servers: McpServer[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    } catch (err) {
      logger.warn('mcp.registry', 'save failed', { err });
    }
  }

  async register(server: Omit<McpServer, 'status' | 'toolsExposed' | 'lastCheck' | 'errorCount'>): Promise<boolean> {
    const list = this.list();
    if (list.find((s) => s.id === server.id)) {
      logger.warn('mcp.registry', `Server ${server.id} already registered`);
      return false;
    }
    const full: McpServer = {
      ...server,
      status: 'unknown',
      toolsExposed: [],
      lastCheck: 0,
      errorCount: 0,
    };
    list.push(full);
    this.save(list);
    await auditLog.record('mcp.registry.register', { details: { id: server.id } });
    /* Auto-discovery des tools */
    void this.discoverTools(server.id);
    return true;
  }

  async unregister(id: string): Promise<boolean> {
    const list = this.list();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.save(list);
    await auditLog.record('mcp.registry.unregister', { details: { id } });
    return true;
  }

  async discoverAll(): Promise<void> {
    const list = this.list();
    for (const server of list) {
      if (server.status === 'dead' && server.errorCount > 5) continue; /* skip dead */
      void this.discoverTools(server.id);
    }
  }

  async discoverTools(serverId: string): Promise<McpServer | null> {
    const list = this.list();
    const idx = list.findIndex((s) => s.id === serverId);
    if (idx === -1) return null;

    const tools = await mcpClient.listTools(serverId);
    const health = await mcpClient.healthCheck(serverId);

    const server = list[idx];
    if (!server) return null;
    server.toolsExposed = tools;
    server.status = health.alive ? 'alive' : 'dead';
    server.lastCheck = Date.now();
    if (!health.alive) {
      server.errorCount = (server.errorCount ?? 0) + 1;
    } else {
      server.errorCount = 0;
    }

    list[idx] = server;
    this.save(list);
    logger.info('mcp.registry', `${serverId}: ${health.alive ? 'alive' : 'dead'} (${tools.length} tools)`);
    return server;
  }
}

export const mcpRegistry = new McpRegistry();
