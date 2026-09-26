/**
 * Apex Chat — IA Worker
 *
 * Endpoints :
 *   POST /ia/chat        Streaming SSE chat avec failover Anthropic→OpenRouter→Gemini→Groq→OpenAI
 *   POST /ia/translate   Traduction live (cache aggressif KV)
 *   POST /ia/summarize   Résumé fil long
 *   POST /ia/embed       Embedding pour recherche sémantique
 *
 * Cache LRU dans KV APEX_CHAT_CACHE (clé = SHA256(prompt+context), TTL 24h)
 * Hit rate cible : 60-70% — divise coûts par 7
 *
 * Failover chain (cohérent avec Apex) :
 *   1. Anthropic Claude Sonnet 4.6 / Haiku 4.5
 *   2. OpenRouter (claude / gemini / llama)
 *   3. Gemini 2.5 Pro / Flash
 *   4. Groq Llama 3.3 70B (gratuit rapide)
 *   5. OpenAI GPT-4o-mini (fallback)
 */

import { corsHeaders, makeJson, applyCors } from './lib/cors.js';

const CORS = corsHeaders('POST, OPTIONS', 'Content-Type, Authorization');

const json = makeJson(CORS);

function err(message, status = 400) {
  return json({ error: 'error', message }, status);
}

async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
//  Cache LRU via KV
// ============================================================================

async function cacheGet(env, key) {
  if (!env.APEX_CHAT_CACHE) return null;
  try {
    const cached = await env.APEX_CHAT_CACHE.get(`ia:${key}`, 'json');
    if (cached && cached.expires_at > Date.now()) {
      return cached.value;
    }
  } catch {}
  return null;
}

async function cacheSet(env, key, value, ttlSeconds = 86400) {
  if (!env.APEX_CHAT_CACHE) return;
  try {
    await env.APEX_CHAT_CACHE.put(`ia:${key}`, JSON.stringify({
      value,
      expires_at: Date.now() + ttlSeconds * 1000
    }), { expirationTtl: ttlSeconds });
  } catch {}
}

// ============================================================================
//  Failover chain
// ============================================================================

export async function callAnthropic(messages, systemPrompt, env, signal) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt || '',
      messages: messages
    })
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

export async function callOpenRouter(messages, systemPrompt, env, signal) {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing');
  const fullMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4.5',
      messages: fullMessages,
      max_tokens: 1024
    })
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function callGemini(messages, systemPrompt, env, signal) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      contents
    })
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function callGroq(messages, systemPrompt, env, signal) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing');
  const fullMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: fullMessages,
      max_tokens: 1024
    })
  });
  if (!response.ok) throw new Error(`Groq ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function callOpenAI(messages, systemPrompt, env, signal) {
  // Supporte les 2 orthographes : OPEN_AI_API_KEY (secret Kevin) et OPENAI_API_KEY (standard)
  const key = env.OPEN_AI_API_KEY || env.OPENAI_API_KEY;
  if (!key) throw new Error('OPEN_AI_API_KEY missing');
  const fullMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: fullMessages,
      max_tokens: 1024
    })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// DeepSeek (eco - Kevin a configuré DEEPSEEK_API_KEY)
export async function callDeepSeek(messages, systemPrompt, env, signal) {
  if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY missing');
  const fullMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: fullMessages,
      max_tokens: 1024
    })
  });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Perplexity (Kevin a configuré PERPLEXITI_API_KEY avec typo)
export async function callPerplexity(messages, systemPrompt, env, signal) {
  // Supporte les 2 orthographes : PERPLEXITI_API_KEY (secret Kevin, typo) et PERPLEXITY_API_KEY
  const key = env.PERPLEXITI_API_KEY || env.PERPLEXITY_API_KEY;
  if (!key) throw new Error('PERPLEXITI_API_KEY missing');
  const fullMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar-small-online',
      messages: fullMessages,
      max_tokens: 1024
    })
  });
  if (!response.ok) throw new Error(`Perplexity ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// P0 FIX (audit) : failover PARALLEL race avec Promise.any et timeout 8s
// Worst-case latency : 8s (au lieu de 150s en série)
export async function callIAFailover(messages, systemPrompt, env) {
  const providers = [
    { name: 'anthropic', fn: callAnthropic, hasKey: !!env.ANTHROPIC_API_KEY },
    { name: 'groq', fn: callGroq, hasKey: !!env.GROQ_API_KEY },
    { name: 'gemini', fn: callGemini, hasKey: !!env.GEMINI_API_KEY },
    { name: 'deepseek', fn: callDeepSeek, hasKey: !!env.DEEPSEEK_API_KEY },
    { name: 'openrouter', fn: callOpenRouter, hasKey: !!env.OPENROUTER_API_KEY },
    { name: 'perplexity', fn: callPerplexity, hasKey: !!(env.PERPLEXITI_API_KEY || env.PERPLEXITY_API_KEY) },
    { name: 'openai', fn: callOpenAI, hasKey: !!(env.OPEN_AI_API_KEY || env.OPENAI_API_KEY) }
  ];

  const available = providers.filter(p => p.hasKey);
  if (available.length === 0) throw new Error('Aucun provider IA configuré');

  // Lance toutes les requêtes en parallèle avec timeout 8s chacune
  const promises = available.map(({ name, fn }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    return fn(messages, systemPrompt, env, controller.signal)
      .then(result => {
        clearTimeout(timeout);
        if (!result) throw new Error('Empty response');
        return { provider: name, content: result };
      })
      .catch(e => {
        clearTimeout(timeout);
        throw new Error(`${name}: ${e.message}`);
      });
  });

  // Promise.any : retourne la PREMIÈRE qui réussit (le plus rapide gagne)
  try {
    return await Promise.any(promises);
  } catch (aggregateError) {
    // Toutes ont échoué
    const errors = aggregateError.errors?.map(e => e.message).join('; ') || 'unknown';
    throw new Error('Tous les providers IA ont échoué : ' + errors);
  }
}

// ============================================================================
//  System prompt Apex Chat
// ============================================================================

function buildSystemPromptApexChat(context = {}) {
  return `Tu es Apex, l'assistant IA intégré dans Apex Chat (messagerie privée).

CONTEXTE :
- Utilisateur : ${context.user_pseudo || 'inconnu'} (${context.is_admin ? 'admin' : 'user'})
- Conversation : ${context.conv_type || 'directe'}
- Langue : ${context.lang || 'français'}

RÈGLES :
- Toujours en français (sauf si demande explicite traduction)
- Tutoiement, ton chaleureux et professionnel
- Réponses courtes et utiles (max 200 mots sauf si question complexe)
- JAMAIS d'erreur technique brute affichée à l'utilisateur
- Tu ne lis JAMAIS les messages chiffrés sans qu'on te les fournisse explicitement
- Tu peux : résumer, traduire, suggérer réponses, expliquer, anti-scam, recherche sémantique
- Tu ne peux PAS : envoyer messages, modifier comptes, accéder fichiers user (sauf demande explicite)

Si demande hors scope → propose alternative dans Apex (l'app principale).`;
}

// ============================================================================
//  Routes
// ============================================================================

async function handleChat(request, env) {
  const { messages, systemPrompt, context } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) return err('messages required');

  // Cache lookup
  const cacheKey = await sha256Hex(JSON.stringify({ messages: messages.slice(-3), systemPrompt: systemPrompt || '' }));
  const cached = await cacheGet(env, cacheKey);
  if (cached) {
    return json({ ok: true, content: cached.content, provider: cached.provider, cached: true });
  }

  try {
    const sysPrompt = systemPrompt || buildSystemPromptApexChat(context);
    const result = await callIAFailover(messages, sysPrompt, env);
    await cacheSet(env, cacheKey, result, 86400);
    return json({ ok: true, ...result, cached: false });
  } catch (e) {
    return err('Désolé, je ne suis pas disponible. Réessaie dans un instant. (' + e.message + ')', 503);
  }
}

async function handleTranslate(request, env) {
  const { text, target_lang, source_lang } = await request.json();
  if (!text || !target_lang) return err('text + target_lang required');

  const cacheKey = await sha256Hex(`translate:${source_lang}:${target_lang}:${text}`);
  const cached = await cacheGet(env, cacheKey);
  if (cached) return json({ ok: true, translation: cached.content, cached: true });

  const sysPrompt = `Tu es un traducteur professionnel. Traduis le texte de ${source_lang || 'auto'} vers ${target_lang}.
Retourne UNIQUEMENT la traduction, sans commentaire, sans guillemets, sans préfixe.`;

  try {
    const result = await callIAFailover([{ role: 'user', content: text }], sysPrompt, env);
    await cacheSet(env, cacheKey, result, 30 * 86400);  // 30j cache traduction
    return json({ ok: true, translation: result.content, provider: result.provider, cached: false });
  } catch (e) {
    return err(e.message, 503);
  }
}

async function handleSummarize(request, env) {
  const { messages, max_words } = await request.json();
  if (!messages) return err('messages required');

  const sysPrompt = `Tu résumes un fil de conversation en français de manière concise et fidèle.
Maximum ${max_words || 100} mots. Style : factuel, sans interprétation.`;

  const conversation = messages.map(m => `${m.from}: ${m.text}`).join('\n');
  try {
    const result = await callIAFailover(
      [{ role: 'user', content: 'Résume ce fil :\n\n' + conversation }],
      sysPrompt,
      env
    );
    return json({ ok: true, summary: result.content, provider: result.provider });
  } catch (e) {
    return err(e.message, 503);
  }
}

async function handleEmbed(request, env) {
  const { text } = await request.json();
  if (!text) return err('text required');

  // Utiliser Workers AI pour embeddings (gratuit, intégré CF)
  if (!env.AI) return err('Workers AI non disponible', 501);
  try {
    const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [text] });
    return json({ ok: true, embedding: embedding.data?.[0] || [], model: 'bge-small-en-v1.5' });
  } catch (e) {
    return err(e.message, 500);
  }
}

// ============================================================================
//  Main fetch
// ============================================================================

// SÉCU (scan-and-fix 2026) — ce worker proxifie les clés IA PAYANTES de Kevin.
// La logique live est fusionnée dans api-worker (handleIAChat, déjà gardé par getAuthUser) ;
// ce worker autonome n'est plus déployé. Mais s'il l'était nu, /ia/* = abus financier
// anonyme. FAIL-CLOSED : les endpoints payants exigent le jeton de service interne
// (même modèle que sms-worker X-Apex-Sms-Token et l'appel DO /admin/inject-message).
function _requireInternal(request, env) {
  const secret = (env.APEX_CHAT_ADMIN_TOKEN || '').trim();
  if (!secret) return false; // mal configuré → fail-closed
  const got = (request.headers.get('X-Apex-Internal') || '').trim();
  return got === secret;
}

const _workerHandler = {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;

    // Endpoints IA payants → jeton de service obligatoire (health/info restent ouverts).
    const isPaidIA = request.method === 'POST' &&
      (path === '/ia/chat' || path === '/ia/translate' || path === '/ia/summarize' || path === '/ia/embed');
    if (isPaidIA && !_requireInternal(request, env)) return err('Unauthorized', 401);

    try {
      if (path === '/ia/chat' && request.method === 'POST') return await handleChat(request, env);
      if (path === '/ia/translate' && request.method === 'POST') return await handleTranslate(request, env);
      if (path === '/ia/summarize' && request.method === 'POST') return await handleSummarize(request, env);
      if (path === '/ia/embed' && request.method === 'POST') return await handleEmbed(request, env);
      if (path === '/health' || path === '/') return json({ ok: true, version: '1.0.0', providers: ['anthropic', 'openrouter', 'gemini', 'groq', 'openai'] });
      return err('Not found', 404);
    } catch (e) {
      return err(e.message, 500);
    }
  }
};

// ============================================================================
//  CORS par ORIGINE (audit P2b, v1.1.287)
//  Le worker répondait `Access-Control-Allow-Origin: *` à tout le monde. On
//  applique la liste d'origines réelles en UN SEUL point — le `fetch` de tête —
//  au lieu de toucher chaque site d'appel : zéro risque de rater une réponse.
// ============================================================================
export default {
  ..._workerHandler,
  async fetch(request, env, ctx) {
    return applyCors(request, await _workerHandler.fetch(request, env, ctx));
  },
};
