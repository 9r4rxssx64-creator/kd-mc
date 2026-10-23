/* GARDE — « regarde les voix aussi que l'on ne soit pas limité » (Kevin 23.10.2026).
 * La voix gratuite de Cloudflare (MeloTTS) ne dit que fr, en, es, zh. Pour toute autre langue de Lingua (it, de, pt, nl, pl, ru, uk, cs, ar, ja, ko),
 * quand Google (Chirp) ne répond pas et qu'OpenAI est absent, en panne ou au plafond, l'app retombait sur la voix du téléphone. Gemini TTS (gratuit,
 * déjà configuré) prend maintenant le relais AVANT le téléphone. Prouve, sur le VRAI routeur :
 *   1. italien, Google refuse, pas d'OpenAI            → voix Gemini (x-voix gemini-gratuite), pas la voix du téléphone ;
 *   2. même chose pour Bee (`gratuit=1`)               → Gemini ;
 *   3. OpenAI en panne (500)                           → Gemini ;
 *   4. 2e lecture                                      → cache du bord, 0 appel ;
 *   5. français avec MeloTTS disponible                → MeloTTS d'abord, Gemini jamais appelé ;
 *   6. pas de clé Gemini                               → réponse propre ok:false (repli téléphone), aucune erreur ;
 *   7. aucune voix payante appelée pour les cas 1, 2, 5.
 * node tests/verify-voix-sans-limite.mjs      SABOTAGE : retirer `|| (await geminiSecours())` de voixGratuiteOuGemini → 1, 2, 3 rouges. */
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const { default: mod } = await import('../services/kdmc-router/worker.js');
const PCM = btoa(String.fromCharCode(...new Uint8Array(4096).fill(5)));
let calls = [];
globalThis.fetch = async (input, init) => { const u = typeof input === 'string' ? input : input.url; calls.push(u);
  if (u.startsWith('https://texttospeech.googleapis.com/')) return new Response('{"error":{"message":"API disabled"}}', { status: 403 });
  if (u.startsWith('https://generativelanguage.googleapis.com/') && /tts/.test(u)) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: PCM } }] } }] }), { status: 200 });
  if (u.startsWith('https://api.openai.com/')) return new Response('{"error":"down"}', { status: 500 });
  return new Response('?', { status: 599 }); };
const cache = new Map();
globalThis.caches = { default: { match: async (r) => { const v = cache.get(r.url); return v ? new Response(v) : undefined; }, put: async (r, res) => { cache.set(r.url, await res.arrayBuffer()); } } };
const frais = (extra) => { const m = new Map(); return Object.assign({ GEMINI_API_KEY: 'gk', ACCOUNTS: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async () => {} } }, extra || {}); };
const req = (qs) => new Request('https://lingua.kd-mc.com/__lingua/tts?' + qs, { headers: { Referer: 'https://lingua.kd-mc.com/', 'CF-Connecting-IP': '203.0.113.' + Math.floor(Math.random() * 200) } });
const payant = () => calls.some((u) => u.startsWith('https://api.openai.com/') || u.startsWith('https://api.replicate.com/'));
const T = (s) => encodeURIComponent(s);

calls = []; let r = await mod.fetch(req('v=nova&l=it-IT&t=' + T('Buongiorno, come stai oggi?')), frais());
ok(r.headers.get('x-voix') === 'gemini-gratuite' && !payant(), '1. italien, Google refuse, pas d\'OpenAI → voix Gemini (pas le téléphone)', r.headers.get('x-voix') + ' ' + (r.headers.get('content-type') || ''));

calls = []; r = await mod.fetch(req('v=nova&gratuit=1&l=de-DE&t=' + T('Guten Morgen, wie geht es dir?')), frais());
ok(r.headers.get('x-voix') === 'gemini-gratuite' && !payant(), '2. Bee (gratuit=1), allemand → Gemini');

calls = []; r = await mod.fetch(req('v=nova&l=pt-BR&t=' + T('Bom dia, tudo bem?')), frais({ OPEN_AI_API_KEY: 'sk' }));
ok(r.headers.get('x-voix') === 'gemini-gratuite', '3. OpenAI en panne (500) → Gemini, jamais de silence', r.headers.get('x-voix'));

const e4 = frais(); calls = []; await mod.fetch(req('v=echo&l=ru-RU&t=' + T('Привет, как дела?')), e4);
calls = []; r = await mod.fetch(req('v=echo&l=ru-RU&t=' + T('Привет, как дела?')), e4);
ok(r.status === 200 && !calls.some((u) => u.includes('generativelanguage')) , '4. 2e lecture : cache du bord, Gemini pas rappelé', calls.join(' '));

const AUDIO = new Uint8Array(2048).fill(9);
calls = []; r = await mod.fetch(req('v=nova&l=fr-FR&t=' + T('Bonjour tout le monde')), frais({ AI: { run: async () => AUDIO.buffer } }));
ok(r.headers.get('x-voix') === 'gratuite' && !calls.some((u) => u.includes('generativelanguage') && /tts/.test(u)) && !payant(), '5. français : MeloTTS d\'abord, Gemini jamais appelé');

calls = []; r = await mod.fetch(req('v=nova&l=ja-JP&t=' + T('こんにちは')), frais({ GEMINI_API_KEY: undefined }));
const j = await r.clone().json().catch(() => null);
ok(r.status === 200 && j && j.ok === false, '6. pas de clé Gemini : réponse propre ok:false → l\'app prend la voix du téléphone', JSON.stringify(j));
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
