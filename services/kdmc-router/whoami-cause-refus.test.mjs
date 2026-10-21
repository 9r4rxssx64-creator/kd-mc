/* whoami dit POURQUOI il refuse un pass (21.10.2026) : un pass refusé sans motif rendait l'entrée d'Apex Chat impossible à diagnostiquer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import routeur from './worker.js';

const SECRET = 'secret-de-test';
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: SECRET, ACCOUNTS };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pass = (o, secret = SECRET) => { const p = b64u(JSON.stringify({ u: 'x1', n: 'X', c: 1, v: 0, k: 1, iat: Date.now(), exp: Date.now() + 3600e3, d: 'iphone', ...o })); return p + '.' + b64u(createHmac('sha256', secret).update(p).digest()); };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';
const demande = async (tok, ua) => {
  const h = { 'user-agent': ua || IPHONE }; if (tok) h.authorization = 'Bearer ' + tok;
  const r = await routeur.fetch(new Request('https://kd-mc.com/__sso/whoami', { headers: h }), env, { waitUntil() {} });
  return r.json();
};

test('aucun pass : ok:false sans motif (inchangé)', async () => {
  const j = await demande(null);
  assert.equal(j.ok, false); assert.equal(j.cause, undefined);
});
test('pass signé avec un autre secret → cause signature', async () => {
  const j = await demande(pass({}, 'autre'));
  assert.deepEqual([j.ok, j.reason, j.cause], [false, 'pass_refuse', 'signature']);
});
test('pass expiré → cause expire', async () => {
  const j = await demande(pass({ exp: Date.now() - 1000 }));
  assert.equal(j.cause, 'expire');
});
test('pass d\'un iPhone présenté depuis un PC → cause appareil', async () => {
  const j = await demande(pass({}), WIN);
  assert.equal(j.cause, 'appareil');
});
test('pass mal formé → cause pass_mal_forme, et le pass n\'est jamais renvoyé', async () => {
  const j = await demande('abc');
  assert.equal(j.cause, 'pass_mal_forme');
  assert.ok(!JSON.stringify(j).includes('abc.'));
});
