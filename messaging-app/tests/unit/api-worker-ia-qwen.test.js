/**
 * Apex Chat v1.1.284 — Kevin 2026-09-05 « Qwen l'IA gratuite en principal… bascule automatiquement
 * sur la plus pertinente… pareil dans mes autres projets ».
 * Prouve, sans réseau :
 *  - question courante → QWEN (Workers AI, 0 clé) répond, même si Anthropic est configuré ;
 *  - ACTION (lance/déploie/corrige…) → ANTHROPIC (seul à avoir des outils), Qwen pas appelé ;
 *  - Qwen mort → secours (Anthropic), cause exacte conservée par fournisseur ;
 *  - résumé / traduction → Qwen d'abord ; le monologue <think> n'atteint jamais l'utilisateur.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAiSummarize, handleAiTranslate, _iaOrdered } from '../../workers/api-worker.js';
import { ENV, makeJWT } from './api-worker-helpers.js';
import worker from '../../workers/api-worker.js';

beforeEach(() => { vi.restoreAllMocks(); });

/* Les appels d'ANALYSE (concertation : plusieurs voix classent la question) sont distingués des
   appels de RÉPONSE (system = celui du chat) — Kevin 2026-09-06 « concertation d'IA gratuites ». */
const fakeAI = (opts = {}) => ({
  calls: [],
  answerCalls() { return this.calls.filter((c) => !/classificateur/i.test(c.sys)); },
  run(model, input) {
    const sys = String((input.messages[0] || {}).content || '');
    this.calls.push({ model, sys });
    if (opts.dead) throw new Error('No such model');
    if (/classificateur/i.test(sys)) return { response: opts.analyse || 'je ne sais pas' };
    return { response: '<think>hmm</think>' + (opts.reply || 'Réponse Qwen') };
  },
});

async function userToken() {
  return makeJWT({ sub: 'user_test', email: 'test@apex.fr', iat: Math.floor(Date.now() / 1000) });
}
function makeReq(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return new Request('https://api.apex/' + path.replace(/^\//, ''), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}
function userEnv(overrides = {}) {
  const env = ENV(overrides);
  env.APEX_CHAT_DB.prepare = vi.fn(() => ({
    bind: function () { return this; },
    first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  }));
  return env;
}

describe('ordre des fournisseurs par type de demande', () => {
  const fns = { qwen: () => {}, anthropic: () => {}, groq: () => {}, gemini: () => {} };
  it('question courante → Qwen d\'abord, Anthropic en secours', () => {
    const env = { AI: {}, ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g' };
    expect(_iaOrdered(env, 'general', fns).map((p) => p.name)).toEqual(['qwen', 'anthropic', 'groq']);
    expect(_iaOrdered(env, 'summary', fns)[0].name).toBe('qwen');
    expect(_iaOrdered(env, 'translation', fns)[0].name).toBe('qwen');
  });
  it('action / code / raisonnement → Anthropic d\'abord', () => {
    const env = { AI: {}, ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g' };
    expect(_iaOrdered(env, 'admin', fns)[0].name).toBe('anthropic');
    expect(_iaOrdered(env, 'code', fns)[0].name).toBe('anthropic');
    expect(_iaOrdered(env, 'reasoning', fns)[0].name).toBe('anthropic');
  });
  it('sans binding Workers AI ni clé → rien (503 plus haut), sans clé mais avec AI → Qwen seul', () => {
    expect(_iaOrdered({}, 'general', fns)).toEqual([]);
    expect(_iaOrdered({ AI: {} }, 'code', fns).map((p) => p.name)).toEqual(['qwen']);
  });
});

describe('POST /api/ia/chat (admin) — Qwen principal, Anthropic pour agir', () => {
  it('question courante → Qwen répond, Anthropic pas appelé, <think> filtré', async () => {
    const AI = fakeAI({ reply: 'Il fait beau à Monaco.' });
    const env = userEnv({ AI, ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 }));
    const tok = await userToken();
    const r = await worker.fetch(makeReq('POST', '/api/ia/chat', { messages: [{ role: 'user', content: 'quel temps fait-il à Monaco ?' }] }, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.provider).toBe('qwen');
    expect(j.domain).toBe('general');
    expect(j.content).toBe('Il fait beau à Monaco.');
    expect(AI.answerCalls()[0].model).toBe('@cf/qwen/qwen3.8-27b');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('CONCERTATION : 3 voix votent le type ; question difficile → conseil + juge gratuit, Anthropic pas appelé', async () => {
    const AI = fakeAI({ analyse: '{"domain":"reasoning","needs_tools":false,"complexity":4,"lang":"fr"}', reply: 'avis' });
    AI.run = ((orig) => function (model, input) {
      if (/JUGE/.test(String(input.messages[0].content))) { this.calls.push({ model, sys: 'juge' }); return { response: 'Synthèse du conseil' }; }
      return orig.call(this, model, input);
    })(AI.run);
    const env = userEnv({ AI, ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 }));
    const tok = await userToken();
    const r = await worker.fetch(makeReq('POST', '/api/ia/chat', { messages: [{ role: 'user', content: 'explique-moi pourquoi les marées existent et comment la lune agit' }] }, tok), env);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.analyse.by).toBe('concert');
    expect(j.domain).toBe('reasoning');
    expect(j.provider).toBe('council');
    expect(j.judge).toBe('qwen');
    expect(j.content).toBe('Synthèse du conseil');
    expect(j.voices.filter((v) => v.ok).length).toBe(3);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('ACTION → Anthropic, Qwen pas appelé', async () => {
    const AI = fakeAI();
    const env = userEnv({ AI, ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('anthropic.com')) return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Je lance.' }] }), { status: 200 });
      return new Response('{}', { status: 500 });
    });
    const tok = await userToken();
    const r = await worker.fetch(makeReq('POST', '/api/ia/chat', { messages: [{ role: 'user', content: 'lance le nettoyage des DM' }] }, tok), env);
    const j = await r.json();
    expect(j.provider).toBe('anthropic');
    expect(j.domain).toBe('admin');
    expect(AI.answerCalls().length).toBe(0, 'Qwen consulté pour ANALYSER, jamais pour AGIR');
  });

  it('Qwen mort → secours Anthropic ; tout mort → 503 avec la cause par fournisseur', async () => {
    const env = userEnv({ AI: fakeAI({ dead: true }), ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Anthropic prend le relais' }] }), { status: 200 }));
    const tok = await userToken();
    const r = await worker.fetch(makeReq('POST', '/api/ia/chat', { messages: [{ role: 'user', content: 'bonjour' }] }, tok), env);
    const j = await r.json();
    expect(j.provider).toBe('anthropic');

    globalThis.fetch = vi.fn(async () => new Response('overloaded', { status: 529 }));
    const r2 = await worker.fetch(makeReq('POST', '/api/ia/chat', { messages: [{ role: 'user', content: 'bonjour' }] }, tok), env);
    expect(r2.status).toBe(503);
    const j2 = await r2.json();
    /* Qwen d'abord, Anthropic en 1er secours, puis les autres gratuits configurés (Groq dans ENV) */
    expect(j2.tried.map((t) => t.provider).slice(0, 2)).toEqual(['qwen', 'anthropic']);
    expect(j2.tried[1].error).toMatch(/529/);
  });
});

describe('résumé et traduction → Qwen gratuit d\'abord', () => {
  it('summarize : Qwen répond (0 appel réseau) et nomme le fournisseur', async () => {
    const env = userEnv({ AI: fakeAI({ reply: 'Résumé par Qwen' }), ANTHROPIC_API_KEY: 'k', GROQ_API_KEY: 'g' });
    globalThis.fetch = vi.fn();
    const tok = await userToken();
    const r = await handleAiSummarize(makeReq('POST', '/api/ai/summarize', { prompt: 'résume cette longue discussion entre amis' }, tok), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.provider).toBe('qwen');
    expect(j.text).toBe('Résumé par Qwen');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('translate : Qwen (multilingue) d\'abord', async () => {
    const env = userEnv({ AI: fakeAI({ reply: 'Good morning' }), ANTHROPIC_API_KEY: 'k' });
    globalThis.fetch = vi.fn();
    const tok = await userToken();
    const r = await handleAiTranslate(makeReq('POST', '/api/ai/translate', { text: 'Bonjour', target_lang: 'en' }, tok), env);
    const j = await r.json();
    expect(j.provider).toBe('qwen');
    expect(j.translated).toBe('Good morning');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
