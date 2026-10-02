/* Garde du routage IA commun (Kevin 2026-09-05 « Pareil dans mes autres projets »).
 * node --test services/_shared/ia-route.test.mjs — hors ligne, 0 clé, fetch simulé.
 * Prouve : Qwen gratuit en principal pour les questions courantes, bascule par TYPE de
 * question (action/code/raisonnement → Anthropic, image → Gemini, recherche → Perplexity),
 * secours en chaîne (Qwen mort → suivant), <think> jamais montré, cause exacte quand tout tombe. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDomain, planChain, routeText, stripThink, availableProviders, routingStatus,
  QWEN_MODELS, FREE_PROVIDERS, DOMAIN_PREFERENCES, SECRET_NAMES,
  _resetPauses, enPause, pauser, dureePause, anticiperDepuisEntetes, NIVEAU,
} from './ia-route.js';

/* les pauses d'épuisement vivent en mémoire : chaque test repart à zéro */
beforeEach(() => _resetPauses());

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

test('TOUT GRATUIT (Kevin 2.10 soir) : chaque domaine commence par un gratuit — action/code/raisonnement/créatif → Qwen, image → Gemini, recherche → Qwen ; les payants sont des secours, jamais en tête', () => {
  const all = ['qwen', 'anthropic', 'gemini', 'groq', 'perplexity'];
  for (const d of ['admin', 'code', 'reasoning', 'creative', 'search', 'general', 'summary', 'translation']) assert.equal(planChain(d, all)[0], 'qwen', d);
  assert.equal(planChain('speed', all)[0], 'groq');
  assert.equal(planChain('vision', all)[0], 'gemini');
  for (const d of Object.keys(DOMAIN_PREFERENCES)) assert.ok(FREE_PROVIDERS.includes(DOMAIN_PREFERENCES[d][0]), d + ' commence par un gratuit : ' + DOMAIN_PREFERENCES[d][0]);
  /* Anthropic reste en secours derrière TOUS les gratuits disponibles, et rien n'est perdu */
  const g = planChain('general', all);
  assert.ok(g.indexOf('anthropic') > g.indexOf('groq') && g.indexOf('anthropic') > g.indexOf('gemini'), g.join(' > '));
  assert.ok(g.indexOf('perplexity') > g.indexOf('groq'), 'Perplexity (payant) après les gratuits');
  assert.equal(g.length, all.length);
  const c = planChain('code', all);
  assert.ok(c.includes('anthropic') && c.indexOf('anthropic') > c.indexOf('groq'), 'code : Anthropic en secours, pas en tête : ' + c.join(' > '));
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

test('routeText : une ACTION est reconnue (domaine admin) et va d\'abord au GRATUIT (Qwen) ; Anthropic seulement si tous les gratuits tombent', async () => {
  const AI = fakeAI({ reply: 'Je prépare le déploiement.' });
  const env = { AI, ANTHROPIC_API_KEY: 'k' };
  const f = mockFetch(() => okJson({ content: [{ type: 'text', text: 'Déploiement lancé.' }] }));
  try {
    const r = await routeText(env, { prompt: 'déploie le worker maintenant' });
    assert.equal(r.domain, 'admin');
    assert.equal(r.provider, 'qwen', 'tout gratuit, partout : même une action commence par Qwen');
    assert.equal(f.calls.length, 0, 'Anthropic pas appelé');
    const mort = { AI: fakeAI({ allDead: true }), ANTHROPIC_API_KEY: 'k' };
    const r2 = await routeText(mort, { prompt: 'déploie le worker maintenant' });
    assert.equal(r2.provider, 'anthropic', 'secours payant seulement quand tous les gratuits sont tombés');
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
    /* TOUT GRATUIT : derrière Qwen vient Groq (gratuit), Anthropic n'est appelé que si tous les gratuits tombent */
    assert.deepEqual(r2.tried.map((t) => t.provider), ['qwen']);
    assert.ok(!f.calls.some((c) => /anthropic/.test(c.url)), 'Anthropic pas appelé tant qu\'un gratuit répond');
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
  assert.equal(st.first_by_domain.code, 'qwen', 'tout gratuit : le code commence par Qwen (qwen2.5-coder), Anthropic en secours');
  assert.equal(st.first_by_domain.vision, 'qwen', 'sans Gemini, une image va à Qwen (texte seul ; Workers AI vision à brancher) avant tout payant');
});

/* ---- PALIERS GRATUITS EMPILÉS (Kevin 2026-10-02 « Go freellm ») ---- */
test('Go freellm : 5 paliers gratuits de plus, APRÈS les gratuits d\'avant (l\'ordre d\'avant ne bouge pas) ; Together câblé mais PAS déclaré gratuit', () => {
  assert.deepEqual(FREE_PROVIDERS.slice(0, 6), ['qwen', 'groq', 'gemini', 'mistral', 'openrouter', 'cerebras']);
  for (const p of ['sambanova', 'nvidia', 'huggingface', 'glm', 'cohere']) {
    assert.ok(FREE_PROVIDERS.includes(p), p + ' est un palier gratuit');
    assert.ok(SECRET_NAMES[p], p + ' a un nom de secret');
  }
  assert.ok(!FREE_PROVIDERS.includes('together') && SECRET_NAMES.together, 'Together : compte à crédits (moteur payant pour kdmc-apis) → après les gratuits, jamais « gratuit »');
  const avecTogether = planChain('general', availableProviders({ AI: {}, TOGETHER_API_KEY: 't', GLM_API_KEY: 'z' }));
  assert.ok(avecTogether.indexOf('together') > avecTogether.indexOf('glm'), 'même un petit gratuit (B) passe avant Together : ' + avecTogether.join(' > '));
  assert.equal(SECRET_NAMES.huggingface, 'HF_TOKEN');
  const env = { AI: {}, GROQ_API_KEY: 'g', SAMBANOVA_API_KEY: 's', HF_TOKEN: 'h', GLM_API_KEY: 'z' };
  const avail = availableProviders(env);
  assert.deepEqual(avail, ['qwen', 'groq', 'sambanova', 'huggingface', 'glm']);
  const chain = planChain('general', avail);
  assert.equal(chain[0], 'qwen');
  assert.equal(chain[1], 'groq', 'Groq reste devant les nouveaux');
  assert.ok(chain.indexOf('sambanova') > chain.indexOf('groq') && chain.includes('huggingface') && chain.includes('glm'));
});

test('Go freellm : Qwen et Groq morts → SambaNova répond, à SON adresse, avec SA clé et SON modèle gratuit', async () => {
  const env = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g', SAMBANOVA_API_KEY: 'samba-key', TOGETHER_API_KEY: 't' };
  const m = mockFetch((url) => {
    if (url.startsWith('https://api.groq.com/')) return new Response('{"error":"quota"}', { status: 429 });
    if (url.startsWith('https://api.sambanova.ai/v1/chat/completions')) return openaiReply('réponse samba');
    return new Response('inattendu ' + url, { status: 599 });
  });
  try {
    const r = await routeText(env, { prompt: 'Bonjour', timeoutMs: 2000 });
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'sambanova');
    assert.equal(r.model, 'Meta-Llama-3.3-70B-Instruct');
    const call = m.calls.find((c) => c.url.startsWith('https://api.sambanova.ai/'));
    assert.equal(call.body.model, 'Meta-Llama-3.3-70B-Instruct');
    assert.ok(!m.calls.some((c) => c.url.includes('together')), 'Together jamais appelé : SambaNova a répondu avant');
    assert.ok(r.tried.some((t) => t.provider === 'groq' && /429/.test(t.error)), 'le refus de Groq est consigné');
  } finally { m.restore(); }
});

/* ---- ÉPUISEMENT ANTICIPÉ + RELAIS DE MÊME NIVEAU (Kevin 2026-10-02 « quand ça s'épuise, anticipe du gratuit en relais, même qualité ») ---- */
test('épuisement : un 429 met le fournisseur en pause ; au tour suivant il est SAUTÉ sans appel et le relais gratuit répond', async () => {
  const env = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g', SAMBANOVA_API_KEY: 's' };
  const m = mockFetch((url) => (/groq/.test(url) ? new Response('{"error":{"message":"Rate limit reached"}}', { status: 429, headers: { 'retry-after': '120' } }) : openaiReply('samba')));
  try {
    const r1 = await routeText(env, { prompt: 'bonjour' });
    assert.equal(r1.provider, 'sambanova');
    assert.ok(r1.tried.some((t) => t.provider === 'groq' && t.pause_s === 120), 'pause = Retry-After (120 s)');
    assert.ok(enPause('groq'));
    const avant = m.calls.length;
    const r2 = await routeText(env, { prompt: 'encore' });
    assert.equal(r2.provider, 'sambanova');
    assert.ok(r2.tried.some((t) => t.provider === 'groq' && /en pause/.test(t.skipped)), 'Groq sauté d\'office');
    assert.ok(!m.calls.slice(avant).some((c) => /groq/.test(c.url)), 'aucun appel perdu vers Groq');
  } finally { m.restore(); }
});

test('épuisement : crédits épuisés (402 / « quota ») → pause longue ; une vraie panne (500) → pas de pause', () => {
  assert.equal(dureePause(402, 'Payment required'), 6 * 3600 * 1000);
  assert.equal(dureePause(400, 'You exceeded your current quota'), 6 * 3600 * 1000);
  assert.equal(dureePause(429, 'slow down', '30'), 30 * 1000);
  assert.equal(dureePause(429, 'slow down', null), 15 * 60 * 1000);
  assert.equal(dureePause(500, 'internal error'), 0);
});

test('anticipation : un quota presque à sec dans les en-têtes met en pause AVANT le refus, la réponse en cours est gardée', async () => {
  const env = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g', SAMBANOVA_API_KEY: 's' };
  const m = mockFetch((url) => (/groq/.test(url)
    ? new Response(JSON.stringify({ choices: [{ message: { content: 'dernière de Groq' } }] }), { status: 200, headers: { 'x-ratelimit-remaining-requests': '1', 'x-ratelimit-reset-requests': '45s' } })
    : openaiReply('samba')));
  try {
    const r1 = await routeText(env, { prompt: 'a' });
    assert.equal(r1.provider, 'groq'); assert.equal(r1.text, 'dernière de Groq');
    const p = enPause('groq'); assert.ok(p && /presque à sec/.test(p.raison), 'pause posée depuis les en-têtes');
    const r2 = await routeText(env, { prompt: 'b' });
    assert.equal(r2.provider, 'sambanova', 'le relais a pris sans attendre un refus');
  } finally { m.restore(); }
});

/* Cache du Worker simulé (Cache API : put/match par URL), comme caches.default sur apis.kd-mc.com. */
const fauxCache = () => {
  const store = new Map();
  return {
    store,
    async put(req, res) { store.set(req.url, { body: await res.text(), cc: res.headers.get('cache-control') }); },
    async match(req) { const e = store.get(req.url); return e ? new Response(e.body) : undefined; },
  };
};
test('pause DURABLE : un isolat neuf (mémoire vide) retrouve l\'épuisement dans le cache du Worker et saute le fournisseur ; sans cache (sabotage) il le rappelle', async () => {
  const env = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g', SAMBANOVA_API_KEY: 's' };
  const m = mockFetch((url) => (/groq/.test(url) ? new Response('{"error":{"message":"Rate limit reached"}}', { status: 429, headers: { 'retry-after': '300' } }) : openaiReply('samba')));
  globalThis.caches = { default: fauxCache() };
  try {
    const r1 = await routeText(env, { prompt: 'bonjour' });
    assert.equal(r1.provider, 'sambanova');
    const e = globalThis.caches.default.store.get('https://pause.ia-route.invalid/groq');
    assert.ok(e && /max-age=300/.test(e.cc), 'pause écrite dans le cache, expire avec la pause (300 s)');
    assert.equal(routingStatus(env).pauses_durables, true);
    _resetPauses();   // = le Worker a redémarré : mémoire vide
    assert.equal(enPause('groq'), null);
    const avant = m.calls.length;
    const r2 = await routeText(env, { prompt: 'encore' });
    assert.equal(r2.provider, 'sambanova');
    assert.ok(!m.calls.slice(avant).some((c) => /groq/.test(c.url)), 'Groq pas rappelé : la pause est revenue du cache');
    assert.ok(r2.tried.some((t) => t.provider === 'groq' && /en pause/.test(t.skipped)));
    assert.ok(enPause('groq') && enPause('groq').jusqua > Date.now(), 'pause rechargée en mémoire');
    /* sabotage : sans cache, l'isolat neuf ne sait rien → il rappelle Groq (et perd un appel) */
    delete globalThis.caches; _resetPauses();
    assert.equal(routingStatus(env).pauses_durables, false);
    const avant2 = m.calls.length;
    const r3 = await routeText(env, { prompt: 'sans cache' });
    assert.equal(r3.provider, 'sambanova');
    assert.ok(m.calls.slice(avant2).some((c) => /groq/.test(c.url)), 'sans cache, Groq est rappelé : c\'est bien le cache qui évite l\'appel perdu');
  } finally { m.restore(); delete globalThis.caches; }
});

test('relais de même niveau : après le gratuit choisi, les gratuits de niveau A passent avant les petits modèles (B)', () => {
  const env = { AI: {}, MISTRAL_API_KEY: 'm', GLM_API_KEY: 'z', SAMBANOVA_API_KEY: 's', NVIDIA_API_KEY: 'n', COHERE_API_KEY: 'c' };
  const chain = planChain('general', availableProviders(env));
  assert.equal(chain[0], 'qwen');
  const idx = (p) => chain.indexOf(p);
  assert.ok(idx('sambanova') < idx('mistral') && idx('nvidia') < idx('glm') && idx('nvidia') < idx('cohere'), chain.join(' > '));
  assert.equal(NIVEAU.sambanova, 'A'); assert.equal(NIVEAU.glm, 'B');
  assert.ok(Object.keys(routingStatus(env).niveaux).includes('sambanova'), '/health dit le niveau de chaque fournisseur');
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

test('routeSmart : question difficile → conseil gratuit (Anthropic pas appelé) ; action → Qwen d\'abord (tout gratuit) ; simple → Qwen seul', async () => {
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
    assert.equal(a.provider, 'qwen', 'tout gratuit : une action commence par Qwen'); assert.equal(a.domain, 'admin');
    assert.equal(f.calls.length, 0, 'Anthropic toujours pas appelé');

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

test('délais (audit Bee 30.09) : un Qwen MUET ne bloque plus la réponse — le suivant répond, et toute la chaîne tient dans budgetMs', async () => {
  const muet = { run() { return new Promise(() => {}); } };   // Workers AI qui ne répond jamais
  const f = mockFetch(() => openaiReply('Réponse de secours'));
  try {
    const t0 = Date.now();
    const r = await routeText({ AI: muet, GROQ_API_KEY: 'x' }, { prompt: 'bonjour', budgetMs: 8000, qwenModelMs: 300 });
    assert.equal(r.ok, true, 'le suivant (gratuit) répond');
    assert.equal(r.provider, 'groq');
    assert.ok(Date.now() - t0 < 3000, 'pas d\'attente sans fin (' + (Date.now() - t0) + ' ms)');
    /* sous échéance, un Qwen LENT laisse la place au secours gratuit (5 s gardées) */
    const t2 = Date.now();
    const r3 = await routeText({ AI: muet, GROQ_API_KEY: 'x' }, { prompt: 'bonjour', budgetMs: 7000 });
    assert.equal(r3.provider, 'groq', 'Qwen muet sous échéance → Groq répond quand même');
    assert.ok(Date.now() - t2 < 6000, 'Groq essayé à temps (' + (Date.now() - t2) + ' ms)');
    const t1 = Date.now();
    const r2 = await routeText({ AI: muet }, { prompt: 'bonjour', timeoutMs: 20000, budgetMs: 1800 });
    assert.equal(r2.ok, false);
    assert.ok(Date.now() - t1 < 2500, 'budgetMs respecté (' + (Date.now() - t1) + ' ms)');
  } finally { f.restore(); }
});

test('délais (contre-audit 30.09) : SANS échéance, un Qwen lent MAIS qui répond n\'est pas coupé (Apex Chat, timeoutMs 8 s)', async () => {
  let n = 0;
  const lent = { run() { n++; return new Promise((res) => setTimeout(() => res({ response: 'Réponse lente' }), 1200)); } };
  const r = await routeText({ AI: lent }, { prompt: 'bonjour', timeoutMs: 300 });
  assert.equal(r.ok, true, 'Qwen lent répond');
  assert.equal(n, 1, '1 seule inférence (pas 4 lancées pour rien)');
});

/* ---- MODÈLE RETIRÉ → LE SUIVANT DE LA LISTE, SANS PERDRE LE FOURNISSEUR (2.10, mesuré : Groq/Cerebras 404 sur llama-3.3-70b) ---- */
import { MODELES_SECOURS, modelesCandidats, modeleInexistant, modeleRetire, DEFAULT_MODELS } from './ia-route.js';

test('modèle retiré : Groq dit « n\'existe pas » → le secours de Groq répond dans le même appel, le retiré est retenu, /health le montre', async () => {
  const env = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g', COHERE_API_KEY: 'c' };
  const refus = (m) => new Response(JSON.stringify({ error: { message: 'The model `' + m + '` does not exist or you do not have access to it.', code: 'model_not_found' } }), { status: 404 });
  const m = mockFetch((url, init) => {
    const body = JSON.parse(init.body);
    if (/groq/.test(url)) return body.model === DEFAULT_MODELS.groq ? refus(body.model) : openaiReply('groq ' + body.model);
    return openaiReply('cohere');
  });
  try {
    const r1 = await routeText(env, { prompt: 'bonjour' });
    assert.equal(r1.provider, 'groq', 'Groq n\'est PAS perdu : ' + JSON.stringify(r1.tried));
    assert.equal(r1.model, MODELES_SECOURS.groq[0]);
    assert.match(r1.modele_relais, /→/);
    assert.equal(m.calls.filter((c) => /groq/.test(c.url)).length, 2, '1 refus + 1 réponse');
    assert.ok(modeleRetire('groq', DEFAULT_MODELS.groq));
    const r2 = await routeText(env, { prompt: 'encore' });
    assert.equal(r2.provider, 'groq'); assert.equal(r2.model, MODELES_SECOURS.groq[0]);
    assert.equal(m.calls.filter((c) => /groq/.test(c.url)).length, 3, 'le modèle retiré n\'est plus tenté : 1 seul appel');
    assert.deepEqual(routingStatus(env).modeles_retires, { groq: [DEFAULT_MODELS.groq] });
    assert.deepEqual(modelesCandidats('groq'), MODELES_SECOURS.groq);
    assert.ok(!m.calls.some((c) => /cohere/.test(c.url)), 'Cohere jamais appelé : le relais de modèle a suffi');
  } finally { m.restore(); }
});

test('modèle retiré : seul « n\'existe pas » change de modèle ; un 429 ou un 500 ne touche pas à la liste', async () => {
  assert.ok(modeleInexistant(404, '{"error":{"message":"The model `x` does not exist"}}'));
  assert.ok(modeleInexistant(400, 'Model does not exist or you do not have access to it.'));
  assert.ok(modeleInexistant(400, 'model llama-3.3-70b has been decommissioned'));
  assert.ok(!modeleInexistant(429, 'Rate limit exceeded') && !modeleInexistant(500, 'internal') && !modeleInexistant(404, 'route not found'));
  const env = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g', COHERE_API_KEY: 'c' };
  const m = mockFetch((url) => (/groq/.test(url) ? new Response('{"error":{"message":"Rate limit exceeded"}}', { status: 429 }) : openaiReply('cohere')));
  try {
    const r = await routeText(env, { prompt: 'a' });
    assert.equal(r.provider, 'cohere');
    assert.equal(m.calls.filter((c) => /groq/.test(c.url)).length, 1, 'un 429 ne fait pas défiler les modèles de Groq');
    assert.deepEqual(routingStatus(env).modeles_retires, {});
  } finally { m.restore(); }
});

test('modèle retiré : durable — un isolat neuf (mémoire vide) retrouve le modèle retiré dans le cache et ne le retente pas', async () => {
  const env = { AI: fakeAI({ allDead: true }), GROQ_API_KEY: 'g' };
  const m = mockFetch((url, init) => (JSON.parse(init.body).model === DEFAULT_MODELS.groq
    ? new Response('{"error":{"message":"model does not exist"}}', { status: 404 }) : openaiReply('ok')));
  globalThis.caches = { default: fauxCache() };
  try {
    await routeText(env, { prompt: 'a' });
    _resetPauses();
    assert.ok(!modeleRetire('groq', DEFAULT_MODELS.groq), 'mémoire vide');
    const avant = m.calls.length;
    const r = await routeText(env, { prompt: 'b' });
    assert.equal(r.model, MODELES_SECOURS.groq[0]);
    assert.equal(m.calls.length - avant, 1, 'le retiré n\'est pas retenté : il est revenu du cache');
  } finally { m.restore(); delete globalThis.caches; }
});
