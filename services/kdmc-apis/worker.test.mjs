// Tests unitaires kdmc-apis (node --test, sans réseau). Valide : CORS/origines,
// health, dispatch keyless/keyed, gate origine, constructeurs IA purs, noms secrets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, {
  isTrustedOrigin,
  corsHeaders,
  KEYLESS,
  buildAiRequest,
  extractAiText,
  secretName,
  AI_CHAIN,
  isRssAllowed,
  RSS_ALLOW,
} from './worker.js';

const ENV = {}; // aucune clé → teste le comportement fail-open

async function call(pathAndQuery, opts = {}) {
  const req = new Request('https://apis.kd-mc.com' + pathAndQuery, {
    method: opts.method || 'GET',
    headers: opts.headers || {},
    body: opts.body,
  });
  return worker.fetch(req, opts.env || ENV);
}

test('isTrustedOrigin : *.kd-mc.com + Pages + localhost OK, reste KO', () => {
  assert.equal(isTrustedOrigin('https://cmcteams.kd-mc.com'), true);
  assert.equal(isTrustedOrigin('https://kd-mc.com'), true);
  assert.equal(isTrustedOrigin('https://9r4rxssx64.github.io'), true);
  assert.equal(isTrustedOrigin('http://localhost:8080'), true);
  assert.equal(isTrustedOrigin('https://evil.com'), false);
  assert.equal(isTrustedOrigin('https://kd-mc.com.evil.com'), false);
  assert.equal(isTrustedOrigin(''), false);
});

test('corsHeaders : origine de confiance renvoyée telle quelle, sinon *', () => {
  assert.equal(corsHeaders('https://apex-ai.kd-mc.com')['Access-Control-Allow-Origin'], 'https://apex-ai.kd-mc.com');
  assert.equal(corsHeaders('https://evil.com')['Access-Control-Allow-Origin'], '*');
});

test('OPTIONS préflight → 204 avec CORS (avant toute auth)', async () => {
  const r = await call('/ai', { method: 'OPTIONS', headers: { Origin: 'https://evil.com' } });
  assert.equal(r.status, 204);
  assert.ok(r.headers.get('Access-Control-Allow-Methods').includes('POST'));
});

test('/health : ok + liste routes + statut clés (aucune auth)', async () => {
  const r = await call('/health');
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.ok, true);
  assert.equal(b.service, 'kdmc-apis');
  assert.ok(b.keyless.includes('weather'));
  assert.ok(b.keyed.includes('ai'));
  assert.equal(b.keys.gemini, false); // pas de clé dans ENV de test
});

test('KEYLESS.weather : URL open-meteo Monaco par défaut', () => {
  const p = new URLSearchParams('');
  const u = KEYLESS.weather(p);
  assert.ok(u.startsWith('https://api.open-meteo.com/v1/forecast'));
  assert.ok(u.includes('latitude=43.7384'));
  assert.ok(u.includes('timezone=auto'));
});

test('KEYLESS.holidays : nager.date FR année courante', () => {
  const u = KEYLESS.holidays(new URLSearchParams('country=FR&year=2026'));
  assert.equal(u, 'https://date.nager.at/api/v3/PublicHolidays/2026/FR');
});

test('KEYLESS.fx : frankfurter USD→EUR', () => {
  const u = KEYLESS.fx(new URLSearchParams('from=USD&to=EUR&amount=25'));
  assert.ok(u.includes('base=USD') && u.includes('symbols=EUR') && u.includes('amount=25'));
});

test('KEYLESS.translate : mymemory encode le pipe langpair', () => {
  const u = KEYLESS.translate(new URLSearchParams('q=bonjour&from=fr&to=en'));
  assert.ok(u.includes('langpair=fr%7Cen'));
  assert.ok(u.includes('q=bonjour'));
});

test('route keyed sans origine de confiance → 403', async () => {
  const r = await call('/ai', { method: 'POST', headers: { Origin: 'https://evil.com', 'Content-Type': 'application/json' }, body: '{"messages":[{"role":"user","content":"hi"}]}' });
  assert.equal(r.status, 403);
});

test('/ai origine OK mais aucune clé → 503 avec détail par provider', async () => {
  const r = await call('/ai', {
    method: 'POST',
    headers: { Origin: 'https://apex-chat.kd-mc.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'salut' }] }),
    env: {},
  });
  assert.equal(r.status, 503);
  const b = await r.json();
  assert.equal(b.ok, false);
  assert.ok(Array.isArray(b.detail));
  assert.ok(b.detail.every((t) => t.skipped === 'no_key'));
});

test('/search origine OK sans clés → 501 clair', async () => {
  const r = await call('/search?q=monaco', { headers: { Origin: 'https://apex-ai.kd-mc.com' } });
  assert.equal(r.status, 501);
});

test('buildAiRequest gemini : format contents + clé en query', () => {
  const req = buildAiRequest('gemini', 'KEY123', { messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] });
  assert.ok(req.url.includes('generativelanguage.googleapis.com'));
  assert.ok(req.url.includes('key=KEY123'));
  const body = JSON.parse(req.body);
  assert.equal(body.contents[0].parts[0].text, 'hi');
  assert.equal(body.systemInstruction.parts[0].text, 'sys');
});

test('buildAiRequest groq : OpenAI-compatible + Bearer', () => {
  const req = buildAiRequest('groq', 'KEY', { messages: [{ role: 'user', content: 'x' }] });
  assert.ok(req.url.includes('api.groq.com'));
  assert.equal(req.headers.Authorization, 'Bearer KEY');
  assert.equal(JSON.parse(req.body).model, 'llama-3.3-70b-versatile');
});

test('buildAiRequest cohere : v2/chat', () => {
  const req = buildAiRequest('cohere', 'KEY', { messages: [{ role: 'user', content: 'x' }] });
  assert.ok(req.url.includes('api.cohere.com/v2/chat'));
});

test('extractAiText : gemini / openai-compat / cohere', () => {
  assert.equal(extractAiText('gemini', { candidates: [{ content: { parts: [{ text: 'A' }, { text: 'B' }] } }] }), 'AB');
  assert.equal(extractAiText('groq', { choices: [{ message: { content: 'hey' } }] }), 'hey');
  assert.equal(extractAiText('cohere', { message: { content: [{ text: 'co' }] } }), 'co');
});

test('secretName : noms EXACTS (leçon secrets)', () => {
  assert.equal(secretName('gemini'), 'GEMINI_API_KEY');
  assert.equal(secretName('openrouter'), 'OPENROUTER_API_KEY');
  assert.equal(secretName('printify'), 'PRINTIFY_API_KEY');
  assert.equal(secretName('inconnu'), '');
});

test('AI_CHAIN (secours historique, ordre inchangé) : gemini en tête, providers connus', () => {
  assert.equal(AI_CHAIN[0], 'gemini');
  assert.ok(AI_CHAIN.includes('openrouter'));
});

test('route inconnue → 404 avec chemin', async () => {
  const r = await call('/nope', { headers: { Origin: 'https://kd-mc.com' } });
  assert.equal(r.status, 404);
});

test('pwned : prefix invalide → 400', async () => {
  const r = await call('/pwned?prefix=zz', { headers: { Origin: 'https://kd-mc.com' } });
  assert.equal(r.status, 400);
});

test('KEYLESS.entreprise/adresse/crypto : URLs gouv.fr + coingecko', () => {
  assert.ok(KEYLESS.entreprise(new URLSearchParams('q=SBM')).startsWith('https://recherche-entreprises.api.gouv.fr/search?q=SBM'));
  assert.ok(KEYLESS.adresse(new URLSearchParams('q=monaco')).startsWith('https://api-adresse.data.gouv.fr/search/?q=monaco'));
  assert.ok(KEYLESS.crypto(new URLSearchParams('ids=bitcoin&vs=eur')).includes('ids=bitcoin') );
});

test('/iban : format invalide → 400', async () => {
  const r = await call('/iban?value=xx', { headers: { Origin: 'https://kd-mc.com' } });
  assert.equal(r.status, 400);
});

test('/vat : country/number manquants → 400', async () => {
  const r = await call('/vat?country=FR', { headers: { Origin: 'https://kd-mc.com' } });
  assert.equal(r.status, 400);
});

test('/health : liste iban/vat/entreprise + flag workers_ai', async () => {
  const r = await call('/health');
  const b = await r.json();
  assert.ok(b.keyless.includes('iban'));
  assert.ok(b.keyless.includes('vat'));
  assert.ok(b.keyless.includes('entreprise'));
  assert.equal(b.workers_ai, false); // pas de binding AI en test
});

test('isRssAllowed : allowlist (gouv.fr OK, evil.com KO, http KO, IP privée KO)', () => {
  assert.equal(isRssAllowed('https://www.gouv.fr/rss.xml'), true);
  assert.equal(isRssAllowed('https://legimonaco.mc/feed'), true);
  assert.equal(isRssAllowed('https://evil.com/feed'), false);
  assert.equal(isRssAllowed('http://www.gouv.fr/feed'), false); // http refusé
  assert.equal(isRssAllowed('https://192.168.1.1/feed'), false); // IP privée refusée
  assert.ok(RSS_ALLOW.includes('gouv.mc'));
});

test('/rss : hôte non autorisé → 403 ; url manquante → 400', async () => {
  const r1 = await call('/rss?url=https://evil.com/feed', { headers: { Origin: 'https://kd-mc.com' } });
  assert.equal(r1.status, 403);
  const r2 = await call('/rss', { headers: { Origin: 'https://kd-mc.com' } });
  assert.equal(r2.status, 400);
});

test('/reputation : origine KO → 403 ; origine OK sans GOOGLE_API_KEY → 501', async () => {
  const bad = await call('/reputation?url=https://x.com', { headers: { Origin: 'https://evil.com' } });
  assert.equal(bad.status, 403);
  const ok = await call('/reputation?url=https://x.com', { headers: { Origin: 'https://apex-chat.kd-mc.com' }, env: {} });
  assert.equal(ok.status, 501);
});

test('/ai : fallback Workers AI SANS clé externe (env.AI mock) → 200', async () => {
  const fakeAI = { run: async () => ({ response: 'salut depuis Workers AI' }) };
  const r = await call('/ai', {
    method: 'POST',
    headers: { Origin: 'https://apex-ai.kd-mc.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'coucou' }] }),
    env: { AI: fakeAI }, // aucune clé externe, juste le binding Cloudflare
  });
  assert.equal(r.status, 200);
  const b = await r.json();
  /* Kevin 2026-09-05 : sans aucune clé, c'est QWEN (Workers AI) qui répond — et il est nommé. */
  assert.equal(b.provider, 'qwen');
  assert.equal(b.model, '@cf/qwen/qwen3.8-27b');
  assert.equal(b.domain, 'general');
  assert.ok(b.text.includes('Workers AI'));
});

test('/ai : une ACTION va à Anthropic (outils) même avec Qwen disponible ; réponse vide Qwen → secours', async () => {
  const calls = [];
  /* les appels d'ANALYSE (classificateur) ne comptent pas : seuls les appels de RÉPONSE sont tracés */
  const fakeAI = { run: async (model, input) => { const sys = String(input.messages[0].content); if (/classificateur/i.test(sys)) return { response: '?' }; calls.push(model); return { response: '<think>hmm</think>Qwen répond' }; } };
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.anthropic.com')) return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Anthropic agit' }] }), { status: 200 });
    return new Response('{}', { status: 500 });
  };
  try {
    const r = await call('/ai', {
      method: 'POST',
      headers: { Origin: 'https://cmcteams.kd-mc.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'déploie le worker maintenant' }] }),
      env: { AI: fakeAI, ANTHROPIC_API_KEY: 'k' },
    });
    const b = await r.json();
    assert.equal(r.status, 200);
    assert.equal(b.provider, 'anthropic');
    assert.equal(b.domain, 'admin');
    assert.equal(calls.length, 0, 'Qwen pas appelé pour une action');

    const g = await call('/ai', {
      method: 'POST',
      headers: { Origin: 'https://cmcteams.kd-mc.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'quelle heure ouvre le casino ?' }] }),
      env: { AI: fakeAI, ANTHROPIC_API_KEY: 'k' },
    });
    const gb = await g.json();
    assert.equal(gb.provider, 'qwen', 'question courante → Qwen gratuit même si Anthropic est là');
    assert.equal(gb.text, 'Qwen répond', '<think> jamais montré');
  } finally { globalThis.fetch = orig; }
});

test('isTrustedOrigin : le VRAI hôte GitHub Pages (9r4rxssx64-creator) passe', () => {
  assert.equal(isTrustedOrigin('https://9r4rxssx64-creator.github.io'), true);
});

test('/ai/analyse : la CONCERTATION classe la question par vote de voix gratuites (Kevin 2026-09-06)', async () => {
  const fakeAI = { run: async (model, input) => (/classificateur/i.test(String(input.messages[0].content))
    ? { response: '{"domain":"translation","needs_tools":false,"needs_vision":false,"complexity":1,"lang":"fr"}' }
    : { response: 'x' }) };
  const r = await call('/ai/analyse', {
    method: 'POST',
    headers: { Origin: 'https://cmcteams.kd-mc.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'peux-tu me dire ça en italien ?' }),
    env: { AI: fakeAI },
  });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.by, 'concert');
  assert.equal(b.domain, 'translation', 'la regex aurait dit general : le vote va plus loin');
  assert.deepEqual(b.votes, { translation: 3 });
});

test('/ai : question difficile → CONSEIL de voix gratuites + juge (provider council), Anthropic pas appelé', async () => {
  const fakeAI = { run: async (model, input) => {
    const sys = String(input.messages[0].content);
    if (/classificateur/i.test(sys)) return { response: '{"domain":"reasoning","needs_tools":false,"complexity":5}' };
    if (/JUGE/.test(sys)) return { response: 'Réponse fusionnée' };
    return { response: 'avis de ' + model };
  } };
  const orig = globalThis.fetch; let anthropicCalled = false;
  globalThis.fetch = async (u) => { if (/anthropic/.test(String(u))) anthropicCalled = true; return new Response('{}', { status: 500 }); };
  try {
    const r = await call('/ai', {
      method: 'POST',
      headers: { Origin: 'https://cmcteams.kd-mc.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'explique en détail pourquoi la roulette européenne a un avantage maison plus faible' }] }),
      env: { AI: fakeAI, ANTHROPIC_API_KEY: 'k' },
    });
    const b = await r.json();
    assert.equal(r.status, 200);
    assert.equal(b.provider, 'council');
    assert.equal(b.judge, 'qwen');
    assert.equal(b.text, 'Réponse fusionnée');
    assert.equal(b.voices.length, 3);
    assert.equal(anthropicCalled, false);
    /* council:false → une seule voix (le routage classique), toujours gratuit */
    const s = await call('/ai', {
      method: 'POST',
      headers: { Origin: 'https://cmcteams.kd-mc.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'explique en détail pourquoi la roulette européenne a un avantage maison plus faible' }], council: false }),
      env: { AI: fakeAI, ANTHROPIC_API_KEY: 'k' },
    });
    const sb = await s.json();
    assert.equal(sb.domain, 'reasoning');
    assert.equal(anthropicCalled, true, 'raisonnement sans conseil → Anthropic (la plus pertinente), Qwen en secours');
  } finally { globalThis.fetch = orig; }
});
