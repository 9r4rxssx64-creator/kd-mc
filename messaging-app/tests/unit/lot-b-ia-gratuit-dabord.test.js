// @vitest-environment node
/**
 * Lot B — A6-04 / A6-05 : règle de Kevin « gratuit d'abord, payant en DERNIER, toujours », dans CHAQUE route IA.
 *  - planChain / _iaOrdered : aucun payant avant un gratuit, quel que soit le domaine (chat, code, admin, raisonnement,
 *    résumés, traduction, suggestions…) ;
 *  - description d'image : Gemini (gratuit) d'abord, Anthropic (payant) seulement en secours ;
 *  - transcription : Whisper Workers AI (gratuit, même hébergeur) d'abord, Groq (gratuit) en secours, aucun payant ;
 *  - réponses suggérées : Qwen (même hébergeur) d'abord ;
 *  - /api/ia/chat : une seule unité de quota ne part JAMAIS chez un payant en parallèle (conférence = gratuits seuls).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { _iaOrdered } from '../../workers/api-worker.js';
import { planChain, FREE_PROVIDERS, DOMAIN_PREFERENCES, _resetPauses } from '../../../services/_shared/ia-route.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

const PROD = ['qwen', 'anthropic', 'groq', 'gemini', 'deepseek', 'openrouter', 'openai', 'perplexity'];
const PAID_HOSTS = ['api.anthropic.com', 'api.openai.com', 'api.deepseek.com', 'api.perplexity.ai'];
const ALL_KEYS = { GEMINI_API_KEY: 'gem', OPENROUTER_API_KEY: 'or', DEEPSEEK_API_KEY: 'ds', OPEN_AI_API_KEY: 'oa', PERPLEXITI_API_KEY: 'px' };
const tok = () => makeJWT({ sub: 'u1', iat: Math.floor(Date.now() / 1000) - 5 });
const ctx = { waitUntil() {} };

function payantAvantGratuit(chain) {
  const premierPayant = chain.findIndex((p) => !FREE_PROVIDERS.includes(p));
  if (premierPayant < 0) return null;
  const g = chain.slice(premierPayant).find((p) => FREE_PROVIDERS.includes(p));
  return g ? chain.join(' > ') : null;
}

beforeEach(() => { vi.restoreAllMocks(); _resetPauses(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('Lot B — A6-05 : ordre des fournisseurs', () => {
  for (const dom of Object.keys(DOMAIN_PREFERENCES)) {
    it(`planChain « ${dom} » : aucun payant avant un gratuit`, () => {
      expect(payantAvantGratuit(planChain(dom, PROD))).toBeNull();
    });
  }
  it('_iaOrdered (toutes les routes IA d\'Apex Chat) : payants derniers avec les clés de prod', () => {
    const fns = { qwen: 1, anthropic: 1, groq: 1, gemini: 1, deepseek: 1 };
    const env = { AI: {}, ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g', ...ALL_KEYS };
    for (const dom of ['code', 'admin', 'reasoning', 'general', 'summary', 'translation', 'speed']) {
      const order = _iaOrdered(env, dom, fns).map((p) => p.name);
      expect(order.slice(-2).sort(), dom + ' : ' + order.join(' > ')).toEqual(['anthropic', 'deepseek']);
    }
  });
});

describe('Lot B — A6-05 : description d\'image, gratuit d\'abord', () => {
  const body = { image_base64: 'data:image/jpeg;base64,' + 'A'.repeat(200) };
  it('Gemini présent → seul generativelanguage.googleapis.com est appelé (clé en en-tête, pas dans l\'URL)', async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (u, init) => {
      calls.push({ host: new URL(String(u)).host, url: String(u), headers: init.headers });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'un chat roux' }] } }] }));
    });
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/image-describe', token: await tok(), body }), ENV({ GEMINI_API_KEY: 'CLE-SECRETE-G' }), ctx);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ description: 'un chat roux', provider: 'gemini-2.0-flash-vision' });
    expect(calls.map((c) => c.host)).toEqual(['generativelanguage.googleapis.com']);
    expect(calls[0].url).not.toContain('CLE-SECRETE-G');
    expect(calls[0].headers['x-goog-api-key']).toBe('CLE-SECRETE-G');
  });
  it('Gemini en panne → Anthropic (payant) en secours, APRÈS', async () => {
    const hosts = [];
    globalThis.fetch = vi.fn(async (u) => {
      const h = new URL(String(u)).host; hosts.push(h);
      if (h.includes('googleapis')) return new Response('quota', { status: 429 });
      return new Response(JSON.stringify({ content: [{ text: 'un chat' }] }));
    });
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/image-describe', token: await tok(), body }), ENV({ GEMINI_API_KEY: 'gem' }), ctx);
    expect(r.status).toBe(200);
    expect(hosts).toEqual(['generativelanguage.googleapis.com', 'api.anthropic.com']);
  });
  it('Gemini répond un corps illisible, ou ne répond pas en 20 s → Anthropic prend le relais', async () => {
    globalThis.fetch = vi.fn(async (u) => (new URL(String(u)).host.includes('googleapis')
      ? new Response('pas du json', { status: 200 })
      : new Response(JSON.stringify({ content: [{ text: 'un chat' }] }))));
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/image-describe', token: await tok(), body }), ENV({ GEMINI_API_KEY: 'gem' }), ctx);
    expect((await r.json()).provider).toBe('anthropic-claude-haiku-vision');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let aborted = false;
      globalThis.fetch = vi.fn((u, init) => (new URL(String(u)).host.includes('googleapis')
        ? new Promise((_, rej) => init.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }))
        : Promise.resolve(new Response(JSON.stringify({ content: [{ text: 'un chat' }] })))));
      const p = worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/image-describe', token: await tok(), body }), ENV({ GEMINI_API_KEY: 'gem' }), ctx);
      // la vérification du jeton (WebCrypto) avance en temps réel : on avance l'horloge simulée jusqu'à l'abandon
      for (let i = 0; i < 200 && !aborted; i++) { await vi.advanceTimersByTimeAsync(1000); await new Promise((res) => setImmediate(res)); }
      const r2 = await p;
      expect(aborted).toBe(true);
      expect((await r2.json()).provider).toBe('anthropic-claude-haiku-vision');
    } finally { vi.useRealTimers(); }
  });
  it('Gemini seul, en panne (pas de clé Anthropic) → 502 propre ; aucune clé → 503', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x', { status: 500 }));
    const env = ENV({ GEMINI_API_KEY: 'gem' }); delete env.ANTHROPIC_API_KEY;
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/image-describe', token: await tok(), body }), env, ctx);
    expect(r.status).toBe(502);
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [] })));
    const r2 = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/image-describe', token: await tok(), body }), env, ctx);
    expect(r2.status).toBe(502);   // réponse vide de Gemini → pas de description inventée
    const env2 = ENV(); delete env2.ANTHROPIC_API_KEY;
    const r3 = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/image-describe', token: await tok(), body }), env2, ctx);
    expect(r3.status).toBe(503);
  });
});

function voiceReq(token, lang = 'fr') {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(3000)], { type: 'audio/webm' }), 'v.webm');
  return new Request('https://api.apex/api/ai/voice-transcribe' + (lang ? '?lang=' + lang : ''), { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
}

describe('Lot B — A6-03/05 : transcription, gratuit et même hébergeur d\'abord', () => {
  it('Workers AI répond → AUCUN appel réseau externe (Groq jamais appelé), langue transmise', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}'));
    const run = vi.fn(async () => ({ text: 'bonjour', transcription_info: { language: 'fr', duration: 1.5 } }));
    const r = await worker.fetch(voiceReq(await tok()), ENV({ AI: { run } }), ctx);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ text: 'bonjour', provider: 'workers-ai-whisper-large-v3-turbo', duration_s: 1.5 });
    expect(run.mock.calls[0][0]).toBe('@cf/openai/whisper-large-v3-turbo');
    expect(run.mock.calls[0][1].language).toBe('fr');
    expect(typeof run.mock.calls[0][1].audio).toBe('string');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('Workers AI en panne ou muet → Groq (gratuit) prend le relais', async () => {
    for (const run of [vi.fn(async () => { throw new Error('5xx'); }), vi.fn(async () => ({ text: '' }))]) {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ text: 'via groq' })));
      const r = await worker.fetch(voiceReq(await tok(), null), ENV({ AI: { run } }), ctx);
      expect((await r.json()).provider).toBe('groq-whisper-large-v3-turbo');
      expect(new URL(String(globalThis.fetch.mock.calls[0][0])).host).toBe('api.groq.com');
    }
  });
  it('Workers AI seul (pas de clé Groq) et en panne → 502 (le client envoie le vocal quand même)', async () => {
    const env = ENV({ AI: { run: vi.fn(async () => { throw new Error('KO'); }) } }); delete env.GROQ_API_KEY;
    const r = await worker.fetch(voiceReq(await tok()), env, ctx);
    expect(r.status).toBe(502);
  });
});

describe('Lot B — A6-02 : réponses suggérées, Qwen (même hébergeur) d\'abord', () => {
  it('Workers AI disponible → Qwen répond, ni Groq ni Anthropic ne reçoivent le message', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 }));
    const AI = { run: vi.fn(async () => ({ response: '{"replies":["Oui","Non","Peut-être"]}' })) };
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/smart-reply', token: await tok(), body: { last_message: 'Tu viens ce soir ?' } }), ENV({ AI }), ctx);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, provider: 'qwen' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('Lot B — A6-04 : /api/ia/chat, jamais de payant en parallèle pour une unité de quota', () => {
  it('question longue avec TOUTES les clés de prod → seuls des fournisseurs gratuits reçoivent le texte', async () => {
    const SECRET = 'MONSECRET-' + 'x'.repeat(420);
    const recus = {};
    globalThis.fetch = vi.fn(async (u, init) => {
      const host = new URL(String(u)).host;
      if (init && String(init.body || '').includes('MONSECRET-')) recus[host] = (recus[host] || 0) + 1;
      if (host.includes('googleapis')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini' }] } }] }));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'réponse' } }] }));
    });
    const AI = { run: vi.fn(async (_m, { messages }) => {
      const sys = (messages[0] && messages[0].content) || '';
      if (/JSON/.test(sys) && /domain/.test(sys)) return { response: '{"domain":"general","complexity":4,"needs_tools":false,"lang":"fr"}' };
      return { response: 'réponse qwen' };
    }) };
    const env = ENV({ AI, ...ALL_KEYS });
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ia/chat', token: await tok(), body: { messages: [{ role: 'user', content: SECRET }] } }), env, ctx);
    expect(r.status).toBe(200);
    for (const h of PAID_HOSTS) expect(recus[h], h).toBeUndefined();
  });
});
