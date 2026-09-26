/**
 * Tests workers/ia-worker.js — IA failover (Anthropic/OpenRouter/Gemini/Groq/OpenAI/DeepSeek/Perplexity)
 * 100% coverage v8 via mocks fetch + KV.
 */
import { withOrigin } from './api-worker-helpers.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, {
  callAnthropic, callOpenRouter, callGemini, callGroq, callOpenAI,
  callDeepSeek, callPerplexity, callIAFailover,
} from '../../workers/ia-worker.js';

function makeKV() {
  const store = new Map();
  return {
    get: vi.fn(async (k, type) => {
      if (!store.has(k)) return null;
      return type === 'json' ? JSON.parse(store.get(k)) : store.get(k);
    }),
    put: vi.fn(async (k, v) => { store.set(k, v); }),
    _store: store,
  };
}

const ENV = (overrides = {}) => ({
  ANTHROPIC_API_KEY: 'anth-key',
  OPENROUTER_API_KEY: 'or-key',
  GEMINI_API_KEY: 'gem-key',
  GROQ_API_KEY: 'groq-key',
  OPENAI_API_KEY: 'oai-key',
  DEEPSEEK_API_KEY: 'ds-key',
  PERPLEXITI_API_KEY: 'pplx-key',
  APEX_CHAT_ADMIN_TOKEN: 'admin-tok',
  APEX_CHAT_CACHE: makeKV(),
  ...overrides,
});

function makeRequest({ method = 'POST', path = '/ia/chat', body = {}, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['X-Apex-Internal'] = 'admin-tok'; // jeton de service interne (fail-closed)
  return new Request('https://ia.apex/' + path.replace(/^\//, ''), {
    method,
    headers,
    body: method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Default fetch : retourne success Anthropic
  globalThis.fetch = vi.fn(async (url) => {
    if (url.includes('anthropic.com')) {
      return new Response(JSON.stringify({ content: [{ text: 'reply from anthropic' }] }));
    }
    if (url.includes('openrouter.ai')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'reply or' } }] }));
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'reply gemini' }] } }] }));
    }
    if (url.includes('groq.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'reply groq' } }] }));
    }
    if (url.includes('openai.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'reply oai' } }] }));
    }
    if (url.includes('deepseek.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'reply ds' } }] }));
    }
    if (url.includes('perplexity.ai')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'reply pplx' } }] }));
    }
    return new Response('not mocked', { status: 500 });
  });
});

// ----------------------------------------------------------------------------
describe('ia-worker — routing', () => {
  it('OPTIONS → CORS', async () => {
    // v1.1.287 (audit P2b) : origine autorisée renvoyée, inconnue refusée.
    const ok = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS' }), 'https://apex-chat.kd-mc.com'), ENV());
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://apex-chat.kd-mc.com');
    const ko = await worker.fetch(withOrigin(makeRequest({ method: 'OPTIONS' }), 'https://evil.example'), ENV());
    expect(ko.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /health → ok+providers', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/health' }), ENV());
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.providers).toContain('anthropic');
  });

  it('GET / → ok', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/' }), ENV());
    expect((await r.json()).ok).toBe(true);
  });

  it('route inconnue → 404', async () => {
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/xyz' }), ENV());
    expect(r.status).toBe(404);
  });

  it('exception → 500', async () => {
    const badReq = new Request('https://ia.apex/ia/chat', { method: 'POST', body: 'not-json', headers: { 'X-Apex-Internal': 'admin-tok' } });
    const r = await worker.fetch(badReq, ENV());
    expect(r.status).toBe(500);
  });

  it('POST /ia/chat sans X-Apex-Internal → 401 (proxy IA payant fail-closed)', async () => {
    const r = await worker.fetch(makeRequest({ auth: false }), ENV());
    expect(r.status).toBe(401);
  });

  it('POST /ia/embed sans jeton → 401 (tous les endpoints payants gardés)', async () => {
    const r = await worker.fetch(makeRequest({ path: '/ia/embed', auth: false }), ENV());
    expect(r.status).toBe(401);
  });

  it('env sans APEX_CHAT_ADMIN_TOKEN → 401 (fail-closed si mal configuré)', async () => {
    const r = await worker.fetch(makeRequest({}), { APEX_CHAT_CACHE: makeKV() });
    expect(r.status).toBe(401);
  });
});

// ----------------------------------------------------------------------------
describe('ia-worker — POST /ia/chat', () => {
  it('messages manquants → 400', async () => {
    const r = await worker.fetch(makeRequest({ body: { messages: null } }), ENV());
    expect(r.status).toBe(400);
  });

  it('messages [] → 400', async () => {
    const r = await worker.fetch(makeRequest({ body: { messages: [] } }), ENV());
    expect(r.status).toBe(400);
  });

  it('chat success (Anthropic gagne race) → contenu retourné', async () => {
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'Hello' }], systemPrompt: 'You are X' } }),
      ENV(),
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.content).toBeTruthy();
    expect(b.cached).toBe(false);
  });

  it('chat avec cache hit → cached:true', async () => {
    const env = ENV();
    // Pré-rempli le cache
    const messages = [{ role: 'user', content: 'cached q' }];
    // Fait un premier appel pour peupler cache
    await worker.fetch(makeRequest({ body: { messages } }), env);
    globalThis.fetch.mockClear();
    // Deuxième appel : doit hit cache (pas de fetch IA)
    const r = await worker.fetch(makeRequest({ body: { messages } }), env);
    const b = await r.json();
    expect(b.cached).toBe(true);
  });

  it('chat sans context → utilise systemPrompt par défaut Apex', async () => {
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }),
      ENV(),
    );
    expect(r.status).toBe(200);
    // Vérifie que fetch a été appelé avec un systemPrompt non vide
    const call = globalThis.fetch.mock.calls.find(c => c[0].includes('anthropic.com')) ||
      globalThis.fetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.system || body.messages?.[0]?.content).toBeTruthy();
  });

  it('chat avec context user_pseudo + is_admin', async () => {
    const r = await worker.fetch(
      makeRequest({
        body: {
          messages: [{ role: 'user', content: 'X' }],
          context: { user_pseudo: 'kdmc', is_admin: true, conv_type: 'group', lang: 'fr' },
        },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
  });

  it('chat tous providers fail → 503', async () => {
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 }));
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }),
      ENV(),
    );
    expect(r.status).toBe(503);
  });

  it('aucune clé provider → 503 (Aucun provider configuré)', async () => {
    const env = { APEX_CHAT_ADMIN_TOKEN: 'admin-tok', APEX_CHAT_CACHE: makeKV() };
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }),
      env,
    );
    expect(r.status).toBe(503);
  });
});

// ----------------------------------------------------------------------------
describe('ia-worker — POST /ia/translate', () => {
  it('text/target_lang manquant → 400', async () => {
    const r = await worker.fetch(makeRequest({ path: '/ia/translate', body: {} }), ENV());
    expect(r.status).toBe(400);
  });

  it('translate success', async () => {
    const r = await worker.fetch(
      makeRequest({ path: '/ia/translate', body: { text: 'Hello', target_lang: 'fr', source_lang: 'en' } }),
      ENV(),
    );
    expect(r.status).toBe(200);
    expect((await r.json()).translation).toBeTruthy();
  });

  it('translate sans source_lang → utilise auto', async () => {
    const r = await worker.fetch(
      makeRequest({ path: '/ia/translate', body: { text: 'Hello', target_lang: 'fr' } }),
      ENV(),
    );
    expect(r.status).toBe(200);
  });

  it('translate cache hit', async () => {
    const env = ENV();
    const args = { text: 'Hello cached', target_lang: 'es' };
    await worker.fetch(makeRequest({ path: '/ia/translate', body: args }), env);
    globalThis.fetch.mockClear();
    const r = await worker.fetch(makeRequest({ path: '/ia/translate', body: args }), env);
    const b = await r.json();
    expect(b.cached).toBe(true);
  });

  it('translate provider fail → 503', async () => {
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 }));
    const r = await worker.fetch(
      makeRequest({ path: '/ia/translate', body: { text: 'X', target_lang: 'fr' } }),
      ENV(),
    );
    expect(r.status).toBe(503);
  });
});

// ----------------------------------------------------------------------------
describe('ia-worker — POST /ia/summarize', () => {
  it('messages manquants → 400', async () => {
    const r = await worker.fetch(makeRequest({ path: '/ia/summarize', body: {} }), ENV());
    expect(r.status).toBe(400);
  });

  it('summarize success avec max_words par défaut', async () => {
    const r = await worker.fetch(
      makeRequest({
        path: '/ia/summarize',
        body: { messages: [{ from: 'Kevin', text: 'salut' }, { from: 'Laurence', text: 'coucou' }] },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
    expect((await r.json()).summary).toBeTruthy();
  });

  it('summarize avec max_words custom', async () => {
    const r = await worker.fetch(
      makeRequest({
        path: '/ia/summarize',
        body: { messages: [{ from: 'A', text: 'x' }], max_words: 50 },
      }),
      ENV(),
    );
    expect(r.status).toBe(200);
  });

  it('summarize tous providers fail → 503', async () => {
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 }));
    const r = await worker.fetch(
      makeRequest({ path: '/ia/summarize', body: { messages: [{ from: 'X', text: 'y' }] } }),
      ENV(),
    );
    expect(r.status).toBe(503);
  });
});

// ----------------------------------------------------------------------------
describe('ia-worker — POST /ia/embed', () => {
  it('text manquant → 400', async () => {
    const r = await worker.fetch(makeRequest({ path: '/ia/embed', body: {} }), ENV());
    expect(r.status).toBe(400);
  });

  it('Workers AI manquant → 501', async () => {
    const r = await worker.fetch(makeRequest({ path: '/ia/embed', body: { text: 'hello' } }), ENV());
    expect(r.status).toBe(501);
  });

  it('embed success via Workers AI', async () => {
    const env = ENV();
    env.AI = { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) };
    const r = await worker.fetch(makeRequest({ path: '/ia/embed', body: { text: 'hello' } }), env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('embed sans data array → vide', async () => {
    const env = ENV();
    env.AI = { run: vi.fn(async () => ({})) };
    const r = await worker.fetch(makeRequest({ path: '/ia/embed', body: { text: 'hello' } }), env);
    const b = await r.json();
    expect(b.embedding).toEqual([]);
  });

  it('embed AI throw → 500', async () => {
    const env = ENV();
    env.AI = { run: vi.fn(async () => { throw new Error('AI down'); }) };
    const r = await worker.fetch(makeRequest({ path: '/ia/embed', body: { text: 'hello' } }), env);
    expect(r.status).toBe(500);
  });
});

// ----------------------------------------------------------------------------
describe('ia-worker — coverage individuels providers (chemins de chaque callX)', () => {
  // Pour atteindre 100% functions, il faut que chaque callXxx soit invoqué.
  // En Promise.any le plus rapide gagne ; mais tous sont LANCÉS donc tous covered.
  // On vérifie via fetch.mock.calls que tous les hosts sont contactés.
  it('chat invoque tous les providers configurés en parallèle', async () => {
    const env = ENV();
    await worker.fetch(makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }), env);
    const urlsCalled = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urlsCalled.some(u => u.includes('anthropic.com'))).toBe(true);
    expect(urlsCalled.some(u => u.includes('openrouter.ai'))).toBe(true);
    expect(urlsCalled.some(u => u.includes('generativelanguage.googleapis.com'))).toBe(true);
    expect(urlsCalled.some(u => u.includes('groq.com'))).toBe(true);
    expect(urlsCalled.some(u => u.includes('deepseek.com'))).toBe(true);
    expect(urlsCalled.some(u => u.includes('perplexity.ai'))).toBe(true);
    expect(urlsCalled.some(u => u.includes('openai.com'))).toBe(true);
  });

  it('Perplexity utilise PERPLEXITY_API_KEY si PERPLEXITI absent', async () => {
    const env = ENV();
    delete env.PERPLEXITI_API_KEY;
    env.PERPLEXITY_API_KEY = 'pplx-correct';
    await worker.fetch(makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }), env);
    const pplxCall = globalThis.fetch.mock.calls.find(c => c[0].includes('perplexity'));
    expect(pplxCall[1].headers.Authorization).toBe('Bearer pplx-correct');
  });

  it('cacheGet KV erreur silencieuse → null', async () => {
    const env = ENV();
    env.APEX_CHAT_CACHE = {
      get: vi.fn(async () => { throw new Error('kv down'); }),
      put: vi.fn(async () => {}),
    };
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'fresh' }] } }),
      env,
    );
    expect(r.status).toBe(200);
    expect((await r.json()).cached).toBe(false);
  });

  it('cacheSet KV erreur silencieuse → no-op (pas de crash)', async () => {
    const env = ENV();
    env.APEX_CHAT_CACHE = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => { throw new Error('kv put fail'); }),
    };
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }),
      env,
    );
    expect(r.status).toBe(200);
  });

  it('chat sans KV cache (env.APEX_CHAT_CACHE undefined)', async () => {
    const env = ENV();
    delete env.APEX_CHAT_CACHE;
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }),
      env,
    );
    expect(r.status).toBe(200);
  });

  it('cacheGet expired → null (pas servi)', async () => {
    const env = ENV();
    // KV retourne entrée expirée
    env.APEX_CHAT_CACHE = {
      get: vi.fn(async () => ({ value: { content: 'old' }, expires_at: 1 })), // expired
      put: vi.fn(async () => {}),
    };
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }),
      env,
    );
    expect((await r.json()).cached).toBe(false);
  });

  it('callPerplexity sans systemPrompt → fullMessages = messages directement', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'pplx ok' } }] })));
    const r = await callPerplexity([{ role: 'user', content: 'X' }], null, { PERPLEXITI_API_KEY: 'k' }, undefined);
    expect(r).toBe('pplx ok');
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.messages).toEqual([{ role: 'user', content: 'X' }]); // pas de system prefix
  });

  it('callPerplexity content vide → "" string', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [] })));
    const r = await callPerplexity([{ role: 'user', content: 'X' }], 'sys', { PERPLEXITI_API_KEY: 'k' }, undefined);
    expect(r).toBe('');
  });

  it('callAnthropic content[0]?.text undefined → "" string', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [] })));
    const r = await callAnthropic([{ role: 'user', content: 'X' }], 'sys', { ANTHROPIC_API_KEY: 'k' }, undefined);
    expect(r).toBe('');
  });

  it('callOpenRouter sans systemPrompt → fullMessages = messages directement', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'or' } }] })));
    const r = await callOpenRouter([{ role: 'user', content: 'X' }], null, { OPENROUTER_API_KEY: 'k' });
    expect(r).toBe('or');
  });

  it('callGemini sans systemPrompt → systemInstruction=undefined', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'g' }] } }] })));
    const r = await callGemini([{ role: 'user', content: 'X' }], null, { GEMINI_API_KEY: 'k' });
    expect(r).toBe('g');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.systemInstruction).toBeUndefined();
  });

  it('callGemini message assistant → role mappé sur model', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'g' }] } }] })));
    await callGemini([{ role: 'assistant', content: 'X' }, { role: 'user', content: 'Y' }], 'sys', { GEMINI_API_KEY: 'k' });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.contents[0].role).toBe('model');
    expect(body.contents[1].role).toBe('user');
  });

  it('callGroq sans systemPrompt', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'g' } }] })));
    const r = await callGroq([{ role: 'user', content: 'X' }], undefined, { GROQ_API_KEY: 'k' });
    expect(r).toBe('g');
  });

  it('callOpenAI sans systemPrompt', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'o' } }] })));
    const r = await callOpenAI([{ role: 'user', content: 'X' }], undefined, { OPENAI_API_KEY: 'k' });
    expect(r).toBe('o');
  });

  it('callDeepSeek sans systemPrompt', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'd' } }] })));
    const r = await callDeepSeek([{ role: 'user', content: 'X' }], undefined, { DEEPSEEK_API_KEY: 'k' });
    expect(r).toBe('d');
  });

  it('callIAFailover aggregateError sans .errors → "unknown"', async () => {
    // Force le rejet AggregateError sans property errors
    const env = { ANTHROPIC_API_KEY: 'k' };
    globalThis.fetch = vi.fn(async () => { throw new Error(); }); // erreur sans message
    await expect(callIAFailover([{ role: 'user', content: 'X' }], 'sys', env)).rejects.toThrow();
  });

  it('callIAFailover Promise.any throw avec aggregateError.errors absent → fallback unknown', async () => {
    // Mock Promise.any pour forcer un AggregateError vide (sans errors property)
    const orig = Promise.any;
    Promise.any = async () => {
      const e = new Error('Custom aggregate');
      // Pas de .errors property
      throw e;
    };
    try {
      const env = { ANTHROPIC_API_KEY: 'k' };
      await expect(callIAFailover([{ role: 'user', content: 'X' }], 'sys', env)).rejects.toThrow(/unknown/);
    } finally {
      Promise.any = orig;
    }
  });

  it('callX retourne reponse vide → considéré comme échec', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('anthropic.com')) {
        return new Response(JSON.stringify({ content: [{ text: '' }] })); // empty
      }
      // Autres providers fail aussi pour éviter qu'ils gagnent la race
      return new Response('err', { status: 500 });
    });
    const r = await worker.fetch(
      makeRequest({ body: { messages: [{ role: 'user', content: 'X' }] } }),
      ENV({ ANTHROPIC_API_KEY: 'k' }),
    );
    expect(r.status).toBe(503);
  });

  it('callOpenAI content vide → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [] })));
    const r = await callOpenAI([{ role: 'user', content: 'X' }], 'sys', { OPENAI_API_KEY: 'k' });
    expect(r).toBe('');
  });

  it('callDeepSeek manque key → throw', async () => {
    await expect(callDeepSeek([{ role: 'user', content: 'X' }], 'sys', {})).rejects.toThrow('DEEPSEEK_API_KEY');
  });

  it('callDeepSeek content vide → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [] })));
    const r = await callDeepSeek([{ role: 'user', content: 'X' }], 'sys', { DEEPSEEK_API_KEY: 'k' });
    expect(r).toBe('');
  });

  it('callPerplexity manque les 2 keys → throw', async () => {
    await expect(callPerplexity([{ role: 'user', content: 'X' }], 'sys', {})).rejects.toThrow('PERPLEXITI');
  });

  it('callOpenRouter response not ok → throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('e', { status: 503 }));
    await expect(callOpenRouter([{ role: 'user', content: 'X' }], 'sys', { OPENROUTER_API_KEY: 'k' })).rejects.toThrow('OpenRouter 503');
  });

  it('callOpenRouter content vide → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [] })));
    const r = await callOpenRouter([{ role: 'user', content: 'X' }], 'sys', { OPENROUTER_API_KEY: 'k' });
    expect(r).toBe('');
  });

  it('callGemini response not ok → throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('e', { status: 500 }));
    await expect(callGemini([{ role: 'user', content: 'X' }], 'sys', { GEMINI_API_KEY: 'k' })).rejects.toThrow('Gemini');
  });

  it('callGemini content vide → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [] })));
    const r = await callGemini([{ role: 'user', content: 'X' }], 'sys', { GEMINI_API_KEY: 'k' });
    expect(r).toBe('');
  });

  it('callGroq content vide → ""', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [] })));
    const r = await callGroq([{ role: 'user', content: 'X' }], 'sys', { GROQ_API_KEY: 'k' });
    expect(r).toBe('');
  });

  it('callAnthropic response not ok → throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('e', { status: 401 }));
    await expect(callAnthropic([{ role: 'user', content: 'X' }], 'sys', { ANTHROPIC_API_KEY: 'k' })).rejects.toThrow('Anthropic 401');
  });

  it('toutes les call* sans key throw', async () => {
    await expect(callAnthropic([], '', {})).rejects.toThrow();
    await expect(callOpenRouter([], '', {})).rejects.toThrow();
    await expect(callGemini([], '', {})).rejects.toThrow();
    await expect(callGroq([], '', {})).rejects.toThrow();
    await expect(callOpenAI([], '', {})).rejects.toThrow();
  });

  it('callAnthropic systemPrompt undefined → "" envoyé', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ text: 'a' }] })));
    await callAnthropic([{ role: 'user', content: 'X' }], undefined, { ANTHROPIC_API_KEY: 'k' });
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.system).toBe('');
  });

  it('callPerplexity uses PERPLEXITY_API_KEY si PERPLEXITI absent (fallback typo)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'pp' } }] })));
    const r = await callPerplexity([{ role: 'user', content: 'X' }], 'sys', { PERPLEXITY_API_KEY: 'pplx' });
    expect(r).toBe('pp');
  });
});

// 10/09 — vu par la mesure de couverture AST (vitest 5) : le minuteur de 8 s qui coupe un
// provider muet n'avait jamais été déclenché par un test. Un provider qui ne répond jamais
// doit être abandonné (signal.abort) et la course doit échouer proprement, pas rester suspendue.
describe('callIAFailover — délai de 8 s par provider', () => {
  it('un provider muet est coupé à 8 s et la course échoue avec sa raison', async () => {
    vi.useFakeTimers();
    try {
      const env = ENV({
        OPENROUTER_API_KEY: '', GEMINI_API_KEY: '', GROQ_API_KEY: '', OPENAI_API_KEY: '',
        OPEN_AI_API_KEY: '', DEEPSEEK_API_KEY: '', PERPLEXITI_API_KEY: '', PERPLEXITY_API_KEY: '',
      });
      globalThis.fetch = vi.fn((url, opts) => new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted par le délai')));
      }));
      const p = callIAFailover([{ role: 'user', content: 'X' }], 'sys', env);
      const attente = expect(p).rejects.toThrow(/anthropic: aborted par le délai/);
      await vi.advanceTimersByTimeAsync(8000);
      await attente;
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
