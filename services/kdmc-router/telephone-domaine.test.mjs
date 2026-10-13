/* TÉLÉPHONE À L'INSCRIPTION DU DOMAINE — Kevin 13.10.2026 :
   « Ajoute le téléphone à l'inscription du domaine entier, la fiche principale d'inscription, pas que CMCteams. Chaque app, l'inscription
     au domaine. […] Toutes les apps du domaine savent. »
   Toutes les apps créent leurs comptes par la même porte (/__sso/issue). C'est donc là qu'on exige le numéro d'un NOUVEAU compte, et c'est
   la fiche du domaine (/__sso/fiche) qui le porte : chaque app le LIT au lieu de le redemander.
   Vrai routeur (worker.js) + registre KV simulé.
   Prouvé discriminant : sans le contrôle `telephone_requis` → 1 à 3 échouent ; sans le rangement sur la fiche → 5 et 6 échouent.
   node services/kdmc-router/telephone-domaine.test.mjs */
import mod from './worker.js';
import { createHash } from 'crypto';

const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const post = (path, body, e = env, headers = {}) => mod.fetch(new Request('https://kd-mc.com' + path, {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://kd-mc.com' }, headers), body: JSON.stringify(body) }), e, { waitUntil() {} });
const issue = async (body, e) => { const r = await post('/__sso/issue', body, e); return { st: r.status, j: await r.json() }; };
const fiche = async (token) => (await (await mod.fetch(new Request('https://kd-mc.com/__sso/fiche', { headers: { authorization: 'Bearer ' + token } }), env, { waitUntil() {} })).json());
const comptes = () => [...kv.keys()].filter((k) => k.startsWith('acc:'));
const NEUF = { uid: 'lea-martin', name: 'Léa Martin', cgu: true, code: '246810' };

console.log('\nTéléphone à l\'inscription du domaine : demandé une fois, connu de toutes les apps\n');

let r = await issue(NEUF);
ok(r.st === 400 && r.j.reason === 'telephone_requis' && comptes().length === 0, '1. nouveau compte SANS téléphone → refusé (400 telephone_requis), aucune fiche créée', JSON.stringify(r));
r = await issue({ ...NEUF, telephone: 'abc' });
ok(r.st === 400 && r.j.reason === 'telephone_requis' && comptes().length === 0, '2. téléphone illisible (« abc ») → refusé', JSON.stringify(r));
r = await issue({ ...NEUF, telephone: '12' });
ok(r.st === 400 && r.j.reason === 'telephone_requis' && comptes().length === 0, '3. téléphone trop court → refusé');
ok(/téléphone/i.test(r.j.message || '') && /\+377/.test(r.j.message || ''), '4. le message est en français simple, avec un exemple');

r = await issue({ ...NEUF, telephone: '+377 06 12 34 56' });
ok(r.st === 200 && r.j.ok === true && !!r.j.token, '5. avec un vrai numéro : le compte est créé, la session est délivrée', JSON.stringify(r).slice(0, 200));
const f = await fiche(r.j.token);
ok(f.ok === true && f.fiche && f.fiche.telephone === '+377 06 12 34 56', '6. le numéro est sur la fiche du DOMAINE : toutes les apps le lisent (/__sso/fiche)', JSON.stringify(f));

/* un compte déjà inscrit n'est jamais bloqué par ce contrôle (il se reconnecte sans rien redonner) */
const r2 = await issue({ uid: 'lea-martin', name: 'Léa Martin', cgu: true, code: '246810' });
ok(r2.st === 200 && r2.j.ok === true, '7. quelqu\'un déjà inscrit se reconnecte sans redonner son numéro');
const f2 = await fiche(r2.j.token);
ok(f2.fiche && f2.fiche.telephone === '+377 06 12 34 56', '8. et son numéro est toujours là (une reconnexion ne l\'efface pas)');

/* interrupteur (bouton ON/OFF) : coupé, plus rien n'est exigé */
r = await issue({ uid: 'paul-durand', name: 'Paul Durand', cgu: true, code: '135790' }, { ...env, KDMC_TELEPHONE_OBLIGATOIRE: '0' });
ok(r.st === 200 && r.j.ok === true, '9. interrupteur KDMC_TELEPHONE_OBLIGATOIRE=0 : l\'exigence se coupe d\'un coup (ON/OFF)');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
