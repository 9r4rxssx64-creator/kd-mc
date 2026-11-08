/* GARDE — voix « douce » des histoires de l'arbre (Kevin 8.11 : « les voix sont trop robotiques, toutes »).
   1. gratuit=1 + i=douce : la voix Gemini (palier gratuit) est servie EN PREMIER (x-voix gemini-gratuite), MeloTTS n'est pas appelé ;
   2. Gemini refuse 3 fois → `douce_occupee`, MeloTTS JAMAIS appelé (Kevin : « garde la belle voix toujours ») ; 6. refus passager puis succès → belle voix servie ;
   3. sans i=douce (Bee, Lingua…) : MeloTTS reste en premier, Gemini n'est pas appelé ;
   4. la consigne envoyée à Gemini dit « douce » ; 5. 2ᵉ lecture identique : servie du cache, 0 appel Gemini.
   SABOTAGE prouvé à la main : retirer le bloc `style === 'douce'` → (1) rougit.
   node services/kdmc-router/voix-douce.test.mjs */
import mod from './worker.js';
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' → ' + d : '')); } };
const kv = () => { const m = new Map(); return { m,
  async get(k) { const v = m.get(k); return v === undefined ? null : v; },
  async put(k, v) { m.set(k, v); } }; };
let geminiAppels = [], geminiStatut = 200, melo = 0;
const PCM = btoa(String.fromCharCode(...new Uint8Array(4096).fill(3)));
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input.url;
  if (u.startsWith('https://generativelanguage.googleapis.com/')) {
    geminiAppels.push(init && init.body ? JSON.parse(init.body) : {});
    return geminiStatut === 200
      ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: PCM } }] } }] }), { status: 200 })
      : new Response('{"error":{"code":429}}', { status: 429 });
  }
  if (u.startsWith('https://texttospeech.googleapis.com/')) return new Response('{"error":{}}', { status: 401 });
  return new Response('inattendu', { status: 599 });
};
const req = (qs) => new Request('https://lingua.kd-mc.com/__lingua/tts?' + qs, { headers: { Referer: 'https://arbre.kd-mc.com/' } });
const ENV = () => ({ ACCOUNTS: kv(), GEMINI_API_KEY: 'k', AI: { run: async () => { melo++; return new Uint8Array(2048).fill(9).buffer; } } });

let env = ENV(); geminiAppels = []; melo = 0; geminiStatut = 200;
let r = await mod.fetch(req('gratuit=1&l=fr&v=nova&i=douce&t=Il%20etait%20une%20fois'), env);
ok(r.status === 200 && r.headers.get('x-voix') === 'gemini-gratuite' && geminiAppels.length === 1 && melo === 0, '1. i=douce → Gemini en premier, MeloTTS pas appelé', JSON.stringify({ x: r.headers.get('x-voix'), g: geminiAppels.length, melo }));
ok(/douce/i.test(JSON.stringify(geminiAppels[0] || {})), '4. la consigne envoyée à Gemini dit « douce »');
r = await mod.fetch(req('gratuit=1&l=fr&v=nova&i=douce&t=Il%20etait%20une%20fois'), env);
ok(r.status === 200 && geminiAppels.length === 1, '5. même lecture : servie du cache, aucun appel de plus', String(geminiAppels.length));

/* 2 : Gemini refuse 3 fois → JAMAIS MeloTTS pour une histoire : `douce_occupee` (l'arbre réessaie lui-même) */
env = ENV(); geminiAppels = []; melo = 0; geminiStatut = 429;
r = await mod.fetch(req('gratuit=1&l=fr&v=nova&i=douce&t=Autre%20phrase'), env);
let j = await r.json().catch(() => ({}));
ok(r.status === 200 && j.reason === 'douce_occupee' && melo === 0 && geminiAppels.length === 3, '2. Gemini refuse → 3 essais puis « douce_occupee », MeloTTS jamais appelé', JSON.stringify({ j, melo, g: geminiAppels.length }));

/* 6 : un refus passager puis un succès → la belle voix est servie quand même (réessai côté serveur) */
env = ENV(); geminiAppels = []; melo = 0; geminiStatut = 429;
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { const u = typeof input === 'string' ? input : input.url; if (u.startsWith('https://generativelanguage.googleapis.com/') && geminiAppels.length === 1) { geminiStatut = 200; } return vraiFetch(input, init); };
r = await mod.fetch(req('gratuit=1&l=fr&v=nova&i=douce&t=Phrase%20avec%20un%20refus%20passager'), env);
globalThis.fetch = vraiFetch;
ok(r.status === 200 && r.headers.get('x-voix') === 'gemini-gratuite' && geminiAppels.length === 2 && melo === 0, '6. un refus passager puis succès → belle voix servie (2 essais)', JSON.stringify({ x: r.headers.get('x-voix'), g: geminiAppels.length }));

env = ENV(); geminiAppels = []; melo = 0; geminiStatut = 200;
r = await mod.fetch(req('gratuit=1&l=fr&v=nova&t=Bonjour'), env);
ok(r.status === 200 && r.headers.get('x-voix') === 'gratuite' && geminiAppels.length === 0 && melo === 1, '3. sans i=douce : MeloTTS d’abord, Gemini pas appelé', JSON.stringify({ x: r.headers.get('x-voix'), g: geminiAppels.length, melo }));

console.log(`Voix douce test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
