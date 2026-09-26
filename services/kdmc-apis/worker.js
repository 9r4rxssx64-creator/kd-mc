// kdmc-apis — Passerelle "APIs gratuites" pour tout le domaine kd-mc.com
// -----------------------------------------------------------------------------
// UNE passerelle → TOUTES les apps (présentes + futures) héritent des mêmes
// capacités gratuites, sans recâbler chaque app. Clés côté SERVEUR (jamais dans
// le navigateur). Origines de confiance uniquement (*.kd-mc.com + Pages + local).
//
// Règles Kevin respectées :
//  - Isolation max : chaque appel scopé par `?app=<nom>` (rate-limit + logs par app).
//  - Autonomie : 0 saisie par app. Config committée (free-apis-config.json) chargée au boot.
//  - Sécurité : Origin allowlist (le navigateur FORCE l'en-tête Origin, non falsifiable en JS).
//    Clés jamais exposées. Fail-open : une route sans clé renvoie 501 clair, ne casse jamais.
//  - Erreurs détaillées : chaque échec renvoie {error, detail, status} (leçon "cause exacte").
//  - Reproduction fidèle : keyless = simple relais CORS de l'upstream, aucune invention.
//
// Déploiement : .github/workflows/deploy-kdmc-apis.yml (wrangler + secrets GitHub).
// Health : GET https://apis.kd-mc.com/health (aucune auth).
// -----------------------------------------------------------------------------

// ---------- Origines de confiance ----------
// Le navigateur impose l'en-tête Origin (impossible à forger en JS front) → sert de
// contrôle d'accès pour les apps browser. Server-to-server = pas d'Origin → refusé sur
// les routes sensibles, toléré sur les keyless publiques (déjà gratuites/anonymes).
export function isTrustedOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const h = u.hostname;
    if (h === 'kd-mc.com' || h.endsWith('.kd-mc.com')) return true;
    /* GitHub Pages : le vrai hôte est 9r4rxssx64-creator.github.io (CMCteams y est servi) —
       l'ancien nom sans « -creator » est gardé par sécurité, mais seul ne laissait RIEN passer. */
    if (h === '9r4rxssx64.github.io' || h === '9r4rxssx64-creator.github.io') return true;
    if (h === 'localhost' || h === '127.0.0.1') return true; // dev local
    return false;
  } catch (_) {
    return false;
  }
}

export function corsHeaders(origin) {
  // Origin explicite si de confiance, sinon '*' pour les keyless publiques (lecture seule).
  const allow = isTrustedOrigin(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-apex-pin,x-kdmc-app',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
      ...(extra || {}),
    },
  });
}

function err(message, status, origin, detail) {
  return json(
    { ok: false, error: message, detail: detail || null, status: status || 500 },
    status || 500,
    origin
  );
}

// ---------- KEYLESS : APIs gratuites sans clé (relais CORS) ----------
// Chaque entrée construit l'URL upstream depuis les query params. AUCUNE invention de
// données : on relaie l'upstream tel quel. Gratuit + anonyme → accessible aux origines '*'.
/* Kevin 2026-09-05 « Qwen l'IA gratuite en principal… pareil dans mes autres projets » :
   le routage IA commun du domaine (Qwen Workers AI d'abord, bascule par type de question). */
import { routeText, routeSmart, analyseQuestion, detectDomain, routingStatus, DOMAIN_PREFERENCES, QWEN_MODELS } from '../_shared/ia-route.js';

export const KEYLESS = {
  // Météo (anticiper l'affluence casino — Convention SBM art.17.6).
  // /weather?lat=43.74&lon=7.42&daily=temperature_2m_max,precipitation_sum
  weather: (p) => {
    const lat = p.get('lat') || '43.7384'; // Monaco par défaut
    const lon = p.get('lon') || '7.4246';
    const daily = p.get('daily') || 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode';
    const hourly = p.get('hourly') || '';
    let u = `https://api.open-meteo.com/v1/forecast?latitude=${enc(lat)}&longitude=${enc(lon)}&daily=${enc(daily)}&timezone=auto&forecast_days=${enc(p.get('days') || '7')}`;
    if (hourly) u += `&hourly=${enc(hourly)}`;
    return u;
  },
  // Jours fériés France (auto FL/CFL planning). /holidays?year=2026&country=FR
  holidays: (p) =>
    `https://date.nager.at/api/v3/PublicHolidays/${enc(p.get('year') || String(new Date().getUTCFullYear()))}/${enc(p.get('country') || 'FR')}`,
  // Taux de change BCE (prix multi-devises Shops/Chez Lolo). /fx?from=USD&to=EUR&amount=25
  fx: (p) => {
    const from = enc(p.get('from') || 'USD');
    const to = enc(p.get('to') || 'EUR');
    const amount = enc(p.get('amount') || '1');
    return `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}&amount=${amount}`;
  },
  // Géocodage adresse → GPS (fiches employés). /geo?q=Casino+de+Monte-Carlo
  geo: (p) =>
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${enc(p.get('limit') || '5')}&q=${enc(p.get('q') || '')}`,
  // Heure/fuseau exact (horodatage audit cross-device). /time?tz=Europe/Monaco
  time: (p) => `https://timeapi.io/api/time/current/zone?timeZone=${enc(p.get('tz') || 'Europe/Monaco')}`,
  // Traduction gratuite sans clé (RGPD). /translate?q=bonjour&from=fr&to=en
  translate: (p) => {
    const q = enc(p.get('q') || '');
    const from = enc(p.get('from') || 'fr');
    const to = enc(p.get('to') || 'en');
    return `https://api.mymemory.translated.net/get?q=${q}&langpair=${from}%7C${to}`;
  },
  // Résumé Wikipedia (réponses factuelles gratuites). /wiki?title=Monaco&lang=fr
  wiki: (p) => {
    const lang = enc(p.get('lang') || 'fr');
    const title = enc(p.get('title') || '');
    return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`;
  },
  // Recherche d'entreprise FR (SIREN/SIRET, dirigeants). /entreprise?q=SBM&per_page=5
  entreprise: (p) =>
    `https://recherche-entreprises.api.gouv.fr/search?q=${enc(p.get('q') || '')}&page=1&per_page=${enc(p.get('per_page') || '5')}`,
  // Autocomplete adresse FR — Base Adresse Nationale. /adresse?q=1+av+monte-carlo&limit=5
  adresse: (p) =>
    `https://api-adresse.data.gouv.fr/search/?q=${enc(p.get('q') || '')}&limit=${enc(p.get('limit') || '5')}`,
  // Prix crypto (CoinGecko keyless). /crypto?ids=bitcoin,ethereum&vs=eur
  crypto: (p) =>
    `https://api.coingecko.com/api/v3/simple/price?ids=${enc(p.get('ids') || 'bitcoin,ethereum')}&vs_currencies=${enc(p.get('vs') || 'eur')}`,
};

// Géoloc par IP : upstream spécial (chemin depuis l'IP de l'appelant). /geoip
async function handleGeoip(request, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const url = ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : 'https://ipwho.is/';
  return relay(url, {}, origin, 'geoip');
}

// Pwned Passwords (k-anonymity : on n'envoie JAMAIS le mot de passe, juste 5 hex du SHA-1).
// /pwned?prefix=5BAA6  → renvoie la liste des suffixes+compteurs (le client compare localement).
async function handlePwned(p, origin) {
  const prefix = (p.get('prefix') || '').toUpperCase();
  if (!/^[0-9A-F]{5}$/.test(prefix)) {
    return err('prefix invalide (5 hexadécimaux du SHA-1 attendus)', 400, origin);
  }
  try {
    const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'kdmc-apis' },
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(origin) },
    });
  } catch (e) {
    return err('pwned upstream failed', 502, origin, String(e && e.message));
  }
}

// Validation IBAN (openiban.com, sans clé ni compte). /iban?value=FR76...
async function handleIban(p, origin) {
  const raw = (p.get('value') || p.get('iban') || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{5,34}$/.test(raw)) return err('IBAN invalide (format)', 400, origin);
  return relay(`https://openiban.com/validate/${raw}?getBIC=true&validateBankCode=true`, {}, origin, 'iban');
}

// Validation TVA UE (VIES REST officiel, sans clé). /vat?country=FR&number=12345678901
async function handleVat(p, origin) {
  const cc = (p.get('country') || '').toUpperCase();
  const num = (p.get('number') || '').replace(/[^0-9A-Za-z]/g, '');
  if (!/^[A-Z]{2}$/.test(cc) || !num) return err('country (2 lettres) + number requis', 400, origin);
  return relay(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${cc}/vat/${enc(num)}`, {}, origin, 'vat');
}

// RSS : proxy de flux avec ALLOWLIST de domaines (anti-SSRF — pas un proxy ouvert).
// Étendre RSS_ALLOW pour autoriser d'autres sources (suffixes d'hôte).
export const RSS_ALLOW = ['gouv.fr', 'gouv.mc', 'europa.eu', 'monaco.mc', 'legimonaco.mc', 'wikipedia.org', 'nature.com'];

export function isRssAllowed(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname.toLowerCase();
    if (h === 'localhost' || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(h)) return false;
    return RSS_ALLOW.some((suf) => h === suf || h.endsWith('.' + suf));
  } catch (_) {
    return false;
  }
}

async function handleRss(p, origin) {
  const u = p.get('url') || '';
  if (!u) return err('paramètre url requis', 400, origin);
  if (!isRssAllowed(u)) return err('hôte non autorisé (ajouter à RSS_ALLOW)', 403, origin, u);
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'kdmc-apis (kd-mc.com)' } });
    const text = await r.text();
    return new Response(text.slice(0, 500000), {
      status: r.status,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', ...corsHeaders(origin) },
    });
  } catch (e) {
    return err('rss upstream indisponible', 502, origin, String(e && e.message));
  }
}

// Réputation d'URL via Google Safe Browsing v4 (clé GOOGLE_API_KEY déjà en secret).
async function handleReputation(request, env, origin) {
  const url = new URL(request.url);
  let target = url.searchParams.get('url') || '';
  if (!target && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    target = b.url || '';
  }
  if (!target) return err('paramètre url requis', 400, origin);
  if (!env.GOOGLE_API_KEY) return err('GOOGLE_API_KEY manquant', 501, origin);
  try {
    const r = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${enc(env.GOOGLE_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'kdmc-apis', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: target }],
        },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return err('safebrowsing upstream', 502, origin, data);
    const matches = data.matches || [];
    return json({ ok: true, url: target, safe: matches.length === 0, verdict: matches.length ? 'malicious' : 'safe', matches }, 200, origin);
  } catch (e) {
    return err('reputation indisponible', 502, origin, String(e && e.message));
  }
}

// ---------- KEYED : providers avec clé serveur (constructeurs PURS = testables) ----------
// buildAiRequest : convertit {messages, model} vers le format de CHAQUE provider.
// Chaîne de failover par défaut : gemini → groq → openrouter → mistral → cohere.
// Kevin 2026-08-12 : « beaucoup d'autres IA gratuites, partout dans les apps,
// en secours ». Les nouveaux paliers gratuits sont ajoutés APRÈS les moteurs
// déjà éprouvés — l'ordre existant ne bouge pas (aucune régression), et une
// clé absente = moteur simplement sauté (voir handleAi : skipped 'no_key').
// Mêmes adresses et mêmes modèles que le worker Créa Studio, pour n'avoir
// qu'UNE seule vérité (un test de parité le vérifie).
// Kevin 2026-09-05 « Qwen l'IA gratuite en principal… bascule automatiquement sur la plus
// pertinente… pareil dans mes autres projets » : /ai passe d'abord par le ROUTAGE COMMUN
// (services/_shared/ia-route.js : Qwen Workers AI 0 clé en tête des questions courantes,
// Anthropic pour code/raisonnement/actions, Gemini vision, Perplexity recherche), puis par
// cette chaîne historique en secours (paliers gratuits à clé, ordre INCHANGÉ — garde
// test:apis-paliers), puis Workers AI llama en tout dernier.
export const AI_CHAIN = [
  'gemini', 'groq', 'openrouter', 'mistral', 'cohere', 'deepseek', 'together', 'xai',
  'perplexity', 'cerebras', 'nvidia', 'sambanova', 'huggingface', 'scaleway', 'nebius', 'glm', 'qwen',
];

export const AI_DEFAULT_MODEL = {
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  mistral: 'mistral-small-latest',
  cohere: 'command-r-plus',
  deepseek: 'deepseek-chat',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
  xai: 'grok-2-latest',
  perplexity: 'sonar',
  cerebras: 'llama-3.3-70b',
  nvidia: 'meta/llama-3.3-70b-instruct',
  sambanova: 'Meta-Llama-3.3-70B-Instruct',
  huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
  scaleway: 'llama-3.3-70b-instruct',
  nebius: 'meta-llama/Llama-3.3-70B-Instruct',
  glm: 'glm-4-flash',
  qwen: 'qwen-turbo',
};

// Providers OpenAI-compatibles (même shape /chat/completions).
const OPENAI_COMPAT = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/v1/chat/completions',
  scaleway: 'https://api.scaleway.ai/v1/chat/completions',
  nebius: 'https://api.studio.nebius.com/v1/chat/completions',
  glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
};

export function buildAiRequest(provider, key, opts) {
  const messages = (opts && opts.messages) || [];
  const model = (opts && opts.model) || AI_DEFAULT_MODEL[provider];
  if (provider === 'gemini') {
    // Gemini a son propre format (contents/parts) + clé en query.
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }));
    const sys = messages.find((m) => m.role === 'system');
    const body = { contents };
    if (sys) body.systemInstruction = { parts: [{ text: String(sys.content || '') }] };
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }
  if (provider === 'cohere') {
    return {
      url: 'https://api.cohere.com/v2/chat',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages }),
    };
  }
  if (OPENAI_COMPAT[provider]) {
    return {
      url: OPENAI_COMPAT[provider],
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages }),
    };
  }
  return null;
}

// Extrait le texte de la réponse selon le provider (constructeur pur = testable).
export function extractAiText(provider, data) {
  try {
    if (provider === 'gemini') {
      return data.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '';
    }
    if (provider === 'cohere') {
      const m = data.message;
      if (m && Array.isArray(m.content)) return m.content.map((c) => c.text || '').join('');
      return m?.content || data.text || '';
    }
    return data.choices?.[0]?.message?.content || '';
  } catch (_) {
    return '';
  }
}

async function handleAi(request, env, origin) {
  let opts;
  try {
    opts = await request.json();
  } catch (_) {
    return err('body JSON invalide', 400, origin);
  }
  // POST /ai/analyse { text } — la CONCERTATION D'ANALYSE seule (Kevin 2026-09-06) : plusieurs
  // voix gratuites classent la question (vote), pour qu'une app décide AVANT d'appeler un moteur.
  if (new URL(request.url).pathname.replace(/\/+$/, '') === '/ai/analyse') {
    const text = String((opts && (opts.text || (Array.isArray(opts.messages) && opts.messages.length && opts.messages[opts.messages.length - 1].content))) || '');
    if (!text.trim()) return err('text requis', 400, origin);
    const a = await analyseQuestion(env, text);
    return json(Object.assign({ ok: true }, a), 200, origin);
  }
  if (!opts || !Array.isArray(opts.messages) || !opts.messages.length) {
    return err('messages[] requis', 400, origin);
  }
  const tried = [];
  // 1) Routage commun du domaine (sauf provider forcé « à l'ancienne ») : Qwen Workers AI
  //    d'abord pour les questions courantes, bascule par TYPE de question sinon.
  //    Kevin 2026-09-06 « concertation d'IA gratuites pour analyser les questions, va plus
  //    loin » : le type est VOTÉ par plusieurs voix gratuites (analyse:'concert', défaut) et
  //    une question difficile est répondue par un CONSEIL de voix + juge gratuit (council:'auto').
  const forced = opts.provider && opts.provider !== 'workers-ai' && opts.provider !== 'qwen-cf';
  if (!forced) {
    const domain = (opts.domain && DOMAIN_PREFERENCES[opts.domain]) ? opts.domain : undefined;
    const routed = await routeSmart(env, {
      messages: opts.messages,
      domain,
      analyse: opts.analyse === 'regex' ? 'regex' : 'concert',
      council: opts.council === false ? false : (opts.council === true ? true : 'auto'),
      maxTokens: Math.min(4000, Math.max(50, parseInt(opts.max_tokens, 10) || 800)),
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
      premium: !!opts.premium,
      timeoutMs: 20000,
    });
    if (routed.ok) {
      return json({
        ok: true, provider: routed.provider, model: routed.model, domain: routed.domain, text: routed.text,
        analyse: routed.analyse ? { by: routed.analyse.by, votes: routed.analyse.votes, complexity: routed.analyse.complexity, needs_tools: routed.analyse.needs_tools } : null,
        voices: routed.voices || null, judge: routed.judge || null, tried: routed.tried,
      }, 200, origin);
    }
    tried.push(...(routed.tried || []));
  }
  // 2) Secours historique : chaîne des paliers gratuits à clé (ceux que le routage commun
  //    ne connaît pas : cohere, together, nvidia…), sans re-tenter ce qui vient d'échouer.
  const already = new Set(tried.map((t) => t.provider));
  const chain = forced ? [opts.provider] : AI_CHAIN.filter((p) => !already.has(p));
  for (const provider of chain) {
    const key = env[secretName(provider)];
    if (!key) {
      tried.push({ provider, skipped: 'no_key' });
      continue;
    }
    const req = buildAiRequest(provider, key, opts);
    if (!req) {
      tried.push({ provider, skipped: 'unsupported' });
      continue;
    }
    try {
      const r = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        return json({ ok: true, provider, model: opts.model || AI_DEFAULT_MODEL[provider], text: extractAiText(provider, data) }, 200, origin);
      }
      tried.push({ provider, status: r.status, detail: (data && (data.error?.message || data.message)) || 'upstream error' });
    } catch (e) {
      tried.push({ provider, error: String(e && e.message) });
    }
  }
  // Fallback ULTIME sans AUCUN compte provider externe ni KYC : Cloudflare Workers AI
  // (binding env.AI). Marche même si zéro clé externe n'est configurée.
  if (env.AI && (!opts.provider || opts.provider === 'workers-ai' || opts.provider === 'qwen-cf')) {
    try {
      const model = (opts.provider === 'qwen-cf' ? QWEN_MODELS[0] : opts.model) || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
      const out = await env.AI.run(model, { messages: opts.messages });
      const text = (out && (out.response || (out.result && out.result.response))) || '';
      if (text) return json({ ok: true, provider: 'workers-ai', model, text }, 200, origin);
      tried.push({ provider: 'workers-ai', detail: 'réponse vide' });
    } catch (e) {
      tried.push({ provider: 'workers-ai', error: String(e && e.message) });
    }
  }
  return err('aucun provider IA disponible', 503, origin, tried);
}

// Nom de secret EXACT (leçon "noms secrets matchent exactement").
export function secretName(provider) {
  const map = {
    anthropic: 'ANTHROPIC_API_KEY', // 2026-09-05 : secours « le plus pertinent » (code/raisonnement/actions)
    gemini: 'GEMINI_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    cohere: 'COHERE_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    together: 'TOGETHER_API_KEY',
    xai: 'XAI_API_KEY',
    // Paliers gratuits ajoutés 2026-08-12. Noms de secrets EXACTS : Kevin a des
    // variantes (PERPLEXITI sans Y, OPEN_AI avec underscore) — leçon vécue.
    perplexity: 'PERPLEXITI_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    nvidia: 'NVIDIA_API_KEY',
    sambanova: 'SAMBANOVA_API_KEY',
    huggingface: 'HF_TOKEN',
    scaleway: 'SCALEWAY_API_KEY',
    nebius: 'NEBIUS_API_KEY',
    glm: 'GLM_API_KEY',
    qwen: 'DASHSCOPE_API_KEY',
    tavily: 'TAVILY_API_KEY',
    brave: 'BRAVE_API_KEY',
    pexels: 'PEXELS_API_KEY',
    finnhub: 'FINNHUB_API_KEY',
    printify: 'PRINTIFY_API_KEY',
    resend: 'RESEND_API_KEY',
    google: 'GOOGLE_API_KEY',
  };
  return map[provider] || '';
}

// Recherche web : Tavily (POST) puis Brave (GET) en failover.
async function handleSearch(request, env, origin) {
  const url = new URL(request.url);
  let q = url.searchParams.get('q') || '';
  if (!q && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    q = b.q || b.query || '';
  }
  if (!q) return err('paramètre q requis', 400, origin);
  if (env.TAVILY_API_KEY) {
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: q, max_results: 5 }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return json({ ok: true, provider: 'tavily', results: data.results || [], answer: data.answer || null }, 200, origin);
    } catch (_) {}
  }
  if (env.BRAVE_API_KEY) {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${enc(q)}&count=5`, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY },
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return json({ ok: true, provider: 'brave', results: data.web?.results || [] }, 200, origin);
    } catch (_) {}
  }
  return err('recherche indisponible (TAVILY_API_KEY / BRAVE_API_KEY manquants)', 501, origin);
}

// Finance : cours Finnhub. /finance?symbol=AAPL
async function handleFinance(p, env, origin) {
  if (!env.FINNHUB_API_KEY) return err('FINNHUB_API_KEY manquant', 501, origin);
  const symbol = enc(p.get('symbol') || 'AAPL');
  return relay(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${enc(env.FINNHUB_API_KEY)}`, {}, origin, 'finance');
}

// Images : Pexels. /images?q=casino&per_page=6
async function handleImages(p, env, origin) {
  if (!env.PEXELS_API_KEY) return err('PEXELS_API_KEY manquant', 501, origin);
  const q = enc(p.get('q') || 'monaco');
  const per = enc(p.get('per_page') || '6');
  return relay(`https://api.pexels.com/v1/search?query=${q}&per_page=${per}`, { Authorization: env.PEXELS_API_KEY }, origin, 'images');
}

// Printify : catalogue blueprints (résout le TODO Chez Lolo). /printify/blueprints
async function handlePrintify(path, env, origin) {
  if (!env.PRINTIFY_API_KEY) return err('PRINTIFY_API_KEY manquant', 501, origin);
  const sub = path.replace(/^\/printify\/?/, '') || 'catalog/blueprints.json';
  const clean = sub.startsWith('catalog/') ? sub : `catalog/${sub}`;
  return relay(`https://api.printify.com/v1/${clean}`, { Authorization: `Bearer ${env.PRINTIFY_API_KEY}` }, origin, 'printify');
}

// ---------- Utilitaires ----------
function enc(s) {
  return encodeURIComponent(String(s == null ? '' : s));
}

// Relais générique d'un GET upstream → JSON + CORS. Erreurs détaillées.
async function relay(url, headers, origin, tag) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'kdmc-apis (kd-mc.com)', Accept: 'application/json', ...(headers || {}) } });
    const ct = r.headers.get('content-type') || '';
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: {
        'Content-Type': ct.includes('json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    return err(`${tag || 'upstream'} indisponible`, 502, origin, String(e && e.message));
  }
}

// Liste des clés présentes (health, sans révéler les valeurs).
function keyStatus(env) {
  const out = {};
  // La liste vient de AI_CHAIN pour ne jamais oublier un moteur ajouté (une
  // liste recopiée à la main finit toujours par diverger).
  for (const prov of AI_CHAIN.concat(['tavily', 'brave', 'pexels', 'finnhub', 'printify', 'resend', 'google'])) {
    out[prov] = !!env[secretName(prov)];
  }
  return out;
}

// ---------- Routeur principal ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const p = url.searchParams;

    // Préflight CORS (leçon #95 : répondre AVANT toute auth, headers explicites).
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Health — aucune auth (utilisé par external-apis-health.yml + diagnostics apps).
    if (path === '/health' || path === '/') {
      return json(
        {
          ok: true,
          service: 'kdmc-apis',
          keyless: Object.keys(KEYLESS).concat(['geoip', 'pwned', 'iban', 'vat', 'rss']),
          keyed: ['ai', 'search', 'finance', 'images', 'printify', 'reputation'],
          workers_ai: !!env.AI,
          /* Kevin 2026-09-05 : qui répond en premier pour chaque type de question (Qwen gratuit
             en principal, Anthropic code/raisonnement/actions, Gemini vision…) — honnête, mesuré. */
          ia_routing: routingStatus(env),
          keys: keyStatus(env),
          ts: Date.now(),
        },
        200,
        origin
      );
    }

    const routeName = path.slice(1).split('/')[0];

    // Routes keyless publiques (relais simple, origines '*' tolérées car déjà gratuites/anonymes).
    if (KEYLESS[routeName]) {
      return relay(KEYLESS[routeName](p), routeName === 'geo' ? {} : {}, origin, routeName);
    }
    if (routeName === 'geoip') return handleGeoip(request, origin);
    if (routeName === 'pwned') return handlePwned(p, origin);
    if (routeName === 'iban') return handleIban(p, origin);
    if (routeName === 'vat') return handleVat(p, origin);
    if (routeName === 'rss') return handleRss(p, origin);

    // Routes keyed (clé serveur) : Origin de confiance OBLIGATOIRE (anti-abus).
    const keyed = ['ai', 'search', 'finance', 'images', 'printify', 'reputation'];
    if (keyed.includes(routeName)) {
      if (!isTrustedOrigin(origin)) {
        return err('origine non autorisée', 403, origin, 'Origin doit être *.kd-mc.com, Pages ou localhost');
      }
      if (routeName === 'ai') return handleAi(request, env, origin);
      if (routeName === 'search') return handleSearch(request, env, origin);
      if (routeName === 'finance') return handleFinance(p, env, origin);
      if (routeName === 'images') return handleImages(p, env, origin);
      if (routeName === 'printify') return handlePrintify(path, env, origin);
      if (routeName === 'reputation') return handleReputation(request, env, origin);
    }

    return err('route inconnue', 404, origin, path);
  },
};
