/* ia-route.js — LE routage IA commun du domaine kd-mc.com (Kevin 2026-09-05).
 * ==========================================================================
 * « Fait tourner Apex sur Qwen l'IA gratuite, privilégie les IA gratuites en tâche
 *   principale… suivant les questions elle bascule automatiquement sur la plus
 *   polyvalente, la plus pertinente. » — puis « Pareil dans mes autres projets. »
 *
 * UNE seule logique, importée par chaque worker (wrangler l'embarque au déploiement) :
 *   - QWEN (Cloudflare Workers AI, binding env.AI, 0 clé, 0 €) = IA PRINCIPALE des
 *     questions courantes : général, résumé, traduction, réponse rapide ;
 *   - la QUESTION décide de la bascule : code / raisonnement / créatif / action →
 *     Anthropic (la plus polyvalente) ; image → Gemini ; recherche → Perplexity ;
 *   - les gratuits restent en secours partout, Anthropic reste en secours partout :
 *     une panne ne bloque jamais, et on sait toujours QUI a répondu (provider/model).
 *
 * Même politique que Apex v13 (services/ai/ai-routing-policy.ts) — c'est voulu :
 * si l'une bouge, l'autre suit (leçon #142 : deux surfaces qui divergent en silence).
 *
 * Zéro dépendance, zéro réseau au chargement : testable en Node (`node --test`).
 */

export const QWEN_MODELS = [
  '@cf/qwen/qwen3.8-27b',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/qwen/qwq-32b',
];

/* Ordre des gratuits : c'est LUI que « gratuit d'abord » suit quand plusieurs existent. */
export const FREE_PROVIDERS = ['qwen', 'groq', 'gemini', 'mistral', 'openrouter', 'cerebras'];

/* Questions « simples » : la 1re IA GRATUITE de la préférence du domaine répond. */
export const SIMPLE_FREE_DOMAINS = ['general', 'summary', 'translation', 'speed'];

export const DOMAIN_PREFERENCES = {
  admin:        ['anthropic', 'openai', 'gemini', 'qwen'],
  reasoning:    ['anthropic', 'qwen', 'openai', 'gemini', 'groq'],
  code:         ['anthropic', 'qwen', 'deepseek', 'openai', 'gemini'],
  vision:       ['gemini', 'anthropic', 'openai'],
  long_context: ['gemini', 'anthropic', 'qwen', 'openai'],
  speed:        ['groq', 'qwen', 'gemini', 'openrouter', 'anthropic'],
  search:       ['perplexity', 'anthropic', 'gemini', 'qwen'],
  translation:  ['qwen', 'gemini', 'groq', 'mistral', 'openrouter', 'anthropic'],
  summary:      ['qwen', 'groq', 'gemini', 'mistral', 'openrouter', 'anthropic'],
  creative:     ['anthropic', 'qwen', 'openai', 'gemini'],
  general:      ['qwen', 'anthropic', 'gemini', 'groq', 'mistral', 'openrouter'],
};

/* Noms de secrets EXACTS de Kevin (PERPLEXITI sans Y, OPEN_AI avec underscore). */
export const SECRET_NAMES = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPEN_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  perplexity: 'PERPLEXITI_API_KEY',
};

export const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
  mistral: 'mistral-small-latest',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  cerebras: 'llama-3.3-70b',
  deepseek: 'deepseek-chat',
  perplexity: 'sonar',
};

const OPENAI_COMPAT = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
};

/* Une DEMANDE D'ACTION exige des outils → seul Anthropic les porte (domaine admin). */
const ACTION_RE = /\b(lance|exécute|execute|déploie|deploie|corrige|répare|repare|modifie|configure|installe|active|désactive|desactive|supprime|envoie|sauvegarde|synchronise|publie|merge|pousse|audit(e|er)?|teste|vérifie|verifie|diagnosti(c|que))\b/;
const QUESTION_RE = /\b(comment|pourquoi|est-ce que|c'est quoi|explique)\b/;

/** Devine le TYPE de la question (même heuristique qu'Apex). */
export function detectDomain(text) {
  const t = String(text || '');
  const lc = t.toLowerCase();
  if (ACTION_RE.test(lc) && !QUESTION_RE.test(lc)) return 'admin';
  if (/\bcode|programme|fonction|debug|bug|typescript|javascript|python|php|sql\b/.test(lc)) return 'code';
  if (/\bimage|photo|vision|scanner?|reconnaitre|détecter\b/.test(lc)) return 'vision';
  if (/\btraduit?|translate|en (anglais|italien|allemand|espagnol)\b/.test(lc)) return 'translation';
  if (/\brésume|résum[eé]|tldr|résumé\b/.test(lc)) return 'summary';
  if (/\b(rapide|vite|urgent|asap|maintenant)\b/.test(lc)) return 'speed';
  if (/\bcherche|recherche|trouve|google|info sur\b/.test(lc)) return 'search';
  if (/\bécris|invente|imagine|crée|histoire|poème\b/.test(lc)) return 'creative';
  if (t.length > 5000) return 'long_context';
  if (/\banalyse|réfléchis|explique|pourquoi|comment\b/.test(lc) && t.length > 200) return 'reasoning';
  return 'general';
}

/** Qwen3 pense entre <think>…</think> : l'utilisateur ne doit jamais voir ce monologue. */
export function stripThink(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*<think>[\s\S]*$/, '').trim();
}

/** Fournisseurs réellement utilisables avec cet env (clé présente, ou binding AI pour qwen). */
export function availableProviders(env) {
  const out = [];
  if (env && env.AI) out.push('qwen');
  for (const p of Object.keys(SECRET_NAMES)) if (env && env[SECRET_NAMES[p]]) out.push(p);
  return out;
}

/**
 * Ordre d'essai pour un domaine :
 *   - question simple → 1re IA GRATUITE de la préférence (Qwen en tête), puis le reste ;
 *   - question complexe → préférence du domaine telle quelle (Anthropic/Gemini/Perplexity d'abord) ;
 *   - puis tous les autres gratuits disponibles, puis les payants restants : rien n'est perdu.
 */
export function planChain(domain, available, opts) {
  const dom = DOMAIN_PREFERENCES[domain] ? domain : 'general';
  const avail = Array.isArray(available) ? available : [];
  const prefs = DOMAIN_PREFERENCES[dom].filter((p) => avail.includes(p));
  let chain = prefs.slice();
  /* premium (choix explicite de l'app) : Anthropic d'abord, le reste en secours */
  if (opts && opts.premium && avail.includes('anthropic')) {
    chain = ['anthropic'].concat(chain.filter((p) => p !== 'anthropic'));
  } else if (SIMPLE_FREE_DOMAINS.includes(dom)) {
    const free = prefs.find((p) => FREE_PROVIDERS.includes(p))
      || FREE_PROVIDERS.find((p) => avail.includes(p));
    if (free) chain = [free].concat(chain.filter((p) => p !== free));
  }
  for (const p of FREE_PROVIDERS) if (avail.includes(p) && !chain.includes(p)) chain.push(p);
  for (const p of avail) if (!chain.includes(p)) chain.push(p);
  /* Une image ne va jamais à une IA texte seul ; un domaine vision sans Gemini/Anthropic → vide. */
  if (dom === 'vision') chain = chain.filter((p) => ['gemini', 'anthropic', 'openai'].includes(p));
  return chain;
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

async function callQwen(env, messages, o) {
  const tried = [];
  for (const model of QWEN_MODELS) {
    try {
      const r = await env.AI.run(model, { messages, max_tokens: o.maxTokens, temperature: o.temperature });
      const text = stripThink(r && (r.response || (r.result && r.result.response) || r.text));
      if (text) return { text, model };
      tried.push(model + ':vide');
    } catch (e) { tried.push(model + ':' + String((e && e.message) || e).slice(0, 80)); }
  }
  throw new Error(tried.join(' ; '));
}

async function callOpenAiLike(provider, key, messages, o) {
  const model = o.model || DEFAULT_MODELS[provider];
  const body = { model, messages, max_tokens: o.maxTokens, temperature: o.temperature };
  if (o.wantJson && provider !== 'perplexity') body.response_format = { type: 'json_object' };
  const t = withTimeout(o.timeoutMs);
  try {
    const r = await fetch(OPENAI_COMPAT[provider], {
      method: 'POST', signal: t.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 120));
    const j = JSON.parse(txt);
    const text = stripThink(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
    if (!text) throw new Error('réponse vide');
    return { text, model };
  } finally { t.done(); }
}

async function callGemini(key, messages, o) {
  const model = o.model || DEFAULT_MODELS.gemini;
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages.filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }));
  const body = { contents, generationConfig: { maxOutputTokens: o.maxTokens, temperature: o.temperature } };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (o.wantJson) body.generationConfig.responseMimeType = 'application/json';
  const t = withTimeout(o.timeoutMs);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST', signal: t.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 120));
    const j = JSON.parse(txt);
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map((x) => x.text || '').join('').trim();
    if (!text) throw new Error('réponse vide');
    return { text, model };
  } finally { t.done(); }
}

async function callAnthropic(key, messages, o) {
  const model = o.model || DEFAULT_MODELS.anthropic;
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const msgs = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  const body = { model, max_tokens: o.maxTokens, messages: msgs };
  if (system) body.system = system;
  if (typeof o.temperature === 'number') body.temperature = o.temperature;
  const t = withTimeout(o.timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: t.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 120));
    const j = JSON.parse(txt);
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text) throw new Error('réponse vide');
    return { text, model };
  } finally { t.done(); }
}

/**
 * Appel TEXTE routé. Ne lève jamais : { ok, text, provider, model, domain, tried }.
 * opts : { messages | prompt, system, domain, text (pour deviner le domaine), maxTokens,
 *          temperature, wantJson, timeoutMs, models:{provider:model}, premium, chain }
 */
export async function routeText(env, opts) {
  const o = Object.assign({ maxTokens: 800, temperature: 0.7, timeoutMs: 20000 }, opts || {});
  let messages = Array.isArray(o.messages) ? o.messages.slice() : [];
  if (!messages.length && o.prompt) messages = [{ role: 'user', content: String(o.prompt) }];
  if (o.system && !messages.some((m) => m.role === 'system')) messages.unshift({ role: 'system', content: String(o.system) });
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const domain = o.domain || detectDomain(o.text || (lastUser && lastUser.content) || '');
  const available = availableProviders(env);
  const chain = Array.isArray(o.chain) ? o.chain.filter((p) => available.includes(p)) : planChain(domain, available, o);
  const tried = [];
  for (const provider of chain) {
    const po = Object.assign({}, o, { model: o.models && o.models[provider] });
    try {
      let r;
      if (provider === 'qwen') r = await callQwen(env, messages, po);
      else if (provider === 'gemini') r = await callGemini(env[SECRET_NAMES.gemini], messages, po);
      else if (provider === 'anthropic') r = await callAnthropic(env[SECRET_NAMES.anthropic], messages, po);
      else if (OPENAI_COMPAT[provider]) r = await callOpenAiLike(provider, env[SECRET_NAMES[provider]], messages, po);
      else { tried.push({ provider, skipped: 'unsupported' }); continue; }
      return { ok: true, text: r.text, provider, model: r.model, domain, tried };
    } catch (e) {
      tried.push({ provider, error: String((e && e.message) || e).slice(0, 160) });
    }
  }
  return { ok: false, text: '', provider: null, model: null, domain, tried, error: chain.length ? 'tous les moteurs ont échoué' : 'aucune IA disponible' };
}

/* ============================================================================
 * CONCERTATION D'IA GRATUITES (Kevin 2026-09-06 « Fais une concertation d'IA gratuites
 * pour analyser les questions par exemple, va plus loin »)
 *
 * 1. analyseQuestion : plusieurs VOIX gratuites (chaque modèle Qwen de Workers AI est une
 *    voix, plus Groq/Gemini/Mistral/… si une clé existe) classent la question EN PARALLÈLE
 *    (type, besoin d'outils, image, complexité, langue) → VOTE MAJORITAIRE. Moins de 2 voix
 *    ou pas de majorité → l'heuristique par mots-clés tranche (jamais bloqué, 0 €).
 * 2. councilText : pour une question difficile, N voix gratuites répondent en parallèle et un
 *    JUGE gratuit (Qwen) fusionne : garde ce qui fait consensus, écarte ce qu'une seule voix
 *    affirme sans appui, signale les désaccords. Une seule voix → sa réponse telle quelle.
 *    Anthropic reste réservé aux ACTIONS (outils) et au secours quand le conseil échoue.
 * ========================================================================== */

export const DOMAINS = Object.keys(DOMAIN_PREFERENCES);

const ANALYSE_SYSTEM = 'Tu es un classificateur. Réponds UNIQUEMENT par un JSON compact, sans texte autour : '
  + '{"domain":<un de : ' + DOMAINS.join(', ') + '>,"needs_tools":<true si la demande exige d\'AGIR sur un système (lancer, déployer, modifier, envoyer, corriger, configurer, lire des données privées comme un planning ou une fiche) ; false pour une question, une explication, un texte>,'
  + '"needs_vision":<true si une image ou photo doit être regardée>,"complexity":<1 à 5>,"lang":<code langue ISO de la question>}. '
  + 'Règles : une demande d\'action → domain "admin". Du code → "code". Une image → "vision". Traduire → "translation". Résumer → "summary". Chercher une info récente sur le web → "search". Écrire/inventer → "creative". Réflexion longue → "reasoning". Sinon → "general".';

/** Voix gratuites disponibles : chaque modèle Qwen de Workers AI compte pour une voix. */
export function freeVoices(env, max) {
  const out = [];
  if (env && env.AI) for (const m of QWEN_MODELS) out.push({ provider: 'qwen', model: m });
  for (const p of FREE_PROVIDERS) if (p !== 'qwen' && env && env[SECRET_NAMES[p]]) out.push({ provider: p, model: DEFAULT_MODELS[p] });
  return out.slice(0, max || 3);
}

async function askVoice(env, voice, messages, o) {
  const po = Object.assign({}, o, { model: voice.model });
  if (voice.provider === 'qwen') {
    const r = await env.AI.run(voice.model, { messages, max_tokens: o.maxTokens, temperature: o.temperature });
    const text = stripThink(r && (r.response || (r.result && r.result.response) || r.text));
    if (!text) throw new Error('réponse vide');
    return { text, model: voice.model };
  }
  if (voice.provider === 'gemini') return callGemini(env[SECRET_NAMES.gemini], messages, po);
  return callOpenAiLike(voice.provider, env[SECRET_NAMES[voice.provider]], messages, po);
}

function parseJsonLoose(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || '').replace(/```(?:json)?/g, ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

function withDeadline(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('délai ' + ms + ' ms')), ms))]);
}

/**
 * Concertation d'ANALYSE : { domain, needs_tools, needs_vision, complexity, lang, by, votes, voices }.
 * by = 'concert' (vote majoritaire) ou 'regex' (repli). Ne lève jamais.
 */
export async function analyseQuestion(env, text, opts) {
  const o = Object.assign({ voices: 3, timeoutMs: 6000 }, opts || {});
  const fallback = detectDomain(text);
  const base = { domain: fallback, needs_tools: fallback === 'admin', needs_vision: fallback === 'vision', complexity: String(text || '').length > 400 ? 3 : 1, lang: 'fr', by: 'regex', votes: {}, voices: [] };
  const voices = freeVoices(env, o.voices);
  if (voices.length < 2) return base;
  const messages = [{ role: 'system', content: ANALYSE_SYSTEM }, { role: 'user', content: String(text || '').slice(0, 2000) }];
  const settled = await Promise.allSettled(voices.map((v) => withDeadline(askVoice(env, v, messages, { maxTokens: 120, temperature: 0, timeoutMs: o.timeoutMs }), o.timeoutMs)));
  const opinions = [];
  settled.forEach((s, i) => {
    const v = voices[i];
    if (s.status !== 'fulfilled') { base.voices.push({ provider: v.provider, model: v.model, error: String(s.reason && s.reason.message || s.reason).slice(0, 80) }); return; }
    const j = parseJsonLoose(s.value.text);
    if (!j || !DOMAIN_PREFERENCES[j.domain]) { base.voices.push({ provider: v.provider, model: v.model, error: 'JSON illisible' }); return; }
    opinions.push(j);
    base.voices.push({ provider: v.provider, model: v.model, domain: j.domain, needs_tools: !!j.needs_tools, complexity: Number(j.complexity) || 1 });
  });
  if (opinions.length < 2) return base;
  const votes = {};
  for (const j of opinions) votes[j.domain] = (votes[j.domain] || 0) + 1;
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const majority = best[0][1] > opinions.length / 2 || (best.length === 1);
  const needsTools = opinions.filter((j) => j.needs_tools).length > opinions.length / 2;
  const needsVision = opinions.filter((j) => j.needs_vision).length > opinions.length / 2;
  let domain = majority ? best[0][0] : fallback;
  /* une ACTION exige des outils → admin, quelle que soit l'étiquette votée (sécurité) */
  if (needsTools || fallback === 'admin') domain = 'admin';
  if (needsVision && domain !== 'admin') domain = 'vision';
  const complexity = Math.round(opinions.reduce((a, j) => a + (Number(j.complexity) || 1), 0) / opinions.length);
  const lang = (opinions.map((j) => String(j.lang || '').toLowerCase().slice(0, 2)).filter(Boolean)[0]) || 'fr';
  return { domain, needs_tools: domain === 'admin', needs_vision: needsVision, complexity, lang, by: majority ? 'concert' : 'regex', votes, voices: base.voices };
}

const JUDGE_SYSTEM = 'Tu es le JUGE d\'un conseil de plusieurs IA. On te donne la question et les réponses de chaque voix. '
  + 'Rédige LA meilleure réponse finale, dans la langue de la question : garde ce qui fait consensus, écarte toute affirmation qu\'une seule voix avance sans appui, '
  + 'si les voix se contredisent sur un fait, dis-le en une phrase. Ne mentionne pas les voix, ne commente pas ton travail, réponds directement.';

/**
 * CONSEIL de réponses : voix gratuites en parallèle + juge gratuit. Ne lève jamais :
 * { ok, text, provider:'council', model:'<juge>', voices:[{provider,model,ok}], judge:'qwen'|'first' }.
 */
export async function councilText(env, opts) {
  const o = Object.assign({ maxTokens: 800, temperature: 0.7, timeoutMs: 20000, voices: 3 }, opts || {});
  let messages = Array.isArray(o.messages) ? o.messages.slice() : [];
  if (!messages.length && o.prompt) messages = [{ role: 'user', content: String(o.prompt) }];
  if (o.system && !messages.some((m) => m.role === 'system')) messages.unshift({ role: 'system', content: String(o.system) });
  const voices = freeVoices(env, o.voices);
  if (voices.length < 2) return { ok: false, text: '', provider: null, model: null, voices: [], error: 'moins de 2 voix gratuites' };
  const settled = await Promise.allSettled(voices.map((v) => withDeadline(askVoice(env, v, messages, o), o.timeoutMs)));
  const answers = [];
  const report = settled.map((s, i) => {
    const v = voices[i];
    if (s.status === 'fulfilled') { answers.push({ voice: v, text: s.value.text }); return { provider: v.provider, model: v.model, ok: true }; }
    return { provider: v.provider, model: v.model, ok: false, error: String(s.reason && s.reason.message || s.reason).slice(0, 80) };
  });
  if (!answers.length) return { ok: false, text: '', provider: null, model: null, voices: report, error: 'aucune voix n\'a répondu' };
  if (answers.length === 1) return { ok: true, text: answers[0].text, provider: answers[0].voice.provider, model: answers[0].voice.model, voices: report, judge: 'none' };
  const question = [...messages].reverse().find((m) => m.role === 'user');
  const brief = 'QUESTION :\n' + String(question && question.content || '').slice(0, 3000) + '\n\n'
    + answers.map((a, i) => 'RÉPONSE DE LA VOIX ' + (i + 1) + ' (' + a.voice.model.split('/').pop() + ') :\n' + a.text.slice(0, 3000)).join('\n\n');
  const judgeMsgs = [{ role: 'system', content: JUDGE_SYSTEM + (o.system ? '\nConsignes du service : ' + String(o.system).slice(0, 1500) : '') }, { role: 'user', content: brief }];
  try {
    if (!env.AI) throw new Error('pas de juge Workers AI');
    const j = await withDeadline(callQwen(env, judgeMsgs, { maxTokens: Math.max(o.maxTokens, 600), temperature: 0.3 }), o.timeoutMs);
    return { ok: true, text: j.text, provider: 'council', model: j.model, voices: report, judge: 'qwen' };
  } catch (e) {
    /* juge muet → la première voix qui a répondu (jamais rien perdre), cause conservée */
    return { ok: true, text: answers[0].text, provider: 'council', model: answers[0].voice.model, voices: report, judge: 'first', judge_error: String((e && e.message) || e).slice(0, 80) };
  }
}

/* Domaines où un conseil de voix gratuites vaut mieux qu'une seule voix (question difficile). */
export const COUNCIL_DOMAINS = ['reasoning', 'creative', 'long_context', 'general', 'summary'];

/**
 * Routage « concerté » : analyse par vote (si opts.analyse === 'concert'), puis conseil pour les
 * questions difficiles (opts.council === true, ou 'auto' = domaine du conseil ET complexité ≥ 3),
 * puis routeText classique. Ne lève jamais. Ajoute { analyse, council } au résultat.
 */
export async function routeSmart(env, opts) {
  const o = Object.assign({ analyse: 'concert', council: 'auto' }, opts || {});
  let messages = Array.isArray(o.messages) ? o.messages.slice() : [];
  if (!messages.length && o.prompt) messages = [{ role: 'user', content: String(o.prompt) }];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = o.text || (lastUser && lastUser.content) || '';
  let analyse = null;
  let domain = o.domain;
  if (!domain) {
    analyse = o.analyse === 'concert' ? await analyseQuestion(env, text, o) : null;
    domain = analyse ? analyse.domain : detectDomain(text);
  }
  const wantCouncil = o.council === true || (o.council === 'auto' && COUNCIL_DOMAINS.includes(domain) && ((analyse && analyse.complexity >= 3) || String(text).length > 400));
  if (wantCouncil && domain !== 'admin' && domain !== 'vision') {
    const c = await councilText(env, Object.assign({}, o, { messages, domain }));
    if (c.ok) return Object.assign(c, { domain, analyse, tried: [] });
  }
  const r = await routeText(env, Object.assign({}, o, { messages, domain }));
  return Object.assign(r, { analyse });
}

/** Résumé lisible pour /health : qui répond en premier pour chaque type de question. */
export function routingStatus(env) {
  const available = availableProviders(env);
  const first = {};
  for (const d of Object.keys(DOMAIN_PREFERENCES)) first[d] = planChain(d, available)[0] || null;
  return { available, qwen_models: env && env.AI ? QWEN_MODELS : [], first_by_domain: first };
}
