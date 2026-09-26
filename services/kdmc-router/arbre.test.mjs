/* Test régression — /__arbre/* : le code famille se vérifie sur le domaine, les données de
   l'arbre ne sont servies qu'à qui le prouve, la publication est réservée à l'admin.
   (fait n°12 ETAT-INFRA : le dépôt est PUBLIC, les données et l'empreinte n'y sont plus.)
   Hors ligne, KV simulé.  node arbre.test.mjs */
import mod from './worker.js';
import { createHash } from 'crypto';
const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ADMIN_CODE = '123456'; // code de TEST uniquement (jamais le vrai — règle « le code admin ne s'écrit nulle part »)
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha(ADMIN_CODE), ACCOUNTS };
const H1 = sha('arbre::famille-test'), H2 = sha('arbre::nouveau-code-test');
const REQ = (o) => new Request('https://arbre.kd-mc.com' + o.path, { method: o.method || 'GET', headers: Object.assign({ 'CF-Connecting-IP': o.ip || '1.2.3.4' }, o.headers || {}), body: o.body });
const JS = (o) => ({ 'content-type': 'application/json' });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const call = async (o, e) => { const r = await mod.fetch(REQ(o), e || env); let j = null; try { j = await r.json(); } catch { /* */ } return { r, j }; };

/* 0. Sans KV → fail-open explicite, jamais d'exception */
let { r, j } = await call({ path: '/__arbre/status' }, { KDMC_SSO_SECRET: 'sec' });
ok(j && j.ok === false && j.reason === 'kv_absent', 'sans KV → kv_absent (pas de crash)');

/* 1. Rien de publié : status vide, unlock refusé (fail-closed), seed refusé */
({ r, j } = await call({ path: '/__arbre/status' }));
ok(j.ok && j.code === false && j.seed === false && j.count === 0, 'status initial : ni code ni données');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1 }) }));
ok(j.ok === false && j.reason === 'code_non_publie', 'unlock avant publication → code_non_publie');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: 'pas-un-hash' }) }));
ok(j.ok === false && j.reason === 'hash_requis', 'unlock avec un hash mal formé → hash_requis');
({ r, j } = await call({ path: '/__arbre/seed', headers: { 'x-arbre-code': H1 } }));
ok(j.ok === false && j.reason === 'code_non_publie', 'GET seed avant publication → refusé');

/* 2. Publication : admin seulement */
const persons = { seed_a: { id: 'seed_a', prenom: 'Test', nom: 'FAMILLE', updatedAt: 1 }, seed_b: { id: 'seed_b', prenom: 'Autre', nom: 'FAMILLE', pere: 'seed_a', updatedAt: 2 } };
const body = JSON.stringify({ codehash: H1, persons, meta: { updatedAt: 3 } });
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: JS(), body }));
ok(r.status === 403 && j.reason === 'need_admin_code', 'publier sans preuve admin → 403 need_admin_code');
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: Object.assign({ 'x-arbre-code': H1 }, JS()), body }));
ok(r.status === 403, 'publier avec seulement le code famille → 403 (le code famille ne publie pas)');
({ r, j } = await call({ path: '/__admin/login', method: 'POST', headers: JS(), body: JSON.stringify({ code: ADMIN_CODE }) }));
ok(j.ok === true && j.grant, 'login admin (code de test) → grant');
const grant = j.grant;
const ADM = () => Object.assign({ 'x-kdmc-admin': grant }, JS());
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: ADM(), body: JSON.stringify({ codehash: H1, persons: {} }) }));
ok(j.ok === false && j.reason === 'persons_vides', 'publier 0 personne → refusé (ne jamais écraser par du vide)');
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: ADM(), body: JSON.stringify({ codehash: 'xyz', persons }) }));
ok(j.ok === false && j.reason === 'codehash_invalide', 'empreinte mal formée → refusée');
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: ADM(), body: JSON.stringify({ persons }) }));
ok(j.ok === false && j.reason === 'codehash_requis', '1ʳᵉ publication sans empreinte → codehash_requis');
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: ADM(), body }));
ok(j.ok === true && j.count === 2 && j.savedAt > 0, 'publication admin → ok, 2 personnes');
ok(store.get('arbre:codehash') === H1 && JSON.parse(store.get('arbre:seed')).persons.seed_b.pere === 'seed_a', 'KV : empreinte + données stockées (préfixe arbre:)');
({ r, j } = await call({ path: '/__arbre/status' }));
ok(j.ok && j.code === true && j.seed === true && j.count === 2, 'status après publication : code + données, 2 personnes, aucun secret');
ok(!JSON.stringify(j).includes(H1), 'status ne révèle pas l\'empreinte');

/* 3. Unlock : bon code → données ; mauvais code → refus + blocage progressif */
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1 }) }));
ok(j.ok === true && j.seed && Object.keys(j.seed.persons).length === 2, 'unlock bon code → ok + données de départ');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1.toUpperCase() }) }));
ok(j.ok === true, 'unlock : empreinte en majuscules acceptée (normalisée)');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H2 }) }));
ok(j.ok === false && j.reason === 'code_invalide' && !j.seed, 'unlock mauvais code → code_invalide, 0 donnée');
let blocked = null;
for (let i = 0; i < 6; i++) { ({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H2 }), ip: '9.9.9.9' })); if (j.reason === 'rate_limited') { blocked = j; break; } }
ok(blocked && blocked.wait > 0, '5 échecs depuis une IP → rate_limited (anti force brute)');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1 }), ip: '9.9.9.9' }));
ok(j.ok === false && j.reason === 'rate_limited', 'IP bloquée : même le bon code attend');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1 }), ip: '8.8.8.8' }));
ok(j.ok === true, 'autre IP : pas bloquée');
const aud = JSON.parse(store.get('aud:log') || '[]');
ok(aud.some((e) => e.ev === 'arbre_unlock_fail') && aud.some((e) => e.ev === 'arbre_unlock_ok') && aud.some((e) => e.ev === 'arbre_seed_publish'), 'journal : échecs, succès et publication tracés');

/* 4. GET seed par en-tête */
({ r, j } = await call({ path: '/__arbre/seed', headers: { 'x-arbre-code': H1 } }));
ok(j.ok === true && j.seed.persons.seed_a.prenom === 'Test', 'GET seed avec la bonne empreinte → données');
({ r, j } = await call({ path: '/__arbre/seed', headers: { 'x-arbre-code': H2 } }));
ok(r.status === 403 && j.reason === 'code_invalide', 'GET seed mauvaise empreinte → 403');
({ r, j } = await call({ path: '/__arbre/seed' }));
ok(r.status === 403, 'GET seed sans en-tête → 403');

/* 5. Rotation du code : preuve de l'ancien */
({ r, j } = await call({ path: '/__arbre/code', method: 'POST', headers: JS(), body: JSON.stringify({ old: H2, new: H2 }) }));
ok(j.ok === false && j.reason === 'code_invalide', 'rotation avec un mauvais ancien code → refusée');
({ r, j } = await call({ path: '/__arbre/code', method: 'POST', headers: JS(), body: JSON.stringify({ old: H1, new: 'court' }) }));
ok(j.ok === false && j.reason === 'hash_requis', 'rotation vers une empreinte mal formée → refusée');
({ r, j } = await call({ path: '/__arbre/code', method: 'POST', headers: JS(), body: JSON.stringify({ old: H1, new: H2 }) }));
ok(j.ok === true, 'rotation avec le bon ancien code → ok');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1 }) }));
ok(j.ok === false && j.reason === 'code_invalide', 'après rotation : l\'ancien code ne passe plus');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H2 }) }));
ok(j.ok === true, 'après rotation : le nouveau code passe');
({ r, j } = await call({ path: '/__arbre/code', method: 'POST', headers: ADM(), body: JSON.stringify({ new: H1 }) }));
ok(j.ok === true && store.get('arbre:codehash') === H1, 'admin : rotation sans connaître l\'ancien (secours) → ok');

/* 6. Divers */
({ r, j } = await call({ path: '/__arbre/nimporte' }));
ok(r.status === 404, 'chemin inconnu → 404');
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: ADM(), body: JSON.stringify({ codehash: H1, persons: { x: { n: 'x'.repeat(6 * 1024 * 1024) } } }) }));
ok(j.ok === false && j.reason === 'trop_gros', 'publication > 5 Mo → trop_gros');
r = await mod.fetch(REQ({ path: '/__arbre/unlock', method: 'OPTIONS' }), env);
ok(r.status === 204, 'préflight → 204');

/* 7. Amorce D1 : KV vide → le domaine sert l'amorce ; KV rempli → KV gagne */
const d1rows = new Map();
const ARBRE_DB = { prepare: (sql) => ({ bind: (k) => ({ first: async () => (d1rows.has(k) ? { v: d1rows.get(k), saved_at: 111 } : null) }) }) };
const store2 = new Map();
const ACC2 = { get: async (k) => (store2.has(k) ? store2.get(k) : null), put: async (k, v) => { store2.set(k, v); }, delete: async (k) => { store2.delete(k); } };
const envD1 = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha(ADMIN_CODE), ACCOUNTS: ACC2, ARBRE_DB };
({ r, j } = await call({ path: '/__arbre/status' }, envD1));
ok(j.ok && j.code === false && j.seed === false, 'D1 vide + KV vide → rien de publié');
d1rows.set('codehash', H1.toUpperCase()); d1rows.set('seed', JSON.stringify({ persons, meta: { seedVersion: 63 } }));
({ r, j } = await call({ path: '/__arbre/status' }, envD1));
ok(j.ok && j.code === true && j.seed === true && j.seedVersion === 63 && j.source === 'd1', 'amorce D1 → status : code + données (source d1, seedVersion 63)');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1 }), ip: '7.7.7.7' }, envD1));
ok(j.ok === true && j.seed && Object.keys(j.seed.persons).length === 2 && j.seedVersion === 63, 'unlock avec l\'amorce D1 → ok + données + seedVersion');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H2 }), ip: '7.7.7.7' }, envD1));
ok(j.ok === false && j.reason === 'code_invalide', 'amorce D1 : mauvais code refusé');
({ r, j } = await call({ path: '/__admin/login', method: 'POST', headers: JS(), body: JSON.stringify({ code: ADMIN_CODE }) }, envD1));
const grant2 = j.grant;
({ r, j } = await call({ path: '/__arbre/seed', method: 'PUT', headers: Object.assign({ 'x-kdmc-admin': grant2 }, JS()), body: JSON.stringify({ codehash: H2, persons: { seed_z: { id: 'seed_z' } }, meta: { seedVersion: 64 } }) }, envD1));
ok(j.ok === true, 'publication admin par-dessus l\'amorce → ok');
({ r, j } = await call({ path: '/__arbre/status' }, envD1));
ok(j.count === 1 && j.seedVersion === 64 && j.source === 'kv', 'KV (publication) a priorité sur D1 : 1 personne, seedVersion 64, source kv');
({ r, j } = await call({ path: '/__arbre/unlock', method: 'POST', headers: JS(), body: JSON.stringify({ hash: H1 }), ip: '6.6.6.6' }, envD1));
ok(j.ok === false && j.reason === 'code_invalide', 'après publication : l\'empreinte KV remplace celle de l\'amorce');
const envD1ko = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: new Map() && { get: async () => null, put: async () => {} }, ARBRE_DB: { prepare: () => { throw new Error('d1 down'); } } };
({ r, j } = await call({ path: '/__arbre/status' }, envD1ko));
ok(j.ok === true && j.code === false, 'D1 en panne → fail-open (status répond, rien de publié)');

console.log(`\n${fail ? '❌' : '✅'} arbre (routeur) : ${pass} OK / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
