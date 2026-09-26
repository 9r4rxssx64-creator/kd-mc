/* Test unitaire fb-token.js — prouve que le custom token est bien signé (RS256),
 * porte la claim role:'admin' scope:'shops', uid kdmc_admin, et que le fail-safe
 * fonctionne sans secrets. Pas de réseau (exchange testé via fetch mocké). */
import assert from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import { fbSignCustomToken, fbExchangeForIdToken, mintShopsAdminIdToken } from './fb-token.js';

function b64urlToJson(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
}

// Clé RSA de test (PKCS8 PEM) — comme une vraie clé service account.
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

let pass = 0;
async function t(name, fn) { await fn(); console.log('  ✓', name); pass++; }

await t('fbSignCustomToken signe un JWT role:admin scope:shops uid kdmc_admin', async () => {
  const env = { FIREBASE_CLIENT_EMAIL: 'sa@kdmc-clients.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: privateKey };
  const jwt = await fbSignCustomToken(env, 'kdmc_admin', { role: 'admin', scope: 'shops' });
  const parts = jwt.split('.');
  assert.strictEqual(parts.length, 3, '3 segments JWT');
  const h = b64urlToJson(parts[0]); assert.strictEqual(h.alg, 'RS256'); assert.strictEqual(h.typ, 'JWT');
  const p = b64urlToJson(parts[1]);
  assert.strictEqual(p.uid, 'kdmc_admin');
  assert.strictEqual(p.claims.role, 'admin');
  assert.strictEqual(p.claims.scope, 'shops');
  assert.strictEqual(p.iss, env.FIREBASE_CLIENT_EMAIL);
  assert.ok(p.aud.includes('identitytoolkit'), 'aud identitytoolkit');
  assert.ok(p.exp > p.iat, 'exp > iat');
  assert.ok(parts[2].length > 80, 'signature présente');
});

await t('mintShopsAdminIdToken fail-safe si secrets absents', async () => {
  const out = await mintShopsAdminIdToken({});
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'fb_not_configured');
});

await t('fbExchangeForIdToken renvoie null sans clé web (fail-open)', async () => {
  const r = await fbExchangeForIdToken('tok', {});
  assert.strictEqual(r, null);
});

await t('mintShopsAdminIdToken échange OK (fetch mocké) → id_token', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ idToken: 'ID123', refreshToken: 'RT', expiresIn: '3600' }) });
  try {
    const env = { FIREBASE_CLIENT_EMAIL: 'sa@x.iam', FIREBASE_PRIVATE_KEY: privateKey, FIREBASE_WEB_API_KEY: 'WEBKEY' };
    const out = await mintShopsAdminIdToken(env);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.id_token, 'ID123');
    assert.strictEqual(out.exchanged, true);
  } finally { globalThis.fetch = realFetch; }
});

await t('mintShopsAdminIdToken sans web key → custom_token, exchanged:false (fail-open)', async () => {
  const env = { FIREBASE_CLIENT_EMAIL: 'sa@x.iam', FIREBASE_PRIVATE_KEY: privateKey };
  const out = await mintShopsAdminIdToken(env);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.exchanged, false);
  assert.ok(out.custom_token && out.custom_token.split('.').length === 3);
});

console.log('fb-token.test.mjs : ' + pass + '/5 OK');
