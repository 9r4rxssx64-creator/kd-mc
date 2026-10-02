/* GARDE — les noms accentués traversent la session du domaine intacts (2.10, mesuré : « Zoé Lefèvre » revenait
 * « ZoÃ© LefÃ¨vre » de /__sso/whoami dans toutes les apps). node services/kdmc-router/sso-accents.test.mjs */
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' → ' + d : '')); } };
const kv = new Map(); const env = { KDMC_SSO_SECRET: 's', ACCOUNTS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async () => {} } };
for (const nom of ['Zoé Lefèvre', 'Hélène Müller', 'Łukasz Żółć', 'Jürgen Ångström', 'Ana Peña', 'Søren Kierkegård']) {
  const r = await mod.fetch(new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://lingua.kd-mc.com' },
    body: JSON.stringify({ uid: 'u-' + Math.random().toString(36).slice(2), name: nom, cgu: true }) }), env, { waitUntil() {} });
  const j = await r.json();
  const w = await (await mod.fetch(new Request('https://lingua.kd-mc.com/__sso/whoami', { headers: { authorization: 'Bearer ' + j.token } }), env, { waitUntil() {} })).json();
  ok(w.name === nom, `whoami rend « ${nom} » intact`, w.name);
}
console.log(`sso-accents : ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
