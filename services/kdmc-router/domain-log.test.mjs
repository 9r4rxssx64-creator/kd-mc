/* Test de /__admin/domain-log — la SOURCE UNIQUE des connexions du domaine, lue par
   la page « Qui se connecte » (admin.kd-mc.com).
   Ce qu'on prouve :
   - fail-closed : sans code, avec un mauvais code, ou si le code n'est pas configuré → 401/503, jamais de fuite ;
   - avec le bon code (hash, en-tête `x-apex-pin`) → la vraie donnée, par personne ;
   - CORS strictement limité à admin.kd-mc.com (pas de reflet d'origine arbitraire) ;
   - RGPD : la projection ne contient NI e-mail, NI jeton, NI hash d'IP, NI contenu privé ;
   - les renseignements fins attendus par Kevin sont bien là (appareil, opérateur, temps).
   node --test (depuis services/kdmc-router) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import mod from './worker.js';

const PIN_SHA = createHash('sha256').update('424242').digest('hex');
const store = new Map();
const ACCOUNTS = {
  get: async (k) => (store.has(k) ? store.get(k) : null),
  put: async (k, v) => { store.set(k, v); },
  delete: async (k) => { store.delete(k); },
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: PIN_SHA, ACCOUNTS };

/* Fiche réaliste : ce que le routeur écrit réellement à chaque connexion. */
store.set('idx:uids', JSON.stringify(['kdmc_admin']));
store.set('acc:kdmc_admin', JSON.stringify({
  uid: 'kdmc_admin', name: 'Kevin DESARZENS', hits: 191, last_seen: Date.now(),
  created: Date.now() - 9e8, cgu_at: Date.now() - 9e8,
  devices: ['mobile·iOS'], places: ['Nice, Provence-Alpes-Côte d\'Azur, FR'],
  last_device: 'iPhone · iOS 17.5 · Safari 17', last_isp: 'Orange', last_vpn: false,
  last_tz: 'Europe/Paris', last_place: 'Nice, Provence-Alpes-Côte d\'Azur, FR',
  last_geo: { city: 'Nice', postal: '06000', lat: '43.70', lon: '7.26' },
  last_ip_hash: 'SECRET_HASH_NE_DOIT_PAS_SORTIR',
  email: 'prive@example.com', token: 'JETON_SECRET',
  apps: { 'cmcteams.kd-mc.com': { first: 1, last: 2, sessions: 12, ms: 3600000 } },
  history: [{ ts: 1, end: 60000, app: 'kd-mc.com', device: 'mobile·iOS', place: 'Nice, FR', dev: 'iPhone · iOS 17.5', isp: 'Orange', vpn: 0 }],
}));

const REQ = (h) => new Request('https://kd-mc.com/__admin/domain-log', { headers: h || {} });

test('sans code → 401 (fail-closed, aucune donnée)', async () => {
  const r = await mod.fetch(REQ(), env);
  assert.equal(r.status, 401);
  assert.ok(!(await r.text()).includes('Kevin'), 'aucune donnée ne fuit');
});

test('mauvais code → 401', async () => {
  const r = await mod.fetch(REQ({ 'x-apex-pin': 'deadbeef' }), env);
  assert.equal(r.status, 401);
});

test('code non configuré sur le worker → 401 (jamais ouvert par défaut)', async () => {
  const r = await mod.fetch(REQ({ 'x-apex-pin': PIN_SHA }), { KDMC_SSO_SECRET: 'sec', ACCOUNTS });
  assert.equal(r.status, 401);
});

test('bon code → les vraies connexions, par personne', async () => {
  const r = await mod.fetch(REQ({ 'x-apex-pin': PIN_SHA }), env);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.people.length, 1);
  const k = d.people[0];
  assert.equal(k.name, 'Kevin DESARZENS');
  assert.equal(k.hits, 191, 'les 191 connexions réelles sont bien exposées');
  assert.equal(k.history.length, 1);
});

test('renseignements fins présents (appareil, opérateur, fuseau, géo, temps par app)', async () => {
  const r = await mod.fetch(REQ({ 'x-apex-pin': PIN_SHA }), env);
  const k = (await r.json()).people[0];
  assert.equal(k.device, 'iPhone · iOS 17.5 · Safari 17');
  assert.equal(k.isp, 'Orange');
  assert.equal(k.vpn, false);
  assert.equal(k.tz, 'Europe/Paris');
  assert.equal(k.geo.city, 'Nice');
  assert.equal(k.apps['cmcteams.kd-mc.com'].ms, 3600000, 'temps cumulé par app');
  assert.equal(k.apps['cmcteams.kd-mc.com'].sessions, 12);
});

test('RGPD : ni e-mail, ni jeton, ni hash d\'IP dans la réponse', async () => {
  const r = await mod.fetch(REQ({ 'x-apex-pin': PIN_SHA }), env);
  const raw = await r.text();
  assert.ok(!raw.includes('prive@example.com'), 'aucun e-mail');
  assert.ok(!raw.includes('JETON_SECRET'), 'aucun jeton');
  assert.ok(!raw.includes('SECRET_HASH_NE_DOIT_PAS_SORTIR'), 'aucun hash d\'IP');
});

test('CORS : seul admin.kd-mc.com est autorisé (pas de reflet d\'origine)', async () => {
  const r = await mod.fetch(new Request('https://kd-mc.com/__admin/domain-log', { method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://admin.kd-mc.com');
  assert.ok(!/evil/.test(r.headers.get('access-control-allow-origin') || ''), 'origine pirate jamais reflétée');
});
