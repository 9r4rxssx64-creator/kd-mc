/* Garde — coach Lingua : QWEN (Workers AI, 0 clé) répond en premier, les gratuits à clé en
   secours, cause exacte quand tout tombe (Kevin 2026-09-05 « pareil dans mes autres projets »).
   node services/kdmc-router/lingua-ia.test.mjs — hors ligne, fetch simulé. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './worker.js';

/* Le « Referer » simule un vrai navigateur : depuis le 22.09 les portes qui
   peuvent coûter de l'argent (voix, appel en direct, coach) n'acceptent que les
   demandes venant d'une page du domaine — un script sans provenance est refusé,
   pour que personne ne puisse dépenser le compte de Kevin. */
const post = (body, env) => mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Referer: 'https://lingua.kd-mc.com/' },
  body: JSON.stringify(body),
}), env);
const body = { langName: 'anglais', level: 'Débutant', levelIndex: 1, messages: [{ role: 'user', text: 'Hello, how are you?' }] };
const fakeAI = (dead) => ({ calls: [], run(model) { this.calls.push(model); if (dead) throw new Error('capacity'); return { response: '<think>…</think>Great! And you?' }; } });

test('coach : Qwen répond (0 clé, 0 réseau), nommé, sans <think>', async () => {
  const AI = fakeAI(false);
  const orig = globalThis.fetch; globalThis.fetch = async () => { throw new Error('réseau interdit'); };
  try {
    const r = await post(body, { ACCOUNTS: {}, AI, GROQ_API_KEY: 'g' });
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.by, 'qwen');
    assert.equal(j.model, '@cf/qwen/qwen3.8-27b');
    assert.equal(j.reply, 'Great! And you?');
  } finally { globalThis.fetch = orig; }
});

test('coach : Qwen mort → un gratuit à clé prend le relais ; rien → ai_absent + causes (fail-open)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => (/groq/.test(String(u))
    ? new Response(JSON.stringify({ choices: [{ message: { content: 'Groq here' } }] }), { status: 200 })
    : new Response('{}', { status: 500 }));
  try {
    const r = await post(body, { ACCOUNTS: {}, AI: fakeAI(true), GROQ_API_KEY: 'g' });
    const j = await r.json();
    assert.equal(j.ok, true); assert.equal(j.by, 'groq');
    const r2 = await post(body, { ACCOUNTS: {}, AI: fakeAI(true) });
    const j2 = await r2.json();
    assert.equal(r2.status, 200, 'fail-open : jamais une erreur HTTP côté app');
    assert.equal(j2.ok, false); assert.equal(j2.reason, 'ai_absent');
    assert.equal(j2.tried[0].provider, 'qwen');
  } finally { globalThis.fetch = orig; }
});
