// Garde de la file de travaux /delegue/jobs (node --test, vraie base SQLite en mémoire, sans réseau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { empreinte, urlSure, JOBS_MAX_ATTENTE } from './delegue.js';

function d1() {
  const s = new DatabaseSync(':memory:');
  s.exec(`CREATE TABLE jetons (hash TEXT PRIMARY KEY, nom TEXT NOT NULL, cree INTEGER NOT NULL, expire INTEGER NOT NULL, plafond_jour INTEGER NOT NULL DEFAULT 300, revoque INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, cree INTEGER NOT NULL, de TEXT NOT NULL, pour TEXT NOT NULL, domaine TEXT NOT NULL DEFAULT 'resume', consigne TEXT NOT NULL, urls TEXT NOT NULL DEFAULT '[]', max_pages INTEGER NOT NULL DEFAULT 6, statut TEXT NOT NULL DEFAULT 'attente', prise_par TEXT, prise_le INTEGER, fini_le INTEGER, resultat TEXT);
    CREATE INDEX ix_jobs_attente ON jobs(statut, pour, id);`);
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }), run: async () => { s.prepare(sql).run(...p); return {}; } });
  return { prepare: (sql) => stmt(sql), _s: s };
}
const T1 = 'a'.repeat(40), T2 = 'b'.repeat(40);
async function env() {
  const db = d1(); const e = { DELEGUE: db, KDMC_SSO_SECRET: 's' };
  for (const [t, nom] of [[T1, 'arbre-cloud'], [T2, 'lenovo-agent']]) db._s.prepare('INSERT INTO jetons VALUES (?, ?, ?, ?, 300, 0)').run(await empreinte(t), nom, Date.now(), Date.now() + 1e9);
  return e;
}
const appel = (e, chemin, jeton, corps, methode) => worker.fetch(new Request('https://apis.kd-mc.com/delegue/jobs' + chemin, { method: methode || (corps ? 'POST' : 'GET'), headers: { authorization: 'Bearer ' + jeton, 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }), e);
const OK = { pour: 'lenovo', consigne: 'Lis ces pages et dis ce qu\'on y trouve sur la famille', urls: ['https://example.org/a'] };

test('sans jeton ou avec un faux : 401, jamais de travail', async () => {
  const e = await env();
  assert.equal((await worker.fetch(new Request('https://apis.kd-mc.com/delegue/jobs', { method: 'POST', body: '{}' }), e)).status, 401);
  assert.equal((await appel(e, '', 'z'.repeat(40), OK)).status, 401);
});
test('déposer, prendre (une seule fois), rendre, relire', async () => {
  const e = await env();
  const id = (await (await appel(e, '', T1, OK)).json()).id; assert.ok(id > 0);
  const p1 = await (await appel(e, '/next?pour=lenovo', T2)).json();
  assert.equal(p1.job.id, id); assert.equal(p1.job.statut, 'en_cours'); assert.equal(p1.job.prise_par, 'lenovo-agent'); assert.deepEqual(p1.job.urls, ['https://example.org/a']);
  assert.equal((await (await appel(e, '/next?pour=lenovo', T1)).json()).job, null, 'un travail pris n\'est plus proposé');
  assert.equal((await appel(e, `/${id}/resultat`, T1, { resultat: { x: 1 } })).status, 409, 'seul le preneur rend le travail');
  assert.equal((await appel(e, `/${id}/resultat`, T2, { resultat: { pages: [], synthese: 'ok' } })).status, 200);
  assert.equal((await appel(e, `/${id}/resultat`, T2, { resultat: {} })).status, 409, 'rendu une seule fois');
  const lu = await (await appel(e, `/${id}`, T1)).json();
  assert.equal(lu.job.statut, 'fait'); assert.equal(lu.job.resultat.synthese, 'ok');
  const liste = await (await appel(e, '', T1)).json(); assert.equal(liste.jobs[0].id, id);
});
test('un travail pour une autre machine n\'est pas pris par le Lenovo', async () => {
  const e = await env(); await appel(e, '', T1, { ...OK, pour: 'autre-pc' });
  assert.equal((await (await appel(e, '/next?pour=lenovo', T2)).json()).job, null);
});
test('adresses : https public seulement — jamais kd-mc.com, IP, localhost, identifiants, http', async () => {
  for (const u of ['https://kd-mc.com/admin', 'https://arbre.kd-mc.com/', 'http://example.org', 'https://127.0.0.1/', 'https://localhost/x', 'https://user:pw@example.org/', 'https://metadata.google.internal/', 'https://intranet/x', 'ftp://example.org']) assert.equal(urlSure(u), false, u);
  assert.equal(urlSure('https://www.geneanet.org/fonds/individus/?nom=x'), true);
  const e = await env(); assert.equal((await appel(e, '', T1, { ...OK, urls: ['https://kd-mc.com/x'] })).status, 422);
});
test('refus : secret, e-mail, téléphone, consigne trop courte, trop de travaux en attente', async () => {
  const e = await env();
  assert.equal((await appel(e, '', T1, { ...OK, consigne: 'clé sk-' + 'a1'.repeat(20) + ' à lire' })).status, 422);
  assert.equal((await appel(e, '', T1, { ...OK, consigne: 'écris à jean.dupont@example.com pour savoir' })).status, 422);
  assert.equal((await appel(e, '', T1, { ...OK, consigne: 'appelle le +33 6 12 34 56 78 demain' })).status, 422);
  assert.equal((await appel(e, '', T1, { ...OK, consigne: 'a' })).status, 400);
  for (let i = 0; i < JOBS_MAX_ATTENTE; i++) assert.equal((await appel(e, '', T1, OK)).status, 201);
  assert.equal((await appel(e, '', T1, OK)).status, 429);
});
test('le résultat qui ressemble à un secret est refusé', async () => {
  const e = await env(); const id = (await (await appel(e, '', T1, OK)).json()).id; await appel(e, '/next?pour=lenovo', T2);
  assert.equal((await appel(e, `/${id}/resultat`, T2, { resultat: { t: 'sk-' + 'a1'.repeat(20) } })).status, 422);
});
