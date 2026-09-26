/* Garde du routage IA commun (Kevin 2026-09-05 « Pareil dans mes autres projets »).
 * node --test services/_shared/ia-route.test.mjs — hors ligne, 0 clé, fetch simulé.
 * Prouve : Qwen gratuit en principal pour les questions courantes, bascule par TYPE de
 * question (action/code/raisonnement → Anthropic, image → Gemini, recherche → Perplexity),
 * secours en chaîne (Qwen mort → suivant), <think> jamais montré, cause exacte quand tout tombe. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDomain, planChain, routeText, stripThink, availableProviders, routingStatus,
  QWEN_MODELS, FREE_PROVIDERS, DOMAIN_PREFERENCES, SECRET_NAMES,
} from './ia-route.js';

const fakeAI = (opts = {}) => ({
  calls: [],
  run(model, input) {
    this.calls.push(model);
    if ((opts.dead || []).includes(model)) throw new Error('No such model');
    if (opts.allDead) throw new Error('boom');
    return { response: '<think>je réfléchis</think>' + (opts.reply || 'Bonjour Kevin') };
  },
});

function mockFetch(handler) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
    return handler(String(url), init);
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
const okJson = (obj) => new Response(JSON.stringify(obj), { status: 200 });
const openaiReply = (t) => okJson({ choices: [{ message: { content: t } }] });

test('détection : action → admin, code, image, traduction, résumé, général', () => {
  assert.equal(detectDomain('lance le déploiement'), 'admin');
  assert.equal(detectDomain('comment lance-t-on un déploiement ?'), 'general');
  assert.equal(detectDomain('corrige ce bug javascript'), 'admin');
  assert.equal(detectDomain('explique ce code python'), 'code');
  assert.equal(detectDomain('regarde cette photo'), 'vision');
  assert.equal(detectDomain('traduis en anglais'), 'translation');
  assert.equal(detectDomain('résume ce texte'), 'summary');
  assert.equal(detectDomain('quelle heure ouvre le casino ?'), 'general');
});

test('Qwen est le 1er gratuit et le principal des questions courantes', () => {
  assert.equal(FREE_PROVIDERS[0], 'qwen');
  for (const d of ['general', 'summary', 'translation']) assert.equal(DOMAIN_PREFERENCES[d][0], 'qwen', d);
  const all = ['qwen', 'anthropic', 'gemini', 'groq', 'perplexity', 'mistral'];
  assert.equal(planChain('general', all)[0], 'qwen');
  assert.equal(planChain('summary', all)[0], 'qwen');
  assert.equal(planChain('translation', all)[0], 'qwen');
  assert.equal(planChain('speed', all)[0], 'groq');
});

test('bascule par question : action/code/raisonnement → Anthropic, image → Gemini, recherche → Perplexity', () => {
  const all = ['qwen', 'anthropic', 'gemini', 'groq', 'perplexity'];
  assert.equal(planChain('admin', all)[0], 'anthropic');
  assert.equal(planChain('code', all)[0], 'anthropic');
  assert.equal(planChain('reasoning', all)[0], 'anthropic');
  assert.equal(planChain('creative', all)[0], 'anthropic');
  assert.equal(planChain('vision', all)[0], 'gemini');
  assert.ok(!planChain('vision', all).includes('qwen'), 'jamais Qwen pour une image');
  assert.equal(planChain('search', all)[0], 'perplexity');
  /* Anthropic reste en secours derrière Qwen, et rien n'est perdu */
  assert.deepEqual(planChain('general', all).slice(0, 2), ['qwen', 'anthropic']);
  assert.equal(planChain('general', all).length, all.length);
});

test('sans Anthropic ni clé : Qwen répond quand même (0 clé)', () => {
  assert.deepEqual(availableProviders({ AI: {} }), ['qwen']);
  assert.deepEqual(planChain('code', ['qwen']), ['qwen']);
  assert.deepEqual(availableProviders({}), []);
});

test('routeText : Qwen sert la question générale, <think> filtré, modèle nommé', async () => {
  const AI = fakeAI();
  const env = { AI, ANTHROPIC_API_KEY: 'x' };
  const f = mockFetch(() => { throw new Error('réseau interdit ici'); });
  try {
    const r = await routeText(env, { prompt: 'quel temps fait-il à Monaco ?', system: 'Tu es Apex.' });
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'qwen');
    assert.equal(r.model, QWEN_MODELS[0]);
    assert.equal(r.text, 'Bonjour Kevin');
    assert.equal(r.domain, 'general');
    assert.equal(f.calls.length, 0, 'Anthropic pas appelé pour une question simple');
  } finally { f.restore(); }
});

test('routeText : une ACTION va à Anthropic même si Qwen est là', async () => {
  const AI = fakeAI();
  const env = { AI, ANTHROPIC_API_KEY: 'k' };
  const f = mockFetch((url) => {
    assert.match(url, /api\.anthropic\.com/);
    return okJson({ content: [{ type: 'text', text: 'Déploiement lancé.' }] });
  });
  try {
    const r = await routeText(env, { prompt: 'déploie le worker maintenant' });
    assert.equal(r.provider, 'anthropic');
    assert.equal(r.domain, 'admin');
    assert.equal(r.text, 'Déploiement lancé.');
    assert.equal(AI.calls.length, 0);
    assert.equal(f.calls[0].body.model, 'claude-haiku-4-5-20251001');
  } finally { f.restore(); }
});

test('routeText : 1er modèle Qwen mort → le suivant, Qwen entièrement mort → Groq (gratuit), tout mort → cause exacte', async () => {
  const env1 = { AI: fakeAI({ dead: [QWEN_MODELS[0]] }) };
  const f0 = mockFetch(() => { throw new Error('non'); });
  try {
    const r1 = await routeText(env1, { prompt: 'bonjour' });
    assert.equal(r1.ok, true); assert.equal(r1.model, QWEN_MODELS[1]);
  } finally { f0.restore(); }

  const env2 = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
  const f = mockFetch((url) => (/groq/.test(url) ? openaiReply('<think>x</think>Salut !') : okJson({})));
  try {
    const r2 = await routeText(env2, { prompt: 'bonjour' });
    assert.equal(r2.provider, 'groq');
    assert.equal(r2.text, 'Salut !', '<think> filtré aussi sur les moteurs OpenAI-compatibles');
    /* Anthropic est le secours n°1 derrière Qwen (réponse vide ici → on passe à Groq) */
    assert.deepEqual(r2.tried.map((t) => t.provider), ['qwen', 'anthropic']);
  } finally { f.restore(); }

  const env3 = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g' };
  const f3 = mockFetch(() => new Response('{"error":{"message":"rate limited"}}', { status: 429 }));
  try {
    const r3 = await routeText(env3, { prompt: 'bonjour' });
    assert.equal(r3.ok, false);
    assert.equal(r3.tried.length, 2);
    assert.match(r3.tried[1].error, /429/);
  } finally { f3.restore(); }
});

test('routeText : chaîne forcée et domaine forcé respectés ; premium → Anthropic d\'abord', async () => {
  const env = { AI: fakeAI(), ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' };
  const f = mockFetch((url) => (/anthropic/.test(url)
    ? okJson({ content: [{ type: 'text', text: 'A' }] })
    : okJson({ candidates: [{ content: { parts: [{ text: 'G' }] } }] })));
  try {
    const r = await routeText(env, { prompt: 'bonjour', domain: 'summary', premium: true });
    assert.equal(r.provider, 'anthropic');
    const g = await routeText(env, { prompt: 'bonjour', chain: ['gemini'] });
    assert.equal(g.provider, 'gemini'); assert.equal(g.text, 'G');
  } finally { f.restore(); }
});

test('secrets : noms EXACTS de Kevin (PERPLEXITI, OPEN_AI)', () => {
  assert.equal(SECRET_NAMES.perplexity, 'PERPLEXITI_API_KEY');
  assert.equal(SECRET_NAMES.openai, 'OPEN_AI_API_KEY');
  assert.equal(stripThink('<think>a\nb</think>ok'), 'ok');
  assert.equal(stripThink('<think>coupé sans fin'), '');
  const st = routingStatus({ AI: {}, ANTHROPIC_API_KEY: 'a' });
  assert.equal(st.first_by_domain.general, 'qwen');
  assert.equal(st.first_by_domain.code, 'anthropic');
  assert.equal(st.first_by_domain.vision, 'anthropic', 'sans Gemini, une image va à Anthropic, jamais à Qwen');
});

/* ---- CONCERTATION D'IA GRATUITES (Kevin 2026-09-06 « va plus loin ») ---- */
import { analyseQuestion, councilText, routeSmart, freeVoices } from './ia-route.js';

const voicesAI = (byModel, opts = {}) => ({
  calls: [],
  run(model, input) {
    this.calls.push({ model, sys: input.messages[0].content.slice(0, 20) });
    const isJudge = /JUGE/.test(input.messages[0].content);
    if (isJudge) { if (opts.judgeDead) throw new Error('juge mort'); return { response: 'SYNTHÈSE : ' + input.messages[1].content.length }; }
    const out = byModel[model];
    if (out instanceof Error) throw out;
    return { response: out === undefined ? 'réponse ' + model.split('/').pop() : out };
  },
});

test('freeVoices : chaque modèle Qwen est une voix, les gratuits à clé s\'ajoutent, 3 max par défaut', () => {
  assert.equal(freeVoices({ AI: {} }).length, 3);
  assert.equal(freeVoices({ AI: {}, GROQ_API_KEY: 'g' }, 5).map((v) => v.provider).filter((p) => p === 'groq').length, 1);
  assert.deepEqual(freeVoices({}), []);
});

test('analyseQuestion : vote majoritaire de 3 voix gratuites → concert ; JSON illisible ignoré', async () => {
  const AI = voicesAI({
    [QWEN_MODELS[0]]: '{"domain":"translation","needs_tools":false,"needs_vision":false,"complexity":1,"lang":"fr"}',
    [QWEN_MODELS[1]]: '```json\n{"domain":"translation","needs_tools":false,"complexity":2,"lang":"fr"}\n```',
    [QWEN_MODELS[2]]: 'je ne sais pas',
  });
  const a = await analyseQuestion({ AI }, 'peux-tu me dire ce texte en espagnol ?');
  assert.equal(a.by, 'concert');
  assert.equal(a.domain, 'translation', 'la regex aurait dit general : le concert va plus loin');
  assert.deepEqual(a.votes, { translation: 2 });
  assert.equal(a.voices.filter((v) => v.error).length, 1);
  assert.equal(AI.calls.length, 3, '3 voix appelées en parallèle');
});

test('analyseQuestion : les voix disent « action » → admin (sécurité), désaccord → repli regex, < 2 voix → regex', async () => {
  const act = voicesAI({
    [QWEN_MODELS[0]]: '{"domain":"general","needs_tools":true,"complexity":2}',
    [QWEN_MODELS[1]]: '{"domain":"code","needs_tools":true,"complexity":2}',
    [QWEN_MODELS[2]]: '{"domain":"general","needs_tools":false,"complexity":2}',
  });
  const a = await analyseQuestion({ AI: act }, 'peux-tu mettre DUPONT en repos le 12 ?');
  assert.equal(a.domain, 'admin'); assert.equal(a.needs_tools, true);

  const split = voicesAI({
    [QWEN_MODELS[0]]: '{"domain":"code","needs_tools":false,"complexity":2}',
    [QWEN_MODELS[1]]: '{"domain":"summary","needs_tools":false,"complexity":2}',
    [QWEN_MODELS[2]]: '{"domain":"creative","needs_tools":false,"complexity":2}',
  });
  const b = await analyseQuestion({ AI: split }, 'résume-moi ce texte');
  assert.equal(b.by, 'regex'); assert.equal(b.domain, 'summary');

  const c = await analyseQuestion({}, 'bonjour');
  assert.equal(c.by, 'regex'); assert.deepEqual(c.voices, []);
});

test('councilText : 3 voix répondent, le juge Qwen fusionne ; juge mort → 1re voix ; 1 voix → telle quelle', async () => {
  const AI = voicesAI({});
  const c = await councilText({ AI }, { prompt: 'explique la relativité simplement' });
  assert.equal(c.ok, true); assert.equal(c.provider, 'council'); assert.equal(c.judge, 'qwen');
  assert.match(c.text, /^SYNTHÈSE/);
  assert.equal(c.voices.filter((v) => v.ok).length, 3);
  assert.equal(AI.calls.filter((x) => /JUGE/.test(x.sys)).length, 1, 'un seul appel juge');

  const dead = voicesAI({ [QWEN_MODELS[1]]: new Error('capacity'), [QWEN_MODELS[2]]: new Error('capacity') }, { judgeDead: true });
  const d = await councilText({ AI: dead }, { prompt: 'x' });
  assert.equal(d.ok, true); assert.equal(d.judge, 'none', 'une seule voix → sa réponse, sans juge');
  assert.equal(d.voices.filter((v) => !v.ok).length, 2);

  const e = await councilText({}, { prompt: 'x' });
  assert.equal(e.ok, false);
});

test('routeSmart : question difficile → conseil gratuit (Anthropic pas appelé) ; action → Anthropic ; simple → Qwen seul', async () => {
  const AI = voicesAI({
    [QWEN_MODELS[0]]: '{"domain":"reasoning","needs_tools":false,"complexity":4}',
    [QWEN_MODELS[1]]: '{"domain":"reasoning","needs_tools":false,"complexity":5}',
    [QWEN_MODELS[2]]: '{"domain":"reasoning","needs_tools":false,"complexity":4}',
  });
  const f = mockFetch((url) => (/anthropic/.test(url) ? okJson({ content: [{ type: 'text', text: 'Anthropic' }] }) : okJson({})));
  try {
    const r = await routeSmart({ AI, ANTHROPIC_API_KEY: 'a' }, { prompt: 'pourquoi le ciel est-il bleu, explique la physique derrière ?' });
    assert.equal(r.analyse.by, 'concert'); assert.equal(r.domain, 'reasoning');
    assert.equal(r.provider, 'council', 'question difficile → conseil de voix gratuites');
    assert.equal(f.calls.length, 0, 'Anthropic pas appelé');

    const act = voicesAI({
      [QWEN_MODELS[0]]: '{"domain":"admin","needs_tools":true,"complexity":2}',
      [QWEN_MODELS[1]]: '{"domain":"admin","needs_tools":true,"complexity":2}',
      [QWEN_MODELS[2]]: '{"domain":"admin","needs_tools":true,"complexity":2}',
    });
    const a = await routeSmart({ AI: act, ANTHROPIC_API_KEY: 'a' }, { prompt: 'envoie le rapport à Laurence' });
    assert.equal(a.provider, 'anthropic'); assert.equal(a.domain, 'admin');

    const simple = voicesAI({
      [QWEN_MODELS[0]]: '{"domain":"general","needs_tools":false,"complexity":1}',
      [QWEN_MODELS[1]]: '{"domain":"general","needs_tools":false,"complexity":1}',
      [QWEN_MODELS[2]]: '{"domain":"general","needs_tools":false,"complexity":1}',
    });
    const s = await routeSmart({ AI: simple, ANTHROPIC_API_KEY: 'a' }, { prompt: 'quelle heure est-il à Tokyo ?' });
    assert.equal(s.provider, 'qwen', 'question simple → une seule voix gratuite, pas de conseil');
    assert.equal(s.analyse.complexity, 1);
  } finally { f.restore(); }
});
