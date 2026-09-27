/* CONDITIONS UNE SEULE FOIS, POUR TOUT LE DOMAINE (Kevin 27.09.2026 : « le CGU doit être demandé qu'une
   seule fois dans n'importe quelle app et sauvegardé pour chaque app du domaine. CGU rapide, vague,
   simplifié »). Un texte servi par le domaine ; l'accord vit dans la fiche (`cgu_at`) et `whoami`
   le dit vrai partout, même à une app dont le pass ne le portait pas.
   Prouvé discriminant : retirer `|| (acc && acc.cgu_at)` de whoami → 4 échoue ; retirer la route → 1, 3 échouent.
   node services/kdmc-router/cgu.test.mjs */
import mod from './worker.js';
import { createHmac } from 'crypto';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, c) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: c ? 1 : 0, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const req = (host, path, init) => mod.fetch(new Request('https://' + host + path, init), env, { waitUntil() {} });
const json = async (r) => r.json();

console.log('\nConditions : une fois, n\'importe où, valables partout\n');
{ const j = await json(await req('lingua.kd-mc.com', '/__sso/cgu'));
  const mots = String(j.texte || '').split(/\s+/).length;
  ok(j.ok && j.version >= 2 && mots > 5 && mots <= 45 && j.acceptees === false && j.session === false,
    `1. depuis n'importe quelle app, sans session : le texte UNIQUE du domaine (${mots} mots, court), pas encore accepté`, JSON.stringify(j).slice(0, 120)); }
/* Compte créé sur une app SANS cocher (déclaré par l'app, cgu:false) — impossible : le domaine exige l'accord pour un nouveau. */
kv.set('acc:lea-noir', JSON.stringify({ uid: 'lea-noir', name: 'Léa Noir', cgu_at: 0 }));
const sansCgu = signe('lea-noir', 0);
{ const j = await json(await req('cuisine.kd-mc.com', '/__sso/cgu', { headers: { authorization: 'Bearer ' + sansCgu } }));
  ok(j.ok && j.acceptees === false && j.session === true, '2. Léa (session, jamais accepté) → l\'app doit montrer la case'); }
{ const r = await req('cuisine.kd-mc.com', '/__sso/cgu', { method: 'POST', headers: { authorization: 'Bearer ' + sansCgu, origin: 'https://cuisine.kd-mc.com' }, body: '{}' });
  const j = await json(r); const acc = JSON.parse(kv.get('acc:lea-noir'));
  ok(j.ok && j.acceptees && acc.cgu_at > 0 && acc.cgu_v >= 2, '3. Léa accepte UNE fois, dans la cuisine → gravé dans sa fiche du domaine', JSON.stringify(acc)); }
{ const w = await json(await req('lingua.kd-mc.com', '/__sso/whoami', { headers: { authorization: 'Bearer ' + sansCgu } }));
  const c = await json(await req('chez-lolo.kd-mc.com', '/__sso/cgu', { headers: { authorization: 'Bearer ' + sansCgu } }));
  ok(w.ok && w.cgu === true && c.acceptees === true, '4. sur Lingua ET Chez Lolo, avec le MÊME vieux pass (sans accord dedans) : accepté — plus jamais redemandé', JSON.stringify(w)); }
{ const r = await req('cuisine.kd-mc.com', '/__sso/cgu', { method: 'POST', headers: { authorization: 'Bearer ' + sansCgu, origin: 'https://attaquant.example' }, body: '{}' });
  ok(r.status === 403, '5. un site tiers ne peut pas « accepter » à la place de quelqu\'un'); }
{ const r = await req('kd-mc.com', '/__sso/cgu', { method: 'POST', headers: { origin: 'https://kd-mc.com' }, body: '{}' });
  ok((await json(r)).ok === false, '6. sans session → rien à graver'); }
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
