// Preuve worker kdmc-access : CORS, /log (append + fail-open), /history (PIN gate +
// agrégation par personne). fetch OAuth+Firebase mockés, clé RSA générée à la volée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from './worker.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const PIN = '424242';
const PIN_SHA = crypto.createHash('sha256').update(PIN).digest('hex');
const ENV = { FIREBASE_CLIENT_EMAIL: 'sa@x.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: privateKey, APEX_ADMIN_PIN_SHA256: PIN_SHA };

const NOW = Date.now();
// Stockage par bucket-jour : { '<YYYY-MM-DD>': { id: ev } }
const FB_NESTED = {
  '2026-08-04': {
    a: { app: 'cmcteams', uid: 'U11804', name: 'Kevin DESARZENS', event: 'connexion', device: 'iPhone', tier: 'admin', ts: NOW - 1000 },
    b: { app: 'apex', uid: 'U11804', name: 'Kevin DESARZENS', event: 'ouvre chat', device: 'iPhone', ts: NOW - 60000 },
    c: { app: 'apex-chat', uid: 'laurence', name: 'Laurence', event: 'connexion', device: 'Android', tier: 'laurence', ts: NOW - 9 * 60000 },
  },
  '2020-01-01': { old: { app: 'cmcteams', uid: 'x', name: 'Vieux', event: 'connexion', ts: 1577836800000 } }, // > rétention → à purger
};

function mockFetch(capture) {
  capture.patched = null; capture.posted = null;
  return async (url, opts) => {
    const u = String(url); const m = (opts && opts.method) || 'GET';
    if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
    // écriture = POST dans un bucket-jour /kdmc_access/events/<jour>.json
    if (m === 'POST' && /\/kdmc_access\/events\/\d{4}-\d{2}-\d{2}\.json/.test(u)) { capture.posted = JSON.parse(opts.body); return new Response('{"name":"id"}', { status: 200 }); }
    if (u.includes('/kdmc_access/events.json')) {
      if (u.includes('shallow=true')) return new Response(JSON.stringify(Object.fromEntries(Object.keys(FB_NESTED).map((d) => [d, true]))), { status: 200 });
      if (m === 'PATCH') { capture.patched = JSON.parse(opts.body); return new Response('{}', { status: 200 }); }
      return new Response(JSON.stringify(FB_NESTED), { status: 200 }); // GET history (nœud complet)
    }
    return new Response('{}', { status: 200 });
  };
}
const req = (path, opts) => new Request('https://admin.kd-mc.com' + path, opts);

test('GET /health → ok', async () => {
  const r = await worker.fetch(req('/health'), ENV);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('OPTIONS → 204 + CORS', async () => {
  const r = await worker.fetch(req('/', { method: 'OPTIONS', headers: { origin: 'https://cmcteams.kd-mc.com' } }), ENV);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://cmcteams.kd-mc.com');
});

test('CORS : origine inconnue → pas reflétée (défaut kd-mc.com)', async () => {
  const r = await worker.fetch(req('/', { method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } }), ENV);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://kd-mc.com');
});

test('POST /log → 204 + évènement écrit dans Firebase', async () => {
  const cap = {};
  const orig = globalThis.fetch; globalThis.fetch = mockFetch(cap);
  try {
    const r = await worker.fetch(req('/log', { method: 'POST', headers: { origin: 'https://apex-ai.kd-mc.com', 'content-type': 'application/json' }, body: JSON.stringify({ app: 'apex', uid: 'U11804', name: 'Kevin', event: 'connexion', device: 'iPhone' }) }), ENV);
    assert.equal(r.status, 204);
    assert.ok(cap.posted, 'un POST Firebase a eu lieu');
    assert.equal(cap.posted.app, 'apex');
    assert.equal(cap.posted.event, 'connexion');
    assert.ok(cap.posted.ts > 0, 'horodaté serveur');
    assert.ok(cap.patched && cap.patched['2020-01-01'] === null, 'purge auto : bucket-jour hors rétention supprimé');
    assert.ok(!('2026-08-04' in (cap.patched || {})), 'purge : bucket récent conservé');
  } finally { globalThis.fetch = orig; }
});

test('POST /log fail-open si secrets FB absents → 204 (jamais bloquer l\'app)', async () => {
  const r = await worker.fetch(req('/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app: 'x', event: 'y' }) }), { APEX_ADMIN_PIN_SHA256: PIN_SHA });
  assert.equal(r.status, 204);
});

test('GET /history sans PIN → 401', async () => {
  const r = await worker.fetch(req('/history'), ENV);
  assert.equal(r.status, 401);
});

test('GET /history mauvais PIN → 401', async () => {
  const r = await worker.fetch(req('/history', { headers: { 'x-apex-pin': 'deadbeef' } }), ENV);
  assert.equal(r.status, 401);
});

test('GET /history bon PIN → 200 + agrégé par personne', async () => {
  const orig = globalThis.fetch; globalThis.fetch = mockFetch({});
  try {
    const r = await worker.fetch(req('/history', { headers: { 'x-apex-pin': PIN_SHA } }), ENV);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.equal(d.totalPeople, 3, '3 personnes distinctes (buckets-jour aplatis)');
    assert.equal(d.totalEvents, 4);
    const kevin = d.people.find((p) => p.uid === 'U11804');
    assert.ok(kevin, 'Kevin présent');
    assert.equal(kevin.count, 2, '2 évènements Kevin');
    assert.deepEqual(kevin.appsList.sort(), ['apex', 'cmcteams'], 'apps regroupées');
    assert.equal(kevin.online, true, 'vu il y a <5min → en ligne');
    const laur = d.people.find((p) => p.name === 'Laurence');
    assert.equal(laur.online, false, 'vu il y a 9min → hors ligne');
    assert.ok(kevin.recent.length >= 2 && kevin.recent[0].ts >= kevin.recent[1].ts, 'timeline triée récente→ancienne');
  } finally { globalThis.fetch = orig; }
});

test('GET / → sert la page admin HTML', async () => {
  const r = await worker.fetch(req('/'), ENV);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/html/);
  const html = await r.text();
  assert.match(html, /Qui se connecte/);
  assert.match(html, /x-apex-pin/);
});
