/* /__fin/ia/* — l'IA de Finances par la SESSION ADMIN (Kevin 19.10.2026 : « Marche pas », le code enregistré dans l'app était refusé par le relais).
   Le routeur présente lui-même le code au relais : admin seulement, fournisseurs d'IA seulement, code jamais renvoyé au navigateur.
   node services/kdmc-router/fin-ia.test.mjs */
import mod from './worker.js';
import { createHash } from 'crypto';
const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const CODE = '424242'; const HASH = createHash('sha256').update(CODE).digest('hex');
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS };
const REQ = (path, o = {}) => new Request('https://kd-mc.com' + path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const appels = [];
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => { appels.push({ u: String(u), pin: init.headers && init.headers['x-apex-pin'], h: init.headers }); return new Response('{"ok":"relais"}', { status: 200, headers: { 'content-type': 'application/json' } }); };

let r = await mod.fetch(REQ('/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), env);
const grant = (await r.json()).grant; ok(!!grant, 'login admin → grant');
const H = { 'x-kdmc-admin': grant, 'content-type': 'application/json', 'x-apex-pin': 'MAUVAIS-CODE-DU-COFFRE' };

r = await mod.fetch(REQ('/__fin/ia/gemini/v1beta/models/x:generateContent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env);
ok(r.status === 403 && appels.length === 0, 'sans session admin → 403, le relais n\'est jamais appelé');

r = await mod.fetch(REQ('/__fin/ia/gemini/v1beta/models/x:generateContent', { method: 'POST', headers: H, body: '{"a":1}' }), env);
ok(r.status === 200 && r.headers.get('x-fin-ia') === '1', 'admin → réponse du relais, marquée x-fin-ia');
ok(appels.length === 1 && /^https:\/\/apex-secrets-proxy\.9r4rxssx64\.workers\.dev\/gemini\/v1beta\/models\/x:generateContent$/.test(appels[0].u), 'adresse du relais exacte');
ok(appels[0].pin === HASH, 'le routeur présente SON code au relais (pas celui, périmé, envoyé par l\'app)');
ok(!(await r.text()).includes(HASH), 'le code n\'est jamais renvoyé au navigateur');

for (const mauvais of ['/__fin/ia/telegram/bot', '/__fin/ia/emailjs/send', '/__fin/ia/gemini/../telegram/x', '/__fin/ia/']) {
  const n = appels.length; r = await mod.fetch(REQ(mauvais, { method: 'POST', headers: H, body: '{}' }), env);
  ok(r.status === 400 && appels.length === n, 'fournisseur hors liste blanche refusé sans appel : ' + mauvais);
}
r = await mod.fetch(REQ('/__fin/ia/gemini/v1/x', { method: 'GET', headers: H }), env); ok(r.status === 405, 'GET refusé (POST seulement)');
r = await mod.fetch(REQ('/__fin/ia/gemini/v1/x', { method: 'POST', headers: H, body: '{}' }), { ...env, KDMC_ADMIN_PIN_SHA256: undefined });
ok(r.status === 403 || r.status === 503, 'code du relais absent → refus propre');
globalThis.fetch = vraiFetch;
console.log(`${fail ? '❌' : '✅'} fin-ia : ${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
