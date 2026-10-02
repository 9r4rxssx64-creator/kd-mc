/* GARDE — Lingua parle avec la voix GRATUITE (audit 2.10 : Lingua n'envoyait jamais la langue au
 * domaine, donc chaque phrase neuve partait chez OpenAI, payant).
 *   1. chaque appel de voix de lingua/app.js porte la langue (`_lq(...)`) ;
 *   2. le préchargement vise la MÊME adresse que la lecture (voix réelle + langue) ;
 *   3. le domaine prend Google pour TOUTES les langues de Lingua (14 + pt-PT → pt-BR, ar → ar-XA, zh → cmn-CN) ;
 *   4. une phrase neuve ne coûte qu'UNE écriture KV (le compteur) quand le cache Cloudflare existe,
 *      et la 2e lecture vient du cache sans rappeler Google ;
 *   5. monégasque et LSF n'envoient pas de langue (pas de voix Google adaptée).
 * node tests/verify-lingua-voix-gratuite.mjs */
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const app = readFileSync(new URL('../lingua/app.js', import.meta.url), 'utf8');
const appels = app.split('\n').filter((l) => l.includes('"/tts?v="'));
ok(appels.length >= 6 && appels.every((l) => l.includes('_lq(')), `1. les ${appels.length} appels de voix envoient la langue`, appels.filter((l) => !l.includes('_lq(')).map((l) => l.trim().slice(0, 80)).join(' | '));
const pre = app.slice(app.indexOf('function ttsPrefetch('), app.indexOf('function ttsPrefetchMany('));
ok(/vrp\.tts\|\|vid/.test(pre) && /_lq\(langueCours\(\)\)/.test(pre), '2. le préchargement vise la même adresse que la lecture');
ok(/S\.course==="mc"\|\|S\.course==="lsf"\) return ""/.test(app), '5. monégasque et LSF : pas de langue envoyée');
const data = readFileSync(new URL('../lingua/data.js', import.meta.url), 'utf8');
const codes = [...data.matchAll(/tts:"([a-z]{2})-[A-Z]{2}"/g)].map((m) => m[1]);

const { default: mod } = await import('../services/kdmc-router/worker.js');
const AUDIO = new Uint8Array(2048).fill(7); const B64 = btoa(String.fromCharCode(...AUDIO));
let calls = [];
globalThis.fetch = async (input, init) => { const u = typeof input === 'string' ? input : input.url; calls.push({ u, b: init && init.body ? JSON.parse(init.body) : {} });
  if (u.startsWith('https://texttospeech.googleapis.com/')) return new Response(JSON.stringify({ audioContent: B64 }), { status: 200 });
  if (u.startsWith('https://api.openai.com/')) return new Response(new Uint8Array([73, 68, 51]).buffer, { status: 200 });
  return new Response('?', { status: 599 }); };
const cache = new Map();
globalThis.caches = { default: { match: async (r) => { const v = cache.get(r.url); return v ? new Response(v) : undefined; }, put: async (r, res) => { cache.set(r.url, await res.arrayBuffer()); } } };
const ecrits = []; const m = new Map();
const env = { OPEN_AI_API_KEY: 'sk', GEMINI_API_KEY: 'gk', ACCOUNTS: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { ecrits.push(k); m.set(k, v); }, delete: async () => {} } };
const req = (qs) => new Request('https://lingua.kd-mc.com/__lingua/tts?' + qs, { headers: { Referer: 'https://lingua.kd-mc.com/' } });
const sansGoogle = [];
for (const c of [...new Set(codes)]) {
  calls = []; const r = await mod.fetch(req(`v=nova&l=${c}-XX&t=` + encodeURIComponent('mot ' + c)), env);
  const g = calls.find((x) => x.u.startsWith('https://texttospeech'));
  if (!(r.headers.get('x-voix') === 'google-chirp3hd' && g && !calls.some((x) => x.u.startsWith('https://api.openai')))) sansGoogle.push(c);
}
ok(codes.length >= 14 && sansGoogle.length === 0, `3. les ${new Set(codes).size} langues de Lingua passent par la voix gratuite`, 'sans Google : ' + sansGoogle.join(','));
ecrits.length = 0; calls = [];
await mod.fetch(req('v=echo&l=ru-RU&t=' + encodeURIComponent('привет')), env);
ok(ecrits.length === 1 && /^gtts:/.test(ecrits[0]), `4a. une phrase neuve = UNE écriture KV, le compteur (${ecrits.join(', ')})`);
ecrits.length = 0; calls = [];
const r2 = await mod.fetch(req('v=echo&l=ru-RU&t=' + encodeURIComponent('привет')), env);
ok(r2.status === 200 && calls.length === 0 && ecrits.length === 0, '4b. la 2e lecture vient du cache Cloudflare : 0 appel, 0 écriture');
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
