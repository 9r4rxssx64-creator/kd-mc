// Garde de /delegue/vision (node --test, base SQLite en mémoire, Gemini simulé : aucun réseau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { empreinte, VISION_MAX_B64 } from './delegue.js';

function d1() {
  const s = new DatabaseSync(':memory:');
  s.exec(`CREATE TABLE jetons (hash TEXT PRIMARY KEY, nom TEXT NOT NULL, cree INTEGER NOT NULL, expire INTEGER NOT NULL, plafond_jour INTEGER NOT NULL DEFAULT 300, revoque INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE usage (jour TEXT NOT NULL, hash TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, car INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (jour, hash));`);
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }), run: async () => { s.prepare(sql).run(...p); return {}; } });
  return { prepare: (sql) => stmt(sql), _s: s };
}
const T = 'v'.repeat(40);
async function env(plafond = 300, cle = 'cle-test') {
  const db = d1(); const e = { DELEGUE: db, GEMINI_API_KEY: cle, KDMC_SSO_SECRET: 's' };
  db._s.prepare('INSERT INTO jetons VALUES (?, ?, ?, ?, ?, 0)').run(await empreinte(T), 'arbre-cloud', Date.now(), Date.now() + 1e9, plafond);
  return e;
}
const IMG = Buffer.from('fake-jpeg-bytes').toString('base64');
const appel = (e, corps, jeton = T) => worker.fetch(new Request('https://apis.kd-mc.com/delegue/vision', { method: 'POST', headers: { authorization: 'Bearer ' + jeton, 'content-type': 'application/json' }, body: JSON.stringify(corps) }), e);

function gemini(texte, statut = 200) {
  const vrai = globalThis.fetch; const vus = [];
  globalThis.fetch = async (url, init) => { vus.push({ url: String(url), init }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }] }), { status: statut }); };
  return { vus, rendre: () => { globalThis.fetch = vrai; } };
}

test('sans jeton : 401 ; GET : 405', async () => {
  const e = await env();
  assert.equal((await appel(e, { image_base64: IMG, mime: 'image/jpeg' }, 'z'.repeat(40))).status, 401);
  assert.equal((await worker.fetch(new Request('https://apis.kd-mc.com/delegue/vision'), e)).status, 405);
});
test('image lue : le texte revient, la clé part en en-tête (jamais dans l\'URL)', async () => {
  const e = await env(); const g = gemini('Acte n°15 — Houles Clément');
  try {
    const r = await appel(e, { image_base64: IMG, mime: 'image/jpeg' });
    const j = await r.json();
    assert.equal(r.status, 200); assert.equal(j.text, 'Acte n°15 — Houles Clément'); assert.equal(j.appels_aujourdhui, 1);
    assert.ok(!g.vus[0].url.includes('cle-test')); assert.equal(g.vus[0].init.headers['x-goog-api-key'], 'cle-test');
  } finally { g.rendre(); }
});
test('refus : mime hors liste, base64 invalide, trop gros, consigne secrète ou trop courte', async () => {
  const e = await env(); const g = gemini('x');
  try {
    assert.equal((await appel(e, { image_base64: IMG, mime: 'application/pdf' })).status, 400);
    assert.equal((await appel(e, { image_base64: '%%%', mime: 'image/png' })).status, 400);
    assert.equal((await appel(e, { image_base64: 'A'.repeat(VISION_MAX_B64 + 1), mime: 'image/png' })).status, 413);
    assert.equal((await appel(e, { image_base64: IMG, mime: 'image/png', consigne: 'clé sk-' + 'a1'.repeat(20) + ' lis' })).status, 422);
    assert.equal((await appel(e, { image_base64: IMG, mime: 'image/png', consigne: 'a' })).status, 400);
    assert.equal(g.vus.length, 0, 'aucun appel Gemini pour une demande refusée');
  } finally { g.rendre(); }
});
test('plafond par jour : le (plafond+1)e appel est refusé avant Gemini', async () => {
  const e = await env(2); const g = gemini('ok');
  try {
    assert.equal((await appel(e, { image_base64: IMG, mime: 'image/png' })).status, 200);
    assert.equal((await appel(e, { image_base64: IMG, mime: 'image/png' })).status, 200);
    assert.equal((await appel(e, { image_base64: IMG, mime: 'image/png' })).status, 429);
    assert.equal(g.vus.length, 2);
  } finally { g.rendre(); }
});
test('pas de clé Gemini : 503 sans compter ; Gemini en erreur : 503', async () => {
  const e0 = await env(300, ''); assert.equal((await appel(e0, { image_base64: IMG, mime: 'image/png' })).status, 503);
  const e = await env(); const g = gemini('', 500);
  try { assert.equal((await appel(e, { image_base64: IMG, mime: 'image/png' })).status, 503); } finally { g.rendre(); }
});
