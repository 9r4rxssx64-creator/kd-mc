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
/* 2.10.2026 (Kevin « Go freellm ») : FreeLLMAPI empile ~34 paliers gratuits derrière un serveur — ici, la même idée
   SANS serveur : les paliers gratuits dont Kevin détient déjà la clé entrent dans la cascade, après ceux d'avant
   (l'ordre d'avant ne bouge pas). Mesuré avant câblage par tools/ia/sonder-ia-gratuites.mjs (robot coffre).
   Together n'est PAS déclaré gratuit : kdmc-apis le range depuis toujours parmi les moteurs payants (MOTEURS_PAYANTS,
   compte à crédits) — on l'appelle avec son modèle « -Free », mais seulement après les gratuits, et jamais sans la clé
   que Kevin seul détient (règle : un palier à crédits n'est jamais déclaré gratuit sans Kevin). */
export const FREE_PROVIDERS = ['qwen', 'groq', 'gemini', 'mistral', 'openrouter', 'cerebras', 'sambanova', 'nvidia', 'huggingface', 'glm', 'cohere'];

/* NIVEAU de qualité (Kevin 2.10.2026 : « quand ça s'épuise, anticipe du gratuit en relais, toujours même qualité, même
   niveau ») : 'A' = classe Llama 3.3 70B / Qwen3 30B+ / Gemini Flash ; 'B' = petits modèles (mistral-small, glm-4-flash,
   command-r7b). Un gratuit de niveau A épuisé est relayé par un gratuit de niveau A tant qu'il en reste. */
export const NIVEAU = { qwen: 'A', groq: 'A', gemini: 'A', openrouter: 'A', cerebras: 'A', sambanova: 'A', nvidia: 'A', together: 'A', huggingface: 'A', mistral: 'B', glm: 'B', cohere: 'B', anthropic: 'A', openai: 'A', deepseek: 'A', perplexity: 'A' };
const parNiveau = (a, b) => (NIVEAU[a] || 'B').localeCompare(NIVEAU[b] || 'B');

/* ÉPUISEMENT ANTICIPÉ : un fournisseur qui dit « quota / crédits / 429 » est mis en pause et SAUTÉ d'office au tour
   suivant — plus d'appel perdu, plus d'attente. Et AVANT même le refus : les en-têtes de quota (x-ratelimit-remaining-*)
   presque à zéro mettent en pause tout de suite ; le relais prend sans que personne attende.
   PAUSE DURABLE (2.10, « va plus loin ») : la mémoire de l'isolat s'efface quand le Worker redémarre ; la pause est
   AUSSI écrite dans le cache du Worker (Cache API : gratuit, 0 écriture KV — le plafond KV est déjà atteint —, partagé
   par les isolats d'un même centre Cloudflare, expire seul au terme de la pause). Un isolat neuf relit ces pauses avant
   d'appeler qui que ce soit (chargerPauses). Hors Worker (tests, Node) : mémoire seule, rien ne casse. */
const pauses = new Map();
const CACHE_PAUSE = 'https://pause.ia-route.invalid/';
function cachePauses() { try { const c = globalThis.caches; return c && c.default && typeof c.default.match === 'function' ? c.default : null; } catch (_) { return null; } }
/** Met en pause (mémoire tout de suite, cache ensuite). Renvoie une promesse : true si la pause est aussi durable. */
export function pauser(provider, ms, raison) {
  if (!(ms > 0)) return Promise.resolve(false);
  const p = { jusqua: Date.now() + ms, raison: String(raison || '').slice(0, 80) };
  pauses.set(provider, p);
  const c = cachePauses();
  if (!c) return Promise.resolve(false);
  try {
    return Promise.resolve(c.put(new Request(CACHE_PAUSE + provider), new Response(JSON.stringify(p),
      { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + Math.ceil(ms / 1000) } }))).then(() => true, () => false);
  } catch (_) { return Promise.resolve(false); }
}
export function enPause(provider, maintenant) { const p = pauses.get(provider); if (!p) return null; if (p.jusqua <= (maintenant || Date.now())) { pauses.delete(provider); return null; } return p; }
/** Relit les pauses durables (cache du Worker) pour les fournisseurs que la mémoire ne connaît pas : un isolat neuf
    retrouve l'épuisement constaté par un autre. Renvoie le nombre de pauses retrouvées (0 hors Worker). */
export async function chargerPauses(providers) {
  const c = cachePauses();
  if (!c) return 0;
  let n = 0;
  await Promise.all((providers || Object.keys(NIVEAU)).filter((p) => !pauses.has(p)).map(async (p) => {
    try {
      const r = await c.match(new Request(CACHE_PAUSE + p));
      if (!r) return;
      const j = await r.json();
      if (j && j.jusqua > Date.now()) { pauses.set(p, { jusqua: j.jusqua, raison: j.raison || 'durable' }); n++; }
    } catch (_) { /* cache muet : mémoire seule */ }
  }));
  return n;
}
export function pausesActives() { const out = {}; for (const [k, v] of pauses) if (enPause(k)) out[k] = { secondes: Math.round((v.jusqua - Date.now()) / 1000), raison: v.raison }; return out; }
/** Vrai quand le cache du Worker existe (les pauses survivent au redémarrage de l'isolat). */
export function pausesDurables() { return !!cachePauses(); }
export function _resetPauses() { pauses.clear(); modelesRetires.clear(); competence.clear(); }

/* COMPÉTENCE MESURÉE (conférence, 2.10 soir) : à chaque conférence, le juge note chaque voix (0-10) ; la note glisse
   (moyenne mobile, alpha 0,3) par DOMAINE et par voix, en mémoire et dans le cache du Worker (7 jours). Elle sert à ranger
   les voix, à choisir le juge, et /health la montre (`competence`). Rien d'estimé : seules les notes réelles comptent. */
const competence = new Map();   // domaine → Map(voixId → { score, n })
const CACHE_COMP = CACHE_PAUSE + 'competence/';
export const voixId = (v) => v.provider + '/' + String(v.model || '').split('/').pop();
export function competenceDe(domain, v) { const d = competence.get(domain); const e = d && d.get(voixId(v)); return e ? e.score : null; }
export function noterCompetence(domain, v, note) {
  const n = Number(note); if (!Number.isFinite(n)) return Promise.resolve(false);
  const score = Math.max(0, Math.min(10, n));
  if (!competence.has(domain)) competence.set(domain, new Map());
  const d = competence.get(domain); const e = d.get(voixId(v));
  d.set(voixId(v), e ? { score: Math.round((e.score * 0.7 + score * 0.3) * 100) / 100, n: e.n + 1 } : { score, n: 1 });
  const c = cachePauses();
  if (!c) return Promise.resolve(false);
  try {
    return Promise.resolve(c.put(new Request(CACHE_COMP + encodeURIComponent(domain)), new Response(JSON.stringify([...d.entries()]),
      { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + (7 * 86400) } }))).then(() => true, () => false);
  } catch (_) { return Promise.resolve(false); }
}
export async function chargerCompetence(domain) {
  const c = cachePauses();
  if (!c || competence.has(domain)) return false;
  try {
    const r = await c.match(new Request(CACHE_COMP + encodeURIComponent(domain)));
    if (!r) return false;
    const l = await r.json();
    if (Array.isArray(l)) { competence.set(domain, new Map(l)); return true; }
  } catch (_) { /* cache muet */ }
  return false;
}
export function competenceStatus() { const out = {}; for (const [d, m] of competence) { out[d] = {}; for (const [k, v] of m) out[d][k] = { score: Math.round(v.score * 10) / 10, n: v.n }; } return out; }
export function _resetCompetence() { competence.clear(); }

/* MODÈLES DE SECOURS (2.10, mesuré par la sonde : Groq et Cerebras ont RETIRÉ « llama-3.3-70b » → 404, et toute la
   cascade gratuite est tombée sans qu'un robot le dise). Un fournisseur dont le modèle n'existe plus n'est pas perdu :
   le modèle retiré est RETENU (mémoire + cache du Worker, 7 jours) et le suivant de SA liste prend, tout de suite, dans
   le même appel. Les noms de MODELES_SECOURS viennent de la sonde (GET /models, robot coffre-sonde-ia-gratuites),
   jamais devinés : Groq (11 modèles) → gpt-oss-120b, gpt-oss-20b, qwen3.8-27b ; Cerebras (2) → gpt-oss-120b, qwen-3.8-27b. */
export const MODELES_SECOURS = {   // MESURÉ le 2.10.2026 (sonde 37061173309, GET /models) — rien d'inventé
  groq: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  cerebras: ['qwen-3.8-27b'],
};
const modelesRetires = new Map();   // provider → Set(modèles qui ont répondu « n'existe pas »)
const CACHE_RETIRES = CACHE_PAUSE + 'modeles-retires/';
export function modeleRetire(provider, model) { return !!(modelesRetires.get(provider) && modelesRetires.get(provider).has(model)); }
/** Candidats dans l'ordre : le modèle demandé (ou celui par défaut), puis les secours — sans ceux connus retirés. */
export function modelesCandidats(provider, demande) {
  const liste = [demande || DEFAULT_MODELS[provider]].concat(MODELES_SECOURS[provider] || []).filter((m, i, a) => m && a.indexOf(m) === i);
  const vivants = liste.filter((m) => !modeleRetire(provider, m));
  return vivants.length ? vivants : liste.slice(0, 1);   // tout retiré ? on retente le premier plutôt que de ne rien faire
}
function retirerModele(provider, model) {
  if (!modelesRetires.has(provider)) modelesRetires.set(provider, new Set());
  modelesRetires.get(provider).add(model);
  const c = cachePauses();
  if (!c) return Promise.resolve(false);
  try {
    return Promise.resolve(c.put(new Request(CACHE_RETIRES + provider), new Response(JSON.stringify([...modelesRetires.get(provider)]),
      { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + (7 * 86400) } }))).then(() => true, () => false);
  } catch (_) { return Promise.resolve(false); }
}
export async function chargerModelesRetires(providers) {
  const c = cachePauses();
  if (!c) return 0;
  let n = 0;
  await Promise.all((providers || Object.keys(NIVEAU)).filter((p) => !modelesRetires.has(p)).map(async (p) => {
    try {
      const r = await c.match(new Request(CACHE_RETIRES + p));
      if (!r) return;
      const l = await r.json();
      if (Array.isArray(l) && l.length) { modelesRetires.set(p, new Set(l)); n++; }
    } catch (_) { /* cache muet */ }
  }));
  return n;
}
/** « Ce modèle n'existe pas » — le refus qui veut dire « change de modèle », pas « change de fournisseur ». */
export function modeleInexistant(status, message) {
  const m = String(message || '').toLowerCase();
  return (status === 404 && /model/.test(m)) || /model.*(does not exist|not found|not exist|decommissioned|no longer (supported|available)|unknown model)|unknown model|invalid model/.test(m);
}
export function modelesRetiresActifs() { const out = {}; for (const [k, v] of modelesRetires) if (v.size) out[k] = [...v]; return out; }
/** Durée de pause d'après le refus : crédits/quota épuisés → 6 h ; 429 → Retry-After ou 15 min ; sinon 0 (vraie panne, pas d'épuisement). */
export function dureePause(status, message, retryAfter) {
  const m = String(message || '').toLowerCase();
  if (status === 402 || /insufficient|credit|quota|exceeded your|balance|billing/.test(m)) return 6 * 3600 * 1000;
  if (status === 429) { const ra = parseFloat(retryAfter); return (ra > 0 ? Math.min(ra, 3600) * 1000 : 15 * 60 * 1000); }
  return 0;
}
/** En-têtes de quota (OpenAI-compatibles) : presque à sec → pause courte AVANT le refus. */
export async function anticiperDepuisEntetes(provider, headers) {
  try {
    const g = (n) => headers && headers.get ? headers.get(n) : null;
    const req = parseFloat(g('x-ratelimit-remaining-requests')), tok = parseFloat(g('x-ratelimit-remaining-tokens'));
    const reset = g('x-ratelimit-reset-requests') || g('x-ratelimit-reset-tokens') || '';
    const sec = /^(\d+(\.\d+)?)s?$/.test(reset) ? parseFloat(reset) : (/(\d+)m/.test(reset) ? parseFloat(reset) * 60 : 60);
    if ((req >= 0 && req <= 1) || (tok >= 0 && tok < 1500)) { await pauser(provider, Math.min(Math.max(sec, 10), 3600) * 1000, 'quota presque à sec (' + (req >= 0 ? req + ' req' : tok + ' jetons') + ')'); return true; }
  } catch (_) { /* pas d'en-têtes : rien à anticiper */ }
  return false;
}

/* Questions « simples » : la 1re IA GRATUITE de la préférence du domaine répond. */
export const SIMPLE_FREE_DOMAINS = ['general', 'summary', 'translation', 'speed'];

/* TOUT GRATUIT, PARTOUT, TOUJOURS (Kevin 2.10.2026 soir) : CHAQUE domaine commence par le meilleur GRATUIT du domaine —
   code → Qwen (qwen2.5-coder 32B), raisonnement → Qwen (QwQ 32B) puis gpt-oss-120b (Groq / Cerebras), actions → Qwen
   (texte ; les outils gratuits sur gpt-oss-120b sont le chantier suivant), créatif → Qwen puis Groq. Un payant (Anthropic,
   OpenAI, Perplexity) n'est JAMAIS en tête : secours seulement, derrière tous les gratuits (garde test:tout-gratuit).
   Image : Gemini (gratuit) puis Qwen — Workers AI llama-3.2-11b-vision à brancher ; recherche : Qwen puis le /search sans
   clé de kdmc-apis à brancher, Perplexity (payant) en secours seulement. */
export const DOMAIN_PREFERENCES = {
  admin:        ['qwen', 'groq', 'cerebras', 'anthropic', 'openai', 'gemini'],
  reasoning:    ['qwen', 'groq', 'cerebras', 'gemini', 'anthropic', 'openai'],
  code:         ['qwen', 'groq', 'cerebras', 'deepseek', 'anthropic', 'openai', 'gemini'],
  vision:       ['gemini', 'qwen', 'anthropic', 'openai'],
  long_context: ['gemini', 'qwen', 'groq', 'anthropic', 'openai'],
  speed:        ['groq', 'cerebras', 'qwen', 'gemini', 'openrouter', 'anthropic'],
  search:       ['qwen', 'groq', 'gemini', 'perplexity', 'anthropic'],
  translation:  ['qwen', 'gemini', 'groq', 'mistral', 'openrouter', 'anthropic'],
  summary:      ['qwen', 'groq', 'gemini', 'mistral', 'openrouter', 'anthropic'],
  creative:     ['qwen', 'groq', 'cerebras', 'gemini', 'anthropic', 'openai'],
  general:      ['qwen', 'groq', 'gemini', 'mistral', 'openrouter', 'anthropic'],
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
  sambanova: 'SAMBANOVA_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  together: 'TOGETHER_API_KEY',
  huggingface: 'HF_TOKEN',
  glm: 'GLM_API_KEY',
  cohere: 'COHERE_API_KEY',
};

export const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  groq: 'openai/gpt-oss-120b',          // mesuré 2.10 (sonde 37061173309) : llama-3.3-70b-versatile retiré par Groq
  gemini: 'gemini-2.0-flash',
  mistral: 'mistral-small-latest',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  cerebras: 'gpt-oss-120b',              // mesuré 2.10 : llama-3.3-70b retiré par Cerebras ; il reste gpt-oss-120b et qwen-3.8-27b
  deepseek: 'deepseek-chat',
  perplexity: 'sonar',
  sambanova: 'Meta-Llama-3.3-70B-Instruct',
  nvidia: 'meta/llama-3.3-70b-instruct',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
  huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
  glm: 'glm-4-flash',
  cohere: 'command-r7b-12-2024',
};

const OPENAI_COMPAT = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/v1/chat/completions',
  glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  cohere: 'https://api.cohere.ai/compatibility/v1/chat/completions',
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
  /* RELAIS DE MÊME NIVEAU (Kevin 2.10) : derrière le premier moteur, les GRATUITS se rangent niveau A avant niveau B
     (tri stable : à niveau égal l'ordre d'avant reste) ; les payants gardent leur place. */
  const libres = chain.slice(1).filter((p) => FREE_PROVIDERS.includes(p)).sort(parNiveau);
  let i = 0;
  chain = chain.map((p, k) => (k > 0 && FREE_PROVIDERS.includes(p) ? libres[i++] : p));
  /* Une image ne va jamais à une IA texte seul ; un domaine vision sans Gemini/Anthropic → vide. */
  if (dom === 'vision') chain = chain.filter((p) => ['gemini', 'qwen', 'anthropic', 'openai'].includes(p));   // qwen : texte seul (Workers AI vision à brancher)
  return chain;
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

async function callQwen(env, messages, o) {
  const tried = [];
  /* Chaque modèle a SON délai (audit Bee 30.09, mesuré : un Qwen muet bloquait la réponse plus de
     600 s — env.AI.run n'avait aucun délai).
     · SOUS ÉCHÉANCE (finMs, ex. Bee) : 2 modèles au plus, ≤ 8 s chacun, et on LAISSE 5 s aux secours
       gratuits suivants (contre-audit 30.09 : un Qwen lent mangeait tout, Groq/Gemini jamais essayés) ;
     · SANS échéance (les autres apps) : un délai large (≥ 30 s) — un Qwen lent mais qui répond
       n'est jamais coupé (contre-audit : Apex Chat, timeoutMs 8 s, perdait un Qwen à 12 s). */
  const modeles = o.finMs ? QWEN_MODELS.slice(0, 2) : QWEN_MODELS;
  for (const model of modeles) {
    const reste = o.finMs ? o.finMs - Date.now() - (o.reserveMs == null ? 5000 : o.reserveMs) : Infinity;
    const delai = o.finMs ? Math.min(o.qwenModelMs || 8000, reste) : Math.max(o.timeoutMs || 20000, 30000);
    if (delai < 1500) { tried.push(model + ':échéance'); break; }
    try {
      const r = await withDeadline(env.AI.run(model, { messages, max_tokens: o.maxTokens, temperature: o.temperature }), delai);
      /* Workers AI rend parfois `response` DÉJÀ décodé (un objet JSON) quand le modèle répond en JSON :
         String(objet) donnait « [object Object] » (mesuré 3.10, journal D1 de l'IA crypto). */
      const brut = r && (r.response !== undefined ? r.response : (r.result && r.result.response !== undefined ? r.result.response : (r.text !== undefined ? r.text : (r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''))));
      const text = stripThink(brut && typeof brut === 'object' ? JSON.stringify(brut) : brut);
      if (text) return { text, model };
      tried.push(model + ':vide');
    } catch (e) { tried.push(model + ':' + String((e && e.message) || e).slice(0, 80)); }
  }
  throw new Error(tried.join(' ; '));
}

async function callOpenAiLike(provider, key, messages, o) {
  /* Un modèle retiré (404) → le suivant de la liste du fournisseur, dans le même appel ; le retiré est retenu. */
  const candidats = modelesCandidats(provider, o.model);
  let derniere = null;
  for (let i = 0; i < candidats.length; i++) {
    const model = candidats[i];
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
      if (!r.ok) {
        const e = new Error('HTTP ' + r.status + ' ' + txt.slice(0, 120)); e.status = r.status; e.retryAfter = r.headers && r.headers.get ? r.headers.get('retry-after') : null;
        if (modeleInexistant(r.status, txt) && i < candidats.length - 1) { await retirerModele(provider, model); derniere = e; continue; }
        throw e;
      }
      await anticiperDepuisEntetes(provider, r.headers);
      const j = JSON.parse(txt);
      const text = stripThink(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
      if (!text) throw new Error('réponse vide');
      return { text, model, modele_relais: i > 0 ? candidats[0] + ' → ' + model : undefined };
    } finally { t.done(); }
  }
  throw derniere || new Error('aucun modèle');
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
/** UN tour de conversation AVEC OUTILS (appel de fonctions) chez un fournisseur gratuit compatible OpenAI (cerebras, groq…).
 *  Les appels directs aux IA vivent ICI, dans le routeur commun (garde test:conference-partout) : outils-lecture.js ne parle à personne.
 *  Rend le message du modèle ({ content, tool_calls }) ; lève une erreur portant .status / .retryAfter en cas de refus.
 *  opts : { messages, tools (liste de { name, description, parameters }) — absent = réponse finale —, maxTokens, temperature, timeoutMs } */
export async function chatAvecOutils(env, provider, opts) {
  const o = Object.assign({ maxTokens: 700, temperature: 0.4, timeoutMs: 9000 }, opts || {});
  const url = OPENAI_COMPAT[provider], key = env && env[SECRET_NAMES[provider]];
  if (!url || !key) throw new Error('fournisseur sans outils : ' + provider);
  const body = { model: modelesCandidats(provider, o.model)[0], messages: o.messages, max_tokens: o.maxTokens, temperature: o.temperature };
  if (Array.isArray(o.tools) && o.tools.length) { body.tools = o.tools.map((f) => ({ type: 'function', function: f })); body.tool_choice = 'auto'; }
  const t = withTimeout(o.timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', signal: t.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) { const e = new Error('HTTP ' + r.status + ' ' + txt.slice(0, 120)); e.status = r.status; e.retryAfter = r.headers && r.headers.get ? r.headers.get('retry-after') : null; throw e; }
    await anticiperDepuisEntetes(provider, r.headers);
    const m = JSON.parse(txt).choices[0].message;
    return { content: m && m.content ? m.content : '', tool_calls: m && Array.isArray(m.tool_calls) ? m.tool_calls : [], model: body.model };
  } finally { t.done(); }
}

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
  /* budgetMs : TOUTE la chaîne tient dans ce temps (le widget de Bee abandonne à 25 s) */
  const finMs = o.finMs || (o.budgetMs ? Date.now() + o.budgetMs : 0);
  await Promise.all([chargerPauses(chain), chargerModelesRetires(chain)]);   // isolat neuf : épuisements et modèles retirés connus AVANT d'appeler
  for (const provider of chain) {
    const pause = enPause(provider);
    if (pause) { tried.push({ provider, skipped: 'en pause : ' + pause.raison }); continue; }   // épuisé : sauté d'office, le relais prend
    const reste = finMs ? finMs - Date.now() : Infinity;
    if (reste < 1500) { tried.push({ provider, skipped: 'échéance' }); break; }
    const po = Object.assign({}, o, { model: o.models && o.models[provider], finMs, timeoutMs: Math.min(o.timeoutMs, reste) });
    try {
      let r;
      if (provider === 'qwen') r = await callQwen(env, messages, po);
      else if (provider === 'gemini') r = await callGemini(env[SECRET_NAMES.gemini], messages, po);
      else if (provider === 'anthropic') r = await callAnthropic(env[SECRET_NAMES.anthropic], messages, po);
      else if (OPENAI_COMPAT[provider]) r = await callOpenAiLike(provider, env[SECRET_NAMES[provider]], messages, po);
      else { tried.push({ provider, skipped: 'unsupported' }); continue; }
      return { ok: true, text: r.text, provider, model: r.model, modele_relais: r.modele_relais, domain, tried };
    } catch (e) {
      const msg = String((e && e.message) || e);
      const status = (e && e.status) || parseInt((/HTTP (\d{3})/.exec(msg) || [])[1], 10) || 0;
      const ms = dureePause(status, msg, e && e.retryAfter);
      if (ms) await pauser(provider, ms, 'HTTP ' + status + ' ' + msg.slice(0, 60));
      tried.push({ provider, error: msg.slice(0, 160), pause_s: ms ? Math.round(ms / 1000) : undefined });
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
/* CONFÉRENCE (Kevin 2.10 soir : « Intègre toujours TOUTES les IA gratuites… elles réfléchissent chacune de leur côté pour
   la même question, comparent et améliorent, et la meilleure, la plus compétente, travaille ») : les voix = TOUTES les
   gratuites disponibles (chaque modèle Qwen de Workers AI + chaque gratuit à clé, hors pause), rangées par COMPÉTENCE
   mesurée sur ce domaine (notes du juge, mémoire + cache du Worker). `max` borne le nombre de voix (8 par défaut). */
export function freeVoices(env, max, domain) {
  const out = [];
  if (env && env.AI) for (const m of QWEN_MODELS) out.push({ provider: 'qwen', model: m });
  for (const p of FREE_PROVIDERS) if (p !== 'qwen' && env && env[SECRET_NAMES[p]] && !enPause(p)) out.push({ provider: p, model: modelesCandidats(p)[0] });
  if (domain) out.sort((x, y) => (competenceDe(domain, y) ?? 5) - (competenceDe(domain, x) ?? 5));   // tri stable : à égalité, l'ordre d'avant
  return out.slice(0, max || 8);
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
  /* le minuteur est TOUJOURS annulé (un minuteur oublié gardait le processus 20 s en vie) */
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('délai ' + ms + ' ms')), ms); })])
    .finally(() => clearTimeout(t));
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
const COMPARE_SYSTEM = 'Tu es le JUGE d\'une conférence de plusieurs IA : elles ont répondu chacune de leur côté à la même question. '
  + 'Compare les réponses : exactitude, complétude, clarté, respect de la consigne. Réponds UNIQUEMENT par un JSON compact, sans texte autour : '
  + '{"notes":{"1":<0-10>,"2":<0-10>,...},"meilleure":<numéro de la meilleure réponse>,"manques":"<ce qui manque encore à la meilleure, en une phrase, ou vide>"}';
const AMELIORE_SYSTEM = 'Tu as été désignée meilleure réponse d\'une conférence d\'IA. AMÉLIORE ta réponse : corrige ce que le juge te reproche, '
  + 'reprends ce que les autres voix ont de juste et que tu n\'avais pas, garde ta structure et ta langue, ne mentionne ni juge ni voix, ne commente pas ton travail. '
  + 'Réponds directement par la réponse finale complète.';
function choisirJuge(env, voices, exclure, domain) {
  /* le juge = la voix la plus compétente du domaine qui n'est pas celle qu'on juge ; à défaut Qwen (Workers AI). */
  const cand = voices.filter((v) => !exclure.includes(voixId(v))).sort((x, y) => (competenceDe(domain, y) ?? 5) - (competenceDe(domain, x) ?? 5));
  return cand[0] || voices[0] || null;
}
/**
 * CONFÉRENCE de réponses (v2, Kevin 2.10 soir) : TOUTES les voix gratuites répondent en parallèle (1), un juge gratuit les
 * COMPARE et les note (2), puis LA MEILLEURE retravaille sa réponse avec les apports des autres (3). Ne lève jamais :
 * { ok, text, provider:'council', model:<meilleure>, best:{provider,model,score}, scores, voices:[…], judge, rounds }.
 * Tient dans finMs / budgetMs : sans temps, on s'arrête après le tour possible (jamais bloqué, jamais rien perdu).
 */
export async function councilText(env, opts) {
  const o = Object.assign({ maxTokens: 800, temperature: 0.7, timeoutMs: 20000, voices: 8, rounds: 3 }, opts || {});
  const domain = o.domain || 'general';
  let messages = Array.isArray(o.messages) ? o.messages.slice() : [];
  if (!messages.length && o.prompt) messages = [{ role: 'user', content: String(o.prompt) }];
  if (o.system && !messages.some((m) => m.role === 'system')) messages.unshift({ role: 'system', content: String(o.system) });
  await chargerCompetence(domain);
  const voices = freeVoices(env, o.voices, domain);
  if (voices.length < 2) return { ok: false, text: '', provider: null, model: null, voices: [], error: 'moins de 2 voix gratuites' };
  const budgetFin = o.finMs || (o.budgetMs ? Date.now() + o.budgetMs : 0);
  const reste = () => (budgetFin ? budgetFin - Date.now() : Infinity);
  const delai = (d) => Math.max(1500, Math.min(d, reste() - 500));
  /* 1. chacune de son côté */
  const settled = await Promise.allSettled(voices.map((v) => withDeadline(askVoice(env, v, messages, o), delai(o.timeoutMs))));
  const answers = [];
  const report = settled.map((s, i) => {
    const v = voices[i];
    if (s.status === 'fulfilled') { answers.push({ voice: v, text: s.value.text }); return { provider: v.provider, model: v.model, ok: true }; }
    return { provider: v.provider, model: v.model, ok: false, error: String(s.reason && s.reason.message || s.reason).slice(0, 80) };
  });
  if (!answers.length) return { ok: false, text: '', provider: null, model: null, voices: report, error: 'aucune voix n\'a répondu' };
  if (answers.length === 1) return { ok: true, text: answers[0].text, provider: answers[0].voice.provider, model: answers[0].voice.model, voices: report, judge: 'none', rounds: 1 };
  const question = [...messages].reverse().find((m) => m.role === 'user');
  const brief = 'QUESTION :\n' + String(question && question.content || '').slice(0, 3000) + '\n\n'
    + answers.map((a, i) => 'RÉPONSE DE LA VOIX ' + (i + 1) + ' (' + a.voice.model.split('/').pop() + ') :\n' + a.text.slice(0, 3000)).join('\n\n');
  const consigne = o.system ? '\nConsignes du service : ' + String(o.system).slice(0, 1500) : '';
  /* 2. comparer : le juge note chaque voix */
  let verdict = null, juge = null, synthese = null;
  if (reste() > 3000) {
    juge = choisirJuge(env, voices, [], domain);
    try {
      const j = await withDeadline(askVoice(env, juge, [{ role: 'system', content: COMPARE_SYSTEM + consigne }, { role: 'user', content: brief }], Object.assign({}, o, { maxTokens: 400, temperature: 0.2 })), delai(o.timeoutMs));
      verdict = parseJsonLoose(j.text);
      if (!(verdict && verdict.notes)) { verdict = null; synthese = j.text; }   // un juge qui rédige au lieu de noter : sa synthèse sert (ancien conseil)
    } catch (_) { /* juge muet : on continue sans notes */ }
  }
  const scores = {};
  let bestIdx = -1, bestScore = -1;
  if (verdict) {
    for (let i = 0; i < answers.length; i++) {
      const n = Number(verdict.notes[String(i + 1)]);
      if (Number.isFinite(n)) { scores[voixId(answers[i].voice)] = n; await noterCompetence(domain, answers[i].voice, n); if (n > bestScore) { bestScore = n; bestIdx = i; } }
    }
    const m = parseInt(verdict.meilleure, 10);
    if (m >= 1 && m <= answers.length) { bestIdx = m - 1; bestScore = scores[voixId(answers[bestIdx].voice)] ?? bestScore; }
  }
  /* 3. la meilleure travaille : elle améliore sa réponse avec ce que le juge et les autres apportent */
  if (bestIdx >= 0) {
    const best = answers[bestIdx];
    let text = best.text, rounds = 2;
    if (o.rounds >= 3 && reste() > 3000) {
      const autres = answers.filter((_, i) => i !== bestIdx).map((a) => a.text.slice(0, 1500)).join('\n---\n');
      const manques = String(verdict.manques || '').slice(0, 400);
      try {
        const r = await withDeadline(askVoice(env, best.voice, [{ role: 'system', content: AMELIORE_SYSTEM + consigne }, { role: 'user', content: 'QUESTION :\n' + String(question && question.content || '').slice(0, 3000) + '\n\nTA RÉPONSE :\n' + best.text.slice(0, 4000) + (manques ? '\n\nCE QUE LE JUGE TE REPROCHE : ' + manques : '') + '\n\nCE QUE LES AUTRES VOIX ONT RÉPONDU :\n' + autres }], Object.assign({}, o, { maxTokens: Math.max(o.maxTokens, 600), temperature: 0.4 })), delai(o.timeoutMs));
        if (r && r.text) { text = r.text; rounds = 3; }
      } catch (_) { /* elle n'a pas pu retravailler : sa première réponse reste la meilleure */ }
    }
    return { ok: true, text, provider: 'council', model: best.voice.model, best: { provider: best.voice.provider, model: best.voice.model, score: bestScore }, scores, voices: report, judge: juge ? voixId(juge) : 'none', rounds };
  }
  /* pas de notes (juge muet ou qui rédige) : la synthèse du juge, sinon l'ancien juge Qwen qui fusionne, sinon la 1re voix */
  if (synthese) return { ok: true, text: synthese, provider: 'council', model: juge.model, voices: report, judge: voixId(juge), rounds: 2, scores };
  try {
    if (!env.AI) throw new Error('pas de juge Workers AI');
    const j = await withDeadline(callQwen(env, [{ role: 'system', content: JUDGE_SYSTEM + consigne }, { role: 'user', content: brief }], { maxTokens: Math.max(o.maxTokens, 600), temperature: 0.3 }), delai(o.timeoutMs));
    return { ok: true, text: j.text, provider: 'council', model: j.model, voices: report, judge: 'qwen', rounds: 2, scores };
  } catch (e) {
    return { ok: true, text: answers[0].text, provider: 'council', model: answers[0].voice.model, voices: report, judge: 'first', rounds: 1, scores, judge_error: String((e && e.message) || e).slice(0, 80) };
  }
}

/* Domaines où un conseil de voix gratuites vaut mieux qu'une seule voix (question difficile). */
export const COUNCIL_DOMAINS = ['reasoning', 'creative', 'long_context', 'general', 'summary', 'code', 'search'];   // 2.10 : code et recherche aussi (admin : actions ; vision : pas de texte)

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
    /* l'analyse a SON délai (6 s), pas celui de la réponse (mesuré : 20 s de Bee passaient à l'analyse) */
    analyse = o.analyse === 'concert' ? await analyseQuestion(env, text, Object.assign({}, o, { timeoutMs: o.analyseMs || 6000 })) : null;
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
  return { available, qwen_models: env && env.AI ? QWEN_MODELS : [], first_by_domain: first, niveaux: Object.fromEntries(available.map((p) => [p, NIVEAU[p] || 'B'])), en_pause: pausesActives(), pauses_durables: pausesDurables(), modeles_retires: modelesRetiresActifs(), competence: competenceStatus() };
}
