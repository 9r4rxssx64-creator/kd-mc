/* GARDE — la voix gratuite de secours (MeloTTS, Workers AI) dit la VRAIE langue de la phrase (audit voix 2.10 :
   elle était figée sur « fr » → l'anglais et le chinois sortaient avec l'accent français).
   1. l=en / es / zh → MeloTTS reçoit lang = en / es / zh ;
   2. sans l= (Bee, javis, l'arbre) → « fr », comme avant ;
   3. langue que MeloTTS ne sait pas dire (it, ru, ja) → MeloTTS jamais appelé, réponse ok:false
      → la voix du téléphone (bonne langue) prend le relais, jamais un accent faux ;
   4. la même phrase en deux langues → deux sons distincts (le cache ne mélange pas les langues).
   SABOTAGE prouvé à la main : remettre lang: 'fr' → (1) rougit.
   node services/kdmc-router/voix-melo-langue.test.mjs */
import mod from './worker.js';
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' → ' + d : '')); } };
const kv = () => { const m = new Map(); return { m,
  async get(k) { const v = m.get(k); return v === undefined ? null : v; },
  async put(k, v) { m.set(k, v); } }; };
globalThis.fetch = async () => new Response('inattendu', { status: 599 });
const req = (qs) => new Request('https://lingua.kd-mc.com/__lingua/tts?' + qs, { headers: { Referer: 'https://lingua.kd-mc.com/' } });
let appels = [];
const ai = { run: async (modele, entree) => { appels.push(entree.lang); return new Uint8Array(2048).fill(entree.lang.charCodeAt(1)).buffer; } };
const ENV = () => ({ ACCOUNTS: kv(), AI: ai });

for (const l of ['en', 'es', 'zh']) {
  appels = [];
  const r = await mod.fetch(req('v=nova&m=gratuite&l=' + l + '&t=hello'), ENV());
  ok(r.status === 200 && r.headers.get('x-voix') === 'gratuite' && appels[0] === l, '1. l=' + l + ' → MeloTTS lang=' + l, JSON.stringify(appels));
}
appels = [];
let r = await mod.fetch(req('v=nova&m=gratuite&t=bonjour'), ENV());
ok(r.status === 200 && appels[0] === 'fr', '2. sans l= → fr, comme avant', JSON.stringify(appels));

for (const l of ['it', 'ru', 'ja']) {
  appels = [];
  r = await mod.fetch(req('v=nova&m=gratuite&l=' + l + '&t=ciao'), ENV());
  const j = await r.json().catch(() => ({}));
  ok(appels.length === 0 && j.ok === false, '3. l=' + l + ' → MeloTTS pas appelé, relais du téléphone', JSON.stringify({ appels, j }));
}

/* 4 : chemin « plafond payant atteint » (pas de clé OpenAI) → voixGratuite avec cache ; deux langues, deux sons */
const env = ENV();
appels = [];
const a = await (await mod.fetch(req('v=nova&l=en&t=taxi'), env)).arrayBuffer();
const b = await (await mod.fetch(req('v=nova&l=es&t=taxi'), env)).arrayBuffer();
ok(appels.join() === 'en,es' && new Uint8Array(a)[0] !== new Uint8Array(b)[0], '4. même phrase en/es → deux sons distincts, pas de mélange par le cache', JSON.stringify(appels));

console.log(`Voix MeloTTS langue test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
