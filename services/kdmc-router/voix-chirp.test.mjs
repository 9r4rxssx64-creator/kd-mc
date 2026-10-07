/* GARDE — voix Google Chirp 3 HD en tête, gratuite GARANTIE (Kevin 1.10.2026 : « améliore toutes les voix en
   permanence en gratuit, niveau commercial professionnel »). Sans réseau (fetch simulé) :
   1. `l=fr` + vitesse normale → Google Chirp 3 HD, voix « fr-FR-Chirp3-HD-<nom> », OpenAI jamais appelé ;
   2. voix différentes : nova, echo, onyx → trois noms Google différents ;
   3. sans `l=` → le chemin d'avant (OpenAI), Google jamais appelé (accent faux évité) ;
   4. Google refuse (403, API pas activée) → repli OpenAI, ET pause d'une heure : le 2e appel ne retente pas Google ;
   5. plafond du jour atteint → Google pas appelé (gratuit garanti), repli ;
   6. le compteur est écrit AVANT l'appel ; compteur KV en panne → Google pas appelé ;
   7. 2e appel identique → servi du cache Chirp, 0 requête ;
   8. `m=chirp` sans `l` → fr-FR ; `m=gratuite` → MeloTTS (liaison AI), jamais OpenAI ni Google ;
   9. SABOTAGE prouvé à la main : retirer le test du plafond → (5) rougit.
   node services/kdmc-router/voix-chirp.test.mjs */
import mod from './worker.js';
import { DatabaseSync } from 'node:sqlite';
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' → ' + d : '')); } };
const kv = (panne) => { const m = new Map(); return { m,
  async get(k) { const v = m.get(k); return v === undefined ? null : v; },
  async put(k, v) { if (panne) throw new Error('KV plafonné'); m.set(k, v); } }; };
const req = (qs) => new Request('https://lingua.kd-mc.com/__lingua/tts?' + qs, { headers: { Referer: 'https://lingua.kd-mc.com/' } });
const AUDIO = new Uint8Array(2048).fill(7);
const B64 = btoa(String.fromCharCode(...AUDIO));
let calls = [], gStatut = 200;
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input.url;
  const b = init && init.body ? JSON.parse(init.body) : {};
  calls.push({ u, b });
  if (u.startsWith('https://texttospeech.googleapis.com/')) return gStatut === 200 ? new Response(JSON.stringify({ audioContent: B64 }), { status: 200 }) : new Response('{"error":{}}', { status: gStatut });
  if (u.startsWith('https://api.openai.com/')) return new Response(new Uint8Array([73, 68, 51]).buffer, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  return new Response('inattendu', { status: 599 });
};
const g = () => calls.filter((c) => c.u.startsWith('https://texttospeech'));
const o = () => calls.filter((c) => c.u.startsWith('https://api.openai.com'));
const ENV = (extra) => Object.assign({ ACCOUNTS: kv(), OPEN_AI_API_KEY: 'sk', GEMINI_API_KEY: 'gk' }, extra || {});

let env = ENV(); calls = [];
let r = await mod.fetch(req('v=nova&l=fr&t=Bonjour%20Kevin'), env);
ok(r.status === 200 && r.headers.get('x-voix') === 'google-chirp3hd' && g().length === 1 && o().length === 0, '1a. l=fr → Chirp 3 HD, OpenAI jamais appelé', JSON.stringify(calls.map((c) => c.u.slice(0, 40))));
ok(g()[0] && g()[0].b.voice.name === 'fr-FR-Chirp3-HD-Aoede' && g()[0].b.voice.languageCode === 'fr-FR', '1b. voix fr-FR-Chirp3-HD-Aoede pour nova', g()[0] && JSON.stringify(g()[0].b.voice));

const noms = [];
for (const v of ['nova', 'echo', 'onyx']) { env = ENV(); calls = []; await mod.fetch(req('v=' + v + '&l=fr&t=Salut'), env); noms.push(g()[0] && g()[0].b.voice.name); }
ok(new Set(noms).size === 3, '2. nova / echo / onyx → trois voix Google différentes', noms.join());

env = ENV(); calls = [];
await mod.fetch(req('v=nova&t=hello'), env);
ok(g().length === 0 && o().length === 1, '3. sans l= → chemin d\'avant (OpenAI), Google jamais appelé');

env = ENV(); calls = []; gStatut = 403;
r = await mod.fetch(req('v=nova&l=fr&t=un'), env);
ok(r.status === 200 && g().length === 1 && o().length === 1, '4a. Google 403 → repli OpenAI, jamais de silence');
calls = [];
await mod.fetch(req('v=nova&l=fr&t=deux'), env);
ok(g().length === 0 && o().length === 1 && env.ACCOUNTS.m.get('gtts:pause') === '403', '4b. pause d\'une heure : le 2e appel ne retente pas Google');
gStatut = 200;

env = ENV({ GTTS_PLAFOND_JOUR: '10' }); calls = [];
await mod.fetch(req('v=nova&l=fr&t=' + encodeURIComponent('une phrase plus longue que dix')), env);
ok(g().length === 0 && o().length === 1, '5. plafond du jour atteint → Google pas appelé (gratuit garanti)');

env = ENV(); calls = [];
await mod.fetch(req('v=nova&l=fr&t=compte'), env);
const kj = 'gtts:' + new Date().toISOString().slice(0, 10);
ok(env.ACCOUNTS.m.get(kj) === '6', '6a. compteur du jour = caractères envoyés (6)', env.ACCOUNTS.m.get(kj));
env = ENV({ ACCOUNTS: kv(true) }); calls = [];
await mod.fetch(req('v=nova&l=fr&t=panne'), env);
ok(g().length === 0, '6b. compteur KV en panne ET pas de D1 → Google pas appelé (on ne dépense jamais sans compter)');
/* 6c-6e (3.10, Kevin « il n'y a pas de sons ») : le plafond d'écritures KV (atteint les 1er et 2.10) coupait la belle
   voix pour TOUTE la journée, et `m=chirp` ne disait pas pourquoi. Le compteur passe alors dans D1, et la cause
   exacte est rendue. */
const d1 = () => { const t = new Map(); return { t, prepare(sql) { const st = { sql, args: [], bind(...a) { st.args = a; return st; },
  async run() { return {}; },
  async first() { if (/INSERT INTO compteurs/.test(sql)) { const [k, n] = st.args; t.set(k, (t.get(k) || 0) + n); return { n: t.get(k) }; } return null; } }; return st; } }; };
env = ENV({ ACCOUNTS: kv(true), BOT_DB: d1() }); calls = [];
r = await mod.fetch(req('v=onyx&l=fr&t=sans%20kv'), env);
ok(r.headers.get('x-voix') === 'google-chirp3hd' && g().length === 1 && env.BOT_DB.t.get(kj) === 7, '6c. KV plafonné → le compteur passe dans D1 et la belle voix reste là', r.headers.get('x-voix') + ' ' + env.BOT_DB.t.get(kj));
env = ENV({ ACCOUNTS: kv(true), BOT_DB: d1(), GTTS_PLAFOND_JOUR: '5' }); calls = [];
await mod.fetch(req('v=onyx&l=fr&t=trop%20long'), env);
ok(g().length === 0, '6d. le plafond du jour vaut aussi dans D1 (gratuit garanti)');
env = ENV({ ACCOUNTS: kv(true) }); calls = [];
r = await mod.fetch(req('v=onyx&m=chirp&t=cause'), env);
const jc = await r.json().catch(() => ({}));
ok(jc.reason === 'chirp_indisponible' && jc.cause === 'compteur_kv_refuse', '6e. m=chirp dit la CAUSE exacte (ici : compteur KV refusé)', JSON.stringify(jc));

env = ENV(); calls = [];
await mod.fetch(req('v=echo&l=fr&t=cache'), env); calls = [];
r = await mod.fetch(req('v=echo&l=fr&t=cache'), env);
ok(r.status === 200 && calls.length === 0 && r.headers.get('x-voix') === 'google-chirp3hd', '7. 2e appel identique → cache Chirp, 0 requête');

env = ENV(); calls = [];
await mod.fetch(req('v=onyx&m=chirp&t=force'), env);
ok(g()[0] && g()[0].b.voice.languageCode === 'fr-FR' && o().length === 0, '8a. m=chirp sans l → fr-FR, pas d\'OpenAI');
const ai = { run: async () => AUDIO.buffer };
env = ENV({ AI: ai }); calls = [];
r = await mod.fetch(req('v=nova&m=gratuite&t=melo'), env);
ok(r.status === 200 && r.headers.get('x-voix') === 'gratuite' && calls.length === 0, '8b. m=gratuite → MeloTTS par la liaison AI, ni OpenAI ni Google', r.headers.get('x-voix'));
ok(r.headers.get('content-type') === 'audio/wav', '8c. la voix gratuite est annoncée audio/wav (c\'est du WAV, mesuré)', r.headers.get('content-type'));


/* 10. LE VRAI SCÉNARIO (mesuré le 3.10 sur le domaine : 12 voix sur 12 en voix de repli) — le plafond d'écritures KV est crevé,
   Chirp doit PARLER quand même : le compteur et la pause vivent en D1. */
const d1 = () => { const db = new DatabaseSync(':memory:'); const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => db.prepare(sql).get(...p) ?? null, run: async () => { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, all: async () => ({ results: db.prepare(sql).all(...p) }) }); return { prepare: (q) => st(q), _db: db }; };
const kvPlein = () => { const e = { puts: 0, cles: [], async get() { return null; }, async put(k) { e.puts++; e.cles.push(String(k)); throw new Error('KV put() limit exceeded for the day'); } }; return e; };
const ecritGtts = (e) => e.cles.filter((k) => k.startsWith('gtts:'));   // le cache audio « ltts: » tente le KV hors Cloudflare (pas de Cache API en test) : seul le COMPTEUR et la PAUSE comptent ici
env = ENV({ ACCOUNTS: kvPlein(), CERCLE_DB: d1() }); calls = [];
r = await mod.fetch(req('v=nova&l=fr&t=compte'), env);
ok(r.status === 200 && r.headers.get('x-voix') === 'google-chirp3hd' && g().length === 1 && o().length === 0, '10a. plafond KV crevé + D1 : Chirp 3 HD PARLE quand même (avant : la voix de repli, la même pour toutes)', r.headers.get('x-voix'));
const kjj = 'gtts:' + new Date().toISOString().slice(0, 10);
ok(env.CERCLE_DB._db.prepare('SELECT n FROM compteurs WHERE cle = ?').get(kjj).n === 6 && ecritGtts(env.ACCOUNTS).length === 0, '10b. le compteur de caractères est exact en D1 (6) et ne tente AUCUNE écriture KV', env.ACCOUNTS.cles);
const nomsD = [];
for (const v of ['nova', 'echo', 'onyx']) { env = ENV({ ACCOUNTS: kvPlein(), CERCLE_DB: d1() }); calls = []; await mod.fetch(req('v=' + v + '&l=fr&t=Salut'), env); nomsD.push(g()[0] && g()[0].b.voice.name); }
ok(new Set(nomsD).size === 3, '10c. au plafond KV, les voix restent DIFFÉRENTES entre elles (nova / echo / onyx)', nomsD.join());
env = ENV({ ACCOUNTS: kvPlein(), CERCLE_DB: d1(), GTTS_PLAFOND_JOUR: '10' }); calls = [];
await mod.fetch(req('v=nova&l=fr&t=' + encodeURIComponent('une phrase plus longue que dix')), env);
ok(g().length === 0, '10d. plafond Google du jour (compté en D1) atteint → Google pas appelé (gratuit garanti)');
env = ENV({ ACCOUNTS: kvPlein(), CERCLE_DB: d1(), GTTS_PLAFOND_JOUR: '20' }); calls = [];
for (const t of ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc']) await mod.fetch(req('v=nova&l=fr&t=' + t), env);
ok(g().length === 2, '10e. le plafond est global et exact : 20 caractères autorisés = 2 phrases de 10, la 3e refusée', g().length);
gStatut = 403; env = ENV({ ACCOUNTS: kvPlein(), CERCLE_DB: d1() }); calls = [];
await mod.fetch(req('v=nova&l=fr&t=un'), env); calls = [];
await mod.fetch(req('v=nova&l=fr&t=deux'), env);
ok(g().length === 0 && env.CERCLE_DB._db.prepare("SELECT texte FROM compteurs WHERE cle = 'gtts:pause'").get().texte === '403' && ecritGtts(env.ACCOUNTS).length === 0, '10f. Google refuse (403) : la pause d\'une heure est posée en D1, le 2e appel ne retente pas, 0 écriture KV');
gStatut = 200;
env = ENV({ ACCOUNTS: kvPlein() }); calls = [];
await mod.fetch(req('v=nova&l=fr&t=sans-d1'), env);
ok(g().length === 0, '10g. sans D1 ET KV plafonné : Google n\'est pas appelé (on ne dépense jamais sans compter)');
console.log(`Voix Chirp test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
