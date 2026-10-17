/* GET /__arbre/cle — le DOMAINE remet la clé de l'arbre à une personne qu'il a reconnue (Kevin 13.10.2026 : « inscrit au domaine = reconnu partout,
   sans redemander »). Le code famille reste la clé du nuage ; il n'est jamais contourné, seulement REMIS par le domaine à une fiche à qui Kevin a ouvert l'arbre.
   Passe par le VRAI routeur et un KV simulé (noms fictifs : Léa Martin, Paul Durand, Zoé Lambert, Nina Fictive).
     1. sans session → 401, aucune clé ;           2. nom seul (session non prouvée) → refusé ;
     3. au code prouvé + arbre ouvert par Kevin → la clé ;   4. au code prouvé mais arbre NON ouvert à cette fiche → refusé ;
     4b. compte ordinaire du domaine (jamais rangé) → pas de clé : le code famille reste demandé ;   5. compte révoqué → refusé ;                   6. l'admin sans Face ID → refusé, avec Face ID → la clé ;
     7. code famille non publié → rien ;            8. origine étrangère → refusée ;   9. l'appel est journalisé (sans la clé).
   node services/kdmc-router/arbre-cle.test.mjs   (SABOTAGE=1 : la route rend la clé sans contrôle de périmètre → 4 doit rougir) */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';
import { ficheOubliee } from './acc-memo.js';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

let M = mod;
if (process.env.SABOTAGE === '1') {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, 'worker.js'), 'utf8').replace("const per = perimetre(fiche, 'arbre');\n    if (!per.ok)", "const per = { ok: true };\n    if (!per.ok)");
  const tmp = join(mkdtempSync(join(tmpdir(), 'ac-')), 'worker.js');
  writeFileSync(tmp, src.replace(/from '(\.\.?\/)/g, (m, r) => "from '" + pathToFileURL(join(dir, r)).href));
  M = (await import(pathToFileURL(tmp).href)).default;
}
const HASH = 'a'.repeat(64);
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [] }) };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, o) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: o.v ? 1 : 0, k: o.k ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const cle = async (token, headers) => { const r = await M.fetch(new Request('https://arbre.kd-mc.com/__arbre/cle', { headers: Object.assign(token ? { authorization: 'Bearer ' + token } : {}, headers || {}) }), env, { waitUntil() {} }); return { st: r.status, j: await r.json() }; };
const fiche = (uid, name, plus) => { kv.set('acc:' + uid, JSON.stringify(Object.assign({ uid, name, cgu_at: Date.now(), cgu_v: 99, portee: 'app', acces: [], acces_at: Date.now() }, plus || {}))); kv.set('nm:' + name.toLowerCase(), uid); ficheOubliee(env, uid); };

console.log('\nGET /__arbre/cle : le domaine remet la clé de l\'arbre à qui il a reconnu\n');
kv.set('arbre:codehash', HASH);
fiche('lea-martin', 'Léa Martin', { acces: ['arbre'] });
fiche('paul-durand', 'Paul Durand', { acces: ['lingua'] });
fiche('zoe-lambert', 'Zoé Lambert', { acces: ['arbre'], revoked_at: Date.now() + 5000 });
fiche('kdmc_admin', 'Kevin Admin', { portee: 'domaine' });

let r = await cle(null);
ok(r.st === 401 && !JSON.stringify(r.j).includes(HASH), '1. sans session : 401, aucune clé', r.st);
r = await cle(signe('lea-martin', { k: 0 }));
ok(r.st >= 401 && !JSON.stringify(r.j).includes(HASH), '2. session sur le seul nom (code non prouvé) : refusé', r.st + ' ' + r.j.reason);
r = await cle(signe('lea-martin', { k: 1 }));
ok(r.st === 200 && r.j.ok === true && r.j.hash === HASH, '3. Léa (code prouvé, arbre ouvert par Kevin) : la clé est remise', r.st + ' ' + r.j.reason);
r = await cle(signe('paul-durand', { k: 1 }));
ok(r.st === 403 && !JSON.stringify(r.j).includes(HASH), '4. Paul (code prouvé mais arbre NON ouvert à sa fiche) : refusé', r.st + ' ' + r.j.reason);
/* 17.10.2026 (Kevin : « débloque l'arbre dans le domaine, garde le code ») : la PAGE s'ouvre à tout compte du domaine, mais un compte ORDINAIRE
   (jamais rangé par l'admin) ne reçoit PAS la clé : il tape le code famille. */
fiche('marc-ordinaire', 'Marc Ordinaire', { portee: 'domaine', acces: [], acces_at: undefined });
r = await cle(signe('marc-ordinaire', { k: 1 }));
ok(r.st === 403 && r.j.reason === 'code_famille' && !JSON.stringify(r.j).includes(HASH), '4b. compte ordinaire du domaine (code prouvé, jamais rangé par Kevin) : PAS de clé, il tape le code famille', r.st + ' ' + r.j.reason);
r = await cle(signe('zoe-lambert', { k: 1 }));
ok(r.st >= 401 && !JSON.stringify(r.j).includes(HASH), '5. Zoé (compte révoqué) : refusé', r.st + ' ' + r.j.reason);
r = await cle(signe('kdmc_admin', { k: 1 }));
ok(r.st >= 401 && !JSON.stringify(r.j).includes(HASH), '6a. l\'admin au code seul : refusé (Face ID exigé)', r.st + ' ' + r.j.reason);
r = await cle(signe('kdmc_admin', { v: 1, k: 1 }));
ok(r.st === 200 && r.j.hash === HASH, '6b. l\'admin avec Face ID : la clé', r.st + ' ' + r.j.reason);
r = await cle(signe('lea-martin', { k: 1 }), { origin: 'https://site-tiers.example' });
ok(r.st === 403 && !JSON.stringify(r.j).includes(HASH), '8. origine étrangère : refusée', r.st);
const jr = [...kv.entries()].filter(([k]) => /^(aud|log)/.test(k)).map(([, v]) => String(v)).join('');
ok(!jr.includes(HASH), '9. la clé n\'est jamais écrite au journal', jr.slice(0, 60));
kv.delete('arbre:codehash');
r = await cle(signe('lea-martin', { k: 1 }));
ok(r.j.ok !== true && r.j.reason === 'code_non_publie', '7. code famille non publié : rien', r.st + ' ' + r.j.reason);
console.log(`\narbre-cle : ${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
