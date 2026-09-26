/* PREUVE — worker kdmc-crea-ai : la 2ᵉ IA gratuite prend VRAIMENT le relais.
 * On importe le vrai worker et on l'appelle directement, avec :
 *   - Gemini SIMULÉ EN PANNE (fetch mocké → 429 / 500)
 *   - Cloudflare Workers AI simulé par un faux binding env.AI
 * On prouve que /lyrics, /compose et /voice répondent quand même, et que la
 * réponse dit HONNÊTEMENT quelle IA a servi (provider) et pourquoi (fallback).
 * Aucun appel réseau réel (leçon #135).
 * Lancer : node tests/verify-crea-ai-fallback.mjs
 */
import worker from '../services/kdmc-crea-ai/worker.js';

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);

const SCORE = {
  bpm: 108, key: 2, scale: 'minor', progression: [0, 5, 3, 4],
  melody: [0, 2, 4, 2, 0, -3, 0, 4, 5, 4, 2, 0, -99, 2, 4, 7],
  drums: { kick: Array(16).fill(0), snare: Array(16).fill(0), hat: Array(16).fill(0) },
  bassPattern: [0, 0, 5, 5, 3, 3, 4, 4],
};

/* Faux moteur Cloudflare : répond comme le vrai (texte, JSON, audio) */
function fakeAI(opts = {}) {
  return {
    run: async (model, input) => {
      if (/melotts/.test(model)) {
        if (opts.ttsDown) throw new Error('capacity');
        return { audio: Buffer.from('FAKE-AUDIO-DATA-'.repeat(40)).toString('base64') };
      }
      if (/llama/.test(model)) {
        if (opts.textDown) throw new Error('capacity');
        const wantsJson = /JSON/i.test(input.messages[0].content);
        // le vrai modèle bavarde parfois autour du JSON : on le simule exprès
        return { response: wantsJson ? 'Voici :\n```json\n' + JSON.stringify(SCORE) + '\n```' : 'TITRE: Chanson de secours\nCOUPLET 1:\nune ligne\nREFRAIN:\nun refrain' };
      }
      return {};
    },
  };
}

const realFetch = globalThis.fetch;
function mockGemini(mode) {          // 'down' = panne, 'nokey' = pas appelé
  globalThis.fetch = async (u) => {
    if (String(u).includes('generativelanguage')) {
      return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200 });
  };
}
const post = (path, body, env) => worker.fetch(
  new Request('https://x' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify(body) }),
  env);

// ── 1) Gemini EN PANNE → Workers AI écrit les paroles ────────────────────────
mockGemini('down');
let env = { GEMINI_API_KEY: 'fake', AI: fakeAI() };
let r = await post('/lyrics', { theme: 'une soiree entre amis', style: 'pop' }, env);
let j = await r.json();
chk(r.status === 200 && /TITRE/.test(j.lyrics || ''), `paroles produites malgré la panne Gemini (HTTP ${r.status})`);
/* v9.9 : le label nomme désormais le MODÈLE exact (`cloudflare:@cf/…`) — plus
   honnête que « cloudflare » tout court, et indispensable depuis l'ajout de Qwen
   (Kevin doit voir SI c'est Qwen ou Llama qui a répondu). On exige donc les deux. */
chk(/^cloudflare:@cf\//.test(j.provider || ''), `la réponse dit honnêtement quelle IA ET quel modèle ont servi (provider=${j.provider})`);
chk(/gemini_429/.test(j.fallback || ''), `la cause exacte de la bascule est indiquée (${String(j.fallback).slice(0, 40)})`);

// ── 2) Gemini EN PANNE → Workers AI écrit la partition (même bavarde) ────────
r = await post('/compose', { style: 'pop', mood: 'joyeux' }, env);
j = await r.json();
chk(r.status === 200 && j.score && Array.isArray(j.score.melody), `partition produite malgré la panne Gemini (HTTP ${r.status})`);
chk(j.score && j.score.bpm === 108 && j.score.progression.length === 4, 'partition complète (tempo + accords + mélodie)');
chk(/^cloudflare:@cf\//.test(j.provider || ''), `partition attribuée à la bonne IA, modèle nommé (provider=${j.provider})`);

// ── 3) La voix passe par Workers AI ──────────────────────────────────────────
r = await post('/voice', { text: 'on chante tous ensemble', lang: 'fr' }, env);
chk(r.status === 200 && /audio/.test(r.headers.get('content-type') || ''), `voix produite (HTTP ${r.status}, type ${r.headers.get('content-type')})`);
const audio = await r.arrayBuffer();
chk(audio.byteLength > 200, `vrai fichier audio renvoyé (${audio.byteLength} octets)`);

// ── 4) AUCUNE clé Gemini du tout → l'app doit continuer à vivre ──────────────
env = { AI: fakeAI() };                       // pas de clé, pas de Replicate
r = await post('/lyrics', { theme: 'test', style: 'pop' }, env);
j = await r.json();
chk(r.status === 200 && /^cloudflare:/.test(j.provider || ''), `sans clé Gemini, l'app marche quand même (HTTP ${r.status})`);
r = await worker.fetch(new Request('https://x/health', { headers: { origin: 'https://kd-mc.com' } }), env);
j = await r.json();
chk(j.ok === true && j.configured === true && j.cloudflare === true, 'l\'état de santé annonce bien la 2ᵉ IA disponible');

// ── 5) LES DEUX en panne → message d'erreur avec la CAUSE EXACTE ─────────────
env = { GEMINI_API_KEY: 'fake', AI: fakeAI({ textDown: true }) };
r = await post('/compose', { style: 'pop' }, env);
j = await r.json();
chk(r.status === 502 && /gemini_429/.test(j.error || '') && /cloudflare_/.test(j.error || ''),
  `si toutes les IA tombent, l'erreur nomme CHACUNE avec sa cause (${String(j.error).slice(0, 70)})`);

// ── 6) TOUTES les IA gratuites : la 1re en panne, une AUTRE prend le relais ───
globalThis.fetch = async (u, o) => {
  const url = String(u);
  if (url.includes('groq.com')) return new Response('{"error":"rate limit"}', { status: 429 });
  if (url.includes('generativelanguage')) return new Response('{"error":{"message":"quota"}}', { status: 429 });
  if (url.includes('mistral.ai')) return new Response(JSON.stringify({ choices: [{ message: { content: 'TITRE: Par Mistral\nCOUPLET 1:\nune ligne' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  return new Response('{}', { status: 500 });
};
env = { GROQ_API_KEY: 'k', GEMINI_API_KEY: 'k', MISTRAL_API_KEY: 'k', COHERE_API_KEY: 'k' };
r = await post('/lyrics', { theme: 'test', style: 'pop' }, env);
j = await r.json();
chk(r.status === 200 && j.provider === 'mistral' && /Par Mistral/.test(j.lyrics || ''),
  `2 IA en panne → une 3e prend le relais toute seule (provider=${j.provider})`);
chk(/groq_429/.test(j.fallback || ''), `et Kevin voit POURQUOI ça a basculé (${String(j.fallback).slice(0, 34)})`);

// une IA sans clé n'est jamais appelée (pas d'appel inutile ni d'erreur trompeuse)
env = { MISTRAL_API_KEY: 'k' };
r = await post('/lyrics', { theme: 'test' }, env);
j = await r.json();
chk(r.status === 200 && j.provider === 'mistral' && !j.fallback,
  'une IA sans clé est ignorée proprement (aucune erreur inventée)');

globalThis.fetch = realFetch;
console.log('=== CRÉA IA — SECOURS GRATUIT ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
