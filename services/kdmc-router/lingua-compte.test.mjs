/* LINGUA SUR LE COMPTE DU DOMAINE (Kevin 27.09.2026 : « fais Lingua ») : la sauvegarde suit la SESSION
   KDMC (clé `lingua:u:<uid>`), plus besoin d'un code Lingua ; les anciennes clés (empreinte) restent.
   Prouvé discriminant : retirer `cleSession` → 1, 2 échouent. node services/kdmc-router/lingua-compte.test.mjs */
import mod from './worker.js';
import { createHmac } from 'crypto';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const req = (path, init) => mod.fetch(new Request('https://lingua.kd-mc.com' + path, init), env, { waitUntil() {} });
const tok = signe('marie-curie');
console.log('\nLingua : la progression suit le compte KDMC\n');
{ const r = await req('/__lingua/save', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ data: { xp: 42, syncTs: 5 } }) });
  ok((await r.json()).ok === true && kv.has('lingua:u:marie-curie'), '1. sauvegarde SANS clé, avec la session → rangée sous le compte (lingua:u:marie-curie)', [...kv.keys()].join(',')); }
{ const r = await req('/__lingua/load', { headers: { authorization: 'Bearer ' + tok } }); const j = await r.json();
  ok(j.ok && j.data && j.data.xp === 42 && j.cle === 'compte', '2. lecture SANS clé, avec la session (autre appareil) → la même progression', JSON.stringify(j)); }
{ const r = await req('/__lingua/load'); ok(r.status === 401 && (await r.json()).reason === 'session_requise', '3. sans clé ET sans session → refus (rien à deviner)'); }
{ const r = await req('/__lingua/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: 'a'.repeat(40), data: { xp: 1 } }) });
  const j = await (await req('/__lingua/load?k=' + 'a'.repeat(40))).json();
  ok((await r.json()).ok === true && j.data && j.data.xp === 1 && j.cle === 'code', '4. un ancien compte Lingua (clé empreinte nom+code) marche comme avant'); }
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
