/**
 * APEX v13 — AI Router avec failover multi-provider
 *
 * Demande Kevin (qualité ULTRA chat) + règles CLAUDE.md :
 * - "Anti-blocage IA, auto-déblocage total"
 * - "Niveau production Claude.ai/ChatGPT"
 * - JAMAIS de réponse vide / "je n'ai pas compris" / "API indisponible"
 *
 * Chaîne failover : Anthropic → OpenRouter → Groq → Gemini → OpenClaw → mode dégradé local
 *
 * Streaming SSE token-par-token avec animation typing fluide.
 * Idempotency key par requête (pas de double-facturation sur retry).
 * AbortController sur chaque fetch (pas de zombie).
 */

import { errors } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { MAX_SYSTEM_PROMPT_CHARS } from '../../core/prompt-budget.js';
/* P0-3 PERF (audit v13.2.5) : apex-tools-dispatch (102KB raw / 27KB gzip) lazy-loadé
 * uniquement quand un tool_use est détecté dans la réponse Claude (loop boucle 530).
 * Évite preload boot pour 99% des requests qui n'utilisent pas tools. */
type ApexToolsDispatchInstance = {
  execute: (name: string, input: unknown, tier: string) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
};
let _apexToolsDispatch: ApexToolsDispatchInstance | null = null;
async function loadApexToolsDispatch(): Promise<ApexToolsDispatchInstance> {
  if (_apexToolsDispatch) return _apexToolsDispatch;
  const mod = await import('../core-svc/apex-tools-dispatch.js');
  _apexToolsDispatch = mod.apexToolsDispatch as ApexToolsDispatchInstance;
  return _apexToolsDispatch;
}
/* v13.3.71 PERF (LCP optim) : apex-tools registry lazy au boot.
 * Avant : import statique faisait entrer apex-tools (76KB raw) dans le bundle initial.
 * Après : lazy load uniquement quand opts.withTools=true (Anthropic provider). */
type ApexToolsInstance = {
  toAnthropicFormat: (tier: string) => unknown[];
};
let _apexTools: ApexToolsInstance | null = null;
async function loadApexTools(): Promise<ApexToolsInstance> {
  if (_apexTools) return _apexTools;
  const mod = await import('../core-svc/apex-tools.js');
  _apexTools = mod.apexTools as unknown as ApexToolsInstance;
  return _apexTools;
}
import { economyMode } from '../core-svc/economy-mode.js';
import { auditLog } from '../observability/audit-log.js';
import { tokensDashboard } from '../observability/tokens-dashboard.js';
import { redactMessageContent, redactPII } from '../vault/pii-redaction.js';

import { chatFallback } from './chat-fallback.js';
import {
  getReasoningEffort,
  isNativeThinkingEnabled,
  NATIVE_THINKING_BUDGET_TOKENS,
} from './reasoning-mode.js';


export type Provider = 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'cerebras' | 'qwen' | 'openclaw';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; [k: string]: unknown }>;
}

/**
 * Stream chunk émis vers UI.
 * - `text`: texte assistant streaming (par défaut, type non précisé)
 * - `type: 'tool_use_start'`: début bloc tool_use Anthropic (UI affiche pill 🔧 [name])
 * - `type: 'tool_use_done'`: tools terminés (UI résume "✅ N opérations")
 *   `count` = nombre d'outils exécutés dans cette itération
 * - `type: 'thinking'`: delta de réflexion NATIVE Anthropic (extended thinking).
 *   Streamé SÉPARÉMENT du texte de réponse — l'UI l'affiche dans un bloc repliable
 *   et ne l'ajoute PAS au contenu final. Émis seulement si le flag opt-in est ON.
 */
export interface StreamChunk {
  text: string;
  done: boolean;
  provider: Provider;
  type?: 'text' | 'tool_use_start' | 'tool_use_done' | 'thinking';
  toolName?: string;
  toolCount?: number;
}

/**
 * Event normalisé retourné par `parseSSE` : soit du texte, soit un événement tool_use.
 * Les providers non-Anthropic retournent uniquement `{ kind: 'text' }`.
 */
type SSEEvent =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use_start'; index: number; id: string; name: string }
  | { kind: 'tool_use_delta'; index: number; partial_json: string }
  | { kind: 'content_block_stop'; index: number }
  | { kind: 'message_delta'; stop_reason: string | null };

interface ProviderConfig {
  endpoint: string;
  keyName: string;
  model: string;
  buildBody: (messages: ChatMessage[], system: string, opts?: { withTools?: boolean }) => unknown;
  parseSSE: (data: string) => SSEEvent | null;
  headers: (apiKey: string) => Record<string, string>;
}

/**
 * Bloc tool_use Anthropic accumulé pendant le streaming.
 * Construit progressivement via `content_block_start` + N × `content_block_delta` (input_json_delta) + `content_block_stop`.
 */
interface ToolUseAccumulator {
  index: number;
  id: string;
  name: string;
  inputJson: string;
}

/**
 * Résultat d'une itération de stream provider : texte assistant accumulé + tools détectés.
 */
interface ProviderStreamResult {
  assistantText: string;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason: string | null;
}

/**
 * Map provider Apex tier → user.
 * Détermine quels tools sont injectés dans le body Anthropic.
 */
function resolveUserTier(): 'admin' | 'laurence' | 'family' | 'client_pro' | 'client_free' {
  /* Lecture sync défensive : pas d'import dynamique pour éviter cycle. */
  try {
    const raw = localStorage.getItem('apex_v13_user');
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string } | null;
      if (parsed?.id === 'kdmc_admin') return 'admin';
      if (parsed?.id === 'laurence_sp') return 'laurence';
    }
  } catch {
    /* ignore */
  }
  return 'client_free';
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    keyName: 'ax_anthropic_key',
    model: 'claude-sonnet-4-6',
    buildBody: (messages, system, opts) => {
      /* P0 wire CRITIQUE Kevin v13.1.0 : injection des 105 tools APEX dans le body
         Anthropic — sans cela, l'API ne sait pas quels tools existent et Apex
         hallucine "list_repo_files(...)" en texte au lieu d'émettre un vrai
         tool_use block. Format Anthropic : { name, description, input_schema }.
         tool_choice: omis (laissé "auto" par défaut — Claude décide).

         P0 PROMPT CACHE Kevin v13.1.0 (audit) : active `cache_control: ephemeral`
         sur :
         - Le bloc system (toujours stable, ~8K tokens system prompt) → 90% baisse coût + 85% TTFT.
         - Les anciens messages historique conversation (stables, plus relus).
         Les 2 derniers messages NE sont PAS cachés (mouvants — on cache pas ce qui change).
         Le minimum Anthropic pour cacher un bloc est 1024 tokens (Sonnet) ou 2048 (Haiku) ;
         on tag sans condition, l'API ignore silencieusement les blocs trop courts.
         Doc : https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
         Header `anthropic-beta: prompt-caching-2024-07-31` non requis depuis 2024-09 (GA).
      */
      const filteredMessages = messages.filter((m) => m.role !== 'system');
      /* v13.3.60 fix CRITIQUE Kevin "anthropic HTTP 400 cache_control max 4 found 6" :
       * Anthropic limite cache_control à MAX 4 blocs par requête.
       * Avec system bloc cached + N messages anciens → si N > 3 → erreur 400.
       * Solution : cache UNIQUEMENT 3 derniers messages anciens (laisse 1 slot pour system).
       * Limite stricte 3 messages cachés = 4 cache_control au total (3 msg + 1 system). */
      const ANTHROPIC_MAX_CACHE_BLOCKS = 3; /* 3 messages + 1 system = 4 max */
      const cacheBoundary = Math.max(0, filteredMessages.length - 2);
      const cacheStartIdx = Math.max(0, cacheBoundary - ANTHROPIC_MAX_CACHE_BLOCKS);
      const cachedMessages = filteredMessages.map((m, i) => {
        /* Cache uniquement les 3 derniers messages anciens (entre cacheStartIdx et cacheBoundary) */
        if (i >= cacheStartIdx && i < cacheBoundary && typeof m.content === 'string' && m.content.length > 0) {
          return {
            role: m.role,
            content: [
              {
                type: 'text',
                text: m.content,
                cache_control: { type: 'ephemeral' },
              },
            ],
          };
        }
        return m;
      });
      /* v13.4.37/38 Kevin "mode économie" : si économie actif → modèle haiku +
       * max_tokens divisé. Bypassé temporairement si Kevin a confirmé tâche
       * expensive (via economyMode.bypassFor). Import sync top-level (v13.4.38 fix). */
      const defaultModel = 'claude-sonnet-4-6';
      const defaultMaxTokens = 4096;
      const body: Record<string, unknown> = {
        model: economyMode.resolveModel(defaultModel),
        max_tokens: economyMode.resolveMaxTokens(defaultMaxTokens),
        stream: true,
        /* system bloc structuré + cache_control ephemeral (gain massif sur prompt long stable) */
        system: [
          {
            type: 'text',
            text: system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: cachedMessages,
      };
      if (opts?.withTools && _apexTools) {
        /* v13.3.71 PERF : _apexTools pré-chargé par streamFromProvider (lazy).
         * Si pas encore chargé (jamais arriver normalement), skip silencieusement. */
        const tier = resolveUserTier();
        const tools = _apexTools.toAnthropicFormat(tier);
        if (tools.length > 0) body['tools'] = tools;
      }
      /* v13.4.355 (Kevin « Go » — raisonnement natif Anthropic) : extended thinking
       * NATIF, OPT-IN, OFF par défaut. Activé uniquement si flag `apex_v13_native_thinking`
       * ON ET effort='high' → l'API renvoie des blocs thinking_delta streamés à part.
       * Contraintes Anthropic : max_tokens DOIT être > budget_tokens ; temperature/top_p/
       * top_k doivent rester par défaut (on ne les met jamais dans body → OK). On garantit
       * max_tokens ≥ budget + 1024 (le mode économie peut avoir réduit max_tokens). */
      try {
        if (isNativeThinkingEnabled() && getReasoningEffort() === 'high') {
          const budget = NATIVE_THINKING_BUDGET_TOKENS;
          const curMax = typeof body['max_tokens'] === 'number' ? (body['max_tokens'] as number) : defaultMaxTokens;
          if (curMax <= budget) body['max_tokens'] = budget + 1024;
          body['thinking'] = { type: 'enabled', budget_tokens: budget };
        }
      } catch {
        /* flag illisible → pas de thinking natif (fail-safe, zéro régression) */
      }
      return body;
    },
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as {
          type?: string;
          index?: number;
          delta?: {
            type?: string;
            text?: string;
            thinking?: string;
            partial_json?: string;
            stop_reason?: string;
          };
          content_block?: {
            type?: string;
            id?: string;
            name?: string;
            thinking?: string;
          };
        };
        const t = j.type;
        if (t === 'content_block_start' && j.content_block) {
          const cb = j.content_block;
          if (cb.type === 'tool_use' && typeof cb.id === 'string' && typeof cb.name === 'string') {
            return {
              kind: 'tool_use_start',
              index: j.index ?? 0,
              id: cb.id,
              name: cb.name,
            };
          }
          /* v13.4.355 : bloc de réflexion NATIVE — le texte initial (souvent vide) arrive ici,
           * la suite via content_block_delta(thinking_delta). Émet un event thinking si non-vide. */
          if (cb.type === 'thinking' && typeof cb.thinking === 'string' && cb.thinking.length > 0) {
            return { kind: 'thinking', text: cb.thinking };
          }
          /* content_block_start text/thinking-vide → no event (la suite arrive via content_block_delta) */
          return null;
        }
        if (t === 'content_block_delta' && j.delta) {
          const d = j.delta;
          if (d.type === 'text_delta' && typeof d.text === 'string') {
            return { kind: 'text', text: d.text };
          }
          /* v13.4.355 : delta de réflexion NATIVE Anthropic (streamé à part du texte). */
          if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
            return { kind: 'thinking', text: d.thinking };
          }
          /* signature_delta (signature crypto du bloc thinking) : ignoré côté UI. */
          if (d.type === 'signature_delta') {
            return null;
          }
          if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
            return {
              kind: 'tool_use_delta',
              index: j.index ?? 0,
              partial_json: d.partial_json,
            };
          }
          /* legacy fallback (anciens SDK) — text directement sur delta */
          if (typeof d.text === 'string') {
            return { kind: 'text', text: d.text };
          }
          return null;
        }
        if (t === 'content_block_stop') {
          return { kind: 'content_block_stop', index: j.index ?? 0 };
        }
        if (t === 'message_delta' && j.delta) {
          return { kind: 'message_delta', stop_reason: j.delta.stop_reason ?? null };
        }
      } catch {
        /* ignore */
      }
      return null;
    },
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    }),
  },
  /* P1 audit fix v13.3.10 (Kevin "OpenAI key dort") :
   * Provider OpenAI natif. Avant : ax_openai_key collée → ai-router mappait
   * vers openrouter (qui n'a pas forcément la clé) → clé inutilisée.
   * Maintenant : OpenAI = provider 1ère classe avec endpoint /v1/chat/completions. */
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyName: 'ax_openai_key',
    model: 'gpt-4o-mini',
    buildBody: (messages, system) => ({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyName: 'ax_openrouter_key',
    model: 'anthropic/claude-sonnet-4-6',
    buildBody: (messages, system) => ({
      model: 'anthropic/claude-sonnet-4-6',
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyName: 'ax_groq_key',
    model: 'llama-3.3-70b-versatile',
    buildBody: (messages, system) => ({
      model: 'llama-3.3-70b-versatile',
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent',
    keyName: 'ax_google_key',
    model: 'gemini-2.5-pro',
    buildBody: (messages, system) => ({
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      })),
      systemInstruction: { parts: [{ text: system }] },
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    /* P0-2 fix : header x-goog-api-key au lieu de query string (anti leak proxy/log) */
    headers: (apiKey) => ({ 'content-type': 'application/json', 'x-goog-api-key': apiKey }),
  },
  /* v13.4.348 (Kevin « toujours tout auto ») : Mistral en provider PREMIÈRE CLASSE —
   * Kevin a DÉJÀ la clé MISTRAL_API_KEY (aucune action requise) → 1 milliard de tokens/mois
   * gratuits. API OpenAI-compatible, routée via le proxy (mistral déjà dans PROXY_MAP +
   * PROXY_PROVIDERS). Failover TARDIF (jamais avant anthropic — premium admin inchangé #124). */
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    keyName: 'ax_mistral_key',
    model: 'mistral-large-latest',
    buildBody: (messages, system) => ({
      model: 'mistral-large-latest',
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  /* v13.4.345 (Kevin « intègre les IA gratuites — go tout ») : Cerebras = ~1M tokens/jour
   * gratuit, ~2000 tok/s (le plus rapide en volume). API OpenAI-compatible. Ajouté comme
   * failover TARDIF (jamais avant anthropic — le premium admin reste inchangé, leçon #124).
   * Inerte tant que Kevin n'a pas ajouté le secret CEREBRAS_API_KEY (fail-open, la chaîne
   * saute simplement cerebras) → aucune régression. */
  cerebras: {
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    keyName: 'ax_cerebras_key',
    model: 'llama-3.3-70b',
    buildBody: (messages, system) => ({
      model: 'llama-3.3-70b',
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  /* v13.4.366 (Kevin 2026-09-05 « Fait tourner Apex sur Qwen l'IA gratuite, privilégie les
   * IA gratuites en tâche principale ») : Qwen servi par Cloudflare Workers AI DANS le worker
   * apex-secrets-proxy (binding AI) — 0 clé, 0 compte tiers. L'endpoint EST l'URL du proxy :
   * tryProxyRoute le reconnaît (même origine) et ne le ré-écrit pas. Sans proxy → aucune clé
   * locale possible → la chaîne saute simplement qwen (fail-open, jamais bloqué).
   * Format OpenAI (le worker traduit le flux Workers AI) → même parseSSE que groq. */
  qwen: {
    endpoint: 'https://apex-secrets-proxy.9r4rxssx64.workers.dev/qwen/v1/chat/completions',
    keyName: 'ax_qwen_key',
    model: '@cf/qwen/qwen3.8-27b',
    buildBody: (messages, system) => ({
      model: '@cf/qwen/qwen3.8-27b',
      stream: true,
      max_tokens: 2048,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    headers: () => ({ 'content-type': 'application/json' }),
  },
  openclaw: {
    endpoint: 'https://api.openclaw.io/v1/chat/completions' /* placeholder, à confirmer quand Kevin fournit clé */,
    keyName: 'ax_openclaw_key',
    model: 'openclaw-default',
    buildBody: (messages, system) => ({
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    parseSSE: (data) => {
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content;
        return typeof text === 'string' && text.length > 0 ? { kind: 'text', text } : null;
      } catch {
        return null;
      }
    },
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
};

/**
 * Limite anti-boucle infinie pour le tool_use loop.
 *
 * v13.4.200 (Kevin 2026-05-16 récurrent "Apex ne termine jamais son travail
 * et se coupe. Il ne fais rien au final si ce n'est lire ses fichiers"):
 * Passé de 10 → 25. Pour une tâche du type "modifie ton UX", Apex doit lire
 * memory + docs + code source (~5-8 tools READ) AVANT de pouvoir agir avec
 * modify_file / inject_function / modify_css → la limite 10 était souvent
 * atteinte AVANT l'action. 25 donne la marge pour read multiple + execute.
 *
 * Sortie de boucle détectée explicitement : si iter atteint MAX_TOOL_USE_ITERATIONS
 * sans break naturel, on émet un texte clair AVANT done (cf. ligne ~1077).
 */
const MAX_TOOL_USE_ITERATIONS = 25;

/**
 * v13.3.49 — Cap conversation history pour éviter HTTP 400 Anthropic.
 * Si conversation > 30 messages → garde 1er message + 25 derniers.
 * Insère un marker "[…X messages skipped pour limite tokens…]" entre.
 */
const MAX_CONVERSATION_MESSAGES = 30;
const KEEP_FIRST_MESSAGES = 1;
const KEEP_LAST_MESSAGES = 25;

/**
 * v13.3.49 — Caps de validation pré-envoi.
 * Anthropic context = 200K tokens (~800K chars). On reste très en-dessous
 * pour laisser room aux tools (105 tools APEX) + max_tokens output (4096).
 *
 * v13.4.8 fix M5 (Ultra Review) — estimation tokens plus précise :
 *  - FR : ~3 chars/token (vs 4 en anglais)
 *  - Code/JSON : ~2.8 chars/token (très dense)
 *  - Token cap concret : 150K tokens (sur les 200K Anthropic, laisse 50K
 *    pour system + tools + output) — plus restrictif que 400K chars.
 */
/* v13.4.365 (fix « system too long » Kevin 2026-09-05) : la valeur vit
 * désormais dans core/prompt-budget.ts, importée aussi par memory.ts et
 * chat-engine.ts. Elle était écrite en dur ICI *et* dans memory.ts : les deux
 * étages ne mesuraient pas la même chaîne, d'où la panne. Ne PAS la redéclarer. */
const MAX_TOTAL_BODY_TOKENS = 150_000; /* Anthropic Sonnet 4.6 = 200K context */
const MAX_TOKENS_OUTPUT_HARD_CAP = 8192;
const MAX_TOKENS_OUTPUT_HARD_MIN = 1;

/* ============================================================
 * v13.4.130 (Kevin "intègre secrets GitHub à Apex") — Proxy router
 * ============================================================
 *
 * Si Cloudflare Worker `apex-secrets-proxy` déployé + healthy → forward fetch
 * via le proxy avec PIN hash en auth. Clés API jamais exposées côté client.
 * Sinon fallback direct fetch avec clé vault local.
 *
 * Health check caché 5min (apex_v13_proxy_health_cache).
 * Feature flag via localStorage `apex_v13_use_secrets_proxy` (default true).
 *
 * Mapping providers AI router → proxy path :
 *   anthropic → /anthropic/v1/messages
 *   openai    → /openai/v1/chat/completions
 *   groq      → /groq/openai/v1/chat/completions
 *   gemini    → /gemini/v1beta/models/...
 *   deepseek  → /deepseek/v1/chat/completions
 *   perplexity→ /perplexity/...
 *   openrouter→ pas proxifié (multi-providers, direct OK)
 *   openclaw  → pas proxifié (placeholder)
 */

const PROXY_HEALTH_CACHE_MS = 5 * 60 * 1000;
const PROXY_HEALTH_KEY = 'apex_v13_proxy_health_cache';
const PROXY_FLAG_KEY = 'apex_v13_use_secrets_proxy';

interface ProxyHealthCache {
  ts: number;
  available_providers: string[];
  ok: boolean;
}

async function sha256HexAr(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getProxyHealth(): Promise<ProxyHealthCache | null> {
  try {
    const cached = localStorage.getItem(PROXY_HEALTH_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ProxyHealthCache;
      if (Date.now() - parsed.ts < PROXY_HEALTH_CACHE_MS) return parsed;
    }
  } catch { /* corrupt cache : refetch */ }
  try {
    const { apexSecretsProxy } = await import('../integrations/apex-secrets-proxy-client.js');
    const r = await apexSecretsProxy.checkHealth();
    if (!r.ok || !r.data) return null;
    const cache: ProxyHealthCache = {
      ts: Date.now(),
      available_providers: r.data.available_providers,
      ok: true,
    };
    try { localStorage.setItem(PROXY_HEALTH_KEY, JSON.stringify(cache)); } catch { /* quota */ }
    return cache;
  } catch {
    return null;
  }
}

async function tryProxyRoute(
  provider: Provider,
  directUrl: string,
): Promise<{ url: string; headers: Record<string, string> } | null> {
  /* Feature flag : default OFF (zéro régression). Kevin active via :
   * admin button OU localStorage.setItem('apex_v13_use_secrets_proxy','true')
   * Sentinelle boot pourra auto-enabler si Kevin opt-in dans Réglages. */
  try {
    const flag = localStorage.getItem(PROXY_FLAG_KEY);
    if (flag !== 'true' && flag !== '1') return null;
  } catch {
    return null;
  }
  /* Health check (cached 5min) */
  const health = await getProxyHealth();
  if (!health || !health.ok) return null;
  /* Provider supporté par proxy ? */
  if (!health.available_providers.includes(provider)) return null;
  /* PIN hash pour auth.
   * v13.4.341 (Kevin « Tjs OpenAI ») : le readKey du PIN peut échouer par COURSE AU
   * BOOT (vault pas encore déverrouillé au 1er message — anthropic, tête de chaîne,
   * la payait ; openai 2s plus tard passait) → retry 1× après 400ms avant d'abandonner. */
  let pinHash = '';
  try {
    const { vault } = await import('../vault/vault.js');
    let pinPlain = (await vault.readKey('ax_pin_kdmc_admin')) ?? (await vault.readKey('ax_pin'));
    if (!pinPlain) {
      await new Promise((r) => setTimeout(r, 400));
      pinPlain = (await vault.readKey('ax_pin_kdmc_admin')) ?? (await vault.readKey('ax_pin'));
    }
    if (!pinPlain) return null;
    pinHash = await sha256HexAr(pinPlain);
  } catch {
    return null;
  }
  /* Transform URL : api.anthropic.com/v1/messages → worker/anthropic/v1/messages */
  const workerBase = 'https://apex-secrets-proxy.9r4rxssx64.workers.dev';
  let proxyPath: string;
  let nativeToWorker = false;
  try {
    const u = new URL(directUrl);
    /* v13.4.366 : provider NATIF au worker (qwen = Workers AI) — l'endpoint est déjà
     * l'URL du proxy, on ne préfixe pas une 2e fois (/qwen/qwen/…). */
    nativeToWorker = u.origin === workerBase;
    /* Extract path après .com → ex /v1/messages */
    proxyPath = u.pathname + u.search;
  } catch {
    return null;
  }
  const proxyUrl = nativeToWorker ? directUrl : `${workerBase}/${provider}${proxyPath}`;
  return {
    url: proxyUrl,
    headers: {
      'content-type': 'application/json',
      'x-apex-pin': pinHash,
    },
  };
}

/**
 * v13.4.8 fix M5 — estimateur tokens heuristique multi-langue.
 *  - Détecte présence code/JSON (denser : 2.8 chars/token)
 *  - Sinon défaut FR-tolérant (3.2 chars/token)
 * Pas aussi précis qu'un vrai tokenizer mais évite la sous-estimation
 * massive de l'ancien `/4` qui causait HTTP 400 prompt-too-long fréquents.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  /* Heuristique simple : si > 30% du texte est code (triple-backtick block ou
   * JSON ouvrant `{` à >10% des chars) on prend 2.8 chars/token. */
  const hasFences = /```/.test(text);
  const jsonRatio = (text.match(/[{}[\]:,"]/g)?.length ?? 0) / Math.max(text.length, 1);
  const charsPerToken = hasFences || jsonRatio > 0.1 ? 2.8 : 3.2;
  return Math.ceil(text.length / charsPerToken);
}

function truncateConversation(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_CONVERSATION_MESSAGES) return messages;
  const first = messages.slice(0, KEEP_FIRST_MESSAGES);
  const last = messages.slice(-KEEP_LAST_MESSAGES);
  const skipped = messages.length - first.length - last.length;
  if (skipped <= 0) return messages;
  /* Marker = message system-like sous role 'user' (Anthropic n'accepte que user/assistant)
   * Claude comprendra le marker et continue depuis le contexte récent. */
  const marker: ChatMessage = {
    role: 'user',
    content: `[…${skipped} messages précédents tronqués pour limite tokens — contexte préservé via system prompt mémoire long-terme…]`,
  };
  return [...first, marker, ...last];
}

/**
 * v13.3.49 — Validation pré-envoi ChatMessage[] + system + max_tokens.
 * Retourne { ok: false, reason } si invalid (caller doit fallback).
 */
function validateRequest(
  messages: ChatMessage[],
  system: string,
  maxTokens?: number,
): { ok: true } | { ok: false; reason: string } {
  if (typeof system !== 'string') return { ok: false, reason: 'system must be string' };
  if (system.length === 0) return { ok: false, reason: 'system empty' };
  if (system.length > MAX_SYSTEM_PROMPT_CHARS) {
    return { ok: false, reason: `system too long (${system.length} > ${MAX_SYSTEM_PROMPT_CHARS})` };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: 'messages must be non-empty array' };
  }
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (!m) return { ok: false, reason: `messages[${i}] null/undefined` };
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') {
      return { ok: false, reason: `messages[${i}].role invalid: ${String(m.role)}` };
    }
    if (m.content === null || m.content === undefined) {
      return { ok: false, reason: `messages[${i}].content null/undefined` };
    }
    if (typeof m.content !== 'string' && !Array.isArray(m.content)) {
      return { ok: false, reason: `messages[${i}].content must be string or array` };
    }
    if (typeof m.content === 'string' && m.content.length === 0) {
      return { ok: false, reason: `messages[${i}].content empty string` };
    }
  }
  if (typeof maxTokens === 'number') {
    if (!Number.isFinite(maxTokens) || maxTokens < MAX_TOKENS_OUTPUT_HARD_MIN || maxTokens > MAX_TOKENS_OUTPUT_HARD_CAP) {
      return { ok: false, reason: `max_tokens out of range [${MAX_TOKENS_OUTPUT_HARD_MIN}-${MAX_TOKENS_OUTPUT_HARD_CAP}]: ${maxTokens}` };
    }
  }
  /* v13.4.8 fix M5 — body size en TOKENS estimés (pas chars).
   * Anthropic 4.6 = 200K context window. On limite à 150K pour laisser room
   * tools (~10K) + system (~10K) + output (~4K). */
  const totalText = system + messages.map((m) => (
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  )).join('\n');
  const totalTokens = estimateTokens(totalText);
  if (totalTokens > MAX_TOTAL_BODY_TOKENS) {
    return { ok: false, reason: `total body too large (~${totalTokens} tokens > ${MAX_TOTAL_BODY_TOKENS})` };
  }
  return { ok: true };
}

/**
 * Providers qui supportent l'injection de tools côté API.
 * Pour les autres, on stream du texte sans tools (compat fallback chain).
 */
const PROVIDERS_WITH_TOOLS: ReadonlySet<Provider> = new Set<Provider>(['anthropic']);

/**
 * v13.3.74 H2 (audit Apex v13.3.73) — Failover chain MAX 6 providers actifs.
 *
 * Audit issue #240 : "Anti-blocage IA: 2/4 providers seulement".
 * Cible : >= 5 providers actifs en chain pour assurer continuité même si
 * 2-3 providers down simultanément (cohere/groq/anthropic incident 2026-05-08).
 *
 * Providers natifs (1ère classe, model dédié) :
 * - anthropic (Claude Sonnet 4.6)
 * - openai (GPT-4o-mini)
 * - openrouter (proxy multi-model — fallback universel)
 * - groq (Llama 3.3 70B — gratuit 14k req/jour)
 * - gemini (Gemini 2.5 Pro — free tier généreux)
 * - openclaw (placeholder Kevin custom)
 *
 * Providers proxiés via openrouter (mappés dans buildPolicyAwareChain):
 * - mistral, cohere, deepseek, perplexity → openrouter
 *
 * Total effectif : 6 endpoints distincts → si 2 KO, reste 4 actifs minimum.
 */
/* v13.4.366 : qwen (gratuit, Workers AI) juste après anthropic — avant tout provider payant. */
const DEFAULT_CHAIN: readonly Provider[] = ['anthropic', 'qwen', 'openai', 'openrouter', 'groq', 'gemini', 'mistral', 'cerebras', 'openclaw'];

/**
 * v13.3.74 H2 — Liste extensive des providers logiques supportés (incluant proxiés).
 * Utilisé pour log "X/Y providers healthy" au boot + diagnostic admin.
 */
export const ALL_PROVIDERS_LOGICAL: readonly string[] = [
  'anthropic',
  'openai',
  'openrouter',
  'groq',
  'gemini',
  'cerebras',
  'qwen',
  'mistral',
  'cohere',
  'deepseek',
  'perplexity',
  'openclaw',
];

/**
 * v13.3.74 H2 — Minimum providers actifs requis pour considérer chain "healthy".
 * Si < MIN_HEALTHY_PROVIDERS → toast warning admin + escalade Claude Code.
 */
export const MIN_HEALTHY_PROVIDERS = 5;

/**
 * v13.3.74 H2 (audit Apex v13.3.73 issue #240) — Audit chain providers au boot.
 *
 * Compte combien de providers ont une clé configurée (signal de healthy presumé).
 * Retourne info pour log boot + toast admin si <MIN_HEALTHY_PROVIDERS.
 *
 * Note : "healthy" ici = clé configurée. Les pings réels sont faits par
 * multi-key-health.ts toutes les 5 min. Cette fonction est un audit boot
 * rapide pour signaler "trop peu de providers actifs".
 */
export function auditProviderChain(): {
  total: number;
  healthy: number;
  unhealthy: readonly string[];
  configured: readonly string[];
  meetsMinimum: boolean;
  proxyActive: boolean;
} {
  /* v13.3.75 (Kevin urgent "14 clés mais 2/6 providers") :
   * Élargir audit à TOUS les providers IA possibles (pas seulement DEFAULT_CHAIN
   * de 6) — inclus mistral, cohere, deepseek, perplexity, xai_grok pour matcher
   * les clés réellement stockées dans le vault. Aussi : check vault chiffré
   * (AXENC1:) en plus du localStorage brut.
   *
   * v13.3.75b (test H2 fix) : ajout openclaw + huggingface dans liste unique
   * canonical des providers. Comptage unhealthy élargi à TOUS les providers
   * sans clé (pas seulement ceux du DEFAULT_CHAIN) — sinon test
   * `unhealthy.length >= total - 1` cassé. */
  const ALL_AI_KEYS: readonly { name: string; storageKey: string }[] = [
    { name: 'anthropic', storageKey: 'ax_shared_api_key' },
    { name: 'anthropic_alt', storageKey: 'ax_anthropic_key' },
    { name: 'openai', storageKey: 'ax_openai_key' },
    { name: 'openrouter', storageKey: 'ax_openrouter_key' },
    { name: 'groq', storageKey: 'ax_groq_key' },
    { name: 'gemini', storageKey: 'ax_gemini_key' },
    { name: 'mistral', storageKey: 'ax_mistral_key' },
    { name: 'cohere', storageKey: 'ax_cohere_key' },
    { name: 'deepseek', storageKey: 'ax_deepseek_key' },
    { name: 'perplexity', storageKey: 'ax_perplexity_key' },
    { name: 'xai_grok', storageKey: 'ax_xai_key' },
    { name: 'huggingface', storageKey: 'ax_hf_token' },
    { name: 'openclaw', storageKey: 'ax_openclaw_key' },
  ];
  const healthy: string[] = [];
  const unhealthy: string[] = [];
  const seenProviders = new Set<string>();
  /* Pré-calcule la liste unique des providers logiques (anthropic_alt → anthropic). */
  const allLogicalProviders = new Set<string>();
  for (const { name } of ALL_AI_KEYS) {
    allLogicalProviders.add(name.replace(/_alt$/, ''));
  }
  /* Mapping nom de SERVICE (multi-key-vault / Coffre) → provider logique.
   * v13.4.328 (Kevin "le Coffre note 22 mais 0/12 providers IA") : le boot audit
   * lisait UNIQUEMENT les slots legacy localStorage (ax_openai_key…), or les 22
   * clés réelles vivent dans le multi-key-vault (`apex_v13_multi_keys`). On compte
   * donc AUSSI les clés du Coffre + le proxy serveur (sinon fausse alarme 0/12). */
  const SERVICE_TO_LOGICAL: Record<string, string> = {
    anthropic: 'anthropic', openai: 'openai', openrouter: 'openrouter', groq: 'groq',
    google: 'gemini', gemini: 'gemini', mistral: 'mistral', cohere: 'cohere',
    deepseek: 'deepseek', perplexity: 'perplexity', xai: 'xai_grok', grok: 'xai_grok',
    xai_grok: 'xai_grok', hf: 'huggingface', huggingface: 'huggingface', openclaw: 'openclaw',
  };
  if (typeof localStorage !== 'undefined') {
    /* 1. Slots legacy single-key */
    for (const { name, storageKey } of ALL_AI_KEYS) {
      const raw = localStorage.getItem(storageKey);
      if (raw && raw.length > 0) {
        const baseProvider = name.replace(/_alt$/, '');
        if (!seenProviders.has(baseProvider)) {
          seenProviders.add(baseProvider);
          healthy.push(baseProvider);
        }
      }
    }
    /* 2. Multi-key-vault (Coffre) — source réelle des clés Kevin */
    try {
      const rawVault = localStorage.getItem('apex_v13_multi_keys');
      if (rawVault) {
        const arr: unknown = JSON.parse(rawVault);
        if (Array.isArray(arr)) {
          for (const e of arr as Array<{ service?: string; status?: string; kind?: string }>) {
            if (!e || typeof e !== 'object') continue;
            if (e.status === 'invalid' || e.kind === 'info') continue;
            const svc = String(e.service ?? '').toLowerCase();
            const logical = SERVICE_TO_LOGICAL[svc] ?? (allLogicalProviders.has(svc) ? svc : null);
            if (logical && !seenProviders.has(logical)) {
              seenProviders.add(logical);
              healthy.push(logical);
            }
          }
        }
      }
    } catch { /* coffre corrompu → ignore, on garde le legacy */ }
    /* Unhealthy = providers logiques NON couverts (legacy + Coffre). */
    for (const provider of allLogicalProviders) {
      if (!seenProviders.has(provider)) unhealthy.push(provider);
    }
  }
  /* 3. Proxy Cloudflare actif = clés côté serveur → pas de fausse alarme. */
  let proxyActive = false;
  try {
    const flag = typeof localStorage !== 'undefined' ? localStorage.getItem(PROXY_FLAG_KEY) : null;
    proxyActive = flag === 'true' || flag === '1';
  } catch { /* ignore */ }
  /* total = nombre de providers logiques uniques (pas le nombre de clés possibles). */
  const total = allLogicalProviders.size;
  return {
    total,
    healthy: healthy.length,
    unhealthy,
    configured: healthy,
    /* Minimum atteint si assez de providers configurés OU proxy serveur actif. */
    meetsMinimum: healthy.length >= MIN_HEALTHY_PROVIDERS || proxyActive,
    proxyActive,
  };
}

class AIRouter {
  private currentAbort: AbortController | null = null;

  /**
   * Lecture sync brute (peut être chiffrée AXENC1: si stockée via vault.autoStore).
   * Préférer getApiKeyDecrypted() async pour usage AI calls.
   */
  getApiKey(provider: Provider): string {
    return localStorage.getItem(PROVIDERS[provider].keyName) ?? '';
  }

  /**
   * Lecture async avec déchiffrement auto si AXENC1: prefix.
   *
   * Sprint 9 (Kevin règle 2026-05-07 multi-key) : prefer multi-key-vault si dispo.
   * Si Kevin a 2+ clés pour ce service, on utilise getCurrentKey() qui retourne
   * la meilleure (active > unknown > rate-limited). Fallback legacy single-key
   * si rien dans multi-key-vault.
   */
  async getApiKeyDecrypted(provider: Provider): Promise<string> {
    /* 1. Prefer multi-key-vault (Kevin "2 clés Anthropic, fallback auto") */
    try {
      const { multiKeyVault } = await import('../vault/multi-key-vault.js');
      const serviceName = this.providerToService(provider);
      const result = await multiKeyVault.getCurrentKey(serviceName);
      if (result?.plaintext) return result.plaintext;
    } catch {
      /* skip — fallback legacy ci-dessous */
    }
    /* 2. Legacy single-key fallback (back-compat v13.0.x) */
    const raw = this.getApiKey(provider);
    if (!raw) return '';
    if (raw.startsWith('AXENC1:')) {
      const { vault } = await import('../vault/vault.js');
      const decrypted = await vault.decryptAuto(raw);
      return decrypted ?? '';
    }
    return raw;
  }

  /**
   * Sprint 9 v13.1.x : récupère keyId + plaintext pour failover key-level.
   * Retourne null si pas de multi-key dispo (fallback legacy single-key).
   */
  async getApiKeyWithId(provider: Provider): Promise<{ keyId: string; plaintext: string } | null> {
    try {
      const { multiKeyVault } = await import('../vault/multi-key-vault.js');
      const serviceName = this.providerToService(provider);
      return await multiKeyVault.getCurrentKey(serviceName);
    } catch {
      return null;
    }
  }

  /**
   * Map Provider router → service name multi-key-vault.
   * Ex: 'gemini' → 'google' (même clé Google AI Studio).
   */
  private providerToService(provider: Provider): string {
    if (provider === 'gemini') return 'google';
    return provider;
  }

  hasAnyKey(): boolean {
    /* Vérifie présence non-vide raw (chiffrée ou non) */
    if (DEFAULT_CHAIN.some((p) => this.getApiKey(p).length > 0)) return true;
    /* Kevin 2026-06-08 ("il me demande une clé alors que le Coffre est plein,
     * 22/22 providers actifs") : si le proxy Cloudflare est activé (proxy-auto-enable
     * l'a confirmé healthy au boot), les clés sont côté serveur → on PEUT streamer
     * via le proxy → considérer qu'on a de quoi répondre (sinon le chat se bloque). */
    try {
      const flag = localStorage.getItem(PROXY_FLAG_KEY);
      if (flag === 'true' || flag === '1') return true;
    } catch { /* ignore */ }
    return false;
  }

  /** Proxy Cloudflare activé ET couvrant ce provider ? (async, health cache 5 min). */
  private async proxyCoversProvider(provider: Provider): Promise<boolean> {
    try {
      const flag = localStorage.getItem(PROXY_FLAG_KEY);
      if (flag !== 'true' && flag !== '1') return false; /* même gate que tryProxyRoute */
      const health = await getProxyHealth();
      return !!health?.ok && health.available_providers.includes(provider);
    } catch {
      return false;
    }
  }

  /**
   * Stream une réponse IA avec failover automatique.
   * Callbacks : onChunk pour rendu progressif, onError pour catch final.
   */
  async stream(
    messages: ChatMessage[],
    system: string,
    onChunk: (chunk: StreamChunk) => void,
    onError?: (err: Error) => void,
  ): Promise<void> {
    if (!this.hasAnyKey()) {
      onError?.(new Error('Aucune clé API configurée. Va dans le Coffre pour ajouter.'));
      return;
    }

    /* P1.3 v13.3.81 (audit cascade — RGPD Art. 18) :
     * Si user a restriction 'ai_query' → mode dégradé local au lieu d'envoyer aux providers. */
    try {
      const uid = localStorage.getItem('apex_v13_uid');
      if (uid) {
        const { rgpd } = await import('../auth/rgpd.js');
        if (rgpd.isRestricted(uid, 'ai_query') || rgpd.isRestricted(uid, '*')) {
          logger.warn('ai-router', 'AI query blocked (RGPD Art. 18 restriction)');
          onChunk({
            text: 'Mode limitation RGPD actif (Art. 18). Les requêtes IA sont temporairement suspendues. Contacte l\'admin pour lever la restriction.',
            done: true,
            provider: 'anthropic',
            type: 'text',
          });
          void auditLog.record('rgpd.ai_query.blocked', { actor: uid });
          return;
        }
      }
    } catch {
      /* rgpd indispo → continue (fail-open) */
    }

    /* P1 fix : PII redaction outbound — filtre email/CB/IBAN/SS/passport/etc.
     * AVANT envoi providers IA pour anti-leak data sensible.
     * Jet 13.0.40 : audit log si PII détecté (SOC2 trail). */
    let totalPiiFound = 0;
    const redactedMessages = messages.map((m) => {
      if (typeof m.content === 'string') {
        const r = redactPII(m.content);
        totalPiiFound += r.foundCount;
        return { ...m, content: r.redacted };
      }
      return { ...m, content: redactMessageContent(m.content) as ChatMessage['content'] };
    });
    if (totalPiiFound > 0) {
      void auditLog.record('ai.pii_redacted_outbound', {
        details: { count: totalPiiFound, messages_count: messages.length },
      });
      logger.info('ai-router', `PII redacted outbound: ${totalPiiFound} occurrences`);
    }

    /* v13.3.49 — Cap conversation history (Kevin urgent fix HTTP 400).
     * Si > 30 messages, garde 1er + 25 derniers + marker. Évite blow context. */
    const truncatedMessages = truncateConversation(redactedMessages);
    if (truncatedMessages.length !== redactedMessages.length) {
      logger.info('ai-router', `conversation truncated ${redactedMessages.length} → ${truncatedMessages.length} (cap ${MAX_CONVERSATION_MESSAGES})`);
    }

    /* v13.4.6 (Kevin "pré-envoi invalide messages[1].content empty") :
     * AUTO-FILTER messages vides AVANT validation (Apex tolérant).
     * Un message vide arrive souvent quand Kevin envoie SEULEMENT une pièce jointe
     * (image/PDF/audio) sans texte → content est string vide. On le filtre.
     * Si tous les messages sont vides → message clair "Tape ta question". */
    const filteredMessages = truncatedMessages.filter((m) => {
      if (!m) return false;
      if (typeof m.content === 'string') return m.content.trim().length > 0;
      if (Array.isArray(m.content)) {
        /* Garde le message si au moins UN block a du contenu (texte non-vide OU image/document) */
        return m.content.some((part: { type?: string; text?: string }) => {
          if (part.type === 'text') return (part.text ?? '').trim().length > 0;
          return part.type === 'image' || part.type === 'document' || part.type === 'tool_use' || part.type === 'tool_result';
        });
      }
      return false;
    });

    if (filteredMessages.length === 0) {
      const err = new Error('Aucun message à envoyer — tape ta question ou ajoute du texte avec ta pièce jointe.');
      logger.warn('ai-router', 'all messages empty after filter');
      onError?.(err);
      return;
    }

    /* v13.3.49 — Validation pré-envoi : system + messages + max_tokens. */
    const validation = validateRequest(filteredMessages, system, 4096);
    if (!validation.ok) {
      const err = new Error(`Apex pré-envoi invalide : ${validation.reason}`);
      logger.error('ai-router', 'request validation failed', { reason: validation.reason });
      void auditLog.record('ai.validation_failed', { details: { reason: validation.reason } });
      onError?.(err);
      return;
    }

    if (this.currentAbort) this.currentAbort.abort();
    const ctrl = new AbortController();
    this.currentAbort = ctrl;

    /* Wire ai-routing-policy : policy.decide() respecte mode (auto/economy/premium/forced)
     * + Anthropic priority + budget aware. Fallback en cas d'erreur 4xx/5xx via chain. */
    const chain = await this.buildPolicyAwareChain(filteredMessages);

    /* v13.4.9 (Kevin "ne s'arrête plus en plein travail") :
     * Démarre stream-partial-saver : sauvegarde le partial text à chaque chunk
     * pour permettre RESUME si déconnexion / abort / iPhone background kill. */
    try {
      const { streamPartialSaver } = await import('./stream-partial-saver.js');
      streamPartialSaver.start({
        provider: chain[0] ?? 'unknown',
        messages: filteredMessages as Array<{ role: string; content: string | unknown[] }>,
        system,
      });
    } catch { /* ignore */ }

    /* Estimation tokens input pour dashboard (heuristique : 1 token ≈ 4 chars FR/EN) */
    const inputTokensEstimate = Math.ceil(
      JSON.stringify(filteredMessages).length / 4 + system.length / 4,
    );
    let outputTokensEstimate = 0;

    /* Wrap onChunk pour count output tokens + persist partial (v13.4.9 resume) */
    const wrappedOnChunk = (chunk: StreamChunk): void => {
      if (chunk.text) {
        outputTokensEstimate += Math.ceil(chunk.text.length / 4);
        /* v13.4.9 : alimente le partial saver — sync best-effort */
        void import('./stream-partial-saver.js').then(({ streamPartialSaver }) => {
          if (chunk.text) streamPartialSaver.appendChunk(chunk.text);
        }).catch(() => { /* ignore */ });
      }
      if (chunk.done) {
        void import('./stream-partial-saver.js').then(({ streamPartialSaver }) => {
          streamPartialSaver.complete();
        }).catch(() => { /* ignore */ });
      }
      onChunk(chunk);
    };

    /* P0 wire CRITIQUE Kevin v13.1.0 : tool_use loop.
       Boucle jusqu'à 10 itérations max — Claude peut chaîner tools (ex:
       list_repo_files puis read_repo_file puis edit_file). À chaque iter :
       1. Stream le provider (avec tools si Anthropic)
       2. Si tool_uses détectés → exécute via apexToolsDispatch + ajoute aux messages
       3. Si pas de tool_use → end_turn, sortie boucle */
    const currentMessages: ChatMessage[] = [...truncatedMessages];
    let lastErr: Error | null = null;
    let lastProvider: Provider = 'anthropic';
    /* v13.4.200 : tracker pour détecter exit par saturation MAX_ITER vs naturel */
    let exitedByMaxIter = false;
    let lastIterHadToolUses = false;

    for (let iter = 0; iter < MAX_TOOL_USE_ITERATIONS; iter++) {
      const result = await this.streamWithFailover(
        chain,
        currentMessages,
        system,
        wrappedOnChunk,
        ctrl.signal,
      );

      if (result.status === 'aborted') {
        this.currentAbort = null;
        return;
      }
      if (result.status === 'error') {
        lastErr = result.error;
        break; /* failover épuisé, sortie boucle pour fallback */
      }

      lastProvider = result.provider;

      /* WIRE tokens-dashboard : enregistre conso après stream succès */
      const modelName = this.getModelKey(result.provider);
      tokensDashboard.record(result.provider, inputTokensEstimate, outputTokensEstimate, modelName);

      /* Si pas de tool_use, c'est terminé — émet done final + sortie. */
      if (result.streamResult.toolUses.length === 0) {
        this.currentAbort = null;
        wrappedOnChunk({ text: '', done: true, provider: result.provider });
        return;
      }

      /* Provider non-Anthropic ne supporte pas les tools — sortie même si stop_reason
         indique tool_use (ne devrait pas arriver, défense en profondeur). */
      if (!PROVIDERS_WITH_TOOLS.has(result.provider)) {
        logger.warn('ai-router', 'tool_use ignoré : provider non supporté', { provider: result.provider });
        this.currentAbort = null;
        wrappedOnChunk({ text: '', done: true, provider: result.provider });
        return;
      }

      /* Exécute les tools en parallèle, accumule assistant+tools dans messages */
      const assistantContent: Array<{ type: string; [k: string]: unknown }> = [];
      if (result.streamResult.assistantText) {
        assistantContent.push({ type: 'text', text: result.streamResult.assistantText });
      }
      for (const tu of result.streamResult.toolUses) {
        assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
      }
      currentMessages.push({ role: 'assistant', content: assistantContent });

      /* P0-3 PERF : lazy-load au 1er tool_use uniquement (évite 27KB gzip boot) */
      const apexToolsDispatch = await loadApexToolsDispatch();
      /* v13.4.8 fix C8 (Ultra Review) — PII redaction sur tool_result avant
       * envoi au model. Avant : tool_result content (file content, web fetch,
       * etc.) bypassait redactPII appliquée uniquement sur user messages.
       * Tools sensibles : read_file, web_fetch, list_files. */
      let totalToolPii = 0;
      const toolResults = await Promise.all(
        result.streamResult.toolUses.map(async (tu) => {
          const tier = resolveUserTier();
          try {
            const exec = await apexToolsDispatch.execute(tu.name, tu.input, tier);
            const rawContent = exec.ok
              ? JSON.stringify(exec.result ?? null)
              : `Error: ${exec.error ?? 'Tool execution failed'}`;
            /* Redact PII sur le content avant retour au LLM.
             * Limite : si un tool a légitimement besoin de PII (ex: send_email_to(addr)),
             * l'input du tool a déjà été validé côté apex-tools-dispatch.
             * Le RESULT par contre est unknown content → redaction systématique. */
            const r = redactPII(rawContent);
            totalToolPii += r.foundCount;
            return {
              type: 'tool_result' as const,
              tool_use_id: tu.id,
              content: r.redacted,
              is_error: !exec.ok,
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'unknown';
            return {
              type: 'tool_result' as const,
              tool_use_id: tu.id,
              content: `Error: ${msg}`,
              is_error: true,
            };
          }
        }),
      );
      if (totalToolPii > 0) {
        void auditLog.record('ai.pii_redacted_tool_result', {
          details: { count: totalToolPii, tools_count: result.streamResult.toolUses.length },
        });
        logger.info('ai-router', `PII redacted in tool_results: ${totalToolPii} occurrences`);
      }
      currentMessages.push({ role: 'user', content: toolResults });

      /* Notify UI que le batch de tools est terminé */
      wrappedOnChunk({
        text: '',
        done: false,
        provider: result.provider,
        type: 'tool_use_done',
        toolCount: result.streamResult.toolUses.length,
      });
      /* v13.4.200 : track si cette iter avait des tool_uses → si on sort de
       * la boucle avec ça à true c'est qu'on a atteint MAX_TOOL_USE_ITERATIONS
       * sans avoir laissé l'IA finir naturellement. */
      lastIterHadToolUses = true;
      if (iter === MAX_TOOL_USE_ITERATIONS - 1) {
        exitedByMaxIter = true;
      }
    }

    /* v13.4.200 (Kevin "Apex ne termine jamais, se coupe, ne modifie rien") :
     * Si on sort par saturation MAX_TOOL_USE_ITERATIONS sans message texte
     * final → l'IA était en train d'enchaîner des tools et a été coupée. Émet
     * un texte clair pour que Kevin VOIE que c'est une saturation, pas un
     * crash silencieux, et puisse relancer avec "continue". */
    if (exitedByMaxIter && lastIterHadToolUses && !lastErr) {
      const msg = `⚠️ J'ai atteint la limite de ${MAX_TOOL_USE_ITERATIONS} étapes d'outils sans terminer ta demande. Tape **"continue"** pour que je reprenne là où je me suis arrêté.\n\n_Cause probable : ta demande nécessite trop de lectures/écritures successives. Reformule en plus court ou découpe-la en sous-étapes._`;
      wrappedOnChunk({ text: msg, done: false, provider: lastProvider });
      logger.warn('ai-router', 'tool_use loop saturé MAX_TOOL_USE_ITERATIONS', { max: MAX_TOOL_USE_ITERATIONS });
    }

    /* Sortie naturelle : tool_use loop terminée OU failover échoué */
    if (!lastErr) {
      /* Loop terminée par succès ou MAX_ITER atteint — final done chunk */
      this.currentAbort = null;
      wrappedOnChunk({ text: '', done: true, provider: lastProvider });
      return;
    }

    this.currentAbort = null;
    const finalErr = lastErr;
    errors.capture(finalErr);

    /* WIRE chat-fallback : génère réponse actionnable au lieu de message vide
     * (règle CLAUDE.md absolue : JAMAIS message vide) */
    const userLastMsg = truncatedMessages[truncatedMessages.length - 1];
    const userText =
      typeof userLastMsg?.content === 'string'
        ? userLastMsg.content
        : JSON.stringify(userLastMsg?.content ?? '');
    const fallback = chatFallback.generateFallback(userText, finalErr.message);
    /* Stream le fallback en chunks pour cohérence UI typing animation */
    onChunk({ text: fallback.text, done: false, provider: 'anthropic' });
    onChunk({ text: '', done: true, provider: 'anthropic' });
    /* v13.3.47 : passe l'erreur ORIGINALE — le caller (chat handler) appellera
     * toUserMessage() une seule fois. Évite le doublage "(admin debug) (admin debug)". */
    onError?.(finalErr instanceof Error ? finalErr : new Error(String(finalErr)));
  }

  /**
   * v13.4.364 (Kevin « Utilise toutes les IA dispo. Orchestre d'IA ») —
   * Stream depuis UN provider PRÉCIS, sans failover cross-provider.
   * La primitive manquante pour l'orchestration multi-IA : avant, crew-experts
   * passait par stream() (chaîne de failover) → tous les « experts » tapaient
   * en réalité la MÊME IA. Ici : rotation de clés + route proxy incluses
   * (streamWithKeyFailover), mais on reste sur le provider demandé.
   */
  async streamSingle(
    provider: Provider,
    messages: ChatMessage[],
    system: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<{ ok: true; text: string; provider: Provider } | { ok: false; error: string; provider: Provider }> {
    const ctrl = new AbortController();
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    try {
      const result = await this.streamWithKeyFailover(provider, messages, system, onChunk, ctrl.signal);
      if (result.status === 'aborted') return { ok: false, error: 'aborted', provider };
      if (result.status === 'error') return { ok: false, error: result.error.message.slice(0, 300), provider };
      return { ok: true, text: result.streamResult.assistantText, provider };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg.slice(0, 300), provider };
    }
  }

  /**
   * Exécute UNE itération du failover : essaie chaque provider de la chain
   * jusqu'à un succès. Retourne le résultat structuré (texte + tools).
   * - aborted=true si AbortError reçu
   * - error=Error si tous providers ont échoué
   * - sinon { streamResult, provider }
   */
  private async streamWithFailover(
    chain: readonly Provider[],
    messages: ChatMessage[],
    system: string,
    onChunk: (chunk: StreamChunk) => void,
    signal: AbortSignal,
  ): Promise<
    | { status: 'aborted' }
    | { status: 'error'; error: Error }
    | { status: 'ok'; streamResult: ProviderStreamResult; provider: Provider }
  > {
    let lastErr: Error | null = null;
    /* Préférer erreurs informatives (HTTP/quota/rate-limit) sur "no key" génériques :
       quand un provider primaire échoue avec 429/quota et que les fallbacks n'ont pas
       de clé, on veut garder l'erreur 429 pour que chat-fallback propose la recharge. */
    const isInformativeErr = (e: Error): boolean =>
      /HTTP\s*\d|quota|rate.?limit|insufficient|429|402|401|403/i.test(e.message);
    /* P1.4 v13.3.81 (audit cascade) : log explicite ordre chain + chaque rotation
     * pour traçabilité opérationnelle. Permet vAdminAIChain de reconstituer flux. */
    logger.info('ai-router', 'failover chain start', { chain: chain.join('→') });
    for (let i = 0; i < chain.length; i += 1) {
      const provider = chain[i]!;
      const result = await this.streamWithKeyFailover(provider, messages, system, onChunk, signal);
      if (result.status === 'aborted') return { status: 'aborted' };
      if (result.status === 'ok') {
        if (i > 0) {
          logger.info('ai-router', `failover succeeded on ${provider} (position ${i + 1}/${chain.length})`);
        }
        return result;
      }
      const currentErr = result.error;
      if (!lastErr || (isInformativeErr(currentErr) && !isInformativeErr(lastErr))) {
        lastErr = currentErr;
      }
      const next = chain[i + 1];
      const httpStatus = (currentErr.message.match(/HTTP\s*(\d{3})/) ?? [])[1] ?? 'unknown';
      logger.warn('ai-router', `failover ${provider}→${next ?? 'END'} (status=${httpStatus})`, {
        err: currentErr.message,
      });
    }
    return { status: 'error', error: lastErr ?? new Error('Tous les providers IA indisponibles') };
  }

  /**
   * Sprint 9 (Kevin règle multi-key) : essaie toutes les clés d'un provider.
   * Si 1ère clé fail → mark via multiKeyVault.tryFailoverKey + retry avec 2ème clé.
   * Maximum 5 tentatives par provider (anti-boucle).
   *
   * v13.3.x (Kevin 2026-05-08 audit "anthropic+cohere+groq simultaneous fail") :
   * - Skip provider entièrement si marqué DEAD par ai-key-rotation (TTL 1h)
   * - Retry exponential backoff (2s/4s/8s) sur erreurs network/server avant rotate clé
   * - Wire ai-key-rotation.handleFailure pour classification + DEAD logic
   * - recordSuccess pour stats latency tracking
   */
  private async streamWithKeyFailover(
    provider: Provider,
    messages: ChatMessage[],
    system: string,
    onChunk: (chunk: StreamChunk) => void,
    signal: AbortSignal,
  ): Promise<
    | { status: 'aborted' }
    | { status: 'error'; error: Error }
    | { status: 'ok'; streamResult: ProviderStreamResult; provider: Provider }
  > {
    const MAX_KEY_ATTEMPTS = 5;
    /* Backoff: 2s, 4s, 8s sur erreurs network/server. Pas de backoff si auth/quota
     * (ces erreurs ne se résolvent pas en attendant — passer directement à la clé suivante). */
    const BACKOFF_MS = [2000, 4000, 8000] as const;
    let lastErr: Error | null = null;

    /* DEAD provider check — si marqué DEAD < 1h, skip direct vers fallback */
    try {
      const { aiKeyRotation } = await import('./ai-key-rotation.js');
      const serviceName = this.providerToService(provider);
      if (aiKeyRotation.isProviderDead(serviceName)) {
        logger.info('ai-router', `${provider} skipped (DEAD until ${new Date(aiKeyRotation.getDeadUntil(serviceName)).toISOString()})`);
        /* v13.4.339 diag : trace le skip DEAD (visible Diagnostic Coffre) SANS écraser
         * le message d'échec ORIGINEL (celui qui a causé la marque DEAD) s'il existe. */
        try {
          const { getLastAiFails, recordLastAiFail } = await import('./last-ai-fail.js');
          if (!getLastAiFails()[provider]) {
            recordLastAiFail(provider, `skip DEAD jusqu'à ${new Date(aiKeyRotation.getDeadUntil(serviceName)).toLocaleTimeString()} (échec originel non capturé — antérieur à v339)`);
          }
        } catch { /* ignore */ }
        return { status: 'error', error: new Error(`${provider} DEAD (provider marked unhealthy)`) };
      }
    } catch {
      /* ai-key-rotation absent → continue normalement */
    }

    /* Tente d'abord via multi-key-vault */
    const multiResult = await this.getApiKeyWithId(provider);
    if (multiResult) {
      let currentKeyId: string | null = multiResult.keyId;
      let currentKey = multiResult.plaintext;
      for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt += 1) {
        if (!currentKey || !currentKeyId) break;
        const tStart = Date.now();
        try {
          const streamResult = await this.streamFromProvider(
            provider,
            currentKey,
            messages,
            system,
            onChunk,
            signal,
          );
          /* Wire stats : record latency + success */
          try {
            const { aiKeyRotation } = await import('./ai-key-rotation.js');
            aiKeyRotation.recordSuccess(provider as 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini', Date.now() - tStart);
          } catch {
            /* ignore */
          }
          /* v13.4.339 diag : succès → efface le dernier échec (entrée jamais périmée) */
          try { (await import('./last-ai-fail.js')).clearLastAiFail(provider); } catch { /* ignore */ }
          return { status: 'ok', streamResult, provider };
        } catch (err: unknown) {
          const e = err instanceof Error ? err : new Error(String(err));
          if (e.name === 'AbortError') return { status: 'aborted' };
          lastErr = e;
          /* v13.4.339 diag : capture l'échec EXACT (message + status) → Diagnostic Coffre */
          try {
            const { recordLastAiFail } = await import('./last-ai-fail.js');
            recordLastAiFail(provider, e.message, this.parseHttpStatus(e.message));
          } catch { /* ignore */ }

          /* Classifie pour décider rotate vs backoff */
          let shouldBackoff = false;
          try {
            const { classifyError } = await import('./ai-key-rotation.js');
            const status = this.parseHttpStatus(e.message);
            const cls = classifyError({ status, message: e.message });
            shouldBackoff = cls === 'server_error' || cls === 'network';
          } catch {
            shouldBackoff = /HTTP\s*5\d\d|timeout|network|fetch failed/i.test(e.message);
          }

          /* Backoff sur erreurs transitoires AVANT de bruler la clé suivante.
           * v13.4.8 fix M6 (Ultra Review) — jitter ±30% pour éviter thundering
           * herd quand plusieurs onglets/devices retry au même tick. */
          if (shouldBackoff && attempt < BACKOFF_MS.length) {
            const baseDelay = BACKOFF_MS[attempt]!;
            const jitter = Math.random() * baseDelay * 0.3;
            const delay = Math.round(baseDelay + jitter);
            logger.info('ai-router', `${provider} transient error, backoff ${delay}ms (base ${baseDelay} +jitter)`, { attempt: attempt + 1, err: e.message });
            await this.sleep(delay, signal);
            if (signal.aborted) return { status: 'aborted' };
            continue; /* retry MÊME clé après backoff */
          }

          /* Erreur permanente (auth/quota/rate-limit) → rotate next key */
          try {
            const { multiKeyVault } = await import('../vault/multi-key-vault.js');
            const serviceName = this.providerToService(provider);
            const next = await multiKeyVault.tryFailoverKey(serviceName, currentKeyId, e.message);
            if (!next) {
              logger.info('ai-router', `${provider} no more keys to try (after ${attempt + 1})`);
              /* Marque provider DEAD via ai-key-rotation pour informer prochain appel */
              try {
                const { aiKeyRotation } = await import('./ai-key-rotation.js');
                await aiKeyRotation.handleFailure(
                  provider as 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini',
                  currentKeyId ?? undefined,
                  { status: this.parseHttpStatus(e.message), message: e.message },
                );
              } catch {
                /* ignore */
              }
              break;
            }
            currentKeyId = next.keyId;
            currentKey = next.plaintext;
            logger.info('ai-router', `${provider} key failover → next key (attempt ${attempt + 2}/${MAX_KEY_ATTEMPTS})`);
          } catch {
            break;
          }
        }
      }
    } else {
      /* Pas de multi-key dispo : fallback legacy single-key.
       * Comportement identique à v13.3.x avant cette feature pour back-compat tests :
       * pas de retry/backoff (le failover provider-level prend le relais via la chain). */
      const key = await this.getApiKeyDecrypted(provider);
      if (!key && provider !== 'gemini') {
        /* Pas de clé locale : OK uniquement si le proxy serveur couvre ce provider
         * (streamFromProvider routera via tryProxyRoute avec auth PIN, clés server-side).
         * Sinon erreur "no key" (comportement historique).
         *
         * v13.4.340 (Kevin « toujours openai » — audit Apex « aucun provider détecté ») :
         * proxyCoversProvider dépend d'un HEALTH réseau. getProxyHealth ne cache QUE
         * les succès → un health raté au 1er provider de la chaîne (anthropic, cold
         * start/timeout ponctuel) le faisait skip « no key » SILENCIEUSEMENT, puis le
         * health RETENTÉ pour openai réussissait → openai répond. Répété → anthropic
         * marqué DEAD 1h → badge openai permanent. FIX : quand le FLAG proxy est ON,
         * on est OPTIMISTE — on tente quand même (tryProxyRoute refait son health ;
         * si le worker est vraiment down, l'erreur réelle est capturée et VISIBLE au
         * Diagnostic au lieu d'un skip muet). Le skip « no key » ne reste que si le
         * proxy est explicitement désactivé. */
        if (!(await this.proxyCoversProvider(provider))) {
          const flag = localStorage.getItem(PROXY_FLAG_KEY);
          const proxyFlagOn = flag === 'true' || flag === '1';
          if (!proxyFlagOn) {
            try {
              const { recordLastAiFail } = await import('./last-ai-fail.js');
              recordLastAiFail(provider, 'no key locale + proxy désactivé (flag off)');
            } catch { /* ignore */ }
            return { status: 'error', error: lastErr ?? new Error(`${provider} no key`) };
          }
          logger.info('ai-router', `${provider} sans clé locale + health proxy KO ponctuel → tentative proxy optimiste (v340)`);
        }
      }
      const tStart = Date.now();
      try {
        const streamResult = await this.streamFromProvider(provider, key, messages, system, onChunk, signal);
        /* Wire stats : record latency + success même en path legacy */
        try {
          const { aiKeyRotation } = await import('./ai-key-rotation.js');
          aiKeyRotation.recordSuccess(provider as 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini', Date.now() - tStart);
        } catch {
          /* ignore */
        }
        /* v13.4.339 diag : succès → efface le dernier échec */
        try { (await import('./last-ai-fail.js')).clearLastAiFail(provider); } catch { /* ignore */ }
        return { status: 'ok', streamResult, provider };
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (e.name === 'AbortError') return { status: 'aborted' };
        lastErr = e;
        /* v13.4.339 diag : capture l'échec EXACT (message + status) → Diagnostic Coffre */
        try {
          const { recordLastAiFail } = await import('./last-ai-fail.js');
          recordLastAiFail(provider, e.message, this.parseHttpStatus(e.message));
        } catch { /* ignore */ }
        /* Record fail mais sans rotation (pas de keyId multi-key dispo) */
        try {
          const { aiKeyRotation } = await import('./ai-key-rotation.js');
          await aiKeyRotation.handleFailure(
            provider as 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini',
            undefined,
            { status: this.parseHttpStatus(e.message), message: e.message },
          );
        } catch {
          /* ignore */
        }
      }
    }
    return { status: 'error', error: lastErr ?? new Error(`${provider} all keys failed`) };
  }

  /* Note : BACKOFF_MS, parseHttpStatus, sleep restent disponibles pour le path multi-key
   * où la rotation key-level utilise le retry exponential. */

  /** Parse "anthropic HTTP 429: ..." → 429. Renvoie undefined si non trouvé. */
  private parseHttpStatus(msg: string): number | undefined {
    const m = /HTTP\s+(\d{3})/i.exec(msg);
    return m ? Number.parseInt(m[1]!, 10) : undefined;
  }

  /**
   * Sleep abortable pour exponential backoff. Si AbortSignal abort() pendant attente,
   * resolve immédiatement (caller détecte via signal.aborted).
   */
  private async sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Map provider → model key pour pricing.
   */
  private getModelKey(provider: Provider): string {
    switch (provider) {
      case 'anthropic':
        return 'anthropic_sonnet';
      case 'groq':
        return 'groq_llama';
      case 'gemini':
        return 'gemini_pro';
      case 'qwen':
        return 'qwen_cf'; /* v13.4.366 : gratuit (Workers AI) */
      case 'openrouter':
      case 'openclaw':
      default:
        return 'openrouter_default';
    }
  }

  abort(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
  }

  private getChainOrder(): readonly Provider[] {
    try {
      const stored = localStorage.getItem('apex_v13_failover_chain');
      if (stored) {
        const parsed = JSON.parse(stored) as Provider[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_CHAIN;
  }

  /**
   * v13.3.33 (Kevin "teste et garde ce qui marche le mieux") :
   * Détecte task type depuis dernier message user pour smart-router affinity.
   * - "explique", "pourquoi", "raisonne" → reasoning
   * - "code", "fonction", "bug", "fix" → code
   * - "résume vite", "rapide", "court" → fast
   * - "moins cher", "économique", "free" → cheap
   * - défaut → creative (générique)
   */
  private detectTaskType(text: string): import('./smart-router.js').TaskType {
    const t = text.toLowerCase();
    if (/\b(code|fonction|bug|fix|debug|refactor|typescript|javascript|python|rust)\b/.test(t)) return 'code';
    if (/\b(explique|pourquoi|raisonne|analyse|comprends|déduire|logique)\b/.test(t)) return 'reasoning';
    if (/\b(rapide|vite|court|résume|résumer|summary)\b/.test(t)) return 'fast';
    if (/\b(moins cher|économique|free|gratuit|cheap|budget)\b/.test(t)) return 'cheap';
    return 'creative';
  }

  /**
   * Wire ai-routing-policy : décide primary + fallback chain selon
   * mode (auto/economy/premium/forced), domain détecté, budget Anthropic.
   * Map policy.ProviderId → router.Provider (drop providers non supportés).
   * Fallback sur DEFAULT_CHAIN si policy indisponible.
   *
   * v13.3.33 — Smart Router prefix : avant d'appeler policy, on demande à
   * smartRouter le best provider courant (multi-critères : latence/quota/
   * qualité/uptime). Si dispo et différent de policy.primary → prefix.
   * Garde 100% backward-compat : si smart-router KO, fallback policy normal.
   */
  private async buildPolicyAwareChain(messages: ChatMessage[]): Promise<readonly Provider[]> {
    try {
      const { aiRoutingPolicy } = await import('./ai-routing-policy.js');
      /* Détecte domain depuis dernier message user (heuristique policy) */
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const userText =
        typeof lastUser?.content === 'string'
          ? lastUser.content
          : JSON.stringify(lastUser?.content ?? '');
      const domain = aiRoutingPolicy.detectDomain(userText);
      const estimatedTokens = Math.ceil(JSON.stringify(messages).length / 4);
      const decision = aiRoutingPolicy.decide(domain, estimatedTokens);
      logger.info('ai-router', 'policy decision', {
        domain,
        primary: decision.primary,
        reason: decision.reason,
        fallback_count: decision.fallback_chain.length,
      });
      /* SOC2 audit trail : policy decision (sécu trace pour compliance) */
      void auditLog.record('ai.routing_policy_decision', {
        details: {
          domain,
          primary: decision.primary,
          reason: decision.reason,
          fallback_count: decision.fallback_chain.length,
          tokens: estimatedTokens,
        },
      });
      /* Map policy ProviderId → router Provider (filtre supportés) */
      /* v13.4.366 : qwen (Workers AI via proxy) supporté nativement — sans lui ici, la décision
       * policy « qwen en principal » serait silencieusement ignorée (déclaré ≠ déployé, #28). */
      const supported: readonly Provider[] = ['anthropic', 'qwen', 'openai', 'openrouter', 'groq', 'gemini', 'openclaw'];
      const mapToRouter = (p: string): Provider | null => {
        if ((supported as readonly string[]).includes(p)) return p as Provider;
        /* Providers policy non implémentés ai-router : openai, deepseek, cohere, mistral, perplexity
         * → fallback vers openrouter (proxy universel) si dispo */
        if (['openai', 'deepseek', 'cohere', 'mistral', 'perplexity'].includes(p)) return 'openrouter';
        return null;
      };
      const ordered: Provider[] = [];
      const seen = new Set<Provider>();
      const push = (p: string): void => {
        const mapped = mapToRouter(p);
        if (mapped && !seen.has(mapped)) {
          seen.add(mapped);
          ordered.push(mapped);
        }
      };
      /* v13.3.33 — Smart Router prefix.
       * Si smartRouter dispose d'un best provider scored > 70 ET supporté ai-router,
       * on le met en TÊTE devant decision.primary. Override admin (Kevin "force X")
       * géré via getOverride() dans smartRouter — bypass tout.
       *
       * v13.4.337 (Kevin « toujours openai » malgré premium v336) : en mode 'premium'
       * ou 'forced', l'admin a EXPLICITEMENT choisi son provider (Anthropic par défaut
       * pour Kevin). Le smart-router NE DOIT PAS le ré-ordonner — sinon il remet openai
       * en tête après quelques succès openai, exactement le drift que premium corrige.
       * Le smart-router reste actif en 'auto'/'economy' (optimisation clients). */
      const policyMode = aiRoutingPolicy.getMode();
      /* v13.4.362 : 'free-smart' respecte aussi la décision policy (gratuit/Anthropic
       * selon la question) → le smart-router ne doit pas la ré-ordonner vers openai. */
      const skipSmartPrefix = policyMode === 'premium' || policyMode === 'forced' || policyMode === 'free-smart';
      try {
        if (skipSmartPrefix) throw new Error('skip:explicit-mode');
        const { smartRouter } = await import('./smart-router.js');
        const taskType = this.detectTaskType(userText);
        const smartBest = await smartRouter.getBest(taskType);
        const smartScore = await smartRouter.scoreProvider(smartBest);
        const mappedSmart = mapToRouter(smartBest);
        /* Seuil 50/100 : si data trop neuve ou tout faible, on laisse policy gérer */
        if (mappedSmart && smartScore.total >= 50) {
          push(mappedSmart);
          logger.info('ai-router', 'smart-router prefix', {
            best: smartBest,
            score: smartScore.total,
            mapped: mappedSmart,
            taskType,
          });
        }
      } catch (err: unknown) {
        if (!skipSmartPrefix) {
          logger.warn('ai-router', 'smart-router unavailable, fallback policy only', { err });
        }
        /* skipSmartPrefix : sortie volontaire (premium/forced) → pas un warning */
      }

      push(decision.primary);
      for (const f of decision.fallback_chain) push(f);
      /* Append legacy chain in queue pour garantir failover total même si policy ne couvre pas tout */
      for (const p of this.getChainOrder()) push(p);
      return ordered.length > 0 ? ordered : DEFAULT_CHAIN;
    } catch (err: unknown) {
      logger.warn('ai-router', 'policy unavailable, fallback DEFAULT_CHAIN', { err });
      return this.getChainOrder();
    }
  }

  /**
   * Stream une seule itération provider : émet text chunks + accumule tool_uses.
   * Retourne ProviderStreamResult avec assistantText accumulé + tool_uses détectés.
   *
   * Note : NE émet PAS de chunk `done: true` final — c'est le rôle de la boucle
   * stream() qui orchestre tool_use loop. Si tools, on continue ; sinon, done.
   */
  private async streamFromProvider(
    provider: Provider,
    apiKey: string,
    messages: ChatMessage[],
    system: string,
    onChunk: (chunk: StreamChunk) => void,
    signal: AbortSignal,
  ): Promise<ProviderStreamResult> {
    const cfg = PROVIDERS[provider];
    /* P0-2 fix : Gemini key DANS le header (déjà ci-dessus), URL ne contient QUE alt=sse */
    const directUrl = provider === 'gemini' ? `${cfg.endpoint}?alt=sse` : cfg.endpoint;
    const withTools = PROVIDERS_WITH_TOOLS.has(provider);
    /* v13.3.71 PERF : pré-load apex-tools si requis (sinon import statique alourdit boot).
     * Le buildBody synchrone consulte _apexTools déjà résolu ; aucune await dans la chaîne
     * critique de chunk streaming. */
    if (withTools && !_apexTools) {
      await loadApexTools();
    }
    /* v13.4.130 (Kevin "intègre secrets GitHub à Apex") :
     * Si Cloudflare Worker proxy `apex-secrets-proxy` disponible → route via proxy
     * (clés API en env vars server-side, jamais exposées au client).
     * Sinon → fallback direct fetch avec clé vault local (comportement actuel).
     * Health check caché 5min pour éviter spam. */
    const proxyRoute = await tryProxyRoute(provider, directUrl);
    /* v13.4.341 (Kevin « Tjs OpenAI » — cause racine FINALE) : sans clé locale ET
     * proxy indisponible À CET INSTANT (PIN vault pas lisible = course au boot,
     * ou health KO), l'ancien code faisait un fetch DIRECT api.anthropic.com avec
     * une clé VIDE → 401 « invalid x-api-key » → classé auth → provider marqué
     * DEAD 1h → badge openai permanent + bannière « clés expirées » MENSONGÈRE.
     * FIX : JAMAIS de direct sans clé — erreur EXPLICITE (classée transitoire →
     * backoff/retry, pas DEAD-auth) + capturée par last-ai-fail (Diagnostic 🧨). */
    if (!apiKey && !proxyRoute && provider !== 'gemini') {
      /* « network » DANS le message = classifyError → 'network' → backoff/retry,
       * JAMAIS markDead (c'est bien un souci transitoire réseau/boot, pas une clé HS). */
      throw new Error(`${provider} network: proxy indisponible à cet instant (PIN vault non lisible ou health KO) — retry auto`);
    }
    const url = proxyRoute?.url ?? directUrl;
    const headers = proxyRoute?.headers ?? cfg.headers(apiKey);
    let res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(cfg.buildBody(messages, system, { withTools })),
      signal,
    });
    /* v13.4.130 fallback : si proxy a fail HTTP 5xx, retry direct avec clé vault local */
    if (proxyRoute && !res.ok && res.status >= 500) {
      logger.warn('ai-router', `proxy fail HTTP ${res.status} → fallback direct fetch`, { provider });
      res = await fetch(directUrl, {
        method: 'POST',
        headers: cfg.headers(apiKey),
        body: JSON.stringify(cfg.buildBody(messages, system, { withTools })),
        signal,
      });
    }
    if (!res.ok) {
      /* v13.3.49 — Decode body Anthropic pour error détaillée (Kevin urgent fix HTTP 400).
       * Avant : "anthropic HTTP 400" sans contexte → Kevin voyait juste "(admin debug)".
       * Maintenant : on parse {error: {type, message}} et propage le vrai message. */
      let detail = '';
      try {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text) as { error?: { type?: string; message?: string }; message?: string };
          detail = parsed.error?.message ?? parsed.message ?? text.slice(0, 200);
        } catch {
          detail = text.slice(0, 200);
        }
      } catch {
        detail = res.statusText || '';
      }
      logger.error('ai-router', `${provider} HTTP ${res.status}`, { detail, status: res.status });
      void auditLog.record('ai.http_error', {
        details: { provider, status: res.status, detail: detail.slice(0, 500) },
      });
      throw new Error(`${provider} HTTP ${res.status}: ${detail || 'no detail'}`);
    }
    if (!res.body) throw new Error(`${provider} no stream body`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    /* Accumulateurs pour result final */
    let assistantText = '';
    const toolAccumulators = new Map<number, ToolUseAccumulator>();
    const completedToolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    let stopReason: string | null = null;

    const finalizeBlock = (index: number): void => {
      const acc = toolAccumulators.get(index);
      if (!acc) return;
      let parsed: Record<string, unknown> = {};
      if (acc.inputJson.length > 0) {
        try {
          const v = JSON.parse(acc.inputJson) as unknown;
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            parsed = v as Record<string, unknown>;
          }
        } catch {
          /* JSON malformé du modèle — log mais continue avec input vide
             (Apex tools dispatch reçoit {} et peut renvoyer une erreur claire) */
          logger.warn('ai-router', 'tool_use input JSON parse failed', {
            tool: acc.name,
            json: acc.inputJson.slice(0, 200),
          });
        }
      }
      completedToolUses.push({ id: acc.id, name: acc.name, input: parsed });
      toolAccumulators.delete(index);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          /* Pas de done chunk ici — la boucle stream() gère la finalisation */
          return { assistantText, toolUses: completedToolUses, stopReason };
        }
        const ev = cfg.parseSSE(data);
        if (!ev) continue;

        switch (ev.kind) {
          case 'text':
            assistantText += ev.text;
            onChunk({ text: ev.text, done: false, provider, type: 'text' });
            break;
          case 'thinking':
            /* v13.4.355 : réflexion NATIVE — NE PAS ajouter à assistantText (ce n'est pas
             * la réponse). L'UI l'affiche dans un bloc repliable via type:'thinking'. */
            onChunk({ text: ev.text, done: false, provider, type: 'thinking' });
            break;
          case 'tool_use_start':
            toolAccumulators.set(ev.index, {
              index: ev.index,
              id: ev.id,
              name: ev.name,
              inputJson: '',
            });
            /* UI : pill 🔧 [name] discrète */
            onChunk({
              text: '',
              done: false,
              provider,
              type: 'tool_use_start',
              toolName: ev.name,
            });
            break;
          case 'tool_use_delta': {
            const acc = toolAccumulators.get(ev.index);
            if (acc) acc.inputJson += ev.partial_json;
            break;
          }
          case 'content_block_stop':
            finalizeBlock(ev.index);
            break;
          case 'message_delta':
            if (ev.stop_reason !== null) stopReason = ev.stop_reason;
            break;
          default:
            break;
        }
      }
    }

    /* Stream terminé sans [DONE] explicite (ex: providers OpenAI-compat) */
    return { assistantText, toolUses: completedToolUses, stopReason };
  }
}

export const aiRouter = new AIRouter();

/* Signal pour apex-self-audit (évite cycle import) — ai-router ready à boot. */
(globalThis as { __APEX_AI_ROUTER_READY__?: boolean }).__APEX_AI_ROUTER_READY__ = true;
